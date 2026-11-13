(() => {
'use strict';
const KEY = 'mondosupreme.arcade.v1';
const W = 360, H = 520;
const HOW = {
  seas: 'Dodge islands, rogue waves, and whirlpools. Collect stars, passengers, and port bonuses. Speed climbs every level.',
  kitchen: 'Catch the ingredients for the dish on the order. Dodge burnt toast and bombs. Combos multiply the score.',
  breaker: 'Move the paddle. Space or Enter launches the ball and fires lasers. A and D move left and right. Grab multi-ball, wide paddle, and laser drops.',
  coil: 'Slide the spark wand along the hedge. It fires by itself. Pop the lantern chain before it reaches you. Later waves move faster and split.'
};
const NAMES = { seas: 'High Seas Cruiser', kitchen: 'Supreme Kitchen Rush', breaker: 'Cyber Brick Breaker', coil: 'Lantern Coil' };
const DISHES = [
  { name: 'Pasta', need: { tomato: 2, noodle: 1 } },
  { name: 'Omelette', need: { egg: 2, herb: 1 } },
  { name: 'Salad', need: { tomato: 1, herb: 2 } },
  { name: 'Soup', need: { tomato: 1, noodle: 1, herb: 1 } }
];
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let canvas, ctx, current = 'seas', phase = 'attract', run = null, finalScore = 0;
let raf = 0, last = 0;
const input = { left: false, right: false, up: false, down: false, fire: false, px: null, py: null, touch: false };
let audioCtx = null, soundOn = false;
let serverLive = false, rulesBlocked = false, isOwner = false, myUid = '';
let quota = { n: 0, day: 0 }, quotaLoaded = false, lastPost = 0, listening = false;
const remote = { seas: {}, kitchen: {}, breaker: {}, coil: {} };
let coilHold = false;
let coilHarness = false;

function loadStore() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { s = {}; }
  if (!s.best) s.best = {};
  if (!s.mine) s.mine = {};
  if (typeof s.name !== 'string') s.name = 'AAA';
  return s;
}
function saveStore(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ } }
function cleanName(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12);
}
function juice() { return window.MONDO_JUICE || null; }
function audible() {
  return soundOn && !(window.MONDO_AUDIO && MONDO_AUDIO.muted && MONDO_AUDIO.muted());
}
function syncSoundButton() {
  const btn = $('#soundBtn');
  if (!btn) return;
  const on = audible();
  btn.textContent = on ? 'Mute' : 'Sound';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function beep(freq, dur, type) {
  const kit = juice();
  if (kit) {
    kit.play(type === 'sawtooth' ? 'hurt' : 'hit', { localOn: soundOn, pitch: freq, dur: dur, type: type || 'square' });
    return;
  }
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch { /* sound is optional */ }
}
function feel(kind, x, y, color) {
  const kit = juice();
  if (!kit) return;
  if (kind === 'hurt') {
    kit.shake(6, 180);
    kit.hitstop(120);
    kit.vibrate([16, 28, 16]);
    return;
  }
  if (kind === 'break') {
    kit.burst(x, y, { n: 8, color: color || '#fff', speed: 110, life: 0.42, gravity: 240, size: 3 });
    kit.shake(2.5, 110);
    kit.vibrate(10);
    return;
  }
  if (kind === 'catch') {
    kit.burst(x, y, { n: 6, color: color || '#fff7ed', speed: 70, life: 0.32, gravity: -30, size: 3 });
    kit.vibrate(8);
    return;
  }
  if (kind === 'win') {
    kit.shake(3, 160);
    kit.confetti();
    kit.vibrate([10, 20, 10]);
  }
}
function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}
function setHud(text) {
  const el = $('#hud');
  if (el && el.textContent !== text) el.textContent = text;
}
function scrollSpeed(level) { return 168 + (level - 1) * 24; }
function steer(dt, yMin, yMax) {
  const s = run.ship;
  if (input.px != null) s.x = input.px * W;
  else {
    const v = 260;
    if (input.left) s.x -= v * dt;
    if (input.right) s.x += v * dt;
  }
  if (input.up) s.y -= 200 * dt;
  if (input.down) s.y += 200 * dt;
  s.x = clamp(s.x, 22, W - 22);
  s.y = clamp(s.y, yMin, yMax);
}
function pop(text, x, y) { run.pops.push({ text, x, y, life: 0.8 }); }
function stepPops(dt) {
  run.pops.forEach(p => { p.life -= dt; p.y -= 18 * dt; });
  run.pops = run.pops.filter(p => p.life > 0);
}
function hurt() {
  if (run.ship.inv > 0) return false;
  run.ship.lives -= 1;
  run.ship.inv = 1.25;
  run.flash = 0.15;
  beep(90, 0.18, 'sawtooth');
  feel('hurt');
  return run.ship.lives <= 0;
}

function newSeas() {
  return {
    ship: { x: W / 2, y: H - 120, lives: 3, inv: 0 },
    stuff: [], pops: [], score: 0, level: 1, t: 0, levelT: 0, flash: 0,
    nextStar: 0.3, nextBad: 2, nextWave: 7, nextWhirl: 10, nextPort: 12, nextGuest: 1.2,
    badCount: 0, waves: 0
  };
}
function stepSeas(dt) {
  const vy = scrollSpeed(run.level);
  run.t += dt;
  run.levelT += dt;
  run.ship.inv = Math.max(0, run.ship.inv - dt);
  run.flash = Math.max(0, run.flash - dt);
  if (run.levelT > 22) {
    run.levelT = 0;
    run.level += 1;
    pop('LEVEL ' + run.level, W / 2, H / 2);
    beep(520, 0.12);
  }
  steer(dt, H * 0.42, H - 64);
  const spawn = (kind, x, r) => run.stuff.push({ kind, x, y: -24, r, vy });
  if (run.t >= run.nextStar) {
    run.nextStar = run.t + 0.85;
    const aimed = run.t < 4 || Math.random() < 0.45;
    spawn('star', aimed ? run.ship.x : rand(18, W - 18), 8);
  }
  if (run.t >= run.nextGuest) {
    run.nextGuest = run.t + 2.4;
    spawn('guest', rand(20, W - 20), 8);
  }
  if (run.t >= run.nextBad) {
    run.nextBad = run.t + Math.max(1.15, 2.15 - run.level * 0.08);
    const aim = run.badCount % 2 === 0;
    run.badCount += 1;
    spawn('island', aim ? run.ship.x : rand(30, W - 30), 26);
  }
  if (run.t >= run.nextWave) {
    run.nextWave = run.t + 9;
    const gap = run.waves === 0 ? W / 2 : rand(60, W - 60);
    run.waves += 1;
    run.stuff.push({ kind: 'wave', x: gap, y: -20, r: 18, vy });
  }
  if (run.t >= run.nextWhirl) {
    run.nextWhirl = run.t + 11;
    spawn('whirl', rand(40, W - 40), 22);
  }
  if (run.t >= run.nextPort) {
    run.nextPort = run.t + 13;
    spawn('port', Math.random() < 0.5 ? 48 : W - 48, 24);
  }
  const ship = run.ship;
  run.stuff.forEach(it => {
    it.y += it.vy * dt;
    if (it.kind === 'whirl') {
      const dx = it.x - ship.x;
      const dy = it.y - ship.y;
      if (dx * dx + dy * dy < 90 * 90) ship.x += Math.sign(dx || 1) * 70 * dt;
    }
  });
  ship.x = clamp(ship.x, 22, W - 22);
  const keep = [];
  for (const it of run.stuff) {
    if (it.y > H + 40) continue;
    const near = Math.abs(it.x - ship.x) < it.r + 16 && Math.abs(it.y - ship.y) < it.r + 22;
    if (it.kind === 'star' && near) { run.score += 25; pop('+25', it.x, it.y); beep(880, 0.05); feel('catch', it.x, it.y, '#ffe14a'); continue; }
    if (it.kind === 'guest' && near) { run.score += 50; pop('+50', it.x, it.y); beep(660, 0.06); feel('catch', it.x, it.y, '#ff7ad9'); continue; }
    if (it.kind === 'port' && near) { run.score += 150 + run.level * 25; pop('PORT', it.x, it.y); beep(520, 0.1); feel('catch', it.x, it.y, '#ffe14a'); continue; }
    if (it.kind === 'island' && near && hurt()) return finish();
    if (it.kind === 'island' && near) continue;
    if (it.kind === 'whirl' && Math.abs(it.x - ship.x) < 18 && Math.abs(it.y - ship.y) < 18 && hurt()) return finish();
    if (it.kind === 'wave' && Math.abs(it.y - ship.y) < 24 && (ship.x < it.x - 46 || ship.x > it.x + 46) && hurt()) return finish();
    keep.push(it);
  }
  run.stuff = keep;
  stepPops(dt);
  setHud('Score ' + run.score + ' · Lives ' + run.ship.lives + ' · Level ' + run.level);
}

