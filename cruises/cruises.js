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

  function pinIcon(active) {
    return L.divIcon({
      className: active ? 'ship-marker is-active' : 'ship-marker',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12]
    });
  }

  function popupNode(ship, row) {
    var box = el('div');
    box.append(el('strong', ship.name, 'popup-title'));
    box.append(el('div', ship.class + ' class'));
    box.append(el('div', areaText(row)));
    box.append(el('div', motionText(row)));
    box.append(el('div', portText(row)));
    var eta = etaText(row);
    if (eta) box.append(el('div', eta));
    if (row && row.seen) box.append(el('div', 'Heard ' + localTime(row.seen) + ' (' + agePhrase(row.seen) + ')'));
    if (row && row.source && row.source !== 'aisstream.io') box.append(el('div', 'Earlier stored report'));
    box.append(el('div', 'IMO ' + ship.imo));
    return box;
  }

  function fitFleet() {
    var bounds = L.latLngBounds([]);
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (row && typeof row.lat === 'number' && typeof row.lon === 'number') bounds.extend([row.lat, row.lon]);
    });
    if (bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24], maxZoom: 3, animate: true});
  }

  function selectShip(mmsi, fromMap) {
    selected = mmsi;
    Object.keys(markers).forEach(function (key) {
      markers[key].setIcon(pinIcon(key === mmsi));
    });
    var ship = fleet.filter(function (item) { return item.mmsi === mmsi; })[0];
    var row = ship ? posOf(ship) : null;
    if (row && typeof row.lat === 'number' && markers[mmsi]) {
      map.setView([row.lat, row.lon], Math.max(map.getZoom(), 5), {animate: true});
      markers[mmsi].setPopupContent(popupNode(ship, row));
      markers[mmsi].openPopup();
    }
    renderList();
    var card = document.querySelector('.ship[data-mmsi="' + CSS.escape(mmsi) + '"]');
    if (card && fromMap) card.scrollIntoView({block: 'nearest'});
    if (!fromMap && row && typeof row.lat === 'number') {
      document.getElementById('map').scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  function drawMarkers() {
    Object.keys(markers).forEach(function (key) {
      map.removeLayer(markers[key]);
    });
    markers = Object.create(null);
    fleet.forEach(function (ship) {
      var row = posOf(ship);
      if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return;
      var marker = L.marker([row.lat, row.lon], {icon: pinIcon(ship.mmsi === selected), title: ship.name, alt: ship.name});
      marker.bindPopup(popupNode(ship, row));
      marker.on('click', function () { selectShip(ship.mmsi, true); });
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
    box.append(el('span', 'Times below are when each ship was last heard, shown in your time zone. Live samples come from aisstream.io for about three minutes every 30 minutes. A ship that stays quiet keeps its last stored position and time. Not for navigation.'));
  }

  function fillCredits() {
    var box = document.getElementById('credits');
    box.replaceChildren();
    box.append(el('h2', 'Sources'));
    box.append(el('p', 'The fleet list is taken from the current-fleet tables on the English Wikipedia article Royal Caribbean International. IMO and MMSI numbers come from Wikidata. Ships that have left the fleet are left out, and Hero of the Seas is left out until it enters service.'));
    box.append(el('p', 'Live positions are sampled from aisstream.io. The API key stays on the server. A ship that does not transmit during a sample keeps the position and time already stored. Destination text is the port code the ship broadcast. Reports saved before a ship is heard on this stream keep their original credit below.'));
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

  function show(message) {
    var box = document.getElementById('freshness');
    box.textContent = message;
  }

  fetch('fleet.json', {cache: 'no-cache'})
    .then(function (response) {
      if (!response.ok) throw new Error('fleet');
      return response.json();
    })
    .then(function (data) {
      fleet = Array.isArray(data.ships) ? data.ships : [];
      return fetch('positions.json', {cache: 'no-cache'}).then(function (response) {
        return response.ok ? response.json() : {ships: {}};
      }, function () {
        return {ships: {}};
      });
    })
    .then(function (data) {
      positions = data && typeof data === 'object' ? data : {ships: {}};
      if (!positions.ships || typeof positions.ships !== 'object') positions.ships = {};
      fillFreshness();
      fillCredits();
      map.invalidateSize();
      drawMarkers();
      fitFleet();
      renderList();
    })
    .catch(function () {
      show('The fleet list could not be loaded.');
    });
})();
