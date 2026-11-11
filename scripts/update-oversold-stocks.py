#!/usr/bin/env python3
"""Build stocks/oversold.json from a maintained index universe and Yahoo Finance.

The universe is US common stocks listed on Nasdaq, the NYSE, and NYSE American,
taken from the Nasdaq Trader symbol directories. ETFs, ETNs, warrants, units,
rights, preferreds, and test issues are left out. RCL is left out on purpose.
The list is written to scripts/universe.json.
RCL is left out on purpose. Daily bars come from Yahoo's public chart endpoint.
The published file keeps a wide oversold research list. Only names that pass the
hard swing gates are swing candidates, and only those can be journaled.
Fundamentals annotate a card. They do not choose the headline or the journal.
Official fills are recorded on the next session, never on the signal close.
Fundamentals, for names on the research shortlist and every provisional swing
setup, come from Yahoo quoteSummary (summaryProfile, summaryDetail,
financialData, defaultKeyStatistics, calendarEvents) after the public crumb
handshake. No key.

A failed run, or a run that prices less than 65% of the universe, leaves the
previous snapshot in place. Set STOCKS_FORCE=1 to refresh even when the
snapshot is under 24 minutes old. Set STOCKS_REFRESH_UNIVERSE=1 to rebuild the
constituent list. Set STOCKS_UNIVERSE_ONLY=1 to refresh that list and stop.
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import random
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from http.cookiejar import CookieJar
from pathlib import Path

socket.setdefaulttimeout(20)
ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "stocks" / "oversold.json"
UNIVERSE_PATH = ROOT / "scripts" / "universe.json"

SP_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NDX_URL = "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies"
MID_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies"
SP600_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies"
RUSSELL_URL = "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/latest-holdings.csv"
NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=2y&interval=1d&includePrePost=false"
CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
COOKIE_URL = "https://fc.yahoo.com"
SUMMARY = (
    "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
    "?modules=summaryProfile,summaryDetail,financialData,defaultKeyStatistics,calendarEvents&crumb={crumb}"
)

UA = "MondosupremeStocks/1.0 (+https://mondosupreme.com/stocks/)"
WIKI_UA = "MondosupremeStocks/1.0 (universe refresh; +https://mondosupreme.com/stocks/)"
HOLDINGS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
LISTED_EXCHANGES = {"NASDAQ", "NYSE", "NYSE MKT LLC", "NYSE AMERICAN", "NYSE ARCA", "AMEX", "NYSEARCA"}
EXCLUDE = {"RCL"}
TICKER_RE = re.compile(r"^[A-Z]{1,5}(?:-[A-Z])?$")
LISTED_BAD_NAME = re.compile(
    r"\b(warrant|warrants|right|rights|unit|units|preferred|preference|depositary|etn|notes?|debentures?|fund)\b"
    r"|when[- ]issued|test stock|acquisition corp|blank check",
    re.I,
)
MAX_AGE_HOURS = 0.4
MIN_PRICED_RATIO = 0.65
UNIVERSE_MAX_AGE_DAYS = 7
SERIES = 30
PUBLISH_CAP = 700
FUND_CAP = 80
CHART_WORKERS = 5
CHART_GAP = 0.28
FUND_GAP = 1.1

ABOUT = (
    "Two lists of US common stocks on Nasdaq, the NYSE, and NYSE American. "
    "ETFs, ETNs, warrants, units, rights, preferreds, and test issues are left out, "
    "as are names under $3 or under $2 million of average daily dollar volume. "
    "The research list is the wide oversold screen: a low RSI, a lower Bollinger touch, or a pullback. "
    "A swing candidate is separate and smaller. It has to clear hard gates: no single session down "
    "about 9% or more in the last 8 sessions (still being above the 200-day does not waive that), "
    "no earnings inside 7 days, average daily dollar volume of at least $20 million, a rising 200-day "
    "average with the close at least 5% above it, a 21-session pullback that is not a 15% or worse slide, "
    "volume confirmation, at least two reversal signals, a swing score of at least 36, and reward-to-risk "
    "of at least 2:1 measured from the planned entry. The entry is a limit at structure under the close, "
    "or a next-session reclaim of the signal high. It is not today's close. After a shock bar the plan "
    "is skipped, so a pre-crash 20-day average is not reused as a target and a gap-inflated ATR is not "
    "the stop. The headline rank and the journal use the swing score only. Fundamentals are notes on the "
    "card and do not promote a name. The journal does not fill leftover slots with names that failed the "
    "gates, keeps one name per sector, and records no new official picks when SPY is under its 200-day. "
    "RSI is Wilder's 14-day RSI. Bollinger Bands are the 20-day average plus and minus two population "
    "standard deviations. ATR is Wilder's 14-day average true range, with the stop distance capped so one "
    "wide bar cannot set it. Yahoo quoteSummary is tried first. If that crumb is blocked, Nasdaq's public "
    "quote, annual financials, analyst target, and earnings calendar are used instead. Every sentence uses "
    "a fetched number. This is a rules screen, not a guarantee and not financial advice. fetchedAt is when "
    "this file was last filled. A failed fetch keeps the previous rows."
)
DISCLAIMER = (
    "Informational only, not financial advice and not a recommendation to buy or sell. "
    "A stock is listed because it matched a rules-based swing screen."
)
PARAMS_PATH = ROOT / "scripts" / "swing-params.json"
PICKS_PATH = ROOT / "stocks" / "picks-history.json"


def load_swing_params():
    try:
        data = json.loads(PARAMS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    return data if isinstance(data, dict) else {}


PARAMS = load_swing_params()


def swing_param(path, default):
    node = PARAMS
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            return default
        node = node[key]
    return node


def earnings_flag_label():
    days = int(swing_param("gates.earningsWindowDays", 7))
    return "Earnings within " + str(days) + " days"


def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0)


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def mean(values):
    return sum(values) / len(values) if values else 0.0


def population_stdev(values):
    if len(values) < 2:
        return 0.0
    center = mean(values)
    return math.sqrt(sum((item - center) ** 2 for item in values) / len(values))


def sma_at(closes, index, length):
    if index + 1 < length:
        return None
    return mean(closes[index + 1 - length:index + 1])


def rsi_value(avg_gain, avg_loss):
    if avg_loss == 0 and avg_gain == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))


def wilder_rsi(closes, length=14):
    if len(closes) <= length:
        return [None] * len(closes)
    gains = []
    losses = []
    for index in range(1, length + 1):
        change = closes[index] - closes[index - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))
    avg_gain = mean(gains)
    avg_loss = mean(losses)
    out = [None] * length
    out.append(rsi_value(avg_gain, avg_loss))
    for index in range(length + 1, len(closes)):
        change = closes[index] - closes[index - 1]
        avg_gain = ((avg_gain * (length - 1)) + max(change, 0.0)) / length
        avg_loss = ((avg_loss * (length - 1)) + max(-change, 0.0)) / length
        out.append(rsi_value(avg_gain, avg_loss))
    return out


def wilder_atr(bars, length=14):
    if len(bars) <= length:
        return None
    true_ranges = []
    for index in range(1, len(bars)):
        high = bars[index]["high"]
        low = bars[index]["low"]
        prev = bars[index - 1]["close"]
        true_ranges.append(max(high - low, abs(high - prev), abs(low - prev)))
    if len(true_ranges) < length:
        return None
    atr = mean(true_ranges[:length])
    for item in true_ranges[length:]:
        atr = ((atr * (length - 1)) + item) / length
    return atr if atr > 0 else None


def robust_atr(bars, length=14):
    """ATR for the stop sketch, with the widest bar in the window capped.

    A single gap otherwise inflates Wilder's ATR and parks the stop as if the
    crash were a normal pullback.
    """
    if len(bars) <= length:
        return wilder_atr(bars)
    true_ranges = []
    for index in range(1, len(bars)):
        high = bars[index]["high"]
        low = bars[index]["low"]
        prev = bars[index - 1]["close"]
        true_ranges.append(max(high - low, abs(high - prev), abs(low - prev)))
    window = true_ranges[-length:]
    ordered = sorted(window)
    median = ordered[len(ordered) // 2]
    if median <= 0:
        return wilder_atr(bars)
    cap = median * 2.5
    return mean([min(value, cap) for value in window])


def shock_stats(bars):
    """A large down session in the recent window, measured off the prior close.

    The close or the open has to be about 9% or more below the prior close.
    A wick alone does not count. Being above a lagging 200-day average does
    not clear the event.
    """
    last = len(bars) - 1
    lookback = int(swing_param("shock.lookback", 8))
    threshold = float(swing_param("shock.minDownPct", 9))
    worst = 0.0
    found = False
    if last < 1:
        return False, None
    for index in range(max(1, last - lookback + 1), last + 1):
        prev = bars[index - 1]["close"]
        if prev <= 0:
            continue
        drop = min(
            (bars[index]["close"] / prev - 1.0) * 100,
            (bars[index]["open"] / prev - 1.0) * 100,
        )
        if drop < worst:
            worst = drop
        if drop <= -threshold:
            found = True
    return found, (round(worst, 2) if last else None)


def choose_target(entry, close, sma20, middle, upper):
    """First target is a nearby mean, not a pre-crash average far overhead."""
    lift = float(swing_param("trade.targetMinLift", 1.002))
    stretch = float(swing_param("trade.maxTargetStretch", 0.12))
    ceiling = close * (1.0 + stretch)
    found = []
    if sma20 and sma20 > entry * lift and sma20 <= ceiling:
        found.append((sma20, "the 20-day average"))
    if middle and middle > entry * lift and middle <= ceiling:
        found.append((middle, "the mid Bollinger Band"))
    if not found:
        return None, ""
    found.sort(key=lambda item: item[0])
    return found[0]


def build_trade_plan(bars, atr, lower, middle, upper, sma20):
    """Entry from structure or a next-session reclaim. Never the signal close.

    A shock bar returns an empty plan so the journal cannot keep the pre-crash
    20-day average as a target.
    """
    last = len(bars) - 1
    close = bars[last]["close"]
    shock, shock_pct = shock_stats(bars)
    empty = {
        "entryLow": None,
        "entryHigh": None,
        "stop": None,
        "target": None,
        "targetLabel": "",
        "target2": None,
        "rewardRisk": None,
        "planStyle": "none",
        "shock": shock,
        "shockPct": shock_pct,
        "planNote": "Recent shock bar. No pullback plan until the range rebuilds." if shock else "No entry away from the close.",
    }
    if shock or not atr or atr <= 0 or last < 1:
        return empty
    stop_atr = robust_atr(bars) or atr
    prior = bars[max(0, last - 8):last]
    supports = []
    for level in (
        min(bar["low"] for bar in prior) if prior else None,
        bars[last - 1]["low"],
        lower,
    ):
        if isinstance(level, (int, float)) and level < close * 0.998:
            supports.append(level)
    width = max(stop_atr * float(swing_param("trade.entryAtrFraction", 0.25)), close * 0.004)
    if supports:
        entry_high = min(max(supports), close * 0.995)
        entry_low = entry_high - width
        stop = entry_low - float(swing_param("trade.atrStopMultiple", 1.5)) * stop_atr
        style = "limit"
    else:
        entry_high = bars[last]["high"]
        entry_low = entry_high
        stop = bars[last]["low"] - 0.1 * stop_atr
        style = "confirm"
        if not (entry_high > close + 0.004 and stop < entry_high):
            return empty
    if not (isinstance(stop, (int, float)) and stop < entry_high):
        return empty
    target, target_label = choose_target(entry_high, close, sma20, middle, upper)
    target2 = None
    second_lift = float(swing_param("trade.secondTargetLift", 1.005))
    stretch2 = float(swing_param("trade.secondTargetStretch", 0.18))
    if (
        target
        and upper
        and upper > target * second_lift
        and upper <= close * (1.0 + stretch2)
    ):
        target2 = upper
    reward = None
    if target and entry_high > stop:
        reward = (target - entry_high) / (entry_high - stop)
    note = (
        "Next session has to trade through the signal high."
        if style == "confirm"
        else "Limit under the close, at the nearest structure."
    )
    return {
        "entryLow": round_num(entry_low, 2),
        "entryHigh": round_num(entry_high, 2),
        "stop": round_num(stop, 2),
        "target": round_num(target, 2) if target else None,
        "targetLabel": target_label,
        "target2": round_num(target2, 2) if target2 else None,
        "rewardRisk": round_num(reward, 2) if reward and reward > 0 else None,
        "planStyle": style,
        "shock": False,
        "shockPct": shock_pct,
        "planNote": note,
    }


def round_num(value, places):
    if value is None or not math.isfinite(value):
        return None
    return round(float(value), places)


def money(value):
    if value >= 1000:
        return "$" + format(value, ",.0f")
    return "$" + format(value, ",.2f")


def compact_money(value):
    if value >= 1e12:
        return "$" + format(value / 1e12, ".2f") + "T"
    if value >= 1e9:
        return "$" + format(value / 1e9, ".1f") + "B"
    if value >= 1e6:
        return "$" + format(value / 1e6, ".0f") + "M"
    return money(value)


def percent_points(value):
    if value is None:
        return None
    if abs(value) <= 2.5:
        return value * 100.0
    return value


def is_hammer(bar):
    span = bar["high"] - bar["low"]
    if span <= 0:
        return False
    body = abs(bar["close"] - bar["open"])
    lower = min(bar["open"], bar["close"]) - bar["low"]
    upper = bar["high"] - max(bar["open"], bar["close"])
    return lower >= body * 2 and upper <= body and bar["close"] >= bar["low"] + span * 0.6


def ema_series(values, length):
    out = [None] * len(values)
    if len(values) < length or length < 1:
        return out
    acc = mean(values[:length])
    out[length - 1] = acc
    alpha = 2.0 / (length + 1.0)
    for index in range(length, len(values)):
        acc = values[index] * alpha + acc * (1.0 - alpha)
        out[index] = acc
    return out


def macd_parts(closes):
    fast = ema_series(closes, 12)
    slow = ema_series(closes, 26)
    line = [None] * len(closes)
    for index in range(len(closes)):
        if fast[index] is None or slow[index] is None:
            continue
        line[index] = fast[index] - slow[index]
    start = next((index for index, value in enumerate(line) if value is not None), None)
    signal = [None] * len(closes)
    hist = [None] * len(closes)
    if start is None:
        return line, signal, hist
    smooth = ema_series(line[start:], 9)
    for offset, value in enumerate(smooth):
        if value is None:
            continue
        signal[start + offset] = value
        hist[start + offset] = line[start + offset] - value
    return line, signal, hist


def stochastic_kd(bars, length=14, smooth=3):
    k_line = [None] * len(bars)
    for index in range(length - 1, len(bars)):
        window = bars[index + 1 - length:index + 1]
        high = max(bar["high"] for bar in window)
        low = min(bar["low"] for bar in window)
        if high == low:
            k_line[index] = 50.0
        else:
            k_line[index] = (bars[index]["close"] - low) / (high - low) * 100.0
    d_line = [None] * len(bars)
    for index in range(len(bars)):
        sample = k_line[index + 1 - smooth:index + 1]
        if len(sample) < smooth or any(value is None for value in sample):
            continue
        d_line[index] = mean(sample)
    return k_line, d_line


def obv_series(bars):
    out = [0.0]
    for index in range(1, len(bars)):
        close = bars[index]["close"]
        prev = bars[index - 1]["close"]
        if close > prev:
            out.append(out[-1] + bars[index]["volume"])
        elif close < prev:
            out.append(out[-1] - bars[index]["volume"])
        else:
            out.append(out[-1])
    return out


def lower_band_at(closes, index):
    if index < 19:
        return None
    window = closes[index - 19:index + 1]
    return mean(window) - 2 * population_stdev(window)


def bullish_engulfing(prev, bar):
    if prev["close"] >= prev["open"] or bar["close"] <= bar["open"]:
        return False
    prev_body = abs(prev["close"] - prev["open"])
    body = abs(bar["close"] - bar["open"])
    return bar["open"] <= prev["close"] and bar["close"] >= prev["open"] and body > prev_body


def rsi_divergence(closes, rsi, last):
    if last < 20:
        return False
    pivots = []
    start = max(2, last - 45)
    for index in range(start, last + 1):
        if rsi[index] is None:
            continue
        left = min(closes[max(0, index - 2):index]) if index else closes[index]
        right = min(closes[index:min(len(closes), index + 3)])
        if closes[index] <= left and closes[index] <= right:
            pivots.append(index)
    if len(pivots) < 2:
        return False
    later = pivots[-1]
    if last - later > 5:
        return False
    earlier = None
    for index in reversed(pivots[:-1]):
        if 5 <= later - index <= 30:
            earlier = index
            break
    if earlier is None or rsi[earlier] is None or rsi[later] is None:
        return False
    return closes[later] < closes[earlier] * 0.997 and rsi[later] >= rsi[earlier] + 2.0


def swing_bottom(bars):
    """0-100 score for a daily-chart bottom that is starting to turn.

    Liquidity below $5 or both thin share volume and thin dollar volume scores 0
    so a junk print cannot become the top stock. Points:
    RSI turning up 16, RSI divergence 10, stochastic cross from under 20 is 12,
    MACD cross below zero 14 or a rising negative histogram 8, lower Bollinger
    bounce 10, within 12% of the 52-week low 6, 10/20-day EMA reclaim 10,
    uptrend pullback 8, volume reversal 8, hammer or bullish engulfing 6.
    A close under a falling 200-day average loses 12. A shock bar of about 9%
    or worse in the last 8 sessions loses 12 even when price is still above the
    200-day average. The total is capped at 100. Hard eligibility is decided
    later and does not use the fundamentals sheet.
    """
    empty = {"score": 0.0, "signals": [], "eligible": False}
    closes = [bar["close"] for bar in bars]
    last = len(closes) - 1
    if last < 60:
        return empty
    avg_volume = mean([bar["volume"] for bar in bars[last - 20:last]])
    price = closes[last]
    liquid = (
        price >= swing_param("liquidity.minPrice", 5)
        and avg_volume > 0
        and (
            avg_volume >= swing_param("liquidity.minAvgVolume", 250000)
            or price * avg_volume >= swing_param("liquidity.minDollarVolume", 5000000)
        )
    )
    if not liquid:
        return empty
    rsi = wilder_rsi(closes)
    if rsi[last] is None or rsi[last - 1] is None:
        return empty
    signals = []
    qualifying = []
    points = 0

    def add(label, weight, qualifies=True):
        nonlocal points
        signals.append(label)
        points += weight
        if qualifies:
            qualifying.append(label)

    lookback = int(swing_param("rsi.lookback", 7))
    recent = [rsi[index] for index in range(last - lookback, last) if rsi[index] is not None]
    if recent and min(recent) <= swing_param("rsi.recentMax", 35) and rsi[last] > rsi[last - 1] and rsi[last] < swing_param("rsi.turnBelow", 55):
        add("RSI turning up", swing_param("rsi.turningUpWeight", 16))
    if rsi_divergence(closes, rsi, last):
        add("RSI divergence", swing_param("rsi.divergenceWeight", 10))
    k_line, d_line = stochastic_kd(bars)
    if None not in (k_line[last], d_line[last], k_line[last - 1], d_line[last - 1]):
        crossed = k_line[last - 1] <= d_line[last - 1] and k_line[last] > d_line[last]
        was_low = min(k_line[last - 1], d_line[last - 1], k_line[last]) < swing_param("stochastic.crossBelow", 20)
        if crossed and was_low:
            add("Stoch cross", swing_param("stochastic.weight", 12))
    line, signal, hist = macd_parts(closes)
    if None not in (line[last], signal[last], line[last - 1], signal[last - 1]):
        if line[last - 1] <= signal[last - 1] and line[last] > signal[last] and line[last] < 0:
            add("MACD cross", swing_param("macd.crossWeight", 14))
        elif None not in (hist[last], hist[last - 1], hist[last - 2]) and hist[last - 1] < 0 and hist[last] > hist[last - 1] and hist[last - 1] >= hist[last - 2]:
            add("MACD rising", swing_param("macd.risingWeight", 8))
    touched = False
    for index in range(max(19, last - 2), last + 1):
        band = lower_band_at(closes, index)
        if band and bars[index]["low"] <= band * swing_param("bollinger.touchTolerance", 1.005):
            touched = True
    band_now = lower_band_at(closes, last)
    mid_now = mean(closes[last - 19:last + 1])
    if touched and band_now and closes[last] >= band_now * swing_param("bollinger.reclaimTolerance", 0.998) and closes[last] <= mid_now:
        add("Lower BB bounce", swing_param("bollinger.weight", 10))
    year = bars[max(0, last - 251):last + 1]
    low52 = min(bar["low"] for bar in year)
    if low52 > 0 and (closes[last] - low52) / low52 <= swing_param("context.nearLowPct", 0.12):
        add("Near 52w low", swing_param("context.nearLowWeight", 6), qualifies=False)
    high63 = max(closes[max(0, last - 62):last + 1])
    if high63 > 0 and closes[last] <= high63 * swing_param("context.pullbackFromHigh", 0.88):
        add("Pullback from high", swing_param("context.pullbackWeight", 4), qualifies=False)
    ema10 = ema_series(closes, 10)
    ema20 = ema_series(closes, 20)
    below = 0
    for index in range(last - 5, last):
        if ema10[index] is not None and closes[index] < ema10[index]:
            below += 1
    reclaimed = False
    below_days = int(swing_param("ema.belowDays", 3))
    if below >= below_days and ema10[last] is not None and ema10[last - 1] is not None and closes[last] > ema10[last] and closes[last - 1] <= ema10[last - 1]:
        reclaimed = True
    if below >= below_days and ema20[last] is not None and ema20[last - 1] is not None and closes[last] > ema20[last] and closes[last - 1] <= ema20[last - 1]:
        reclaimed = True
    if reclaimed:
        add("EMA reclaim", swing_param("ema.reclaimWeight", 10))
    if is_hammer(bars[last]) or (last >= 1 and bullish_engulfing(bars[last - 1], bars[last])):
        add("Reversal candle", swing_param("candle.weight", 6))
    up = closes[last] > closes[last - 1]
    capitulation = False
    for index in range(max(1, last - 5), last + 1):
        down = bars[index]["close"] < bars[index - 1]["close"]
        if down and bars[index]["volume"] >= swing_param("volume.capitulationMultiple", 1.5) * avg_volume:
            capitulation = True
    volume_up = bars[last]["volume"] >= avg_volume and up
    obv = obv_series(bars)
    obv_up = obv[last] > obv[last - 3] and up
    if capitulation and (volume_up or (up and bars[last]["volume"] >= bars[last - 1]["volume"])):
        add("Volume reversal", swing_param("volume.weight", 8))
    elif obv_up and volume_up:
        add("Volume reversal", swing_param("volume.weight", 8))
    sma_now = sma_at(closes, last, 200)
    sma_then = sma_at(closes, last - 20, 200) if last >= 220 else None
    if qualifying and sma_now and sma_then and closes[last] > sma_now and sma_now >= sma_then:
        add("Uptrend pullback", swing_param("context.uptrendWeight", 8), qualifies=False)
    drop21 = (closes[last] / closes[last - 21] - 1.0) * 100 if last >= 21 else None
    shock, shock_pct = shock_stats(bars)
    if sma_now and sma_then and closes[last] < sma_now and sma_now < sma_then and ((drop21 is not None and drop21 <= swing_param("fallingKnife.drop21", -12)) or not up):
        points -= swing_param("fallingKnife.penalty", 12)
    if shock:
        points -= swing_param("fallingKnife.penalty", 12)
    score = round(max(0, min(100, points)), 1)
    above = bool(sma_now and closes[last] > sma_now)
    return {
        "score": score,
        "signals": signals,
        "shock": shock,
        "shockPct": shock_pct,
        "eligible": bool(
            above
            and not shock
            and len(qualifying) >= int(swing_param("gates.minConfirmingSignals", 2))
            and score >= swing_param("gates.minRawScore", 36)
        ),
    }


SWING_CONTEXT = {"Near 52w low", "Pullback from high", "Uptrend pullback"}


def entry_is_planned(row):
    """The buy zone has to sit away from the signal close."""
    price = row.get("price")
    high = row.get("entryHigh")
    style = row.get("planStyle") or ""
    if not isinstance(price, (int, float)) or not isinstance(high, (int, float)):
        return style not in ("limit", "confirm", "none")
    if style == "none":
        return False
    if style == "confirm":
        return high > price + 0.004
    if style == "limit":
        return high < price - 0.004
    return abs(high - price) > 0.02


def finalize_swing(row):
    """Hard gates for anything that can be called a swing candidate or journaled.

    Research rows can fail these and stay on the wider list. A pass needs:
    no shock bar, earnings outside 7 days, promoted dollar volume, a rising
    200-day with at least a 5% cushion, a limited 21-session pullback, volume
    confirmation, two or more reversal signals, a swing score of 36 or more,
    reward at least 2:1, and an entry that is not the signal close.
    Fundamentals are not an input.
    """
    base = row.get("swingBase", row.get("swingScore") or 0)
    signals = list(row.get("swingSignals") or [])
    qualifying = [label for label in signals if label not in SWING_CONTEXT]
    score = base
    if not row.get("above200"):
        score -= swing_param("gates.below200Penalty", 30)
    reward = row.get("rewardRisk")
    min_reward = swing_param("gates.minRewardRisk", 2.0)
    if not isinstance(reward, (int, float)) or reward < min_reward:
        score -= swing_param("gates.rewardPenalty", 20)
    flags = list(row.get("flags") or [])
    earnings = earnings_flag_label()
    if earnings in flags:
        score -= swing_param("gates.earningsPenalty", 25)
    score = round(max(0, min(100, score)), 1)
    row["swingScore"] = score
    cushion = row.get("vsSma200")
    drop21 = row.get("drop21")
    dollar = row.get("avgDollarVolume")
    min_cushion = float(swing_param("gates.minAbove200Pct", 5))
    max_pullback = float(swing_param("gates.maxPullback21Pct", -15))
    min_dollar = float(swing_param("liquidity.minPromotedDollarVolume", 20000000))
    row["swingEligible"] = bool(
        row.get("planStyle") != "none"
        and not row.get("shock")
        and "Falling knife" not in flags
        and row.get("above200")
        and row.get("sma200Rising") is True
        and isinstance(cushion, (int, float))
        and cushion >= min_cushion
        and isinstance(drop21, (int, float))
        and drop21 > max_pullback
        and isinstance(dollar, (int, float))
        and dollar >= min_dollar
        and "Volume reversal" in signals
        and len(qualifying) >= int(swing_param("gates.minConfirmingSignals", 2))
        and score >= swing_param("gates.minAdjustedScore", 36)
        and isinstance(reward, (int, float))
        and reward >= min_reward
        and earnings not in flags
        and entry_is_planned(row)
    )


def score_row(rsi, close, lower, hammer, uptick, volume_ratio):
    score = 0
    if rsi < 20:
        score += 40
    elif rsi < 30:
        score += 32
    elif rsi <= 35:
        score += 22
    elif rsi < 40:
        score += 10
    elif rsi < 45:
        score += 4
    if lower and close <= lower:
        score += 25
    elif lower and close <= lower * 1.01:
        score += 18
    elif lower and close <= lower * 1.03:
        score += 10
    if hammer:
        score += 12
    if uptick:
        score += 8
    if volume_ratio >= 1.5:
        score += 15
    elif volume_ratio >= 1.2:
        score += 10
    elif volume_ratio >= 1.0:
        score += 4
    return max(0, min(100, score))


def yahoo_symbol(raw):
    text = re.sub(r"<[^>]+>", "", raw or "")
    text = text.replace("\xa0", " ").strip().upper().replace(".", "-")
    text = re.sub(r"[^A-Z0-9-]", "", text)
    return text


def normalize_symbol(raw):
    symbol = yahoo_symbol(raw)
    if symbol in EXCLUDE or not TICKER_RE.match(symbol):
        return ""
    return symbol


class Gate:
    def __init__(self, interval):
        self.interval = interval
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            slot = max(now, self.next_at)
            self.next_at = slot + self.interval
            delay = slot - now
        if delay:
            time.sleep(delay)


def request(url, user_agent):
    return urllib.request.Request(
        url,
        headers={"User-Agent": user_agent, "Accept": "application/json,text/html;q=0.9,*/*;q=0.8"},
    )


def read_url(opener, url, timeout, attempts=4, user_agent=UA):
    last = None
    current = url
    for attempt in range(attempts):
        try:
            with opener.open(request(current, user_agent), timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            last = error
            if error.code in (429, 500, 502, 503, 504) and attempt + 1 < attempts:
                if error.code == 429 and "query1" in current:
                    current = current.replace("query1", "query2", 1)
                time.sleep(min(40, 1.6 * (2 ** attempt)) + random.random())
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            if attempt + 1 < attempts:
                time.sleep(min(20, 1.2 * (2 ** attempt)) + random.random())
                continue
            raise
    if last:
        raise last
    raise RuntimeError("fetch failed")


def wiki_html(url):
    opener = urllib.request.build_opener()
    return read_url(opener, url, 50, attempts=3, user_agent=WIKI_UA).decode("utf-8", "replace")


def constituent_table(html):
    match = re.search(r'<table\b[^>]*id="constituents"[^>]*>(.*?)</table>', html, re.S | re.I)
    if not match:
        raise RuntimeError("constituents table missing")
    return re.findall(r"<tr\b[^>]*>(.*?)</tr>", match.group(1), re.S | re.I)


def first_cell(row):
    cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S | re.I)
    return cells[0] if cells else ""


def symbol_from_cell(cell):
    href = re.search(
        r"https://www\.(?:nyse\.com/quote/(?:XNYS|XNAS|ARCX):|nasdaq\.com/market-activity/stocks/)([A-Za-z0-9.\-]+)",
        cell,
    )
    if href:
        return normalize_symbol(href.group(1))
    return normalize_symbol(cell)


def symbols_from_page(url, minimum):
    rows = constituent_table(wiki_html(url))
    found = []
    seen = set()
    for row in rows:
        symbol = symbol_from_cell(first_cell(row))
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        found.append(symbol)
    if len(found) < minimum:
        raise RuntimeError(url + " returned " + str(len(found)) + " symbols")
    return found


def parse_russell_holdings(text):
    """Equity tickers from the iShares Russell 2000 holdings file.

    Cash, futures, and unlisted or bulletin-board lines are left out. Share
    classes such as "MOG A" become MOG-A, which is the chart symbol.
    """
    start = text.find("Ticker,Name,")
    if start < 0:
        raise RuntimeError("Russell holdings header missing")
    found = []
    seen = set()
    for row in csv.DictReader(io.StringIO(text[start:])):
        if (row.get("Asset Class") or "").strip() != "Equity":
            continue
        exchange = (row.get("Exchange") or "").strip().upper()
        if exchange not in LISTED_EXCHANGES:
            continue
        symbol = normalize_symbol(re.sub(r"\s+", "-", (row.get("Ticker") or "").strip()))
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        found.append(symbol)
    return found


def listed_symbol(raw):
    text = (raw or "").strip().upper().replace(".", "-").replace("/", "-")
    if "$" in text or "%" in text:
        return ""
    return normalize_symbol(text)


def keep_common_name(name):
    return bool(name) and LISTED_BAD_NAME.search(name) is None


def parse_symbol_directory(nasdaq_text, other_text):
    """Common stocks from the Nasdaq Trader symbol directories.

    Nasdaq, NYSE, and NYSE American only. ETFs, test issues, and names that
    are warrants, rights, units, preferreds, notes, or funds are dropped.
    """
    nasdaq = []
    nyse = []
    amex = []
    seen = set()

    def add(symbol, bucket):
        if not symbol or symbol in seen or symbol in EXCLUDE:
            return
        seen.add(symbol)
        bucket.append(symbol)

    for line in nasdaq_text.splitlines():
        parts = line.split("|")
        if len(parts) < 8 or parts[0] in {"Symbol", ""}:
            continue
        if parts[6] != "N" or parts[3] != "N" or parts[7] == "Y":
            continue
        if not keep_common_name(parts[1]):
            continue
        add(listed_symbol(parts[0]), nasdaq)
    for line in other_text.splitlines():
        parts = line.split("|")
        if len(parts) < 8 or parts[0] in {"ACT Symbol", ""}:
            continue
        if parts[2] not in {"N", "A"} or parts[4] != "N" or parts[6] != "N":
            continue
        if not keep_common_name(parts[1]):
            continue
        add(listed_symbol(parts[0]), nyse if parts[2] == "N" else amex)
    return {"nasdaq": nasdaq, "nyse": nyse, "amex": amex}


def fetch_symbol_directory():
    opener = urllib.request.build_opener()
    nasdaq = read_url(opener, NASDAQ_LISTED_URL, 60, attempts=3, user_agent=WIKI_UA).decode("utf-8", "replace")
    other = read_url(opener, OTHER_LISTED_URL, 60, attempts=3, user_agent=WIKI_UA).decode("utf-8", "replace")
    groups = parse_symbol_directory(nasdaq, other)
    union = len(groups["nasdaq"]) + len(groups["nyse"]) + len(groups["amex"])
    if union < 4000:
        raise RuntimeError("symbol directory returned " + str(union) + " common stocks")
    return groups


def symbols_from_russell():
    opener = urllib.request.build_opener()
    raw = read_url(opener, RUSSELL_URL, 60, attempts=3, user_agent=HOLDINGS_UA)
    found = parse_russell_holdings(raw.decode("utf-8", "replace"))
    if len(found) < 1500:
        raise RuntimeError("Russell holdings returned " + str(len(found)) + " symbols")
    return found


def build_universe():
    groups = fetch_symbol_directory()
    ordered = sorted(groups["nasdaq"] + groups["nyse"] + groups["amex"])
    if "RCL" in ordered:
        raise RuntimeError("RCL slipped into the universe")
    return {
        "updated": stamp(now_utc()),
        "sources": [NASDAQ_LISTED_URL, OTHER_LISTED_URL],
        "excluded": sorted(EXCLUDE),
        "counts": {
            "nasdaq": len(groups["nasdaq"]),
            "nyse": len(groups["nyse"]),
            "amex": len(groups["amex"]),
            "union": len(ordered),
        },
        "symbols": ordered,
    }


def universe_stale(document):
    if os.environ.get("STOCKS_REFRESH_UNIVERSE") == "1":
        return True
    if not isinstance(document, dict) or not isinstance(document.get("symbols"), list):
        return True
    counts = document.get("counts") if isinstance(document.get("counts"), dict) else {}
    sources = document.get("sources") if isinstance(document.get("sources"), list) else []
    if NASDAQ_LISTED_URL not in sources or counts.get("union", 0) < 4000:
        return True
    if len(document["symbols"]) < 4000:
        return True
    if "RCL" in document["symbols"]:
        return True
    updated = document.get("updated")
    if not isinstance(updated, str):
        return True
    try:
        moment = datetime.strptime(updated, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    return now_utc() - moment > timedelta(days=UNIVERSE_MAX_AGE_DAYS)


def load_universe():
    previous = load_json(UNIVERSE_PATH)
    if not universe_stale(previous):
        symbols = [symbol for symbol in previous.get("symbols", []) if normalize_symbol(symbol) and symbol not in EXCLUDE]
        print("Universe list is current (" + str(len(symbols)) + " symbols, " + str(previous.get("updated")) + ").")
        return symbols
    try:
        document = build_universe()
    except (OSError, urllib.error.URLError, TimeoutError, RuntimeError, re.error) as error:
        symbols = [symbol for symbol in previous.get("symbols", []) if isinstance(symbol, str) and normalize_symbol(symbol)]
        counts = previous.get("counts") if isinstance(previous.get("counts"), dict) else {}
        if len(symbols) >= 4000 and counts.get("union", 0) >= 4000 and "RCL" not in symbols:
            print("Universe refresh failed (" + str(error).splitlines()[0][:120] + "). Keeping the saved list.")
            return symbols
        raise
    UNIVERSE_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    counts = document["counts"]
    print(
        "Universe refreshed: "
        + str(counts["union"])
        + " common stocks (Nasdaq "
        + str(counts["nasdaq"])
        + ", NYSE "
        + str(counts["nyse"])
        + ", NYSE American "
        + str(counts["amex"])
        + ")."
    )
    return document["symbols"]


def tradingview_symbol(symbol, exchange):
    venue = "NASDAQ" if exchange.upper() in {"NMS", "NGM", "NCM", "NASDAQ", "NASDAQGS"} else "NYSE"
    if exchange.upper() in {"PCX", "NYSEARCA", "BATS", "ASE", "AMEX"}:
        venue = "AMEX"
    return venue + ":" + symbol.replace("-", ".")


def analyze(symbol, bars, name, exchange):
    closes = [bar["close"] for bar in bars]
    rsi_series = wilder_rsi(closes)
    last = len(bars) - 1
    close = closes[last]
    rsi = rsi_series[last]
    if rsi is None:
        raise RuntimeError("rsi unavailable")
    sma20 = sma_at(closes, last, 20)
    sma50 = sma_at(closes, last, 50)
    sma200 = sma_at(closes, last, 200)
    window = closes[last - 19:last + 1]
    middle = mean(window)
    sigma = population_stdev(window)
    upper = middle + 2 * sigma
    lower = middle - 2 * sigma
    previous = closes[last - 1]
    uptick = close > previous
    hammer = is_hammer(bars[last])
    prior_volume = [bar["volume"] for bar in bars[max(0, last - 20):last]]
    volume_ratio = bars[last]["volume"] / mean(prior_volume) if prior_volume and mean(prior_volume) else 1.0
    score = score_row(rsi, close, lower, hammer, uptick, volume_ratio)
    drop5 = (close / closes[last - 5] - 1.0) * 100 if last >= 5 else None
    drop21 = (close / closes[last - 21] - 1.0) * 100 if last >= 21 else None
    year = bars[max(0, last - 251):last + 1]
    high52 = max(bar["high"] for bar in year)
    low52 = min(bar["low"] for bar in year)
    span = high52 - low52
    range52 = ((close - low52) / span) * 100 if span else 50.0
    distance = ((close - lower) / lower) * 100 if lower else 0.0
    atr = wilder_atr(bars)
    plan = build_trade_plan(bars, atr, lower, middle, upper, sma20)
    above200 = bool(sma200 and close > sma200)
    sma200_prev = sma_at(closes, last - 20, 200) if last >= 219 else None
    sma200_rising = None if sma200 is None or sma200_prev is None else bool(sma200 >= sma200_prev)
    swing = swing_bottom(bars)
    zone = "deep" if rsi < 30 else "watch" if rsi <= 40 else ""
    ready = rsi <= 40 and (uptick or hammer) and (close <= lower * 1.015 or score >= 45)
    pullback = above200 and (rsi < 45 or (sma20 is not None and close < sma20))
    start = max(0, last - SERIES + 1)
    series_c, series_u, series_m, series_l, series_r = [], [], [], [], []
    for index in range(start, last + 1):
        sample = closes[index - 19:index + 1] if index >= 19 else None
        if sample and len(sample) == 20:
            mid = mean(sample)
            dev = population_stdev(sample)
            series_u.append(round(mid + 2 * dev, 2))
            series_m.append(round(mid, 2))
            series_l.append(round(mid - 2 * dev, 2))
        else:
            series_u.append(None)
            series_m.append(None)
            series_l.append(None)
        series_c.append(round(closes[index], 2))
        series_r.append(round_num(rsi_series[index], 1))
    row = {
        "symbol": symbol,
        "name": name,
        "price": round(close, 2),
        "dayChange": round((close / previous - 1.0) * 100, 2),
        "rsi": round(rsi, 1),
        "zone": zone,
        "bbLower": round(lower, 2),
        "bbMid": round(middle, 2),
        "bbUpper": round(upper, 2),
        "bbDistancePct": round(distance, 2),
        "sma20": round_num(sma20, 2),
        "sma50": round_num(sma50, 2),
        "sma200": round_num(sma200, 2),
        "vsSma20": round_num((close / sma20 - 1.0) * 100, 2) if sma20 else None,
        "vsSma50": round_num((close / sma50 - 1.0) * 100, 2) if sma50 else None,
        "vsSma200": round_num((close / sma200 - 1.0) * 100, 2) if sma200 else None,
        "above200": above200,
        "sma200Rising": sma200_rising,
        "drop5": round_num(drop5, 2),
        "drop21": round_num(drop21, 2),
        "range52": round(range52, 1),
        "high52": round(high52, 2),
        "low52": round(low52, 2),
        "volumeRatio": round(volume_ratio, 2),
        "avgDollarVolume": round(close * mean(prior_volume)) if prior_volume and mean(prior_volume) else None,
        "hammer": hammer,
        "uptick": uptick,
        "score": score,
        "swingBase": swing["score"],
        "swingScore": swing["score"],
        "swingSignals": swing["signals"],
        "swingEligible": False,
        "strongBounce": False,
        "ready": ready,
        "pullback": pullback,
        "shock": bool(plan["shock"] or swing.get("shock")),
        "shockPct": plan.get("shockPct") if plan.get("shockPct") is not None else swing.get("shockPct"),
        "planStyle": plan["planStyle"],
        "planNote": plan.get("planNote") or "",
        "atr": round_num(atr, 2),
        "entryLow": plan["entryLow"],
        "entryHigh": plan["entryHigh"],
        "stop": plan["stop"],
        "target": plan["target"],
        "targetLabel": plan["targetLabel"],
        "target2": plan["target2"],
        "rewardRisk": plan["rewardRisk"],
        "yahoo": "https://finance.yahoo.com/quote/" + symbol,
        "tradingview": "https://www.tradingview.com/chart/?symbol=" + tradingview_symbol(symbol, exchange),
        "series": {"c": series_c, "u": series_u, "m": series_m, "l": series_l, "r": series_r},
    }
    finalize_swing(row)
    return row


def is_candidate(row, loose=False):
    rsi = row["rsi"]
    near_band = row["bbDistancePct"] <= (2.0 if loose else 1.0)
    pulled = row["drop5"] is not None and row["drop5"] <= (-2.0 if loose else -3.0)
    under_20 = row["vsSma20"] is not None and row["vsSma20"] < 0
    if rsi <= (48 if loose else 40):
        return True
    if near_band and rsi <= (56 if loose else 50):
        return True
    if row["above200"] and rsi <= (52 if loose else 46) and (pulled or under_20):
        return True
    if loose and (row["uptick"] or row["hammer"]) and rsi <= 50 and pulled:
        return True
    return False


def raw_number(block, key):
    if not isinstance(block, dict):
        return None
    value = block.get(key)
    if isinstance(value, dict):
        value = value.get("raw")
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def raw_text(block, key):
    if not isinstance(block, dict):
        return ""
    value = block.get(key)
    if isinstance(value, str):
        return " ".join(value.split())[:80]
    return ""


def earnings_moments(calendar):
    earnings = calendar.get("earnings") if isinstance(calendar, dict) else None
    dates = earnings.get("earningsDate") if isinstance(earnings, dict) else None
    if isinstance(dates, dict):
        dates = [dates]
    moments = []
    if not isinstance(dates, list):
        return moments
    for item in dates:
        raw = item.get("raw") if isinstance(item, dict) else None
        if isinstance(raw, (int, float)) and math.isfinite(raw):
            moments.append(datetime.fromtimestamp(raw, timezone.utc))
    return moments


class YahooSession:
    def __init__(self):
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.crumb = ""
        self.blocked = False
        self.lock = threading.Lock()

    def ensure_crumb(self, force=False):
        with self.lock:
            if self.crumb and not force:
                return self.crumb
            last = None
            for attempt in range(4):
                cookie_request = request(COOKIE_URL, UA)
                try:
                    self.opener.open(cookie_request, timeout=20).read()
                except urllib.error.HTTPError as error:
                    if error.headers:
                        self.jar.extract_cookies(error, cookie_request)
                try:
                    body = read_url(self.opener, CRUMB_URL, 20, attempts=2).decode("utf-8", "replace").strip().strip('"')
                except urllib.error.HTTPError as error:
                    last = error
                    if error.code == 429 and attempt + 1 < 4:
                        delay = 10 * (2 ** attempt)
                        print("Yahoo crumb rate limited, waiting " + str(delay) + "s.", flush=True)
                        time.sleep(delay)
                        continue
                    raise
                except (urllib.error.URLError, TimeoutError, OSError) as error:
                    last = error
                    time.sleep(10 * (attempt + 1))
                    continue
                if body and len(body) <= 48 and not any(char.isspace() for char in body):
                    self.crumb = body
                    return self.crumb
                last = RuntimeError("Yahoo crumb missing")
                time.sleep(8)
            if last:
                raise last
            raise RuntimeError("Yahoo crumb missing")

    def quote_summary(self, symbol):
        if self.blocked:
            raise RuntimeError("yahoo blocked")
        crumb = self.ensure_crumb()
        url = SUMMARY.format(symbol=urllib.parse.quote(symbol), crumb=urllib.parse.quote(crumb))
        try:
            payload = json.loads(read_url(self.opener, url, 30, attempts=3))
        except urllib.error.HTTPError as error:
            if error.code == 429:
                self.blocked = True
                raise
            if error.code in (401, 403):
                crumb = self.ensure_crumb(force=True)
                url = SUMMARY.format(symbol=urllib.parse.quote(symbol), crumb=urllib.parse.quote(crumb))
                payload = json.loads(read_url(self.opener, url, 30, attempts=2))
            else:
                raise
        result = ((payload.get("quoteSummary") or {}).get("result") or [None])[0]
        if not isinstance(result, dict):
            raise RuntimeError("empty quote summary")
        profile = result.get("summaryProfile") or {}
        detail = result.get("summaryDetail") or {}
        financial = result.get("financialData") or {}
        stats = result.get("defaultKeyStatistics") or {}
        facts = {
            "sector": raw_text(profile, "sector"),
            "industry": raw_text(profile, "industry"),
            "marketCap": raw_number(detail, "marketCap") or raw_number(stats, "marketCap"),
            "revenueGrowth": raw_number(financial, "revenueGrowth"),
            "profitMargins": raw_number(financial, "profitMargins"),
            "operatingMargins": raw_number(financial, "operatingMargins"),
            "freeCashflow": raw_number(financial, "freeCashflow"),
            "debtToEquity": raw_number(financial, "debtToEquity"),
            "recommendationMean": raw_number(financial, "recommendationMean"),
            "targetMeanPrice": raw_number(financial, "targetMeanPrice"),
            "forwardPE": raw_number(stats, "forwardPE") or raw_number(detail, "forwardPE") or raw_number(financial, "forwardPE"),
            "trailingPE": raw_number(stats, "trailingPE") or raw_number(detail, "trailingPE"),
            "source": "Yahoo",
        }
        upcoming = []
        for moment in earnings_moments(result.get("calendarEvents") or {}):
            if now_utc() <= moment <= now_utc() + timedelta(days=int(swing_param("gates.earningsWindowDays", 7))):
                upcoming.append(moment)
        facts["earningsSoon"] = stamp(min(upcoming)) if upcoming else ""
        return {key: value for key, value in facts.items() if value not in ("", None)}


NASDAQ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
NASDAQ_SUMMARY = "https://api.nasdaq.com/api/quote/{symbol}/summary?assetclass=stocks"
NASDAQ_FINANCIALS = "https://api.nasdaq.com/api/company/{symbol}/financials?frequency=1"
NASDAQ_TARGET = "https://api.nasdaq.com/api/analyst/{symbol}/targetprice"
NASDAQ_RATINGS = "https://api.nasdaq.com/api/analyst/{symbol}/ratings"
NASDAQ_EARNINGS = "https://api.nasdaq.com/api/calendar/earnings?date={day}"


def parse_number(value):
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if not isinstance(value, str):
        return None
    cleaned = value.strip().replace(",", "").replace("$", "").replace("%", "")
    if cleaned in {"", "--", "N/A", "n/a", "NA"}:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def table_pair(table, label):
    for row in (table or {}).get("rows") or []:
        if row.get("value1") == label:
            return parse_number(row.get("value2")), parse_number(row.get("value3"))
    return None, None


class NasdaqBook:
    """Keyless fallback when Yahoo's crumb is blocked. Statement dollars are in thousands."""

    def __init__(self):
        self.opener = urllib.request.build_opener()
        self.earnings = {}

    def fetch(self, url):
        time.sleep(0.35)
        payload = json.loads(read_url(self.opener, url, 25, attempts=3, user_agent=NASDAQ_UA))
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("empty nasdaq payload")
        return data

    def load_earnings(self, symbols):
        wanted = set()
        for symbol in symbols:
            wanted.add(symbol.upper())
            if "-" in symbol:
                wanted.add(symbol.upper().replace("-", "."))
        today = now_utc().date()
        for offset in range(8):
            day = today + timedelta(days=offset)
            url = NASDAQ_EARNINGS.format(day=day.isoformat())
            try:
                data = self.fetch(url)
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError):
                continue
            for row in data.get("rows") or []:
                symbol = row.get("symbol")
                if isinstance(symbol, str) and symbol.upper() in wanted:
                    self.earnings[symbol.upper()] = day.isoformat()
            time.sleep(0.25)

    def symbol_forms(self, symbol):
        forms = [symbol]
        dotted = symbol.replace("-", ".")
        if dotted not in forms:
            forms.append(dotted)
        return forms

    def facts(self, symbol):
        facts = {"source": "Nasdaq"}
        summary = None
        used = symbol
        for form in self.symbol_forms(symbol):
            try:
                summary = self.fetch(NASDAQ_SUMMARY.format(symbol=urllib.parse.quote(form)))
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError):
                summary = None
                continue
            block = summary.get("summaryData") or {}
            if parse_number((block.get("MarketCap") or {}).get("value")) is not None or raw_text_value(block, "Sector"):
                used = form
                break
            summary = None
        if summary:
            block = summary.get("summaryData") or {}
            facts["sector"] = raw_text_value(block, "Sector")
            facts["industry"] = raw_text_value(block, "Industry")
            facts["marketCap"] = parse_number((block.get("MarketCap") or {}).get("value"))
            facts["targetMeanPrice"] = parse_number((block.get("OneYrTarget") or {}).get("value"))
        try:
            financials = self.fetch(NASDAQ_FINANCIALS.format(symbol=urllib.parse.quote(used)))
        except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError):
            financials = {}
        ratios = financials.get("financialRatiosTable") or {}
        margin, _prior_margin = table_pair(ratios, "Profit Margin")
        operating, _prior_operating = table_pair(ratios, "Operating Margin")
        if margin is not None:
            facts["profitMargins"] = margin / 100.0
        if operating is not None:
            facts["operatingMargins"] = operating / 100.0
        revenue, prior_revenue = table_pair(financials.get("incomeStatementTable") or {}, "Total Revenue")
        if revenue and prior_revenue:
            facts["revenueGrowth"] = revenue / prior_revenue - 1.0
        operating_cash, _prior_cash = table_pair(financials.get("cashFlowTable") or {}, "Net Cash Flow-Operating")
        capex, _prior_capex = table_pair(financials.get("cashFlowTable") or {}, "Capital Expenditures")
        if operating_cash is not None and capex is not None:
            facts["freeCashflow"] = (operating_cash + capex) * 1000.0
        short_debt, _prior_short = table_pair(financials.get("balanceSheetTable") or {}, "Short-Term Debt / Current Portion of Long-Term Debt")
        long_debt, _prior_long = table_pair(financials.get("balanceSheetTable") or {}, "Long-Term Debt")
        equity, _prior_equity = table_pair(financials.get("balanceSheetTable") or {}, "Total Equity")
        debt = (short_debt or 0.0) + (long_debt or 0.0)
        if equity and equity > 0 and (short_debt is not None or long_debt is not None):
            facts["debtToEquity"] = debt / equity
        try:
            target = self.fetch(NASDAQ_TARGET.format(symbol=urllib.parse.quote(used)))
            overview = target.get("consensusOverview") or {}
            if isinstance(overview.get("priceTarget"), (int, float)) and math.isfinite(overview["priceTarget"]):
                facts["targetMeanPrice"] = float(overview["priceTarget"])
            for key, field in (("buy", "ratingsBuy"), ("hold", "ratingsHold"), ("sell", "ratingsSell")):
                if isinstance(overview.get(key), (int, float)) and math.isfinite(overview[key]):
                    facts[field] = int(overview[key])
        except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError, TypeError):
            pass
        try:
            ratings = self.fetch(NASDAQ_RATINGS.format(symbol=urllib.parse.quote(used)))
            label = ratings.get("meanRatingType")
            if isinstance(label, str) and label.strip() and label.strip().upper() not in {"N/A", "NA"}:
                facts["recommendationLabel"] = " ".join(label.split())[:32]
        except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError):
            pass
        soon = self.earnings.get(symbol.upper()) or self.earnings.get(symbol.upper().replace("-", "."))
        if soon:
            facts["earningsSoon"] = soon
        return {key: value for key, value in facts.items() if value not in ("", None)}


