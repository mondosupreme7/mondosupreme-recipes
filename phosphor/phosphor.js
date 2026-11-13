/* Phosphor Halls — a lamp moth in an original copper maze. */
(function () {
  'use strict';

  var KEY = 'mondosupreme.phosphor.v1';
  var TILE = 8;
  var COLS = 15;
  var ROWS = 15;
  var WORLD_W = COLS * TILE;
  var WORLD_H = ROWS * TILE;
  var STEP = 1 / 60;
  var DOOR = { c: 7, r: 5 };
  var START = { c: 7, r: 13 };
  var MAZE = [
    '###############',
    '#######......o#',
    '#######.#####.#',
    '#######.#.....#',
    '#.......#######',
    '#.#####D#######',
    '#.####HHH######',
    '#.###HHHHH#####',
    '#.#############',
    '#.............#',
    '#############.#',
    '#............o#',
    '#.#############',
    '#o......#######',
    '###############'
  ];
  var DIRS = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 }
  };
  var OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  var ORDER = ['left', 'up', 'right', 'down'];
  var PHASES = [
    { name: 'scatter', t: 8 },
    { name: 'chase', t: 20 },
    { name: 'scatter', t: 5 },
    { name: 'chase', t: 20 },
    { name: 'scatter', t: 4 },
    { name: 'chase', t: 9999 }
  ];

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceMq.matches;
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', function () { reduce = reduceMq.matches; });

  var canvas = document.getElementById('screen');
  var stage = document.getElementById('stage');
  var hud = document.getElementById('hud');
  var status = document.getElementById('status');
  var store = load();
  var grid = blank();
  var phase = 'title';
  var score = 0;
  var lives = 3;
  var level = 1;
  var dots = 0;
  var run = null;
  var player = null;
  var ghosts = [];
  var popups = [];
  var flash = 0;
  var deadT = 0;
  var readyT = 0;
  var queued = null;
  var winT = 0;
  var holdDir = null;
  var acc = 0;
  var last = 0;
  var raf = 0;
  var attract = 0;
  var savedMark = -1;
  var slot = 0;
  var letters = ['A', 'A', 'A'];

  function juice() { return window.MONDO_JUICE || null; }
  function $(id) { return document.getElementById(id); }
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    if (!Array.isArray(s.scores)) s.scores = [];
    if (typeof s.sound !== 'boolean') s.sound = true;
    if (typeof s.crt !== 'boolean') s.crt = false;
    if (typeof s.name !== 'string') s.name = 'AAA';
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }
  function announce(text) {
    if (status.textContent === text) status.textContent = text + ' ';
    else status.textContent = text;
  }
  function blip(name, opts) {
    var kit = juice();
    if (!kit || !store.sound) return;
    kit.play(name, Object.assign({ localOn: true }, opts || {}));
  }
  function feel(kind, x, y) {
    var kit = juice();
    if (!kit) return;
    if (kind === 'crumb') kit.burst(x, y, { n: 3, color: '#ffe38a', speed: 40, life: 0.25, gravity: 20, size: 2 });
    else if (kind === 'lamp') {
      kit.burst(x, y, { n: 12, color: ['#7ee0ff', '#fff', '#f4d35e'], speed: 80, life: 0.4, gravity: 0, size: 2 });
      kit.shake(2, 90);
    } else if (kind === 'eat') {
      kit.burst(x, y, { n: 10, color: ['#fff', '#9ec5ff', '#f4d35e'], speed: 100, life: 0.4, gravity: 30, size: 2 });
      kit.shake(3, 120);
      kit.vibrate(12);
    } else if (kind === 'hurt') {
      kit.burst(x, y, { n: 14, color: ['#f4d35e', '#c084fc', '#fff'], speed: 110, life: 0.5, gravity: 40, size: 2 });
      kit.shake(7, 220);
      kit.hitstop(110);
      kit.vibrate([16, 28, 16]);
    } else if (kind === 'clear') {
      kit.shake(3, 160);
      kit.confetti();
      kit.vibrate([10, 20, 10]);
    }
  }
  function blank() {
    var g = MAZE.map(function (row) { return row.split(''); });
    if (level === 1) {
      var n = 0;
      g.forEach(function (row) {
        row.forEach(function (ch, c) {
          if (ch !== '.') return;
          n += 1;
          if (n % 5 === 0) row[c] = ' ';
        });
      });
    }
    return g;
  }
  function countDots(g) {
    var n = 0;
    g.forEach(function (row) {
      row.forEach(function (ch) { if (ch === '.' || ch === 'o') n += 1; });
    });
    return n;
  }
  function wrapC(c) {
    if (c < 0) return COLS - 1;
    if (c >= COLS) return 0;
    return c;
  }
  function tileOf(x, y) {
    var xx = ((x % WORLD_W) + WORLD_W) % WORLD_W;
    return { c: Math.floor(xx / TILE), r: Math.floor(y / TILE) };
  }
  function cell(c, r) {
    if (r < 0 || r >= ROWS) return '#';
    return grid[r][wrapC(c)];
  }
  function walkable(c, r, who) {
    if (r < 0 || r >= ROWS) return false;
    var ch = cell(c, r);
    if (ch === '#') return false;
    if ((who === 'player' || who === 'play') && (ch === 'H' || ch === 'D')) return false;
    return true;
  }
  function canStep(ent, dir, who) {
    var t = tileOf(ent.x, ent.y);
    var d = DIRS[dir];
    return walkable(t.c + d.x, t.r + d.y, who);
  }
  function atCenter(ent) {
    return ((ent.x % TILE) + TILE) % TILE === TILE / 2 && ent.y % TILE === TILE / 2;
  }
  function speeds() {
    var lv = level - 1;
    return {
      player: level === 1 ? 40 : 61 + (lv - 1) * 3,
      ghost: level === 1 ? 4 : 32 + (level - 2) * 4,
      fright: 29,
      eyes: 88,
      pen: 33
    };
  }
  function frightTime() {
    return Math.max(2.6, 7.2 - (level - 1) * 0.6);
  }
  function makeGhosts() {
    return [
      { name: 'Ash', color: '#ff6b3d', c: 7, r: 6, corner: { c: 13, r: 1 }, leave: 1.5 },
      { name: 'Veer', color: '#ff4d8d', c: 6, r: 7, corner: { c: 1, r: 1 }, leave: 8 },
      { name: 'Split', color: '#3dd6c6', c: 8, r: 7, corner: { c: 13, r: 13 }, leave: 15 },
      { name: 'Loom', color: '#f0b429', c: 7, r: 7, corner: { c: 1, r: 13 }, leave: 22 }
    ].map(function (g, i) {
      return {
        i: i,
        name: g.name,
        color: g.color,
        corner: g.corner,
        leave: g.name !== 'Ash' && level < 2 ? 9999 : (g.name === 'Ash' && level === 1 ? 50 : g.leave),
        x: g.c * TILE + TILE / 2,
        y: g.r * TILE + TILE / 2,
        dir: 'up',
        state: 'pen',
        acc: 0
      };
    });
  }
  function placeActors() {
    player = {
      x: START.c * TILE + TILE / 2,
      y: START.r * TILE + TILE / 2,
      dir: null,
      want: null,
      acc: 0,
      inv: 2
    };
    ghosts = makeGhosts();
    run.t = 0;
    run.fright = 0;
    run.chain = 0;
    run.phase = 0;
    run.phaseT = PHASES[0].t;
    run.mode = 'scatter';
  }
  function freshRun() {
    grid = blank();
    dots = countDots(grid);
    popups = [];
    run = {
      t: 0,
      fright: 0,
      chain: 0,
      phase: 0,
      phaseT: PHASES[0].t,
      mode: 'scatter',
      nectar: 12,
      nectarOn: false,
      nectarUsed: false,
      lampEaten: false
    };
    placeActors();
  }
  function popup(text, x, y) {
    popups.push({
      text: text,
      x: Math.max(36, Math.min(WORLD_W - 36, x)),
      y: Math.max(14, Math.min(WORLD_H - 8, y)),
      life: 0.9
    });
  }
  function playerTile() { return tileOf(player.x, player.y); }
  function ahead(n) {
    var p = playerTile();
    var d = DIRS[player.dir || player.want || 'left'];
    return { c: p.c + d.x * n, r: p.r + d.y * n };
  }
  function ghostTarget(g) {
    if (g.state === 'eyes') return DOOR;
    if (g.state === 'exit' || g.state === 'pen') {
      var t = tileOf(g.x, g.y);
      if (cell(t.c, t.r) === 'D') return { c: DOOR.c, r: DOOR.r - 1 };
      if (t.r > DOOR.r) return DOOR;
      return { c: DOOR.c, r: DOOR.r - 1 };
    }
    if (run.mode === 'scatter') return g.corner;
    if (g.name === 'Ash') return playerTile();
    if (g.name === 'Veer') return ahead(4);
    if (g.name === 'Split') {
      var a = ahead(2);
      var ash = tileOf(ghosts[0].x, ghosts[0].y);
      return { c: a.c * 2 - ash.c, r: a.r * 2 - ash.r };
    }
    var p = playerTile();
    var here = tileOf(g.x, g.y);
    var dist = Math.abs(p.c - here.c) + Math.abs(p.r - here.r);
    return dist > 7 ? p : g.corner;
  }
  function chooseGhost(g) {
    if (!atCenter(g)) return;
    var who = g.state === 'play' ? 'play' : g.state;
    var opts = [];
    ORDER.forEach(function (dir) {
      if (g.state === 'play' && g.dir && dir === OPP[g.dir]) return;
      if (canStep(g, dir, who)) opts.push(dir);
    });
    if (!opts.length && g.dir && canStep(g, OPP[g.dir], who)) opts.push(OPP[g.dir]);
    if (!opts.length) { g.dir = null; return; }
    if (g.state === 'play' && run.fright > 0) {
      g.dir = opts[(Math.random() * opts.length) | 0];
      return;
    }
    var target = ghostTarget(g);
    var t = tileOf(g.x, g.y);
    var best = opts[0];
    var bestD = 1e9;
    opts.forEach(function (dir) {
      var d = DIRS[dir];
      var nc = t.c + d.x;
      var nr = t.r + d.y;
      var dist = (nc - target.c) * (nc - target.c) + (nr - target.r) * (nr - target.r);
      if (dist < bestD) { bestD = dist; best = dir; }
    });
    g.dir = best;
  }
  function nearestCenter(ent) {
    var cx = Math.round((ent.x - TILE / 2) / TILE) * TILE + TILE / 2;
    var cy = Math.round((ent.y - TILE / 2) / TILE) * TILE + TILE / 2;
    if (cx < 0) cx += WORLD_W;
    if (cx >= WORLD_W) cx -= WORLD_W;
    return {
      x: cx,
      y: cy,
      near: Math.abs(ent.x - cx) <= 3 && Math.abs(ent.y - cy) <= 3
    };
  }
  /* Queue the next facing and take it as the moth reaches the junction, or immediately if it is stopped. */
  function applyBufferedTurn() {
    if (!player.want) return;
    if (player.dir === player.want) return;
    var spot = nearestCenter(player);
    if (player.dir && !spot.near) return;
    var t = tileOf(spot.x, spot.y);
    var d = DIRS[player.want];
    if (!walkable(t.c + d.x, t.r + d.y, 'player')) return;
    player.x = spot.x;
    player.y = spot.y;
    player.dir = player.want;
  }
  function stepOne(ent, who) {
    if (who === 'player') applyBufferedTurn();
    else chooseGhost(ent);
    if (!ent.dir) return;
    var d = DIRS[ent.dir];
    var nx = ent.x + d.x;
    var ny = ent.y + d.y;
    if (nx < 0) nx += WORLD_W;
    if (nx >= WORLD_W) nx -= WORLD_W;
    var t = tileOf(nx, ny);
    if (t.r < 0 || t.r >= ROWS || !walkable(t.c, t.r, who)) {
      ent.dir = null;
      return;
    }
    ent.x = nx;
    ent.y = ny;
  }
  function pump(ent, speed, who) {
    ent.acc += speed * STEP;
    var guard = 0;
    while (ent.acc >= 1 && guard < 6) {
      ent.acc -= 1;
      stepOne(ent, who);
      guard += 1;
    }
  }
  function eatCrumb() {
    var t = tileOf(player.x, player.y);
    var ch = grid[t.r][t.c];
    if (ch !== '.' && ch !== 'o') return;
    grid[t.r][t.c] = ' ';
    dots -= 1;
    if (ch === 'o') {
      run.lampEaten = true;
      score += 50;
      run.fright = frightTime();
      run.chain = 0;
      ghosts.forEach(function (g) {
        if (g.state === 'play' && g.dir) g.dir = OPP[g.dir];
      });
      feel('lamp', player.x, player.y);
      blip('power', { pitch: 520, dur: 0.08 });
      setTimeout(function () { blip('power', { pitch: 780, dur: 0.1 }); }, 70);
      flash = 0.08;
      announce('Cold lamp');
      popup('COLD LAMP', player.x, player.y - 8);
    } else {
      score += 10;
      feel('crumb', player.x, player.y);
      blip('coin', { pitch: score % 20 === 0 ? 880 : 640, dur: 0.03, vol: 0.035 });
    }
    if (dots <= 0) beginClear();
  }
  function eatGhost(g) {
    run.chain += 1;
    var pts = 200 * Math.pow(2, run.chain - 1);
    score += pts;
    g.state = 'eyes';
    g.dir = OPP[g.dir] || 'up';
    popup(g.name.toUpperCase() + ' ' + pts, g.x, g.y - 6);
    feel('eat', g.x, g.y);
    blip('coin', { pitch: 280 + run.chain * 140, dur: 0.1 });
    announce(g.name + ' ' + pts);
  }
  function die() {
    if (player.inv > 0 || phase !== 'play') return;
    lives -= 1;
    flash = 0.2;
    feel('hurt', player.x, player.y);
    blip('hurt', { pitch: 110, dur: 0.18, type: 'sawtooth' });
    announce(lives > 0 ? 'Life lost' : 'The hall goes dark');
    if (lives <= 0) {
      phase = 'over';
      showOver();
      return;
    }
    phase = 'dead';
    deadT = 0.4;
    var focused = document.activeElement;
    if (focused && focused.blur && focused.tagName === 'BUTTON') focused.blur();
  }
  function beginClear() {
    score += 1000 * level;
    popup('HALL CLEAR', WORLD_W / 2, WORLD_H / 2);
    feel('clear', player.x, player.y);
    blip('win', { pitch: 523, dur: 0.12 });
    setTimeout(function () { blip('win', { pitch: 659, dur: 0.12 }); }, 90);
    setTimeout(function () { blip('win', { pitch: 784, dur: 0.16 }); }, 180);
    announce('Hall clear');
    phase = 'win';
    winT = 0.9;
  }
  function nextLevel() {
    level += 1;
    freshRun();
    phase = 'play';
    popup('HALL ' + level, WORLD_W / 2, 40);
    announce('Hall ' + level);
  }
  function armReady() {
    phase = 'ready';
    readyT = 0.9;
    if (queued) player.want = queued;
    announce('Ready');
  }
  function respawn() {
    placeActors();
    armReady();
    announce('Lives ' + lives);
  }
  function updatePlay() {
    var sp = speeds();
    run.t += STEP;
    if (player.inv > 0) player.inv -= STEP;
    if (flash > 0) flash -= STEP;
    if (run.fright > 0) {
      run.fright -= STEP;
      if (run.fright <= 0) run.chain = 0;
    } else {
      run.phaseT -= STEP;
      if (run.phaseT <= 0) {
        run.phase = Math.min(PHASES.length - 1, run.phase + 1);
        run.mode = PHASES[run.phase].name;
        run.phaseT = PHASES[run.phase].t;
        ghosts.forEach(function (g) {
          if (g.state === 'play' && g.dir) g.dir = OPP[g.dir];
        });
      }
    }
    if (holdDir) player.want = holdDir;
    if (!player.dir && (player.want || queued || holdDir)) {
      player.dir = holdDir || player.want || queued;
      player.want = player.dir;
    }
    pump(player, sp.player, 'player');
    eatCrumb();
    if (run.nectarOn) {
      var nt = tileOf(player.x, player.y);
      if (nt.c === 7 && nt.r === 3) {
        run.nectarOn = false;
        run.nectarUsed = true;
        score += 500;
        popup('NECTAR 500', player.x, player.y - 8);
        feel('lamp', player.x, player.y);
        blip('coin', { pitch: 990, dur: 0.12 });
      }
    } else if (!run.nectarUsed) {
      run.nectar -= STEP;
      if (run.nectar <= 0) run.nectarOn = true;
    }
    ghosts.forEach(function (g) {
      if (g.state === 'pen') {
        if (run.t >= g.leave) g.state = 'exit';
        else return;
      }
      var who = g.state === 'play' ? 'play' : g.state;
      var spd = sp.pen;
      if (g.state === 'play') spd = run.fright > 0 ? sp.fright : sp.ghost;
      if (g.state === 'eyes') spd = sp.eyes;
      if (g.state === 'exit') spd = sp.pen;
      pump(g, spd, who);
      var t = tileOf(g.x, g.y);
      var ch = cell(t.c, t.r);
      if (g.state === 'exit' && t.r < DOOR.r && ch !== 'H' && ch !== 'D') g.state = 'play';
      if (g.state === 'eyes' && (ch === 'D' || ch === 'H')) {
        var slot = g.i === 0 ? { c: 7, r: 6 } : g.i === 1 ? { c: 6, r: 7 } : g.i === 2 ? { c: 8, r: 7 } : { c: 7, r: 7 };
        g.x = slot.c * TILE + TILE / 2;
        g.y = slot.r * TILE + TILE / 2;
        g.state = 'pen';
        g.leave = run.t + 2;
        g.dir = 'up';
      }
      if (g.state === 'play' && phase === 'play') {
        var dx = g.x - player.x;
        var dy = g.y - player.y;
        if (dx * dx + dy * dy <= 49) {
          if (run.fright > 0) eatGhost(g);
          else die();
        }
      }
    });
    popups.forEach(function (p) { p.life -= STEP; p.y -= 12 * STEP; });
    popups = popups.filter(function (p) { return p.life > 0; });
  }
  function update(dt) {
    var kit = juice();
    if (kit) kit.stepParticles(dt);
    if (phase === 'play') updatePlay();
    else if (phase === 'dead') {
      deadT -= dt;
      flash = Math.max(0, flash - dt);
      if (deadT <= 0) respawn();
    } else if (phase === 'ready') {
      readyT -= dt;
      if (holdDir) player.want = holdDir;
      if (readyT <= 0) {
        phase = 'play';
        player.inv = 2;
        var launch = holdDir || player.want || queued;
        if (launch) {
          player.want = launch;
          player.dir = launch;
          queued = launch;
        }
      }
    } else if (phase === 'win') {
      winT -= dt;
      flash = Math.max(0, flash - dt);
      popups.forEach(function (p) { p.life -= dt; });
      if (winT <= 0) nextLevel();
    } else if (phase === 'title') {
      attract += dt;
    }
  }
  function paintHud() {
    var crumbs = phase === 'title' ? 'Ready' : (dots + ' left');
    var text = 'Score ' + score + ' · Lives ' + lives + ' · ' + crumbs;
    if (hud.textContent !== text) hud.textContent = text;
  }
  function drawQueueArrow(ctx, x, y, dir) {
    var d = DIRS[dir];
    if (!d) return;
    var cx = Math.round(x + d.x * 30);
    var cy = Math.round(y + d.y * 30);
    function mark(color, p) {
      ctx.fillStyle = color;
      if (dir === 'up') {
        ctx.fillRect(cx - 1 - p, cy - 9 - p, 2 + p * 2, 3 + p);
        ctx.fillRect(cx - 3 - p, cy - 7 - p, 6 + p * 2, 3 + p);
        ctx.fillRect(cx - 5 - p, cy - 5, 10 + p * 2, 3 + p);
        ctx.fillRect(cx - 2 - p, cy - 2, 4 + p * 2, 8 + p);
      } else if (dir === 'down') {
        ctx.fillRect(cx - 1 - p, cy + 6, 2 + p * 2, 3 + p);
        ctx.fillRect(cx - 3 - p, cy + 4, 6 + p * 2, 3 + p);
        ctx.fillRect(cx - 5 - p, cy + 2, 10 + p * 2, 3 + p);
        ctx.fillRect(cx - 2 - p, cy - 6 - p, 4 + p * 2, 8 + p);
      } else if (dir === 'left') {
        ctx.fillRect(cx - 9 - p, cy - 1 - p, 3 + p, 2 + p * 2);
        ctx.fillRect(cx - 7 - p, cy - 3 - p, 3 + p, 6 + p * 2);
        ctx.fillRect(cx - 5, cy - 5 - p, 3 + p, 10 + p * 2);
        ctx.fillRect(cx - 2, cy - 2 - p, 8 + p, 4 + p * 2);
      } else {
        ctx.fillRect(cx + 6, cy - 1 - p, 3 + p, 2 + p * 2);
        ctx.fillRect(cx + 4, cy - 3 - p, 3 + p, 6 + p * 2);
        ctx.fillRect(cx + 2, cy - 5 - p, 3 + p, 10 + p * 2);
        ctx.fillRect(cx - 6 - p, cy - 2 - p, 8 + p, 4 + p * 2);
      }
    }
    mark('#172554', 1);
    mark('#93c5fd', 0);
  }
  function placeSharp(canvas, logicalW, logicalH, host) {
    var availW = Math.max(1, host.clientWidth);
    var availH = Math.max(1, host.clientHeight);
    var fit = Math.min(availW / logicalW, availH / logicalH);
    var scale = Math.max(1, Math.floor(fit));
    var cssW = logicalW * scale;
    var cssH = logicalH * scale;
    if (canvas._sw !== cssW || canvas._sh !== cssH) {
      canvas._sw = cssW;
      canvas._sh = cssH;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var mul = Math.max(1, Math.round(scale * dpr));
    var bw = logicalW * mul;
    var bh = logicalH * mul;
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(mul, 0, 0, mul, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }
  function drawMoth(ctx, x, y, bob) {
    ctx.fillStyle = 'rgba(147, 197, 253, 0.7)';
    ctx.fillRect(x - 6, y - 6 - bob, 12, 12);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x - 4, y - 4 - bob, 8, 8);
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(x - 6, y - 2 - bob, 3, 4);
    ctx.fillRect(x + 3, y - 2 - bob, 3, 4);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x - 6, y - 3 - bob, 3, 1);
    ctx.fillRect(x + 3, y - 3 - bob, 3, 1);
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(x - 2, y - 3 - bob, 4, 6);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x - 1, y - 2 - bob, 1, 1);
    ctx.fillRect(x + 1, y - 2 - bob, 1, 1);
  }
  function drawWarden(ctx, g, frame) {
    var x = g.x;
    var y = g.y;
    var frightened = g.state === 'play' && run && run.fright > 0;
    var blink = frightened && run.fright < 2 && !reduce && Math.floor(frame / 8) % 2 === 0;
    if (g.state === 'eyes') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x - 3, y - 2, 2, 2);
      ctx.fillRect(x + 1, y - 2, 2, 2);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 2, y - 1, 1, 1);
      ctx.fillRect(x + 2, y - 1, 1, 1);
      return;
    }
    var color = blink ? '#f8fafc' : frightened ? '#9ec5ff' : g.color;
    ctx.fillStyle = color;
    if (g.name === 'Veer') {
      ctx.fillRect(x - 3, y - 2, 6, 5);
      ctx.fillRect(x - 1, y - 4, 2, 2);
    } else if (g.name === 'Split') {
      ctx.fillRect(x - 3, y - 2, 2, 5);
      ctx.fillRect(x + 1, y - 2, 2, 5);
    } else if (g.name === 'Loom') {
      ctx.fillRect(x - 2, y - 3, 4, 6);
      ctx.fillRect(x - 1, y + 3, 2, 2);
    } else {
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillRect(x - 2, y - 5, 2, 2);
      ctx.fillRect(x + 1, y - 5, 2, 2);
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);
    if (!frightened) {
      var look = DIRS[g.dir] || DIRS.left;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 3 + (look.x > 0 ? 1 : 0), y - 2 + (look.y > 0 ? 1 : 0), 1, 1);
      ctx.fillRect(x + 1 + (look.x > 0 ? 1 : 0), y - 2 + (look.y > 0 ? 1 : 0), 1, 1);
    }
  }
  function draw() {
    var kit = juice();
    var ctx = placeSharp(canvas, WORLD_W, WORLD_H, stage);
    var shake = kit && phase === 'play' ? kit.shakeOffset() : { x: 0, y: 0 };
    ctx.translate(shake.x, shake.y);
    ctx.fillStyle = '#100e18';
    ctx.fillRect(-8, -8, WORLD_W + 16, WORLD_H + 16);
    var r, c, ch, x, y;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        ch = grid[r][c];
        x = c * TILE;
        y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#14685f';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#2fbfa8';
          if (cell(c, r - 1) !== '#') ctx.fillRect(x, y, TILE, 2);
          if (cell(c - 1, r) !== '#') ctx.fillRect(x, y, 2, TILE);
          ctx.fillStyle = '#0c3f3a';
          if (cell(c, r + 1) !== '#') ctx.fillRect(x, y + TILE - 2, TILE, 2);
        } else if (ch === 'H') {
          ctx.fillStyle = '#1a1430';
          ctx.fillRect(x, y, TILE, TILE);
        } else if (ch === 'D') {
          ctx.fillStyle = '#1a1430';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#f4d35e';
          ctx.fillRect(x + 1, y + 5, TILE - 2, 2);
        } else {
          ctx.fillStyle = r === 15 ? '#181628' : '#161226';
          ctx.fillRect(x, y, TILE, TILE);
          if (ch === '.') {
            ctx.fillStyle = '#ffe38a';
            ctx.fillRect(x + 3, y + 3, 2, 2);
          } else if (ch === 'o') {
            var on = reduce || Math.floor(attract * 6) % 2 === 0 || (run && run.t && Math.floor(run.t * 6) % 2 === 0);
            if (phase === 'play' || phase === 'dead' || phase === 'win') {
              on = reduce || Math.floor((run ? run.t : 0) * 6) % 2 === 0;
            }
            if (on) {
              ctx.fillStyle = '#7ee0ff';
              ctx.fillRect(x + 2, y + 2, 4, 4);
              ctx.fillStyle = '#e0f7ff';
              ctx.fillRect(x + 3, y + 3, 2, 2);
            }
          }
        }
      }
    }
    if (run && run.nectarOn) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(7 * TILE + 3, 3 * TILE + 3, 6, 6);
      ctx.fillStyle = '#ffe4e6';
      ctx.fillRect(7 * TILE + 5, 3 * TILE + 4, 2, 2);
    }
    var frame = Math.floor((run ? run.t : attract) * 12);
    ghosts.forEach(function (g) { drawWarden(ctx, g, frame); });
    if (player) {
      var pulse = player.inv > 0 && !reduce && Math.floor(player.inv * 4) % 2 === 0;
      if (player.inv > 0) {
        ctx.fillStyle = pulse ? '#7ee0ff' : '#042f2e';
        ctx.fillRect(player.x - 9, player.y - 10, 18, 18);
      }
      if (!pulse) {
        var bob = reduce ? 0 : (frame % 2 ? 1 : 0);
        drawMoth(ctx, player.x, player.y, bob);
      }
      if (player.inv > 0 && phase !== 'ready') {
        ctx.strokeStyle = '#7ee0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(player.x - 9, player.y - 10, 18, 18);
      }
      player._arrow = player.want && player.want !== player.dir ? player.want : null;
    } else if (!player) {
      drawMoth(ctx, 7 * TILE + 6, 13 * TILE + 6 + (reduce ? 0 : Math.sin(attract * 3) * 2), 0);
    }
    ctx.font = '700 10px JetBrains Mono, ui-monospace, monospace';
    ctx.textAlign = 'center';
    popups.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#fff7d6';
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.45, flash) + ')';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (phase === 'ready') {
      ctx.fillStyle = 'rgba(8, 6, 20, 0.92)';
      ctx.fillRect(4, 2, WORLD_W - 8, 22);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 2, WORLD_W - 8, 22);
      ctx.fillStyle = '#f4d35e';
      ctx.font = '700 14px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', WORLD_W / 2, 17);
    }
    if (player && player.inv > 0 && phase === 'play') {
      ctx.font = '700 11px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      var labelY = Math.max(28, player.y - 20);
      ctx.fillStyle = '#042f2e';
      ctx.fillRect(player.x - 18, labelY - 10, 36, 13);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SAFE', player.x, labelY);
      ctx.strokeStyle = '#7ee0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.x - 18, labelY - 10, 36, 13);
    }
    if (player && player._arrow && phase !== 'ready') {
      drawQueueArrow(ctx, player.x, player.y, player._arrow);
      player._arrow = null;
    }
    if (phase === 'play' && level === 1 && run && !run.lampEaten) {
      ctx.fillStyle = 'rgba(8, 6, 20, 0.8)';
      ctx.fillRect(2, 2, WORLD_W - 4, 14);
      ctx.fillStyle = '#e0f7ff';
      ctx.font = '700 8px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EAT A LAMP TO SCARE ASH', WORLD_W / 2, 12);
    }
    if (kit) kit.drawParticles(ctx);
    paintHud();
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = 0; draw(); return; }
    if (!last) last = now;
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    var kit = juice();
    if (kit) dt = kit.timeScale(dt);
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 8) {
      update(STEP);
      acc -= STEP;
      n += 1;
    }
    draw();
  }
  function show(which) {
    $('title').hidden = which !== 'title';
    $('over').hidden = which !== 'over';
    $('board').hidden = which !== 'board';
  }
  function qualifies(n) {
    if (n <= 0) return false;
    if (store.scores.length < 10) return true;
    return n >= store.scores[store.scores.length - 1].score;
  }
  function paintBoard() {
    var list = $('boardList');
    list.innerHTML = '';
    if (!store.scores.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No scores yet';
      list.appendChild(empty);
      return;
    }
    store.scores.forEach(function (row, i) {
      var li = document.createElement('li');
      if (i === savedMark) li.className = 'mine';
      var name = document.createElement('span');
      name.textContent = (i + 1) + ' ' + row.name;
      var pts = document.createElement('span');
      pts.textContent = String(row.score);
      li.appendChild(name);
      li.appendChild(pts);
      list.appendChild(li);
    });
  }
  function paintSlots(writeInput) {
    var box = $('slots');
    var shown = letters.slice();
    while (shown.length < 3) shown.push('');
    box.innerHTML = '';
    shown.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = ch || '·';
      b.setAttribute('aria-label', 'Initial ' + (i + 1) + ' ' + (ch || 'blank'));
      if (i === slot) b.className = 'is-on';
      b.addEventListener('click', function () { slot = i; paintSlots(false); });
      box.appendChild(b);
    });
    if (writeInput) $('initials').value = letters.join('');
  }
  function setFromInput() {
    var el = $('initials');
    var pos = el.selectionStart || 0;
    var raw = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (el.value !== raw) {
      el.value = raw;
      try { el.setSelectionRange(Math.min(pos, raw.length), Math.min(pos, raw.length)); } catch (err) { /* older input */ }
    }
    letters = raw.split('');
    paintSlots(false);
  }
  function nudgeLetter(delta) {
    while (letters.length < 3) letters.push('A');
    var i = Math.max(0, Math.min(2, slot));
    var code = (letters[i] || 'A').charCodeAt(0);
    if (code < 65 || code > 90) code = 65;
    letters[i] = String.fromCharCode(((code - 65 + delta + 26) % 26) + 65);
    paintSlots(true);
  }
  function showOver() {
    savedMark = -1;
    var ok = qualifies(score);
    $('overScore').textContent = 'Score ' + score + (ok ? '' : ' · short of the book');
    $('entry').hidden = !ok;
    letters = [];
    slot = 0;
    paintSlots(true);
    show('over');
    paintCrt();
  }
  function commitScore() {
    var typed = ($('initials').value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (!typed) {
      announce('Type initials, then press Save score');
      if ($('entry')) $('entry').hidden = false;
      try { $('initials').focus(); } catch (err) { /* already gone */ }
      return;
    }
    var name = typed;
    store.name = name;
    store.scores.push({ name: name, score: score, at: Date.now() });
    store.scores.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    store.scores = store.scores.slice(0, 10);
    savedMark = -1;
    store.scores.forEach(function (row, i) {
      if (row.name === name && row.score === score) savedMark = i;
    });
    save();
    paintBoard();
    show('board');
    announce('Score saved');
  }
  function startGame() {
    score = 0;
    lives = 5;
    level = 1;
    flash = 0;
    savedMark = -1;
    freshRun();
    queued = null;
    armReady();
    show('play');
    announce('Hall 1');
    blip('launch', { pitch: 440, dur: 0.07 });
    var kit = juice();
    if (kit) kit.unlock();
  }
  function paintMute() {
    var btn = $('muteBtn');
    var on = !!store.sound;
    btn.textContent = on ? 'Mute' : 'Sound';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function paintCrt() {
    var on = !!store.crt;
    $('scan').hidden = !on;
    $('crtBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function syncViewport() {
    var root = document.documentElement;
    var vv = window.visualViewport;
    var top = vv ? vv.offsetTop : 0;
    var h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--vv-top', Math.round(top) + 'px');
    root.style.setProperty('--vv-h', Math.max(1, Math.round(h)) + 'px');
  }
  function setWant(dir) {
    if (!DIRS[dir]) return;
    if (phase !== 'play' && phase !== 'ready' && phase !== 'dead') return;
    queued = dir;
    if (!player) return;
    player.want = dir;
    if (phase === 'play' && !player.dir) player.dir = dir;
  }
  function bindPad(btn) {
    var dir = btn.getAttribute('data-dir');
    var lastAct = 0;
    function act(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      var now = performance.now();
      if (now - lastAct < 70) return;
      lastAct = now;
      holdDir = dir;
      setWant(dir);
      var kit = juice();
      if (kit) kit.unlock();
    }
    function up() { if (holdDir === dir) holdDir = null; }
    btn.addEventListener('pointerdown', function (e) {
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      act(e);
    });
    btn.addEventListener('click', act);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  function onKey(e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    var map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down'
    };
    if (map[e.key] && (phase === 'play' || phase === 'ready' || phase === 'dead')) {
      e.preventDefault();
      setWant(map[e.key]);
      return;
    }
    if (e.key === 'Enter' && phase === 'title') { e.preventDefault(); startGame(); }
    if ((e.key === 'm' || e.key === 'M') && e.target.tagName !== 'INPUT') {
      store.sound = !store.sound;
      save();
      paintMute();
    }
    if ((e.key === 'c' || e.key === 'C') && e.target.tagName !== 'INPUT') {
      store.crt = !store.crt;
      save();
      paintCrt();
    }
    if (e.key === 'Escape' && phase === 'play') {
      phase = 'over';
      showOver();
    }
  }
  var swipe = null;
  function beginSwipe(e) {
    if (e.target.closest('button, a, input, label, .bar, .pad')) return;
    if (!stage.contains(e.target)) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* mouse without capture */ }
  }
  function finishSwipe(e) {
    if (!swipe || (e.pointerId != null && swipe.id !== e.pointerId)) return;
    var dx = e.clientX - swipe.x;
    var dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < 10) return;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    setWant(dir);
    var kit = juice();
    if (kit) kit.unlock();
  }
  stage.addEventListener('pointerdown', beginSwipe);
  stage.addEventListener('pointerup', finishSwipe);
  stage.addEventListener('pointercancel', function () { swipe = null; });

  document.querySelectorAll('.pad button').forEach(bindPad);
  $('start').addEventListener('click', startGame);
  $('again').addEventListener('click', startGame);
  $('openScores').addEventListener('click', function () { savedMark = -1; paintBoard(); show('board'); });
  $('overScores').addEventListener('click', function () { paintBoard(); show('board'); });
  $('boardBack').addEventListener('click', function () { show(phase === 'over' ? 'over' : 'title'); });
  $('muteBtn').addEventListener('click', function () {
    store.sound = !store.sound;
    save();
    paintMute();
    if (store.sound) blip('click', { pitch: 520, dur: 0.04 });
  });
  $('crtBtn').addEventListener('click', function () {
    store.crt = !store.crt;
    save();
    paintCrt();
  });
  $('letterUp').addEventListener('click', function () { nudgeLetter(1); });
  $('letterDown').addEventListener('click', function () { nudgeLetter(-1); });
  $('initials').addEventListener('input', setFromInput);
  $('over').addEventListener('submit', function (e) {
    e.preventDefault();
    setFromInput();
    commitScore();
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('touchmove', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, #over')) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  $('initials').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('initials').addEventListener('click', function () { $('initials').focus(); });
  window.addEventListener('resize', syncViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  document.documentElement.classList.add('phosphor-lock');
  syncViewport();
  paintMute();
  paintCrt();
  freshRun();
  player = null;
  show('title');
  paintBoard();
  requestAnimationFrame(loop);

  function beginnerDir(sticky) {
    if (phase !== 'play' || !player) return null;
    var t = tileOf(player.x, player.y);
    var bestS = -1;
    var tied = [];
    Object.keys(DIRS).forEach(function (dir) {
      var d = DIRS[dir];
      var c = t.c + d.x;
      var r = t.r + d.y;
      if (!walkable(c, r, 'player')) return;
      var ch = cell(c, r);
      var s = 1;
      if (ch === '.') s += 6;
      if (ch === 'o') s += 10;
      if (dir === player.dir) s += 0.25;
      ghosts.forEach(function (g) {
        if (g.state !== 'play' || (run && run.fright > 0)) return;
        var gt = tileOf(g.x, g.y);
        if (gt.c === ((c % COLS) + COLS) % COLS && gt.r === r) s -= 40;
      });
      if (s > bestS + 0.01) {
        bestS = s;
        tied = [dir];
      } else if (Math.abs(s - bestS) <= 0.01) tied.push(dir);
    });
    if (sticky && tied.indexOf(sticky) >= 0) return sticky;
    if (!tied.length) return null;
    return tied[(Math.random() * tied.length) | 0];
  }
  function beginnerRuns(runs, delay) {
    var n = runs || 10;
    var gap = typeof delay === 'number' ? delay : 0.35;
    var clears = 0;
    var details = [];
    var sound = store.sound;
    store.sound = false;
    var i;
    for (i = 0; i < n; i++) {
      score = 0;
      lives = 5;
      level = 1;
      holdDir = null;
      queued = null;
      freshRun();
      phase = 'play';
      player.inv = 2;
      var pending = null;
      var wait = gap;
      var t = 0;
      while (t < 240 && level === 1 && phase !== 'over') {
        var choice = beginnerDir(pending);
        if (choice !== pending) {
          pending = choice;
          wait = gap + (Math.random() - 0.5) * Math.min(0.12, gap * 0.15);
        }
        if (pending && wait <= 0 && phase === 'play' && player) {
          player.want = pending;
          if (!player.dir) player.dir = pending;
          pending = null;
          wait = gap;
        }
        update(STEP);
        t += STEP;
        wait -= STEP;
      }
      var clear = level > 1 || phase === 'win' || dots === 0;
      if (clear) clears += 1;
      details.push({
        clear: clear,
        seconds: Math.round(t * 10) / 10,
        lives: lives,
        dots: dots,
        phase: phase
      });
    }
    store.sound = sound;
    score = 0;
    lives = 5;
    level = 1;
    holdDir = null;
    phase = 'title';
    player = null;
    show('title');
    return { clears: clears, runs: n, delay: gap, details: details };
  }
  function checkRespawn() {
    score = 0;
    lives = 5;
    level = 1;
    holdDir = null;
    queued = null;
    freshRun();
    phase = 'play';
    player.inv = 0;
    player.dir = 'left';
    die();
    var steps = 0;
    while (phase === 'dead' && steps < 90) {
      update(STEP);
      steps += 1;
    }
    var duringDead = phase;
    setWant('left');
    var wantBeforeResume = player ? player.want : null;
    while (phase === 'ready' && steps < 240) {
      update(STEP);
      steps += 1;
    }
    var x0 = player ? player.x : 0;
    var i;
    for (i = 0; i < 20; i++) update(STEP);
    return {
      died: duringDead === 'ready',
      queued: wantBeforeResume,
      phase: phase,
      dir: player ? player.dir : null,
      moved: player ? player.x < x0 - 2 : false,
      inv: player ? Math.round(player.inv * 10) / 10 : 0
    };
  }

  window.PHOSPHOR = {
    snap: function () {
      return {
        phase: phase,
        score: score,
        lives: lives,
        level: level,
        dots: dots,
        fright: run ? run.fright : 0,
        tile: TILE,
        cols: COLS,
        rows: ROWS,
        grid: grid.map(function (row) { return row.join(''); }),
        player: player ? { x: player.x, y: player.y, dir: player.dir, want: player.want, inv: player.inv } : null,
        ghosts: ghosts.map(function (g) {
          return { name: g.name, x: g.x, y: g.y, dir: g.dir, state: g.state, color: g.color };
        }),
        popups: popups.map(function (p) { return p.text; }),
        w: WORLD_W,
        h: WORLD_H
      };
    }
  };
  if (/[?&]dev=1(?:&|$)/.test(location.search)) {
    window.PHOSPHOR.beginner = beginnerRuns;
    window.PHOSPHOR.checkRespawn = checkRespawn;
    window.PHOSPHOR.armDeath = function () {
      if (!player || phase !== 'play') return phase;
      player.inv = 0;
      die();
      return phase;
    };
  }
})();
