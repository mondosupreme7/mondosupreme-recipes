(() => {
'use strict';
const SAVE_KEY = 'mondosupreme.escape.v1';
const HASH = {
  cupboard: '9f484139a27415ae2e8612bf6c65a8101a18eb5e9b7809e74ca63a45a65f17f4',
  sconces: 'c07334cd1de7814ccb28a4b02b2a44be8104e61f8318d5e9d9d14adcba2d8735',
  cipher: 'ff324dbfc9e0f83e4c9880b317751fc8ff12880b4efc9797fcad4d7acf659b2b',
  safe: '3f1bb7c0da3c01e685edd592f3a3ca0b149a399d25b97c0da47118c24a39f59a',
  gallery: 'c5012fb6613af70843ddfcb539fc9f11708ec2e6d80d831fce9e3556a2da38c9',
  final: '3fe1a8eed76e720c55b72363b8fd204ae435a668a8475ab1241c52aaaef89ad8'
};
const CLUE_HEX = '390d01411f150e004e070d0f050645190d014101110c04025c4c1519100b4d110c044c0404041f05094f';
const VARNISH = { 'canvas-1': '3', 'canvas-2': '8', 'canvas-3': '1', 'canvas-4': '5' };
const ITEMS = {
  key: 'Brass key',
  matches: 'Matchbox',
  lens: 'Cracked lens',
  ring: 'Copper ring',
  glass: 'Green glass'
};
const HINTS = {
  cupboard: [
    'The sign names three places, in order.',
    'Look at a collar, a numbered hook, and the underside of the mat.',
    'Three digits, one from each of those, in the sign’s order.'
  ],
  hearth: [
    'The hearth is cold, but your pockets may not be.',
    'The cupboard kept something that wants a dry place to strike.',
    'Use the matchbox on the hearth.'
  ],
  sconces: [
    'The hearth is trying to show a sequence.',
    'Light the sconces in the same order as the marks in the soot.',
    'Follow the soot from left to right.'
  ],
  drawer: [
    'The desk is keeping a letter shut.',
    'What you took from the foyer fits a small drawer, not a door.',
    'Use the brass key on the desk.'
  ],
  cipher: [
    'The shelf tells you how the alphabet moved.',
    'Volume III means each letter stepped forward by three. Step them back.',
    'Write the decoded words as letters only.'
  ],
  safe: [
    'The letter you decoded is an order, not itself the combination.',
    'The portrait is wearing one number and standing under another.',
    'Enter the medal’s digit, then the two digits on the plaque.'
  ],
  lens: [
    'The safe’s two finds do nothing alone.',
    'The ring is the right size for the cracked lens.',
    'Select one in your pockets, then the other.'
  ],
  stair: [
    'The canvases are varnished too dark to read by eye.',
    'Use the mended glass on each painting, from left to right.',
    'The stair lock wants those four digits in hanging order.'
  ],
  final: [
    'The plate tells you the order, not the numbers.',
    'You have already seen a stopped year, a plaque, a medal, and a last flame.',
    'Six digits, nothing between them: year, plaque pair, medal, last flame.'
  ]
};
const ROOMS = {
  foyer: {
    title: 'The Foyer',
    line: 'Wet wool, stopped time, and a door that is listening.',
    objects: [
      ['coat', 'Coat'],
      ['hook', 'Umbrella hook'],
      ['mat', 'Mat'],
      ['clock', 'Clock'],
      ['book', 'Guest book'],
      ['cupboard', 'Cupboard'],
      ['hearth', 'Hearth'],
      ['study-door', 'Study door', true]
    ]
  },
  study: {
    title: 'The Study',
    line: 'A green lamp, a founder who will not look away, and a drawer with a small mouth.',
    objects: [
      ['shelf', 'Shelf'],
      ['desk', 'Desk'],
      ['portrait', 'Portrait'],
      ['plaque', 'Plaque'],
      ['safe', 'Safe'],
      ['gallery-door', 'Gallery door', true],
      ['back-foyer', 'Back to the foyer', true]
    ]
  },
  gallery: {
    title: 'The Gallery',
    line: 'Four canvases, almost black. A stair waits at the far end.',
    objects: [
      ['canvas-1', 'Left canvas'],
      ['canvas-2', 'Second canvas'],
      ['canvas-3', 'Third canvas'],
      ['canvas-4', 'Last canvas'],
      ['stair', 'Lantern stair', true],
      ['back-study', 'Back to the study', true]
    ]
  },
  lantern: {
    title: 'The Lantern Room',
    line: 'Wind, a cold lantern, and a plate that assumes you have been paying attention.',
    objects: [
      ['plate', 'Brass plate'],
      ['lantern', 'Lantern'],
      ['back-gallery', 'Back to the gallery', true]
    ]
  }
};
const MARK = {
  star: 'M32 6 L36 26 L56 26 L40 38 L46 58 L32 46 L18 58 L24 38 L8 26 L28 26 Z',
  moon: 'M36 8 A20 20 0 1 0 36 56 A16 16 0 1 1 36 8 Z',
  wave: 'M6 36 Q16 24 26 36 T46 36 T62 28',
  bell: 'M32 8 V14 A16 16 0 0 1 48 30 V42 H16 V30 A16 16 0 0 1 32 14 M24 42 H40 L36 52 H28 Z'
};

const state = {
  startedAt: 0,
  endedElapsed: 0,
  finale: false,
  room: 'foyer',
  solved: [],
  inventory: [],
  notes: [],
  hints: {},
  paintings: {},
  selected: null
};
let seq = [];
let padPuzzle = null;
let padValue = '';
let audio = null;
let tick = null;

const $ = s => document.querySelector(s);
function has(id) { return state.solved.includes(id); }
function say(text) { $('#status').textContent = text; }
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function xorReveal(hex, key) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const value = parseInt(hex.slice(i, i + 2), 16) ^ key.charCodeAt((i / 2) % key.length);
    out += String.fromCharCode(value);
  }
  return out;
}
function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = n => String(n).padStart(2, '0');
  return h ? h + ':' + pad(m % 60) + ':' + pad(s % 60) : m + ':' + pad(s % 60);
}
function elapsed() {
  if (state.finale) return state.endedElapsed;
  if (!state.startedAt) return 0;
  return Date.now() - state.startedAt;
}
function addNote(text) {
  if (!state.notes.includes(text)) state.notes.push(text);
}
function give(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id);
}
function take(id) {
  state.inventory = state.inventory.filter(item => item !== id);
  if (state.selected === id) state.selected = null;
}
function markSolved(id) {
  if (!has(id)) state.solved.push(id);
}