def raw_text_value(block, key):
    value = block.get(key) if isinstance(block, dict) else None
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, str):
        text = " ".join(value.split())
        if text and text.upper() not in {"N/A", "NA", "--"}:
            return text[:80]
    return ""


def quality_score(facts, price):
    if not facts:
        return None
    score = 40.0
    margin = facts.get("profitMargins")
    if margin is not None:
        if margin >= 0.20:
            score += 16
        elif margin >= 0.10:
            score += 10
        elif margin >= 0.03:
            score += 4
        elif margin < 0:
            score -= 10
    growth = facts.get("revenueGrowth")
    if growth is not None:
        if growth >= 0.15:
            score += 14
        elif growth >= 0.05:
            score += 8
        elif growth >= 0:
            score += 3
        else:
            score -= 8
    cash = facts.get("freeCashflow")
    if cash is not None:
        score += 10 if cash > 0 else -8
    debt = facts.get("debtToEquity")
    if debt is not None:
        if facts.get("source") == "Nasdaq":
            if debt <= 0.5:
                score += 8
            elif debt <= 1.5:
                score += 3
            elif debt >= 2.5:
                score -= 10
        elif debt <= 50:
            score += 8
        elif debt <= 120:
            score += 3
        elif debt >= 250:
            score -= 10
    recommendation = facts.get("recommendationMean")
    if recommendation is None and facts.get("recommendationLabel"):
        label = facts["recommendationLabel"].lower()
        if "strong buy" in label or label == "buy":
            score += 8
        elif "hold" in label:
            score += 2
        elif "sell" in label:
            score -= 8
    if recommendation is not None:
        if recommendation <= 2.0:
            score += 10
        elif recommendation <= 2.5:
            score += 6
        elif recommendation <= 3.2:
            score += 2
        elif recommendation >= 4.0:
            score -= 8
    target = facts.get("targetMeanPrice")
    if target is not None and price:
        gap = target / price - 1.0
        if gap >= 0.10:
            score += 8
        elif gap >= 0:
            score += 3
        elif gap <= -0.08:
            score -= 6
    cap = facts.get("marketCap")
    if cap is not None:
        if cap >= 10_000_000_000:
            score += 4
        elif cap >= 2_000_000_000:
            score += 2
    forward = facts.get("forwardPE")
    trailing = facts.get("trailingPE")
    if forward is not None and trailing is not None and trailing > 0 and forward < trailing:
        score += 4
    return max(0, min(100, round(score)))


