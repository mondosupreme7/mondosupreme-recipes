import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledger = JSON.parse(readFileSync(resolve(root, 'stocks/paper/ledger.json'), 'utf8'));
eval(readFileSync(resolve(root, 'stocks/paper/paper.js'), 'utf8'));

const paper = globalThis.PAPER_LEDGER;
assert.ok(paper && paper.stretchPace, 'paper ledger helpers did not load');

const goal = ledger.goal;
assert.equal(goal.startDate, '2026-11-12');
assert.equal(goal.baselineEquity, 1000);
assert.equal(goal.target, 1000000);
assert.equal(goal.targetDate, '2026-12-11');

const pythonDays = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, "scripts")
import paper_settlement as settle
book = json.load(open("stocks/paper/ledger.json"))
goal = book["goal"]
print(json.dumps({
  "sessions": [day.isoformat() for day in settle.stretch_sessions(goal)],
  "closures": {str(year): sorted(day.isoformat() for day in settle.nyse_closures(year)) for year in (2026, 2027, 2028)}
}))
`], { cwd: root, encoding: 'utf8' }));

assert.deepEqual(paper.stretchSessionDates(goal.startDate, goal.targetDate), pythonDays.sessions);
for (const year of [2026, 2027, 2028]) {
  assert.deepEqual(paper.nyseClosures(year), pythonDays.closures[String(year)], 'NYSE closures ' + year);
}
assert.equal(pythonDays.sessions.length, 20);
assert.equal(pythonDays.sessions[0], '2026-11-13');
assert.equal(pythonDays.sessions.at(-1), '2026-12-11');
assert.equal(pythonDays.sessions.includes('2026-11-26'), false);
assert.equal(pythonDays.sessions.includes('2026-11-27'), true);
assert.equal(pythonDays.sessions.includes('2026-11-12'), false);
assert.equal(pythonDays.sessions.includes('2026-12-12'), false);

const baseline = paper.stretchPace(goal, 1000, new Date('2026-11-12T15:30:00-05:00'));
assert.equal(baseline.today, '2026-11-12');
assert.equal(baseline.sessionCount, 20);
assert.equal(baseline.elapsed, 0);
assert.equal(baseline.left, 20);
assert.equal(baseline.due, 0);
assert.equal(baseline.paceEquity, 1000);
assert.ok(Math.abs(baseline.gapUsd) < 0.005);
assert.ok(baseline.multiple > 1.4 && baseline.multiple < 1.43);
assert.ok(Math.abs(baseline.multiple - (1000 ** (1 / 20))) < 1e-12);
assert.ok(Math.abs(baseline.requiredMultiple - baseline.multiple) < 1e-12);

const shown = paper.formatMultiple(baseline.multiple);
assert.match(shown, /^1\.41[0-9]×$/);
assert.equal(shown.includes('1.26'), false);
assert.equal(shown.includes('1.259'), false);
const calendarDay = paper.formatMultiple(1000 ** (1 / 30));
assert.match(calendarDay, /^1\.2/);
assert.notEqual(shown, calendarDay);

const warning = paper.stretchWarning(baseline);
assert.match(warning, /very unlikely/i);
assert.match(warning, /not financial advice/i);
assert.match(warning, /Paper trading only/);
assert.match(warning, /not a performance claim/i);
assert.match(warning, /Swing rules are not loosened/);
assert.match(warning, /20 NYSE sessions/);
assert.match(warning, /Nov 12, 2026/);
assert.match(warning, /Dec 11, 2026/);
assert.ok(warning.includes(shown));
assert.equal(warning.includes('1.26'), false);
assert.equal(warning.includes(calendarDay), false);
assert.match(warning, /about 41%/);

const beforeClose = paper.stretchPace(goal, 1000, new Date('2026-11-13T16:29:00-05:00'));
assert.equal(beforeClose.elapsed, 0);
assert.equal(beforeClose.left, 20);
assert.equal(beforeClose.due, 1);
assert.ok(Math.abs(beforeClose.paceEquity - 1000 * (1000 ** (1 / 20))) < 0.001);
assert.ok(beforeClose.gapUsd < -400);
assert.match(beforeClose.paceNote, /Due by the Nov 13, 2026 close/);

const afterClose = paper.stretchPace(goal, 1000, new Date('2026-11-13T16:30:00-05:00'));
assert.equal(afterClose.elapsed, 1);
assert.equal(afterClose.left, 19);
assert.ok(afterClose.requiredMultiple > afterClose.multiple);

const thanksgiving = paper.stretchPace(goal, 1000, new Date('2026-11-26T12:00:00-05:00'));
assert.equal(thanksgiving.dueSession, '2026-11-25');
assert.equal(pythonDays.sessions.includes(thanksgiving.today), false);

const shortened = paper.stretchPace(goal, 1000, new Date('2026-11-27T16:30:00-05:00'));
assert.equal(shortened.dueSession, '2026-11-27');
assert.ok(shortened.elapsed > thanksgiving.elapsed);

const finalDay = paper.stretchPace(goal, 1000, new Date('2026-12-11T16:30:00-05:00'));
assert.equal(finalDay.elapsed, 20);
assert.equal(finalDay.left, 0);
assert.equal(finalDay.paceEquity, 1000000);
assert.equal(finalDay.requiredMultiple, null);

const saturday = paper.stretchPace(goal, 1000, new Date('2026-12-12T12:00:00-05:00'));
assert.equal(saturday.elapsed, 20);
assert.equal(saturday.paceEquity, 1000000);
assert.equal(saturday.dueSession, '2026-12-11');

const rows = paper.tradeLogRows(ledger);
assert.equal(rows.length, 1);
assert.equal(rows[0].symbol, 'ZD');
assert.equal(rows[0].state, 'working');
assert.equal(rows[0].tone, 'neutral');
assert.equal(rows[0].status, 'Working · unfilled');
assert.equal(rows[0].resultUsd, null);
assert.equal(rows[0].balanceAfter, null);
assert.equal(rows[0].fill, null);
assert.equal(rows[0].bookPct, null);
assert.match(rows[0].reason, /Not a fill/);
assert.equal(rows[0].shares, 5);
assert.equal(rows[0].riskPct, 1.95);
assert.equal(rows[0].riskUsd, 19.5);
assert.match(rows[0].reason, /Not a fill/);

assert.deepEqual(paper.tradeLogRows({}), []);

const closed = paper.tradeLogRows({
  closedTrades: [{
    id: 't1',
    symbol: 'AAA',
    shares: 5,
    entryAt: '2026-11-13T16:05:00-05:00',
    exitAt: '2026-11-16T16:05:00-05:00',
    entryPrice: 10,
    stop: 9,
    target: 12,
    realizedPnlUsd: 5,
    realizedPnlPct: 10,
    equityAfter: 1005,
    bookPctAtEntry: 5,
    reason: 'Target. The session high reached the target.'
  }],
  openPositions: [{
    id: 't2',
    symbol: 'BBB',
    shares: 2,
    entryAt: '2026-11-17T16:05:00-05:00',
    entryPrice: 20,
    stop: 18,
    target: 24,
    bookPctAtEntry: 4
  }],
  workingOrders: [
    { id: 't1', status: 'filled', symbol: 'AAA', shares: 5, placedAt: '2026-11-13T16:05:00-05:00' },
    { id: 't2', status: 'filled', symbol: 'BBB', shares: 2, placedAt: '2026-11-17T16:05:00-05:00' }
  ]
});
assert.equal(closed.length, 2);
assert.equal(closed[0].state, 'closed');
assert.equal(closed[0].tone, 'up');
assert.equal(closed[0].resultUsd, 5);
assert.equal(closed[0].resultPct, 10);
assert.equal(closed[0].balanceAfter, 1005);
assert.equal(closed[0].bookPct, 5);
assert.equal(closed[0].exitAt, '2026-11-16T16:05:00-05:00');
assert.equal(closed[1].state, 'open');
assert.equal(closed[1].tone, 'neutral');
assert.equal(closed[1].resultUsd, null);
assert.equal(closed[1].status, 'Open');

const loss = paper.tradeLogRows({
  closedTrades: [{
    id: 'loss',
    symbol: 'CCC',
    shares: 1,
    entryPrice: 10,
    exitPrice: 8,
    realizedPnlUsd: -2,
    realizedPnlPct: -20,
    equityAfter: 998,
    exitReason: 'stop'
  }]
});
assert.equal(loss[0].tone, 'down');
assert.equal(loss[0].resultUsd, -2);
assert.equal(loss[0].balanceAfter, 998);
assert.match(loss[0].reason, /Stop/);

const pySizes = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, "scripts")
import paper_settlement as settle
cases = [
    {"equity": 10000, "cash_available": 10000, "entry": 20, "stop": 10, "strength": 0},
    {"equity": 10000, "cash_available": 10000, "entry": 20, "stop": 10, "strength": 1},
    {"equity": 1000, "cash_available": 200, "entry": 20, "stop": 10, "strength": 0},
    {"equity": 1000, "cash_available": 5000, "entry": 10, "stop": 5, "strength": 1},
    {"equity": 1000, "cash_available": 1000, "entry": 46.65, "stop": 42.75, "strength": 0},
    {"equity": 1000, "cash_available": 1000, "entry": 40, "stop": 40, "strength": 0},
    {"equity": 1000, "cash_available": 0, "entry": 20, "stop": 10, "strength": 0},
]
print(json.dumps([settle.size_paper_order(**case) for case in cases]))
`], { cwd: root, encoding: 'utf8' }));

