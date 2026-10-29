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
      if (url.protocol === 'https:') safe = url.href;
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
function isAdminNow() {
  return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
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
let unread = false;
function scheduleRender(stick) {
  const follow = stick || nearBottom();
  unread = !follow;
  if (paint) cancelAnimationFrame(paint);
  paint = requestAnimationFrame(() => {
    paint = 0;
    render(follow);
  });
}
function render(follow) {
  const log = $('#log');
  if (!log) return;
  const keep = log.scrollTop;
  const items = [...messages.values()].filter(Boolean).sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  log.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = 'No messages yet — say hi!';
    log.appendChild(empty);
  } else items.forEach(msg => log.appendChild(renderMessage(msg)));
  renderBans();
  const pill = $('#newPill');
  if (follow) {
    scrollDown();
    unread = false;
    if (pill) pill.hidden = true;
  } else {
    log.scrollTop = keep;
    if (pill) pill.hidden = !unread;
  }
}
function renderMessage(msg) {
  const art = document.createElement('article');
  art.className = 'bubble' + (msg.author && msg.author === myUid ? ' is-mine' : '');
  art.dataset.id = msg.id;
  const head = document.createElement('header');
  const name = document.createElement('strong');
  name.className = 'bubble-name';
  name.textContent = msg.name;
  if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(name, msg.author);
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
  // A whole-number startAt fails the rules' >= check. A fraction is accepted.
  messageQuery = firebase.database().ref('chat/m').orderByChild('t').startAt(start + 0.1).limitToLast(200);
  const add = snap => {
    const msg = fromSnap(snap);
    if (!msg) return;
    const fresh = seenMessages && msg.author !== myUid;
    messages.set(snap.key, msg);
    scheduleRender(false);
    if (fresh) aimBeep('chime');
  };
  messageQuery.on('child_added', add, () => setStatus('Could not load the room.'));
  setTimeout(() => { seenMessages = true; }, 900);
  messageQuery.on('child_removed', snap => { messages.delete(snap.key); scheduleRender(false); });
}
const AIM_KEY = 'mondosupreme.aim.v1';
let aimCtx = null;
let seenMessages = false;
let seenPresence = false;
let lastPeople = 0;
let aimArmed = false;
function aimMuted() {
  return document.documentElement.getAttribute('data-muted') === '1' || document.hidden || document.documentElement.getAttribute('data-shell-paused') === '1';
}
function aimBeep(kind) {
  if (!aimArmed || aimMuted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!aimCtx) aimCtx = new AC();
    if (aimCtx.state === 'suspended') aimCtx.resume();
    const t = aimCtx.currentTime;
    const osc = aimCtx.createOscillator();
    const gain = aimCtx.createGain();
    osc.connect(gain);
    gain.connect(aimCtx.destination);
    gain.gain.setValueAtTime(0.0001, t);
    if (kind === 'door') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t); osc.stop(t + 0.2);
    } else if (kind === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(988, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.start(t); osc.stop(t + 0.24);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(196, t);
      osc.frequency.exponentialRampToValueAtTime(98, t + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      osc.start(t); osc.stop(t + 0.38);
    }
  } catch { /* audio is optional */ }
}
function readAim() {
  try { return JSON.parse(localStorage.getItem(AIM_KEY) || '{}') || {}; }
  catch { return {}; }
}
function awayText() {
  return String(readAim().away || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
let roomPeople = [];
function paintBuddies() {
  const list = $('#buddyNames');
  if (!list) return;
  list.replaceChildren();
  const away = awayText();
  const rows = roomPeople.length ? roomPeople : [{ name: loadName() || 'You', self: true }];
  rows.forEach(row => {
    const li = document.createElement('li');
    li.className = 'who-chip';
    const label = document.createElement('span');
    const note = row.self ? (away ? ' — ' + away : ' — Available') : '';
    label.textContent = (row.name || 'Guest') + note;
    li.appendChild(label);
    list.appendChild(li);
  });
}
function armAim() {
  const saved = readAim();
  const away = $('#awayMsg');
  if (away) away.value = saved.away || '';
  const icon = saved.icon || 'smiley';
  document.querySelectorAll('.aim-icons button').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.icon === icon ? 'true' : 'false');
  });
  if (away) away.addEventListener('input', () => {
    const next = readAim();
    next.away = away.value.slice(0, 80);
    try { localStorage.setItem(AIM_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    paintBuddies();
  });
  document.querySelectorAll('.aim-icons button').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = readAim();
      next.icon = btn.dataset.icon;
      try { localStorage.setItem(AIM_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      document.querySelectorAll('.aim-icons button').forEach(other => {
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      });
    });
  });
  const uhoh = $('#aimUhoh');
  if (uhoh) uhoh.addEventListener('click', () => { aimArmed = true; aimBeep('uhoh'); });
  const arm = () => { aimArmed = true; };
  document.addEventListener('pointerdown', arm, { once: true });
  paintBuddies();
}
function onlineCount(snap) {
  const now = Date.now();
  let n = 0;
  const rows = [];
  snap.forEach(ch => {
    if (now - Number(ch.child('t').val() || 0) >= 180000) return;
    n += 1;
    const raw = ch.child('name').val();
    rows.push({ name: cleanName(typeof raw === 'string' ? raw : '') || 'Guest', self: ch.key === myUid });
  });
  roomPeople = rows;
  if (seenPresence && n > lastPeople) aimBeep('door');
  seenPresence = true;
  lastPeople = n;
  people = n;
  refreshStatus();
  paintBuddies();
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
    await presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP, name: (loadName() || 'Guest').slice(0, MAX_NAME) });
  } catch { /* presence is optional */ }
  armHeart();
}
function pulsePresence() {
  if (document.hidden || !presenceRef) return;
  presenceRef.set({ t: firebase.database.ServerValue.TIMESTAMP, name: (loadName() || 'Guest').slice(0, MAX_NAME) }).catch(() => {});
}
function armHeart() {
  if (heart) { clearInterval(heart); heart = null; }
  if (document.hidden || !presenceRef) return;
  heart = setInterval(pulsePresence, 45000);
}
function updateOwnerUi(user) {
  const email = user && user.email ? user.email.toLowerCase() : '';
  isOwner = isAdminNow();
  if (!updateOwnerUi.ownerListen) { updateOwnerUi.ownerListen = true; document.addEventListener('mondo-owner', function () { if (firebase.auth) updateOwnerUi(firebase.auth().currentUser); }); }
  document.body.classList.toggle('is-owner', isOwner);
  $('#clear').hidden = !isOwner;
  $('#owner').hidden = !live;
  if (!window.MONDO_MEMBER) $('#owner').textContent = isOwner ? 'Sign out' : 'Owner';
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
function paintAs() {
  const el = $('#asName');
  if (!el) return;
  el.textContent = loadName() || 'Guest';
}
function fitChat() {
  const app = document.querySelector('.chat-app');
  if (!app || !window.visualViewport) return;
  const vv = window.visualViewport;
  const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  if (keyboard > 80) {
    document.body.style.paddingTop = '0px';
    document.body.style.paddingBottom = '0px';
    app.style.marginTop = vv.offsetTop + 'px';
    app.style.height = vv.height + 'px';
    if (nearBottom()) scrollDown();
    return;
  }
  document.body.style.paddingTop = '';
  document.body.style.paddingBottom = '';
  app.style.marginTop = '';
  app.style.height = '';
}
function init() {
  paintAs();
  const textInput = $('#text');
  $('#composer').addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanName(loadName()) || 'Guest';
    const text = cleanText(textInput.value);
    if (!text) return;
    if (blocked(name) || blocked(text)) { setStatus("That message isn't allowed in this room."); return; }
    saveName(name);
    textInput.value = '';
    send(name, text);
  });
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#composer').requestSubmit();
    }
  });
  textInput.addEventListener('focus', () => setTimeout(() => { fitChat(); if (nearBottom()) scrollDown(); }, 80));
  $('#changeName').onclick = () => {
    $('#chatNameInput').value = loadName();
    $('#nameDialog').showModal();
  };
  $('#nameCancel').onclick = () => $('#nameDialog').close();
  $('#nameForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanName($('#chatNameInput').value);
    if (!name || blocked(name)) { setStatus('Pick a different display name.'); return; }
    saveName(name);
    paintAs();
    pulsePresence();
    paintBuddies();
    $('#nameDialog').close();
  });
  const who = $('#whoPanel');
  const whoBtn = $('#whoToggle');
  if (who && whoBtn) {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    who.hidden = !wide;
    whoBtn.setAttribute('aria-expanded', wide ? 'true' : 'false');
    whoBtn.addEventListener('click', () => {
      who.hidden = !who.hidden;
      whoBtn.setAttribute('aria-expanded', who.hidden ? 'false' : 'true');
    });
  }
  const menu = $('#roomMenu');
  const menuBtn = $('#roomMenuBtn');
  if (menu && menuBtn) {
    menuBtn.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
  }
  const pill = $('#newPill');
  if (pill) pill.addEventListener('click', () => { unread = false; pill.hidden = true; scrollDown(); });
  document.addEventListener('mondo-member', event => {
    const handle = event.detail && event.detail.handle;
    if (!loadName() && handle) saveName(cleanName(handle));
    paintAs();
    pulsePresence();
  });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitChat);
    visualViewport.addEventListener('scroll', fitChat);
  }
  $('#clear').onclick = clearRoom;
  $('#owner').onclick = () => {
    const user = firebase.auth().currentUser;
    if (isAdminNow()) { signOutOwner(); return; }
    $('#ownerError').hidden = true;
    $('#ownerPass').value = '';
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (heart) { clearInterval(heart); heart = null; }
      return;
    }
    if (!presenceRef) return;
    pulsePresence();
    armHeart();
  });
  render(true);
  armAim();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && aimCtx && aimCtx.suspend) aimCtx.suspend();
  });
  if (configured()) connect();
  else refreshStatus();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { blocked, cleanName, cleanText, formatTime, midnight, linkify };
}
})();
