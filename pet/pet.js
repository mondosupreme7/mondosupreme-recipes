(() => {
'use strict';
const KEY = 'mondosupreme.pet.v1';
const HATCH_MS = 15000;
const DAY_MS = 10 * 60 * 1000;
const AWAY_CAP = 6 * 60 * 60 * 1000;
const INK = '#1c2410';
const PAPER = '#8ea86b';
const MENU = ['feed', 'light', 'play', 'meds', 'clean', 'stats', 'away'];
const LABELS = {
  egg: 'Egg', blob: 'Blob Baby', kidchi: 'Kid', teenchi: 'Teen',
  chefchi: 'Chefchi', captainchi: 'Captainchi', cyberchi: 'Cyberchi', phantomchi: 'Phantomchi'
};
const SPRITES = {
  egg: ['  ######  ', ' ######## ', '##########', '##########', ' ######## ', '  ######  '],
  eggCrack: ['  ######  ', ' ##  #### ', '##### ## #', '###  #####', ' ######## ', '  ######  '],
  blob: ['   ####   ', ' ######## ', '##o####o##', '##########', ' ######## ', '  ##  ##  '],
  kidchi: ['    ##    ', '   ####   ', ' ######## ', '##o####o##', '##########', ' ##    ## ', '  ##  ##  '],
  teenchi: ['   ####   ', ' ######## ', '##o####o##', '##########', '####  ####', ' ##    ## ', '  ##  ##  '],
  chefchi: ['   ++++   ', '   ++++   ', ' ######## ', '##o####o##', '##########', ' ## ++ ## ', '  ##  ##  '],
  captainchi: ['  ######  ', ' ######## ', '##o####o##', '##########', '####++####', ' ##    ## ', '  ##  ##  '],
  cyberchi: ['     #    ', '   ####   ', ' ######## ', '##++++##  ', '##########', ' ##    ## ', '  ##  ##  '],
  phantomchi: ['   ####   ', ' ######## ', '## #### ##', '##########', '##########', '  ######  ', ' #      # ']
};
const $ = s => document.querySelector(s);
let pet, mode = 'pet', sel = 0, feedPick = 'meal', note = '', noteUntil = 0;
let game = null, accHunger = 0, accHappy = 0, accPoop = 0;
let audioCtx = null, soundOn = false;
let serverLive = false, rulesBlocked = false, isOwner = false, myUid = '';
let listening = false, lastPost = 0;
let remote = {};
let canvas, ctx;

function fresh() {
  return {
    name: 'Mondo', owner: 'You', shell: 'purple', stage: 'egg', species: 'egg',
    eggStarted: Date.now(), born: 0, lastSeen: Date.now(), ageMs: 0,
    hunger: 4, happy: 4, weight: 5, care: 0, snacks: 0, meals: 0, games: 0,
    poops: 0, sick: false, sleepy: false, light: true, vacation: false,
    warned: false, gone: false, speciesLocked: ''
  };
}
function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  Object.keys(base).forEach(k => { if (raw[k] !== undefined) base[k] = raw[k]; });
  base.name = cleanName(base.name) || 'Mondo';
  base.owner = cleanName(base.owner) || 'You';
  if (!/^(purple|blue|pink|green|yellow)$/.test(base.shell)) base.shell = 'purple';
  base.hunger = clamp(base.hunger | 0, 0, 4);
  base.happy = clamp(base.happy | 0, 0, 4);
  base.weight = clamp(base.weight | 0, 1, 99);
  return base;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pet)); } catch { /* full */ }
}
function cleanName(v) {
  return String(v || '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12);
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function ageDays(p) { return Math.floor((p.ageMs || 0) / DAY_MS); }
function ageText(p) {
  const days = ageDays(p);
  if (days > 0) return days + (days === 1 ? ' day' : ' days');
  return '0 days (' + Math.floor((p.ageMs || 0) / 60000) + ' min)';
}
function beep(freq, dur) {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch { /* optional */ }
}
function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function say(text) { note = text; noteUntil = Date.now() + 1400; }
function speciesFor(p) {
  if (p.stage === 'egg') return 'egg';
  if (p.stage === 'baby') return 'blob';
  if (p.stage === 'kid') return 'kidchi';
  if (p.stage === 'teen') return 'teenchi';
  if (p.speciesLocked) return p.speciesLocked;
  if (p.games >= 3 && p.care >= 4) return 'cyberchi';
  if (p.meals >= 4 && p.care >= 2) return 'chefchi';
  if (p.care <= 0 || p.snacks >= 5) return 'phantomchi';
  return 'captainchi';
}
function evolve() {
  if (pet.stage === 'egg' || pet.gone) return;
  const days = ageDays(pet);
  let stage = 'baby';
  if (days >= 4) stage = 'adult';
  else if (days >= 2) stage = 'teen';
  else if (days >= 1) stage = 'kid';
  const prev = pet.stage;
  pet.stage = stage;
  if (stage === 'adult') {
    if (!pet.speciesLocked) pet.speciesLocked = speciesFor(pet);
    pet.species = pet.speciesLocked;
  } else pet.species = speciesFor(pet);
  if (prev !== stage) { beep(520, 0.08); beep(780, 0.12); say(LABELS[pet.species] || stage); }
}
function hatch() {
  pet.stage = 'baby';
  pet.species = 'blob';
  pet.born = Date.now();
  pet.ageMs = 0;
  pet.hunger = 3;
  pet.happy = 3;
  pet.weight = 5;
  beep(660, 0.08);
  beep(880, 0.12);
  say('HATCHED');
}
function catchUp() {
  const now = Date.now();
  let elapsed = Math.max(0, now - (pet.lastSeen || now));
  elapsed = Math.min(elapsed, AWAY_CAP);
  pet.lastSeen = now;
  if (pet.gone || pet.vacation) return;
  if (pet.stage === 'egg') {
    if (now - pet.eggStarted >= HATCH_MS) hatch();
    return;
  }
  pet.ageMs += elapsed;
  const steps = Math.floor(elapsed / (10 * 60 * 1000));
  const wasEmpty = pet.hunger === 0 && pet.happy === 0;
  if (steps > 0) {
    pet.hunger = Math.max(wasEmpty ? 0 : 1, pet.hunger - Math.min(3, steps));
    pet.happy = Math.max(wasEmpty ? 0 : 1, pet.happy - Math.min(3, steps));
    pet.poops = Math.min(4, pet.poops + Math.min(2, Math.floor(elapsed / (20 * 60 * 1000))));
    if (pet.poops >= 3) pet.sick = true;
    pet.warned = true;
    say('MISSED YOU');
  }
  if (wasEmpty && elapsed > 45 * 60 * 1000) pet.gone = true;
  evolve();
}
function nightNow() {
  const h = new Date().getHours();
  return h >= 22 || h < 7;
}
function tick() {
  const now = Date.now();
  const dt = Math.min(2000, Math.max(0, now - pet.lastSeen));
  pet.lastSeen = now;
  if (pet.vacation || pet.gone) { save(); paintStatus(); return; }
  if (pet.stage === 'egg') {
    if (now - pet.eggStarted >= HATCH_MS) hatch();
    save();
    paintStatus();
    return;
  }
  pet.ageMs += dt;
  pet.sleepy = nightNow() || Math.floor(pet.ageMs / 50000) % 4 === 3;
  accHunger += dt;
  accHappy += dt;
  accPoop += dt;
  if (accHunger >= 30000) {
    accHunger = 0;
    pet.hunger = Math.max(0, pet.hunger - 1);
    if (pet.hunger === 0) say('HUNGRY');
  }
  let happyEvery = 35000;
  if (pet.sleepy && pet.light) happyEvery = 14000;
  else if (!pet.sleepy && !pet.light) happyEvery = 22000;
  else if (pet.sleepy && !pet.light) happyEvery = 50000;
  if (accHappy >= happyEvery) {
    accHappy = 0;
    if (!(pet.sleepy && !pet.light)) pet.happy = Math.max(0, pet.happy - 1);
  }
  if (accPoop >= 45000 && pet.poops < 4) {
    accPoop = 0;
    pet.poops += 1;
    say('POOP');
    if (pet.poops >= 3) { pet.sick = true; pet.care = Math.max(-8, pet.care - 1); }
  }
  if (pet.hunger === 0 && pet.happy === 0) {
    pet.warned = true;
    if (!pet.criticalSince) pet.criticalSince = now;
    else if (now - pet.criticalSince > 120000) pet.gone = true;
  } else pet.criticalSince = 0;
  evolve();
  save();
  paintStatus();
}
function refuseEgg() { say('STILL AN EGG'); beep(120, 0.08); }
function doFeed(kind) {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  if (kind === 'meal') {
    const before = pet.hunger;
    pet.hunger = Math.min(4, pet.hunger + 2);
    pet.weight = Math.min(99, pet.weight + 1);
    pet.meals += 1;
    pet.care += 1;
    say(before >= 4 ? 'FULL' : 'YUM');
    beep(700, 0.06);
    paintStatus();
  } else {
    pet.happy = Math.min(4, pet.happy + 2);
    pet.hunger = Math.min(4, pet.hunger + 1);
    pet.weight = Math.min(99, pet.weight + 2);
    pet.snacks += 1;
    if (pet.snacks >= 4 && pet.snacks > pet.meals + 1) { pet.sick = true; say('TOO MUCH CAKE'); }
    else say('CAKE');
    beep(840, 0.05);
    paintStatus();
  }
  save();
}
function toggleLight() {
  pet.light = !pet.light;
  say(pet.light ? 'LIGHT ON' : 'LIGHT OFF');
  beep(pet.light ? 600 : 300, 0.05);
  save();
}
function doMeds() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  if (pet.sick) { pet.sick = false; pet.care += 1; say('ALL BETTER'); beep(880, 0.1); }
  else { pet.happy = Math.max(0, pet.happy - 1); say('YUCK'); beep(140, 0.08); }
  save();
}
function doClean() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  if (pet.poops > 0) { pet.poops = 0; pet.care += 1; say('FLUSH'); beep(500, 0.06); }
  else say('CLEAN');
  save();
}
function toggleVacation() {
  if (pet.stage === 'egg' || pet.gone) { say('NOT YET'); return; }
  pet.vacation = !pet.vacation;
  say(pet.vacation ? 'SITTER ON' : 'SITTER OFF');
  beep(pet.vacation ? 400 : 250, 0.08);
  save();
}
function startGame() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  if (pet.sick) { say('TOO SICK'); return; }
  mode = 'game';
  game = { round: 1, score: 0, side: Math.random() < 0.5 ? 'left' : 'right' };
  $('#gamePads').hidden = false;
  say('CATCH THE STAR');
  paintStatus();
}
function guess(side) {
  if (!game) return;
  if (side === game.side) { game.score += 1; beep(900, 0.05); }
  else beep(140, 0.06);
  if (game.round >= 3) {
    const got = game.score;
    pet.happy = Math.min(4, pet.happy + got);
    if (got) { pet.games += 1; pet.care += got; pet.weight = Math.max(1, pet.weight - 1); }
    say(got ? ('CAUGHT ' + got) : 'MISSED');
    game = null;
    mode = 'pet';
    $('#gamePads').hidden = true;
    save();
    paintStatus();
    return;
  }
  game.round += 1;
  game.side = Math.random() < 0.5 ? 'left' : 'right';
  paintStatus();
}
function resetEgg() {
  const shell = pet.shell, name = pet.name, owner = pet.owner;
  pet = fresh();
  pet.shell = shell;
  pet.name = name;
  pet.owner = owner;
  pet.eggStarted = Date.now();
  mode = 'pet';
  game = null;
  $('#gamePads').hidden = true;
  say('NEW EGG');
  save();
}
function onA() {
  if (pet.gone) return;
  if (mode === 'game') return guess('left');
  if (mode === 'feed') { feedPick = feedPick === 'meal' ? 'snack' : 'meal'; beep(480, 0.04); return; }
  if (mode === 'stats') { mode = 'pet'; return; }
  sel = (sel + 1) % MENU.length;
  beep(480, 0.04);
  paintStatus();
}
function onB() {
  if (pet.gone) return resetEgg();
  if (mode === 'game') return guess('right');
  if (mode === 'feed') { doFeed(feedPick); mode = 'pet'; return; }
  if (mode === 'stats') { mode = 'pet'; return; }
  const id = MENU[sel];
  if (id === 'feed') { if (pet.stage === 'egg') return refuseEgg(); mode = 'feed'; feedPick = 'meal'; beep(520, 0.05); return; }
  if (id === 'light') return toggleLight();
  if (id === 'play') return startGame();
  if (id === 'meds') return doMeds();
  if (id === 'clean') return doClean();
  if (id === 'stats') { mode = 'stats'; return; }
  if (id === 'away') return toggleVacation();
}
function onC() {
  if (mode === 'game') { game = null; $('#gamePads').hidden = true; }
  mode = 'pet';
  beep(220, 0.04);
}
function act(name) {
  if (name === 'meal') return doFeed('meal');
  if (name === 'snack') return doFeed('snack');
  if (name === 'light') return toggleLight();
  if (name === 'play') return startGame();
  if (name === 'meds') return doMeds();
  if (name === 'clean') return doClean();
  if (name === 'stats') { mode = mode === 'stats' ? 'pet' : 'stats'; return; }
  if (name === 'away') return toggleVacation();
}