function orderFrom(level) {
  const dish = DISHES[(level - 1) % DISHES.length];
  const have = {};
  Object.keys(dish.need).forEach(k => { have[k] = 0; });
  return { name: dish.name, need: dish.need, have };
}
function orderDone(order) { return Object.keys(order.need).every(k => order.have[k] >= order.need[k]); }
function newKitchen() {
  return {
    ship: { x: W / 2, y: H - 58, lives: 3, inv: 0, w: 86 },
    stuff: [], pops: [], score: 0, level: 1, t: 0, combo: 0, flash: 0,
    order: orderFrom(1), next: 0.35, spawned: 0
  };
}
function stepKitchen(dt) {
  run.t += dt;
  run.ship.inv = Math.max(0, run.ship.inv - dt);
  run.ship.squash = Math.max(0, (run.ship.squash || 0) - dt);
  run.flash = Math.max(0, run.flash - dt);
  steer(dt, H - 80, H - 46);
  const vy = 130 + run.level * 16;
  if (run.t >= run.next) {
    run.next = run.t + Math.max(0.38, 0.82 - run.level * 0.04);
    run.spawned += 1;
    const keys = Object.keys(run.order.need);
    let kind = keys[run.spawned % keys.length];
    let x = rand(24, W - 24);
    if (run.spawned < 2) { kind = keys[0]; x = run.ship.x; }
    else if (Math.random() < 0.22) kind = Math.random() < 0.5 ? 'toast' : 'bomb';
    run.stuff.push({ kind, x, y: -16, vy });
  }
  const pan = run.ship;
  const mult = 1 + Math.min(4, Math.floor(run.combo / 3));
  const keep = [];
  for (const it of run.stuff) {
    it.y += it.vy * dt;
    const caught = it.y > pan.y - 16 && it.y < pan.y + 20 && Math.abs(it.x - pan.x) < pan.w / 2;
    if (it.y > H + 20) {
      if (run.order.need[it.kind] && run.order.have[it.kind] < run.order.need[it.kind]) run.combo = 0;
      continue;
    }
    if (!caught) { keep.push(it); continue; }
    if (it.kind === 'toast' || it.kind === 'bomb') {
      run.combo = 0;
      pop(it.kind === 'bomb' ? 'BOMB' : 'BURNT', it.x, it.y);
      if (hurt()) return finish();
      continue;
    }
    const need = run.order.need[it.kind] || 0;
    const have = run.order.have[it.kind] || 0;
    if (need && have < need) {
      run.order.have[it.kind] = have + 1;
      run.combo += 1;
      const add = 15 * mult;
      run.score += add;
      run.ship.squash = 0.1;
      pop('+' + add, it.x, it.y);
      beep(740, 0.05);
      feel('catch', it.x, it.y, '#fff7ed');
      if (orderDone(run.order)) {
        const bonus = 200 * run.level;
        run.score += bonus;
        run.level += 1;
        pop('DISH +' + bonus, W / 2, 80);
        beep(523, 0.08);
        beep(784, 0.12);
        feel('win', W / 2, 80);
        run.order = orderFrom(run.level);
      }
    } else {
      run.score += 5;
      run.ship.squash = 0.08;
      pop('+5', it.x, it.y);
      feel('catch', it.x, it.y, '#fff');
    }
  }
  run.stuff = keep;
  stepPops(dt);
  setHud('Score ' + run.score + ' · Combo x' + mult + ' · Lives ' + run.ship.lives);
}

function layoutBricks(level) {
  const bricks = [];
  const cols = 8;
  const rows = Math.min(6, 3 + level);
  const gap = 4;
  const w = (W - 16 - gap * (cols - 1)) / cols;
  const h = 14;
  const colors = ['#ff2bd6', '#39ff14', '#00e5ff', '#ffe14a', '#ff6a00', '#9b5cff'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bricks.push({ x: 8 + c * (w + gap), y: 34 + r * (h + gap), w, h, alive: true, color: colors[r % colors.length] });
    }
  }
  return bricks;
}
function newBreaker() {
  const run0 = {
    paddle: { x: W / 2 - 32, w: 64, y: H - 36, wide: 0, laser: 0 },
    balls: [], bricks: layoutBricks(1), drops: [], shots: [], pops: [],
    lives: 3, level: 1, score: 0, cool: 0, flash: 0
  };
  stickBall(run0);
  return run0;
}
function stickBall(state) {
  const p = state.paddle;
  state.balls = [{ x: p.x + p.w / 2, y: p.y - 8, vx: 0, vy: 0, stuck: true, r: 6 }];
}
function stepBreaker(dt) {
  const p = run.paddle;
  p.wide = Math.max(0, p.wide - dt);
  p.laser = Math.max(0, p.laser - dt);
  run.cool = Math.max(0, run.cool - dt);
  run.flash = Math.max(0, run.flash - dt);
  p.w = p.wide > 0 ? 112 : 64;
  if (input.px != null) p.x = input.px * W - p.w / 2;
  else {
    if (input.left) p.x -= 280 * dt;
    if (input.right) p.x += 280 * dt;
  }
  p.x = clamp(p.x, 4, W - p.w - 4);
  const stuck = run.balls.some(b => b.stuck);
  if (input.fire && stuck) {
    run.balls.forEach(b => {
      if (!b.stuck) return;
      b.stuck = false;
      b.vx = 90;
      b.vy = -(210 + run.level * 12);
    });
    beep(440, 0.06);
  } else if (input.fire && p.laser > 0 && run.cool <= 0) {
    run.cool = 0.28;
    run.shots.push({ x: p.x + p.w / 2, y: p.y, vy: 360 });
    beep(980, 0.04);
  }
  run.balls.forEach(b => { if (b.stuck) { b.x = p.x + p.w / 2; b.y = p.y - b.r - 1; } });
  const steps = 4;
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    run.balls.forEach(b => {
      if (b.stuck) return;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r + 18) { b.y = b.r + 18; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && b.y + b.r >= p.y && b.y - b.r <= p.y + 12 && b.x >= p.x && b.x <= p.x + p.w) {
        const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2);
        const sp = 210 + run.level * 14;
        b.vy = -sp;
        b.vx = clamp(hit * 220, -240, 240);
        b.y = p.y - b.r - 1;
        beep(300, 0.03);
      }
      for (const brick of run.bricks) {
        if (!brick.alive) continue;
        const cx = clamp(b.x, brick.x, brick.x + brick.w);
        const cy = clamp(b.y, brick.y, brick.y + brick.h);
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        brick.alive = false;
        if (Math.abs(dx) > Math.abs(dy)) b.vx *= -1;
        else b.vy *= -1;
        b.x += Math.sign(b.vx || 1) * 1.5;
        b.y += Math.sign(b.vy || 1) * 1.5;
        run.score += 20 * run.level;
        beep(620 + Math.min(6, run.level) * 24, 0.03);
        feel('break', brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
        if (Math.random() < 0.2) {
          const types = ['multi', 'wide', 'laser'];
          run.drops.push({ type: types[Math.floor(Math.random() * 3)], x: brick.x + brick.w / 2, y: brick.y, vy: 90 });
        }
        break;
      }
    });
  }
  run.shots.forEach(shot => {
    shot.y -= shot.vy * dt;
    for (const brick of run.bricks) {
      if (!brick.alive) continue;
      if (shot.x >= brick.x && shot.x <= brick.x + brick.w && shot.y >= brick.y && shot.y <= brick.y + brick.h) {
        brick.alive = false;
        shot.y = -99;
        run.score += 15;
      }
    }
  });
  run.shots = run.shots.filter(shot => shot.y > -20);
  const keptDrops = [];
  for (const d of run.drops) {
    d.y += d.vy * dt;
    if (d.y > H) continue;
    if (d.y >= p.y && d.x >= p.x && d.x <= p.x + p.w) {
      if (d.type === 'wide') { p.wide = 8; pop('WIDE', d.x, d.y); }
      if (d.type === 'laser') { p.laser = 8; pop('LASER', d.x, d.y); }
      if (d.type === 'multi' && run.balls.length < 4) {
        const src = run.balls.find(b => !b.stuck) || run.balls[0];
        run.balls.push({ x: src.x, y: src.y, vx: -src.vx || 120, vy: -Math.abs(src.vy || 200), stuck: false, r: 6 });
        pop('MULTI', d.x, d.y);
      }
      beep(840, 0.08);
      continue;
    }
    keptDrops.push(d);
  }
  run.drops = keptDrops;
  run.balls = run.balls.filter(b => b.stuck || b.y < H + 16);
  if (!run.balls.length) {
    run.lives -= 1;
    run.flash = 0.15;
    beep(90, 0.16, 'sawtooth');
    feel('hurt');
    if (run.lives <= 0) return finish();
    stickBall(run);
  }
  if (run.bricks.every(b => !b.alive)) {
    run.score += 400;
    run.level += 1;
    run.bricks = layoutBricks(run.level);
    p.wide = 0;
    p.laser = 0;
    stickBall(run);
    pop('LEVEL ' + run.level, W / 2, H / 2);
    beep(523, 0.1);
  }
  run.balls.forEach(b => { if (!b.stuck && Math.abs(b.vx) < 30) b.vx = b.vx < 0 ? -40 : 40; });
  stepPops(dt);
  const mode = p.laser > 0 ? ' · LASER' : (p.wide > 0 ? ' · WIDE' : '');
  setHud('Score ' + run.score + ' · Lives ' + run.lives + ' · Level ' + run.level + mode);
}