function save() {
  const data = {
    v: 1,
    startedAt: state.startedAt,
    endedElapsed: state.endedElapsed,
    finale: state.finale,
    room: state.room,
    solved: state.solved,
    inventory: state.inventory,
    notes: state.notes,
    hints: state.hints,
    paintings: state.paintings
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!raw || raw.v !== 1 || typeof raw.startedAt !== 'number') return null;
    return raw;
  } catch { return null; }
}
function apply(raw) {
  state.startedAt = raw.startedAt;
  state.endedElapsed = typeof raw.endedElapsed === 'number' ? raw.endedElapsed : 0;
  state.finale = !!raw.finale;
  state.room = ROOMS[raw.room] ? raw.room : 'foyer';
  state.solved = Array.isArray(raw.solved) ? raw.solved.filter(id => typeof id === 'string') : [];
  state.inventory = Array.isArray(raw.inventory) ? raw.inventory.filter(id => ITEMS[id]) : [];
  state.notes = Array.isArray(raw.notes) ? raw.notes.filter(note => typeof note === 'string').slice(0, 24) : [];
  state.hints = raw.hints && typeof raw.hints === 'object' ? raw.hints : {};
  state.paintings = raw.paintings && typeof raw.paintings === 'object' ? raw.paintings : {};
  state.selected = null;
}

function currentPuzzle() {
  const order = {
    foyer: ['cupboard', 'hearth', 'sconces'],
    study: ['drawer', 'cipher', 'safe'],
    gallery: ['lens', 'stair'],
    lantern: ['final']
  }[state.room] || [];
  return order.find(id => !has(id)) || null;
}
function showHint() {
  const id = currentPuzzle();
  if (!id) { $('#hintOut').textContent = 'This room has given you what it can.'; return; }
  const seen = state.hints[id] || 0;
  const next = Math.min(3, seen + 1);
  state.hints[id] = next;
  $('#hintOut').textContent = HINTS[id][next - 1] + ' (' + next + ' of 3)';
  save();
}

