#!/usr/bin/env python3
"""Build stocks/oversold.json from a maintained index universe and Yahoo Finance.

The universe is the S&P 500, the Nasdaq-100, and the S&P MidCap 400, taken from
the public Wikipedia constituent tables and written to scripts/universe.json.
RCL is left out on purpose. Daily bars come from Yahoo's public chart endpoint.
Fundamentals, for names that pass the swing screen, come from Yahoo quoteSummary
(summaryProfile, summaryDetail, financialData, defaultKeyStatistics,
calendarEvents) after the public crumb handshake. No key.

A failed run, or a run that prices less than 65% of the universe, leaves the
previous snapshot in place. Set STOCKS_FORCE=1 to refresh even when the
snapshot is under 24 minutes old. Set STOCKS_REFRESH_UNIVERSE=1 to rebuild the
constituent list. Set STOCKS_UNIVERSE_ONLY=1 to refresh that list and stop.
"""

from __future__ import annotations

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
from http.cookiejar import CookieJar
from pathlib import Path

socket.setdefaulttimeout(20)
ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "stocks" / "oversold.json"
UNIVERSE_PATH = ROOT / "scripts" / "universe.json"

SP_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NDX_URL = "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies"
MID_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies"
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=2y&interval=1d&includePrePost=false"
CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
COOKIE_URL = "https://fc.yahoo.com"
SUMMARY = (
    "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
    "?modules=summaryProfile,summaryDetail,financialData,defaultKeyStatistics,calendarEvents&crumb={crumb}"
)

UA = "MondosupremeStocks/1.0 (+https://mondosupreme.com/stocks/)"
WIKI_UA = "MondosupremeStocks/1.0 (universe refresh; +https://mondosupreme.com/stocks/)"
EXCLUDE = {"RCL"}
TICKER_RE = re.compile(r"^[A-Z]{1,5}(?:-[A-Z])?$")
MAX_AGE_HOURS = 0.4
MIN_PRICED_RATIO = 0.65
UNIVERSE_MAX_AGE_DAYS = 7
SERIES = 30
PUBLISH_CAP = 48
FUND_CAP = 80
CHART_WORKERS = 5
CHART_GAP = 0.22
FUND_GAP = 0.55

