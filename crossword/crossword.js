(() => {
'use strict';
const KEY = 'mondosupreme.crossword.v1';
const PUZZLES = [
  {
    id: 'cook', title: 'Culinary',
    grid: ['PASTA', '#R#O#', 'NORTH', '#M#A#', 'MAPLE'],
    across: [[1, 'Long noodles tossed with sauce'], [4, 'A compass point, and a cold direction'], [5, 'Syrup tree, or a leaf on the Canadian flag']],
    down: [[2, 'A smell that fills the kitchen'], [3, 'The whole amount']]
  },
  {
    id: 'space', title: 'Space Coast',
    grid: ['ORBIT', '#A#N#', 'ADAPT', '#I#U#', 'MONTH'],
    across: [[1, 'The path a rocket rides around Earth'], [4, 'To change the plan when the weather slips'], [5, 'About thirty days, or a page on a calendar']],
    down: [[2, 'The box that plays MondoFM'], [3, 'What you type into a computer']]
  },
  {
    id: 'cruise', title: 'Cruise & Travel',
    grid: ['SHIPS', '#A#I#', 'OVALS', '#E#O#', 'KNOTS'],
    across: [[1, 'Royal Caribbean rides'], [4, 'Egg-shaped windows, or racetrack laps'], [5, 'Sailor speed, and what you tie in a rope']],
    down: [[2, 'A safe harbor'], [3, 'The person at the helm']]
  },
  {
    id: 'retro', title: '90s Culture',
    grid: ['PAGER', '#U#M#', 'IDEAS', '#I#I#', 'TOOLS'],
    across: [[1, 'A belt beeper that buzzed in the 90s'], [4, 'Lightbulbs over a cartoon head'], [5, 'Hammers, wrenches, and the Geocities toolbox']],
    down: [[2, 'Sound you can hear'], [3, 'Electronic mail, shortened']]
  }
];
const TRIVIA = [
  ['Which port does Mondosupreme watch for Royal Caribbean ships?', ['Port Canaveral', 'Port Miami', 'Port of Seattle', 'Port of Galveston'], 0],
  ['A 56k modem was famous for which sound?', ['A handshake of squeals and static', 'A cruise ship horn', 'A vinyl scratch', 'A dial tone only'], 0],
  ['What does LCD stand for on a 90s gadget?', ['Liquid crystal display', 'Long cruise day', 'Laser compact disc', 'Local cocoa doppler'], 0],
  ['Cocoa, Florida, sits in which ZIP used on this site?', ['32927', '90210', '10001', '02139'], 0],
  ['Which breakfast recipe is a Mondosupreme sample?', ['Fluffy Buttermilk Pancakes', 'Beef Wellington', 'Lobster Thermidor', 'Peking Duck'], 0],
  ['GeoCities pages were famous for which warning?', ['Under construction GIFs', 'Mandatory login walls', 'Only one font', 'No pictures allowed'], 0],
  ['Kennedy Space Center launches sit on which Florida coast?', ['The Space Coast', 'The Gold Coast', 'The Forgotten Coast', 'The Emerald Coast'], 0],
  ['A Win98 taskbar usually sat where?', ['Along the bottom of the screen', 'Only in the system tray', 'Inside the recycle bin', 'On the mouse cord'], 0],
  ['Which ship class includes Oasis of the Seas?', ['Oasis class', 'Voyager class', 'Vision class', 'Freedom class'], 0],
  ['ICQ buddies announced themselves with which feeling?', ['Uh-oh', 'You have won', 'Mail call', 'All systems go'], 0],
  ['CocoCay is a private stop for which cruise line on this site?', ['Royal Caribbean', 'A cargo barge', 'A river ferry', 'A fishing charter'], 0],
  ['What is a Tamagotchi?', ['A keychain virtual pet', 'A search engine', 'A stock ticker', 'A cruise terminal'], 0],
  ['SLC-40 and SLC-41 are pads at which range?', ['Cape Canaveral Space Force Station', 'Vandenberg only', 'Wallops only', 'Baikonur'], 0],
  ['Which pasta shape is in the sample tomato recipe?', ['Spaghetti', 'Orzo', 'Ditalini', 'Stelline'], 0],
  ['A mini crossword clue that reads Across means the word goes…', ['Left to right', 'Bottom to top', 'In a circle', 'Only on black squares'], 0],
  ['Netscape Navigator was a famous 90s…', ['Web browser', 'Cruise ship', 'Weather radar', 'Stock exchange'], 0],
  ['Port Canaveral Terminal 1 on this site is the tip sheet for…', ['Royal Caribbean sailings', 'Cargo containers only', 'A space shuttle', 'A fishing tournament'], 0],
  ['The MondoGotchi egg hatches into a pet you can…', ['Feed, bathe, and dress', 'Trade on the stock board', 'File as a tax form', 'Use as a modem'], 0],
  ['An eastbound rocket from the Cape is watched from Cocoa by looking…', ['East and northeast', 'Due west inland', 'Straight down', 'South toward the Keys'], 0],
  ['Chickpea coconut curry in the sample box is which style of dinner?', ['A one-pot plant dinner', 'A raw dessert', 'A frozen pizza', 'A cheese plate only'], 0]
];
const $ = s => document.querySelector(s);
let puzzle, letters, started = 0, clockTimer = 0, active = 0, uid = '', saveState;

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayNumber() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function writeState() {
  try { localStorage.setItem(KEY, JSON.stringify(saveState)); } catch { /* full */ }
}
function cells() {
  const list = [];
  puzzle.grid.forEach((row, r) => {
    for (let c = 0; c < 5; c++) if (row[c] !== '#') list.push(r * 5 + c);
  });
  return list;
}
function numbers() {
  const nums = Array.from({ length: 5 }, () => Array(5).fill(0));
  let n = 1;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (puzzle.grid[r][c] === '#') continue;
      const across = (c === 0 || puzzle.grid[r][c - 1] === '#') && c < 4 && puzzle.grid[r][c + 1] !== '#';
      const down = (r === 0 || puzzle.grid[r - 1][c] === '#') && r < 4 && puzzle.grid[r + 1][c] !== '#';
      if (across || down) nums[r][c] = n++;
    }
  }
  return nums;
}
function paintGrid() {
  const host = $('#grid');
  const nums = numbers();
  host.replaceChildren();
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const wrap = document.createElement('div');
      const ch = puzzle.grid[r][c];
      wrap.className = 'cell' + (ch === '#' ? ' black' : '');
      if (ch !== '#') {
        if (nums[r][c]) {
          const num = document.createElement('span');
          num.className = 'num';
          num.textContent = String(nums[r][c]);
          wrap.appendChild(num);
        }
        const input = document.createElement('input');
        input.maxLength = 1;
        input.inputMode = 'text';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'Row ' + (r + 1) + ' column ' + (c + 1));
        input.dataset.i = String(r * 5 + c);
        input.value = letters[r * 5 + c] || '';
        input.addEventListener('focus', () => { active = r * 5 + c; });
        input.addEventListener('input', () => onType(input));
        input.addEventListener('keydown', e => onKey(e, input));
        wrap.appendChild(input);
      }
      host.appendChild(wrap);
    }
  }
}
function focusIndex(index) {
  const input = document.querySelector('#grid input[data-i="' + index + '"]');
  if (input) input.focus();
}
function onType(input) {
  if (!started) { started = Date.now(); tickClock(); clockTimer = setInterval(tickClock, 250); }
  const i = Number(input.dataset.i);
  letters[i] = (input.value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  input.value = letters[i];
  input.parentNode.classList.remove('bad', 'good');
  const order = cells();
  const pos = order.indexOf(i);
  if (letters[i] && pos >= 0 && pos < order.length - 1) focusIndex(order[pos + 1]);
  saveState.letters = letters;
  saveState.puzzle = puzzle.id;
  writeState();
  if (solved()) finishGrid();
}
function onKey(e, input) {
  const order = cells();
  const i = Number(input.dataset.i);
  const pos = order.indexOf(i);
  if (e.key === 'Backspace' && !input.value && pos > 0) {
    letters[order[pos - 1]] = '';
    focusIndex(order[pos - 1]);
    const prev = document.querySelector('#grid input[data-i="' + order[pos - 1] + '"]');
    if (prev) prev.value = '';
    e.preventDefault();
  } else if (e.key === 'ArrowRight' && pos < order.length - 1) focusIndex(order[pos + 1]);
  else if (e.key === 'ArrowLeft' && pos > 0) focusIndex(order[pos - 1]);
}
function solved() {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (puzzle.grid[r][c] === '#') continue;
      if ((letters[r * 5 + c] || '') !== puzzle.grid[r][c]) return false;
    }
  }
  return true;
}
function tickClock() {
  const el = $('#clock');
  if (!el) return;
  const ms = started ? Date.now() - started : 0;
  const s = Math.floor(ms / 1000);
  el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function markStreak(kind) {
  const day = todayKey();
  const prev = saveState.streakDay;
  if (saveState[kind] === day) return saveState.streak || 1;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
  saveState.streak = prev === y || prev === day ? (saveState.streak || 0) + (prev === day ? 0 : 1) : 1;
  if (prev !== day) saveState.streakDay = day;
  saveState[kind] = day;
  writeState();
  return saveState.streak;
}
function finishGrid() {
  document.querySelectorAll('#grid .cell').forEach(cell => cell.classList.add('good'));
  const streak = markStreak('gridDay');
  const ms = started ? Date.now() - started : 0;
  $('#msg').textContent = 'Filled. Streak ' + streak + '.';
  postScore('grid', 100, streak, ms);
}
function checkGrid() {
  let wrong = 0;
  document.querySelectorAll('#grid input').forEach(input => {
    const i = Number(input.dataset.i);
    const r = Math.floor(i / 5), c = i % 5;
    const ok = letters[i] && letters[i] === puzzle.grid[r][c];
    input.parentNode.classList.toggle('bad', !!(letters[i] && !ok));
    input.parentNode.classList.toggle('good', !!ok);
    if (letters[i] && !ok) wrong++;
  });
  $('#msg').textContent = wrong ? wrong + (wrong === 1 ? ' letter' : ' letters') + ' to rethink.' : (solved() ? 'That is the grid.' : 'Keep going.');
}
function revealGrid() {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) if (puzzle.grid[r][c] !== '#') letters[r * 5 + c] = puzzle.grid[r][c];
  }
  paintGrid();
  $('#msg').textContent = 'Revealed. The streak stays with a solve you typed.';
}
function paintClues() {
  const across = $('#across');
  const down = $('#down');
  across.replaceChildren();
  down.replaceChildren();
  puzzle.across.forEach(clue => across.appendChild(clueButton(clue)));
  puzzle.down.forEach(clue => down.appendChild(clueButton(clue)));
}
function clueButton(clue) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = clue[0] + '. ' + clue[1];
  btn.addEventListener('click', () => {
    const nums = numbers();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (nums[r][c] === clue[0]) focusIndex(r * 5 + c);
  });
  return btn;
}
function setPuzzle(next, keep) {
  puzzle = next;
  const saved = saveState.puzzle === next.id && Array.isArray(saveState.letters) ? saveState.letters : [];
  letters = keep && saved.length === 25 ? saved.slice() : Array(25).fill('');
  started = 0;
  if (clockTimer) clearInterval(clockTimer);
  tickClock();
  $('#puzzleName').textContent = next.title + ' · ' + todayKey();
  paintGrid();
  paintClues();
  $('#msg').textContent = 'Type a letter. The cursor jumps to the next white square.';
}
function paintArchives() {
  const host = $('#archives');
  host.replaceChildren();
  PUZZLES.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = item.title;
    btn.addEventListener('click', () => setPuzzle(item, false));
    host.appendChild(btn);
  });
}
function triviaSet() {
  const rand = mulberry(dayNumber());
  const bag = TRIVIA.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = bag[i]; bag[i] = bag[j]; bag[j] = swap;
  }
  return bag.slice(0, 5);
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function paintTrivia() {
  const host = $('#trivia');
  const quiz = triviaSet();
  let score = 0, answered = 0;
  host.replaceChildren();
  quiz.forEach((q, qi) => {
    const box = document.createElement('article');
    box.className = 'q';
    const p = document.createElement('p');
    p.textContent = (qi + 1) + '. ' + q[0];
    box.appendChild(p);
    q[1].forEach((choice, ci) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn choice';
      btn.textContent = choice;
      btn.addEventListener('click', () => {
        if (box.dataset.done) return;
        box.dataset.done = '1';
        answered++;
        const ok = ci === q[2];
        if (ok) score++;
        btn.textContent = choice + (ok ? ' ✓' : ' ×');
        if (answered === quiz.length) {
          const streak = markStreak('triviaDay');
          $('#triviaMsg').textContent = score + ' / 5. Streak ' + streak + '.';
          postScore('trivia', score * 20, streak, 0);
        }
      });
      box.appendChild(btn);
    });
    host.appendChild(box);
  });
}
function bootFirebase() {
  const c = window.MONDO_BOARD_CONFIG;
  if (typeof firebase === 'undefined' || !c) return;
  try { if (!firebase.apps.length) firebase.initializeApp(c); } catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      try { await firebase.auth().signInAnonymously(); } catch { /* local scores remain */ }
      return;
    }
    uid = user.uid;
    listenBoard();
  });
}
function listenBoard() {
  const day = todayKey();
  firebase.database().ref('crossword/scores/' + day).on('value', snap => {
    const val = snap.val() || {};
    const rows = Object.keys(val).map(id => Object.assign({ id }, val[id]));
    paintBoard($('#gridBoard'), rows.filter(r => r.kind === 'grid'));
    paintBoard($('#triviaBoard'), rows.filter(r => r.kind === 'trivia'));
    const banner = $('#syncBanner');
    if (banner) banner.hidden = true;
  }, () => {
    const banner = $('#syncBanner');
    if (banner) banner.hidden = false;
  });
}
function paintBoard(el, rows) {
  if (!el) return;
  el.replaceChildren();
  rows.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.ms || 0) - (b.ms || 0));
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = 'No scores posted yet today.';
    el.appendChild(li);
    return;
  }
  rows.slice(0, 12).forEach(row => {
    const li = document.createElement('li');
    li.textContent = (row.name || 'Guest') + ' · ' + (row.score || 0) + ' · streak ' + (row.streak || 0);
    el.appendChild(li);
  });
}
async function postScore(kind, score, streak, ms) {
  if (!uid || typeof firebase === 'undefined' || !firebase.apps.length) return;
  const name = (($('#playerName') && $('#playerName').value) || 'Guest').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 16) || 'Guest';
  if (!/^[A-Za-z]/.test(name)) return;
  const day = todayKey();
  try {
    await firebase.database().ref('crossword/scores/' + day + '/' + uid + kind).set({
      name, kind, score, streak, ms: Math.max(0, ms | 0), date: day, at: firebase.database.ServerValue.TIMESTAMP
    });
  } catch { const banner = $('#syncBanner'); if (banner) banner.hidden = false; }
}
function init() {
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  saveState = loadState();
  const daily = PUZZLES[dayNumber() % PUZZLES.length];
  setPuzzle(daily, true);
  paintArchives();
  paintTrivia();
  $('#checkBtn').onclick = checkGrid;
  $('#revealBtn').onclick = revealGrid;
  bootFirebase();
}
document.addEventListener('DOMContentLoaded', init);
})();
