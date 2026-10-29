(() => {
'use strict';
const BOARD = 2400;
const COLORS = [
  { id: 'ink', hex: '#1c1917', label: 'Ink' },
  { id: 'slate', hex: '#64748b', label: 'Slate' },
  { id: 'white', hex: '#ffffff', label: 'White' },
  { id: 'red', hex: '#dc2626', label: 'Red' },
  { id: 'orange', hex: '#ea580c', label: 'Orange' },
  { id: 'amber', hex: '#eab308', label: 'Amber' },
  { id: 'green', hex: '#16a34a', label: 'Green' },
  { id: 'teal', hex: '#0d9488', label: 'Teal' },
  { id: 'blue', hex: '#2563eb', label: 'Blue' },
  { id: 'indigo', hex: '#4f46e5', label: 'Indigo' },
  { id: 'pink', hex: '#db2777', label: 'Pink' },
  { id: 'brown', hex: '#92400e', label: 'Brown' }
];
const SHAPES = { line: 1, rect: 1, ellipse: 1 };
const TOOLS = { pen: 1, eraser: 1, line: 1, rect: 1, ellipse: 1 };
const MAX_POINTS = 80;
const PAPER = '#fbf6ef';
const POINT_RE = /^\d{1,4},\d{1,4}(;\d{1,4},\d{1,4}){0,79}$/;
const DAY = 86400000;

function encodePoints(flat) {
  const pairs = [];
  const n = Math.floor(flat.length / 2);
  const step = n > MAX_POINTS ? (n - 1) / (MAX_POINTS - 1) : 1;
  const count = n > MAX_POINTS ? MAX_POINTS : n;
  for (let i = 0; i < count; i++) {
    const idx = n > MAX_POINTS ? Math.round(i * step) : i;
    const x = Math.max(0, Math.min(9999, Math.round(flat[idx * 2])));
    const y = Math.max(0, Math.min(9999, Math.round(flat[idx * 2 + 1])));
    const prev = pairs[pairs.length - 1];
    if (prev && prev[0] === x && prev[1] === y) continue;
    pairs.push([x, y]);
  }
  if (!pairs.length) return '';
  return pairs.map(p => p[0] + ',' + p[1]).join(';');
}
function decodePoints(text) {
  if (!POINT_RE.test(text || '')) return [];
  const out = [];
  text.split(';').forEach(pair => {
    const bits = pair.split(',');
    out.push(Number(bits[0]), Number(bits[1]));
  });
  return out;
}
function midnight(ms) { return Math.floor(ms / DAY) * DAY; }

const $ = s => document.querySelector(s);
let cssW = 1, cssH = 1, fitted = false;
let color = COLORS[0].hex, size = 8, tool = 'pen', panMode = false;
let camera = { x: 0, y: 0, scale: 1 };
let strokes = [];
let current = null;
let pointers = new Map();
let pinch = null;
let myUid = 'local';
let live = false;
let clearedAt = 0;
let viewFloor = 0;
let adminOk = false;
let strokeQuery = null;
let presenceRef = null;
let heart = null;
const pending = new Map();
const remote = new Map();
const aborted = new Set();
const redoStack = [];
let queue = [];
let pumping = false;
let rateTries = 0;

function configured() {
  const c = window.MONDO_BOARD_CONFIG;
  return !!(c && c.apiKey && c.authDomain && c.databaseURL && c.projectId && c.appId);
}
function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}
function toastStatus(text) { setStatus(text); }
function memberSignedIn() {
  return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isMember && window.MONDO_MEMBER.isMember());
}
async function confirmAdmin() {
  const user = window.firebase && firebase.auth && firebase.auth().currentUser;
  if (!user || !firebase.database) return false;
  const uid = user.uid;
  try {
    const snap = await firebase.database().ref('admins/' + uid).once('value');
    const still = firebase.auth().currentUser;
    return !!(still && still.uid === uid && snap.val() === true);
  } catch { return false; }
}
async function refreshChrome() {
  adminOk = await confirmAdmin();
  const clearAll = $('#clearAll');
  const rules = $('#rulesLink');
  const sign = $('#paintSign');
  if (clearAll) clearAll.hidden = !adminOk;
  if (rules) rules.hidden = !adminOk;
  if (sign) sign.textContent = memberSignedIn() ? 'Account' : 'Sign in';
  syncToggles();
}