function sprite(rows, x, y, scale) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = ch === '+' ? '#f4f7e8' : ch === 'o' ? '#071006' : INK;
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
    }
  }
}
function hearts(n, x, y) {
  ctx.fillStyle = INK;
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = i < n ? 1 : 0.25;
    ctx.fillRect(x + i * 5, y, 3, 3);
  }
  ctx.globalAlpha = 1;
}
function drawPoop(n) {
  ctx.fillStyle = '#3d2a12';
  for (let i = 0; i < n; i++) {
    const x = 4 + i * 8;
    ctx.fillRect(x, 46, 5, 4);
    ctx.fillRect(x + 1, 44, 3, 2);
  }
}
function drawPet() {
  const key = pet.species === 'egg' && (Date.now() - pet.eggStarted > HATCH_MS * 0.66) ? 'eggCrack' : (SPRITES[pet.species] ? pet.species : 'blob');
  const rows = SPRITES[key] || SPRITES.blob;
  const scale = 3;
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  let y = 16;
  if (pet.sleepy && !pet.light && pet.stage !== 'egg') y += 4;
  sprite(rows, Math.floor((96 - w) / 2), y, scale);
  if (!pet.light) {
    ctx.fillStyle = 'rgba(10,20,8,.45)';
    ctx.fillRect(0, 8, 96, 40);
  }
}
function drawMenu() {
  ctx.font = '7px monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  MENU.forEach((id, i) => {
    const x = 2 + (i % 4) * 24;
    const y = 50 + Math.floor(i / 4) * 8;
    if (i === sel && mode === 'pet') ctx.fillRect(x - 1, y - 6, 22, 8);
    ctx.fillStyle = i === sel && mode === 'pet' ? PAPER : INK;
    ctx.fillText(id.slice(0, 4).toUpperCase(), x, y);
    ctx.fillStyle = INK;
  });
}
function draw() {
  if (!ctx) return;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 96, 64);
  ctx.fillStyle = INK;
  if (pet.gone) {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GOODBYE', 48, 24);
    ctx.fillText('B = NEW EGG', 48, 40);
  } else if (mode === 'stats') {
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    const lines = [
      pet.name + '  ' + (LABELS[pet.species] || pet.stage),
      ageText(pet) + '  ' + pet.weight + ' oz',
      'CARE ' + pet.care + (pet.vacation ? '  SITTER' : ''),
      pet.sick ? 'SICK' : 'OK'
    ];
    lines.forEach((line, i) => ctx.fillText(line.slice(0, 18), 2, 12 + i * 9));
    hearts(pet.hunger, 4, 48);
    hearts(pet.happy, 40, 48);
  } else if (mode === 'feed') {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FEED', 48, 16);
    ctx.fillStyle = feedPick === 'meal' ? INK : PAPER;
    ctx.fillRect(10, 24, 32, 14);
    ctx.fillStyle = feedPick === 'snack' ? INK : PAPER;
    ctx.fillRect(52, 24, 34, 14);
    ctx.fillStyle = feedPick === 'meal' ? PAPER : INK;
    ctx.fillText('MEAL', 26, 34);
    ctx.fillStyle = feedPick === 'snack' ? PAPER : INK;
    ctx.fillText('CAKE', 69, 34);
    ctx.fillStyle = INK;
    ctx.fillText('A SWITCH  B OK', 48, 54);
  } else if (mode === 'game' && game) {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND ' + game.round, 48, 12);
    ctx.fillText(game.side === 'left' ? '★' : '', 24, 32);
    ctx.fillText(game.side === 'right' ? '★' : '', 72, 32);
    ctx.fillText('A LEFT  B RIGHT', 48, 52);
  } else {
    hearts(pet.hunger, 2, 3);
    hearts(pet.happy, 74, 3);
    if (pet.sick) { ctx.fillText('☠', 46, 8); }
    if (pet.sleepy) { ctx.font = '8px monospace'; ctx.fillText('z', 80, 16); }
    drawPet();
    if (pet.stage !== 'egg') drawPoop(pet.poops);
    drawMenu();
  }
  if (note && Date.now() < noteUntil && mode !== 'stats') {
    ctx.fillStyle = PAPER;
    ctx.fillRect(8, 26, 80, 14);
    ctx.strokeStyle = INK;
    ctx.strokeRect(8, 26, 80, 14);
    ctx.fillStyle = INK;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(note, 48, 36);
  }
  const egg = $('#egg');
  if (egg) egg.classList.toggle('wobble', pet.stage === 'egg' && Date.now() - pet.eggStarted > HATCH_MS * 0.5 && !pet.gone);
}
function paintStatus() {
  const el = $('#status');
  const lcd = $('#lcd');
  if (lcd) {
    lcd.dataset.stage = pet.stage;
    lcd.dataset.species = pet.species;
    lcd.dataset.hunger = String(pet.hunger);
    lcd.dataset.happy = String(pet.happy);
    lcd.dataset.screen = mode;
    lcd.dataset.menu = MENU[sel];
    lcd.dataset.side = game ? game.side : '';
    lcd.dataset.light = pet.light ? 'on' : 'off';
    lcd.dataset.vacation = pet.vacation ? 'on' : 'off';
    lcd.dataset.sick = pet.sick ? 'yes' : 'no';
    lcd.dataset.poops = String(pet.poops);
  }
  const shell = $('#keychain');
  if (shell) shell.dataset.shell = pet.shell;
  if (!el) return;
  if (pet.gone) { el.textContent = pet.name + ' has gone. Press B for a new egg.'; return; }
  if (pet.stage === 'egg') {
    const left = Math.max(0, Math.ceil((HATCH_MS - (Date.now() - pet.eggStarted)) / 1000));
    el.textContent = 'An egg is warming up. About ' + left + ' seconds.';
    return;
  }
  el.textContent = pet.name + ' the ' + (LABELS[pet.species] || pet.stage) + '. Hunger hearts ' + pet.hunger + '/4. Happiness hearts ' + pet.happy + '/4. ' + ageText(pet) + '.' + (pet.sick ? ' Sick.' : '') + (pet.vacation ? ' With the sitter.' : '');
}
function frame() { draw(); requestAnimationFrame(frame); }