def build_flags(row, facts):
    flags = []
    if row.get("shock"):
        flags.append("Falling knife")
    if row["sma200"] and not row["above200"]:
        flags.append("Below the 200-day")
    if row["sma50"] and row["sma200"] and row["price"] < row["sma50"] and row["sma50"] < row["sma200"]:
        flags.append("Downtrend")
    if facts.get("earningsSoon"):
        flags.append(earnings_flag_label())
    debt = facts.get("debtToEquity")
    high_debt = debt is not None and (debt >= 2 if facts.get("source") == "Nasdaq" else debt >= 200)
    if high_debt:
        flags.append("High debt-to-equity")
    return flags


def join_bits(bits):
    return " ".join(bit.strip() for bit in bits if bit and bit.strip())


def build_copy(row, facts):
    flags = build_flags(row, facts)
    row["flags"] = flags
    finalize_swing(row)
    tech = "RSI(14) is " + format(row["rsi"], ".1f")
    if row["uptick"]:
        tech += " and the last close turned up."
    elif row["hammer"]:
        tech += " and the last bar is a hammer."
    else:
        tech += " and the last close did not turn up."
    distance = row["bbDistancePct"]
    if distance <= 0:
        tech += " The last close is " + format(abs(distance), ".1f") + "% through the lower Bollinger Band."
    else:
        tech += " The last close is " + format(distance, ".1f") + "% above the lower Bollinger Band."
    place = []
    move = []
    if row["vsSma50"] is not None:
        place.append(format(abs(row["vsSma50"]), ".1f") + "% " + ("under" if row["vsSma50"] < 0 else "above") + " the 50-day average")
    if row["vsSma200"] is not None:
        place.append(format(abs(row["vsSma200"]), ".1f") + "% " + ("under" if row["vsSma200"] < 0 else "above") + " the 200-day average")
    vendor = facts.get("source") if facts.get("source") in ("Yahoo", "Nasdaq") else "Yahoo"
    if row["drop5"] is not None:
        move.append(format(row["drop5"], "+.1f") + "% over 5 sessions")
    if row["drop21"] is not None:
        move.append(format(row["drop21"], "+.1f") + "% over 21 sessions")
    trend_bits = []
    if place:
        trend_bits.append("Price is " + " and ".join(place) + ".")
    if move:
        trend_bits.append("The move is " + " and ".join(move) + ".")
    if row["volumeRatio"] is not None:
        trend_bits.append("Volume is " + format(row["volumeRatio"], ".1f") + "× the prior 20-session average.")
    trend_sentence = " ".join(trend_bits)
    levels = []
    if row.get("planStyle") == "none":
        levels.append(row.get("planNote") or "No entry, stop, or target is sketched after a recent shock bar")
    elif row["atr"] and row["entryLow"] is not None and row["entryHigh"] is not None:
        if row.get("planStyle") == "confirm":
            levels.append(
                "Using ATR(14) of "
                + money(row["atr"])
                + ", the sketched entry is a next-session reclaim of "
                + money(row["entryHigh"])
            )
        else:
            levels.append(
                "Using ATR(14) of "
                + money(row["atr"])
                + ", the sketched entry zone is "
                + money(row["entryLow"])
                + " to "
                + money(row["entryHigh"])
                + ", under the last close"
            )
    if row.get("planStyle") != "none" and row["stop"] is not None:
        levels.append("a stop sketch " + money(row["stop"]) + " (1.5× capped ATR under the planned entry)")
    if row["target"] is not None and row["targetLabel"]:
        levels.append(row["targetLabel"] + " at " + money(row["target"]))
    if row["target2"] is not None:
        levels.append("the upper band at " + money(row["target2"]))
    if row["rewardRisk"] is not None and row["rewardRisk"] > 0:
        levels.append("about " + format(row["rewardRisk"], ".1f") + ":1 reward to risk versus that first target")
    level_sentence = ""
    if levels:
        level_sentence = levels[0] + (", " + ", ".join(levels[1:]) if len(levels) > 1 else "") + "."
    business = []
    if facts.get("sector") and facts.get("industry"):
        business.append(vendor + " lists " + facts["sector"] + " / " + facts["industry"])
    elif facts.get("sector"):
        business.append(vendor + " lists the sector as " + facts["sector"])
    if facts.get("marketCap"):
        business.append("market cap " + compact_money(facts["marketCap"]))
    growth = percent_points(facts.get("revenueGrowth"))
    if growth is not None:
        growth_bit = "revenue growth " + format(growth, "+.0f") + "%"
        if facts.get("source") == "Nasdaq":
            growth_bit += " from the prior annual period"
        business.append(growth_bit)
    margin = percent_points(facts.get("profitMargins"))
    if margin is not None:
        business.append("profit margin " + format(margin, ".0f") + "%")
    if facts.get("freeCashflow") is not None:
        if facts["freeCashflow"] > 0:
            cash_bit = "free cash flow about " + compact_money(facts["freeCashflow"])
            if facts.get("source") == "Nasdaq":
                cash_bit += " (operating cash flow minus capital spending)"
            business.append(cash_bit)
        else:
            business.append("free cash flow negative")
    if facts.get("debtToEquity") is not None:
        if facts.get("source") == "Nasdaq":
            business.append("debt-to-equity " + format(facts["debtToEquity"], ".2f") + " (total debt divided by equity)")
        else:
            business.append("debt-to-equity " + format(facts["debtToEquity"], ".0f") + " on Yahoo's scale")
    if facts.get("forwardPE") is not None and facts.get("trailingPE") is not None:
        business.append(
            "forward P/E "
            + format(facts["forwardPE"], ".1f")
            + " and trailing P/E "
            + format(facts["trailingPE"], ".1f")
        )
    elif facts.get("forwardPE") is not None:
        business.append("forward P/E " + format(facts["forwardPE"], ".1f"))
    if facts.get("recommendationMean") is not None:
        business.append(
            "mean analyst recommendation "
            + format(facts["recommendationMean"], ".2f")
            + " on Yahoo's scale (1 strong buy, 5 sell)"
        )
    elif facts.get("recommendationLabel"):
        counts = []
        for key, word in (("ratingsBuy", "buy"), ("ratingsHold", "hold"), ("ratingsSell", "sell")):
            if facts.get(key) is not None:
                counts.append(str(int(facts[key])) + " " + word)
        suffix = " (" + ", ".join(counts) + ")" if counts else ""
        business.append("analyst consensus " + facts["recommendationLabel"] + suffix)
    if facts.get("targetMeanPrice") is not None:
        business.append("mean target " + money(facts["targetMeanPrice"]))
    if business:
        business_sentence = ", ".join(business) + "."
        if not business_sentence.startswith(vendor):
            business_sentence = "On the " + vendor + " sheet: " + business_sentence
    else:
        business_sentence = "Neither Yahoo nor Nasdaq returned a fundamentals sheet on this pass, so this note stays with the price data."
    if facts.get("earningsSoon"):
        business_sentence = join_bits([
            business_sentence,
            "Nasdaq's earnings calendar lists a report on " + str(facts["earningsSoon"])[:10] + ".",
        ])
    caution = ("Caution: " + "; ".join(flags) + ".") if flags else ""
    if row.get("swingEligible"):
        lead = row["name"] + " (" + row["symbol"] + ") passes the swing setup on this pass, not as a guarantee."
    else:
        lead = row["name"] + " (" + row["symbol"] + ") is on the oversold research list on this pass, not a swing setup and not a guarantee."
    why = join_bits([
        lead,
        tech,
        trend_sentence,
        level_sentence,
        business_sentence,
        caution,
    ])
    value_bits = []
    if margin is not None:
        value_bits.append("margin " + format(margin, ".0f") + "%")
    if growth is not None:
        value_bits.append("revenue " + format(growth, "+.0f") + "%")
    if facts.get("freeCashflow") is not None:
        value_bits.append("FCF " + ("positive" if facts["freeCashflow"] > 0 else "negative"))
    if facts.get("forwardPE") is not None:
        value_bits.append("fwd P/E " + format(facts["forwardPE"], ".0f"))
    if facts.get("sector"):
        value_bits.append(facts["sector"])
    setup_bits = ["RSI " + format(row["rsi"], ".1f")]
    if row["uptick"]:
        setup_bits.append("turning up")
    elif row["hammer"]:
        setup_bits.append("hammer")
    else:
        setup_bits.append("not turned up")
    if distance <= 1:
        setup_bits.append("lower band")
    setup_bits.append("above 200-day" if row["above200"] else "below 200-day")
    risk_bits = []
    if row["stop"] is not None:
        risk_bits.append("stop " + money(row["stop"]))
    if row["rewardRisk"] is not None and row["rewardRisk"] > 0:
        risk_bits.append(format(row["rewardRisk"], ".1f") + ":1")
    risk_bits.extend(flags[:2])
    if not risk_bits:
        risk_bits.append("No extra caution flag")
    row["why"] = why
    row["chips"] = {
        "value": " · ".join(value_bits) if value_bits else "Fundamentals sheet missing this pass",
        "setup": " · ".join(setup_bits),
        "risk": " · ".join(risk_bits),
    }
    row["qualityScore"] = quality_score(facts, row["price"])
    row["rankScore"] = row["swingScore"]
    if facts.get("sector"):
        row["sector"] = facts["sector"]
    if facts.get("industry"):
        row["industry"] = facts["industry"]
    return row


