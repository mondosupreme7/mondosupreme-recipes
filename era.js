/* Shared 1998 page toys. Graphics are DOM/CSS. Sound stays off until Play. */
(function () {
  var BASE = [
    {
      name: 'canyon.mid',
      tempo: 92,
      wave: 'square',
      notes: [57, 60, 62, 64, 67, 64, 62, 60, 57, 55, 57, 52, 0, 57, 64, 67, 64, 60, 57, 55]
    },
    {
      name: 'passport.mid',
      tempo: 126,
      wave: 'triangle',
      notes: [60, 64, 67, 72, 67, 64, 60, 64, 67, 69, 67, 64, 62, 60, 64, 67]
    },
    {
      name: 'seashore.mid',
      tempo: 72,
      wave: 'sine',
      notes: [60, 64, 67, 72, 76, 72, 67, 64, 67, 72, 76, 79, 76, 72, 67, 60]
    }
  ];
  var TRACKS = BASE.slice();
  var index = 0;
  var ctx = null;
  var master = null;
  var live = [];
  var timer = 0;
  var clockTimer = 0;
  var playing = false;
  var paused = false;
  var volume = 70;
  var startedAt = 0;
  var elapsedHold = 0;
  var loopAt = 0;
  try {
    var savedVol = JSON.parse(localStorage.getItem('mondosupreme.winamp.v1') || 'null');
    if (savedVol && typeof savedVol.volume === 'number') volume = Math.max(0, Math.min(100, savedVol.volume));
  } catch (e) { /* keep the default */ }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function svgGlobe() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('class', 'wire-globe');
    svg.setAttribute('aria-hidden', 'true');
    var parts = [
      '<circle cx="16" cy="16" r="11" fill="none" stroke="#0000ff" stroke-width="1.5"/>',
      '<ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="#ff00cc" stroke-width="1.2"/>',
      '<path d="M5 16h22M7 11h18M7 21h18" fill="none" stroke="#008080" stroke-width="1.2"/>'
    ];
    svg.innerHTML = parts.join('');
    return svg;
  }
  function banner(fill, ink, line1, line2) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 88 31');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', line1 + ' ' + line2);
    var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', '88');
    r.setAttribute('height', '31');
    r.setAttribute('fill', fill);
    r.setAttribute('stroke', '#000');
    svg.appendChild(r);
    [line1, line2].forEach(function (line, i) {
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', '4');
      t.setAttribute('y', i ? '24' : '13');
      t.setAttribute('fill', ink);
      t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif');
      t.setAttribute('font-size', '8');
      t.setAttribute('font-weight', '700');
      t.textContent = line;
      svg.appendChild(t);
    });
    return svg;
  }
  function star() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('class', 'starburst');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('fill', '#ff0');
    p.setAttribute('stroke', '#f00');
    p.setAttribute('stroke-width', '3');
    p.setAttribute('points', '32,2 38,22 60,14 44,30 62,36 42,40 50,60 32,46 14,60 22,40 2,36 20,30 4,14 26,22');
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', '32');
    t.setAttribute('y', '38');
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#f00');
    t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif');
    t.setAttribute('font-size', '11');
    t.textContent = 'NEW!';
    svg.appendChild(p);
    svg.appendChild(t);
    return svg;
  }
  function buildTop() {
    var top = el('div', 'era-top');
    var sky = el('div', 'theme-sky');
    sky.setAttribute('aria-hidden', 'true');
    top.appendChild(sky);
    var row = el('div', 'wordart-row');
    row.appendChild(el('span', 'torch'));
    row.appendChild(el('span', 'theme-sprites theme-sprites-l'));
    var h = el('h1', 'wordart', "~*~ MONDOSUPREME'S CYBER REALM ~*~");
    row.appendChild(h);
    row.appendChild(el('span', 'theme-sprites theme-sprites-r'));
    row.appendChild(el('span', 'torch'));
    top.appendChild(row);
    top.appendChild(el('div', 'rainbow-rule'));
    var toys = el('div', 'era-toys');
    toys.appendChild(svgGlobe());
    var construct = el('div', 'construct');
    construct.appendChild(el('span', 'hazard'));
    var sign = el('span', 'con-sign');
    sign.appendChild(el('i', 'worker'));
    sign.appendChild(document.createTextNode(' UNDER CONSTRUCTION'));
    construct.appendChild(sign);
    construct.appendChild(el('span', 'hazard'));
    toys.appendChild(construct);
    toys.appendChild(star());
    var mail = el('a', 'guestbook', '');
    mail.href = '/#guestbook';
    mail.appendChild(el('span', 'atspin', '@'));
    mail.appendChild(document.createTextNode(' Sign My Guestbook / Email Webmaster'));
    toys.appendChild(mail);
    var box = el('div', 'winamp is-quiet');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'WINAMP 2.10 — MONDO EDITION');
    var title = el('div', 'wa-titlebar');
    title.appendChild(el('span', 'wa-title', 'WINAMP 2.10 — MONDO EDITION'));
    box.appendChild(title);
    var lcd = el('div', 'wa-lcd');
    var viz = el('div', 'wa-viz');
    viz.id = 'jbViz';
    viz.setAttribute('aria-hidden', 'true');
    for (var bar = 0; bar < 12; bar++) viz.appendChild(el('i', ''));
    lcd.appendChild(viz);
    var marquee = el('div', 'wa-marquee');
    var track = el('span', 'wa-track', trackLabel());
    track.id = 'jbTrack';
    marquee.appendChild(track);
    lcd.appendChild(marquee);
    var clock = el('span', 'wa-clock', '00:00');
    clock.id = 'jbTime';
    lcd.appendChild(clock);
    box.appendChild(lcd);
    var controls = el('div', 'wa-controls');
    [['jbPrev', 'Prev'], ['jbPlay', 'Play'], ['jbPause', 'Pause'], ['jbStop', 'Stop'], ['jbNext', 'Next']].forEach(function (pair) {
      var button = el('button', 'wa-btn', pair[1]);
      button.type = 'button';
      button.id = pair[0];
      controls.appendChild(button);
    });
    var volLabel = el('label', 'wa-vol', 'Vol');
    var vol = document.createElement('input');
    vol.type = 'range';
    vol.id = 'jbVol';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(volume);
    vol.setAttribute('aria-label', 'Volume');
    volLabel.appendChild(vol);
    controls.appendChild(volLabel);
    box.appendChild(controls);
    toys.appendChild(box);
    top.appendChild(toys);
    return top;
  }
  function buildFoot() {
    var foot = el('div', 'era-foot wrap');
    foot.appendChild(el('div', 'rainbow-rule'));
    foot.appendChild(el('span', 'geo-badge', 'GeoCities SiliconValley/Heights/1998'));
    var since = el('p', 'since-line');
    since.appendChild(document.createTextNode('You are visitor #'));
    var slot = document.getElementById('counter');
    if (slot) {
      since.appendChild(document.createTextNode(''));
      var note = document.createTextNode(' (see the counter) since Oct 1998');
      since.appendChild(note);
    } else {
      since.appendChild(document.createTextNode('— since Oct 1998'));
    }
    foot.appendChild(since);
    var banners = el('div', 'microbanners');
    banners.appendChild(banner('#000080', '#fff', 'Netscape Now!', 'Navigator 4.0'));
    banners.appendChild(banner('#c0c0c0', '#000080', 'Built with', 'MS FrontPage'));
    banners.appendChild(banner('#fff', '#008000', 'HTML 3.2', 'Checked'));
    banners.appendChild(banner('#ffff00', '#000', 'Y2K Compliant', 'No problem'));
    banners.appendChild(banner('#000', '#00ff00', 'No Frames', 'were harmed'));
    foot.appendChild(banners);
    if (!document.querySelector('.webring')) {
      var table = document.createElement('table');
      table.className = 'webring-table';
      table.innerHTML = '<tr><th>WebRing</th><td><a href="/escape/">« Prev</a> <a href="/wiki/">Random</a> <a href="/recipes/">Next »</a></td></tr>';
      foot.appendChild(table);
    }
    return foot;
  }
  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function trackSeconds(track) {
    if (!track || !track.notes || !track.tempo) return 0;
    return track.notes.length * (60 / track.tempo);
  }
  function clockText(seconds) {
    var s = Math.max(0, Math.round(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function trackLabel() {
    var track = TRACKS[index];
    if (!track) return '';
    var file = /\.mid$/i.test(track.name) ? track.name : track.name + '.mid';
    return (index + 1) + '. DJ Mondo - ' + file + ' [' + clockText(trackSeconds(track)) + ']';
  }
  function volumeGain() {
    return Math.max(0, Math.min(100, volume)) / 100 * 0.15;
  }
  function ensureAudio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = volumeGain();
      master.connect(ctx.destination);
    }
  }
  function paintFace() {
    var lcd = document.getElementById('jbTrack');
    if (lcd) lcd.textContent = trackLabel();
    var box = document.querySelector('.winamp');
    if (box) {
      box.classList.toggle('is-playing', playing);
      box.classList.toggle('is-paused', paused);
      box.classList.toggle('is-quiet', !playing);
    }
    var time = document.getElementById('jbTime');
    if (!time) return;
    var shown = elapsedHold;
    if (playing && startedAt) shown = (Date.now() - startedAt) / 1000;
    var len = trackSeconds(TRACKS[index]);
    if (len && shown > len) shown = shown % len;
    time.textContent = clockText(shown);
  }
  function armClock() {
    clearInterval(clockTimer);
    clockTimer = 0;
    if (!playing) return;
    clockTimer = setInterval(function () {
      if (!document.hidden) paintFace();
    }, 250);
  }
  function silence() {
    clearTimeout(timer);
    clearInterval(clockTimer);
    timer = 0;
    clockTimer = 0;
    live.forEach(function (node) {
      try { node.stop(); } catch (e) { /* already stopped */ }
    });
    live = [];
    playing = false;
    paused = false;
    startedAt = 0;
    elapsedHold = 0;
    paintFace();
  }
  function schedule(track) {
    ensureAudio();
    var start = ctx.currentTime + 0.05;
    var beat = 60 / track.tempo;
    var t = start;
    track.notes.forEach(function (midi) {
      var dur = beat * 0.9;
      if (midi) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = track.wave;
        osc.frequency.value = freq(midi);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + dur);
        live.push(osc);
      }
      t += beat;
    });
    loopAt = t;
    timer = setTimeout(function () {
      if (playing) {
        startedAt = Date.now();
        elapsedHold = 0;
        schedule(TRACKS[index]);
      }
    }, Math.max(50, (t - ctx.currentTime) * 1000));
  }
  function audioBlocked() {
    return !!(window.MONDO_AUDIO && window.MONDO_AUDIO.muted && window.MONDO_AUDIO.muted());
  }
  function play() {
    if (audioBlocked()) return;
    if (paused && ctx) {
      paused = false;
      playing = true;
      startedAt = Date.now() - elapsedHold * 1000;
      var remain = Math.max(0.05, loopAt - ctx.currentTime);
      timer = setTimeout(function () {
        if (!playing) return;
        live.forEach(function (node) { try { node.stop(); } catch (e) {} });
        live = [];
        startedAt = Date.now();
        elapsedHold = 0;
        schedule(TRACKS[index]);
      }, remain * 1000);
      if (ctx.state === 'suspended') ctx.resume();
      paintFace();
      armClock();
      return;
    }
    silence();
    playing = true;
    paused = false;
    startedAt = Date.now();
    elapsedHold = 0;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    schedule(TRACKS[index]);
    paintFace();
    armClock();
  }
  function pauseTune() {
    if (!playing) return;
    clearTimeout(timer);
    clearInterval(clockTimer);
    timer = 0;
    clockTimer = 0;
    elapsedHold = startedAt ? (Date.now() - startedAt) / 1000 : elapsedHold;
    startedAt = 0;
    playing = false;
    paused = true;
    if (ctx && ctx.suspend) ctx.suspend();
    paintFace();
  }
  function showTrack() {
    paintFace();
  }
  window.MONDO_JUKEBOX = {
    setTracks: function (extra, preferName) {
      silence();
      TRACKS = (extra && extra.length) ? extra.concat(BASE) : BASE.slice();
      index = 0;
      if (preferName) {
        for (var i = 0; i < TRACKS.length; i++) {
          if (TRACKS[i].name === preferName) { index = i; break; }
        }
      }
      showTrack();
    }
  };
  function boot() {
    if (document.querySelector('.era-top')) return;
    var extra = window.MONDO_THEME_TRACKS || [];
    TRACKS = extra.length ? extra.concat(BASE) : BASE.slice();
    index = 0;
    document.documentElement.dataset.era = '1';
    var ticker = document.querySelector('.ticker');
    var top = buildTop();
    if (ticker && ticker.parentNode) ticker.parentNode.insertBefore(top, ticker.nextSibling);
    else document.body.insertBefore(top, document.body.firstChild);
    var footer = document.querySelector('.site-footer .wrap') || document.querySelector('.site-footer');
    var foot = buildFoot();
    if (footer) footer.appendChild(foot);
    else if (!document.body.classList.contains('chat-page') && !document.body.classList.contains('board-page')) document.body.appendChild(foot);
    var label = document.querySelector('.counter-label');
    if (label) label.textContent = 'You are visitor number since Oct 1998';
    document.getElementById('jbPlay').addEventListener('click', play);
    document.getElementById('jbPause').addEventListener('click', pauseTune);
    document.getElementById('jbStop').addEventListener('click', function () {
      resumeTune = false;
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      silence();
    });
    document.getElementById('jbPrev').addEventListener('click', function () {
      index = (index - 1 + TRACKS.length) % TRACKS.length;
      if (playing || paused) playFresh();
      else showTrack();
    });
    document.getElementById('jbVol').addEventListener('input', function (event) {
      volume = Number(event.target.value);
      if (master) master.gain.value = volumeGain();
      try { localStorage.setItem('mondosupreme.winamp.v1', JSON.stringify({volume: volume})); } catch (e) {}
    });
    var resumeTune = false;
    function playFresh() {
      paused = false;
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      silence();
      play();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        resumeTune = playing;
        if (playing) pauseTune();
      } else if (resumeTune && !audioBlocked()) {
        resumeTune = false;
        play();
      } else resumeTune = false;
    });
    document.addEventListener('mondo-audio', function (event) {
      if (event.detail && event.detail.muted) {
        resumeTune = false;
        silence();
      }
    });
    document.getElementById('jbNext').addEventListener('click', function () {
      index = (index + 1) % TRACKS.length;
      if (playing || paused) playFresh();
      else showTrack();
    });
    paintFace();
    if (typeof window.MONDO_THEME_MOUNT === 'function') window.MONDO_THEME_MOUNT(top);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
