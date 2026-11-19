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
assert.equal(goal.startDate, '2026-11-19');
assert.equal(goal.baselineEquity, 1000);
assert.equal(goal.target, 1000000);
assert.equal(goal.targetDate, '2026-12-18');
assert.equal(ledger.goalHistory.length, 1);
const priorGoal = ledger.goalHistory[0];
assert.equal(priorGoal.name, 'stretch');
assert.equal(priorGoal.startDate, '2026-11-12');
assert.equal(priorGoal.baselineEquity, 1000);
assert.equal(priorGoal.target, 1000000);
assert.equal(priorGoal.targetDate, '2026-12-11');
assert.equal(priorGoal.status, 'ended');
assert.equal(priorGoal.endedOn, '2026-11-19');
assert.equal(priorGoal.restartedOn, '2026-11-19');
assert.equal(priorGoal.endingEquity, 1000);
assert.equal(priorGoal.outcome, 'flat');
assert.equal(priorGoal.closedTrades, 0);
const restarts = ledger.events.filter((event) => event.type === 'stretch_goal_restarted');
assert.equal(restarts.length, 1);
assert.equal(restarts[0].session, '2026-11-19');
assert.equal(restarts[0].endingEquity, 1000);
assert.equal(restarts[0].priorStartDate, '2026-11-12');
assert.equal(restarts[0].priorTargetDate, '2026-12-11');
assert.equal(restarts[0].startDate, '2026-11-19');
assert.equal(restarts[0].targetDate, '2026-12-18');
assert.equal(ledger.events.some((event) => event.type === 'mark' && event.session === '2026-11-19'), false);

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
assert.equal(pythonDays.sessions[0], '2026-11-20');
assert.equal(pythonDays.sessions.at(-1), '2026-12-18');
assert.equal(pythonDays.sessions.includes('2026-11-26'), false);
assert.equal(pythonDays.sessions.includes('2026-11-27'), true);
assert.equal(pythonDays.sessions.includes('2026-11-19'), false);
assert.equal(pythonDays.sessions.includes('2026-12-19'), false);

const baseline = paper.stretchPace(goal, 1000, new Date('2026-11-19T15:30:00-05:00'));
assert.equal(baseline.today, '2026-11-19');
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
assert.equal(shown, '1.413×');
assert.match(goal.note, /Twenty NYSE sessions/);
assert.match(goal.note, /1000\^\(1\/20\)/);
assert.match(goal.note, /1\.4125×/);
assert.match(goal.note, /1\.413×/);
assert.match(goal.note, /about \+41%/);
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
assert.match(warning, /Nov 19, 2026/);
assert.match(warning, /Dec 18, 2026/);
assert.equal(warning.includes('Nov 12'), false);
assert.equal(warning.includes('Dec 11'), false);
assert.ok(warning.includes(shown));
assert.equal(warning.includes('1.26'), false);
assert.equal(warning.includes(calendarDay), false);
assert.match(warning, /about 41%/);

const beforeClose = paper.stretchPace(goal, 1000, new Date('2026-11-20T16:29:00-05:00'));
assert.equal(beforeClose.elapsed, 0);
assert.equal(beforeClose.left, 20);
assert.equal(beforeClose.due, 1);
assert.ok(Math.abs(beforeClose.paceEquity - 1000 * (1000 ** (1 / 20))) < 0.001);
assert.ok(beforeClose.gapUsd < -400);
assert.match(beforeClose.paceNote, /Due by the Nov 20, 2026 close/);

const afterClose = paper.stretchPace(goal, 1000, new Date('2026-11-20T16:30:00-05:00'));
assert.equal(afterClose.elapsed, 1);
assert.equal(afterClose.left, 19);
assert.ok(afterClose.requiredMultiple > afterClose.multiple);

const thanksgiving = paper.stretchPace(goal, 1000, new Date('2026-11-26T12:00:00-05:00'));
assert.equal(thanksgiving.dueSession, '2026-11-25');
assert.equal(pythonDays.sessions.includes(thanksgiving.today), false);

