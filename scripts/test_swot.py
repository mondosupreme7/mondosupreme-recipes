#!/usr/bin/env python3
"""Schema checks for stocks/swot/<TICKER>.json. No network."""

from __future__ import annotations

import copy
import json
import re
import unittest
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SWOT_DIR = ROOT / "stocks" / "swot"
TICKER = re.compile(r"^[A-Z]{1,5}(?:-[A-Z])?$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
QUADRANTS = ("strengths", "weaknesses", "opportunities", "threats")
FIELDS = {
    "ticker",
    "name",
    "asOf",
    "strengths",
    "weaknesses",
    "opportunities",
    "threats",
    "seriousThreat",
    "threatNote",
    "decisionNote",
    "sources",
}
REQUIRED = FIELDS - {"threatNote"}
BULLET_MAX = 160
NOTE_MAX = 800
DECISION_MAX = 200
NAME_MAX = 80
TITLE_MAX = 140


def problems(data, filename=None):
    """Return schema errors. `name` is the company name. `threatNote` is optional."""
    found = []

    def bad(message):
        found.append(message)

    if not isinstance(data, dict):
        return ["SWOT file must be a JSON object"]
    extra = sorted(set(data) - FIELDS)
    if extra:
        bad("unknown fields: " + ", ".join(extra))
    missing = sorted(REQUIRED - set(data))
    if missing:
        bad("missing fields: " + ", ".join(missing))

    ticker = data.get("ticker")
    if not isinstance(ticker, str) or not TICKER.fullmatch(ticker):
        bad("ticker must be 1–5 letters, with an optional -B class suffix")
    elif filename is not None and filename != ticker + ".json":
        bad("filename must be " + ticker + ".json")

    name = data.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > NAME_MAX or "\n" in name:
        bad("name must be a one-line company name")

    as_of = data.get("asOf")
    if not isinstance(as_of, str) or not _real_date(as_of):
        bad("asOf must be a real YYYY-MM-DD date")

    for key in QUADRANTS:
        bullets = data.get(key)
        if not isinstance(bullets, list) or not 2 <= len(bullets) <= 3:
            bad(key + " must be 2 or 3 bullets")
            continue
        for bullet in bullets:
            if not isinstance(bullet, str) or not bullet.strip() or len(bullet) > BULLET_MAX or "\n" in bullet:
                bad(key + " bullets must be short one-line strings")
                break

    if not isinstance(data.get("seriousThreat"), bool):
        bad("seriousThreat must be true or false")

    if "threatNote" in data:
        note = data.get("threatNote")
        if not isinstance(note, str) or not note.strip() or len(note) > NOTE_MAX:
            bad("threatNote must be a non-empty string when present")

    decision = data.get("decisionNote")
    if (
        not isinstance(decision, str)
        or not decision.strip()
        or len(decision) > DECISION_MAX
        or "\n" in decision
        or "\r" in decision
    ):
        bad("decisionNote must be one line")

    sources = data.get("sources")
    if not isinstance(sources, list) or not 1 <= len(sources) <= 12:
        bad("sources must be 1 to 12 items")
    else:
        for index, source in enumerate(sources, start=1):
            if not isinstance(source, dict):
                bad("source %s must be an object" % index)
                continue
            if set(source) != {"title", "url", "date"}:
                bad("source %s must have title, url, and date" % index)
            title = source.get("title")
            if not isinstance(title, str) or not title.strip() or len(title) > TITLE_MAX or "\n" in title:
                bad("source %s title must be one line" % index)
            if not _http_url(source.get("url")):
                bad("source %s url must be an http(s) URL" % index)
            if not _real_date(source.get("date")):
                bad("source %s date must be a real YYYY-MM-DD date" % index)
    return found


def _real_date(value):
    if not isinstance(value, str) or not DATE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _http_url(value):
    if not isinstance(value, str) or any(char.isspace() for char in value):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _sample():
    return {
        "ticker": "ZD",
        "name": "Example Co",
        "asOf": "2026-11-12",
        "strengths": ["One sourced strength.", "Another sourced strength."],
        "weaknesses": ["One weakness.", "Another weakness."],
        "opportunities": ["One opportunity.", "Another opportunity."],
        "threats": ["One threat.", "Another threat."],
        "seriousThreat": False,
        "decisionNote": "The note records how the SWOT affected the paper decision.",
        "sources": [{
            "title": "Filing",
            "url": "https://www.sec.gov/example",
            "date": "2026-11-05",
        }],
    }


class SwotSchemaTest(unittest.TestCase):
    def test_published_files_match_the_schema(self):
        files = sorted(SWOT_DIR.glob("*.json"))
        self.assertTrue(files, "stocks/swot has no company files")
        for path in files:
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(problems(data, path.name), [], path.name)

    def test_zd_file_keeps_the_sourced_wording(self):
        data = json.loads((SWOT_DIR / "ZD.json").read_text(encoding="utf-8"))
        self.assertEqual(data["ticker"], "ZD")
        self.assertEqual(data["name"], "Ziff Davis, Inc.")
        self.assertEqual(data["asOf"], "2026-11-12")
        self.assertFalse(data["seriousThreat"])
        self.assertEqual(len(data["strengths"]), 3)
        self.assertEqual(len(data["weaknesses"]), 3)
        self.assertEqual(len(data["opportunities"]), 3)
        self.assertEqual(len(data["threats"]), 3)
        self.assertIn("Accenture for $1.2B", data["strengths"][0])
        self.assertIn("Nov 5\u20136, 2026", data["threatNote"])
        self.assertIn("$46.65 paper buy order", data["decisionNote"])
        self.assertEqual(len(data["sources"]), 6)
        self.assertTrue(data["sources"][0]["url"].startswith("https://www.sec.gov/"))

    def test_sample_without_a_threat_note_is_valid(self):
        self.assertEqual(problems(_sample(), "ZD.json"), [])

    def test_rejects_a_short_quadrant_and_a_long_one(self):
        short = _sample()
        short["threats"] = ["Only one threat."]
        self.assertTrue(any("threats" in item for item in problems(short)))
        long = _sample()
        long["strengths"] = ["One.", "Two.", "Three.", "Four."]
        self.assertTrue(any("strengths" in item for item in problems(long)))

    def test_rejects_filename_and_type_mistakes(self):
        mismatched = _sample()
        self.assertTrue(any("filename" in item for item in problems(mismatched, "AAA.json")))
        flagged = _sample()
        flagged["seriousThreat"] = "false"
        self.assertTrue(any("seriousThreat" in item for item in problems(flagged)))
        broken = _sample()
        broken["decisionNote"] = "First line.\nSecond line."
        self.assertTrue(any("decisionNote" in item for item in problems(broken)))
        extra = _sample()
        extra["company"] = "Duplicate"
        self.assertTrue(any("unknown" in item for item in problems(extra)))
        link = _sample()
        link["sources"] = [dict(link["sources"][0], url="javascript:alert(1)")]
        self.assertTrue(any("url" in item for item in problems(link)))
        dated = copy.deepcopy(_sample())
        dated["asOf"] = "2026-02-31"
        self.assertTrue(any("asOf" in item for item in problems(dated)))


if __name__ == "__main__":
    unittest.main()
