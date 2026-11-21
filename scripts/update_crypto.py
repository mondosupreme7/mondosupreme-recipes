#!/usr/bin/env python3
"""Refresh the paper crypto watchlist from the latest 00:00 UTC close.

Paper book only. This does not place an order and it is not advice. Quotes are
public daily history: the Yahoo chart for BTC-USD, ETH-USD, SOL-USD, XRP-USD,
ADA-USD, and DOGE-USD, and the CoinGecko market chart for shiba-inu and
canton-network. Shiba Inu keeps CoinGecko's full decimal. The job writes
price, 30-day change, percent versus the 200-day, the 200-day, and the note.
It also writes updatedAt and the status line. Sleeve and rules are left as
stored. A failed or incomplete quote leaves the file untouched.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "stocks" / "crypto.json"
YAHOO = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    "?range=1y&interval=1d&includePrePost=false"
)
GECKO = (
    "https://api.coingecko.com/api/v3/coins/{coin}/market_chart"
    "?vs_currency=usd&days=365"
)
UA = "MondosupremeStocks/1.0 (+https://mondosupreme.com/stocks/crypto/)"
# symbol, venue, market id, full decimal precision
SOURCES = (
    ("BTC", "yahoo", "BTC-USD", False),
    ("ETH", "yahoo", "ETH-USD", False),
    ("SOL", "yahoo", "SOL-USD", False),
    ("XRP", "yahoo", "XRP-USD", False),
    ("ADA", "yahoo", "ADA-USD", False),
    ("DOGE", "yahoo", "DOGE-USD", False),
    ("SHIB", "gecko", "shiba-inu", True),
    ("CC", "gecko", "canton-network", False),
)
SOURCE_BY_SYMBOL = {symbol: (venue, market, full) for symbol, venue, market, full in SOURCES}
CHANGE_DAYS = 30


class RefreshError(RuntimeError):
    """A quote or a file problem that must leave the JSON untouched."""


def parse_now(text):
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise RefreshError("clock time is not an ISO datetime") from error
    if moment.tzinfo is None:
        raise RefreshError("clock time must include a timezone")
    return moment


def mark_day(now):
    moment = now.astimezone(timezone.utc)
    return datetime(moment.year, moment.month, moment.day, tzinfo=timezone.utc).date()


def stamp(now):
    return now.astimezone(EASTERN).isoformat(timespec="seconds")


def whole_number(value):
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except (ArithmeticError, ValueError):
        return None
    if not number.is_finite() or number != number.to_integral_value():
        return None
    return int(number)


def midnight_date(seconds):
    moment = datetime.fromtimestamp(int(seconds), timezone.utc)
    if (moment.hour, moment.minute, moment.second, moment.microsecond) != (0, 0, 0, 0):
        return None
    return moment.date()


def point_day(raw_time):
    number = whole_number(raw_time)
    if number is None:
        return None
    if number > 10**11:
        if number % 1000 != 0:
            return None
        number //= 1000
    return midnight_date(number)


def as_decimal(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except (ArithmeticError, ValueError):
        return None
    if not number.is_finite():
        return None
    return number


def plain_number(value):
    if isinstance(value, bool):
        raise RefreshError("bad number")
    if isinstance(value, int):
        return str(value)
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text in ("", "-", "-0"):
        return "0"
    return text


def read_rules(rules):
    """Pull the daily screen out of the stored rule strings.

    The screen is the Bitcoin close versus its own average, each coin versus
    its own rising average, and the dollar-volume minimum. An order's stop,
    payoff, and size are not in a daily quote, so those rules are not scored.
    """
    if not isinstance(rules, list) or not any(isinstance(rule, str) and rule.strip() for rule in rules):
        raise RefreshError("rules are missing")
    lengths = set()
    volume = None
    label = None
    btc_gate = False
    rising = False
    for rule in rules:
        if not isinstance(rule, str):
            continue
        low = rule.lower()
        for found in re.findall(r"(\d+)\s*-\s*day", rule, re.I):
            if any(word in low for word in ("above", "rising", "bitcoin")):
                lengths.add(int(found))
        if "bitcoin" in low and "above" in low and "day" in low:
            btc_gate = True
        if "rising" in low and "day" in low:
            rising = True
        match = re.search(r"\$(\d+(?:\.\d+)?)\s*([mb])\b", rule, re.I)
        if match and "volume" in low:
            amount = Decimal(match.group(1))
            unit = match.group(2).upper()
            volume = amount * (Decimal(1_000_000) if unit == "M" else Decimal(1_000_000_000))
            label = "$" + match.group(1) + unit
    if len(lengths) != 1 or volume is None or not btc_gate or not rising:
        raise RefreshError("rules do not state the daily screen")
    days = lengths.pop()
    if days < CHANGE_DAYS or volume <= 0:
        raise RefreshError("rules do not state the daily screen")
    return {"days": days, "volume": volume, "label": label, "btc_gate": btc_gate, "rising": rising}


def average(values):
    total = sum(values, Decimal(0))
    return (total / Decimal(len(values))).quantize(Decimal("1e-18"), rounding=ROUND_HALF_UP)


def publish_price(value, full):
    # Shiba Inu keeps the source decimal. Rounding it is what loses the quote.
    if full:
        return value
    magnitude = abs(value)
    if magnitude >= 1:
        quantum = Decimal("0.01")
    elif magnitude >= Decimal("0.01"):
        quantum = Decimal("0.0001")
    else:
        quantum = Decimal("1e-8")
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def as_int_percent(value):
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def metrics(mark, spec, full):
    closes = mark["closes"]
    days = spec["days"]
    if len(closes) < days + 1:
        raise RefreshError("not enough daily closes")
    current = average(closes[-days:])
    previous = average(closes[-days - 1:-1])
    if current <= 0 or previous <= 0 or closes[-1] <= 0 or closes[-1 - CHANGE_DAYS] <= 0:
        raise RefreshError("bad close")
    if current > previous:
        slope = "rising"
    elif current < previous:
        slope = "falling"
    else:
        slope = "flat"
    price = publish_price(closes[-1], full)
    ma200 = publish_price(current, full)
    if price <= 0 or ma200 <= 0:
        raise RefreshError("bad close")
    change = as_int_percent((closes[-1] / closes[-1 - CHANGE_DAYS] - 1) * Decimal(100))
    versus = as_int_percent((price / ma200 - 1) * Decimal(100))
    volume = mark["volume"]
    if volume is None or volume < 0:
        raise RefreshError("missing volume")
    if volume < spec["volume"]:
        note = "under the " + spec["label"] + " volume minimum."
    else:
        note = ""
    return {
        "price": price,
        "chg30d": change,
        "vs200d": versus,
        "ma200": ma200,
        "note": note,
        "slope": slope,
        "volume": volume,
    }


def qualifies(stats, btc_above, spec):
    if spec["btc_gate"] and not btc_above:
        return False
    if stats["price"] <= stats["ma200"]:
        return False
    if spec["rising"] and stats["slope"] != "rising":
        return False
    if stats["volume"] < spec["volume"]:
        return False
    return True


def eligible_sentence(symbols):
    if not symbols:
        return "No coin is eligible."
    if len(symbols) == 1:
        return symbols[0] + " is eligible."
    if len(symbols) == 2:
        return symbols[0] + " and " + symbols[1] + " are eligible."
    return ", ".join(symbols[:-1]) + ", and " + symbols[-1] + " are eligible."


def btc_sentence(versus, slope, days):
    if versus > 0:
        relation = str(versus) + "% above"
    elif versus < 0:
        relation = str(abs(versus)) + "% under"
    else:
        relation = "on"
    return "Bitcoin is " + relation + " a " + slope + " " + str(days) + "-day."


def status_sentence(btc, symbols, days):
    return eligible_sentence(symbols) + " " + btc_sentence(btc["vs200d"], btc["slope"], days)


def place(row, stats):
    ordered = {
        "symbol": row["symbol"],
        "name": row["name"],
        "price": stats["price"],
        "chg30d": stats["chg30d"],
        "vs200d": stats["vs200d"],
        "ma200": stats["ma200"],
        "note": stats["note"],
    }
    for key, value in row.items():
        if key not in ordered:
            ordered[key] = value
    row.clear()
    row.update(ordered)


def apply_quotes(book, marks, now):
    spec = read_rules(book.get("rules"))
    rows = book.get("watchlist")
    if not isinstance(rows, list) or not rows:
        raise RefreshError("watchlist is missing")
    scored = []
    for row in rows:
        if not isinstance(row, dict):
            raise RefreshError("watchlist row is missing a symbol")
        symbol = row.get("symbol")
        name = row.get("name")
        if not isinstance(symbol, str) or not symbol or not isinstance(name, str):
            raise RefreshError("watchlist row is missing a symbol")
        if symbol not in SOURCE_BY_SYMBOL:
            raise RefreshError("no quote source for " + symbol)
        mark = marks.get(symbol)
        if not isinstance(mark, dict):
            raise RefreshError("missing quote for " + symbol)
        full = SOURCE_BY_SYMBOL[symbol][2]
        stats = metrics(mark, spec, full)
        place(row, stats)
        scored.append(stats)
    btc_index = next((index for index, row in enumerate(rows) if row["symbol"] == "BTC"), None)
    if btc_index is None:
        raise RefreshError("watchlist has no BTC")
    btc = scored[btc_index]
    btc_above = btc["price"] > btc["ma200"]
    eligible = []
    for row, stats in zip(rows, scored):
        if qualifies(stats, btc_above, spec) and row["symbol"] not in eligible:
            eligible.append(row["symbol"])
    book["status"] = status_sentence(btc, eligible, spec["days"])
    book["updatedAt"] = stamp(now)
    return book


def trailing(by_date, end):
    if end not in by_date:
        raise RefreshError("missing the 00:00 UTC close")
    closes = []
    day = end
    while day in by_date:
        closes.append(by_date[day])
        day -= timedelta(days=1)
    closes.reverse()
    return closes


def parse_yahoo(payload, now):
    result = ((payload.get("chart") or {}).get("result") or [None])[0] if isinstance(payload, dict) else None
    if not isinstance(result, dict):
        raise RefreshError("empty chart")
    meta = result.get("meta") if isinstance(result.get("meta"), dict) else {}
    if meta.get("currency") not in (None, "USD"):
        raise RefreshError("not USD")
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [None])[0]
    if not isinstance(quote, dict):
        raise RefreshError("empty chart")
    raw_closes = quote.get("close") or []
    raw_volumes = quote.get("volume") or []
    end = mark_day(now)
    now_utc = now.astimezone(timezone.utc)
    closes_by_day = {}
    volume_by_day = {}
    for index, raw_time in enumerate(timestamps):
        seconds = whole_number(raw_time)
        if seconds is None:
            continue
        start = midnight_date(seconds)
        if start is None:
            continue
        close_day = start + timedelta(days=1)
        if close_day > end:
            continue
        if datetime.fromtimestamp(seconds, timezone.utc) + timedelta(days=1) > now_utc:
            continue
        if index >= len(raw_closes):
            continue
        close = as_decimal(raw_closes[index])
        if close is None or close <= 0:
            continue
        closes_by_day[close_day] = close
        if index < len(raw_volumes):
            volume = as_decimal(raw_volumes[index])
            if volume is not None and volume >= 0:
                volume_by_day[close_day] = volume
    closes = trailing(closes_by_day, end)
    if end not in volume_by_day:
        raise RefreshError("missing volume")
    return {"closes": closes, "volume": volume_by_day[end]}


def parse_gecko(payload, now):
    if not isinstance(payload, dict):
        raise RefreshError("empty chart")
    raw_prices = payload.get("prices")
    raw_volumes = payload.get("total_volumes")
    if not isinstance(raw_prices, list) or not isinstance(raw_volumes, list):
        raise RefreshError("empty chart")
    end = mark_day(now)
    closes_by_day = {}
    volume_by_day = {}
    for point in raw_prices:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        day = point_day(point[0])
        if day is None or day > end:
            continue
        price = as_decimal(point[1])
        if price is None or price <= 0:
            continue
        closes_by_day[day] = price
    for point in raw_volumes:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        day = point_day(point[0])
        if day is None or day > end:
            continue
        volume = as_decimal(point[1])
        if volume is None or volume < 0:
            continue
        volume_by_day[day] = volume
    closes = trailing(closes_by_day, end)
    if end not in volume_by_day:
        raise RefreshError("missing volume")
    return {"closes": closes, "volume": volume_by_day[end]}


def read_url(opener, url, pause=time.sleep):
    last = "quote source failed"
    current = url
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                current,
                headers={"User-Agent": UA, "Accept": "application/json"},
            )
            with opener.open(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            last = "HTTP " + str(error.code)
            if error.code in (429, 500, 502, 503, 504) and attempt + 1 < 4:
                if error.code == 429 and "query1" in current:
                    current = current.replace("query1", "query2", 1)
                pause(min(8, 0.4 * (2 ** attempt)))
                continue
            break
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = str(error).splitlines()[0][:160]
            if attempt + 1 < 4:
                pause(min(8, 0.4 * (2 ** attempt)))
                continue
            break
    raise RefreshError("quote source failed (" + last + ")")


def load_chart(opener, url, pause):
    try:
        return json.loads(read_url(opener, url, pause), parse_float=Decimal)
    except json.JSONDecodeError as error:
        raise RefreshError("quote source failed (bad JSON)") from error


def fetch_marks(symbols, now, opener=None, pause=time.sleep):
    opener = opener or urllib.request.build_opener()
    marks = {}
    for symbol in symbols:
        venue, market, _full = SOURCE_BY_SYMBOL[symbol]
        print("Fetching " + symbol + ".", flush=True)
        if venue == "yahoo":
            url = YAHOO.format(symbol=urllib.parse.quote(market, safe=""))
            marks[symbol] = parse_yahoo(load_chart(opener, url, pause), now)
        else:
            url = GECKO.format(coin=urllib.parse.quote(market, safe=""))
            marks[symbol] = parse_gecko(load_chart(opener, url, pause), now)
    return marks


def literal(value):
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, (int, Decimal)):
        return plain_number(value)
    if isinstance(value, float):
        return plain_number(Decimal(str(value)))
    raise RefreshError("bad number")


def one_line(value):
    if not isinstance(value, dict):
        return literal(value) if not isinstance(value, (dict, list)) else render_value(value, 0)
    parts = []
    for key, item in value.items():
        rendered = render_value(item, 0) if isinstance(item, (dict, list)) else literal(item)
        parts.append(json.dumps(key, ensure_ascii=False) + ": " + rendered)
    return "{" + ", ".join(parts) + "}"


def render_value(value, level):
    indent = "  " * level
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = ["{"]
        items = list(value.items())
        for index, (key, item) in enumerate(items):
            comma = "," if index + 1 < len(items) else ""
            if key == "watchlist" and isinstance(item, list):
                rendered = render_watchlist(item, level + 1)
            else:
                rendered = render_value(item, level + 1)
            lines.append(indent + "  " + json.dumps(key, ensure_ascii=False) + ": " + rendered + comma)
        lines.append(indent + "}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return "[]"
        lines = ["["]
        for index, item in enumerate(value):
            comma = "," if index + 1 < len(value) else ""
            lines.append(indent + "  " + render_value(item, level + 1) + comma)
        lines.append(indent + "]")
        return "\n".join(lines)
    return literal(value)


def render_watchlist(rows, level):
    indent = "  " * level
    if not rows:
        return "[]"
    lines = ["["]
    for index, row in enumerate(rows):
        comma = "," if index + 1 < len(rows) else ""
        lines.append(indent + "  " + one_line(row) + comma)
    lines.append(indent + "]")
    return "\n".join(lines)


def render(book):
    return render_value(book, 0) + "\n"


def atomic_write(path, text):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def refresh_path(path, now, fetch):
    path = Path(path)
    original = path.read_text(encoding="utf-8")
    book = json.loads(original, parse_float=Decimal)
    rows = book.get("watchlist") if isinstance(book, dict) else None
    if not isinstance(rows, list):
        raise RefreshError("watchlist is missing")
    symbols = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("symbol"), str):
            raise RefreshError("watchlist row is missing a symbol")
        if row["symbol"] not in symbols:
            symbols.append(row["symbol"])
    marks = fetch(symbols, now)
    apply_quotes(book, marks, now)
    text = render(book)
    if text == original:
        print("Crypto watchlist unchanged.")
        return 0
    atomic_write(path, text)
    print(book["status"])
    print("Updated " + ", ".join(symbols) + ".")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refresh the paper crypto watchlist from the 00:00 UTC close.")
    parser.add_argument("--file", default=str(DEFAULT_PATH))
    parser.add_argument("--now", default="", help="ISO datetime with a timezone. Defaults to now.")
    args = parser.parse_args(argv)
    now = parse_now(args.now) if args.now else datetime.now(timezone.utc)
    try:
        return refresh_path(Path(args.file), now, fetch_marks)
    except (OSError, json.JSONDecodeError, RefreshError, ArithmeticError) as error:
        print("Crypto refresh failed (" + str(error).splitlines()[0][:200] + "). File not written.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