const shortened = paper.stretchPace(goal, 1000, new Date('2026-11-27T16:30:00-05:00'));
assert.equal(shortened.dueSession, '2026-11-27');
assert.ok(shortened.elapsed > thanksgiving.elapsed);

const finalDay = paper.stretchPace(goal, 1000, new Date('2026-12-18T16:30:00-05:00'));
assert.equal(finalDay.elapsed, 20);
assert.equal(finalDay.left, 0);
assert.equal(finalDay.paceEquity, 1000000);
assert.equal(finalDay.requiredMultiple, null);

const saturday = paper.stretchPace(goal, 1000, new Date('2026-12-19T12:00:00-05:00'));
assert.equal(saturday.elapsed, 20);
assert.equal(saturday.paceEquity, 1000000);
assert.equal(saturday.dueSession, '2026-12-18');

const summary = paper.summarize(ledger);
assert.equal(summary.workingCount, 0);
assert.equal(summary.openRisk, 0);
assert.equal(summary.positionCount, 0);
assert.equal(
  paper.stripMeta(summary),
  'Flat vs $1,000.00 start · risk $0.00 · 0 working orders, no fills'
);
const stocksPage = readFileSync(resolve(root, 'stocks/index.html'), 'utf8');
assert.match(stocksPage, /href="\/stocks\/challenge\/"/);
assert.equal(stocksPage.includes('1 working order'), false);
assert.equal(stocksPage.includes('risk $19.50'), false);
assert.match(stocksPage, /paper\/paper\.js\?v=\d+/);
assert.equal(stocksPage.includes('Nov 12, 2026'), false);
assert.equal(stocksPage.includes('Dec 11, 2026'), false);
assert.equal(stocksPage.includes('Dec 12, 2026'), false);

const challengePage = readFileSync(resolve(root, 'stocks/challenge/index.html'), 'utf8');
assert.match(challengePage, /id="paperMeta">Flat vs \$1,000\.00 start · risk \$0\.00 · 0 working orders, no fills</);
assert.match(challengePage, /paper\.js\?v=\d+/);
assert.equal(challengePage.includes('1 working order'), false);
assert.equal(challengePage.includes('risk $19.50'), false);

const paperPage = readFileSync(resolve(root, 'stocks/paper/index.html'), 'utf8');
assert.match(paperPage, /from \$1,000 on Nov 19, 2026 to \$1,000,000 by Dec 18, 2026/);
assert.match(paperPage, /prior Nov 12, 2026 to Dec 11, 2026 stretch ended Nov 19, 2026/);
assert.match(paperPage, /Stretch goal \$1,000,000 by Dec 18, 2026/);
assert.match(paperPage, /src="paper\.js\?v=\d+"/);
assert.equal(paperPage.includes('by Dec 11, 2026'), false);
assert.equal(paperPage.includes('on Nov 12, 2026 to'), false);

const paperSource = readFileSync(resolve(root, 'stocks/paper/paper.js'), 'utf8');
assert.equal(paperSource.includes('Nov 12, 2026'), false);
assert.equal(paperSource.includes('Dec 11, 2026'), false);
assert.equal(paperSource.includes('Dec 12, 2026'), false);
assert.match(paperSource, /formatDay\(spec\.targetDate\)/);

const rows = paper.tradeLogRows(ledger);
assert.equal(rows.length, 1);
assert.equal(rows[0].symbol, 'ZD');
assert.equal(rows[0].state, 'order');
assert.equal(rows[0].tone, 'neutral');
assert.equal(rows[0].status, 'Expired · not a fill');
assert.equal(rows[0].resultUsd, null);
assert.equal(rows[0].balanceAfter, null);
assert.equal(rows[0].fill, null);
assert.equal(rows[0].bookPct, null);
assert.match(rows[0].reason, /Not a fill/);
assert.match(rows[0].reason, /Expired/);
assert.equal(rows[0].shares, 5);
assert.equal(rows[0].riskPct, 1.95);
assert.equal(rows[0].riskUsd, 19.5);
assert.equal(rows[0].limit, 46.65);
assert.equal(rows[0].stop, 42.75);
assert.equal(rows[0].target, 55.81);

