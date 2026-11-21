#!/usr/bin/env python3
"""Fixture tests for the paper crypto refresh. No network."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_crypto as crypto

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "stocks" / "crypto.json"
WORKFLOW = ROOT / ".github" / "workflows" / "crypto-refresh.yml"
PRODUCTION = FILE.read_text(encoding="utf-8")
NOW = datetime(2026, 11, 22, 0, 15, tzinfo=timezone.utc)
RULES = json.loads(PRODUCTION)["rules"]


def series(before, middle, last, count=199):
    return [Decimal(before)] + [Decimal(middle)] * count + [Decimal(last)]


def mark(closes, volume="50000000"):
    return {"closes": closes, "volume": Decimal(volume)}


def rising():
    return series(80, 100, 120)


def falling_under():
    return series(150, 100, 80)


def above_falling():
    return series(200, 100, 150)


def book(rows):
    return {
        "updatedAt": "2026-11-21T14:02:00-05:00",
        "sleeve": {"start": "2026-11-21", "equity": 1000, "cash": 1000, "positions": []},
        "status": "No coin is eligible. Bitcoin is 17% under a falling 200-day.",
        "rules": list(RULES),
        "watchlist": rows,
    }


def row(symbol, name):
    return {
        "symbol": symbol,
        "name": name,
        "price": 1,
        "chg30d": 0,
        "vs200d": 0,
        "ma200": 1,
        "note": "",
    }


class RulesTest(unittest.TestCase):
    def test_production_rules_are_the_daily_screen(self):
        spec = crypto.read_rules(RULES)
        self.assertEqual(spec["days"], 200)
        self.assertEqual(spec["volume"], Decimal(20_000_000))
        self.assertEqual(spec["label"], "$20M")
        self.assertTrue(spec["btc_gate"])
        self.assertTrue(spec["rising"])

    def test_a_rule_edit_changes_the_volume_line(self):
        rules = [rule.replace("$20M", "$30M") for rule in RULES]
        spec = crypto.read_rules(rules)
        self.assertEqual(spec["volume"], Decimal(30_000_000))
        self.assertEqual(spec["label"], "$30M")

    def test_missing_screen_is_refused(self):
        kept = [rule for rule in RULES if "rising" not in rule.lower()]
        with self.assertRaises(crypto.RefreshError):
            crypto.read_rules(kept)


class MetricsTest(unittest.TestCase):
    def spec(self):
        return crypto.read_rules(RULES)

    def test_rising_coin_above_its_average(self):
        stats = crypto.metrics(mark(rising()), self.spec(), False)
        self.assertEqual(stats["price"], Decimal("120.00"))
        self.assertEqual(stats["ma200"], Decimal("100.10"))
        self.assertEqual(stats["chg30d"], 20)
        self.assertEqual(stats["vs200d"], 20)
        self.assertEqual(stats["slope"], "rising")
        self.assertEqual(stats["note"], "")

    def test_shiba_keeps_a_plain_decimal(self):
        closes = series("0.000002", "0.000003", "0.0000035805887460687546")
        stats = crypto.metrics(mark(closes), self.spec(), True)
        text = crypto.plain_number(stats["price"])
        self.assertEqual(stats["price"], Decimal("0.0000035805887460687546"))
        self.assertEqual(text, "0.0000035805887460687546")
        self.assertNotIn("e", text.lower())
        self.assertEqual(stats["slope"], "rising")

    def test_volume_note_uses_the_rule_label(self):
        stats = crypto.metrics(mark(rising(), "8000000"), self.spec(), False)
        self.assertEqual(stats["note"], "under the $20M volume minimum.")
        self.assertFalse(crypto.qualifies(stats, True, self.spec()))

    def test_exact_volume_minimum_passes(self):
        stats = crypto.metrics(mark(rising(), "20000000"), self.spec(), False)
        self.assertEqual(stats["note"], "")
        self.assertTrue(crypto.qualifies(stats, True, self.spec()))

    def test_bitcoin_below_its_average_blocks_every_coin(self):
        spec = self.spec()
        btc = crypto.metrics(mark(falling_under()), spec, False)
        eth = crypto.metrics(mark(rising()), spec, False)
        self.assertEqual(btc["vs200d"], -20)
        self.assertEqual(btc["slope"], "falling")
        self.assertFalse(crypto.qualifies(btc, False, spec))
        self.assertFalse(crypto.qualifies(eth, btc["price"] > btc["ma200"], spec))

    def test_bitcoin_above_a_falling_average_still_opens_the_gate(self):
        spec = self.spec()
        btc = crypto.metrics(mark(above_falling()), spec, False)
        eth = crypto.metrics(mark(rising()), spec, False)
        above = btc["price"] > btc["ma200"]
        self.assertTrue(above)
        self.assertEqual(btc["slope"], "falling")
        self.assertFalse(crypto.qualifies(btc, above, spec))
        self.assertTrue(crypto.qualifies(eth, above, spec))
        self.assertEqual(
            crypto.status_sentence(btc, ["ETH"], 200),
            "ETH is eligible. Bitcoin is 50% above a falling 200-day.",
        )


class ApplyTest(unittest.TestCase):
    def test_status_names_qualifying_coins_in_watchlist_order(self):
        payload = book([
            row("BTC", "Bitcoin"),
            row("ETH", "Ethereum"),
            row("SOL", "Solana"),
            row("CC", "Canton Coin"),
        ])
        sleeve = copy.deepcopy(payload["sleeve"])
        rules = copy.deepcopy(payload["rules"])
        marks = {
            "BTC": mark(rising()),
            "ETH": mark(rising()),
            "SOL": mark(rising()),
            "CC": mark(rising(), "8000000"),
        }
        crypto.apply_quotes(payload, marks, NOW)
        self.assertEqual(payload["sleeve"], sleeve)
        self.assertEqual(payload["rules"], rules)
        self.assertEqual(
            payload["status"],
            "BTC, ETH, and SOL are eligible. Bitcoin is 20% above a rising 200-day.",
        )
        self.assertEqual(payload["updatedAt"], "2026-11-21T19:15:00-05:00")
        self.assertEqual(payload["watchlist"][3]["note"], "under the $20M volume minimum.")
        self.assertEqual(payload["watchlist"][0]["note"], "")
        self.assertEqual(
            list(payload["watchlist"][0]),
            ["symbol", "name", "price", "chg30d", "vs200d", "ma200", "note"],
        )

    def test_no_coin_when_bitcoin_is_under(self):
        payload = book([row("BTC", "Bitcoin"), row("ETH", "Ethereum")])
        crypto.apply_quotes(payload, {"BTC": mark(falling_under()), "ETH": mark(rising())}, NOW)
        self.assertEqual(
            payload["status"],
            "No coin is eligible. Bitcoin is 20% under a falling 200-day.",
        )

    def test_unknown_symbol_does_not_write(self):
        payload = book([row("BTC", "Bitcoin"), row("DOGE", "Dogecoin"), row("NEW", "New")])
        with self.assertRaises(crypto.RefreshError):
            crypto.apply_quotes(payload, {"BTC": mark(rising()), "DOGE": mark(rising())}, NOW)

    def test_short_history_does_not_score(self):
        with self.assertRaises(crypto.RefreshError):
            crypto.metrics(mark(series(1, 1, 1, count=10)), crypto.read_rules(RULES), False)


class FileTest(unittest.TestCase):
    def test_renderer_matches_the_stored_file(self):
        book_value = json.loads(PRODUCTION, parse_float=Decimal)
        self.assertEqual(crypto.render(book_value), PRODUCTION)

    def test_failed_fetch_keeps_the_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "crypto.json"
            path.write_text(PRODUCTION, encoding="utf-8")
            before = path.read_bytes()

            def boom(_symbols, _now):
                raise crypto.RefreshError("quote source failed (HTTP 503)")

            with self.assertRaises(crypto.RefreshError):
                crypto.refresh_path(path, NOW, boom)
            self.assertEqual(path.read_bytes(), before)

    def test_success_leaves_sleeve_and_rules_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "crypto.json"
            original = json.loads(PRODUCTION, parse_float=Decimal)
            original["sleeve"]["positions"] = [{"symbol": "BTC", "shares": Decimal("0.25")}]
            original["sleeve"]["label"] = "paper"
            path.write_text(crypto.render(original), encoding="utf-8")
            sleeve = copy.deepcopy(original["sleeve"])
            rules = copy.deepcopy(original["rules"])

            def quotes(symbols, _now):
                return {symbol: mark(rising() if symbol != "CC" else rising(), "8000000" if symbol == "CC" else "90000000") for symbol in symbols}

            self.assertEqual(crypto.refresh_path(path, NOW, quotes), 0)
            written = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
            self.assertEqual(written["sleeve"], sleeve)
            self.assertEqual(written["rules"], rules)
            self.assertNotIn("e-", path.read_text(encoding="utf-8").lower())
            shib = next(row for row in written["watchlist"] if row["symbol"] == "SHIB")
            self.assertGreater(shib["price"], 0)
            text = path.read_text(encoding="utf-8")
            self.assertIn('"positions": [\n      {\n        "symbol": "BTC",\n        "shares": 0.25\n      }\n    ]', text)
            self.assertIn('"label": "paper"', text)

    def test_identical_text_is_not_rewritten(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "crypto.json"
            payload = book([row("BTC", "Bitcoin")])
            crypto.apply_quotes(payload, {"BTC": mark(rising())}, NOW)
            text = crypto.render(payload)
            path.write_text(text, encoding="utf-8")
            stamp = path.stat().st_mtime_ns

            def same(_symbols, _now):
                return {"BTC": mark(rising())}

            self.assertEqual(crypto.refresh_path(path, NOW, same), 0)
            self.assertEqual(path.read_text(encoding="utf-8"), text)
            self.assertEqual(path.stat().st_mtime_ns, stamp)


class ChartTest(unittest.TestCase):
    def bars(self, closes, volumes, start):
        timestamps = []
        day = start
        for _close in closes:
            timestamps.append(int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp()))
            day += timedelta(days=1)
        return timestamps, closes, volumes

    def test_yahoo_uses_the_completed_close_and_skips_the_open_bar(self):
        # Mark is 2026-11-22 00:00. The bar that starts 2026-11-21 closes then.
        # The bar that starts 2026-11-22 is the open day and must be ignored.
        start = datetime(2026, 11, 22, tzinfo=timezone.utc).date() - timedelta(days=210)
        closes = [Decimal(100)] * 211
        closes[-2] = Decimal("80")
        closes[-1] = Decimal("999")
        volumes = [Decimal(30_000_000)] * 211
        volumes[-2] = Decimal(40_000_000)
        volumes[-1] = Decimal(1)
        timestamps, raw_closes, raw_volumes = self.bars(closes, volumes, start)
        payload = {
            "chart": {
                "result": [{
                    "meta": {"currency": "USD"},
                    "timestamp": timestamps,
                    "indicators": {"quote": [{"close": raw_closes, "volume": raw_volumes}]},
                }]
            }
        }
        parsed = crypto.parse_yahoo(payload, NOW)
        self.assertEqual(parsed["closes"][-1], Decimal("80"))
        self.assertEqual(parsed["volume"], Decimal(40_000_000))
        self.assertNotIn(Decimal("999"), parsed["closes"])

    def test_gecko_uses_the_midnight_print_not_the_live_tick(self):
        end = datetime(2026, 11, 22, tzinfo=timezone.utc)
        prices = []
        volumes = []
        for age in range(210, -1, -1):
            moment = end - timedelta(days=age)
            prices.append([int(moment.timestamp()) * 1000, Decimal("0.0000035")])
            volumes.append([int(moment.timestamp()) * 1000, Decimal(25_000_000)])
        prices[-1][1] = Decimal("0.00000362")
        live = int(NOW.timestamp()) * 1000
        prices.append([live, Decimal("0.00000999")])
        volumes.append([live, Decimal(1)])
        parsed = crypto.parse_gecko({"prices": prices, "total_volumes": volumes}, NOW)
        self.assertEqual(parsed["closes"][-1], Decimal("0.00000362"))
        self.assertEqual(parsed["volume"], Decimal(25_000_000))
        self.assertNotIn(Decimal("0.00000999"), parsed["closes"])

    def test_missing_midnight_is_a_failure(self):
        with self.assertRaises(crypto.RefreshError):
            crypto.parse_gecko({"prices": [], "total_volumes": []}, NOW)

    def test_rate_limit_retries_on_the_second_yahoo_host(self):
        calls = []

        class Response:
            def __init__(self, body):
                self.body = body

            def read(self):
                return self.body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class Opener:
            def open(self, request, timeout=30):
                calls.append(request.full_url)
                if len(calls) == 1:
                    raise urllib.error.HTTPError(request.full_url, 429, "busy", None, None)
                return Response(b"{}")

        body = crypto.read_url(Opener(), "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1y", pause=lambda _seconds: None)
        self.assertEqual(body, b"{}")
        self.assertEqual(len(calls), 2)
        self.assertIn("query2.finance.yahoo.com", calls[1])


class WorkflowTest(unittest.TestCase):
    def test_schedule_is_0015_utc_every_day_and_commit_is_json_only(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        crons = [line.strip() for line in text.splitlines() if "cron:" in line]
        adds = [line.strip() for line in text.splitlines() if "git add" in line]
        self.assertEqual(crons, ["- cron: '15 0 * * *'"])
        self.assertIn("workflow_dispatch:", text)
        self.assertEqual(adds, ["git add stocks/crypto.json"])
        self.assertIn("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'", text)
        self.assertNotIn("git add -A", text)
        self.assertNotIn("git add .", text)


if __name__ == "__main__":
    unittest.main()
