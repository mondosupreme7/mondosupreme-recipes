/* Mystic 8-Ball. Public log uses Firebase; this browser keeps a copy. */
(function () {
  'use strict';
  var OWNER = 'cbrooks_911@yahoo.com';
  var RATE_MS = 4000;
  var DAILY = 40;
  var NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ ]{0,23}$/;
  var oracle = window.MONDO_ORACLE;
  var user = null;
  var isOwner = false;
  var readsOk = false;
  var listening = false;
  var serverAsks = [];
  var serverCustoms = [];
  var busy = false;
  var audioCtx = null;
  var motionOn = false;
  var lastMotion = 0;
  var anonTimer = 0;
  var clearArmed = false;
  var logSig = '';

  function $(id) { return document.getElementById(id); }
  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }
  function dayStamp() { return oracle.dayStamp(Date.now()); }
  function status(text) {
    var node = $('ballStatus');
    if (node) node.textContent = text || '';
  }
  function muted() {
    return !!(window.MONDO_AUDIO && window.MONDO_AUDIO.muted && window.MONDO_AUDIO.muted());
  }
  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function denied(err) {
    var code = err && (err.code || err.message) || '';
    return String(code).indexOf('PERMISSION_DENIED') !== -1 || String(code).indexOf('permission_denied') !== -1;
  }
  function showBanner() { var b = $('syncBanner'); if (b) b.hidden = false; }
  function hideBanner() { var b = $('syncBanner'); if (b) b.hidden = true; }
  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function cleanName(raw) {
    var name = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!name) return 'Seeker';
    if (!NAME_RE.test(name)) return '';
    return name;
  }
  function cleanQuestion(raw) {
    return String(raw || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 140);
  }
  function wrap(text) {
    var words = String(text || '').split(/\s+/);
    var rows = [];
    var cur = '';
    words.forEach(function (word) {
      if (!word) return;
      var next = cur ? cur + ' ' + word : word;
      if (next.length > 13 && cur) { rows.push(cur); cur = word; }
      else cur = next;
    });
    if (cur) rows.push(cur);
    return rows.slice(0, 4);
  }
  function paintTriangle(text) {
    var node = $('triText');
    if (!node) return;
    node.replaceChildren();
    var rows = wrap(text);
    var start = 48 - (rows.length - 1) * 5;
    rows.forEach(function (row, index) {
      var span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.setAttribute('x', '50');
      span.setAttribute('y', String(start + index * 11));
      span.textContent = row;
      node.appendChild(span);
    });
  }
  function toneWord(tone) {
    if (tone === 'no') return 'No';
    if (tone === 'maybe') return 'Maybe';
    return 'Yes';
  }
  function mergedCustoms() {
    var data = oracle.load();
    var byId = {};
    var list = [];
    serverCustoms.forEach(function (row) {
      if (!byId[row.id]) { byId[row.id] = true; list.push(row); }
    });
    (data.customs || []).forEach(function (row) {
      if (row.local && !byId[row.id]) { byId[row.id] = true; list.push(row); }
    });
    return list.slice(-40);
  }
  function mergedAsks() {
    var data = oracle.load();
    var byId = {};
    var list = [];
    serverAsks.forEach(function (row) {
      if (!byId[row.id]) { byId[row.id] = true; list.push(row); }
    });
    (data.log || []).forEach(function (row) {
      if (row && row.local && !byId[row.id]) { byId[row.id] = true; list.push(row); }
    });
    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return list.slice(0, 30);
  }
  function tally() {
    var day = dayStamp();
    var counts = { yes: 0, maybe: 0, no: 0 };
    var seen = {};
    function add(row) {
      if (!row || seen[row.id]) return;
      if (oracle.dayStamp(row.createdAt || 0) !== day) return;
      if (row.tone !== 'yes' && row.tone !== 'maybe' && row.tone !== 'no') return;
      seen[row.id] = true;
      counts[row.tone] += 1;
    }
    serverAsks.forEach(add);
    (oracle.load().log || []).forEach(add);
    var priv = oracle.load().privateToday;
    if (priv && priv.day === day) {
      counts.yes += priv.yes || 0;
      counts.maybe += priv.maybe || 0;
      counts.no += priv.no || 0;
    }
    return counts;
  }
  function paintOdds() {
    var counts = tally();
    var node = $('odds');
    if (!node) return;
    node.replaceChildren();
    node.appendChild(document.createTextNode("Today's odds — "));
    ['yes', 'maybe', 'no'].forEach(function (tone, index) {
      if (index) node.appendChild(document.createTextNode(' · '));
      var strong = document.createElement('b');
      strong.className = tone;
      strong.textContent = toneWord(tone) + ' ' + counts[tone];
      node.appendChild(strong);
    });
  }
  function paintModes() {
    var mode = oracle.load().mode || 'classic';
    document.querySelectorAll('#modeTabs button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
  }
  function paintCustoms() {
    var list = $('customList');
    if (!list) return;
    var rows = mergedCustoms();
    list.replaceChildren();
    rows.forEach(function (row) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.textContent = row.text + ' (' + toneWord(row.tone) + ')';
      li.appendChild(label);
      if (isOwner) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ghost';
        btn.textContent = 'Delete';
        btn.setAttribute('data-act', 'del-custom');
        btn.setAttribute('data-id', row.id);
        li.appendChild(btn);
      }
      list.appendChild(li);
    });
  }
  function paintLog() {
    var body = $('logBody');
    var empty = $('logEmpty');
    if (!body) return;
    var rows = mergedAsks();
    var sig = rows.map(function (row) { return row.id + ':' + row.answer + ':' + (row.name || ''); }).join('|') + (isOwner ? ':o' : '');
    if (sig === logSig) {
      if (empty) empty.hidden = rows.length > 0;
      return;
    }
    logSig = sig;
    body.replaceChildren();
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      function cell(label, text, className) {
        var td = document.createElement('td');
        td.dataset.label = label;
        if (className) td.className = className;
        td.textContent = text;
        return td;
      }
      tr.appendChild(cell('Question', row.question || '(just a shake)'));
      var who = document.createElement('td');
      who.dataset.label = 'Who';
      var whoName = document.createElement('span');
      whoName.textContent = row.name || 'Seeker';
      if (window.MONDO_MEMBER && row.author) window.MONDO_MEMBER.adorn(whoName, row.author);
      who.appendChild(whoName);
      tr.appendChild(who);
      tr.appendChild(cell('Fortune', row.answer || ''));
      tr.appendChild(cell('Tone', toneWord(row.tone), 'tone-' + (row.tone || 'yes')));
      var tools = document.createElement('td');
      tools.dataset.label = 'Owner';
      if (isOwner) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ghost';
        btn.textContent = 'Delete';
        btn.setAttribute('data-act', 'del-ask');
        btn.setAttribute('data-id', row.id);
        tools.appendChild(btn);
      }
      tr.appendChild(tools);
      body.appendChild(tr);
    });
    if (empty) empty.hidden = rows.length > 0;
  }
  function paintOwner() {
    var btn = $('ownerBtn');
    if (btn && !window.MONDO_MEMBER) btn.textContent = isOwner ? 'Sign out' : 'Owner sign in';
    var tools = $('ownerTools');
    if (tools) tools.hidden = !isOwner;
    paintCustoms();
    paintLog();
  }
  function showLast() {
    var last = oracle.load().last;
    if (!last || !last.text) return;
    paintTriangle(last.text);
    $('sphere').classList.add('is-revealed');
    $('answerCaption').textContent = last.text;
  }
  function bumpPrivate(tone) {
    var data = oracle.load();
    var day = dayStamp();
    if (!data.privateToday || data.privateToday.day !== day) data.privateToday = { day: day, yes: 0, maybe: 0, no: 0 };
    data.privateToday[tone] += 1;
    oracle.save(data);
  }
  function rememberLast(result, question) {
    var data = oracle.load();
    data.last = { q: question || '', text: result.text, tone: result.tone, at: Date.now() };
    oracle.save(data);
  }
  function pushLocal(entry) {
    var data = oracle.load();
    data.log = (data.log || []).filter(function (row) { return row.id !== entry.id; });
    data.log.push(entry);
    data.log = data.log.slice(-40);
    oracle.save(data);
  }
  function dropLocal(id, bucket) {
    var data = oracle.load();
    data[bucket] = (data[bucket] || []).filter(function (row) { return row.id !== id; });
    oracle.save(data);
  }
  function rateWait() {
    if (isOwner) return 0;
    return Math.max(0, RATE_MS - (Date.now() - (oracle.load().lastPost || 0)));
  }
  function rememberQuota(quota) {
    if (!quota) return;
    var data = oracle.load();
    data.quotaDay = quota.day;
    data.quotaN = quota.n;
    data.lastPost = Date.now();
    oracle.save(data);
  }
  function localFull() {
    if (isOwner) return false;
    var data = oracle.load();
    var n = data.quotaDay === dayStamp() ? data.quotaN : 0;
    return n >= DAILY;
  }
  function bootFirebase() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
    } catch (e) { return false; }
    return true;
  }
  function mapAsks(val) {
    var list = [];
    if (!val || typeof val !== 'object') return list;
    Object.keys(val).forEach(function (id) {
      var row = val[id];
      if (!row || typeof row !== 'object') return;
      list.push({
        id: id,
        question: String(row.question || ''),
        answer: String(row.answer || ''),
        tone: row.tone,
        mode: row.mode,
        name: String(row.name || 'Seeker'),
        author: String(row.author || ''),
        createdAt: Number(row.createdAt) || 0,
        local: false
      });
    });
    return list;
  }
  function mapCustoms(val) {
    var list = [];
    if (!val || typeof val !== 'object') return list;
    Object.keys(val).forEach(function (id) {
      var row = val[id];
      if (!row || typeof row !== 'object') return;
      list.push({ id: id, text: String(row.text || ''), tone: row.tone, local: false });
    });
    return list;
  }
  function syncCustomsCache() {
    var data = oracle.load();
    var live = {};
    serverCustoms.forEach(function (row) { live[row.id] = row; });
    var next = serverCustoms.map(function (row) {
      return { id: row.id, text: row.text, tone: row.tone, local: false };
    });
    (data.customs || []).forEach(function (row) {
      if (row.local && !live[row.id]) next.push(row);
    });
    data.customs = next.slice(-40);
    oracle.save(data);
  }
  function listen() {
    if (listening || !bootFirebase() || !firebase.auth().currentUser) return;
    listening = true;
    var db = firebase.database();
    db.ref('eightball/asks').limitToLast(60).on('value', function (snap) {
      readsOk = true;
      hideBanner();
      serverAsks = mapAsks(snap.val());
      paintOdds();
      paintLog();
    }, function (err) {
      readsOk = false;
      if (denied(err)) showBanner();
      paintOdds();
      paintLog();
    });
    db.ref('eightball/customs').limitToLast(40).on('value', function (snap) {
      readsOk = true;
      serverCustoms = mapCustoms(snap.val());
      syncCustomsCache();
      paintCustoms();
    }, function () { paintCustoms(); });
  }
  async function serverQuota() {
    var day = dayStamp();
    var n = 1;
    var snap = await firebase.database().ref('eightball/c/' + user.uid).once('value');
    var cur = snap.val();
    if (cur && cur.day === day) n = Number(cur.n) + 1;
    if (n > DAILY) {
      var err = new Error('daily');
      err.code = 'quota';
      throw err;
    }
    return { n: n, day: day };
  }
  function wireAsk(entry, quota) {
    var payload = {
      question: entry.question,
      answer: entry.answer,
      tone: entry.tone,
      mode: entry.mode,
      name: entry.name,
      author: user.uid,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (quota) { payload.seq = quota.n; payload.day = quota.day; }
    return payload;
  }
  function wireCustom(entry, quota) {
    var payload = {
      text: entry.text,
      tone: entry.tone,
      author: user.uid,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (quota) { payload.seq = quota.n; payload.day = quota.day; }
    return payload;
  }
  async function publish(path, payload, quota) {
    var updates = {};
    updates[path] = payload;
    if (!isOwner && quota) {
      updates['eightball/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
      updates['eightball/c/' + user.uid] = { n: quota.n, day: quota.day };
    }
    await firebase.database().ref().update(updates);
    rememberQuota(quota);
  }
  function playSound() {
    if (muted() || document.hidden || reduceMotion()) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { return; }
    var t = audioCtx.currentTime;
    function blip(when, freq) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.7, when + 0.12);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.07, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(when);
      osc.stop(when + 0.18);
    }
    blip(t, 190);
    blip(t + 0.09, 260);
    blip(t + 0.18, 340);
    [523, 659, 784].forEach(function (freq, index) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      var when = t + 0.62 + index * 0.03;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.045, when + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(when);
      osc.stop(when + 0.38);
    });
  }
  function unlockAudio() {
    if (muted() || reduceMotion()) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* this browser blocked audio */ }
  }
  async function reveal(result, question, priv) {
    var sphere = $('sphere');
    sphere.classList.remove('is-revealed');
    void sphere.offsetWidth;
    if (!reduceMotion()) sphere.classList.add('is-shaking');
    playSound();
    await sleep(reduceMotion() ? 40 : 720);
    sphere.classList.remove('is-shaking');
    paintTriangle(result.text);
    sphere.classList.add('is-revealed');
    $('answerCaption').textContent = result.text;
    rememberLast(result, question);
    var entry = {
      id: uid(),
      question: question,
      answer: result.text,
      tone: result.tone,
      mode: result.mode === 'custom' ? 'custom' : (oracle.load().mode || 'classic'),
      name: 'Seeker',
      author: user && user.uid ? user.uid : '',
      createdAt: Date.now(),
      local: true
    };
    if (priv) {
      bumpPrivate(result.tone);
      status('Kept private. It stays off the oracle log.');
      paintOdds();
      return;
    }
    var name = cleanName($('askName').value);
    if (!name) {
      bumpPrivate(result.tone);
      status('Use letters, numbers, and underscores in the name. This shake stayed private.');
      paintOdds();
      return;
    }
    entry.name = isOwner && name === 'Seeker' ? 'Mondo' : name;
    if (!isOwner && rateWait() > 0) {
      bumpPrivate(result.tone);
      status('Shown here only. The public log allows one question every 4 seconds.');
      paintOdds();
      return;
    }
    if (localFull()) {
      bumpPrivate(result.tone);
      status('Shown here only. The public log allows 40 questions a day on this browser.');
      paintOdds();
      return;
    }
    entry.local = true;
    pushLocal(entry);
    logSig = '';
    paintLog();
    paintOdds();
    if (!readsOk || !user) {
      var data = oracle.load();
      var day = dayStamp();
      var n = data.quotaDay === day ? (data.quotaN || 0) + 1 : 1;
      rememberQuota({ n: n, day: day });
      showBanner();
      status('Saved on this device until the oracle can sync.');
      return;
    }
    try {
      var quota = isOwner ? null : await serverQuota();
      var wait = rateWait();
      if (wait) await sleep(wait);
      await publish('eightball/asks/' + entry.id, wireAsk(entry, quota), quota);
      status('The sphere answered, and the oracle log has it.');
    } catch (err) {
      if (err && err.code === 'quota') {
        dropLocal(entry.id, 'log');
        bumpPrivate(result.tone);
        logSig = '';
        paintLog();
        status('Shown here only. Today’s public questions are full.');
        paintOdds();
        return;
      }
      showBanner();
      readsOk = false;
      var fallback = oracle.load();
      var day2 = dayStamp();
      var n2 = fallback.quotaDay === day2 ? (fallback.quotaN || 0) + 1 : 1;
      rememberQuota({ n: n2, day: day2 });
      status('Saved on this device until Firebase rules are published.');
    }
  }
  async function shake(event) {
    if (event) event.preventDefault();
    if (busy) return;
    var nameCheck = cleanName($('askName').value);
    if (!nameCheck) {
      status('Use letters, numbers, and underscores in the name.');
      $('askName').focus();
      return;
    }
    busy = true;
    $('shakeBtn').disabled = true;
    try {
      var data = oracle.load();
      data.customs = mergedCustoms();
      var result = oracle.pick(data);
      var question = cleanQuestion($('question').value);
      var priv = $('priv').checked;
      await reveal(result, question, priv);
    } finally {
      busy = false;
      $('shakeBtn').disabled = false;
    }
  }
  function setMode(mode) {
    var data = oracle.load();
    data.mode = mode === 'cyber' || mode === 'fate' ? mode : 'classic';
    oracle.save(data);
    paintModes();
  }
  async function addCustom(event) {
    event.preventDefault();
    var text = String($('customText').value || '').replace(/[\r\n]+/g, ' ').trim().toUpperCase();
    if (!text || text.length > 80) {
      status('Write a response of 1 to 80 characters.');
      return;
    }
    var tone = $('customTone').value;
    if (tone !== 'yes' && tone !== 'maybe' && tone !== 'no') tone = 'yes';
    var data = oracle.load();
    data.customs = mergedCustoms();
    if (data.customs.some(function (row) { return row.text.toUpperCase() === text; })) {
      status('That response is already in the pool.');
      return;
    }
    if (data.customs.length >= 40) {
      status('The custom pool is full (40).');
      return;
    }
    if (!isOwner && rateWait() > 0) {
      status('Wait 4 seconds between public posts.');
      return;
    }
    if (localFull()) {
      status('The daily public limit is 40 on this browser.');
      return;
    }
    var entry = { id: uid(), text: text, tone: tone, local: true };
    data.customs.push(entry);
    oracle.save(data);
    $('customText').value = '';
    paintCustoms();
    if (!readsOk || !user) {
      var day = dayStamp();
      var n = data.quotaDay === day ? (data.quotaN || 0) + 1 : 1;
      rememberQuota({ n: n, day: day });
      showBanner();
      status('Saved on this device until the oracle can sync.');
      return;
    }
    try {
      var quota = isOwner ? null : await serverQuota();
      var wait = rateWait();
      if (wait) await sleep(wait);
      await publish('eightball/customs/' + entry.id, wireCustom(entry, quota), quota);
      status('Added to the pool.');
    } catch (err) {
      showBanner();
      status(err && err.code === 'quota' ? 'Today’s public posts are full.' : 'Saved on this device until Firebase rules are published.');
    }
  }
  async function removeCloud(path, id, bucket) {
    dropLocal(id, bucket);
    if (bucket === 'log') {
      serverAsks = serverAsks.filter(function (row) { return row.id !== id; });
      logSig = '';
    } else {
      serverCustoms = serverCustoms.filter(function (row) { return row.id !== id; });
      syncCustomsCache();
    }
    paintLog();
    paintCustoms();
    paintOdds();
    if (!isOwner || !user || !readsOk) return;
    try {
      await firebase.database().ref(path + id).remove();
    } catch (e) { status('Deleted on this device. The server did not accept it yet.'); }
  }
  async function clearLog() {
    var btn = $('clearLog');
    if (!clearArmed) {
      clearArmed = true;
      if (btn) btn.textContent = 'Click again to clear the log';
      setTimeout(function () {
        clearArmed = false;
        if (btn) btn.textContent = 'Clear oracle log';
      }, 4000);
      return;
    }
    clearArmed = false;
    if (btn) btn.textContent = 'Clear oracle log';
    var data = oracle.load();
    data.log = [];
    oracle.save(data);
    var ids = serverAsks.map(function (row) { return row.id; });
    serverAsks = [];
    logSig = '';
    paintLog();
    paintOdds();
    if (!isOwner || !user || !readsOk) {
      status('Cleared on this device.');
      return;
    }
    try {
      var snap = await firebase.database().ref('eightball/asks').once('value');
      var val = snap.val() || {};
      Object.keys(val).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
      for (var i = 0; i < ids.length; i += 40) {
        var updates = {};
        ids.slice(i, i + 40).forEach(function (id) { updates['eightball/asks/' + id] = null; });
        if (Object.keys(updates).length) await firebase.database().ref().update(updates);
      }
      status('Oracle log cleared.');
    } catch (e) { status('Cleared on this device. The server did not accept the full clear yet.'); }
  }
  function onMotion(event) {
    if (!motionOn || document.hidden || busy) return;
    var acc = event.acceleration;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
    var mag = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
    if (mag < 22) return;
    if (Date.now() - lastMotion < 1200) return;
    lastMotion = Date.now();
    shake();
  }
  function startMotion() {
    motionOn = true;
    window.addEventListener('devicemotion', onMotion);
    var data = oracle.load();
    data.motion = 1;
    oracle.save(data);
    $('motionBtn').setAttribute('aria-pressed', 'true');
    $('motionBtn').textContent = 'Shake iPhone to Ask: ON';
  }
  function stopMotion() {
    motionOn = false;
    window.removeEventListener('devicemotion', onMotion);
    var data = oracle.load();
    data.motion = 0;
    oracle.save(data);
    $('motionBtn').setAttribute('aria-pressed', 'false');
    $('motionBtn').textContent = 'Shake iPhone to Ask';
  }
  function enableMotion() {
    unlockAudio();
    if (motionOn) { stopMotion(); status('Phone shake is off.'); return; }
    function granted() { startMotion(); status('Shake the phone to ask. A firm shake wakes the sphere.'); }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(function (state) {
        if (state === 'granted') granted();
        else status('Motion permission was not granted.');
      }).catch(function () { status('Motion permission was not granted.'); });
      return;
    }
    if (window.DeviceMotionEvent) { granted(); return; }
    status('This browser has no motion sensor.');
  }
  function connect() {
    if (!bootFirebase()) { showBanner(); return; }
    firebase.auth().onAuthStateChanged(function (next) {
      if (!next) {
        user = null;
        isOwner = false;
        clearTimeout(anonTimer);
        anonTimer = setTimeout(function () {
          if (firebase.auth().currentUser) return;
          firebase.auth().signInAnonymously().catch(function () { showBanner(); });
        }, 600);
        paintOwner();
        return;
      }
      clearTimeout(anonTimer);
      user = next;
      isOwner = !!(next.email && next.email.toLowerCase() === ownerEmail());
      listen();
      paintOwner();
    });
  }
  function boot() {
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    paintModes();
    showLast();
    paintOdds();
    paintCustoms();
    paintLog();
    if (oracle.load().motion && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission !== 'function') {
      startMotion();
    }
    $('askForm').addEventListener('submit', shake);
    $('sphere').addEventListener('click', function () { shake(); });
    $('motionBtn').addEventListener('click', enableMotion);
    $('customForm').addEventListener('submit', addCustom);
    $('modeTabs').addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-mode]');
      if (!btn) return;
      setMode(btn.getAttribute('data-mode'));
    });
    document.body.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'del-ask') removeCloud('eightball/asks/', id, 'log');
      if (act === 'del-custom') removeCloud('eightball/customs/', id, 'customs');
    });
    var clear = $('clearLog');
    if (clear) clear.addEventListener('click', clearLog);
    $('ownerBtn').addEventListener('click', function () {
      if (!bootFirebase()) { status('Shared sign-in is not available yet.'); return; }
      var current = firebase.auth().currentUser;
      if (current && current.email && current.email.toLowerCase() === ownerEmail()) {
        firebase.auth().signOut();
        return;
      }
      $('ownerError').hidden = true;
      $('ownerPass').value = '';
      $('ownerEmail').value = ownerEmail();
      $('ownerDialog').showModal();
    });
    $('ownerCancel').addEventListener('click', function () { $('ownerDialog').close(); });
    $('ownerForm').addEventListener('submit', function (event) {
      event.preventDefault();
      $('ownerError').hidden = true;
      firebase.auth().signInWithEmailAndPassword($('ownerEmail').value.trim(), $('ownerPass').value).then(function () {
        $('ownerPass').value = '';
        $('ownerDialog').close();
      }).catch(function () {
        $('ownerPass').value = '';
        $('ownerError').textContent = 'That email or password is wrong.';
        $('ownerError').hidden = false;
      });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && audioCtx) {
        try { audioCtx.suspend(); } catch (e) { /* already suspended */ }
      }
    });
    connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