function symbol(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', name);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', MARK[name]);
  svg.appendChild(path);
  return svg;
}
function sootSheet() {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'The soot kept an order.';
  const row = document.createElement('div');
  row.className = 'soot';
  ['star', 'moon', 'wave', 'bell'].forEach(name => row.appendChild(symbol(name)));
  wrap.append(p, row);
  return wrap;
}
function openSheet(content) {
  const body = $('#sheetBody');
  body.replaceChildren();
  if (typeof content === 'string') {
    const p = document.createElement('p');
    p.textContent = content;
    body.appendChild(p);
  } else body.appendChild(content);
  $('#notes').hidden = true;
  $('#pad').hidden = true;
  $('#sheet').hidden = false;
}
function closeSheets() {
  $('#sheet').hidden = true;
  $('#notes').hidden = true;
  $('#pad').hidden = true;
}

function renderArt() {
  const art = $('#art');
  art.replaceChildren();
  const pane = document.createElement('div');
  pane.className = 'pane';
  const rain = document.createElement('div');
  rain.className = 'rain';
  const door = document.createElement('div');
  door.className = 'door';
  door.appendChild(document.createElement('i'));
  art.append(pane, rain, door);
}
function render() {
  const room = ROOMS[state.room];
  $('#roomTitle').textContent = room.title;
  $('#roomLine').textContent = room.line;
  renderArt();
  $('#sconces').hidden = state.room !== 'foyer';
  $('#sconcePips').textContent = seq.map(() => '●').join(' ');
  const objects = $('#objects');
  objects.replaceChildren();
  room.objects.forEach(([id, label, door]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'night-btn' + (door ? ' door' : '');
    btn.dataset.hot = id;
    btn.textContent = label;
    objects.appendChild(btn);
  });
  const inv = $('#inventory');
  inv.replaceChildren();
  if (!state.inventory.length) {
    const empty = document.createElement('span');
    empty.textContent = 'Empty';
    inv.appendChild(empty);
  } else {
    state.inventory.forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'night-btn';
      btn.dataset.item = id;
      btn.textContent = ITEMS[id];
      btn.setAttribute('aria-pressed', state.selected === id ? 'true' : 'false');
      inv.appendChild(btn);
    });
  }
  $('#timer').textContent = formatDuration(elapsed());
}
function showPlay() {
  $('#splash').hidden = true;
  $('#ending').hidden = true;
  $('#play').hidden = false;
  render();
  armTick();
}
function armTick() {
  if (tick) { clearInterval(tick); tick = null; }
  if (document.hidden || $('#play').hidden) return;
  $('#timer').textContent = formatDuration(elapsed());
  tick = setInterval(() => { $('#timer').textContent = formatDuration(elapsed()); }, 250);
}
function showEnding() {
  if (tick) { clearInterval(tick); tick = null; }
  stopSound();
  $('#splash').hidden = true;
  $('#play').hidden = true;
  closeSheets();
  $('#ending').hidden = false;
  $('#endingTime').textContent = 'You were in the dark for ' + formatDuration(state.endedElapsed) + '.';
}
function freshStart() {
  state.startedAt = Date.now();
  state.endedElapsed = 0;
  state.finale = false;
  state.room = 'foyer';
  state.solved = [];
  state.inventory = [];
  state.notes = [];
  state.hints = {};
  state.paintings = {};
  state.selected = null;
  seq = [];
  $('#hintOut').textContent = '';
  say('The mat takes your weight.');
  save();
  showPlay();
}
function resume() {
  say('The house kept your place.');
  showPlay();
}
function resetAll() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  stopSound();
  if (tick) { clearInterval(tick); tick = null; }
  state.finale = false;
  state.startedAt = 0;
  $('#play').hidden = true;
  $('#ending').hidden = true;
  closeSheets();
  $('#splash').hidden = false;
  $('#begin').hidden = false;
  $('#resume').hidden = true;
  $('#wipe').hidden = true;
  $('#hintOut').textContent = '';
}

