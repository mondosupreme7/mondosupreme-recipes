#!/usr/bin/env python3
"""Build local/events.json from public Space Coast calendars.

Sources are official feeds and a published schedule. Nothing is invented.
A feed that fails is recorded and skipped.
"""
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "local" / "events.json"
ET = ZoneInfo("America/New_York")
UA = "Mondosupreme/1.0 (local events; +https://mondosupreme.com/local/)"
NOW = datetime.now(ET)
WINDOW_START = NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=6)
WINDOW_END = NOW.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=10)
TOWNS = (
    "Cocoa Beach",
    "Port Canaveral",
    "Merritt Island",
    "Titusville",
    "Melbourne",
    "Viera",
    "Rockledge",
    "Cocoa",
)
FEEDS = [
    ("City of Cocoa", "Cocoa", "https://www.cocoafl.gov/calendar.aspx",
     "https://www.cocoafl.gov/common/modules/iCalendar/iCalendar.aspx?catID=32&feed=calendar"),
    ("City of Cocoa", "Cocoa", "https://www.cocoafl.gov/calendar.aspx",
     "https://www.cocoafl.gov/common/modules/iCalendar/iCalendar.aspx?catID=15&feed=calendar"),
    ("City of Cocoa Beach", "Cocoa Beach", "https://www.cityofcocoabeach.com/calendar.aspx",
     "https://www.cityofcocoabeach.com/common/modules/iCalendar/iCalendar.aspx?catID=29&feed=calendar"),
    ("City of Cocoa Beach", "Cocoa Beach", "https://www.cityofcocoabeach.com/calendar.aspx",
     "https://www.cityofcocoabeach.com/common/modules/iCalendar/iCalendar.aspx?catID=32&feed=calendar"),
    ("City of Titusville", "Titusville", "https://www.titusville.com/calendar.aspx",
     "https://www.titusville.com/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar"),
    ("City of Titusville", "Titusville", "https://www.titusville.com/calendar.aspx",
     "https://www.titusville.com/common/modules/iCalendar/iCalendar.aspx?catID=41&feed=calendar"),
    ("City of Rockledge", "Rockledge", "https://www.cityofrockledge.org/calendar.aspx",
     "https://www.cityofrockledge.org/common/modules/iCalendar/iCalendar.aspx?catID=23&feed=calendar"),
    ("City of Rockledge", "Rockledge", "https://www.cityofrockledge.org/calendar.aspx",
     "https://www.cityofrockledge.org/common/modules/iCalendar/iCalendar.aspx?catID=22&feed=calendar"),
    ("Visit Space Coast", "", "https://www.visitspacecoast.com/events-calendar/",
     "https://www.visitspacecoast.com/?eventDisplay=list&ical=1"),
]
SKIP_TITLE = re.compile(
    r"\b(board meeting|commission meeting|council meeting|cra meeting|code enforcement|planning (&|and) zoning)\b",
    re.I,
)
PDF_URL = "https://www.portcanaveral.com/docs/default-source/cruise/2026-master-cruise-schedule.pdf"
CRUISE_PAGE = "https://www.portcanaveral.com/cruise/cruise-ship-schedule"
LL2 = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=20"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=40) as res:
        return res.read()


def unfold(text):
    return re.sub(r"\r?\n[ \t]", "", text.replace("\r\n", "\n").replace("\r", "\n"))


def unescape(value):
    return value.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def parse_when(param, value):
    value = value.strip()
    if "VALUE=DATE" in param or re.fullmatch(r"\d{8}", value):
        day = datetime.strptime(value[:8], "%Y%m%d")
        start = datetime(day.year, day.month, day.day, tzinfo=ET)
        return start, start + timedelta(days=1), True
    match = re.match(r"(\d{8})T(\d{6})(Z)?", value)
    if not match:
        return None, None, False
    naive = datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S")
    if match.group(3) == "Z":
        when = naive.replace(tzinfo=timezone.utc)
    else:
        tz_name = "America/New_York"
        found = re.search(r"TZID=([^:;]+)", param)
        if found and found.group(1) not in ("America/Halifax",):
            tz_name = found.group(1)
        when = naive.replace(tzinfo=ZoneInfo(tz_name))
    return when, None, False


