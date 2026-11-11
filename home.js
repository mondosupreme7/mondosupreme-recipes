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
  function text(id, value, state) {
    var node = $(id);
    if (!node) return;
    node.replaceChildren(document.createTextNode(value));
    node.classList.remove('feed-pending', 'feed-error', 'feed-empty');
    if (state) node.classList.add(state);
    var link = node.closest('a');
    if (link) link.setAttribute('aria-busy', state === 'feed-pending' ? 'true' : 'false');
  }
  function fail(id, message, again) {
    var node = $(id);
    if (!node) return;
    node.classList.remove('feed-pending', 'feed-empty');
    node.classList.add('feed-error');
    node.replaceChildren(document.createTextNode(message + ' '));
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'feed-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      again();
    });
    node.appendChild(retry);
    var link = node.closest('a');
    if (link) link.setAttribute('aria-busy', 'false');
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
  function forecastUrl(place, hourly) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat +
      '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code' +
      (hourly ? '&hourly=precipitation_probability&forecast_days=2' : '') +
      '&temperature_unit=fahrenheit&timezone=' + encodeURIComponent(TZ);
  }
  function etHourKey(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return map.year + '-' + map.month + '-' + map.day + 'T' + map.hour;
  }
  function hourLabel(key) {
    var hour = Number(String(key).slice(11, 13));
    if (!isFinite(hour)) return '';
    return ((hour % 12) || 12) + (hour >= 12 ? 'p' : 'a');
  }
  function nextRain(data) {
    var times = (data && data.hourly && data.hourly.time) || [];
    var pops = (data && data.hourly && data.hourly.precipitation_probability) || [];
    var nowKey = etHourKey(new Date());
    for (var i = 0; i < times.length; i++) {
      var key = String(times[i] || '').slice(0, 13);
      var pop = pops[i];
      if (key >= nowKey && typeof pop === 'number' && pop >= 20) {
        return 'rain ' + hourLabel(key) + ' ' + Math.round(pop) + '%';
      }
    }
    return 'no rain overnight';
  }
  function readMeteo(data) {
    var cur = data && data.current;
    if (!cur || cur.temperature_2m == null) return null;
    return { temp: Math.round(cur.temperature_2m), sky: sky(cur.weather_code) };
  }
  function paintWeather(cocoa, port, rain) {
    var line = 'Weather for Cocoa and Port Canaveral did not load.';
    var skyBit = '';
    if (cocoa && port && Math.abs(cocoa.temp - port.temp) <= 1) {
      skyBit = cocoa.temp + '°';
    } else if (cocoa && port) {
      skyBit = 'Cocoa ' + cocoa.temp + '° · Port ' + port.temp + '°';
    } else if (cocoa) {
      skyBit = 'Cocoa ' + cocoa.temp + '°';
    } else if (port) {
      skyBit = 'Port ' + port.temp + '°';
    }
    if (!skyBit) {
      fail('homeLine', 'Weather didn’t load.', loadWeather);
      return;
    }
    line = skyBit + (rain ? ' · ' + rain : '');
    text('homeLine', line);
    var link = $('homeWeather');
    if (link) link.setAttribute('aria-label', 'Weather. ' + line);
  }
  function loadWeather() {
    text('homeLine', 'Loading weather', 'feed-pending');
    Promise.all([
      getJSON(forecastUrl(COCOA, true)).then(function (data) {
        return { meteo: readMeteo(data), rain: nextRain(data) };
      }).catch(function () { return { meteo: null, rain: '' }; }),
      getJSON(forecastUrl(PORT, false)).then(readMeteo).catch(function () { return null; })
    ]).then(function (pair) { paintWeather(pair[0].meteo, pair[1], pair[0].rain); });
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
    var line = phrase + (launchDetail ? ' · ' + launchDetail : '');
    text('homeLaunchLine', line, String(launchDetail).indexOf('backup schedule') >= 0 ? 'feed-empty' : '');
    var link = $('homeLaunch');
    if (link) link.setAttribute('aria-label', 'Next launch ' + line);
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
    text('homeLaunchLine', 'Loading the Cape', 'feed-pending');
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
  function shortDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length < 3) return iso;
    var when = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(when);
  }
  function loadShips() {
    text('homeShipLine', 'Loading sailings', 'feed-pending');
    getJSON('/cruises/canaveral-deals.json').then(function (data) {
      var today = todayISO();
      var next = null;
      (data.deals || []).forEach(function (deal) {
        if (!deal || !deal.sailDate || deal.sailDate < today) return;
        if (!next || deal.sailDate < next.sailDate) next = deal;
      });
      if (!next) text('homeShipLine', 'No dated Port Canaveral sailing', 'feed-empty');
      else text('homeShipLine', (next.ship || 'Sailing') + ' · ' + shortDate(next.sailDate));
      var link = $('homeShips');
      if (link) link.setAttribute('aria-label', 'Next sailing. ' + ($('homeShipLine') ? $('homeShipLine').textContent : ''));
    }).catch(function () { fail('homeShipLine', 'Sailings didn’t load.', loadShips); });
  }
  function loadTides() {
    text('homeTide', 'Loading the tide', 'feed-pending');
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
    }).catch(function () { fail('homeTide', 'Tide didn’t load.', loadTides); });
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
    list.sort(function (a, b) {
      var aSwing = a.swingEligible && typeof a.swingScore === 'number' && a.swingScore >= 20 ? 1 : 0;
      var bSwing = b.swingEligible && typeof b.swingScore === 'number' && b.swingScore >= 20 ? 1 : 0;
      if (aSwing !== bSwing) return bSwing - aSwing;
      var left = typeof a.rankScore === 'number' ? a.rankScore : (a.score || 0);
      var right = typeof b.rankScore === 'number' ? b.rankScore : (b.score || 0);
      return right - left || String(a.symbol).localeCompare(String(b.symbol));
    });
    return list[0] || null;
  }
  function paintStock(data) {
    var line = $('homeStockLine');
    if (!line) return;
    var row = topPick(data);
    var stale = !data || !data.fetchedAt || tradingGap(data.fetchedAt) > 3;
    if (!row && (!data || !data.fetchedAt)) {
      fail('homeStockLine', 'The screener didn’t load.', loadStock);
      return;
    }
    if (!row) {
      text('homeStockLine', 'No screened stock in this snapshot.', 'feed-empty');
      return;
    }
    if (stale) {
      text('homeStockLine', 'Saved screen · as of ' + (shortWhen(data && data.fetchedAt) || 'an earlier day'), 'feed-empty');
      return;
    }
    line.classList.remove('feed-pending', 'feed-error', 'feed-empty');
    line.replaceChildren();
    line.appendChild(document.createTextNode(row.symbol + ' $' + row.price.toFixed(2) + ' '));
    if (typeof row.dayChange === 'number') {
      var change = document.createElement('span');
      change.className = row.dayChange < 0 ? 'home-brief-down' : (row.dayChange > 0 ? 'home-brief-up' : '');
      change.textContent = signedPct(row.dayChange);
      line.appendChild(change);
    }
    if (typeof row.entryLow === 'number' && typeof row.entryHigh === 'number') {
      line.appendChild(document.createTextNode(' · Buy ' + row.entryLow.toFixed(2) + '–' + row.entryHigh.toFixed(2)));
    }
    var link = line.closest('a');
    if (link) link.setAttribute('aria-label', 'Top stock. ' + line.textContent);
  }
  function loadStock() {
    text('homeStockLine', 'Loading the screener', 'feed-pending');
    getJSON('/stocks/oversold.json?v=7').then(paintStock, function () { paintStock(null); });
  }
  function loadTropics() {
    text('homeTropics', 'Loading the Atlantic', 'feed-pending');
    var url = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/1/query?where=' +
      encodeURIComponent("BASIN='AL'") + '&outFields=STORMNAME,STORMTYPE&returnGeometry=false&f=json';
    getJSON(url).then(function (data) {
      var features = data.features || [];
      if (!features.length) {
        text('homeTropics', 'No active Atlantic storms', 'feed-empty');
        return;
      }
      var names = features.map(function (feat) {
        var attr = feat.attributes || {};
        var name = attr.STORMNAME || 'Storm';
        var kind = attr.STORMTYPE || '';
        return kind ? name + ' (' + kind + ')' : name;
      });
      text('homeTropics', names.join(', '));
    }).catch(function () { fail('homeTropics', 'Storm list didn’t load.', loadTropics); });
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
