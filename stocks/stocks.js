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
  var researchShown = PAGE;
  var trackShown = PAGE;
  var trackHistory = { picks: [] };
  var market = null;
  var PROMOTED_DOLLAR = 20000000;
  var MIN_CUSHION = 5;
  var MAX_PULLBACK = -15;
  var SHOCK_PCT = -9;
  var SHOCK_LOOKBACK = 8;
  var MIN_SWING = 36;
  var MIN_CLOSED = 20;
  var ACCOUNT_KEY = 'mondosupreme.stocks.account';
  var pendingSwot = '';

  document.getElementById('yr').textContent = String(new Date().getFullYear());

  function syncVisibleChrome() {
    var vv = window.visualViewport;
    var top = 0;
    var bottom = 0;
    if (vv) {
      top = Math.max(0, Math.round(vv.offsetTop));
      bottom = Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height));
    }
    /* A large overlap is the software keyboard. The shell hides the tab bar for that.
       Keep it out of --vv-bottom so the toolbar inset is not applied twice. */
    var keyboard = 0;
    if (bottom > 80) {
      keyboard = bottom;
      top = 0;
      bottom = 0;
    }
    var root = document.documentElement;
    var cssPx = window.MONDO_PAGE && window.MONDO_PAGE.cssPx ? window.MONDO_PAGE.cssPx : function (n) { return n; };
    root.style.setProperty('--vv-top', cssPx(top) + 'px');
    root.style.setProperty('--vv-bottom', cssPx(bottom) + 'px');
    root.style.setProperty('--vv-keyboard', cssPx(keyboard) + 'px');
  }
  syncVisibleChrome();
  window.addEventListener('resize', syncVisibleChrome);
  window.addEventListener('orientationchange', syncVisibleChrome);
  window.addEventListener('pageshow', syncVisibleChrome);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisibleChrome);
    window.visualViewport.addEventListener('scroll', syncVisibleChrome);
  }

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

  function shockFromSeries(row) {
    if (!row) return false;
    if (row.shock) return true;
    if ((row.flags || []).indexOf('Falling knife') !== -1) return true;
    if (typeof row.dayChange === 'number' && row.dayChange <= SHOCK_PCT) return true;
    var closes = row.series && row.series.c;
    if (!closes || closes.length < 2) return false;
    var start = Math.max(1, closes.length - SHOCK_LOOKBACK);
    for (var i = start; i < closes.length; i++) {
      if (!(closes[i - 1] > 0)) continue;
      if ((closes[i] / closes[i - 1] - 1) * 100 <= SHOCK_PCT) return true;
    }
    return false;
  }
  function displayActionable(row) {
    if (!row || row.swingEligible !== true) return false;
    if (typeof row.swingScore !== 'number' || row.swingScore < MIN_SWING) return false;
    if (row.above200 !== true || row.sma200Rising === false) return false;
    if (typeof row.vsSma200 !== 'number' || row.vsSma200 < MIN_CUSHION) return false;
    if (typeof row.drop21 === 'number' && row.drop21 <= MAX_PULLBACK) return false;
    if (typeof row.avgDollarVolume !== 'number' || row.avgDollarVolume < PROMOTED_DOLLAR) return false;
    if (earningsSoon(row) || shockFromSeries(row) || row.planStyle === 'none') return false;
    if (typeof row.rewardRisk !== 'number' || row.rewardRisk < 2) return false;
    var signals = confirmingSignals(row);
    return signals.indexOf('Volume reversal') !== -1 && signals.length >= 2;
  }
  function bySwingScore(a, b) {
    var score = (b.swingScore || 0) - (a.swingScore || 0);
    if (score) return score;
    return a.symbol.localeCompare(b.symbol);
  }
  function actionableRows() {
    return rows.filter(displayActionable).sort(bySwingScore);
  }
  function visibleRows() {
    var list = actionableRows().slice(0, LIST_CAP);
    if (document.getElementById('sort').value === 'ticker') {
      list.sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
    }
    return list;
  }

  function badges(row) {
    var box = el('span', null, 'badge-row');
    (row.flags || []).slice(0, 2).forEach(function (flag) {
      box.appendChild(el('span', flag, 'qbadge is-caution'));
    });
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
    var value = typeof row.swingScore === 'number' ? row.swingScore : row.score;
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
      var flag = tradeFlag(row);
      if (flag) line.appendChild(el('span', flag.label, 'trade-flag is-' + flag.kind));
      cell.append(pinBtn, line);
      tr.appendChild(cell);
      if (window.MONDO_SWOT) {
        var swotSlot = document.createElement('div');
        swotSlot.className = 'swot-slot';
        cell.appendChild(swotSlot);
        window.MONDO_SWOT.mount(swotSlot, row.symbol, { stateKey: 'setup:' + row.symbol });
      }
      tr.addEventListener('click', function (event) {
        if (event.target.closest('.watch-btn') || event.target.closest('.swot-block')) return;
        openDetail(row.symbol);
      });
      tr.addEventListener('keydown', function (event) {
        if (event.target.closest('.watch-btn') || event.target.closest('.swot-block')) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(row.symbol);
        }
      });
      body.appendChild(tr);
    });
    var empty = document.getElementById('empty');
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = 'No stocks in this snapshot.';
    } else if (!list.length) {
      empty.hidden = false;
      empty.textContent = 'No name passes the swing rules on this pass. The research list below is not a set of swing candidates.';
    } else {
      empty.hidden = true;
    }
    document.getElementById('count').textContent = list.length
      ? 'Actionable setups: ' + list.length + '.'
      : '';
    paintTradeAlerts();
    renderResearch();
  }

  function fillWhy(row) {
    var box = document.getElementById('detailWhy');
    box.replaceChildren();
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
    var marks = badges(row);
    if (marks) box.appendChild(marks);
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
    box.appendChild(el('p', row.why || why(row), 'why-note'));
  }

  function ruleNotes(row) {
    var notes = [];
    var flags = row.flags || [];
    if (row.above200 === false || flags.indexOf('Below the 200-day') !== -1) {
      notes.push({ href: '#rule-1', text: 'Below the 200-day · Rule 1' });
    }
    if (row.shock || flags.indexOf('Falling knife') !== -1) {
      notes.push({ href: '#rule-1', text: 'Shock bar · not a pullback' });
    }
    if (flags.indexOf('Earnings within 7 days') !== -1) {
      notes.push({ href: '#rule-3', text: 'Earnings within 7 days · Rule 3' });
    }
    if (typeof row.rewardRisk === 'number' && row.rewardRisk < 2) {
      notes.push({ href: '#rule-5', text: 'Reward:risk under 2:1 · Rule 5' });
    }
    flags.forEach(function (flag) {
      if (flag === 'Below the 200-day' || flag === 'Earnings within 7 days' || flag === 'Falling knife') return;
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
  function closeDefinedZone(row) {
    if (!row || row.planStyle === 'limit' || row.planStyle === 'confirm') return false;
    return typeof row.price === 'number' && typeof row.entryHigh === 'number' && Math.abs(row.entryHigh - row.price) < 0.02;
  }
  function planState(row) {
    if (!row) return '';
    if (row.planStyle === 'none' || row.shock) return 'No plan after a shock bar';
    if (closeDefinedZone(row)) return 'Wait for a planned entry';
    var price = row.price;
    var low = row.entryLow;
    var high = row.entryHigh;
    var stop = row.stop;
    var target = row.target;
    if (typeof price !== 'number' || typeof low !== 'number' || typeof high !== 'number') return '';
    if (row.planStyle === 'confirm') {
      if (typeof stop === 'number' && price < stop) return 'Stop hit';
      if (typeof target === 'number' && price >= target) return 'Target hit';
      if (price + 0.0001 < high) return 'Wait for confirmation';
      return 'Confirmation price traded';
    }
    if (typeof stop === 'number' && price < stop) return 'Stop hit';
    if (typeof target === 'number' && price >= target) return 'Target hit';
    if (price > high) return 'Above the entry zone';
    if (price + 0.0001 < low) return 'Below the entry zone';
    return 'Inside the entry zone';
  }
  function tradeFlag(row) {
    var state = planState(row);
    if (state === 'Inside the entry zone') return { kind: 'buy', label: 'Entry zone' };
    if (state === 'Confirmation price traded') return { kind: 'buy', label: 'Confirmation' };
    if (state === 'Stop hit') return { kind: 'stop', label: 'Stop hit' };
    if (state === 'Target hit') return { kind: 'target', label: 'Target hit' };
    return null;
  }
  function flaggedNames() {
    var top = {};
    actionableRows().slice(0, LIST_CAP).forEach(function (row) { top[row.symbol] = true; });
    var names = [];
    rows.forEach(function (row) {
      if (!top[row.symbol] && !watch[row.symbol]) return;
      var flag = tradeFlag(row);
      if (!flag) return;
      names.push({ symbol: row.symbol, flag: flag, top: !!top[row.symbol] });
    });
    Object.keys(watch).forEach(function (symbol) {
      if (names.some(function (item) { return item.symbol === symbol; })) return;
      var row = bySymbol(symbol);
      if (!row) return;
      var flag = tradeFlag(row);
      if (flag) names.push({ symbol: symbol, flag: flag, top: false });
    });
    return names;
  }
  function paintTradeAlerts() {
    var box = document.getElementById('tradeAlerts');
    if (!box) return;
    var names = flaggedNames();
    if (!names.length) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    var groups = {};
    names.forEach(function (item) {
      var key = item.flag.label;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item.symbol);
    });
    var bits = Object.keys(groups).map(function (key) { return key + ': ' + groups[key].join(', '); });
    box.hidden = false;
    box.textContent = bits.join(' · ');
  }
  function verdict(row) {
    if (row.pinnedOnly) return 'This ticker is on your watchlist and was not in the latest scan.';
    var lead;
    if (displayActionable(row)) lead = 'Actionable swing setup.';
    else if (row.shock || shockFromSeries(row)) lead = 'Shock bar, not a pullback.';
    else lead = 'Research list only. Not a swing setup.';
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
    if (!state || state === 'No plan after a shock bar' || typeof stop !== 'number' || typeof target !== 'number' || typeof low !== 'number' || typeof high !== 'number') {
      box.appendChild(el('p', row.planNote || 'No entry, stop, and target for this ticker.', 'plan-missing'));
      paintSize(row);
      return;
    }
    var banner = el('p', state, 'plan-state');
    if (state === 'Inside the entry zone' || state === 'Confirmation price traded') banner.classList.add('is-in');
    else if (state === 'Stop hit') banner.classList.add('is-stop');
    else if (state === 'Target hit') banner.classList.add('is-target');
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
    ladder.setAttribute('aria-label', 'Last ' + money(price) + ', ' + state.toLowerCase() + '. Entry ' + money(low) + ' to ' + money(high) + '. Stop ' + money(stop) + '. Target ' + money(target) + '.');
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
    labels.appendChild(el('span', 'Stop ' + money(stop), 'is-stop'));
    labels.appendChild(el('span', 'Now ' + money(price)));
    labels.appendChild(el('span', 'Target ' + money(target), 'is-target'));
    ladder.append(track, labels);
    box.appendChild(ladder);
    var grid = el('div', null, 'plan-grid');
    var buy = el('div', null, 'plan-tile plan-buy');
    var entryLabel = row.planStyle === 'confirm' ? 'Confirmation' : (closeDefinedZone(row) ? 'Signal close' : 'Entry zone');
    buy.appendChild(el('span', entryLabel, 'plan-k'));
    buy.appendChild(el('strong', money(low) + (low === high ? '' : '–' + money(high)), 'plan-v'));
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
    paintSize(row);
  }
  function readAccount() {
    var raw = '';
    try { raw = localStorage.getItem(ACCOUNT_KEY) || ''; } catch (e) { raw = ''; }
    var value = Number(String(raw).replace(/[$,\s]/g, ''));
    return value > 0 && value < 1e12 ? value : null;
  }
  function paintSize(row) {
    var box = document.getElementById('sizeHelper');
    var out = document.getElementById('sizeOut');
    if (!box || !out) return;
    var entry = row && typeof row.entryHigh === 'number' ? row.entryHigh : null;
    var stop = row && typeof row.stop === 'number' ? row.stop : null;
    var planned = row && row.planStyle !== 'none' && !row.shock && !closeDefinedZone(row) && entry != null && stop != null && entry > stop;
    box.hidden = !planned;
    if (!planned) {
      out.textContent = '';
      return;
    }
    var account = readAccount();
    var risk = entry - stop;
    if (!(account > 0)) {
      out.textContent = 'Enter an account size to sketch the share count.';
      return;
    }
    var one = Math.floor((account * 0.01) / risk);
    var two = Math.floor((account * 0.02) / risk);
    if (one < 1 && two < 1) {
      out.textContent = 'The stop is ' + money(risk) + ' away. That is wider than 2% of this account, so the sketch is 0 shares.';
      return;
    }
    out.textContent = one + ' shares at 1% risk (' + money(account * 0.01) + '), ' + two + ' shares at 2% risk (' + money(account * 0.02) + '). Risk per share is ' + money(risk) + '.';
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
    var volumePass = signals.indexOf('Volume reversal') !== -1;
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
    if (displayActionable(row)) sentence += ' This is an actionable swing setup.';
    else sentence += ' Research list only, not a swing setup.';
    return sentence;
  }

  function chartCssHeight() {
    var vv = window.visualViewport;
    var visible = (vv && vv.height) || window.innerHeight || 800;
    var narrow = window.matchMedia('(max-width: 720px)').matches;
    if (!narrow && visible > 760) return 320;
    /* Short phones: the chart shares the open disclosure with the note and links.
       visualViewport excludes Firefox toolbars that safe-area insets do not. */
    var budget = Math.round(visible * 0.32);
    return Math.max(152, Math.min(narrow ? 200 : 320, budget));
  }
  function chartBox(canvas) {
    var details = canvas.parentElement;
    var width = details && details.clientWidth ? details.clientWidth : 0;
    if (width < 80) {
      var card = canvas.closest('.quote-card');
      if (card && card.clientWidth) {
        var cardStyle = window.getComputedStyle(card);
        width = card.clientWidth - (parseFloat(cardStyle.paddingLeft) || 0) - (parseFloat(cardStyle.paddingRight) || 0);
      }
    }
    var style = window.getComputedStyle(canvas);
    var borderX = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    var borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    return {
      width: Math.max(260, Math.round((width || 320) - borderX)),
      borderY: borderY,
      borderBox: style.boxSizing === 'border-box'
    };
  }
  function drawChart(row) {
    var canvas = document.getElementById('chart');
    var series = row.series;
    if (!series || !series.c || !series.c.length) {
      canvas.hidden = true;
      canvas.style.height = '';
      return;
    }
    canvas.hidden = false;
    var box = chartBox(canvas);
    var width = box.width;
    var height = chartCssHeight();
    var cssHeight = box.borderBox ? height + box.borderY : height;
    canvas.style.height = cssHeight + 'px';
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#020802';
    ctx.fillRect(0, 0, width, height);
    var compact = height <= 210;
    var padL = compact ? 58 : 28;
    var padR = 8;
    var padTop = compact ? 16 : 28;
    var padBot = compact ? 12 : 28;
    var gap = compact ? 16 : 16;
    var priceH = Math.round((height - padTop - padBot - gap) * (compact ? 0.7 : 0.68));
    var rsiTop = padTop + priceH + gap;
    var rsiH = height - rsiTop - padBot;
    var closes = series.c;
    var lows = series.l.filter(function (n) { return typeof n === 'number'; }).concat(closes);
    var highs = series.u.filter(function (n) { return typeof n === 'number'; }).concat(closes);
    var min = Math.min.apply(null, lows);
    var max = Math.max.apply(null, highs);
    if (!(max > min)) { max = min + 1; }
    function xAt(index) {
      return padL + (index / Math.max(1, closes.length - 1)) * (width - padL - padR);
    }
    function yPrice(value) {
      return padTop + (1 - (value - min) / (max - min)) * priceH;
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
    ctx.strokeRect(padL, padTop, width - padL - padR, priceH);
    ctx.strokeRect(padL, rsiTop, width - padL - padR, rsiH);
    line(series.u, '#c90', yPrice);
    line(series.m, '#888', yPrice);
    line(series.l, '#c90', yPrice);
    line(closes, '#39ff14', yPrice);
    ctx.fillStyle = '#9f9';
    ctx.font = '11px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
    ctx.fillText(money(max), 4, padTop + 10);
    ctx.fillText(money(min), 4, padTop + priceH);
    function yRsi(value) {
      return rsiTop + (1 - value / 100) * rsiH;
    }
    ctx.setLineDash([3, 3]);
    [30, 70].forEach(function (level) {
      ctx.beginPath();
      ctx.moveTo(padL, yRsi(level));
      ctx.lineTo(width - padR, yRsi(level));
      ctx.strokeStyle = level === 30 ? '#ff4444' : '#39ff14';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      if (compact) {
        ctx.textAlign = 'right';
        ctx.fillText(String(level), width - padR, yRsi(level) - 2);
        ctx.textAlign = 'left';
      } else ctx.fillText(String(level), 4, yRsi(level) + 4);
    });
    ctx.setLineDash([]);
    line(series.r, '#7fdfff', yRsi);
    ctx.fillStyle = '#ffcc33';
    if (compact) {
      ctx.textAlign = 'right';
      ctx.fillText('RSI(14)', width - padR, Math.max(12, rsiTop - 4));
      ctx.textAlign = 'left';
    } else ctx.fillText('RSI(14)', padL, rsiTop - 2);
    ctx.fillText('Price + Bollinger 20, 2σ', compact ? 4 : padL, compact ? 12 : 14);
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
    var swotSlot = document.getElementById('detailSwot');
    if (swotSlot && window.MONDO_SWOT) {
      if (pendingSwot === symbol) window.MONDO_SWOT.preferOpen('quote:' + symbol);
      window.MONDO_SWOT.mount(swotSlot, symbol, {
        id: 'swot-' + symbol,
        stateKey: 'quote:' + symbol,
        onReady: function (node) {
          if (pendingSwot !== symbol) return;
          pendingSwot = '';
          node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
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
    if (row.swingScore != null) moreBits.push('Swing score ' + row.swingScore);
    if (row.score != null) moreBits.push('Oversold score ' + row.score);
    if (moreBits.length) {
      var metrics = el('p', moreBits.join(' · '), 'more-metrics');
      var note = extra.querySelector('.why-note');
      if (note) extra.insertBefore(metrics, note);
      else extra.appendChild(metrics);
    }
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
    links.append(yahoo, tv);
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
      var button = el('button', symbol, 'btn watch-symbol');
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
      var row = bySymbol(symbol);
      var flag = row ? tradeFlag(row) : null;
      if (flag) now.appendChild(el('span', flag.label, 'trade-flag watch-flag is-' + flag.kind));
      meta.append(when);
      if (at) meta.append(at);
      meta.append(now);
      item.appendChild(meta);
      var remove = el('button', 'Remove', 'btn ghost watch-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + symbol);
      item.appendChild(remove);
      remove.addEventListener('click', function () {
        removePin(symbol);
        if (selected === symbol) {
          var status = document.getElementById('pinStatus');
          if (status) status.textContent = 'Removed from the watchlist.';
        }
      });
      list.appendChild(item);
    });
    if (!symbols.length) list.appendChild(el('li', 'No pins yet.', 'watch-empty'));
    var count = document.getElementById('watchCount');
    if (count) {
      count.hidden = symbols.length === 0 || page.length >= symbols.length;
      count.textContent = symbols.length ? 'Showing ' + page.length + ' of ' + symbols.length : '';
    }
    if (more) {
      more.hidden = symbols.length <= PAGE || page.length >= symbols.length;
      more.textContent = 'Show ' + PAGE + ' more';
    }
  }

  function paintTape() {
    var track = document.getElementById('tapeTrack');
    var bits = actionableRows().slice(0, 12);
    function line() {
      var node = document.createElement('p');
      if (!bits.length) {
        node.textContent = 'No actionable swing setup on this pass';
      } else {
        node.textContent = bits.map(function (row) {
          return row.symbol + ' ' + money(row.price) + ' ' + signed(row.dayChange) + ' swing ' + rowScore(row);
        }).join('   ·   ');
      }
      return node;
    }
    track.replaceChildren(line(), line());
  }

  function paintFresh() {
    var box = document.getElementById('fresh');
    box.removeAttribute('aria-busy');
    if (!rows.length) {
      box.textContent = 'The screener snapshot has not been fetched yet.';
      return;
    }
    var setups = actionableRows().length;
    var scope = rows.length + ' names on the oversold research list';
    if (pricedCount || universeCount) scope += ' from ' + (pricedCount || universeCount) + ' priced names';
    if (universeCount) scope += ' in a universe of ' + universeCount;
    scope += '. ' + setups + (setups === 1 ? ' passes' : ' pass') + ' the swing setup.';
    if (market && typeof market.vsSma200 === 'number') {
      scope += ' SPY is ' + signed(market.vsSma200) + ' versus its 200-day';
      if (typeof market.vsSma50 === 'number') scope += ' and ' + signed(market.vsSma50) + ' versus its 50-day';
      scope += '.';
    }
    box.textContent = 'Prices as of ' + pricesAsOf(fetchedAt) + '. ' + scope + ' Daily bars, not a live quote. Informational only, not financial advice.';
  }
  function pricesAsOf(iso) {
    var time = Date.parse(iso);
    if (!Number.isFinite(time)) return 'an unknown time';
    var clock = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(time));
    return clock + ' ET';
  }
  function outcomeLabel(pick) {
    if (pick.outcome === 'target hit') return 'Target';
    if (pick.outcome === 'stopped out') return 'Stopped';
    if (pick.outcome === 'never filled') return 'No fill';
    if (pick.outcome === 'time stop') return 'Time stop';
    if (pick.outcome === 'expired') return 'Expired';
    return 'Open';
  }
  function resultedPick(pick) {
    return pick.outcome === 'target hit' || pick.outcome === 'stopped out' || pick.outcome === 'expired' || pick.outcome === 'time stop';
  }
  function stillOpenPick(pick) {
    return !resultedPick(pick) && pick.outcome !== 'never filled';
  }
  function trackKind(label) {
    if (label === 'Fill' || label === 'Filled' || label === 'Entry') return 'entry';
    if (label === 'Stop') return 'stop';
    if (label === 'Target') return 'target';
    if (label === 'R:R') return 'metric';
    if (label === 'MFE') return 'gain';
    if (label === 'MAE') return 'loss';
    return '';
  }
  function pctTone(value) {
    if (typeof value !== 'number' || !isFinite(value) || value === 0) return '';
    return value > 0 ? 'is-up' : 'is-down';
  }
  function trackFact(label, value, wide, tone) {
    var kind = trackKind(label);
    var wrap = el('div', null, 'track-fact' + (wide ? ' is-wide' : '') + (kind ? ' is-' + kind : ''));
    wrap.appendChild(el('dt', label));
    wrap.appendChild(el('dd', value, tone || ''));
    return wrap;
  }
  function trackCount(label, count) {
    var item = el('li', null, 'track-count');
    item.appendChild(el('b', String(count)));
    item.appendChild(document.createTextNode(' ' + label));
    return item;
  }
  function outcomeClass(pick) {
    if (pick.outcome === 'target hit') return 'is-win';
    if (pick.outcome === 'stopped out') return 'is-stop';
    return 'is-open';
  }
  function renderTrack(history) {
    if (history) trackHistory = history;
    var summary = document.getElementById('trackSummary');
    var list = document.getElementById('trackList');
    var more = document.getElementById('trackMore');
    if (!summary || !list) return;
    var source = trackHistory && Array.isArray(trackHistory.picks) ? trackHistory.picks : [];
    var picks = source.slice();
    if (!picks.length) {
      summary.textContent = 'No tracked picks yet. The after-close scan records official setups that pass the swing rules.';
      list.replaceChildren();
      if (more) more.hidden = true;
      return;
    }
    var versions = {};
    picks.forEach(function (pick) {
      var version = pick.paramVersion || 'unversioned';
      if (!versions[version]) versions[version] = [];
      versions[version].push(pick);
    });
    var ids = Object.keys(versions).sort();
    var openCount = picks.filter(function (pick) { return pick.status === 'open'; }).length;
    summary.replaceChildren();
    summary.appendChild(el('p', openCount + ' still open. A win rate stays hidden until ' + MIN_CLOSED + ' closed trades in that version.', 'track-lead'));
    ids.forEach(function (version) {
      var group = versions[version];
      var closed = group.filter(resultedPick);
      var block = el('div', null, 'track-version');
      block.appendChild(el('h3', version, 'track-version-name'));
      var counts = el('ul', null, 'track-counts');
      counts.setAttribute('aria-label', 'Outcomes for ' + version);
      counts.append(
        trackCount('target', group.filter(function (pick) { return pick.outcome === 'target hit'; }).length),
        trackCount('stop', group.filter(function (pick) { return pick.outcome === 'stopped out'; }).length),
        trackCount('time stop', group.filter(function (pick) { return pick.outcome === 'time stop'; }).length),
        trackCount('expired', group.filter(function (pick) { return pick.outcome === 'expired'; }).length),
        trackCount('open', group.filter(stillOpenPick).length)
      );
      var noFill = group.filter(function (pick) { return pick.outcome === 'never filled'; }).length;
      if (noFill) counts.appendChild(trackCount('no fill', noFill));
      block.appendChild(counts);
      if (closed.length >= MIN_CLOSED) {
        var wins = closed.filter(function (pick) { return pick.outcome === 'target hit'; });
        var returns = closed.map(function (pick) { return pick.returnPct; }).filter(function (value) { return typeof value === 'number'; });
        var average = returns.length ? returns.reduce(function (sum, value) { return sum + value; }, 0) / returns.length : null;
        var rate = Math.round((wins.length / closed.length) * 100);
        var rateText = 'Target hit on ' + rate + '% of ' + closed.length + ' closed trades';
        if (average != null) rateText += ', average return ' + (average > 0 ? '+' : '') + average.toFixed(1) + '%';
        rateText += '.';
        block.appendChild(el('p', rateText, 'track-rate'));
      }
      summary.appendChild(block);
    });
    picks.sort(function (a, b) {
      return String(b.pickedOn || '').localeCompare(String(a.pickedOn || '')) || (a.rank || 0) - (b.rank || 0);
    });
    var page = picks.slice(0, trackShown);
    list.replaceChildren();
    page.forEach(function (pick) {
      var item = document.createElement('li');
      item.className = 'track-pick';
      var head = el('div', null, 'track-head');
      head.appendChild(el('span', outcomeLabel(pick), 'track-badge ' + outcomeClass(pick)));
      head.appendChild(el('span', pick.symbol || '', 'track-name'));
      if (pick.pickedOn) head.appendChild(el('span', pick.pickedOn, 'track-when'));
      head.appendChild(el('span', typeof pick.returnPct === 'number' ? signed(pick.returnPct) : '—', 'track-return' + (typeof pick.returnPct === 'number' && pick.returnPct ? (pick.returnPct > 0 ? ' is-up' : ' is-down') : '')));
      var facts = el('dl', null, 'track-facts');
      if (typeof pick.fillPrice === 'number') facts.appendChild(trackFact('Fill', money(pick.fillPrice) + (pick.filledOn ? ' · ' + pick.filledOn : ''), true));
      else if (typeof pick.priceAtPick === 'number') facts.appendChild(trackFact('Signal', money(pick.priceAtPick)));
      else if (pick.filledOn) facts.appendChild(trackFact('Filled', pick.filledOn));
      if (typeof pick.entryLow === 'number' && typeof pick.entryHigh === 'number') facts.appendChild(trackFact('Entry', money(pick.entryLow) + '–' + money(pick.entryHigh), true));
      if (typeof pick.stop === 'number') facts.appendChild(trackFact('Stop', money(pick.stop)));
      if (typeof pick.target === 'number') facts.appendChild(trackFact('Target', money(pick.target)));
      if (typeof pick.rewardRisk === 'number') facts.appendChild(trackFact('R:R', pick.rewardRisk.toFixed(1) + ':1'));
      if (typeof pick.daysHeld === 'number') facts.appendChild(trackFact('Days', String(pick.daysHeld)));
      if (typeof pick.mfePct === 'number') facts.appendChild(trackFact('MFE', signed(pick.mfePct), false, pctTone(pick.mfePct)));
      if (typeof pick.maePct === 'number') facts.appendChild(trackFact('MAE', signed(pick.maePct), false, pctTone(pick.maePct)));
      if (pick.paramVersion) facts.appendChild(trackFact('Version', pick.paramVersion, true));
      item.append(head, facts);
      var extra = [];
      if (typeof pick.fillPrice === 'number' && typeof pick.priceAtPick === 'number') extra.push('Signal close ' + money(pick.priceAtPick));
      if (pick.name && pick.name !== pick.symbol) extra.push(pick.name);
      if (pick.sector) extra.push(pick.sector);
      var marketNote = pick.market || {};
      if (typeof marketNote.vsSma200 === 'number') extra.push('SPY vs 200-day ' + signed(marketNote.vsSma200));
      if (pick.signals && pick.signals.length) extra.push(pick.signals.slice(0, 4).join(', '));
      if (extra.length) {
        var moreDetail = document.createElement('details');
        moreDetail.className = 'track-extra';
        var moreSummary = document.createElement('summary');
        moreSummary.textContent = 'Signals and notes';
        var moreBody = el('p', extra.join(' · '), 'track-detail');
        moreDetail.append(moreSummary, moreBody);
        item.appendChild(moreDetail);
      }
      if (pick.symbol && window.MONDO_SWOT) {
        var swotSlot = document.createElement('div');
        swotSlot.className = 'swot-slot';
        item.appendChild(swotSlot);
        window.MONDO_SWOT.mount(swotSlot, pick.symbol, {
          stateKey: 'track:' + (pick.id || pick.symbol)
        });
      }
      list.appendChild(item);
    });
    if (more) {
      more.hidden = page.length >= picks.length;
      more.textContent = 'Show ' + PAGE + ' more';
    }
  }
  function loadPicks() {
    return fetch('picks-history.json?t=' + Date.now(), { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('picks');
      return response.json();
    }).then(renderTrack, function () { renderTrack({ picks: [] }); });
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

  function regimeBlocksOfficial() {
    return !!(market && typeof market.vsSma200 === 'number' && market.vsSma200 < 0);
  }
  function swingPick() {
    if (regimeBlocksOfficial()) return null;
    return actionableRows()[0] || null;
  }
  function researchPool() {
    var taken = {};
    actionableRows().forEach(function (row) { taken[row.symbol] = true; });
    return rows.filter(function (row) { return row && !taken[row.symbol]; }).sort(function (a, b) {
      var shock = (shockFromSeries(a) ? 1 : 0) - (shockFromSeries(b) ? 1 : 0);
      if (shock) return shock;
      var trend = (b.above200 === true ? 1 : 0) - (a.above200 === true ? 1 : 0);
      if (trend) return trend;
      var dropA = typeof a.drop21 === 'number' ? a.drop21 : -100;
      var dropB = typeof b.drop21 === 'number' ? b.drop21 : -100;
      if (dropA !== dropB) return dropB - dropA;
      return a.symbol.localeCompare(b.symbol);
    });
  }
  function renderResearch() {
    var list = document.getElementById('researchRows');
    var note = document.getElementById('researchNote');
    var more = document.getElementById('researchMore');
    if (!list) return;
    var pool = researchPool();
    var page = pool.slice(0, researchShown);
    var countEl = document.getElementById('researchCount');
    if (countEl) {
      var countLabel = pool.length === 1 ? ' name' : ' names';
      countEl.textContent = pool.length + countLabel;
    }
    if (note) {
      note.textContent = pool.length
        ? pool.length + ' names on the oversold research list. These are not swing candidates.'
        : 'No extra research names in this snapshot.';
    }
    list.replaceChildren();
    page.forEach(function (row) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'research-row';
      button.appendChild(el('span', row.symbol, 'research-name'));
      var meta = el('span', null, 'research-meta');
      var bits = [row.price == null ? '—' : money(row.price)];
      if (typeof row.dayChange === 'number') bits.push(dayText(row.dayChange));
      bits.push(row.above200 === true ? 'above 200-day' : 'below 200-day');
      meta.textContent = bits.join(' · ');
      button.appendChild(meta);
      button.addEventListener('click', function () { openDetail(row.symbol); });
      item.appendChild(button);
      list.appendChild(item);
    });
    if (more) {
      more.hidden = page.length >= pool.length;
      more.textContent = 'Show ' + PAGE + ' more';
    }
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
    var empty = document.getElementById('swingEmpty');
    var button = document.getElementById('swingOpen');
    var row = swingPick();
    if (!card) return;
    card.hidden = false;
    if (!row) {
      if (button) button.hidden = true;
      var swingSwot = document.getElementById('swingSwot');
      if (swingSwot) swingSwot.replaceChildren();
      if (empty) {
        empty.hidden = false;
        empty.textContent = regimeBlocksOfficial()
          ? 'SPY is under its 200-day, so this pass does not name a top stock to watch.'
          : 'No name passes the swing rules on this pass.';
      }
      return;
    }
    if (empty) empty.hidden = true;
    if (button) button.hidden = false;
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
    var flag = tradeFlag(row);
    if (flag) chips.appendChild(el('span', flag.label, 'trade-flag is-' + flag.kind));
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
    var swingSwot = document.getElementById('swingSwot');
    if (swingSwot && window.MONDO_SWOT) {
      window.MONDO_SWOT.mount(swingSwot, row.symbol, { stateKey: 'swing:' + row.symbol });
    }
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
      market = data && data.market && typeof data.market === 'object' ? data.market : null;
      paintFresh();
      loadPicks();
      paintTape();
      paintSwing();
      retryPrices();
      renderWatch();
      renderTable();
      if (selected) openDetail(selected, false);
      else if (swotHashSymbol()) openSwotHash();
      else if (rows.length) {
        var first = visibleRows()[0];
        if (first) openDetail(first.symbol, false);
        else document.getElementById('detail').hidden = true;
      }
    }).catch(function () {
      var fresh = document.getElementById('fresh');
      fresh.removeAttribute('aria-busy');
      fresh.textContent = 'The screener did not load. ';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn';
      retry.textContent = 'Retry';
      retry.addEventListener('click', function () {
        fresh.textContent = 'Loading the screener…';
        fresh.setAttribute('aria-busy', 'true');
        loadSnapshot();
      });
      fresh.appendChild(retry);
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

  function swotHashSymbol() {
    var match = /^#swot-([A-Z]{1,5}(?:-[A-Z])?)$/.exec(location.hash || '');
    return match && TICKER.test(match[1]) ? match[1] : '';
  }
  function openSwotHash() {
    var symbol = swotHashSymbol();
    if (!symbol) return false;
    pendingSwot = symbol;
    openDetail(symbol, false);
    return true;
  }
  window.addEventListener('hashchange', openSwotHash);

  document.getElementById('swingOpen').addEventListener('click', function () {
    var symbol = document.getElementById('swingOpen').dataset.symbol;
    if (symbol) openDetail(symbol);
  });
  document.getElementById('sort').addEventListener('change', function () { renderTable(); });
  document.getElementById('watchMore').addEventListener('click', function () { watchShown += PAGE; renderWatch(); });
  var researchMore = document.getElementById('researchMore');
  if (researchMore) researchMore.addEventListener('click', function () { researchShown += PAGE; renderResearch(); });
  var trackMore = document.getElementById('trackMore');
  if (trackMore) trackMore.addEventListener('click', function () { trackShown += PAGE; renderTrack(trackHistory); });
  var accountInput = document.getElementById('accountSize');
  if (accountInput) {
    var savedAccount = '';
    try { savedAccount = localStorage.getItem(ACCOUNT_KEY) || ''; } catch (e) { savedAccount = ''; }
    if (savedAccount) accountInput.value = savedAccount;
    accountInput.addEventListener('input', function () {
      var raw = accountInput.value.replace(/[$,\s]/g, '');
      accountInput.removeAttribute('aria-invalid');
      if (raw === '') {
        try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) { /* private mode */ }
      } else if (/^\d+(\.\d{0,2})?$/.test(raw)) {
        try { localStorage.setItem(ACCOUNT_KEY, raw); } catch (e) { /* private mode */ }
      }
      if (selected) {
        var current = bySymbol(selected);
        if (current) paintSize(current);
      }
    });
    accountInput.addEventListener('blur', function () {
      var raw = accountInput.value.replace(/[$,\s]/g, '');
      var out = document.getElementById('sizeOut');
      if (raw !== '' && !/^\d+(\.\d+)?$/.test(raw)) {
        accountInput.setAttribute('aria-invalid', 'true');
        if (out) out.textContent = 'Use a dollar amount like 25000.';
        return;
      }
      if (selected) {
        var current = bySymbol(selected);
        if (current) paintSize(current);
      }
    });
  }
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
  function redrawOpenChart() {
    if (!selected) return;
    var row = bySymbol(selected);
    if (row) drawChart(row);
  }
  window.addEventListener('resize', redrawOpenChart);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', redrawOpenChart);
  var detailMore = document.getElementById('detailMore');
  if (detailMore) {
    detailMore.addEventListener('toggle', function () {
      if (detailMore.open) redrawOpenChart();
    });
  }

  function tonePaperStrip() {
    var meta = document.getElementById('paperMeta');
    if (!meta) return;
    var text = meta.textContent || '';
    if (meta.getAttribute('data-tone-src') === text) return;
    meta.setAttribute('data-tone-src', text);
    var lead = text.match(/^([+-]\$[0-9,]+\.\d{2})/);
    var closed = text.match(/closed ([+-]\$[0-9,]+\.\d{2})/);
    meta.replaceChildren();
    var cursor = 0;
    if (lead) {
      meta.appendChild(el('span', lead[1], lead[1].charAt(0) === '+' ? 'is-up' : 'is-down'));
      cursor = lead[1].length;
    }
    if (closed) {
      var at = text.indexOf(closed[0], cursor);
      if (at >= cursor) {
        meta.appendChild(document.createTextNode(text.slice(cursor, at + 'closed '.length)));
        meta.appendChild(el('span', closed[1], closed[1].charAt(0) === '+' ? 'is-up' : 'is-down'));
        cursor = at + closed[0].length;
      }
    }
    meta.appendChild(document.createTextNode(text.slice(cursor)));
  }
  function watchPaperStrip() {
    var meta = document.getElementById('paperMeta');
    if (!meta || meta.getAttribute('data-tone-watch') === '1') return;
    meta.setAttribute('data-tone-watch', '1');
    var painting = false;
    new MutationObserver(function () {
      if (painting) return;
      painting = true;
      tonePaperStrip();
      painting = false;
    }).observe(meta, { childList: true, characterData: true, subtree: true });
    tonePaperStrip();
  }

  watch = readWatch();
  renderWatch();
  watchAuth();
  watchPaperStrip();
  loadSnapshot();
  setInterval(function () {
    if (!document.hidden) loadSnapshot();
  }, 120000);
})();
