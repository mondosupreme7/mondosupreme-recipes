(function () {
  'use strict';

  var KEY = 'mondosupreme.stocks.v1';
  var TICKER = /^[A-Z]{1,5}(?:-[A-Z])?$/;
  var rows = [];
  var fetchedAt = '';
  var universeCount = 0;
  var pricedCount = 0;
  var watch = {};
  var selected = '';
  var uid = '';
  var member = false;
  var pendingPrice = Object.create(null);
  var removedPins = Object.create(null);
  var PAGE = 25;
  var WATCH_CAP = 100;
  var stockShown = PAGE;
  var watchShown = PAGE;

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
        updatedAt: pin.updatedAt || Date.now(),
        addedAt: typeof pin.addedAt === 'string' ? pin.addedAt : '',
        addedPrice: loggedPrice(pin.addedPrice)
      };
    });
    watch = clean;
    try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) { /* private mode */ }
  }

  function money(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function loggedPrice(value) {
    return typeof value === 'number' && isFinite(value) && value > 0 && value < 1000000
      ? Math.round(value * 100) / 100
      : null;
  }

  function priceNow(symbol) {
    var row = bySymbol(symbol);
    return loggedPrice(row && row.price);
  }

  function addedDateLabel(iso) {
    var time = Date.parse(iso || '');
    if (!Number.isFinite(time)) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(time));
  }

  function deltaText(value, suffix) {
    var abs = suffix ? Math.abs(value).toFixed(1) + suffix : money(Math.abs(value));
    if (value > 0) return '+' + abs;
    if (value < 0) return '−' + abs;
    return abs;
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

  function isAdminNow() {
  return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
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
    if (mode === 'swing') return !!(row.swingEligible && row.swingScore >= 20);
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
      if (sort === 'swing') return (b.swingScore || 0) - (a.swingScore || 0) || a.symbol.localeCompare(b.symbol);
      if (sort === 'rsi') return (a.rsi == null ? 999 : a.rsi) - (b.rsi == null ? 999 : b.rsi) || a.symbol.localeCompare(b.symbol);
      return (b.rankScore || 0) - (a.rankScore || 0) || a.symbol.localeCompare(b.symbol);
    });
    return list;
  }

  function badges(row) {
    var box = el('span', null, 'badge-row');
    if (row.flags && row.flags.length) box.appendChild(el('span', row.flags[0], 'qbadge is-caution'));
    if (row.strongBounce) box.appendChild(el('span', 'STRONG BOUNCE SETUP!', 'qbadge is-bounce'));
    if (typeof row.rsi === 'number' && row.rsi < 30) box.appendChild(el('span', 'RSI < 30!', 'qbadge is-hot'));
    else if (row.zone === 'watch') box.appendChild(el('span', 'WATCH / BOUNCE ZONE', 'qbadge is-bounce'));
    return box.childNodes.length ? box : null;
  }

  function numCell(value, digits, suffix, color) {
    var text = value == null || !isFinite(value) ? '—' : value.toFixed(digits) + (suffix || '');
    var node = el('td', text);
    if (color && typeof value === 'number' && value < 0) { node.className = 'num-down'; node.textContent = '▼ ' + text; }
    else if (color && typeof value === 'number' && value > 0) { node.className = 'num-up'; node.textContent = '▲ ' + text; }
    return node;
  }

  function rowScore(row) {
    var swingView = document.getElementById('sort').value === 'swing' || document.getElementById('screen').value === 'swing';
    var value = swingView ? row.swingScore : (row.rankScore != null ? row.rankScore : row.score);
    return value == null || !isFinite(value) ? '—' : String(value);
  }
  function dayText(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var magnitude = Math.abs(value).toFixed(1).replace(/\.0$/, '') + '%';
    if (value > 0) return '+' + magnitude;
    if (value < 0) return '−' + magnitude;
    return magnitude;
  }
  function renderTable() {
    var body = document.getElementById('rows');
    var list = visibleRows();
    var shown = list.slice(0, stockShown);
    var more = document.getElementById('stocksMore');
    body.replaceChildren();
    shown.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.className = 'is-compact' + (row.symbol === selected ? ' is-open' : '');
      tr.tabIndex = 0;
      var cell = document.createElement('td');
      cell.className = 'quote-row';
      var saved = !!watch[row.symbol];
      var pinBtn = el('button', saved ? 'Saved' : 'Watch', 'watch-btn' + (saved ? ' is-on' : ''));
      pinBtn.type = 'button';
      pinBtn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      pinBtn.setAttribute('aria-label', saved ? row.symbol + ' saved' : 'Watch ' + row.symbol);
      pinBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (watch[row.symbol]) {
          removePin(row.symbol);
          watchToast('Removed from watchlist');
        } else if (savePin(row.symbol, '', null)) {
          watchToast('Added to watchlist');
          renderTable();
        } else {
          watchToast(document.getElementById('addStatus').textContent || 'Could not add that ticker.');
        }
      });
      var line = document.createElement('div');
      line.className = 'quote-line';
      line.appendChild(el('span', row.symbol, 'tick'));
      line.appendChild(el('span', row.price == null ? '—' : money(row.price), 'quote-px'));
      var change = el('span', dayText(row.dayChange), 'quote-chg');
      if (typeof row.dayChange === 'number' && row.dayChange < 0) change.classList.add('num-down');
      else if (typeof row.dayChange === 'number' && row.dayChange > 0) change.classList.add('num-up');
      line.appendChild(change);
      line.appendChild(el('span', rowScore(row), 'quote-score'));
      cell.append(pinBtn, line);
      tr.appendChild(cell);
      tr.addEventListener('click', function (event) {
        if (event.target.closest('.watch-btn')) return;
        openDetail(row.symbol);
      });
      tr.addEventListener('keydown', function (event) {
        if (event.target.closest('.watch-btn')) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(row.symbol);
        }
      });
      body.appendChild(tr);
    });
    document.getElementById('empty').hidden = list.length !== 0;
    document.getElementById('count').textContent = list.length ? 'Showing ' + shown.length + ' of ' + list.length : '';
    if (more) {
      more.hidden = shown.length >= list.length;
      more.textContent = 'Show ' + PAGE + ' more';
    }
  }

  function fillWhy(row) {
    var box = document.getElementById('detailWhy');
    box.replaceChildren();
    box.appendChild(el('p', row.why || why(row)));
    var marks = badges(row);
    if (marks) box.appendChild(marks);
    if (row.chips) {
      var chips = el('div', null, 'why-chips');
      [['Value', row.chips.value], ['Setup', row.chips.setup], ['Risk', row.chips.risk]].forEach(function (pair) {
        if (!pair[1]) return;
        var chip = el('span', null, 'why-chip');
        chip.appendChild(el('b', pair[0]));
        chip.appendChild(document.createTextNode(pair[1]));
        chips.appendChild(chip);
      });
      if (chips.childNodes.length) box.appendChild(chips);
    }
    var notes = ruleNotes(row);
    if (notes.length) {
      var flags = el('div', null, 'why-flags');
      notes.forEach(function (note) {
        if (!note.href) {
          flags.appendChild(el('span', note.text, 'qbadge is-caution'));
          return;
        }
        var link = document.createElement('a');
        link.className = 'qbadge is-caution rule-chip';
        link.href = note.href;
        link.textContent = note.text;
        flags.appendChild(link);
      });
      box.appendChild(flags);
    }
  }

  function ruleNotes(row) {
    var notes = [];
    var flags = row.flags || [];
    if (row.above200 === false || flags.indexOf('Below the 200-day') !== -1) {
      notes.push({ href: '#rule-1', text: 'Below the 200-day · Rule 1' });
    }
    if (flags.indexOf('Earnings within 7 days') !== -1) {
      notes.push({ href: '#rule-3', text: 'Earnings within 7 days · Rule 3' });
    }
    if (typeof row.rewardRisk === 'number' && row.rewardRisk < 2) {
      notes.push({ href: '#rule-5', text: 'Reward:risk under 2:1 · Rule 5' });
    }
    flags.forEach(function (flag) {
      if (flag === 'Below the 200-day' || flag === 'Earnings within 7 days') return;
      notes.push({ href: '', text: flag });
    });
    return notes;
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
    ctx.font = '11px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
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

  function openDetail(symbol, scroll) {
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
    if (row.bbDistancePct != null) bits.push('Lower BB ' + (row.bbDistancePct > 0 ? '+' : '') + row.bbDistancePct.toFixed(1) + '%');
    if (row.vsSma200 != null) bits.push('vs 200d ' + (row.vsSma200 > 0 ? '+' : '') + row.vsSma200.toFixed(1) + '%');
    if (row.drop5 != null) bits.push('5-day ' + (row.drop5 > 0 ? '+' : '') + row.drop5.toFixed(1) + '%');
    if (row.drop21 != null) bits.push('1-month ' + (row.drop21 > 0 ? '+' : '') + row.drop21.toFixed(1) + '%');
    if (row.range52 != null) bits.push('52-wk ' + row.range52.toFixed(0) + '%');
    if (row.swingScore != null) bits.push('Swing bottom ' + row.swingScore);
    if (row.swingSignals && row.swingSignals.length) bits.push(row.swingSignals.join(', '));
    if (row.rankScore != null) bits.push('Rank ' + row.rankScore);
    if (row.score != null) bits.push('Bounce score ' + row.score);
    if (row.entryLow != null && row.entryHigh != null) bits.push('Entry zone ' + money(row.entryLow) + '–' + money(row.entryHigh));
    if (row.stop != null) bits.push('Stop ' + money(row.stop));
    if (row.target != null) bits.push('Target ' + money(row.target));
    if (row.rewardRisk != null) bits.push('Reward:risk ' + row.rewardRisk.toFixed(1) + ':1');
    if (row.sma20) bits.push('SMA20 ' + money(row.sma20));
    if (row.sma50) bits.push('SMA50 ' + money(row.sma50));
    if (row.sma200) bits.push('SMA200 ' + money(row.sma200));
    document.getElementById('detailMeta').textContent = bits.join(' · ');
    fillWhy(row);
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
    if (scroll !== false) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderWatch() {
    var list = document.getElementById('watchList');
    var symbols = Object.keys(watch).sort();
    var page = symbols.length > PAGE ? symbols.slice(0, watchShown) : symbols;
    var more = document.getElementById('watchMore');
    list.replaceChildren();
    page.forEach(function (symbol) {
      var pin = watch[symbol];
      var item = document.createElement('li');
      var button = el('button', symbol, 'btn');
      button.type = 'button';
      button.addEventListener('click', function () { openDetail(symbol); });
      item.appendChild(button);
      var meta = el('span', null, 'watch-meta');
      var when = el('span', null, 'watch-when');
      var addedWhen = pin.addedAt ? addedDateLabel(pin.addedAt) : '—';
      var addedPx = !pin.addedAt ? '—' : (pin.addedPrice == null ? 'price unavailable' : money(pin.addedPrice));
      when.textContent = addedWhen;
      if (pin.note) when.textContent += ' · ' + pin.note;
      if (pin.target) when.textContent += ' · target ' + money(pin.target);
      if (addedPx === 'price unavailable') when.textContent += ' · price unavailable';
      var at = addedPx === 'price unavailable' ? null : el('span', addedPx, 'watch-at');
      var now = el('span', null, 'watch-now');
      var current = priceNow(symbol);
      now.appendChild(document.createTextNode(current == null ? '—' : money(current) + ' '));
      var change = el('span', '—');
      if (typeof pin.addedPrice === 'number' && current != null) {
        var dollars = current - pin.addedPrice;
        var pct = pin.addedPrice ? (dollars / pin.addedPrice) * 100 : 0;
        change.textContent = deltaText(dollars) + ' ' + deltaText(pct, '%');
        change.className = dollars > 0 ? 'watch-up' : (dollars < 0 ? 'watch-down' : '');
      }
      now.appendChild(change);
      meta.append(when);
      if (at) meta.append(at);
      meta.append(now);
      item.appendChild(meta);
      list.appendChild(item);
    });
    if (!symbols.length) list.appendChild(el('li', 'No pins yet.'));
    var count = document.getElementById('watchCount');
    if (count) {
      count.hidden = symbols.length === 0;
      count.textContent = symbols.length ? 'Showing ' + page.length + ' of ' + symbols.length : '';
    }
    if (more) {
      more.hidden = symbols.length <= PAGE || page.length >= symbols.length;
      more.textContent = 'Show ' + PAGE + ' more';
    }
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
    if (!rows.length) {
      box.textContent = 'The screener snapshot has not been fetched yet.';
      return;
    }
    var scope = universeCount
      ? rows.length + ' swing candidates from ' + (pricedCount || universeCount) + ' priced names in a universe of ' + universeCount + '.'
      : rows.length + ' names.';
    box.textContent = 'Market data timestamp ' + localTime(fetchedAt) + '. ' + scope + ' Daily bars, not a live quote. Informational only, not financial advice.';
  }

  function savePin(symbol, note, target) {
    if (!TICKER.test(symbol)) return false;
    if (Object.keys(watch).length >= WATCH_CAP && !watch[symbol]) {
      document.getElementById('addStatus').textContent = 'The watchlist holds ' + WATCH_CAP + ' tickers.';
      return false;
    }
    var prior = watch[symbol];
    var fresh = !prior;
    var addedAt = prior && prior.addedAt ? prior.addedAt : '';
    var addedPrice = prior ? loggedPrice(prior.addedPrice) : null;
    if (fresh) {
      addedAt = new Date().toISOString();
      addedPrice = priceNow(symbol);
      if (addedPrice == null) pendingPrice[symbol] = rows.length ? 'once' : 'wait';
    }
    watch[symbol] = {
      note: String(note || '').replace(/[\r\n]/g, ' ').slice(0, 140),
      target: typeof target === 'number' && target > 0 && target <= 1000000 ? Math.round(target * 100) / 100 : null,
      updatedAt: Date.now(),
      addedAt: addedAt,
      addedPrice: addedPrice
    };
    writeWatch();
    renderWatch();
    pushCloud(symbol);
    return true;
  }

  function retryPrices() {
    var changed = false;
    Object.keys(pendingPrice).forEach(function (symbol) {
      var mode = pendingPrice[symbol];
      var pin = watch[symbol];
      if (!mode || !pin || !pin.addedAt || pin.addedPrice != null) {
        delete pendingPrice[symbol];
        return;
      }
      var price = priceNow(symbol);
      if (price != null) {
        pin.addedPrice = price;
        delete pendingPrice[symbol];
        changed = true;
        pushCloud(symbol);
        return;
      }
      if (mode === 'wait' && rows.length) pendingPrice[symbol] = 'once';
      else if (mode === 'once' && rows.length) delete pendingPrice[symbol];
    });
    if (changed) {
      writeWatch();
      renderWatch();
    }
  }

  function removePin(symbol) {
    removedPins[symbol] = Date.now();
    delete watch[symbol];
    writeWatch();
    renderWatch();
    renderTable();
    if (member && uid && bootFirebase()) {
      firebase.database().ref('stocks/watchlist/' + uid + '/' + symbol).remove().catch(function () {});
    }
  }

  function watchToast(message) {
    var node = document.getElementById('toast');
    if (!node) return;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(watchToast.timer);
    watchToast.timer = setTimeout(function () { node.classList.remove('show'); }, 2000);
  }
  function pushCloud(symbol) {
    var pin = watch[symbol];
    if (!pin) return;
    if (!member || !uid || !bootFirebase()) {
      if (member) watchToast('Signed in, but this pin stayed on this phone only.');
      return;
    }
    var payload = { note: pin.note || '', updatedAt: firebase.database.ServerValue.TIMESTAMP };
    if (pin.target) payload.target = pin.target;
    if (pin.addedAt) payload.addedAt = pin.addedAt;
    if (typeof pin.addedPrice === 'number') payload.addedPrice = pin.addedPrice;
    firebase.database().ref('stocks/watchlist/' + uid + '/' + symbol).set(payload).then(function () {
      var status = document.getElementById('pinStatus');
      if (status && selected === symbol) status.textContent = 'Pinned and synced to your account.';
    }).catch(function () {
      watchToast('Could not save the watchlist to your account.');
      var status = document.getElementById('pinStatus');
      if (status && selected === symbol) status.textContent = 'Pinned in this browser. The account copy did not update.';
    });
  }

  function pinStamp(pin) {
    return pin && typeof pin.updatedAt === 'number' ? pin.updatedAt : 0;
  }
  function addedStamp(pin) {
    if (!pin) return '';
    if (typeof pin.addedAt === 'string' && Number.isFinite(Date.parse(pin.addedAt))) return pin.addedAt;
    if (typeof pin.addedAt === 'number' && pin.addedAt > 0) return new Date(pin.addedAt).toISOString();
    return '';
  }
  function applyCloud(value) {
    if (!value || typeof value !== 'object') return;
    var merged = {};
    Object.keys(watch).forEach(function (symbol) {
      if (TICKER.test(symbol) && watch[symbol]) merged[symbol] = watch[symbol];
    });
    Object.keys(value).forEach(function (symbol) {
      if (!TICKER.test(symbol) || !value[symbol] || typeof value[symbol] !== 'object') return;
      if (removedPins[symbol] && !watch[symbol]) return;
      var pin = value[symbol];
      var prior = merged[symbol];
      var cloudAt = pinStamp(pin);
      var localAt = pinStamp(prior);
      var cloudNewer = !prior || cloudAt >= localAt;
      var cloudAdded = addedStamp(pin);
      var localAdded = prior ? addedStamp(prior) : '';
      var addedAt = cloudAdded && localAdded
        ? (Date.parse(cloudAdded) <= Date.parse(localAdded) ? cloudAdded : localAdded)
        : (cloudAdded || localAdded);
      var cloudPrice = loggedPrice(pin.addedPrice);
      var localPrice = prior ? loggedPrice(prior.addedPrice) : null;
      var addedPrice = cloudPrice == null ? localPrice : (localPrice == null ? cloudPrice : (addedAt && localAdded === addedAt ? localPrice : cloudPrice));
      merged[symbol] = {
        note: String((cloudNewer ? pin.note : (prior && prior.note)) || pin.note || (prior && prior.note) || '').slice(0, 140),
        target: cloudNewer
          ? (typeof pin.target === 'number' ? pin.target : (prior && typeof prior.target === 'number' ? prior.target : null))
          : (prior && typeof prior.target === 'number' ? prior.target : (typeof pin.target === 'number' ? pin.target : null)),
        updatedAt: Math.max(cloudAt, localAt),
        addedAt: addedAt,
        addedPrice: addedPrice
      };
    });
    var localSymbols = Object.keys(watch).filter(function (symbol) {
      return TICKER.test(symbol) && watch[symbol];
    });
    watch = merged;
    writeWatch();
    renderWatch();
    renderTable();
    localSymbols.forEach(function (symbol) { pushCloud(symbol); });
  }

  function watchAuth() {
    if (!bootFirebase() || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(function (user) {
      member = !!(user && user.email);
      uid = user ? user.uid : '';
      var lead = document.getElementById('watchLead');
      if (member) {
        var who = isAdminNow() ? 'Webmaster pins sync with this account.' : 'Signed-in pins sync to this account.';
        if (!watchAuth.ownerListen) { watchAuth.ownerListen = true; document.addEventListener('mondo-owner', function () { if (member && lead) lead.textContent = isAdminNow() ? 'Webmaster pins sync with this account.' : 'Signed-in pins sync to this account.'; }); }
        lead.textContent = who;
        var current = uid;
        firebase.database().ref('stocks/watchlist/' + current).once('value').then(function (snap) {
          if (uid !== current || !member) return;
          applyCloud(snap.val());
        }).catch(function () {});
      } else {
        lead.textContent = 'Pins stay in this browser. Sign in to sync them to your account.';
      }
    });
  }

  function swingPick() {
    var list = rows.filter(function (row) {
      return row && row.swingEligible && typeof row.swingScore === 'number' && row.swingScore >= 20 && typeof row.price === 'number';
    });
    list.sort(function (a, b) {
      return (b.swingScore || 0) - (a.swingScore || 0) || a.symbol.localeCompare(b.symbol);
    });
    return list[0] || null;
  }

  function shortSwingName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim()
      .replace(/\s+\(The$/i, '')
      .replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|LLC)\.?$/i, '')
      .replace(/,\s*$/, '')
      .trim();
  }

  function paintSwing() {
    var card = document.getElementById('swingWatch');
    var row = swingPick();
    if (!card) return;
    if (!row) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    var company = shortSwingName(row.name);
    document.getElementById('swingSymbol').textContent = row.symbol + (company ? ' ' + company : '');
    document.getElementById('swingPrice').textContent = money(row.price);
    var change = document.getElementById('swingChange');
    if (typeof row.dayChange === 'number') {
      var magnitude = Math.abs(row.dayChange).toFixed(1).replace(/\.0$/, '') + '%';
      change.textContent = row.dayChange > 0 ? '+' + magnitude : (row.dayChange < 0 ? '−' + magnitude : magnitude);
      change.className = 'swing-change ' + (row.dayChange < 0 ? 'num-down' : (row.dayChange > 0 ? 'num-up' : ''));
    } else {
      change.textContent = '';
      change.className = 'swing-change';
    }
    document.getElementById('swingScore').textContent = String(row.swingScore).replace(/\.0$/, '');
    var chips = document.getElementById('swingChips');
    chips.replaceChildren();
    (row.swingSignals || []).forEach(function (label) {
      chips.appendChild(el('span', label, 'swing-chip'));
    });
    var button = document.getElementById('swingOpen');
    button.dataset.symbol = row.symbol;
    button.setAttribute('aria-label', 'Top stock to watch ' + row.symbol + ', swing bottom score ' + row.swingScore);
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
      universeCount = data && data.universeCount || 0;
      pricedCount = data && data.priced || 0;
      paintFresh();
      paintTape();
      paintSwing();
      retryPrices();
      renderWatch();
      renderTable();
      if (selected) openDetail(selected, false);
      else if (rows.length) {
        var first = visibleRows()[0];
        if (first) openDetail(first.symbol, false);
      }
    }).catch(function () {
      document.getElementById('fresh').textContent = 'The saved screener could not be loaded. The last good snapshot stays on the server when a fetch fails.';
    });
  }

  var rulesCard = document.getElementById('swingRules');
  var rulesWide = window.matchMedia('(min-width: 960px)');
  function openRulesOnDesktop() {
    if (rulesWide.matches && rulesCard) rulesCard.open = true;
  }
  openRulesOnDesktop();
  if (rulesWide.addEventListener) rulesWide.addEventListener('change', openRulesOnDesktop);
  document.getElementById('detailWhy').addEventListener('click', function (event) {
    var link = event.target.closest ? event.target.closest('a.rule-chip') : null;
    if (!link || !rulesCard) return;
    rulesCard.open = true;
  });

  document.getElementById('swingOpen').addEventListener('click', function () {
    var symbol = document.getElementById('swingOpen').dataset.symbol;
    if (symbol) openDetail(symbol);
  });
  document.getElementById('screen').addEventListener('change', function () { stockShown = PAGE; renderTable(); });
  document.getElementById('sort').addEventListener('change', function () { stockShown = PAGE; renderTable(); });
  document.getElementById('stocksMore').addEventListener('click', function () { stockShown += PAGE; renderTable(); });
  document.getElementById('watchMore').addEventListener('click', function () { watchShown += PAGE; renderWatch(); });
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
      status.textContent = 'Use a ticker like AAPL or BRK-B.';
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