function buildTools() {
  const box = $('#colors');
  if (!box) return;
  box.innerHTML = COLORS.map(c =>
    '<button type="button" class="swatch" data-color="' + c.hex + '" aria-label="' + c.label + '" aria-pressed="' + (c.hex === color) + '"><i></i></button>'
  ).join('');
  const custom = $('#customColor');
  if (custom) custom.value = color;
  paintSize();
}
function paintSize() {
  const dot = $('#sizeDot');
  const chip = $('#colorChip');
  const px = Math.max(4, Math.min(28, size));
  if (dot) {
    dot.style.width = px + 'px';
    dot.style.height = px + 'px';
    dot.style.setProperty('background', tool === 'eraser' ? '#e7e5e4' : color, 'important');
  }
  if (chip) chip.style.setProperty('background', color, 'important');
  const colorBtn = $('#colorBtn');
  if (colorBtn) colorBtn.dataset.color = color;
}
function syncToggles() {
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.color === color && tool !== 'eraser'));
  const brush = $('#brush');
  const eraser = $('#eraser');
  const pan = $('#pan');
  if (brush) brush.setAttribute('aria-pressed', tool === 'pen' && !panMode);
  if (eraser) eraser.setAttribute('aria-pressed', tool === 'eraser');
  if (pan) pan.setAttribute('aria-pressed', panMode);
  ['toolLine', 'toolRect', 'toolEllipse'].forEach(id => {
    const btn = $('#' + id);
    if (!btn) return;
    const name = id === 'toolLine' ? 'line' : id === 'toolRect' ? 'rect' : 'ellipse';
    btn.setAttribute('aria-pressed', tool === name);
  });
  paintSize();
}
function chooseTool(next) {
  tool = next;
  panMode = false;
  cancelStroke();
  syncToggles();
}

