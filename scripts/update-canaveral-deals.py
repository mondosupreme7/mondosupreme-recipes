#!/usr/bin/env python3
"""Save Royal Caribbean Port Canaveral sailings to cruises/canaveral-deals.json.

Reads the public cruise-search GraphQL that royalcaribbean.com/cruises uses
(POST /cruises/graph, brand R, filter departurePort:PCN). No account and no
key. Only Royal Caribbean International sailings come back from that search.

A fetch that fails, or that returns no priced sailings, leaves the previous
file alone so the deals table is never emptied. The snapshot is refreshed
when it is older than 20 hours. Set CANAVERAL_DEALS_FORCE=1 to fetch anyway.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLEET_PATH = ROOT / "cruises" / "fleet.json"
OUT_PATH = ROOT / "cruises" / "canaveral-deals.json"
GRAPH_URL = "https://www.royalcaribbean.com/cruises/graph"
BROWSE_URL = "https://www.royalcaribbean.com/cruises?departureCode_PCN=true"
SITE = "https://www.royalcaribbean.com"
PAGE_SIZE = 10
MAX_PAGES = 20
MAX_AGE_HOURS = 20
ABOUT = (
    "Royal Caribbean International sailings that depart Port Canaveral (PCN), "
    "Cape Canaveral, Florida 32920. Prices are the public starting fare per person "
    "in USD from Royal Caribbean's cruise search, before taxes and fees, for Interior, "
    "Ocean View, and Balcony. perNight is that starting fare divided by nights. "
    "bestValue marks the lowest per-night fare. under100 marks sailings under $100 a night. "
    "fetchedAt is when this file was last filled. A failed fetch keeps the previous deals."
)

QUERY = """
query CruisesSearchResults($filters: String, $sort: CruiseSearchSort, $pagination: CruiseSearchPagination) {
  cruiseSearch(filters: $filters, sort: $sort, pagination: $pagination) {
    results {
      total
      cruises {
        id
        lowestPriceSailing { sailDate }
        masterSailing {
          itinerary {
            name
            sailingNights
            departurePort { code name }
            ship { code name }
            days {
              number
              type
              ports { activity port { code name } }
            }
          }
        }
        sailings {
          bookingLink
          sailDate
          startDate
          endDate
          stateroomClassPricing {
            price { value currency { code } }
            stateroomClass { id }
          }
          itinerary { code }
        }
      }
    }
  }
}
"""

PORT_NAMES = {
    "orlando (port canaveral)": "Port Canaveral",
    "port canaveral": "Port Canaveral",
    "port canaveral, florida": "Port Canaveral",
    "perfect day cococay": "Perfect Day at CocoCay",
    "perfect day at cococay": "Perfect Day at CocoCay",
    "cococay": "Perfect Day at CocoCay",
    "nassau, bahamas": "Nassau",
}

CABIN_FIELDS = {
    "INTERIOR": "interior",
    "OUTSIDE": "oceanView",
    "BALCONY": "balcony",
}
CABIN_LABELS = {
    "interior": "Interior",
    "oceanView": "Ocean View",
    "balcony": "Balcony",
}


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
    return " ".join(value.split())[:limit]


def norm_name(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def fleet_index():
    data = load_json(FLEET_PATH, {})
    ships = data.get("ships") if isinstance(data, dict) else []
    index = {}
    if not isinstance(ships, list):
        return index
    for ship in ships:
        if not isinstance(ship, dict):
            continue
        name = clip(ship.get("name"), 80)
        mmsi = ship.get("mmsi")
        if name and isinstance(mmsi, str) and re.fullmatch(r"\d{9}", mmsi):
            index[norm_name(name)] = {"name": name, "mmsi": mmsi}
    return index


def pretty_port(name):
    text = clip(name, 80)
    mapped = PORT_NAMES.get(text.lower())
    return mapped or text


def port_chain(days):
    ports = []
    if not isinstance(days, list):
        return ports
    ordered = sorted(
        [day for day in days if isinstance(day, dict)],
        key=lambda day: day.get("number") if isinstance(day.get("number"), int) else 0,
    )
    for day in ordered:
        if day.get("type") == "CRUISING":
            continue
        calls = day.get("ports")
        if not isinstance(calls, list):
            continue
        for call in calls:
            if not isinstance(call, dict):
                continue
            port = call.get("port") if isinstance(call.get("port"), dict) else {}
            label = pretty_port(port.get("name") or "")
            if not label or label.lower() == "cruising":
                continue
            if ports and ports[-1] == label:
                continue
            ports.append(label)
    if len(ports) > 1 and ports[-1] == ports[0]:
        ports = ports[:-1]
    return ports


def parse_date(value):
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    return ""


def nights_between(start, end):
    try:
        a = datetime.strptime(start, "%Y-%m-%d").date()
        b = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        return 0
    nights = (b - a).days
    if nights < 1 or nights > 40:
        return 0
    return nights


def money(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    amount = round(float(value), 2)
    if amount <= 0 or amount > 100000:
        return None
    return amount


def cabin_prices(pricing):
    cabins = {"interior": None, "oceanView": None, "balcony": None}
    if not isinstance(pricing, list):
        return cabins
    for row in pricing:
        if not isinstance(row, dict):
            continue
        room = row.get("stateroomClass") if isinstance(row.get("stateroomClass"), dict) else {}
        field = CABIN_FIELDS.get(room.get("id") or "")
        price = row.get("price") if isinstance(row.get("price"), dict) else {}
        if price.get("currency", {}).get("code") not in (None, "USD"):
            continue
        if not field:
            continue
        amount = money(price.get("value"))
        if amount is None:
            continue
        current = cabins[field]
        if current is None or amount < current:
            cabins[field] = amount
    return cabins


def sailing_title(nights, name):
    title = clip(name, 120) or "Caribbean"
    if re.match(r"^\d+\s*-?\s*night\b", title, re.I):
        return title
    return f"{nights}-Night {title}"


def official_url(link):
    if not isinstance(link, str):
        return BROWSE_URL
    link = link.strip()
    if link.startswith("https://www.royalcaribbean.com/"):
        return link[:500]
    if link.startswith("/") and not link.startswith("//"):
        return (SITE + link)[:500]
    return BROWSE_URL


def post_graph(skip):
    body = {
        "operationName": "CruisesSearchResults",
        "query": QUERY,
        "variables": {
            "filters": "departurePort:PCN",
            "sort": {"by": "SAILDATE", "order": "ASC"},
            "pagination": {"count": PAGE_SIZE, "skip": skip},
        },
    }
    request = urllib.request.Request(
        GRAPH_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "MondosupremeCruises/1.0 (+https://mondosupreme.com/cruises/)",
            "Apollographql-Client-Name": "rcg-cruise-search-client",
            "Apollographql-Query-Name": "GetSearchResults",
            "Brand": "R",
            "Country": "USA",
            "Currency": "USD",
            "Language": "en",
            "Referer": BROWSE_URL,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("errors") and not (payload.get("data") or {}).get("cruiseSearch"):
        raise RuntimeError("cruise search returned errors")
    results = ((payload.get("data") or {}).get("cruiseSearch") or {}).get("results") or {}
    cruises = results.get("cruises")
    total = results.get("total")
    if not isinstance(cruises, list):
        raise RuntimeError("cruise search returned no cruise list")
    if not isinstance(total, int):
        total = len(cruises)
    return cruises, total


def fetch_groups():
    groups = []
    skip = 0
    total = None
    for _ in range(MAX_PAGES):
        cruises, reported = post_graph(skip)
        if total is None:
            total = reported
        if not cruises:
            break
        groups.extend(cruises)
        skip += len(cruises)
        if skip >= total or len(cruises) < PAGE_SIZE:
            break
        time.sleep(0.4)
    return groups


def build_deals(groups, ships):
    today = now_utc().date().isoformat()
    deals = []
    seen = set()
    for group in groups:
        if not isinstance(group, dict):
            continue
        master = group.get("masterSailing") if isinstance(group.get("masterSailing"), dict) else {}
        itinerary = master.get("itinerary") if isinstance(master.get("itinerary"), dict) else {}
        departure = itinerary.get("departurePort") if isinstance(itinerary.get("departurePort"), dict) else {}
        if departure.get("code") != "PCN":
            continue
        ship = itinerary.get("ship") if isinstance(itinerary.get("ship"), dict) else {}
        ship_name = clip(ship.get("name"), 80)
        ship_code = clip(ship.get("code"), 8)
        if not ship_name or not re.fullmatch(r"[A-Z0-9]{2,4}", ship_code or ""):
            continue
        known = ships.get(norm_name(ship_name))
        mmsi = known["mmsi"] if known else ""
        if known:
            ship_name = known["name"]
        ports = port_chain(itinerary.get("days"))
        if ports and ports[0] != "Port Canaveral":
            ports = ["Port Canaveral"] + [port for port in ports if port != "Port Canaveral"]
        if not ports:
            ports = ["Port Canaveral"]
        sailings = group.get("sailings")
        if not isinstance(sailings, list):
            continue
        for sailing in sailings:
            if not isinstance(sailing, dict):
                continue
            sail_date = parse_date(sailing.get("sailDate") or sailing.get("startDate"))
            end_date = parse_date(sailing.get("endDate"))
            if not sail_date or sail_date < today:
                continue
            nights = nights_between(sail_date, end_date)
            if not nights:
                master_nights = itinerary.get("sailingNights")
                if isinstance(master_nights, int) and 1 <= master_nights <= 40:
                    nights = master_nights
            if not nights:
                continue
            cabins = cabin_prices(sailing.get("stateroomClassPricing"))
            priced = [(field, amount) for field, amount in cabins.items() if amount is not None]
            if not priced:
                continue
            field, starting = min(priced, key=lambda item: item[1])
            package = ""
            itin = sailing.get("itinerary") if isinstance(sailing.get("itinerary"), dict) else {}
            if isinstance(itin.get("code"), str) and re.fullmatch(r"[A-Za-z0-9]{4,16}", itin["code"]):
                package = itin["code"]
            deal_id = f"{ship_code}-{sail_date}-{package or clip(group.get('id'), 40)}"
            if deal_id in seen:
                continue
            seen.add(deal_id)
            per_night = round(starting / nights, 2)
            deals.append({
                "id": deal_id,
                "line": "Royal Caribbean International",
                "ship": ship_name,
                "shipCode": ship_code,
                "mmsi": mmsi,
                "sailDate": sail_date,
                "endDate": end_date,
                "nights": nights,
                "title": sailing_title(nights, itinerary.get("name")),
                "ports": ports,
                "portsLabel": " → ".join(ports),
                "startingPrice": starting,
                "startingCabin": CABIN_LABELS[field],
                "perNight": per_night,
                "cabins": cabins,
                "url": official_url(sailing.get("bookingLink")),
                "packageCode": package,
            })
    if not deals:
        return deals
    lowest = min(deal["perNight"] for deal in deals)
    for deal in deals:
        deal["bestValue"] = abs(deal["perNight"] - lowest) < 0.009
        deal["under100"] = deal["perNight"] < 100
    deals.sort(key=lambda deal: (deal["sailDate"], deal["ship"], deal["id"]))
    return deals


def fresh_enough(previous):
    if os.environ.get("CANAVERAL_DEALS_FORCE") == "1":
        return False
    fetched = previous.get("fetchedAt") if isinstance(previous, dict) else ""
    if not isinstance(fetched, str):
        return False
    try:
        moment = datetime.strptime(fetched, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    age = now_utc() - moment
    return age.total_seconds() < MAX_AGE_HOURS * 3600


def write_deals(deals, fetched_at):
    document = {
        "about": ABOUT,
        "line": "Royal Caribbean International",
        "port": {
            "code": "PCN",
            "name": "Port Canaveral",
            "place": "Cape Canaveral, FL 32920",
        },
        "browseUrl": BROWSE_URL,
        "currency": "USD",
        "fetchedAt": fetched_at,
        "source": "Royal Caribbean public cruise search (https://www.royalcaribbean.com/cruises/graph).",
        "deals": deals,
    }
    OUT_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def main():
    previous = load_json(OUT_PATH, {})
    if fresh_enough(previous):
        print(f"Port Canaveral deals are still fresh ({previous.get('fetchedAt')}).")
        return
    try:
        groups = fetch_groups()
        deals = build_deals(groups, fleet_index())
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, TypeError, ValueError) as error:
        print(f"Port Canaveral fetch failed ({error}). Keeping the previous deals file.")
        return
    if not deals:
        print("Port Canaveral fetch returned no priced sailings. Keeping the previous deals file.")
        return
    write_deals(deals, stamp(now_utc()))
    ships = sorted({deal["ship"] for deal in deals})
    print(f"Saved {len(deals)} Port Canaveral sailings on {len(ships)} Royal Caribbean ships.")
    print("Ships: " + ", ".join(ships))


if __name__ == "__main__":
    main()
