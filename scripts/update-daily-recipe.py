#!/usr/bin/env python3
"""Build daily-recipe/daily.json from public cooking-channel feeds.

Primary source is YouTube's keyless channel RSS:
https://www.youtube.com/feeds/videos.xml?channel_id=UC...

That endpoint returns 404 or 500 for hours at a time. When a feed does not
answer 200, this script reads the same channel's public /videos page and the
watch page for the description. A run that cannot price at least 12 videos
leaves the previous file alone. Set DAILY_FORCE=1 to refresh even when the
snapshot is under 20 hours old.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "daily-recipe" / "daily.json"
RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
VIDEOS_PAGE = "https://www.youtube.com/@{handle}/videos"
WATCH_PAGE = "https://www.youtube.com/watch?v={video_id}"
UA = "Mozilla/5.0 (compatible; MondoTV/1.0; +https://mondosupreme.com/daily-recipe/)"
MAX_AGE_HOURS = 20
MIN_ROWS = 12
PER_CHANNEL = 8
MAX_POOL = 120
ATOM = "http://www.w3.org/2005/Atom"
YT = "http://www.youtube.com/xml/schemas/2015"
MEDIA = "http://search.yahoo.com/mrss/"

ABOUT = (
    "Daily YouTube recipe pool for MondoTV '98. The updater reads each channel's "
    "public RSS feed at youtube.com/feeds/videos.xml. When that feed does not answer, "
    "it reads the public channel page and the video description instead, and a failed "
    "run keeps the previous file. The page picks today's show from the viewer's calendar "
    "date, so the featured video changes every day between updates. Descriptions are "
    "parsed for an ingredients list and numbered steps when the chef included them. "
    "Not a replacement for the chef's own written recipe."
)

# Handles and channel ids from each channel's public canonical URL.
CHANNELS = [
    {"name": "Food Wishes", "handle": "foodwishes", "channelId": "UCRIZtPl9nb9RiXc9btSTQNw"},
    {"name": "Brian Lagerstrom", "handle": "brianlagerstrom", "channelId": "UCn5fhcGRrCvrmFibPbT6q1A"},
    {"name": "J. Kenji López-Alt", "handle": "JKenjiLopezAlt", "channelId": "UCqqJQ_cXSat0KIAVfIfKkVA"},
    {"name": "America's Test Kitchen", "handle": "AmericasTestKitchen", "channelId": "UCxAS_aK7sS2x_bqnlJHDSHw"},
    {"name": "Preppy Kitchen", "handle": "preppykitchen", "channelId": "UCTvYEid8tmg0jqGPDkehc_Q"},
    {"name": "Sip and Feast", "handle": "sipandfeast", "channelId": "UCbyjYRUS9gADwAGuUxcfVcA"},
    {"name": "NYT Cooking", "handle": "nytcooking", "channelId": "UC1rIOwTqDuWkFj87HZYRFOg"},
    {"name": "Not Another Cooking Show", "handle": "notanothercookingshow", "channelId": "UCuL-5ytBmu6KG0BwjSFaD0g"},
]

SKIP_TITLE = re.compile(
    r"(#shorts|\bpodcast\b|\btrailer\b|\blivestream\b|\blive stream\b|\bq\s*&\s*a\b)",
    re.I,
)
HEAD_ING = re.compile(
    r"^(?:ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|you will need|shopping list)\b[:\s-]*$",
    re.I,
)
HEAD_STEP = re.compile(
    r"^(?:directions?|instructions?|method|steps|preparation|how to (?:make|cook))\b[:\s-]*$",
    re.I,
)
HEAD_STOP = re.compile(
    r"^(?:notes?|equipment|tools|nutrition|subscribe|links?|chapters?|timestamps?)\b[:\s-]*$",
    re.I,
)
QTY_LINE = re.compile(
    r"^(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\b",
)
STEP_LINE = re.compile(r"^(?:step\s+)?(\d+)[.)]\s+\S", re.I)
BULLET = re.compile(r"^[▪▸●►✓✔\-*•–]\s*")
TIMESTAMP = re.compile(r"\b\d{1,2}:\d{2}\b")
STEPISH = re.compile(r"^\d+\s+[A-Z]")
GEAR = re.compile(r"^(?:my gear|watch next|equipment|tools|links?|chapters?|timestamps?|subscribe)\b", re.I)


def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0)


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def fresh_enough(previous):
    if os.environ.get("DAILY_FORCE") == "1":
        return False
    raw = str(previous.get("fetchedAt") or "")
    try:
        moment = datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return now_utc() - moment < timedelta(hours=MAX_AGE_HOURS)


def fetch(url, timeout=25):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.read()


def fetch_retry(url, attempts=3):
    last = None
    for attempt in range(attempts):
        try:
            status, body = fetch(url)
            if status == 200 and body:
                return body
            last = f"HTTP {status}"
        except urllib.error.HTTPError as err:
            last = f"HTTP {err.code}"
            if err.code not in (404, 429, 500, 502, 503):
                break
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            last = str(err)
        if attempt + 1 < attempts:
            time.sleep(1.5 * (attempt + 1))
    print(f"  miss {url} ({last})", flush=True)
    return b""


def text_of(node):
    if node is None or node.text is None:
        return ""
    return node.text.strip()


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def parse_rss(xml_bytes, channel):
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as err:
        print(f"  rss parse {channel['handle']}: {err}", flush=True)
        return []
    rows = []
    for entry in root:
        if local_name(entry.tag) != "entry":
            continue
        video_id = ""
        title = ""
        published = ""
        author = channel["name"]
        description = ""
        for child in entry.iter():
            name = local_name(child.tag)
            if name == "videoId" and child.text:
                video_id = child.text.strip()
            elif name == "title" and child.text and not title:
                title = child.text.strip()
            elif name == "published" and child.text and not published:
                published = child.text.strip()[:10]
            elif name == "name" and child.text and author == channel["name"]:
                author = child.text.strip()
            elif name == "description" and child.text and len(child.text) > len(description):
                description = child.text
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            continue
        rows.append(make_video(video_id, title, author or channel["name"], channel["handle"], published, description))
    return rows


def json_string_at(text, index):
    value, _end = json.JSONDecoder().raw_decode(text, index)
    return value if isinstance(value, str) else ""


def parse_channel_page(html, channel):
    titles = []
    for match in re.finditer(r'"lockupMetadataViewModel":\{"title":\{"content":', html):
        try:
            title = json_string_at(html, match.end())
        except json.JSONDecodeError:
            continue
        if title:
            titles.append(title)
    ids = []
    seen = set()
    for video_id in re.findall(r'"contentId":"([A-Za-z0-9_-]{11})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"', html):
        if video_id in seen:
            continue
        seen.add(video_id)
        ids.append(video_id)
    if titles and ids and len(titles) != len(ids):
        print(f"  {channel['handle']} title/id mismatch {len(titles)}/{len(ids)}", flush=True)
    rows = []
    for index, video_id in enumerate(ids[:PER_CHANNEL]):
        title = titles[index] if index < len(titles) else ""
        rows.append({"videoId": video_id, "title": title})
    return rows


def parse_watch(html):
    description = ""
    marker = '"attributedDescription":{"content":'
    index = html.find(marker)
    if index >= 0:
        try:
            description = json_string_at(html, index + len(marker))
        except json.JSONDecodeError:
            description = ""
    published = ""
    match = re.search(r'"publishDate":\{"simpleText":"([^"]+)"\}', html)
    if match:
        published = parse_published(match.group(1))
    channel = ""
    match = re.search(r'"channel":\{"simpleText":"((?:\\.|[^"\\])*)"\}', html)
    if match:
        try:
            channel = json.loads('"' + match.group(1) + '"')
        except json.JSONDecodeError:
            channel = ""
    return description, published, channel


def parse_published(text):
    cleaned = text.replace(",", "").strip()
    for fmt in ("%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def clean_line(line):
    text = re.sub(r"\s+", " ", line).strip()
    text = BULLET.sub("", text).strip()
    text = re.sub(r"^(?:step\s+)?\d+[.)]\s+", "", text, flags=re.I).strip()
    return text


def step_text(line):
    text = clean_line(line)
    return re.sub(r"^\d+\s+", "", text).strip()


def heading(line):
    return line.strip(" #:*-\t").strip()


def looks_like_link(text):
    lowered = text.lower()
    return lowered.startswith("http") or "http://" in lowered or "https://" in lowered or "amzn.to" in lowered


def is_heading_line(raw):
    head = heading(raw)
    if not head or len(head) > 60:
        return ""
    if HEAD_ING.match(head) or re.search(r"ingredients?$", head, re.I):
        return "ing"
    if HEAD_STEP.match(head):
        return "step"
    if head.upper() == "RECIPE":
        return "ing"
    if HEAD_STOP.match(head) or GEAR.match(head):
        return "off"
    if head.endswith(":") and len(head) <= 40:
        return "sub"
    return ""


def is_step_line(raw):
    text = raw.strip()
    if STEP_LINE.match(text) or STEPISH.match(text):
        return True
    return False


def is_ingredient_line(raw):
    if looks_like_link(raw) or TIMESTAMP.search(raw):
        return False
    if is_step_line(raw):
        return False
    text = clean_line(raw)
    if not text or len(text) > 160 or text.endswith(":"):
        return False
    if not re.search(r"[A-Za-z]", text):
        return False
    if BULLET.match(raw.strip()) or QTY_LINE.match(text):
        return True
    return False


def extract_recipe(description):
    """Pull an ingredients list and steps out of a video description."""
    lines = [line.strip() for line in str(description or "").replace("\r", "").split("\n")]
    ingredients = []
    steps = []
    mode = ""
    for raw in lines:
        if not raw:
            continue
        kind = is_heading_line(raw)
        if kind == "ing":
            mode = "ing"
            continue
        if kind == "step":
            mode = "step"
            continue
        if kind == "off":
            mode = ""
            continue
        if kind == "sub":
            continue
        if is_step_line(raw) and (mode == "ing" or ingredients or mode == "step"):
            mode = "step"
        item = clean_line(raw)
        if not item or looks_like_link(item):
            continue
        if mode == "step" and len(item) <= 400:
            steps.append(step_text(raw))
        elif mode == "ing" and is_ingredient_line(raw):
            ingredients.append(item)
    if not ingredients:
        for raw in lines:
            if is_ingredient_line(raw):
                ingredients.append(clean_line(raw))
    if not steps:
        for raw in lines:
            if is_step_line(raw):
                item = step_text(raw)
                if item and not looks_like_link(item) and len(item) <= 400:
                    steps.append(item)
    ingredients = [item for item in dedupe(ingredients) if not re.search(r"ingredients?$", item, re.I)][:40]
    steps = dedupe(steps)[:24]
    return ingredients, steps


def dedupe(items):
    seen = set()
    out = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def blurb_from(description):
    text = re.sub(r"\s+", " ", str(description or "")).strip()
    text = re.sub(r"https?://\S+", "", text).strip()
    return text[:600]


def make_video(video_id, title, channel, handle, published, description):
    title = re.sub(r"\s+", " ", str(title or "")).strip()[:180]
    ingredients, steps = extract_recipe(description)
    if not steps:
        steps = ["Watch the full method in the video."]
    published = published if re.fullmatch(r"\d{4}-\d{2}-\d{2}", published or "") else ""
    return {
        "videoId": video_id,
        "title": title or video_id,
        "channel": str(channel or "").strip()[:80],
        "handle": handle,
        "published": published,
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "youtube": f"https://www.youtube.com/watch?v={video_id}",
        "ingredients": ingredients,
        "steps": steps,
        "blurb": blurb_from(description),
    }


def wanted(title):
    return bool(title) and not SKIP_TITLE.search(title)


def collect_channel(channel, known):
    print(f"Feed {channel['name']}", flush=True)
    rss = fetch_retry(RSS.format(channel_id=channel["channelId"]))
    if rss and b"<entry" in rss:
        rows = [row for row in parse_rss(rss, channel) if wanted(row["title"])]
        if rows:
            print(f"  rss {len(rows)}", flush=True)
            return rows[:PER_CHANNEL], True
    page = fetch_retry(VIDEOS_PAGE.format(handle=channel["handle"]))
    if not page:
        return [], False
    html = page.decode("utf-8", "replace")
    cards = [card for card in parse_channel_page(html, channel) if wanted(card["title"])]
    rows = []
    for card in cards[:PER_CHANNEL]:
        video_id = card["videoId"]
        prior = known.get(video_id)
        if prior and prior.get("blurb") and os.environ.get("DAILY_REPARSE") != "1":
            if card["title"]:
                prior = dict(prior)
                prior["title"] = card["title"][:180]
            rows.append(prior)
            continue
        time.sleep(0.2)
        watch = fetch_retry(WATCH_PAGE.format(video_id=video_id), attempts=2)
        description = ""
        published = ""
        author = channel["name"]
        if watch:
            description, published, author = parse_watch(watch.decode("utf-8", "replace"))
        rows.append(make_video(video_id, card["title"], author or channel["name"], channel["handle"], published, description))
        print(f"  {video_id} ingredients={len(rows[-1]['ingredients'])}", flush=True)
    return rows, False


def merge(previous, fresh):
    by_id = {}
    for row in previous.get("videos") or []:
        video_id = str(row.get("videoId") or "")
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            by_id[video_id] = row
    for row in fresh:
        video_id = row["videoId"]
        old = by_id.get(video_id) or {}
        if old.get("blurb") and not row.get("blurb"):
            row = dict(old)
            row["title"] = fresh_title(row, old)
        by_id[video_id] = row
    rows = list(by_id.values())
    rows.sort(key=lambda row: (row.get("published") or "", row.get("videoId") or ""), reverse=True)
    return rows[:MAX_POOL]


def fresh_title(row, old):
    return row.get("title") or old.get("title") or row.get("videoId")


def write_pool(videos, source):
    payload = {
        "about": ABOUT,
        "source": source,
        "fetchedAt": stamp(now_utc()),
        "channels": [channel["name"] for channel in CHANNELS],
        "count": len(videos),
        "videos": videos,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    with_ings = sum(1 for row in videos if row.get("ingredients"))
    print(f"Saved {len(videos)} videos. With ingredients: {with_ings}.", flush=True)


def self_test():
    description = """
    Crime scene chicken, a roast with a spicy glaze.

    Ingredients:
    1 whole chicken
    2 tbsp gochujang
    - 1 tbsp soy sauce
    1 tbsp soy sauce

    Directions:
    1. Cut deep slashes in the chicken.
    2. Roast until the glaze darkens.

    Notes:
    Rest before slicing.
    """
    ingredients, steps = extract_recipe(description)
    assert ingredients == ["1 whole chicken", "2 tbsp gochujang", "1 tbsp soy sauce"], ingredients
    assert steps[0].startswith("Cut deep"), steps
    brian = """
    MY GEAR:
    6.75 QT DUTCH OVEN: https://amzn.to/4fb8NMJ
    RECIPE
    Meat Sauce:
    ▪Olive oil
    ▪450g (1 lb) ground chuck
    1 Preheat oven to 400F.
    2 Heat the Dutch oven.
    """
    bing, bsteps = extract_recipe(brian)
    assert bing == ["Olive oil", "450g (1 lb) ground chuck"], bing
    assert bsteps[0].startswith("Preheat"), bsteps
    loose, _ = extract_recipe("Meatloaf ingredients\n2 pounds ground sirloin\n1 cup breadcrumbs\nRemaining ingredients for sauce\n1/2 cup parsley")
    assert "Meatloaf ingredients" not in loose, loose
    assert loose[0].startswith("2 pounds"), loose
    assert "Rest before" not in " ".join(steps)
    loose, _steps = extract_recipe("Serve with rice.\n2 cups rice\n1 onion, sliced\n0:12 intro")
    assert loose == ["2 cups rice", "1 onion, sliced"], loose
    video = make_video("y5uQeuAMeF8", "Crime Scene Chicken", "Food Wishes", "foodwishes", "2026-10-21", description)
    assert video["thumbnail"].startswith("https://i.ytimg.com/vi/")
    assert video["youtube"] == "https://www.youtube.com/watch?v=y5uQeuAMeF8"
    assert not wanted("Channel trailer")
    assert wanted("Crime Scene Chicken")
    sample = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <yt:videoId>abcdefghijk</yt:videoId>
        <title>Weeknight Chili</title>
        <published>2026-10-20T12:00:00+00:00</published>
        <author><name>Sip and Feast</name></author>
        <media:group><media:description>Ingredients:
1 lb beef
1 onion
Directions:
1. Brown the beef.</media:description></media:group>
      </entry>
    </feed>
    """
    rows = parse_rss(sample.encode(), {"name": "Sip and Feast", "handle": "sipandfeast"})
    assert rows[0]["videoId"] == "abcdefghijk", rows
    assert rows[0]["ingredients"][0] == "1 lb beef"
    assert rows[0]["published"] == "2026-10-20"
    print("self-test ok")


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    previous = load_json(OUT_PATH)
    if fresh_enough(previous):
        print(f"Snapshot {previous.get('fetchedAt')} is under {MAX_AGE_HOURS}h. Leaving it.", flush=True)
        return
    known = {}
    for row in previous.get("videos") or []:
        video_id = str(row.get("videoId") or "")
        if video_id:
            known[video_id] = row
    fresh = []
    rss_hits = 0
    for channel in CHANNELS:
        try:
            batch, via_rss = collect_channel(channel, known)
        except Exception as err:  # one channel should not wipe the pool
            print(f"  failed {channel['handle']}: {err}", flush=True)
            batch, via_rss = [], False
        fresh.extend(batch)
        if via_rss:
            rss_hits += 1
        time.sleep(0.3)
    videos = merge(previous, fresh)
    if len(videos) < MIN_ROWS:
        print(f"Only {len(videos)} videos. Keeping the previous file.", flush=True)
        if not previous.get("videos"):
            sys.exit(1)
        return
    if rss_hits == len(CHANNELS):
        source = "YouTube channel RSS (feeds/videos.xml)"
    elif rss_hits:
        source = (
            "YouTube channel RSS (feeds/videos.xml), with the public channel page "
            "when a feed did not answer"
        )
    else:
        source = (
            "Public YouTube channel pages. The official feeds/videos.xml RSS answer "
            "was not available for this run, and a later run will try the RSS feed again"
        )
    write_pool(videos, source)


if __name__ == "__main__":
    main()
