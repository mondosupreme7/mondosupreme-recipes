(() => {
'use strict';
const KEY = 'mondosupreme.arcade.v1';
const W = 360, H = 520;
const HOW = {
  seas: 'Dodge islands, rogue waves, and whirlpools. Collect stars, passengers, and port bonuses. Speed climbs every level.',
  kitchen: 'Catch the ingredients for the dish on the order. Dodge burnt toast and bombs. Combos multiply the score.',
  breaker: 'Move the paddle. A or Space launches the ball and fires lasers. Grab multi-ball, wide paddle, and laser drops.'
};
const NAMES = { seas: 'High Seas Cruiser', kitchen: 'Supreme Kitchen Rush', breaker: 'Cyber Brick Breaker 1999' };
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
const input = { left: false, right: false, up: false, down: false, fire: false, px: null, touch: false };
let audioCtx = null, soundOn = false;
let serverLive = false, rulesBlocked = false, isOwner = false, myUid = '';
let quota = { n: 0, day: 0 }, quotaLoaded = false, lastPost = 0, listening = false;
const remote = { seas: {}, kitchen: {}, breaker: {} };

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
function beep(freq, dur, type) {
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
    if (it.kind === 'star' && near) { run.score += 25; pop('+25', it.x, it.y); beep(880, 0.05); continue; }
    if (it.kind === 'guest' && near) { run.score += 50; pop('+50', it.x, it.y); beep(660, 0.06); continue; }
    if (it.kind === 'port' && near) { run.score += 150 + run.level * 25; pop('PORT', it.x, it.y); beep(520, 0.1); continue; }
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
      pop('+' + add, it.x, it.y);
      beep(740, 0.05);
      if (orderDone(run.order)) {
        const bonus = 200 * run.level;
        run.score += bonus;
        run.level += 1;
        pop('DISH +' + bonus, W / 2, 80);
        beep(523, 0.08);
        beep(784, 0.12);
        run.order = orderFrom(run.level);
      }
    } else {
      run.score += 5;
      pop('+5', it.x, it.y);
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
        beep(620, 0.03);
        if (Math.random() < 0.2) {
          const types = ['multi', 'wide', 'laser'];
          run.drops.push({ type: types[Math.floor(Math.random() * 3)], x: brick.x + brick.w / 2, y: brick.y, vy: 90 });
        }
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

function finish() {
  if (phase !== 'play' || !run) return;
  phase = 'over';
  finalScore = run.score || 0;
  document.body.classList.remove('is-playing');
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
  g.addColorStop(0, '#04243f');
  g.addColorStop(1, '#021018');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,229,255,.25)';
  for (let y = (run ? run.t * 40 : 0) % 24; y < H; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
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
  ctx.fillStyle = '#14081c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a1020';
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
  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath();
  ctx.ellipse(x, y, 42, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.fillStyle = '#070014';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#201040';
  for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  const bricks = run ? run.bricks : layoutBricks(1);
  bricks.forEach(b => {
    if (!b.alive) return;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  });
  const p = run ? run.paddle : { x: W / 2 - 32 + Math.sin(last / 450) * 50, y: H - 36, w: 64, laser: 0 };
  ctx.fillStyle = p.laser > 0 ? '#ff2bd6' : '#00e5ff';
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
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  if (current === 'seas') drawSeas();
  else if (current === 'kitchen') drawKitchen();
  else drawBreaker();
  if (phase === 'attract') {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, W, H);
  }
}
function frame(ts) {
  if (!raf || document.hidden) { raf = 0; return; }
  const dt = Math.min(0.033, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  if (phase === 'play' && run) {
    if (current === 'seas') stepSeas(dt);
    else if (current === 'kitchen') stepKitchen(dt);
    else stepBreaker(dt);
  }
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
  if (current === 'seas') run = newSeas();
  else if (current === 'kitchen') run = newKitchen();
  else run = newBreaker();
  document.body.classList.add('is-playing');
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
  ['seas', 'kitchen', 'breaker'].forEach(cart => {
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
function ownerEmail() { return String((window.MONDO_BOARD_OWNER) || 'cbrooks_911@yahoo.com').toLowerCase(); }
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
    isOwner = !!(user.email && user.email.toLowerCase() === ownerEmail());
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
  canvas.addEventListener('pointerdown', e => { if (phase !== 'play') return; e.preventDefault(); input.touch = e.pointerType !== 'mouse'; aimFrom(e); });
  canvas.addEventListener('pointermove', e => {
    if (phase !== 'play') return;
    if (e.pointerType === 'mouse' || input.touch) aimFrom(e);
  });
  canvas.addEventListener('pointerup', () => { if (input.touch) { input.px = null; input.touch = false; } });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') input.px = null; });
  canvas.addEventListener('pointercancel', () => { input.px = null; input.touch = false; });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
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
    soundOn = !soundOn;
    $('#soundBtn').textContent = soundOn ? 'Mute' : 'Sound';
    $('#soundBtn').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) beep(660, 0.08);
  };
  $('#ownerBtn').onclick = () => {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
    const user = firebase.auth().currentUser;
    if (user && user.email && user.email.toLowerCase() === ownerEmail()) {
      isOwner = false;
      firebase.auth().signOut();
      return;
    }
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
      $('#ownerError').textContent = code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 ? 'That email or password is wrong.' : 'Could not sign in.';
      $('#ownerError').hidden = false;
    }
  });
  $('#btnClear').onclick = clearScores;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.left = input.right = input.up = input.down = input.fire = false;
      startArcade();
      return;
    }
    if (soundOn && audioCtx && audioCtx.resume) audioCtx.resume();
    startArcade();
  });
  connectArcade();
  raf = 0;
  startArcade();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})();
