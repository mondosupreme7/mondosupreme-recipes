/* Public paper-book view. Reads stocks/paper/ledger.json. Does not write the ledger. */
(function () {
  'use strict';

  var ET = 'America/New_York';
  var dayFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  var whenFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  var TERMINAL = { filled: 1, partial: 1, canceled: 1, cancelled: 1, expired: 1, rejected: 1, closed: 1 };

  function num(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && isFinite(Number(value))) return Number(value);
    return null;
  }

  function money(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (value < 0 ? '-$' : '$') + body;
  }

  function signedMoney(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    if (value > 0) return '+' + money(value);
    return money(value);
  }

  function signedPct(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    if (value > 0) return '+' + body;
    if (value < 0) return '-' + body;
    return body;
  }

  function plainPct(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  function formatDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return '';
    /* 16:00 UTC is still the same calendar date in Eastern time. */
    return dayFormat.format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 16, 0, 0)));
  }

  function formatWhen(value) {
    if (!value) return '—';
    var text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDay(text);
    var time = Date.parse(text);
    if (!isFinite(time)) return text;
    return whenFormat.format(new Date(time));
  }

  function sharesLabel(value) {
    var count = num(value);
    if (count == null) return '—';
    var text = count.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return text + (count === 1 ? ' share' : ' shares');
  }

  function sideLabel(value) {
    var side = String(value || 'buy').toLowerCase();
    if (side === 'buy' || side === 'long') return 'Buy';
    if (side === 'sell') return 'Sell';
    if (side === 'short') return 'Short';
    if (side === 'cover') return 'Cover';
    return side.charAt(0).toUpperCase() + side.slice(1);
  }

  function sideDown(value) {
    var side = String(value || 'buy').toLowerCase();
    return side === 'sell' || side === 'short';
  }

  function rangeText(low, high, price) {
    if (low != null && high != null) return money(low) + '\u2013' + money(high);
    if (price != null) return money(price);
    return '—';
  }

  function isWorking(order) {
    if (!order || typeof order !== 'object') return false;
    if (num(order.fillPrice) != null || order.filledAt || order.filled === true) return false;
    var status = String(order.status || 'working').toLowerCase();
    return !TERMINAL[status];
  }

  function workingLabel(order) {
    var status = String(order.status || 'working').toLowerCase();
    if (!status || status === 'working' || status === 'open' || status === 'pending' || status === 'unfilled' || status === 'live' || status === 'new') {
      return 'Working · unfilled';
    }
    return 'Unfilled · ' + status;
  }

  function recordLabel(order) {
    if (isWorking(order)) return workingLabel(order);
    var status = String(order.status || '').toLowerCase();
    if (status === 'partial') return 'Partial fill';
    if (status === 'canceled' || status === 'cancelled') return 'Canceled · not a fill';
    if (status === 'expired') return 'Expired · not a fill';
    if (status === 'rejected') return 'Rejected · not a fill';
    if (status === 'filled' || num(order.fillPrice) != null || order.filledAt) return 'Filled';
    return status || 'Recorded';
  }

  function orderLog(book) {
    var list = [];
    if (Array.isArray(book.workingOrders)) list = list.concat(book.workingOrders);
    if (Array.isArray(book.orders)) list = list.concat(book.orders);
    var seen = Object.create(null);
    return list.filter(function (order) {
      if (!order || typeof order !== 'object') return false;
      var key = [order.id || '', order.placedAt || order.at || '', order.status || '', order.symbol || '', order.limitPrice || ''].join('|');
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    });
  }

  function groupOrders(list) {
    var groups = [];
    var index = Object.create(null);
    list.forEach(function (order, i) {
      var id = order.id ? String(order.id) : String(order.symbol || 'order') + '@' + String(order.placedAt || order.at || i);
      if (index[id] == null) {
        index[id] = groups.length;
        groups.push({ id: id, records: [order] });
      } else groups[index[id]].records.push(order);
    });
    return groups;
  }

  function tradePnl(trade) {
    var direct = num(trade.realizedPnlUsd);
    if (direct == null) direct = num(trade.pnlUsd);
    if (direct == null) direct = num(trade.realizedPnl);
    if (direct == null) direct = num(trade.pnl);
    if (direct != null) return direct;
    var exit = num(trade.exitPrice);
    var entry = num(trade.entryPrice);
    var shares = num(trade.shares);
    if (exit == null || entry == null || shares == null) return null;
    var diff = sideDown(trade.side) ? entry - exit : exit - entry;
    return diff * shares;
  }

  function tradePct(trade) {
    var direct = num(trade.realizedPnlPct);
    if (direct == null) direct = num(trade.pnlPct);
    if (direct != null) return direct;
    var pnl = tradePnl(trade);
    var entry = num(trade.entryPrice);
    var shares = num(trade.shares);
    if (pnl == null || !entry || !shares) return null;
    return pnl / (entry * shares) * 100;
  }

  function positionPnl(position) {
    var direct = num(position.unrealizedPnlUsd);
    if (direct == null) direct = num(position.unrealizedPnl);
    if (direct != null) return direct;
    var mark = num(position.mark != null ? position.mark : position.last);
    var entry = num(position.entryPrice);
    var shares = num(position.shares);
    if (mark == null || entry == null || shares == null) return null;
    var diff = sideDown(position.side) ? entry - mark : mark - entry;
    return diff * shares;
  }

  function positionPct(position) {
    var direct = num(position.unrealizedPnlPct);
    if (direct != null) return direct;
    var pnl = positionPnl(position);
    var entry = num(position.entryPrice);
    var shares = num(position.shares);
    if (pnl == null || !entry || !shares) return null;
    return pnl / (entry * shares) * 100;
  }

  function resultKind(pnl, reason) {
    var name = String(reason || '').toLowerCase();
    if (name === 'scratch' || pnl === 0) return 'scratch';
    if (pnl != null && pnl < 0) return 'loss';
    if (pnl != null && pnl > 0) return 'win';
    if (name === 'stop' || name === 'stopped') return 'loss';
    if (name === 'target') return 'win';
    return 'scratch';
  }

  function resultLabel(pnl, reason) {
    var name = String(reason || '').toLowerCase();
    if (name === 'scratch' || (pnl === 0 && !name)) return 'Scratch';
    if (name === 'stop' || name === 'stopped') return 'Stopped out';
    if (name === 'target') return 'Target hit';
    if (name === 'time') return 'Time stop';
    if (pnl != null && pnl < 0) return 'Loss';
    if (pnl != null && pnl > 0) return 'Gain';
    if (pnl === 0) return 'Scratch';
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Closed';
  }

  function summarize(book) {
    var account = book && book.account || {};
    var balances = book && book.balances || {};
    var start = num(account.startingCash);
    if (start == null) start = 1000;
    var goal = num(account.goalEquity);
    if (goal == null) goal = 1000000;
    var cash = num(balances.cash);
    var reserved = num(balances.cashReserved);
    var available = num(balances.cashAvailable);
    var marketValue = num(balances.marketValue);
    if (marketValue == null) marketValue = 0;
    var closed = book && Array.isArray(book.closedTrades) ? book.closedTrades : [];
    var realized = 0;
    var wins = 0;
    var losses = 0;
    var scratches = 0;
    var unknown = 0;
    closed.forEach(function (trade) {
      var pnl = tradePnl(trade || {});
      if (pnl == null) {
        unknown += 1;
        return;
      }
      realized += pnl;
      var kind = resultKind(pnl, trade && (trade.exitReason || trade.result));
      if (kind === 'loss') losses += 1;
      else if (kind === 'win') wins += 1;
      else scratches += 1;
    });
    var positions = book && Array.isArray(book.openPositions) ? book.openPositions : [];
    var unrealized = 0;
    positions.forEach(function (position) {
      var pnl = positionPnl(position || {});
      if (pnl != null) unrealized += pnl;
    });
    var equity = num(balances.equity);
    if (equity == null) equity = (cash == null ? start : cash) + marketValue;
    var groups = groupOrders(orderLog(book || {}));
    var workingCount = 0;
    groups.forEach(function (group) {
      if (isWorking(group.records[group.records.length - 1])) workingCount += 1;
    });
    var openRisk = num(balances.openRiskUsd);
    if (openRisk == null) {
      openRisk = 0;
      groups.forEach(function (group) {
        var order = group.records[group.records.length - 1];
        if (!isWorking(order)) return;
        var risk = num(order.riskUsdAtLimit);
        if (risk == null && num(order.limitPrice) != null && num(order.stop) != null && num(order.shares) != null) {
          risk = Math.abs(order.limitPrice - order.stop) * order.shares;
        }
        if (risk != null) openRisk += risk;
      });
    }
    return {
      start: start,
      goal: goal,
      equity: equity,
      cash: cash == null ? start : cash,
      reserved: reserved == null ? 0 : reserved,
      available: available == null ? (cash == null ? start : cash) : available,
      marketValue: marketValue,
      realized: realized,
      wins: wins,
      losses: losses,
      scratches: scratches,
      unknown: unknown,
      closedCount: closed.length,
      unrealized: unrealized,
      positionCount: positions.length,
      workingCount: workingCount,
      openRisk: openRisk,
      asOf: balances.asOf || account.openedAt || '',
      openedAt: account.openedAt || '',
      markSource: balances.markSource || ''
    };
  }

  function closedBlurb(summary) {
    if (!summary.closedCount) return signedMoney(0) + ' · none yet';
    var bits = [];
    if (summary.wins) bits.push(summary.wins + (summary.wins === 1 ? ' winner' : ' winners'));
    if (summary.losses) bits.push(summary.losses + (summary.losses === 1 ? ' loser' : ' losers'));
    if (summary.scratches) bits.push(summary.scratches + (summary.scratches === 1 ? ' scratch' : ' scratches'));
    if (summary.unknown) bits.push(summary.unknown + ' with P&L missing');
    return signedMoney(summary.realized) + (bits.length ? ' · ' + bits.join(', ') : '');
  }

  function stripMeta(summary) {
    var versus = summary.equity - summary.start;
    var versusText = versus === 0
      ? 'Flat vs ' + money(summary.start) + ' start'
      : signedMoney(versus) + ' vs ' + money(summary.start) + ' start';
    var orders = summary.workingCount === 1
      ? '1 working order'
      : summary.workingCount + ' working orders';
    var fills = summary.positionCount === 0 && summary.closedCount === 0 ? ', no fills' : '';
    var closed = summary.closedCount ? ' · closed ' + signedMoney(summary.realized) : '';
    return versusText + ' · risk ' + money(summary.openRisk) + ' · ' + orders + fills + closed;
  }

  function tone(value) {
    if (typeof value !== 'number' || !isFinite(value) || value === 0) return '';
    return value > 0 ? 'is-up' : 'is-down';
  }

  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  root.PAPER_LEDGER = {
    summarize: summarize,
    stripMeta: stripMeta,
    closedBlurb: closedBlurb,
    isWorking: isWorking,
    workingLabel: workingLabel,
    formatWhen: formatWhen,
    formatDay: formatDay,
    money: money,
    signedMoney: signedMoney,
    tradePnl: tradePnl,
    positionPnl: positionPnl,
    orderLog: orderLog,
    groupOrders: groupOrders
  };

  if (typeof document === 'undefined') return;

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
    var html = document.documentElement;
    var cssPx = window.MONDO_PAGE && window.MONDO_PAGE.cssPx ? window.MONDO_PAGE.cssPx : function (n) { return n; };
    html.style.setProperty('--vv-top', cssPx(top) + 'px');
    html.style.setProperty('--vv-bottom', cssPx(bottom) + 'px');
    html.style.setProperty('--vv-keyboard', cssPx(keyboard) + 'px');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var swotSerial = Object.create(null);

  function resetSwotIds() {
    swotSerial = Object.create(null);
  }

  function swotDomId(symbol) {
    var seen = swotSerial[symbol] || 0;
    swotSerial[symbol] = seen + 1;
    return 'swot-' + symbol + (seen ? '-' + (seen + 1) : '');
  }

  function addSwot(card, title, symbol) {
    if (!symbol || !title || !window.MONDO_SWOT) return;
    var swotId = swotDomId(symbol);
    var jump = document.createElement('a');
    jump.className = 'paper-swot-link';
    jump.href = '#' + swotId;
    jump.textContent = 'SWOT';
    jump.hidden = true;
    title.appendChild(jump);
    var slot = el('div', 'swot-slot');
    card.appendChild(slot);
    window.MONDO_SWOT.mount(slot, symbol, {
      id: swotId,
      stateKey: 'paper:' + swotId,
      level: 4,
      onReady: function (node) {
        jump.hidden = false;
        jump.addEventListener('click', function () {
          var details = node.querySelector('.swot-card');
          if (details) details.open = true;
        });
      }
    });
  }

  function timeNode(value) {
    var node = el('time', '', formatWhen(value));
    if (value) node.setAttribute('datetime', String(value));
    return node;
  }

  function dl(rows) {
    var list = el('dl', 'paper-dl');
    rows.forEach(function (row) {
      if (!row) return;
      var wrap = el('div');
      wrap.appendChild(el('dt', '', row[0]));
      var dd = el('dd', row[2] || '');
      if (row[1] && row[1].nodeType) dd.appendChild(row[1]);
      else dd.textContent = row[1] == null || row[1] === '' ? '—' : String(row[1]);
      wrap.appendChild(dd);
      list.appendChild(wrap);
    });
    return list;
  }

  function badge(text, kind) {
    return el('span', 'paper-badge is-' + kind, text);
  }

  function stat(label, value, className) {
    var node = el('p', 'paper-stat' + (className ? ' ' + className : ''));
    node.appendChild(el('span', '', label));
    node.appendChild(el('b', '', value));
    return node;
  }

  function orderRows(order) {
    var zone = rangeText(num(order.buyZoneLow), num(order.buyZoneHigh), null);
    var limit = num(order.limitPrice);
    var entry = limit != null ? money(limit) : rangeText(num(order.entryLow), num(order.entryHigh), num(order.entryPrice));
    var target = money(num(order.target));
    if (order.targetLabel) target += ' (' + order.targetLabel + ')';
    var rows = [
      ['Side', sideLabel(order.side)],
      ['Shares', sharesLabel(order.shares)],
      [limit != null ? 'Limit' : 'Entry', entry],
      zone !== '—' ? ['Buy zone', zone] : null,
      ['Stop', money(num(order.stop))],
      ['Target', target],
      ['Reserved cash', money(num(order.reservedCash))],
      ['Risk if filled at the limit', order.riskUsdAtLimit != null
        ? money(num(order.riskUsdAtLimit)) + (order.riskPctAtLimit != null ? ' (' + plainPct(num(order.riskPctAtLimit)) + ')' : '')
        : '—'],
      ['Placed', timeNode(order.placedAt || order.at)],
      ['First eligible session', formatDay(order.firstEligibleSession) || '—']
    ];
    return rows;
  }

  function renderOrder(group) {
    var current = group.records[group.records.length - 1];
    var working = isWorking(current);
    var card = el('article', 'paper-card');
    var title = el('h3');
    title.appendChild(document.createTextNode(current.symbol || 'Order'));
    var label = working ? workingLabel(current) : recordLabel(current);
    var kind = working ? 'working' : (label.indexOf('Filled') !== -1 || label.indexOf('Partial') === 0 ? 'filled' : 'scratch');
    title.appendChild(badge(label, kind));
    card.appendChild(title);
    if (current.name) card.appendChild(el('p', 'paper-sub', current.name));
    card.appendChild(dl(orderRows(current)));
    var callout = el('p', 'paper-callout');
    if (working) {
      var close = num(current.signalClose);
      callout.textContent = 'Working order. Not a fill. No shares are held.'
        + (close != null ? ' Last close was ' + money(close) + ', so this limit is still working.' : '');
    } else {
      callout.textContent = recordLabel(current) + '.';
    }
    card.appendChild(callout);
    if (group.records.length > 1) {
      var history = el('ol', 'paper-history');
      group.records.forEach(function (record) {
        var item = el('li');
        item.appendChild(timeNode(record.placedAt || record.at || record.filledAt));
        item.appendChild(document.createTextNode(' · ' + recordLabel(record)));
        history.appendChild(item);
      });
      card.appendChild(history);
    }
    var extra = [];
    if (current.rewardRisk != null) extra.push(['Reward to risk', Number(current.rewardRisk).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' to 1']);
    if (current.swingScore != null) extra.push(['Swing score', String(current.swingScore)]);
    if (current.paramVersion) extra.push(['Parameter version', String(current.paramVersion)]);
    if (current.signalDate) extra.push(['Signal date', formatDay(current.signalDate) || String(current.signalDate)]);
    if (current.sector) extra.push(['Sector', String(current.sector)]);
    if (current.note) extra.push(['Note', String(current.note)]);
    if (extra.length) {
      var details = el('details', 'paper-details');
      details.appendChild(el('summary', '', 'Setup notes'));
      details.appendChild(dl(extra));
      card.appendChild(details);
    }
    addSwot(card, title, current.symbol);
    return card;
  }

  function renderPosition(position) {
    var pnl = positionPnl(position);
    var pct = positionPct(position);
    var card = el('article', 'paper-card');
    var title = el('h3');
    title.appendChild(document.createTextNode(position.symbol || 'Position'));
    title.appendChild(badge('Open', 'working'));
    card.appendChild(title);
    var entry = rangeText(num(position.entryLow), num(position.entryHigh), num(position.entryPrice));
    card.appendChild(dl([
      ['When', timeNode(position.entryAt || position.openedAt || position.at)],
      ['Side', sideLabel(position.side)],
      ['Shares', sharesLabel(position.shares)],
      ['Entry', entry],
      ['Stop', money(num(position.stop))],
      ['Target', money(num(position.target))],
      ['Mark', money(num(position.mark != null ? position.mark : position.last))],
      ['Marked', timeNode(position.markedAt)],
      ['Unrealized P&L', (pnl == null ? '—' : signedMoney(pnl)) + (pct == null ? '' : ' (' + signedPct(pct) + ')'), tone(pnl)]
    ]));
    addSwot(card, title, position.symbol);
    return card;
  }

  function renderTrade(trade) {
    var pnl = tradePnl(trade);
    var pct = tradePct(trade);
    var reason = trade.exitReason || trade.result;
    var kind = resultKind(pnl, reason);
    var card = el('article', 'paper-card');
    var title = el('h3');
    title.appendChild(document.createTextNode(trade.symbol || 'Trade'));
    title.appendChild(badge(resultLabel(pnl, reason), kind));
    card.appendChild(title);
    var entry = rangeText(num(trade.entryLow), num(trade.entryHigh), num(trade.entryPrice));
    var exitPrice = num(trade.exitPrice);
    var exit = exitPrice == null ? '—' : money(exitPrice);
    card.appendChild(dl([
      ['Entry time', timeNode(trade.entryAt || trade.openedAt || trade.at)],
      ['Side', sideLabel(trade.side)],
      ['Shares', sharesLabel(trade.shares)],
      ['Entry', entry],
      ['Stop', money(num(trade.stop))],
      ['Target', money(num(trade.target))],
      ['Exit time', timeNode(trade.exitAt || trade.closedAt)],
      ['Exit price', exit],
      ['Realized P&L', pnl == null ? '—' : signedMoney(pnl), tone(pnl)],
      ['Realized P&L %', pct == null ? '—' : signedPct(pct), tone(pnl)],
      ['Running cash', money(num(trade.cashAfter))],
      ['Equity after', money(num(trade.equityAfter))]
    ]));
    addSwot(card, title, trade.symbol);
    return card;
  }

  function renderBook(book, mount) {
    mount.setAttribute('aria-busy', 'false');
    var summary = summarize(book);
    var versus = summary.equity - summary.start;
    var versusPct = summary.start ? (versus / summary.start) * 100 : 0;
    var progress = summary.goal ? (summary.equity / summary.goal) * 100 : 0;
    var remaining = summary.goal - summary.equity;
    mount.textContent = '';
    resetSwotIds();

    var pnl = el('section', 'paper-summary');
    pnl.id = 'paperPnl';
    pnl.setAttribute('aria-labelledby', 'paperPnlTitle');
    pnl.appendChild(el('h2', '', 'P&L summary'));
    var opened = summary.openedAt ? 'Opened ' + formatWhen(summary.openedAt) + '. ' : '';
    pnl.appendChild(el('p', 'paper-lead', opened + 'Goal ' + money(summary.goal) + '.'));
    var grid = el('div', 'paper-stats');
    grid.appendChild(stat('Running equity', money(summary.equity)));
    grid.appendChild(stat('Versus ' + money(summary.start) + ' start', signedMoney(versus) + ' · ' + signedPct(versusPct), tone(versus)));
    grid.appendChild(stat('Open risk', money(summary.openRisk)));
    grid.appendChild(stat('Closed-trade results', closedBlurb(summary), tone(summary.closedCount ? summary.realized : 0)));
    grid.appendChild(stat('Unrealized P&L', signedMoney(summary.unrealized), tone(summary.unrealized)));
    grid.appendChild(stat('Goal progress', plainPct(progress)));
    pnl.appendChild(grid);
    pnl.appendChild(el('p', 'paper-line',
      'Running cash ' + money(summary.cash)
      + ' · reserved ' + money(summary.reserved)
      + ' · available ' + money(summary.available)));
    pnl.appendChild(el('p', 'paper-fine',
      'Market value ' + money(summary.marketValue)
      + (remaining > 0 ? ' · ' + money(remaining) + ' still to go' : ' · goal reached')));
    var meter = document.createElement('meter');
    meter.className = 'paper-meter';
    meter.min = 0;
    meter.max = summary.goal > 0 ? summary.goal : 1;
    meter.value = Math.max(0, Math.min(summary.equity, meter.max));
    meter.setAttribute('aria-label', 'Running equity versus the goal');
    meter.setAttribute('value', String(meter.value));
    pnl.appendChild(meter);
    if (summary.asOf || summary.markSource) {
      var asOf = summary.asOf ? 'As of ' + formatWhen(summary.asOf) + '. ' : '';
      var source = summary.markSource ? summary.markSource.charAt(0).toUpperCase() + summary.markSource.slice(1) + '.' : '';
      pnl.appendChild(el('p', 'paper-fine', asOf + source));
    }
    mount.appendChild(pnl);

    var groups = groupOrders(orderLog(book));
    var working = [];
    var other = [];
    groups.forEach(function (group) {
      if (isWorking(group.records[group.records.length - 1])) working.push(group);
      else other.push(group);
    });

    var orders = el('section', 'paper-section');
    orders.id = 'paperWorking';
    orders.appendChild(el('h2', '', 'Working orders'));
    orders.appendChild(el('p', 'paper-lead', working.length
      ? 'These orders are working and unfilled. They are not positions and they are not fills.'
      : 'No working orders.'));
    working.forEach(function (group) { orders.appendChild(renderOrder(group)); });
    mount.appendChild(orders);

    if (other.length) {
      var past = el('section', 'paper-section');
      past.appendChild(el('h2', '', 'Order record'));
      past.appendChild(el('p', 'paper-lead', 'Earlier order records stay on the log.'));
      other.forEach(function (group) { past.appendChild(renderOrder(group)); });
      mount.appendChild(past);
    }

    var positions = el('section', 'paper-section');
    positions.id = 'paperPositions';
    positions.appendChild(el('h2', '', 'Open positions'));
    var openList = Array.isArray(book.openPositions) ? book.openPositions : [];
    if (!openList.length) {
      positions.appendChild(el('p', 'paper-lead', 'No open positions. Unrealized P&L is ' + signedMoney(0) + '. Nothing has filled, so equity is still the starting cash.'));
    } else {
      positions.appendChild(el('p', 'paper-lead', 'Unrealized P&L ' + signedMoney(summary.unrealized) + '.'));
      openList.forEach(function (position) { positions.appendChild(renderPosition(position)); });
    }
    mount.appendChild(positions);

    var closed = el('section', 'paper-section');
    closed.id = 'paperClosed';
    closed.appendChild(el('h2', '', 'Closed trades'));
    var trades = Array.isArray(book.closedTrades) ? book.closedTrades : [];
    closed.appendChild(el('p', 'paper-lead', trades.length
      ? 'Closed-trade results ' + closedBlurb(summary) + '. Scratches, stops, and targets all stay here, losers and winners.'
      : 'No closed trades yet. When a trade ends, it stays here whether it is a winner, a loser, a scratch, a stop, or a target. Each record shows the Eastern time, ticker, side, shares, entry or fill range, stop, target, exit date and price, realized profit or loss in dollars and percent, and running cash after the trade.'));
    trades.forEach(function (trade) { closed.appendChild(renderTrade(trade)); });
    mount.appendChild(closed);

    var events = el('section', 'paper-section');
    events.id = 'paperEvents';
    events.appendChild(el('h2', '', 'Ledger'));
    var list = el('ol', 'paper-events');
    (Array.isArray(book.events) ? book.events : []).forEach(function (event) {
      var item = el('li');
      item.appendChild(timeNode(event.at));
      var detail = el('p', '', event.detail || event.type || '');
      if (event.symbol && String(event.detail || '').indexOf(event.symbol) === -1) {
        var name = el('b', '', event.symbol + ' ');
        detail.insertBefore(name, detail.firstChild);
      }
      item.appendChild(detail);
      list.appendChild(item);
    });
    if (!list.childNodes.length) list.appendChild(el('li', '', 'No ledger events yet.'));
    events.appendChild(list);
    mount.appendChild(events);

    var skipped = Array.isArray(book.skippedFromJournal) ? book.skippedFromJournal : [];
    if (skipped.length || book.marketAtOpen) {
      var more = el('section', 'paper-section');
      if (book.marketAtOpen) {
        var market = el('details', 'paper-details');
        market.appendChild(el('summary', '', 'Market when the book opened'));
        var snap = book.marketAtOpen;
        market.appendChild(dl([
          ['Symbol', snap.symbol || '—'],
          ['Price', money(num(snap.price))],
          ['Versus 50-day', snap.vsSma50 != null ? signedPct(num(snap.vsSma50)) : '—'],
          ['Versus 200-day', snap.vsSma200 != null ? signedPct(num(snap.vsSma200)) : '—'],
          ['Regime', snap.regime || '—'],
          ['Official slots', snap.officialSlots != null ? String(snap.officialSlots) : '—']
        ]));
        more.appendChild(market);
      }
      if (skipped.length) {
        var skip = el('details', 'paper-details');
        skip.appendChild(el('summary', '', 'Names not taken (' + skipped.length + ')'));
        skip.appendChild(el('p', 'paper-lead', 'These older journal names are not trades in this book.'));
        var skipList = el('ul', 'paper-skip');
        skipped.forEach(function (row) {
          var item = el('li');
          item.appendChild(el('b', '', (row.symbol || 'Name') + '. '));
          item.appendChild(document.createTextNode(row.reason || ''));
          skipList.appendChild(item);
        });
        skip.appendChild(skipList);
        more.appendChild(skip);
      }
      mount.appendChild(more);
    }
  }

  function paintStrip(summary) {
    var equity = document.getElementById('paperEquity');
    var meta = document.getElementById('paperMeta');
    if (equity) equity.textContent = 'Equity ' + money(summary.equity);
    if (meta) meta.textContent = stripMeta(summary);
  }

  function boot() {
    var year = document.getElementById('yr');
    if (year && !year.textContent) year.textContent = String(new Date().getFullYear());
    var app = document.getElementById('paperApp');
    var strip = document.getElementById('paperStrip');
    if (app) {
      syncVisibleChrome();
      window.addEventListener('resize', syncVisibleChrome);
      window.addEventListener('orientationchange', syncVisibleChrome);
      window.addEventListener('pageshow', syncVisibleChrome);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncVisibleChrome);
        window.visualViewport.addEventListener('scroll', syncVisibleChrome);
      }
    }
    if (!app && !strip) return;
    var url = (app ? 'ledger.json' : 'paper/ledger.json') + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('status ' + response.status);
      return response.json();
    }).then(function (book) {
      if (strip) paintStrip(summarize(book));
      if (app) renderBook(book, app);
    }).catch(function () {
      if (!app) return;
      app.setAttribute('aria-busy', 'false');
      if (!app.querySelector('.paper-summary') && !app.querySelector('.paper-seed')) {
        app.textContent = '';
        app.appendChild(el('p', 'paper-lead', 'The paper book could not be loaded.'));
      }
    });
  }

  root.PAPER_LEDGER.renderBook = renderBook;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
