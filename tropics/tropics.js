(function () {
  'use strict';
  var KEY = 'mondosupreme.prep.v1';
  var KIT = [
    'Water, one gallon per person per day for several days',
    'Nonperishable food and a manual can opener',
    'Prescriptions and a first-aid kit',
    'Flashlights, batteries, and a charged power bank',
    'NOAA weather radio or a way to get alerts',
    'Cash, copies of IDs, and insurance papers in a dry bag',
    'Phone chargers and a car charger',
    'Pet food, leash, and carrier',
    'Full fuel tank before the rush',
    'Know your zone and the county evacuation route'
  ];
  var HISTORY = [
    { name: 'Matthew 2016', color: '#f59e0b', pts: [[25.4, -77.6], [26.8, -79.1], [28.4, -80.2], [30.3, -81.2]] },
    { name: 'Frances 2004', color: '#ef4444', pts: [[24.2, -74.8], [26.2, -77.4], [27.2, -80.2]] },
    { name: 'Jeanne 2004', color: '#a855f7', pts: [[25.6, -73.5], [26.8, -78.2], [27.2, -80.3]] },
    { name: 'Irma 2017', color: '#06b6d4', pts: [[23.5, -81.2], [25.0, -81.5], [26.6, -81.8], [28.2, -81.7]] },
    { name: 'Ian 2022', color: '#22c55e', pts: [[24.2, -83.2], [25.8, -82.6], [26.7, -82.2], [28.4, -81.8]] }
  ];
  var SCALE = [
    ['1', '74–95 mph', '#5ebaff'],
    ['2', '96–110 mph', '#00faf4'],
    ['3', '111–129 mph', '#fffa00'],
    ['4', '130–156 mph', '#ff8c00'],
    ['5', '157 mph or higher', '#ff0000']
  ];
  function $(id) { return document.getElementById(id); }
  function checks() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveChecks(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function paintKit() {
    var host = $('kit');
    var state = checks();
    host.textContent = '';
    KIT.forEach(function (item, i) {
      var row = document.createElement('label');
      row.className = 'check-row' + (state[i] ? ' is-done' : '');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!state[i];
      box.addEventListener('change', function () {
        var next = checks();
        next[i] = box.checked;
        saveChecks(next);
        paintKit();
      });
      var span = document.createElement('span');
      span.textContent = item;
      row.appendChild(box);
      row.appendChild(span);
      host.appendChild(row);
    });
  }
  function paintScale() {
    var host = $('scale');
    SCALE.forEach(function (row) {
      var line = document.createElement('div');
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = row[2];
      var text = document.createElement('span');
      text.textContent = 'Category ' + row[0] + ' · ' + row[1];
      line.appendChild(sw);
      line.appendChild(text);
      host.appendChild(line);
    });
  }
  function addHistory(map) {
    HISTORY.forEach(function (storm) {
      L.polyline(storm.pts.map(function (p) { return [p[0], p[1]]; }), { color: storm.color, weight: 3 }).bindTooltip(storm.name + ' · simplified').addTo(map);
    });
  }
  function loadStorms(map) {
    var url = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/1/query?where=' +
      encodeURIComponent("BASIN='AL'") + '&outFields=STORMNAME,STORMTYPE,INTENSITY,LAT,LON&returnGeometry=true&outSR=4326&f=json';
    var track = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/2/query?where=' +
      encodeURIComponent("BASIN='AL'") + '&outFields=STORMNAME&returnGeometry=true&outSR=4326&f=json';
    return Promise.all([
      fetch(url).then(function (r) { return r.json(); }),
      fetch(track).then(function (r) { return r.json(); })
    ]).then(function (pair) {
      var points = (pair[0].features || []);
      var lines = (pair[1].features || []);
      if (!points.length && !lines.length) {
        addHistory(map);
        $('stormNote').textContent = 'No active Atlantic storms in the public feed. The map shows simplified historical Space Coast tracks, not an official forecast.';
        return;
      }
      lines.forEach(function (feat) {
        var paths = (feat.geometry && feat.geometry.paths) || [];
        paths.forEach(function (path) {
          L.polyline(path.map(function (xy) { return [xy[1], xy[0]]; }), { color: '#ef4444', weight: 3 }).addTo(map);
        });
      });
      points.forEach(function (feat) {
        var a = feat.attributes || {};
        var g = feat.geometry || {};
        var lat = a.LAT || g.y;
        var lon = a.LON || g.x;
        if (lat == null || lon == null) return;
        L.circleMarker([lat, lon], { radius: 7, color: '#ef4444' }).bindTooltip((a.STORMNAME || 'Storm') + ' · ' + (a.STORMTYPE || '')).addTo(map);
      });
      $('stormNote').textContent = 'Live Atlantic positions from the NWS Active Hurricanes service. Follow nhc.noaa.gov for advisories.';
    }).catch(function () {
      addHistory(map);
      $('stormNote').textContent = 'The live storm feed did not answer. Simplified historical tracks are on the map instead.';
    });
  }
  function boot() {
    paintScale();
    paintKit();
    var map = L.map('map', { scrollWheelZoom: false }).setView([27.5, -70], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 12 }).addTo(map);
    loadStorms(map);
    setTimeout(function () { map.invalidateSize(); }, 200);
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