function openPad(puzzle, title, width) {
  padPuzzle = puzzle;
  padValue = '';
  $('#padTitle').textContent = title;
  $('#padDigits').textContent = '·'.repeat(width);
  $('#pad').dataset.width = String(width);
  $('#sheet').hidden = true;
  $('#notes').hidden = true;
  $('#pad').hidden = false;
}
function renderPad() {
  const width = Number($('#pad').dataset.width || 0);
  const shown = padValue + '·'.repeat(Math.max(0, width - padValue.length));
  $('#padDigits').textContent = shown;
}
async function tryPad() {
  const width = Number($('#pad').dataset.width || 0);
  if (padValue.length !== width) { say('The lock wants every digit.'); return; }
  const digest = await sha256(padValue);
  if (!HASH[padPuzzle] || digest !== HASH[padPuzzle]) {
    $('#padDigits').classList.remove('deny');
    void $('#padDigits').offsetWidth;
    $('#padDigits').classList.add('deny');
    padValue = '';
    renderPad();
    say('The lock does not care.');
    return;
  }
  if (padPuzzle === 'cupboard') {
    markSolved('cupboard');
    give('key');
    give('matches');
    say('The cupboard gives up a brass key and a matchbox.');
  } else if (padPuzzle === 'safe') {
    markSolved('safe');
    give('lens');
    give('ring');
    say('The safe opens on a cracked lens and a copper ring. Somewhere deeper, a bolt draws back.');
  } else if (padPuzzle === 'gallery') {
    markSolved('stair');
    say('The stair lock turns. Cold air comes down from above.');
  } else if (padPuzzle === 'final') {
    markSolved('final');
    state.finale = true;
    state.endedElapsed = Date.now() - state.startedAt;
    save();
    showEnding();
    return;
  }
  $('#pad').hidden = true;
  save();
  render();
}

