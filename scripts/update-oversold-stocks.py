#!/usr/bin/env python3
"""Build stocks/oversold.json from Yahoo Finance daily charts.

Uses the public chart endpoint (range=2y, interval=1d) for a fixed list of
liquid US stocks: S&P 500 and Nasdaq 100 leaders, plus RCL. No key. A failed
run, or a run that prices fewer than 40 names, leaves the previous file in
place. Set STOCKS_FORCE=1 to refresh even when the snapshot is under 2 hours old.
"""

from __future__ import annotations

import json
import math
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "stocks" / "oversold.json"
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=2y&interval=1d&includePrePost=false"
MAX_AGE_HOURS = 2
MIN_ROWS = 40
SERIES = 90
ABOUT = (
    "Technical snapshot for liquid US stocks (S&P 500 and Nasdaq 100 leaders, plus RCL). "
    "RSI is Wilder's 14-day RSI. Bollinger Bands are the 20-day average plus and minus "
    "two population standard deviations. Moving averages are simple. Drawdowns use trading "
    "sessions (5 and 21). The bounce score mixes a low RSI, a lower-band touch, a bullish "
    "uptick or hammer, and heavier volume. Informational only, not financial advice. "
    "fetchedAt is when this file was last filled. A failed fetch keeps the previous rows."
)

UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "COST", "NFLX",
    "AMD", "ADBE", "PEP", "CSCO", "AMGN", "QCOM", "TXN", "INTU", "AMAT", "ISRG",
    "BKNG", "ADP", "SBUX", "GILD", "MU", "LRCX", "PANW", "SNPS", "CDNS", "KLAC",
    "ADI", "PYPL", "CRWD", "MAR", "FTNT", "ORLY", "CTAS", "MNST", "PCAR", "NXPI",
    "PAYX", "ROST", "IDXX", "FAST", "VRSK", "ODFL", "MRVL", "BRK-B", "JPM", "UNH",
    "XOM", "JNJ", "V", "MA", "PG", "HD", "CVX", "LLY", "ABBV", "KO",
    "WMT", "BAC", "PFE", "DIS", "WFC", "CAT", "GE", "BA", "IBM", "GS",
    "MS", "C", "BLK", "SPGI", "RTX", "HON", "DE", "LOW", "NEE", "LIN",
    "ACN", "UPS", "NKE", "PM", "UNP", "COP", "SLB", "CVS", "MDT", "SO",
    "SCHW", "TMO", "DHR", "PLD", "RCL",
]


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
    window = closes[index + 1 - length:index + 1]
    return mean(window)


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
    out = [None] * (length)
    out.append(rsi_value(avg_gain, avg_loss))
    for index in range(length + 1, len(closes)):
        change = closes[index] - closes[index - 1]
        gain = max(change, 0.0)
        loss = max(-change, 0.0)
        avg_gain = ((avg_gain * (length - 1)) + gain) / length
        avg_loss = ((avg_loss * (length - 1)) + loss) / length
        out.append(rsi_value(avg_gain, avg_loss))
    return out


def rsi_value(avg_gain, avg_loss):
    if avg_loss == 0 and avg_gain == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def round_num(value, places):
    if value is None:
        return None
    return round(float(value), places)


def is_hammer(bar):
    high = bar["high"]
    low = bar["low"]
    span = high - low
    if span <= 0:
        return False
    body = abs(bar["close"] - bar["open"])
    lower = min(bar["open"], bar["close"]) - low
    upper = high - max(bar["open"], bar["close"])
    return lower >= body * 2 and upper <= body and bar["close"] >= low + span * 0.6


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


def self_test():
    closes = [float(i) for i in range(1, 40)]
    rsi = wilder_rsi(closes)
    assert rsi[-1] is not None and rsi[-1] > 70
    flat = wilder_rsi([10.0] * 30)
    assert abs(flat[-1] - 50) < 0.01
    assert abs(sma_at(closes, len(closes) - 1, 5) - mean(closes[-5:])) < 1e-9
    band = population_stdev([1, 2, 3, 4, 5])
    assert band > 0


