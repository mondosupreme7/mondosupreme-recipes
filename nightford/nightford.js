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
    { row: 1, kind: 'log', dir: 1, speed: 18, len: 104, gap: 36, color: '#8d5a32' },
    { row: 2, kind: 'log', dir: -1, speed: 30, len: 72, gap: 50, color: '#6b4423' },
    { row: 3, kind: 'log', dir: 1, speed: 22, len: 96, gap: 40, color: '#a56b3c' },
    { row: 4, kind: 'log', dir: -1, speed: 28, len: 80, gap: 48, color: '#5c3a22' },
    { row: 5, kind: 'log', dir: 1, speed: 24, len: 80, gap: 46, color: '#7a4e2d' },
    { row: 7, kind: 'car', dir: -1, speed: 50, len: 32, gap: 84, color: '#ef6b4a' },
    { row: 8, kind: 'car', dir: 1, speed: 36, len: 54, gap: 72, color: '#67b7e3' },
    { row: 9, kind: 'car', dir: -1, speed: 44, len: 36, gap: 78, color: '#f2c14e' },
    { row: 10, kind: 'car', dir: 1, speed: 30, len: 42, gap: 86, color: '#e4e4e7' },
    { row: 11, kind: 'car', dir: -1, speed: 24, len: 34, gap: 92, color: '#c084fc' }
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
  function maxTimer() { return Math.max(28, 48 - (level - 1) * 4); }
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
    var hit = false;
    lanes.forEach(function (lane) {
      if (lane.row !== row || lane.kind !== 'car') return;
      lane.items.forEach(function (it) {
        if (x + 5 > it.x + 3 && x - 5 < it.x + it.w - 3) hit = true;
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
    cause = why || 'hit';
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
    deadT = 0.7;
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
    if (phase !== 'play' || !player) return;
    if (player.hop) { player.buf = dir; return; }
    var d = DIRS[dir];
    if (!d) return;
    var nc = player.col + d.x;
    var nr = player.row + d.y;
    if (player.ride) nc = Math.round((player.x - TILE / 2) / TILE) + d.x;
    if (nr === 0) {
      var best = null;
      var bestD = 14;
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
      if (down || player.x < 6 || player.x > WORLD_W - 6) { die(down ? 'pad' : 'edge'); return; }
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
        phase = 'play';
        announce('Lives ' + lives);
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
        ctx.fillStyle = '#3a3a46';
        var dash = reduce ? 0 : Math.floor(clock * 18) % 12;
        for (x = -dash; x < WORLD_W; x += 12) ctx.fillRect(x, y + 7, 5, 2);
      }
      if (isRiver(r) && !reduce) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.18)';
        var shift = Math.floor(clock * 14 + r * 5) % 20;
        ctx.fillRect(shift, y + 4, WORLD_W, 1);
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
          ctx.fillStyle = lane.color;
          ctx.fillRect(it.x, y0 + 6, it.w, 10);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(it.x + 3, y0 + 8, Math.max(4, it.w * 0.35), 4);
          ctx.fillStyle = '#111';
          ctx.fillRect(it.x + 2, y0 + 15, 3, 2);
          ctx.fillRect(it.x + it.w - 5, y0 + 15, 3, 2);
        } else {
          var down = it.kind === 'pad' && it.phase > 0.62;
          if (it.kind === 'pad') {
            ctx.globalAlpha = down ? 0.25 : 1;
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(it.x + 2, y0 + 7, it.w - 4, 8);
            ctx.fillStyle = '#bbf7d0';
            ctx.fillRect(it.x + it.w / 2 - 2, y0 + 9, 4, 4);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = lane.color;
            ctx.fillRect(it.x, y0 + 7, it.w, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(it.x + 2, y0 + 9, it.w - 4, 2);
          }
        }
      });
    });
    if (player && (phase !== 'dead' || Math.floor(clock * 12) % 2 === 0)) drawCricket(ctx, player.x, player.y);
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
  function syncLetters() {
    var box = $('slots');
    box.innerHTML = '';
    letters.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = ch;
      b.setAttribute('aria-label', 'Initial ' + (i + 1) + ' ' + ch);
      if (i === slot) b.className = 'is-on';
      b.addEventListener('click', function () { slot = i; syncLetters(); });
      box.appendChild(b);
    });
    $('initials').value = letters.join('');
  }
  function setFromInput() {
    var raw = $('initials').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    letters = (raw + 'AAA').slice(0, 3).split('');
    syncLetters();
  }
  function showOver() {
    savedMark = -1;
    var ok = qualifies(score);
    $('overScore').textContent = 'Score ' + score + (ok ? '' : ' · short of the book');
    $('entry').hidden = !ok;
    letters = (store.name || 'AAA').toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'A').slice(0, 3).split('');
    slot = 0;
    syncLetters();
    show('over');
    paintCrt();
  }
  function commitScore() {
    var name = letters.join('').replace(/[^A-Z]/g, '').slice(0, 3) || 'AAA';
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
    phase = 'play';
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
    btn.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      e.preventDefault();
      holdDir = dir;
      holdDelay = 0.22;
      hopTo(dir);
      var kit = juice();
      if (kit) kit.unlock();
    });
    function up() { if (holdDir === dir) holdDir = null; }
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }
  var swipe = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button, a, input, form')) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointerup', function (e) {
    if (!swipe || swipe.id !== e.pointerId) return;
    var dx = e.clientX - swipe.x;
    var dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < 18) return;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    hopTo(dir);
    var kit = juice();
    if (kit) kit.unlock();
  });
  document.addEventListener('keydown', function (e) {
    var map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down'
    };
    if (map[e.key]) {
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
  $('letterUp').addEventListener('click', function () {
    letters[slot] = String.fromCharCode(((letters[slot].charCodeAt(0) - 65 + 1) % 26) + 65);
    syncLetters();
  });
  $('letterDown').addEventListener('click', function () {
    letters[slot] = String.fromCharCode(((letters[slot].charCodeAt(0) - 65 + 25) % 26) + 65);
    syncLetters();
  });
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