const jsSizes = [
  { equity: 10000, cash: 10000, entry: 20, stop: 10, strength: 0 },
  { equity: 10000, cash: 10000, entry: 20, stop: 10, strength: 1 },
  { equity: 1000, cash: 200, entry: 20, stop: 10, strength: 0 },
  { equity: 1000, cash: 5000, entry: 10, stop: 5, strength: 1 },
  { equity: 1000, cash: 1000, entry: 46.65, stop: 42.75, strength: 0 },
  { equity: 1000, cash: 1000, entry: 40, stop: 40, strength: 0 },
  { equity: 1000, cash: 0, entry: 20, stop: 10, strength: 0 }
].map((item) => paper.sizePaperOrder(item));

assert.equal(pySizes.length, jsSizes.length);
pySizes.forEach((expected, index) => {
  const actual = jsSizes[index];
  assert.equal(actual.shares, expected.shares, 'shares ' + index);
  assert.equal(actual.riskTargetPct, expected.riskTargetPct, 'target ' + index);
  assert.equal(actual.riskPct, expected.riskPct, 'risk ' + index);
  assert.equal(actual.riskUsd, expected.riskUsd, 'risk usd ' + index);
  assert.equal(actual.bookPct, expected.bookPct, 'book ' + index);
  assert.equal(actual.notional, expected.notional, 'notional ' + index);
  assert.equal(actual.cappedByCash, expected.cappedByCash, 'cash cap ' + index);
  assert.equal(actual.cappedByBook, expected.cappedByBook, 'book cap ' + index);
  assert.equal(actual.reason, expected.reason, 'reason ' + index);
});
assert.equal(jsSizes[0].shares, 250);
assert.equal(jsSizes[1].bookPct, 100);
assert.notEqual(jsSizes[4].shares, 5);
assert.match(paper.sizingWarning({ min: 25, max: 50 }), /25% or more/);
assert.match(paper.sizingWarning({ min: 25, max: 50 }), /few losses in a row/i);
assert.match(paper.sizingWarning({ min: 25, max: 50 }), /Paper only/);
assert.equal(paper.sizingWarning({ min: 25, max: 50 }).includes('1–2%'), false);
assert.deepEqual(paper.paperRiskBand(ledger.rules), { min: 25, max: 50 });

const closedRisk = paper.tradeLogRows({
  closedTrades: [{
    id: 'sized',
    symbol: 'AAA',
    shares: 10,
    entryPrice: 20,
    exitPrice: 10,
    realizedPnlUsd: -100,
    realizedPnlPct: -50,
    equityAfter: 900,
    bookPctAtEntry: 20,
    riskPctAtLimit: 10,
    riskUsdAtLimit: 100,
    reason: 'Stop. The session low was at or below the stop.'
  }]
});
assert.equal(closedRisk[0].bookPct, 20);
assert.equal(closedRisk[0].riskPct, 10);
assert.equal(closedRisk[0].riskUsd, 100);
assert.match(closedRisk[0].reason, /Stop/);

console.log('paper pace ok', shown, 'across', baseline.sessionCount, 'sessions');
