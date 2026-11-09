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
  var LIST_CAP = 5;
  var WATCH_CAP = 100;
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

  function isSwingPick(row) {
    return !!(row && row.swingEligible && typeof row.swingScore === 'number' && row.swingScore >= 20);
  }
  function bestScore(row) {
    if (typeof row.rankScore === 'number') return row.rankScore;
    if (typeof row.score === 'number') return row.score;
    return 0;
  }
  function byBestScore(a, b) {
    var swing = (isSwingPick(b) ? 1 : 0) - (isSwingPick(a) ? 1 : 0);
    if (swing) return swing;
    var score = bestScore(b) - bestScore(a);
    if (score) return score;
    return a.symbol.localeCompare(b.symbol);
  }
  function visibleRows() {
    var list = rows.slice().sort(byBestScore).slice(0, LIST_CAP);
    if (document.getElementById('sort').value === 'ticker') {
      list.sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
    }
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
    var value = typeof row.rankScore === 'number' ? row.rankScore : row.score;
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
    var shown = list;
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
    document.getElementById('count').textContent = list.length ? 'Top ' + list.length : '';
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

  var SWING_CONTEXT = { 'Near 52w low': 1, 'Pullback from high': 1, 'Uptrend pullback': 1 };
  function confirmingSignals(row) {
    return (row.swingSignals || []).filter(function (label) { return !SWING_CONTEXT[label]; });
  }
  function fundamentalsKnown(row) {
    var value = row.chips && row.chips.value;
    if (!value) return false;
    return value.indexOf('missing') === -1 && value.indexOf('Fundamentals sheet') === -1;
  }
  function earningsSoon(row) {
    return (row.flags || []).indexOf('Earnings within 7 days') !== -1;
  }
  function planState(row) {
    var price = row.price;
    var low = row.entryLow;
    var high = row.entryHigh;
    var stop = row.stop;
    if (typeof price !== 'number' || typeof low !== 'number' || typeof high !== 'number') return '';
    if (typeof stop === 'number' && price < stop) return 'Below stop';
    if (price > high) return 'Above buy zone — wait';
    if (price + 0.0001 < low) return 'Below buy zone';
    return 'In buy zone';
  }
  function verdict(row) {
    if (row.pinnedOnly) return 'This ticker is on your watchlist and was not in the latest scan.';
    var lead;
    if (row.swingEligible && typeof row.swingScore === 'number' && row.swingScore >= 20) lead = 'Swing-bottom setup.';
    else if (row.above200 === false) lead = 'Not a setup yet.';
    else if (row.above200 && ((typeof row.drop5 === 'number' && row.drop5 < 0) || (typeof row.vsSma20 === 'number' && row.vsSma20 < 0))) lead = 'Pullback, not a full swing-bottom setup yet.';
    else lead = 'Not a setup yet.';
    var bits = [];
    if (row.above200 === true && typeof row.vsSma200 === 'number') bits.push(Math.abs(row.vsSma200).toFixed(1).replace(/\.0$/, '') + '% above the 200-day');
    else if (row.above200 === false && typeof row.vsSma200 === 'number') bits.push(Math.abs(row.vsSma200).toFixed(1).replace(/\.0$/, '') + '% under the 200-day');
    else if (row.above200 === false) bits.push('under the 200-day');
    var signals = confirmingSignals(row);
    if (signals.length) bits.push(signals.slice(0, 3).join(', '));
    if (earningsSoon(row)) bits.push('earnings inside 7 days');
    var sentence = lead;
    if (bits.length) sentence += ' ' + bits.join('; ') + '.';
    if (typeof row.rewardRisk === 'number') {
      var ratio = row.rewardRisk.toFixed(1).replace(/\.0$/, '');
      sentence += ' Reward to risk is ' + ratio + ':1' + (row.rewardRisk < 2 ? ', under 2:1' : '') + '.';
    }
    return sentence;
  }
  function factRow(state, label, detail) {
    var li = el('li', null, 'fact-row');
    var mark = state === true ? 'Pass' : state === false ? 'Fail' : '—';
    var klass = state === true ? 'is-pass' : state === false ? 'is-fail' : 'is-na';
    li.appendChild(el('span', mark, 'fact-mark ' + klass));
    var text = el('span', null, 'fact-text');
    text.appendChild(el('b', label));
    if (detail) text.appendChild(document.createTextNode(' ' + detail));
    li.appendChild(text);
    return li;
  }
  function factBlock(title, rows) {
    var block = el('section', null, 'stat-block');
    block.appendChild(el('h3', title));
    var list = el('ul', null, 'fact-list');
    rows.forEach(function (row) { if (row) list.appendChild(row); });
    block.appendChild(list);
    return block;
  }
  function paintPlan(row) {
    var box = document.getElementById('detailPlan');
    box.replaceChildren();
    var state = planState(row);
    var low = row.entryLow;
    var high = row.entryHigh;
    var stop = row.stop;
    var target = row.target;
    var price = row.price;
    if (!state || typeof stop !== 'number' || typeof target !== 'number') {
      box.appendChild(el('p', 'This snapshot has no entry, stop, and target for this ticker.', 'plan-missing'));
      return;
    }
    var banner = el('p', state, 'plan-state');
    if (state === 'In buy zone') banner.classList.add('is-in');
    else if (state === 'Below stop') banner.classList.add('is-stop');
    else banner.classList.add('is-wait');
    box.appendChild(banner);
    var spanMin = Math.min(stop, price, low);
    var spanMax = Math.max(target, price, high);
    var pad = (spanMax - spanMin) * 0.06 || 1;
    spanMin -= pad;
    spanMax += pad;
    function at(value) {
      return Math.max(0, Math.min(100, ((value - spanMin) / (spanMax - spanMin)) * 100));
    }
    var ladder = el('div', null, 'ladder');
    ladder.setAttribute('role', 'img');
    ladder.setAttribute('aria-label', 'Last ' + money(price) + ', ' + state.toLowerCase() + '. Buy zone ' + money(low) + ' to ' + money(high) + '. Stop ' + money(stop) + '. Target ' + money(target) + '.');
    var track = el('div', null, 'ladder-track');
    var zone = el('span', null, 'ladder-zone');
    var zoneLeft = at(Math.min(low, high));
    var zoneRight = at(Math.max(low, high));
    zone.style.left = zoneLeft + '%';
    zone.style.width = Math.max(1.5, zoneRight - zoneLeft) + '%';
    var stopMark = el('span', null, 'ladder-stop');
    stopMark.style.left = at(stop) + '%';
    var targetMark = el('span', null, 'ladder-target');
    targetMark.style.left = at(target) + '%';
    var now = el('span', null, 'ladder-now');
    now.style.left = at(price) + '%';
    track.append(zone, stopMark, targetMark, now);
    var labels = el('div', null, 'ladder-labels');
    labels.appendChild(el('span', 'Stop ' + money(stop)));
    labels.appendChild(el('span', 'Now ' + money(price)));
    labels.appendChild(el('span', 'Target ' + money(target)));
    ladder.append(track, labels);
    box.appendChild(ladder);
    var grid = el('div', null, 'plan-grid');
    var buy = el('div', null, 'plan-tile plan-buy');
    buy.appendChild(el('span', 'Buy zone', 'plan-k'));
    buy.appendChild(el('strong', money(low) + '–' + money(high), 'plan-v'));
    var stopTile = el('div', null, 'plan-tile plan-stop');
    stopTile.appendChild(el('span', 'Stop', 'plan-k'));
    stopTile.appendChild(el('strong', money(stop), 'plan-v'));
    stopTile.appendChild(el('span', 'Sell if it breaks', 'plan-hint'));
    var goal = el('div', null, 'plan-tile plan-target');
    goal.appendChild(el('span', 'Target', 'plan-k'));
    var goalText = money(target);
    if (row.targetLabel) goalText += ' · ' + row.targetLabel;
    if (typeof row.target2 === 'number' && row.target2 > target) goalText += ' · next ' + money(row.target2);
    goal.appendChild(el('strong', goalText, 'plan-v'));
    var reward = el('div', null, 'plan-tile plan-rr' + (typeof row.rewardRisk === 'number' && row.rewardRisk < 2 ? ' is-fail' : ''));
    reward.appendChild(el('span', 'Reward:risk', 'plan-k'));
    reward.appendChild(el('strong', typeof row.rewardRisk === 'number' ? row.rewardRisk.toFixed(1).replace(/\.0$/, '') + ':1' : '—', 'plan-v'));
    grid.append(buy, stopTile, goal, reward);
    box.appendChild(grid);
  }
  function paintFacts(row) {
    var box = document.getElementById('detailFacts');
    box.replaceChildren();
    if (row.pinnedOnly) return;
    var signals = confirmingSignals(row);
    var known = fundamentalsKnown(row);
    var rules = el('div', null, 'rule-strip');
    [
      ['Rule 1', row.above200 === true, 'Trend'],
      ['Rule 2', signals.length >= 2, 'Setup'],
      ['Rule 3', earningsSoon(row) ? false : (known ? true : null), 'Earnings'],
      ['Rule 5', typeof row.rewardRisk === 'number' ? row.rewardRisk >= 2 : null, '2:1']
    ].forEach(function (item) {
      var pill = el('span', item[0] + ' ' + (item[1] === true ? 'Pass' : item[1] === false ? 'Fail' : '—'), 'rule-pill ' + (item[1] === true ? 'is-pass' : item[1] === false ? 'is-fail' : 'is-na'));
      pill.title = item[2];
      rules.appendChild(pill);
    });
    box.appendChild(rules);
    var trend = [
      factRow(row.above200 === true, '200-day', row.above200 === true ? 'Above ' + (typeof row.vsSma200 === 'number' ? pctSigned(row.vsSma200) : '') : 'Below ' + (typeof row.vsSma200 === 'number' ? pctSigned(row.vsSma200) : '')),
      typeof row.vsSma50 === 'number' ? factRow(row.above200 === true && row.vsSma50 < 0, '50-day', (row.vsSma50 < 0 ? 'Pullback ' : 'Above ') + pctSigned(row.vsSma50)) : null,
      typeof row.drop5 === 'number' ? factRow(null, '5-day', pctSigned(row.drop5)) : null,
      typeof row.drop21 === 'number' ? factRow(null, '1-month', pctSigned(row.drop21)) : null
    ];
    var momentum = [
      typeof row.rsi === 'number' ? factRow(row.rsi <= 40, 'RSI-14', row.rsi.toFixed(1)) : null,
      factRow(!!(row.uptick || row.hammer || signals.indexOf('RSI turning up') !== -1), 'Turn', row.uptick ? 'Last close turned up' : (row.hammer ? 'Hammer' : 'Last close did not turn up')),
      factRow(signals.length >= 2, 'Signals', signals.length ? signals.join(', ') : 'No confirming signal')
    ];
    var volumePass = signals.indexOf('Volume reversal') !== -1 || (typeof row.volumeRatio === 'number' && row.volumeRatio >= 1);
    var volume = [
      typeof row.volumeRatio === 'number' ? factRow(volumePass, 'Volume', row.volumeRatio.toFixed(1).replace(/\.0$/, '') + '× the prior 20 sessions') : factRow(null, 'Volume', 'Not in this snapshot')
    ];
    var earnState = earningsSoon(row) ? false : (known ? true : null);
    var earnDetail = earningsSoon(row) ? 'Inside 7 days' : (known ? 'Not inside 7 days' : 'Date not in this pass');
    var fundRows = [factRow(earnState, 'Earnings', earnDetail)];
    if (row.chips && row.chips.value) fundRows.push(factRow(null, 'Sheet', row.chips.value));
    (row.flags || []).forEach(function (flag) {
      if (flag === 'Earnings within 7 days' || flag === 'Below the 200-day') return;
      fundRows.push(factRow(false, 'Flag', flag));
    });
    box.appendChild(factBlock('Trend', trend));
    box.appendChild(factBlock('Momentum', momentum));
    box.appendChild(factBlock('Volume', volume));
    box.appendChild(factBlock('Fundamentals', fundRows));
  }
  function pctSigned(value) {
    var magnitude = Math.abs(value).toFixed(1).replace(/\.0$/, '') + '%';
    if (value > 0) return '+' + magnitude;
    if (value < 0) return '−' + magnitude;
    return magnitude;
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
    document.getElementById('detailTitle').textContent = symbol;
    document.getElementById('detailSub').textContent = row.name && row.name !== symbol ? row.name : '';
    var priceLine = document.getElementById('detailPrice');
    priceLine.replaceChildren();
    priceLine.appendChild(el('span', row.price == null ? '—' : money(row.price), 'quote-last'));
    if (typeof row.dayChange === 'number') {
      var change = el('span', dayText(row.dayChange), 'quote-day');
      if (row.dayChange > 0) change.classList.add('num-up');
      else if (row.dayChange < 0) change.classList.add('num-down');
      priceLine.appendChild(change);
    }
    document.getElementById('detailVerdict').textContent = verdict(row);
    paintPlan(row);
    paintFacts(row);
    document.getElementById('detailMore').open = false;
    fillWhy(row);
    var extra = document.getElementById('detailWhy');
    var moreBits = [];
    if (row.sma20) moreBits.push('SMA20 ' + money(row.sma20));
    if (row.sma50) moreBits.push('SMA50 ' + money(row.sma50));
    if (row.sma200) moreBits.push('SMA200 ' + money(row.sma200));
    if (row.bbDistancePct != null) moreBits.push('Lower BB ' + (row.bbDistancePct > 0 ? '+' : '') + row.bbDistancePct.toFixed(1) + '%');
    if (row.range52 != null) moreBits.push('52-wk ' + row.range52.toFixed(0) + '%');
    if (row.swingScore != null) moreBits.push('Swing bottom ' + row.swingScore);
    if (row.rankScore != null) moreBits.push('Rank ' + row.rankScore);
    if (row.score != null) moreBits.push('Bounce score ' + row.score);
    if (moreBits.length) extra.appendChild(el('p', moreBits.join(' · '), 'more-metrics'));
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
      return row && typeof row.price === 'number';
    }).sort(byBestScore);
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
    document.getElementById('swingScore').textContent = rowScore(row);
    var chips = document.getElementById('swingChips');
    chips.replaceChildren();
    (row.swingSignals || []).slice(0, 3).forEach(function (label) {
      chips.appendChild(el('span', label, 'swing-chip'));
    });
    var summary = document.getElementById('swingVerdict');
    if (summary) {
      var text = verdict(row);
      var cut = text.indexOf('. ');
      summary.textContent = cut === -1 ? text : text.slice(0, cut + 1);
    }
    var button = document.getElementById('swingOpen');
    button.dataset.symbol = row.symbol;
    button.setAttribute('aria-label', 'Top stock to watch ' + row.symbol + ', best score ' + rowScore(row));
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
  document.getElementById('sort').addEventListener('change', function () { renderTable(); });
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
