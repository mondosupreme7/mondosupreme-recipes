#!/usr/bin/env python3
"""Sample live AIS positions and merge them into cruises/positions.json.

Listens to aisstream.io for about 75 seconds. Ships that stay quiet are
filled from the Open Waters vessel API so the snapshot still moves. The
AISSTREAM_API_KEY repository secret is sent only as the WebSocket
subscription's APIKey field. A missing secret skips aisstream and still
asks Open Waters. The key is never printed.

Requires the websockets package (pinned in the workflow at 15.0.1).
Open Waters is fetched with the standard library and needs no key.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLEET_PATH = ROOT / "cruises" / "fleet.json"
OUT_PATH = ROOT / "cruises" / "positions.json"
STREAM_URL = "wss://stream.aisstream.io/v0/stream"
TRAIL_HOURS = 24
TRAIL_MAX = 288
ABOUT = (
    "Positions for the Royal Caribbean ships in cruises/fleet.json. "
    "Each ship keeps a trail of position points from about the last 24 hours. "
    "aisstream.io is sampled for about 75 seconds every 5 minutes, then Open Waters fills ships that stayed quiet. "
    "A ship with nothing newer keeps its previous coordinates and seen time. "
    "Not for navigation. updated is when this snapshot was published; seen is when that ship was last heard."
)
AISSTREAM_CREDIT = "Live AIS sampled from aisstream.io (https://aisstream.io/)."
OPENWATERS_URL = "https://ais.openwaters.io/v1/vessels"
OPENWATERS_CREDIT = "Open Waters AIS (https://openwaters.io/ais/)."
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


def clean_source(value):
    text = clip(value or "", 24)
    if text and re.fullmatch(r"[A-Za-z0-9._-]+", text):
        return text
    return "openwaters.io"


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
    raw = os.environ.get("AISSTREAM_WINDOW_SECONDS", "75")
    try:
        seconds = int(raw)
    except ValueError:
        seconds = 75
    return max(45, min(seconds, 90))


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


def parse_seen(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def extend_trail(rec, moment):
    """Keep about 24 hours of reported points. Never invent a straight-line wake."""
    if not isinstance(rec, dict):
        return False
    lat = rec.get("lat")
    lon = rec.get("lon")
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    seen_dt = parse_seen(rec.get("seen")) or moment
    cutoff = moment - timedelta(hours=TRAIL_HOURS)
    before = rec.get("trail")
    points = []
    if isinstance(before, list):
        for item in before:
            if not isinstance(item, dict):
                continue
            plat = item.get("lat")
            plon = item.get("lon")
            when = parse_seen(item.get("seen")) if isinstance(item.get("seen"), str) else None
            if isinstance(plat, bool) or isinstance(plon, bool):
                continue
            if not isinstance(plat, (int, float)) or not isinstance(plon, (int, float)) or when is None:
                continue
            if when < cutoff:
                continue
            points.append({"lat": round(float(plat), 5), "lon": round(float(plon), 5), "seen": stamp(when)})
    anchor = seen_dt if seen_dt >= cutoff else moment
    current = {"lat": round(float(lat), 5), "lon": round(float(lon), 5), "seen": stamp(anchor)}
    if not points:
        points = [current]
    else:
        last = points[-1]
        same = last["lat"] == current["lat"] and last["lon"] == current["lon"]
        moved = abs(last["lat"] - current["lat"]) > 0.01 or abs(last["lon"] - current["lon"]) > 0.01
        if same:
            pass
        elif moved:
            points.append(current)
        else:
            points[-1] = current
    if len(points) > TRAIL_MAX:
        points = points[-TRAIL_MAX:]
    changed = before != points
    rec["trail"] = points
    return changed


def apply_update(previous, update):
    rec = dict(previous) if isinstance(previous, dict) else {}
    if update.get("position"):
        rec["lat"] = update["lat"]
        rec["lon"] = update["lon"]
        rec.pop("near", None)
        if update.get("near"):
            rec["near"] = update["near"]
        rec["source"] = clip(update.get("source") or "aisstream.io", 40) or "aisstream.io"
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


def parse_openwaters_feature(feature, allowed):
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    mmsi = mmsi_text(props.get("mmsi")) or mmsi_text(feature.get("id"))
    if mmsi not in allowed:
        return None
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    lon = number(coords[0], -180, 180, 5)
    lat = number(coords[1], -90, 90, 5)
    if lat is None or lon is None:
        return None
    parsed = {
        "mmsi": mmsi,
        "position": True,
        "lat": lat,
        "lon": lon,
        "seen": parse_time(props.get("seen")) or stamp(now_utc()),
        "source": clean_source(props.get("source")),
    }
    name = clip(props.get("name") or "", 40)
    if name:
        parsed["aisName"] = name
    for key, names, low, high, places in (
        ("sog", ("sog",), 0, 101.9, 1),
        ("cog", ("cog",), 0, 359.9, 1),
        ("heading", ("heading",), 0, 359, None),
        ("navStatus", ("nav_status", "navStatus"), 0, 15, None),
    ):
        value = number(field(props, *names), low, high, places)
        if value is not None:
            parsed[key] = value
    destination = clip(props.get("destination") or "", 80)
    if destination:
        parsed["destination"] = destination
    eta = format_eta(props.get("eta"))
    if eta:
        parsed["eta"] = eta
    near = clip(props.get("near") or "", 80)
    if near:
        parsed["near"] = near
    return parsed


def fetch_openwaters(mmsis):
    found = {}
    attribution = {"openwaters.io": OPENWATERS_CREDIT}
    allowed = set(mmsis)
    for start in range(0, len(mmsis), 10):
        chunk = list(mmsis)[start:start + 10]
        url = OPENWATERS_URL + "?mmsi=" + ",".join(chunk)
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/geo+json", "User-Agent": "mondosupreme-cruises"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError) as error:
            print("Open Waters request failed (" + error.__class__.__name__ + ")")
            continue
        if not isinstance(payload, dict):
            continue
        raw_attr = payload.get("attribution")
        if isinstance(raw_attr, dict):
            for key, value in raw_attr.items():
                if isinstance(key, str) and isinstance(value, str) and key != "station":
                    attribution[clip(key, 40)] = value
        features = payload.get("features")
        if not isinstance(features, list):
            continue
        for feature in features:
            parsed = parse_openwaters_feature(feature, allowed)
            if parsed:
                found[parsed["mmsi"]] = parsed
    return found, attribution


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

    previous = load_json(OUT_PATH, {})
    old_ships = previous.get("ships") if isinstance(previous, dict) else {}
    if not isinstance(old_ships, dict):
        old_ships = {}
    allowed = fleet_mmsis(ships)
    if not allowed:
        print("The fleet has no MMSIs. Leaving cruises/positions.json unchanged.")
        return 0

    seconds = window_seconds()
    updates = {}
    if not api_key:
        print("AISSTREAM_API_KEY is not set. Skipping aisstream.io and asking Open Waters.")
    else:
        print(f"Listening to aisstream.io for {seconds} seconds across {len(allowed)} ships.")
        try:
            import websockets  # noqa: F401
        except ImportError:
            print("The websockets package is not installed. Skipping aisstream.io.")
        else:
            result = collect(api_key, set(allowed), seconds)
            if result.get("rejected"):
                print("aisstream rejected the subscription (" + result["rejected"] + ").")
            elif not result.get("ok"):
                if not result.get("failed"):
                    print("aisstream did not confirm the subscription.")
            else:
                updates = result.get("updates") if isinstance(result.get("updates"), dict) else {}

    quiet = [mmsi for mmsi in allowed if not (isinstance(updates.get(mmsi), dict) and updates[mmsi].get("position"))]
    openwaters = {}
    openwaters_attr = {}
    if quiet:
        print(f"Asking Open Waters for {len(quiet)} ships that stayed quiet.")
        openwaters, openwaters_attr = fetch_openwaters(quiet)

    merged = {}
    heard = 0
    filled = 0
    for mmsi in allowed:
        prior = old_ships.get(mmsi) if isinstance(old_ships.get(mmsi), dict) else None
        update = updates.get(mmsi) if isinstance(updates.get(mmsi), dict) else None
        current = apply_update(prior, update) if update else (dict(prior) if prior else None)
        if update and update.get("position"):
            heard += 1
        backup = openwaters.get(mmsi)
        current_seen = current.get("seen") if isinstance(current, dict) else ""
        if isinstance(backup, dict) and backup.get("position") and (not current_seen or backup.get("seen", "") >= current_seen):
            current = apply_update(current, backup)
            filled += 1
        if isinstance(current, dict):
            merged[mmsi] = current

    moment = now_utc()
    trails_changed = False
    for rec in merged.values():
        if extend_trail(rec, moment):
            trails_changed = True

    print(f"Heard {heard} of {len(allowed)} ships on aisstream.io. Open Waters refreshed {filled}. Stored {len(merged)} positions.")
    if heard == 0 and filled == 0 and not trails_changed:
        print("No ships were heard. Leaving cruises/positions.json unchanged.")
        return 0

    old_attr = previous.get("attribution") if isinstance(previous, dict) else {}
    if not isinstance(old_attr, dict):
        old_attr = {}
    combined_attr = {str(key): value for key, value in old_attr.items() if isinstance(value, str)}
    combined_attr["aisstream.io"] = AISSTREAM_CREDIT
    for key, value in openwaters_attr.items():
        if key and isinstance(value, str):
            combined_attr[key] = value
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


def stamp_trails_only():
    previous = load_json(OUT_PATH, {})
    ships = previous.get("ships") if isinstance(previous, dict) else None
    if not isinstance(ships, dict) or not ships:
        print("cruises/positions.json has no ships.")
        return 0
    moment = now_utc()
    changed = False
    for rec in ships.values():
        if extend_trail(rec, moment):
            changed = True
    if not changed and previous.get("about") == ABOUT:
        print("Trails already current.")
        return 0
    previous["about"] = ABOUT
    previous["ships"] = {mmsi: ships[mmsi] for mmsi in sorted(ships)}
    OUT_PATH.write_text(json.dumps(previous, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote trails into {OUT_PATH.name}.")
    return 0


if __name__ == "__main__":
    if os.environ.get("TRAILS_ONLY") == "1":
        raise SystemExit(stamp_trails_only())
    raise SystemExit(build())