def town_of(text, fallback):
    blob = " " + re.sub(r"\s+", " ", text or "") + " "
    for name in TOWNS:
        if re.search(r"\b" + re.escape(name) + r"\b", blob, re.I):
            return name
    if re.search(r"\bCape Canaveral\b", blob, re.I):
        return "Port Canaveral"
    return fallback or ""


def category_of(title, description, kind):
    if kind == "launch":
        return "Launches"
    if kind == "cruise":
        return "Cruise"
    blob = (title + " " + description).lower()
    checks = (
        ("Launches", r"launch|rocket|falcon|vulcan|artemis|starship"),
        ("Cruise", r"\bcruise\b|ship schedule"),
        ("Food & Markets", r"market|food|brew|tasting|oyster|bbq|farmers"),
        ("Music", r"concert|live music|\bband\b|\bdj\b|jazz|symphony"),
        ("Sports", r"\brun\b|race|triathlon|golf|surf|soccer|baseball|\b5k\b|marathon"),
        ("Arts", r"\bart\b|arts|gallery|museum|theater|theatre|film|movie"),
        ("Family", r"family|kids|halloween|festival|\bfair\b|trick|zoo|parade"),
        ("Outdoors", r"\bpark\b|beach|trail|paddle|kayak|fishing"),
    )
    for name, pattern in checks:
        if re.search(pattern, blob):
            return name
    return "Family"


def https_url(value, fallback):
    text = unescape(value or "")
    found = re.search(r"https://[^\s<>'\"]+", text)
    if found:
        return found.group(0).rstrip(".,)")
    if fallback and fallback.startswith("https://"):
        return fallback
    return ""