ABOUT = (
    "Swing screen of S&P 500, Nasdaq-100, and S&P MidCap 400 stocks. A name is published when "
    "the daily chart shows an oversold RSI, a lower Bollinger touch or re-entry, or a pullback "
    "while price is still above the 200-day average. RSI is Wilder's 14-day RSI. Bollinger Bands "
    "are the 20-day average plus and minus two population standard deviations. ATR is Wilder's "
    "14-day average true range. The stop sketch is 1.5 times ATR under the last close. Targets are "
    "the 20-day average or the mid band, then the upper band, when those levels sit above the last "
    "close. Swing bottom score is a separate 0-100 read of a turn off the lows: RSI turning up "
    "or diverging, a stochastic cross from below 20, MACD turning up under zero, a lower "
    "Bollinger bounce, distance to the 52-week low, a 10- or 20-day average reclaim, volume "
    "on the reversal, and a hammer or bullish engulfing. A pullback still above a rising "
    "200-day average scores higher than a falling knife. Names under $5, or with thin share "
    "and dollar volume, score 0. The rank mixes the older setup score with fundamentals. "
    "Yahoo quoteSummary is tried first. If that "
    "crumb is blocked, Nasdaq's public quote, annual financials, analyst target, and earnings "
    "calendar are used instead: sector, industry, market cap, revenue growth, profit margin, free "
    "cash flow, debt-to-equity, forward P/E when Yahoo returns it, and the analyst target or "
    "consensus. Every sentence uses a fetched "
    "number. This is why a name screens as a swing candidate, not a guarantee and not financial "
    "advice. fetchedAt is when this file was last filled. A failed fetch keeps the previous rows."
)
DISCLAIMER = (
    "Informational only, not financial advice and not a recommendation to buy or sell. "
    "A stock is listed because it matched a rules-based swing screen."
)


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
    A close under a falling 200-day average loses 12. The total is capped at 100.
    """
    empty = {"score": 0.0, "signals": [], "eligible": False}
    closes = [bar["close"] for bar in bars]
    last = len(closes) - 1
    if last < 60:
        return empty
    avg_volume = mean([bar["volume"] for bar in bars[last - 20:last]])
    price = closes[last]
    liquid = price >= 5 and avg_volume > 0 and (avg_volume >= 250000 or price * avg_volume >= 5000000)
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

    recent = [rsi[index] for index in range(last - 7, last) if rsi[index] is not None]
    if recent and min(recent) <= 35 and rsi[last] > rsi[last - 1] and rsi[last] < 55:
        add("RSI turning up", 16)
    if rsi_divergence(closes, rsi, last):
        add("RSI divergence", 10)
    k_line, d_line = stochastic_kd(bars)
    if None not in (k_line[last], d_line[last], k_line[last - 1], d_line[last - 1]):
        crossed = k_line[last - 1] <= d_line[last - 1] and k_line[last] > d_line[last]
        was_low = min(k_line[last - 1], d_line[last - 1], k_line[last]) < 20
        if crossed and was_low:
            add("Stoch cross", 12)
    line, signal, hist = macd_parts(closes)
    if None not in (line[last], signal[last], line[last - 1], signal[last - 1]):
        if line[last - 1] <= signal[last - 1] and line[last] > signal[last] and line[last] < 0:
            add("MACD cross", 14)
        elif None not in (hist[last], hist[last - 1], hist[last - 2]) and hist[last - 1] < 0 and hist[last] > hist[last - 1] and hist[last - 1] >= hist[last - 2]:
            add("MACD rising", 8)
    touched = False
    for index in range(max(19, last - 2), last + 1):
        band = lower_band_at(closes, index)
        if band and bars[index]["low"] <= band * 1.005:
            touched = True
    band_now = lower_band_at(closes, last)
    mid_now = mean(closes[last - 19:last + 1])
    if touched and band_now and closes[last] >= band_now * 0.998 and closes[last] <= mid_now:
        add("Lower BB bounce", 10)
    year = bars[max(0, last - 251):last + 1]
    low52 = min(bar["low"] for bar in year)
    if low52 > 0 and (closes[last] - low52) / low52 <= 0.12:
        add("Near 52w low", 6, qualifies=False)
    high63 = max(closes[max(0, last - 62):last + 1])
    if high63 > 0 and closes[last] <= high63 * 0.88:
        add("Pullback from high", 4, qualifies=False)
    ema10 = ema_series(closes, 10)
    ema20 = ema_series(closes, 20)
    below = 0
    for index in range(last - 5, last):
        if ema10[index] is not None and closes[index] < ema10[index]:
            below += 1
    reclaimed = False
    if below >= 3 and ema10[last] is not None and ema10[last - 1] is not None and closes[last] > ema10[last] and closes[last - 1] <= ema10[last - 1]:
        reclaimed = True
    if below >= 3 and ema20[last] is not None and ema20[last - 1] is not None and closes[last] > ema20[last] and closes[last - 1] <= ema20[last - 1]:
        reclaimed = True
    if reclaimed:
        add("EMA reclaim", 10)
    if is_hammer(bars[last]) or (last >= 1 and bullish_engulfing(bars[last - 1], bars[last])):
        add("Reversal candle", 6)
    up = closes[last] > closes[last - 1]
    capitulation = False
    for index in range(max(1, last - 5), last + 1):
        down = bars[index]["close"] < bars[index - 1]["close"]
        if down and bars[index]["volume"] >= 1.5 * avg_volume:
            capitulation = True
    volume_up = bars[last]["volume"] >= avg_volume and up
    obv = obv_series(bars)
    obv_up = obv[last] > obv[last - 3] and up
    if capitulation and (volume_up or (up and bars[last]["volume"] >= bars[last - 1]["volume"])):
        add("Volume reversal", 8)
    elif obv_up and volume_up:
        add("Volume reversal", 8)
    sma_now = sma_at(closes, last, 200)
    sma_then = sma_at(closes, last - 20, 200) if last >= 220 else None
    if qualifying and sma_now and sma_then and closes[last] > sma_now and sma_now >= sma_then:
        add("Uptrend pullback", 8, qualifies=False)
    drop21 = (closes[last] / closes[last - 21] - 1.0) * 100 if last >= 21 else None
    if sma_now and sma_then and closes[last] < sma_now and sma_now < sma_then and ((drop21 is not None and drop21 <= -12) or not up):
        points -= 12
    score = round(max(0, min(100, points)), 1)
    return {"score": score, "signals": signals, "eligible": bool(qualifying and score >= 20)}


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


def build_universe():
    groups = {
        "sp500": symbols_from_page(SP_URL, 480),
        "ndx100": symbols_from_page(NDX_URL, 95),
        "mid400": symbols_from_page(MID_URL, 380),
    }
    ordered = []
    seen = set()
    for key in ("sp500", "ndx100", "mid400"):
        for symbol in groups[key]:
            if symbol in seen or symbol in EXCLUDE:
                continue
            seen.add(symbol)
            ordered.append(symbol)
    ordered.sort()
    if "RCL" in ordered or "RCL" in seen:
        raise RuntimeError("RCL slipped into the universe")
    return {
        "updated": stamp(now_utc()),
        "sources": [SP_URL, NDX_URL, MID_URL],
        "excluded": sorted(EXCLUDE),
        "counts": {
            "sp500": len(groups["sp500"]),
            "ndx100": len(groups["ndx100"]),
            "mid400": len(groups["mid400"]),
            "union": len(ordered),
        },
        "symbols": ordered,
    }


def universe_stale(document):
    if os.environ.get("STOCKS_REFRESH_UNIVERSE") == "1":
        return True
    if not isinstance(document, dict) or not isinstance(document.get("symbols"), list):
        return True
    if len(document["symbols"]) < 450:
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
        if len(symbols) >= 450 and "RCL" not in symbols:
            print("Universe refresh failed (" + str(error).splitlines()[0][:120] + "). Keeping the saved list.")
            return symbols
        raise
    UNIVERSE_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    counts = document["counts"]
    print(
        "Universe refreshed: "
        + str(counts["union"])
        + " symbols (S&P 500 "
        + str(counts["sp500"])
        + ", Nasdaq-100 "
        + str(counts["ndx100"])
        + ", MidCap 400 "
        + str(counts["mid400"])
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
    entry_high = close
    entry_low = close - 0.25 * atr if atr else close
    if lower < close and atr and lower > close - atr:
        entry_low = min(entry_low, lower)
    stop = close - 1.5 * atr if atr else None
    target = None
    target_label = ""
    if sma20 and sma20 > close * 1.002:
        target = sma20
        target_label = "the 20-day average"
    elif middle > close * 1.002:
        target = middle
        target_label = "the mid Bollinger Band"
    target2 = upper if upper > close * 1.002 and (target is None or upper > target * 1.005) else None
    reward = None
    if target and stop and close > stop:
        reward = (target - close) / (close - stop)
    above200 = bool(sma200 and close > sma200)
    swing = swing_bottom(bars)
    zone = "deep" if rsi < 30 else "watch" if rsi <= 40 else ""
    ready = rsi <= 40 and (uptick or hammer) and (close <= lower * 1.015 or score >= 45)
    strong = score >= 60 and rsi <= 35 and (uptick or hammer) and above200
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
    return {
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
        "drop5": round_num(drop5, 2),
        "drop21": round_num(drop21, 2),
        "range52": round(range52, 1),
        "high52": round(high52, 2),
        "low52": round(low52, 2),
        "volumeRatio": round(volume_ratio, 2),
        "hammer": hammer,
        "uptick": uptick,
        "score": score,
        "swingScore": swing["score"],
        "swingSignals": swing["signals"],
        "swingEligible": swing["eligible"],
        "strongBounce": strong,
        "ready": ready,
        "pullback": pullback,
        "atr": round_num(atr, 2),
        "entryLow": round_num(entry_low, 2),
        "entryHigh": round_num(entry_high, 2),
        "stop": round_num(stop, 2),
        "target": round_num(target, 2),
        "targetLabel": target_label,
        "target2": round_num(target2, 2),
        "rewardRisk": round_num(reward, 2),
        "yahoo": "https://finance.yahoo.com/quote/" + symbol,
        "tradingview": "https://www.tradingview.com/chart/?symbol=" + tradingview_symbol(symbol, exchange),
        "series": {"c": series_c, "u": series_u, "m": series_m, "l": series_l, "r": series_r},
    }


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
            for attempt in range(3):
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
                    if error.code == 429 and attempt + 1 < 3:
                        delay = 8 * (attempt + 1)
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
            if now_utc() <= moment <= now_utc() + timedelta(days=7):
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
    if row["sma200"] and not row["above200"]:
        flags.append("Below the 200-day")
    if row["sma50"] and row["sma200"] and row["price"] < row["sma50"] and row["sma50"] < row["sma200"]:
        flags.append("Downtrend")
    if row["rsi"] < 28 and not row["uptick"] and not row["hammer"] and row["drop5"] is not None and row["drop5"] <= -8:
        flags.append("Falling knife")
    if facts.get("earningsSoon"):
        flags.append("Earnings within 7 days")
    debt = facts.get("debtToEquity")
    high_debt = debt is not None and (debt >= 2 if facts.get("source") == "Nasdaq" else debt >= 200)
    if high_debt:
        flags.append("High debt-to-equity")
    return flags


def join_bits(bits):
    return " ".join(bit.strip() for bit in bits if bit and bit.strip())


def build_copy(row, facts):
    flags = build_flags(row, facts)
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
    if row["atr"] and row["entryLow"] is not None and row["entryHigh"] is not None:
        levels.append(
            "Using ATR(14) of "
            + money(row["atr"])
            + ", the sketched entry zone is "
            + money(row["entryLow"])
            + " to "
            + money(row["entryHigh"])
        )
    if row["stop"] is not None:
        levels.append("a stop sketch " + money(row["stop"]) + " (1.5× ATR under the last close)")
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
    why = join_bits([
        row["name"] + " (" + row["symbol"] + ") screens as a swing candidate on this pass, not as a guarantee.",
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
    row["flags"] = flags
    quality = quality_score(facts, row["price"])
    setup = row["score"]
    if row["uptick"] and row["rsi"] <= 40:
        setup = min(100, setup + 6)
    if row["above200"] and row["rsi"] < 45:
        setup = min(100, setup + 6)
    if not row["above200"]:
        setup = max(0, setup - 8)
    rank = 0.58 * setup + 0.42 * (quality if quality is not None else 42)
    if "Falling knife" in flags:
        rank -= 14
    if "Below the 200-day" in flags:
        rank -= 8
    if "Downtrend" in flags:
        rank -= 6
    if "Earnings within 7 days" in flags:
        rank -= 6
    row["rankScore"] = round(max(0, min(100, rank)), 1)
    if facts.get("sector"):
        row["sector"] = facts["sector"]
    if facts.get("industry"):
        row["industry"] = facts["industry"]
    return row


def fetch_chart(symbol, gate, opener):
    gate.wait()
    url = CHART.format(symbol=urllib.parse.quote(symbol))
    payload = json.loads(read_url(opener, url, 30, attempts=4))
    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not isinstance(result, dict):
        raise RuntimeError("empty chart")
    meta = result.get("meta") or {}
    if meta.get("instrumentType") not in (None, "EQUITY"):
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
    if len(bars) < 60:
        raise RuntimeError("not enough bars")
    name = meta.get("shortName") or meta.get("longName") or symbol
    if not isinstance(name, str):
        name = symbol
    exchange = meta.get("exchangeName") if isinstance(meta.get("exchangeName"), str) else ""
    return analyze(symbol, bars, " ".join(name.split())[:64], exchange[:24])


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
        if not session.blocked:
            gate.wait()
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


def write_doc(rows, fetched_at, universe_count, priced, candidates):
    rows = sorted(rows, key=lambda row: (-row.get("rankScore", 0), row["symbol"]))
    document = {
        "about": ABOUT,
        "disclaimer": DISCLAIMER,
        "source": (
            "Yahoo Finance public daily chart API (https://query1.finance.yahoo.com/v8/finance/chart). "
            "Fundamentals come from Yahoo quoteSummary (summaryProfile, summaryDetail, financialData, "
            "defaultKeyStatistics, calendarEvents) when the public crumb is available, otherwise from "
            "Nasdaq's public quote, financials, analyst target, ratings, and earnings calendar "
            "(https://api.nasdaq.com/)."
        ),
        "universeSource": "Wikipedia constituent tables: " + SP_URL + " ; " + NDX_URL + " ; " + MID_URL + ".",
        "universe": "S&P 500, Nasdaq-100, and S&P MidCap 400",
        "universeCount": universe_count,
        "priced": priced,
        "candidates": candidates,
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
    sample = analyze("TEST", [
        {"time": index, "open": 100 + (index % 3) * 0.2, "high": 101 + index * 0.01, "low": 99, "close": 100 - index * 0.05, "volume": 1000 + index}
        for index in range(80)
    ], "Test Co", "NMS")
    sample["price"] = sample["price"]
    build_copy(sample, {})
    assert "screens as a swing candidate" in sample["why"]
    assert "not as a guarantee" in sample["why"]
    assert "revenue" not in sample["why"].lower()
    assert "Fundamentals sheet missing" in sample["chips"]["value"]
    assert isinstance(sample["flags"], list)
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
    assert turned["eligible"] is True
    assert turned["score"] >= 20
    assert turned["score"] > swing_bottom(thin)["score"]
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
            "series", "swingScore", "swingSignals", "swingEligible",
        ):
            if key in fresh:
                row[key] = fresh[key]
        why = row.get("why") or ""
        if why and fresh.get("rsi") is not None:
            row["why"] = re.sub(r"RSI\(14\) is [0-9.]+", "RSI(14) is " + format(fresh["rsi"], ".1f"), why, count=1)
    write_doc(
        stocks,
        stamp(now_utc()),
        previous.get("universeCount") or 0,
        previous.get("priced") or 0,
        previous.get("candidates") or 0,
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


def main():
    self_test()
    if os.environ.get("STOCKS_SWING_ONLY") == "1":
        patch_swing_scores()
        return
    if os.environ.get("STOCKS_UNIVERSE_ONLY") == "1":
        os.environ["STOCKS_REFRESH_UNIVERSE"] = "1"
        symbols = load_universe()
        print("Universe only: " + str(len(symbols)) + " symbols. RCL excluded: " + str("RCL" not in symbols) + ".")
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
    strict = [row for row in rows if is_candidate(row, loose=False)]
    chosen = strict if len(strict) >= 24 else [row for row in rows if is_candidate(row, loose=True)]
    chosen.sort(key=lambda row: (-row["score"], row["rsi"], row["symbol"]))
    shortlist = chosen[:FUND_CAP]
    print("Swing candidates " + str(len(chosen)) + "; fundamentals for " + str(len(shortlist)) + ".", flush=True)
    print("Cooling down before the fundamentals sheet.", flush=True)
    time.sleep(20)
    try:
        session = YahooSession()
        session.ensure_crumb()
        attach_fundamentals(shortlist, session, Gate(FUND_GAP))
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
        print("Fundamentals handshake failed (" + str(error).splitlines()[0][:140] + "). Publishing the technical note only.")
        for row in shortlist:
            if "why" not in row:
                build_copy(row, {})
    published = sorted(shortlist, key=lambda row: (-row.get("rankScore", 0), row["symbol"]))[:PUBLISH_CAP]
    swing_pool = [row for row in shortlist if row.get("swingEligible")]
    if swing_pool:
        best_swing = max(swing_pool, key=lambda row: (row.get("swingScore") or 0, row["symbol"]))
        if best_swing not in published:
            published = [best_swing] + published[:PUBLISH_CAP - 1]
    if len(published) < 8:
        print("Only " + str(len(published)) + " swing candidates. Keeping the previous snapshot.")
        return
    write_doc(published, stamp(now_utc()), len(symbols), len(rows), len(chosen))
    deep = sum(1 for row in published if row["zone"] == "deep")
    print(
        "Saved "
        + str(len(published))
        + " swing candidates from "
        + str(len(rows))
        + " priced / "
        + str(len(symbols))
        + " universe. RSI<30 on the list: "
        + str(deep)
        + "."
    )
    if failures:
        print("Missed " + str(len(failures)) + ": " + ", ".join(failures[:12]))


if __name__ == "__main__":
    main()