function examine(id) {
  if (id === 'coat') return openSheet('Wool, still damp. A collar tag reads Row 2.');
  if (id === 'hook') return openSheet('Four hooks. The fourth holds a black umbrella, and a small 4 is cut into the brass.');
  if (id === 'mat') return openSheet('You lift the mat. The rubber is stamped with a 9.');
  if (id === 'clock') {
    addNote('The clockmaker’s plate reads 19.');
    save();
    return openSheet('Stopped, with no intention of starting. The maker’s plate reads 19.');
  }
  if (id === 'book') return openSheet('A last line in a shaky hand: try the year the clock was born. The rest of the page is water-stained.');
  if (id === 'cupboard') {
    if (has('cupboard')) return openSheet('The cupboard is empty now. The plate above it still reads: Row. Hook. Mat.');
    return openPad('cupboard', 'A plate above the lock reads: Row. Hook. Mat.', 3);
  }
  if (id === 'hearth') {
    if (has('hearth')) return openSheet(sootSheet());
    return openSheet('Cold ash. Something was written here and wiped away.');
  }
  if (id === 'study-door') {
    if (!has('sconces')) return say('The study door is shut. The sconces are dark.');
    state.room = 'study';
    say('The study smells of lamp oil.');
    save();
    return render();
  }
  if (id === 'shelf') return openSheet('One volume is pulled out just far enough to read III. A card tucked there says the alphabet fell by that many places.');
  if (id === 'desk') {
    if (!has('drawer')) return openSheet('The blotter is bare. The drawer has a small brass lock.');
    if (!has('cipher')) return openSheet(cipherSheet());
    return openSheet('The letter lies open. You already copied what it became.');
  }
  if (id === 'portrait') {
    addNote('The portrait’s medal is stamped 6.');
    save();
    return openSheet('The founder will not blink. The medal on his chest is stamped 6.');
  }
  if (id === 'plaque') {
    addNote('The plaque says No. 40.');
    save();
    return openSheet('A small plaque under the frame: No. 40.');
  }
  if (id === 'safe') {
    if (has('safe')) return openSheet('The safe is open and empty.');
    return openPad('safe', 'The safe has three wheels.', 3);
  }
  if (id === 'gallery-door') {
    if (!has('safe')) return say('The gallery door does not know you yet.');
    state.room = 'gallery';
    say('The gallery is darker than the study.');
    save();
    return render();
  }
  if (id === 'back-foyer') { state.room = 'foyer'; save(); return render(); }
  if (id === 'back-study') { state.room = 'study'; save(); return render(); }
  if (id === 'back-gallery') { state.room = 'gallery'; save(); return render(); }
  if (id.indexOf('canvas-') === 0) {
    if (!state.paintings[id]) return openSheet('Varnish, almost a mirror. If there is a mark, this light will not show it.');
    return openSheet('The glass already showed you a ' + VARNISH[id] + '.');
  }
  if (id === 'stair') {
    if (has('stair')) {
      state.room = 'lantern';
      say('The lantern room takes the wind.');
      save();
      return render();
    }
    return openPad('gallery', 'The stair lock has four wheels.', 4);
  }
  if (id === 'plate') return openSheet('A plate under the bell: Stopped year. Plaque pair. Medal. Last flame.');
  if (id === 'lantern') {
    if (has('final')) return;
    return openPad('final', 'The lantern will not wake until the plate is answered.', 6);
  }
}
function cipherSheet() {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'The ink is steady. The letters are not: PHGDO WKHQ SODTXH';
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.id = 'cipherInput';
  input.maxLength = 40;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Decoded letter');
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.id = 'cipherGo';
  btn.className = 'night-btn';
  btn.textContent = 'Read it';
  form.append(input, btn);
  form.addEventListener('submit', onCipher);
  wrap.append(p, form);
  return wrap;
}
async function onCipher(e) {
  e.preventDefault();
  const typed = norm($('#cipherInput').value);
  if (await sha256(typed) !== HASH.cipher) { say('The letters will not settle.'); return; }
  if (!has('cipher')) {
    markSolved('cipher');
    addNote(xorReveal(CLUE_HEX, typed));
    save();
  }
  say('The words find their places.');
  openSheet(state.notes[state.notes.length - 1]);
  render();
}
function revealPainting(id) {
  const digit = VARNISH[id];
  state.paintings[id] = true;
  const labels = {
    'canvas-1': 'Left canvas: 3',
    'canvas-2': 'Second canvas: 8',
    'canvas-3': 'Third canvas: 1',
    'canvas-4': 'Last canvas: 5'
  };
  addNote(labels[id]);
  save();
  openSheet('A digit shows through the varnish: ' + digit);
  render();
}
function combine(a, b) {
  const pair = [a, b].sort().join('|');
  if (pair === 'lens|ring') {
    take('lens');
    take('ring');
    give('glass');
    markSolved('lens');
    say('The ring seats. The crack in the glass closes.');
    save();
    render();
    return;
  }
  say('Those do not fit.');
}
function useItem(item, hot) {
  if (item === 'matches' && hot === 'hearth') {
    if (has('hearth')) { openSheet(sootSheet()); return; }
    take('matches');
    markSolved('hearth');
    say('One match. The soot keeps an order.');
    save();
    render();
    openSheet(sootSheet());
    return;
  }
  if (item === 'key' && hot === 'desk') {
    if (has('drawer')) { say('The key is already home.'); return; }
    take('key');
    markSolved('drawer');
    say('The key turns and stays in the lock.');
    save();
    render();
    openSheet(cipherSheet());
    return;
  }
  if (item === 'glass' && VARNISH[hot]) {
    revealPainting(hot);
    say('Still holding the green glass.');
    return;
  }
  examine(hot);
}
async function tapSconce(name) {
  if (state.room !== 'foyer') return;
  if (has('sconces')) { say('The sconces stay lit.'); return; }
  if (!has('hearth')) { say('The sconces stay cold. The hearth has not spoken.'); return; }
  seq.push(name);
  $('#sconcePips').textContent = seq.map(() => '●').join(' ');
  if (seq.length < 4) return;
  const digest = await sha256(seq.join(''));
  seq = [];
  $('#sconcePips').textContent = '';
  if (digest !== HASH.sconces) { say('The lights die. That was not the order.'); return; }
  markSolved('sconces');
  say('The study door answers with a click.');
  save();
  render();
}

