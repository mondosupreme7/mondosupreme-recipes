/* Saltflare — a night-marsh formation shooter. Pixel art and synth live in this file. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.saltflare.v1';
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

  for (i = 0; i < 26; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: Math.random() < 0.18 ? 2 : 1,
      v: 8 + Math.random() * 14,
      a: 0.35 + Math.random() * 0.65
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
      keyLeft: false, keyRight: false, keyFire: false,
      padLeft: false, padRight: false, drag: null
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
      filter.type = 'highpass';
      filter.frequency.value = 700;
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
    var ctx = screen.getContext('2d');
    return { ctx: ctx, s: (cssW / W) * dpr };
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
      if (freshName && row.name === freshName && row.score === (run ? run.score : row.score) && index === store.scores.indexOf(row)) {
        li.className = 'is-new';
      }
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
  function popup(text, x, y) {
    run.pops.push({ text: text, x: x, y: y, life: 0.75 });
    if (run.pops.length > 10) run.pops.shift();
  }
  function burst(x, y, color) {
    var k = kit();
    if (!k) return;
    k.burst(x, y, { n: 8, color: color || ['#ffb15a', '#fff4d2', '#ff5d73'], speed: 80, life: 0.38, gravity: 30, size: 2 });
  }

  function newRun() {
    return {
      ship: { x: W / 2, y: H - 26, lives: 3, inv: 1.15 },
      shots: [], foes: [], drops: [], pops: [], moths: [],
      boss: null, wave: 0, score: 0, cool: 0.25, flash: 0, rapid: 0,
      combo: 0, comboT: 0, grace: 1.5, diveIn: 3, shotIn: 1, clearT: 0,
      pending: false, banner: null, nextLife: 5000,
      ox: 30, oy: 36, dir: 1, cols: 5
    };
  }
  function beginWave(n) {
    var cols = n >= 3 ? 6 : 5;
    var rows = n === 1 ? 3 : Math.min(4, n + 1);
    var gapX = cols === 6 ? 24 : 28;
    run.wave = n;
    run.cols = cols;
    run.boss = null;
    run.moths = [];
    run.pending = false;
    run.clearT = 0;
    run.ox = (W - (cols - 1) * gapX) / 2;
    run.oy = 34;
    run.dir = 1;
    run.grace = n === 1 ? 1.5 : 0.4;
    run.diveIn = n === 1 ? 6 : Math.max(0.85, 2.3 - n * 0.18);
    run.shotIn = 0.45;
    run.ship.inv = Math.max(run.ship.inv, n === 1 ? 1.15 : 0.65);
    run.banner = { text: 'WAVE ' + n, t: 1.05 };
    if (n % 4 === 0) {
      run.moths = [];
      run.boss = { x: W / 2, y: 42, hp: 8 + n, max: 8 + n, dir: 1, cool: 0.7, flash: 0 };
      run.banner.text = 'LANTERN';
      say('Lantern barge. Wave ' + n);
      return;
    }
    var r, c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        run.moths.push({ c: c, r: r, x: 0, y: 0, alive: true, diving: false, diveT: 0, sx: 0, sy: 0, shot: false, flash: 0 });
      }
    }
    layout();
    say('Wave ' + n);
  }
  function gapX() { return run.cols >= 6 ? 24 : 28; }
  function layout() {
    var g = gapX();
    run.moths.forEach(function (m) {
      if (!m.alive || m.diving) return;
      m.x = run.ox + m.c * g;
      m.y = run.oy + m.r * 18;
    });
  }
  function bounds() {
    var min = 999;
    var max = -999;
    var any = false;
    run.moths.forEach(function (m) {
      if (!m.alive || m.diving) return;
      any = true;
      if (m.x < min) min = m.x;
      if (m.x > max) max = m.x;
    });
    return any ? { min: min, max: max } : null;
  }
  function aliveCount() {
    var n = 0;
    run.moths.forEach(function (m) { if (m.alive) n += 1; });
    return n;
  }
  function award(points, x, y, label) {
    if (run.comboT > 0) run.combo += 1;
    else run.combo = 1;
    run.comboT = 1.05;
    var gain = points * Math.min(4, run.combo);
    run.score += gain;
    popup((run.combo > 1 ? 'x' + run.combo + ' ' : '') + '+' + gain, x, y - 6);
    if (label) popup(label, x, y + 8);
    if (run.score >= run.nextLife) {
      run.ship.lives = Math.min(5, run.ship.lives + 1);
      run.nextLife += 5000;
      popup('1UP', run.ship.x, run.ship.y - 16);
      tone(523, 0.08, 'square', 0.045, 0);
      tone(784, 0.1, 'square', 0.04, 0.08);
      say('Extra life. Score ' + run.score);
    }
  }
  function markClear(text) {
    run.pending = true;
    run.clearT = 0.9;
    run.banner = { text: text, t: 0.9 };
    run.shots = [];
    run.foes = [];
    var bonus = 120 * run.wave;
    run.score += bonus;
    popup('+' + bonus, W / 2, H / 2 - 16);
    burst(W / 2, 70, ['#ffb15a', '#fff4d2', '#7ee0c8']);
    var k = kit();
    if (k) {
      k.shake(2.2, 150);
      k.vibrate([10, 24, 10]);
    }
    tone(392, 0.08, 'square', 0.04, 0);
    tone(523, 0.09, 'square', 0.04, 0.09);
    tone(784, 0.12, 'triangle', 0.04, 0.18);
    say(text + '. Score ' + run.score);
  }
  function hurt() {
    if (!run || phase !== 'play' || run.ship.inv > 0) return;
    run.ship.lives -= 1;
    run.ship.inv = 1.55;
    run.flash = reduced() ? 0.2 : 0.12;
    run.combo = 0;
    run.comboT = 0;
    noise(0.16, 0.07);
    tone(96, 0.18, 'sawtooth', 0.05);
    var k = kit();
    if (k) {
      k.shake(5, 200);
      k.hitstop(80);
      k.vibrate([16, 30, 16]);
    }
    if (run.ship.lives <= 0) {
      gameOver();
      return;
    }
    say('Hull hit. ' + run.ship.lives + (run.ship.lives === 1 ? ' life' : ' lives') + ' left');
  }
  function shoot() {
    if (run.shots.length >= 4) return;
    run.shots.push({ x: run.ship.x, y: run.ship.y - 10, vy: -255 });
    tone(run.rapid > 0 ? 1040 : 820, 0.03, 'square', 0.026);
  }
  function killMoth(m) {
    if (!m.alive) return;
    m.alive = false;
    var pts = m.diving ? 100 : 50;
    award(pts, m.x, m.y);
    burst(m.x, m.y);
    tone(560, 0.035, 'square', 0.035);
    tone(780, 0.05, 'triangle', 0.028, 0.03);
    if (run.wave > 1 && Math.random() < 0.14) {
      var type = run.ship.lives < 3 && Math.random() < 0.4 ? 'life' : 'rapid';
      run.drops.push({ x: m.x, y: m.y, vy: 42, type: type });
    }
  }
  function startDive() {
    var pool = run.moths.filter(function (m) { return m.alive && !m.diving; });
    if (!pool.length) return;
    pool.sort(function (a, b) { return b.r - a.r || Math.abs(a.x - run.ship.x) - Math.abs(b.x - run.ship.x); });
    var m = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
    m.diving = true;
    m.diveT = 0;
    m.sx = m.x;
    m.sy = m.y;
    m.shot = false;
    tone(240, 0.08, 'sawtooth', 0.03);
  }

  function stepStars(dt) {
    if (reduced()) return;
    stars.forEach(function (star) {
      star.y += star.v * dt;
      if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
    });
  }
  function stepPlay(dt) {
    var ship = run.ship;
    var k = kit();
    ship.inv = Math.max(0, ship.inv - dt);
    run.flash = Math.max(0, run.flash - dt);
    run.rapid = Math.max(0, run.rapid - dt);
    run.comboT = Math.max(0, run.comboT - dt);
    if (run.comboT <= 0) run.combo = 0;
    if (run.grace > 0) run.grace -= dt;
    if (run.banner) {
      run.banner.t -= dt;
      if (run.banner.t <= 0) run.banner = null;
    }
    run.pops.forEach(function (p) { p.life -= dt; p.y -= 16 * dt; });
    run.pops = run.pops.filter(function (p) { return p.life > 0; });
    run.moths.forEach(function (m) { m.flash = Math.max(0, m.flash - dt); });

    if (run.pending) {
      run.clearT -= dt;
      if (run.clearT <= 0) beginWave(run.wave + 1);
    }

    if (input.drag) ship.x += (input.drag.x - ship.x) * Math.min(1, dt * 16);
    else {
      var v = 150;
      if (input.keyLeft || input.padLeft) ship.x -= v * dt;
      if (input.keyRight || input.padRight) ship.x += v * dt;
    }
    ship.x = clamp(ship.x, 12, W - 12);

    var rate = run.rapid > 0 ? 0.09 : 0.2;
    if (input.keyFire) rate *= 0.8;
    run.cool -= dt;
    if (phase === 'play' && run.cool <= 0) {
      run.cool = rate;
      shoot();
    }

    run.shots.forEach(function (b) { b.y += b.vy * dt; });
    run.shots = run.shots.filter(function (b) { return b.y > -8; });
    run.foes.forEach(function (b) {
      b.y += b.vy * dt;
      b.x += (b.vx || 0) * dt;
    });
    run.foes = run.foes.filter(function (b) { return b.y < H + 8 && b.x > -10 && b.x < W + 10; });
    var keptDrops = [];
    run.drops.forEach(function (d) {
      d.y += d.vy * dt;
      if (d.y > H + 8) return;
      if (Math.abs(d.x - ship.x) < 12 && Math.abs(d.y - ship.y) < 12) {
        if (d.type === 'life') {
          ship.lives = Math.min(5, ship.lives + 1);
          popup('LIFE', d.x, d.y);
          tone(660, 0.08, 'square', 0.04);
        } else {
          run.rapid = 6;
          popup('RAPID', d.x, d.y);
          tone(880, 0.07, 'square', 0.04);
        }
        burst(d.x, d.y, ['#fff4d2', '#7ee0c8']);
        return;
      }
      keptDrops.push(d);
    });
    run.drops = keptDrops;

    if (phase !== 'play' || run.pending) {
      paintHud(hudText());
      return;
    }

    if (run.boss) {
      var boss = run.boss;
      boss.flash = Math.max(0, boss.flash - dt);
      boss.x += boss.dir * (36 + run.wave * 4) * dt;
      if (boss.x < 24) { boss.x = 24; boss.dir = 1; }
      if (boss.x > W - 24) { boss.x = W - 24; boss.dir = -1; }
      boss.cool -= dt;
      if (run.grace <= 0 && boss.cool <= 0 && run.foes.length < 4) {
        boss.cool = Math.max(0.55, 1.05 - run.wave * 0.04);
        run.foes.push({ x: boss.x - 8, y: boss.y + 8, vy: 62 + run.wave * 4, vx: -18 });
        run.foes.push({ x: boss.x + 8, y: boss.y + 8, vy: 62 + run.wave * 4, vx: 18 });
        tone(160, 0.05, 'square', 0.03);
      }
    } else if (run.moths.length) {
      var total = run.moths.length;
      var alive = aliveCount();
      var speed = (18 + run.wave * 4) * (0.8 + (total - alive) / Math.max(1, total) * 0.9);
      run.ox += run.dir * speed * dt;
      layout();
      var box = bounds();
      if (box && box.max > W - 12 && run.dir > 0) { run.dir = -1; run.oy += 12; layout(); }
      else if (box && box.min < 12 && run.dir < 0) { run.dir = 1; run.oy += 12; layout(); }
      var low = false;
      run.moths.forEach(function (m) {
        if (m.alive && !m.diving && m.y > H - 70) low = true;
      });
      if (low) {
        hurt();
        run.oy = 36;
        layout();
      }
      run.diveIn -= dt;
      if (run.grace <= 0 && run.diveIn <= 0) {
        run.diveIn = Math.max(0.85, 3.2 - run.wave * 0.32);
        startDive();
      }
      run.shotIn -= dt;
      if (run.grace <= 0 && run.shotIn <= 0 && run.foes.length < 3) {
        run.shotIn = Math.max(0.75, 2.15 - run.wave * 0.18);
        var pool = run.moths.filter(function (m) { return m.alive && !m.diving; });
        if (pool.length) {
          pool.sort(function (a, b) { return Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x); });
          var shooter = pool[0];
          run.foes.push({ x: shooter.x, y: shooter.y + 6, vy: 50 + run.wave * 7, vx: 0 });
          tone(170, 0.05, 'square', 0.025);
        }
      }
      run.moths.forEach(function (m) {
        if (!m.alive || !m.diving) return;
        m.diveT += dt;
        m.x = m.sx + Math.sin(m.diveT * 5) * 26 + (ship.x - m.sx) * Math.min(0.8, m.diveT * 0.32);
        m.y = m.sy + m.diveT * (76 + run.wave * 7);
        if (!m.shot && m.diveT > 0.42 && run.foes.length < 4) {
          m.shot = true;
          var vx = clamp((ship.x - m.x) * 0.45, -32, 32);
          run.foes.push({ x: m.x, y: m.y, vy: 68, vx: vx });
        }
        if (m.y > H + 10) m.diving = false;
      });
    }

    if (phase !== 'play') return;

    run.shots.forEach(function (b) {
      if (b.y < -4) return;
      var hit = false;
      run.moths.forEach(function (m) {
        if (hit || !m.alive) return;
        if (Math.abs(b.x - m.x) < 9 && Math.abs(b.y - m.y) < 8) {
          m.flash = 0.08;
          killMoth(m);
          b.y = -20;
          hit = true;
          if (k) k.shake(1.2, 80);
        }
      });
      if (!hit && run.boss && run.boss.hp > 0) {
        var boss = run.boss;
        if (Math.abs(b.x - boss.x) < 18 && Math.abs(b.y - boss.y) < 10) {
          boss.hp -= 1;
          boss.flash = 0.08;
          b.y = -20;
          award(30, boss.x, boss.y);
          burst(b.x, boss.y, ['#fff4d2', '#ffb15a']);
          tone(640, 0.03, 'square', 0.03);
          if (boss.hp <= 0) {
            burst(boss.x, boss.y, ['#fff6d8', '#ff5d73', '#ffb15a']);
            if (k) k.hitstop(70);
            markClear('LANTERN DOWN');
          }
        }
      }
    });
    run.shots = run.shots.filter(function (b) { return b.y > -8; });

    if (phase !== 'play' || run.pending) {
      paintHud(hudText());
      return;
    }

    run.foes.forEach(function (b) {
      if (Math.abs(b.x - ship.x) < 7 && b.y > ship.y - 8 && b.y < ship.y + 8) {
        b.y = H + 40;
        hurt();
      }
    });
    run.moths.forEach(function (m) {
      if (!m.alive) return;
      if (Math.abs(m.x - ship.x) < 9 && Math.abs(m.y - ship.y) < 8) {
        killMoth(m);
        hurt();
      }
    });

    if (phase === 'play' && !run.pending && !run.boss && run.moths.length && aliveCount() === 0) {
      markClear('LINE CLEAR');
    }
    paintHud(hudText());
  }
  function hudText() {
    if (!run || phase === 'attract') return 'Best ' + bestScore();
    var combo = run.combo > 1 ? ' · x' + run.combo : '';
    var rapid = run.rapid > 0 ? ' · RAPID' : '';
    return 'Score ' + run.score + combo + ' · Lives ' + Math.max(0, run.ship.lives) + ' · Wave ' + run.wave + rapid;
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
    say('Saltflare started');
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
    say('Saltflare');
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
    tone(523, 0.07, 'square', 0.04, 0);
    tone(784, 0.09, 'square', 0.035, 0.08);
    say('Saved ' + name + ' with ' + run.score);
  }

  function drawMoth(ctx, m, now) {
    var x = Math.round(m.x);
    var y = Math.round(m.y);
    var flap = reduced() ? 0 : ((Math.floor(now / 150) + (m.c || 0)) % 2 ? -2 : 0);
    var wing = m.flash > 0 ? '#fff6e8' : (m.diving ? '#ff5d73' : (m.r % 2 ? '#ffb15a' : '#ffd089'));
    ctx.fillStyle = wing;
    ctx.fillRect(x - 8, y - 3 + flap, 5, 4);
    ctx.fillRect(x + 3, y - 3 + flap, 5, 4);
    ctx.fillStyle = '#2a120c';
    ctx.fillRect(x - 2, y - 1, 4, 5);
    ctx.fillStyle = '#fff4d2';
    ctx.fillRect(x - 1, y - 3, 1, 1);
    ctx.fillRect(x + 1, y - 3, 1, 1);
  }
  function drawShip(ctx, x, y, inv) {
    x = Math.round(x);
    y = Math.round(y);
    if (inv > 0) {
      ctx.strokeStyle = '#fff4d2';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 11, y - 10, 22, 16);
    }
    ctx.fillStyle = '#e6c27a';
    ctx.fillRect(x - 8, y - 2, 16, 5);
    ctx.fillStyle = '#146e72';
    ctx.fillRect(x - 5, y - 5, 10, 3);
    ctx.fillStyle = '#ffb703';
    ctx.fillRect(x - 1, y - 8, 2, 3);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(x - 1, y - 9, 2, 1);
    ctx.fillStyle = '#8d6840';
    ctx.fillRect(x - 10, y, 3, 3);
    ctx.fillRect(x + 7, y, 3, 3);
  }
  function drawBoss(ctx, b) {
    var x = Math.round(b.x);
    var y = Math.round(b.y);
    ctx.fillStyle = b.flash > 0 ? '#fff6e8' : '#e6c27a';
    ctx.fillRect(x - 18, y - 6, 36, 12);
    ctx.fillStyle = '#146e72';
    ctx.fillRect(x - 12, y - 3, 8, 6);
    ctx.fillRect(x + 4, y - 3, 8, 6);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(x - 2, y - 12, 4, 6);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(x - 1, y - 14, 2, 2);
    ctx.fillStyle = '#ff5d73';
    var pips = Math.min(b.hp, 10);
    var n;
    for (n = 0; n < pips; n++) ctx.fillRect(x - 16 + (n % 8) * 4, y + 8 + Math.floor(n / 8) * 3, 3, 2);
  }
  function drawWorld(ctx, now) {
    ctx.fillStyle = '#0c1220';
    ctx.fillRect(0, 0, W, H);
    var moon = ['011110', '111111', '111110', '111100', '111100', '111110', '111111', '011110'];
    ctx.fillStyle = '#f3e7c5';
    moon.forEach(function (row, y) {
      var x;
      for (x = 0; x < row.length; x++) if (row[x] === '1') ctx.fillRect(12 + x, 14 + y, 1, 1);
    });
    stars.forEach(function (star) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = '#d5e2ff';
      ctx.fillRect(star.x, star.y, star.s, star.s);
    });
    ctx.globalAlpha = 1;
    if (run) {
      run.moths.forEach(function (m) { if (m.alive) drawMoth(ctx, m, now); });
      if (run.boss && run.boss.hp > 0) drawBoss(ctx, run.boss);
      run.drops.forEach(function (d) {
        ctx.fillStyle = d.type === 'life' ? '#7ee0c8' : '#fff4d2';
        ctx.fillRect(d.x - 3, d.y - 4, 6, 8);
        ctx.fillStyle = '#ffb703';
        ctx.fillRect(d.x - 1, d.y - 7, 2, 3);
      });
      ctx.fillStyle = '#fff4d2';
      run.shots.forEach(function (b) { ctx.fillRect(b.x - 1, b.y - 4, 2, 6); });
      ctx.fillStyle = '#ff7a59';
      run.foes.forEach(function (b) { ctx.fillRect(b.x - 1, b.y, 3, 5); });
    } else {
      var sway = reduced() ? 0 : Math.sin(now / 500) * 6;
      var deco = [
        { x: 40 + sway, y: 58, r: 0, c: 0, diving: false, flash: 0 },
        { x: 70 + sway, y: 58, r: 1, c: 1, diving: false, flash: 0 },
        { x: 100 + sway, y: 58, r: 0, c: 2, diving: false, flash: 0 },
        { x: 130 + sway, y: 76, r: 1, c: 3, diving: true, flash: 0 }
      ];
      deco.forEach(function (m) { drawMoth(ctx, m, now); });
    }
    ctx.fillStyle = '#1d4a42';
    [14, 30, 152, 166].forEach(function (x) {
      ctx.fillRect(x, H - 30, 2, 16);
      ctx.fillRect(x - 2, H - 28, 2, 2);
    });
    ctx.fillStyle = '#12343a';
    ctx.fillRect(0, H - 16, W, 4);
    ctx.fillStyle = '#1c5960';
    ctx.fillRect(0, H - 11, W, 2);
    drawShip(ctx, run ? run.ship.x : W / 2, run ? run.ship.y : H - 26, run ? run.ship.inv : 0);
    var k = kit();
    if (k) k.drawParticles(ctx);
    if (run) {
      ctx.textAlign = 'center';
      ctx.font = '700 8px ui-monospace, monospace';
      run.pops.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / 0.75);
        ctx.fillStyle = '#fff4d2';
        ctx.fillText(p.text, p.x, p.y);
      });
      ctx.globalAlpha = 1;
      if (run.banner && run.banner.t > 0) {
        ctx.globalAlpha = Math.min(1, run.banner.t * 2);
        ctx.fillStyle = '#fff6d8';
        ctx.font = '700 14px ui-monospace, monospace';
        ctx.fillText(run.banner.text, W / 2, H / 2);
        ctx.globalAlpha = 1;
      }
      if (run.flash > 0) {
        if (reduced()) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, W - 4, H - 4);
        } else {
          ctx.fillStyle = 'rgba(255,246,232,' + Math.min(0.4, run.flash * 2.4) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }
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
      if (phase === 'play' || phase === 'pause') {
        if (phase === 'play') stepPlay(scaled);
      }
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
      ctx.setTransform(fit.s, 0, 0, fit.s, 0, 0);
      ctx.imageSmoothingEnabled = false;
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
    if (audible()) tone(660, 0.06, 'square', 0.04);
  });
  crtBtn.addEventListener('click', function () {
    store.crt = !store.crt;
    saveStore();
    syncCrt();
  });
  document.addEventListener('mondo-audio', syncMute);
  hold($('left'), function () { input.padLeft = true; }, function () { input.padLeft = false; });
  hold($('right'), function () { input.padRight = true; }, function () { input.padRight = false; });
  screen.addEventListener('pointerdown', function (ev) {
    if (phase !== 'play' || pointerId != null) return;
    pointerId = ev.pointerId;
    try { screen.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    input.drag = toLogical(ev);
    ev.preventDefault();
  });
  screen.addEventListener('pointermove', function (ev) {
    if (ev.pointerId !== pointerId) return;
    input.drag = toLogical(ev);
  });
  function endDrag(ev) {
    if (ev.pointerId !== pointerId) return;
    pointerId = null;
    input.drag = null;
  }
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', function (ev) {
    if (typing()) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { ev.preventDefault(); input.keyLeft = true; }
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { ev.preventDefault(); input.keyRight = true; }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') ev.preventDefault();
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
