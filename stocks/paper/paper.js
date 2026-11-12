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

  /* NYSE sessions, matching scripts/paper_settlement.py. Weekdays except full-day
     closures. A shortened session still counts. The baseline date is not a step. */
  var SESSION_CLOSE_MINUTES = 16 * 60 + 30;

  function utcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  function isoDate(date) {
    var month = date.getUTCMonth() + 1;
    var day = date.getUTCDate();
    return date.getUTCFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  }

  function addUtcDays(date, days) {
    return new Date(date.getTime() + days * 86400000);
  }

  function parseISODate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return utcDate(+match[1], +match[2], +match[3]);
  }

  function pyWeekday(date) {
    return (date.getUTCDay() + 6) % 7;
  }

  function nthWeekday(year, month, weekday, n) {
    var first = utcDate(year, month, 1);
    var offset = (weekday - pyWeekday(first) + 7) % 7;
    return addUtcDays(first, offset + 7 * (n - 1));
  }

  function lastWeekday(year, month, weekday) {
    var probe = month === 12 ? utcDate(year + 1, 1, 1) : utcDate(year, month + 1, 1);
    probe = addUtcDays(probe, -1);
    return addUtcDays(probe, -((pyWeekday(probe) - weekday + 7) % 7));
  }

  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var ell = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * ell) / 451);
    var month = Math.floor((h + ell - 7 * m + 114) / 31);
    var day = ((h + ell - 7 * m + 114) % 31) + 1;
    return utcDate(year, month, day);
  }

  function observedFixed(year, month, day) {
    var raw = utcDate(year, month, day);
    var weekday = pyWeekday(raw);
    if (weekday === 5) return addUtcDays(raw, -1);
    if (weekday === 6) return addUtcDays(raw, 1);
    return raw;
  }

  function nyseClosureSet(year) {
    var closed = Object.create(null);
    function add(date) { closed[isoDate(date)] = 1; }
    var newYear = utcDate(year, 1, 1);
    if (pyWeekday(newYear) !== 5) add(observedFixed(year, 1, 1));
    add(nthWeekday(year, 1, 0, 3));
    add(nthWeekday(year, 2, 0, 3));
    add(addUtcDays(easterSunday(year), -2));
    add(lastWeekday(year, 5, 0));
    add(observedFixed(year, 6, 19));
    add(observedFixed(year, 7, 4));
    add(nthWeekday(year, 9, 0, 1));
    add(nthWeekday(year, 11, 3, 4));
    add(observedFixed(year, 12, 25));
    return closed;
  }

  var closureCache = Object.create(null);

  function nyseClosures(year) {
    return Object.keys(nyseClosureSet(year)).sort();
  }

  function isNyseSession(date) {
    if (pyWeekday(date) >= 5) return false;
    var year = date.getUTCFullYear();
    if (!closureCache[year]) closureCache[year] = nyseClosureSet(year);
    return !closureCache[year][isoDate(date)];
  }

  function stretchSessionDates(startDate, targetDate) {
    var start = parseISODate(startDate);
    var end = parseISODate(targetDate);
    if (!start || !end) return [];
    var days = [];
    var probe = addUtcDays(start, 1);
    while (probe.getTime() <= end.getTime()) {
      if (isNyseSession(probe)) days.push(isoDate(probe));
      probe = addUtcDays(probe, 1);
    }
    return days;
  }

  function readGoal(book) {
    var goal = book && book.goal;
    if (!goal || typeof goal !== 'object') return null;
    var startDate = String(goal.startDate || '');
    var targetDate = String(goal.targetDate || '');
    var baseline = num(goal.baselineEquity);
    var target = num(goal.target);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
    if (!(baseline > 0) || !(target > baseline)) return null;
    return {
      startDate: startDate,
      targetDate: targetDate,
      baseline: baseline,
      target: target,
      note: goal.note ? String(goal.note) : ''
    };
  }

  function easternClock(now) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: ET,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    var bag = {};
    fmt.formatToParts(now).forEach(function (part) {
      bag[part.type] = part.value;
    });
    return {
      date: bag.year + '-' + bag.month + '-' + bag.day,
      minutes: (Number(bag.hour) * 60) + Number(bag.minute)
    };
  }

  function formatMultiple(value) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '\u2014';
    var rounded = Math.round(value * 1000) / 1000;
    return rounded.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '\u00d7';
  }

  function formatGainPct(multiple) {
    if (typeof multiple !== 'number' || !isFinite(multiple)) return '\u2014';
    var pct = Math.round((multiple - 1) * 1000) / 10;
    return pct.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function stretchPace(goal, equity, now) {
    var normalized = goal && goal.startDate && num(goal.baseline) > 0 && num(goal.target) > num(goal.baseline);
    var spec = normalized ? goal : readGoal({ goal: goal });
    if (!spec) return null;
    var sessions = stretchSessionDates(spec.startDate, spec.targetDate);
    var total = sessions.length;
    var multiple = total > 0 ? Math.pow(spec.target / spec.baseline, 1 / total) : null;
    var clock = easternClock(now instanceof Date ? now : new Date());
    var today = clock.date;
    var elapsed = 0;
    var due = 0;
    var dueSession = '';
    sessions.forEach(function (day) {
      if (day < today || (day === today && clock.minutes >= SESSION_CLOSE_MINUTES)) elapsed += 1;
      if (day <= today) {
        due += 1;
        dueSession = day;
      }
    });
    var left = total - elapsed;
    var paceEquity = spec.baseline;
    if (multiple != null && due > 0) {
      paceEquity = due >= total ? spec.target : spec.baseline * Math.pow(spec.target / spec.baseline, due / total);
    }
    var gapUsd = typeof equity === 'number' && isFinite(equity) ? equity - paceEquity : null;
    var gapPct = gapUsd != null && paceEquity ? (gapUsd / paceEquity) * 100 : null;
    var required = null;
    if (left > 0 && typeof equity === 'number' && equity > 0 && spec.target > 0) {
      required = Math.pow(spec.target / equity, 1 / left);
    }
    var paceNote = 'Pace line for the baseline.';
    if (today <= spec.startDate) {
      paceNote = 'Today is the baseline. The pace line stays at the starting equity until the next session.';
    } else if (dueSession && dueSession === today && clock.minutes < SESSION_CLOSE_MINUTES) {
      paceNote = 'Due by the ' + formatDay(today) + ' close.';
    } else if (dueSession) {
      paceNote = 'Through the ' + formatDay(dueSession) + ' close.';
    }
    return {
      startDate: spec.startDate,
      targetDate: spec.targetDate,
      baseline: spec.baseline,
      target: spec.target,
      sessions: sessions,
      sessionCount: total,
      multiple: multiple,
      elapsed: elapsed,
      left: left,
      due: due,
      dueSession: dueSession,
      today: today,
      paceEquity: paceEquity,
      gapUsd: gapUsd,
      gapPct: gapPct,
      requiredMultiple: required,
      paceNote: paceNote
    };
  }

  function stretchWarning(pace) {
    var tail = ' Paper trading only. Informational, not financial advice, and not a performance claim. Swing rules are not loosened to chase it.';
    if (!pace || !(pace.sessionCount > 0) || !(pace.multiple > 0)) {
      return 'This is an extreme stretch goal. It is very unlikely to be reached.' + tail;
    }
    var about = Math.round((pace.multiple - 1) * 100);
    return 'This is an extreme stretch goal. It is very unlikely to be reached. It needs about '
      + about + '% compounded every trading session ('
      + formatMultiple(pace.multiple) + ' a session) across '
      + pace.sessionCount + ' NYSE sessions after '
      + formatDay(pace.startDate) + ' through '
      + formatDay(pace.targetDate)
      + '. The pace uses those sessions, not calendar days.'
      + tail;
  }

  function reasonFromExit(reason) {
    var name = String(reason || '').toLowerCase();
    if (name === 'stop' || name === 'stopped') return 'Stop.';
    if (name === 'target') return 'Target.';
    if (name === 'time') return 'Time stop. Not a stop and not a target.';
    if (name === 'scratch') return 'Scratch.';
    if (!name) return 'Closed.';
    return name.charAt(0).toUpperCase() + name.slice(1) + '.';
  }

  var MIN_RISK_PCT = 25;
  var MAX_RISK_PCT = 50;

  function centsOf(value) {
    var number = Number(value);
    if (!isFinite(number)) return 0;
    return Math.round(number * 100 + (number >= 0 ? 1e-8 : -1e-8));
  }

  function pctNumber(partCents, wholeCents) {
    if (!wholeCents) return 0;
    return Math.round((partCents / wholeCents) * 10000) / 100;
  }

  function bandNumber(value, fallback) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return fallback;
    return number;
  }

  function paperRiskBand(rules) {
    rules = rules && typeof rules === 'object' ? rules : {};
    var minimum = rules.minRiskPerTradePct != null ? bandNumber(rules.minRiskPerTradePct, null) : null;
    if (minimum == null) minimum = bandNumber(rules.riskPerTradePct, MIN_RISK_PCT);
    var maximum = bandNumber(rules.maxRiskPerTradePct, MAX_RISK_PCT);
    if (maximum < minimum) maximum = minimum;
    if (minimum > 100) minimum = 100;
    if (maximum > 100) maximum = 100;
    return { min: minimum, max: maximum };
  }

  function swingStrength(score) {
    var value = Number(score);
    if (!isFinite(value)) return 0;
    if (value <= 36) return 0;
    if (value >= 100) return 1;
    return (value - 36) / 64;
  }

  function roundPct(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function sizeReason(sized) {
    if (!sized.shares) {
      return 'No shares. One share would use more risk budget or more cash than this paper book allows.';
    }
    var text = 'Paper size. Target risk '
      + Number(sized.riskTargetPct).toFixed(2) + '% of equity, '
      + sized.shares + ' shares, '
      + Number(sized.riskPct).toFixed(2) + '% actually at risk, '
      + Number(sized.bookPct).toFixed(2) + '% of the book.';
    if (sized.cappedByBook) text += ' Capped at 100% of the book. No margin.';
    else if (sized.cappedByCash) text += ' Capped by available cash.';
    return text;
  }

  function sizePaperOrder(options) {
    options = options || {};
    var band = paperRiskBand({
      minRiskPerTradePct: options.minPct,
      maxRiskPerTradePct: options.maxPct,
      riskPerTradePct: options.minPct
    });
    if (options.minPct == null && options.maxPct == null && root.PAPER_LEDGER && root.PAPER_LEDGER.riskBand) {
      band = root.PAPER_LEDGER.riskBand;
    }
    if (options.minPct != null || options.maxPct != null) {
      band = paperRiskBand({
        minRiskPerTradePct: options.minPct == null ? band.min : options.minPct,
        maxRiskPerTradePct: options.maxPct == null ? band.max : options.maxPct
      });
    }
    var strength = options.strength;
    if (strength == null && options.score != null) strength = swingStrength(options.score);
    if (strength == null || !isFinite(Number(strength))) strength = 0;
    strength = Math.min(1, Math.max(0, Number(strength)));
    var target = roundPct(band.min + (band.max - band.min) * strength);
    var entryCents = centsOf(options.entry);
    var stopCents = centsOf(options.stop);
    var equityCents = centsOf(options.equity);
    var cashCents = centsOf(options.cash == null ? 0 : options.cash);
    var distance = entryCents - stopCents;
    var sized = {
      shares: 0,
      riskTargetPct: target,
      riskPct: 0,
      riskUsd: 0,
      bookPct: 0,
      notional: 0,
      cappedByCash: false,
      cappedByBook: false
    };
    if (entryCents <= 0 || distance <= 0 || equityCents <= 0) {
      sized.reason = 'No shares. The entry has to be above the stop, and the book has to have equity.';
      return sized;
    }
    var riskBudget = Math.round(equityCents * target / 100);
    var rawShares = Math.floor(riskBudget / distance);
    var cashShares = cashCents > 0 ? Math.floor(cashCents / entryCents) : 0;
    var bookShares = Math.floor(equityCents / entryCents);
    var shares = rawShares;
    var cappedCash = shares > cashShares;
    if (cappedCash) shares = cashShares;
    var cappedBook = shares >= bookShares && rawShares >= bookShares && bookShares > 0;
    if (shares > bookShares) shares = bookShares;
    if (shares < 0) shares = 0;
    var riskCents = shares * distance;
    var notional = shares * entryCents;
    sized.shares = shares;
    sized.riskPct = shares ? pctNumber(riskCents, equityCents) : 0;
    sized.riskUsd = riskCents / 100;
    sized.bookPct = shares ? pctNumber(notional, equityCents) : 0;
    sized.notional = notional / 100;
    sized.cappedByCash = cappedCash;
    sized.cappedByBook = cappedBook;
    sized.reason = sizeReason(sized);
    return sized;
  }

  function sizingWarning(band) {
    band = band || { min: MIN_RISK_PCT, max: MAX_RISK_PCT };
    var minText = Number(band.min).toString();
    var maxText = Number(band.max).toString();
    return 'Each new trade risks ' + minText + '% or more of the paper book, sized by the stop distance and capped by cash. Stronger setups may risk up to '
      + maxText + '%. This is a very aggressive, high-variance setting for a stretch goal. A few losses in a row can cut the book sharply. Paper only. Informational, not financial advice.';
  }

  function recordRiskPct(record) {
    if (!record) return null;
    if (num(record.riskPctAtLimit) != null) return num(record.riskPctAtLimit);
    if (num(record.riskPct) != null) return num(record.riskPct);
    return null;
  }

  function recordRiskUsd(record) {
    if (!record) return null;
    if (num(record.riskUsdAtLimit) != null) return num(record.riskUsdAtLimit);
    if (num(record.riskUsd) != null) return num(record.riskUsd);
    return null;
  }

  function recordBookPct(record) {
    if (!record) return null;
    if (num(record.bookPctAtEntry) != null) return num(record.bookPctAtEntry);
    if (num(record.bookPct) != null) return num(record.bookPct);
    return null;
  }

  function orderById(book, id) {
    var found = null;
    groupOrders(orderLog(book || {})).forEach(function (group) {
      if (group.id === String(id || '')) found = group.records[group.records.length - 1];
    });
    return found;
  }

  function tradeLogRows(book) {
    var rows = [];
    var seen = Object.create(null);
    var closed = book && Array.isArray(book.closedTrades) ? book.closedTrades : [];
    closed.forEach(function (trade) {
      if (!trade || typeof trade !== 'object') return;
      if (trade.id) seen[String(trade.id)] = 1;
      var pnl = tradePnl(trade);
      var prior = orderById(book, trade.id);
      rows.push({
        id: trade.id ? String(trade.id) : '',
        symbol: trade.symbol || '',
        state: 'closed',
        tone: pnl == null || pnl === 0 ? 'neutral' : (pnl > 0 ? 'up' : 'down'),
        status: pnl == null ? 'Closed' : (pnl > 0 ? 'Gain' : (pnl < 0 ? 'Loss' : 'Scratch')),
        entryAt: trade.entryAt || '',
        exitAt: trade.exitAt || trade.closedAt || '',
        shares: num(trade.shares),
        bookPct: recordBookPct(trade),
        riskPct: recordRiskPct(trade) != null ? recordRiskPct(trade) : recordRiskPct(prior),
        riskUsd: recordRiskUsd(trade) != null ? recordRiskUsd(trade) : recordRiskUsd(prior),
        fill: num(trade.entryPrice),
        stop: num(trade.stop),
        target: num(trade.target),
        resultUsd: pnl,
        resultPct: tradePct(trade),
        balanceAfter: num(trade.balanceAfter != null ? trade.balanceAfter : trade.equityAfter),
        reason: trade.reason ? String(trade.reason) : reasonFromExit(trade.exitReason || trade.result)
      });
    });
    var positions = book && Array.isArray(book.openPositions) ? book.openPositions : [];
    positions.forEach(function (position) {
      if (!position || typeof position !== 'object') return;
      if (position.id) seen[String(position.id)] = 1;
      var openedFrom = orderById(book, position.id);
      rows.push({
        id: position.id ? String(position.id) : '',
        symbol: position.symbol || '',
        state: 'open',
        tone: 'neutral',
        status: 'Open',
        entryAt: position.entryAt || position.filledAt || '',
        exitAt: '',
        shares: num(position.shares),
        bookPct: recordBookPct(position),
        riskPct: recordRiskPct(position) != null ? recordRiskPct(position) : recordRiskPct(openedFrom),
        riskUsd: recordRiskUsd(position) != null ? recordRiskUsd(position) : recordRiskUsd(openedFrom),
        fill: num(position.entryPrice),
        stop: num(position.stop),
        target: num(position.target),
        resultUsd: null,
        resultPct: null,
        balanceAfter: null,
        reason: 'Open. No result until the position exits.'
      });
    });
    groupOrders(orderLog(book || {})).forEach(function (group) {
      if (seen[group.id]) return;
      var order = group.records[group.records.length - 1];
      var status = String(order.status || 'working').toLowerCase();
      var working = isWorking(order);
      var label = working ? 'Working \u00b7 unfilled' : recordLabel(order);
      var ended = '';
      var reason = order.reason ? String(order.reason) : '';
      if (working) {
        reason = reason || 'Working order. Not a fill, and no shares are held.';
      } else if (status === 'expired') {
        ended = order.at || order.expiredOn || '';
        reason = reason || 'Expired unfilled. Not a fill.';
      } else if (status === 'canceled' || status === 'cancelled') {
        ended = order.at || '';
        reason = reason || 'Canceled. Not a fill.';
      } else if (status === 'rejected') {
        ended = order.at || '';
        reason = reason || 'Rejected. Not a fill.';
      } else {
        reason = reason || label;
      }
      rows.push({
        id: group.id,
        symbol: order.symbol || '',
        state: working ? 'working' : 'order',
        tone: 'neutral',
        status: label,
        entryAt: order.placedAt || order.at || '',
        exitAt: ended,
        shares: num(order.shares),
        bookPct: recordBookPct(order),
        riskPct: recordRiskPct(order),
        riskUsd: recordRiskUsd(order),
        fill: null,
        stop: num(order.stop),
        target: num(order.target),
        resultUsd: null,
        resultPct: null,
        balanceAfter: null,
        reason: reason
      });
    });
    rows.sort(function (a, b) {
      var ae = String(a.entryAt || '');
      var be = String(b.entryAt || '');
      if (ae < be) return -1;
      if (ae > be) return 1;
      return String(a.symbol).localeCompare(String(b.symbol));
    });
    return rows;
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
    groupOrders: groupOrders,
    readGoal: readGoal,
    nyseClosures: nyseClosures,
    stretchSessionDates: stretchSessionDates,
    stretchPace: stretchPace,
    stretchWarning: stretchWarning,
    formatMultiple: formatMultiple,
    formatGainPct: formatGainPct,
    tradeLogRows: tradeLogRows,
    paperRiskBand: paperRiskBand,
    swingStrength: swingStrength,
    sizePaperOrder: sizePaperOrder,
    sizingWarning: sizingWarning
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

  function swotDomId(symbol, scope) {
    var key = (scope || 'card') + ':' + symbol;
    var seen = swotSerial[key] || 0;
    swotSerial[key] = seen + 1;
    var id = 'swot-' + (scope ? scope + '-' : '') + symbol;
    return id + (seen ? '-' + (seen + 1) : '');
  }

  function addSwot(card, title, symbol, scope) {
    if (!symbol || !title || !window.MONDO_SWOT) return;
    var swotId = swotDomId(symbol, scope);
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

  function latestMarkSession(book) {
    var found = '';
    (book && Array.isArray(book.events) ? book.events : []).forEach(function (event) {
      if (!event || event.type !== 'mark' || !event.session) return;
      if (!found || String(event.session) > found) found = String(event.session);
    });
    return found;
  }

  function logShare(equity, baseline, target) {
    if (!(equity > 0) || !(baseline > 0) || !(target > baseline)) return 0;
    var share = Math.log(equity / baseline) / Math.log(target / baseline);
    if (share < 0) return 0;
    if (share > 1) return 1;
    return share;
  }

  function stretchStat(label, value, note, valueClass) {
    var wrap = document.createElement('div');
    wrap.appendChild(el('dt', '', label));
    var dd = el('dd');
    dd.appendChild(el('strong', valueClass || '', value));
    if (note) dd.appendChild(el('small', '', note));
    wrap.appendChild(dd);
    return wrap;
  }

  function renderStretch(book, mount, now) {
    if (!mount) return null;
    var summary = summarize(book);
    var spec = readGoal(book);
    var pace = spec ? stretchPace(spec, summary.equity, now) : null;
    var mark = latestMarkSession(book);
    mount.textContent = '';
    mount.classList.add('stretch-goal');
    mount.setAttribute('aria-busy', 'false');
    var titleId = (mount.id || 'stretchGoal') + 'Title';
    mount.setAttribute('aria-labelledby', titleId);
    var title = el('h2', '', 'Stretch goal');
    title.id = titleId;
    mount.appendChild(title);
    mount.appendChild(el('p', 'stretch-warn', pace
      ? stretchWarning(pace)
      : 'This book has no stretch goal on the ledger. Paper trading only. Informational, not financial advice. Swing rules are not loosened to chase a target.'));
    if (!pace) return pace;

    var gapClass = '';
    var gapText = '\u2014';
    if (pace.gapUsd != null && pace.gapPct != null) {
      if (Math.abs(pace.gapUsd) < 0.005) {
        gapText = 'Even with the pace line \u00b7 ' + signedMoney(0) + ' (' + signedPct(0) + ')';
      } else if (pace.gapUsd > 0) {
        gapClass = 'num-up';
        gapText = 'Ahead by ' + money(pace.gapUsd) + ' (' + signedPct(pace.gapPct) + ')';
      } else {
        gapClass = 'num-down';
        gapText = 'Behind by ' + money(Math.abs(pace.gapUsd)) + ' (' + signedPct(pace.gapPct) + ')';
      }
    }
    var need = '\u2014';
    var needNote = '';
    if (!(pace.sessionCount > 0)) {
      need = 'No sessions';
      needNote = 'The ledger dates do not contain an NYSE session.';
    } else if (pace.left <= 0) {
      need = summary.equity >= pace.target ? 'Goal reached' : 'No sessions left';
      needNote = summary.equity >= pace.target
        ? 'The book is at the target.'
        : 'The window is over and the book is short of the target.';
    } else if (!(summary.equity > 0)) {
      need = 'Not reachable';
      needNote = 'A flat or negative book cannot compound to the target.';
    } else {
      need = formatMultiple(pace.requiredMultiple) + ' per remaining session';
      needNote = 'About ' + formatGainPct(pace.requiredMultiple) + ' each remaining session';
      if (pace.multiple && Math.abs(pace.requiredMultiple - pace.multiple) >= 0.0005) {
        needNote += '. The original pace was ' + formatMultiple(pace.multiple) + '.';
      }
    }
    var stats = el('dl', 'stretch-stats');
    stats.appendChild(stretchStat('Paper equity', money(summary.equity), mark ? 'Latest daily mark ' + formatDay(mark) : 'Latest daily mark'));
    stats.appendChild(stretchStat('Pace line for today', money(pace.paceEquity), pace.paceNote));
    stats.appendChild(stretchStat('Versus the pace line', gapText, '', gapClass));
    stats.appendChild(stretchStat(
      'Sessions',
      pace.elapsed + ' elapsed \u00b7 ' + pace.left + ' left',
      formatDay(pace.startDate) + ' baseline through ' + formatDay(pace.targetDate)
    ));
    stats.appendChild(stretchStat('Still required', need, needNote));
    mount.appendChild(stats);

    var scale = el('div', 'stretch-scale');
    var progress = document.createElement('progress');
    progress.className = 'stretch-meter';
    progress.max = 1000;
    progress.value = Math.round(logShare(summary.equity, pace.baseline, pace.target) * 1000);
    progress.setAttribute('aria-label', 'Paper equity on the log path from the baseline to the stretch goal');
    progress.setAttribute('aria-valuetext', money(summary.equity) + ' paper equity. Pace line ' + money(pace.paceEquity) + '. ' + gapText);
    scale.appendChild(progress);
    if (pace.sessionCount > 0) {
      var tick = el('span', 'stretch-tick');
      tick.setAttribute('aria-hidden', 'true');
      var pct = (pace.due / pace.sessionCount) * 100;
      tick.style.left = pct + '%';
      tick.style.transform = 'translateX(' + (pace.due <= 0 ? '0' : (pace.due >= pace.sessionCount ? '-100%' : '-50%')) + ')';
      scale.appendChild(tick);
    }
    mount.appendChild(scale);
    mount.appendChild(el('p', 'stretch-fine',
      'Log scale from ' + money(pace.baseline) + ' to ' + money(pace.target)
      + '. The mark on the bar is the pace line. '
      + pace.sessionCount + ' sessions, about ' + formatGainPct(pace.multiple)
      + ' each (' + formatMultiple(pace.multiple) + ').'));
    return pace;
  }

  function logFact(label, value, wide, valueClass) {
    var wrap = document.createElement('div');
    if (wide) wrap.className = 'is-wide';
    wrap.appendChild(el('dt', '', label));
    var dd = el('dd', valueClass || '');
    if (value && value.nodeType) dd.appendChild(value);
    else dd.textContent = value == null || value === '' ? '\u2014' : String(value);
    wrap.appendChild(dd);
    return wrap;
  }

  function riskFact(row) {
    if (row.riskPct == null && row.riskUsd == null) return '\u2014';
    if (row.riskPct == null) return money(row.riskUsd);
    var text = plainPct(row.riskPct) + ' of the book';
    if (row.riskUsd == null) return text;
    return money(row.riskUsd) + ' \u00b7 ' + text;
  }

  function sharesAndBook(row) {
    var shares = sharesLabel(row.shares);
    if (row.bookPct == null) return shares;
    return shares + ' \u00b7 ' + plainPct(row.bookPct) + ' of the book';
  }

  function resultText(row) {
    if (row.state === 'open') return 'Open';
    if (row.state !== 'closed' || row.resultUsd == null) return '\u2014';
    var pct = row.resultPct == null ? '' : ' (' + signedPct(row.resultPct) + ')';
    return signedMoney(row.resultUsd) + pct;
  }

  function orderForRow(book, id) {
    var found = null;
    groupOrders(orderLog(book || {})).forEach(function (group) {
      if (group.id === String(id)) found = group.records[group.records.length - 1];
    });
    return found;
  }

  function setupDetails(book, row) {
    var order = orderForRow(book, row.id);
    if (!order) return null;
    var extra = [];
    if (order.name) extra.push(['Name', String(order.name)]);
    if (num(order.buyZoneLow) != null && num(order.buyZoneHigh) != null) {
      extra.push(['Buy zone', money(num(order.buyZoneLow)) + '\u2013' + money(num(order.buyZoneHigh))]);
    }
    if (row.fill == null && num(order.limitPrice) != null) extra.push(['Limit', money(num(order.limitPrice))]);
    if (num(order.reservedCash) != null) extra.push(['Reserved cash', money(num(order.reservedCash))]);
    if (num(order.riskUsdAtLimit) != null) {
      var risk = money(num(order.riskUsdAtLimit));
      if (num(order.riskPctAtLimit) != null) risk += ' (' + plainPct(num(order.riskPctAtLimit)) + ')';
      extra.push(['Risk if filled at the limit', risk]);
    }
    if (order.firstEligibleSession) extra.push(['First eligible session', formatDay(order.firstEligibleSession) || String(order.firstEligibleSession)]);
    if (order.rewardRisk != null) extra.push(['Reward to risk', Number(order.rewardRisk).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' to 1']);
    if (order.targetLabel) extra.push(['Target note', String(order.targetLabel)]);
    if (order.note) extra.push(['Note', String(order.note)]);
    if (!extra.length) return null;
    var details = el('details', 'paper-details');
    details.appendChild(el('summary', '', 'Setup notes'));
    details.appendChild(dl(extra));
    return details;
  }

  function logLead(rows) {
    if (!rows.length) return '';
    var closed = 0;
    var open = 0;
    var working = 0;
    var other = 0;
    rows.forEach(function (row) {
      if (row.state === 'closed') closed += 1;
      else if (row.state === 'open') open += 1;
      else if (row.state === 'working') working += 1;
      else other += 1;
    });
    var bits = [];
    if (working) bits.push(working + (working === 1 ? ' working order' : ' working orders'));
    if (open) bits.push(open + (open === 1 ? ' open trade' : ' open trades'));
    if (closed) bits.push(closed + (closed === 1 ? ' closed trade' : ' closed trades'));
    if (other) bits.push(other + (other === 1 ? ' other order' : ' other orders'));
    var sentence = bits.join(', ') + '.';
    if (!closed) sentence += ' No closed trades yet.';
    sentence += ' A working or expired order is not a fill.';
    return sentence;
  }

  function renderTradeLog(book, mount, options) {
    if (!mount) return;
    options = options || {};
    resetSwotIds();
    var rows = tradeLogRows(book);
    var spec = readGoal(book);
    mount.textContent = '';
    mount.classList.add('paper-log');
    mount.setAttribute('aria-busy', 'false');
    var titleId = (mount.id || 'paperLog') + 'Title';
    mount.setAttribute('aria-labelledby', titleId);
    var title = el('h2', '', 'Paper trade log');
    title.id = titleId;
    mount.appendChild(title);
    mount.appendChild(el('p', 'paper-banner', 'Paper / simulated trading. Not a live brokerage account, and not real money. Informational only, not financial advice, and not a performance claim.'));
    mount.appendChild(el('p', 'stretch-warn', sizingWarning(root.PAPER_LEDGER && root.PAPER_LEDGER.riskBand)));
    var from = spec ? formatDay(spec.startDate) : 'Nov 12, 2026';
    mount.appendChild(el('p', 'paper-fine',
      'Every paper trade from ' + from + ' on is listed here, along with any order that is still working. Entry and exit times are America/New_York. A fill or exit from the daily bar is recorded at 4:05 p.m. Eastern on that session.'));
    if (!rows.length) {
      mount.appendChild(el('p', 'paper-log-empty', 'No paper trades yet. This book has no orders, open positions, or closed trades. Nothing here is a live brokerage order.'));
    } else {
      mount.appendChild(el('p', 'paper-lead', logLead(rows)));
      rows.forEach(function (row) {
        var toneClass = row.tone === 'up' ? 'is-up' : (row.tone === 'down' ? 'is-down' : 'is-neutral');
        var card = el('article', 'paper-log-card ' + toneClass);
        var heading = el('h3');
        heading.appendChild(document.createTextNode(row.symbol || 'Order'));
        var badgeKind = row.tone === 'up' ? 'win' : (row.tone === 'down' ? 'loss' : 'neutral');
        heading.appendChild(badge(row.status, badgeKind));
        card.appendChild(heading);
        card.appendChild(el('p', 'paper-log-reason', row.reason || ''));
        var facts = el('dl', 'paper-log-facts');
        var placed = row.state === 'working' || row.state === 'order';
        facts.appendChild(logFact(placed ? 'Placed' : 'Entry', row.entryAt ? timeNode(row.entryAt) : '\u2014', true));
        var exitLabel = row.status.indexOf('Expired') === 0 ? 'Expired' : 'Exit';
        facts.appendChild(logFact(exitLabel, row.exitAt ? timeNode(row.exitAt) : '\u2014', true));
        facts.appendChild(logFact('Shares', sharesAndBook(row), false));
        facts.appendChild(logFact('Book', row.bookPct == null ? '\u2014' : plainPct(row.bookPct) + ' of the book', false));
        facts.appendChild(logFact('Risk', riskFact(row), false));
        facts.appendChild(logFact('Fill', row.fill == null ? '\u2014' : money(row.fill), false));
        facts.appendChild(logFact('Stop', money(row.stop), false));
        facts.appendChild(logFact('Target', money(row.target), false));
        var resultClass = row.tone === 'up' ? 'num-up' : (row.tone === 'down' ? 'num-down' : '');
        facts.appendChild(logFact('Result', resultText(row), true, resultClass));
        facts.appendChild(logFact('Balance after', row.balanceAfter == null ? '\u2014' : money(row.balanceAfter), false));
        card.appendChild(facts);
        var notes = setupDetails(book, row);
        if (notes) card.appendChild(notes);
        addSwot(card, heading, row.symbol, 'log');
        mount.appendChild(card);
      });
    }
    if (options.linked !== false) {
      var more = el('p', 'paper-log-more');
      var link = el('a', '', 'Open the full paper trade log');
      link.href = '/stocks/paper/';
      more.appendChild(link);
      mount.appendChild(more);
    }
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
    var spec = readGoal(book);

    var stretch = el('section', 'stretch-goal');
    stretch.id = 'paperStretch';
    renderStretch(book, stretch);
    mount.appendChild(stretch);

    var pnl = el('section', 'paper-summary');
    pnl.id = 'paperPnl';
    pnl.setAttribute('aria-labelledby', 'paperPnlTitle');
    pnl.appendChild(el('h2', '', 'P&L summary'));
    var opened = summary.openedAt ? 'Opened ' + formatWhen(summary.openedAt) + '. ' : '';
    var goalWhen = spec ? ' by ' + formatDay(spec.targetDate) : '';
    pnl.appendChild(el('p', 'paper-lead', opened + 'Stretch goal ' + money(spec ? spec.target : summary.goal) + goalWhen + '. Very unlikely, and not a forecast.'));
    var grid = el('div', 'paper-stats');
    grid.appendChild(stat('Running equity', money(summary.equity)));
    grid.appendChild(stat('Versus ' + money(summary.start) + ' start', signedMoney(versus) + ' · ' + signedPct(versusPct), tone(versus)));
    grid.appendChild(stat('Open risk', money(summary.openRisk)));
    grid.appendChild(stat('Closed-trade results', closedBlurb(summary), tone(summary.closedCount ? summary.realized : 0)));
    grid.appendChild(stat('Unrealized P&L', signedMoney(summary.unrealized), tone(summary.unrealized)));
    grid.appendChild(stat('Share of ' + money(summary.goal), plainPct(progress)));
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

    var log = el('section', 'paper-log');
    log.id = 'paperTradeLog';
    renderTradeLog(book, log, { linked: false });
    mount.appendChild(log);

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

  function paintRiskCopy(book) {
    var band = paperRiskBand(book && book.rules);
    var rule = document.getElementById('rule-6');
    if (rule) {
      rule.textContent = 'Each paper trade risks ' + Number(band.min) + '% or more of the paper book, sized by the stop distance and capped by cash.';
    }
    var help = document.getElementById('sizeHelp');
    if (help) {
      help.textContent = 'Share count from the planned entry to the stop. Each trade risks '
        + Number(band.min) + '% or more of this paper equity, up to ' + Number(band.max)
        + '% for the strongest setup, then capped by cash. A sketch, not a recommendation.';
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
    var stretch = document.getElementById('stretchGoal');
    var log = document.getElementById('paperTradeLog');
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
    if (!app && !strip && !stretch && !log) return;
    var url = (app ? 'ledger.json' : 'paper/ledger.json') + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('status ' + response.status);
      return response.json();
    }).then(function (book) {
      root.PAPER_LEDGER.riskBand = paperRiskBand(book && book.rules);
      paintRiskCopy(book);
      if (strip) paintStrip(summarize(book));
      if (stretch && stretch !== app) renderStretch(book, stretch);
      if (log && (!app || !app.contains(log))) renderTradeLog(book, log);
      if (app) renderBook(book, app);
    }).catch(function () {
      if (stretch) {
        stretch.setAttribute('aria-busy', 'false');
        var warn = stretch.querySelector('.stretch-warn');
        if (warn) warn.textContent = 'The paper book could not be loaded. The stretch goal is still an extreme, very unlikely paper exercise. Not financial advice, and not a performance claim.';
      }
      if (log && (!app || !app.contains(log))) {
        log.setAttribute('aria-busy', 'false');
        log.textContent = '';
        log.appendChild(el('p', 'paper-banner', 'Paper / simulated trading. Not a live brokerage account. Informational only, not financial advice.'));
        log.appendChild(el('p', 'paper-log-empty', 'The paper book could not be loaded.'));
        var more = el('p', 'paper-log-more');
        var link = el('a', '', 'Open the full paper trade log');
        link.href = '/stocks/paper/';
        more.appendChild(link);
        log.appendChild(more);
      }
      if (!app) return;
      app.setAttribute('aria-busy', 'false');
      if (!app.querySelector('.paper-summary') && !app.querySelector('.paper-seed')) {
        app.textContent = '';
        app.appendChild(el('p', 'paper-lead', 'The paper book could not be loaded.'));
      }
    });
  }

  root.PAPER_LEDGER.renderBook = renderBook;
  root.PAPER_LEDGER.renderStretch = renderStretch;
  root.PAPER_LEDGER.renderTradeLog = renderTradeLog;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
