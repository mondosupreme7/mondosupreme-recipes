(function () {
  'use strict';

  var CLASS_ORDER = ['Vision', 'Voyager', 'Radiance', 'Freedom', 'Oasis', 'Quantum', 'Icon'];
  var NAV = {
    0: 'Under way',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Fishing',
    8: 'Under sail'
  };
  var PORTS = {
    USMIA: 'Miami',
    USTPA: 'Tampa',
    USSAN: 'San Diego',
    USGAL: 'Galveston',
    USPCV: 'Port Canaveral',
    USBAY: 'Cape Liberty, Bayonne',
    BSNAS: 'Nassau',
    BHNAS: 'Nassau',
    BSCOC: 'CocoCay',
    PRSJU: 'San Juan',
    MXSJD: 'San José del Cabo',
    MXCZM: 'Cozumel',
    CZMMEX: 'Cozumel',
    HRSPU: 'Split',
    HRDBV: 'Dubrovnik',
    ITNAP: 'Naples',
    ESBCN: 'Barcelona',
    JPNGS: 'Nagasaki',
    HKHKG: 'Hong Kong',
    PFPPT: 'Papeete',
    TCGDT: 'Grand Turk',
    KNBAS: 'Basseterre',
    VUVLI: 'Port Vila',
    ARUBA: 'Aruba'
  };

  var fleet = [];
  var positions = {ships: {}, attribution: {}, updated: ''};
  var markers = Object.create(null);
  var wakes = Object.create(null);
  var wakesOn = true;
  var selected = '';
  var map;
  var countTimer = 0;
  var countChoice = null;
  var countDefault = null;
  try { wakesOn = localStorage.getItem('mondosupreme.wakes.v1') !== '0'; } catch (e) { wakesOn = true; }

  document.getElementById('yr').textContent = String(new Date().getFullYear());

  L.Icon.Default.mergeOptions({
    iconUrl: 'vendor/leaflet/images/marker-icon.png',
    iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png',
    shadowUrl: 'vendor/leaflet/images/marker-shadow.png'
  });

  map = L.map('map', {
    preferCanvas: true,
    renderer: L.canvas({padding: 0.5}),
    worldCopyJump: true,
    minZoom: 2,
    fadeAnimation: false,
    zoomAnimation: true
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  map.setView([25, -40], 2);
  map.on('zoomend', function () { syncLabels(); });
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (map) map.invalidateSize(false); }, 150);
  });

  document.getElementById('q').addEventListener('input', renderList);
  document.getElementById('sort').addEventListener('change', renderList);
  document.getElementById('fit').addEventListener('click', fitFleet);

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function posOf(ship) {
    var ships = positions.ships || {};
    var row = ships[ship.mmsi];
    return row && typeof row === 'object' ? row : null;
  }

  function localTime(iso) {
    var time = Date.parse(iso);
    if (!Number.isFinite(time)) return 'Unknown time';
    return new Date(time).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
  }

  function agePhrase(iso) {
    var time = Date.parse(iso);
    if (!Number.isFinite(time)) return '';
    var seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return seconds + 's ago';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ' + (seconds % 60) + 's ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 48) return hours + 'h ' + (minutes % 60) + 'm ago';
    return Math.round(hours / 24) + ' days ago';
  }

  var FRESH_MS = 2 * 60 * 60 * 1000;
  var STALE_MS = 6 * 60 * 60 * 1000;
  var DR_CAP_MS = 15 * 60 * 1000;
  function fixAge(row) {
    var heard = heardMs(row);
    return heard ? Date.now() - heard : Infinity;
  }
  function displayPos(row) {
    if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return null;
    var age = fixAge(row);
    var staleFix = age > STALE_MS;
    if (age > FRESH_MS) return {lat: row.lat, lon: row.lon, estimated: false, stale: staleFix};
    var sog = typeof row.sog === 'number' ? row.sog : 0;
    var course = typeof row.cog === 'number' ? row.cog : (typeof row.heading === 'number' ? row.heading : null);
    if (!(sog > 0.5 && course != null && age > 2000)) return {lat: row.lat, lon: row.lon, estimated: false, stale: false};
    var hours = Math.min(age, DR_CAP_MS) / 3600000;
    var nm = Math.min(sog * hours, 5);
    var rad = course * Math.PI / 180;
    var dLat = (nm / 60) * Math.cos(rad);
    var cosLat = Math.cos(row.lat * Math.PI / 180);
    var dLon = (nm / 60) * Math.sin(rad) / (Math.abs(cosLat) < 0.2 ? 0.2 : cosLat);
    return {lat: row.lat + dLat, lon: row.lon + dLon, estimated: true, stale: false};
  }
  function nmBetween(a, b) {
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var lat1 = a.lat * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function stale(iso) {
    var time = Date.parse(iso);
    return Number.isFinite(time) && Date.now() - time > 12 * 60 * 60 * 1000;
  }

  function portName(token) {
    var trimmed = token.trim();
    if (!trimmed) return '';
    var key = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return PORTS[key] ? PORTS[key] + ' (' + trimmed + ')' : trimmed;
  }

  function destinationText(raw) {
    if (!raw) return '';
    return raw.split(/\s*>+\s*/).map(portName).filter(Boolean).join(' → ');
  }

  function areaText(row) {
    if (!row) return 'No position yet';
    if (row.near) return row.near;
    if (typeof row.lat === 'number' && typeof row.lon === 'number') {
      return Math.abs(row.lat).toFixed(2) + '° ' + (row.lat >= 0 ? 'N' : 'S') + ', ' +
        Math.abs(row.lon).toFixed(2) + '° ' + (row.lon >= 0 ? 'E' : 'W');
    }
    return 'No position yet';
  }

  function motionText(row) {
    if (!row) return 'Speed not reported';
    var parts = [];
    if (typeof row.sog === 'number') parts.push(row.sog.toFixed(1) + ' kn');
    if (typeof row.heading === 'number') parts.push('heading ' + row.heading + '°');
    else if (typeof row.cog === 'number') parts.push('course ' + Math.round(row.cog) + '°');
    return parts.length ? parts.join(' · ') : 'Speed not reported';
  }

  function portText(row) {
    if (!row) return 'Port not reported';
    var status = NAV[row.navStatus] || '';
    var dest = destinationText(row.destination || '');
    var here = row.navStatus === 1 || row.navStatus === 5;
    if (here) {
      var place = row.near || areaText(row);
      return (status ? status + ' near ' + place : 'Near ' + place) + (dest ? '. Next: ' + dest : '');
    }
    if (status && dest) return status + '. Next: ' + dest;
    if (dest) return 'Next: ' + dest;
    if (status) return status;
    return 'Port not reported';
  }

  function etaText(row) {
    if (!row || !row.eta) return '';
    var eta = String(row.eta).trim();
    if (/^\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(eta)) return 'AIS ETA ' + eta + ' UTC';
    return 'AIS ETA ' + eta;
  }

  function popupLine(label, text) {
    var line = el('div', null, 'popup-row');
    line.append(el('b', label + ' '));
    line.append(document.createTextNode(text));
    return line;
  }

  function coordText(row) {
    if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return '';
    return Math.abs(row.lat).toFixed(2) + '° ' + (row.lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(row.lon).toFixed(2) + '° ' + (row.lon >= 0 ? 'E' : 'W');
  }

  function popupNode(ship, row) {
    var box = el('div', null, 'ship-popup');
    var staleFix = !row || fixAge(row) > STALE_MS;
    box.append(el('strong', ship.name, 'popup-title'));
    box.append(popupLine('Status', staleFix ? ('Last seen ' + (row && row.seen ? agePhrase(row.seen) : 'a while ago')) : (NAV[row.navStatus] || 'Reported')));
    if (!staleFix) box.append(popupLine('Speed', motionText(row)));
    if (row && row.seen) box.append(popupLine('Last seen', localTime(row.seen) + ' (' + agePhrase(row.seen) + ')'));
    else box.append(popupLine('Last seen', 'No report yet'));
    box.append(popupLine('Destination', destinationText(row && row.destination) || 'Not reported'));
    var extra = el('div', null, 'popup-extra');
    extra.hidden = true;
    extra.append(popupLine('Class', ship.class));
    var coords = coordText(row);
    if (coords) extra.append(popupLine('Where', coords));
    var eta = etaText(row);
    if (eta) extra.append(popupLine('ETA', eta));
    extra.append(el('div', 'IMO ' + ship.imo, 'popup-note'));
    var shown = displayPos(row);
    if (shown && shown.estimated) extra.append(el('div', 'Moved a short way along the last reported course.', 'popup-note'));
    var toggle = el('button', 'Details', 'popup-more');
    toggle.type = 'button';
    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      extra.hidden = !extra.hidden;
      toggle.textContent = extra.hidden ? 'Details' : 'Hide details';
    });
    box.append(toggle);
    box.append(extra);
    return box;
  }

  var POPUP_OPTIONS = {
    className: 'ship-callout',
    maxWidth: 240,
    minWidth: 180,
    autoPan: true,
    keepInView: true,
    autoPanPaddingTopLeft: [54, 54],
    autoPanPaddingBottomRight: [16, 16],
    closeButton: true
  };

  function fitFleet() {
    var bounds = L.latLngBounds([]);
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (row && typeof row.lat === 'number' && typeof row.lon === 'number') bounds.extend([row.lat, row.lon]);
    });
    if (bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24], maxZoom: 3, animate: true});
  }

  function tamePopup() {
    var closer = document.querySelector('.leaflet-popup-close-button');
    if (closer) closer.removeAttribute('href');
  }

  function holdScroll(fn) {
    var x = window.scrollX;
    var y = window.scrollY;
    fn();
    window.scrollTo(x, y);
    requestAnimationFrame(function () { window.scrollTo(x, y); });
  }

  function selectShip(mmsi, fromMap) {
    selected = mmsi;
    var ship = fleet.filter(function (item) { return item.mmsi === mmsi; })[0];
    var row = ship ? posOf(ship) : null;
    Object.keys(markers).forEach(function (key) { paintDot(markers[key], key === mmsi); });
    renderList();
    var shown = row ? displayPos(row) : null;
    if (!(shown && markers[mmsi])) return;
    var open = function () {
      map.setView([shown.lat, shown.lon], Math.max(map.getZoom(), 5), {animate: !fromMap});
      markers[mmsi].hit.setPopupContent(popupNode(ship, row));
      markers[mmsi].hit.openPopup();
      tamePopup();
    };
    if (fromMap) holdScroll(open);
    else open();
    if (!fromMap) document.querySelector('.ship-map').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function dotColor(active, staleFix) {
    if (staleFix) return '#94a3b8';
    return active ? '#1d4ed8' : '#c8553d';
  }

  function paintDot(entry, active) {
    if (!entry || !entry.dot) return;
    var row = posOf(entry.ship);
    var shown = row ? displayPos(row) : null;
    entry.dot.setStyle({
      radius: 6,
      weight: 2,
      color: '#ffffff',
      fillColor: dotColor(active, shown && shown.stale),
      fillOpacity: 1
    });
  }

  function labelText(ship, row) {
    if (row && fixAge(row) > STALE_MS) return ship.name + ' · Last seen ' + agePhrase(row.seen);
    return ship.name;
  }

  function syncLabels() {
    if (!map) return;
    var show = map.getZoom() >= 9;
    Object.keys(markers).forEach(function (key) {
      var entry = markers[key];
      var row = posOf(entry.ship);
      if (!show) {
        if (entry.hit.getTooltip()) entry.hit.unbindTooltip();
        return;
      }
      var text = labelText(entry.ship, row);
      if (!entry.hit.getTooltip()) {
        entry.hit.bindTooltip(text, {permanent: true, direction: 'top', offset: [0, -8], className: 'ship-tip', opacity: 1});
      } else entry.hit.setTooltipContent(text);
    });
  }

  function moveEntry(entry, lat, lon) {
    var here = entry.hit.getLatLng();
    if (here && Math.abs(here.lat - lat) < 0.00005 && Math.abs(here.lng - lon) < 0.00005) return;
    entry.hit.setLatLng([lat, lon]);
    entry.dot.setLatLng([lat, lon]);
  }

  function makeEntry(ship, shown, row) {
    var renderer = map.options.renderer;
    var hit = L.circleMarker([shown.lat, shown.lon], {
      renderer: renderer,
      radius: 22,
      stroke: false,
      fillOpacity: 0,
      interactive: true,
      bubblingMouseEvents: false
    });
    var dot = L.circleMarker([shown.lat, shown.lon], {
      renderer: renderer,
      radius: 6,
      weight: 2,
      color: '#ffffff',
      fillColor: dotColor(ship.mmsi === selected, shown.stale),
      fillOpacity: 1,
      interactive: false
    });
    hit.bindPopup(popupNode(ship, row), POPUP_OPTIONS);
    hit.on('click', function (event) {
      if (event.originalEvent) L.DomEvent.stop(event.originalEvent);
      selectShip(ship.mmsi, true);
    });
    dot.addTo(map);
    hit.addTo(map);
    return {hit: hit, dot: dot, ship: ship};
  }

  function drawMarkers() {
    var seen = Object.create(null);
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return;
      var shown = displayPos(row);
      if (!shown) return;
      seen[ship.mmsi] = true;
      var entry = markers[ship.mmsi];
      if (!entry) {
        entry = makeEntry(ship, shown, row);
        markers[ship.mmsi] = entry;
      } else {
        moveEntry(entry, shown.lat, shown.lon);
        paintDot(entry, ship.mmsi === selected);
        if (entry.hit.getPopup()) entry.hit.setPopupContent(popupNode(ship, row));
      }
    });
    Object.keys(markers).forEach(function (key) {
      if (seen[key]) return;
      map.removeLayer(markers[key].hit);
      map.removeLayer(markers[key].dot);
      delete markers[key];
    });
    syncLabels();
    drawWakes();
  }

  function clearWakes() {
    Object.keys(wakes).forEach(function (key) {
      var lines = wakes[key];
      if (!lines) return;
      (Array.isArray(lines) ? lines : [lines]).forEach(function (line) { map.removeLayer(line); });
    });
    wakes = Object.create(null);
  }

  function trackSegments(row) {
    var points = [];
    (Array.isArray(row.trail) ? row.trail : []).forEach(function (point) {
      var time = Date.parse(point && point.seen || '');
      if (point && typeof point.lat === 'number' && typeof point.lon === 'number') {
        points.push({lat: point.lat, lon: point.lon, t: Number.isFinite(time) ? time : 0});
      }
    });
    var heard = heardMs(row);
    points.push({lat: row.lat, lon: row.lon, t: heard || 0});
    points.sort(function (a, b) { return a.t - b.t; });
    var segments = [];
    var run = [];
    points.forEach(function (point) {
      if (!run.length) { run.push(point); return; }
      var prev = run[run.length - 1];
      if (Math.abs(prev.lat - point.lat) < 0.00001 && Math.abs(prev.lon - point.lon) < 0.00001) return;
      var gap = point.t && prev.t ? (point.t - prev.t) / 3600000 : 99;
      if (gap > 6) {
        if (run.length > 1) segments.push(run);
        run = [point];
        return;
      }
      var speed = gap > 0 ? nmBetween(prev, point) / gap : 99;
      if (speed > 30) return;
      run.push(point);
    });
    if (run.length > 1) segments.push(run);
    return segments;
  }

  function drawWakes() {
    clearWakes();
    if (!wakesOn) return;
    var renderer = map.options.renderer;
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return;
      var lines = [];
      trackSegments(row).forEach(function (segment) {
        var line = L.polyline(segment.map(function (point) { return [point.lat, point.lon]; }), {
          renderer: renderer,
          color: '#1d4ed8',
          weight: 2,
          opacity: 0.85,
          interactive: false,
          smoothFactor: 1
        });
        line.addTo(map);
        lines.push(line);
      });
      if (lines.length) wakes[ship.mmsi] = lines;
    });
  }

  function matches(ship, row, query) {
    if (!query) return true;
    var blob = [ship.name, ship.class, ship.imo, ship.mmsi, areaText(row), destinationText(row && row.destination), row && row.destination]
      .join(' ').toLowerCase();
    return blob.indexOf(query) !== -1;
  }

  function renderList() {
    var query = document.getElementById('q').value.trim().toLowerCase();
    var mode = document.getElementById('sort').value;
    var rows = fleet.filter(function (ship) { return matches(ship, posOf(ship), query); });
    rows.sort(function (a, b) {
      if (mode === 'class') {
        var classDelta = CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class);
        if (classDelta) return classDelta;
        return a.name.localeCompare(b.name);
      }
      if (mode === 'heard') return heard(b) - heard(a) || a.name.localeCompare(b.name);
      if (mode === 'speed') return speed(b) - speed(a) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    var list = document.getElementById('list');
    list.replaceChildren();
    rows.forEach(function (ship) {
      var row = posOf(ship);
      var button = el('button', null, 'ship' + (ship.mmsi === selected ? ' is-selected' : ''));
      button.type = 'button';
      button.dataset.mmsi = ship.mmsi;
      button.setAttribute('aria-pressed', ship.mmsi === selected ? 'true' : 'false');
      button.append(el('span', ship.name, 'ship-name'));
      button.append(el('span', ship.class + ' class', 'cat'));
      button.append(el('span', areaText(row), 'ship-line'));
      var staleFix = row && fixAge(row) > STALE_MS;
      if (!staleFix) button.append(el('span', motionText(row), 'meta'));
      var heardLine = staleFix
        ? 'Last seen ' + agePhrase(row.seen)
        : (row && row.seen ? 'Last heard ' + agePhrase(row.seen) : 'No report yet');
      var shown = displayPos(row);
      if (shown && shown.estimated) heardLine += ' · short estimate from the last report';
      button.append(el('span', heardLine, stale(row && row.seen) ? 'meta is-stale heard-age' : 'meta heard-age'));
      if (row && row.source && row.source !== 'aisstream.io') button.append(el('span', 'Earlier stored report', 'meta'));
      button.append(el('span', portText(row), 'meta'));
      var eta = etaText(row);
      if (eta) button.append(el('span', eta, 'meta'));
      button.addEventListener('click', function () { selectShip(ship.mmsi, false); });
      list.append(button);
    });
    document.getElementById('none').hidden = rows.length !== 0;
    document.getElementById('count').textContent = rows.length === fleet.length
      ? fleet.length + ' ships'
      : 'Showing ' + rows.length + ' of ' + fleet.length + ' ships';
  }

  function heard(ship) {
    var row = posOf(ship);
    var time = row ? Date.parse(row.seen) : NaN;
    return Number.isFinite(time) ? time : 0;
  }

  function speed(ship) {
    var row = posOf(ship);
    return row && typeof row.sog === 'number' ? row.sog : -1;
  }

  function linkify(parent, text) {
    var pattern = /https:\/\/[^\s)]+/g;
    var last = 0;
    var match;
    while ((match = pattern.exec(text))) {
      parent.append(text.slice(last, match.index));
      var link = document.createElement('a');
      link.href = match[0];
      link.textContent = match[0];
      link.rel = 'noopener noreferrer';
      parent.append(link);
      last = match.index + match[0].length;
    }
    parent.append(text.slice(last));
  }

  function fillFreshness() {
    var box = document.getElementById('freshness');
    box.replaceChildren();
    if (positions.updated) {
      box.append(el('span', 'Snapshot published ' + localTime(positions.updated) + ' (' + agePhrase(positions.updated) + '). '));
    } else {
      box.append(el('span', 'No position snapshot has been published yet. '));
    }
    box.append(el('span', 'Times below are when each ship was last heard. While this tab is open, Open Waters is checked about every 30 seconds and the saved snapshot every 60 seconds. A report under two hours old may be moved up to 15 minutes along its course. Older reports stay on the last real position, and track lines use reported fixes only. Not for navigation.'));
    if (liveNote) box.append(el('span', ' ' + liveNote));
  }

  function fillCredits() {
    var box = document.getElementById('credits');
    box.replaceChildren();
    box.append(el('h2', 'Sources'));
    box.append(el('p', 'The fleet list is taken from the current-fleet tables on the English Wikipedia article Royal Caribbean International. IMO and MMSI numbers come from Wikidata. Ships that have left the fleet are left out, and Hero of the Seas is left out until it enters service.'));
    box.append(el('p', 'Live positions are sampled from aisstream.io about every 5 minutes, the shortest schedule GitHub Actions allows, with Open Waters filling in ships that stay quiet. While this tab is visible, the page also asks Open Waters about every 30 seconds and re-reads the saved snapshot every 60 seconds, keeping whichever report was heard later. Polling pauses when the tab is hidden. The aisstream key stays on the server. Destination text is the port code the ship broadcast.'));
    box.append(el('p', 'Port Canaveral fares come from Royal Caribbean\'s public cruise search for Royal Caribbean International ships leaving Port Canaveral. The saved sheet refreshes about once a day. A failed fetch keeps the previous prices.'));
    var lines = [];
    var attr = positions.attribution || {};
    Object.keys(attr).sort().forEach(function (key) {
      if (typeof attr[key] === 'string' && lines.indexOf(attr[key]) === -1) lines.push(attr[key]);
    });
    if (!lines.length) return;
    var list = document.createElement('ul');
    lines.forEach(function (line) {
      var item = document.createElement('li');
      linkify(item, line);
      list.append(item);
    });
    box.append(list);
  }

  var liveNote = '';
  var loading = false;
  var refreshTimer = 0;
  var fitted = false;

  function show(message) {
    var box = document.getElementById('freshness');
    box.textContent = message;
  }

  function cleanSource(value) {
    if (typeof value !== 'string' || !value || value.indexOf(':') !== -1 || value.length > 24) return 'openwaters.io';
    return value;
  }

  function heardMs(row) {
    var time = Date.parse(row && (row.seen || row.lastHeard) || '');
    return Number.isFinite(time) ? time : 0;
  }

  function mergeRecord(mmsi, next) {
    if (!next || typeof next !== 'object' || typeof next.lat !== 'number' || typeof next.lon !== 'number') return;
    var prior = positions.ships[mmsi];
    if (prior && heardMs(prior) > heardMs(next)) return;
    if (prior && Array.isArray(prior.trail) && !Array.isArray(next.trail)) next.trail = prior.trail;
    positions.ships[mmsi] = next;
  }

  function mergeSnapshot(data) {
    if (!data || typeof data !== 'object') return;
    var ships = data.ships && typeof data.ships === 'object' ? data.ships : {};
    Object.keys(ships).forEach(function (mmsi) { mergeRecord(mmsi, ships[mmsi]); });
    if (typeof data.updated === 'string' && (!positions.updated || data.updated > positions.updated)) positions.updated = data.updated;
    if (data.attribution && typeof data.attribution === 'object') {
      positions.attribution = Object.assign({}, positions.attribution || {}, data.attribution);
    }
    if (typeof data.about === 'string') positions.about = data.about;
  }

  function absorbOpenWaters(data) {
    var features = data && Array.isArray(data.features) ? data.features : [];
    var known = {};
    fleet.forEach(function (ship) { known[ship.mmsi] = true; });
    features.forEach(function (feature) {
      var props = feature && feature.properties || {};
      var mmsi = String(props.mmsi || (feature && feature.id) || '');
      if (!known[mmsi]) return;
      var coords = feature.geometry && feature.geometry.coordinates;
      if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') return;
      var next = {
        lat: coords[1],
        lon: coords[0],
        seen: typeof props.seen === 'string' ? props.seen : '',
        source: cleanSource(props.source)
      };
      if (typeof props.sog === 'number') next.sog = props.sog;
      if (typeof props.cog === 'number') next.cog = props.cog;
      if (typeof props.heading === 'number') next.heading = props.heading;
      if (typeof props.nav_status === 'number') next.navStatus = props.nav_status;
      if (typeof props.destination === 'string' && props.destination) next.destination = props.destination;
      if (typeof props.eta === 'string' && props.eta) next.eta = props.eta;
      if (typeof props.name === 'string' && props.name) next.aisName = props.name;
      if (typeof props.near === 'string' && props.near) next.near = props.near;
      mergeRecord(mmsi, next);
    });
    if (data && data.attribution && typeof data.attribution === 'object') {
      positions.attribution = Object.assign({}, positions.attribution || {}, data.attribution);
    }
  }

  function loadSnapshot() {
    return fetch('positions.json?t=' + Date.now(), {cache: 'no-store'}).then(function (response) {
      return response.ok ? response.json() : null;
    }, function () { return null; });
  }

  function loadOpenWaters() {
    var ids = fleet.map(function (ship) { return ship.mmsi; }).filter(Boolean);
    var batches = [];
    var index;
    for (index = 0; index < ids.length; index += 10) batches.push(ids.slice(index, index + 10));
    var rate = false;
    var missed = false;
    function next(i) {
      if (rate || i >= batches.length) return Promise.resolve(rate ? 'rate' : missed ? 'error' : 'ok');
      return fetch('https://ais.openwaters.io/v1/vessels?mmsi=' + batches[i].join(','), {cache: 'no-store'}).then(function (response) {
        if (response.status === 429) { rate = true; return null; }
        return response.ok ? response.json() : null;
      }, function () { return null; }).then(function (data) {
        if (rate) return next(i + 1);
        if (!data) missed = true;
        else absorbOpenWaters(data);
        return next(i + 1);
      });
    }
    return next(0);
  }

  var OW_MS = 30000;
  var SNAP_MS = 60000;
  var owDelay = OW_MS;
  var nextOw = 0;
  var nextSnap = 0;
  var owTimer = 0;
  var snapTimer = 0;
  var glideTimer = 0;
  var ageTimer = 0;
  var loadingOw = false;
  var loadingSnap = false;

  function paintLive() {
    var pill = document.getElementById('livePill');
    var label = document.getElementById('liveLabel');
    var count = document.getElementById('liveCountdown');
    if (!pill || !label || !count) return;
    if (document.hidden) {
      pill.classList.add('is-paused');
      label.textContent = 'Paused';
      count.textContent = 'Refresh resumes when this tab is visible.';
      return;
    }
    pill.classList.remove('is-paused');
    label.textContent = 'Live';
    var wait = Math.max(0, Math.min(nextOw || Date.now(), nextSnap || Date.now()) - Date.now());
    var seconds = Math.max(0, Math.ceil(wait / 1000));
    count.textContent = 'Next refresh in ' + seconds + 's';
  }

  function tickAges() {
    paintLive();
    document.querySelectorAll('#list .ship').forEach(function (button) {
      var ship = fleet.filter(function (item) { return item.mmsi === button.dataset.mmsi; })[0];
      if (!ship) return;
      var row = posOf(ship);
      var line = button.querySelector('.heard-age');
      if (!line) return;
      var text = row && row.seen ? 'Last heard ' + agePhrase(row.seen) : 'No report yet';
      var shown = displayPos(row);
      if (row && fixAge(row) > STALE_MS) text = 'Last seen ' + agePhrase(row.seen);
      else if (shown && shown.estimated) text += ' · short estimate from the last report';
      line.textContent = text;
    });
    if (selected && markers[selected]) {
      var popup = markers[selected].hit.getPopup();
      if (popup && map.hasLayer(popup)) {
        var ship = fleet.filter(function (item) { return item.mmsi === selected; })[0];
        var row = ship ? posOf(ship) : null;
        if (ship && row) markers[selected].hit.setPopupContent(popupNode(ship, row));
      }
    }
  }

  function glideShips() {
    if (document.hidden || !map) return;
    fleet.forEach(function (ship) {
      var marker = markers[ship.mmsi];
      var row = posOf(ship);
      if (!marker || !row) return;
      var shown = displayPos(row);
      if (!shown || shown.stale) return;
      moveEntry(marker, shown.lat, shown.lon);
    });
  }

  function finishButton() {
    var button = document.getElementById('refresh');
    if (!button) return;
    if (!loadingOw && !loadingSnap) {
      button.disabled = false;
      button.textContent = 'Refresh now';
    }
  }

  function pollSnapshot() {
    if (loadingSnap || !fleet.length) return Promise.resolve();
    loadingSnap = true;
    var button = document.getElementById('refresh');
    if (button) button.disabled = true;
    return loadSnapshot().then(function (data) {
      if (data) mergeSnapshot(data);
      paint(false);
    }, function () {}).then(function () {
      loadingSnap = false;
      nextSnap = Date.now() + SNAP_MS;
      finishButton();
    });
  }

  function pollOpenWaters() {
    if (loadingOw || !fleet.length) return Promise.resolve();
    loadingOw = true;
    var button = document.getElementById('refresh');
    if (button) button.disabled = true;
    return loadOpenWaters().then(function (status) {
      if (status === 'ok') {
        owDelay = OW_MS;
        liveNote = '';
      } else if (status === 'rate') {
        owDelay = Math.min(Math.max(owDelay * 2, 60000), 5 * 60 * 1000);
        liveNote = 'Open Waters asked for a slower pace. Next live check waits ' + Math.round(owDelay / 1000) + 's.';
      } else {
        owDelay = Math.min(Math.max(owDelay * 2, 60000), 5 * 60 * 1000);
        liveNote = 'The live Open Waters lookup did not answer just now.';
      }
      paint(false);
    }, function () {
      owDelay = Math.min(Math.max(owDelay * 2, 60000), 5 * 60 * 1000);
      liveNote = 'The live Open Waters lookup did not answer just now.';
      paint(false);
    }).then(function () {
      loadingOw = false;
      nextOw = Date.now() + owDelay;
      finishButton();
    });
  }

  function armOw() {
    clearTimeout(owTimer);
    if (document.hidden) return;
    nextOw = Date.now() + owDelay;
    owTimer = setTimeout(function () {
      if (document.hidden) return;
      pollOpenWaters().then(armOw);
    }, owDelay);
  }

  function armSnap() {
    clearTimeout(snapTimer);
    if (document.hidden) return;
    nextSnap = Date.now() + SNAP_MS;
    snapTimer = setTimeout(function () {
      if (document.hidden) return;
      pollSnapshot().then(armSnap);
    }, SNAP_MS);
  }

  function armLive() {
    clearInterval(glideTimer);
    clearInterval(ageTimer);
    if (document.hidden) {
      paintLive();
      return;
    }
    armOw();
    armSnap();
    glideTimer = setInterval(glideShips, 1000);
    ageTimer = setInterval(function () {
      if (!document.hidden) tickAges();
    }, 1000);
    paintLive();
  }

  function refreshAll(manual) {
    if (!fleet.length) return;
    owDelay = OW_MS;
    clearTimeout(owTimer);
    clearTimeout(snapTimer);
    pollSnapshot();
    pollOpenWaters();
    armLive();
    if (manual) {
      var button = document.getElementById('refresh');
      if (button) button.blur();
    }
  }

  function paint(refit) {
    var reopen = '';
    if (selected && markers[selected]) {
      var popup = markers[selected].hit.getPopup();
      if (popup && map.hasLayer(popup)) reopen = selected;
    }
    fillFreshness();
    fillCredits();
    holdScroll(function () {
      drawMarkers();
      if (refit && !fitted) {
        fitFleet();
        fitted = true;
      }
      if (reopen && markers[reopen]) {
        markers[reopen].hit.openPopup();
        tamePopup();
      }
    });
    renderList();
  }

  function openHashedShip() {
    var wanted = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!wanted || !fleet.some(function (ship) { return ship.mmsi === wanted; })) return;
    if (selected === wanted) return;
    selectShip(wanted, false);
  }

  function pad(n, width) {
    var text = String(Math.max(0, n | 0));
    while (text.length < width) text = '0' + text;
    return text;
  }

  function readCount() {
    try { return JSON.parse(localStorage.getItem('mondosupreme.cruise_countdown.v1')); }
    catch (e) { return null; }
  }

  function writeCount(value) {
    try {
      if (!value) localStorage.removeItem('mondosupreme.cruise_countdown.v1');
      else localStorage.setItem('mondosupreme.cruise_countdown.v1', JSON.stringify(value));
    } catch (e) { /* private mode */ }
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  }

  function sailAt(date) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!parts) return NaN;
    return new Date(+parts[1], +parts[2] - 1, +parts[3], 16, 0, 0, 0).getTime();
  }

  function activeCount() {
    if (countChoice && countChoice.mmsi && validDate(countChoice.date)) return {row: countChoice, source: 'yours'};
    if (countDefault && countDefault.mmsi && validDate(countDefault.date)) return {row: countDefault, source: 'default'};
    return null;
  }

  function shipName(mmsi) {
    var ship = fleet.filter(function (item) { return item.mmsi === mmsi; })[0];
    return ship ? ship.name : '';
  }

  function paintCount() {
    var readout = document.getElementById('countReadout');
    var caption = document.getElementById('countCaption');
    if (!readout || !caption) return;
    var active = activeCount();
    if (!active) {
      readout.textContent = '000:00:00:00';
      caption.textContent = 'Pick a ship and a sail date. Departure is 4:00 p.m. local time.';
      return;
    }
    var when = sailAt(active.row.date);
    var name = active.row.name || shipName(active.row.mmsi) || 'Your ship';
    var left = when - Date.now();
    var whose = active.source === 'default' ? 'Site default. ' : '';
    if (!Number.isFinite(when) || left <= 0) {
      readout.textContent = '000:00:00:00';
      caption.textContent = whose + name + ' sailed on ' + active.row.date + '. That sailing has left the pier.';
      return;
    }
    var days = Math.floor(left / 86400000);
    var hours = Math.floor(left / 3600000) % 24;
    var minutes = Math.floor(left / 60000) % 60;
    var seconds = Math.floor(left / 1000) % 60;
    readout.textContent = pad(days, 3) + ':' + pad(hours, 2) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2);
    caption.textContent = whose + name + ' sails ' + active.row.date + ' at 4:00 p.m.';
  }

  function armCount() {
    if (countTimer) clearInterval(countTimer);
    paintCount();
    countTimer = setInterval(function () {
      if (!document.hidden) paintCount();
    }, 1000);
  }

  function fillCountShips() {
    var select = document.getElementById('countShip');
    if (!select) return;
    var current = select.value;
    select.replaceChildren();
    select.appendChild(new Option('Choose a ship', ''));
    fleet.forEach(function (ship) {
      select.appendChild(new Option(ship.name, ship.mmsi));
    });
    var picked = activeCount();
    if (current) select.value = current;
    else if (picked) select.value = picked.row.mmsi;
  }

  function showCountForm() {
    var picked = activeCount();
    var date = document.getElementById('countDate');
    var select = document.getElementById('countShip');
    if (picked && select && !select.value) select.value = picked.row.mmsi;
    if (picked && date && !date.value) date.value = picked.row.date;
  }

  function countDb() {
    if (!window.firebase || !firebase.initializeApp || !window.MONDO_BOARD_CONFIG) return null;
    if (!firebase.apps.length) {
      try { firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
      catch (e) { /* shell or another page script already started it */ }
    }
    if (!firebase.apps.length || !firebase.database) return null;
    return firebase.database();
  }

  function watchCountDefault() {
    var db = countDb();
    if (!db || watchCountDefault.armed) return;
    watchCountDefault.armed = true;
    db.ref('countdown/next').on('value', function (snap) {
      var value = snap.val();
      countDefault = value && validDate(value.date) && /^\d{9}$/.test(value.mmsi || '') ? value : null;
      fillCountShips();
      showCountForm();
      paintCount();
    }, function () { /* rules may not be published yet */ });
    if (firebase.auth) {
      function paintCountOwner() {
        var owner = !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
        var button = document.getElementById('countDefault');
        if (button) button.hidden = !owner;
      }
      if (!watchCountDefault.ownerListen) {
        watchCountDefault.ownerListen = true;
        document.addEventListener('mondo-owner', paintCountOwner);
      }
      firebase.auth().onAuthStateChanged(paintCountOwner);
    }
  }

  function setCountdown() {
    var mmsi = document.getElementById('countShip').value;
    var date = document.getElementById('countDate').value;
    if (!/^\d{9}$/.test(mmsi) || !validDate(date)) {
      document.getElementById('countCaption').textContent = 'Choose a ship and a sail date first.';
      return;
    }
    countChoice = {mmsi: mmsi, date: date, name: shipName(mmsi)};
    writeCount(countChoice);
    paintCount();
  }

  function clearCountdown() {
    var hadLocal = !!countChoice;
    countChoice = null;
    writeCount(null);
    if (!hadLocal && countDefault && countDb()) {
      var user = firebase.auth && firebase.auth().currentUser;
      var owner = (window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
      if (owner) countDb().ref('countdown/next').remove().catch(function () {});
    }
    document.getElementById('countDate').value = '';
    document.getElementById('countShip').value = '';
    paintCount();
  }

  function saveCountDefault() {
    var mmsi = document.getElementById('countShip').value;
    var date = document.getElementById('countDate').value;
    var db = countDb();
    if (!db || !/^\d{9}$/.test(mmsi) || !validDate(date)) return;
    db.ref('countdown/next').set({mmsi: mmsi, date: date, name: shipName(mmsi)}).then(function () {
      document.getElementById('countCaption').textContent = 'Saved as the site default.';
    }).catch(function () {
      document.getElementById('countCaption').textContent = 'The site default needs the updated Firebase rules.';
    });
  }

  var wakeButton = document.getElementById('wakes');
  if (wakeButton) {
    wakeButton.setAttribute('aria-pressed', wakesOn ? 'true' : 'false');
    wakeButton.textContent = wakesOn ? 'Wake trails: on' : 'Wake trails: off';
    wakeButton.addEventListener('click', function () {
      wakesOn = !wakesOn;
      try { localStorage.setItem('mondosupreme.wakes.v1', wakesOn ? '1' : '0'); } catch (e) {}
      wakeButton.setAttribute('aria-pressed', wakesOn ? 'true' : 'false');
      wakeButton.textContent = wakesOn ? 'Wake trails: on' : 'Wake trails: off';
      drawWakes();
    });
  }
  document.getElementById('countSet').addEventListener('click', setCountdown);
  document.getElementById('countClear').addEventListener('click', clearCountdown);
  document.getElementById('countDefault').addEventListener('click', saveCountDefault);
  countChoice = readCount();
  if (!countChoice || !countChoice.mmsi || !validDate(countChoice.date)) countChoice = null;
  armCount();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) paintCount();
  });

  document.getElementById('refresh').addEventListener('click', function () { refreshAll(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(owTimer);
      clearTimeout(snapTimer);
      clearInterval(glideTimer);
      clearInterval(ageTimer);
      paintLive();
      return;
    }
    refreshAll(false);
  });
  window.addEventListener('hashchange', openHashedShip);

  var dealRows = [];

  function dollars(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  function perNightText(value) {
    var rounded = Math.round(value);
    if (Math.abs(value - rounded) < 0.05) return '$' + rounded + '/night';
    return '$' + value.toFixed(2) + '/night';
  }

  function sailLabel(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!parts) return iso || '';
    return new Date(+parts[1], +parts[2] - 1, +parts[3]).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function cabinLine(cabins) {
    var parts = [];
    if (cabins && typeof cabins.interior === 'number') parts.push('Interior ' + dollars(cabins.interior));
    if (cabins && typeof cabins.oceanView === 'number') parts.push('Ocean View ' + dollars(cabins.oceanView));
    if (cabins && typeof cabins.balcony === 'number') parts.push('Balcony ' + dollars(cabins.balcony));
    return parts.join(' · ');
  }

  function cleanDeal(raw) {
    if (!raw || raw.line !== 'Royal Caribbean International') return null;
    if (typeof raw.ship !== 'string' || !raw.ship) return null;
    if (!validDate(raw.sailDate)) return null;
    if (typeof raw.nights !== 'number' || raw.nights < 1 || raw.nights > 40) return null;
    if (typeof raw.startingPrice !== 'number' || typeof raw.perNight !== 'number') return null;
    if (typeof raw.url !== 'string' || raw.url.indexOf('https://www.royalcaribbean.com/') !== 0) return null;
    return raw;
  }

  function fillDealShips() {
    var select = document.getElementById('dealShip');
    if (!select) return;
    var current = select.value;
    var names = [];
    dealRows.forEach(function (deal) {
      if (names.indexOf(deal.ship) === -1) names.push(deal.ship);
    });
    names.sort();
    select.replaceChildren();
    select.appendChild(new Option('All ships', ''));
    names.forEach(function (name) { select.appendChild(new Option(name, name)); });
    if (current) select.value = current;
  }

  function dealVisible(deal) {
    var ship = document.getElementById('dealShip').value;
    var length = document.getElementById('dealLength').value;
    var budgetText = document.getElementById('dealBudget').value.trim();
    var budget = budgetText === '' ? NaN : Number(budgetText);
    if (ship && deal.ship !== ship) return false;
    if (length === 'short' && (deal.nights < 3 || deal.nights > 4)) return false;
    if (length === 'long' && deal.nights < 6) return false;
    if (Number.isFinite(budget) && budget >= 0 && deal.startingPrice > budget) return false;
    return true;
  }

  function sortDeals(rows) {
    var mode = document.getElementById('dealSort').value;
    rows.sort(function (a, b) {
      if (mode === 'price') return a.startingPrice - b.startingPrice || a.sailDate.localeCompare(b.sailDate);
      if (mode === 'date') return a.sailDate.localeCompare(b.sailDate) || a.perNight - b.perNight;
      return a.perNight - b.perNight || a.startingPrice - b.startingPrice || a.sailDate.localeCompare(b.sailDate);
    });
    return rows;
  }

  function applyDealCountdown(deal) {
    if (!/^\d{9}$/.test(deal.mmsi || '') || !validDate(deal.sailDate)) {
      document.getElementById('countCaption').textContent = 'That sailing is not on the fleet countdown list.';
      return;
    }
    var select = document.getElementById('countShip');
    var dateInput = document.getElementById('countDate');
    if (select) select.value = deal.mmsi;
    if (dateInput) dateInput.value = deal.sailDate;
    countChoice = {mmsi: deal.mmsi, date: deal.sailDate, name: deal.ship || shipName(deal.mmsi)};
    writeCount(countChoice);
    paintCount();
    document.getElementById('countdown').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function renderDeals() {
    var body = document.getElementById('dealsBody');
    var empty = document.getElementById('dealsEmpty');
    var count = document.getElementById('dealsCount');
    if (!body) return;
    var rows = sortDeals(dealRows.filter(dealVisible));
    body.replaceChildren();
    rows.forEach(function (deal) {
      var tr = document.createElement('tr');
      if (deal.bestValue) tr.className = 'is-value';
      var shipCell = document.createElement('td');
      shipCell.setAttribute('data-label', 'Ship');
      shipCell.append(el('span', deal.ship, 'deal-ship'));
      var sailCell = document.createElement('td');
      sailCell.setAttribute('data-label', 'Sailing');
      sailCell.append(el('span', deal.title || (deal.nights + '-night sailing')));
      sailCell.append(document.createElement('br'));
      sailCell.append(el('span', sailLabel(deal.sailDate)));
      if (deal.bestValue || deal.under100) {
        var badges = el('span', null, 'deal-badges');
        if (deal.bestValue) badges.append(el('span', 'BEST VALUE!', 'deal-badge is-value'));
        if (deal.under100) badges.append(el('span', 'UNDER $100/NIGHT!', 'deal-badge is-hot'));
        sailCell.append(badges);
      }
      var portCell = document.createElement('td');
      portCell.setAttribute('data-label', 'Ports');
      portCell.textContent = deal.portsLabel || (Array.isArray(deal.ports) ? deal.ports.join(' → ') : '');
      var priceCell = document.createElement('td');
      priceCell.setAttribute('data-label', 'From');
      priceCell.append(el('span', dollars(deal.startingPrice), 'deal-price'));
      var cabinText = cabinLine(deal.cabins);
      if (cabinText) {
        priceCell.append(document.createElement('br'));
        priceCell.append(el('span', cabinText));
      }
      if (deal.startingCabin) {
        priceCell.append(document.createElement('br'));
        priceCell.append(el('span', 'From ' + deal.startingCabin));
      }
      var nightCell = document.createElement('td');
      nightCell.setAttribute('data-label', 'Per night');
      nightCell.append(el('span', perNightText(deal.perNight), 'deal-price'));
      var actionCell = document.createElement('td');
      actionCell.setAttribute('data-label', 'Actions');
      var actions = el('div', null, 'deal-actions');
      var center = el('button', 'Center Ship on Map', 'btn');
      center.type = 'button';
      center.addEventListener('click', function () {
        var ship = fleet.filter(function (item) { return item.mmsi === deal.mmsi; })[0];
        if (!ship) {
          document.getElementById('dealsFresh').textContent = deal.ship + ' is not on the fleet map yet.';
          return;
        }
        selectShip(deal.mmsi, false);
      });
      var countdown = el('button', 'Set as My Countdown', 'btn');
      countdown.type = 'button';
      countdown.addEventListener('click', function () { applyDealCountdown(deal); });
      var link = document.createElement('a');
      link.className = 'btn';
      link.href = deal.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View / Book';
      actions.append(center, countdown, link);
      actionCell.append(actions);
      tr.append(shipCell, sailCell, portCell, priceCell, nightCell, actionCell);
      body.append(tr);
    });
    empty.hidden = rows.length !== 0;
    count.textContent = rows.length === dealRows.length
      ? dealRows.length + ' Port Canaveral sailings'
      : 'Showing ' + rows.length + ' of ' + dealRows.length + ' Port Canaveral sailings';
  }

  function fillDealsNote(browseUrl) {
    var note = document.getElementById('dealsNote');
    if (!note) return;
    note.replaceChildren();
    note.append('Starting fares are per person, before taxes and fees, from Royal Caribbean International. ');
    var link = document.createElement('a');
    link.href = browseUrl || 'https://www.royalcaribbean.com/cruises?departureCode_PCN=true';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'All Port Canaveral sailings on Royal Caribbean';
    note.append(link);
    note.append('.');
  }

  function showDeals(data) {
    var fresh = document.getElementById('dealsFresh');
    var deals = data && Array.isArray(data.deals) ? data.deals.map(cleanDeal).filter(Boolean) : [];
    dealRows = deals;
    fillDealShips();
    fillDealsNote(data && data.browseUrl);
    if (fresh) {
      if (data && data.fetchedAt) {
        fresh.textContent = 'Prices last fetched ' + localTime(data.fetchedAt) + ' (' + agePhrase(data.fetchedAt) + ').';
      } else if (!deals.length) {
        fresh.textContent = 'The Port Canaveral deal sheet has not been fetched yet.';
      } else {
        fresh.textContent = 'Prices are from the last saved Royal Caribbean search.';
      }
    }
    renderDeals();
  }

  function loadDeals() {
    return fetch('canaveral-deals.json', {cache: 'no-cache'}).then(function (response) {
      if (!response.ok) throw new Error('deals');
      return response.json();
    }).then(showDeals, function () {
      var fresh = document.getElementById('dealsFresh');
      if (fresh) fresh.textContent = 'The saved Port Canaveral deals could not be loaded.';
      fillDealsNote();
    });
  }

  ['dealSort', 'dealShip', 'dealLength'].forEach(function (id) {
    var node = document.getElementById(id);
    if (node) node.addEventListener('change', renderDeals);
  });
  var budgetInput = document.getElementById('dealBudget');
  if (budgetInput) budgetInput.addEventListener('input', renderDeals);
  loadDeals();

  window.addEventListener('mondo-fleet-show', function () {
    if (map) setTimeout(function () { map.invalidateSize(); }, 80);
  });

  fetch('fleet.json', {cache: 'no-cache'})
    .then(function (response) {
      if (!response.ok) throw new Error('fleet');
      return response.json();
    })
    .then(function (data) {
      fleet = Array.isArray(data.ships) ? data.ships : [];
      fillCountShips();
      showCountForm();
      watchCountDefault();
      paintCount();
      return loadSnapshot();
    })
    .then(function (data) {
      positions = data && typeof data === 'object' ? data : {ships: {}};
      if (!positions.ships || typeof positions.ships !== 'object') positions.ships = {};
      return loadOpenWaters();
    })
    .then(function (status) {
      liveNote = status === 'ok' ? '' : status === 'rate'
        ? 'Open Waters asked for a slower pace. The next live check waits longer.'
        : 'The live Open Waters lookup did not answer just now.';
      fillFreshness();
      fillCredits();
      map.invalidateSize();
      drawMarkers();
      fitFleet();
      fitted = true;
      renderList();
      armLive();
      openHashedShip();
    })
    .catch(function () {
      show('The fleet list could not be loaded.');
    });
})();