function resize() {
  const stage = $('#stage');
  const canvas = $('#pad');
  if (!stage || !canvas) return;
  const rect = stage.getBoundingClientRect();
  cssW = Math.max(1, rect.width);
  cssH = Math.max(1, rect.height);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (!fitted && cssW > 20 && cssH > 20) { fit(); fitted = true; }
  draw();
}
function fit() {
  const pad = 24;
  const s = Math.min((cssW - pad * 2) / BOARD, (cssH - pad * 2) / BOARD);
  camera.scale = Math.max(0.2, Math.min(8, s));
  camera.x = (cssW - BOARD * camera.scale) / 2;
  camera.y = (cssH - BOARD * camera.scale) / 2;
}
function zoomAt(sx, sy, next) {
  next = Math.max(0.2, Math.min(8, next));
  const wx = (sx - camera.x) / camera.scale;
  const wy = (sy - camera.y) / camera.scale;
  camera.scale = next;
  camera.x = sx - wx * camera.scale;
  camera.y = sy - wy * camera.scale;
  draw();
}
function toWorld(clientX, clientY) {
  const rect = $('#pad').getBoundingClientRect();
  const x = (clientX - rect.left - camera.x) / camera.scale;
  const y = (clientY - rect.top - camera.y) / camera.scale;
  return [
    Math.max(0, Math.min(9999, Math.round(x))),
    Math.max(0, Math.min(9999, Math.round(y)))
  ];
}
function visibleStrokes() {
  return strokes.concat([...remote.values()].sort((a, b) => a.t - b.t), [...pending.values()])
    .filter(s => !viewFloor || (s.t || 0) > viewFloor);
}
function traceStroke(ctx, s) {
  const p = s.pts;
  if (!p || p.length < 2) return;
  ctx.beginPath();
  if (s.tool === 'line') {
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  } else if (s.tool === 'rect') {
    const x = Math.min(p[0], p[p.length - 2]);
    const y = Math.min(p[1], p[p.length - 1]);
    ctx.rect(x, y, Math.abs(p[p.length - 2] - p[0]), Math.abs(p[p.length - 1] - p[1]));
  } else if (s.tool === 'ellipse') {
    const cx = (p[0] + p[p.length - 2]) / 2;
    const cy = (p[1] + p[p.length - 1]) / 2;
    const rx = Math.max(0.5, Math.abs(p[p.length - 2] - p[0]) / 2);
    const ry = Math.max(0.5, Math.abs(p[p.length - 1] - p[1]) / 2);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else if (p.length <= 4) {
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + 0.01, p[1]);
    if (p.length === 4) ctx.lineTo(p[2], p[3]);
  } else {
    ctx.moveTo(p[0], p[1]);
    let i = 2;
    for (; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.tool === 'eraser' ? PAPER : (s.color || '#1c1917');
  ctx.lineWidth = Math.max(1, s.size || 8);
  ctx.stroke();
}
function draw() {
  const canvas = $('#pad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = canvas.width / cssW;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.strokeStyle = '#eadfd2';
  ctx.lineWidth = 6 / camera.scale;
  ctx.strokeRect(0, 0, BOARD, BOARD);
  visibleStrokes().forEach(s => traceStroke(ctx, s));
  if (current) traceStroke(ctx, current);
  ctx.restore();
}
function addPoint(flat, x, y) {
  const n = flat.length;
  if (n >= 2) {
    const dx = x - flat[n - 2];
    const dy = y - flat[n - 1];
    if (dx * dx + dy * dy < 1.2) return;
  }
  flat.push(x, y);
}
function brushSize(e) {
  const base = tool === 'eraser' ? Math.max(12, size * 2) : size;
  if (e && e.pointerType === 'pen' && e.pressure > 0 && e.pressure < 1) return Math.max(1, base * (0.35 + e.pressure * 1.35));
  return base;
}
function startStroke(e) {
  const p = toWorld(e.clientX, e.clientY);
  current = { pts: p.slice(), tool: tool, color: color, size: brushSize(e), mine: true, t: Date.now() };
}
function extendStroke(e) {
  if (!current) return;
  if (SHAPES[current.tool]) {
    const p = toWorld(e.clientX, e.clientY);
    current.pts = [current.pts[0], current.pts[1], p[0], p[1]];
    draw();
    return;
  }
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  (events.length ? events : [e]).forEach(ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    addPoint(current.pts, p[0], p[1]);
  });
  if (e.pointerType === 'pen') current.size = brushSize(e);
  draw();
}
function endStroke() {
  if (!current) return;
  const stroke = current;
  current = null;
  const encoded = encodePoints(stroke.pts);
  const pts = decodePoints(encoded);
  if (pts.length < 2) { draw(); return; }
  stroke.pts = pts;
  redoStack.length = 0;
  if (live) enqueue(stroke);
  else { strokes.push(stroke); draw(); }
}
function cancelStroke() { current = null; draw(); }

function bindPointer() {
  const canvas = $('#pad');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* drawing still works */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      cancelStroke();
      const info = pinchInfo();
      pinch = { dist: info.dist, cx: info.cx, cy: info.cy, scale: camera.scale, x: camera.x, y: camera.y };
      return;
    }
    if (panMode) { pinch = { last: { x: e.clientX, y: e.clientY } }; return; }
    startStroke(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinch && pinch.dist) {
      const info = pinchInfo();
      const rect = canvas.getBoundingClientRect();
      const sx = info.cx - rect.left;
      const sy = info.cy - rect.top;
      const next = Math.max(0.2, Math.min(8, pinch.scale * (info.dist / pinch.dist)));
      const wx = (pinch.cx - rect.left - pinch.x) / pinch.scale;
      const wy = (pinch.cy - rect.top - pinch.y) / pinch.scale;
      camera.scale = next;
      camera.x = sx - wx * next;
      camera.y = sy - wy * next;
      draw();
      return;
    }
    if (panMode) {
      const prev = pinch && pinch.last;
      if (!prev) { pinch = { last: { x: e.clientX, y: e.clientY } }; return; }
      camera.x += e.clientX - prev.x;
      camera.y += e.clientY - prev.y;
      pinch.last = { x: e.clientX, y: e.clientY };
      draw();
      return;
    }
    extendStroke(e);
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0 && !panMode) endStroke();
    if (pointers.size === 1 && panMode) pinch = { last: [...pointers.values()][0] };
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch = null; cancelStroke(); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, camera.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });
}
function pinchInfo() {
  const pts = [...pointers.values()];
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return { dist: Math.max(1, Math.hypot(dx, dy)), cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
}
function cloneStroke(s) {
  return { pts: s.pts.slice(), tool: s.tool, color: s.color, size: s.size, mine: true, t: Date.now() };
}
function undo() {
  const list = visibleStrokes();
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].mine) continue;
    const stroke = list[i];
    const copy = cloneStroke(stroke);
    if (stroke.key && live) {
      aborted.add(stroke.key);
      pending.delete(stroke.key);
      remote.delete(stroke.key);
      draw();
      firebase.database().ref('board/s/' + stroke.key).remove().then(() => {
        redoStack.push(copy);
        setStatus('Undid your stroke.');
      }).catch(() => {
        setStatus('Could not undo that stroke.');
        listenStrokes();
      });
    } else {
      const idx = strokes.lastIndexOf(stroke);
      if (idx >= 0) strokes.splice(idx, 1);
      redoStack.push(copy);
      draw();
      setStatus('Undid your stroke.');
    }
    return;
  }
  setStatus('Nothing of yours to undo.');
}
function redo() {
  const stroke = redoStack.pop();
  if (!stroke) { setStatus('Nothing to redo.'); return; }
  stroke.t = Date.now();
  if (live) enqueue(stroke);
  else { strokes.push(stroke); draw(); }
  setStatus('Redid your stroke.');
}