def fetch_bars(symbol, gate, opener, span="2y", min_bars=60, allow_etf=False):
    gate.wait()
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + urllib.parse.quote(symbol)
        + "?range=" + span + "&interval=1d&includePrePost=false"
    )
    payload = json.loads(read_url(opener, url, 30, attempts=4))
    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not isinstance(result, dict):
        raise RuntimeError("empty chart")
    meta = result.get("meta") or {}
    allowed = {None, "EQUITY", "ETF"} if allow_etf else {None, "EQUITY"}
    if meta.get("instrumentType") not in allowed:
        raise RuntimeError("not an equity")
    if meta.get("currency") not in (None, "USD"):
        raise RuntimeError("not USD")
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    bars = []
    for index, moment in enumerate(timestamps):
        try:
            opened = float(quote["open"][index])
            high = float(quote["high"][index])
            low = float(quote["low"][index])
            close = float(quote["close"][index])
            volume = float(quote["volume"][index])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if min(opened, high, low, close) <= 0 or volume < 0:
            continue
        bars.append({
            "time": int(moment),
            "open": opened,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        })
    if len(bars) < min_bars:
        raise RuntimeError("not enough bars")
    name = meta.get("shortName") or meta.get("longName") or symbol
    if not isinstance(name, str):
        name = symbol
    exchange = meta.get("exchangeName") if isinstance(meta.get("exchangeName"), str) else ""
    return bars, " ".join(name.split())[:64], exchange[:24]


