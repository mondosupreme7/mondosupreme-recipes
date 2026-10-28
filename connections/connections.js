(function () {
  'use strict';
  var KEY = 'mondosupreme.puzzles.v1';
  var PUZZLES = [
    { groups: [
      { name: 'Citrus', words: ['Orange', 'Lemon', 'Lime', 'Grapefruit'] },
      { name: 'On the pad', words: ['Countdown', 'Booster', 'Fairing', 'Gantry'] },
      { name: 'In the lineup', words: ['Swell', 'Break', 'Leash', 'Wax'] },
      { name: 'Utensils', words: ['Whisk', 'Ladle', 'Sieve', 'Zester'] }
    ]},
    { groups: [
      { name: 'Harbor birds', words: ['Pelican', 'Heron', 'Osprey', 'Ibis'] },
      { name: 'Cruise day', words: ['Gangway', 'Muster', 'Balcony', 'Embark'] },
      { name: 'Pantry cans', words: ['Tomatoes', 'Chickpeas', 'Coconut', 'Broth'] },
      { name: 'Sky at dusk', words: ['Coral', 'Amber', 'Violet', 'Indigo'] }
    ]},
    { groups: [
      { name: 'Beach kit', words: ['Towel', 'Sunscreen', 'Cooler', 'Chair'] },
      { name: 'Pasta night', words: ['Spaghetti', 'Basil', 'Garlic', 'Parmesan'] },
      { name: 'Bridge words', words: ['Span', 'Piling', 'Draw', 'Causeway'] },
      { name: 'Quiet verbs', words: ['Listen', 'Wait', 'Breathe', 'Notice'] }
    ]},
    { groups: [
      { name: 'Shells', words: ['Conch', 'Olive', 'Cockle', 'Whelk'] },
      { name: 'Breakfast', words: ['Pancake', 'Syrup', 'Butter', 'Buttermilk'] },
      { name: 'Storm talk', words: ['Squall', 'Gust', 'Band', 'Eye'] },
      { name: 'Card suits', words: ['Hearts', 'Clubs', 'Diamonds', 'Spades'] }
    ]},
    { groups: [
      { name: 'Canaveral water', words: ['Inlet', 'Jetty', 'Basin', 'Channel'] },
      { name: 'Curry pot', words: ['Onion', 'Ginger', 'Spinach', 'Rice'] },
      { name: 'Map words', words: ['Legend', 'Scale', 'Compass', 'Grid'] },
      { name: 'Soft sounds', words: ['Hush', 'Murmur', 'Rustle', 'Sigh'] }
    ]},
    { groups: [
      { name: 'Pier snacks', words: ['Fries', 'Cone', 'Slaw', 'Tartar'] },
      { name: 'Garden', words: ['Mulch', 'Trellis', 'Hose', 'Trowel'] },
      { name: 'Night lights', words: ['Beacon', 'Porch', 'Buoy', 'Lantern'] },
      { name: 'Four-letter seas', words: ['Brine', 'Tide', 'Surf', 'Foam'] }
    ]},
    { groups: [
      { name: 'Kitchen heat', words: ['Simmer', 'Broil', 'Roast', 'Sear'] },
      { name: 'Boardwalk', words: ['Arcade', 'Railing', 'Kiosk', 'Bench'] },
      { name: 'Cloud kinds', words: ['Cirrus', 'Stratus', 'Cumulus', 'Nimbus'] },
      { name: 'Holding on', words: ['Clip', 'Knot', 'Latch', 'Strap'] }
    ]},
    { groups: [
      { name: 'Market bags', words: ['Tote', 'Crate', 'Basket', 'Cart'] },
      { name: 'Launch viewers', words: ['Blanket', 'Radio', 'Camera', 'Chair'] },
      { name: 'River bends', words: ['Oxbow', 'Shoal', 'Marsh', 'Creek'] },
      { name: 'Gold tones', words: ['Honey', 'Wheat', 'Sand', 'Brass'] }
    ]}
  ];
  function $(id) { return document.getElementById(id); }
  function eastern(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  var today = eastern(new Date());
  var data = load();
  data.connections = data.connections || {};
  data.sudoku = data.sudoku || {};
  var conn = data.connections[today] || { solved: [], mistakes: 0, selected: [], done: false, streak: data.connStreak || 0 };
  var size = 6;
  var sudo = null;
  var timerId = 0;

  function puzzle() { return PUZZLES[hash(today) % PUZZLES.length]; }
  function paintConn() {
    var box = $('connGroups');
    var grid = $('connGrid');
    box.textContent = '';
    grid.textContent = '';
    var bank = puzzle();
    conn.solved.forEach(function (name) {
      var group = bank.groups.filter(function (g) { return g.name === name; })[0];
      if (!group) return;
      var tier = bank.groups.indexOf(group);
      var row = document.createElement('div');
      row.className = 'conn-group';
      row.dataset.tier = String(tier);
      row.textContent = group.name + ' — ' + group.words.join(', ');
      box.appendChild(row);
    });
    var open = [];
    bank.groups.forEach(function (group) {
      if (conn.solved.indexOf(group.name) >= 0) return;
      group.words.forEach(function (word) { open.push({ word: word, name: group.name }); });
    });
    if (!conn.order) conn.order = shuffle(open.map(function (item) { return item.word; }), rng(hash(today + ':mix')));
    conn.order.forEach(function (word) {
      if (conn.solved.some(function (name) {
        return bank.groups.some(function (g) { return g.name === name && g.words.indexOf(word) >= 0; });
      })) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'conn-tile' + (conn.selected.indexOf(word) >= 0 ? ' is-on' : '');
      btn.textContent = word;
      btn.addEventListener('click', function () { toggle(word); });
      grid.appendChild(btn);
    });
    $('connLives').textContent = 'Mistakes ' + conn.mistakes + ' of 4';
    $('connStreak').textContent = 'Streak ' + (data.connStreak || 0);
    $('connSubmit').disabled = conn.done || conn.selected.length !== 4;
  }
  function toggle(word) {
    if (conn.done) return;
    var i = conn.selected.indexOf(word);
    if (i >= 0) conn.selected.splice(i, 1);
    else if (conn.selected.length < 4) conn.selected.push(word);
    persistConn();
    paintConn();
  }
  function persistConn() {
    data.connections[today] = conn;
    save(data);
  }
  function submitConn() {
    if (conn.selected.length !== 4 || conn.done) return;
    var bank = puzzle();
    var hit = bank.groups.filter(function (group) {
      return group.words.every(function (word) { return conn.selected.indexOf(word) >= 0; });
    })[0];
    if (hit) {
      conn.solved.push(hit.name);
      conn.selected = [];
      if (conn.solved.length === 4) {
        conn.done = true;
        var prev = eastern(new Date(Date.now() - 86400000));
        data.connStreak = data.connLast === prev ? (data.connStreak || 0) + 1 : 1;
        data.connLast = today;
        conn.streak = data.connStreak;
        postScore('connections/' + today, { mistakes: conn.mistakes, streak: data.connStreak });
        $('connMsg').textContent = 'Solved. Share the color grid, not the words.';
      } else $('connMsg').textContent = hit.name + '.';
    } else {
      conn.mistakes += 1;
      var one = bank.groups.some(function (group) {
        var n = group.words.filter(function (word) { return conn.selected.indexOf(word) >= 0; }).length;
        return n === 3;
      });
      $('connMsg').textContent = one ? 'One away.' : 'Those four are not a group.';
      if (conn.mistakes >= 4) {
        conn.done = true;
        data.connStreak = 0;
        $('connMsg').textContent = 'Out of mistakes. The groups are saved on this device.';
        bank.groups.forEach(function (group) { if (conn.solved.indexOf(group.name) < 0) conn.solved.push(group.name); });
      }
    }
    persistConn();
    paintConn();
  }
  function shareConn() {
    var rows = conn.solved.map(function (_, i) { return ['🟨', '🟩', '🟦', '🟪'][i % 4].repeat(4); });
    var text = 'Mondosupreme Connections ' + today + '\n' + (rows.join('\n') || 'In progress');
    copy(text);
  }

  function buildSudoku(n, seed) {
    var rand = rng(seed);
    var boxR = n === 6 ? 2 : 3;
    var boxC = n === 6 ? 3 : 3;
    var grid = [];
    for (var r = 0; r < n; r++) grid.push(new Array(n).fill(0));
    function ok(r, c, v) {
      for (var i = 0; i < n; i++) if (grid[r][i] === v || grid[i][c] === v) return false;
      var br = Math.floor(r / boxR) * boxR;
      var bc = Math.floor(c / boxC) * boxC;
      for (var rr = 0; rr < boxR; rr++) for (var cc = 0; cc < boxC; cc++) if (grid[br + rr][bc + cc] === v) return false;
      return true;
    }
    function fill(pos) {
      if (pos >= n * n) return true;
      var r = Math.floor(pos / n);
      var c = pos % n;
      var digits = shuffle(Array.apply(null, { length: n }).map(function (_, i) { return i + 1; }), rand);
      for (var k = 0; k < digits.length; k++) {
        if (!ok(r, c, digits[k])) continue;
        grid[r][c] = digits[k];
        if (fill(pos + 1)) return true;
        grid[r][c] = 0;
      }
      return false;
    }
    fill(0);
    var solved = grid.map(function (row) { return row.slice(); });
    if (n === 6) {
      var cells = [];
      for (var r2 = 0; r2 < n; r2++) for (var c2 = 0; c2 < n; c2++) cells.push([r2, c2]);
      cells = shuffle(cells, rand);
      var keep = 18;
      var removed = 0;
      cells.forEach(function (cell) {
        if (n * n - removed <= keep) return;
        var prev = grid[cell[0]][cell[1]];
        grid[cell[0]][cell[1]] = 0;
        if (countSolutions(grid, boxR, boxC) !== 1) grid[cell[0]][cell[1]] = prev;
        else removed += 1;
      });
    } else {
      for (var r3 = 0; r3 < n; r3++) for (var c3 = 0; c3 < n; c3++) if (rand() < 0.58) grid[r3][c3] = 0;
    }
    return { given: grid, solved: solved, values: grid.map(function (row) { return row.slice(); }), notes: {} };
  }
  function countSolutions(source, boxR, boxC) {
    var n = source.length;
    var grid = source.map(function (row) { return row.slice(); });
    var found = 0;
    function ok(r, c, v) {
      for (var i = 0; i < n; i++) if (grid[r][i] === v || grid[i][c] === v) return false;
      var br = Math.floor(r / boxR) * boxR;
      var bc = Math.floor(c / boxC) * boxC;
      for (var rr = 0; rr < boxR; rr++) for (var cc = 0; cc < boxC; cc++) if (grid[br + rr][bc + cc] === v) return false;
      return true;
    }
    function walk(pos) {
      if (found > 1) return;
      if (pos >= n * n) { found += 1; return; }
      var r = Math.floor(pos / n);
      var c = pos % n;
      if (grid[r][c]) { walk(pos + 1); return; }
      for (var v = 1; v <= n; v++) {
        if (!ok(r, c, v)) continue;
        grid[r][c] = v;
        walk(pos + 1);
        grid[r][c] = 0;
        if (found > 1) return;
      }
    }
    walk(0);
    return found;
  }
  function ensureSudo() {
    var slot = data.sudoku[size + ':' + today];
    if (!slot) {
      slot = buildSudoku(size, hash(today + ':' + size));
      slot.started = 0;
      slot.ended = 0;
      slot.notesOn = false;
      slot.selected = 0;
      data.sudoku[size + ':' + today] = slot;
      save(data);
    }
    sudo = slot;
  }
  function paintSudo() {
    ensureSudo();
    var n = size;
    var host = $('sudo');
    host.textContent = '';
    host.style.gridTemplateColumns = 'repeat(' + n + ',minmax(0,1fr))';
    var boxR = n === 6 ? 2 : 3;
    var boxC = 3;
    for (var i = 0; i < n * n; i++) {
      var r = Math.floor(i / n);
      var c = i % n;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sudo-cell';
      if (sudo.given[r][c]) btn.classList.add('is-given');
      if (sudo.selected === i) btn.classList.add('is-on');
      var value = sudo.values[r][c];
      if (value && sudo.solved && value !== sudo.solved[r][c] && !sudo.given[r][c]) btn.classList.add('is-bad');
      if (value) btn.textContent = String(value);
      else if (sudo.notes[i]) {
        var small = document.createElement('span');
        small.className = 'sudo-notes';
        small.textContent = sudo.notes[i];
        btn.appendChild(small);
      }
      var thick = (c + 1) % boxC === 0 && c !== n - 1;
      if ((r + 1) % boxR === 0 && r !== n - 1) btn.style.borderBottomWidth = '3px';
      if (thick) btn.style.borderRightWidth = '3px';
      (function (index) {
        btn.addEventListener('click', function () { selectCell(index); });
      })(i);
      host.appendChild(btn);
    }
    var elapsed = sudo.ended ? sudo.ended - sudo.started : (sudo.started ? Date.now() - sudo.started : 0);
    $('sudoTime').textContent = format(elapsed);
    $('sudoStreak').textContent = 'Streak ' + (data.sudoStreak || 0);
  }
  function format(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function selectCell(index) {
    sudo.selected = index;
    save(data);
    paintSudo();
  }
  function enterDigit(digit) {
    ensureSudo();
    var n = size;
    var r = Math.floor(sudo.selected / n);
    var c = sudo.selected % n;
    if (sudo.given[r][c] || sudo.ended) return;
    if (!sudo.started) sudo.started = Date.now();
    if (sudo.notesOn && digit) {
      var cur = sudo.notes[sudo.selected] || '';
      var ch = String(digit);
      sudo.notes[sudo.selected] = cur.indexOf(ch) >= 0 ? cur.replace(ch, '') : (cur + ch).split('').sort().join('');
      sudo.values[r][c] = 0;
    } else {
      sudo.values[r][c] = digit;
      delete sudo.notes[sudo.selected];
    }
    if (won()) {
      sudo.ended = Date.now();
      var prev = eastern(new Date(Date.now() - 86400000));
      data.sudoStreak = data.sudoLast === prev ? (data.sudoStreak || 0) + 1 : 1;
      data.sudoLast = today;
      postScore('sudoku/' + size + '/' + today, { ms: sudo.ended - sudo.started, streak: data.sudoStreak });
      $('sudoMsg').textContent = 'Solved in ' + format(sudo.ended - sudo.started) + '.';
    }
    save(data);
    paintSudo();
  }
  function won() {
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (sudo.values[r][c] !== sudo.solved[r][c]) return false;
    return true;
  }
  function shareSudo() {
    var text = 'Mondosupreme Sudoku ' + size + '×' + size + ' ' + today + '\n' + (sudo.ended ? format(sudo.ended - sudo.started) : 'In progress') + ' · streak ' + (data.sudoStreak || 0);
    copy(text);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    $('shareOut').textContent = text;
  }
  function postScore(path, extra) {
    try {
      if (!window.firebase || !firebase.auth || !firebase.database) return;
      var user = firebase.auth().currentUser;
      if (!user) return;
      firebase.database().ref('puzzles/' + path + '/' + user.uid).set(Object.assign({ t: Date.now(), name: 'Guest' }, extra)).catch(function () {});
    } catch (e) {}
  }
  function boot() {
    $('connDate').textContent = today;
    $('connSubmit').addEventListener('click', submitConn);
    $('connShare').addEventListener('click', shareConn);
    $('connShuffle').addEventListener('click', function () {
      conn.order = null;
      persistConn();
      paintConn();
    });
    paintConn();
    $('size6').addEventListener('click', function () { size = 6; paintSudo(); });
    $('size9').addEventListener('click', function () { size = 9; paintSudo(); });
    $('noteMode').addEventListener('click', function () {
      ensureSudo();
      sudo.notesOn = !sudo.notesOn;
      $('noteMode').setAttribute('aria-pressed', sudo.notesOn ? 'true' : 'false');
    });
    $('sudoClear').addEventListener('click', function () { enterDigit(0); });
    $('sudoShare').addEventListener('click', shareSudo);
    var pad = $('digits');
    for (var d = 1; d <= 9; d++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = String(d);
      (function (digit) { b.addEventListener('click', function () { if (digit <= size) enterDigit(digit); }); })(d);
      pad.appendChild(b);
    }
    document.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === 'Backspace') enterDigit(0);
      else if (/^[1-9]$/.test(event.key)) enterDigit(Number(event.key));
    });
    paintSudo();
    timerId = setInterval(function () {
      if (sudo && sudo.started && !sudo.ended) $('sudoTime').textContent = format(Date.now() - sudo.started);
    }, 1000);
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
