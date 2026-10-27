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
  var selected = '';
  var map;

  document.getElementById('yr').textContent = String(new Date().getFullYear());

  L.Icon.Default.mergeOptions({
    iconUrl: 'vendor/leaflet/images/marker-icon.png',
    iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png',
    shadowUrl: 'vendor/leaflet/images/marker-shadow.png'
  });

  map = L.map('map', {worldCopyJump: true, minZoom: 2});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  map.setView([25, -40], 2);

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
    var minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.round(minutes / 60);
    if (hours < 48) return hours + ' hr ago';
    return Math.round(hours / 24) + ' days ago';
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

  function pinIcon(active, name) {
    var icon = L.divIcon({
      className: active ? 'ship-marker is-active' : 'ship-marker',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -14]
    });
    if (active && name) icon.options.html = '<span class="ship-flag">' + escapeHtml(name) + '</span>';
    return icon;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
    });
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
    box.append(el('strong', ship.name, 'popup-title'));
    box.append(popupLine('Class', ship.class));
    box.append(popupLine('Where', areaText(row)));
    var coords = coordText(row);
    if (coords && areaText(row) !== coords) box.append(popupLine('Coordinates', coords));
    box.append(popupLine('Speed', motionText(row)));
    box.append(popupLine('Destination', portText(row)));
    var eta = etaText(row);
    if (eta) box.append(popupLine('ETA', eta));
    if (row && row.seen) box.append(popupLine('Heard', localTime(row.seen) + ' (' + agePhrase(row.seen) + ')'));
    else box.append(popupLine('Heard', 'No report yet'));
    box.append(el('div', 'IMO ' + ship.imo, 'popup-note'));
    return box;
  }

  var POPUP_OPTIONS = {
    className: 'ship-callout',
    maxWidth: 260,
    minWidth: 180,
    maxHeight: 220,
    autoPan: true,
    keepInView: true,
    autoPanPaddingTopLeft: [16, 48],
    autoPanPaddingBottomRight: [16, 28]
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
    Object.keys(markers).forEach(function (key) {
      markers[key].setIcon(pinIcon(key === mmsi, key === mmsi && ship ? ship.name : ''));
    });
    renderList();
    if (!(row && typeof row.lat === 'number' && markers[mmsi])) return;
    var open = function () {
      map.setView([row.lat, row.lon], Math.max(map.getZoom(), 5), {animate: !fromMap});
      markers[mmsi].setPopupContent(popupNode(ship, row));
      markers[mmsi].openPopup();
      tamePopup();
    };
    if (fromMap) holdScroll(open);
    else open();
    if (!fromMap) document.getElementById('map').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function drawMarkers() {
    Object.keys(markers).forEach(function (key) {
      map.removeLayer(markers[key]);
    });
    markers = Object.create(null);
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return;
      var marker = L.marker([row.lat, row.lon], {
        icon: pinIcon(ship.mmsi === selected, ship.mmsi === selected ? ship.name : ''),
        title: ship.name,
        alt: ship.name,
        autoPanOnFocus: false,
        keyboard: false
      });
      marker.bindPopup(popupNode(ship, row), POPUP_OPTIONS);
      marker.bindTooltip(ship.name, {direction: 'top', offset: [0, -8], className: 'ship-tip', opacity: 1});
      marker.on('click', function (event) {
        if (event.originalEvent) L.DomEvent.preventDefault(event.originalEvent);
        selectShip(ship.mmsi, true);
      });
      marker.addTo(map);
      markers[ship.mmsi] = marker;
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
      button.append(el('span', motionText(row), 'meta'));
      var heardLine = row && row.seen
        ? 'Heard ' + localTime(row.seen) + ' (' + agePhrase(row.seen) + ')'
        : 'No report yet';
      button.append(el('span', heardLine, stale(row && row.seen) ? 'meta is-stale' : 'meta'));
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
    box.append(el('span', 'Times below are when each ship was last heard, in your time zone. The saved snapshot is refreshed about every 5 minutes, and this page checks it every 2 minutes. Refresh now also asks Open Waters for anything newer. A quiet ship keeps its last stored position. Not for navigation.'));
    if (liveNote) box.append(el('span', ' ' + liveNote));
  }

  function fillCredits() {
    var box = document.getElementById('credits');
    box.replaceChildren();
    box.append(el('h2', 'Sources'));
    box.append(el('p', 'The fleet list is taken from the current-fleet tables on the English Wikipedia article Royal Caribbean International. IMO and MMSI numbers come from Wikidata. Ships that have left the fleet are left out, and Hero of the Seas is left out until it enters service.'));
    box.append(el('p', 'Live positions are sampled from aisstream.io about every 5 minutes, with Open Waters filling in ships that stay quiet. This page also reads Open Waters directly when you open it or press Refresh now, and keeps whichever report was heard later. The aisstream key stays on the server. Destination text is the port code the ship broadcast.'));
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
    return Promise.all(batches.map(function (batch) {
      return fetch('https://ais.openwaters.io/v1/vessels?mmsi=' + batch.join(','), {cache: 'no-store'}).then(function (response) {
        return response.ok ? response.json() : null;
      }, function () { return null; });
    })).then(function (parts) {
      var missed = false;
      parts.forEach(function (data) {
        if (!data) { missed = true; return; }
        absorbOpenWaters(data);
      });
      return !missed;
    });
  }

  function paint(refit) {
    var reopen = '';
    if (selected && markers[selected]) {
      var popup = markers[selected].getPopup();
      if (popup && map.hasLayer(popup)) reopen = selected;
    }
    fillFreshness();
    fillCredits();
    map.invalidateSize();
    holdScroll(function () {
      drawMarkers();
      if (refit && !fitted) {
        fitFleet();
        fitted = true;
      }
      if (reopen && markers[reopen]) {
        markers[reopen].openPopup();
        tamePopup();
      }
    });
    renderList();
  }

  function refreshAll(manual) {
    if (!fleet.length || loading) return;
    loading = true;
    var button = document.getElementById('refresh');
    if (button) {
      button.disabled = true;
      button.textContent = 'Refreshing…';
    }
    loadSnapshot().then(function (data) {
      if (data) mergeSnapshot(data);
      return loadOpenWaters();
    }).then(function (ok) {
      liveNote = ok ? '' : 'The live Open Waters lookup did not answer just now.';
      paint(false);
    }, function () {
      liveNote = 'The live Open Waters lookup did not answer just now.';
      paint(false);
    }).then(function () {
      loading = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Refresh now';
      }
    }, function () {
      loading = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Refresh now';
      }
    });
    if (manual) button && button.blur();
  }

  function armRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!document.hidden) refreshAll(false);
    }, 120000);
  }

  document.getElementById('refresh').addEventListener('click', function () { refreshAll(true); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshAll(false);
  });

  fetch('fleet.json', {cache: 'no-cache'})
    .then(function (response) {
      if (!response.ok) throw new Error('fleet');
      return response.json();
    })
    .then(function (data) {
      fleet = Array.isArray(data.ships) ? data.ships : [];
      return loadSnapshot();
    })
    .then(function (data) {
      positions = data && typeof data === 'object' ? data : {ships: {}};
      if (!positions.ships || typeof positions.ships !== 'object') positions.ships = {};
      return loadOpenWaters();
    })
    .then(function (ok) {
      liveNote = ok ? '' : 'The live Open Waters lookup did not answer just now.';
      fillFreshness();
      fillCredits();
      map.invalidateSize();
      drawMarkers();
      fitFleet();
      fitted = true;
      renderList();
      armRefresh();
    })
    .catch(function () {
      show('The fleet list could not be loaded.');
    });
})();
