/* Needlewake — a glass needle in a field of spinning shards. Vector lines and synth live in this file. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.needlewake.v1';
  var W = 180;
  var H = 300;
  var STEP = 1 / 60;

  var screen = document.getElementById('screen');
  var stage = document.getElementById('stage');
  var hud = document.getElementById('hud');
  var status = document.getElementById('status');
  var veil = document.getElementById('veil');
  var titleCard = document.getElementById('titleCard');
  var scoreCard = document.getElementById('scoreCard');
  var scoreForm = document.getElementById('scoreForm');
  var overLine = document.getElementById('overLine');
  var initials = document.getElementById('initials');
  var board = document.getElementById('board');
  var pad = document.getElementById('pad');
  var muteBtn = document.getElementById('mute');
  var crtBtn = document.getElementById('crt');
  var resumeBtn = document.getElementById('resume');
  var againBtn = document.getElementById('again');
  var endBtn = document.getElementById('endRun');
  var backBtn = document.getElementById('backTitle');

  var phase = 'attract';
  var run = null;
  var store = loadStore();
  var soundOn = store.sound !== false;
  var actx = null;
  var raf = 0;
  var last = 0;
  var acc = 0;
  var pointerId = null;
  var freshName = '';
  var input = blankInput();
  var stars = [];
  var i;

  for (i = 0; i < 32; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      a: 0.25 + Math.random() * 0.7
    });
  }

  function $(id) { return document.getElementById(id); }
  function kit() { return window.MONDO_JUICE || null; }
  function reduced() {
    var k = kit();
    if (k) return k.reduced();
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function blankInput() {
    return {
      keyLeft: false, keyRight: false, keyUp: false, keyDown: false, keyFire: false,
      padLeft: false, padRight: false, padThrust: false, padFire: false,
      drag: null, tapFire: false
    };
  }
  function cleanName(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  }
  function loadStore() {
    var s = { scores: [], initials: '', crt: false, sound: true };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return s;
      if (Array.isArray(raw.scores)) {
        s.scores = raw.scores.filter(function (row) {
          return row && typeof row.name === 'string' && typeof row.score === 'number' && isFinite(row.score);
        }).slice(0, 8);
      }
      if (typeof raw.initials === 'string') s.initials = cleanName(raw.initials);
      if (typeof raw.crt === 'boolean') s.crt = raw.crt;
      if (typeof raw.sound === 'boolean') s.sound = raw.sound;
    } catch (e) { /* keep defaults */ }
    s.scores.sort(function (a, b) { return b.score - a.score; });
    return s;
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }
  function bestScore() {
    return store.scores.length ? store.scores[0].score : 0;
  }
  function say(text) {
    if (status.textContent !== text) status.textContent = text;
  }
  function paintHud(text) {
    if (hud.textContent !== text) hud.textContent = text;
  }
  function siteMuted() {
    return !!(window.MONDO_AUDIO && MONDO_AUDIO.muted && MONDO_AUDIO.muted());
  }
  function audible() { return soundOn && !siteMuted(); }
  function ac() {
    if (!audible()) return null;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!actx) actx = new AC();
      if (actx.state === 'suspended' && actx.resume) actx.resume();
    } catch (e) { return null; }
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    var ctx = ac();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      var t = ctx.currentTime + (delay || 0);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.04), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, dur));
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  function noise(dur, vol) {
    var ctx = ac();
    if (!ctx) return;
    try {
      var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var data = buf.getChannelData(0);
      var i;
      for (i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = ctx.createBufferSource();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      src.buffer = buf;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = vol || 0.06;
      src.start();
    } catch (e) { /* sound is optional */ }
  }
  function syncMute() {
    var on = audible();
    muteBtn.textContent = on ? 'Mute' : 'Sound';
    muteBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    muteBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
  }
  function syncCrt() {
    stage.classList.toggle('crt-on', !!store.crt);
    crtBtn.setAttribute('aria-pressed', store.crt ? 'true' : 'false');
    crtBtn.setAttribute('aria-label', store.crt ? 'Turn scanlines off' : 'Turn scanlines on');
  }
  function syncViewport() {
    var vv = window.visualViewport;
    var root = document.documentElement;
    var top = vv ? vv.offsetTop : 0;
    var h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--vv-top', Math.round(top) + 'px');
    root.style.setProperty('--vv-h', Math.round(h) + 'px');
    var nav = document.querySelector('.studio-nav');
    var navH = 48;
    if (nav) {
      var box = nav.getBoundingClientRect();
      if (box.height >= 36) navH = Math.ceil(box.height);
    }
    root.style.setProperty('--cab-nav', navH + 'px');
  }
  function fitCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var availW = stage.clientWidth;
    var availH = stage.clientHeight;
    if (availW < 8 || availH < 8) return null;
    var scale = Math.min(availW / W, availH / H);
    var cssW = Math.max(1, Math.floor(W * scale));
    var cssH = Math.max(1, Math.floor(H * scale));
    if (screen._cssW !== cssW || screen._cssH !== cssH || screen._dpr !== dpr) {
      screen._cssW = cssW;
      screen._cssH = cssH;
      screen._dpr = dpr;
      screen.style.width = cssW + 'px';
      screen.style.height = cssH + 'px';
      screen.width = Math.max(1, Math.round(cssW * dpr));
      screen.height = Math.max(1, Math.round(cssH * dpr));
    }
    return { ctx: screen.getContext('2d'), s: (cssW / W) * dpr };
  }
  function toLogical(ev) {
    var rect = screen.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / Math.max(1, rect.width)) * W,
      y: ((ev.clientY - rect.top) / Math.max(1, rect.height)) * H
    };
  }
  function typing() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }
  function show(which) {
    titleCard.hidden = which !== 'title';
    scoreCard.hidden = which !== 'score';
    veil.hidden = which === 'play';
    pad.hidden = which !== 'play';
    document.body.classList.toggle('is-play', which === 'play');
  }
  function renderBoard() {
    board.replaceChildren();
    if (!store.scores.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No scores yet';
      board.appendChild(empty);
      return;
    }
    store.scores.forEach(function (row, index) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      var sc = document.createElement('span');
      name.textContent = (index + 1) + '  ' + row.name;
      sc.textContent = String(row.score);
      li.appendChild(name);
      li.appendChild(sc);
      board.appendChild(li);
    });
  }
  function markFresh(name, score) {
    freshName = name;
    renderBoard();
    var rows = board.querySelectorAll('li');
    var i;
    for (i = 0; i < store.scores.length; i++) {
      if (store.scores[i].name === name && store.scores[i].score === score) {
        if (rows[i]) rows[i].className = 'is-new';
        break;
      }
    }
  }
  function wrap(o) {
    if (o.x < 0) o.x += W;
    else if (o.x >= W) o.x -= W;
    if (o.y < 0) o.y += H;
    else if (o.y >= H) o.y -= H;
  }
  function distWrap(ax, ay, bx, by) {
    var dx = Math.abs(ax - bx);
    var dy = Math.abs(ay - by);
    if (dx > W / 2) dx = W - dx;
    if (dy > H / 2) dy = H - dy;
    return Math.hypot(dx, dy);
  }
  function popup(text, x, y) {
    run.pops.push({ text: text, x: x, y: y, life: 0.7 });
    if (run.pops.length > 10) run.pops.shift();
  }
  function burst(x, y, color) {
    var k = kit();
    if (!k) return;
    k.burst(x, y, { n: 8, color: color || ['#d7fff6', '#9db4ff', '#ffd59a'], speed: 70, life: 0.4, gravity: 0, size: 2 });
  }
  function makeRock(x, y, size, speed) {
    var count = size === 3 ? 8 : (size === 2 ? 7 : 6);
    var base = size === 3 ? 15 : (size === 2 ? 9 : 5);
    var verts = [];
    var seed = Math.random() * 20;
    var i;
    for (i = 0; i < count; i++) {
      var ang = (i / count) * Math.PI * 2;
      var rad = base * (0.72 + (Math.sin(seed + i * 1.9) * 0.5 + 0.5) * 0.4);
      verts.push(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    var dir = Math.random() * Math.PI * 2;
    var sp = speed == null ? (size === 3 ? 16 : size === 2 ? 30 : 46) : speed;
    return {
      x: x, y: y, size: size, r: base, verts: verts, dead: false, flash: 0,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.8),
      vx: Math.cos(dir) * sp,
      vy: Math.sin(dir) * sp
    };
  }
  function rockAway(size, speed) {
    var rock = makeRock(W / 2, 40, size, speed);
    var tries = 0;
    while (tries < 8 && run && distWrap(rock.x, rock.y, run.ship.x, run.ship.y) < 70) {
      rock.x = 16 + Math.random() * (W - 32);
      rock.y = 16 + Math.random() * (H * 0.55);
      tries += 1;
    }
    return rock;
  }
  function newRun() {
    return {
      ship: { x: W / 2, y: 230, a: -Math.PI / 2, vx: 0, vy: 0, lives: 3, inv: 1.3 },
      shots: [], foes: [], rocks: [], pops: [],
      buoy: null, wave: 0, score: 0, cool: 0.2, flash: 0, puff: 0,
      combo: 0, comboT: 0, clearT: 0, pending: false, banner: null,
      nextLife: 8000, thrusting: false
    };
  }
  function beginWave(n) {
    run.wave = n;
    run.rocks = [];
    run.buoy = null;
    run.pending = false;
    run.clearT = 0;
    run.foes = [];
    run.ship.inv = Math.max(run.ship.inv, 1.05);
    run.banner = { text: n === 1 ? 'SHARDS' : 'FIELD ' + n, t: 1.1 };
    if (n === 1) {
      var top = makeRock(W / 2, 48, 3, 10);
      top.vx = 8;
      top.vy = 6;
      run.rocks.push(top);
      run.rocks.push(makeRock(30, 100, 3, 12));
      run.rocks.push(makeRock(W - 30, 124, 3, 12));
    } else {
      var count = Math.min(5, n + 1);
      var i;
      for (i = 0; i < count; i++) run.rocks.push(rockAway(3, 14 + n * 2));
      if (n >= 2) run.buoy = { x: W / 2, y: 34, vx: 32, hp: 2, cool: 1.2, flash: 0, r: 8 };
    }
    say(n === 1 ? 'Break the shards' : 'Field ' + n);
  }
  function award(points, x, y) {
    if (run.comboT > 0) run.combo += 1;
    else run.combo = 1;
    run.comboT = 1.05;
    var gain = points * Math.min(4, run.combo);
    run.score += gain;
    popup((run.combo > 1 ? 'x' + run.combo + ' ' : '') + '+' + gain, x, y);
    if (run.score >= run.nextLife) {
      run.ship.lives = Math.min(5, run.ship.lives + 1);
      run.nextLife += 8000;
      popup('1UP', run.ship.x, run.ship.y - 14);
      tone(523, 0.08, 'square', 0.04, 0);
      tone(784, 0.1, 'triangle', 0.035, 0.08);
      say('Extra life. Score ' + run.score);
    }
  }
  function markClear(text) {
    run.pending = true;
    run.clearT = 0.95;
    run.banner = { text: text, t: 0.95 };
    run.buoy = null;
    var bonus = 150 * run.wave;
    run.score += bonus;
    popup('+' + bonus, W / 2, H / 2);
    burst(W / 2, H / 2, ['#d7fff6', '#9db4ff', '#fff']);
    var k = kit();
    if (k) {
      k.shake(2.4, 160);
      k.vibrate([10, 24, 10]);
    }
    tone(440, 0.08, 'triangle', 0.04, 0);
    tone(554, 0.08, 'triangle', 0.04, 0.08);
    tone(880, 0.12, 'sine', 0.035, 0.16);
    say(text + '. Score ' + run.score);
  }
  function hurt(rock) {
    if (!run || phase !== 'play' || run.ship.inv > 0) return;
    var ship = run.ship;
    ship.lives -= 1;
    ship.inv = 2;
    run.flash = reduced() ? 0.2 : 0.12;
    run.combo = 0;
    run.comboT = 0;
    if (rock) {
      var dx = ship.x - rock.x;
      var dy = ship.y - rock.y;
      if (Math.abs(dx) > W / 2) dx -= Math.sign(dx) * W;
      if (Math.abs(dy) > H / 2) dy -= Math.sign(dy) * H;
      var d = Math.hypot(dx, dy) || 1;
      ship.x = rock.x + (dx / d) * (rock.r + 20);
      ship.y = rock.y + (dy / d) * (rock.r + 20);
      wrap(ship);
      ship.vx = (dx / d) * 70;
      ship.vy = (dy / d) * 70;
    } else {
      ship.vx *= -0.4;
      ship.vy *= -0.4;
    }
    noise(0.14, 0.08);
    tone(110, 0.16, 'sawtooth', 0.05);
    var k = kit();
    if (k) {
      k.shake(5, 200);
      k.hitstop(90);
      k.vibrate([16, 30, 16]);
    }
    if (ship.lives <= 0) {
      gameOver();
      return;
    }
    say('Needle cracked. ' + ship.lives + (ship.lives === 1 ? ' life' : ' lives') + ' left');
  }
  function shoot() {
    if (run.shots.length >= 3) return;
    var ship = run.ship;
    var a = ship.a;
    run.shots.push({
      x: ship.x + Math.cos(a) * 12,
      y: ship.y + Math.sin(a) * 12,
      vx: Math.cos(a) * 220 + ship.vx * 0.15,
      vy: Math.sin(a) * 220 + ship.vy * 0.15,
      life: 0.55
    });
    tone(1040, 0.028, 'square', 0.024);
  }
  function splitRock(rock, bag) {
    var child = rock.size - 1;
    if (child < 1 || run.rocks.length > 28) return;
    var base = Math.atan2(rock.vy, rock.vx);
    var i;
    for (i = 0; i < 2; i++) {
      var ang = base + (i ? 0.75 : -0.75);
      var sp = (child === 2 ? 30 : 40) * (1 + run.wave * 0.04);
      var nr = makeRock(rock.x, rock.y, child, sp);
      nr.vx = Math.cos(ang) * sp;
      nr.vy = Math.sin(ang) * sp;
      bag.push(nr);
    }
  }

  function stepStars(dt) {
    if (reduced()) return;
    stars.forEach(function (star) {
      star.y += 8 * dt;
      if (star.y > H) star.y = 0;
    });
  }
  function stepPlay(dt) {
    var ship = run.ship;
    var spawned = [];
    ship.inv = Math.max(0, ship.inv - dt);
    run.flash = Math.max(0, run.flash - dt);
    run.puff = Math.max(0, run.puff - dt);
    run.comboT = Math.max(0, run.comboT - dt);
    if (run.comboT <= 0) run.combo = 0;
    if (run.banner) {
      run.banner.t -= dt;
      if (run.banner.t <= 0) run.banner = null;
    }
    run.pops.forEach(function (p) { p.life -= dt; p.y -= 14 * dt; });
    run.pops = run.pops.filter(function (p) { return p.life > 0; });
    run.rocks.forEach(function (rock) { rock.flash = Math.max(0, rock.flash - dt); });

    if (run.pending) {
      run.clearT -= dt;
      if (run.clearT <= 0) beginWave(run.wave + 1);
    }

    var thrusting = false;
    if (input.drag && input.drag.moved) {
      var aim = Math.atan2(input.drag.y - ship.y, input.drag.x - ship.x);
      var diff = aim - ship.a;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      var cap = 10 * dt;
      ship.a += clamp(diff, -cap, cap);
      if (Math.hypot(input.drag.x - ship.x, input.drag.y - ship.y) > 28) thrusting = true;
    } else {
      var turn = 0;
      if (input.keyLeft || input.padLeft) turn -= 1;
      if (input.keyRight || input.padRight) turn += 1;
      ship.a += turn * 3.5 * dt;
    }
    if (input.keyUp || input.padThrust) thrusting = true;
    if (thrusting) {
      ship.vx += Math.cos(ship.a) * 175 * dt;
      ship.vy += Math.sin(ship.a) * 175 * dt;
      if (run.puff <= 0) {
        run.puff = 0.11;
        tone(78, 0.05, 'sawtooth', 0.018);
      }
    }
    if (input.keyDown) {
      ship.vx *= Math.exp(-2.4 * dt);
      ship.vy *= Math.exp(-2.4 * dt);
    }
    ship.vx *= Math.exp(-1.15 * dt);
    ship.vy *= Math.exp(-1.15 * dt);
    var sp = Math.hypot(ship.vx, ship.vy);
    if (sp > 125) {
      ship.vx *= 125 / sp;
      ship.vy *= 125 / sp;
    }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship);
    run.thrusting = thrusting && phase === 'play';

    if (input.tapFire) {
      input.tapFire = false;
      run.cool = 0;
    }
    var rate = (input.keyFire || input.padFire) ? 0.12 : 0.26;
    run.cool -= dt;
    if (phase === 'play' && run.cool <= 0) {
      run.cool = rate;
      shoot();
    }

    run.shots.forEach(function (b) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
    });
    run.shots = run.shots.filter(function (b) { return b.life > 0; });
    run.foes.forEach(function (b) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
    });
    run.foes = run.foes.filter(function (b) { return b.life > 0; });

    if (!run.pending) {
      run.rocks.forEach(function (rock) {
        if (rock.dead) return;
        rock.x += rock.vx * dt;
        rock.y += rock.vy * dt;
        rock.rot += rock.spin * dt;
        wrap(rock);
      });
      if (run.buoy && run.buoy.hp > 0) {
        var buoy = run.buoy;
        buoy.flash = Math.max(0, buoy.flash - dt);
        buoy.x += buoy.vx * dt;
        if (buoy.x < 18 || buoy.x > W - 18) buoy.vx *= -1;
        buoy.cool -= dt;
        if (buoy.cool <= 0 && run.foes.length < 2) {
          buoy.cool = Math.max(0.9, 1.5 - run.wave * 0.08);
          var ang = Math.atan2(ship.y - buoy.y, ship.x - buoy.x);
          run.foes.push({
            x: buoy.x, y: buoy.y,
            vx: Math.cos(ang) * 72,
            vy: Math.sin(ang) * 72,
            life: 2.2
          });
          tone(220, 0.05, 'square', 0.03);
        }
      }
    }

    if (phase !== 'play') {
      paintHud(hudText());
      return;
    }

    run.shots.forEach(function (b) {
      if (b.life <= 0) return;
      var i;
      for (i = 0; i < run.rocks.length; i++) {
        var rock = run.rocks[i];
        if (rock.dead) continue;
        if (distWrap(b.x, b.y, rock.x, rock.y) <= rock.r) {
          rock.dead = true;
          rock.flash = 0.08;
          b.life = 0;
          var pts = rock.size === 1 ? 100 : (rock.size === 2 ? 50 : 20);
          award(pts, rock.x, rock.y);
          burst(rock.x, rock.y);
          noise(0.05, 0.04);
          tone(480 + rock.size * 80, 0.04, 'square', 0.03);
          splitRock(rock, spawned);
          var k = kit();
          if (k) k.shake(rock.size === 3 ? 1.6 : 1, 80);
          break;
        }
      }
      if (b.life > 0 && run.buoy && run.buoy.hp > 0 && distWrap(b.x, b.y, run.buoy.x, run.buoy.y) < run.buoy.r + 2) {
        b.life = 0;
        run.buoy.hp -= 1;
        run.buoy.flash = 0.1;
        burst(run.buoy.x, run.buoy.y, ['#ffb15a', '#fff4d2']);
        if (run.buoy.hp <= 0) {
          award(250, run.buoy.x, run.buoy.y);
          tone(660, 0.08, 'triangle', 0.04);
          run.buoy = null;
        }
      }
    });
    run.rocks = run.rocks.filter(function (rock) { return !rock.dead; }).concat(spawned);
    run.shots = run.shots.filter(function (b) { return b.life > 0; });

    if (phase !== 'play' || run.pending) {
      paintHud(hudText());
      return;
    }

    run.rocks.forEach(function (rock) {
      if (ship.inv > 0) return;
      if (distWrap(ship.x, ship.y, rock.x, rock.y) < rock.r + 4) hurt(rock);
    });
    if (phase === 'play' && run.buoy && ship.inv <= 0 && distWrap(ship.x, ship.y, run.buoy.x, run.buoy.y) < run.buoy.r + 6) {
      hurt(run.buoy);
    }
    if (phase === 'play') {
      run.foes.forEach(function (b) {
        if (b.life > 0 && distWrap(ship.x, ship.y, b.x, b.y) < 7) {
          b.life = 0;
          hurt(null);
        }
      });
    }
    if (phase === 'play' && !run.pending && run.wave > 0 && run.rocks.length === 0) markClear('FIELD CLEAR');
    paintHud(hudText());
  }
  function hudText() {
    if (!run || phase === 'attract') return 'Best ' + bestScore();
    var combo = run.combo > 1 ? ' · x' + run.combo : '';
    return 'Score ' + run.score + combo + ' · Lives ' + Math.max(0, run.ship.lives) + ' · Field ' + run.wave;
  }
  function gameOver() {
    if (phase === 'over') return;
    phase = 'over';
    input = blankInput();
    overLine.hidden = false;
    overLine.textContent = 'Score ' + (run ? run.score : 0);
    scoreForm.hidden = !(run && run.score > 0);
    againBtn.hidden = false;
    resumeBtn.hidden = true;
    endBtn.hidden = true;
    backBtn.hidden = false;
    freshName = '';
    if (run && run.score > 0) {
      initials.value = store.initials || '';
      setTimeout(function () {
        initials.focus();
        if (initials.select) initials.select();
      }, 40);
    }
    show('score');
    renderBoard();
    paintHud('Score ' + (run ? run.score : 0));
    say('Game over. Score ' + (run ? run.score : 0));
  }
  function startGame() {
    if (phase === 'play') return;
    run = newRun();
    beginWave(1);
    phase = 'play';
    input = blankInput();
    freshName = '';
    show('play');
    var k = kit();
    if (k && k.unlock) k.unlock();
    ac();
    paintHud(hudText());
    say('Needlewake started');
  }
  function browseScores() {
    if (phase === 'play') return pauseScores();
    if (phase === 'over') return;
    phase = 'scores';
    scoreForm.hidden = true;
    overLine.hidden = true;
    againBtn.hidden = true;
    resumeBtn.hidden = true;
    endBtn.hidden = true;
    backBtn.hidden = false;
    show('score');
    renderBoard();
  }
  function pauseScores() {
    if (phase !== 'play') return browseScores();
    phase = 'pause';
    input = blankInput();
    scoreForm.hidden = true;
    overLine.hidden = true;
    againBtn.hidden = true;
    resumeBtn.hidden = false;
    endBtn.hidden = false;
    backBtn.hidden = true;
    show('score');
    renderBoard();
    say('Paused');
  }
  function resumeGame() {
    if (phase !== 'pause' || !run) return;
    phase = 'play';
    input = blankInput();
    show('play');
    say('Resumed');
  }
  function backTitle() {
    phase = 'attract';
    run = null;
    input = blankInput();
    show('title');
    paintHud('Best ' + bestScore());
    say('Needlewake');
  }
  function saveScore(event) {
    event.preventDefault();
    if (!run || phase !== 'over') return;
    var name = cleanName(initials.value) || 'AAA';
    store.initials = name;
    store.scores.push({ name: name, score: run.score, at: Date.now() });
    store.scores.sort(function (a, b) { return b.score - a.score; });
    store.scores = store.scores.slice(0, 8);
    saveStore();
    scoreForm.hidden = true;
    overLine.textContent = 'Saved ' + name + ' · ' + run.score;
    markFresh(name, run.score);
    tone(523, 0.07, 'triangle', 0.04, 0);
    tone(784, 0.09, 'triangle', 0.035, 0.08);
    say('Saved ' + name + ' with ' + run.score);
  }

  function withWrap(ctx, x, y, r, fn) {
    var xs = [0];
    var ys = [0];
    if (x < r + 4) xs.push(W);
    if (x > W - r - 4) xs.push(-W);
    if (y < r + 4) ys.push(H);
    if (y > H - r - 4) ys.push(-H);
    var i, j;
    for (i = 0; i < xs.length; i++) {
      for (j = 0; j < ys.length; j++) {
        ctx.save();
        ctx.translate(x + xs[i], y + ys[j]);
        fn();
        ctx.restore();
      }
    }
  }
  function strokeVerts(ctx, verts, rot) {
    ctx.beginPath();
    var i;
    for (i = 0; i < verts.length; i += 2) {
      var x = verts[i] * Math.cos(rot) - verts[i + 1] * Math.sin(rot);
      var y = verts[i] * Math.sin(rot) + verts[i + 1] * Math.cos(rot);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  function drawShip(ctx, ship, thrust, now) {
    withWrap(ctx, ship.x, ship.y, 12, function () {
      ctx.rotate(ship.a);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, 5.5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, -5.5);
      ctx.closePath();
      ctx.stroke();
      if (thrust) {
        var flick = reduced() ? 8 : 7 + (Math.floor(now / 40) % 3);
        ctx.fillStyle = '#ffb15a';
        ctx.beginPath();
        ctx.moveTo(-5, 2.2);
        ctx.lineTo(-flick - 6, 0);
        ctx.lineTo(-5, -2.2);
        ctx.fill();
      }
    });
  }
  function drawAttractShard(ctx, now) {
    var rot = reduced() ? 0.4 : now / 900;
    var verts = [];
    var i;
    for (i = 0; i < 7; i++) {
      var ang = (i / 7) * Math.PI * 2;
      var rad = 18 * (0.75 + (i % 2) * 0.25);
      verts.push(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.save();
    ctx.translate(W / 2, 78);
    ctx.strokeStyle = '#9db4ff';
    strokeVerts(ctx, verts, rot);
    ctx.restore();
  }
  function drawWorld(ctx, now) {
    ctx.fillStyle = '#070910';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9d4ea';
    stars.forEach(function (star) {
      ctx.globalAlpha = star.a;
      ctx.fillRect(star.x, star.y, 1, 1);
    });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (run) {
      run.rocks.forEach(function (rock) {
        ctx.strokeStyle = rock.flash > 0 ? '#ffffff' : (rock.size === 1 ? '#ffd59a' : (rock.size === 2 ? '#b7c6ff' : '#d7fff6'));
        withWrap(ctx, rock.x, rock.y, rock.r + 2, function () {
          strokeVerts(ctx, rock.verts, rock.rot);
        });
      });
      if (run.buoy && run.buoy.hp > 0) {
        ctx.strokeStyle = run.buoy.flash > 0 ? '#fff6d8' : '#ffb15a';
        withWrap(ctx, run.buoy.x, run.buoy.y, 10, function () {
          ctx.beginPath();
          var s;
          for (s = 0; s < 6; s++) {
            var a = (reduced() ? 0.2 : now / 700) + (s / 6) * Math.PI * 2;
            var px = Math.cos(a) * 8;
            var py = Math.sin(a) * 8;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        });
      }
      ctx.strokeStyle = '#f4fff8';
      run.shots.forEach(function (b) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
        ctx.stroke();
      });
      ctx.strokeStyle = '#ff7a59';
      run.foes.forEach(function (b) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.stroke();
      });
      ctx.strokeStyle = run.ship.inv > 0 ? '#fff6d8' : '#d7fff6';
      drawShip(ctx, run.ship, run.thrusting, now);
      var k = kit();
      if (k) k.drawParticles(ctx);
      ctx.textAlign = 'center';
      ctx.font = '700 8px ui-monospace, monospace';
      run.pops.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / 0.7);
        ctx.fillStyle = '#d7fff6';
        ctx.fillText(p.text, p.x, p.y);
      });
      ctx.globalAlpha = 1;
      if (run.banner && run.banner.t > 0) {
        ctx.globalAlpha = Math.min(1, run.banner.t * 2);
        ctx.fillStyle = '#f4fff8';
        ctx.font = '700 13px ui-monospace, monospace';
        ctx.fillText(run.banner.text, W / 2, H / 2);
        ctx.globalAlpha = 1;
      }
      if (run.flash > 0) {
        if (reduced()) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(2, 2, W - 4, H - 4);
        } else {
          ctx.fillStyle = 'rgba(215,255,246,' + Math.min(0.35, run.flash * 2.2) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }
    } else {
      drawAttractShard(ctx, now);
      ctx.strokeStyle = '#d7fff6';
      drawShip(ctx, { x: W / 2, y: 230, a: -Math.PI / 2 + (reduced() ? 0 : Math.sin(now / 800) * 0.4), inv: 0 }, false, now);
    }
  }
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard < 5) {
      var scaled = STEP;
      var k = kit();
      if (k) scaled = k.timeScale(STEP);
      stepStars(scaled);
      if (phase === 'play') stepPlay(scaled);
      if (k) k.stepParticles(scaled);
      acc -= STEP;
      guard += 1;
    }
    if (phase !== 'play' && phase !== 'pause') paintHud('Best ' + bestScore());
    syncViewport();
    var fit = fitCanvas();
    if (fit) {
      var ctx = fit.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, screen.width, screen.height);
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(fit.s, 0, 0, fit.s, 0, 0);
      var shake = kit() ? kit().shakeOffset() : { x: 0, y: 0 };
      ctx.translate(shake.x, shake.y);
      drawWorld(ctx, now);
    }
    raf = window.requestAnimationFrame(frame);
  }

  function hold(el, down, up) {
    function press(ev) {
      if (ev.button && ev.button !== 0) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
      down();
    }
    function release() { up(); }
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  $('start').addEventListener('click', startGame);
  $('openScores').addEventListener('click', browseScores);
  $('scoresBtn').addEventListener('click', function () {
    if (phase === 'play') pauseScores();
    else if (phase === 'pause') resumeGame();
    else if (phase === 'attract') browseScores();
  });
  resumeBtn.addEventListener('click', resumeGame);
  againBtn.addEventListener('click', startGame);
  endBtn.addEventListener('click', function () {
    if (phase !== 'pause') return;
    phase = 'play';
    if (run) run.ship.lives = 0;
    gameOver();
  });
  backBtn.addEventListener('click', backTitle);
  scoreForm.addEventListener('submit', saveScore);
  initials.addEventListener('input', function () {
    var next = cleanName(initials.value);
    if (initials.value !== next) initials.value = next;
  });
  muteBtn.addEventListener('click', function () {
    if (audible()) soundOn = false;
    else {
      soundOn = true;
      if (siteMuted() && window.MONDO_AUDIO && MONDO_AUDIO.setMuted) MONDO_AUDIO.setMuted(false);
      var k = kit();
      if (k && k.unlock) k.unlock();
      ac();
    }
    store.sound = soundOn;
    saveStore();
    syncMute();
    if (audible()) tone(660, 0.06, 'triangle', 0.04);
  });
  crtBtn.addEventListener('click', function () {
    store.crt = !store.crt;
    saveStore();
    syncCrt();
  });
  document.addEventListener('mondo-audio', syncMute);
  hold($('rotL'), function () { input.padLeft = true; }, function () { input.padLeft = false; });
  hold($('rotR'), function () { input.padRight = true; }, function () { input.padRight = false; });
  hold($('thrust'), function () { input.padThrust = true; }, function () { input.padThrust = false; });
  hold($('fire'), function () { input.padFire = true; }, function () { input.padFire = false; });
  screen.addEventListener('pointerdown', function (ev) {
    if (phase !== 'play' || pointerId != null) return;
    pointerId = ev.pointerId;
    try { screen.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    var p = toLogical(ev);
    input.drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
    ev.preventDefault();
  });
  screen.addEventListener('pointermove', function (ev) {
    if (ev.pointerId !== pointerId || !input.drag) return;
    var p = toLogical(ev);
    if (Math.hypot(p.x - input.drag.sx, p.y - input.drag.sy) > 4) input.drag.moved = true;
    input.drag.x = p.x;
    input.drag.y = p.y;
  });
  function endDrag(ev) {
    if (ev.pointerId !== pointerId) return;
    if (input.drag && !input.drag.moved) input.tapFire = true;
    pointerId = null;
    input.drag = null;
  }
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', function (ev) {
    if (typing()) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { ev.preventDefault(); input.keyLeft = true; }
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { ev.preventDefault(); input.keyRight = true; }
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') { ev.preventDefault(); input.keyUp = true; }
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') { ev.preventDefault(); input.keyDown = true; }
    if (ev.key === ' ' || ev.key === 'Enter') {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'BUTTON' || tag === 'A') return;
      ev.preventDefault();
      if (phase === 'attract') startGame();
      else if (phase === 'play') input.keyFire = true;
      else if (phase === 'pause' && ev.key === 'Enter') resumeGame();
    }
    if (ev.key === 'm' || ev.key === 'M') { ev.preventDefault(); muteBtn.click(); }
    if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); crtBtn.click(); }
    if (ev.key === 'Escape') {
      if (phase === 'play') pauseScores();
      else if (phase === 'pause') resumeGame();
      else if (phase === 'scores' || phase === 'over') backTitle();
    }
    if (ev.key === 'p' || ev.key === 'P') {
      if (phase === 'play') pauseScores();
      else if (phase === 'pause') resumeGame();
    }
  });
  window.addEventListener('keyup', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') input.keyLeft = false;
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') input.keyRight = false;
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') input.keyUp = false;
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') input.keyDown = false;
    if (ev.key === ' ' || ev.key === 'Enter') input.keyFire = false;
  });
  window.addEventListener('blur', function () { input = blankInput(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    } else if (!raf) {
      raf = window.requestAnimationFrame(frame);
    }
  });

  syncMute();
  syncCrt();
  syncViewport();
  show('title');
  paintHud('Best ' + bestScore());
  renderBoard();
  window.addEventListener('resize', syncViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  raf = window.requestAnimationFrame(frame);
  setTimeout(syncViewport, 0);
  setTimeout(syncViewport, 80);
})();
