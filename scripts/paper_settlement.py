#!/usr/bin/env python3
"""Settle stocks/paper/ledger.json from regular-session daily OHLC.

Paper / simulated book only. This does not place live orders, does not talk to
a brokerage, and is not financial advice. Quotes come from the same public
Yahoo Finance daily chart the screener and the quote refresh already use:

    https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d&includePrePost=false

No key. includePrePost=false keeps the regular session. Prices are rounded
half-up to cents before any comparison.

Sessions
    America/New_York. A session is a weekday that is not an NYSE full-day
    closure. Weekends are not sessions. A US federal holiday is still a
    session when the NYSE is open: Veterans Day 2026-11-11 is a session, and
    so is Columbus Day. Early closes (1:00 p.m.) are sessions; the daily bar
    is still the regular-session OHLC.
    The published NYSE calendar for 2026-2028 is the source for closures.
    When January 1 falls on Saturday, NYSE does not close the Friday before
    (the published 2028 rule). Other fixed holidays move to Friday when they
    fall on Saturday and to Monday when they fall on Sunday.
    A session is settleable only at or after 16:30 America/New_York on that
    date. The cash session ends at 16:00; 16:30 leaves room for the daily bar.
    Holidays are skipped and do not count toward a fill window or a time stop.
    If the chart request fails, or a symbol that must be settled has no usable
    OHLC on a session being settled, the run stops and does not write the
    ledger. Usable OHLC means open, high, low, and close are present and
    positive, the high is at least the open, close, and low, and the low is
    at most the open and the close.

Orders
    Existing working buy limits only. This does not create orders and does not
    change the recorded share count, limit, stop, target, or reserved cash on
    the original record. Any other working order fails the run without writing.
    The original order record stays. A fill or an expiry appends a later
    record with the same id.
    Do not fill before firstEligibleSession. Do not fill on the signal close.
    A working limit is not a fill.
    Fill when that session's low is at or below the limit. The fill price is
    min(open, limit). On the last day of the fill window a touch still fills.
    fillWindowTradingDays is counted in NYSE sessions from firstEligibleSession
    inclusive (the order's value, else the book rules, else 5). If the order
    is still unfilled on that session, it expires. Reserved cash is released.
    Status is expired. That is not a fill.

Exits (open longs)
    Stop when low is at or below the stop. The exit price is min(open, stop).
    A gap down through the stop exits at the open.
    Otherwise target when high reaches the target. The exit price is
    max(open, target). A gap through the target exits at the open.
    If stop and target are both hit on the same bar, the stop wins.
    Fill bar, when the open is above the limit: the position is not on at the
    open, because the limit filled later on the way down. The stop still
    applies if the low reaches it, at min(open, stop), which is the stop.
    The session high is not a target on that bar; the high can print before
    the fill. The target fills only if the close is at or above it, and the
    exit price is the target, not the open.
    Time stop: timeStopTradingDaysAfterFill sessions, counted from the fill
    session inclusive (else the book's timeStopTradingDays, else 8). If the
    position is still open on that session after the stop and target checks,
    exit at that session's close. The reason is a time stop, not a stop and
    not a target.

Marks and accounting
    Append one mark for each settled session, after that session's fills,
    exits, and expiries. Timestamps are 16:05 America/New_York on the session
    date, with that date's EST or EDT offset.
    An open long is marked at the session close. Unrealized P&L is
    (mark - entry) * shares. Cash falls by shares * fill price on a fill and
    rises by shares * exit price on an exit. Reserved cash is the recorded
    reservedCash of orders whose latest record is still working. Available
    cash is cash minus reserved cash. Market value is shares * mark for open
    longs. Equity is cash plus market value. Open risk is the recorded
    riskUsdAtLimit of working orders, plus max(0, entry - stop) * shares for
    open longs. Versus start is equity minus starting cash. Goal progress is
    equity / goalEquity.
    An optional top-level goal object (stretch dates, baseline, and target) is
    kept as stored. Settlement does not rewrite it, and it does not use it to
    size an order or to relax a gate.
    On a fill, the position records bookPctAtEntry: the fill notional divided
    by equity just before that fill. On a close, the closed trade keeps that
    percent when it was recorded, and always records exitAt, realized P&L,
    equityAfter (the book balance after the exit), and a one-line reason.
    Older records that lack the newer fields still settle.
    New paper orders are sized by size_paper_order. The aim is at least 25%
    of equity at risk, up to the configured maximum (50% unless the book says
    otherwise), scaled by swing-score strength. Share count is
    floor(risk dollars / (entry - stop)), then the lesser of that count, the
    shares available cash can buy, and the shares that would use 100% of the
    book. There is no margin. Settlement does not resize an order that is
    already on the ledger.
    Events, the original order records, and closed trades are append-only.
    Balances are the current snapshot. An open position's mark is current
    state; each session's mark event is the history. A closed position leaves
    the live list and is kept as a closed trade plus an exit event.
    A session that already has a mark event is not filled, exited, expired,
    or marked again. The ledger file is replaced only after every session in
    the run has been applied. A failed quote leaves the file untouched.
"""