function enqueue(stroke) {
  queue.push(stroke);
  pump();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length && live) {
    const stroke = queue[0];
    const result = await share(stroke);
    if (result === 'rate' && rateTries < 2) { rateTries += 1; await sleep(900); continue; }
    rateTries = 0;
    queue.shift();
    if (result === 'limit') { queue = []; toastStatus("You've used today's 40 strokes."); break; }
    if (result === 'error' || result === 'rate') { toastStatus('Could not share that stroke.'); break; }
  }
  pumping = false;
}
async function share(stroke) {
  const day = midnight(Date.now());
  let seq = 1;
  try {
    const snap = await firebase.database().ref('board/c/' + myUid).once('value');
    const cur = snap.val();
    if (cur && cur.day === day && cur.n >= 40) return 'limit';
    seq = cur && cur.day === day ? cur.n + 1 : 1;
  } catch { return 'error'; }
  const id = myUid + '_' + day + '_' + seq;
  const encoded = encodePoints(stroke.pts);
  if (!POINT_RE.test(encoded)) return 'error';
  const toolName = TOOLS[stroke.tool] ? stroke.tool : 'pen';
  const updates = {};
  updates['board/c/' + myUid] = { n: seq, day: day };
  updates['board/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  updates['board/s/' + id] = {
    author: myUid, seq: seq, day: day,
    t: firebase.database.ServerValue.TIMESTAMP,
    tool: toolName, color: String(stroke.color || '#1c1917').slice(0, 16), size: stroke.size, points: encoded
  };
  pending.set(id, { key: id, pts: decodePoints(encoded), tool: toolName, color: stroke.color, size: stroke.size, mine: true, t: Date.now() });
  draw();
  try {
    await firebase.database().ref().update(updates);
    if (aborted.has(id)) {
      aborted.delete(id);
      pending.delete(id);
      draw();
      await firebase.database().ref('board/s/' + id).remove();
    }
    return 'ok';
  } catch (err) {
    pending.delete(id);
    draw();
    const code = String(err && err.code || '');
    if (code.indexOf('PERMISSION_DENIED') >= 0) return 'rate';
    return 'error';
  }
}

