#!/usr/bin/env python3
"""Fixture tests for paper-book settlement. No network."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

import paper_settlement as settle

EASTERN = ZoneInfo("America/New_York")
LEDGER = Path(__file__).resolve().parents[1] / "stocks" / "paper" / "ledger.json"
PRODUCTION_TEXT = LEDGER.read_text(encoding="utf-8")


def at(text):
    return datetime.fromisoformat(text)


def bar(open_, high, low, close):
    return {"open": open_, "high": high, "low": low, "close": close}


def quiet(day):
    return bar(50, 51, 49, 50)


def load_book():
    return json.loads(PRODUCTION_TEXT)


def types(book):
    return [event["type"] for event in book["events"]]


class PaperSettlementTest(unittest.TestCase):
    def book(self):
        return load_book()

    def assert_history_kept(self, original, updated):
        self.assertEqual(updated["events"][:2], original["events"])
        self.assertIn("\u2013", updated["events"][1]["detail"])
        self.assertEqual(updated["workingOrders"][0], original["workingOrders"][0])
        self.assertEqual(updated["skippedFromJournal"], original["skippedFromJournal"])
        self.assertEqual(updated["policy"], original["policy"])
        self.assertEqual(updated["schemaVersion"], 1)

    def test_calendar_matches_the_published_nyse_list(self):
        self.assertEqual(settle.nyse_closures(2026), {
            date(2026, 1, 1),
            date(2026, 1, 19),
            date(2026, 2, 16),
            date(2026, 4, 3),
            date(2026, 5, 25),
            date(2026, 6, 19),
            date(2026, 7, 3),
            date(2026, 9, 7),
            date(2026, 11, 26),
            date(2026, 12, 25),
        })
        self.assertEqual(settle.nyse_closures(2027), {
            date(2027, 1, 1),
            date(2027, 1, 18),
            date(2027, 2, 15),
            date(2027, 3, 26),
            date(2027, 5, 31),
            date(2027, 6, 18),
            date(2027, 7, 5),
            date(2027, 9, 6),
            date(2027, 11, 25),
            date(2027, 12, 24),
        })
        self.assertEqual(settle.nyse_closures(2028), {
            date(2028, 1, 17),
            date(2028, 2, 21),
            date(2028, 4, 14),
            date(2028, 5, 29),
            date(2028, 6, 19),
            date(2028, 7, 4),
            date(2028, 9, 4),
            date(2028, 11, 23),
            date(2028, 12, 25),
        })
        self.assertNotIn(date(2027, 12, 31), settle.nyse_closures(2027))
        self.assertNotIn(date(2028, 1, 1), settle.nyse_closures(2028))

    def test_veterans_day_is_a_session_and_early_closes_stay_open(self):
        self.assertTrue(settle.is_nyse_session(date(2026, 11, 11)))
        self.assertTrue(settle.is_nyse_session(date(2026, 10, 12)))
        self.assertTrue(settle.is_nyse_session(date(2026, 11, 27)))
        self.assertTrue(settle.is_nyse_session(date(2026, 12, 24)))
        self.assertTrue(settle.is_nyse_session(date(2028, 7, 3)))
        self.assertFalse(settle.is_nyse_session(date(2026, 11, 26)))
        self.assertFalse(settle.is_nyse_session(date(2026, 11, 14)))
        self.assertFalse(settle.is_nyse_session(date(2026, 11, 15)))
        self.assertEqual(
            [day.isoformat() for day in settle.session_dates(date(2026, 11, 11), date(2026, 11, 17))],
            ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17"],
        )

    def test_schedule_gate_is_dst_safe(self):
        book = self.book()
        winter_early = at("2026-11-11T20:30:00+00:00")
        winter_close = at("2026-11-11T21:30:00+00:00")
        summer_close = at("2026-07-15T20:30:00+00:00")
        summer_late = at("2026-07-15T21:30:00+00:00")
        self.assertEqual(settle.last_closed_session(winter_early), date(2026, 11, 10))
        self.assertEqual(settle.sessions_due(book, winter_early), [])
        self.assertEqual(settle.last_closed_session(winter_close), date(2026, 11, 11))
        self.assertEqual(settle.last_closed_session(summer_close), date(2026, 7, 15))
        self.assertEqual(settle.last_closed_session(summer_late), date(2026, 7, 15))
        self.assertEqual(settle.last_closed_session(at("2026-07-15T16:29:00-04:00")), date(2026, 7, 14))
        self.assertEqual(settle.last_closed_session(at("2026-11-14T12:00:00-05:00")), date(2026, 11, 13))
        self.assertEqual(settle.last_closed_session(at("2026-04-03T16:30:00-04:00")), date(2026, 4, 2))
        self.assertEqual(settle.session_stamp(date(2026, 11, 11)), "2026-11-11T16:05:00-05:00")
        self.assertEqual(settle.session_stamp(date(2026, 7, 15)), "2026-07-15T16:05:00-04:00")
        self.assertEqual(settle.chart_session_date(1794321000), date(2026, 11, 10))
        self.assertEqual(settle.chart_session_date(1793367000), date(2026, 10, 30))

    def test_fill_at_the_limit_when_the_session_trades_down_to_it(self):
        original = self.book()
        bars = {"ZD": {"2026-11-11": bar(48.20, 49.00, 46.10, 47.55)}}
        updated, applied = settle.settle_book(original, bars, at("2026-11-11T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-11"])
        self.assert_history_kept(original, updated)
        self.assertEqual(len(updated["workingOrders"]), 2)
        filled = updated["workingOrders"][1]
        self.assertEqual(filled["status"], "filled")
        self.assertEqual(filled["fillPrice"], 46.65)
        self.assertNotEqual(filled["fillPrice"], 47.55)
        self.assertEqual(filled["filledOn"], "2026-11-11")
        self.assertEqual(updated["openPositions"][0]["entryPrice"], 46.65)
        self.assertEqual(updated["openPositions"][0]["mark"], 47.55)
        self.assertEqual(updated["openPositions"][0]["unrealizedPnlUsd"], 4.5)
        self.assertEqual(updated["closedTrades"], [])
        balances = updated["balances"]
        self.assertEqual(balances["cash"], 766.75)
        self.assertEqual(balances["cashReserved"], 0)
        self.assertEqual(balances["cashAvailable"], 766.75)
        self.assertEqual(balances["marketValue"], 237.75)
        self.assertEqual(balances["equity"], 1004.5)
        self.assertEqual(balances["openRiskUsd"], 19.5)
        self.assertEqual(balances["versusStartUsd"], 4.5)
        self.assertEqual(balances["asOf"], "2026-11-11T16:05:00-05:00")
        self.assertEqual(types(updated), ["account_opened", "order_placed", "fill", "mark"])
        self.assertIn("Goal progress 0.10%", updated["events"][-1]["detail"])
        self.assertIn("Marks ZD 47.55", updated["events"][-1]["detail"])

    def test_yahoo_float_at_the_limit_still_fills(self):
        bars = {"ZD": {"2026-11-11": bar(50, 51, 46.650001525878906, 49)}}
        updated, _applied = settle.settle_book(self.book(), bars, at("2026-11-11T16:30:00-05:00"))
        self.assertEqual(updated["workingOrders"][1]["fillPrice"], 46.65)
        self.assertEqual(settle.to_cents(46.650001525878906), 4665)

    def test_fill_at_the_open_when_the_open_is_below_the_limit(self):
        bars = {"ZD": {"2026-11-11": bar(46.00, 47.00, 45.50, 46.40)}}
        updated, _applied = settle.settle_book(self.book(), bars, at("2026-11-11T16:30:00-05:00"))
        self.assertEqual(updated["openPositions"][0]["entryPrice"], 46)
        self.assertEqual(updated["balances"]["cash"], 770)
        self.assertEqual(updated["balances"]["openRiskUsd"], 16.25)
        self.assertEqual(updated["balances"]["marketValue"], 232)
        self.assertEqual(updated["balances"]["equity"], 1002)
        self.assertEqual(updated["openPositions"][0]["unrealizedPnlUsd"], 2)

    def test_no_fill_when_the_low_stays_above_the_limit(self):
        original = self.book()
        bars = {"ZD": {"2026-11-11": bar(50.10, 51.40, 46.66, 49.80)}}
        updated, applied = settle.settle_book(original, bars, at("2026-11-11T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-11"])
        self.assertEqual(updated["workingOrders"], original["workingOrders"])
        self.assertEqual(updated["openPositions"], [])
        self.assertEqual(updated["closedTrades"], [])
        self.assertEqual(types(updated), ["account_opened", "order_placed", "mark"])
        balances = updated["balances"]
        self.assertEqual(balances["cash"], 1000)
        self.assertEqual(balances["cashReserved"], 233.25)
        self.assertEqual(balances["cashAvailable"], 766.75)
        self.assertEqual(balances["marketValue"], 0)
        self.assertEqual(balances["equity"], 1000)
        self.assertEqual(balances["openRiskUsd"], 19.5)
        self.assertEqual(balances["versusStartUsd"], 0)
        self.assertIn("Goal progress 0.10%", updated["events"][-1]["detail"])

    def test_signal_session_and_an_open_session_do_not_fill(self):
        original = self.book()
        touch = bar(50, 51, 40, 50.56)
        bars = {"ZD": {"2026-11-10": touch, "2026-11-11": touch}}
        morning, applied = settle.settle_book(original, bars, at("2026-11-11T07:44:00-05:00"))
        self.assertEqual(applied, [])
        self.assertEqual(morning["events"], original["events"])
        self.assertEqual(morning["workingOrders"], original["workingOrders"])
        self.assertEqual(morning["balances"], original["balances"])
        later_bars = {
            "ZD": {
                "2026-11-10": touch,
                "2026-11-11": bar(51, 52, 48, 49),
            }
        }
        updated, applied = settle.settle_book(original, later_bars, at("2026-11-11T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-11"])
        self.assertEqual(len(updated["workingOrders"]), 1)
        self.assertEqual(updated["workingOrders"][0]["status"], "working")
        self.assertEqual(updated["openPositions"], [])
        self.assertEqual(updated["balances"]["cash"], 1000)
        self.assertNotIn("fill", types(updated))

    def test_stop_then_a_later_session(self):
        book = self.filled()
        bars = {"ZD": {"2026-11-12": bar(45, 45.50, 42, 43)}}
        updated, applied = settle.settle_book(book, bars, at("2026-11-12T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-12"])
        self.assertEqual(updated["openPositions"], [])
        trade = updated["closedTrades"][0]
        self.assertEqual(trade["exitReason"], "stop")
        self.assertEqual(trade["exitPrice"], 42.75)
        self.assertEqual(trade["entryPrice"], 46.65)
        self.assertEqual(trade["realizedPnlUsd"], -19.5)
        self.assertEqual(trade["realizedPnlPct"], -8.36)
        self.assertEqual(trade["cashAfter"], 980.5)
        self.assertEqual(trade["equityAfter"], 980.5)
        self.assertEqual(updated["balances"]["cash"], 980.5)
        self.assertEqual(updated["balances"]["equity"], 980.5)
        self.assertEqual(updated["balances"]["marketValue"], 0)
        self.assertEqual(updated["balances"]["openRiskUsd"], 0)
        self.assertEqual(updated["balances"]["versusStartUsd"], -19.5)
        exit_event = next(event for event in updated["events"] if event["type"] == "exit")
        self.assertEqual(exit_event["exitReason"], "stop")
        self.assertEqual(exit_event["session"], "2026-11-12")

    def test_target_on_a_later_session(self):
        book = self.filled()
        bars = {"ZD": {"2026-11-12": bar(54, 56.20, 53, 55.90)}}
        updated, _applied = settle.settle_book(book, bars, at("2026-11-12T16:30:00-05:00"))
        trade = updated["closedTrades"][0]
        self.assertEqual(trade["exitReason"], "target")
        self.assertEqual(trade["exitPrice"], 55.81)
        self.assertEqual(trade["realizedPnlUsd"], 45.8)
        self.assertEqual(trade["realizedPnlPct"], 19.64)
        self.assertEqual(updated["balances"]["cash"], 1045.8)
        self.assertEqual(updated["balances"]["equity"], 1045.8)
        self.assertEqual(updated["balances"]["versusStartUsd"], 45.8)

    def test_gap_down_through_the_stop_and_gap_through_the_target(self):
        book = self.filled()
        stopped, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-12": bar(40, 41, 39.50, 40.20)}},
            at("2026-11-12T16:30:00-05:00"),
        )
        stop = stopped["closedTrades"][0]
        self.assertEqual(stop["exitReason"], "stop")
        self.assertEqual(stop["exitPrice"], 40)
        self.assertEqual(stop["realizedPnlUsd"], -33.25)
        self.assertEqual(stopped["balances"]["cash"], 966.75)
        targeted, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-12": bar(57, 58, 56.50, 57.40)}},
            at("2026-11-12T16:30:00-05:00"),
        )
        target = targeted["closedTrades"][0]
        self.assertEqual(target["exitReason"], "target")
        self.assertEqual(target["exitPrice"], 57)
        self.assertEqual(target["realizedPnlUsd"], 51.75)
        self.assertEqual(targeted["balances"]["cash"], 1051.75)
        self.assertNotIn("target", [event["exitReason"] for event in stopped["events"] if event["type"] == "exit"])

    def test_same_bar_stop_and_target_stop_wins(self):
        book = self.filled()
        inside, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-12": bar(50, 60, 42, 48)}},
            at("2026-11-12T16:30:00-05:00"),
        )
        trade = inside["closedTrades"][0]
        self.assertEqual(trade["exitReason"], "stop")
        self.assertEqual(trade["exitPrice"], 42.75)
        self.assertNotEqual(trade["exitPrice"], 55.81)
        self.assertEqual(inside["balances"]["cash"], 980.5)
        gapped, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-12": bar(40, 60, 39, 41)}},
            at("2026-11-12T16:30:00-05:00"),
        )
        gap = gapped["closedTrades"][0]
        self.assertEqual(gap["exitReason"], "stop")
        self.assertEqual(gap["exitPrice"], 40)
        self.assertEqual(gapped["balances"]["equity"], 966.75)

    def test_fill_bar_does_not_sell_the_high_that_printed_before_the_limit(self):
        held, _applied = settle.settle_book(
            self.book(),
            {"ZD": {"2026-11-11": bar(50, 60, 46, 49)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        self.assertEqual(held["closedTrades"], [])
        self.assertEqual(held["openPositions"][0]["entryPrice"], 46.65)
        self.assertEqual(held["openPositions"][0]["mark"], 49)
        sold, _applied = settle.settle_book(
            self.book(),
            {"ZD": {"2026-11-11": bar(50, 60, 46, 56)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        trade = sold["closedTrades"][0]
        self.assertEqual(trade["exitReason"], "target")
        self.assertEqual(trade["exitPrice"], 55.81)
        self.assertEqual(sold["balances"]["cash"], 1045.8)
        stopped, _applied = settle.settle_book(
            self.book(),
            {"ZD": {"2026-11-11": bar(50, 51, 40, 42)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        self.assertEqual(stopped["closedTrades"][0]["exitReason"], "stop")
        self.assertEqual(stopped["closedTrades"][0]["exitPrice"], 42.75)

    def test_gap_through_the_limit_and_the_stop_on_the_fill_bar(self):
        updated, _applied = settle.settle_book(
            self.book(),
            {"ZD": {"2026-11-11": bar(40, 41, 39, 40.50)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        trade = updated["closedTrades"][0]
        self.assertEqual(updated["workingOrders"][1]["fillPrice"], 40)
        self.assertEqual(trade["entryPrice"], 40)
        self.assertEqual(trade["exitReason"], "stop")
        self.assertEqual(trade["exitPrice"], 40)
        self.assertEqual(trade["realizedPnlUsd"], 0)
        self.assertEqual(updated["balances"]["cash"], 1000)
        self.assertEqual(updated["balances"]["equity"], 1000)
        self.assertEqual(updated["openPositions"], [])

    def test_expiry_after_five_trading_sessions_and_a_last_day_fill(self):
        dates = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17"]
        quiet_bars = {"ZD": {day: quiet(day) for day in dates}}
        early, applied = settle.settle_book(self.book(), quiet_bars, at("2026-11-16T16:30:00-05:00"))
        self.assertEqual(applied, dates[:4])
        self.assertTrue(settle.is_working(early["workingOrders"][-1]))
        self.assertEqual(early["balances"]["cashReserved"], 233.25)
        self.assertNotIn("expiry", types(early))
        done, applied = settle.settle_book(early, quiet_bars, at("2026-11-17T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-17"])
        self.assertEqual(done["workingOrders"][-1]["status"], "expired")
        self.assertNotIn("fillPrice", done["workingOrders"][-1])
        self.assertEqual(done["openPositions"], [])
        self.assertEqual(done["closedTrades"], [])
        expiry = [event for event in done["events"] if event["type"] == "expiry"]
        self.assertEqual([event["session"] for event in expiry], ["2026-11-17"])
        self.assertIn("Not a fill", expiry[0]["detail"])
        self.assertEqual(done["balances"]["cash"], 1000)
        self.assertEqual(done["balances"]["cashReserved"], 0)
        self.assertEqual(done["balances"]["cashAvailable"], 1000)
        self.assertEqual(done["balances"]["equity"], 1000)
        self.assertEqual(done["balances"]["openRiskUsd"], 0)
        again, applied = settle.settle_book(done, quiet_bars, at("2026-11-17T17:30:00-05:00"))
        self.assertEqual(applied, [])
        self.assertEqual(again["events"], done["events"])

        touch = {"ZD": {day: quiet(day) for day in dates}}
        touch["ZD"]["2026-11-17"] = bar(48, 49, 46.20, 47)
        filled, _applied = settle.settle_book(self.book(), touch, at("2026-11-17T16:30:00-05:00"))
        self.assertEqual(filled["workingOrders"][-1]["status"], "filled")
        self.assertEqual(filled["workingOrders"][-1]["fillPrice"], 46.65)
        self.assertNotIn("expiry", types(filled))
        self.assertEqual(filled["openPositions"][0]["filledOn"], "2026-11-17")

    def test_fill_window_and_time_stop_come_from_the_order(self):
        book = self.book()
        book["workingOrders"][0]["fillWindowTradingDays"] = 1
        expired, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-11": quiet("2026-11-11")}},
            at("2026-11-11T16:30:00-05:00"),
        )
        self.assertEqual(expired["workingOrders"][-1]["status"], "expired")
        book = self.book()
        book["workingOrders"][0]["timeStopTradingDaysAfterFill"] = 1
        stopped, _applied = settle.settle_book(
            book,
            {"ZD": {"2026-11-11": bar(48.20, 49, 46.10, 47.55)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        trade = stopped["closedTrades"][0]
        self.assertEqual(trade["exitReason"], "time")
        self.assertEqual(trade["exitPrice"], 47.55)
        self.assertNotEqual(trade["exitPrice"], 49)
        self.assertEqual(trade["realizedPnlUsd"], 4.5)
        self.assertIn("not a stop and not a target", stopped["events"][3]["detail"])

    def test_time_stop_on_the_eighth_session_and_a_stop_that_wins_that_day(self):
        days = [
            "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16",
            "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
        ]
        bars = {"ZD": {day: bar(50, 52, 48, 51.25) for day in days}}
        bars["ZD"]["2026-11-11"] = bar(48.20, 49, 46.10, 47.55)
        updated, applied = settle.settle_book(self.book(), bars, at("2026-11-20T16:30:00-05:00"))
        self.assertEqual(applied, days)
        exits = [event for event in updated["events"] if event["type"] == "exit"]
        self.assertEqual(len(exits), 1)
        self.assertEqual(exits[0]["session"], "2026-11-20")
        self.assertEqual(exits[0]["exitReason"], "time")
        self.assertEqual(exits[0]["price"], 51.25)
        self.assertEqual(updated["closedTrades"][0]["realizedPnlUsd"], 23)
        self.assertEqual(updated["balances"]["cash"], 1023)
        self.assertEqual(updated["balances"]["equity"], 1023)
        self.assertEqual(updated["openPositions"], [])
        stopped_bars = {"ZD": dict(bars["ZD"])}
        stopped_bars["ZD"]["2026-11-20"] = bar(45, 46, 42, 43)
        stopped, _applied = settle.settle_book(self.book(), stopped_bars, at("2026-11-20T16:30:00-05:00"))
        self.assertEqual(stopped["closedTrades"][0]["exitReason"], "stop")
        self.assertEqual(stopped["closedTrades"][0]["exitPrice"], 42.75)
        self.assertNotEqual(stopped["closedTrades"][0]["exitReason"], "time")

    def test_thanksgiving_does_not_count_toward_the_fill_window(self):
        book = self.book()
        book["workingOrders"][0]["firstEligibleSession"] = "2026-11-23"
        dates = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27", "2026-11-30"]
        bars = {"ZD": {day: quiet(day) for day in dates}}
        early, applied = settle.settle_book(book, bars, at("2026-11-27T16:30:00-05:00"))
        self.assertEqual(applied, dates[:4])
        self.assertNotIn("2026-11-26", applied)
        self.assertTrue(settle.is_working(early["workingOrders"][-1]))
        done, applied = settle.settle_book(early, bars, at("2026-11-30T16:30:00-05:00"))
        self.assertEqual(applied, ["2026-11-30"])
        self.assertEqual(done["workingOrders"][-1]["status"], "expired")
        self.assertEqual(done["workingOrders"][-1]["expiredOn"], "2026-11-30")

    def test_rerun_does_not_post_a_second_fill_or_mark(self):
        bars = {"ZD": {"2026-11-11": bar(48.20, 49, 46.10, 47.55)}}
        now = at("2026-11-11T16:30:00-05:00")
        once, applied = settle.settle_book(self.book(), bars, now)
        self.assertEqual(applied, ["2026-11-11"])
        twice, applied = settle.settle_book(once, bars, at("2026-11-11T17:30:00-05:00"))
        self.assertEqual(applied, [])
        self.assertEqual(twice["events"], once["events"])
        self.assertEqual(twice["workingOrders"], once["workingOrders"])
        self.assertEqual(twice["openPositions"], once["openPositions"])
        morning, applied = settle.settle_book(once, bars, at("2026-11-12T07:44:00-05:00"))
        self.assertEqual(applied, [])
        self.assertEqual(len([event for event in morning["events"] if event["type"] == "fill"]), 1)
        self.assertEqual(len([event for event in morning["events"] if event["type"] == "mark"]), 1)

    def test_quote_failure_and_a_bad_bar_do_not_write(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ledger.json"
            path.write_text(PRODUCTION_TEXT, encoding="utf-8")
            before = path.read_bytes()
            real_fetch = settle.fetch_yahoo

            def boom(_symbols):
                raise settle.SettlementError("quote source failed (HTTP 503)")

            with self.assertRaises(settle.SettlementError):
                settle.settle_path(path, at("2026-11-11T16:30:00-05:00"), fetch=boom)
            self.assertEqual(path.read_bytes(), before)

            def missing(_symbols):
                return {"ZD": {}}

            with self.assertRaises(settle.SettlementError):
                settle.settle_path(path, at("2026-11-11T16:30:00-05:00"), fetch=missing)
            self.assertEqual(path.read_bytes(), before)

            def crossed(_symbols):
                return {"ZD": {"2026-11-11": bar(10, 9, 8, 9)}}

            with self.assertRaises(settle.SettlementError):
                settle.settle_path(path, at("2026-11-11T16:30:00-05:00"), fetch=crossed)
            self.assertEqual(path.read_bytes(), before)
            settle.fetch_yahoo = boom
            try:
                self.assertEqual(settle.main(["--ledger", str(path), "--now", "2026-11-11T16:30:00-05:00"]), 1)
            finally:
                settle.fetch_yahoo = real_fetch
            self.assertEqual(path.read_bytes(), before)

    def test_main_before_the_close_leaves_the_copy_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ledger.json"
            path.write_text(PRODUCTION_TEXT, encoding="utf-8")
            before = path.read_bytes()
            code = settle.main(["--ledger", str(path), "--now", "2026-11-11T07:44:00-05:00"])
            self.assertEqual(code, 0)
            self.assertEqual(path.read_bytes(), before)

    def test_production_ledger_is_still_the_unfilled_zd_order(self):
        self.assertEqual(LEDGER.read_text(encoding="utf-8"), PRODUCTION_TEXT)
        book = json.loads(PRODUCTION_TEXT)
        self.assertEqual(book["workingOrders"][0]["id"], "paper-2026-11-10-ZD")
        self.assertEqual(book["workingOrders"][0]["status"], "working")
        self.assertEqual(book["workingOrders"][0]["symbol"], "ZD")
        self.assertEqual(book["workingOrders"][0]["limitPrice"], 46.65)
        self.assertEqual(book["workingOrders"][0]["firstEligibleSession"], "2026-11-11")
        self.assertEqual(book["openPositions"], [])
        self.assertEqual(book["closedTrades"], [])
        self.assertEqual(types(book), ["account_opened", "order_placed"])
        self.assertEqual(settle.dumps(book), PRODUCTION_TEXT)

    def filled(self):
        book, applied = settle.settle_book(
            self.book(),
            {"ZD": {"2026-11-11": bar(48.20, 49, 46.10, 47.55)}},
            at("2026-11-11T16:30:00-05:00"),
        )
        self.assertEqual(applied, ["2026-11-11"])
        self.assertEqual(book["openPositions"][0]["entryPrice"], 46.65)
        return book


if __name__ == "__main__":
    unittest.main()
