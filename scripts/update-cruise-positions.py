#!/usr/bin/env python3
"""Sample live AIS positions from aisstream.io and merge them into cruises/positions.json.

The AISSTREAM_API_KEY repository secret is sent only as the WebSocket
subscription's APIKey field. A missing secret skips the run and leaves the
previous file in place. The key is never printed. Ships that stay quiet
during the short listen window keep their last stored coordinates and seen time.

Requires the websockets package (pinned in the workflow at 15.0.1).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLEET_PATH = ROOT / "cruises" / "fleet.json"
OUT_PATH = ROOT / "cruises" / "positions.json"
STREAM_URL = "wss://stream.aisstream.io/v0/stream"
ABOUT = (
    "Positions sampled from aisstream.io for the Royal Caribbean ships in cruises/fleet.json. "
    "Ships that were quiet during the sample keep their previous coordinates and seen time. "
    "Not for navigation. updated is when this snapshot was published; seen is when that ship was last heard."
)
AISSTREAM_CREDIT = "Live AIS sampled from aisstream.io (https://aisstream.io/)."
POSITION_TYPES = {
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
}
STATIC_TYPES = {"ShipStaticData", "StaticDataReport"}
TIME_RE = re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})")


def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0)


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def clip(value, limit):
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    return text[:limit]


def redact(text, secret):
    if not isinstance(text, str):
        return ""
    if secret:
        text = text.replace(secret, "[redacted]")
    return text


def source_key(source):
    source = clip(source, 80)
    if not source:
        return ""
    return source.split(":", 1)[0]


def number(value, low, high, places=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    if value < low or value > high:
        return None
    if places is None:
        return int(value)
    return round(value, places)


def mmsi_text(value):
    if isinstance(value, bool):
        return ""
    if isinstance(value, int):
        text = str(value)
    elif isinstance(value, str) and value.isdigit():
        text = value
    else:
        return ""
    return text if len(text) == 9 else ""


def parse_time(value):
    if not isinstance(value, str):
        return ""
    match = TIME_RE.search(value)
    if not match:
        return ""
    return match.group(1) + "T" + match.group(2) + "Z"


def format_eta(value):
    if isinstance(value, str):
        return clip(value, 40)
    if not isinstance(value, dict):
        return ""
    month = value.get("Month", value.get("month"))
    day = value.get("Day", value.get("day"))
    hour = value.get("Hour", value.get("hour"))
    minute = value.get("Minute", value.get("minute"))
    if not all(isinstance(part, int) and not isinstance(part, bool) for part in (month, day, hour, minute)):
        return ""
    if not (1 <= month <= 12 and 1 <= day <= 31 and 0 <= hour <= 23 and 0 <= minute <= 59):
        return ""
    return f"{month:02d}-{day:02d} {hour:02d}:{minute:02d}"


def field(mapping, *names):
    if not isinstance(mapping, dict):
        return None
    for name in names:
        if name in mapping:
            return mapping[name]
    return None


def window_seconds():
    raw = os.environ.get("AISSTREAM_WINDOW_SECONDS", "180")
    try:
        seconds = int(raw)
    except ValueError:
        seconds = 180
    return max(1, min(seconds, 240))


def parse_stream_message(payload):
    if not isinstance(payload, dict):
        return None
    message_type = payload.get("MessageType")
    if message_type not in POSITION_TYPES and message_type not in STATIC_TYPES:
        return None
    meta = payload.get("MetaData") if isinstance(payload.get("MetaData"), dict) else {}
    body_wrap = payload.get("Message") if isinstance(payload.get("Message"), dict) else {}
    body = body_wrap.get(message_type) if isinstance(body_wrap.get(message_type), dict) else {}
    if body.get("Valid") is False:
        return None
    mmsi = mmsi_text(field(meta, "MMSI", "mmsi")) or mmsi_text(field(body, "UserID", "userID"))
    if not mmsi:
        return None
    parsed = {"mmsi": mmsi}
    name = clip(field(meta, "ShipName", "shipName") or field(body, "Name", "name") or "", 40)
    if name:
        parsed["aisName"] = name
    if message_type in POSITION_TYPES:
        lat = number(field(body, "Latitude", "latitude"), -90, 90, 5)
        lon = number(field(body, "Longitude", "longitude"), -180, 180, 5)
        if lat is None or lon is None:
            lat = number(field(meta, "Latitude", "latitude"), -90, 90, 5)
            lon = number(field(meta, "Longitude", "longitude"), -180, 180, 5)
        if lat is None or lon is None:
            return None
        parsed["position"] = True
        parsed["lat"] = lat
        parsed["lon"] = lon
        parsed["seen"] = parse_time(field(meta, "time_utc", "TimeUtc")) or stamp(now_utc())
        parsed["sog"] = number(field(body, "Sog", "sog"), 0, 101.9, 1)
        parsed["cog"] = number(field(body, "Cog", "cog"), 0, 359.9, 1)
        parsed["heading"] = number(field(body, "TrueHeading", "trueHeading"), 0, 359)
        parsed["navStatus"] = number(field(body, "NavigationalStatus", "navigationalStatus"), 0, 15)
    destination = clip(field(body, "Destination", "destination") or "", 80)
    if destination:
        parsed["destination"] = destination
    eta = format_eta(field(body, "Eta", "eta"))
    if eta:
        parsed["eta"] = eta
    return parsed


def absorb(store, parsed):
    current = store.get(parsed["mmsi"], {})
    if parsed.get("position"):
        previous_seen = current.get("seen") or ""
        if not previous_seen or parsed.get("seen", "") >= previous_seen:
            current["position"] = True
            for key in ("lat", "lon", "seen", "sog", "cog", "heading", "navStatus"):
                if key in parsed:
                    current[key] = parsed[key]
            if parsed.get("aisName"):
                current["aisName"] = parsed["aisName"]
    if parsed.get("destination"):
        current["destination"] = parsed["destination"]
    if parsed.get("eta"):
        current["eta"] = parsed["eta"]
    if parsed.get("aisName") and "aisName" not in current:
        current["aisName"] = parsed["aisName"]
    store[parsed["mmsi"]] = current


def apply_update(previous, update):
    rec = dict(previous) if isinstance(previous, dict) else {}
    if update.get("position"):
        rec["lat"] = update["lat"]
        rec["lon"] = update["lon"]
        rec.pop("near", None)
        rec["source"] = "aisstream.io"
        if update.get("seen"):
            rec["seen"] = update["seen"]
        for key in ("sog", "cog", "heading", "navStatus"):
            if key not in update:
                continue
            if update[key] is None:
                rec.pop(key, None)
            else:
                rec[key] = update[key]
        if update.get("aisName"):
            rec["aisName"] = update["aisName"]
    if update.get("destination"):
        rec["destination"] = update["destination"]
    if update.get("eta"):
        rec["eta"] = update["eta"]
    if update.get("aisName") and not rec.get("aisName"):
        rec["aisName"] = update["aisName"]
    if "lat" not in rec or "lon" not in rec:
        return previous if isinstance(previous, dict) else None
    return rec


def used_attribution(ships, found):
    wanted = set()
    for ship in ships.values():
        key = source_key(ship.get("source", ""))
        if key:
            wanted.add(key)
    return {key: found[key] for key in sorted(wanted) if key in found}


def material(document):
    body = {key: value for key, value in document.items() if key != "updated"}
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


async def listen(api_key, allowed, seconds, url):
    import websockets

    store = {}
    confirmed = False
    rejected = ""
    subscription = {
        "APIKey": api_key,
        "BoundingBoxes": [[[-90.0, -180.0], [90.0, 180.0]]],
        "FiltersShipMMSI": sorted(allowed),
        "FilterMessageTypes": sorted(POSITION_TYPES | STATIC_TYPES),
    }
    async with websockets.connect(
        url,
        compression="deflate",
        open_timeout=20,
        close_timeout=5,
        max_size=1_000_000,
        ping_interval=20,
    ) as socket:
        await socket.send(json.dumps(subscription))
        deadline = asyncio.get_running_loop().time() + seconds
        seen_messages = 0
        while asyncio.get_running_loop().time() < deadline:
            timeout = deadline - asyncio.get_running_loop().time()
            try:
                raw = await asyncio.wait_for(socket.recv(), timeout=max(timeout, 0.1))
            except asyncio.TimeoutError:
                break
            except websockets.exceptions.ConnectionClosed:
                break
            seen_messages += 1
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", "replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and (payload.get("error") or payload.get("Error")):
                reason = payload.get("error") or payload.get("Error")
                rejected = redact(reason if isinstance(reason, str) else "rejected", api_key)[:160]
                break
            if isinstance(payload, dict) and payload.get("MessageType") == "SubscriptionConfirmation":
                confirmed = True
                continue
            parsed = parse_stream_message(payload)
            if parsed and parsed["mmsi"] in allowed:
                absorb(store, parsed)
            if all(mmsi in store and store[mmsi].get("position") for mmsi in allowed):
                break
            if seen_messages >= 20000:
                break
    heard_any = any(item.get("position") for item in store.values())
    return {
        "ok": not rejected and (confirmed or heard_any),
        "rejected": rejected,
        "updates": store,
        "confirmed": confirmed,
    }


def collect(api_key, allowed, seconds):
    url = os.environ.get("AISSTREAM_URL", STREAM_URL).strip() or STREAM_URL
    try:
        return asyncio.run(listen(api_key, allowed, seconds, url))
    except Exception as error:
        print("aisstream connection failed (" + error.__class__.__name__ + ")")
        return {"ok": False, "rejected": "", "updates": {}, "confirmed": False, "failed": True}


def fleet_mmsis(ships):
    found = []
    for ship in ships:
        mmsi = ship.get("mmsi") if isinstance(ship, dict) else ""
        if isinstance(mmsi, str) and len(mmsi) == 9 and mmsi.isdigit():
            found.append(mmsi)
        else:
            print("skipping a fleet row without a 9-digit MMSI")
    return found


def build():
    fleet = load_json(FLEET_PATH, {})
    ships = fleet.get("ships") if isinstance(fleet, dict) else None
    if not isinstance(ships, list) or not ships:
        raise SystemExit("cruises/fleet.json has no ships")
    api_key = os.environ.get("AISSTREAM_API_KEY", "").strip()
    if not api_key:
        print("AISSTREAM_API_KEY is not set. Leaving cruises/positions.json unchanged.")
        return 0

    previous = load_json(OUT_PATH, {})
    old_ships = previous.get("ships") if isinstance(previous, dict) else {}
    if not isinstance(old_ships, dict):
        old_ships = {}
    allowed = fleet_mmsis(ships)
    if not allowed:
        print("The fleet has no MMSIs. Leaving cruises/positions.json unchanged.")
        return 0

    seconds = window_seconds()
    print(f"Listening to aisstream.io for {seconds} seconds across {len(allowed)} ships.")
    try:
        import websockets  # noqa: F401
    except ImportError:
        print("The websockets package is not installed. Leaving cruises/positions.json unchanged.")
        return 0
    result = collect(api_key, set(allowed), seconds)
    if result.get("rejected"):
        print("aisstream rejected the subscription (" + result["rejected"] + "). Leaving positions.json unchanged.")
        return 0
    if not result.get("ok"):
        if not result.get("failed"):
            print("aisstream did not confirm the subscription. Leaving positions.json unchanged.")
        return 0

    updates = result.get("updates") if isinstance(result.get("updates"), dict) else {}
    merged = {}
    heard = 0
    for mmsi in allowed:
        prior = old_ships.get(mmsi) if isinstance(old_ships.get(mmsi), dict) else None
        update = updates.get(mmsi)
        if update:
            updated = apply_update(prior, update)
            if updated:
                merged[mmsi] = updated
                if update.get("position"):
                    heard += 1
                continue
        if prior:
            merged[mmsi] = prior

    print(f"Heard {heard} of {len(allowed)} ships on aisstream.io. Stored {len(merged)} positions.")
    if heard == 0:
        print("No ships were heard. Leaving cruises/positions.json unchanged.")
        return 0

    old_attr = previous.get("attribution") if isinstance(previous, dict) else {}
    if not isinstance(old_attr, dict):
        old_attr = {}
    combined_attr = {str(key): value for key, value in old_attr.items() if isinstance(value, str)}
    combined_attr["aisstream.io"] = AISSTREAM_CREDIT
    document = {
        "about": ABOUT,
        "attribution": used_attribution(merged, combined_attr),
        "heard": heard,
        "ships": {mmsi: merged[mmsi] for mmsi in sorted(merged)},
        "source": "aisstream.io",
        "sourceUrl": "https://aisstream.io/",
        "updated": stamp(now_utc()),
    }
    old_document = previous if isinstance(previous, dict) else {}
    if material(document) == material(old_document):
        updated = old_document.get("updated") if isinstance(old_document.get("updated"), str) else ""
        try:
            published = datetime.strptime(updated, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            published = None
        if published and now_utc() - published < timedelta(hours=6):
            print("No position changes.")
            return 0
    OUT_PATH.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
