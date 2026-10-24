#!/usr/bin/env python3
"""Refresh cruises/positions.json from Open Waters AIS last-known positions.

No API key is required. Anonymous requests allow 10 MMSIs at a time; this job
asks for one ship at a time so each response includes the nearest area
("near"), which the batch endpoint leaves out. OPENWATERS_TOKEN, when set to
a personal token from https://openwaters.io/ais/token/ , is sent as
Authorization: Bearer and only raises rate limits. A missing token is normal.
A rejected token is dropped and the run continues anonymously. If the network
call fails, the previous positions are kept and the process exits 0.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLEET_PATH = ROOT / "cruises" / "fleet.json"
OUT_PATH = ROOT / "cruises" / "positions.json"
BASE = "https://ais.openwaters.io/v1/vessels/"
UA = "MondosupremeCruises/1.0 (+https://mondosupreme.com/cruises)"
ABOUT = (
    "Last-known AIS positions for the Royal Caribbean ships in cruises/fleet.json. "
    "Not for navigation. updated is when this snapshot was published; seen is when "
    "that ship was last heard."
)


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


def record_from_feature(feature, previous):
    props = feature.get("properties") if isinstance(feature, dict) else None
    if not isinstance(props, dict):
        return None
    rec = {}
    geom = feature.get("geometry")
    coords = geom.get("coordinates") if isinstance(geom, dict) and geom.get("type") == "Point" else None
    if isinstance(coords, list) and len(coords) >= 2:
        lon = number(coords[0], -180, 180, 5)
        lat = number(coords[1], -90, 90, 5)
        if lon is not None and lat is not None:
            rec["lon"] = lon
            rec["lat"] = lat
    if "lat" not in rec and isinstance(previous, dict):
        if "lat" in previous and "lon" in previous:
            rec["lat"] = previous["lat"]
            rec["lon"] = previous["lon"]
    seen = clip(props.get("seen"), 40)
    if seen[:4].isdigit() and "T" in seen:
        rec["seen"] = seen
    name = clip(props.get("name"), 40)
    if name:
        rec["aisName"] = name
    destination = clip(props.get("destination"), 80)
    if destination:
        rec["destination"] = destination
    eta = clip(props.get("eta"), 40)
    if eta:
        rec["eta"] = eta
    near = clip(props.get("near"), 120)
    if near:
        rec["near"] = near
    sog = number(props.get("sog"), 0, 101.9, 1)
    if sog is not None:
        rec["sog"] = sog
    cog = number(props.get("cog"), 0, 359.9, 1)
    if cog is not None:
        rec["cog"] = cog
    heading = number(props.get("heading"), 0, 359)
    if heading is not None:
        rec["heading"] = heading
    status = number(props.get("nav_status"), 0, 15)
    if status is not None:
        rec["navStatus"] = status
    source = clip(props.get("source"), 80)
    if source:
        rec["source"] = source
    if "lat" not in rec and "seen" not in rec:
        return previous if isinstance(previous, dict) else None
    return rec


def attribution_from(feature, into):
    raw = feature.get("attribution") if isinstance(feature, dict) else None
    if not isinstance(raw, dict):
        return
    for key, value in raw.items():
        name = clip(str(key), 40)
        text = clip(value, 500) if isinstance(value, str) else ""
        if name and text:
            into[name] = text


def fetch_vessel(mmsi, token):
    request = urllib.request.Request(
        BASE + mmsi,
        headers={
            "User-Agent": UA,
            "Accept": "application/geo+json, application/json",
            **({"Authorization": "Bearer " + token} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        return error.code, None
    except Exception as error:
        print(f"{mmsi} request failed ({error.__class__.__name__})")
        return 0, None
    try:
        return status, json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        print(f"{mmsi} was not JSON")
        return status, None


def lookup(mmsi, token_box):
    status, feature = fetch_vessel(mmsi, token_box["token"])
    if status == 401 and token_box["token"]:
        print("OPENWATERS_TOKEN was rejected. Continuing without it.")
        token_box["token"] = ""
        status, feature = fetch_vessel(mmsi, "")
    if status == 429:
        time.sleep(5)
        status, feature = fetch_vessel(mmsi, token_box["token"])
    return status, feature


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


def build():
    fleet = load_json(FLEET_PATH, {})
    ships = fleet.get("ships") if isinstance(fleet, dict) else None
    if not isinstance(ships, list) or not ships:
        raise SystemExit("cruises/fleet.json has no ships")
    previous = load_json(OUT_PATH, {})
    old_ships = previous.get("ships") if isinstance(previous, dict) else {}
    if not isinstance(old_ships, dict):
        old_ships = {}
    token = os.environ.get("OPENWATERS_TOKEN", "").strip()
    token_box = {"token": token}
    if token:
        print("Using OPENWATERS_TOKEN for higher Open Waters rate limits.")
    else:
        print("No OPENWATERS_TOKEN set. Using anonymous Open Waters access.")

    merged = {}
    found_attr = {}
    ok = 0
    consecutive_down = 0
    for index, ship in enumerate(ships):
        mmsi = ship.get("mmsi") if isinstance(ship, dict) else ""
        if not isinstance(mmsi, str) or len(mmsi) != 9 or not mmsi.isdigit():
            print("skipping a fleet row without a 9-digit MMSI")
            continue
        if index:
            time.sleep(0.55)
        status, feature = lookup(mmsi, token_box)
        if status == 0:
            consecutive_down += 1
        else:
            consecutive_down = 0
        prior = old_ships.get(mmsi) if isinstance(old_ships.get(mmsi), dict) else None
        if status == 200 and isinstance(feature, dict) and feature.get("type") == "Feature":
            updated = record_from_feature(feature, prior)
            if updated:
                merged[mmsi] = updated
                ok += 1
            elif prior:
                merged[mmsi] = prior
            attribution_from(feature, found_attr)
            print(f"{mmsi} {ship.get('name', '')} ok")
        else:
            if prior:
                merged[mmsi] = prior
            print(f"{mmsi} {ship.get('name', '')} kept previous report (HTTP {status})")
        if consecutive_down >= 3:
            print("Open Waters is not responding. Keeping stored reports for the ships not checked.")
            for rest in ships[index + 1:]:
                rest_mmsi = rest.get("mmsi") if isinstance(rest, dict) else ""
                prior_rest = old_ships.get(rest_mmsi)
                if isinstance(rest_mmsi, str) and isinstance(prior_rest, dict):
                    merged.setdefault(rest_mmsi, prior_rest)
            break

    if ok == 0:
        print("No positions were fetched. Leaving cruises/positions.json unchanged.")
        return 0

    old_attr = previous.get("attribution") if isinstance(previous, dict) else {}
    if not isinstance(old_attr, dict):
        old_attr = {}
    combined_attr = {str(key): value for key, value in old_attr.items() if isinstance(value, str)}
    combined_attr.update(found_attr)
    document = {
        "about": ABOUT,
        "source": "Open Waters AIS",
        "sourceUrl": "https://ais.openwaters.io/v1/vessels/{mmsi}",
        "updated": stamp(now_utc()),
        "attribution": used_attribution(merged, combined_attr),
        "ships": {mmsi: merged[mmsi] for mmsi in sorted(merged)},
    }
    old_document = previous if isinstance(previous, dict) else {}
    if material(document) == material(old_document):
        updated = old_document.get("updated") if isinstance(old_document.get("updated"), str) else ""
        try:
            published = datetime.strptime(updated, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            published = None
        if published and now_utc() - published < timedelta(hours=6):
            print(f"No position changes ({ok} ships checked).")
            return 0
    OUT_PATH.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({ok} fresh, {len(merged)} stored).")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