def fetch_chart(symbol, gate, opener):
    bars, name, exchange = fetch_bars(symbol, gate, opener, "2y", int(swing_param("liquidity.minBars", 60)))
    return analyze(symbol, bars, name, exchange)


def scan_once(symbols, gap):
    gate = Gate(gap)
    local = threading.local()
    rows = []
    failures = []
    lock = threading.Lock()
    done = 0

    def opener_for():
        if not hasattr(local, "opener"):
            local.opener = urllib.request.build_opener()
        return local.opener

    def one(symbol):
        return fetch_chart(symbol, gate, opener_for())

    with ThreadPoolExecutor(max_workers=CHART_WORKERS) as pool:
        futures = {pool.submit(one, symbol): symbol for symbol in symbols}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                row = future.result()
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ZeroDivisionError, ValueError) as error:
                with lock:
                    failures.append(symbol + " (" + str(error).splitlines()[0][:80] + ")")
            else:
                with lock:
                    rows.append(row)
            with lock:
                done += 1
                if done % 50 == 0 or done == len(symbols):
                    print("Priced " + str(len(rows)) + " of " + str(done) + "/" + str(len(symbols)) + ".", flush=True)
    return rows, failures


def scan_charts(symbols):
    rows, failures = scan_once(symbols, CHART_GAP)
    missed = [item.split(" (", 1)[0] for item in failures]
    if missed:
        print("Retrying " + str(len(missed)) + " missed symbols more slowly.", flush=True)
        extra, failures = scan_once(missed, CHART_GAP * 2)
        rows.extend(extra)
    return rows, failures


