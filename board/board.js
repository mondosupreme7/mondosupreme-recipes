(() => {
'use strict';
const BOARD = 2400;
const COLORS = [
  { id: 'ink', hex: '#2d2420', label: 'Ink' },
  { id: 'red', hex: '#c8553d', label: 'Red' },
  { id: 'orange', hex: '#f28f3b', label: 'Orange' },
  { id: 'green', hex: '#2f6f4e', label: 'Green' },
  { id: 'blue', hex: '#2458a6', label: 'Blue' }
];
const SIZES = [3, 8, 16];
const ERASER_SIZE = 28;
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
let strokeQuery = null;
let presenceRef = null;
let heart = null;
const pending = new Map();
const remote = new Map();
const aborted = new Set();
let queue = [];
let pumping = false;
let rateTries = 0;

function configured() {
  const c = window.MONDO_BOARD_CONFIG;
  return !!(c && c.apiKey && c.authDomain && c.databaseURL && c.projectId && c.appId);
}
function ownerEmail() {
  return String(window.MONDO_BOARD_OWNER || '').toLowerCase();
}
function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}
function toastStatus(text) { setStatus(text); }

function buildTools() {
  $('#colors').innerHTML = COLORS.map(c =>
    '<button type="button" class="swatch swatch-' + c.id + '" data-color="' + c.hex + '" aria-label="' + c.label + '" aria-pressed="' + (c.hex === color) + '"></button>'
  ).join('');
  $('#sizes').innerHTML = SIZES.map(n =>
    '<button type="button" class="size" data-size="' + n + '" aria-label="Size ' + n + '" aria-pressed="' + (n === size) + '"><i class="dot-' + n + '"></i></button>'
  ).join('');
}
function syncToggles() {
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.color === color && tool === 'pen'));
  document.querySelectorAll('.size').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.size) === size && tool === 'pen'));
  $('#eraser').setAttribute('aria-pressed', tool === 'eraser');
  $('#pan').setAttribute('aria-pressed', panMode);
}

function resize() {
  const stage = $('#stage');
  const canvas = $('#pad');
  const rect = stage.getBoundingClientRect();
  cssW = Math.max(1, rect.width);
  cssH = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (!fitted && cssW > 20 && cssH > 20) { fit(); fitted = true; }
  draw();
}
function fit() {
  const pad = 16;
  const s = Math.min((cssW - pad * 2) / BOARD, (cssH - pad * 2) / BOARD);
  camera.scale = Math.max(0.35, Math.min(8, s));
  camera.x = (cssW - BOARD * camera.scale) / 2;
  camera.y = (cssH - BOARD * camera.scale) / 2;
}
function zoomAt(sx, sy, next) {
  next = Math.max(0.35, Math.min(8, next));
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
  return strokes.concat([...remote.values()].sort((a, b) => a.t - b.t), [...pending.values()]);
}
function drawStroke(ctx, s) {
  if (!s.pts || s.pts.length < 2) return;
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.tool === 'eraser' ? PAPER : s.color;
  ctx.lineWidth = s.size;
  ctx.moveTo(s.pts[0], s.pts[1]);
  if (s.pts.length === 2) ctx.lineTo(s.pts[0] + 0.01, s.pts[1]);
  else for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
  ctx.stroke();
}
function draw() {
  const canvas = $('#pad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = canvas.width / cssW;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#e7d3c4';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.strokeStyle = '#eadfd2';
  ctx.lineWidth = 6 / camera.scale;
  ctx.strokeRect(0, 0, BOARD, BOARD);
  visibleStrokes().forEach(s => drawStroke(ctx, s));
  if (current) drawStroke(ctx, current);
  ctx.restore();
}
function addPoint(flat, x, y) {
  const n = flat.length;
  if (n >= 2) {
    const dx = x - flat[n - 2];
    const dy = y - flat[n - 1];
    if (dx * dx + dy * dy < 2) return;
  }
  flat.push(x, y);
}
function startStroke(e) {
  const p = toWorld(e.clientX, e.clientY);
  current = { pts: p, tool, color, size: tool === 'eraser' ? ERASER_SIZE : size, mine: true, t: Date.now() };
}
function extendStroke(e) {
  if (!current) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  (events.length ? events : [e]).forEach(ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    addPoint(current.pts, p[0], p[1]);
  });
  draw();
}
function endStroke() {
  if (!current) return;
  const stroke = current;
  current = null;
  const encoded = encodePoints(stroke.pts);
  const pts = decodePoints(encoded);
  if (!pts.length) { draw(); return; }
  stroke.pts = pts;
  if (live) enqueue(stroke);
  else { strokes.push(stroke); draw(); }
}
function cancelStroke() { current = null; draw(); }

