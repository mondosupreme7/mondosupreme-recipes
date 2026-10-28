(function () {
  'use strict';
  var STATION = '8721604';
  var LAT = 28.32;
  var LON = -80.61;

  function $(id) { return document.getElementById(id); }
  function ymd(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replace(/-/g, '');
  }
  function noaa(params) {
    var q = new URLSearchParams(params);
    q.set('station', STATION);
    q.set('datum', 'MLLW');
    q.set('time_zone', 'lst_ldt');
    q.set('units', 'english');
    q.set('format', 'json');
    return fetch('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?' + q.toString()).then(function (res) {
      if (!res.ok) throw new Error('noaa');
      return res.json();
    });
  }
  function setText(id, text) { var n = $(id); if (n) n.textContent = text; }
  function paintChart(points, extremes) {
    var svg = $('tideChart');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!points.length) {
      setText('tideNote', 'Tide predictions did not arrive.');
      return;
    }
    var w = 640;
    var h = 240;
    var pad = 28;
    var min = points[0].v;
    var max = points[0].v;
    points.forEach(function (p) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; });
    if (max - min < 0.4) max = min + 0.4;
    function x(i) { return pad + (w - pad * 2) * (i / (points.length - 1)); }
    function y(v) { return pad + (h - pad * 2) * (1 - (v - min) / (max - min)); }
    var ns = 'http://www.w3.org/2000/svg';
    function el(name) { return document.createElementNS(ns, name); }
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var path = el('path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#0284c7');
    path.setAttribute('stroke-width', '3');
    svg.appendChild(path);
    extremes.forEach(function (ex) {
      var idx = 0;
      var best = Infinity;
      points.forEach(function (p, i) {
        var diff = Math.abs(p.t - ex.t);
        if (diff < best) { best = diff; idx = i; }
      });
      var c = el('circle');
      c.setAttribute('cx', x(idx).toFixed(1));
      c.setAttribute('cy', y(points[idx].v).toFixed(1));
      c.setAttribute('r', '5');
      c.setAttribute('fill', ex.type === 'H' ? '#0f766e' : '#b45309');
      svg.appendChild(c);
      var label = el('text');
      label.setAttribute('x', x(idx).toFixed(1));
      label.setAttribute('y', (y(points[idx].v) + (ex.type === 'H' ? -10 : 16)).toFixed(1));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '12');
      label.setAttribute('fill', 'currentColor');
      label.textContent = ex.type + ' ' + ex.v.toFixed(1) + ' ft';
      svg.appendChild(label);
    });
  }
  function parseWhen(text) {
    var m = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  }
  function clock(text) {
    var t = parseWhen(text);
    if (!t) return text;
    return new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function loadMarine() {
    var marine = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + LAT + '&longitude=' + LON +
      '&hourly=wave_height,wave_period,sea_surface_temperature&forecast_days=2&timezone=America%2FNew_York&length_unit=imperial';
    var sky = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
      '&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index&daily=sunrise,sunset,uv_index_max&forecast_days=2&timezone=America%2FNew_York&temperature_unit=fahrenheit&wind_speed_unit=mph';
    return Promise.all([
      fetch(marine).then(function (r) { return r.json(); }),
      fetch(sky).then(function (r) { return r.json(); })
    ]).then(function (pair) {
      var sea = pair[0];
      var wx = pair[1];
      var waves = sea.hourly && sea.hourly.wave_height || [];
      var periods = sea.hourly && sea.hourly.wave_period || [];
      var sst = sea.hourly && sea.hourly.sea_surface_temperature || [];
      var i = 0;
      setText('waveHeight', waves.length ? Number(waves[i]).toFixed(1) + ' ft' : '—');
      setText('wavePeriod', periods.length ? Math.round(periods[i]) + ' s' : '—');
      var wind = wx.current || {};
      setText('wind', wind.wind_speed_10m != null ? Math.round(wind.wind_speed_10m) + ' mph' : '—');
      setText('uv', wind.uv_index != null ? String(Math.round(wind.uv_index)) : (wx.daily && wx.daily.uv_index_max ? String(Math.round(wx.daily.uv_index_max[0])) : '—'));
      if (wx.daily && wx.daily.sunrise) setText('sunrise', new Date(wx.daily.sunrise[0]).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
      if (wx.daily && wx.daily.sunset) setText('sunset', new Date(wx.daily.sunset[0]).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
      if (sst.length && $('waterTemp').textContent === '—') setText('waterTemp', Math.round(sst[0]) + '°');
    });
  }
  function boot() {
    var start = ymd(new Date());
    var later = ymd(new Date(Date.now() + 2 * 86400000));
    Promise.all([
      noaa({ product: 'predictions', begin_date: start, end_date: later, interval: '30' }),
      noaa({ product: 'predictions', begin_date: start, end_date: later, interval: 'hilo' }),
      noaa({ product: 'water_level', date: 'latest' }).catch(function () { return {}; }),
      noaa({ product: 'water_temperature', date: 'latest' }).catch(function () { return {}; })
    ]).then(function (parts) {
      var curve = (parts[0].predictions || []).map(function (row) {
        return { t: parseWhen(row.t), v: Number(row.v) };
      }).filter(function (row) { return row.t && !isNaN(row.v); });
      var now = Date.now();
      var windowed = curve.filter(function (row) { return row.t >= now - 3 * 3600000 && row.t <= now + 48 * 3600000; });
      if (windowed.length > 4) curve = windowed;
      var extremes = (parts[1].predictions || []).map(function (row) {
        return { t: parseWhen(row.t), v: Number(row.v), type: row.type };
      }).filter(function (row) { return row.t >= now - 3600000 && row.t <= now + 48 * 3600000; });
      paintChart(curve, extremes);
      var nextH = extremes.filter(function (row) { return row.type === 'H' && row.t >= now; })[0];
      var nextL = extremes.filter(function (row) { return row.type === 'L' && row.t >= now; })[0];
      if (nextH) setText('nextHigh', nextH.v.toFixed(1) + ' ft · ' + new Date(nextH.t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }));
      if (nextL) setText('nextLow', nextL.v.toFixed(1) + ' ft · ' + new Date(nextL.t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }));
      var level = (parts[2].data || [])[0];
      if (level) setText('waterLevel', Number(level.v).toFixed(2) + ' ft');
      var temp = (parts[3].data || [])[0];
      if (temp && temp.v != null) setText('waterTemp', Math.round(Number(temp.v)) + '°');
      setText('tideNote', 'Station 8721604, Trident Pier. Heights are MLLW. The curve covers the next 48 hours.');
    }).catch(function () {
      setText('tideNote', 'NOAA tide predictions did not load. Surf and sky data may still appear below.');
    });
    loadMarine().catch(function () {
      setText('tideNote', ($('tideNote').textContent || '') + ' Marine weather did not load.');
    });
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