def fetch_chart(symbol):
    url = CHART.format(symbol=urllib.request.quote(symbol))
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MondosupremeStocks/1.0 (+https://mondosupreme.com/stocks/)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
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
    if len(bars) < 40:
        raise RuntimeError("not enough bars")
    name = meta.get("shortName") or meta.get("longName") or symbol
    if not isinstance(name, str):
        name = symbol
    exchange = meta.get("exchangeName") if isinstance(meta.get("exchangeName"), str) else ""
    return bars, " ".join(name.split())[:48], exchange[:24]


def tradingview_symbol(symbol, exchange):
    venue = "NASDAQ" if exchange.upper() in {"NMS", "NGM", "NCM", "NASDAQ", "NasdaqGS"} else "NYSE"
    if exchange.upper() in {"PCX", "BATS", "ASE", "NYSEArca", "NYSEArca".upper()}:
        venue = "AMEX"
    ticker = symbol.replace("-", ".")
    return venue + ":" + ticker


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
    prior_volume = [bar["volume"] for bar in bars[last - 20:last]]
    volume_ratio = close and (bars[last]["volume"] / mean(prior_volume)) if prior_volume and mean(prior_volume) else 1.0
    score = score_row(rsi, close, lower, hammer, uptick, volume_ratio)
    drop5 = (close / closes[last - 5] - 1.0) * 100 if last >= 5 else None
    drop21 = (close / closes[last - 21] - 1.0) * 100 if last >= 21 else None
    year = bars[max(0, last - 251):last + 1]
    high52 = max(bar["high"] for bar in year)
    low52 = min(bar["low"] for bar in year)
    span = high52 - low52
    range52 = ((close - low52) / span) * 100 if span else 50.0
    distance = ((close - lower) / lower) * 100 if lower else 0.0
    zone = "deep" if rsi < 30 else "watch" if rsi <= 35 else ""
    ready = rsi <= 35 and (uptick or hammer) and (close <= lower * 1.01 or score >= 50)
    strong = score >= 55 and rsi <= 35 and (uptick or hammer)
    pullback = bool(sma200) and close > sma200 and (rsi < 40 or (sma20 and close < sma20))
    start = max(0, last - SERIES + 1)
    series_c = []
    series_u = []
    series_m = []
    series_l = []
    series_r = []
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
    tv = tradingview_symbol(symbol, exchange)
    yahoo = "https://finance.yahoo.com/quote/" + symbol
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
        "above200": bool(sma200 and close > sma200),
        "drop5": round_num(drop5, 2),
        "drop21": round_num(drop21, 2),
        "range52": round(range52, 1),
        "high52": round(high52, 2),
        "low52": round(low52, 2),
        "volumeRatio": round(volume_ratio, 2),
        "hammer": hammer,
        "uptick": uptick,
        "score": score,
        "strongBounce": strong,
        "ready": ready,
        "pullback": pullback,
        "yahoo": yahoo,
        "tradingview": "https://www.tradingview.com/chart/?symbol=" + tv,
        "series": {"c": series_c, "u": series_u, "m": series_m, "l": series_l, "r": series_r},
    }


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


def scan():
    rows = []
    failures = []
    for symbol in UNIVERSE:
        try:
            bars, name, exchange = fetch_chart(symbol)
            rows.append(analyze(symbol, bars, name, exchange))
        except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ZeroDivisionError, ValueError) as error:
            failures.append(symbol + " (" + str(error).splitlines()[0][:80] + ")")
        time.sleep(0.2)
    return rows, failures


def write_doc(rows, fetched_at):
    rows = sorted(rows, key=lambda row: (row["rsi"], row["symbol"]))
    document = {
        "about": ABOUT,
        "disclaimer": "Technical indicator screener for informational use only. Not financial advice.",
        "source": "Yahoo Finance public daily chart API (https://query1.finance.yahoo.com/v8/finance/chart).",
        "universe": "S&P 500 and Nasdaq 100 leaders, plus RCL",
        "fetchedAt": fetched_at,
        "count": len(rows),
        "stocks": rows,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def main():
    self_test()
    previous = load_json(OUT_PATH)
    if fresh_enough(previous):
        print("Oversold snapshot is still fresh (" + str(previous.get("fetchedAt")) + ").")
        return
    try:
        rows, failures = scan()
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
        print("Stock fetch failed (" + str(error) + "). Keeping the previous snapshot.")
        return
    if len(rows) < MIN_ROWS:
        print("Only " + str(len(rows)) + " stocks priced. Keeping the previous snapshot.")
        if failures:
            print("Missed: " + ", ".join(failures[:12]))
        return
    write_doc(rows, stamp(now_utc()))
    deep = sum(1 for row in rows if row["zone"] == "deep")
    ready = sum(1 for row in rows if row["ready"])
    print("Saved " + str(len(rows)) + " stocks. RSI<30: " + str(deep) + ". Ready: " + str(ready) + ".")
    if failures:
        print("Missed " + str(len(failures)) + ": " + ", ".join(failures[:12]))


if __name__ == "__main__":
    main()
