(function () {
  'use strict';
  var KEY = 'mondosupreme.weather.v1';
  var PORT = { lat: 28.4103, lon: -80.6188, name: 'Port Canaveral' };
  var PRESETS = [
    { id: 'cocoa', label: 'Cocoa (32927)', q: '32927', name: 'Cocoa, FL', lat: 28.38612, lon: -80.742, zoom: 10 },
    { id: 'port', label: 'Port Canaveral', q: 'Port Canaveral', name: 'Port Canaveral, FL', lat: 28.4103, lon: -80.6188, zoom: 11 },
    { id: 'orlando', label: 'Orlando', q: 'Orlando', name: 'Orlando, FL', lat: 28.5383, lon: -81.3792, zoom: 10 },
    { id: 'miami', label: 'Miami', q: 'Miami', name: 'Miami, FL', lat: 25.7617, lon: -80.1918, zoom: 10 },
    { id: 'cococay', label: 'CocoCay / Nassau', q: 'CocoCay', name: 'CocoCay / Nassau', lat: 25.43, lon: -77.65, zoom: 8 },
    { id: 'caribbean', label: 'Caribbean', q: 'Caribbean', name: 'Caribbean', lat: 18.2, lon: -70.5, zoom: 5 },
    { id: 'us', label: 'Full US', q: 'United States', name: 'United States', lat: 39.8, lon: -98.6, zoom: 4 },
    { id: 'gps', label: 'My Location (GPS)', gps: true }
  ];
  var place = PRESETS[0];
  var opacity = 0.7;
  var rainOn = true;
  var nexradOn = true;
  var shipsOn = false;
  var futureOn = true;
  var speedMs = 700;
  var radarCache = null;
  var radarToken = 0;
  var map, pin, nexradLayer, shipLayer, shipLoaded = false;
  var frames = [];
  var frameLayers = [];
  var frameIndex = 0;
  var playing = false;
  var playTimer = 0;
  var music = { ctx: null, timer: 0, step: 0, on: false };
  var CHORDS = [
    [261.63, 329.63, 392.0, 493.88],
    [220.0, 261.63, 329.63, 392.0],
    [293.66, 349.23, 440.0, 523.25],
    [196.0, 246.94, 293.66, 349.23]
  ];

  function $(id) { return document.getElementById(id); }
  function note(text) {
    var el = $('wxRadarNote');
    if (el) el.textContent = text;
  }
  function readSaved() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!data || typeof data.lat !== 'number' || typeof data.lon !== 'number') return;
      place = {
        id: data.id || '',
        q: String(data.q || data.name || '32927'),
        name: String(data.name || 'Cocoa, FL'),
        lat: data.lat,
        lon: data.lon,
        zoom: typeof data.zoom === 'number' ? data.zoom : 10
      };
      if (typeof data.opacity === 'number') opacity = Math.min(1, Math.max(0.2, data.opacity));
      rainOn = data.rainviewer !== false;
      nexradOn = data.nexrad !== false;
      shipsOn = data.ships === true;
      futureOn = data.future !== false;
      if (data.speed === 350 || data.speed === 700 || data.speed === 1100) speedMs = data.speed;
    } catch (e) { /* keep Cocoa */ }
  }
  function save() {
    var payload = {
      id: place.id || '',
      q: place.q,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      zoom: place.zoom,
      opacity: opacity,
      rainviewer: rainOn,
      nexrad: nexradOn,
      ships: shipsOn,
      future: futureOn,
      speed: speedMs
    };
    try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (e) {}
  }
  function compass(deg) {
    if (typeof deg !== 'number' || !isFinite(deg)) return '';
    var names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  function miles(lat1, lon1, lat2, lon2) {
    var r = 3958.8;
    var p1 = lat1 * Math.PI / 180;
    var p2 = lat2 * Math.PI / 180;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function sky(code) {
    if (code == null) return '—';
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Cloudy';
    if (code <= 48) return 'Fog';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    return 'Thunder';
  }
  function fact(label, value) {
    var li = document.createElement('li');
    li.textContent = label + ' ' + value;
    return li;
  }
  function clearNode(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function paintPlace() {
    var line = $('wxPlace');
    if (line) line.textContent = place.name + (place.q ? ' · ' + place.q : '');
    var query = $('wxQuery');
    if (query && document.activeElement !== query) query.value = place.q || '';
    Array.prototype.forEach.call(document.querySelectorAll('#wxPresets .btn'), function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-preset') === (place.id || '') ? 'true' : 'false');
    });
  }
  function movePin() {
    if (!map) return;
    if (!pin) {
      pin = L.circleMarker([place.lat, place.lon], {
        radius: 7, color: '#ff7a00', weight: 2, fillColor: '#ffcc00', fillOpacity: 1
      }).addTo(map);
    } else {
      pin.setLatLng([place.lat, place.lon]);
    }
    map.setView([place.lat, place.lon], place.zoom);
  }
  function applyPlace(next) {
    place = {
      id: next.id || '',
      q: next.q || next.name,
      name: next.name,
      lat: next.lat,
      lon: next.lon,
      zoom: next.zoom || 10
    };
    paintPlace();
    movePin();
    save();
    loadForecast();
    loadMarine();
  }

  function buildPresets() {
    var box = $('wxPresets');
    PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn wx-btn';
      btn.textContent = preset.label;
      btn.setAttribute('data-preset', preset.id);
      btn.addEventListener('click', function () {
        if (preset.gps) {
          locate();
          return;
        }
        applyPlace(preset);
      });
      box.appendChild(btn);
    });
  }
  function locate() {
    if (!navigator.geolocation) {
      note('This browser has no GPS. Search a ZIP instead.');
      return;
    }
    note('Asking for this device’s location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      applyPlace({
        id: 'gps',
        q: 'My Location',
        name: 'My Location',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        zoom: 10
      });
      note('Centered on this device.');
    }, function () {
      note('Location permission was blocked. Search a ZIP or city instead.');
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  }
  function geocode(q) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=5&language=en&format=json';
    return fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      var results = data.results || [];
      if (/^\d{5}$/.test(q)) {
        var zip = results.filter(function (row) {
          return (row.postcodes || []).indexOf(q) >= 0;
        })[0];
        if (zip) return zip;
      }
      return results[0] || null;
    });
  }

  function initMap() {
    map = L.map('map', { minZoom: 2, maxZoom: 14, worldCopyJump: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.createPane('nexrad');
    map.getPane('nexrad').style.zIndex = 250;
    map.createPane('radar');
    map.getPane('radar').style.zIndex = 260;
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 450;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      pane: 'labels',
      maxZoom: 16,
      attribution: '&copy; Esri'
    }).addTo(map);
    nexradLayer = L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png', {
      pane: 'nexrad',
      opacity: opacity,
      maxNativeZoom: 8,
      attribution: 'NEXRAD composite via Iowa Environmental Mesonet'
    });
    if (nexradOn) nexradLayer.addTo(map);
    shipLayer = L.layerGroup();
    movePin();
    setTimeout(function () { map.invalidateSize(); }, 200);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad4(n) { return ('0000' + n).slice(-4); }
  function align5(ms) {
    var step = 5 * 60 * 1000;
    return Math.floor(ms / step) * step;
  }
  function iemStamp(ms) {
    var d = new Date(ms);
    return String(d.getUTCFullYear()) + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes());
  }
  function tileUrl(frame, z, x, y) {
    var layer = frame.kind === 'forecast'
      ? 'hrrr::REFD-F' + frame.lead + '-' + frame.run
      : 'ridge::USCOMP-N0Q-' + frame.comp;
    return 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + layer + '/' + z + '/' + x + '/' + y + '.png';
  }
  var RadarTile = L.TileLayer.extend({
    getTileUrl: function (coords) {
      return tileUrl(this.options.frame, coords.z, coords.x, coords.y);
    }
  });
  function probeUrl(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve(ok);
      }
      img.onload = function () { finish(img.naturalWidth > 0); };
      img.onerror = function () { finish(false); };
      setTimeout(function () { finish(false); }, 6000);
      img.src = url;
    });
  }
  function findLatest() {
    var start = align5(Date.now() - 5 * 60 * 1000);
    function next(i) {
      var ms = start - i * 5 * 60 * 1000;
      if (i >= 8) return Promise.resolve(ms);
      var url = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-' + iemStamp(ms) + '/2/1/1.png';
      return probeUrl(url).then(function (ok) { return ok ? ms : next(i + 1); });
    }
    return next(0);
  }
  function hrrrTile(run, lead) {
    return 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F' + pad4(lead) + '-' + run + '/6/17/26.png';
  }
  function findHrrr() {
    var hour = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), new Date().getUTCHours());
    function farthest(run, runMs, lead) {
      if (lead < 15) return Promise.resolve(null);
      return probeUrl(hrrrTile(run, lead)).then(function (ok) {
        if (ok) return { run: run, runMs: runMs, maxLead: lead };
        return farthest(run, runMs, lead - 60);
      });
    }
    function runs(i) {
      if (i > 8) return Promise.resolve(null);
      var runMs = hour - i * 3600000;
      var run = iemStamp(runMs);
      return probeUrl(hrrrTile(run, 60)).then(function (ok) {
        if (!ok) return runs(i + 1);
        var want = Math.round((Date.now() + 6 * 3600000 - runMs) / 60000 / 15) * 15;
        if (want > 18 * 60) want = 18 * 60;
        if (want < 60) want = 60;
        return farthest(run, runMs, want);
      });
    }
    return runs(1);
  }
  function clockLabel(ms) {
    return new Date(ms).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  function relLabel(ms, anchor) {
    var mins = Math.round((ms - anchor) / 60000);
    if (mins >= -7 && mins <= 7) return 'Now';
    var sign = mins < 0 ? '-' : '+';
    var abs = Math.abs(mins);
    var h = Math.floor(abs / 60);
    var m = abs % 60;
    if (!h) return sign + m + 'm';
    if (!m) return sign + h + 'h';
    return sign + h + 'h ' + m + 'm';
  }
  function obsAnchor() {
    var last = 0;
    frames.forEach(function (frame) { if (frame.kind !== 'forecast') last = frame.time; });
    return last || Date.now();
  }
  function frameCaption(frame) {
    var rel = relLabel(frame.time, obsAnchor());
    if (frame.kind === 'forecast') return rel + ' · ' + clockLabel(frame.time);
    var when = new Date(frame.time).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    return rel + ' · ' + when;
  }
  function nextGood(from, dir) {
    if (!frames.length) return 0;
    var step = dir < 0 ? -1 : 1;
    for (var n = 0; n < frames.length; n++) {
      var i = (from + step * n + frames.length * 4) % frames.length;
      if (frames[i].ok !== false) return i;
    }
    return (from + frames.length) % frames.length;
  }
  function showFrame(index) {
    if (!frames.length) return;
    frameIndex = nextGood(index, index >= frameIndex ? 1 : -1);
    var next = frameLayers[frameIndex];
    if (rainOn && next) {
      if (!map.hasLayer(next)) next.addTo(map);
      next.setOpacity(opacity);
      if (next.bringToFront) next.bringToFront();
    }
    frameLayers.forEach(function (layer, i) {
      if (i !== frameIndex && map.hasLayer(layer)) map.removeLayer(layer);
    });
    var frame = frames[frameIndex];
    var caption = frameCaption(frame);
    var forecast = frame.kind === 'forecast';
    var badge = document.querySelector('.wx-live');
    var crt = document.querySelector('.wx-crt');
    var track = $('wxTrack');
    if (badge) {
      badge.textContent = forecast ? 'FORECAST' : 'LIVE';
      badge.classList.toggle('is-forecast', forecast);
    }
    if (crt) crt.classList.toggle('is-forecast', forecast);
    if (track) {
      track.classList.toggle('is-forecast', forecast);
      track.classList.toggle('is-obs', !forecast);
    }
    var stamp = $('wxStamp');
    if (stamp) stamp.textContent = caption + ' · ' + (frameIndex + 1) + '/' + frames.length;
    var read = $('wxScrubRead');
    if (read) read.textContent = caption;
    var scrub = $('wxScrub');
    if (scrub) {
      scrub.min = '0';
      scrub.max = String(frames.length - 1);
      scrub.value = String(frameIndex);
      scrub.setAttribute('aria-valuemin', '0');
      scrub.setAttribute('aria-valuemax', String(frames.length - 1));
      scrub.setAttribute('aria-valuenow', String(frameIndex));
      scrub.setAttribute('aria-valuetext', caption);
    }
  }
  function clearLoop() {
    pause();
    frameLayers.forEach(function (layer) { map.removeLayer(layer); });
    frameLayers = [];
    frames = [];
  }
  function makeLayer(frame) {
    return new RadarTile('', {
      frame: frame,
      pane: 'radar',
      opacity: opacity,
      maxZoom: 14,
      maxNativeZoom: 8,
      attribution: frame.kind === 'forecast' ? 'NOAA HRRR via Iowa Environmental Mesonet' : 'NEXRAD via Iowa Environmental Mesonet'
    });
  }
  function sampleUrl(frame) {
    var z = 6;
    var x = 17;
    var y = 26;
    if (map) {
      z = Math.max(4, Math.min(map.getZoom(), 7));
      var point = map.project(map.getCenter(), z).divideBy(256).floor();
      x = point.x;
      y = point.y;
    }
    return tileUrl(frame, z, x, y);
  }
  function keepGoodFrames(list) {
    var queue = list.slice();
    var workers = 0;
    return new Promise(function (resolve) {
      if (!queue.length) { resolve([]); return; }
      function pump() {
        if (!queue.length && workers === 0) {
          var good = list.filter(function (frame) { return frame.ok; });
          resolve(good.length ? good : list.slice());
          return;
        }
        while (workers < 4 && queue.length) {
          workers += 1;
          (function (frame) {
            probeUrl(sampleUrl(frame)).then(function (ok) {
              frame.ok = ok;
              workers -= 1;
              pump();
            });
          })(queue.shift());
        }
      }
      pump();
    });
  }
  function preloadFrames() {
    if (!map || !frames.length) return;
    var z = Math.min(Math.max(map.getZoom(), 4), 8);
    var bounds = map.getBounds().pad(0.2);
    var nw = map.project(bounds.getNorthWest(), z).divideBy(256).floor();
    var se = map.project(bounds.getSouthEast(), z).divideBy(256).floor();
    var coords = [];
    for (var x = nw.x; x <= se.x && coords.length < 12; x++) {
      for (var y = nw.y; y <= se.y && coords.length < 12; y++) coords.push([x, y]);
    }
    frames.forEach(function (frame) {
      coords.forEach(function (c) {
        var img = new Image();
        img.decoding = 'async';
        img.src = tileUrl(frame, z, c[0], c[1]);
      });
    });
  }
  function applyRadar(cache) {
    var wasPlaying = playing;
    var token = ++radarToken;
    var latest = cache.latest;
    var step = 10 * 60 * 1000;
    var built = [];
    for (var t = latest - 6 * 60 * 60 * 1000; t <= latest; t += step) {
      built.push({ kind: 'obs', time: t, comp: iemStamp(t), ok: true });
    }
    var forecastCount = 0;
    if (futureOn && cache.hrrr) {
      var runMs = cache.hrrr.runMs;
      for (var lead = 15; lead <= cache.hrrr.maxLead; lead += 15) {
        var when = runMs + lead * 60 * 1000;
        if (when <= latest) continue;
        if (when > latest + 6 * 60 * 60 * 1000 + step) break;
        built.push({
          kind: 'forecast',
          time: when,
          lead: pad4(lead),
          run: cache.hrrr.run,
          comp: '',
          ok: true
        });
        forecastCount += 1;
      }
    }
    keepGoodFrames(built).then(function (good) {
      if (token !== radarToken || !map) return;
      clearLoop();
      frames = good;
      forecastCount = frames.filter(function (frame) { return frame.kind === 'forecast'; }).length;
      frameLayers = frames.map(makeLayer);
      var nowIndex = 0;
      frames.forEach(function (frame, i) { if (frame.kind !== 'forecast') nowIndex = i; });
      var crt = document.querySelector('.wx-crt');
      if (crt) crt.classList.toggle('is-past', !futureOn || !forecastCount);
      syncLiveUnderlay();
      showFrame(nowIndex);
      preloadFrames();
      if (wasPlaying) play();
      var reach = forecastCount ? relLabel(frames[frames.length - 1].time, obsAnchor()) : 'Now';
      note(futureOn
        ? 'US composite through Now, then the HRRR forecast through ' + reach + '. The orange tag marks model frames, not observed radar.'
        : 'Observed US composite only, from -6h to Now. Turn on Past + future for the HRRR forecast.');
    });
  }
  function loadRadar() {
    var first = frames.length === 0;
    if (radarCache && Date.now() - radarCache.at < 8 * 60 * 1000) {
      applyRadar(radarCache);
      return;
    }
    if ($('wxStamp')) $('wxStamp').textContent = 'Loading radar and the HRRR forecast…';
    Promise.all([findLatest(), findHrrr()]).then(function (pair) {
      radarCache = { at: Date.now(), latest: pair[0], hrrr: pair[1] };
      applyRadar(radarCache);
    }).catch(function () {
      if (first) {
        $('wxStamp').textContent = 'Radar loop unavailable';
        if (!nexradOn) setNexrad(true);
      }
      note('The radar loop did not load. The live US composite is still available.');
    });
  }
  function play() {
    if (playing || frames.length < 2) return;
    playing = true;
    var playBtn = $('wxPlay');
    if (playBtn) playBtn.setAttribute('aria-pressed', 'true');
    if (frameIndex >= frames.length - 1) showFrame(0);
    function tick() {
      if (!playing) return;
      showFrame(frameIndex + 1);
      playTimer = setTimeout(tick, speedMs);
    }
    playTimer = setTimeout(tick, speedMs);
  }
  function pause() {
    playing = false;
    if (playTimer) clearTimeout(playTimer);
    playTimer = 0;
    var playBtn = $('wxPlay');
    if (playBtn) playBtn.setAttribute('aria-pressed', 'false');
  }
  function syncLiveUnderlay() {
    if (!map || !nexradLayer) return;
    var showLive = nexradOn && !rainOn;
    if (showLive && !map.hasLayer(nexradLayer)) nexradLayer.addTo(map);
    if (!showLive && map.hasLayer(nexradLayer)) map.removeLayer(nexradLayer);
  }
  function setRain(on) {
    rainOn = on;
    $('wxRain').checked = on;
    if (!on) frameLayers.forEach(function (layer) { map.removeLayer(layer); });
    else showFrame(frameIndex);
    syncLiveUnderlay();
    save();
  }
  function setNexrad(on) {
    nexradOn = on;
    $('wxNexrad').checked = on;
    syncLiveUnderlay();
    save();
  }
  function loadShips() {
    if (shipLoaded) return Promise.resolve();
    return Promise.all([
      fetch('/cruises/fleet.json').then(function (res) { return res.json(); }),
      fetch('/cruises/positions.json').then(function (res) { return res.json(); })
    ]).then(function (pair) {
      var fleet = (pair[0] && pair[0].ships) || [];
      var rows = (pair[1] && pair[1].ships) || {};
      var names = {};
      fleet.forEach(function (ship) { names[ship.mmsi] = ship.name; });
      var count = 0;
      fleet.forEach(function (ship) {
        var row = rows[ship.mmsi];
        if (!row || typeof row.lat !== 'number' || typeof row.lon !== 'number') return;
        count += 1;
        var marker = L.marker([row.lat, row.lon], {
          icon: L.divIcon({ className: 'wx-ship', html: '<span aria-hidden="true">🚢</span>', iconSize: [24, 24], iconAnchor: [12, 12] })
        });
        var node = document.createElement('div');
        var title = document.createElement('strong');
        title.textContent = ship.name;
        var body = document.createElement('div');
        var bits = [];
        if (row.destination) bits.push('Bound for ' + row.destination);
        if (typeof row.sog === 'number') bits.push(row.sog + ' kn');
        if (row.seen) bits.push('Heard ' + row.seen);
        body.textContent = bits.join(' · ') || 'Last reported position';
        node.appendChild(title);
        node.appendChild(body);
        marker.bindPopup(node);
        marker.bindTooltip(names[ship.mmsi] || ship.name, { direction: 'top', opacity: 1 });
        marker.addTo(shipLayer);
      });
      shipLoaded = true;
      $('wxShips').parentNode.lastChild.textContent = ' Cruise ships (' + count + ')';
    });
  }
  function setShips(on) {
    shipsOn = on;
    $('wxShips').checked = on;
    if (!on) {
      map.removeLayer(shipLayer);
      save();
      return;
    }
    loadShips().then(function () {
      if (shipsOn) shipLayer.addTo(map);
    }).catch(function () {
      note('Ship positions did not load. The radar is still on.');
    });
    save();
  }

  function loadForecast() {
    var cond = $('wxCond');
    cond.textContent = 'Tuning the forecast…';
    clearNode($('wxFacts'));
    clearNode($('wxHourly'));
    clearNode($('wxDays'));
    clearNode($('wxAlerts'));
    var meteo = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,uv_index,weather_code' +
      '&hourly=precipitation_probability,temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7';
    var current = fetch(meteo).then(function (res) { return res.json(); }).then(paintMeteo).catch(function () {
      cond.textContent = 'Open-Meteo did not answer.';
    });
    var points = 'https://api.weather.gov/points/' + place.lat.toFixed(4) + ',' + place.lon.toFixed(4);
    fetch(points, { headers: { Accept: 'application/geo+json' } }).then(function (res) {
      if (!res.ok) throw new Error('nws');
      return res.json();
    }).then(function (data) {
      var props = data.properties || {};
      var rel = props.relativeLocation && props.relativeLocation.properties;
      if (rel && rel.city && place.id !== 'gps' && place.id !== 'us' && place.id !== 'caribbean' && place.id !== 'cococay') {
        place.name = rel.city + (rel.state ? ', ' + rel.state : '');
        paintPlace();
        save();
      }
      if (props.forecast) {
        fetch(props.forecast, { headers: { Accept: 'application/geo+json' } }).then(function (res) { return res.json(); }).then(function (cast) {
          var periods = (cast.properties && cast.properties.periods) || [];
          if (periods[0] && periods[0].shortForecast) cond.textContent = periods[0].shortForecast;
          paintDays(periods);
        }).catch(function () {});
      }
    }).catch(function () { /* Open-Meteo still covers the numbers */ });
    fetch('https://api.weather.gov/alerts/active?point=' + place.lat.toFixed(4) + ',' + place.lon.toFixed(4), {
      headers: { Accept: 'application/geo+json' }
    }).then(function (res) { return res.json(); }).then(paintAlerts).catch(function () {
      paintAlerts(null);
    });
    return current;
  }
  function paintMeteo(data) {
    var cur = data.current || {};
    if (typeof cur.temperature_2m === 'number') $('wxTemp').textContent = Math.round(cur.temperature_2m) + '°';
    var facts = $('wxFacts');
    clearNode(facts);
    if (typeof cur.apparent_temperature === 'number') facts.appendChild(fact('Feels like', Math.round(cur.apparent_temperature) + '°'));
    if (typeof cur.relative_humidity_2m === 'number') facts.appendChild(fact('Humidity', Math.round(cur.relative_humidity_2m) + '%'));
    if (typeof cur.wind_speed_10m === 'number') facts.appendChild(fact('Wind', Math.round(cur.wind_speed_10m) + ' mph ' + compass(cur.wind_direction_10m)));
    if (typeof cur.uv_index === 'number') facts.appendChild(fact('UV', cur.uv_index.toFixed(1)));
    if (typeof cur.pressure_msl === 'number') facts.appendChild(fact('Barometer', (cur.pressure_msl * 0.02953).toFixed(2) + ' in'));
    if ($('wxCond').textContent.indexOf('Tuning') === 0 || $('wxCond').textContent.indexOf('Open-Meteo') === 0) {
      $('wxCond').textContent = sky(cur.weather_code);
    }
    var times = (data.hourly && data.hourly.time) || [];
    var start = times.indexOf(cur.time);
    if (start < 0) start = 0;
    var hourly = $('wxHourly');
    clearNode(hourly);
    for (var i = start; i < Math.min(times.length, start + 12); i++) {
      var cell = document.createElement('div');
      cell.className = 'wx-hour';
      var bar = document.createElement('div');
      bar.className = 'bar';
      var fill = document.createElement('span');
      var pop = data.hourly.precipitation_probability[i];
      var pct = typeof pop === 'number' ? pop : 0;
      fill.style.height = Math.max(4, pct) + '%';
      bar.appendChild(fill);
      var hour = document.createElement('div');
      var clock = String(times[i] || '');
      var hm = /(\d{2}):(\d{2})/.exec(clock);
      var hourNum = hm ? Number(hm[1]) : 0;
      hour.textContent = hm ? ((hourNum % 12) || 12) + (hourNum >= 12 ? 'p' : 'a') : '';
      var chance = document.createElement('div');
      chance.textContent = (typeof pop === 'number' ? pop : '—') + '%';
      cell.appendChild(bar);
      cell.appendChild(hour);
      cell.appendChild(chance);
      hourly.appendChild(cell);
    }
    if (!$('wxDays').children.length && data.daily) paintDaily(data.daily);
  }
  function paintDays(periods) {
    var box = $('wxDays');
    clearNode(box);
    periods.slice(0, 14).forEach(function (period) {
      var card = document.createElement('article');
      card.className = 'wx-day';
      var name = document.createElement('b');
      name.textContent = period.name || '';
      var hi = document.createElement('div');
      hi.className = 'hi';
      hi.textContent = (period.temperature != null ? period.temperature : '—') + '°';
      var skyText = document.createElement('div');
      skyText.textContent = period.shortForecast || '';
      var pop = document.createElement('div');
      var value = period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value;
      pop.textContent = (typeof value === 'number' ? value : 0) + '% rain';
      card.appendChild(name);
      card.appendChild(hi);
      card.appendChild(skyText);
      card.appendChild(pop);
      box.appendChild(card);
    });
  }
  function paintDaily(daily) {
    var box = $('wxDays');
    if (box.children.length) return;
    (daily.time || []).forEach(function (day, i) {
      var card = document.createElement('article');
      card.className = 'wx-day';
      var name = document.createElement('b');
      name.textContent = new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      var hi = document.createElement('div');
      hi.className = 'hi';
      hi.textContent = Math.round(daily.temperature_2m_max[i]) + '° / ' + Math.round(daily.temperature_2m_min[i]) + '°';
      var skyText = document.createElement('div');
      skyText.textContent = sky(daily.weather_code[i]);
      var pop = document.createElement('div');
      pop.textContent = (daily.precipitation_probability_max[i] != null ? daily.precipitation_probability_max[i] : '—') + '% rain';
      card.appendChild(name);
      card.appendChild(hi);
      card.appendChild(skyText);
      card.appendChild(pop);
      box.appendChild(card);
    });
  }
  function paintAlerts(data) {
    var box = $('wxAlerts');
    clearNode(box);
    var features = (data && data.features) || [];
    if (!features.length) {
      var clear = document.createElement('div');
      clear.className = 'wx-alert is-clear';
      clear.textContent = 'No active NWS advisories for this point.';
      box.appendChild(clear);
      return;
    }
    features.slice(0, 4).forEach(function (feature) {
      var props = feature.properties || {};
      var card = document.createElement('div');
      var eventName = props.event || 'Advisory';
      var lower = eventName.toLowerCase();
      card.className = 'wx-alert ' + (lower.indexOf('warning') >= 0 ? 'is-warning' : lower.indexOf('watch') >= 0 ? 'is-watch' : 'is-advisory');
      var title = document.createElement('strong');
      title.textContent = eventName + (props.severity ? ' · ' + props.severity : '');
      var headline = document.createElement('div');
      headline.textContent = props.headline || '';
      card.appendChild(title);
      card.appendChild(headline);
      box.appendChild(card);
    });
  }
  function seaCard(title, current) {
    var card = document.createElement('div');
    card.className = 'wx-sea';
    var name = document.createElement('b');
    name.textContent = title;
    var body = document.createElement('div');
    if (!current || current.wave_height == null) {
      body.textContent = 'No wave report for this point.';
    } else {
      var sst = current.sea_surface_temperature;
      var water = '';
      if (typeof sst === 'number') water = ' Water ' + Math.round(sst < 45 ? sst * 9 / 5 + 32 : sst) + '°.';
      body.textContent = 'Waves ' + current.wave_height.toFixed(1) + ' ft · ' +
        (current.wave_period != null ? current.wave_period.toFixed(0) + ' sec ' : '') +
        compass(current.wave_direction) + '.' + water;
    }
    card.appendChild(name);
    card.appendChild(body);
    return card;
  }
  function marineUrl(lat, lon) {
    return 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lon +
      '&current=wave_height,wave_direction,wave_period,sea_surface_temperature&length_unit=imperial&timezone=auto';
  }
  function loadMarine() {
    var box = $('wxMarine');
    clearNode(box);
    var jobs = [fetch(marineUrl(PORT.lat, PORT.lon)).then(function (res) { return res.json(); }).then(function (data) {
      box.appendChild(seaCard('Port Canaveral', data.current));
    }).catch(function () {
      box.appendChild(seaCard('Port Canaveral', null));
    })];
    if (miles(place.lat, place.lon, PORT.lat, PORT.lon) > 25) {
      jobs.push(fetch(marineUrl(place.lat, place.lon)).then(function (res) { return res.json(); }).then(function (data) {
        box.appendChild(seaCard('Seas near ' + place.name, data.current));
      }).catch(function () {}));
    }
    return Promise.all(jobs);
  }

  function chord() {
    if (!music.on || !music.ctx) return;
    if (window.MONDO_AUDIO && window.MONDO_AUDIO.muted()) {
      stopMusic();
      note('The tray mute is on. Unmute, then press the music button again.');
      return;
    }
    var ctx = music.ctx;
    var now = ctx.currentTime;
    var notes = CHORDS[music.step % CHORDS.length];
    music.step += 1;
    notes.forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.028, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.85);
    });
  }
  function startMusic() {
    if (window.MONDO_AUDIO && window.MONDO_AUDIO.muted()) {
      note('The tray mute is on. Unmute, then press the music button again.');
      return;
    }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!music.ctx) music.ctx = new Ctx();
    music.ctx.resume();
    if (music.on) return;
    music.on = true;
    $('wxMusic').setAttribute('aria-pressed', 'true');
    chord();
    music.timer = setInterval(chord, 2000);
  }
  function stopMusic() {
    music.on = false;
    if (music.timer) clearInterval(music.timer);
    music.timer = 0;
    var btn = $('wxMusic');
    if (btn) btn.setAttribute('aria-pressed', 'false');
  }

  function boot() {
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    readSaved();
    buildPresets();
    $('wxOpacity').value = String(Math.round(opacity * 100));
    $('wxSpeed').value = String(speedMs);
    $('wxPast').setAttribute('aria-pressed', futureOn ? 'false' : 'true');
    $('wxFuture').setAttribute('aria-pressed', futureOn ? 'true' : 'false');
    $('wxRain').checked = rainOn;
    $('wxNexrad').checked = nexradOn;
    $('wxShips').checked = shipsOn;
    paintPlace();
    if (typeof L === 'undefined') {
      note('The map library did not load.');
      return;
    }
    initMap();
    if (shipsOn) setShips(true);
    loadRadar();
    loadForecast();
    loadMarine();
    $('wxSearch').addEventListener('submit', function (event) {
      event.preventDefault();
      var q = $('wxQuery').value.replace(/\s+/g, ' ').trim();
      if (!q) return;
      note('Looking up ' + q + '…');
      geocode(q).then(function (hit) {
        if (!hit) {
          note('No match for that ZIP or city.');
          return;
        }
        applyPlace({
          id: '',
          q: q,
          name: hit.name + (hit.admin1 ? ', ' + hit.admin1 : ''),
          lat: hit.latitude,
          lon: hit.longitude,
          zoom: /^\d{5}$/.test(q) ? 10 : 9
        });
        note('Centered on ' + place.name + '.');
      }).catch(function () {
        note('The place lookup did not answer.');
      });
    });
    $('wxPlay').addEventListener('click', play);
    $('wxPause').addEventListener('click', pause);
    $('wxPrev').addEventListener('click', function () { pause(); showFrame(frameIndex - 1); });
    $('wxNext').addEventListener('click', function () { pause(); showFrame(frameIndex + 1); });
    $('wxScrub').addEventListener('input', function (event) {
      pause();
      showFrame(Number(event.target.value));
    });
    $('wxOpacity').addEventListener('input', function (event) {
      opacity = Number(event.target.value) / 100;
      frameLayers.forEach(function (layer) { layer.setOpacity(opacity); });
      if (nexradLayer) nexradLayer.setOpacity(opacity);
      save();
    });
    $('wxSpeed').addEventListener('change', function (event) {
      speedMs = Number(event.target.value) || 700;
      if (playing) { pause(); play(); }
      save();
    });
    function setHorizon(on) {
      futureOn = on;
      $('wxPast').setAttribute('aria-pressed', on ? 'false' : 'true');
      $('wxFuture').setAttribute('aria-pressed', on ? 'true' : 'false');
      save();
      if (radarCache) applyRadar(radarCache);
      else loadRadar();
    }
    $('wxPast').addEventListener('click', function () { setHorizon(false); });
    $('wxFuture').addEventListener('click', function () { setHorizon(true); });
    $('wxRain').addEventListener('change', function (event) { setRain(event.target.checked); });
    $('wxNexrad').addEventListener('change', function (event) { setNexrad(event.target.checked); });
    $('wxShips').addEventListener('change', function (event) { setShips(event.target.checked); });
    $('wxMusic').addEventListener('click', function () {
      if (music.on) stopMusic();
      else startMusic();
    });
    document.addEventListener('mondo-audio', function (event) {
      if (event.detail && event.detail.muted) stopMusic();
    });
    setInterval(loadRadar, 8 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
