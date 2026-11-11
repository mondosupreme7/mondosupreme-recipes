/* Shared game feedback: sound, shake, hit-stop, particles, confetti.
   Motion follows prefers-reduced-motion. Sound does not. */
(function (global) {
  'use strict';
  var AC = global.AudioContext || global.webkitAudioContext;
  var audio = null;
  var parts = [];
  var shakeMag = 0;
  var shakeUntil = 0;
  var shakeFrom = 0;
  var shakeFor = 1;
  var hitUntil = 0;

  function reduced() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function siteMuted() {
    return !!(global.MONDO_AUDIO && global.MONDO_AUDIO.muted && global.MONDO_AUDIO.muted());
  }
  function unlock() {
    if (!AC) return null;
    try {
      if (!audio) audio = new AC();
      if (audio.state === 'suspended' && audio.resume) audio.resume();
    } catch (e) { return null; }
    return audio;
  }
  function play(name, opts) {
    opts = opts || {};
    if (opts.localOn === false || siteMuted() || global.document.hidden) return;
    var ctx = unlock();
    if (!ctx) return;
    var preset = {
      hit: ['square', 620, 0.05, 0.05],
      coin: ['square', 880, 0.06, 0.05],
      break: ['square', 680, 0.045, 0.05],
      hurt: ['sawtooth', 90, 0.18, 0.06],
      launch: ['square', 440, 0.07, 0.05],
      win: ['square', 523, 0.14, 0.055],
      click: ['square', 300, 0.03, 0.04],
      power: ['square', 840, 0.08, 0.05]
    }[name] || ['square', 440, 0.05, 0.045];
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = opts.type || preset[0];
      osc.frequency.value = opts.pitch || preset[1];
      osc.connect(gain);
      gain.connect(ctx.destination);
      var t = ctx.currentTime;
      var dur = opts.dur || preset[2];
      var vol = opts.vol || preset[3];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, dur));
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  function shake(amount, ms) {
    if (reduced()) return;
    var now = global.performance.now();
    shakeMag = Math.max(shakeMag * (shakeUntil > now ? 1 : 0), amount || 4);
    shakeFor = ms || 160;
    shakeFrom = now;
    shakeUntil = now + shakeFor;
  }
  function shakeOffset() {
    var now = global.performance.now();
    if (reduced() || now >= shakeUntil) return { x: 0, y: 0 };
    var u = 1 - (now - shakeFrom) / shakeFor;
    var m = shakeMag * Math.max(0, u);
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  }
  function hitstop(ms) {
    if (reduced()) return;
    hitUntil = Math.max(hitUntil, global.performance.now() + (ms || 90));
  }
  function timeScale(dt) {
    if (global.performance.now() < hitUntil) return 0;
    return dt;
  }
  function burst(x, y, opts) {
    if (reduced()) return;
    opts = opts || {};
    var n = opts.n || 8;
    var color = opts.color || '#fff';
    var speed = opts.speed || 90;
    var life = opts.life || 0.4;
    var grav = opts.gravity == null ? 200 : opts.gravity;
    var i, a, s, p;
    for (i = 0; i < n; i++) {
      a = Math.random() * Math.PI * 2;
      s = speed * (0.45 + Math.random() * 0.7);
      p = null;
      for (var k = 0; k < parts.length; k++) if (parts[k].life <= 0) { p = parts[k]; break; }
      if (!p) {
        if (parts.length > 200) return;
        p = {};
        parts.push(p);
      }
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = life * (0.7 + Math.random() * 0.5);
      p.max = p.life;
      p.color = typeof color === 'string' ? color : color[i % color.length];
      p.g = grav;
      p.size = opts.size || 3;
    }
  }
  function stepParticles(dt) {
    var i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  function drawParticles(ctx) {
    var i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  function vibrate(pattern) {
    if (reduced()) return;
    try { if (global.navigator && global.navigator.vibrate) global.navigator.vibrate(pattern || 12); } catch (e) {}
  }
  function confetti() {
    if (reduced()) return;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = global.innerWidth;
    var h = global.innerHeight;
    var box = global.document.createElement('canvas');
    box.width = Math.max(1, Math.round(w * dpr));
    box.height = Math.max(1, Math.round(h * dpr));
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none';
    global.document.body.appendChild(box);
    var g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var bits = [];
    var colors = ['#0f766e', '#1d4ed8', '#b45309', '#be123c', '#f8fafc'];
    var i;
    for (i = 0; i < 80; i++) {
      bits.push({
        x: Math.random() * w,
        y: -12 - Math.random() * 80,
        v: 2.2 + Math.random() * 3.4,
        c: colors[i % colors.length],
        s: 4 + Math.random() * 4
      });
    }
    var frame = 0;
    function tick() {
      g.clearRect(0, 0, w, h);
      bits.forEach(function (bit) {
        bit.y += bit.v;
        g.fillStyle = bit.c;
        g.fillRect(bit.x, bit.y, bit.s, bit.s * 0.55);
      });
      frame += 1;
      if (frame < 70) global.requestAnimationFrame(tick);
      else if (box.parentNode) box.parentNode.removeChild(box);
    }
    tick();
  }
  function dprOf() {
    return Math.min(global.devicePixelRatio || 1, 3);
  }
  function backing(canvas, cssW, cssH) {
    var dpr = dprOf();
    var bw = Math.max(1, Math.round(cssW * dpr));
    var bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  /* Letterbox a fixed-resolution canvas inside its box. Drawing stays in logical pixels. */
  function placeCanvas(canvas, logicalW, logicalH, box) {
    var host = box || canvas.parentElement;
    if (host && host.clientWidth >= 16 && host.clientHeight >= 16) {
      var scale = Math.min(host.clientWidth / logicalW, host.clientHeight / logicalH);
      var cssW = Math.max(1, Math.floor(logicalW * scale));
      var cssH = Math.max(1, Math.floor(logicalH * scale));
      if (canvas._mjW !== cssW || canvas._mjH !== cssH) {
        canvas._mjW = cssW;
        canvas._mjH = cssH;
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
    }
    return backing(canvas, logicalW, logicalH);
  }
  /* Sharpen a canvas that already fills its CSS box (the world is drawn in CSS pixels). */
  function sharpCanvas(canvas, cssW, cssH) {
    var rect = canvas.getBoundingClientRect();
    var w = cssW || Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
    var h = cssH || Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
    backing(canvas, w, h);
    return { w: w, h: h };
  }

  global.MONDO_JUICE = {
    play: play,
    unlock: unlock,
    siteMuted: siteMuted,
    shake: shake,
    shakeOffset: shakeOffset,
    hitstop: hitstop,
    timeScale: timeScale,
    burst: burst,
    stepParticles: stepParticles,
    drawParticles: drawParticles,
    vibrate: vibrate,
    confetti: confetti,
    placeCanvas: placeCanvas,
    sharpCanvas: sharpCanvas,
    reduced: reduced
  };
})(window);
