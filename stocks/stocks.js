(function () {
  'use strict';

  var KEY = 'mondosupreme.stocks.v1';
  var TICKER = /^[A-Z]{1,5}(?:-[A-Z])?$/;
  var OWNER = 'cbrooks_911@yahoo.com';
  var rows = [];
  var fetchedAt = '';
  var watch = {};
  var selected = '';
  var uid = '';
  var member = false;

  document.getElementById('yr').textContent = String(new Date().getFullYear());

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function readWatch() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeWatch() {
    var clean = {};
    Object.keys(watch).sort().forEach(function (symbol) {
      var pin = watch[symbol];
      if (!TICKER.test(symbol) || !pin) return;
      clean[symbol] = {
        note: String(pin.note || '').replace(/[\r\n]/g, ' ').slice(0, 140),
        target: typeof pin.target === 'number' && pin.target > 0 ? pin.target : null,
        updatedAt: pin.updatedAt || Date.now()
      };
    });
    watch = clean;
    try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) { /* private mode */ }
  }

  function money(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function signed(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var text = (value > 0 ? '+' : '') + value.toFixed(1) + '%';
    return text;
  }

  function localTime(iso) {
    var time = Date.parse(iso);
    if (!Number.isFinite(time)) return 'an unknown time';
    return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }

  function bootFirebase() {
    if (!window.firebase || !window.MONDO_BOARD_CONFIG) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
    } catch (e) { return false; }
    return !!(firebase.apps && firebase.apps.length && firebase.database);
  }

  function bySymbol(symbol) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].symbol === symbol) return rows[i];
    }
    return null;
  }

  function passes(row) {
    var mode = document.getElementById('screen').value;
    if (mode === 'deep') return row.rsi < 30;
    if (mode === 'ready') return !!row.ready;
    if (mode === 'pull') return !!row.pullback;
    if (mode === 'watch') return !!watch[row.symbol];
    return true;
  }

  function visibleRows() {
    var mode = document.getElementById('screen').value;
    var list = rows.filter(passes);
    if (mode === 'watch') {
      Object.keys(watch).forEach(function (symbol) {
        if (!bySymbol(symbol)) {
          list.push({
            symbol: symbol,
            name: 'Pinned ticker',
            price: null,
            rsi: null,
            bbDistancePct: null,
            vsSma200: null,
            drop5: null,
            drop21: null,
            range52: null,
            score: null,
            zone: '',
            pinnedOnly: true
          });
        }
      });
    }
    var sort = document.getElementById('sort').value;
    list.sort(function (a, b) {
      if (sort === 'score') return (b.score || 0) - (a.score || 0) || a.symbol.localeCompare(b.symbol);
      if (sort === 'drop') return (a.drop5 == null ? 0 : a.drop5) - (b.drop5 == null ? 0 : b.drop5) || a.symbol.localeCompare(b.symbol);
      if (sort === 'ticker') return a.symbol.localeCompare(b.symbol);
      return (a.rsi == null ? 999 : a.rsi) - (b.rsi == null ? 999 : b.rsi) || a.symbol.localeCompare(b.symbol);
    });
    return list;
  }

  function badges(row) {
    var box = el('span', null, 'badge-row');
    if (row.strongBounce) box.appendChild(el('span', 'STRONG BOUNCE SETUP!', 'qbadge is-bounce'));
    if (typeof row.rsi === 'number' && row.rsi < 30) box.appendChild(el('span', 'RSI < 30!', 'qbadge is-hot'));
    else if (row.zone === 'watch') box.appendChild(el('span', 'WATCH / BOUNCE ZONE', 'qbadge is-bounce'));
    return box.childNodes.length ? box : null;
  }

  function numCell(value, digits, suffix, color) {
    var text = value == null || !isFinite(value) ? '—' : value.toFixed(digits) + (suffix || '');
    var node = el('td', text);
    if (color && typeof value === 'number' && value < 0) node.className = 'num-down';
    else if (color && typeof value === 'number' && value > 0) node.className = 'num-up';
    return node;
  }

  function renderTable() {
    var body = document.getElementById('rows');
    var list = visibleRows();
    body.replaceChildren();
    list.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.tabIndex = 0;
      if (row.symbol === selected) tr.className = 'is-open';
      var name = document.createElement('td');
      name.setAttribute('data-label', 'Ticker');
      name.appendChild(el('span', row.symbol, 'tick'));
      name.appendChild(el('small', row.name || ''));
      var marks = badges(row);
      if (marks) name.appendChild(marks);
      tr.appendChild(name);
      var last = el('td', row.price == null ? '—' : money(row.price));
      last.setAttribute('data-label', 'Last');
      tr.appendChild(last);
      var rsi = numCell(row.rsi, 1);
      rsi.setAttribute('data-label', 'RSI-14');
      tr.appendChild(rsi);
      var bb = document.createElement('td');
      bb.setAttribute('data-label', 'Lower BB');
      bb.textContent = row.bbDistancePct == null ? '—' : ((row.bbDistancePct > 0 ? '+' : '') + row.bbDistancePct.toFixed(1) + '%');
      if (typeof row.bbDistancePct === 'number' && row.bbDistancePct < 0) bb.className = 'num-down';
      tr.appendChild(bb);
      var sma = numCell(row.vsSma200, 1, '%', true);
      sma.setAttribute('data-label', 'vs 200d');
      tr.appendChild(sma);
      var drop5 = numCell(row.drop5, 1, '%', true);
      drop5.setAttribute('data-label', '5-Day');
      tr.appendChild(drop5);
      var drop21 = numCell(row.drop21, 1, '%', true);
      drop21.setAttribute('data-label', '1-Month');
      tr.appendChild(drop21);
      var range = el('td', row.range52 == null ? '—' : row.range52.toFixed(0) + '%');
      range.setAttribute('data-label', '52-Wk');
      tr.appendChild(range);
      var score = el('td', row.score == null ? '—' : String(row.score));
      score.setAttribute('data-label', 'Score');
      tr.appendChild(score);
      tr.addEventListener('click', function () { openDetail(row.symbol); });
      tr.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(row.symbol);
        }
      });
      body.appendChild(tr);
    });
    document.getElementById('empty').hidden = list.length !== 0;
    var scanned = rows.length;
    document.getElementById('count').textContent = list.length === scanned && document.getElementById('screen').value === 'all'
      ? scanned + ' stocks scanned'
      : 'Showing ' + list.length + ' of ' + scanned + ' scanned stocks';
  }

  function why(row) {
    if (row.pinnedOnly) return 'This ticker is on your watchlist and was not in the latest scan.';
    var parts = ['RSI(14) at ' + row.rsi.toFixed(1)];
    if (row.bbDistancePct < 0) parts.push('trading ' + Math.abs(row.bbDistancePct).toFixed(1) + '% below the lower Bollinger Band');
    else parts.push('trading ' + row.bbDistancePct.toFixed(1) + '% above the lower Bollinger Band');
    if (row.uptick) parts.push('curling up' + (row.volumeRatio ? ' on ' + row.volumeRatio.toFixed(1) + 'x volume' : ''));
    else if (row.hammer) parts.push('printing a hammer off support' + (row.volumeRatio ? ' on ' + row.volumeRatio.toFixed(1) + 'x volume' : ''));
    else parts.push('last close did not turn up');
    var sentence = parts[0] + ', ' + parts[1] + ', ' + parts.slice(2).join(', ') + '.';
    if (row.above200) sentence += ' Still above the 200-day average.';
    else if (row.sma200) sentence += ' Under the 200-day average.';
    if (row.zone === 'deep') sentence += ' Flagged DEEPLY OVERSOLD.';
    else if (row.zone === 'watch') sentence += ' Flagged WATCH / BOUNCE ZONE.';
    return sentence;
  }

  function drawChart(row) {
    var canvas = document.getElementById('chart');
    var series = row.series;
    if (!series || !series.c || !series.c.length) {
      canvas.hidden = true;
      return;
    }
    canvas.hidden = false;
    var width = Math.max(320, canvas.clientWidth || 640);
    var height = 320;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#020802';
    ctx.fillRect(0, 0, width, height);
    var pad = 28;
    var gap = 16;
    var priceH = Math.round((height - pad * 2 - gap) * 0.68);
    var rsiTop = pad + priceH + gap;
    var rsiH = height - rsiTop - pad;
    var closes = series.c;
    var lows = series.l.filter(function (n) { return typeof n === 'number'; }).concat(closes);
    var highs = series.u.filter(function (n) { return typeof n === 'number'; }).concat(closes);
    var min = Math.min.apply(null, lows);
    var max = Math.max.apply(null, highs);
    if (!(max > min)) { max = min + 1; }
    function xAt(index) {
      return pad + (index / Math.max(1, closes.length - 1)) * (width - pad * 2);
    }
    function yPrice(value) {
      return pad + (1 - (value - min) / (max - min)) * priceH;
    }
    function line(values, color, mapY) {
      ctx.beginPath();
      var started = false;
      values.forEach(function (value, index) {
        if (typeof value !== 'number') { started = false; return; }
        var x = xAt(index);
        var y = mapY(value);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.strokeStyle = '#0a3';
    ctx.strokeRect(pad, pad, width - pad * 2, priceH);
    ctx.strokeRect(pad, rsiTop, width - pad * 2, rsiH);
    line(series.u, '#c90', yPrice);
    line(series.m, '#888', yPrice);
    line(series.l, '#c90', yPrice);
    line(closes, '#39ff14', yPrice);
    ctx.fillStyle = '#9f9';
    ctx.font = '11px Courier New, monospace';
    ctx.fillText(money(max), 4, pad + 10);
    ctx.fillText(money(min), 4, pad + priceH);
    function yRsi(value) {
      return rsiTop + (1 - value / 100) * rsiH;
    }
    ctx.setLineDash([3, 3]);
    [30, 70].forEach(function (level) {
      ctx.beginPath();
      ctx.moveTo(pad, yRsi(level));
      ctx.lineTo(width - pad, yRsi(level));
      ctx.strokeStyle = level === 30 ? '#ff4444' : '#39ff14';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(level), 4, yRsi(level) + 4);
    });
    ctx.setLineDash([]);
    line(series.r, '#7fdfff', yRsi);
    ctx.fillStyle = '#ffcc33';
    ctx.fillText('RSI(14)', pad, rsiTop - 2);
    ctx.fillText('Price + Bollinger 20, 2σ', pad, 14);
  }

  function openDetail(symbol) {
    var row = bySymbol(symbol) || {
      symbol: symbol,
      name: 'Pinned ticker',
      pinnedOnly: true,
      yahoo: 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbol),
      tradingview: 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol)
    };
    selected = symbol;
    var card = document.getElementById('detail');
    card.hidden = false;
    document.getElementById('detailTitle').textContent = symbol + (row.name ? ' — ' + row.name : '');
    var bits = [];
    if (row.price != null) bits.push('Last ' + money(row.price));
    if (row.rsi != null) bits.push('RSI ' + row.rsi.toFixed(1));
    if (row.score != null) bits.push('Bounce score ' + row.score);
    if (row.sma20) bits.push('SMA20 ' + money(row.sma20));
    if (row.sma50) bits.push('SMA50 ' + money(row.sma50));
    if (row.sma200) bits.push('SMA200 ' + money(row.sma200));
    document.getElementById('detailMeta').textContent = bits.join(' · ');
    document.getElementById('detailWhy').textContent = why(row);
    var links = document.getElementById('detailLinks');
    links.replaceChildren();
    var yahoo = document.createElement('a');
    yahoo.href = row.yahoo || ('https://finance.yahoo.com/quote/' + encodeURIComponent(symbol));
    yahoo.target = '_blank';
    yahoo.rel = 'noopener noreferrer';
    yahoo.textContent = 'Yahoo Finance';
    var tv = document.createElement('a');
    tv.href = row.tradingview || ('https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol));
    tv.target = '_blank';
    tv.rel = 'noopener noreferrer';
    tv.textContent = 'TradingView';
    links.append(yahoo, document.createTextNode(' · '), tv);
    var pin = watch[symbol] || {};
    document.getElementById('pinNote').value = pin.note || '';
    document.getElementById('pinTarget').value = pin.target ? String(pin.target) : '';
    document.getElementById('pinStatus').textContent = watch[symbol] ? 'Pinned on your watchlist.' : '';
    drawChart(row);
    renderTable();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderWatch() {
    var list = document.getElementById('watchList');
    var symbols = Object.keys(watch).sort();
    list.replaceChildren();
    symbols.forEach(function (symbol) {
      var pin = watch[symbol];
      var item = document.createElement('li');
      var button = el('button', symbol, 'btn');
      button.type = 'button';
      button.addEventListener('click', function () { openDetail(symbol); });
      item.appendChild(button);
      var note = pin.note ? pin.note : 'No note';
      if (pin.target) note += ' · target ' + money(pin.target);
      item.appendChild(el('span', note));
      list.appendChild(item);
    });
    if (!symbols.length) list.appendChild(el('li', 'No pins yet.'));
  }

  function paintTape() {
    var track = document.getElementById('tapeTrack');
    var bits = rows.slice().sort(function (a, b) { return a.rsi - b.rsi; }).slice(0, 24);
    if (!bits.length) bits = rows.slice(0, 12);
    function line() {
      var node = document.createElement('p');
      node.textContent = bits.map(function (row) {
        return row.symbol + ' ' + money(row.price) + ' ' + signed(row.dayChange) + ' RSI ' + row.rsi.toFixed(1);
      }).join('   ★   ');
      return node;
    }
    track.replaceChildren(line(), line());
  }

  function paintFresh() {
    var box = document.getElementById('fresh');
    box.textContent = rows.length
      ? 'Market data timestamp ' + localTime(fetchedAt) + '. ' + rows.length + ' names. Daily bars, not a live quote.'
      : 'The screener snapshot has not been fetched yet.';
  }

  function savePin(symbol, note, target) {
    if (!TICKER.test(symbol)) return false;
    if (Object.keys(watch).length >= 40 && !watch[symbol]) {
      document.getElementById('addStatus').textContent = 'The watchlist holds 40 tickers.';
      return false;
    }
    watch[symbol] = {
      note: String(note || '').replace(/[\r\n]/g, ' ').slice(0, 140),
      target: typeof target === 'number' && target > 0 && target <= 1000000 ? Math.round(target * 100) / 100 : null,
      updatedAt: Date.now()
    };
    writeWatch();
    renderWatch();
    pushCloud(symbol);
    return true;
  }

  function removePin(symbol) {
    delete watch[symbol];
    writeWatch();
    renderWatch();
    renderTable();
    if (member && uid && bootFirebase()) {
      firebase.database().ref('stocks/watchlist/' + uid + '/' + symbol).remove().catch(function () {});
    }
  }

  function pushCloud(symbol) {
    if (!member || !uid || !bootFirebase()) return;
    var pin = watch[symbol];
    if (!pin) return;
    var payload = { note: pin.note || '', updatedAt: firebase.database.ServerValue.TIMESTAMP };
    if (pin.target) payload.target = pin.target;
    firebase.database().ref('stocks/watchlist/' + uid + '/' + symbol).set(payload).then(function () {
      document.getElementById('pinStatus').textContent = 'Pinned and synced to your account.';
    }).catch(function () {
      document.getElementById('pinStatus').textContent = 'Pinned in this browser. The cloud copy needs the updated Firebase rules.';
    });
  }

  function applyCloud(value) {
    if (!value || typeof value !== 'object') return;
    var next = {};
    Object.keys(value).forEach(function (symbol) {
      if (!TICKER.test(symbol) || !value[symbol]) return;
      var pin = value[symbol];
      next[symbol] = {
        note: String(pin.note || '').slice(0, 140),
        target: typeof pin.target === 'number' ? pin.target : null,
        updatedAt: typeof pin.updatedAt === 'number' ? pin.updatedAt : 0
      };
    });
    if (!Object.keys(next).length && Object.keys(watch).length) return;
    watch = next;
    writeWatch();
    renderWatch();
    renderTable();
  }

  function watchAuth() {
    if (!bootFirebase() || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(function (user) {
      member = !!(user && user.email);
      uid = user ? user.uid : '';
      var lead = document.getElementById('watchLead');
      if (member) {
        var who = String(user.email).toLowerCase() === ownerEmail() ? 'Webmaster pins sync with the owner account.' : 'Signed-in pins sync to this account.';
        lead.textContent = who;
        firebase.database().ref('stocks/watchlist/' + uid).once('value').then(function (snap) {
          applyCloud(snap.val());
        }).catch(function () {});
      } else {
        lead.textContent = 'Pins stay in this browser. Sign in to sync them to your account.';
      }
    });
  }

  function loadSnapshot() {
    return fetch('oversold.json?t=' + Date.now(), { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('snapshot');
      return response.json();
    }).then(function (data) {
      rows = data && Array.isArray(data.stocks) ? data.stocks.filter(function (row) {
        return row && TICKER.test(row.symbol || '') && typeof row.rsi === 'number';
      }) : [];
      fetchedAt = data && data.fetchedAt || '';
      paintFresh();
      paintTape();
      renderTable();
      if (selected) openDetail(selected);
    }).catch(function () {
      document.getElementById('fresh').textContent = 'The saved screener could not be loaded. The last good snapshot stays on the server when a fetch fails.';
    });
  }

  document.getElementById('screen').addEventListener('change', renderTable);
  document.getElementById('sort').addEventListener('change', renderTable);
  document.getElementById('detailClose').addEventListener('click', function () {
    selected = '';
    document.getElementById('detail').hidden = true;
    renderTable();
  });
  document.getElementById('pinForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!selected) return;
    var target = document.getElementById('pinTarget').value.trim();
    var number = target === '' ? null : Number(target);
    if (savePin(selected, document.getElementById('pinNote').value, number)) {
      document.getElementById('pinStatus').textContent = member ? 'Saving the pin…' : 'Pinned in this browser.';
      renderTable();
    }
  });
  document.getElementById('pinRemove').addEventListener('click', function () {
    if (!selected) return;
    removePin(selected);
    document.getElementById('pinStatus').textContent = 'Removed from the watchlist.';
  });
  document.getElementById('addForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var symbol = document.getElementById('addTicker').value.trim().toUpperCase();
    var status = document.getElementById('addStatus');
    if (!TICKER.test(symbol)) {
      status.textContent = 'Use a ticker like RCL or BRK-B.';
      return;
    }
    if (savePin(symbol, '', null)) {
      status.textContent = symbol + ' is on the watchlist.';
      document.getElementById('addTicker').value = '';
      document.getElementById('screen').value = 'watch';
      renderTable();
      openDetail(symbol);
    }
  });
  window.addEventListener('resize', function () {
    if (selected) {
      var row = bySymbol(selected);
      if (row) drawChart(row);
    }
  });

  watch = readWatch();
  renderWatch();
  watchAuth();
  loadSnapshot();
  setInterval(function () {
    if (!document.hidden) loadSnapshot();
  }, 120000);
})();
