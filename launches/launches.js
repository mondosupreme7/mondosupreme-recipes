(() => {
'use strict';
const KEY = 'mondosupreme.launches.v1';
const API = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=12';
const PADS = {
  'LC-39A': { bearing: 48, look: 'northeast', boom: 'about 3 to 5 minutes after liftoff on an eastbound path', x: 250, y: 78 },
  'SLC-41': { bearing: 62, look: 'northeast', boom: 'about 3 to 4 minutes after liftoff', x: 268, y: 118 },
  'SLC-40': { bearing: 84, look: 'east', boom: 'about 2 to 4 minutes after liftoff', x: 286, y: 168 }
};
const BACKUP = [
  ['Falcon 9 · Starlink group', '2026-11-03T13:30:00Z', 'SLC-40', 'SpaceX', 'Falcon 9'],
  ['Falcon 9 · commercial rideshare', '2026-11-12T08:00:00Z', 'LC-39A', 'SpaceX', 'Falcon 9'],
  ['Vulcan Centaur · national security', '2026-11-20T11:00:00Z', 'SLC-41', 'ULA', 'Vulcan'],
  ['Artemis II · NASA crew watch', '2026-12-15T12:00:00Z', 'LC-39A', 'NASA', 'SLS'],
  ['Falcon 9 · Starlink', '2026-12-28T02:10:00Z', 'SLC-40', 'SpaceX', 'Falcon 9'],
  ['Starship · KSC pad watch', '2027-01-20T15:00:00Z', 'LC-39A', 'SpaceX', 'Starship'],
  ['Falcon 9 · cargo Dragon', '2027-02-08T09:40:00Z', 'LC-39A', 'NASA / SpaceX', 'Falcon 9'],
  ['Vulcan Centaur · USSF', '2027-03-04T13:00:00Z', 'SLC-41', 'ULA', 'Vulcan']
];
const $ = s => document.querySelector(s);
let rows = [], picked = 0, timer = 0, uid = '', rulesBlocked = false;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function padOf(name) {
  const text = String(name || '');
  if (/40/.test(text)) return 'SLC-40';
  if (/41/.test(text)) return 'SLC-41';
  if (/39/.test(text)) return 'LC-39A';
  return 'LC-39A';
}
function futureNet(iso) {
  const start = new Date(iso);
  if (isNaN(start.getTime())) return new Date(Date.now() + 86400000).toISOString();
  const now = Date.now();
  const next = new Date(start.getTime());
  while (next.getTime() < now + 3600000) next.setUTCMonth(next.getUTCMonth() + 3);
  return next.toISOString();
}
function backupRows() {
  return BACKUP.map(row => ({
    name: row[0],
    net: futureNet(row[1]),
    pad: row[2],
    provider: row[3],
    rocket: row[4],
    status: 'Backup schedule',
    backup: true
  }));
}
function fromApi(row) {
  const padName = (row.pad && row.pad.name) || '';
  const provider = row.launch_service_provider && row.launch_service_provider.name || '';
  const rocket = row.rocket && row.rocket.configuration && row.rocket.configuration.name || '';
  return {
    name: row.name || 'Launch',
    net: row.net || row.window_start || '',
    pad: padOf(padName),
    padLabel: padName,
    provider,
    rocket,
    status: (row.status && (row.status.abbrev || row.status.name)) || 'Upcoming',
    backup: false
  };
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { sightings: [] }; }
  catch { return { sightings: [] }; }
}
function saveLocal(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full */ }
}
function fmtClock(ms) {
  const sign = ms < 0 ? 'T+' : 'T-';
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor(abs / 3600000) % 24;
  const m = Math.floor(abs / 60000) % 60;
  const s = Math.floor(abs / 1000) % 60;
  const p = n => String(n).padStart(2, '0');
  return sign + d + 'd ' + p(h) + ':' + p(m) + ':' + p(s);
}
function paintClock() {
  const row = rows[picked];
  const el = $('#lcd');
  if (!el || !row) return;
  const when = new Date(row.net);
  const ms = when.getTime() - Date.now();
  el.innerHTML = fmtClock(ms) + '<small>' + esc(row.name) + ' · ' + esc(row.pad) + '</small>';
}
function paintGuide() {
  const row = rows[picked];
  const box = $('#guide');
  if (!box || !row) return;
  const info = PADS[row.pad] || PADS['LC-39A'];
  const when = new Date(row.net);
  box.innerHTML = '<p><b>' + esc(row.name) + '</b> ' + esc(row.rocket) + ' from ' + esc(row.pad) + (row.backup ? ' (curated backup, not a live range time).' : '.') + '</p>'
    + '<ul><li>From Cocoa 32927, look <b>' + info.look + '</b>, about <b>' + info.bearing + '°</b> on a compass. That is toward the Cape, past Port Canaveral.</li>'
    + '<li>Liftoff window: <b>' + esc(when.toLocaleString()) + '</b>.</li>'
    + '<li>The sonic boom, when one reaches the mainland, is usually ' + info.boom + '. Windows can rattle. This is a backyard guide, not a flight product.</li>'
    + '<li>Jetty Park and the Port Canaveral cruise viewing spots face the same east and northeast sky.</li></ul>';
  document.querySelectorAll('[data-pad]').forEach(node => {
    node.setAttribute('fill', node.getAttribute('data-pad') === row.pad ? '#ffd100' : '#7fdfff');
  });
}
function paintList() {
  const box = $('#cards');
  if (!box) return;
  box.replaceChildren();
  rows.forEach((row, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    const when = new Date(row.net);
    card.innerHTML = '<b>' + esc(row.name) + '</b><span>' + esc(row.provider) + ' · ' + esc(row.rocket) + ' · ' + esc(row.pad) + '</span><br><span>'
      + esc(isNaN(when.getTime()) ? row.net : when.toLocaleString()) + ' · ' + esc(row.status) + (row.backup ? ' · backup' : '') + '</span>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = i === picked ? 'Tracking this one' : 'Track T-minus';
    btn.addEventListener('click', () => { picked = i; paintList(); paintGuide(); paintClock(); });
    card.appendChild(btn);
    box.appendChild(card);
  });
}
function paintSightings(list) {
  const ul = $('#sightings');
  if (!ul) return;
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = 'No check-ins yet. Be the first window-rattler.';
    ul.appendChild(li);
    return;
  }
  list.slice().reverse().forEach(item => {
    const li = document.createElement('li');
    const when = item.at ? new Date(item.at).toLocaleString() : '';
    li.textContent = (item.name || 'Guest') + ' · pad ' + (item.pad || '') + ' · looked ' + (item.look || '') + ' · ' + (item.note || '') + (when ? ' · ' + when : '');
    ul.appendChild(li);
  });
}
async function loadLaunches() {
  const status = $('#launchStatus');
  if (status) status.textContent = 'Calling Launch Library 2…';
  let live = [];
  try {
    const ctrl = new AbortController();
    const stop = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(API, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(stop);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    live = (data.results || []).map(fromApi).filter(row => row.net);
  } catch { live = []; }
  rows = live.length ? live : backupRows();
  picked = 0;
  const backupNote = $('#launchBackup');
  if (backupNote) backupNote.hidden = !!live.length;
  if (status) status.textContent = live.length ? ('Live schedule · ' + live.length + ' upcoming Space Coast launches.') : 'Live data unavailable, showing backup schedule';
  paintList();
  paintGuide();
  paintClock();
}
function bootFirebase() {
  const c = window.MONDO_BOARD_CONFIG;
  if (typeof firebase === 'undefined' || !c) return;
  try { if (!firebase.apps.length) firebase.initializeApp(c); } catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      try { await firebase.auth().signInAnonymously(); } catch { /* local log still works */ }
      return;
    }
    uid = user.uid;
    firebase.database().ref('launches/sightings').limitToLast(30).on('value', snap => {
      rulesBlocked = false;
      const val = snap.val() || {};
      paintSightings(Object.keys(val).map(id => val[id]));
      const banner = $('#syncBanner');
      if (banner) banner.hidden = true;
    }, () => {
      rulesBlocked = true;
      const banner = $('#syncBanner');
      if (banner) banner.hidden = false;
      paintSightings(loadLocal().sightings || []);
    });
  });
}
async function checkIn(event) {
  event.preventDefault();
  let name = ($('#seeName').value || 'Guest').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 16);
  if (!/^[A-Za-z][A-Za-z0-9 ]{0,15}$/.test(name)) name = 'Guest';
  const pad = $('#seePad').value;
  const look = $('#seeLook').value;
  const note = $('#seeNote').value.replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
  if (note.length < 2) return;
  const local = loadLocal();
  const item = { name, pad, look, note, at: Date.now() };
  local.sightings = (local.sightings || []).concat(item).slice(-40);
  saveLocal(local);
  paintSightings(local.sightings);
  $('#seeNote').value = '';
  if (!uid || rulesBlocked || typeof firebase === 'undefined') return;
  const ref = firebase.database().ref('launches/sightings').push();
  try {
    await ref.set({
      name, pad, look, note, author: uid, at: firebase.database.ServerValue.TIMESTAMP
    });
  } catch { rulesBlocked = true; const banner = $('#syncBanner'); if (banner) banner.hidden = false; }
}
function init() {
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  rows = backupRows();
  paintList();
  paintGuide();
  paintClock();
  paintSightings(loadLocal().sightings || []);
  timer = setInterval(paintClock, 250);
  $('#sightForm').addEventListener('submit', checkIn);
  loadLaunches();
  bootFirebase();
}
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('pagehide', () => { if (timer) clearInterval(timer); });
})();
