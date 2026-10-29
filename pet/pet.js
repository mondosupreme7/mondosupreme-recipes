(() => {
'use strict';
const KEY = 'mondosupreme.pet.v1';
const HATCH_MS = 15000;
const DAY_MS = 10 * 60 * 1000;
const AWAY_CAP = 6 * 60 * 60 * 1000;
const W = 480;
const H = 270;
const FLOOR = 236;
const MENU = ['feed', 'light', 'play', 'meds', 'clean', 'stats', 'away'];
const LABELS = {
  egg: 'Egg', blob: 'Blob Baby', kidchi: 'Kid', teenchi: 'Teen',
  chefchi: 'Chefchi', captainchi: 'Captainchi', cyberchi: 'Cyberchi', phantomchi: 'Phantomchi'
};
const ROOMS = ['bedroom', 'beach', 'matrix', 'garden'];
const HATS = ['', 'captain', 'chef', 'shades', 'party', 'wizard', 'crown'];
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
const FUR = {
  egg: '#f6f1c8', blob: '#7dff6a', kidchi: '#ffe14a', teenchi: '#7fdfff',
  chefchi: '#fff4d6', captainchi: '#8eb4ff', cyberchi: '#39ff14', phantomchi: '#d0d0d0'
};
const $ = s => document.querySelector(s);
let pet, mode = 'pet', sel = 0, feedPick = 'meal', note = '', noteUntil = 0;
let play = null, accHunger = 0, accHappy = 0, accPoop = 0;
let audioCtx = null, soundOn = false, userMuted = false;
let serverLive = false, rulesBlocked = false, isOwner = false, myUid = '';
let listening = false, lastPost = 0, pingsReady = false;
let remote = {}, seenPing = {};
let canvas, ctx;
let petX = 220, petY = FLOOR, petVy = 0, face = 1, blinkUntil = 0, nextBlink = 0;
let targetX = 300, nextWander = 0, lookX = 240, lookY = 120, lookUntil = 0;
let rubUntil = 0, lastRub = 0, lastCatch = 0, tool = 'ball';
let balls = [], snacks = [], bits = [], bugs = [], visitors = [];
let clock = 0, frames = 0, fps = 0, fpsStamp = 0;
let reduceMotion = false;

function fresh() {
  return {
    name: 'Mondo', owner: 'You', shell: 'purple', stage: 'egg', species: 'egg',
    eggStarted: Date.now(), born: 0, lastSeen: Date.now(), ageMs: 0,
    hunger: 80, happy: 80, clean: 100, weight: 5, care: 0, snacks: 0, meals: 0, games: 0,
    poops: 0, sick: false, sleepy: false, light: true, vacation: false,
    warned: false, gone: false, speciesLocked: '', room: 'bedroom', hat: ''
  };
}
function scaleStat(n) {
  n = Number(n);
  if (!isFinite(n)) return 50;
  if (n >= 0 && n <= 4) return n * 25;
  return clamp(Math.round(n), 0, 100);
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
  if (ROOMS.indexOf(base.room) < 0) base.room = 'bedroom';
  if (HATS.indexOf(base.hat) < 0) base.hat = '';
  base.hunger = scaleStat(base.hunger);
  base.happy = scaleStat(base.happy);
  if (raw.clean === undefined) base.clean = clamp(100 - (base.poops | 0) * 22, 0, 100);
  else base.clean = clamp(base.clean | 0, 0, 100);
  base.weight = clamp(base.weight | 0, 1, 99);
  base.poops = clamp(base.poops | 0, 0, 4);
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
function ensureAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
function tone(freq, dur, type, gain) {
  if (!soundOn) return;
  const ac = ensureAudio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, ac.currentTime);
  o.connect(g);
  g.connect(ac.destination);
  const t = ac.currentTime;
  g.gain.setValueAtTime(gain || 0.045, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur);
}
function purr() {
  tone(196, 0.09, 'sine', 0.05);
  setTimeout(() => tone(262, 0.1, 'triangle', 0.04), 80);
  setTimeout(() => tone(330, 0.12, 'sine', 0.035), 170);
}
function unlockSound() {
  if (!userMuted) {
    soundOn = true;
    const btn = $('#soundBtn');
    if (btn) {
      btn.textContent = 'Mute';
      btn.setAttribute('aria-pressed', 'true');
    }
  }
  ensureAudio();
}
function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function say(text) { note = text; noteUntil = performance.now() + 1500; }
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
  if (prev !== stage) { tone(520, 0.08); tone(780, 0.12); say(LABELS[pet.species] || stage); burst(petX, petY - 40, 8, 'note'); }
}
function hatch() {
  pet.stage = 'baby';
  pet.species = 'blob';
  pet.born = Date.now();
  pet.ageMs = 0;
  pet.hunger = 70;
  pet.happy = 80;
  pet.clean = 100;
  pet.weight = 5;
  tone(660, 0.08);
  tone(880, 0.12);
  say('HATCHED');
  burst(petX, petY - 30, 14, 'heart');
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
  const wasEmpty = pet.hunger < 8 && pet.happy < 8;
  if (steps > 0) {
    pet.hunger = Math.max(wasEmpty ? 0 : 12, pet.hunger - Math.min(75, steps * 25));
    pet.happy = Math.max(wasEmpty ? 0 : 12, pet.happy - Math.min(75, steps * 25));
    pet.clean = Math.max(0, pet.clean - Math.min(40, steps * 12));
    pet.poops = Math.min(4, pet.poops + Math.min(2, Math.floor(elapsed / (20 * 60 * 1000))));
    if (pet.poops >= 3 || pet.clean < 20) pet.sick = true;
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
    pet.hunger = Math.max(0, pet.hunger - 8);
    if (pet.hunger < 30) say('HUNGRY');
  }
  let happyEvery = 35000;
  if (pet.sleepy && pet.light) happyEvery = 14000;
  else if (!pet.sleepy && !pet.light) happyEvery = 22000;
  else if (pet.sleepy && !pet.light) happyEvery = 50000;
  if (accHappy >= happyEvery) {
    accHappy = 0;
    if (!(pet.sleepy && !pet.light)) pet.happy = Math.max(0, pet.happy - 6);
  }
  if (accPoop >= 45000 && pet.poops < 4) {
    accPoop = 0;
    pet.poops += 1;
    pet.clean = Math.max(0, pet.clean - 18);
    say('POOP');
    if (pet.poops >= 3 || pet.clean < 15) { pet.sick = true; pet.care = Math.max(-8, pet.care - 1); }
  }
  if (pet.hunger < 8 && pet.happy < 8) {
    pet.warned = true;
    if (!pet.criticalSince) pet.criticalSince = now;
    else if (now - pet.criticalSince > 120000) pet.gone = true;
  } else pet.criticalSince = 0;
  evolve();
  save();
  paintStatus();
}
function alive() { return pet && !pet.gone && pet.stage !== 'egg'; }
function refuseEgg() { say('STILL AN EGG'); tone(120, 0.08); }
function doFeed(kind) {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  unlockSound();
  if (kind === 'meal') {
    const before = pet.hunger;
    pet.hunger = Math.min(100, pet.hunger + 42);
    pet.weight = Math.min(99, pet.weight + 1);
    pet.meals += 1;
    pet.care += 1;
    say(before >= 92 ? 'FULL' : 'YUM');
    tone(700, 0.06);
    dropSnack(petX + face * 36, FLOOR - 20, 'burger');
  } else {
    pet.happy = Math.min(100, pet.happy + 30);
    pet.hunger = Math.min(100, pet.hunger + 14);
    pet.weight = Math.min(99, pet.weight + 2);
    pet.snacks += 1;
    if (pet.snacks >= 4 && pet.snacks > pet.meals + 1) { pet.sick = true; say('TOO MUCH CAKE'); }
    else say('TREAT');
    tone(840, 0.05);
    dropSnack(petX + face * 28, FLOOR - 28, 'cone');
  }
  save();
  paintStatus();
}
function toggleLight() {
  pet.light = !pet.light;
  say(pet.light ? 'LIGHT ON' : 'LIGHTS OUT');
  tone(pet.light ? 600 : 300, 0.05);
  save();
}
function doMeds() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  unlockSound();
  if (pet.sick || pet.clean < 40) {
    pet.sick = false;
    pet.clean = Math.min(100, pet.clean + 28);
    pet.care += 1;
    say('ALL BETTER');
    tone(880, 0.1);
    burst(petX, petY - 46, 6, 'note');
  } else { pet.happy = Math.max(0, pet.happy - 8); say('YUCK'); tone(140, 0.08); }
  save();
  paintStatus();
}
function doBath() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  unlockSound();
  pet.poops = 0;
  pet.clean = 100;
  pet.care += 1;
  if (pet.sick && pet.hunger > 20) pet.sick = false;
  say('BUBBLES');
  tone(520, 0.05, 'sine');
  for (let i = 0; i < 10; i++) bits.push({ x: petX + (Math.random() - 0.5) * 40, y: petY - 10, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 1, kind: 'bubble' });
  save();
  paintStatus();
}
function toggleVacation() {
  if (pet.stage === 'egg' || pet.gone) { say('NOT YET'); return; }
  pet.vacation = !pet.vacation;
  say(pet.vacation ? 'SITTER ON' : 'WELCOME HOME');
  tone(pet.vacation ? 400 : 250, 0.08);
  save();
  paintStatus();
}
function setHat(id) {
  if (HATS.indexOf(id) < 0) return;
  pet.hat = pet.hat === id ? '' : id;
  say(pet.hat ? 'LOOKING SHARP' : 'HAT OFF');
  tone(640, 0.05, 'square');
  document.querySelectorAll('button[data-hat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hat === pet.hat)));
  save();
}
function setRoom(id) {
  if (ROOMS.indexOf(id) < 0) return;
  pet.room = id;
  document.querySelectorAll('button[data-room]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.room === id)));
  say(id.toUpperCase());
  save();
}
function startPlay(type) {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  if (pet.sick && type !== 'mind') { say('TOO SICK'); return; }
  unlockSound();
  mode = 'game';
  if (type === 'catch') play = { type, left: 20000, basket: 220, items: [], score: 0, spawn: 0 };
  else if (type === 'jump') play = { type, y: FLOOR, vy: 0, obs: [], passed: 0, spawn: 400, over: false, run: 0 };
  else play = { type: 'mind', secret: 1 + Math.floor(Math.random() * 20), low: 1, high: 20, mid: 10, guesses: 6, done: '' };
  const pick = $('#gamePick');
  const pads = $('#gamePads');
  if (pick) pick.hidden = true;
  if (pads) pads.hidden = false;
  say(type === 'catch' ? 'CATCH SNACKS' : type === 'jump' ? 'JUMP' : 'HIGH OR LOW');
  paintStatus();
}
function finishPlay(won, score) {
  if (won) {
    pet.happy = Math.min(100, pet.happy + Math.min(36, 8 + score * 4));
    pet.games += 1;
    pet.care += 1;
    pet.weight = Math.max(1, pet.weight - 1);
    burst(petX, petY - 40, 10, 'note');
    tone(880, 0.08);
  } else tone(140, 0.08);
  say(won ? ('SCORE ' + score) : 'MISSED');
  play = null;
  mode = 'pet';
  const pads = $('#gamePads');
  if (pads) pads.hidden = true;
  save();
  paintStatus();
}
function mindAnswer(dir) {
  if (!play || play.type !== 'mind' || play.done) return;
  const secret = play.secret;
  const mid = play.mid;
  if (dir === 'same') {
    if (secret === mid) { play.done = 'yes'; finishPlay(true, 6); return; }
    play.guesses -= 1;
    say('NOT ' + mid);
  } else if ((dir === 'higher' && secret > mid) || (dir === 'lower' && secret < mid)) {
    if (secret > mid) play.low = mid + 1;
    else play.high = mid - 1;
    play.mid = Math.round((play.low + play.high) / 2);
    tone(720, 0.05);
    if (play.low >= play.high) { play.mid = play.low; play.done = 'yes'; finishPlay(true, play.guesses); return; }
    say(dir === 'higher' ? 'HIGHER' : 'LOWER');
  } else if (secret === mid) {
    play.done = 'yes';
    finishPlay(true, play.guesses);
    return;
  } else {
    play.guesses -= 1;
    tone(140, 0.06);
    say('NOPE');
  }
  if (play && play.guesses <= 0) finishPlay(false, 0);
}
function onA() {
  if (pet.gone) return;
  if (play && play.type === 'catch') { play.basket = Math.max(24, play.basket - 36); return; }
  if (play && play.type === 'jump') { jumpPet(); return; }
  if (play && play.type === 'mind') return mindAnswer('lower');
  if (mode === 'feed') { feedPick = feedPick === 'meal' ? 'snack' : 'meal'; tone(480, 0.04); return; }
  if (mode === 'stats') { mode = 'pet'; return; }
  sel = (sel + 1) % MENU.length;
  tone(480, 0.04);
  paintStatus();
}
function onB() {
  if (pet.gone) return resetEgg();
  if (play && play.type === 'catch') { play.basket = Math.min(W - 24, play.basket + 36); return; }
  if (play && play.type === 'jump') return jumpPet();
  if (play && play.type === 'mind') return mindAnswer('same');
  if (mode === 'feed') { doFeed(feedPick); mode = 'pet'; return; }
  if (mode === 'stats') { mode = 'pet'; return; }
  const id = MENU[sel];
  if (id === 'feed') { if (pet.stage === 'egg') return refuseEgg(); mode = 'feed'; feedPick = 'meal'; tone(520, 0.05); return; }
  if (id === 'light') return toggleLight();
  if (id === 'play') return showGames();
  if (id === 'meds') return doMeds();
  if (id === 'clean') return doBath();
  if (id === 'stats') { mode = 'stats'; return; }
  if (id === 'away') return toggleVacation();
}
function onC() {
  if (play) finishPlay(false, play.score || 0);
  mode = 'pet';
  const pads = $('#gamePads');
  const pick = $('#gamePick');
  if (pads) pads.hidden = true;
  if (pick) pick.hidden = true;
  tone(220, 0.04);
}
function showGames() {
  if (pet.gone) return;
  if (pet.stage === 'egg') return refuseEgg();
  const pick = $('#gamePick');
  if (pick) pick.hidden = false;
  say('PICK A GAME');
}
function act(name) {
  if (name === 'meal') return doFeed('meal');
  if (name === 'snack') { tool = 'snack'; return doFeed('snack'); }
  if (name === 'ball') { tool = 'ball'; tossBall(petX + face * 70, FLOOR - 80); say('FETCH'); return; }
  if (name === 'light') return toggleLight();
  if (name === 'play') return showGames();
  if (name === 'meds') return doMeds();
  if (name === 'clean') return doBath();
  if (name === 'stats') { mode = mode === 'stats' ? 'pet' : 'stats'; return; }
  if (name === 'away') return toggleVacation();
  if (name === 'dress') {
    const row = $('#hatRow');
    if (row) row.hidden = !row.hidden;
  }
}
function resetEgg() {
  const shell = pet.shell, name = pet.name, owner = pet.owner, room = pet.room;
  pet = fresh();
  pet.shell = shell;
  pet.name = name;
  pet.owner = owner;
  pet.room = room;
  pet.eggStarted = Date.now();
  mode = 'pet';
  play = null;
  const pads = $('#gamePads');
  if (pads) pads.hidden = true;
  say('NEW EGG');
  save();
}
function burst(x, y, n, kind) {
  for (let i = 0; i < n; i++) {
    bits.push({
      x, y,
      vx: (Math.random() - 0.5) * 80,
      vy: -30 - Math.random() * 70,
      life: 1,
      kind
    });
  }
}
function dropSnack(x, y, kind) {
  snacks.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -20, kind: kind || 'pizza', r: 8 });
  if (snacks.length > 6) snacks.shift();
}
function tossBall(x, y) {
  balls.push({ x: petX, y: petY - 30, vx: (x - petX) * 1.4, vy: Math.min(-80, (y - petY) * 1.2), r: 9 });
  if (balls.length > 4) balls.shift();
  tone(500, 0.04, 'square');
}
function rubPet() {
  if (!alive()) { if (pet.stage === 'egg') { say('WARM'); petVy = -3; } return; }
  const now = performance.now();
  rubUntil = now + 280;
  unlockSound();
  if (now - lastRub > 420) {
    lastRub = now;
    pet.happy = Math.min(100, pet.happy + 7);
    burst(petX, petY - 48, 4, 'heart');
    burst(petX + 10, petY - 36, 2, 'note');
    purr();
    say('PURR');
    save();
    paintStatus();
  }
}
function jumpPet() {
  if (play && play.type === 'jump' && play.y >= FLOOR - 1) play.vy = -7.2;
  else if (!play && petY >= FLOOR - 1) petVy = -7;
}
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  return { x, y };
}
function nearPet(x, y) {
  const rows = SPRITES[spriteKey()] || SPRITES.blob;
  const scale = 5;
  const halfW = rows[0].length * scale * 0.5 + 28;
  const top = petY - rows.length * scale - 36;
  return Math.abs(x - petX) <= halfW && y >= top && y <= petY + 18;
}
function onPointerDown(e) {
  if (!canvas) return;
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  lookX = p.x; lookY = p.y; lookUntil = performance.now() + 2500;
  if (play && play.type === 'catch') { play.basket = p.x; return; }
  if (play && play.type === 'jump') { jumpPet(); return; }
  if (play && play.type === 'mind') return;
  if (nearPet(p.x, p.y)) { rubPet(); return; }
  unlockSound();
  if (tool === 'snack') dropSnack(p.x, p.y - 10, Math.random() < 0.5 ? 'pizza' : 'burger');
  else tossBall(p.x, p.y);
}
function onPointerMove(e) {
  if (!canvas) return;
  const p = canvasPoint(e);
  lookX = p.x; lookY = p.y; lookUntil = performance.now() + 1800;
  if (play && play.type === 'catch') { play.basket = p.x; return; }
  if (e.buttons && nearPet(p.x, p.y)) rubPet();
}
function moodName() {
  if (!pet || pet.gone) return 'gone';
  if (pet.stage === 'egg') return 'egg';
  if (play) return play.type;
  if (pet.vacation) return 'sitter';
  if (!pet.light && (pet.sleepy || nightNow())) return 'nap';
  if (pet.sick || pet.clean < 32) return 'shiver';
  if (pet.hunger < 34) return 'hungry';
  if (pet.happy > 72) return 'joy';
  if (balls.length || snacks.length) return 'chase';
  return 'wander';
}
function stepWorld(dt) {
  clock += dt;
  const sec = dt / 1000;
  bits.forEach(b => {
    b.x += b.vx * sec;
    b.y += b.vy * sec;
    b.vy += 40 * sec;
    b.life -= sec * 0.7;
  });
  bits = bits.filter(b => b.life > 0);
  bugs.forEach(b => {
    b.t += dt;
    b.x += Math.sin(b.t / 300) * 18 * sec + b.vx * sec;
    b.y += Math.cos(b.t / 420) * 12 * sec;
    if (b.x < 10) b.x = W - 10;
    if (b.x > W - 10) b.x = 10;
  });
  visitors.forEach(v => {
    v.x += v.dir * 22 * sec;
    if (v.x < 30 || v.x > W - 30) v.dir *= -1;
    v.step = (v.step || 0) + dt;
  });
  balls.forEach(b => {
    b.vy += 280 * sec;
    b.x += b.vx * sec;
    b.y += b.vy * sec;
    if (b.y > FLOOR - b.r) { b.y = FLOOR - b.r; b.vy *= -0.62; b.vx *= 0.985; }
    if (b.x < b.r || b.x > W - b.r) { b.vx *= -1; b.x = clamp(b.x, b.r, W - b.r); }
  });
  snacks.forEach(s => {
    s.vy += 260 * sec;
    s.x += s.vx * sec;
    s.y += s.vy * sec;
    if (s.y > FLOOR - s.r) { s.y = FLOOR - s.r; s.vy *= -0.35; s.vx *= 0.8; }
    if (s.x < 8 || s.x > W - 8) s.vx *= -1;
  });
  if (play && play.type === 'catch') return stepCatch(dt);
  if (play && play.type === 'jump') return stepJump(dt);
  if (!pet || pet.gone || pet.vacation) return;
  const napping = pet.stage !== 'egg' && !pet.light && (pet.sleepy || nightNow());
  let goal = targetX;
  let speed = 46;
  if (alive() && !napping) {
    if (snacks.length) { goal = snacks[0].x; speed = 110; }
    else if (balls.length) { goal = balls[0].x; speed = 100; }
    else if (pet.happy > 60 && bugs.length && Math.random() < 0.01) goal = bugs[0].x;
    else if (clock > nextWander) {
      targetX = 40 + Math.random() * (W - 80);
      nextWander = clock + 1800 + Math.random() * 2200;
      goal = targetX;
    }
  }
  if (pet.stage === 'egg') {
    petX += Math.sin(clock / 180) * (reduceMotion ? 0 : 8) * sec;
    petY = FLOOR;
  } else if (napping) {
    petVy = 0;
    petY = FLOOR + 6;
    if (Math.random() < 0.02) bits.push({ x: petX + 16, y: petY - 50, vx: 8, vy: -18, life: 1.4, kind: 'zzz' });
  } else {
    const dir = Math.sign(goal - petX);
    if (Math.abs(goal - petX) > 6) {
      petX += dir * speed * sec;
      face = dir || face;
    }
    if (pet.happy > 72 && petY >= FLOOR - 1 && Math.floor(clock / 2400) !== Math.floor((clock - dt) / 2400)) petVy = -6.4;
    petVy += 18 * sec;
    petY += petVy * 42 * sec;
    if (petY > FLOOR) { petY = FLOOR; petVy = 0; }
  }
  petX = clamp(petX, 24, W - 24);
  if (lookUntil > performance.now()) face = lookX < petX ? -1 : 1;
  if (clock > nextBlink) { blinkUntil = clock + 140; nextBlink = clock + 2200 + Math.random() * 2000; }
  if (alive()) {
    snacks = snacks.filter(s => {
      if (Math.abs(s.x - petX) < 16 && Math.abs(s.y - (petY - 8)) < 20) {
        pet.hunger = Math.min(100, pet.hunger + 8);
        pet.happy = Math.min(100, pet.happy + 4);
        burst(s.x, s.y, 4, 'heart');
        tone(760, 0.05, 'square');
        say('NOM');
        return false;
      }
      return true;
    });
    if (balls.length && Math.abs(balls[0].x - petX) < 18 && clock - lastCatch > 900) {
      lastCatch = clock;
      const ball = balls.shift();
      pet.happy = Math.min(100, pet.happy + 5);
      burst(ball.x, ball.y, 3, 'note');
      tone(640, 0.04);
      setTimeout(() => balls.push({ x: 60 + Math.random() * 80, y: 30, vx: 70, vy: 0, r: 9 }), 700);
    }
  }
}
function stepCatch(dt) {
  play.left -= dt;
  play.spawn -= dt;
  play.basket = clamp(play.basket, 20, W - 20);
  petX = play.basket;
  petY = FLOOR;
  if (play.spawn <= 0) {
    play.spawn = 700;
    play.items.push({ x: 20 + Math.random() * (W - 40), y: -10, vy: 70 + Math.random() * 40, kind: Math.random() < 0.5 ? 'pizza' : 'burger' });
  }
  play.items.forEach(it => { it.y += it.vy * dt / 1000; });
  play.items = play.items.filter(it => {
    if (it.y > FLOOR - 16 && Math.abs(it.x - play.basket) < 28) { play.score += 1; tone(800, 0.04); return false; }
    return it.y < H + 10;
  });
  if (play.left <= 0) finishPlay(play.score > 0, play.score);
}
function stepJump(dt) {
  play.run += dt;
  play.vy += 16 * dt / 1000;
  play.y += play.vy * 46 * dt / 1000;
  if (play.y > FLOOR) { play.y = FLOOR; play.vy = 0; }
  petX = 90;
  petY = play.y;
  play.spawn -= dt;
  if (play.spawn <= 0) {
    play.spawn = 1100;
    play.obs.push({ x: W + 10, kind: Math.random() < 0.5 ? 'wave' : 'bird', y: Math.random() < 0.5 ? FLOOR - 8 : FLOOR - 54 });
  }
  play.obs.forEach(o => { o.x -= 120 * dt / 1000; });
  play.obs = play.obs.filter(o => {
    const hit = o.x < petX + 18 && o.x > petX - 10 && Math.abs((o.y) - (petY - 16)) < 22;
    if (hit) { play.over = true; return false; }
    if (o.x < petX - 20 && !o.scored) { o.scored = true; play.passed += 1; }
    return o.x > -30;
  });
  if (play.over) finishPlay(false, play.passed);
  else if (play.passed >= 8) finishPlay(true, play.passed);
}
function sky() {
  const h = new Date().getHours();
  if (h >= 21 || h < 5) return ['#070b18', '#18244a'];
  if (h < 7 || h >= 18) return ['#ff8a3d', '#3558a6'];
  return ['#79c6ff', '#dff4ff'];
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawSky(x, y, w, h) {
  const colors = sky();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const hour = new Date().getHours();
  const night = hour >= 21 || hour < 5;
  ctx.fillStyle = night ? '#f4f1c8' : '#ffe14a';
  const sx = x + (night ? 18 : w - 28);
  const sy = y + 16;
  ctx.beginPath();
  ctx.arc(sx, sy, 10, 0, Math.PI * 2);
  ctx.fill();
  if (!night) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const drift = (clock / 40) % (w + 40);
    ctx.fillRect(x + drift - 20, y + 18, 26, 8);
    ctx.fillRect(x + drift - 10, y + 14, 16, 8);
  }
}
function drawRoom() {
  const room = pet.room || 'bedroom';
  if (room === 'matrix') {
    ctx.fillStyle = '#031006';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(57,255,20,.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#39ff14';
    ctx.font = '12px monospace';
    for (let i = 0; i < 18; i++) {
      const gy = ((clock / 8) + i * 36) % (H + 20) - 10;
      ctx.fillText(String.fromCharCode(48 + ((i + Math.floor(clock / 80)) % 10)), 12 + (i % 9) * 48, gy);
    }
    ctx.fillStyle = '#04200c';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    return;
  }
  if (room === 'beach') {
    drawSky(0, 0, W, 150);
    const sea = ctx.createLinearGradient(0, 140, 0, 230);
    sea.addColorStop(0, '#7dd3fc');
    sea.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 140, W, 80);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wx = (clock / 10 + i * 110) % (W + 60) - 30;
      const wy = 168 + Math.sin(clock / 180 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 18, wy - 6, wx + 36, wy);
      ctx.stroke();
    }
    const sand = ctx.createLinearGradient(0, 210, 0, H);
    sand.addColorStop(0, '#fde68a');
    sand.addColorStop(1, '#d6b07a');
    ctx.fillStyle = sand;
    ctx.fillRect(0, 214, W, H - 214);
    const shipX = 280 + Math.sin(clock / 900) * 10;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(shipX, 148);
    ctx.lineTo(shipX + 86, 148);
    ctx.lineTo(shipX + 74, 164);
    ctx.lineTo(shipX + 12, 164);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(shipX + 28, 128, 22, 20);
    for (let win = 0; win < 5; win++) {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(shipX + 16 + win * 12, 152, 6, 4);
    }
    ctx.fillStyle = '#c2a06a';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    return;
  }
  if (room === 'garden') {
    drawSky(0, 0, W, 150);
    ctx.fillStyle = '#2f6f4e';
    ctx.fillRect(0, 150, W, H - 150);
    ctx.fillStyle = '#6b3a1f';
    ctx.fillRect(0, 146, W, 6);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#ff4d6d', '#ffe14a', '#c86bff'][i % 3];
      ctx.beginPath();
      ctx.arc(30 + i * 78, 168, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#246b32';
      ctx.fillRect(27 + i * 78, 174, 4, 16);
    }
    if ((new Date().getMinutes() % 20) < 8) {
      ctx.strokeStyle = 'rgba(180,220,255,.7)';
      for (let i = 0; i < 20; i++) {
        const rx = (i * 37 + clock / 3) % W;
        const ry = (i * 53 + clock / 2) % 200;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 10);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#1d5a32';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    return;
  }
  ctx.fillStyle = '#6b4a86';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c2a06a';
  ctx.fillRect(0, FLOOR - 8, W, H - FLOOR + 8);
  ctx.fillStyle = '#d7d0c4';
  ctx.fillRect(18, 150, 54, 28);
  ctx.fillStyle = '#9a3030';
  ctx.fillRect(18, 146, 54, 8);
  drawSky(300, 18, 150, 86);
  ctx.strokeStyle = '#f4f1c8';
  ctx.lineWidth = 4;
  ctx.strokeRect(300, 18, 150, 86);
  ctx.lineWidth = 1;
  ctx.fillStyle = '#202020';
  ctx.fillRect(16, 78, 78, 58);
  ctx.fillStyle = Math.floor(clock / 180) % 2 ? '#39ff14' : '#143d18';
  ctx.fillRect(22, 84, 66, 40);
  ctx.fillStyle = '#808080';
  ctx.fillRect(40, 136, 22, 8);
}
function spriteKey() {
  if (pet.species === 'egg' && (Date.now() - pet.eggStarted > HATCH_MS * 0.66)) return 'eggCrack';
  return SPRITES[pet.species] ? pet.species : 'blob';
}
function drawCreature(x, y, scale, species, hat, flip, shiverOn) {
  const rows = SPRITES[species] || SPRITES.blob;
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  const left = x - w / 2;
  const top = y - h;
  const blink = clock < blinkUntil;
  const ear = reduceMotion ? 0 : Math.sin(clock / 90) * 3;
  const shiver = shiverOn && species !== 'egg' ? Math.sin(clock / 28) * 2 : 0;
  const squish = reduceMotion ? 1 : 1 + Math.sin(clock / 140) * 0.04;
  ctx.save();
  ctx.translate(x + shiver, y);
  ctx.scale((flip < 0 ? -1 : 1) * squish, 1 / squish);
  ctx.translate(0, ear * 0.2);
  ctx.fillStyle = 'rgba(15,23,42,.18)';
  ctx.beginPath();
  ctx.ellipse(0, 4, w * 0.32, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const fur = FUR[species] || '#86efac';
  const body = ctx.createRadialGradient(-w * 0.12, -h * 0.55, 4, 0, -h * 0.35, w * 0.55);
  body.addColorStop(0, '#fff');
  body.addColorStop(0.25, fur);
  body.addColorStop(1, '#0f172a');
  ctx.fillStyle = body;
  ctx.beginPath();
  if (species === 'egg') ctx.ellipse(0, -h * 0.42, w * 0.28, h * 0.42, 0, 0, Math.PI * 2);
  else ctx.ellipse(0, -h * 0.38, w * 0.34, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (species !== 'egg') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.1, -h * 0.48, 7, blink ? 1 : 8, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.1, -h * 0.48, 7, blink ? 1 : 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    if (!blink) {
      ctx.beginPath();
      ctx.arc(-w * 0.08, -h * 0.46, 3, 0, Math.PI * 2);
      ctx.arc(w * 0.12, -h * 0.46, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-w * 0.1, -h * 0.5, 2, 2);
      ctx.fillRect(w * 0.1, -h * 0.5, 2, 2);
    }
    ctx.fillStyle = 'rgba(244,114,182,.55)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, -h * 0.32, 5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.2, -h * 0.32, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawHat(left + shiver, top + ear, w, hat, scale);
}
function drawHat(left, top, w, hat) {
  if (!hat) return;
  ctx.save();
  if (hat === 'captain') {
    ctx.fillStyle = '#0b1d5e';
    ctx.fillRect(left + 4, top - 10, w - 8, 8);
    ctx.fillStyle = '#ffd100';
    ctx.fillRect(left, top - 4, w, 4);
  } else if (hat === 'chef') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(left + w / 2 - 8, top - 18, 16, 14);
    ctx.fillRect(left + 2, top - 8, w - 4, 6);
  } else if (hat === 'shades') {
    ctx.fillStyle = '#111';
    ctx.fillRect(left + 4, top + 16, w - 8, 6);
  } else if (hat === 'party') {
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(left + w / 2, top - 20);
    ctx.lineTo(left + w - 2, top);
    ctx.lineTo(left + 2, top);
    ctx.fill();
  } else if (hat === 'wizard') {
    ctx.fillStyle = '#5b2d9e';
    ctx.beginPath();
    ctx.moveTo(left + w / 2, top - 24);
    ctx.lineTo(left + w, top);
    ctx.lineTo(left, top);
    ctx.fill();
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(left + w / 2, top - 16, 3, 3);
  } else if (hat === 'crown') {
    ctx.fillStyle = '#ffd100';
    ctx.fillRect(left + 2, top - 8, w - 4, 8);
    for (let i = 0; i < 3; i++) ctx.fillRect(left + 4 + i * 12, top - 14, 6, 8);
  }
  ctx.restore();
}
function drawBits() {
  bits.forEach(b => {
    ctx.globalAlpha = Math.max(0, b.life);
    if (b.kind === 'heart') {
      ctx.fillStyle = '#ff3b6b';
      ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
      ctx.fillText('♥', b.x, b.y);
    } else if (b.kind === 'note') {
      ctx.fillStyle = '#24185a';
      ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
      ctx.fillText('♪', b.x, b.y);
    } else if (b.kind === 'zzz') {
      ctx.fillStyle = '#24185a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('Zzz', b.x, b.y);
    } else if (b.kind === 'bubble') {
      ctx.strokeStyle = '#7fdfff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}
function drawFood(s) {
  if (s.kind === 'burger') {
    ctx.fillStyle = '#c47a2c';
    ctx.fillRect(s.x - 7, s.y - 3, 14, 5);
    ctx.fillStyle = '#6b8f3a';
    ctx.fillRect(s.x - 6, s.y - 6, 12, 3);
    ctx.fillStyle = '#e0b060';
    ctx.fillRect(s.x - 7, s.y - 9, 14, 3);
  } else if (s.kind === 'cone') {
    ctx.fillStyle = '#f4d2e8';
    ctx.beginPath();
    ctx.arc(s.x, s.y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0b060';
    ctx.fillRect(s.x - 3, s.y, 6, 7);
  } else {
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(s.x - 2, s.y - 2, 2, 2);
  }
}
function drawBubble(text, x, y) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1c2410';
  roundRect(x, y, text.length * 8 + 12, 18, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1c2410';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 6, y + 13);
}
function drawScene() {
  drawRoom();
  if (!pet.light && pet.room === 'bedroom') {
    ctx.fillStyle = 'rgba(0,0,12,.45)';
    ctx.fillRect(0, 0, W, H);
  }
  visitors.forEach(v => {
    drawCreature(v.x, FLOOR - 8, 3, v.species || 'blob', '', v.dir);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(v.name || '').slice(0, 8), v.x, FLOOR - 48);
  });
  bugs.forEach(b => {
    ctx.fillStyle = '#7a4bff';
    ctx.fillRect(b.x, b.y, 4, 3);
    ctx.fillStyle = 'rgba(180,220,255,.8)';
    const wing = Math.sin(b.t / 40) * 3;
    ctx.fillRect(b.x - 3, b.y - wing, 3, 2);
    ctx.fillRect(b.x + 4, b.y + wing, 3, 2);
  });
  balls.forEach(b => {
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x - 2, b.y - 3, 3, 3);
  });
  snacks.forEach(drawFood);
  if (pet.poops && pet.stage !== 'egg') {
    ctx.fillStyle = '#6b3e1e';
    for (let i = 0; i < pet.poops; i++) ctx.fillRect(16 + i * 16, FLOOR - 10, 8, 6);
  }
  const species = spriteKey();
  drawCreature(petX, petY, 5, species, pet.hat, face, !!(pet.sick || pet.clean < 32));
  if (alive() && pet.hunger < 34 && !(play && play.type)) {
    drawBubble(Math.floor(clock / 800) % 2 ? 'BURGER?' : 'PIZZA?', petX + 18, petY - 78);
  }
  if (note && performance.now() < noteUntil) drawBubble(note.slice(0, 16), 8, 8);
  drawBits();
  if (mode === 'stats') {
    ctx.fillStyle = 'rgba(248,244,216,.92)';
    ctx.fillRect(70, 40, 340, 150);
    ctx.strokeStyle = '#1c2410';
    ctx.strokeRect(70, 40, 340, 150);
    ctx.fillStyle = '#1c2410';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    const lines = [
      pet.name + ' the ' + (LABELS[pet.species] || pet.stage),
      ageText(pet) + '  ' + pet.weight + ' oz',
      'Hunger ' + pet.hunger + '%   Happy ' + pet.happy + '%',
      'Clean ' + pet.clean + '%' + (pet.sick ? '  SICK' : '  OK') + (pet.vacation ? '  SITTER' : ''),
      'B closes this card'
    ];
    lines.forEach((line, i) => ctx.fillText(line, 84, 68 + i * 22));
  }
  if (mode === 'feed') {
    drawBubble(feedPick === 'meal' ? 'MEAL  B OK' : 'TREAT  B OK', 160, 40);
  }
  if (play && play.type === 'catch') {
    ctx.fillStyle = '#24185a';
    ctx.fillRect(play.basket - 24, FLOOR - 6, 48, 6);
    play.items.forEach(drawFood);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SNACKS ' + play.score + '  ' + Math.ceil(play.left / 1000) + 's', 8, 24);
  }
  if (play && play.type === 'jump') {
    play.obs.forEach(o => {
      if (o.kind === 'wave') {
        ctx.fillStyle = '#1c6b9a';
        ctx.beginPath();
        ctx.arc(o.x, FLOOR - 4, 16, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(o.x, o.y, 18, 8);
        ctx.fillRect(o.x + 14, o.y - 6, 8, 4);
      }
    });
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('JUMP ' + play.passed + '/8', 8, 24);
  }
  if (play && play.type === 'mind') {
    drawBubble('IS IT ' + play.mid + '?', petX - 20, petY - 86);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(play.low + ' – ' + play.high + '   tries ' + play.guesses, 8, 24);
  }
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(0, H - 16, W, 16);
  ctx.fillStyle = '#ffe14a';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  MENU.forEach((id, i) => {
    ctx.fillStyle = i === sel && mode === 'pet' ? '#39ff14' : '#ffe14a';
    ctx.fillText(id.slice(0, 4).toUpperCase(), 6 + i * 42, H - 4);
  });
}
function paintBars() {
  const rows = [
    ['mHunger', pet.hunger, false],
    ['mHappy', pet.happy, false],
    ['mClean', pet.clean, false]
  ];
  rows.forEach(row => {
    const el = document.getElementById(row[0]);
    const num = document.getElementById(row[0] + 'N');
    if (!el) return;
    const value = clamp(row[1] | 0, 0, 100);
    el.style.width = value + '%';
    el.style.background = value < 30 ? '#c0392b' : value < 60 ? '#e0a106' : '#2f8f3a';
    if (num) num.textContent = value + '%';
  });
}
function paintStatus() {
  const el = $('#status');
  if (canvas) {
    canvas.dataset.stage = pet.stage;
    canvas.dataset.species = pet.species;
    canvas.dataset.hunger = String(pet.hunger);
    canvas.dataset.happy = String(pet.happy);
    canvas.dataset.clean = String(pet.clean);
    canvas.dataset.room = pet.room;
    canvas.dataset.hat = pet.hat || 'none';
    canvas.dataset.mood = moodName();
    canvas.dataset.screen = play ? play.type : mode;
    canvas.dataset.fps = String(fps);
    canvas.dataset.light = pet.light ? 'on' : 'off';
    canvas.dataset.vacation = pet.vacation ? 'on' : 'off';
  }
  paintBars();
  const shell = $('#keychain');
  if (shell) shell.dataset.shell = pet.shell;
  if (!el) return;
  if (pet.gone) { el.textContent = pet.name + ' has gone. Press B for a new egg.'; return; }
  if (pet.stage === 'egg') {
    const left = Math.max(0, Math.ceil((HATCH_MS - (Date.now() - pet.eggStarted)) / 1000));
    el.textContent = 'An egg is warming up. About ' + left + ' seconds. Rub the egg to cheer it on.';
    return;
  }
  el.textContent = pet.name + ' the ' + (LABELS[pet.species] || pet.stage) + ' is ' + moodName() + '. Hunger ' + pet.hunger + '%. Happiness ' + pet.happy + '%. Clean ' + pet.clean + '%. ' + ageText(pet) + '.' + (pet.sick ? ' Sick.' : '') + (pet.vacation ? ' With the sitter.' : '');
}
let petTimer = 0, petDrawing = false, lastFrame = 0;
function frame(ts) {
  if (!petDrawing || document.hidden) { petDrawing = false; return; }
  const dt = Math.min(40, lastFrame ? ts - lastFrame : 16);
  lastFrame = ts;
  frames += 1;
  if (ts - fpsStamp > 1000) { fps = frames; frames = 0; fpsStamp = ts; }
  stepWorld(reduceMotion ? dt * 0.65 : dt);
  if (ctx) {
    ctx.clearRect(0, 0, W, H);
    drawScene();
  }
  requestAnimationFrame(frame);
}
function startPetLoops() {
  if (document.hidden) {
    petDrawing = false;
    if (petTimer) { clearInterval(petTimer); petTimer = 0; }
    if (audioCtx && audioCtx.suspend) audioCtx.suspend();
    return;
  }
  if (!petTimer) petTimer = setInterval(tick, 400);
  if (!petDrawing) { petDrawing = true; lastFrame = 0; requestAnimationFrame(frame); }
}
function syncBanner() {
  const el = $('#syncBanner');
  if (el) el.hidden = !rulesBlocked;
}
function showBanner() { rulesBlocked = true; serverLive = false; syncBanner(); }
function hideBanner() { rulesBlocked = false; syncBanner(); }
function isDenied(err) {
  return /PERMISSION_DENIED|permission[-_ ]denied/i.test(String((err && err.code) || '') + ' ' + String((err && err.message) || ''));
}
function isAdminNow() { return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner()); }
function syncVisitors() {
  const rows = Object.keys(remote).map(id => Object.assign({ id }, remote[id])).filter(r => r && r.name && r.id !== myUid);
  visitors = rows.slice(0, 4).map((r, i) => {
    const prev = visitors.filter(v => v.id === r.id)[0];
    return prev || { id: r.id, name: r.name, species: r.species || 'blob', x: 40 + i * 70, dir: i % 2 ? -1 : 1, step: 0 };
  });
}
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
  syncVisitors();
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = 'No pets in the park yet.';
    empty.appendChild(span);
    list.appendChild(empty);
    return;
  }
  rows.forEach(r => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = r.name + ' · ' + (LABELS[r.species] || r.stage || '') + ' · ' + (r.owner || '') + ' · ' + (r.age | 0) + 'd';
    if (window.MONDO_MEMBER && r.id) window.MONDO_MEMBER.adorn(span, r.id);
    li.appendChild(span);
    const actions = document.createElement('span');
    actions.className = 'park-actions';
    if (r.id && r.id !== myUid) {
      const wave = document.createElement('button');
      wave.type = 'button';
      wave.dataset.wave = r.id;
      wave.dataset.pname = r.name || 'Pet';
      wave.textContent = '👋 Wave';
      const treat = document.createElement('button');
      treat.type = 'button';
      treat.dataset.treat = r.id;
      treat.dataset.pname = r.name || 'Pet';
      treat.textContent = '🍓 Send Treat';
      actions.appendChild(wave);
      actions.appendChild(treat);
    }
    if (isOwner && r.id) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.remove = r.id;
      btn.textContent = 'Remove';
      actions.appendChild(btn);
    }
    li.appendChild(actions);
    list.appendChild(li);
  });
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
  firebase.database().ref('pet/pings').limitToLast(20).on('child_added', snap => {
    if (!pingsReady) return;
    const v = snap.val() || {};
    if (!v || seenPing[snap.key]) return;
    seenPing[snap.key] = 1;
    if (v.to !== myUid) return;
    if (v.kind === 'treat') {
      pet.hunger = Math.min(100, pet.hunger + 12);
      pet.happy = Math.min(100, pet.happy + 8);
      dropSnack(80 + Math.random() * 200, 40, 'cone');
      say((v.name || 'A friend') + ' TREAT');
    } else {
      pet.happy = Math.min(100, pet.happy + 6);
      burst(petX, petY - 40, 6, 'heart');
      say((v.name || 'A friend') + ' WAVED');
    }
    save();
  });
  setTimeout(() => { pingsReady = true; }, 1600);
}
function connectPet() {
  const c = window.MONDO_BOARD_CONFIG;
  if (typeof firebase === 'undefined' || !c || !c.apiKey || !c.databaseURL) return;
  try { if (!firebase.apps.length) firebase.initializeApp(c); } catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      isOwner = false;
      myUid = '';
      if (!window.MONDO_MEMBER) $('#ownerBtn').textContent = 'Owner sign in';
      try { await firebase.auth().signInAnonymously(); } catch { /* local pet still works */ }
      return;
    }
    myUid = user.uid;
    isOwner = isAdminNow();
    if (!connectPet.ownerListen) { connectPet.ownerListen = true; document.addEventListener('mondo-owner', function () { var on = isAdminNow(); if (on === isOwner) return; isOwner = on; if (!window.MONDO_MEMBER) $('#ownerBtn').textContent = isOwner ? 'Sign out' : 'Owner sign in'; renderPark(); }); }
    if (!window.MONDO_MEMBER) $('#ownerBtn').textContent = isOwner ? 'Sign out' : 'Owner sign in';
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
async function postPing(to, kind, theirName) {
  unlockSound();
  const label = theirName || 'that pet';
  if (kind === 'wave') {
    burst(120, 80, 5, 'heart');
    say('WAVED');
    toast('You waved at ' + label);
  } else {
    dropSnack(160, 50, 'cone');
    say('TREAT SENT');
    toast('Treat sent to ' + label);
  }
  if (!myUid || typeof firebase === 'undefined' || !firebase.apps.length || rulesBlocked) return;
  const wait = 8200 - (Date.now() - lastPost);
  if (lastPost && wait > 0) await new Promise(r => setTimeout(r, wait));
  const name = cleanName(pet.name) || 'Mondo';
  if (!/^[A-Za-z0-9]/.test(name)) return;
  const ref = firebase.database().ref('pet/pings').push();
  const updates = {};
  updates['pet/pings/' + ref.key] = {
    kind, from: myUid, to, name, at: firebase.database.ServerValue.TIMESTAMP
  };
  updates['pet/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  try {
    await firebase.database().ref().update(updates);
    lastPost = Date.now();
  } catch (err) {
    if (isDenied(err)) showBanner();
  }
}
function setShell(id) {
  if (!/^(purple|blue|pink|green|yellow)$/.test(id)) return;
  pet.shell = id;
  document.querySelectorAll('.shells [data-shell]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shell === id)));
  save();
  paintStatus();
}
function bootWorld() {
  balls = [{ x: 70, y: 40, vx: 90, vy: 10, r: 9 }];
  bugs = [
    { x: 80, y: 70, vx: 12, t: 0 },
    { x: 200, y: 50, vx: -8, t: 40 },
    { x: 360, y: 90, vx: 10, t: 80 }
  ];
}
function init() {
  canvas = $('#lcd');
  ctx = canvas.getContext('2d', { alpha: false });
  reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  pet = load();
  catchUp();
  save();
  bootWorld();
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  $('#petName').value = pet.name;
  $('#ownerName').value = pet.owner;
  setShell(pet.shell);
  setRoom(pet.room);
  document.querySelectorAll('button[data-hat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hat === pet.hat)));
  $('#btnA').onclick = onA;
  $('#btnB').onclick = onB;
  $('#btnC').onclick = onC;
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
  document.querySelectorAll('.shells [data-shell]').forEach(b => b.addEventListener('click', () => setShell(b.dataset.shell)));
  document.querySelectorAll('button[data-room]').forEach(b => b.addEventListener('click', () => setRoom(b.dataset.room)));
  document.querySelectorAll('button[data-hat]').forEach(b => b.addEventListener('click', () => setHat(b.dataset.hat)));
  document.querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => startPlay(b.dataset.game)));
  const exit = $('#gameExit');
  if (exit) exit.onclick = () => { const pick = $('#gamePick'); if (pick) pick.hidden = true; };
  $('#padLeft').onclick = () => {
    if (play && play.type === 'mind') mindAnswer('lower');
    else if (play && play.type === 'catch') play.basket -= 28;
    else onA();
  };
  $('#padRight').onclick = () => {
    if (play && play.type === 'mind') mindAnswer('higher');
    else if (play && play.type === 'catch') play.basket += 28;
    else onB();
  };
  const jump = $('#padJump');
  if (jump) jump.onclick = () => {
    if (play && play.type === 'mind') mindAnswer('same');
    else jumpPet();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  $('#nameForm').addEventListener('submit', e => { e.preventDefault(); postPark(); });
  $('#petName').addEventListener('change', () => { const n = cleanName($('#petName').value); if (n) { pet.name = n; save(); paintStatus(); } });
  $('#ownerName').addEventListener('change', () => { const n = cleanName($('#ownerName').value); if (n) { pet.owner = n; save(); } });
  $('#soundBtn').onclick = () => {
    userMuted = soundOn;
    soundOn = !soundOn;
    userMuted = !soundOn;
    $('#soundBtn').textContent = soundOn ? 'Mute' : 'Sound';
    $('#soundBtn').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) { unlockSound(); tone(660, 0.06); }
  };
  $('#ownerBtn').onclick = () => {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
    const user = firebase.auth().currentUser;
    if (isAdminNow()) { firebase.auth().signOut(); return; }
    $('#ownerError').hidden = true;
    $('#ownerPass').value = '';
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
    const wave = e.target.closest('[data-wave]');
    const treat = e.target.closest('[data-treat]');
    const remove = e.target.closest('[data-remove]');
    if (wave) return postPing(wave.dataset.wave, 'wave', wave.dataset.pname);
    if (treat) return postPing(treat.dataset.treat, 'treat', treat.dataset.pname);
    if (!remove || !isOwner) return;
    const id = remove.dataset.remove;
    if (!id || !confirm('Remove this pet from the park?')) return;
    try { await firebase.database().ref('pet/park/' + id).remove(); toast('Removed'); }
    catch (err) { if (isDenied(err)) showBanner(); toast('Could not remove that pet'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { startPetLoops(); return; }
    catchUp();
    if (soundOn && audioCtx && audioCtx.resume) audioCtx.resume();
    startPetLoops();
  });
  connectPet();
  renderPark();
  paintStatus();
  startPetLoops();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})();