function stopSound() {
  if (!audio) return;
  audio.stop();
  audio = null;
  const btn = $('#sound');
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Sound off'; }
}
function toggleSound() {
  const btn = $('#sound');
  if (audio) { stopSound(); return; }
  let ctx;
  try { ctx = new AudioContext(); }
  catch { say('This browser kept the quiet.'); return; }
  const master = ctx.createGain();
  master.gain.value = 0.045;
  master.connect(ctx.destination);
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 58;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.22;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();
  const air = ctx.createOscillator();
  air.type = 'triangle';
  air.frequency.value = 174;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.03;
  air.connect(airGain);
  airGain.connect(master);
  air.start();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);
  lfo.start();
  audio = {
    ctx: ctx,
    stop() { drone.stop(); air.stop(); lfo.stop(); ctx.close(); }
  };
  btn.setAttribute('aria-pressed', 'true');
  btn.textContent = 'Sound on';
}
function openNotes() {
  const list = $('#noteList');
  list.replaceChildren();
  if (!state.notes.length) {
    const li = document.createElement('li');
    li.textContent = 'You have not written anything down.';
    list.appendChild(li);
  } else {
    state.notes.forEach(note => {
      const li = document.createElement('li');
      li.textContent = note;
      list.appendChild(li);
    });
  }
  $('#sheet').hidden = true;
  $('#pad').hidden = true;
  $('#notes').hidden = false;
}

function onClick(e) {
  const sconce = e.target.closest('[data-sconce]');
  if (sconce) { tapSconce(sconce.dataset.sconce); return; }
  const itemBtn = e.target.closest('[data-item]');
  if (itemBtn) {
    const id = itemBtn.dataset.item;
    if (state.selected && state.selected !== id) { combine(state.selected, id); return; }
    state.selected = state.selected === id ? null : id;
    say(state.selected ? 'Using the ' + ITEMS[id].toLowerCase() + '. Tap where it goes.' : 'You put it away.');
    render();
    return;
  }
  const hot = e.target.closest('[data-hot]');
  if (!hot) return;
  if (state.selected) useItem(state.selected, hot.dataset.hot);
  else examine(hot.dataset.hot);
}
function onPad(e) {
  const key = e.target.closest('[data-key]');
  if (!key) return;
  const width = Number($('#pad').dataset.width || 0);
  if (key.dataset.key === 'back') padValue = padValue.slice(0, -1);
  else if (padValue.length < width) padValue += key.dataset.key;
  renderPad();
}

function bootSplash(raw) {
  $('#play').hidden = true;
  $('#ending').hidden = true;
  $('#splash').hidden = false;
  const saved = !!(raw && raw.startedAt && !raw.finale);
  $('#begin').hidden = saved;
  $('#resume').hidden = !saved;
  $('#wipe').hidden = !saved;
}
function boot() {
  const raw = load();
  if (raw) apply(raw);
  $('#begin').addEventListener('click', freshStart);
  $('#resume').addEventListener('click', resume);
  $('#wipe').addEventListener('click', () => {
    if (confirm('Forget everything the house showed you?')) resetAll();
  });
  $('#reset').addEventListener('click', () => {
    if (confirm('Forget everything the house showed you?')) resetAll();
  });
  $('#again').addEventListener('click', () => {
    if (confirm('Forget everything the house showed you?')) resetAll();
  });
  $('#hint').addEventListener('click', showHint);
  $('#sound').addEventListener('click', toggleSound);
  $('#notesBtn').addEventListener('click', openNotes);
  $('#notesClose').addEventListener('click', () => { $('#notes').hidden = true; });
  $('#sheetClose').addEventListener('click', () => { $('#sheet').hidden = true; });
  $('#padClose').addEventListener('click', () => { $('#pad').hidden = true; });
  $('#padOk').addEventListener('click', tryPad);
  $('#pad').addEventListener('click', onPad);
  $('#play').addEventListener('click', onClick);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (tick) { clearInterval(tick); tick = null; }
      if (audio && audio.ctx && audio.ctx.suspend) audio.ctx.suspend();
      return;
    }
    if (!$('#play').hidden) armTick();
    if (audio && audio.ctx && audio.ctx.resume) audio.ctx.resume();
  });
  if (raw && raw.finale) { showEnding(); return; }
  bootSplash(raw);
}
document.addEventListener('DOMContentLoaded', boot);
})();
