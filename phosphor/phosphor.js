/* Phosphor Halls — a lamp moth in an original copper maze. */
(function () {
  'use strict';

  var KEY = 'mondosupreme.phosphor.v1';
  var TILE = 12;
  var COLS = 15;
  var ROWS = 21;
  var WORLD_W = COLS * TILE;
  var WORLD_H = ROWS * TILE;
  var STEP = 1 / 60;
  var DOOR = { c: 7, r: 6 };
  var START = { c: 7, r: 19 };
  var MAZE = [
    '###############',
    '#o...........o#',
    '#.###.###.###.#',
    '#             #',
    '#.###.#.#.###.#',
    '#.....#.#.....#',
    '#...###D###...#',
    '#...#HHHHH#...#',
    '#.#.#HHHHH#.#.#',
    '#...#HHHHH#...#',
    '#...#######...#',
    '#.#.........#.#',
    '#.#.###.###.#.#',
    '#.............#',
    '#.###.#.#.###.#',
    '...............',
    '#.###.#.#.###.#',
    '#o...........o#',
    '#.#.#######.#.#',
    '#             #',
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
    return MAZE.map(function (row) { return row.split(''); });
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
      player: 92 + lv * 4,
      ghost: level === 1 ? 18 : 54 + (level - 2) * 6,
      fright: 44,
      eyes: 132,
      pen: 50
    };
  }
  function frightTime() {
    return Math.max(2.6, 7.2 - (level - 1) * 0.6);
  }
  function makeGhosts() {
    return [
      { name: 'Ash', color: '#ff6b3d', c: 7, r: 7, corner: { c: 13, r: 1 }, leave: 1.5 },
      { name: 'Veer', color: '#ff4d8d', c: 6, r: 8, corner: { c: 1, r: 1 }, leave: 8 },
      { name: 'Split', color: '#3dd6c6', c: 8, r: 8, corner: { c: 13, r: 18 }, leave: 15 },
      { name: 'Loom', color: '#f0b429', c: 7, r: 9, corner: { c: 1, r: 18 }, leave: 22 }
    ].map(function (g, i) {
      return {
        i: i,
        name: g.name,
        color: g.color,
        corner: g.corner,
        leave: g.name !== 'Ash' && level < 2 ? 9999 : (g.name === 'Ash' && level === 1 ? 10 : g.leave),
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
      nectarUsed: false
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
      near: Math.abs(ent.x - cx) <= 5 && Math.abs(ent.y - cy) <= 5
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
        var slot = g.i === 0 ? { c: 7, r: 7 } : g.i === 1 ? { c: 6, r: 8 } : g.i === 2 ? { c: 8, r: 8 } : { c: 7, r: 9 };
        g.x = slot.c * TILE + TILE / 2;
        g.y = slot.r * TILE + TILE / 2;
        g.state = 'pen';
        g.leave = run.t + 2;
        g.dir = 'up';
      }
      if (g.state === 'play' && phase === 'play') {
        var dx = g.x - player.x;
        var dy = g.y - player.y;
        if (dx * dx + dy * dy <= 121) {
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
        if (player.want && !player.dir) player.dir = player.want;
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
  function drawMoth(ctx, x, y, bob) {
    ctx.fillStyle = 'rgba(244,211,94,0.35)';
    ctx.fillRect(x - 3, y - 1, 6, 6);
    ctx.fillStyle = '#c084fc';
    ctx.fillRect(x - 6, y - 3 - bob, 4, 5);
    ctx.fillRect(x + 2, y - 3 - bob, 4, 5);
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(x - 2, y - 2, 4, 6);
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - 1, y - 1, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
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
      ctx.fillRect(x - 5, y - 3, 10, 7);
      ctx.fillRect(x - 1, y - 5, 2, 2);
    } else if (g.name === 'Split') {
      ctx.fillRect(x - 5, y - 3, 4, 7);
      ctx.fillRect(x + 1, y - 3, 4, 7);
    } else if (g.name === 'Loom') {
      ctx.fillRect(x - 3, y - 5, 6, 8);
      ctx.fillRect(x - 1, y + 3, 2, 3);
    } else {
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillRect(x - 2, y - 6, 2, 2);
      ctx.fillRect(x + 1, y - 6, 2, 2);
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
    var ctx = kit ? kit.placeCanvas(canvas, WORLD_W, WORLD_H, stage) : canvas.getContext('2d');
    if (!kit) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
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
            ctx.fillRect(x + 5, y + 5, 2, 2);
          } else if (ch === 'o') {
            var on = reduce || Math.floor(attract * 6) % 2 === 0 || (run && run.t && Math.floor(run.t * 6) % 2 === 0);
            if (phase === 'play' || phase === 'dead' || phase === 'win') {
              on = reduce || Math.floor((run ? run.t : 0) * 6) % 2 === 0;
            }
            if (on) {
              ctx.fillStyle = '#7ee0ff';
              ctx.fillRect(x + 3, y + 3, 6, 6);
              ctx.fillStyle = '#e0f7ff';
              ctx.fillRect(x + 5, y + 5, 2, 2);
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
      var pulse = player.inv > 0 && !reduce && Math.floor(player.inv * 6) % 2 === 0;
      ctx.globalAlpha = pulse ? 0.28 : 1;
      var bob = reduce ? 0 : (frame % 2 ? 1 : 0);
      drawMoth(ctx, player.x, player.y, bob);
      ctx.globalAlpha = 1;
      if (player.inv > 0) {
        ctx.strokeStyle = pulse ? '#7ee0ff' : '#fff7d6';
        ctx.lineWidth = 1;
        ctx.strokeRect(player.x - 7, player.y - 8, 14, 15);
      }
    } else if (!player) {
      drawMoth(ctx, 7 * TILE + 6, 19 * TILE + 6 + (reduce ? 0 : Math.sin(attract * 3) * 2), 0);
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
      ctx.fillStyle = 'rgba(7,6,15,0.45)';
      ctx.fillRect(0, WORLD_H / 2 - 18, WORLD_W, 28);
      ctx.fillStyle = '#f4d35e';
      ctx.font = '700 14px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Ready!', WORLD_W / 2, WORLD_H / 2 + 4);
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
    var name = typed || letters.join('') || 'AAA';
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
    lives = 3;
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
    var map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down'
    };
    if (map[e.key] && phase === 'play') {
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
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
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
})();