const COIL_CELL = 18;
const COIL_COLS = 20;
const coilStars = [];
for (let starI = 0; starI < 26; starI++) {
  coilStars.push({
    x: Math.random() * W,
    y: Math.random() * H * 0.7,
    a: 0.25 + Math.random() * 0.6,
    s: Math.random() < 0.18 ? 2 : 1,
    v: 4 + Math.random() * 10
  });
}
function coilMotion() {
  const kit = juice();
  if (kit && kit.reduced) return !kit.reduced();
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function mushKey(x, y) {
  const c = Math.floor(x / COIL_CELL);
  const r = Math.floor(y / COIL_CELL);
  if (c < 0 || c >= COIL_COLS || r < 0 || r > 28) return '';
  return c + ',' + r;
}
function mushAt(x, y) {
  const key = mushKey(x, y);
  return key && run.mush[key] ? key : '';
}
function makeCoil(parts, dir, speed, dropSign) {
  return {
    x: parts[0].x,
    y: parts[0].y,
    dir: dir,
    speed: speed,
    dropLeft: 0,
    dropSign: dropSign || 1,
    nextDir: dir,
    parts: parts
  };
}
function chainParts(n, headX, y, dir, hp) {
  const parts = [];
  const life = hp || 1;
  for (let i = 0; i < n; i++) parts.push({ x: headX - dir * i * 16, y: y, hp: life, max: life });
  return parts;
}
function coilSpec(level) {
  if (level <= 1) return { speed: 26, chains: [10], hp: 2, mush: 0, deep: 0, r0: 3, r1: 8, split: false, leave: 0, diver: false, reach: 18, cool: 0.22 };
  if (level === 2) return { speed: 44, chains: [10], hp: 2, mush: 14, deep: 2, r0: 2, r1: 18, split: true, leave: 0.2, diver: false, reach: 14, cool: 0.3 };
  if (level === 3) return { speed: 58, chains: [11, 6], hp: 2, mush: 10, deep: 3, r0: 2, r1: 19, split: true, leave: 0.35, diver: false, reach: 13, cool: 0.24 };
  const extra = level - 3;
  return {
    speed: Math.min(108, 72 + extra * 8),
    chains: extra >= 2 ? [12, 8] : [11, 7],
    hp: extra >= 2 ? 2 : 1,
    mush: Math.min(10, 5 + extra),
    deep: Math.min(5, 3 + extra),
    r0: 2,
    r1: 20,
    split: true,
    leave: 0.4,
    diver: true,
    reach: 13,
    cool: 0.2
  };
}
function placeOpeningLamps() {
  [[2, 4], [3, 6], [16, 5], [17, 7], [15, 4]].forEach(spot => {
    run.mush[spot[0] + ',' + spot[1]] = 4;
  });
}
function placeRandomLamps(n, r0, r1, deepN) {
  let placed = 0;
  let guard = 0;
  while (placed < n && guard < 90) {
    guard += 1;
    const c = 1 + Math.floor(Math.random() * (COIL_COLS - 2));
    const span = Math.max(1, r1 - r0);
    const r = r0 + Math.floor(Math.random() * span);
    if (r * COIL_CELL > H - 156) continue;
    const key = c + ',' + r;
    if (run.mush[key]) continue;
    run.mush[key] = 4;
    if (placed < (deepN || 0)) run.deep[key] = 1;
    placed += 1;
  }
}
function spawnWave(level) {
  const spec = coilSpec(level);
  run.spec = spec;
  run.coils = [];
  spec.chains.forEach((n, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const y = 42 + i * 56;
    const span = 16 * Math.min(n, 16);
    const headX = dir > 0 ? Math.min(W - 48, Math.max(72, span)) : Math.max(48, W - span);
    run.coils.push(makeCoil(chainParts(n, headX, y, dir, spec.hp), dir, spec.speed, 1));
  });
  if (level === 1) placeOpeningLamps();
  else placeRandomLamps(spec.mush, spec.r0, spec.r1, spec.deep);
  run.nextDiver = spec.diver ? run.t + 3.2 : 1e9;
}
function startCoilRun() {
  run = {
    player: { x: W / 2, y: H - 50, lives: 3, inv: 1.15 },
    cool: 0.45,
    coils: [],
    shots: [],
    divers: [],
    mush: {},
    deep: {},
    pops: [],
    score: 0,
    level: 1,
    flash: 0,
    t: 0,
    spec: null,
    over: false,
    cause: '',
    born: [],
    nextDiver: 1e9
  };
  spawnWave(1);
  pop('WAVE 1', W / 2, 150);
  return run;
}
function stepHead(coil, dt) {
  const speed = coil.speed;
  if (coil.diveLeft > 0) {
    const step = Math.min(coil.diveLeft, 168 * dt);
    coil.y += step;
    coil.diveLeft -= step;
    if (coil.y >= H - 100) {
      coil.y = H - 100;
      coil.diveLeft = 0;
      coil.dropSign = -1;
    }
    if (coil.diveLeft <= 0) {
      coil.dir = coil.nextDir;
      coil.y = Math.round(coil.y);
    }
    return;
  }
  if (coil.dropLeft > 0) {
    const step = Math.min(coil.dropLeft, speed * dt);
    coil.y += coil.dropSign * step;
    coil.dropLeft -= step;
    if (coil.dropLeft <= 0) {
      coil.dir = coil.nextDir;
      coil.y = Math.round(coil.y);
    }
    coil.y = clamp(coil.y, 26, H - 36);
    return;
  }
  coil.x += coil.dir * speed * dt;
  const probe = coil.x + coil.dir * 11;
  const wall = probe < 14 || probe > W - 14;
  const lamp = mushAt(probe, coil.y);
  if (lamp && run.deep[lamp]) {
    coil.x = clamp(coil.x, 16, W - 16);
    coil.diveLeft = 168;
    coil.nextDir = -coil.dir;
    return;
  }
  if (!wall && !lamp) {
    coil.x = clamp(coil.x, 14, W - 14);
    return;
  }
  coil.x = clamp(coil.x, 16, W - 16);
  if (coil.y >= H - 86) coil.dropSign = -1;
  else if (coil.y <= 34) coil.dropSign = 1;
  let dest = coil.y + coil.dropSign * COIL_CELL;
  if (dest < 26 || dest > H - 36) coil.dropSign *= -1;
  dest = coil.y + coil.dropSign * COIL_CELL;
  if (mushAt(coil.x, dest) && !wall) {
    coil.dir *= -1;
    coil.nextDir = coil.dir;
    return;
  }
  coil.dropLeft = COIL_CELL;
  coil.nextDir = -coil.dir;
}
function stepBody(coil, dt) {
  if (!coil.parts.length) return;
  coil.parts[0].x = coil.x;
  coil.parts[0].y = coil.y;
  const speed = coil.speed;
  for (let i = 1; i < coil.parts.length; i++) {
    const prev = coil.parts[i - 1];
    const cur = coil.parts[i];
    const dx = prev.x - cur.x;
    const dy = prev.y - cur.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist > 16) {
      const move = Math.min(dist - 16, speed * dt * 2.2);
      cur.x += (dx / dist) * move;
      cur.y += (dy / dist) * move;
    }
  }
}
function stepGardener(dt) {
  const p = run.player;
  p.inv = Math.max(0, p.inv - dt);
  if (input.px != null) {
    p.x = input.px * W;
    if (input.py != null && input.py > 0.62) p.y = input.py * H;
  } else {
    const v = 240;
    if (input.left) p.x -= v * dt;
    if (input.right) p.x += v * dt;
    if (input.up) p.y -= v * dt;
    if (input.down) p.y += v * dt;
  }
  p.x = clamp(p.x, 18, W - 18);
  p.y = clamp(p.y, H - 112, H - 34);
}
function coilHurt(cause) {
  const p = run.player;
  if (p.inv > 0 || run.over) return;
  p.lives -= 1;
  p.inv = 1.45;
  run.flash = 0.18;
  run.cause = cause || 'lantern';
  beep(90, 0.18, 'sawtooth');
  feel('hurt');
  if (p.lives <= 0) {
    run.over = true;
    if (!coilHarness) finish();
  }
}
function killLantern(coil, index) {
  const part = coil.parts[index];
  if (!part) return;
  part.hp = (part.hp || 1) - 1;
  if (part.hp > 0) {
    run.score += 5;
    pop('CRACK', part.x, part.y - 8);
    beep(390, 0.04);
    burstAt(part.x, part.y, '#fed7aa', 5);
    return;
  }
  const head = index === 0;
  run.score += head ? 100 : 10;
  pop(head ? '+100' : '+10', part.x, part.y - 8);
  const kit = juice();
  if (kit) {
    kit.burst(part.x, part.y, {
      n: head ? 12 : 7,
      color: head ? '#fde68a' : '#fb7185',
      speed: head ? 130 : 90,
      life: 0.4,
      gravity: 60,
      size: 3
    });
    if (head) kit.shake(2.4, 90);
  }
  beep(head ? 680 : 520, head ? 0.08 : 0.045);
  if (head) beep(920, 0.06);
  if (run.spec && run.spec.leave > 0 && Math.random() < run.spec.leave && part.y < H - 156) {
    const key = mushKey(part.x, part.y);
    if (key && !run.mush[key]) run.mush[key] = 4;
  }
  if (run.spec && run.spec.split && index > 0 && index < coil.parts.length - 1) {
    const tail = coil.parts.slice(index + 1);
    coil.parts.length = index;
    if (tail.length) run.born.push(makeCoil(tail, -coil.dir, coil.speed, coil.dropSign));
  } else coil.parts.splice(index, 1);
  if (coil.parts.length) {
    coil.x = coil.parts[0].x;
    coil.y = coil.parts[0].y;
  }
}
function burstAt(x, y, color, n) {
  const kit = juice();
  if (!kit) return;
  kit.burst(x, y, { n: n || 6, color: color, speed: 80, life: 0.3, gravity: 40, size: 2 });
}
function stepShots(dt) {
  const reach = (run.spec && run.spec.reach) || 16;
  const next = [];
  run.shots.forEach(shot => {
    const yBot = shot.y;
    shot.y -= 1100 * dt;
    const yTop = shot.y;
    let mush = '';
    let mushY = -1;
    for (let s = 1; s <= 6; s++) {
      const y = yBot + (yTop - yBot) * (s / 6);
      const key = mushAt(shot.x, y);
      if (key) { mush = key; mushY = y; break; }
    }
    let best = null;
    let bestY = -1;
    run.coils.forEach(coil => {
      coil.parts.forEach((part, index) => {
        if (Math.abs(part.x - shot.x) > reach) return;
        if (part.y > yBot + 6 || part.y < yTop - reach) return;
        if (part.y > bestY) { bestY = part.y; best = { coil: coil, index: index }; }
      });
    });
    let diver = null;
    let diverY = -1;
    run.divers.forEach(d => {
      if (!d.alive) return;
      if (Math.abs(d.x - shot.x) > 14) return;
      if (d.y > yBot + 6 || d.y < yTop - 14) return;
      if (d.y > diverY) { diverY = d.y; diver = d; }
    });
    const mushWins = mush && mushY >= bestY && mushY >= diverY;
    const lanternWins = best && bestY >= diverY && !mushWins;
    if (mushWins) {
      run.mush[mush] -= 1;
      run.score += 5;
      pop('+5', shot.x, mushY);
      beep(300, 0.03);
      burstAt(shot.x, mushY, '#fbbf24', 5);
      if (run.mush[mush] <= 0) {
        delete run.mush[mush];
        if (run.deep) delete run.deep[mush];
        run.score += 15;
      }
      return;
    }
    if (lanternWins) {
      killLantern(best.coil, best.index);
      return;
    }
    if (diver) {
      diver.alive = false;
      run.score += 50;
      pop('+50', diver.x, diver.y);
      beep(740, 0.06);
      burstAt(diver.x, diver.y, '#67e8f9', 8);
      return;
    }
    if (shot.y > 10) next.push(shot);
  });
  run.shots = next;
  if (run.born.length) {
    run.coils = run.coils.concat(run.born);
    run.born = [];
  }
}
function stepDivers(dt) {
  if (run.spec && run.spec.diver && run.t >= run.nextDiver) {
    const gap = Math.max(4.6, 8.2 - run.level * 0.3);
    run.nextDiver = run.t + gap;
    const c = 2 + Math.floor(Math.random() * (COIL_COLS - 4));
    run.divers.push({ x: c * COIL_CELL + COIL_CELL / 2, y: 28, warn: 0.9, vy: 0, alive: true });
  }
  run.divers.forEach(diver => {
    if (!diver.alive) return;
    if (diver.warn > 0) {
      diver.warn -= dt;
      if (diver.warn <= 0) diver.vy = 100 + Math.min(48, run.level * 6);
      return;
    }
    diver.y += diver.vy * dt;
    if (diver.y > H + 12) {
      diver.alive = false;
      const key = mushKey(diver.x, H - 168);
      if (key && !run.mush[key]) run.mush[key] = 4;
    }
  });
  run.divers = run.divers.filter(d => d.alive);
}
function stepThreats() {
  const p = run.player;
  run.coils.forEach(coil => {
    coil.parts.forEach(part => {
      if (run.over) return;
      if (Math.hypot(part.x - p.x, part.y - p.y) < 15) coilHurt('lantern');
    });
  });
  run.divers.forEach(diver => {
    if (run.over || !diver.alive || diver.warn > 0) return;
    if (Math.hypot(diver.x - p.x, diver.y - p.y) < 14) {
      diver.alive = false;
      coilHurt('diver');
    }
  });
}
function stepClear() {
  run.coils = run.coils.filter(coil => coil.parts.length > 0);
  if (run.coils.length) return;
  if (run.divers.some(d => d.alive)) return;
  const bonus = 200 * run.level;
  run.score += bonus;
  pop('WAVE +' + bonus, W / 2, 160);
  beep(523, 0.08);
  beep(659, 0.09);
  beep(784, 0.12);
  if (!coilHarness) feel('win', W / 2, 140);
  run.level += 1;
  spawnWave(run.level);
  run.player.inv = Math.max(run.player.inv, 0.75);
}
function stepCoil(dt) {
  if ((coilHold && !coilHarness) || run.over) return;
  run.born = [];
  run.t += dt;
  run.flash = Math.max(0, run.flash - dt);
  run.cool = Math.max(0, (run.cool || 0) - dt);
  stepGardener(dt);
  if (!run.shots.length && run.cool <= 0 && run.t > 0.35) {
    run.shots.push({ x: run.player.x, y: run.player.y - 22 });
    run.cool = (run.spec && run.spec.cool) || 0.18;
  }
  run.coils = run.coils.filter(coil => coil.parts.length > 0);
  run.coils.forEach(coil => {
    stepHead(coil, dt);
    stepBody(coil, dt);
  });
  stepDivers(dt);
  stepShots(dt);
  if (run.over) return;
  stepThreats();
  if (run.over) return;
  stepClear();
  stepPops(dt);
  if (!coilHarness) setHud('Score ' + run.score + ' · Lives ' + run.player.lives + ' · Wave ' + run.level);
}
function coilAimX() {
  const p = run.player;
  let threat = null;
  let threatRank = -1e9;
  run.coils.forEach(coil => {
    const horizon = coil.diveLeft > 0 ? 140 : 72;
    coil.parts.forEach(part => {
      const dy = p.y - part.y;
      const dx = Math.abs(part.x - p.x);
      if (dy < horizon && dy > -16 && dx < (coil.diveLeft > 0 ? 36 : 32)) {
        const rank = 220 - dy;
        if (rank > threatRank) { threatRank = rank; threat = part; }
      }
    });
  });
  if (threat) return clamp(threat.x >= p.x ? p.x - 84 : p.x + 84, 22, W - 22);
  let best = null;
  let bestScore = -1e9;
  run.coils.forEach(coil => {
    coil.parts.forEach((part, index) => {
      if (part.y > p.y - 8) return;
      const score = part.y + (index === 0 ? 22 : 0);
      if (score > bestScore) { bestScore = score; best = part; }
    });
  });
  if (!best) return p.x;
  return clamp(best.x, 22, W - 22);
}
function beginnerRuns(runs, delayMs) {
  const n = runs || 10;
  const delay = typeof delayMs === 'number' ? delayMs : 350;
  const gap = delay / 1000;
  const saved = { phase: phase, current: current, run: run, soundOn: soundOn };
  const details = [];
  let clears = 0;
  coilHarness = true;
  coilHold = false;
  soundOn = false;
  current = 'coil';
  try {
    for (let i = 0; i < n; i++) {
      startCoilRun();
      phase = 'play';
      let lockX = run.player.x;
      let wait = gap;
      let t = 0;
      while (t < 80 && run.level === 1 && !run.over && phase === 'play') {
        if (wait <= 0) {
          lockX = coilAimX();
          wait = gap + (Math.random() - 0.5) * Math.min(0.12, gap * 0.15);
        }
        input.px = null;
        input.py = null;
        input.up = false;
        input.down = false;
        input.fire = false;
        const dx = lockX - run.player.x;
        input.left = dx < -5;
        input.right = dx > 5;
        stepCoil(1 / 60);
        t += 1 / 60;
        wait -= 1 / 60;
      }
      const clear = run.level > 1;
      if (clear) clears += 1;
      details.push({
        clear: clear,
        seconds: Math.round(t * 10) / 10,
        lives: run.player.lives,
        score: run.score,
        level: run.level,
        cause: run.cause || '',
        over: !!run.over
      });
    }
  } finally {
    coilHarness = false;
    coilHold = false;
    soundOn = saved.soundOn;
    current = saved.current;
    phase = saved.phase;
    run = saved.run;
    input.left = input.right = input.up = input.down = input.fire = false;
    input.px = input.py = null;
    const paused = $('#paused');
    if (paused) paused.hidden = true;
  }
  return { clears: clears, runs: n, delayMs: delay, details: details };
}
function coilSnap() {
  if (!run || current !== 'coil') return { phase: phase, current: current };
  return {
    phase: phase,
    level: run.level,
    score: run.score,
    lives: run.player.lives,
    over: !!run.over,
    hold: coilHold,
    t: Math.round(run.t * 10) / 10,
    player: { x: Math.round(run.player.x), y: Math.round(run.player.y) },
    parts: run.coils.reduce((list, coil) => list.concat(coil.parts.map((part, index) => ({
      x: Math.round(part.x), y: Math.round(part.y), head: index === 0, hp: part.hp
    }))), [])
  };
}
function sampleRun(delayMs, limit) {
  const gap = (typeof delayMs === 'number' ? delayMs : 350) / 1000;
  const saved = { phase: phase, current: current, run: run, soundOn: soundOn };
  coilHarness = true;
  coilHold = false;
  soundOn = false;
  current = 'coil';
  let summary = null;
  try {
    startCoilRun();
    phase = 'play';
    let lockX = run.player.x;
    let wait = gap;
    let t = 0;
    const cap = limit || 90;
    while (t < cap && !run.over && phase === 'play') {
      if (wait <= 0) {
        lockX = coilAimX();
        wait = gap + (Math.random() - 0.5) * Math.min(0.08, gap * 0.1);
      }
      input.px = null;
      input.py = null;
      input.up = input.down = input.fire = false;
      const dx = lockX - run.player.x;
      input.left = dx < -5;
      input.right = dx > 5;
      stepCoil(1 / 60);
      t += 1 / 60;
      wait -= 1 / 60;
    }
    summary = {
      seconds: Math.round(t * 10) / 10,
      level: run.level,
      lives: run.player.lives,
      score: run.score,
      cause: run.cause || '',
      over: !!run.over,
      coils: run.coils.map(c => c.parts.length)
    };
  } finally {
    coilHarness = false;
    coilHold = false;
    soundOn = saved.soundOn;
    current = saved.current;
    phase = saved.phase;
    run = saved.run;
    input.left = input.right = input.up = input.down = input.fire = false;
    input.px = input.py = null;
  }
  return summary;
}
function drawGarden() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070814');
  sky.addColorStop(0.62, '#16122e');
  sky.addColorStop(1, '#07140c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const drift = coilMotion() ? (last / 48) : 0;
  coilStars.forEach(star => {
    const y = (star.y + drift * star.v) % (H * 0.78);
    ctx.globalAlpha = star.a;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(star.x, y, star.s, star.s);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e7e5e4';
  ctx.beginPath();
  ctx.arc(W - 58, 46, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#121028';
  ctx.beginPath();
  ctx.arc(W - 52, 42, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0c1f12';
  ctx.fillRect(0, H - 92, W, 92);
  ctx.fillStyle = '#18401c';
  ctx.beginPath();
  ctx.moveTo(0, H - 74);
  for (let x = 0; x <= W; x += 18) ctx.lineTo(x, H - 86 - (x % 36 === 0 ? 12 : 0));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
}
function drawLamp(x, y, hp, deep) {
  ctx.fillStyle = deep ? '#2e1065' : '#3f3f46';
  ctx.fillRect(x - 2, y, 4, 10);
  const dome = ctx.createLinearGradient(x, y - 12, x, y + 2);
  dome.addColorStop(0, deep ? '#e9d5ff' : (hp > 2 ? '#fde68a' : '#a8a29e'));
  dome.addColorStop(1, deep ? '#7c3aed' : (hp > 1 ? '#d97706' : '#57534e'));
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 8, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = deep ? '#ddd6fe' : (hp > 2 ? '#fef3c7' : '#78716c');
  ctx.fillRect(x - 3, y - 4, 6, 4);
}
function drawLantern(x, y, head, phase, cracked) {
  const wobble = coilMotion() ? Math.sin(phase) * 1.2 : 0;
  const r = (head ? 11 : 8.5) + wobble * 0.15;
  ctx.fillStyle = head ? '#fb7185' : '#9a3412';
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  const glow = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r);
  glow.addColorStop(0, '#fff7ed');
  glow.addColorStop(0.45, head ? '#fde68a' : '#fb923c');
  glow.addColorStop(1, head ? '#e11d48' : '#c2410c');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(x - 1, y - r - 3, 2, 4);
  if (head) {
    ctx.strokeStyle = '#fef9c3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, phase, phase + 1.4);
    ctx.stroke();
  }
  if (cracked) {
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + 4, y + 2);
    ctx.stroke();
  }
}
function drawWand(x, y, inv) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.28, 1.28);
  const flicker = inv > 0 && Math.sin(inv * 30) > 0;
  ctx.globalAlpha = flicker ? 0.35 : 1;
  ctx.fillStyle = '#14532d';
  ctx.fillRect(-8, -4, 16, 14);
  ctx.fillStyle = '#166534';
  ctx.fillRect(-9, -7, 18, 5);
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(0, -12, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, -24);
  ctx.stroke();
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(5, -22);
  ctx.lineTo(0, -16);
  ctx.lineTo(-5, -22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawCoil() {
  drawGarden();
  if (!run) {
    const bob = coilMotion() ? Math.sin(last / 480) * 10 : 0;
    for (let i = 0; i < 8; i++) {
      const x = 48 + i * 34;
      const y = 86 + (coilMotion() ? Math.sin(last / 380 + i) * 7 : 0);
      if (i > 0) {
        ctx.strokeStyle = '#3f6212';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 34, 86 + (coilMotion() ? Math.sin(last / 380 + (i - 1)) * 7 : 0));
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      drawLantern(x, y, i === 4, last / 300 + i);
    }
    drawLamp(70, 150, 4);
    drawLamp(280, 176, 3);
    drawWand(W / 2 + bob, H - 50, 0);
    return;
  }
  Object.keys(run.mush).forEach(key => {
    const bits = key.split(',');
    const x = Number(bits[0]) * COIL_CELL + COIL_CELL / 2;
    const y = Number(bits[1]) * COIL_CELL + COIL_CELL / 2;
    drawLamp(x, y, run.mush[key], !!run.deep[key]);
  });
  run.divers.forEach(diver => {
    if (diver.warn > 0) {
      ctx.fillStyle = 'rgba(103,232,249,.16)';
      ctx.fillRect(diver.x - 10, 16, 20, H - 110);
    }
    drawLantern(diver.x, diver.warn > 0 ? 28 : diver.y, true, run.t * 6);
  });
  run.coils.forEach(coil => {
    ctx.strokeStyle = '#3f6212';
    ctx.lineWidth = 2;
    ctx.beginPath();
    coil.parts.forEach((part, i) => {
      if (i === 0) ctx.moveTo(part.x, part.y);
      else ctx.lineTo(part.x, part.y);
    });
    ctx.stroke();
    coil.parts.forEach((part, i) => drawLantern(part.x, part.y, i === 0, run.t * 5 + i, part.max > 1 && part.hp < part.max));
  });
  run.shots.forEach(shot => {
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y - 7);
    ctx.lineTo(shot.x + 3, shot.y);
    ctx.lineTo(shot.x, shot.y + 5);
    ctx.lineTo(shot.x - 3, shot.y);
    ctx.closePath();
    ctx.fill();
  });
  drawWand(run.player.x, run.player.y, run.player.inv);
  drawPops();
  if (run.flash > 0) {
    ctx.fillStyle = 'rgba(255,40,60,.3)';
    ctx.fillRect(0, 0, W, H);
  }
}
function setCoilPause(on) {
  coilHold = !!on;
  const el = $('#paused');
  if (el) el.hidden = !coilHold;
}
function resumeCoil() {
  if (!coilHold) return;
  setCoilPause(false);
  input.left = input.right = input.up = input.down = input.fire = false;
  input.px = input.py = null;
}
function syncPlayViewport() {
  const root = document.documentElement;
  if (!document.body.classList.contains('is-playing')) {
    root.style.removeProperty('--vv-top');
    root.style.removeProperty('--vv-h');
    return;
  }
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const h = vv ? vv.height : window.innerHeight;
  const cssPx = window.MONDO_PAGE && window.MONDO_PAGE.cssPx ? window.MONDO_PAGE.cssPx : (n => Math.round(n));
  root.style.setProperty('--vv-top', cssPx(top) + 'px');
  root.style.setProperty('--vv-h', cssPx(Math.max(1, h)) + 'px');
}

function finish() {
  if (phase !== 'play' || !run) return;
  phase = 'over';
  setCoilPause(false);
  finalScore = run.score || 0;
  document.body.classList.remove('is-playing');
  syncPlayViewport();
  document.querySelectorAll('[data-cart]').forEach(b => { b.disabled = false; });
  const saved = loadStore();
  if (finalScore > (saved.best[current] || 0)) saved.best[current] = finalScore;
  saveStore(saved);
  $('#overScore').textContent = 'Score ' + finalScore + ' · Best ' + (saved.best[current] || 0);
  $('#initials').value = saved.name || 'AAA';
  $('#btnPost').disabled = finalScore <= 0;
  $('#over').hidden = false;
  $('#attract').hidden = true;
  setHud('Score ' + finalScore);
  updateBest();
  syncBanner();
  beep(70, 0.28, 'sawtooth');
}

function drawPops() {
  ctx.textAlign = 'center';
  run.pops.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = '#ffe14a';
    ctx.font = '700 14px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  });
}
function drawShip(x, y, inv) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = inv > 0 && Math.sin(inv * 30) > 0 ? 0.35 : 1;
  ctx.fillStyle = '#f4f7ff';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(16, -8);
  ctx.lineTo(16, 28);
  ctx.lineTo(-16, 28);
  ctx.lineTo(-16, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d4e89';
  ctx.fillRect(-16, 4, 32, 6);
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(-5, -6, 10, 16);
  ctx.fillStyle = '#00e5ff';
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 6 - 1, 14, 3, 4);
  ctx.restore();
}
function drawSeas() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7dd3fc');
  g.addColorStop(0.35, '#0284c7');
  g.addColorStop(1, '#082f49');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  const drift = run ? run.t * 40 : last / 30;
  for (let y = drift % 28; y < H; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(W * 0.25, y - 6, W * 0.5, y);
    ctx.quadraticCurveTo(W * 0.75, y + 6, W, y);
    ctx.stroke();
  }
  if (!run) { drawShip(W / 2, H - 130 + Math.sin(last / 400) * 6, 0); return; }
  run.stuff.forEach(it => {
    if (it.kind === 'island') {
      ctx.fillStyle = '#1f8a4c';
      ctx.beginPath();
      ctx.ellipse(it.x, it.y, it.r, it.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(it.x - 4, it.y - it.r, 8, 14);
    } else if (it.kind === 'wave') {
      ctx.fillStyle = '#1aa7c9';
      ctx.fillRect(0, it.y - 12, it.x - 46, 24);
      ctx.fillRect(it.x + 46, it.y - 12, W - (it.x + 46), 24);
    } else if (it.kind === 'whirl') {
      ctx.strokeStyle = '#9b5cff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, run.t * 4, run.t * 4 + 4);
      ctx.stroke();
    } else if (it.kind === 'port') {
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(it.x - 28, it.y - 12, 56, 24);
      ctx.fillStyle = '#000';
      ctx.font = '700 10px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PORT', it.x, it.y + 4);
    } else if (it.kind === 'star') {
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc(it.x, it.y, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (it.kind === 'guest') {
      ctx.fillStyle = '#ff7ad9';
      ctx.beginPath();
      ctx.arc(it.x, it.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  drawShip(run.ship.x, run.ship.y, run.ship.inv);
  drawPops();
  if (run.flash > 0) { ctx.fillStyle = 'rgba(255,40,40,.28)'; ctx.fillRect(0, 0, W, H); }
}
function drawKitchen() {
  const counter = ctx.createLinearGradient(0, 0, 0, H);
  counter.addColorStop(0, '#fff7ed');
  counter.addColorStop(0.2, '#fdba74');
  counter.addColorStop(1, '#7c2d12');
  ctx.fillStyle = counter;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = '#ffe14a';
  ctx.font = '700 13px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  if (run) {
    const bits = Object.keys(run.order.need).map(k => k + ' ' + run.order.have[k] + '/' + run.order.need[k]);
    ctx.fillText(run.order.name.toUpperCase(), 10, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(bits.join('  '), 10, 42);
  } else {
    ctx.fillText('ORDER UP', 10, 34);
  }
  const items = run ? run.stuff : [];
  items.forEach(it => {
    const colors = { tomato: '#e23d3d', noodle: '#ffe14a', egg: '#f4f4f4', herb: '#39ff14', toast: '#6b3a1f', bomb: '#ff2bd6' };
    ctx.fillStyle = colors[it.kind] || '#fff';
    if (it.kind === 'toast') ctx.fillRect(it.x - 10, it.y - 7, 20, 14);
    else { ctx.beginPath(); ctx.arc(it.x, it.y, 9, 0, Math.PI * 2); ctx.fill(); }
    if (it.kind === 'bomb') {
      ctx.strokeStyle = '#ffe14a';
      ctx.beginPath();
      ctx.moveTo(it.x + 4, it.y - 8);
      ctx.lineTo(it.x + 10, it.y - 14);
      ctx.stroke();
    }
  });
  const x = run ? run.ship.x : W / 2 + Math.sin(last / 500) * 40;
  const y = run ? run.ship.y : H - 58;
  const squash = run && run.ship.squash > 0 ? 0.8 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  ctx.translate(-x, -y);
  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath();
  ctx.ellipse(x, y, 42, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#9ad';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 36, y);
  ctx.lineTo(x + 58, y + 10);
  ctx.stroke();
  if (run) {
    drawPops();
    if (run.flash > 0) { ctx.fillStyle = 'rgba(255,40,40,.28)'; ctx.fillRect(0, 0, W, H); }
  }
}
function drawBreaker() {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#020617');
  bg.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const bricks = run ? run.bricks : layoutBricks(1);
  bricks.forEach(b => {
    if (!b.alive) return;
    const glass = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    glass.addColorStop(0, '#fff');
    glass.addColorStop(0.25, b.color);
    glass.addColorStop(1, '#020617');
    ctx.fillStyle = glass;
    ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  });
  const p = run ? run.paddle : { x: W / 2 - 32 + Math.sin(last / 450) * 50, y: H - 36, w: 64, laser: 0 };
  const paddle = ctx.createLinearGradient(p.x, p.y, p.x, p.y + 12);
  paddle.addColorStop(0, '#e0f2fe');
  paddle.addColorStop(1, p.laser > 0 ? '#e879f9' : '#0284c7');
  ctx.fillStyle = paddle;
  ctx.fillRect(p.x, p.y, p.w, 10);
  if (run) {
    run.shots.forEach(s => { ctx.fillStyle = '#ff2bd6'; ctx.fillRect(s.x - 2, s.y - 12, 4, 12); });
    run.drops.forEach(d => {
      ctx.fillStyle = d.type === 'laser' ? '#ff2bd6' : d.type === 'wide' ? '#39ff14' : '#ffe14a';
      ctx.fillRect(d.x - 8, d.y - 8, 16, 16);
    });
    run.balls.forEach(b => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
    if (run.balls.some(b => b.stuck) && phase === 'play') {
      ctx.fillStyle = '#39ff14';
      ctx.font = '700 13px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAP A TO LAUNCH', W / 2, H - 70);
    }
    drawPops();
    if (run.flash > 0) { ctx.fillStyle = 'rgba(255,40,40,.28)'; ctx.fillRect(0, 0, W, H); }
  }
}
function draw() {
  if (!canvas) return;
  const kit = juice();
  if (kit) ctx = kit.placeCanvas(canvas, W, H, canvas.parentElement);
  if (!ctx) return;
  const off = kit ? kit.shakeOffset() : { x: 0, y: 0 };
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(off.x, off.y);
  if (current === 'seas') drawSeas();
  else if (current === 'kitchen') drawKitchen();
  else if (current === 'breaker') drawBreaker();
  else drawCoil();
  if (kit) kit.drawParticles(ctx);
  if (phase === 'attract') {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
function frame(ts) {
  if (!raf || document.hidden) { raf = 0; return; }
  const raw = Math.min(0.033, last ? (ts - last) / 1000 : 0.016);
  const kit = juice();
  const dt = kit ? kit.timeScale(raw) : raw;
  last = ts;
  if (phase === 'play' && run) {
    if (current === 'seas') stepSeas(dt);
    else if (current === 'kitchen') stepKitchen(dt);
    else if (current === 'breaker') stepBreaker(dt);
    else stepCoil(dt);
  }
  if (kit) kit.stepParticles(raw);
  draw();
  raf = requestAnimationFrame(frame);
}
function startArcade() {
  if (document.hidden) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (audioCtx && audioCtx.suspend) audioCtx.suspend();
    return;
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
function startGame() {
  phase = 'play';
  finalScore = 0;
  if (!loadStore().muted) soundOn = true;
  syncSoundButton();
  if (juice()) juice().unlock();
  setCoilPause(false);
  if (current === 'seas') run = newSeas();
  else if (current === 'kitchen') run = newKitchen();
  else if (current === 'breaker') run = newBreaker();
  else run = startCoilRun();
  document.body.classList.add('is-playing');
  syncPlayViewport();
  document.querySelectorAll('[data-cart]').forEach(b => { b.disabled = true; });
  $('#attract').hidden = true;
  $('#over').hidden = true;
  syncBanner();
  beep(440, 0.07);
  beep(660, 0.09);
}
function selectCart(id) {
  if (phase === 'play' || !NAMES[id]) return;
  current = id;
  phase = 'attract';
  run = null;
  document.querySelectorAll('[data-cart]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cart === id)));
  $('#cabTitle').textContent = NAMES[id];
  $('#how').textContent = HOW[id];
  $('#boardTitle').textContent = 'Top 10 · ' + NAMES[id];
  $('#attract').hidden = false;
  $('#over').hidden = true;
  updateBest();
  renderBoard();
}

function rowsFor(cart) {
  if (serverLive && !rulesBlocked) {
    return Object.keys(remote[cart] || {}).map(id => remote[cart][id]).filter(s => s && typeof s.score === 'number' && s.name);
  }
  return (loadStore().mine[cart] || []).slice();
}
function renderBoard() {
  const list = rowsFor(current).sort((a, b) => b.score - a.score || (a.t || 0) - (b.t || 0)).slice(0, 10);
  const el = $('#board');
  el.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = 'No scores yet.';
    empty.append(span, document.createElement('b'));
    el.appendChild(empty);
    return;
  }
  list.forEach((s, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = (i + 1) + '. ' + s.name;
    if (window.MONDO_MEMBER && s.author) window.MONDO_MEMBER.adorn(span, s.author);
    const score = document.createElement('b');
    score.textContent = String(Math.round(s.score));
    li.append(span, score);
    el.appendChild(li);
  });
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function updateBest() {
  const n = loadStore().best[current] || 0;
  $('#bestLine').textContent = 'Your best: ' + n;
}
function syncBanner() {
  const el = $('#syncBanner');
  if (!el) return;
  el.hidden = !rulesBlocked || document.body.classList.contains('is-playing');
}
function showBanner() {
  rulesBlocked = true;
  serverLive = false;
  syncBanner();
}
function hideBanner() {
  rulesBlocked = false;
  syncBanner();
}
function isDenied(err) {
  const code = String((err && err.code) || '') + ' ' + String((err && err.message) || '');
  return /PERMISSION_DENIED|permission[-_ ]denied/i.test(code);
}
function todayStamp() { return Math.floor(Date.now() / 86400000) * 86400000; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ensureQuota() {
  if (quotaLoaded || !myUid || typeof firebase === 'undefined') return;
  const snap = await firebase.database().ref('arcade/c/' + myUid).once('value');
  const v = snap.val() || {};
  quota = { n: Number(v.n) || 0, day: Number(v.day) || 0 };
  quotaLoaded = true;
}
function rememberLocal(cart, name, score) {
  const s = loadStore();
  s.name = name;
  if (score > (s.best[cart] || 0)) s.best[cart] = score;
  if (!s.mine[cart]) s.mine[cart] = [];
  s.mine[cart].unshift({ name, score, t: Date.now() });
  s.mine[cart] = s.mine[cart].slice(0, 10);
  saveStore(s);
  updateBest();
  if (!serverLive || rulesBlocked) renderBoard();
}
async function pushScore(cart, name, score) {
  await ensureQuota();
  const day = todayStamp();
  const seq = quota.day === day ? (quota.n || 0) + 1 : 1;
  if (seq > 20) { const err = new Error('quota'); err.code = 'quota'; throw err; }
  const wait = 5200 - (Date.now() - lastPost);
  if (lastPost && wait > 0) await sleep(wait);
  const id = (myUid + '_' + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const updates = {};
  updates['arcade/scores/' + cart + '/' + id] = {
    name, score, seq, day, author: myUid, t: firebase.database.ServerValue.TIMESTAMP
  };
  updates['arcade/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
  updates['arcade/c/' + myUid] = { n: seq, day };
  await firebase.database().ref().update(updates);
  lastPost = Date.now();
  quota = { n: seq, day };
}
async function submitScore(name) {
  const score = finalScore;
  const cart = current;
  rememberLocal(cart, name, score);
  if (!myUid || typeof firebase === 'undefined' || !firebase.apps.length) {
    toast('Saved on this device. Shared scores open when Firebase rules are published.');
    return;
  }
  try {
    await pushScore(cart, name, score);
    toast('Score posted');
  } catch (err) {
    if (err && err.code === 'quota') toast('That is enough scores for today. Your best is saved on this device.');
    else if (isDenied(err)) {
      showBanner();
      renderBoard();
      toast('Saved on this device. Shared scores open when Firebase rules are published.');
    } else toast('Could not post that score. It is saved on this device.');
  }
}
function listenScores() {
  if (listening || typeof firebase === 'undefined') return;
  listening = true;
  ['seas', 'kitchen', 'breaker', 'coil'].forEach(cart => {
    firebase.database().ref('arcade/scores/' + cart).on('value', snap => {
      serverLive = true;
      hideBanner();
      remote[cart] = snap.val() || {};
      if (cart === current) renderBoard();
    }, err => {
      serverLive = false;
      if (isDenied(err)) showBanner();
      renderBoard();
    });
  });
}
function isAdminNow() { return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner()); }
function updateOwner() {
  if (!window.MONDO_MEMBER) $('#ownerBtn').textContent = isOwner ? 'Sign out' : 'Owner sign in';
  $('#btnClear').hidden = !isOwner;
}
function connectArcade() {
  const c = window.MONDO_BOARD_CONFIG;
  if (typeof firebase === 'undefined' || !c || !c.apiKey || !c.databaseURL) return;
  try { if (!firebase.apps.length) firebase.initializeApp(c); } catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      isOwner = false;
      myUid = '';
      updateOwner();
      try { await firebase.auth().signInAnonymously(); } catch { /* local scores still work */ }
      return;
    }
    myUid = user.uid;
    isOwner = isAdminNow();
    if (!connectArcade.ownerListen) { connectArcade.ownerListen = true; document.addEventListener('mondo-owner', function () { isOwner = isAdminNow(); updateOwner(); }); }
    quotaLoaded = false;
    updateOwner();
    listenScores();
  });
}
async function clearScores() {
  if (!isOwner) return;
  if (!confirm('Clear the high scores for this cartridge?')) return;
  const ids = Object.keys(remote[current] || {});
  if (!ids.length) { toast('No shared scores to clear'); return; }
  const updates = {};
  ids.forEach(id => { updates['arcade/scores/' + current + '/' + id] = null; });
  try {
    await firebase.database().ref().update(updates);
    toast('Scores cleared');
  } catch (err) {
    if (isDenied(err)) showBanner();
    toast('Could not clear scores');
  }
}
function bindHold(btn) {
  const key = btn.dataset.hold;
  const down = e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* already gone */ } input[key] = true; };
  const up = () => { input[key] = false; };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}
function aimFrom(e) {
  const r = canvas.getBoundingClientRect();
  input.px = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
  input.py = clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1);
}
function init() {
  canvas = $('#screen');
  ctx = canvas.getContext('2d', { alpha: false });
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  const saved = loadStore();
  $('#initials').value = saved.name || 'AAA';
  updateBest();
  renderBoard();
  $('#btnStart').onclick = startGame;
  $('#btnAgain').onclick = startGame;
  $('#btnQuit').onclick = () => { if (phase === 'play') finish(); };
  $('#over').addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanName($('#initials').value);
    if (!name) { toast('Add initials'); return; }
    $('#btnPost').disabled = true;
    submitScore(name);
  });
  document.querySelectorAll('[data-cart]').forEach(b => b.addEventListener('click', () => selectCart(b.dataset.cart)));
  document.querySelectorAll('[data-hold]').forEach(bindHold);
  const fire = $('#btnFire');
  fire.addEventListener('pointerdown', e => { e.preventDefault(); try { fire.setPointerCapture(e.pointerId); } catch { /* ignore */ } input.fire = true; });
  fire.addEventListener('pointerup', () => { input.fire = false; });
  fire.addEventListener('pointercancel', () => { input.fire = false; });
  canvas.addEventListener('pointerdown', e => {
    if (coilHold) { resumeCoil(); e.preventDefault(); return; }
    if (phase !== 'play') return;
    e.preventDefault();
    input.touch = e.pointerType !== 'mouse';
    aimFrom(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (coilHold || phase !== 'play') return;
    if (e.pointerType === 'mouse' || input.touch) aimFrom(e);
  });
  canvas.addEventListener('pointerup', () => { if (input.touch) { input.px = null; input.py = null; input.touch = false; } });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { input.px = null; input.py = null; } });
  canvas.addEventListener('pointercancel', () => { input.px = null; input.py = null; input.touch = false; });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    if (coilHold && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); resumeCoil(); return; }
    if (phase === 'play' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.up = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = true;
    if (e.key === ' ' || e.key === 'Enter') input.fire = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.up = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = false;
    if (e.key === ' ' || e.key === 'Enter') input.fire = false;
  });
  document.addEventListener('touchmove', e => {
    if (document.body.classList.contains('is-playing')) e.preventDefault();
  }, { passive: false });
  $('#soundBtn').onclick = () => {
    if (audible()) soundOn = false;
    else {
      soundOn = true;
      if (window.MONDO_AUDIO && MONDO_AUDIO.muted && MONDO_AUDIO.muted()) MONDO_AUDIO.setMuted(false);
      if (juice()) juice().unlock();
    }
    const stored = loadStore();
    stored.muted = !soundOn;
    saveStore(stored);
    syncSoundButton();
    if (audible()) beep(660, 0.08);
  };
  document.addEventListener('mondo-audio', syncSoundButton);
  syncSoundButton();
  $('#ownerBtn').onclick = () => {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
    const user = firebase.auth().currentUser;
    if (isAdminNow()) {
      isOwner = false;
      firebase.auth().signOut();
      return;
    }
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
      $('#ownerError').textContent = code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 ? 'That email or password is wrong.' : 'Could not sign in.';
      $('#ownerError').hidden = false;
    }
  });
  $('#btnClear').onclick = clearScores;
  const resumeBtn = $('#btnResume');
  if (resumeBtn) resumeBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); resumeCoil(); };
  const paused = $('#paused');
  if (paused) paused.addEventListener('click', e => { if (e.target === paused) resumeCoil(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.left = input.right = input.up = input.down = input.fire = false;
      input.px = input.py = null;
      if (phase === 'play' && current === 'coil') setCoilPause(true);
      startArcade();
      return;
    }
    if (soundOn && juice()) juice().unlock();
    else if (soundOn && audioCtx && audioCtx.resume) audioCtx.resume();
    startArcade();
  });
  window.addEventListener('resize', syncPlayViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncPlayViewport);
    window.visualViewport.addEventListener('scroll', syncPlayViewport);
  }
  try {
    const requested = new URLSearchParams(location.search).get('cart');
    if (requested && NAMES[requested]) selectCart(requested);
  } catch { /* keep the opening cartridge */ }
  if (/[?&]dev=1(?:&|$)/.test(location.search)) window.LANTERN = { beginner: beginnerRuns, sample: sampleRun, snap: coilSnap };
  connectArcade();
  raf = 0;
  startArcade();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})();