function bindPointer() {
  const canvas = $('#pad');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* drawing still works if the pointer cannot be captured */ }
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
    const spot = toWorld(e.clientX, e.clientY);
    const coords = $('#coords');
    if (coords) coords.textContent = spot[0] + ', ' + spot[1];
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinch && pinch.dist) {
      const info = pinchInfo();
      const rect = canvas.getBoundingClientRect();
      const sx = info.cx - rect.left;
      const sy = info.cy - rect.top;
      const next = Math.max(0.35, Math.min(8, pinch.scale * (info.dist / pinch.dist)));
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

function undo() {
  const list = visibleStrokes();
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].mine) continue;
    const stroke = list[i];
    if (stroke.key && live) {
      aborted.add(stroke.key);
      const acked = remote.has(stroke.key);
      pending.delete(stroke.key);
      remote.delete(stroke.key);
      firebase.database().ref('board/s/' + stroke.key).remove().catch(() => {
        if (acked) toastStatus('Could not undo that stroke.');
      });
    } else {
      const idx = strokes.lastIndexOf(stroke);
      if (idx >= 0) strokes.splice(idx, 1);
    }
    draw();
    return;
  }
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
  const updates = {};
  updates['board/c/' + myUid] = { n: seq, day: day };
  updates['board/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  updates['board/s/' + id] = {
    author: myUid, seq: seq, day: day,
    t: firebase.database.ServerValue.TIMESTAMP,
    tool: stroke.tool, color: stroke.color, size: stroke.size, points: encoded
  };
  pending.set(id, { key: id, pts: decodePoints(encoded), tool: stroke.tool, color: stroke.color, size: stroke.size, mine: true, t: Date.now() });
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
    tool: v.tool === 'eraser' ? 'eraser' : 'pen',
    color: v.color,
    size: v.size,
    mine: v.author === myUid,
    t: typeof v.t === 'number' ? v.t : 0
  };
}
function listenStrokes() {
  if (strokeQuery) strokeQuery.off();
  const start = Math.max(Date.now() - DAY, (clearedAt || 0) - 120000);
  // A whole-number startAt fails the rules' >= check. A fraction is accepted.
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
function updateOwnerUi(user) {
  const email = user && user.email ? user.email.toLowerCase() : '';
  const isOwner = email && email === ownerEmail();
  $('#clear').hidden = !isOwner;
  $('#owner').hidden = !live;
  if (!window.MONDO_MEMBER) $('#owner').textContent = isOwner ? 'Sign out' : 'Owner';
}
function connect() {
  const config = window.MONDO_BOARD_CONFIG;
  try { firebase.initializeApp(config); }
  catch (err) { setStatus('On this device only. Live sharing is not connected yet.'); return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      try { await firebase.auth().signInAnonymously(); }
      catch { setStatus('On this device only. Anonymous sign-in is not enabled yet.'); }
      return;
    }
    myUid = user.uid;
    live = true;
    updateOwnerUi(user);
    setStatus('Connecting…');
    await setPresence(user.uid);
    firebase.database().ref('board/presence').on('value', onlineCount);
    firebase.database().ref('board/meta/clearedAt').on('value', snap => {
      clearedAt = Number(snap.val() || 0);
      listenStrokes();
    });
  });
}
async function signInOwner(email, password) {
  await firebase.auth().signInWithEmailAndPassword(email, password);
}
async function signOutOwner() {
  await firebase.auth().signOut();
  live = false;
  remote.clear();
  pending.clear();
  if (strokeQuery) strokeQuery.off();
  try { await firebase.auth().signInAnonymously(); }
  catch { setStatus('Signed out.'); }
}
async function clearBoard() {
  if (!confirm('Clear the board for everyone?')) return;
  try {
    await firebase.database().ref('board/meta/clearedAt').set(firebase.database.ServerValue.TIMESTAMP);
    toastStatus('Board cleared.');
  } catch { toastStatus('Could not clear the board.'); }
}

function init() {
  buildTools();
  bindPointer();
  $('#colors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    tool = 'pen';
    panMode = false;
    syncToggles();
  });
  $('#sizes').addEventListener('click', e => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    size = Number(b.dataset.size);
    tool = 'pen';
    panMode = false;
    syncToggles();
  });
  $('#eraser').onclick = () => { tool = tool === 'eraser' ? 'pen' : 'eraser'; panMode = false; syncToggles(); };
  $('#pan').onclick = () => { panMode = !panMode; if (panMode) cancelStroke(); syncToggles(); };
  $('#undo').onclick = undo;
  $('#zoomIn').onclick = () => zoomAt(cssW / 2, cssH / 2, camera.scale * 1.2);
  $('#zoomOut').onclick = () => zoomAt(cssW / 2, cssH / 2, camera.scale / 1.2);
  $('#zoomFit').onclick = () => { fit(); draw(); };
  $('#clear').onclick = clearBoard;
  $('#owner').onclick = () => {
    const user = firebase.auth().currentUser;
    if (user && user.email && user.email.toLowerCase() === ownerEmail()) { signOutOwner(); return; }
    $('#ownerError').hidden = true;
    $('#ownerPass').value = '';
    $('#ownerEmail').value = ownerEmail();
    $('#ownerDialog').showModal();
  };
  $('#ownerCancel').onclick = () => $('#ownerDialog').close();
  $('#ownerForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#ownerError').hidden = true;
    try {
      await signInOwner($('#ownerEmail').value.trim(), $('#ownerPass').value);
      $('#ownerPass').value = '';
      $('#ownerDialog').close();
    } catch (err) {
      $('#ownerPass').value = '';
      const code = String(err && err.code || '');
      $('#ownerError').textContent = code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 || code.indexOf('user-not-found') >= 0
        ? 'That email or password is wrong.'
        : 'Could not sign in.';
      $('#ownerError').hidden = false;
    }
  });
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
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
  else setStatus('On this device only. Live sharing is not connected yet.');
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { encodePoints, decodePoints, POINT_RE, midnight, COLORS, SIZES, ERASER_SIZE };
}
})();
