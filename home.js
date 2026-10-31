/* Home facts: greeting, Cocoa weather, next launch, ships, top stock, tides, tropics. */
(function () {
  'use strict';
  var TZ = 'America/New_York';
  var COCOA = { lat: 28.3861, lon: -80.742 };
  var PORT = { lat: 28.4103, lon: -80.6188 };
  var LAUNCH_API = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=8';
  var BACKUP = [
    ['Falcon 9 · Starlink', '2026-11-03T13:30:00Z', 'SLC-40'],
    ['Falcon 9 · rideshare', '2026-11-12T08:00:00Z', 'LC-39A'],
    ['Vulcan Centaur', '2026-11-20T11:00:00Z', 'SLC-41'],
    ['Artemis II', '2026-12-15T12:00:00Z', 'LC-39A']
  ];

  function $(id) { return document.getElementById(id); }
  function text(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }
  function getJSON(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 7000);
    return fetch(url, { signal: ctrl.signal }).then(function (res) {
      if (!res.ok) throw new Error('status');
      return res.json();
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }
  function hourNow() {
    var raw = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date());
    return parseInt(raw, 10) || 0;
  }
  function greet() {
    var hour = hourNow();
    var hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
    text('homeGreet', hello);
  }
  function dateLine() {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric'
    }).format(new Date());
  }
  function todayISO() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }
  function ymd(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replace(/-/g, '');
  }
  function sky(code) {
    var n = Number(code);
    if (n === 0) return 'clear';
    if (n === 1) return 'mostly clear';
    if (n === 2) return 'partly cloudy';
    if (n === 3) return 'overcast';
    if (n === 45 || n === 48) return 'foggy';
    if (n >= 51 && n <= 57) return 'drizzle';
    if (n >= 61 && n <= 67) return 'rain';
    if (n >= 71 && n <= 77) return 'snow';
    if (n >= 80 && n <= 82) return 'showers';
    if (n >= 95) return 'storms';
    return 'fair';
  }
  function fillIcons() {
    if (!window.MONDO_GLYPH) return;
    document.querySelectorAll('[data-icon]').forEach(function (slot) {
      var name = slot.getAttribute('data-icon');
      var colors = window.MONDO_GLYPH.accent(name);
      var modern = document.createElement('span');
      modern.className = 'app-modern';
      var tile = document.createElement('span');
      tile.className = 'app-tile';
      tile.style.setProperty('--app-bg', colors[0]);
      tile.style.setProperty('--app-ink', colors[1]);
      tile.innerHTML = window.MONDO_GLYPH.line(name);
      modern.appendChild(tile);
      var classic = document.createElement('span');
      classic.className = 'app-pixel';
      classic.appendChild(window.MONDO_GLYPH.pixel(name));
      slot.replaceChildren(modern, classic);
    });
  }
  function forecastUrl(place) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat +
      '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=' + encodeURIComponent(TZ);
  }
  function readMeteo(data) {
    var cur = data && data.current;
    if (!cur || cur.temperature_2m == null) return null;
    return { temp: Math.round(cur.temperature_2m), sky: sky(cur.weather_code) };
  }
  function paintWeather(cocoa, port) {
    var when = dateLine();
    var line = when + '. Weather for Cocoa and Port Canaveral did not load.';
    if (cocoa && port) {
      if (cocoa.sky === port.sky && Math.abs(cocoa.temp - port.temp) <= 1) {
        line = when + '. Cocoa and Port Canaveral, ' + cocoa.temp + '° and ' + cocoa.sky + '.';
      } else {
        line = when + '. Cocoa ' + cocoa.temp + '° and ' + cocoa.sky + '. Port Canaveral ' + port.temp + '° and ' + port.sky + '.';
      }
    } else if (cocoa) {
      line = when + '. Cocoa ' + cocoa.temp + '° and ' + cocoa.sky + '.';
    }
    text('homeLine', line);
  }
  function loadWeather() {
    text('homeLine', dateLine() + '. Checking Cocoa and Port Canaveral.');
    Promise.all([
      getJSON(forecastUrl(COCOA)).then(readMeteo).catch(function () { return null; }),
      getJSON(forecastUrl(PORT)).then(readMeteo).catch(function () { return null; })
    ]).then(function (pair) { paintWeather(pair[0], pair[1]); });
  }
  function futureNet(iso) {
    var start = new Date(iso);
    if (isNaN(start.getTime())) return new Date(Date.now() + 86400000).toISOString();
    var next = new Date(start.getTime());
    while (next.getTime() < Date.now() + 3600000) next.setUTCMonth(next.getUTCMonth() + 3);
    return next.toISOString();
  }
  function backupLaunch() {
    var row = BACKUP[0];
    return { name: row[0], net: futureNet(row[1]), pad: row[2] };
  }
  function soonest(rows) {
    var best = null;
    rows.forEach(function (row) {
      var when = new Date(row.net);
      if (isNaN(when.getTime()) || when.getTime() < Date.now() - 3600000) return;
      if (!best || when < best.when) best = { when: when, name: row.name, pad: row.pad };
    });
    return best;
  }
  function countPhrase(ms) {
    var abs = Math.abs(ms);
    var days = Math.floor(abs / 86400000);
    var hours = Math.floor(abs / 3600000) % 24;
    var mins = Math.floor(abs / 60000) % 60;
    var secs = Math.floor(abs / 1000) % 60;
    if (ms < -60000) return 'Liftoff was recent';
    if (days > 0) return 'in ' + days + 'd ' + hours + 'h';
    if (hours > 0) return 'in ' + hours + 'h ' + mins + 'm';
    return 'in ' + mins + 'm ' + secs + 's';
  }
  var launchWhen = null;
  var launchDetail = '';
  function paintLaunch() {
    if (!launchWhen) return;
    var phrase = countPhrase(launchWhen.getTime() - Date.now());
    text('homeLaunchWhen', phrase);
    text('homeLaunchWhat', launchDetail);
    var link = $('homeLaunch');
    if (link) link.setAttribute('aria-label', 'Next launch ' + phrase + '. ' + launchDetail);
  }
  function armLaunch(when, detail) {
    launchWhen = when;
    launchDetail = detail;
    paintLaunch();
    if (window.__homeLaunchTimer) clearInterval(window.__homeLaunchTimer);
    var left = when.getTime() - Date.now();
    window.__homeLaunchTimer = setInterval(paintLaunch, left < 2 * 3600000 ? 1000 : 30000);
  }
  function loadLaunch() {
    getJSON(LAUNCH_API).then(function (data) {
      var rows = (data.results || []).map(function (row) {
        var padName = (row.pad && row.pad.name) || '';
        var pad = /40/.test(padName) ? 'SLC-40' : /41/.test(padName) ? 'SLC-41' : /39/.test(padName) ? 'LC-39A' : 'the Cape';
        var rocket = row.rocket && row.rocket.configuration && row.rocket.configuration.name;
        var name = row.name || rocket || 'Launch';
        return { name: name, net: row.net || row.window_start || '', pad: pad };
      });
      var next = soonest(rows);
      if (!next) throw new Error('empty');
      armLaunch(next.when, next.name + ' from ' + next.pad);
    }).catch(function () {
      var row = backupLaunch();
      armLaunch(new Date(row.net), row.name + ' from ' + row.pad + ' (backup schedule)');
    });
  }
  function miles(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return 99;
    var dy = (lat - PORT.lat) * 69;
    var dx = (lon - PORT.lon) * 69 * Math.cos(PORT.lat * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function niceName(raw) {
    return String(raw || '').toLowerCase().replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); })
      .replace(/\bOf\b/g, 'of').replace(/\bThe\b/g, 'the');
  }
  function shortDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length < 3) return iso;
    var when = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(when);
  }
  function loadShips() {
    Promise.all([
      getJSON('/cruises/fleet.json').catch(function () { return { ships: [] }; }),
      getJSON('/cruises/positions.json').catch(function () { return { ships: {} }; }),
      getJSON('/cruises/canaveral-deals.json').catch(function () { return { deals: [] }; })
    ]).then(function (parts) {
      var names = {};
      (parts[0].ships || []).forEach(function (ship) {
        if (ship.mmsi) names[String(ship.mmsi)] = ship.name;
      });
      var inPort = [];
      var ships = parts[1].ships || {};
      Object.keys(ships).forEach(function (mmsi) {
        var ship = ships[mmsi];
        var dist = miles(ship.lat, ship.lon);
        var slow = ship.sog == null || Number(ship.sog) < 1.5;
        if (dist < 2.5 && slow) inPort.push(names[mmsi] || niceName(ship.aisName || 'Ship'));
      });
      var today = todayISO();
      var next = null;
      (parts[2].deals || []).forEach(function (deal) {
        if (!deal || !deal.sailDate || deal.sailDate < today) return;
        if (!next || deal.sailDate < next.sailDate) next = deal;
      });
      var head = inPort.length ? (inPort.length === 1 ? inPort[0] + ' in port' : inPort.length + ' in port') : 'None in port';
      var detail = inPort.length > 1 ? inPort.slice(0, 3).join(', ') : '';
      if (next) {
        var sail = 'Next ' + (next.ship || 'sailing') + ', ' + shortDate(next.sailDate);
        detail = detail ? detail + '. ' + sail : sail;
      }
      if (!detail) detail = 'Port Canaveral sailings';
      text('homeShipWhen', head);
      text('homeShipWhat', detail);
      var link = $('homeShips');
      if (link) link.setAttribute('aria-label', 'Ships. ' + head + '. ' + detail);
    });
  }
  function loadTides() {
    var start = ymd(new Date());
    var url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8721604&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json&begin_date=' + start + '&range=48';
    getJSON(url).then(function (data) {
      var rows = data.predictions || [];
      var now = Date.now();
      var next = null;
      rows.forEach(function (row) {
        var match = String(row.t || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        if (!match) return;
        var when = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
        if (when.getTime() < now - 60000) return;
        if (!next || when < next.when) next = { when: when, type: row.type, v: Number(row.v) };
      });
      if (!next) throw new Error('empty');
      var kind = next.type === 'H' ? 'High' : 'Low';
      var clock = next.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      text('homeTide', kind + ' ' + clock + ', ' + next.v.toFixed(1) + ' ft at Port Canaveral');
    }).catch(function () {
      text('homeTide', 'Port Canaveral highs and lows');
    });
  }
  function shortCompany(name) {
    return String(name || '').replace(/\s+/g, ' ').trim()
      .replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|L\.P\.|LLC)\.?$/i, '')
      .replace(/,\s*$/, '')
      .trim();
  }
  function signedPct(value) {
    var n = Number(value);
    if (!isFinite(n)) return '';
    var text = Math.abs(n).toFixed(1).replace(/\.0$/, '') + '%';
    if (n > 0) return '+' + text;
    if (n < 0) return '−' + text;
    return text;
  }
  function etDate(iso) {
    var time = Date.parse(iso || '');
    if (!Number.isFinite(time)) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(time));
  }
  function addDays(ymd, count) {
    var date = new Date(ymd + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function tradingGap(iso) {
    var start = etDate(iso);
    var today = todayISO();
    if (!start || start >= today) return 0;
    var gap = 0;
    var cursor = addDays(start, 1);
    while (cursor <= today && gap < 12) {
      var day = new Date(cursor + 'T12:00:00Z').getUTCDay();
      if (day !== 0 && day !== 6) gap += 1;
      cursor = addDays(cursor, 1);
    }
    return gap;
  }
  function shortWhen(iso) {
    var time = Date.parse(iso || '');
    if (!Number.isFinite(time)) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, month: 'short', day: 'numeric'
    }).format(new Date(time));
  }
  function topPick(data) {
    var list = data && Array.isArray(data.stocks) ? data.stocks.filter(function (row) {
      return row && row.symbol && typeof row.price === 'number';
    }) : [];
    var swing = list.filter(function (row) {
      return row.swingEligible && typeof row.swingScore === 'number' && row.swingScore >= 20;
    });
    var pool = swing.length ? swing : list;
    var useSwing = swing.length > 0;
    pool.sort(function (a, b) {
      var left = useSwing ? (a.swingScore || 0) : (a.rankScore || 0);
      var right = useSwing ? (b.swingScore || 0) : (b.rankScore || 0);
      return right - left || String(a.symbol).localeCompare(String(b.symbol));
    });
    return pool[0] || null;
  }
  function paintStock(data) {
    var line = $('homeStockLine');
    if (!line) return;
    var row = topPick(data);
    var stale = !data || !data.fetchedAt || tradingGap(data.fetchedAt) > 3;
    if (!row) {
      line.textContent = 'Updating…';
      return;
    }
    if (stale) {
      line.textContent = 'Updating… · as of ' + (shortWhen(data && data.fetchedAt) || 'an earlier day');
      return;
    }
    line.replaceChildren();
    var company = shortCompany(row.name).replace(/\s+\(The$/i, '');
    if (company.length > 14) company = company.split(/[\s,]+/)[0];
    var main = document.createElement('span');
    main.className = 'home-stock-main';
    var name = document.createElement('span');
    name.className = 'home-stock-name';
    name.textContent = row.symbol + (company ? ' ' + company : '') + ' · ';
    var facts = document.createElement('span');
    facts.className = 'home-stock-facts';
    facts.appendChild(document.createTextNode('$' + row.price.toFixed(2) + ' '));
    if (typeof row.dayChange === 'number') {
      var change = document.createElement('span');
      change.className = row.dayChange < 0 ? 'home-stock-down' : (row.dayChange > 0 ? 'home-stock-up' : '');
      change.textContent = signedPct(row.dayChange);
      facts.appendChild(change);
    }
    main.append(name, facts);
    line.appendChild(main);
    if (row.swingEligible && typeof row.swingScore === 'number') {
      var badge = document.createElement('span');
      badge.className = 'home-stock-score';
      badge.textContent = String(row.swingScore).replace(/\.0$/, '');
      line.appendChild(badge);
    }
  }
  function loadStock() {
    text('homeStockLine', 'Checking the screener');
    getJSON('/stocks/oversold.json').then(paintStock, function () { paintStock(null); });
  }
  function loadTropics() {
    var url = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/1/query?where=' +
      encodeURIComponent("BASIN='AL'") + '&outFields=STORMNAME,STORMTYPE&returnGeometry=false&f=json';
    getJSON(url).then(function (data) {
      var features = data.features || [];
      if (!features.length) {
        text('homeTropics', 'No active Atlantic storms');
        return;
      }
      var names = features.map(function (feat) {
        var attr = feat.attributes || {};
        var name = attr.STORMNAME || 'Storm';
        var kind = attr.STORMTYPE || '';
        return kind ? name + ' (' + kind + ')' : name;
      });
      text('homeTropics', names.join(', '));
    }).catch(function () {
      text('homeTropics', 'Atlantic storm watch');
    });
  }

  function parkCounter() {
    var visits = document.querySelector('.home-visits');
    var foot = document.querySelector('footer.site-footer .wrap');
    if (visits && foot && foot.lastElementChild !== visits) foot.appendChild(visits);
  }
  document.addEventListener('DOMContentLoaded', parkCounter);
  fillIcons();
  greet();
  loadWeather();
  loadLaunch();
  loadShips();
  loadStock();
  loadTides();
  loadTropics();
})();