def meaningful_facts(facts):
    if not facts:
        return False
    return any(facts.get(key) not in (None, "") for key in (
        "sector", "profitMargins", "revenueGrowth", "freeCashflow", "marketCap",
        "recommendationMean", "recommendationLabel", "targetMeanPrice", "forwardPE",
    ))


def attach_fundamentals(rows, session, gate):
    book = NasdaqBook()
    print("Loading the Nasdaq earnings calendar.", flush=True)
    book.load_earnings([row["symbol"] for row in rows])
    filled = 0
    for index, row in enumerate(rows):
        if index == 0 or (index + 1) % 8 == 0:
            print("Fundamentals " + str(index + 1) + "/" + str(len(rows)) + ".", flush=True)
        facts = {}
        if session is not None and not session.blocked:
            gate.wait()
            if index and index % 10 == 0:
                time.sleep(2)
            try:
                facts = session.quote_summary(row["symbol"])
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ValueError) as error:
                text = str(error).splitlines()[0]
                if getattr(error, "code", None) == 429 or "429" in text or "blocked" in text.lower() or "crumb" in text.lower():
                    session.blocked = True
                    print("Yahoo fundamentals are blocked (" + text[:100] + "). Using Nasdaq.", flush=True)
                else:
                    print("Yahoo fundamentals missed " + row["symbol"] + " (" + text[:80] + ").", flush=True)
                facts = {}
        if not facts:
            try:
                facts = book.facts(row["symbol"])
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ValueError) as error:
                print("Nasdaq fundamentals missed " + row["symbol"] + " (" + str(error).splitlines()[0][:80] + ").", flush=True)
                facts = {}
        elif not facts.get("earningsSoon"):
            soon = book.earnings.get(row["symbol"].upper()) or book.earnings.get(row["symbol"].upper().replace("-", "."))
            if soon:
                facts = dict(facts)
                facts["earningsSoon"] = soon
        if meaningful_facts(facts):
            filled += 1
        build_copy(row, facts)
    print("Fundamentals returned for " + str(filled) + " of " + str(len(rows)) + " candidates.", flush=True)


def fresh_enough(previous):
    if os.environ.get("STOCKS_FORCE") == "1":
        return False
    fetched = previous.get("fetchedAt") if isinstance(previous, dict) else ""
    if not isinstance(fetched, str):
        return False
    try:
        moment = datetime.strptime(fetched, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return (now_utc() - moment).total_seconds() < MAX_AGE_HOURS * 3600


def write_doc(rows, fetched_at, universe_count, priced, candidates, market=None):
    rows = sorted(
        rows,
        key=lambda row: (
            0 if row.get("swingEligible") else 1,
            -(row.get("swingScore") or 0),
            -(row.get("score") or 0),
            row["symbol"],
        ),
    )
    swing_count = sum(1 for row in rows if row.get("swingEligible"))
    document = {
        "about": ABOUT,
        "disclaimer": DISCLAIMER,
        "paramVersion": PARAMS.get("version") or "",
        "market": market or {},
        "source": (
            "Yahoo Finance public daily chart API (https://query1.finance.yahoo.com/v8/finance/chart). "
            "Fundamentals come from Yahoo quoteSummary (summaryProfile, summaryDetail, financialData, "
            "defaultKeyStatistics, calendarEvents) when the public crumb is available, otherwise from "
            "Nasdaq's public quote, financials, analyst target, ratings, and earnings calendar "
            "(https://api.nasdaq.com/)."
        ),
        "universeSource": "Nasdaq Trader symbol directories: " + NASDAQ_LISTED_URL + " ; " + OTHER_LISTED_URL + ".",
        "universe": "US common stocks on Nasdaq, NYSE, and NYSE American",
        "universeCount": universe_count,
        "priced": priced,
        "candidates": candidates,
        "researchCount": len(rows),
        "swingCandidates": swing_count,
        "fetchedAt": fetched_at,
        "count": len(rows),
        "stocks": rows,
    }
    text = json.dumps(document, indent=2) + "\n"
    if '"symbol": "RCL"' in text or "E*TRADE" in text or "Royal Caribbean" in text:
        raise RuntimeError("snapshot still mentions a removed name")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text, encoding="utf-8")


def self_test():
    closes = [float(index) for index in range(1, 40)]
    rsi = wilder_rsi(closes)
    assert rsi[-1] is not None and rsi[-1] > 70
    flat = wilder_rsi([10.0] * 30)
    assert abs(flat[-1] - 50) < 0.01
    bars = []
    for index in range(1, 40):
        price = float(index)
        bars.append({"open": price, "high": price + 1, "low": price - 1, "close": price, "volume": 100})
    assert wilder_atr(bars) and wilder_atr(bars) > 0
    assert normalize_symbol("BRK.B") == "BRK-B"
    assert normalize_symbol("rcl") == ""
    assert normalize_symbol("<td>AAPL</td>") == "AAPL"
    holdings = (
        "Ticker,Name,Asset Class,Exchange\n"
        "AAA,Alpha,Equity,NASDAQ\n"
        "RCL,Skip,Equity,NYSE\n"
        "BBB,Unlisted,Equity,NO MARKET (E.G. UNLISTED)\n"
        "MOG A,Moog,Equity,NYSE\n"
        "CASH,Cash,Money Market,-\n"
    )
    assert parse_russell_holdings(holdings) == ["AAA", "MOG-A"]
    sample_dir = parse_symbol_directory(
        "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n"
        "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\n"
        "QQQ|Invesco QQQ Trust|Q|N|N|100|Y|N\n"
        "ABCDW|Example Warrant|S|N|N|100|N|N\n",
        "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\n"
        "IBM|International Business Machines Common Stock|N|IBM|N|100|N|IBM\n"
        "RCL|Skip Common Stock|N|RCL|N|100|N|RCL\n"
        "BAC$E|Bank Preferred|N|BAC$E|N|100|N|BAC$E\n"
        "SPY|SPDR S&P 500 ETF|P|SPY|Y|100|N|SPY\n"
        "ATEX|Example Common Stock|A|ATEX|N|100|N|ATEX\n",
    )
    assert sample_dir["nasdaq"] == ["AAPL"]
    assert sample_dir["nyse"] == ["IBM"]
    assert sample_dir["amex"] == ["ATEX"]
    sample = analyze("TEST", [
        {"time": index, "open": 100 + (index % 3) * 0.2, "high": 101 + index * 0.01, "low": 99, "close": 100 - index * 0.05, "volume": 1000 + index}
        for index in range(80)
    ], "Test Co", "NMS")
    sample["price"] = sample["price"]
    build_copy(sample, {})
    assert "oversold research list" in sample["why"]
    assert "not a swing setup" in sample["why"]
    assert "not a guarantee" in sample["why"]
    assert "revenue" not in sample["why"].lower()
    assert "Fundamentals sheet missing" in sample["chips"]["value"]
    assert isinstance(sample["flags"], list)
    assert sample["swingEligible"] is False
    assert sample["rankScore"] == sample["swingScore"]
    if sample["planStyle"] == "limit":
        assert sample["entryHigh"] < sample["price"]
    elif sample["planStyle"] == "confirm":
        assert sample["entryHigh"] > sample["price"]
    else:
        assert sample["target"] is None
    rich = dict(sample)
    build_copy(rich, {
        "sector": "Technology",
        "industry": "Software",
        "marketCap": 2.5e11,
        "revenueGrowth": 0.12,
        "profitMargins": 0.22,
        "freeCashflow": 4e9,
        "forwardPE": 28.4,
        "recommendationMean": 1.9,
        "targetMeanPrice": rich["price"] * 1.12,
    })
    assert "Technology / Software" in rich["why"]
    assert "revenue growth +12%" in rich["why"]
    assert "forward P/E 28.4" in rich["why"]
    assert "sector average" not in rich["why"].lower()
    assert rich["rankScore"] == rich["swingScore"]
    assert rich["qualityScore"] is not None
    assert rich["qualityScore"] != rich["rankScore"] or rich["swingEligible"]
    assert "swingScore" in sample and isinstance(sample["swingSignals"], list)
    thin = []
    for index in range(260):
        price = 40.0 + index * 0.05
        thin.append({"open": price, "high": price + 0.4, "low": price - 0.4, "close": price, "volume": 1000})
    assert swing_bottom(thin)["eligible"] is False
    assert swing_bottom(thin)["score"] == 0
    bounce = []
    for index in range(260):
        if index < 200:
            price = 80.0 + index * 0.15
        elif index < 252:
            price = 110.0 - (index - 200) * 0.85
        else:
            price = 66.0 + (index - 252) * 0.55
        opened = price - 0.8 if index >= 252 else price + 0.4
        high = max(opened, price) + 0.35
        low = min(opened, price) - (1.8 if index == 259 else 0.45)
        volume = 900000 if index < 258 else 2200000
        bounce.append({"open": opened, "high": high, "low": low, "close": price, "volume": volume})
    turned = swing_bottom(bounce)
    assert turned["score"] >= 20
    assert len([label for label in turned["signals"] if label not in SWING_CONTEXT]) >= 1
    assert turned["score"] > swing_bottom(thin)["score"]
    below = dict(above200=False, rewardRisk=3, swingBase=50, swingSignals=["RSI turning up", "Lower BB bounce"], flags=[])
    finalize_swing(below)
    assert below["swingEligible"] is False
    earnings = dict(above200=True, rewardRisk=3, swingBase=60, swingSignals=["RSI turning up", "MACD cross"], flags=["Earnings within 7 days"])
    finalize_swing(earnings)
    assert earnings["swingEligible"] is False
    thin_rr = dict(above200=True, rewardRisk=1.2, swingBase=60, swingSignals=["RSI turning up", "Stoch cross"], flags=[])
    finalize_swing(thin_rr)
    assert thin_rr["swingEligible"] is False
    clear = dict(
        above200=True,
        sma200Rising=True,
        vsSma200=8.0,
        drop21=-6.0,
        avgDollarVolume=25_000_000,
        rewardRisk=2.4,
        swingBase=48,
        swingSignals=["RSI turning up", "Lower BB bounce", "Volume reversal", "Uptrend pullback"],
        flags=[],
        shock=False,
        planStyle="limit",
        price=50.0,
        entryHigh=47.5,
        entryLow=46.8,
        stop=44.0,
    )
    finalize_swing(clear)
    assert clear["swingEligible"] is True
    thin_dollar = dict(clear)
    thin_dollar["avgDollarVolume"] = 7_400_000
    finalize_swing(thin_dollar)
    assert thin_dollar["swingEligible"] is False
    crash = dict(clear)
    crash["shock"] = True
    crash["flags"] = ["Falling knife"]
    crash["above200"] = True
    crash["vsSma200"] = 3.6
    finalize_swing(crash)
    assert crash["swingEligible"] is False
    shallow = dict(clear)
    shallow["vsSma200"] = 3.6
    finalize_swing(shallow)
    assert shallow["swingEligible"] is False
    slide = dict(clear)
    slide["drop21"] = -27.6
    finalize_swing(slide)
    assert slide["swingEligible"] is False
    quiet = dict(clear)
    quiet["swingSignals"] = ["RSI turning up", "Lower BB bounce", "Uptrend pullback"]
    finalize_swing(quiet)
    assert quiet["swingEligible"] is False
    close_entry = dict(clear)
    close_entry["entryHigh"] = close_entry["price"]
    finalize_swing(close_entry)
    assert close_entry["swingEligible"] is False
    knife = []
    for index in range(260):
        price = 80.0 - index * 0.18
        knife.append({
            "open": price + 0.3,
            "high": price + 0.4,
            "low": price - 0.5,
            "close": price,
            "volume": 800000,
        })
    assert swing_bottom(knife)["score"] <= turned["score"]
    trend = []
    for index in range(240):
        price = 50.0 + index * 0.35
        trend.append({
            "time": index,
            "open": price,
            "high": price + 0.8,
            "low": price - 0.8,
            "close": price,
            "volume": 400000,
        })
    sma_before = sma_at([bar["close"] for bar in trend], len(trend) - 1, 200)
    prev_close = trend[-1]["close"]
    landed = sma_before * 1.04
    assert landed <= prev_close * 0.91
    trend.append({
        "time": 240,
        "open": landed,
        "high": landed + 0.4,
        "low": landed - 0.6,
        "close": landed,
        "volume": 2500000,
    })
    bounced = landed * 1.01
    trend.append({
        "time": 241,
        "open": landed + 0.1,
        "high": bounced + 0.3,
        "low": landed - 0.2,
        "close": bounced,
        "volume": 1800000,
    })
    crashed = analyze("KRT", trend, "Karat Packaging", "NMS")
    build_copy(crashed, {
        "sector": "Industrials",
        "industry": "Packaging",
        "marketCap": 2e9,
        "revenueGrowth": 0.18,
        "profitMargins": 0.12,
        "freeCashflow": 5e7,
        "source": "Yahoo",
    })
    assert crashed["shock"] is True
    assert crashed["above200"] is True
    assert "Falling knife" in crashed["flags"]
    assert crashed["swingEligible"] is False
    assert crashed["planStyle"] == "none"
    assert crashed["target"] is None
    assert crashed["stop"] is None
    assert crashed["rankScore"] == crashed["swingScore"]
    assert "research list" in crashed["why"]
    calm = []
    for index in range(230):
        price = 70.0 + index * 0.08
        calm.append({
            "time": index,
            "open": price + 0.2,
            "high": price + 0.6,
            "low": price - 0.5,
            "close": price,
            "volume": 500000,
        })
    for index in range(6):
        price = calm[-1]["close"] - 0.45
        calm.append({
            "time": 230 + index,
            "open": price + 0.3,
            "high": price + 0.45,
            "low": price - 0.35,
            "close": price,
            "volume": 500000,
        })
    planned = analyze("SU", calm, "Suncor Energy", "NYSE")
    assert planned["shock"] is False
    assert planned["planStyle"] in ("limit", "confirm")
    assert planned["entryHigh"] != planned["price"]
    if planned["planStyle"] == "limit":
        assert planned["entryHigh"] < planned["price"]
    else:
        assert planned["entryHigh"] > planned["price"]
    bull = {"symbol": "SPY", "vsSma50": 1.2, "vsSma200": 4.0}
    bear = {"symbol": "SPY", "vsSma50": -2.0, "vsSma200": -1.5}
    book = [
        {"symbol": "PAYS", "swingEligible": False, "swingScore": 4, "rankScore": 90, "sector": "Financials"},
        {"symbol": "SU", "swingEligible": True, "swingScore": 52, "sector": "Energy", "industry": "Oil"},
        {"symbol": "CNQ", "swingEligible": True, "swingScore": 50, "sector": "Energy", "industry": "Oil"},
        {"symbol": "AAA", "swingEligible": True, "swingScore": 47, "sector": "Health", "industry": "Biotech"},
    ]
    picked = [row["symbol"] for row in official_picks(book, bull)]
    assert picked == ["SU", "AAA"]
    assert official_picks(book, bear) == []
    assert regime_slots(bear) == 0
    signal = int(datetime(2026, 11, 10, 16, 0, tzinfo=EASTERN).timestamp())
    sessions = [
        datetime(2026, 11, 11, 16, 0, tzinfo=EASTERN),
        datetime(2026, 11, 12, 16, 0, tzinfo=EASTERN),
        datetime(2026, 11, 13, 16, 0, tzinfo=EASTERN),
    ]
    pays_bars = [{
        "time": signal,
        "open": 12.0,
        "high": 13.5,
        "low": 9.4,
        "close": 10.0,
        "volume": 1000000,
    }]
    pays_bars.append({
        "time": int(sessions[0].timestamp()),
        "open": 10.4,
        "high": 10.8,
        "low": 9.7,
        "close": 10.2,
        "volume": 800000,
    })
    pays_bars.append({
        "time": int(sessions[1].timestamp()),
        "open": 10.2,
        "high": 11.0,
        "low": 10.0,
        "close": 10.6,
        "volume": 700000,
    })
    pays = {
        "status": "open",
        "symbol": "PAYS",
        "pickedOn": "2026-11-10",
        "filledOn": "2026-11-10",
        "priceAtPick": 10.0,
        "entryLow": 9.5,
        "entryHigh": 10.0,
        "stop": 8.0,
        "target": 14.0,
        "entryStyle": "limit",
        "mfePct": 26.6,
        "maePct": -5.0,
    }
    evaluated = evaluate_picks({"PAYS": pays_bars}, {"picks": [pays]}, save=False)
    filled = evaluated["picks"][0]
    assert filled["filledOn"] == "2026-11-11"
    assert filled["fillPrice"] == 10.0
    assert filled["status"] == "open"
    assert filled["mfePct"] is not None and filled["mfePct"] < 15
    assert filled["mfePct"] > 0
    stalled = []
    hold_days = [
        "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16",
        "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
    ]
    for day in hold_days:
        stalled.append({
            "time": int(datetime.fromisoformat(day + "T16:00:00").replace(tzinfo=EASTERN).timestamp()),
            "open": 10.2,
            "high": 10.5,
            "low": 9.9,
            "close": 10.1,
            "volume": 500000,
        })
    expired = evaluate_picks(
        {"WAIT": stalled},
        {"picks": [{
            "status": "open",
            "symbol": "WAIT",
            "pickedOn": "2026-11-10",
            "priceAtPick": 10.0,
            "entryLow": 9.5,
            "entryHigh": 10.0,
            "stop": 8.0,
            "target": 14.0,
            "entryStyle": "limit",
        }]},
        save=False,
    )
    closed = expired["picks"][0]
    assert closed["outcome"] == "time stop"
    assert closed["status"] == "closed"
    assert closed["filledOn"] == "2026-11-11"
    assert closed["returnPct"] is not None