function fromSnap(snap) {
  const v = snap.val() || {};
  const pts = decodePoints(v.points);
  if (!pts.length) return null;
  return {
    key: snap.key,
    pts: pts,
    tool: TOOLS[v.tool] ? v.tool : 'pen',
    color: v.color,
    size: v.size,
    mine: v.author === myUid,
    t: typeof v.t === 'number' ? v.t : 0
  };
}
function listenStrokes() {
  if (strokeQuery) strokeQuery.off();
  const start = Math.max(Date.now() - DAY, (clearedAt || 0) - 120000);
  strokeQuery = firebase.database().ref('board/s').orderByChild('t').startAt(start + 0.1).limitToLast(400);
  remote.clear();
  const add = snap => {
    const stroke = fromSnap(snap);
    if (!stroke) return;
    pending.delete(snap.key);
    remote.set(snap.key, stroke);
    draw();
  };
  strokeQuery.on('child_added', add, () => toastStatus('Could not load the shared board.'));
  strokeQuery.on('child_removed', snap => { remote.delete(snap.key); pending.delete(snap.key); draw(); });
}
function onlineCount(snap) {
  const now = Date.now();
  let n = 0;
  snap.forEach(ch => { if (now - Number(ch.child('t').val() || 0) < 180000) n += 1; });
  const label = n === 1 ? '1 person online' : n + ' people online';
  setStatus('Live · ' + label);
}
async function setPresence(uid) {
  if (presenceRef) {
    const old = presenceRef;
    presenceRef = null;
    try { await old.remove(); } catch { /* already gone */ }
  }
  if (heart) { clearInterval(heart); heart = null; }
  presenceRef = firebase.database().ref('board/presence/' + uid);
  try {
    await presenceRef.onDisconnect().remove();
    await presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP });
  } catch { /* presence is optional */ }
  armHeart();
}
function pulsePresence() {
  if (document.hidden || !presenceRef) return;
  presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
}
function armHeart() {
  if (heart) { clearInterval(heart); heart = null; }
  if (document.hidden || !presenceRef) return;
  heart = setInterval(pulsePresence, 45000);
}
function connect() {
  const config = window.MONDO_BOARD_CONFIG;
  try { firebase.initializeApp(config); }
  catch (err) { setStatus('On this device only.'); return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      try { await firebase.auth().signInAnonymously(); }
      catch { setStatus('On this device only.'); }
      return;
    }
    myUid = user.uid;
    live = true;
    refreshChrome();
    setStatus('Connecting…');
    await setPresence(user.uid);
    firebase.database().ref('board/presence').on('value', onlineCount);
    firebase.database().ref('board/meta/clearedAt').on('value', snap => {
      clearedAt = Number(snap.val() || 0);
      listenStrokes();
    });
  });
}
async function clearMine() {
  const local = strokes.slice();
  const shared = [...remote.values(), ...pending.values()].filter(s => s.mine && s.key);
  if (!local.length && !shared.length) { setStatus('No strokes of yours to clear.'); return; }
  if (live && shared.length) {
    const updates = {};
    shared.forEach(s => { updates['board/s/' + s.key] = null; });
    try {
      await firebase.database().ref().update(updates);
      shared.forEach(s => { remote.delete(s.key); pending.delete(s.key); });
    } catch {
      setStatus('Could not clear your strokes.');
      return;
    }
  }
  strokes = [];
  redoStack.length = 0;
  draw();
  setStatus('Cleared your strokes.');
}
function clearView() {
  viewFloor = Date.now();
  strokes = [];
  pending.clear();
  current = null;
  redoStack.length = 0;
  draw();
  setStatus('Cleared this view on this device.');
}
async function clearEveryone() {
  if (!await confirmAdmin()) { setStatus('Only an admin can clear the board for everyone.'); return; }
  if (!confirm('Clear the board for everyone?')) return;
  try {
    await firebase.database().ref('board/meta/clearedAt').set(firebase.database.ServerValue.TIMESTAMP);
    setStatus('Cleared the board for everyone.');
  } catch { setStatus('Could not clear the board for everyone.'); }
}
function downloadPng() {
  const out = document.createElement('canvas');
  const side = 1200;
  out.width = side;
  out.height = side;
  const ctx = out.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, side, side);
  ctx.save();
  ctx.scale(side / BOARD, side / BOARD);
  visibleStrokes().forEach(s => traceStroke(ctx, s));
  ctx.restore();
  const link = document.createElement('a');
  link.href = out.toDataURL('image/png');
  link.download = 'mondopaint.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setStatus('Downloaded the board as a PNG.');
}
function closePops() {
  const colorPop = $('#colorPop');
  const more = $('#moreMenu');
  const colorBtn = $('#colorBtn');
  const moreBtn = $('#moreBtn');
  if (colorPop) colorPop.hidden = true;
  if (more) more.hidden = true;
  if (colorBtn) colorBtn.setAttribute('aria-expanded', 'false');
  if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
}
function togglePop(id, btn) {
  const pop = $(id);
  const open = pop.hidden;
  closePops();
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function init() {
  buildTools();
  bindPointer();
  $('#colors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    const custom = $('#customColor');
    if (custom) custom.value = color;
    if (tool === 'eraser' || panMode) tool = 'pen';
    panMode = false;
    syncToggles();
  });
  $('#customColor').addEventListener('input', e => {
    color = e.target.value;
    if (tool === 'eraser') tool = 'pen';
    panMode = false;
    syncToggles();
  });
  $('#sizeRange').addEventListener('input', e => {
    size = Number(e.target.value) || 8;
    paintSize();
  });
  $('#brush').onclick = () => chooseTool('pen');
  $('#eraser').onclick = () => { tool = tool === 'eraser' ? 'pen' : 'eraser'; panMode = false; syncToggles(); };
  $('#pan').onclick = () => { panMode = !panMode; if (panMode) cancelStroke(); syncToggles(); };
  $('#toolLine').onclick = () => chooseTool('line');
  $('#toolRect').onclick = () => chooseTool('rect');
  $('#toolEllipse').onclick = () => chooseTool('ellipse');
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  $('#zoomFit').onclick = () => { fit(); draw(); setStatus('Fit the page.'); };
  $('#clearMine').onclick = clearMine;
  $('#clearView').onclick = clearView;
  $('#clearAll').onclick = clearEveryone;
  $('#download').onclick = downloadPng;
  $('#paintSign').onclick = () => {
    if (window.MONDO_MEMBER && window.MONDO_MEMBER.open) window.MONDO_MEMBER.open();
  };
  $('#colorBtn').onclick = () => togglePop('#colorPop', $('#colorBtn'));
  $('#moreBtn').onclick = () => { refreshChrome(); togglePop('#moreMenu', $('#moreBtn')); };
  document.addEventListener('click', e => {
    if (e.target.closest('#colorPop') || e.target.closest('#colorBtn')) return;
    if (e.target.closest('#moreMenu') || e.target.closest('#moreBtn')) return;
    closePops();
  });
  document.addEventListener('mondo-owner', () => refreshChrome());
  document.addEventListener('mondo-member', () => refreshChrome());
  window.addEventListener('keydown', e => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  });
  new ResizeObserver(resize).observe($('#stage'));
  resize();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (heart) { clearInterval(heart); heart = null; }
      return;
    }
    if (!presenceRef) return;
    pulsePresence();
    armHeart();
  });
  if (configured()) connect();
  else setStatus('On this device only.');
  refreshChrome();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { encodePoints, decodePoints, POINT_RE, midnight, COLORS };
}
})();
