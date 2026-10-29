/* Home-page 90s toys. Sound starts only from a tap and follows the site mute switch. */
(function () {
  'use strict';
  var POG_KEY = 'mondosupreme.pogs.v1';
  var FORTUNES = [
    'Outlook good, like a cleared inbox.',
    'Ask again after the modem finishes.',
    'All signs point to Netscape.',
    'Reply hazy, try a floppy.',
    'You have got mail.',
    'The stars say: save your work.',
    'Cannot predict now. Y2K is fine.',
    'It is decidedly so, dude.',
    'Don\'t count on it. The tray is full.',
    'Yes. The lava is flowing.'
  ];
  var modemCtx = null;
  var modemTimer = 0;

  function muted() {
    return document.documentElement.getAttribute('data-muted') === '1';
  }
  function readPogs() {
    try { return JSON.parse(localStorage.getItem(POG_KEY) || '{"n":0}') || { n: 0 }; }
    catch (e) { return { n: 0 }; }
  }
  function paintPogs() {
    var node = document.getElementById('pogCount');
    var n = readPogs().n || 0;
    if (node) node.textContent = String(n);
    var btn = document.getElementById('pogBtn');
    if (btn) btn.style.transform = 'rotate(' + ((n % 8) * 8 - 16) + 'deg)';
  }
  function stopModem() {
    clearTimeout(modemTimer);
    modemTimer = 0;
    if (modemCtx) {
      try { modemCtx.close(); } catch (e) { /* already closed */ }
      modemCtx = null;
    }
  }
  function tone(ctx, freq, start, dur, type, level) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level || 0.04, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  function connectModem() {
    var status = document.getElementById('dialStatus');
    var banner = document.getElementById('mailBanner');
    if (banner) banner.hidden = true;
    stopModem();
    if (status) status.textContent = 'Dialing the network…';
    if (muted()) {
      if (status) status.textContent = 'Connected at 56000 bps. Sound is muted.';
      if (banner) banner.hidden = false;
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      if (status) status.textContent = 'Connected at 56000 bps.';
      if (banner) banner.hidden = false;
      return;
    }
    modemCtx = new AC();
    var ctx = modemCtx;
    var t = ctx.currentTime + 0.05;
    tone(ctx, 350, t, 0.35, 'sine', 0.03);
    tone(ctx, 440, t, 0.35, 'sine', 0.025);
    t += 0.45;
    var i;
    for (i = 0; i < 6; i++) {
      tone(ctx, 900 + i * 90, t, 0.05, 'square', 0.03);
      t += 0.1;
    }
    if (status) status.textContent = 'Handshaking v.90…';
    tone(ctx, 2100, t, 0.28, 'sine', 0.04);
    t += 0.32;
    var noise = ctx.createBufferSource();
    var buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (i % 90 < 40 ? 0.35 : 0.04);
    noise.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2800, t + 0.8);
    var gain = ctx.createGain();
    gain.gain.value = 0.07;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.9);
    t += 0.95;
    tone(ctx, 880, t, 0.1, 'square', 0.04);
    tone(ctx, 1174, t + 0.12, 0.18, 'square', 0.04);
    var wait = Math.max(400, (t + 0.4 - ctx.currentTime) * 1000);
    modemTimer = setTimeout(function () {
      if (status) status.textContent = 'Connected at 56000 bps.';
      if (banner) banner.hidden = false;
      stopModem();
    }, wait);
  }
  function showEight(result, animate) {
    var read = document.getElementById('eightRead');
    var line = document.getElementById('eightAnswer');
    var ball = document.getElementById('eightBtn');
    if (ball && animate) {
      ball.classList.remove('is-shaking');
      void ball.offsetWidth;
      ball.classList.add('is-shaking');
    }
    if (ball) ball.classList.toggle('is-open', !!(result && result.text));
    if (read) read.textContent = result && result.text ? '▲' : '8';
    if (line) line.textContent = result && result.text ? result.text : 'Shake or tap for a 90s fortune.';
  }
  function shake() {
    var result;
    if (window.MONDO_ORACLE) result = window.MONDO_ORACLE.quick();
    else result = { text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)] };
    showEight(result, true);
  }
  function addPog() {
    var data = readPogs();
    data.n = Math.min(9999, (data.n || 0) + 1);
    try { localStorage.setItem(POG_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
    paintPogs();
  }
  function showBsod() {
    var screen = document.getElementById('bsod');
    if (!screen) {
      screen = document.createElement('div');
      screen.id = 'bsod';
      screen.className = 'bsod';
      screen.setAttribute('role', 'dialog');
      screen.setAttribute('aria-label', 'Desktop blue screen');
      var pre = document.createElement('pre');
      pre.textContent = 'Desktop\n\nA fatal exception 0E has occurred at 0028:C0011E36 in VxD VMM(01) +\n00010E36. The current application will be terminated.\n\n*  Press any key / tap anywhere to return to Mondosupreme\n\nPress any key to continue _';
      screen.appendChild(pre);
      document.body.appendChild(screen);
      screen.addEventListener('click', function () { screen.hidden = true; });
    }
    screen.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    function onKey(event) {
      screen.hidden = true;
      document.removeEventListener('keydown', onKey);
      if (event && event.preventDefault) event.preventDefault();
    }
    document.addEventListener('keydown', onKey);
  }
  function paintFx() {
    var fx = window.MONDO_FX && window.MONDO_FX.get ? window.MONDO_FX.get() : { scan: 0, stars: 0 };
    var scan = document.getElementById('toyScan');
    var stars = document.getElementById('toyStars');
    if (scan) scan.setAttribute('aria-pressed', fx.scan ? 'true' : 'false');
    if (stars) stars.setAttribute('aria-pressed', fx.stars ? 'true' : 'false');
  }
  function openHash() {
    var hash = location.hash;
    var map = { '#dialup': 'toyDial', '#eight': 'toyEight', '#lava': 'toyLava', '#pogs': 'toyPogs', '#bsod': 'toyBsod', '#toys': 'toys' };
    var id = map[hash];
    if (!id) return;
    var node = document.getElementById(id);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center' });
    if (hash === '#eight') shake();
    if (hash === '#bsod') showBsod();
  }
  function boot() {
    if (!document.getElementById('toys')) return;
    paintPogs();
    paintFx();
    if (window.MONDO_ORACLE) showEight(window.MONDO_ORACLE.load().last, false);
    var dial = document.getElementById('dialBtn');
    if (dial) dial.addEventListener('click', connectModem);
    var eight = document.getElementById('eightBtn');
    if (eight) eight.addEventListener('click', shake);
    var pog = document.getElementById('pogBtn');
    if (pog) pog.addEventListener('click', addPog);
    var bsod = document.getElementById('bsodBtn');
    if (bsod) bsod.addEventListener('click', showBsod);
    var scan = document.getElementById('toyScan');
    if (scan) scan.addEventListener('click', function () {
      if (!window.MONDO_FX) return;
      var fx = window.MONDO_FX.get();
      window.MONDO_FX.set({ scan: fx.scan ? 0 : 1 });
    });
    var stars = document.getElementById('toyStars');
    if (stars) stars.addEventListener('click', function () {
      if (!window.MONDO_FX) return;
      var fx = window.MONDO_FX.get();
      window.MONDO_FX.set({ stars: fx.stars ? 0 : 1 });
    });
    document.addEventListener('mondo-fx', paintFx);
    document.addEventListener('mondo-audio', function (event) {
      if (event.detail && event.detail.muted) stopModem();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopModem();
    });
    window.addEventListener('hashchange', openHash);
    openHash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