def patch_swing_scores():
    previous = load_json(OUT_PATH)
    stocks = previous.get("stocks") if isinstance(previous, dict) else None
    if not isinstance(stocks, list) or not stocks:
        raise RuntimeError("no screener rows to score")
    symbols = [row["symbol"] for row in stocks if isinstance(row, dict) and row.get("symbol")]
    print("Scoring swing bottoms for " + str(len(symbols)) + " published names.", flush=True)
    rows, failures = scan_charts(symbols)
    by_symbol = {row["symbol"]: row for row in rows}
    for row in stocks:
        fresh = by_symbol.get(row.get("symbol"))
        if not fresh:
            row["swingScore"] = 0
            row["swingSignals"] = []
            row["swingEligible"] = False
            continue
        for key in (
            "price", "dayChange", "rsi", "zone", "bbLower", "bbMid", "bbUpper", "bbDistancePct",
            "sma20", "sma50", "sma200", "vsSma20", "vsSma50", "vsSma200", "above200",
            "drop5", "drop21", "range52", "high52", "low52", "volumeRatio", "hammer", "uptick",
            "atr", "entryLow", "entryHigh", "stop", "target", "targetLabel", "target2", "rewardRisk",
            "series", "swingBase", "swingScore", "swingSignals", "swingEligible",
            "shock", "shockPct", "planStyle", "planNote", "sma200Rising",
        ):
            if key in fresh:
                row[key] = fresh[key]
        finalize_swing(row)
        row["rankScore"] = row.get("swingScore")
        why = row.get("why") or ""
        if why and fresh.get("rsi") is not None:
            row["why"] = re.sub(r"RSI\(14\) is [0-9.]+", "RSI(14) is " + format(fresh["rsi"], ".1f"), why, count=1)
    write_doc(
        stocks,
        stamp(now_utc()),
        previous.get("universeCount") or 0,
        previous.get("priced") or 0,
        previous.get("candidates") or 0,
        previous.get("market") if isinstance(previous.get("market"), dict) else None,
    )
    ranked = sorted(
        [row for row in stocks if row.get("swingEligible")],
        key=lambda row: (-row.get("swingScore", 0), row["symbol"]),
    )
    if ranked:
        top = ranked[0]
        print(
            "Top swing " + top["symbol"] + " " + str(top.get("swingScore"))
            + " " + ", ".join(top.get("swingSignals") or [])
        )
    else:
        print("No eligible swing bottom in the published list.")
    if failures:
        print("Missed " + str(len(failures)) + ": " + ", ".join(failures[:12]))


EASTERN = ZoneInfo("America/New_York")


def eastern_now():
    return datetime.now(EASTERN)


def trading_date(moment):
    return datetime.fromtimestamp(moment, EASTERN).date().isoformat()


def regime_slots(market):
    """How many official picks this session may log.

    SPY under its 200-day logs none. SPY under its 50-day, or an unknown
    regime, logs a shorter list. A bullish regime can use the full list.
    """
    size = int(swing_param("picks.listSize", 5))
    cautious = int(swing_param("picks.cautiousListSize", 2))
    if not isinstance(market, dict) or not isinstance(market.get("vsSma200"), (int, float)):
        return min(cautious, size)
    if market["vsSma200"] < 0:
        return 0
    vs50 = market.get("vsSma50")
    if isinstance(vs50, (int, float)) and vs50 < 0:
        return min(cautious, size)
    return size


def regime_label(market):
    if not isinstance(market, dict) or not isinstance(market.get("vsSma200"), (int, float)):
        return "unknown"
    if market["vsSma200"] < 0:
        return "below 200-day"
    if isinstance(market.get("vsSma50"), (int, float)) and market["vsSma50"] < 0:
        return "below 50-day"
    return "above 50-day and 200-day"


def concentration_keys(row):
    sector = (row.get("sector") or "").strip() or "Unknown"
    industry = (row.get("industry") or "").strip()
    keys = ["sector:" + sector]
    if industry:
        keys.append("industry:" + industry)
    return keys


def official_picks(rows, market=None):
    """Actionable names only, ranked by swing score, one name per sector.

    Ineligible rows are not used to fill empty slots, even when their
    fundamental rank is higher.
    """
    limit = regime_slots(market)
    if limit <= 0:
        return []
    cap = max(1, int(swing_param("picks.sectorCap", 1)))
    eligible = [row for row in rows if row.get("swingEligible")]
    eligible.sort(key=lambda row: (-(row.get("swingScore") or 0), row.get("symbol") or ""))
    chosen = []
    counts = {}
    for row in eligible:
        keys = concentration_keys(row)
        if any(counts.get(key, 0) >= cap for key in keys):
            continue
        for key in keys:
            counts[key] = counts.get(key, 0) + 1
        chosen.append(row)
        if len(chosen) >= limit:
            break
    return chosen


def page_top(rows, market=None):
    return official_picks(rows, market)


def load_picks():
    document = load_json(PICKS_PATH)
    picks = document.get("picks") if isinstance(document, dict) else None
    if not isinstance(picks, list):
        picks = []
    return {"picks": picks}


def save_picks(document):
    PICKS_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def record_picks(rows, market=None, picked_on=None):
    """Append official setups. Names that failed the gates are not backfilled.

    A ticker that already has an open pick is not opened again. The rank stored
    on the pick is the swing score, not a fundamentals blend.
    """
    document = load_picks()
    open_symbols = {pick.get("symbol") for pick in document["picks"] if pick.get("status") == "open"}
    today = picked_on or eastern_now().date().isoformat()
    context = dict(market or {})
    context["regime"] = regime_label(market)
    context["officialSlots"] = regime_slots(market)
    added = 0
    for rank, row in enumerate(official_picks(rows, market), start=1):
        symbol = row.get("symbol")
        if not symbol or symbol in open_symbols or symbol in EXCLUDE or not row.get("swingEligible"):
            continue
        signals = list(row.get("swingSignals") or [])
        confirming = [label for label in signals if label not in SWING_CONTEXT]
        document["picks"].append({
            "id": today + "-" + symbol,
            "pickedOn": today,
            "paramVersion": PARAMS.get("version") or "unversioned",
            "rank": rank,
            "symbol": symbol,
            "name": row.get("name") or symbol,
            "priceAtPick": row.get("price"),
            "entryLow": row.get("entryLow"),
            "entryHigh": row.get("entryHigh"),
            "entryStyle": row.get("planStyle") or "limit",
            "stop": row.get("stop"),
            "target": row.get("target"),
            "rewardRisk": row.get("rewardRisk"),
            "score": row.get("swingScore"),
            "swingScore": row.get("swingScore"),
            "swingEligible": True,
            "signals": signals,
            "gates": {
                "above200": bool(row.get("above200")),
                "cushionPct": row.get("vsSma200"),
                "sma200Rising": row.get("sma200Rising") is True,
                "confirming": confirming,
                "volume": "Volume reversal" in signals,
                "adjustedScore": row.get("swingScore"),
                "rewardRisk": row.get("rewardRisk"),
                "earningsClear": earnings_flag_label() not in (row.get("flags") or []),
                "shock": bool(row.get("shock")),
                "avgDollarVolume": row.get("avgDollarVolume"),
                "drop21": row.get("drop21"),
                "entryStyle": row.get("planStyle") or "",
            },
            "sector": row.get("sector") or "",
            "industry": row.get("industry") or "",
            "market": context,
            "status": "open",
            "outcome": None,
            "filledOn": None,
            "fillPrice": None,
            "closedOn": None,
            "daysHeld": None,
            "returnPct": None,
            "mfePct": None,
            "maePct": None,
            "lastPrice": row.get("price"),
            "evaluatedAt": stamp(now_utc()),
        })
        open_symbols.add(symbol)
        added += 1
    save_picks(document)
    print(
        "Recorded " + str(added) + " official picks (" + context["regime"] + "). Open book " + str(len(open_symbols)) + ".",
        flush=True,
    )
    return document


def session_day(bar):
    return trading_date(bar["time"])


def planned_fill(bar, entry_low, entry_high, style):
    """Fill price on a bar after the signal. None when the plan is not touched."""
    if style == "confirm":
        if bar["high"] < entry_high:
            return None
        if bar["open"] >= entry_high:
            return bar["open"]
        return entry_high
    if bar["high"] < entry_low or bar["low"] > entry_high:
        return None
    if bar["open"] <= entry_high:
        return bar["open"]
    return entry_high


def bar_exit(bar, stop, target, from_above):
    """Stop first when both could fill. A limit-from-above bar does not use its high."""
    if from_above:
        hit_stop = bar["low"] <= stop
        hit_target = bar["close"] >= target
    else:
        hit_stop = bar["low"] <= stop
        hit_target = bar["high"] >= target
    if hit_stop:
        exit_price = bar["open"] if bar["open"] <= stop else stop
        return "stopped out", exit_price
    if hit_target:
        exit_price = bar["open"] if bar["open"] >= target else target
        return "target hit", exit_price
    return None, None


def apply_excursion(favorable, adverse, fill_price, bar, from_above):
    if from_above:
        favorable = max(favorable, fill_price, bar["close"])
        adverse = min(adverse, fill_price, bar["low"])
    else:
        favorable = max(favorable, fill_price, bar["high"])
        adverse = min(adverse, fill_price, bar["low"])
    return favorable, adverse


def clear_same_bar_fill(pick):
    """Drop a fill that was recorded on the signal day. Closed picks stay as written."""
    filled = pick.get("filledOn")
    picked = pick.get("pickedOn")
    if pick.get("status") != "open" or not filled or not picked or filled > picked:
        return False
    pick["filledOn"] = None
    pick["fillPrice"] = None
    pick["mfePct"] = None
    pick["maePct"] = None
    pick["daysHeld"] = None
    pick["returnPct"] = None
    pick["outcome"] = None
    pick["closedOn"] = None
    return True


