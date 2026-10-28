(function () {
  'use strict';
  var KEY = 'mondosupreme.wordle.v1';
  var EPOCH = Date.UTC(1998, 9, 1);
  var AVATARS = { alien: 1, cat: 1, captain: 1, chef: 1, wizard: 1, skater: 1, smiley: 1, flame: 1, guest: 1 };
  var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  var lists = window.MONDO_WORDS || { solutions: [], extra: [], themed: [] };
  var valid = Object.create(null);
  lists.solutions.forEach(function (word) { valid[word] = 1; });
  lists.extra.forEach(function (word) { valid[word] = 1; });
  lists.themed.forEach(function (word) { valid[word] = 1; });

  var state = blank();
  var today = easternDate(new Date());
  var owner = false;
  var remoteRows = null;

  function $(id) { return document.getElementById(id); }
  function blank() {
    return {
      name: 'Guest',
      mode: 'daily',
      stats: { played: 0, wins: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], lastWin: '' },
      daily: freshDaily(today),
      free: freshBonus(),
      theme: freshBonus(),
      localScores: []
    };
  }
  function freshDaily(date) {
    return { date: date, guesses: [], draft: '', status: 'play', started: 0, ended: 0, recorded: false, posted: false };
  }
  function freshBonus() {
    return { answer: '', guesses: [], draft: '', status: 'play', started: 0, ended: 0 };
  }
  function easternDate(date) {
    var fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return fmt.format(date);
  }
  function puzzleNo(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var day = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return Math.round((day - EPOCH) / 86400000) + 1;
  }
  function prevDate(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    day.setUTCDate(day.getUTCDate() - 1);
    return day.toISOString().slice(0, 10);
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dailyWord(dateStr) {
    if (!lists.solutions.length) return 'crane';
    return lists.solutions[hash(dateStr) % lists.solutions.length];
  }
  function pick(list, avoid) {
    if (!list.length) return 'crane';
    var index = Math.floor(Math.random() * list.length);
    if (list[index] === avoid && list.length > 1) index = (index + 1) % list.length;
    return list[index];
  }
  function secret() {
    if (state.mode === 'daily') return dailyWord(today);
    var game = current();
    if (!valid[game.answer]) game.answer = state.mode === 'theme' ? pick(lists.themed) : pick(lists.solutions, dailyWord(today));
    return game.answer;
  }
  function current() {
    if (state.mode === 'free') return state.free;
    if (state.mode === 'theme') return state.theme;
    return state.daily;
  }
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!data || typeof data !== 'object') return;
      if (data.stats && Array.isArray(data.stats.dist) && data.stats.dist.length === 6) state.stats = data.stats;
      if (typeof data.name === 'string') state.name = cleanName(data.name);
      if (data.mode === 'free' || data.mode === 'theme' || data.mode === 'daily') state.mode = data.mode;
      if (data.daily && data.daily.date === today) state.daily = data.daily;
      if (data.free && typeof data.free.answer === 'string') state.free = data.free;
      if (data.theme && typeof data.theme.answer === 'string') state.theme = data.theme;
      if (Array.isArray(data.localScores)) {
        state.localScores = data.localScores.filter(function (row) { return row && row.date === today; });
      }
    } catch (e) { /* fresh stats */ }
    state.daily.draft = state.daily.draft || '';
    state.free.draft = state.free.draft || '';
    state.theme.draft = state.theme.draft || '';
    state.daily.guesses = state.daily.guesses || [];
    state.free.guesses = state.free.guesses || [];
    state.theme.guesses = state.theme.guesses || [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function cleanName(value) {
    var name = String(value || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!/^[A-Za-z]/.test(name)) return 'Guest';
    return name;
  }
  function score(guess, answer) {
    var marks = ['absent', 'absent', 'absent', 'absent', 'absent'];
    var left = Object.create(null);
    var i;
    for (i = 0; i < 5; i++) {
      if (guess.charAt(i) === answer.charAt(i)) marks[i] = 'correct';
      else left[answer.charAt(i)] = (left[answer.charAt(i)] || 0) + 1;
    }
    for (i = 0; i < 5; i++) {
      if (marks[i] === 'correct') continue;
      var ch = guess.charAt(i);
      if (left[ch]) {
        marks[i] = 'present';
        left[ch] -= 1;
      }
    }
    return marks;
  }
  function better(next, prev) {
    var rank = { correct: 3, present: 2, absent: 1 };
    return (rank[next] || 0) >= (rank[prev] || 0);
  }
  function setMsg(text) { $('wordMsg').textContent = text; }
  function clock(ms) {
    var seconds = Math.max(0, Math.round(ms / 1000));
    var minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  function buildGrid() {
    var grid = $('wordGrid');
    grid.textContent = '';
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 5; c++) {
        var tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('role', 'img');
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);
        grid.appendChild(tile);
      }
    }
  }
  function buildKeys() {
    var box = $('wordKeys');
    box.textContent = '';
    function row(keys, wide) {
      var line = document.createElement('div');
      line.className = 'kb-row';
      keys.forEach(function (key) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key' + (wide && wide[key] ? ' wide' : '');
        btn.dataset.key = key;
        btn.textContent = key === 'enter' ? 'ENTER' : key === 'del' ? 'DEL' : key;
        btn.addEventListener('click', function () { onKey(key); });
        line.appendChild(btn);
      });
      box.appendChild(line);
    }
    row(ROWS[0].split(''));
    row(ROWS[1].split(''));
    row(['enter'].concat(ROWS[2].split(''), ['del']), { enter: 1, del: 1 });
  }
  function tile(row, col) {
    return document.querySelector('.tile[data-row="' + row + '"][data-col="' + col + '"]');
  }
  function paint(animate) {
    var game = current();
    var answer = secret();
    var r, c, guess, marks, cell;
    for (r = 0; r < 6; r++) {
      guess = game.guesses[r] || (r === game.guesses.length ? game.draft : '');
      marks = game.guesses[r] ? score(game.guesses[r], answer) : null;
      for (c = 0; c < 5; c++) {
        cell = tile(r, c);
        cell.classList.remove('flip', 'is-filled');
        var letter = guess.charAt(c) || '';
        cell.textContent = letter;
        if (marks) {
          cell.dataset.state = marks[c];
          if (animate && r === game.guesses.length - 1) {
            (function (node, delay, mark) {
              node.dataset.state = '';
              setTimeout(function () {
                node.dataset.state = mark;
                node.classList.add('flip');
              }, delay);
            })(cell, c * 160, marks[c]);
          }
        } else {
          delete cell.dataset.state;
          if (letter) cell.classList.add('is-filled');
        }
        cell.setAttribute('aria-label', (letter || 'empty') + (marks ? ' ' + marks[c] : ''));
      }
    }
    paintKeys();
    paintChrome();
  }
  function paintKeys() {
    var best = Object.create(null);
    var game = current();
    var answer = secret();
    game.guesses.forEach(function (guess) {
      var marks = score(guess, answer);
      for (var i = 0; i < 5; i++) {
        var ch = guess.charAt(i);
        if (!best[ch] || better(marks[i], best[ch])) best[ch] = marks[i];
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.key'), function (key) {
      var ch = key.dataset.key;
      if (best[ch]) key.dataset.state = best[ch];
      else delete key.dataset.state;
    });
  }
  function paintChrome() {
    var game = current();
    var number = puzzleNo(today);
    var kicker = $('wordKicker');
    if (state.mode === 'daily') kicker.textContent = 'Daily · ' + today + ' · MondoWord #' + number + ' · flips at midnight Eastern';
    else if (state.mode === 'free') kicker.textContent = 'Free Play · unlimited random 5-letter words';
    else kicker.textContent = 'Bonus · 90s culture, the harbor, and the kitchen';
    $('modeDaily').setAttribute('aria-pressed', state.mode === 'daily' ? 'true' : 'false');
    $('modeFree').setAttribute('aria-pressed', state.mode === 'free' ? 'true' : 'false');
    $('modeTheme').setAttribute('aria-pressed', state.mode === 'theme' ? 'true' : 'false');
    $('wordNew').hidden = state.mode === 'daily';
    $('wordShare').disabled = game.status === 'play';
    if (game.status === 'won') setMsg(state.mode === 'daily' ? 'Solved in ' + game.guesses.length + '/6.' : 'Got it in ' + game.guesses.length + '/6.');
    else if (game.status === 'lost') setMsg('The word was ' + secret().toUpperCase() + '.');
    else if (!$('wordMsg').dataset.lock) setMsg('Six tries. Green is the right spot. Gold is in the word. Gray is out.');
    paintStats();
  }
  function paintStats() {
    var stats = state.stats;
    var played = stats.played || 0;
    var rate = played ? Math.round(100 * stats.wins / played) : 0;
    var box = $('wordStats');
    box.textContent = '';
    [['Played', played], ['Win %', rate], ['Streak', stats.streak || 0], ['Max', stats.max || 0]].forEach(function (pair) {
      var cell = document.createElement('div');
      var num = document.createElement('b');
      num.textContent = String(pair[1]);
      var label = document.createElement('span');
      label.textContent = pair[0];
      cell.appendChild(num);
      cell.appendChild(label);
      box.appendChild(cell);
    });
    var dist = $('wordDist');
    dist.textContent = '';
    var max = 1;
    stats.dist.forEach(function (n) { if (n > max) max = n; });
    stats.dist.forEach(function (n, i) {
      var row = document.createElement('div');
      row.className = 'dist-row';
      var label = document.createElement('i');
      label.textContent = String(i + 1);
      var bar = document.createElement('div');
      bar.className = 'dist-bar';
      bar.style.width = Math.max(8, Math.round(100 * n / max)) + '%';
      bar.textContent = String(n);
      row.appendChild(label);
      row.appendChild(bar);
      dist.appendChild(row);
    });
  }
  function shake() {
    var row = current().guesses.length;
    for (var c = 0; c < 5; c++) tile(row, c).classList.add('row-shake');
    setTimeout(function () {
      for (var i = 0; i < 5; i++) tile(row, i).classList.remove('row-shake');
    }, 360);
  }
  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = document.createElement('canvas');
    box.width = window.innerWidth;
    box.height = window.innerHeight;
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none';
    document.body.appendChild(box);
    var g = box.getContext('2d');
    var bits = [];
    var colors = ['#0f766e', '#1d4ed8', '#b45309', '#be123c', '#f8fafc'];
    for (var i = 0; i < 90; i++) bits.push({ x: Math.random() * box.width, y: -10 - Math.random() * 120, v: 2 + Math.random() * 4, c: colors[i % colors.length], s: 4 + Math.random() * 5 });
    var frame = 0;
    function tick() {
      g.clearRect(0, 0, box.width, box.height);
      bits.forEach(function (bit) {
        bit.y += bit.v;
        g.fillStyle = bit.c;
        g.fillRect(bit.x, bit.y, bit.s, bit.s * 0.55);
      });
      frame += 1;
      if (frame < 80) requestAnimationFrame(tick);
      else if (box.parentNode) box.parentNode.removeChild(box);
    }
    tick();
  }
  function onKey(key) {
    var game = current();
    $('wordMsg').dataset.lock = '';
    if (game.status !== 'play') return;
    if (key === 'enter') {
      submit();
      return;
    }
    if (key === 'del') {
      game.draft = game.draft.slice(0, -1);
      save();
      paint(false);
      return;
    }
    if (!/^[a-z]$/.test(key) || game.draft.length >= 5) return;
    if (!game.started) game.started = Date.now();
    game.draft += key;
    save();
    paint(false);
  }
  function submit() {
    var game = current();
    var word = game.draft;
    if (word.length < 5) {
      $('wordMsg').dataset.lock = '1';
      setMsg('Not enough letters.');
      shake();
      return;
    }
    if (!valid[word]) {
      $('wordMsg').dataset.lock = '1';
      setMsg('Not in the word list.');
      shake();
      return;
    }
    game.guesses.push(word);
    game.draft = '';
    var answer = secret();
    if (word === answer) {
      game.status = 'won';
      game.ended = Date.now();
      celebrate();
      if (state.mode === 'daily') recordDaily(true);
    } else if (game.guesses.length >= 6) {
      game.status = 'lost';
      game.ended = Date.now();
      if (state.mode === 'daily') recordDaily(false);
    }
    save();
    paint(true);
  }
  function recordDaily(won) {
    var game = state.daily;
    if (game.recorded) return;
    game.recorded = true;
    var stats = state.stats;
    stats.played += 1;
    if (won) {
      stats.wins += 1;
      stats.streak = stats.lastWin === prevDate(today) ? stats.streak + 1 : 1;
      stats.lastWin = today;
      if (stats.streak > stats.max) stats.max = stats.streak;
      stats.dist[game.guesses.length - 1] += 1;
    } else {
      stats.streak = 0;
    }
    save();
    postScore();
  }
  function shareText() {
    var game = current();
    var answer = secret();
    var title;
    if (state.mode === 'daily') title = "MondoWord #" + puzzleNo(today) + ' ' + (game.status === 'won' ? game.guesses.length : 'X') + '/6';
    else if (state.mode === 'free') title = "MondoWord Free Play " + (game.status === 'won' ? game.guesses.length : 'X') + '/6';
    else title = "MondoWord Bonus " + (game.status === 'won' ? game.guesses.length : 'X') + '/6';
    var rows = game.guesses.map(function (guess) {
      return score(guess, answer).map(function (mark) {
        if (mark === 'correct') return '🟩';
        if (mark === 'present') return '🟨';
        return '⬛';
      }).join('');
    }).join('\n');
    return title + '\n' + rows;
  }
  function copyShare() {
    var text = shareText();
    function done() {
      $('wordMsg').dataset.lock = '1';
      setMsg('Score grid copied.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { setMsg(text); }
    area.remove();
  }
  function newBonus() {
    if (state.mode === 'daily') return;
    var game = current();
    game.answer = state.mode === 'theme' ? pick(lists.themed) : pick(lists.solutions, dailyWord(today));
    game.guesses = [];
    game.draft = '';
    game.status = 'play';
    game.started = 0;
    game.ended = 0;
    $('wordMsg').dataset.lock = '';
    save();
    paint(false);
    setMsg('New word. Six tries.');
  }
  function setMode(mode) {
    state.mode = mode;
    $('wordMsg').dataset.lock = '';
    if (mode !== 'daily' && !valid[current().answer]) newBonus();
    else {
      save();
      paint(false);
    }
  }

  function playerName() {
    if (window.MONDO_MEMBER && MONDO_MEMBER.isMember() && MONDO_MEMBER.handle()) return cleanName(MONDO_MEMBER.handle());
    return cleanName($('wordName').value || state.name);
  }
  function playerAvatar() {
    var avatar = window.MONDO_MEMBER && MONDO_MEMBER.isMember() ? MONDO_MEMBER.avatar() : 'guest';
    return AVATARS[avatar] ? avatar : 'guest';
  }
  function database() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG || !window.MONDO_BOARD_CONFIG.apiKey) return null;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
      return firebase.database();
    } catch (e) { return null; }
  }
  function scorePayload() {
    var game = state.daily;
    return {
      name: playerName(),
      avatar: playerAvatar(),
      guesses: game.status === 'won' ? game.guesses.length : 6,
      won: game.status === 'won',
      ms: Math.max(0, Math.min(172800000, (game.ended || Date.now()) - (game.started || game.ended || Date.now()))),
      date: today,
      at: firebase.database.ServerValue.TIMESTAMP
    };
  }
  function rememberLocal(row) {
    state.localScores = state.localScores.filter(function (item) { return item.name !== row.name; });
    state.localScores.push(row);
    save();
    renderBoard(remoteRows || state.localScores.map(function (item, index) {
      return { id: 'local-' + index, name: item.name, avatar: item.avatar, guesses: item.guesses, won: item.won, ms: item.ms, local: true };
    }), true);
  }
  function postScore() {
    var row = {
      name: playerName(),
      avatar: playerAvatar(),
      guesses: state.daily.status === 'won' ? state.daily.guesses.length : 6,
      won: state.daily.status === 'won',
      ms: Math.max(0, (state.daily.ended || Date.now()) - (state.daily.started || state.daily.ended || Date.now())),
      date: today
    };
    var db = database();
    var uid = window.MONDO_MEMBER && MONDO_MEMBER.uid();
    if (!db || !uid || typeof firebase.auth !== 'function' || !firebase.auth().currentUser) {
      state.daily.posted = false;
      rememberLocal(row);
      return;
    }
    var payload = scorePayload();
    db.ref('wordle/scores/' + today + '/' + uid).set(payload).then(function () {
      state.daily.posted = true;
      save();
    }).catch(function () {
      state.daily.posted = false;
      rememberLocal(row);
    });
  }
  function renderBoard(rows, local) {
    var box = $('wordBoard');
    box.textContent = '';
    var list = (rows || []).slice().sort(function (a, b) {
      if (a.won !== b.won) return a.won ? -1 : 1;
      if (a.guesses !== b.guesses) return a.guesses - b.guesses;
      return (a.ms || 0) - (b.ms || 0);
    });
    if (!list.length) {
      var empty = document.createElement('p');
      empty.textContent = local ? 'Saved on this computer until the live board answers.' : 'No solvers yet today. Finish the daily word to sign the board.';
      box.appendChild(empty);
      return;
    }
    if (local) {
      var note = document.createElement('p');
      note.className = 'word-fine';
      note.textContent = 'Showing this computer’s result. The live board updates when Firebase accepts the score.';
      box.appendChild(note);
    }
    list.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'solver';
      var name = document.createElement('b');
      name.textContent = row.name || 'Guest';
      var meta = document.createElement('span');
      meta.textContent = (row.avatar || 'guest') + ' · ' + (row.won ? row.guesses : 'X') + '/6 · ' + clock(row.ms || 0);
      line.appendChild(name);
      line.appendChild(meta);
      if (owner && row.id && String(row.id).indexOf('local-') !== 0) {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          var db = database();
          if (db) db.ref('wordle/scores/' + today + '/' + row.id).remove();
        });
        line.appendChild(remove);
      }
      box.appendChild(line);
    });
  }
  function watchBoard() {
    var db = database();
    if (!db) {
      renderBoard(state.localScores.map(function (item, index) {
        return { id: 'local-' + index, name: item.name, avatar: item.avatar, guesses: item.guesses, won: item.won, ms: item.ms, local: true };
      }), true);
      return;
    }
    db.ref('wordle/scores/' + today).on('value', function (snap) {
      var rows = [];
      snap.forEach(function (child) {
        var value = child.val() || {};
        if (typeof value.name !== 'string' || typeof value.guesses !== 'number') return;
        rows.push({
          id: child.key,
          name: cleanName(value.name),
          avatar: AVATARS[value.avatar] ? value.avatar : 'guest',
          guesses: value.guesses,
          won: value.won === true,
          ms: value.ms || 0
        });
      });
      remoteRows = rows;
      renderBoard(rows, false);
    }, function () {
      renderBoard(state.localScores.map(function (item, index) {
        return { id: 'local-' + index, name: item.name, avatar: item.avatar, guesses: item.guesses, won: item.won, ms: item.ms };
      }), true);
    });
  }

  function boot() {
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    load();
    if (state.daily.date !== today) state.daily = freshDaily(today);
    $('wordName').value = state.name === 'Guest' ? '' : state.name;
    buildGrid();
    buildKeys();
    if (state.mode !== 'daily' && !valid[current().answer]) {
      current().answer = state.mode === 'theme' ? pick(lists.themed) : pick(lists.solutions, dailyWord(today));
    }
    paint(false);
    if (state.daily.status !== 'play' && !state.daily.posted) postScore();
    watchBoard();
    $('modeDaily').addEventListener('click', function () { setMode('daily'); });
    $('modeFree').addEventListener('click', function () { setMode('free'); });
    $('modeTheme').addEventListener('click', function () { setMode('theme'); });
    $('wordNew').addEventListener('click', newBonus);
    $('wordShare').addEventListener('click', copyShare);
    $('wordName').addEventListener('change', function () {
      state.name = cleanName($('wordName').value);
      $('wordName').value = state.name === 'Guest' ? '' : state.name;
      save();
    });
    document.addEventListener('keydown', function (event) {
      var tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var key = event.key;
      if (key === 'Enter') { event.preventDefault(); onKey('enter'); }
      else if (key === 'Backspace') { event.preventDefault(); onKey('del'); }
      else if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); onKey(key.toLowerCase()); }
    });
    document.addEventListener('mondo-owner', function (event) {
      owner = !!(event.detail && event.detail.on);
      if (remoteRows) renderBoard(remoteRows, false);
    });
    document.addEventListener('mondo-member', function () {
      if (window.MONDO_MEMBER && MONDO_MEMBER.isMember() && MONDO_MEMBER.handle()) {
        $('wordName').value = MONDO_MEMBER.handle();
      }
      if (state.daily.status !== 'play' && !state.daily.posted) postScore();
    });
    if (window.MONDO_MEMBER && MONDO_MEMBER.isOwner && MONDO_MEMBER.isOwner()) owner = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