const staleRisk = paper.summarize({
  account: { startingCash: 1000 },
  balances: { openRiskUsd: 19.5, equity: 1000, cash: 1000, cashReserved: 233.25, marketValue: 0 },
  workingOrders: [
    { id: 'paper-2026-11-10-ZD', status: 'working', symbol: 'ZD', shares: 5, limitPrice: 46.65, stop: 42.75, riskUsdAtLimit: 19.5, placedAt: '2026-11-10T21:35:01-05:00' },
    { id: 'paper-2026-11-10-ZD', status: 'expired', symbol: 'ZD', shares: 5, limitPrice: 46.65, stop: 42.75, riskUsdAtLimit: 19.5, placedAt: '2026-11-10T21:35:01-05:00', at: '2026-11-17T16:05:00-05:00' }
  ],
  openPositions: [],
  closedTrades: []
});
assert.equal(staleRisk.workingCount, 0);
assert.equal(staleRisk.openRisk, 0);
assert.match(paper.stripMeta(staleRisk), /risk \$0\.00 · 0 working orders/);

const stillWorking = paper.summarize({
  account: { startingCash: 1000 },
  balances: { openRiskUsd: 0, equity: 1000, cash: 1000 },
  workingOrders: [
    { id: 'z', status: 'working', symbol: 'ZD', shares: 5, limitPrice: 46.65, stop: 42.75, riskUsdAtLimit: 19.5 }
  ]
});
assert.equal(stillWorking.workingCount, 1);
assert.equal(stillWorking.openRisk, 19.5);

const canceled = paper.summarize({
  balances: { openRiskUsd: 4 },
  workingOrders: [
    { id: 'c', status: 'working', symbol: 'CCC', shares: 1, limitPrice: 10, stop: 6, riskUsdAtLimit: 4 },
    { id: 'c', status: 'canceled', symbol: 'CCC', shares: 1, limitPrice: 10, stop: 6, riskUsdAtLimit: 4 }
  ]
});
assert.equal(canceled.workingCount, 0);
assert.equal(canceled.openRisk, 0);

const filled = paper.summarize({
  balances: { openRiskUsd: 99 },
  workingOrders: [
    { id: 'a', status: 'working', symbol: 'AAA', shares: 5, limitPrice: 10, stop: 8, riskUsdAtLimit: 10 },
    { id: 'a', status: 'filled', symbol: 'AAA', shares: 5, fillPrice: 10, riskUsdAtLimit: 10 }
  ],
  openPositions: [{ id: 'a', symbol: 'AAA', entryPrice: 10, stop: 8, shares: 5 }]
});
assert.equal(filled.workingCount, 0);
assert.equal(filled.openRisk, 10);

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

assert.equal(
  paper.regimeNote({
    regime: {
      symbol: 'SPY',
      vsSma200: -0.32,
      newEntriesBlocked: true,
      note: 'No new trades: SPY is 0.3% under its 200-day.'
    }
  }),
  'No new trades: SPY is 0.3% under its 200-day.'
);
assert.equal(
  paper.regimeNote({ regime: { symbol: 'SPY', vsSma200: -0.32, newEntriesBlocked: true } }),
  'No new trades: SPY is 0.3% under its 200-day.'
);
assert.equal(
  paper.regimeNote({ regime: { symbol: 'SPY', vsSma200: 1.25, newEntriesBlocked: false } }),
  'SPY is 1.3% above its 200-day.'
);
assert.equal(
  paper.regimeNote({ market: { symbol: 'SPY', vsSma200: -0.32 } }),
  'SPY is under its 200-day, so this pass does not name a top stock to watch.'
);
assert.equal(
  paper.regimeNote({ market: { symbol: 'SPY', vsSma200: 1.2 } }),
  'SPY is +1.2% versus its 200-day.'
);
assert.equal(paper.regimeNote({}), '');
assert.equal(paper.regimeNote({ regime: { newEntriesBlocked: true } }), 'No new trades.');

console.log('paper pace ok', shown, 'across', baseline.sessionCount, 'sessions');
