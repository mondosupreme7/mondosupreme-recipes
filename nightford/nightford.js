/* Night Ford — a lantern cricket crossing carts and barges. */
(function () {
  'use strict';

  var KEY = 'mondosupreme.nightford.v1';
  var TILE = 16;
  var TILE_H = 22;
  var COLS = 11;
  var ROWS = 13;
  var WORLD_W = COLS * TILE;
  var WORLD_H = ROWS * TILE_H;
  var STEP = 1 / 60;
  var HOMES = [1, 3, 5, 7, 9];
  var START = { c: 5, r: 12 };
  var BASE = [
    { row: 1, kind: 'log', dir: 1, speed: 14, len: 120, gap: 28, color: '#c4844a' },
    { row: 2, kind: 'log', dir: -1, speed: 30, len: 72, gap: 50, color: '#6b4423' },
    { row: 3, kind: 'log', dir: 1, speed: 22, len: 96, gap: 40, color: '#a56b3c' },
    { row: 4, kind: 'log', dir: -1, speed: 28, len: 80, gap: 48, color: '#5c3a22' },
    { row: 5, kind: 'log', dir: 1, speed: 16, len: 130, gap: 24, color: '#d2a679' },
    { row: 7, kind: 'car', dir: -1, speed: 14, len: 26, gap: 140, color: '#ff5a36' },
    { row: 8, kind: 'car', dir: 1, speed: 18, len: 54, gap: 96, color: '#38bdf8' },
    { row: 9, kind: 'car', dir: -1, speed: 22, len: 36, gap: 90, color: '#facc15' },
    { row: 10, kind: 'car', dir: 1, speed: 16, len: 42, gap: 100, color: '#f8fafc' },
    { row: 11, kind: 'car', dir: -1, speed: 12, len: 30, gap: 110, color: '#e879f9' }
  ];
  var DIRS = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 }
  };

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceMq.matches;
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', function () { reduce = reduceMq.matches; });

  var canvas = document.getElementById('screen');
  var stage = document.getElementById('stage');
  var hud = document.getElementById('hud');
  var status = document.getElementById('status');
  var duskBar = document.getElementById('duskBar');
  var store = load();
  var phase = 'title';
  var score = 0;
  var lives = 3;
  var level = 1;
  var homes = [false, false, false, false, false];
  var lanes = [];
  var player = null;
  var timer = 48;
  var timerMax = 48;
  var streak = 0;
  var popups = [];
  var flash = 0;
  var deadT = 0;
  var readyT = 0;
  var safe = 0;
  var winT = 0;
  var snare = 0;
  var snareOn = false;
  var snareT = 0;
  var clock = 0;
  var acc = 0;
  var last = 0;
  var holdDir = null;
  var holdDelay = 0;
  var savedMark = -1;
  var slot = 0;
  var letters = ['A', 'A', 'A'];
  var cause = '';

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
    if (kind === 'hop') kit.burst(x, y, { n: 3, color: '#d6e36a', speed: 36, life: 0.22, gravity: 40, size: 2 });
    else if (kind === 'home') {
      kit.burst(x, y, { n: 12, color: ['#fbbf24', '#fff', '#d6e36a'], speed: 70, life: 0.4, gravity: -10, size: 2 });
      kit.shake(2, 100);
      kit.vibrate(10);
    } else if (kind === 'hurt') {
      kit.burst(x, y, { n: 14, color: ['#ef6b4a', '#d6e36a', '#fff'], speed: 100, life: 0.45, gravity: 30, size: 2 });
      kit.shake(7, 200);
      kit.hitstop(100);
      kit.vibrate([16, 24, 16]);
    } else if (kind === 'clear') {
      kit.shake(3, 150);
      kit.confetti();
      kit.vibrate([10, 18, 10]);
    }
  }
  function isRiver(row) { return row >= 1 && row <= 5; }
  function isRoad(row) { return row >= 7 && row <= 11; }
  function maxTimer() { return level === 1 ? 64 : Math.max(30, 46 - (level - 1) * 4); }
  function speedOf(lane) { return lane.speed * (1 + (level - 1) * 0.18); }
  function centerX(col) { return col * TILE + TILE / 2; }
  function centerY(row) { return row * TILE_H + TILE_H / 2; }
  function fillLane(lane) {
    var span = lane.len + lane.gap;
    var items = [];
    var count = Math.ceil((WORLD_W + span) / span) + 1;
    var i;
    for (i = 0; i < count; i++) {
      items.push({
        x: lane.dir > 0 ? -lane.len + i * span : WORLD_W - i * span,
        w: lane.len,
        kind: lane.kind,
        phase: (i * 0.37) % 1
      });
    }
    lane.items = items;
    openStartGap(lane);
  }
  function openStartGap(lane) {
    if (lane.kind !== 'car' || lane.row < 10) return;
    var center = centerX(START.c);
    lane.items.forEach(function (it) {
      if (center + 22 > it.x && center - 22 < it.x + it.w) {
        it.x += lane.dir > 0 ? -(it.w + 36) : (it.w + 36);
      }
    });
  }
  function buildLanes() {
    lanes = BASE.map(function (b) {
      var lane = {
        row: b.row, kind: b.kind, dir: b.dir, speed: b.speed,
        len: b.len, gap: b.gap, color: b.color, items: []
      };
      if (level >= 2 && lane.row === 2) lane.kind = 'pad';
      fillLane(lane);
      return lane;
    });
  }
  function resetRound(full) {
    if (full) homes = [false, false, false, false, false];
    buildLanes();
    player = {
      col: START.c,
      row: START.r,
      x: centerX(START.c),
      y: centerY(START.r),
      hop: null,
      buf: null,
      ride: null,
      rideOff: 0
    };
    timerMax = maxTimer();
    timer = timerMax;
    streak = 0;
    snareT = 0;
    snareOn = false;
    snare = 0;
    popups = [];
    safe = 2.2;
  }
  function popup(text, x, y) {
    popups.push({
      text: text,
      x: Math.max(36, Math.min(WORLD_W - 36, x)),
      y: Math.max(16, Math.min(WORLD_H - 8, y)),
      life: 0.85
    });
  }
  function supportAt(row, x) {
    var found = null;
    lanes.forEach(function (lane) {
      if (lane.row !== row || lane.kind === 'car') return;
      lane.items.forEach(function (it) {
        var down = it.kind === 'pad' && it.phase > 0.62;
        if (down) return;
        if (x >= it.x - 2 && x <= it.x + it.w + 2) found = { lane: lane, it: it };
      });
    });
    return found;
  }
  function carHits(x, row) {
    if (safe > 0) return false;
    if (level === 1 && (x < 18 || x > WORLD_W - 18)) return false;
    var hit = false;
    lanes.forEach(function (lane) {
      if (lane.row !== row || lane.kind !== 'car') return;
      lane.items.forEach(function (it) {
        if (x + 4 > it.x + 6 && x - 4 < it.x + it.w - 6) hit = true;
      });
    });
    return hit;
  }
  function ridden(it) {
    return player && player.ride && player.ride.it === it;
  }
  function moveLanes(dt) {
    lanes.forEach(function (lane) {
      var spd = speedOf(lane) * lane.dir;
      lane.items.forEach(function (it) {
        it.x += spd * dt;
        if (it.kind === 'pad') it.phase = (it.phase + dt * 0.32) % 1;
        var riding = ridden(it);
        if (!riding && lane.dir > 0 && it.x > WORLD_W + 8) it.x = -it.w - lane.gap;
        if (!riding && lane.dir < 0 && it.x + it.w < -8) it.x = WORLD_W + lane.gap;
      });
    });
  }
  function die(why) {
    if (phase !== 'play') return;
    cause = (why || 'hit') + '@' + (player ? player.row : '');
    lives -= 1;
    flash = 0.22;
    feel('hurt', player.x, player.y);
    blip('hurt', { pitch: 90, dur: 0.16, type: 'sawtooth' });
    announce(lives > 0 ? 'Life lost' : 'The ford closes');
    if (lives <= 0) {
      phase = 'over';
      showOver();
      return;
    }
    phase = 'dead';
    deadT = 0.35;
  }
  function landHome() {
    var hi = HOMES.indexOf(player.col);
    if (hi < 0) return;
    if (level >= 2 && snareOn && snare === hi) {
      die('snare');
      return;
    }
    homes[hi] = true;
    var bonus = 150 + Math.round(timer * 8);
    score += bonus;
    popup('PORCH ' + bonus, player.x, player.y - 8);
    feel('home', player.x, 10);
    blip('coin', { pitch: 660, dur: 0.08 });
    setTimeout(function () { blip('coin', { pitch: 880, dur: 0.1 }); }, 70);
    announce('Porch ' + homes.filter(Boolean).length + ' of 5');
    if (homes.every(Boolean)) {
      score += 800 * level;
      popup('FORD CLEAR', WORLD_W / 2, WORLD_H / 2);
      feel('clear', player.x, player.y);
      blip('win', { pitch: 523, dur: 0.12 });
      phase = 'win';
      winT = 0.9;
      return;
    }
    player.col = START.c;
    player.row = START.r;
    player.x = centerX(START.c);
    player.y = centerY(START.r);
    player.ride = null;
    player.hop = null;
    player.buf = null;
    timer = timerMax;
    streak = 0;
    safe = 1.8;
  }
  function finishHop() {
    var hop = player.hop;
    player.col = hop.col;
    player.row = hop.row;
    player.x = hop.x1;
    player.y = hop.y1;
    player.hop = null;
    player.ride = null;
    if (isRiver(player.row)) {
      var log = supportAt(player.row, player.x);
      if (!log) { die('river'); return; }
      player.ride = log;
      player.rideOff = player.x - log.it.x;
    }
    if (phase !== 'play') return;
    if (isRoad(player.row) && carHits(player.x, player.row)) { die('cart'); return; }
    if (player.row === 0) landHome();
    if (phase === 'play' && player.buf) {
      var next = player.buf;
      player.buf = null;
      hopTo(next);
    }
  }
  function hopTo(dir) {
    if (!player || (phase !== 'play' && phase !== 'ready' && phase !== 'dead')) return;
    if (phase !== 'play') { player.buf = dir; return; }
    if (player.hop) { player.buf = dir; return; }
    var d = DIRS[dir];
    if (!d) return;
    var nc = player.col + d.x;
    var nr = player.row + d.y;
    if (player.ride) nc = Math.round((player.x - TILE / 2) / TILE) + d.x;
    if (nr === 0) {
      var best = null;
      var bestD = 16;
      HOMES.forEach(function (col) {
        var dist = Math.abs(player.x - centerX(col));
        if (dist <= bestD) { bestD = dist; best = col; }
      });
      if (best == null) return;
      nc = best;
    }
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
    if (nr === 0 && homes[HOMES.indexOf(nc)]) return;
    if (nr < player.row) {
      score += 10;
      streak += 1;
      if (streak >= 4) {
        score += 40;
        popup('STREAK', player.x, player.y - 10);
        streak = 0;
        blip('power', { pitch: 740, dur: 0.08 });
      }
    } else if (nr > player.row) streak = 0;
    var keepX = (dir === 'up' || dir === 'down') && player.ride && isRiver(nr);
    player.hop = {
      dir: dir,
      col: nc,
      row: nr,
      t: 0,
      dur: reduce ? 0 : 0.085,
      x0: player.x,
      y0: player.y,
      x1: keepX ? Math.max(8, Math.min(WORLD_W - 8, player.x)) : centerX(nc),
      y1: centerY(nr)
    };
    player.ride = null;
    feel('hop', player.x, player.y);
    blip('click', { pitch: 480 + (12 - nr) * 18, dur: 0.03, vol: 0.04 });
    if (player.hop.dur === 0) finishHop();
  }
  function updatePlay(dt) {
    clock += dt;
    if (safe > 0) safe -= dt;
    if (flash > 0) flash -= dt;
    timer -= dt;
    if (timer <= 0) { die('dusk'); return; }
    if (level >= 2) {
      snareT += dt;
      if (snareT > 3.2) {
        snareT = 0;
        snareOn = !snareOn;
        var open = [];
        homes.forEach(function (filled, i) { if (!filled) open.push(i); });
        if (open.length) snare = open[(Math.random() * open.length) | 0];
      }
    }
    moveLanes(dt);
    if (player.ride && !player.hop) {
      player.x = player.ride.it.x + player.rideOff;
      player.col = Math.max(0, Math.min(COLS - 1, Math.round((player.x - TILE / 2) / TILE)));
      var down = player.ride.it.kind === 'pad' && player.ride.it.phase > 0.62;
      if (down || player.x < -4 || player.x > WORLD_W + 4) { die(down ? 'pad' : 'edge'); return; }
    }
    if (player.hop) {
      player.hop.t += dt;
      var u = player.hop.dur <= 0 ? 1 : Math.min(1, player.hop.t / player.hop.dur);
      player.x = player.hop.x0 + (player.hop.x1 - player.hop.x0) * u;
      player.y = player.hop.y0 + (player.hop.y1 - player.hop.y0) * u;
      var rowNow = u > 0.6 ? player.hop.row : player.row;
      if (isRoad(rowNow) && carHits(player.x, rowNow)) { die('cart'); return; }
      if (u >= 1) finishHop();
    } else if (isRoad(player.row) && carHits(player.x, player.row)) {
      die('cart');
      return;
    }
    if (holdDir) {
      holdDelay -= dt;
      if (holdDelay <= 0) {
        hopTo(holdDir);
        holdDelay = 0.16;
      }
    }
    popups.forEach(function (p) { p.life -= dt; p.y -= 14 * dt; });
    popups = popups.filter(function (p) { return p.life > 0; });
  }
  function update(dt) {
    var kit = juice();
    if (kit) kit.stepParticles(dt);
    if (phase === 'play') updatePlay(dt);
    else if (phase === 'dead') {
      deadT -= dt;
      flash = Math.max(0, flash - dt);
      if (deadT <= 0) {
        resetRound(false);
        phase = 'ready';
        readyT = 0.85;
        announce('Ready');
      }
    } else if (phase === 'ready') {
      readyT -= dt;
      if (readyT <= 0) {
        phase = 'play';
        safe = Math.max(safe, 2);
        if (player.buf) {
          var next = player.buf;
          player.buf = null;
          hopTo(next);
        }
      }
    } else if (phase === 'win') {
      winT -= dt;
      if (winT <= 0) {
        level += 1;
        resetRound(true);
        phase = 'play';
        popup('WATCH ' + level, WORLD_W / 2, 28);
        announce('Watch ' + level);
      }
    } else clock += dt;
  }
  function paintHud() {
    var lit = homes.filter(Boolean).length;
    var text = 'Score ' + score + ' · Lives ' + lives + ' · Porches ' + lit + '/5';
    if (hud.textContent !== text) hud.textContent = text;
    var ratio = phase === 'play' || phase === 'dead' || phase === 'win' ? Math.max(0, timer / timerMax) : 1;
    duskBar.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
  }
  function drawCricket(ctx, x, y) {
    ctx.fillStyle = '#1b1b12';
    ctx.fillRect(x - 7, y - 1, 3, 2);
    ctx.fillRect(x + 4, y - 1, 3, 2);
    ctx.fillRect(x - 6, y + 2, 3, 2);
    ctx.fillRect(x + 3, y + 2, 3, 2);
    ctx.fillStyle = '#d6e36a';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 1, y - 6, 2, 2);
    ctx.fillStyle = '#1b1b12';
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);
  }
  function draw() {
    var kit = juice();
    var ctx = kit ? kit.placeCanvas(canvas, WORLD_W, WORLD_H, stage) : canvas.getContext('2d');
    var shake = kit && (phase === 'play' || phase === 'dead') ? kit.shakeOffset() : { x: 0, y: 0 };
    ctx.translate(shake.x, shake.y);
    var r, x, y;
    for (r = 0; r < ROWS; r++) {
      y = r * TILE_H;
      if (r === 0 || r === 6 || r === 12) ctx.fillStyle = r === 6 ? '#1e4634' : '#214c32';
      else if (isRiver(r)) ctx.fillStyle = '#12324a';
      else ctx.fillStyle = '#17171f';
      ctx.fillRect(0, y, WORLD_W, TILE_H);
      if (isRoad(r)) {
        ctx.fillStyle = level === 1 ? '#52525b' : '#3f3f46';
        ctx.fillRect(0, y, 16, TILE_H);
        ctx.fillRect(WORLD_W - 16, y, 16, TILE_H);
        ctx.fillStyle = '#2a2a34';
        ctx.fillRect(0, y + TILE_H - 2, WORLD_W, 2);
        ctx.fillStyle = '#f8fafc';
        var dash = reduce ? 0 : Math.floor(clock * 12) % 16;
        for (x = -dash; x < WORLD_W; x += 16) ctx.fillRect(x, y + 10, 6, 2);
        var lane = null;
        lanes.forEach(function (item) { if (item.row === r) lane = item; });
        if (lane) {
          ctx.fillStyle = lane.color;
          var ax = lane.dir > 0 ? 4 : WORLD_W - 12;
          ctx.fillRect(ax, y + 4, 8, 3);
          ctx.fillRect(lane.dir > 0 ? ax + 6 : ax - 3, y + 2, 3, 7);
        }
      }
      if (isRiver(r)) {
        ctx.fillStyle = 'rgba(224, 242, 254, 0.45)';
        var shift = reduce ? 0 : Math.floor(clock * 10 + r * 5) % 24;
        ctx.fillRect(shift, y + 6, 10, 2);
      }
    }
    HOMES.forEach(function (col, i) {
      x = col * TILE;
      ctx.fillStyle = '#163526';
      ctx.fillRect(x, 0, TILE, TILE_H);
      ctx.fillStyle = homes[i] ? '#fde68a' : '#f59e0b';
      ctx.globalAlpha = homes[i] ? 1 : 0.75;
      ctx.fillRect(x + 4, 3, 8, 6);
      ctx.fillStyle = homes[i] ? '#fff' : '#7c2d12';
      ctx.fillRect(x + 6, 5, 4, 3);
      ctx.globalAlpha = 1;
      if (level >= 2 && snareOn && snare === i && !homes[i]) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x + 3, 2, 10, 2);
        ctx.fillRect(x + 7, 2, 2, 10);
      }
    });
    for (x = 0; x < COLS; x++) {
      if (HOMES.indexOf(x) < 0) {
        ctx.fillStyle = '#102418';
        ctx.fillRect(x * TILE, 0, TILE, TILE_H);
      }
    }
    lanes.forEach(function (lane) {
      var y0 = lane.row * TILE_H;
      lane.items.forEach(function (it) {
        if (lane.kind === 'car') {
          ctx.fillStyle = '#05060a';
          ctx.fillRect(it.x - 1, y0 + 4, it.w + 2, 14);
          ctx.fillStyle = lane.color;
          ctx.fillRect(it.x, y0 + 5, it.w, 11);
          ctx.fillStyle = '#0b1220';
          ctx.fillRect(it.x + 4, y0 + 7, Math.max(4, Math.floor(it.w * 0.4)), 4);
          var nose = lane.dir > 0 ? it.x + it.w - 3 : it.x + 1;
          ctx.fillStyle = lane.dir > 0 ? '#fff7c2' : '#fb7185';
          ctx.fillRect(nose, y0 + 6, 2, 2);
          ctx.fillRect(nose, y0 + 13, 2, 2);
          ctx.fillStyle = '#111';
          ctx.fillRect(it.x + 2, y0 + 15, 4, 3);
          ctx.fillRect(it.x + it.w - 6, y0 + 15, 4, 3);
        } else {
          var down = it.kind === 'pad' && it.phase > 0.62;
          if (it.kind === 'pad') {
            ctx.globalAlpha = down ? 0.25 : 1;
            ctx.fillStyle = '#052e16';
            ctx.fillRect(it.x + 1, y0 + 5, it.w - 2, 12);
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(it.x + 3, y0 + 7, it.w - 6, 8);
            ctx.fillStyle = '#ecfccb';
            ctx.fillRect(it.x + it.w / 2 - 2, y0 + 9, 4, 4);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = '#1c1008';
            ctx.fillRect(it.x - 1, y0 + 5, it.w + 2, 12);
            ctx.fillStyle = lane.color;
            ctx.fillRect(it.x, y0 + 6, it.w, 10);
            ctx.fillStyle = '#fde68a';
            ctx.fillRect(it.x + 2, y0 + 8, it.w - 4, 2);
          }
        }
      });
    });
    if (player && (safe <= 0 || reduce || Math.floor(safe * 6) % 2 === 0)) drawCricket(ctx, player.x, player.y);
    else if (player) {
      ctx.globalAlpha = 0.35;
      drawCricket(ctx, player.x, player.y);
      ctx.globalAlpha = 1;
    }
    if (player && safe > 0) {
      ctx.strokeStyle = '#fde68a';
      ctx.strokeRect(player.x - 8, player.y - 8, 16, 16);
    }
    else if (!player) drawCricket(ctx, centerX(START.c), centerY(START.r));
    ctx.font = '700 10px JetBrains Mono, ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff7d6';
    popups.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, flash) + ')';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (phase === 'ready') {
      ctx.fillStyle = 'rgba(7,11,20,0.5)';
      ctx.fillRect(0, WORLD_H / 2 - 16, WORLD_W, 28);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 14px JetBrains Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Ready!', WORLD_W / 2, WORLD_H / 2 + 4);
    }
    if (kit) kit.drawParticles(ctx);
    paintHud();
  }
  function loop(now) {
    requestAnimationFrame(loop);
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
    savedMark = store.scores.findIndex(function (row) { return row.name === name && row.score === score; });
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
    resetRound(true);
    phase = 'ready';
    readyT = 0.85;
    show('play');
    announce('Watch 1');
    blip('launch', { pitch: 392, dur: 0.07 });
    var kit = juice();
    if (kit) kit.unlock();
  }
  function paintMute() {
    var btn = $('muteBtn');
    btn.textContent = store.sound ? 'Mute' : 'Sound';
    btn.setAttribute('aria-pressed', store.sound ? 'true' : 'false');
  }
  function paintCrt() {
    $('scan').hidden = !store.crt;
    $('crtBtn').setAttribute('aria-pressed', store.crt ? 'true' : 'false');
  }
  function syncViewport() {
    var root = document.documentElement;
    var vv = window.visualViewport;
    var top = vv ? vv.offsetTop : 0;
    var h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--vv-top', Math.round(top) + 'px');
    root.style.setProperty('--vv-h', Math.max(1, Math.round(h)) + 'px');
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
      holdDelay = 0.22;
      hopTo(dir);
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
    hopTo(dir);
    var kit = juice();
    if (kit) kit.unlock();
  }
  stage.addEventListener('pointerdown', beginSwipe);
  stage.addEventListener('pointerup', finishSwipe);
  stage.addEventListener('pointercancel', function () { swipe = null; });
  document.addEventListener('keydown', function (e) {
    var map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down'
    };
    if (map[e.key] && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      hopTo(map[e.key]);
      return;
    }
    if (e.key === 'Enter' && phase === 'title') { e.preventDefault(); startGame(); }
    if ((e.key === 'm' || e.key === 'M') && e.target.tagName !== 'INPUT') {
      store.sound = !store.sound; save(); paintMute();
    }
    if ((e.key === 'c' || e.key === 'C') && e.target.tagName !== 'INPUT') {
      store.crt = !store.crt; save(); paintCrt();
    }
    if (e.key === 'Escape' && phase === 'play') { phase = 'over'; showOver(); }
  });
  document.querySelectorAll('.pad button').forEach(bindPad);
  $('start').addEventListener('click', startGame);
  $('again').addEventListener('click', startGame);
  $('openScores').addEventListener('click', function () { savedMark = -1; paintBoard(); show('board'); });
  $('overScores').addEventListener('click', function () { paintBoard(); show('board'); });
  $('boardBack').addEventListener('click', function () { show(phase === 'over' ? 'over' : 'title'); });
  $('muteBtn').addEventListener('click', function () {
    store.sound = !store.sound; save(); paintMute();
    if (store.sound) blip('click', { pitch: 520, dur: 0.04 });
  });
  $('crtBtn').addEventListener('click', function () { store.crt = !store.crt; save(); paintCrt(); });
  $('letterUp').addEventListener('click', function () { nudgeLetter(1); });
  $('letterDown').addEventListener('click', function () { nudgeLetter(-1); });
  $('initials').addEventListener('input', setFromInput);
  $('over').addEventListener('submit', function (e) {
    e.preventDefault();
    setFromInput();
    commitScore();
  });
  document.addEventListener('touchmove', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', syncViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  document.documentElement.classList.add('ford-lock');
  syncViewport();
  paintMute();
  paintCrt();
  show('title');
  requestAnimationFrame(loop);

  window.NIGHTFORD = {
    snap: function () {
      var hazards = [];
      var supports = [];
      lanes.forEach(function (lane) {
        lane.items.forEach(function (it) {
          var row = {
            x: it.x, w: it.w, row: lane.row, dir: lane.dir,
            speed: speedOf(lane), kind: it.kind, down: it.kind === 'pad' && it.phase > 0.62
          };
          if (lane.kind === 'car') hazards.push(row);
          else supports.push(row);
        });
      });
      return {
        phase: phase,
        score: score,
        lives: lives,
        level: level,
        timer: timer,
        homes: homes.slice(),
        snare: level >= 2 && snareOn ? snare : -1,
        tile: TILE,
        cols: COLS,
        rows: ROWS,
        w: WORLD_W,
        h: WORLD_H,
        cause: cause,
        player: player ? {
          x: player.x, y: player.y, col: player.col, row: player.row,
          hopping: !!player.hop
        } : null,
        hazards: hazards,
        supports: supports,
        popups: popups.map(function (p) { return p.text; })
      };
    }
  };
})();