from __future__ import annotations

import argparse
import copy
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LEDGER = ROOT / "stocks" / "paper" / "ledger.json"
CHART = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    "?range=1y&interval=1d&includePrePost=false"
)
UA = "MondosupremeStocks/1.0 (+https://mondosupreme.com/stocks/)"
CLOSE_MINUTES = 16 * 60 + 30
MARK_HOUR = 16
MARK_MINUTE = 5
TERMINAL = {"filled", "partial", "canceled", "cancelled", "expired", "rejected", "closed"}
CENT = Decimal("0.01")
PENNY = Decimal("1")


class SettlementError(RuntimeError):
    """A quote or a book problem that must leave the ledger file untouched."""


def eastern_now():
    return datetime.now(EASTERN)


def as_eastern(moment):
    if moment.tzinfo is None:
        raise SettlementError("clock time must include a timezone")
    return moment.astimezone(EASTERN)


def parse_now(text):
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise SettlementError("clock time is not an ISO datetime") from error
    return as_eastern(moment)


def parse_day(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as error:
        raise SettlementError("bad session date") from error


def session_stamp(day):
    moment = datetime(day.year, day.month, day.day, MARK_HOUR, MARK_MINUTE, tzinfo=EASTERN)
    return moment.isoformat(timespec="seconds")


def chart_session_date(moment):
    """Eastern calendar date of a Yahoo daily bar, matching the screener."""
    return datetime.fromtimestamp(int(moment), EASTERN).date()


def to_cents(value):
    try:
        quantized = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (ArithmeticError, ValueError) as error:
        raise SettlementError("bad price") from error
    return int(quantized * 100)


def from_cents(cents):
    negative = int(cents) < 0
    whole, frac = divmod(abs(int(cents)), 100)
    number = whole if frac == 0 else whole + frac / 100
    return -number if negative else number


def shares_of(record):
    try:
        count = Decimal(str(record["shares"]))
    except (KeyError, ArithmeticError, ValueError) as error:
        raise SettlementError("shares are missing") from error
    if count <= 0:
        raise SettlementError("shares must be positive")
    return count


def cash_for(shares, price_cents):
    return int((shares * Decimal(int(price_cents))).quantize(PENNY, rounding=ROUND_HALF_UP))


def fmt_money(cents):
    negative = int(cents) < 0
    whole, frac = divmod(abs(int(cents)), 100)
    return ("-$" if negative else "$") + f"{whole:,}.{frac:02d}"


def fmt_price(cents):
    whole, frac = divmod(abs(int(cents)), 100)
    sign = "-" if int(cents) < 0 else ""
    return sign + f"{whole}.{frac:02d}"


def json_number(value):
    text = f"{value:.2f}"
    number = Decimal(text)
    if number == number.to_integral_value():
        return int(number)
    return float(text)


def fmt_pct(numerator, denominator):
    if denominator == 0:
        raise SettlementError("cannot divide by a zero price")
    value = (Decimal(int(numerator)) / Decimal(int(denominator)) * Decimal(100)).quantize(CENT, rounding=ROUND_HALF_UP)
    return json_number(value), f"{value:.2f}%"


def positive_int(source, key):
    if not isinstance(source, dict) or key not in source:
        return None
    value = source[key]
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, float) and value > 0 and value == int(value):
        return int(value)
    return None


def rule_int(order, book, order_key, rules_key, default):
    found = positive_int(order, order_key)
    if found is not None:
        return found
    found = positive_int(book.get("rules") if isinstance(book.get("rules"), dict) else {}, rules_key)
    if found is not None:
        return found
    return default


def nth_weekday(year, month, weekday, n):
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def last_weekday(year, month, weekday):
    if month == 12:
        probe = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        probe = date(year, month + 1, 1) - timedelta(days=1)
    return probe - timedelta(days=(probe.weekday() - weekday) % 7)


