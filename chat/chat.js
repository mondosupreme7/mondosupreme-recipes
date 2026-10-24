(() => {
'use strict';
const NAME_KEY = 'mondosupreme.chat.name';
const DAY = 86400000;
const WEEK = 7 * DAY;
const MAX_DAY = 60;
const MAX_NAME = 24;
const MAX_TEXT = 500;
const BAD = /\b(fucks?|fucking|fucker|shits?|shitty|bitches|bitch|assholes?|cunts?|dicks?|nigg(?:er|a)s?|chinks?|spics?|kikes?|faggots?|faggot|trann(?:y|ies)|retards?|sluts?|whores?)\b/i;

function blocked(text) {
  const n = String(text || '').toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/\$/g, 's')
    .replace(/3/g, 'e')
    .replace(/[^a-z]+/g, ' ');
  return BAD.test(n);
}
function cleanName(s) {
  return String(s || '').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}
function cleanText(s) {
  return String(s || '').replace(/[\r\n]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_TEXT);
}
function midnight(ms) { return Math.floor(ms / DAY) * DAY; }
function formatTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function linkify(parent, text) {
  const re = /https?:\/\/[^\s]+/gi;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    let raw = match[0];
    let trail = '';
    while (raw && /[.,!?;:)\]'"]$/.test(raw)) {
      trail = raw.slice(-1) + trail;
      raw = raw.slice(0, -1);
    }
    let safe = null;
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') safe = url.href;
    } catch { safe = null; }
    if (safe) {
      const a = document.createElement('a');
      a.href = safe;
      a.rel = 'noopener noreferrer nofollow ugc';
      a.target = '_blank';
      a.textContent = raw;
      parent.appendChild(a);
    } else parent.appendChild(document.createTextNode(raw));
    if (trail) parent.appendChild(document.createTextNode(trail));
    last = match.index + match[0].length;
  }
  parent.appendChild(document.createTextNode(text.slice(last)));
}

const $ = s => document.querySelector(s);
const messages = new Map();
const banList = new Map();
let myUid = 'local';
let live = false;
let banned = false;
let isOwner = false;
let clearedAt = 0;
let messageQuery = null;
let presenceRef = null;
let presenceListen = null;
let banListen = null;
let banListListen = null;
let clearListen = null;
let heart = null;
let queue = [];
let pumping = false;
let rateTries = 0;
let paint = 0;
let people = 0;

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
function refreshStatus() {
  if (!live) { setStatus('On this device only. Live chat is not connected yet.'); return; }
  const label = people === 1 ? '1 person here' : people + ' people here';
  setStatus(banned ? "You can't post in this room. · " + label : 'Live · ' + label);
}
function nearBottom() {
  const log = $('#log');
  if (!log) return true;
  return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
}
function scrollDown() {
  const log = $('#log');
  if (log) log.scrollTop = log.scrollHeight;
}
function scheduleRender(stick) {
  const follow = stick || nearBottom();
  if (paint) cancelAnimationFrame(paint);
  paint = requestAnimationFrame(() => {
    paint = 0;
    render(follow);
  });
}
function render(follow) {
  const log = $('#log');
  if (!log) return;
  const items = [...messages.values()].filter(Boolean).sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  log.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = 'No messages yet.';
    log.appendChild(empty);
  } else items.forEach(msg => log.appendChild(renderMessage(msg)));
  renderBans();
  if (follow) scrollDown();
}
function renderMessage(msg) {
  const art = document.createElement('article');
  art.className = 'msg';
  art.dataset.id = msg.id;
  const head = document.createElement('header');
  const name = document.createElement('strong');
  name.className = 'msg-name';
  name.textContent = msg.name;
  const time = document.createElement('time');
  const when = new Date(msg.t);
  if (!Number.isNaN(when.getTime())) time.dateTime = when.toISOString();
  time.textContent = formatTime(msg.t);
  head.append(name, time);
  if (isOwner && live) {
    const actions = document.createElement('span');
    actions.className = 'msg-actions';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'msg-act';
    del.textContent = 'Remove';
    del.addEventListener('click', () => removeMessage(msg));
    const ban = document.createElement('button');
    ban.type = 'button';
    ban.className = 'msg-act';
    ban.textContent = 'Ban';
    ban.addEventListener('click', () => banUser(msg));
    actions.append(del, ban);
    head.append(actions);
  }
  const body = document.createElement('p');
  body.className = 'msg-text';
  linkify(body, msg.text);
  art.append(head, body);
  return art;
}
function renderBans() {
  const box = $('#bans');
  if (!box) return;
  if (!isOwner || !live || !banList.size) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  box.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Blocked';
  const list = document.createElement('ul');
  [...banList.keys()].sort().forEach(uid => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = uid.slice(0, 6) + '…' + uid.slice(-4);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msg-act';
    btn.textContent = 'Unban';
    btn.addEventListener('click', () => unbanUser(uid));
    li.append(label, btn);
    list.appendChild(li);
  });
  box.append(title, list);
}