def event_id(source, title, start):
    raw = "%s|%s|%s" % (source, title.lower(), start.astimezone(timezone.utc).strftime("%Y%m%dT%H%M"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def keep(start, end):
    if end <= WINDOW_START or start >= WINDOW_END:
        return False
    return True


def add_event(bucket, item):
    if not item["title"] or not item["url"].startswith("https://") or not item["town"]:
        return
    if SKIP_TITLE.search(item["title"]):
        return
    bucket.append(item)


def from_ics(name, fallback_town, page, url):
    raw = fetch(url).decode("utf-8", "replace")
    text = unfold(raw)
    found = []
    for block in text.split("BEGIN:VEVENT")[1:]:
        body = block.split("END:VEVENT", 1)[0]
        fields = {}
        for line in body.split("\n"):
            if ":" not in line:
                continue
            key, val = line.split(":", 1)
            fields.setdefault(key.split(";", 1)[0], []).append((key, unescape(val)))
        if "DTSTART" not in fields or "SUMMARY" not in fields:
            continue
        start, end, all_day = parse_when(fields["DTSTART"][0][0], fields["DTSTART"][0][1])
        if not start:
            continue
        if "DTEND" in fields:
            end_at, _, _ = parse_when(fields["DTEND"][0][0], fields["DTEND"][0][1])
            if end_at:
                end = end_at
        if not end:
            end = start + (timedelta(days=1) if all_day else timedelta(hours=2))
        if not keep(start, end):
            continue
        title = re.sub(r"\s+", " ", fields["SUMMARY"][0][1]).strip()
        location = fields.get("LOCATION", [("", "")])[0][1]
        description = re.sub(r"\s+", " ", fields.get("DESCRIPTION", [("", "")])[0][1]).strip()
        link = https_url(fields.get("URL", [("", "")])[0][1], "") or https_url(description, page)
        place = town_of(location + " " + title + " " + description, fallback_town)
        add_event(found, {
            "id": event_id(name, title, start),
            "title": title[:160],
            "start": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "town": place,
            "venue": re.sub(r"\s+", " ", location).strip()[:120],
            "category": category_of(title, description, "event"),
            "url": link,
            "description": description[:400],
            "source": name,
            "sourceUrl": page,
            "kind": "event",
        })
    return found


def hhmm(token):
    digits = token.zfill(4)
    return int(digits[:-2]), int(digits[-2:])


def from_cruise():
    import io
    import pypdf
    data = fetch(PDF_URL)
    reader = pypdf.PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    found = []
    row = re.compile(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\s+\w+\s+(CT\d+)\s+([A-Za-z0-9' .&/-]+?)\s+(\d{3,4})\s+(\d{3,4})"
    )
    months = {name: i for i, name in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
    for match in row.finditer(text):
        month, day, year, terminal, ship, arrive, depart = match.groups()
        ship = re.sub(r"\s+", " ", ship).strip(" -")
        if len(ship) < 3:
            continue
        ah, am = hhmm(arrive)
        dh, dm = hhmm(depart)
        start = datetime(int(year), months[month], int(day), ah, am, tzinfo=ET)
        end = datetime(int(year), months[month], int(day), dh, dm, tzinfo=ET)
        if end <= start:
            end += timedelta(days=1)
        if not keep(start, end):
            continue
        title = ship + " in port"
        add_event(found, {
            "id": event_id("Canaveral Port Authority", title, start),
            "title": title,
            "start": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "town": "Port Canaveral",
            "venue": "Cruise Terminal " + terminal,
            "category": "Cruise",
            "url": CRUISE_PAGE,
            "description": "Arrival and departure from the Canaveral Port Authority master cruise schedule.",
            "source": "Canaveral Port Authority",
            "sourceUrl": CRUISE_PAGE,
            "kind": "cruise",
        })
    return found


def from_launches():
    payload = json.loads(fetch(LL2).decode("utf-8"))
    found = []
    for row in payload.get("results") or []:
        net = row.get("net") or row.get("window_start") or ""
        try:
            start = datetime.fromisoformat(net.replace("Z", "+00:00"))
        except ValueError:
            continue
        end_raw = row.get("window_end") or ""
        try:
            end = datetime.fromisoformat(end_raw.replace("Z", "+00:00")) if end_raw else start + timedelta(hours=1)
        except ValueError:
            end = start + timedelta(hours=1)
        if end <= start:
            end = start + timedelta(hours=1)
        launch_end = WINDOW_START + timedelta(days=21)
        if end <= WINDOW_START or start >= launch_end:
            continue
        pad = ((row.get("pad") or {}).get("name")) or "Cape Canaveral"
        rocket = (((row.get("rocket") or {}).get("configuration") or {}).get("name")) or ""
        provider = ((row.get("launch_service_provider") or {}).get("name")) or ""
        status = ((row.get("status") or {}).get("name")) or ""
        title = row.get("name") or "Launch"
        bits = [bit for bit in (status, provider, rocket, pad) if bit]
        link = row.get("url") if str(row.get("url") or "").startswith("https://") else "https://ll.thespacedevs.com/"
        add_event(found, {
            "id": event_id("Launch Library 2", title, start),
            "title": title[:160],
            "start": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "town": "Port Canaveral",
            "venue": pad[:120],
            "category": "Launches",
            "url": link,
            "description": " · ".join(bits)[:400],
            "source": "Launch Library 2",
            "sourceUrl": "https://ll.thespacedevs.com/2.2.0/launch/upcoming/",
            "kind": "launch",
        })
    return found


def main():
    events = []
    sources = []
    jobs = [("ical", item) for item in FEEDS]
    jobs.append(("cruise", None))
    jobs.append(("launch", None))
    for kind, item in jobs:
        if kind == "ical":
            name, town, page, url = item
            label = name
        elif kind == "cruise":
            label, url = "Canaveral Port Authority", PDF_URL
        else:
            label, url = "Launch Library 2", LL2
        try:
            if kind == "ical":
                rows = from_ics(name, town, page, url)
            elif kind == "cruise":
                rows = from_cruise()
            else:
                rows = from_launches()
            events.extend(rows)
            sources.append({"name": label, "url": url, "ok": True, "count": len(rows)})
            print(label, len(rows))
        except Exception as exc:
            sources.append({"name": label, "url": url, "ok": False, "count": 0, "error": type(exc).__name__})
            print("FAIL", label, type(exc).__name__, exc)
    deduped = []
    seen = set()
    for row in sorted(events, key=lambda item: item["start"]):
        key = (row["title"].lower(), row["start"][:10], row["town"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": sources,
        "events": deduped,
    }
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print("wrote", len(deduped), "events")


if __name__ == "__main__":
    main()