def evaluate_picks(bars_by_symbol, document=None, save=True):
    """Mark next-session fills. Excursions start at the fill, not the signal bar.

    Rule 9 closes a trade that is still open after 8 trading days (inside the
    published 5–10 day window). Closed history is left untouched.
    """
    if document is None:
        document = load_picks()
    fill_window = int(swing_param("picks.fillWindowTradingDays", 5))
    time_stop = int(swing_param("picks.timeStopTradingDays", 8))
    changed = 0
    for pick in document["picks"]:
        if pick.get("status") != "open":
            continue
        cleared = clear_same_bar_fill(pick)
        bars = bars_by_symbol.get(pick.get("symbol")) or []
        if not bars or not isinstance(pick.get("priceAtPick"), (int, float)):
            if cleared:
                changed += 1
            continue
        after = [bar for bar in bars if session_day(bar) > (pick.get("pickedOn") or "")]
        if not after:
            if cleared:
                pick["evaluatedAt"] = stamp(now_utc())
                changed += 1
            continue
        entry_low = pick.get("entryLow")
        entry_high = pick.get("entryHigh")
        stop = pick.get("stop")
        target = pick.get("target")
        if not all(isinstance(value, (int, float)) for value in (entry_low, entry_high, stop, target)):
            if cleared:
                changed += 1
            continue
        style = pick.get("entryStyle") or "limit"
        filled_index = None
        fill_price = None
        from_above = False
        for index, bar in enumerate(after[:fill_window]):
            price = planned_fill(bar, entry_low, entry_high, style)
            if price is None:
                continue
            filled_index = index
            fill_price = price
            from_above = style != "confirm" and bar["open"] > entry_high
            break
        pick["lastPrice"] = round(after[-1]["close"], 2)
        pick["evaluatedAt"] = stamp(now_utc())
        if filled_index is None:
            if len(after) >= fill_window:
                pick["status"] = "closed"
                pick["outcome"] = "never filled"
                pick["closedOn"] = session_day(after[min(fill_window, len(after)) - 1])
                pick["daysHeld"] = 0
                pick["returnPct"] = None
                pick["filledOn"] = None
                pick["fillPrice"] = None
                pick["mfePct"] = None
                pick["maePct"] = None
                changed += 1
            elif cleared:
                changed += 1
            continue
        held = after[filled_index:filled_index + time_stop]
        pick["filledOn"] = session_day(after[filled_index])
        pick["fillPrice"] = round(fill_price, 2)
        favorable = fill_price
        adverse = fill_price
        outcome = None
        exit_price = None
        exit_day = None
        for offset, bar in enumerate(held):
            if offset == 0:
                favorable, adverse = apply_excursion(favorable, adverse, fill_price, bar, from_above)
                outcome, exit_price = bar_exit(bar, stop, target, from_above)
            else:
                favorable = max(favorable, bar["high"])
                adverse = min(adverse, bar["low"])
                outcome, exit_price = bar_exit(bar, stop, target, False)
            if not outcome and offset + 1 >= time_stop:
                outcome = "time stop"
                exit_price = bar["close"]
            if outcome:
                exit_day = session_day(bar)
                pick["daysHeld"] = offset + 1
                break
        pick["mfePct"] = round((favorable - fill_price) / fill_price * 100, 2) if fill_price else None
        pick["maePct"] = round((adverse - fill_price) / fill_price * 100, 2) if fill_price else None
        if outcome:
            pick["status"] = "closed"
            pick["outcome"] = outcome
            pick["closedOn"] = exit_day
            pick["returnPct"] = round((exit_price - fill_price) / fill_price * 100, 2) if fill_price else None
            changed += 1
        else:
            pick["status"] = "open"
            pick["outcome"] = None
            pick["returnPct"] = None
            pick["daysHeld"] = len(held)
            if cleared:
                changed += 1
    if save:
        save_picks(document)
    print("Updated " + str(changed) + " pick outcomes.", flush=True)
    return document


def pull_bars(symbols, span, min_bars, allow_etf=False):
    gate = Gate(CHART_GAP)
    local = threading.local()
    found = {}
    failures = []
    lock = threading.Lock()

    def opener_for():
        if not hasattr(local, "opener"):
            local.opener = urllib.request.build_opener()
        return local.opener

    def one(symbol):
        bars, _name, _exchange = fetch_bars(symbol, gate, opener_for(), span, min_bars, allow_etf=allow_etf)
        return bars

    with ThreadPoolExecutor(max_workers=CHART_WORKERS) as pool:
        futures = {pool.submit(one, symbol): symbol for symbol in symbols}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                bars = future.result()
            except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ZeroDivisionError, ValueError) as error:
                with lock:
                    failures.append(symbol + " (" + str(error).splitlines()[0][:80] + ")")
            else:
                with lock:
                    found[symbol] = bars
    return found, failures


def spy_context():
    try:
        found, _failures = pull_bars(["SPY"], "2y", 200, allow_etf=True)
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError):
        return {}
    bars = found.get("SPY") or []
    if len(bars) < 200:
        return {}
    closes = [bar["close"] for bar in bars]
    last = len(closes) - 1
    sma50 = sma_at(closes, last, 50)
    sma200 = sma_at(closes, last, 200)
    price = closes[last]
    return {
        "symbol": "SPY",
        "price": round(price, 2),
        "vsSma50": round((price / sma50 - 1.0) * 100, 2) if sma50 else None,
        "vsSma200": round((price / sma200 - 1.0) * 100, 2) if sma200 else None,
    }


def in_market_hours(moment):
    if moment.weekday() >= 5:
        return False
    minutes = moment.hour * 60 + moment.minute
    return (9 * 60 + 30) <= minutes <= (16 * 60 + 5)


def after_close_due():
    moment = eastern_now()
    if moment.weekday() >= 5:
        return False
    if moment.hour * 60 + moment.minute < 16 * 60 + 15:
        return False
    previous = load_json(OUT_PATH)
    fetched = previous.get("fetchedAt") if isinstance(previous, dict) else ""
    try:
        scanned = datetime.strptime(fetched, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(EASTERN)
    except (TypeError, ValueError):
        return True
    return not (scanned.date() == moment.date() and scanned.hour * 60 + scanned.minute >= 16 * 60 + 15)


def refresh_published_quotes():
    if os.environ.get("STOCKS_FORCE") != "1" and not in_market_hours(eastern_now()):
        print("Outside New York market hours. Skipping the quote refresh.")
        return
    previous = load_json(OUT_PATH)
    stocks = previous.get("stocks") if isinstance(previous, dict) else None
    if not isinstance(stocks, list) or not stocks:
        print("No published snapshot to refresh.")
        return
    history = load_picks()
    open_symbols = [pick.get("symbol") for pick in history["picks"] if pick.get("status") == "open" and pick.get("symbol")]
    published = [row.get("symbol") for row in stocks if row.get("symbol")]
    light = [symbol for symbol in published if symbol not in open_symbols]
    print("Refreshing " + str(len(light)) + " quotes and " + str(len(open_symbols)) + " open picks.", flush=True)
    light_bars, light_failures = pull_bars(light, "5d", 2) if light else ({}, [])
    open_bars, open_failures = pull_bars(open_symbols, "6mo", 5) if open_symbols else ({}, [])
    updated = 0
    by_symbol = {row.get("symbol"): row for row in stocks}
    for symbol, bars in light_bars.items():
        row = by_symbol.get(symbol)
        if not row or len(bars) < 2:
            continue
        last = bars[-1]["close"]
        prior = bars[-2]["close"]
        if prior <= 0 or last <= 0:
            continue
        row["price"] = round(last, 2)
        row["dayChange"] = round((last / prior - 1.0) * 100, 2)
        updated += 1
    for symbol, bars in open_bars.items():
        row = by_symbol.get(symbol)
        if not row or len(bars) < 2:
            continue
        last = bars[-1]["close"]
        prior = bars[-2]["close"]
        if prior <= 0 or last <= 0:
            continue
        row["price"] = round(last, 2)
        row["dayChange"] = round((last / prior - 1.0) * 100, 2)
        updated += 1
    needed = len(published)
    if needed and updated < max(1, math.ceil(needed * MIN_PRICED_RATIO)):
        print("Only " + str(updated) + " of " + str(needed) + " quotes refreshed. Keeping the previous snapshot.")
    else:
        write_doc(
            stocks,
            stamp(now_utc()),
            previous.get("universeCount") or 0,
            previous.get("priced") or 0,
            previous.get("candidates") or 0,
            previous.get("market") if isinstance(previous.get("market"), dict) else None,
        )
        print("Updated " + str(updated) + " prices.", flush=True)
    if open_bars:
        evaluate_picks(open_bars)
    if light_failures or open_failures:
        missed = (light_failures + open_failures)[:12]
        print("Missed " + str(len(light_failures) + len(open_failures)) + ": " + ", ".join(missed))


def main():
    self_test()
    if os.environ.get("STOCKS_QUOTES") == "1":
        refresh_published_quotes()
        return
    if os.environ.get("STOCKS_SWING_ONLY") == "1":
        patch_swing_scores()
        return
    if os.environ.get("STOCKS_UNIVERSE_ONLY") == "1":
        os.environ["STOCKS_REFRESH_UNIVERSE"] = "1"
        symbols = load_universe()
        print("Universe only: " + str(len(symbols)) + " symbols. RCL excluded: " + str("RCL" not in symbols) + ".")
        return
    if os.environ.get("STOCKS_AFTER_CLOSE") == "1" and os.environ.get("STOCKS_FORCE") != "1" and not after_close_due():
        print("After-close scan is not due in New York. Skipping.")
        return
    previous = load_json(OUT_PATH)
    if fresh_enough(previous):
        print("Oversold snapshot is still fresh (" + str(previous.get("fetchedAt")) + ").")
        return
    symbols = load_universe()
    minimum = max(40, math.ceil(len(symbols) * MIN_PRICED_RATIO))
    try:
        rows, failures = scan_charts(symbols)
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
        print("Stock fetch failed (" + str(error) + "). Keeping the previous snapshot.")
        return
    if len(rows) < minimum:
        print("Only " + str(len(rows)) + " of " + str(len(symbols)) + " priced (need " + str(minimum) + "). Keeping the previous snapshot.")
        if failures:
            print("Missed: " + ", ".join(failures[:12]))
        return
    priced_count = len(rows)
    min_price = float(swing_param("universeFilter.minPrice", 3))
    min_dollar = float(swing_param("universeFilter.minDollarVolume", 2000000))
    liquid = [
        row for row in rows
        if (row.get("price") or 0) >= min_price and (row.get("avgDollarVolume") or 0) >= min_dollar
    ]
    print(
        "Priced " + str(len(rows)) + "; " + str(len(liquid)) + " left after the $"
        + format(min_price, ".0f") + " and $" + format(min_dollar / 1000000, ".0f") + "M dollar-volume filter.",
        flush=True,
    )
    if len(liquid) < 80:
        print("Too few liquid names. Keeping the previous snapshot.")
        return
    rows = liquid
    strict = [row for row in rows if is_candidate(row, loose=False)]
    chosen = strict if len(strict) >= 24 else [row for row in rows if is_candidate(row, loose=True)]
    chosen.sort(key=lambda row: (-row["score"], row["rsi"], row["symbol"]))
    provisional = [row for row in chosen if row.get("swingEligible")]
    provisional.sort(key=lambda row: (-(row.get("swingScore") or 0), row["symbol"]))
    provisional = provisional[:120]
    provisional_ids = {id(row) for row in provisional}
    rest = [row for row in chosen if id(row) not in provisional_ids]
    shortlist = provisional + rest[:max(0, FUND_CAP - len(provisional))]
    print(
        "Research list " + str(len(chosen))
        + " (" + str(len(provisional)) + " passed swing gates before the earnings check); fundamentals for "
        + str(len(shortlist)) + ".",
        flush=True,
    )
    print("Cooling down before the fundamentals sheet.", flush=True)
    time.sleep(25)
    session = YahooSession()
    try:
        session.ensure_crumb()
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
        session.blocked = True
        print("Yahoo crumb unavailable (" + str(error).splitlines()[0][:140] + "). Fundamentals will use the Nasdaq sheet.", flush=True)
    try:
        attach_fundamentals(shortlist, session, Gate(FUND_GAP))
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
        print("Fundamentals handshake failed (" + str(error).splitlines()[0][:140] + "). Publishing the technical note only.")
        for row in shortlist:
            if "why" not in row:
                build_copy(row, {})
    technical = chosen[:PUBLISH_CAP]
    eligible_now = [row for row in chosen if row.get("swingEligible")]
    for row in technical:
        if "why" not in row:
            build_copy(row, {})
    for row in eligible_now:
        if "why" not in row:
            build_copy(row, {})
    eligible_ids = {id(row) for row in eligible_now}
    published = eligible_now + [row for row in technical if id(row) not in eligible_ids]
    published = published[:PUBLISH_CAP]
    if len(published) < 8:
        print("Only " + str(len(published)) + " research names. Keeping the previous snapshot.")
        return
    market = spy_context()
    write_doc(published, stamp(now_utc()), len(symbols), priced_count, len(chosen), market)
    record_picks(published, market)
    swing_count = sum(1 for row in published if row.get("swingEligible"))
    print(
        "Saved "
        + str(len(published))
        + " research names ("
        + str(swing_count)
        + " swing candidates) from "
        + str(len(rows))
        + " priced / "
        + str(len(symbols))
        + " universe."
    )
    if failures:
        print("Missed " + str(len(failures)) + ": " + ", ".join(failures[:12]))


if __name__ == "__main__":
    main()
