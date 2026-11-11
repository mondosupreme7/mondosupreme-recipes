(() => {
'use strict';
/* Save key stays mondosupreme.escape.v1 so a renamed page still resumes. */
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
const ITEM_SHORT = {
  key: 'Key',
  matches: 'Matches',
  lens: 'Lens',
  ring: 'Ring',
  glass: 'Glass'
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
      ['coat', 'Coat', 'Coat'],
      ['hook', 'Hook', 'Umbrella hook'],
      ['mat', 'Mat', 'Mat'],
      ['clock', 'Clock', 'Clock'],
      ['book', 'Book', 'Guest book'],
      ['cupboard', 'Cupboard', 'Cupboard'],
      ['hearth', 'Hearth', 'Hearth'],
      ['study-door', 'Study', 'Study door', true]
    ]
  },
  study: {
    title: 'The Study',
    line: 'A green lamp, a founder who will not look away, and a drawer with a small mouth.',
    objects: [
      ['shelf', 'Shelf', 'Shelf'],
      ['desk', 'Desk', 'Desk'],
      ['portrait', 'Portrait', 'Portrait'],
      ['plaque', 'Plaque', 'Plaque'],
      ['safe', 'Safe', 'Safe'],
      ['gallery-door', 'Gallery', 'Gallery door', true],
      ['back-foyer', 'Foyer', 'Back to the foyer', true]
    ]
  },
  gallery: {
    title: 'The Gallery',
    line: 'Four canvases, almost black. A stair waits at the far end.',
    objects: [
      ['canvas-1', 'Left', 'Left canvas'],
      ['canvas-2', 'Second', 'Second canvas'],
      ['canvas-3', 'Third', 'Third canvas'],
      ['canvas-4', 'Last', 'Last canvas'],
      ['stair', 'Stair', 'Lantern stair', true],
      ['back-study', 'Study', 'Back to the study', true]
    ]
  },
  lantern: {
    title: 'The Lantern Room',
    line: 'Wind, a cold lantern, and a plate that assumes you have been paying attention.',
    objects: [
      ['plate', 'Plate', 'Brass plate'],
      ['lantern', 'Lantern', 'Lantern'],
      ['back-gallery', 'Gallery', 'Back to the gallery', true]
    ]
  }
};
const ALT = {
  threshold: 'A shut door in the rain, with a note on the mat.',
  foyer: 'A dark foyer: wet coat, stopped clock, cold hearth, and a shut study door.',
  study: 'A study under a green lamp, with a portrait, a desk, and a safe.',
  gallery: 'A narrow gallery of four dark canvases and a stair at the far end.',
  lantern: 'A small lantern room, one cold lantern, and a brass plate.',
  road: 'The door open onto a wet road and moonlight.'
};
const MARK = {
  star: 'M32 6 L36 26 L56 26 L40 38 L46 58 L32 46 L18 58 L24 38 L8 26 L28 26 Z',
  moon: 'M36 8 A20 20 0 1 0 36 56 A16 16 0 1 1 36 8 Z',
  wave: 'M6 36 Q16 24 26 36 T46 36 T62 28',
  bell: 'M32 8 V14 A16 16 0 0 1 48 30 V42 H16 V30 A16 16 0 0 1 32 14 M24 42 H40 L36 52 H28 Z'
};
const W = 120;
const H = 72;

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
let renderedRoom = '';
let padPuzzle = null;
let padValue = '';
let audio = null;
let tick = null;
let raf = 0;
let shock = 0;
const motes = Array.from({ length: 18 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  v: 0.04 + Math.random() * 0.08,
  a: 0.28 + Math.random() * 0.45
}));