function loadName() {
  try { return cleanName(localStorage.getItem(NAME_KEY) || ''); }
  catch { return ''; }
}
function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
}

function postLocal(name, text) {
  const id = 'local-' + Date.now() + '-' + messages.size;
  messages.set(id, { id, author: 'local', name, text, t: Date.now() });
  scheduleRender(true);
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length && live) {
    const item = queue[0];
    const result = await share(item);
    if (result === 'rate' && rateTries < 2) { rateTries += 1; await sleep(2100); continue; }
    rateTries = 0;
    queue.shift();
    if (result === 'limit') { queue = []; setStatus("You've used today's 60 messages."); break; }
    if (result === 'banned') { queue = []; banned = true; refreshStatus(); break; }
    if (result === 'error' || result === 'rate') { setStatus('Could not send that message.'); break; }
  }
  pumping = false;
  if (live && !queue.length) refreshStatus();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function share(item) {
  const day = midnight(Date.now());
  let seq = 1;
  try {
    const snap = await firebase.database().ref('chat/c/' + myUid).once('value');
    const cur = snap.val();
    if (cur && cur.day === day && cur.n >= MAX_DAY) return 'limit';
    seq = cur && cur.day === day ? cur.n + 1 : 1;
  } catch { return 'error'; }
  const id = myUid + '_' + day + '_' + seq;
  const updates = {};
  updates['chat/c/' + myUid] = { n: seq, day: day };
  updates['chat/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  updates['chat/m/' + id] = {
    author: myUid, name: item.name, text: item.text, seq: seq, day: day,
    t: firebase.database.ServerValue.TIMESTAMP
  };
  messages.set(id, { id, author: myUid, name: item.name, text: item.text, t: Date.now() });
  scheduleRender(true);
  try {
    await firebase.database().ref().update(updates);
    return 'ok';
  } catch (err) {
    messages.delete(id);
    scheduleRender(true);
    const code = String(err && err.code || '');
    if (code.indexOf('PERMISSION_DENIED') < 0) return 'error';
    try {
      const ban = await firebase.database().ref('chat/bans/' + myUid).once('value');
      if (ban.val() === true) return 'banned';
    } catch { /* fall through to rate */ }
    return 'rate';
  }
}
function fromSnap(snap) {
  const v = snap.val() || {};
  if (typeof v.text !== 'string' || typeof v.name !== 'string') return null;
  const text = cleanText(v.text);
  const name = cleanName(v.name);
  if (!text || !name) return null;
  return {
    id: snap.key,
    author: typeof v.author === 'string' ? v.author : '',
    name: name,
    text: text,
    t: typeof v.t === 'number' ? v.t : 0
  };
}
function offRoom() {
  if (messageQuery) { messageQuery.off(); messageQuery = null; }
  if (presenceListen) { presenceListen.off(); presenceListen = null; }
  if (banListen) { banListen.off(); banListen = null; }
  if (banListListen) { banListListen.off(); banListListen = null; }
  if (clearListen) { clearListen.off(); clearListen = null; }
}
function listenMessages() {
  if (messageQuery) messageQuery.off();
  messages.clear();
  const start = Math.max(Date.now() - WEEK, (clearedAt || 0) - 120000);
  messageQuery = firebase.database().ref('chat/m').orderByChild('t').startAt(start).limitToLast(200);
  const add = snap => {
    const msg = fromSnap(snap);
    if (!msg) return;
    messages.set(snap.key, msg);
    scheduleRender(false);
  };
  messageQuery.on('child_added', add, () => setStatus('Could not load the room.'));
  messageQuery.on('child_removed', snap => { messages.delete(snap.key); scheduleRender(false); });
}
function onlineCount(snap) {
  const now = Date.now();
  let n = 0;
  snap.forEach(ch => { if (now - Number(ch.child('t').val() || 0) < 180000) n += 1; });
  people = n;
  refreshStatus();
}
async function setPresence(uid) {
  if (presenceRef) {
    const old = presenceRef;
    presenceRef = null;
    try { await old.remove(); } catch { /* already gone */ }
  }
  if (heart) { clearInterval(heart); heart = null; }
  presenceRef = firebase.database().ref('chat/presence/' + uid);
  try {
    await presenceRef.onDisconnect().remove();
    await presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP });
  } catch { /* presence is optional */ }
  heart = setInterval(() => {
    if (presenceRef) presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
  }, 45000);
}
function updateOwnerUi(user) {
  const email = user && user.email ? user.email.toLowerCase() : '';
  isOwner = !!(email && email === ownerEmail());
  document.body.classList.toggle('is-owner', isOwner);
  $('#clear').hidden = !isOwner;
  $('#owner').hidden = !live;
  $('#owner').textContent = isOwner ? 'Sign out' : 'Owner';
  scheduleRender(nearBottom());
}
function connect() {
  const config = window.MONDO_BOARD_CONFIG;
  try { firebase.initializeApp(config); }
  catch { setStatus('On this device only. Live chat is not connected yet.'); return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      try { await firebase.auth().signInAnonymously(); }
      catch { setStatus('On this device only. Anonymous sign-in is not enabled yet.'); }
      return;
    }
    myUid = user.uid;
    live = true;
    banned = false;
    offRoom();
    updateOwnerUi(user);
    refreshStatus();
    await setPresence(user.uid);
    presenceListen = firebase.database().ref('chat/presence');
    presenceListen.on('value', onlineCount);
    banListen = firebase.database().ref('chat/bans/' + user.uid);
    banListen.on('value', snap => {
      banned = snap.val() === true;
      refreshStatus();
    });
    if (isOwner) {
      banListListen = firebase.database().ref('chat/bans');
      banListListen.on('value', snap => {
        banList.clear();
        snap.forEach(ch => { if (ch.val() === true) banList.set(ch.key, true); });
        renderBans();
      });
    } else banList.clear();
    clearListen = firebase.database().ref('chat/meta/clearedAt');
    clearListen.on('value', snap => {
      clearedAt = Number(snap.val() || 0);
      listenMessages();
    });
  });
}
async function signInOwner(email, password) {
  await firebase.auth().signInWithEmailAndPassword(email, password);
}
async function signOutOwner() {
  offRoom();
  await firebase.auth().signOut();
  live = false;
  isOwner = false;
  messages.clear();
  banList.clear();
  try { await firebase.auth().signInAnonymously(); }
  catch { setStatus('Signed out.'); }
}
async function removeMessage(msg) {
  if (!live || !isOwner) return;
  if (!confirm('Remove this message for everyone?')) return;
  try { await firebase.database().ref('chat/m/' + msg.id).remove(); }
  catch { setStatus('Could not remove that message.'); }
}
async function banUser(msg) {
  if (!live || !isOwner || !msg.author) return;
  if (!confirm('Block ' + msg.name + ' from posting?')) return;
  try { await firebase.database().ref('chat/bans/' + msg.author).set(true); }
  catch { setStatus('Could not block that person.'); }
}
async function unbanUser(uid) {
  if (!live || !isOwner) return;
  try { await firebase.database().ref('chat/bans/' + uid).remove(); }
  catch { setStatus('Could not unblock that person.'); }
}
async function clearRoom() {
  if (!live || !isOwner) return;
  if (!confirm('Clear the room for everyone?')) return;
  try {
    await firebase.database().ref('chat/meta/clearedAt').set(firebase.database.ServerValue.TIMESTAMP);
    setStatus('Room cleared.');
  } catch { setStatus('Could not clear the room.'); }
}

function send(name, text) {
  if (banned) { refreshStatus(); return; }
  if (live) { queue.push({ name, text }); pump(); return; }
  postLocal(name, text);
  refreshStatus();
}
function init() {
  const nameInput = $('#name');
  const saved = loadName();
  if (saved) nameInput.value = saved;
  nameInput.addEventListener('change', () => saveName(cleanName(nameInput.value)));
  $('#composer').addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanName(nameInput.value);
    const text = cleanText($('#text').value);
    if (!name) { setStatus('Add a name first.'); return; }
    if (!text) return;
    if (blocked(name) || blocked(text)) { setStatus("That message isn't allowed in this room."); return; }
    saveName(name);
    nameInput.value = name;
    $('#text').value = '';
    send(name, text);
  });
  $('#clear').onclick = clearRoom;
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
  render(true);
  if (configured()) connect();
  else refreshStatus();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { blocked, cleanName, cleanText, formatTime, midnight, linkify };
}
})();