function syncBanner() {
  const el = $('#syncBanner');
  if (el) el.hidden = !rulesBlocked;
}
function showBanner() { rulesBlocked = true; serverLive = false; syncBanner(); }
function hideBanner() { rulesBlocked = false; syncBanner(); }
function isDenied(err) {
  return /PERMISSION_DENIED|permission[-_ ]denied/i.test(String((err && err.code) || '') + ' ' + String((err && err.message) || ''));
}
function ownerEmail() { return String(window.MONDO_BOARD_OWNER || 'cbrooks_911@yahoo.com').toLowerCase(); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function renderPark() {
  const list = $('#parkList');
  if (!list) return;
  let rows = [];
  if (serverLive && !rulesBlocked) {
    rows = Object.keys(remote).map(id => Object.assign({ id }, remote[id])).filter(r => r && r.name);
  } else {
    try {
      const mine = JSON.parse(localStorage.getItem(KEY + '.park'));
      if (mine && mine.name) rows = [mine];
    } catch { /* none */ }
  }
  rows.sort((a, b) => (b.t || 0) - (a.t || 0));
  if (!rows.length) { list.innerHTML = '<li><span>No pets in the park yet.</span></li>'; return; }
  list.innerHTML = rows.map(r => '<li><span>' + esc(r.name) + ' · ' + esc(LABELS[r.species] || r.stage || '') + ' · ' + esc(r.owner || '') + ' · ' + (r.age | 0) + 'd</span>' +
    (isOwner ? '<button type="button" data-remove="' + esc(r.id || '') + '">Remove</button>' : '') + '</li>').join('');
}
function listenPark() {
  if (listening || typeof firebase === 'undefined') return;
  listening = true;
  firebase.database().ref('pet/park').on('value', snap => {
    serverLive = true;
    hideBanner();
    remote = snap.val() || {};
    renderPark();
  }, err => {
    serverLive = false;
    if (isDenied(err)) showBanner();
    renderPark();
  });
}
function connectPet() {
  const c = window.MONDO_BOARD_CONFIG;
  if (typeof firebase === 'undefined' || !c || !c.apiKey || !c.databaseURL) return;
  try { if (!firebase.apps.length) firebase.initializeApp(c); } catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      isOwner = false;
      myUid = '';
      $('#ownerBtn').textContent = 'Owner sign in';
      try { await firebase.auth().signInAnonymously(); } catch { /* local pet still works */ }
      return;
    }
    myUid = user.uid;
    isOwner = !!(user.email && user.email.toLowerCase() === ownerEmail());
    $('#ownerBtn').textContent = isOwner ? 'Sign out' : 'Owner sign in';
    listenPark();
    renderPark();
  });
}
async function postPark() {
  const name = cleanName($('#petName').value) || pet.name;
  const owner = cleanName($('#ownerName').value) || pet.owner;
  if (!/^[A-Za-z0-9]/.test(name) || !/^[A-Za-z0-9]/.test(owner)) { toast('Use a name that starts with a letter or number'); return; }
  pet.name = name;
  pet.owner = owner;
  save();
  const snap = { name, owner, stage: pet.stage, species: pet.species, age: ageDays(pet), shell: pet.shell, t: Date.now() };
  try { localStorage.setItem(KEY + '.park', JSON.stringify(snap)); } catch { /* ignore */ }
  if (!serverLive || rulesBlocked) renderPark();
  if (!myUid || typeof firebase === 'undefined' || !firebase.apps.length) {
    toast('Saved on this device. The Pet Park opens when Firebase rules are published.');
    renderPark();
    return;
  }
  const wait = 8200 - (Date.now() - lastPost);
  if (lastPost && wait > 0) await new Promise(r => setTimeout(r, wait));
  const updates = {};
  updates['pet/park/' + myUid] = {
    name, owner, stage: pet.stage, species: pet.species, age: ageDays(pet), shell: pet.shell,
    author: myUid, t: firebase.database.ServerValue.TIMESTAMP
  };
  updates['pet/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  try {
    await firebase.database().ref().update(updates);
    lastPost = Date.now();
    toast('Shown in the Pet Park');
  } catch (err) {
    if (isDenied(err)) { showBanner(); toast('Saved on this device. The Pet Park opens when Firebase rules are published.'); }
    else toast('Could not update the park. Your pet is still saved here.');
    renderPark();
  }
}
function setShell(id) {
  if (!/^(purple|blue|pink|green|yellow)$/.test(id)) return;
  pet.shell = id;
  document.querySelectorAll('[data-shell]').forEach(b => { if (b.dataset.shell) b.setAttribute('aria-pressed', String(b.dataset.shell === id)); });
  save();
  paintStatus();
}
function init() {
  canvas = $('#lcd');
  ctx = canvas.getContext('2d', { alpha: false });
  pet = load();
  catchUp();
  save();
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  $('#petName').value = pet.name;
  $('#ownerName').value = pet.owner;
  setShell(pet.shell);
  $('#btnA').onclick = onA;
  $('#btnB').onclick = onB;
  $('#btnC').onclick = onC;
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
  document.querySelectorAll('.shells [data-shell]').forEach(b => b.addEventListener('click', () => setShell(b.dataset.shell)));
  $('#padLeft').onclick = () => guess('left');
  $('#padRight').onclick = () => guess('right');
  $('#nameForm').addEventListener('submit', e => { e.preventDefault(); postPark(); });
  $('#petName').addEventListener('change', () => { const n = cleanName($('#petName').value); if (n) { pet.name = n; save(); paintStatus(); } });
  $('#ownerName').addEventListener('change', () => { const n = cleanName($('#ownerName').value); if (n) { pet.owner = n; save(); } });
  $('#soundBtn').onclick = () => {
    soundOn = !soundOn;
    $('#soundBtn').textContent = soundOn ? 'Mute' : 'Sound';
    $('#soundBtn').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) beep(660, 0.06);
  };
  $('#ownerBtn').onclick = () => {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
    const user = firebase.auth().currentUser;
    if (user && user.email && user.email.toLowerCase() === ownerEmail()) { firebase.auth().signOut(); return; }
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
      await firebase.auth().signInWithEmailAndPassword($('#ownerEmail').value.trim(), $('#ownerPass').value);
      $('#ownerPass').value = '';
      $('#ownerDialog').close();
    } catch (err) {
      $('#ownerPass').value = '';
      const code = String(err && err.code || '');
      $('#ownerError').textContent = /invalid-credential|wrong-password|user-not-found/.test(code) ? 'That email or password is wrong.' : 'Could not sign in.';
      $('#ownerError').hidden = false;
    }
  });
  $('#parkList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn || !isOwner) return;
    const id = btn.dataset.remove;
    if (!id || !confirm('Remove this pet from the park?')) return;
    try { await firebase.database().ref('pet/park/' + id).remove(); toast('Removed'); }
    catch (err) { if (isDenied(err)) showBanner(); toast('Could not remove that pet'); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
  connectPet();
  renderPark();
  paintStatus();
  setInterval(tick, 400);
  requestAnimationFrame(frame);
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})();