const $ = s => document.querySelector(s);
function has(id) { return state.solved.includes(id); }
function say(text) { $('#status').textContent = text; }
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function reduced() {
  if (window.MONDO_JUICE && MONDO_JUICE.reduced) return MONDO_JUICE.reduced();
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
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
function closeMenu() {
  const menu = $('#menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  const btn = $('#menuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function openMenu() {
  $('#sheet').hidden = true;
  $('#notes').hidden = true;
  $('#pad').hidden = true;
  $('#menu').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
  const sound = $('#sound');
  if (sound) sound.focus();
}
function closeSheets() {
  $('#sheet').hidden = true;
  $('#notes').hidden = true;
  $('#pad').hidden = true;
  closeMenu();
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
  closeMenu();
  $('#sheet').hidden = false;
}

function syncViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const h = vv ? vv.height : window.innerHeight;
  root.style.setProperty('--vv-top', Math.round(top) + 'px');
  root.style.setProperty('--vv-h', Math.round(h) + 'px');
  const nav = document.querySelector('.studio-nav');
  let navH = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
  if (navH < 36) {
    const css = parseFloat(getComputedStyle(root).getPropertyValue('--nav-h'));
    navH = css || 48;
  }
  root.style.setProperty('--latch-nav', navH + 'px');
}

function fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
function box(ctx, x, y, w, h, color, edge) {
  fill(ctx, x, y, w, h, edge || color);
  if (edge && w > 2 && h > 2) fill(ctx, x + 1, y + 1, w - 2, h - 2, color);
}
function speckle(ctx, x, y, w, h, color, n, seed) {
  let s = seed;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const px = x + (s % w);
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const py = y + (s % h);
    ctx.fillRect(px, py, 1, 1);
  }
}
function rain(ctx, x, y, w, h, now, color) {
  const shift = reduced() ? 2 : Math.floor(now / 90) % h;
  ctx.fillStyle = color;
  for (let i = 0; i < w; i += 4) {
    const yy = y + ((i * 3 + shift) % Math.max(4, h - 3));
    ctx.fillRect(x + i, yy, 1, 3);
  }
}
function glow(ctx, x, y, r, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function crush(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function digit(ctx, n, x, y, color) {
  const rows = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'],
    7: ['111', '001', '001', '001', '001'],
    8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111']
  }[String(n)];
  if (!rows) return;
  ctx.fillStyle = color;
  rows.forEach((row, iy) => {
    for (let ix = 0; ix < row.length; ix++) {
      if (row[ix] === '1') ctx.fillRect(x + ix * 2, y + iy * 2, 2, 2);
    }
  });
}
function drawSprite(ctx, name, x, y) {
  ctx.save();
  ctx.translate(x, y);
  if (name === 'key') {
    fill(ctx, 1, 3, 6, 6, '#e0b060');
    fill(ctx, 3, 5, 2, 2, '#1a120e');
    fill(ctx, 6, 5, 8, 2, '#e0b060');
    fill(ctx, 12, 7, 2, 2, '#e0b060');
    fill(ctx, 12, 10, 2, 2, '#e0b060');
  } else if (name === 'matches') {
    fill(ctx, 3, 5, 10, 8, '#6b3a22');
    fill(ctx, 4, 6, 8, 1, '#e0b060');
    fill(ctx, 5, 1, 2, 5, '#f3e6d0');
    fill(ctx, 9, 1, 2, 5, '#f3e6d0');
    fill(ctx, 5, 0, 2, 2, '#e24a32');
    fill(ctx, 9, 0, 2, 2, '#e24a32');
  } else if (name === 'lens') {
    fill(ctx, 4, 1, 8, 2, '#d5e2ea');
    fill(ctx, 2, 3, 2, 10, '#d5e2ea');
    fill(ctx, 12, 3, 2, 10, '#d5e2ea');
    fill(ctx, 4, 13, 8, 2, '#d5e2ea');
    fill(ctx, 5, 4, 2, 2, '#9fb4c2');
    fill(ctx, 6, 6, 2, 2, '#f6e6d0');
    fill(ctx, 8, 8, 2, 2, '#f6e6d0');
    fill(ctx, 10, 10, 2, 2, '#f6e6d0');
  } else if (name === 'ring') {
    fill(ctx, 4, 1, 8, 3, '#e0a040');
    fill(ctx, 4, 12, 8, 3, '#e0a040');
    fill(ctx, 2, 3, 3, 10, '#e0a040');
    fill(ctx, 11, 3, 3, 10, '#e0a040');
  } else if (name === 'glass') {
    fill(ctx, 4, 1, 8, 2, '#3fbf78');
    fill(ctx, 2, 3, 12, 10, '#2f9a62');
    fill(ctx, 4, 13, 8, 2, '#3fbf78');
    fill(ctx, 5, 4, 3, 3, '#d8ffe8');
  }
  ctx.restore();
}
function floorboards(ctx, y) {
  fill(ctx, 0, y, W, H - y, '#100e0c');
  for (let x = 0; x < W; x += 12) fill(ctx, x, y, 1, H - y, '#241c16');
  fill(ctx, 0, y, W, 2, '#3a3028');
}
function paintThreshold(ctx, now) {
  fill(ctx, 0, 0, W, H, '#070b12');
  rain(ctx, 0, 0, W, H, now, '#4e6d86');
  fill(ctx, 30, 22, 60, 46, '#1a1614');
  fill(ctx, 26, 18, 68, 6, '#2a211c');
  fill(ctx, 34, 12, 52, 8, '#140f0d');
  box(ctx, 38, 28, 14, 12, '#101820', '#3a3028');
  fill(ctx, 42, 32, 4, 4, '#e0b060');
  box(ctx, 54, 30, 16, 34, '#120e0c', '#5c4632');
  fill(ctx, 66, 46, 2, 2, '#e0b060');
  fill(ctx, 52, 64, 20, 4, '#2a2420');
  fill(ctx, 58, 63, 6, 3, '#e6dcc8');
  speckle(ctx, 30, 24, 60, 40, '#000', 18, 9);
  glow(ctx, 46, 34, 16, 'rgba(224,176,96,0.35)');
  crush(ctx, 60, 40, 48);
}
function paintFoyer(ctx, now) {
  fill(ctx, 0, 0, W, 48, '#2a211b');
  speckle(ctx, 0, 0, W, 48, '#1a140f', 24, 3);
  floorboards(ctx, 48);
  box(ctx, 4, 8, 28, 26, '#101820', '#6b5344');
  fill(ctx, 8, 12, 20, 18, '#182430');
  fill(ctx, 20, 14, 6, 6, '#efe6d4');
  rain(ctx, 8, 12, 20, 18, now, '#8eb4cc');
  fill(ctx, 40, 10, 3, 34, '#5c4632');
  fill(ctx, 36, 14, 12, 3, '#5c4632');
  fill(ctx, 35, 18, 12, 24, '#4a2c22');
  fill(ctx, 36, 18, 10, 5, '#6b4030');
  fill(ctx, 37, 28, 3, 10, '#2a1a14');
  box(ctx, 56, 8, 18, 18, '#f0e2c4', '#1a140f');
  fill(ctx, 64, 10, 2, 7, '#1a140f');
  fill(ctx, 60, 16, 8, 2, '#1a140f');
  fill(ctx, 63, 12, 4, 4, '#f0c36a');
  box(ctx, 58, 28, 14, 6, '#c4924a', '#3a2c18');
  box(ctx, 54, 36, 18, 18, '#4a3424', '#1a120e');
  fill(ctx, 62, 40, 2, 8, '#2a1c14');
  fill(ctx, 66, 44, 3, 3, '#e0b060');
  box(ctx, 78, 26, 22, 28, '#6a645c', '#2e2a26');
  fill(ctx, 82, 32, 14, 16, has('hearth') ? '#7a3418' : '#140e0c');
  if (has('hearth')) {
    fill(ctx, 86, 36, 6, 8, '#e25822');
    fill(ctx, 88, 34, 2, 4, '#ffd090');
  } else {
    fill(ctx, 86, 40, 6, 4, '#2a241e');
  }
  box(ctx, 102, 12, 16, 42, '#1a120e', '#c4924a');
  fill(ctx, 104, 16, 12, 16, '#241810');
  fill(ctx, 104, 34, 12, 16, '#241810');
  fill(ctx, 112, 36, 3, 3, '#f0c36a');
  if (has('sconces')) fill(ctx, 104, 50, 12, 2, '#f0c36a');
  fill(ctx, 100, 56, 18, 6, '#3a3028');
  fill(ctx, 104, 57, 8, 3, '#e6dcc8');
  [[16, 6], [36, 6], [76, 6], [94, 8]].forEach(([x, y], i) => {
    const names = ['bell', 'star', 'wave', 'moon'];
    const on = has('sconces') || seq.includes(names[i]);
    fill(ctx, x, y, 5, 7, '#3a3028');
    if (on) fill(ctx, x + 1, y + 1, 3, 4, '#ffb060');
  });
  glow(ctx, 18, 20, 30, 'rgba(180,210,230,0.4)');
  if (has('hearth')) glow(ctx, 90, 40, 24, 'rgba(255,150,70,0.5)');
  crush(ctx, 60, 32, 86);
}
function paintStudy(ctx) {
  fill(ctx, 0, 0, W, H, '#1a221c');
  speckle(ctx, 0, 0, W, 48, '#101814', 22, 11);
  floorboards(ctx, 52);
  for (let i = 0; i < 5; i++) {
    fill(ctx, 6 + i * 7, 8, 6, 22, ['#6e2430', '#1d4e3a', '#8a6428', '#243048', '#4a3428'][i]);
    fill(ctx, 6 + i * 7, 8, 6, 2, '#e6dcc8');
  }
  fill(ctx, 4, 30, 40, 3, '#3a3028');
  box(ctx, 22, 40, 46, 16, '#3a2c22', '#1a120e');
  fill(ctx, 40, 34, 8, 8, '#d7ffe8');
  fill(ctx, 43, 28, 2, 8, '#2a241c');
  box(ctx, 78, 8, 24, 30, '#1a140f', '#e0b060');
  fill(ctx, 84, 14, 12, 14, '#d7c4a8');
  fill(ctx, 87, 18, 2, 2, '#1a140f');
  fill(ctx, 93, 18, 2, 2, '#1a140f');
  fill(ctx, 88, 24, 6, 1, '#6e2430');
  fill(ctx, 90, 26, 3, 3, '#e0b060');
  box(ctx, 82, 40, 16, 8, '#3a3028', '#8a7048');
  box(ctx, 6, 36, 14, 18, '#1a1c1a', '#5c564e');
  if (has('safe')) fill(ctx, 8, 40, 8, 10, '#0c0e0c');
  else {
    fill(ctx, 9, 42, 3, 3, '#8a8074');
    fill(ctx, 13, 42, 3, 3, '#8a8074');
  }
  box(ctx, 106, 18, 12, 38, '#101410', '#3a4a40');
  if (has('safe')) fill(ctx, 108, 50, 8, 2, '#7dcea0');
  const breathe = reduced() ? 0.55 : 0.4 + 0.2 * (0.5 + 0.5 * Math.sin(performance.now() / 480));
  glow(ctx, 44, 36, 36, 'rgba(140,230,170,' + breathe + ')');
  crush(ctx, 58, 34, 84);
}
function paintGallery(ctx) {
  fill(ctx, 0, 0, W, H, '#100c14');
  fill(ctx, 0, 48, W, 24, '#0c0a10');
  for (let i = 0; i < 6; i++) fill(ctx, 10 + i * 16, 48, 1, 24, '#241c28');
  const frames = [
    ['canvas-1', 6, 14, 24, 30],
    ['canvas-2', 34, 16, 20, 26],
    ['canvas-3', 58, 18, 16, 22],
    ['canvas-4', 78, 20, 14, 18]
  ];
  frames.forEach(([id, x, y, w, h]) => {
    box(ctx, x, y, w, h, '#1a1420', '#8a7048');
    if (state.paintings[id]) digit(ctx, VARNISH[id], x + 4, y + 6, '#f0e2cc');
    else fill(ctx, x + 3, y + 4, w - 6, h - 8, '#120e16');
  });
  box(ctx, 98, 16, 18, 40, '#07060a', '#3a3040');
  fill(ctx, 104, 20, 2, 28, '#5c564e');
  fill(ctx, 100, 50, 14, 2, '#6a88a0');
  glow(ctx, 106, 36, 34, 'rgba(140,170,210,0.4)');
  crush(ctx, 70, 34, 80);
}
function paintLantern(ctx, now) {
  fill(ctx, 0, 0, W, H, '#0a090c');
  fill(ctx, 0, 0, 10, H, '#070608');
  fill(ctx, 110, 0, 10, H, '#070608');
  floorboards(ctx, 54);
  box(ctx, 52, 6, 16, 8, '#101820', '#2a2622');
  fill(ctx, 56, 8, 6, 4, '#e7e0d2');
  rain(ctx, 54, 8, 12, 4, now, '#6a88a0');
  fill(ctx, 59, 14, 2, 10, '#5c564e');
  box(ctx, 50, 24, 20, 18, '#1a140f', '#e0b060');
  fill(ctx, 54, 28, 12, 10, '#100c0a');
  fill(ctx, 58, 30, 4, 4, '#3a342c');
  box(ctx, 10, 20, 22, 16, '#8a7048', '#3a2c18');
  fill(ctx, 13, 24, 16, 1, '#3a2c18');
  fill(ctx, 13, 28, 16, 1, '#3a2c18');
  fill(ctx, 13, 32, 10, 1, '#3a2c18');
  const breathe = reduced() ? 0.2 : 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(now / 700));
  glow(ctx, 60, 16, 26, 'rgba(230,230,220,' + (breathe + 0.15) + ')');
  crush(ctx, 60, 30, 70);
}
function paintRoad(ctx, now) {
  fill(ctx, 0, 0, W, H, '#0c1218');
  fill(ctx, 0, 40, W, 32, '#12100e');
  fill(ctx, 40, 40, 40, 32, '#1a242c');
  rain(ctx, 0, 0, W, 36, now, '#355068');
  fill(ctx, 86, 8, 10, 10, '#e7e0d2');
  box(ctx, 8, 16, 28, 40, '#1a1614', '#5c4632');
  fill(ctx, 14, 22, 16, 28, '#101820');
  fill(ctx, 18, 48, 8, 2, '#f0c36a');
  speckle(ctx, 40, 44, 40, 20, '#6a88a0', 12, 21);
  glow(ctx, 90, 14, 34, 'rgba(231,224,210,0.4)');
  crush(ctx, 70, 30, 60);
}
function paintScene(ctx, scene, now) {
  if (scene === 'threshold') paintThreshold(ctx, now);
  else if (scene === 'foyer') paintFoyer(ctx, now);
  else if (scene === 'study') paintStudy(ctx);
  else if (scene === 'gallery') paintGallery(ctx);
  else if (scene === 'lantern') paintLantern(ctx, now);
  else paintRoad(ctx, now);
  motes.forEach(mote => {
    if (!reduced()) {
      mote.y -= mote.v;
      if (mote.y < 0) {
        mote.y = H;
        mote.x = Math.random() * W;
      }
    }
    ctx.globalAlpha = mote.a;
    fill(ctx, mote.x, mote.y, 1, 1, '#f6e6d0');
  });
  ctx.globalAlpha = 1;
  if (shock > 0 && !reduced()) {
    shock -= 1;
    for (let i = 0; i < 46; i++) {
      ctx.globalAlpha = Math.random() * 0.55;
      fill(ctx, Math.random() * W, Math.random() * H, 1, 1, Math.random() < 0.5 ? '#fff' : '#000');
    }
    ctx.globalAlpha = 0.35;
    fill(ctx, 0, Math.random() * 60, W, 2, '#fff');
    ctx.globalAlpha = 1;
  }
}
function paintCanvas(canvas, scene, now) {
  if (!canvas) return;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  paintScene(ctx, scene, now);
  const host = canvas.closest('.crt');
  if (host && ALT[scene]) host.setAttribute('aria-label', ALT[scene]);
}
function visibleScene() {
  if (!$('#play').hidden) return { canvas: $('#roomArt'), scene: state.room };
  if (!$('#ending').hidden) return { canvas: $('#endArt'), scene: 'road' };
  return { canvas: $('#splashArt'), scene: 'threshold' };
}
function paintVisible(now) {
  const view = visibleScene();
  paintCanvas(view.canvas, view.scene, now || performance.now());
}
function applyShake() {
  let x = 0;
  let y = 0;
  if (window.MONDO_JUICE && MONDO_JUICE.shakeOffset) {
    const off = MONDO_JUICE.shakeOffset();
    x = off.x || 0;
    y = off.y || 0;
  }
  document.querySelectorAll('.crt').forEach(el => {
    el.style.translate = (x || y) ? (x.toFixed(1) + 'px ' + y.toFixed(1) + 'px') : '0 0';
  });
}
function wake() {
  paintVisible(performance.now());
  applyShake();
  if (reduced() || document.hidden) return;
  if (raf) return;
  const loop = now => {
    if (document.hidden || reduced()) {
      raf = 0;
      return;
    }
    paintVisible(now);
    applyShake();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function glitch() {
  if (reduced()) return;
  document.querySelectorAll('.crt').forEach(el => {
    el.classList.remove('is-glitch');
    void el.offsetWidth;
    el.classList.add('is-glitch');
    setTimeout(() => el.classList.remove('is-glitch'), 280);
  });
  shock = Math.max(shock, 5);
}
function scare() {
  glitch();
  shock = 10;
  if (window.MONDO_JUICE) {
    if (MONDO_JUICE.shake) MONDO_JUICE.shake(6, 200);
    if (MONDO_JUICE.vibrate) MONDO_JUICE.vibrate(24);
    if (audio && MONDO_JUICE.play) MONDO_JUICE.play('hurt');
  }
}
function chime() {
  if (audio && window.MONDO_JUICE && MONDO_JUICE.play) MONDO_JUICE.play('coin');
}

function paintItem(canvas, id) {
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  drawSprite(ctx, id, 0, 0);
}
function render() {
  const changed = renderedRoom && renderedRoom !== state.room;
  if (changed) {
    $('#hintOut').textContent = '';
    glitch();
  }
  renderedRoom = state.room;
  const room = ROOMS[state.room];
  $('#roomTitle').textContent = room.title;
  $('#roomLine').textContent = room.line;
  const playCrt = $('#playCrt');
  if (playCrt) playCrt.setAttribute('aria-label', ALT[state.room] || room.title);
  $('#sconces').hidden = state.room !== 'foyer';
  $('#sconcePips').textContent = seq.map(() => '●').join(' ');
  document.querySelectorAll('[data-sconce]').forEach(btn => {
    const on = has('sconces') || seq.includes(btn.dataset.sconce);
    btn.classList.toggle('is-lit', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const objects = $('#objects');
  objects.replaceChildren();
  room.objects.forEach(entry => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'night-btn' + (entry[3] ? ' is-door' : '');
    btn.dataset.hot = entry[0];
    btn.textContent = entry[1];
    btn.title = entry[2] || entry[1];
    btn.setAttribute('aria-label', entry[2] || entry[1]);
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
      const sprite = document.createElement('canvas');
      sprite.width = 16;
      sprite.height = 16;
      sprite.setAttribute('aria-hidden', 'true');
      paintItem(sprite, id);
      const label = document.createElement('span');
      label.textContent = ITEM_SHORT[id] || ITEMS[id];
      btn.append(sprite, label);
      btn.setAttribute('aria-label', ITEMS[id]);
      btn.setAttribute('aria-pressed', state.selected === id ? 'true' : 'false');
      inv.appendChild(btn);
    });
  }
  $('#timer').textContent = formatDuration(elapsed());
  wake();
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
  const heard = !!audio;
  stopSound();
  $('#splash').hidden = true;
  $('#play').hidden = true;
  closeSheets();
  $('#endingTitle').textContent = 'The house lets you go.';
  $('#endingLine').textContent = 'The lantern takes the flame. Rain thins. The road is only water and moonlight, and it is enough.';
  $('#ending').hidden = false;
  $('#endingTime').textContent = 'You were in the dark for ' + formatDuration(state.endedElapsed) + '.';
  if (heard && window.MONDO_JUICE && MONDO_JUICE.play) MONDO_JUICE.play('win');
  wake();
}
function clearEndingCopy() {
  $('#endingTitle').textContent = '';
  $('#endingLine').textContent = '';
  $('#endingTime').textContent = '';
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
  renderedRoom = '';
  $('#hintOut').textContent = '';
  clearEndingCopy();
  say('The mat takes your weight.');
  save();
  glitch();
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
  state.room = 'foyer';
  state.solved = [];
  state.inventory = [];
  state.notes = [];
  state.hints = {};
  state.paintings = {};
  state.selected = null;
  seq = [];
  $('#play').hidden = true;
  $('#ending').hidden = true;
  closeSheets();
  $('#splash').hidden = false;
  $('#begin').hidden = false;
  $('#resume').hidden = true;
  $('#wipe').hidden = true;
  $('#hintOut').textContent = '';
  renderedRoom = '';
  clearEndingCopy();
  wake();
}

function openPad(puzzle, title, width) {
  padPuzzle = puzzle;
  padValue = '';
  $('#padTitle').textContent = title;
  $('#padDigits').textContent = '·'.repeat(width);
  $('#pad').dataset.width = String(width);
  $('#sheet').hidden = true;
  $('#notes').hidden = true;
  closeMenu();
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
    scare();
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
    glitch();
    showEnding();
    return;
  }
  $('#pad').hidden = true;
  chime();
  save();
  render();
}

function examine(id) {
  if (id === 'coat' || id === 'hook' || id === 'mat') {
    const text = id === 'coat'
      ? 'Wool, still damp. A collar tag reads Row 2.'
      : id === 'hook'
        ? 'Four hooks. The fourth holds a black umbrella, and a small 4 is cut into the brass.'
        : 'You lift the mat. The rubber is stamped with a 9.';
    addNote(text);
    save();
    return openSheet(text);
  }
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
  btn.className = 'night-btn primary';
  btn.textContent = 'Read it';
  form.append(input, btn);
  form.addEventListener('submit', onCipher);
  wrap.append(p, form);
  return wrap;
}
async function onCipher(e) {
  e.preventDefault();
  const typed = norm($('#cipherInput').value);
  if (await sha256(typed) !== HASH.cipher) {
    say('The letters will not settle.');
    scare();
    return;
  }
  if (!has('cipher')) {
    markSolved('cipher');
    addNote(xorReveal(CLUE_HEX, typed));
    save();
  }
  say('The words find their places.');
  chime();
  openSheet(state.notes[state.notes.length - 1]);
  render();
}
function revealPainting(id) {
  const digitValue = VARNISH[id];
  state.paintings[id] = true;
  const labels = {
    'canvas-1': 'Left canvas: 3',
    'canvas-2': 'Second canvas: 8',
    'canvas-3': 'Third canvas: 1',
    'canvas-4': 'Last canvas: 5'
  };
  addNote(labels[id]);
  save();
  openSheet('A digit shows through the varnish: ' + digitValue);
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
    chime();
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
    chime();
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
    chime();
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
  document.querySelectorAll('[data-sconce]').forEach(btn => {
    const on = seq.includes(btn.dataset.sconce);
    btn.classList.toggle('is-lit', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  wake();
  if (seq.length < 4) return;
  const digest = await sha256(seq.join(''));
  seq = [];
  $('#sconcePips').textContent = '';
  if (digest !== HASH.sconces) {
    say('The lights die. That was not the order.');
    document.querySelectorAll('[data-sconce]').forEach(btn => {
      btn.classList.remove('is-lit');
      btn.setAttribute('aria-pressed', 'false');
    });
    scare();
    return;
  }
  markSolved('sconces');
  say('The study door answers with a click.');
  chime();
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
  closeMenu();
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
  wake();
}
function boot() {
  syncViewport();
  setTimeout(syncViewport, 0);
  setTimeout(syncViewport, 60);
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
  $('#hint').addEventListener('click', () => { showHint(); closeMenu(); });
  $('#sound').addEventListener('click', toggleSound);
  $('#notesBtn').addEventListener('click', openNotes);
  $('#notesClose').addEventListener('click', () => { $('#notes').hidden = true; });
  $('#sheetClose').addEventListener('click', () => { $('#sheet').hidden = true; });
  $('#padClose').addEventListener('click', () => { $('#pad').hidden = true; });
  $('#padOk').addEventListener('click', tryPad);
  $('#pad').addEventListener('click', onPad);
  $('#play').addEventListener('click', onClick);
  $('#menuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('#menu').hidden) openMenu();
    else closeMenu();
  });
  $('#menuClose').addEventListener('click', () => {
    closeMenu();
    $('#menuBtn').focus();
  });
  document.addEventListener('click', (e) => {
    const menu = $('#menu');
    if (!menu || menu.hidden) return;
    if (e.target.closest('#menu') || e.target.closest('#menuBtn')) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const menuWas = !$('#menu').hidden;
    closeSheets();
    if (menuWas) $('#menuBtn').focus();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (tick) { clearInterval(tick); tick = null; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (audio && audio.ctx && audio.ctx.suspend) audio.ctx.suspend();
      return;
    }
    if (!$('#play').hidden) armTick();
    if (audio && audio.ctx && audio.ctx.resume) audio.ctx.resume();
    wake();
  });
  window.addEventListener('resize', syncViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  if (raw && raw.finale) { showEnding(); return; }
  clearEndingCopy();
  bootSplash(raw);
}
document.addEventListener('DOMContentLoaded', boot);
syncViewport();
})();