def easter_sunday(year):
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month = (h + ell - 7 * m + 114) // 31
    day = ((h + ell - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def observed_fixed(year, month, day):
    raw = date(year, month, day)
    if raw.weekday() == 5:
        return raw - timedelta(days=1)
    if raw.weekday() == 6:
        return raw + timedelta(days=1)
    return raw


def nyse_closures(year):
    """Full-day NYSE closures. Early closes stay sessions."""
    closed = set()
    new_year = date(year, 1, 1)
    # The published 2028 calendar does not observe New Year's when January 1
    # is a Saturday. Christmas and the other fixed holidays still move.
    if new_year.weekday() != 5:
        closed.add(observed_fixed(year, 1, 1))
    closed.add(nth_weekday(year, 1, 0, 3))
    closed.add(nth_weekday(year, 2, 0, 3))
    closed.add(easter_sunday(year) - timedelta(days=2))
    closed.add(last_weekday(year, 5, 0))
    closed.add(observed_fixed(year, 6, 19))
    closed.add(observed_fixed(year, 7, 4))
    closed.add(nth_weekday(year, 9, 0, 1))
    closed.add(nth_weekday(year, 11, 3, 4))
    closed.add(observed_fixed(year, 12, 25))
    return closed


def is_nyse_session(day):
    return day.weekday() < 5 and day not in nyse_closures(day.year)


def next_nyse_session(day):
    probe = day + timedelta(days=1)
    for _ in range(14):
        if is_nyse_session(probe):
            return probe
        probe += timedelta(days=1)
    return None


def previous_nyse_session(day):
    probe = day - timedelta(days=1)
    for _ in range(14):
        if is_nyse_session(probe):
            return probe
        probe -= timedelta(days=1)
    return None


def on_or_after_session(day):
    if is_nyse_session(day):
        return day
    return next_nyse_session(day)


def session_dates(start, end):
    if end < start:
        return []
    days = []
    probe = start
    while probe <= end:
        if is_nyse_session(probe):
            days.append(probe)
        probe += timedelta(days=1)
    return days


def session_count(start, end):
    return len(session_dates(start, end))


def stretch_sessions(goal):
    """NYSE sessions after the baseline date through the target date.

    The baseline close is the starting mark, not a compounding step. The
    target date counts when it is itself a session. Dec 11, 2026 is that
    session for a target of Dec 11; Dec 12 is a Saturday and is not a step.
    """
    if not isinstance(goal, dict):
        raise SettlementError("stretch goal is missing")
    start = parse_day(goal.get("startDate")) + timedelta(days=1)
    end = parse_day(goal.get("targetDate"))
    return session_dates(start, end)


def last_closed_session(now):
    moment = as_eastern(now)
    day = moment.date()
    minutes = moment.hour * 60 + moment.minute
    if is_nyse_session(day) and minutes >= CLOSE_MINUTES:
        return day
    return previous_nyse_session(day)


def is_working(order):
    if not isinstance(order, dict):
        return False
    if order.get("fillPrice") is not None or order.get("filledAt") or order.get("filled") is True:
        return False
    status = str(order.get("status") or "working").lower()
    return status not in TERMINAL


def latest_orders(book):
    latest = {}
    for order in book.get("workingOrders") or []:
        if isinstance(order, dict) and order.get("id"):
            latest[order["id"]] = order
    return list(latest.values())


def working_orders(book):
    return [order for order in latest_orders(book) if is_working(order)]


def require_buy_limit(order):
    side = str(order.get("side") or "").lower()
    style = str(order.get("orderType") or "").lower()
    if side not in {"buy", "long"} or style != "limit":
        raise SettlementError("only working buy limits are settled")
    for key in ("limitPrice", "stop", "target", "shares", "firstEligibleSession", "id", "symbol"):
        if order.get(key) is None or order.get(key) == "":
            raise SettlementError("working order missing " + key)


def require_long(position):
    side = str(position.get("side") or "long").lower()
    if side not in {"buy", "long"}:
        raise SettlementError("only open longs are settled")
    for key in ("id", "symbol", "shares", "entryPrice", "stop", "target"):
        if position.get(key) is None or position.get(key) == "":
            raise SettlementError("open position missing " + key)


def symbols_in_play(book):
    symbols = []
    for order in working_orders(book):
        symbol = order.get("symbol")
        if symbol and symbol not in symbols:
            symbols.append(symbol)
    for position in book.get("openPositions") or []:
        if isinstance(position, dict) and position.get("symbol") and position["symbol"] not in symbols:
            symbols.append(position["symbol"])
    return symbols


def earliest_activity(book):
    days = []
    for order in working_orders(book):
        require_buy_limit(order)
        days.append(parse_day(order["firstEligibleSession"]))
    for position in book.get("openPositions") or []:
        if not isinstance(position, dict):
            continue
        require_long(position)
        raw = position.get("filledOn") or position.get("entryAt")
        if not raw:
            raise SettlementError("open position missing a fill session")
        days.append(parse_day(raw))
    if not days:
        return None
    return min(days)


def last_marked(book):
    found = None
    for event in book.get("events") or []:
        if not isinstance(event, dict) or event.get("type") != "mark" or not event.get("session"):
            continue
        day = parse_day(event["session"])
        if found is None or day > found:
            found = day
    return found


def sessions_due(book, now):
    through = last_closed_session(now)
    if through is None:
        return []
    start = earliest_activity(book)
    if start is None:
        return []
    start = on_or_after_session(start)
    if start is None:
        return []
    marked = last_marked(book)
    if marked is not None:
        nxt = next_nyse_session(marked)
        if nxt is None:
            return []
        if nxt > start:
            start = nxt
    if start > through:
        return []
    return session_dates(start, through)


def already_marked(book, day):
    token = day.isoformat()
    for event in book.get("events") or []:
        if isinstance(event, dict) and event.get("type") == "mark" and event.get("session") == token:
            return True
    return False


def normalize_bar(raw, symbol, day):
    label = symbol + " on " + day.isoformat()
    if not isinstance(raw, dict):
        raise SettlementError("no usable bar for " + label)
    try:
        opened = to_cents(raw["open"])
        high = to_cents(raw["high"])
        low = to_cents(raw["low"])
        close = to_cents(raw["close"])
    except (KeyError, SettlementError) as error:
        raise SettlementError("no usable bar for " + label) from error
    if min(opened, high, low, close) <= 0 or high < max(opened, close, low) or low > min(opened, close):
        raise SettlementError("no usable bar for " + label)
    return {"open": opened, "high": high, "low": low, "close": close}


def require_bar(bars, symbol, day):
    found = bars.get(symbol) if isinstance(bars, dict) else None
    raw = found.get(day.isoformat()) if isinstance(found, dict) else None
    if raw is None:
        raise SettlementError("no usable bar for " + symbol + " on " + day.isoformat())
    return normalize_bar(raw, symbol, day)


def cash_on_hand(book):
    balances = book.get("balances") if isinstance(book.get("balances"), dict) else {}
    if "cash" in balances:
        return to_cents(balances["cash"])
    account = book.get("account") if isinstance(book.get("account"), dict) else {}
    return to_cents(account.get("startingCash", 1000))


def goal_cents(book):
    account = book.get("account") if isinstance(book.get("account"), dict) else {}
    return to_cents(account.get("goalEquity", 1000000))


def start_cents(book):
    account = book.get("account") if isinstance(book.get("account"), dict) else {}
    return to_cents(account.get("startingCash", 1000))


def append_event(book, event):
    book.setdefault("events", []).append(event)


def share_count(record):
    count = shares_of(record)
    if count == count.to_integral_value():
        return int(count)
    return float(count)


def exit_fill(bar, stop, target, from_above):
    """Stop wins when both prices are touched. See the module rules."""
    hit_stop = bar["low"] <= stop
    hit_target = bar["close"] >= target if from_above else bar["high"] >= target
    if hit_stop:
        return "stop", min(bar["open"], stop)
    if hit_target:
        if from_above:
            return "target", target
        return "target", max(bar["open"], target)
    return None, None


def position_from_fill(order, price, day, stamp, hold_days):
    position = {
        "id": order["id"],
        "symbol": order["symbol"],
        "name": order.get("name") or order["symbol"],
        "side": "long",
        "shares": share_count(order),
        "entryAt": stamp,
        "entryPrice": from_cents(price),
        "filledOn": day.isoformat(),
        "stop": order["stop"],
        "target": order["target"],
        "timeStopTradingDaysAfterFill": hold_days,
        "mark": from_cents(price),
        "markedAt": stamp,
        "unrealizedPnlUsd": 0,
        "unrealizedPnlPct": 0,
    }
    if order.get("riskPctAtLimit") is not None:
        position["riskPctAtLimit"] = order["riskPctAtLimit"]
    if order.get("riskUsdAtLimit") is not None:
        position["riskUsdAtLimit"] = order["riskUsdAtLimit"]
    return position


def apply_fill(book, order, bar, day, stamp, price):
    record = copy.deepcopy(order)
    record["status"] = "filled"
    record["at"] = stamp
    record["filledAt"] = stamp
    record["filledOn"] = day.isoformat()
    record["fillPrice"] = from_cents(price)
    record["note"] = (
        "Filled on " + day.isoformat() + " at " + fmt_price(price)
        + ". Paper fill. The earlier working record stays on the log."
    )
    book.setdefault("workingOrders", []).append(record)
    hold_days = rule_int(order, book, "timeStopTradingDaysAfterFill", "timeStopTradingDays", 8)
    position = position_from_fill(order, price, day, stamp, hold_days)
    book.setdefault("openPositions", []).append(position)
    shares = share_count(order)
    append_event(book, {
        "at": stamp,
        "session": day.isoformat(),
        "type": "fill",
        "symbol": order["symbol"],
        "orderId": order["id"],
        "price": from_cents(price),
        "shares": shares,
        "detail": (
            "Filled buy limit "
            + str(shares)
            + " shares of "
            + order["symbol"]
            + " at "
            + fmt_price(price)
            + ". Session open "
            + fmt_price(bar["open"])
            + ", high "
            + fmt_price(bar["high"])
            + ", low "
            + fmt_price(bar["low"])
            + ", close "
            + fmt_price(bar["close"])
            + ". The low was at or below the "
            + fmt_price(to_cents(order["limitPrice"]))
            + " limit, so the fill is the lesser of the open and the limit. Paper fill only."
        ),
    })
    return cash_for(shares_of(order), price), position


def apply_expiry(book, order, day, stamp, window):
    record = copy.deepcopy(order)
    record["status"] = "expired"
    record["at"] = stamp
    record["expiredOn"] = day.isoformat()
    record["note"] = "Expired unfilled on " + day.isoformat() + ". Not a fill."
    record["reason"] = "Expired unfilled. Not a fill."
    book.setdefault("workingOrders", []).append(record)
    shares = share_count(order)
    append_event(book, {
        "at": stamp,
        "session": day.isoformat(),
        "type": "expiry",
        "symbol": order["symbol"],
        "orderId": order["id"],
        "shares": shares,
        "detail": (
            "Expired unfilled buy limit "
            + str(shares)
            + " shares of "
            + order["symbol"]
            + " at "
            + fmt_price(to_cents(order["limitPrice"]))
            + ". The "
            + str(window)
            + "-session fill window ended "
            + day.isoformat()
            + ". Not a fill."
        ),
    })


MIN_RISK_PCT = Decimal("25")
MAX_RISK_PCT = Decimal("50")
SCORE_FLOOR = Decimal("36")
SCORE_CEILING = Decimal("100")


def _pct_decimal(value, default):
    if isinstance(value, bool) or value is None:
        return default
    try:
        number = Decimal(str(value))
    except (ArithmeticError, ValueError):
        return default
    if number <= 0:
        return default
    return number


def paper_risk_band(rules=None):
    """Minimum and maximum risk percent for a new paper order.

    The minimum defaults to 25% of equity. The maximum defaults to 50%.
    A single riskPerTradePct is the minimum when the explicit minimum is absent.
    """
    rules = rules if isinstance(rules, dict) else {}
    minimum = _pct_decimal(rules.get("minRiskPerTradePct"), None)
    if minimum is None:
        minimum = _pct_decimal(rules.get("riskPerTradePct"), MIN_RISK_PCT)
    maximum = _pct_decimal(rules.get("maxRiskPerTradePct"), MAX_RISK_PCT)
    if maximum < minimum:
        maximum = minimum
    if minimum > 100:
        minimum = Decimal(100)
    if maximum > 100:
        maximum = Decimal(100)
    return minimum, maximum


def swing_strength(score):
    """0 at the existing swing-score floor of 36, 1 at 100. A missing score is 0."""
    if score is None or isinstance(score, bool):
        return Decimal(0)
    try:
        value = Decimal(str(score))
    except (ArithmeticError, ValueError):
        return Decimal(0)
    if value <= SCORE_FLOOR:
        return Decimal(0)
    if value >= SCORE_CEILING:
        return Decimal(1)
    return (value - SCORE_FLOOR) / (SCORE_CEILING - SCORE_FLOOR)


def size_paper_order(equity, cash_available, entry, stop, strength=0, min_pct=None, max_pct=None):
    """Share count for a new paper order. Does not read or write the ledger.

    Risk dollars are equity times a percent between the minimum and the maximum.
    strength 0 uses the minimum and strength 1 uses the maximum. Shares are
    floor(risk dollars / (entry - stop)). Available cash and 100% of equity
    then cap the count. Cash above equity cannot lever the book.
    """
    minimum = MIN_RISK_PCT if min_pct is None else _pct_decimal(min_pct, MIN_RISK_PCT)
    maximum = MAX_RISK_PCT if max_pct is None else _pct_decimal(max_pct, MAX_RISK_PCT)
    if maximum < minimum:
        maximum = minimum
    if minimum > 100:
        minimum = Decimal(100)
    if maximum > 100:
        maximum = Decimal(100)
    try:
        weight = Decimal(str(0 if isinstance(strength, bool) else strength))
    except (ArithmeticError, ValueError, TypeError):
        weight = Decimal(0)
    if weight < 0:
        weight = Decimal(0)
    if weight > 1:
        weight = Decimal(1)
    target = (minimum + (maximum - minimum) * weight).quantize(CENT, rounding=ROUND_HALF_UP)
    entry_cents = to_cents(entry)
    stop_cents = to_cents(stop)
    equity_cents = to_cents(equity)
    cash_cents = to_cents(0 if cash_available is None else cash_available)
    distance = entry_cents - stop_cents
    empty = {
        "shares": 0,
        "riskTargetPct": json_number(target),
        "riskPct": 0,
        "riskUsd": 0,
        "bookPct": 0,
        "notional": 0,
        "cappedByCash": False,
        "cappedByBook": False,
    }
    if entry_cents <= 0 or distance <= 0 or equity_cents <= 0:
        empty["reason"] = "No shares. The entry has to be above the stop, and the book has to have equity."
        return empty
    risk_budget = int((Decimal(equity_cents) * target / Decimal(100)).quantize(PENNY, rounding=ROUND_HALF_UP))
    raw_shares = risk_budget // distance if distance else 0
    cash_shares = cash_cents // entry_cents if cash_cents > 0 else 0
    book_shares = equity_cents // entry_cents
    shares = raw_shares
    capped_cash = shares > cash_shares
    if capped_cash:
        shares = cash_shares
    capped_book = shares >= book_shares and raw_shares >= book_shares and book_shares > 0
    if shares > book_shares:
        shares = book_shares
    if shares < 0:
        shares = 0
    risk_cents = shares * distance
    notional = shares * entry_cents
    result = {
        "shares": shares,
        "riskTargetPct": json_number(target),
        "riskPct": book_percent(risk_cents, equity_cents) if shares else 0,
        "riskUsd": from_cents(risk_cents),
        "bookPct": book_percent(notional, equity_cents) if shares else 0,
        "notional": from_cents(notional),
        "cappedByCash": capped_cash,
        "cappedByBook": capped_book,
    }
    result["reason"] = size_reason(result)
    return result


def size_reason(sized):
    """One line for a newly sized paper order."""
    if not sized.get("shares"):
        return "No shares. One share would use more risk budget or more cash than this paper book allows."
    text = (
        "Paper size. Target risk "
        + _plain_pct(sized.get("riskTargetPct"))
        + " of equity, "
        + str(sized["shares"])
        + " shares, "
        + _plain_pct(sized.get("riskPct"))
        + " actually at risk, "
        + _plain_pct(sized.get("bookPct"))
        + " of the book."
    )
    if sized.get("cappedByBook"):
        text += " Capped at 100% of the book. No margin."
    elif sized.get("cappedByCash"):
        text += " Capped by available cash."
    return text


def _plain_pct(value):
    try:
        number = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (ArithmeticError, ValueError, TypeError):
        return "0.00%"
    return f"{number:.2f}%"


def book_percent(notional_cents, equity_cents):
    """Fill notional as a percent of equity, half-up to a hundredth of a percent."""
    percent, _text = fmt_pct(notional_cents, equity_cents)
    return percent


def exit_reason_line(reason, from_above):
    """One line for the public log. The longer bar note stays on the event."""
    if reason == "stop":
        return "Stop. The session low was at or below the stop."
    if reason == "target" and from_above:
        return "Target. The close reached the target after the limit filled below the open."
    if reason == "target":
        return "Target. The session high reached the target."
    if reason == "time":
        return "Time stop. Still open when the time stop came due, so the exit is the close."
    return "Closed."


def record_exit(book, position, day, stamp, reason, price, bar, from_above, cash):
    entry = to_cents(position["entryPrice"])
    shares = shares_of(position)
    proceeds = cash_for(shares, price)
    realized = proceeds - cash_for(shares, entry)
    percent, _percent_text = fmt_pct(realized, cash_for(shares, entry))
    book["openPositions"] = [item for item in book.get("openPositions") or [] if item is not position]
    cash += proceeds
    equity = cash + market_cents(book)
    if reason == "stop":
        why = "Stop exit"
        how = "the low was at or below the stop, so the exit is the lesser of the open and the stop"
    elif reason == "target":
        why = "Target exit"
        if from_above:
            how = "the limit filled below the open and the close reached the target, so the exit is the target"
        else:
            how = "the high reached the target, so the exit is the greater of the open and the target"
    else:
        why = "Time stop"
        how = "the position was still open after its time stop, so the exit is the session close, not a stop and not a target"
    trade = {
        "id": position["id"],
        "symbol": position["symbol"],
        "side": "long",
        "shares": share_count(position),
        "entryAt": position.get("entryAt"),
        "entryPrice": position["entryPrice"],
        "stop": position.get("stop"),
        "target": position.get("target"),
        "exitAt": stamp,
        "exitPrice": from_cents(price),
        "exitReason": reason,
        "realizedPnlUsd": from_cents(realized),
        "realizedPnlPct": percent,
        "cashAfter": from_cents(cash),
        "equityAfter": from_cents(equity),
        "reason": exit_reason_line(reason, from_above),
    }
    if position.get("bookPctAtEntry") is not None:
        trade["bookPctAtEntry"] = position["bookPctAtEntry"]
    if position.get("riskPctAtLimit") is not None:
        trade["riskPctAtLimit"] = position["riskPctAtLimit"]
    if position.get("riskUsdAtLimit") is not None:
        trade["riskUsdAtLimit"] = position["riskUsdAtLimit"]
    book.setdefault("closedTrades", []).append(trade)
    append_event(book, {
        "at": stamp,
        "session": day.isoformat(),
        "type": "exit",
        "symbol": trade["symbol"],
        "orderId": trade["id"],
        "exitReason": reason,
        "price": trade["exitPrice"],
        "shares": trade["shares"],
        "detail": (
            why
            + " for "
            + str(trade["shares"])
            + " shares of "
            + trade["symbol"]
            + " at "
            + fmt_price(price)
            + ". Session open "
            + fmt_price(bar["open"])
            + ", high "
            + fmt_price(bar["high"])
            + ", low "
            + fmt_price(bar["low"])
            + ", close "
            + fmt_price(bar["close"])
            + "; "
            + how
            + ". Paper exit only."
        ),
    })
    return cash


def mark_position(position, close, stamp):
    entry = to_cents(position["entryPrice"])
    shares = shares_of(position)
    change = cash_for(shares, close) - cash_for(shares, entry)
    percent, _text = fmt_pct(change, cash_for(shares, entry))
    position["mark"] = from_cents(close)
    position["markedAt"] = stamp
    position["unrealizedPnlUsd"] = from_cents(change)
    position["unrealizedPnlPct"] = percent


def reserved_cents(book):
    total = 0
    for order in working_orders(book):
        if order.get("reservedCash") is not None:
            total += to_cents(order["reservedCash"])
        else:
            total += cash_for(shares_of(order), to_cents(order["limitPrice"]))
    return total


def risk_cents(book):
    total = 0
    for order in working_orders(book):
        if order.get("riskUsdAtLimit") is not None:
            total += to_cents(order["riskUsdAtLimit"])
        else:
            distance = to_cents(order["limitPrice"]) - to_cents(order["stop"])
            total += cash_for(shares_of(order), max(0, distance))
    for position in book.get("openPositions") or []:
        distance = to_cents(position["entryPrice"]) - to_cents(position["stop"])
        total += cash_for(shares_of(position), max(0, distance))
    return total


def market_cents(book):
    total = 0
    for position in book.get("openPositions") or []:
        total += cash_for(shares_of(position), to_cents(position["mark"]))
    return total


def write_balances(book, cash, stamp, day):
    balances = book.setdefault("balances", {})
    reserved = reserved_cents(book)
    market = market_cents(book)
    equity = cash + market
    start = start_cents(book)
    goal = goal_cents(book)
    progress, progress_text = fmt_pct(equity, goal)
    balances["cash"] = from_cents(cash)
    balances["cashReserved"] = from_cents(reserved)
    balances["cashAvailable"] = from_cents(cash - reserved)
    balances["marketValue"] = from_cents(market)
    balances["equity"] = from_cents(equity)
    balances["openRiskUsd"] = from_cents(risk_cents(book))
    balances["asOf"] = stamp
    balances["markSource"] = "Yahoo Finance public daily chart, regular session"
    balances["versusStartUsd"] = from_cents(equity - start)
    balances["goalProgressPct"] = progress
    marks = []
    for position in book.get("openPositions") or []:
        marks.append(position["symbol"] + " " + fmt_price(to_cents(position["mark"])))
    detail = (
        "Marked "
        + day.isoformat()
        + ". Equity "
        + fmt_money(equity)
        + ", cash "
        + fmt_money(cash)
        + ", reserved "
        + fmt_money(reserved)
        + ", available "
        + fmt_money(cash - reserved)
        + ", market value "
        + fmt_money(market)
        + ", open risk "
        + fmt_money(risk_cents(book))
        + ". Versus start "
        + fmt_money(equity - start)
        + ". Goal progress "
        + progress_text
        + "."
    )
    if marks:
        detail += " Marks " + ", ".join(marks) + "."
    append_event(book, {
        "at": stamp,
        "session": day.isoformat(),
        "type": "mark",
        "detail": detail,
    })


def hold_days_for(position, book):
    found = positive_int(position, "timeStopTradingDaysAfterFill")
    if found is not None:
        return found
    return rule_int(position, book, "timeStopTradingDaysAfterFill", "timeStopTradingDays", 8)


def apply_session(book, day, bars):
    if already_marked(book, day):
        return
    stamp = session_stamp(day)
    cash = cash_on_hand(book)
    filled_from_above = {}
    for order in list(working_orders(book)):
        require_buy_limit(order)
        if day < parse_day(order["firstEligibleSession"]):
            continue
        bar = require_bar(bars, order["symbol"], day)
        limit = to_cents(order["limitPrice"])
        window = rule_int(order, book, "fillWindowTradingDays", "fillWindowTradingDays", 5)
        if bar["low"] <= limit:
            price = min(bar["open"], limit)
            equity_before = cash + market_cents(book)
            spent, position = apply_fill(book, order, bar, day, stamp, price)
            cash -= spent
            if equity_before > 0:
                position["bookPctAtEntry"] = book_percent(spent, equity_before)
                filled = book["workingOrders"][-1]
                if filled.get("id") == order.get("id"):
                    filled["bookPctAtEntry"] = position["bookPctAtEntry"]
            filled_from_above[position["id"]] = bar["open"] > limit
        elif session_count(parse_day(order["firstEligibleSession"]), day) >= window:
            apply_expiry(book, order, day, stamp, window)
    for position in list(book.get("openPositions") or []):
        require_long(position)
        bar = require_bar(bars, position["symbol"], day)
        from_above = filled_from_above.get(position["id"], False)
        reason, price = exit_fill(bar, to_cents(position["stop"]), to_cents(position["target"]), from_above)
        filled_on = parse_day(position.get("filledOn") or position.get("entryAt"))
        if reason is None and session_count(filled_on, day) >= hold_days_for(position, book):
            reason, price = "time", bar["close"]
        if reason is None:
            mark_position(position, bar["close"], stamp)
            continue
        cash = record_exit(book, position, day, stamp, reason, price, bar, from_above, cash)
    write_balances(book, cash, stamp, day)


def settle_book(book, bars, now):
    """Return a new book and the session dates applied. The input is not mutated."""
    book = copy.deepcopy(book)
    applied = []
    for day in sessions_due(book, now):
        if already_marked(book, day):
            continue
        apply_session(book, day, bars)
        applied.append(day.isoformat())
    return book, applied


def dumps(book):
    return json.dumps(book, indent=2, ensure_ascii=False) + "\n"


def atomic_write(path, text):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def read_chart(opener, url):
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
                time.sleep(min(8, 0.4 * (2 ** attempt)))
                continue
            break
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = str(error).splitlines()[0][:160]
            if attempt + 1 < 4:
                time.sleep(min(8, 0.4 * (2 ** attempt)))
                continue
            break
    raise SettlementError("quote source failed (" + last + ")")


def fetch_symbol(opener, symbol):
    url = CHART.format(symbol=urllib.parse.quote(symbol, safe=""))
    try:
        payload = json.loads(read_chart(opener, url))
    except json.JSONDecodeError as error:
        raise SettlementError("quote source failed (bad JSON for " + symbol + ")") from error
    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not isinstance(result, dict):
        raise SettlementError("quote source failed (empty chart for " + symbol + ")")
    meta = result.get("meta") if isinstance(result.get("meta"), dict) else {}
    if meta.get("currency") not in (None, "USD"):
        raise SettlementError("quote source failed (not USD for " + symbol + ")")
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    if not isinstance(quote, dict):
        raise SettlementError("quote source failed (empty chart for " + symbol + ")")
    bars = {}
    for index, moment in enumerate(timestamps):
        try:
            raw = {
                "open": quote["open"][index],
                "high": quote["high"][index],
                "low": quote["low"][index],
                "close": quote["close"][index],
            }
        except (TypeError, IndexError, KeyError):
            continue
        if any(value is None for value in raw.values()):
            continue
        day = chart_session_date(moment)
        try:
            normalize_bar(raw, symbol, day)
        except SettlementError:
            continue
        bars[day.isoformat()] = {
            "open": from_cents(to_cents(raw["open"])),
            "high": from_cents(to_cents(raw["high"])),
            "low": from_cents(to_cents(raw["low"])),
            "close": from_cents(to_cents(raw["close"])),
        }
    if not bars:
        raise SettlementError("quote source failed (no daily bars for " + symbol + ")")
    return bars


def fetch_yahoo(symbols):
    opener = urllib.request.build_opener()
    return {symbol: fetch_symbol(opener, symbol) for symbol in symbols}


def settle_path(path, now, fetch=None):
    if fetch is None:
        fetch = fetch_yahoo
    path = Path(path)
    original = path.read_text(encoding="utf-8")
    book = json.loads(original)
    due = sessions_due(book, now)
    if not due:
        print("No completed NYSE session to settle.")
        return 0
    symbols = symbols_in_play(book)
    if not symbols:
        print("No working orders or open positions to settle.")
        return 0
    bars = fetch(symbols)
    updated, applied = settle_book(book, bars, now)
    if not applied:
        print("Sessions already settled.")
        return 0
    text = dumps(updated)
    if text == original:
        print("Ledger unchanged.")
        return 0
    atomic_write(path, text)
    print("Settled " + ", ".join(applied) + ".")
    balances = updated.get("balances") or {}
    print(
        "Equity "
        + str(balances.get("equity"))
        + ", cash "
        + str(balances.get("cash"))
        + ", reserved "
        + str(balances.get("cashReserved"))
        + "."
    )
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Settle the paper swing book from regular-session OHLC.")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--now", default="", help="ISO datetime with a timezone. Defaults to America/New_York now.")
    args = parser.parse_args(argv)
    now = parse_now(args.now) if args.now else eastern_now()
    try:
        return settle_path(Path(args.ledger), now)
    except (OSError, json.JSONDecodeError, SettlementError) as error:
        print("Settlement failed (" + str(error).splitlines()[0][:200] + "). Ledger not written.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
