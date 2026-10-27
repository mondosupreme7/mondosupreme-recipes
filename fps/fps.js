(function () {
  'use strict';

  var SAVE_KEY = 'mondosupreme.fps.v1';
  var OWNER = (window.MONDO_BOARD_OWNER || 'cbrooks_911@yahoo.com');

  var GUNS = {
    crowbar: { name: 'Crowbar', melee: 1, dmg: 28, range: 1.35, cd: 0.42 },
    knife: { name: 'Knife', melee: 1, dmg: 22, range: 1.2, cd: 0.38 },
    wrench: { name: 'Wrench', melee: 1, build: 1, dmg: 30, range: 1.35, cd: 0.48 },
    pistol: { name: '9mm Pistol', dmg: 14, cd: 0.28, mag: 17, reserve: 68, reload: 1.05 },
    deagle: { name: 'Desert Eagle', dmg: 36, cd: 0.4, mag: 7, reserve: 35, reload: 1.15 },
    mp5: { name: 'MP5', dmg: 10, cd: 0.09, mag: 30, reserve: 90, reload: 1.25, auto: 1 },
    mp5n: { name: 'MP5-Navy', dmg: 11, cd: 0.085, mag: 30, reserve: 90, reload: 1.25, auto: 1 },
    shot: { name: 'Shotgun', dmg: 8, pellets: 6, spread: 0.1, cd: 0.7, mag: 6, reserve: 32, reload: 1.45 },
    tau: { name: 'Tau Cannon', dmg: 42, cd: 0.46, mag: 25, reserve: 0, energy: 1 },
    ak: { name: 'AK-47', dmg: 18, cd: 0.11, mag: 30, reserve: 90, reload: 1.35, auto: 1 },
    m4: { name: 'M4A1', dmg: 15, cd: 0.095, mag: 30, reserve: 90, reload: 1.3, auto: 1 },
    awp: { name: 'AWP', dmg: 100, cd: 1.35, mag: 10, reserve: 20, reload: 1.7, scope: 1 },
    rocket: { name: 'Rocket Launcher', proj: 1, dmg: 88, splash: 2.35, cd: 0.9, mag: 4, reserve: 20, reload: 1.55 },
    mini: { name: 'Minigun', dmg: 7, cd: 0.05, mag: 200, reserve: 200, reload: 2.1, auto: 1, spread: 0.075 }
  };

  var SHOP = {
    deagle: { cost: 700, slot: 'side', name: 'Desert Eagle' },
    mp5n: { cost: 1500, slot: 'primary', name: 'MP5-Navy' },
    ak: { cost: 2500, slot: 'primary', name: 'AK-47' },
    m4: { cost: 3100, slot: 'primary', name: 'M4A1' },
    awp: { cost: 4750, slot: 'primary', name: 'AWP Sniper' },
    kevlar: { cost: 650, slot: 'armor', name: 'Kevlar+Helmet' },
    kit: { cost: 400, slot: 'kit', name: 'Defuse Kit' }
  };

  var CLASSES = {
    scout: { hp: 75, speed: 2.05, guns: ['shot'] },
    soldier: { hp: 140, speed: 1, guns: ['rocket'] },
    heavy: { hp: 300, speed: 0.62, guns: ['mini'] },
    engineer: { hp: 110, speed: 1, guns: ['shot', 'wrench'] }
  };

  var MAPS = {
    hl: {
      title: 'Sector C Labs',
      rows: [
        '####################',
        '#@..h.............s#',
        '#.####..######..+..#',
        '#.#..t..#....#..*..#',
        '#.#.##..#.##.#..#..#',
        '#.#.....h.#..#..~..#',
        '#.####..#.#.#..~..##',
        '#.......#...#......#',
        '#.##.######.#####.##',
        '#..............s...#',
        '#..C..C..D.........#',
        '####################'
      ]
    },
    cs: {
      title: 'de_sandstorm',
      rows: [
        '######################',
        '#@.................$.#',
        '#.####..........####.#',
        '#.#..............#...#',
        '#.#......BB......#...#',
        '#.#..............#...#',
        '#.####..........####.#',
        '#...C..............C.#',
        '#....................#',
        '######################'
      ]
    },
    tfc: {
      title: '2Fort_99',
      rows: [
        '########################',
        '#1..R.................2#',
        '#...................L..#',
        '#......................#',
        '#..######....######....#',
        '#......................#',
        '#......................#',
        '#..######....######....#',
        '#......................#',
        '#1...................2.#',
        '########################'
      ]
    }
  };

  var profile = loadSave();
  var state = {
    mode: null,
    phase: 'browser',
    live: false,
    pickTeam: 'ct',
    pickClass: 'soldier',
    buyTime: 0,
    roundTime: 0,
    endIn: 0,
    endText: '',
    winner: ''
  };
  var grid = [];
  var doors = [];
  var decals = [];
  var sites = [];
  var spawns = {};
  var flags = {};
  var score = { red: 0, blue: 0 };
  var player = null;
  var monsters = [];
  var bots = [];
  var rockets = [];
  var sentries = [];
  var remotes = [];
  var floats = [];
  var bomb = null;
  var keys = {};
  var stick = { x: 0, y: 0, on: false };
  var fireHeld = false;
  var useHeld = false;
  var useLatch = false;
  var look = { on: false, x: 0, y: 0, id: 0 };
  var pitch = 0;
  var scopeLevel = 0;
  var flash = 0;
  var swing = 0;
  var recoil = 0;
  var walkPhase = 0;
  var hurtFlash = 0;
  var hazardAcc = 0;
  var looping = false;
  var lastT = 0;
  var reduceMotion = false;
  var noteTimer = 0;
  var net = { ok: true, dead: false, uid: null, user: null, last: 0, lastHit: 0, listened: false, inboxOn: false, counts: { hl: 0, cs: 0, tfc: 0 } };
  var hitQueue = {};
  var cam = { dirX: 1, dirY: 0, planeX: 0, planeY: 0.66 };

  function $(id) { return document.getElementById(id); }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          data.v = 1;
          data.name = cleanName(data.name || 'Rookie');
          data.frags = clampInt(data.frags, 0, 999999);
          data.deaths = clampInt(data.deaths, 0, 999999);
          data.wins = clampInt(data.wins, 0, 999999);
          data.cash = clampInt(data.cash, 0, 999999);
          return data;
        }
      }
    } catch (err) { /* keep the default sheet */ }
    return { v: 1, name: 'Rookie', frags: 0, deaths: 0, wins: 0, cash: 800 };
  }

  function saveProfile() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (err) { /* private mode */ }
    paintStats();
  }

  function clampInt(n, lo, hi) {
    n = Math.round(Number(n) || 0);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function taggedName(uid, name) {
    var badge = window.MONDO_MEMBER ? window.MONDO_MEMBER.badgeText(uid) : '';
    return badge ? ((name || '') + ' ' + badge) : (name || '');
  }
  function cleanName(s) {
    s = String(s || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!/^[A-Za-z]/.test(s)) return 'Rookie';
    return s;
  }

  function audioCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx.ac) audioCtx.ac = new AC();
    if (audioCtx.ac.state === 'suspended' && !document.hidden) audioCtx.ac.resume();
    return audioCtx.ac;
  }

  function tone(freq, dur, type, vol, delay) {
    if (!profile.sound) return;
    var ctx = audioCtx();
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = vol || 0.03;
    o.connect(g);
    g.connect(ctx.destination);
    var t0 = ctx.currentTime + (delay || 0);
    o.start(t0);
    o.stop(t0 + dur);
  }

  function noise(dur, vol) {
    if (!profile.sound) return;
    var ctx = audioCtx();
    if (!ctx) return;
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource();
    var g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol || 0.05;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  function hevBeep() {
    tone(880, 0.05, 'square', 0.025, 0);
    tone(660, 0.07, 'square', 0.02, 0.07);
  }

  function winChime() {
    tone(523, 0.12, 'square', 0.04, 0);
    tone(659, 0.12, 'square', 0.04, 0.12);
    tone(784, 0.18, 'square', 0.04, 0.24);
    tone(1046, 0.22, 'square', 0.035, 0.4);
  }

  function note(text) {
    var toast = $('toast');
    var buyNote = $('buyNote');
    if (buyNote && !$('buy').hidden) buyNote.textContent = text;
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = text;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(function () { toast.hidden = true; }, 1600);
  }

  function paintStats() {
    var el = $('localStats');
    if (!el) return;
    el.textContent = 'Your sheet — frags ' + profile.frags + ' · deaths ' + profile.deaths + ' · wins ' + profile.wins + ' · cash $' + profile.cash;
  }

  function showBanner() {
    var el = $('syncBanner');
    if (!el) return;
    el.hidden = false;
  }

  function realmDown() {
    if (net.dead) return;
    net.dead = true;
    net.ok = false;
    showBanner();
  }

  function gun() {
    if (!player) return GUNS.pistol;
    return GUNS[player.guns[player.wpn]] || GUNS.pistol;
  }

  function gunId() {
    if (!player) return 'pistol';
    return player.guns[player.wpn] || 'pistol';
  }

  function cellAt(x, y) {
    var ix = Math.floor(x);
    var iy = Math.floor(y);
    if (iy < 0 || ix < 0 || iy >= grid.length || ix >= grid[0].length) return '#';
    return grid[iy][ix];
  }

  function doorOpen(ix, iy) {
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].x === ix && doors[i].y === iy) return doors[i].open;
    }
    return false;
  }

  function solidAt(x, y) {
    var ix = Math.floor(x);
    var iy = Math.floor(y);
    if (iy < 0 || ix < 0 || iy >= grid.length || ix >= grid[0].length) return true;
    var ch = grid[iy][ix];
    if (ch === '#' || ch === '=' || ch === 'C') return true;
    if (ch === 'D') return !doorOpen(ix, iy);
    return false;
  }

  function blockedBySentry(x, y) {
    for (var i = 0; i < sentries.length; i++) {
      if (sentries[i].hp <= 0) continue;
      if (Math.hypot(sentries[i].x - x, sentries[i].y - y) < 0.42) return true;
    }
    return false;
  }

  function walkable(x, y) {
    var r = 0.18;
    return !solidAt(x - r, y - r) && !solidAt(x + r, y - r) && !solidAt(x - r, y + r) && !solidAt(x + r, y + r);
  }

  function tryMove(ent, dx, dy) {
    var nx = ent.x + dx;
    var ny = ent.y + dy;
    if (walkable(nx, ent.y) && !blockedBySentry(nx, ent.y)) ent.x = nx;
    if (walkable(ent.x, ny) && !blockedBySentry(ent.x, ny)) ent.y = ny;
  }

  function los(x0, y0, x1, y1) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var steps = Math.ceil(dist / 0.18);
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function loadMap(mode) {
    var def = MAPS[mode];
    var rows = def.rows;
    var width = rows[0].length;
    grid = [];
    doors = [];
    decals = [];
    sites = [];
    spawns = { any: [], ct: [], t: [], red: [], blue: [] };
    flags = {};
    monsters = [];
    for (var y = 0; y < rows.length; y++) {
      if (rows[y].length !== width) throw new Error('Map row ' + y);
      grid[y] = rows[y].split('');
      for (var x = 0; x < width; x++) {
        var ch = grid[y][x];
        var p = { x: x + 0.5, y: y + 0.5 };
        if (ch === '@') { spawns.any.push(p); spawns.ct.push(p); grid[y][x] = '.'; }
        else if (ch === '$') { spawns.t.push(p); grid[y][x] = '.'; }
        else if (ch === '1') { spawns.red.push(p); grid[y][x] = '.'; }
        else if (ch === '2') { spawns.blue.push(p); grid[y][x] = '.'; }
        else if (ch === 'R') { flags.red = { team: 'red', x: p.x, y: p.y, homeX: p.x, homeY: p.y, carrier: null, dropped: false, timer: 0 }; grid[y][x] = '.'; }
        else if (ch === 'L') { flags.blue = { team: 'blue', x: p.x, y: p.y, homeX: p.x, homeY: p.y, carrier: null, dropped: false, timer: 0 }; grid[y][x] = '.'; }
        else if (ch === 'B') { sites.push(p); grid[y][x] = '.'; }
        else if (ch === 'h') { monsters.push(makeMonster('headcrab', p.x, p.y)); grid[y][x] = '.'; }
        else if (ch === 's') { monsters.push(makeMonster('shock', p.x, p.y)); grid[y][x] = '.'; }
        else if (ch === 't') { monsters.push(makeMonster('turret', p.x, p.y)); grid[y][x] = '.'; }
        else if (ch === '+') { decals.push({ kind: 'health', x: p.x, y: p.y }); }
        else if (ch === '*') { decals.push({ kind: 'suit', x: p.x, y: p.y }); }
        else if (ch === '~') { decals.push({ kind: 'hazard', x: p.x, y: p.y }); }
        else if (ch === 'D') { doors.push({ x: x, y: y, open: false }); }
      }
    }
  }

  function makeMonster(kind, x, y) {
    var spec = {
      headcrab: { name: 'Headcrab', hp: 22, speed: 1.45, dmg: 9, range: 0.85, cool: 0.7, sight: 8 },
      shock: { name: 'Shock Trooper', hp: 55, speed: 1.05, dmg: 8, range: 8.5, cool: 0.7, sight: 10 },
      turret: { name: 'Turret', hp: 45, speed: 0, dmg: 7, range: 8.5, cool: 0.42, sight: 9 }
    }[kind];
    return {
      id: kind + x + '_' + y,
      kind: kind,
      team: 'alien',
      name: spec.name,
      x: x,
      y: y,
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed,
      dmg: spec.dmg,
      range: spec.range,
      cool: spec.cool,
      sight: spec.sight,
      leap: 0.4,
      boost: 0,
      stuck: 0,
      lx: x,
      ly: y,
      wander: 0
    };
  }

  function pickSpawn(team) {
    var list = spawns[team] && spawns[team].length ? spawns[team] : spawns.any;
    if (!list.length) return { x: 2.5, y: 2.5 };
    return list[Math.floor(Math.random() * list.length)];
  }

  function fillAmmo() {
    player.ammo = {};
    for (var i = 0; i < player.guns.length; i++) {
      var id = player.guns[i];
      var g = GUNS[id];
      if (!g || g.melee) continue;
      player.ammo[id] = { mag: g.mag, reserve: g.reserve };
    }
  }

  function applyLoadout() {
    if (state.mode === 'hl') {
      player.guns = ['crowbar', 'pistol', 'mp5', 'shot', 'tau'];
      player.team = 'none';
      player.cls = '';
      player.maxHp = 100;
      player.hp = 100;
      player.suit = 100;
      player.armor = 0;
      player.kit = false;
      player.speed = 1.05;
      player.wpn = 0;
    } else if (state.mode === 'cs') {
      player.guns = ['knife', 'pistol'];
      player.team = state.pickTeam === 't' ? 't' : 'ct';
      player.cls = '';
      player.maxHp = 100;
      player.hp = 100;
      player.suit = 0;
      player.armor = 0;
      player.kit = false;
      player.helmet = false;
      player.speed = 1;
      player.wpn = 1;
    } else {
      var cls = CLASSES[state.pickClass] ? state.pickClass : 'soldier';
      var spec = CLASSES[cls];
      player.guns = spec.guns.slice();
      player.team = state.pickTeam === 'blue' ? 'blue' : 'red';
      player.cls = cls;
      player.maxHp = spec.hp;
      player.hp = spec.hp;
      player.suit = 0;
      player.armor = cls === 'heavy' ? 100 : 0;
      player.kit = false;
      player.speed = spec.speed;
      player.wpn = 0;
    }
    player.reloading = 0;
    player.reloadId = '';
    player.cool = 0;
    player.invul = 1.2;
    player.dying = false;
    player.respawnIn = 0;
    scopeLevel = 0;
    fillAmmo();
  }

  function spawnPlayer() {
    var team = state.mode === 'hl' ? 'any' : (state.mode === 'cs' ? player.team : player.team);
    var spot = state.mode === 'hl' ? pickSpawn('any') : pickSpawn(player.team);
    player.x = spot.x;
    player.y = spot.y;
    if (player.team === 't' || player.team === 'blue') player.ang = Math.PI;
    else player.ang = 0;
    player.hp = player.maxHp;
    player.invul = 1.2;
    player.dying = false;
    pitch = 0;
  }

  function makeBot(team, name, slot) {
    var spot = pickSpawn(team);
    var y = spot.y + slot * 0.65;
    if (!walkable(spot.x, y)) y = spot.y;
    return {
      id: 'b' + team + slot + Math.floor(Math.random() * 1000),
      kind: 'bot',
      name: name,
      team: team,
      x: spot.x,
      y: y,
      hp: 100,
      maxHp: 100,
      cool: 0.4 + Math.random() * 0.4,
      planting: 0,
      hasBomb: false,
      stuck: 0,
      lx: spot.x,
      ly: y,
      wander: 0,
      wanderT: 0,
      deadFor: 0
    };
  }

  function spawnBots() {
    bots = [];
    if (state.mode === 'cs') {
      if (player.team === 'ct') {
        bots.push(makeBot('t', 'Phoenix', 0));
        bots.push(makeBot('t', 'Dook', 1));
        bots[0].hasBomb = true;
      } else {
        bots.push(makeBot('ct', 'Urban', 0));
        bots.push(makeBot('ct', 'Seal', 1));
      }
      setupBomb();
    } else if (state.mode === 'tfc') {
      var enemy = player.team === 'red' ? 'blue' : 'red';
      var tag = enemy === 'blue' ? 'BLU' : 'RED';
      bots.push(makeBot(enemy, tag + ' Scout', 0));
      bots.push(makeBot(enemy, tag + ' Soldier', 1));
    }
  }

  function setupBomb() {
    var site = sites[0] || { x: player.x, y: player.y };
    bomb = { carrier: null, planted: false, timer: 20, planting: 0, defusing: 0, x: site.x, y: site.y };
    if (player.team === 't') bomb.carrier = 'player';
    else if (bots[0]) bomb.carrier = bots[0].id;
  }

  function resetRound() {
    rockets = [];
    floats = [];
    sentries = sentries.filter(function () { return false; });
    applyLoadout();
    spawnPlayer();
    spawnBots();
    state.buyTime = 15;
    state.roundTime = 80;
    state.phase = 'play';
    state.endText = '';
    clearFeed();
  }

  function startMatch() {
    loadMap(state.mode);
    if (state.mode === 'cs' && profile.cash < 800) profile.cash = 800;
    score = { red: 0, blue: 0 };
    rockets = [];
    sentries = [];
    floats = [];
    player = { x: 2, y: 2, ang: 0 };
    applyLoadout();
    spawnPlayer();
    spawnBots();
    state.live = true;
    state.buyTime = state.mode === 'cs' ? 15 : 0;
    state.roundTime = state.mode === 'cs' ? 80 : 0;
    state.phase = 'play';
    state.endText = '';
    clearFeed();
    saveProfile();
    showPlay();
    ensureLoop();
    pushPresence(true);
  }

  function showPlay() {
    document.body.classList.add('fps-live', 'is-playing');
    $('browser').hidden = true;
    $('lobby').hidden = true;
    $('play').hidden = false;
    $('buy').hidden = true;
    $('replay').hidden = true;
    $('serverName').textContent = MAPS[state.mode].title;
    $('stage').classList.remove('mode-hl', 'mode-cs', 'mode-tfc');
    $('stage').classList.add('mode-' + state.mode);
    $('btnSpecial').textContent = state.mode === 'cs' ? 'BUY' : (state.mode === 'tfc' ? 'CLASS' : 'CROWBAR');
    var view = $('view');
    if (view && view.focus) view.focus();
  }

  function openLobby(resume) {
    state.resume = !!resume;
    $('browser').hidden = true;
    $('play').hidden = true;
    $('lobby').hidden = false;
    $('lobby').classList.toggle('mode-cs', state.mode === 'cs');
    $('lobby').classList.toggle('mode-tfc', state.mode === 'tfc');
    $('lobbyTitle').textContent = MAPS[state.mode].title;
    if (!resume) document.body.classList.remove('fps-live', 'is-playing');
    paintPicks();
  }

  function connect(mode) {
    if (!MAPS[mode]) return;
    profile.name = cleanName($('pname').value);
    saveProfile();
    state.mode = mode;
    if (mode === 'cs') state.pickTeam = 'ct';
    if (mode === 'tfc') {
      state.pickTeam = 'red';
      state.pickClass = 'soldier';
    }
    if (mode === 'hl') startMatch();
    else openLobby(false);
  }

  function deploy() {
    if (state.mode === 'cs') state.pickTeam = state.pickTeam === 't' ? 't' : 'ct';
    if (state.mode === 'tfc') {
      state.pickTeam = state.pickTeam === 'blue' ? 'blue' : 'red';
      if (!CLASSES[state.pickClass]) state.pickClass = 'soldier';
    }
    if (!state.live || !state.resume) startMatch();
    else {
      applyLoadout();
      spawnPlayer();
      if (state.mode === 'tfc') spawnBots();
      state.phase = 'play';
      showPlay();
      ensureLoop();
    }
  }

  function disconnect() {
    state.phase = 'browser';
    state.live = false;
    state.resume = false;
    looping = false;
    player = null;
    if (net.ok && net.uid && typeof firebase !== 'undefined') {
      firebase.database().ref('fps/players/' + net.uid).remove().catch(function () {});
    }
    $('play').hidden = true;
    $('lobby').hidden = true;
    $('browser').hidden = false;
    $('buy').hidden = true;
    document.body.classList.remove('fps-live', 'is-playing');
    paintStats();
  }

  function addFrag(victim, weapon) {
    profile.frags += 1;
    if (state.mode === 'cs') profile.cash += 300;
    saveProfile();
    feedLine(profile.name, weapon, victim);
    pushBoard();
  }

  function feedLine(who, weapon, whom) {
    var ul = $('feed');
    if (!ul) return;
    var li = document.createElement('li');
    var a = document.createElement('span');
    a.textContent = who;
    var icon = document.createElement('i');
    icon.className = 'wico w-' + weapon;
    var b = document.createElement('span');
    b.textContent = whom;
    li.appendChild(a);
    li.appendChild(icon);
    li.appendChild(b);
    ul.appendChild(li);
    while (ul.children.length > 5) ul.removeChild(ul.firstChild);
  }

  function clearFeed() {
    var ul = $('feed');
    if (ul) ul.textContent = '';
  }

  function floatText(x, y, text, color) {
    var p = project(x, y);
    floats.push({
      x: p ? p.x : 160,
      y: p ? p.y : 80,
      text: text,
      color: color || '#ffd24a',
      life: 0.7
    });
  }

  function damageEnt(ent, dmg, weapon) {
    if (!ent || ent.hp <= 0) return;
    dmg = Math.max(1, Math.round(dmg));
    if (ent.kind === 'remote') {
      ent.hp -= dmg;
      ent.hurtUntil = Date.now() + 1200;
      queueHit(ent.uid, dmg);
      floatText(ent.x, ent.y, String(dmg), '#ffd24a');
      if (ent.hp <= 0 && !ent.credited) {
        ent.credited = true;
        addFrag(ent.name || 'Rival', weapon);
      }
      return;
    }
    ent.hp -= dmg;
    floatText(ent.x, ent.y, String(dmg), ent.team === player.team ? '#7ec8ff' : '#ffd24a');
    if (ent.hp <= 0) {
      ent.hp = 0;
      if (ent.kind !== 'sentry') addFrag(ent.name || 'Target', weapon);
      if (ent.hasBomb && bomb && !bomb.planted) {
        bomb.carrier = null;
        bomb.x = ent.x;
        bomb.y = ent.y;
        ent.hasBomb = false;
      }
      dropFlagFrom(ent.id);
      if (state.mode === 'cs') checkRound();
      if (state.mode === 'hl') checkLabs();
    }
  }

  function hurtPlayer(dmg, src) {
    if (!player || player.hp <= 0 || player.invul > 0 || state.phase !== 'play') return;
    dmg = Math.max(1, Math.round(dmg));
    if (player.armor > 0) {
      var block = Math.min(player.armor, Math.ceil(dmg * 0.5));
      player.armor -= block;
      dmg = Math.max(1, dmg - block);
    }
    if (state.mode === 'hl' && player.suit > 0) {
      var soak = Math.min(player.suit, dmg);
      player.suit -= soak;
      dmg = Math.max(1, Math.ceil(dmg * 0.55));
      hevBeep();
    }
    player.hp -= dmg;
    hurtFlash = 0.28;
    floatText(player.x, player.y, String(dmg), '#ff4040');
    noise(0.05, 0.03);
    if (player.hp <= 0) {
      player.hp = 0;
      die(src || 'World');
    }
  }

  function die(src) {
    if (!player || player.dying) return;
    player.dying = true;
    player.hp = 0;
    profile.deaths += 1;
    saveProfile();
    feedLine(src, 'pistol', profile.name);
    if (bomb && bomb.carrier === 'player' && !bomb.planted) {
      bomb.carrier = null;
      bomb.x = player.x;
      bomb.y = player.y;
    }
    dropFlagFrom('player');
    scopeLevel = 0;
    if (state.mode === 'cs') {
      state.phase = 'dead';
      checkRound();
    } else if (state.mode === 'hl' || state.mode === 'tfc') {
      state.phase = 'dead';
      player.respawnIn = 1.6;
    }
  }

  function respawn() {
    if (state.mode === 'tfc') applyLoadout();
    else {
      player.hp = player.maxHp;
      player.dying = false;
    }
    spawnPlayer();
    state.phase = 'play';
  }

  function checkLabs() {
    if (state.mode !== 'hl' || state.phase !== 'play') return;
    for (var i = 0; i < monsters.length; i++) if (monsters[i].hp > 0) return;
    if (!monsters.length) return;
    state.phase = 'clear';
    state.endText = 'SECTOR CLEAR';
    profile.wins += 1;
    saveProfile();
    winChime();
    $('replay').hidden = false;
  }

  function living(team) {
    var n = 0;
    if (player && player.team === team && player.hp > 0) n += 1;
    for (var i = 0; i < bots.length; i++) if (bots[i].team === team && bots[i].hp > 0) n += 1;
    return n;
  }

  function checkRound() {
    if (state.mode !== 'cs' || state.phase === 'roundend' || state.phase === 'browser') return;
    if (state.buyTime > 14.2) return;
    if (bomb && bomb.planted) {
      if (living('ct') === 0 && state.phase === 'play') endRound('t', 'Counter-terrorists eliminated');
      return;
    }
    if (living('t') === 0) endRound('ct', 'Terrorists eliminated');
    else if (living('ct') === 0) endRound('t', 'Counter-terrorists eliminated');
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundend') return;
    state.phase = 'roundend';
    state.endIn = 3.4;
    state.winner = winner;
    var title = winner === 'ct' ? 'Counter-Terrorists Win' : 'Terrorists Win';
    state.endText = title + ' — ' + reason;
    if (player && player.team === winner) {
      profile.cash += 1000;
      profile.wins += 1;
    } else profile.cash += 250;
    saveProfile();
    winChime();
    feedLine(title, 'awp', reason);
  }

  function nearestSite(ent) {
    var best = null;
    var bd = 1e9;
    for (var i = 0; i < sites.length; i++) {
      var d = Math.hypot(sites[i].x - ent.x, sites[i].y - ent.y);
      if (d < bd) { bd = d; best = sites[i]; }
    }
    return { spot: best, dist: bd };
  }

  function strike(dmg, range, weapon) {
    var dx = Math.cos(player.ang);
    var dy = Math.sin(player.ang);
    var best = null;
    var bd = range;
    function consider(ent) {
      if (!ent || ent.hp <= 0 || !isEnemy(ent)) return;
      var ex = ent.x - player.x;
      var ey = ent.y - player.y;
      var dist = Math.hypot(ex, ey);
      if (dist > range || dist >= bd) return;
      var dot = (ex * dx + ey * dy) / (dist || 1);
      if (dot < 0.35) return;
      best = ent;
      bd = dist;
    }
    monsters.forEach(consider);
    bots.forEach(consider);
    sentries.forEach(consider);
    remotes.forEach(consider);
    if (best) damageEnt(best, dmg, weapon);
    return !!best;
  }

  function isEnemy(ent) {
    if (!ent || !player) return false;
    if (ent.kind === 'sentry' && ent.owner === 'player') return false;
    if (state.mode === 'hl') return true;
    return ent.team !== player.team;
  }

  function hitscan(spread, dmg, weapon) {
    var ang = player.ang + (Math.random() - 0.5) * (spread || 0);
    var dx = Math.cos(ang);
    var dy = Math.sin(ang);
    var best = null;
    var bestT = 18;
    function consider(ent) {
      if (!ent || ent.hp <= 0 || !isEnemy(ent)) return;
      var ex = ent.x - player.x;
      var ey = ent.y - player.y;
      var t = ex * dx + ey * dy;
      if (t < 0.2 || t > bestT) return;
      var px = player.x + dx * t;
      var py = player.y + dy * t;
      if (Math.hypot(ent.x - px, ent.y - py) > 0.38) return;
      best = ent;
      bestT = t;
    }
    for (var t = 0; t < 18; t += 0.2) {
      var x = player.x + dx * t;
      var y = player.y + dy * t;
      if (solidAt(x, y)) { bestT = t; break; }
    }
    monsters.forEach(consider);
    bots.forEach(consider);
    sentries.forEach(consider);
    remotes.forEach(consider);
    if (best) damageEnt(best, dmg, weapon);
    else floatText(player.x + dx * Math.min(bestT, 4), player.y + dy * Math.min(bestT, 4), '·', '#ffffff');
  }

  function launchRocket() {
    var g = GUNS.rocket;
    var dx = Math.cos(player.ang);
    var dy = Math.sin(player.ang);
    rockets.push({
      x: player.x + dx * 0.45,
      y: player.y + dy * 0.45,
      vx: dx * 8,
      vy: dy * 8,
      dmg: g.dmg,
      splash: g.splash,
      life: 1.6,
      team: player.team
    });
    noise(0.18, 0.06);
    tone(90, 0.12, 'sawtooth', 0.03);
  }

  function explode(r) {
    function splash(ent, self) {
      if (!ent) return;
      var d = Math.hypot(ent.x - r.x, ent.y - r.y);
      if (d > r.splash) return;
      var amount = Math.round(r.dmg * (1 - d / r.splash) * (self ? 0.45 : 1));
      if (amount < 1) return;
      if (self) hurtPlayer(amount, 'Rocket');
      else if (isEnemy(ent) || ent.kind === 'sentry') damageEnt(ent, amount, 'rocket');
    }
    splash(player, true);
    monsters.forEach(function (e) { splash(e, false); });
    bots.forEach(function (e) { splash(e, false); });
    sentries.forEach(function (e) { splash(e, false); });
    remotes.forEach(function (e) { splash(e, false); });
    floatText(r.x, r.y, 'BOOM', '#ffaa33');
    noise(0.2, 0.07);
  }

  function placeSentry() {
    if (!player || player.cls !== 'engineer') return;
    var dx = Math.cos(player.ang);
    var dy = Math.sin(player.ang);
    var x = player.x + dx * 0.95;
    var y = player.y + dy * 0.95;
    if (!walkable(x, y)) { note('Cannot build there'); return; }
    sentries = sentries.filter(function (s) { return s.owner !== 'player'; });
    sentries.push({
      kind: 'sentry',
      owner: 'player',
      team: player.team,
      name: 'Sentry',
      x: x,
      y: y,
      hp: 110,
      maxHp: 110,
      cool: 0.2
    });
    note('Sentry deployed');
    tone(520, 0.07, 'square', 0.03);
  }

  function pullTrigger() {
    if (!player || player.hp <= 0 || state.phase !== 'play') return false;
    if (player.cool > 0 || player.reloading > 0) return false;
    var id = gunId();
    var g = GUNS[id];
    if (!g) return false;
    if (g.melee) {
      var hit = strike(g.dmg, g.range, id);
      if (g.build && !hit) placeSentry();
      player.cool = g.cd;
      swing = 1;
      noise(0.07, 0.05);
      tone(180, 0.05, 'square', 0.02);
      return true;
    }
    var ammo = player.ammo[id];
    if (!ammo || ammo.mag < 1) { startReload(); return false; }
    var spread = g.spread || 0;
    if (g.scope) spread = scopeLevel ? 0 : 0.11;
    if (g.proj) launchRocket();
    else if (g.pellets) {
      for (var i = 0; i < g.pellets; i++) hitscan(spread, g.dmg, id);
      noise(0.09, 0.07);
    } else {
      hitscan(spread, g.dmg, id);
      if (g.energy) tone(640, 0.08, 'sawtooth', 0.03);
      else noise(0.045, g.dmg > 40 ? 0.07 : 0.05);
    }
    if (!g.energy || true) ammo.mag -= 1;
    player.cool = g.cd;
    flash = 0.05;
    recoil = 1;
    if (ammo.mag <= 0 && !g.energy) startReload();
    return true;
  }

  function startReload() {
    if (!player || player.reloading > 0) return;
    var id = gunId();
    var g = GUNS[id];
    if (!g || g.melee || g.energy || !g.reload) return;
    var ammo = player.ammo[id];
    if (!ammo || ammo.mag >= g.mag || ammo.reserve <= 0) return;
    player.reloading = g.reload;
    player.reloadId = id;
    scopeLevel = 0;
  }

  function nextWeapon() {
    if (!player) return;
    player.wpn = (player.wpn + 1) % player.guns.length;
    player.reloading = 0;
    scopeLevel = 0;
  }

  function toggleScope() {
    var g = gun();
    if (g.scope) scopeLevel = (scopeLevel + 1) % 3;
    else scopeLevel = scopeLevel ? 0 : 1;
  }

  function queueHit(target, dmg) {
    if (!target) return;
    hitQueue[target] = Math.min(120, (hitQueue[target] || 0) + dmg);
  }

  function dropFlagFrom(id) {
    if (state.mode !== 'tfc') return;
    ['red', 'blue'].forEach(function (team) {
      var f = flags[team];
      if (!f || f.carrier !== id) return;
      f.carrier = null;
      f.dropped = true;
      f.timer = 12;
      if (id === 'player') { f.x = player.x; f.y = player.y; }
      else {
        for (var i = 0; i < bots.length; i++) if (bots[i].id === id) { f.x = bots[i].x; f.y = bots[i].y; }
      }
    });
  }

  function flagTouch(ent, isPlayer) {
    if (state.mode !== 'tfc' || !flags.red || !flags.blue || ent.hp <= 0) return;
    var mine = ent.team === 'blue' ? flags.blue : flags.red;
    var enemy = ent.team === 'blue' ? flags.red : flags.blue;
    var who = isPlayer ? 'player' : ent.id;
    if (mine.dropped && !mine.carrier && Math.hypot(ent.x - mine.x, ent.y - mine.y) < 0.75) {
      mine.x = mine.homeX;
      mine.y = mine.homeY;
      mine.dropped = false;
      mine.timer = 0;
      if (isPlayer) note('Flag returned');
    }
    if (!enemy.carrier && Math.hypot(ent.x - enemy.x, ent.y - enemy.y) < 0.75) {
      enemy.carrier = who;
      enemy.dropped = false;
      if (isPlayer) note('You took the flag');
    }
    if (enemy.carrier === who && !mine.carrier && Math.hypot(ent.x - mine.homeX, ent.y - mine.homeY) < 0.85) {
      enemy.carrier = null;
      enemy.x = enemy.homeX;
      enemy.y = enemy.homeY;
      enemy.dropped = false;
      score[ent.team] += 1;
      if (isPlayer) {
        profile.frags += 1;
        profile.wins += 1;
        saveProfile();
        feedLine(profile.name, 'shot', 'captured the flag');
        winChime();
      }
      if (score[ent.team] >= 3) note((ent.team === 'red' ? 'Red' : 'Blue') + ' wins the fort');
    }
  }

  function updateFlags(dt) {
    if (state.mode !== 'tfc') return;
    ['red', 'blue'].forEach(function (team) {
      var f = flags[team];
      if (!f) return;
      if (f.carrier === 'player' && player) { f.x = player.x; f.y = player.y; }
      else if (f.carrier) {
        for (var i = 0; i < bots.length; i++) if (bots[i].id === f.carrier) { f.x = bots[i].x; f.y = bots[i].y; }
      } else if (f.dropped) {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.x = f.homeX;
          f.y = f.homeY;
          f.dropped = false;
        }
      }
    });
  }

  function steer(ent, tx, ty, speed, dt) {
    var dx = tx - ent.x;
    var dy = ty - ent.y;
    var dist = Math.hypot(dx, dy) || 1;
    if (ent.wanderT > 0) {
      ent.wanderT -= dt;
      tryMove(ent, Math.cos(ent.wander) * speed * dt, Math.sin(ent.wander) * speed * dt);
    } else {
      tryMove(ent, (dx / dist) * speed * dt, (dy / dist) * speed * dt);
    }
    if (Math.hypot(ent.x - ent.lx, ent.y - ent.ly) < 0.02) ent.stuck += dt;
    else ent.stuck = 0;
    ent.lx = ent.x;
    ent.ly = ent.y;
    if (ent.stuck > 0.7) {
      ent.wander = Math.random() * Math.PI * 2;
      ent.wanderT = 0.45;
      ent.stuck = 0;
    }
  }

  function updateMonsters(dt) {
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (m.hp <= 0) continue;
      m.cool -= dt;
      var dist = Math.hypot(player.x - m.x, player.y - m.y);
      var see = dist < m.sight && los(m.x, m.y, player.x, player.y);
      if (m.kind === 'headcrab') {
        m.leap -= dt;
        if (see && dist < 7 && m.leap <= 0) { m.leap = 1.05; m.boost = 0.28; }
        var sp = m.speed * (m.boost > 0 ? 2.5 : 1);
        if (m.boost > 0) m.boost -= dt;
        if (see) steer(m, player.x, player.y, sp, dt);
        if (dist < m.range && m.cool <= 0) {
          m.cool = 0.8;
          hurtPlayer(m.dmg, m.name);
        }
      } else if (m.speed > 0) {
        if (see && dist > 3.2) steer(m, player.x, player.y, m.speed, dt);
        if (see && dist < m.range && m.cool <= 0) {
          m.cool = 0.75;
          if (Math.random() < 0.75) hurtPlayer(m.dmg, m.name);
        }
      } else if (see && dist < m.range && m.cool <= 0) {
        m.cool = 0.42;
        hurtPlayer(m.dmg, m.name);
        noise(0.04, 0.03);
      }
    }
  }

  function updateBots(dt) {
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i];
      if (b.hp <= 0) {
        if (state.mode === 'tfc') {
          b.deadFor += dt;
          if (b.deadFor > 2.2) {
            var spot = pickSpawn(b.team);
            b.x = spot.x;
            b.y = spot.y;
            b.hp = b.maxHp;
            b.deadFor = 0;
            b.hasBomb = false;
          }
        }
        continue;
      }
      b.cool -= dt;
      var targetX = player.x;
      var targetY = player.y;
      if (state.mode === 'cs' && b.hasBomb && bomb && !bomb.planted) {
        var site = nearestSite(b);
        if (site.spot) { targetX = site.spot.x; targetY = site.spot.y; }
        if (site.dist < 1.15) {
          b.planting += dt;
          if (b.planting >= 1.4) {
            bomb.planted = true;
            bomb.timer = 20;
            bomb.x = b.x;
            bomb.y = b.y;
            bomb.carrier = null;
            b.hasBomb = false;
            feedLine(b.name, 'ak', 'planted the bomb');
            tone(220, 0.2, 'square', 0.04);
          }
        } else b.planting = 0;
      } else if (state.mode === 'tfc') {
        var enemyTeam = b.team === 'red' ? 'blue' : 'red';
        var enemyFlag = flags[enemyTeam];
        var myFlag = flags[b.team];
        if (enemyFlag && enemyFlag.carrier === b.id && myFlag) {
          targetX = myFlag.homeX;
          targetY = myFlag.homeY;
        } else if (enemyFlag && !enemyFlag.carrier) {
          targetX = enemyFlag.x;
          targetY = enemyFlag.y;
        }
        flagTouch(b, false);
      }
      var dist = Math.hypot(player.x - b.x, player.y - b.y);
      var hunting = dist < 9 && player.hp > 0 && player.team !== b.team && los(b.x, b.y, player.x, player.y);
      if (!(b.hasBomb && bomb && !bomb.planted)) {
        if (hunting) { targetX = player.x; targetY = player.y; }
      }
      var speed = b.hasBomb ? 1.7 : 1.9;
      if (!hunting || dist > 4) steer(b, targetX, targetY, speed, dt);
      if (hunting && dist < 8 && b.cool <= 0 && player.invul <= 0) {
        b.cool = 0.62;
        if (Math.random() < 0.6) hurtPlayer(state.mode === 'tfc' ? 8 : 9, b.name);
      }
    }
  }

  function updateSentries(dt) {
    for (var i = 0; i < sentries.length; i++) {
      var s = sentries[i];
      if (s.hp <= 0) continue;
      s.cool -= dt;
      if (s.cool > 0) continue;
      var best = null;
      var bd = 8;
      function look(ent) {
        if (!ent || ent.hp <= 0) return;
        if (ent.team === s.team) return;
        var d = Math.hypot(ent.x - s.x, ent.y - s.y);
        if (d < bd && los(s.x, s.y, ent.x, ent.y)) { best = ent; bd = d; }
      }
      if (player && player.hp > 0 && player.team !== s.team) look(player);
      bots.forEach(look);
      monsters.forEach(look);
      remotes.forEach(look);
      if (!best) continue;
      s.cool = 0.34;
      if (best === player) hurtPlayer(8, 'Sentry');
      else damageEnt(best, 8, 'shot');
      noise(0.03, 0.03);
    }
  }

  function updateRockets(dt) {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.life -= dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      var hit = r.life <= 0 || solidAt(r.x, r.y);
      if (!hit) {
        var all = monsters.concat(bots, sentries, remotes);
        if (player) all.push(player);
        for (var j = 0; j < all.length; j++) {
          var ent = all[j];
          if (!ent || ent.hp <= 0) continue;
          if (ent === player) continue;
          if (Math.hypot(ent.x - r.x, ent.y - r.y) < 0.4) { hit = true; break; }
        }
      }
      if (hit) {
        explode(r);
        rockets.splice(i, 1);
      }
    }
  }

  function updatePlayer(dt) {
    if (!player || player.hp <= 0) return;
    var f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - stick.y;
    var s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.x;
    var mag = Math.hypot(f, s);
    if (mag > 1) { f /= mag; s /= mag; }
    var carrying = false;
    if (state.mode === 'tfc' && flags.red && flags.blue) {
      var enemy = player.team === 'red' ? flags.blue : flags.red;
      carrying = enemy && enemy.carrier === 'player';
    }
    var speed = 2.35 * (player.speed || 1);
    if (carrying && player.cls !== 'scout') speed *= 0.86;
    var dirX = Math.cos(player.ang);
    var dirY = Math.sin(player.ang);
    var moved = Math.abs(f) + Math.abs(s) > 0.05;
    if (moved) {
      tryMove(player, (dirX * f + -dirY * s) * speed * dt, (dirY * f + dirX * s) * speed * dt);
      walkPhase += dt * 9;
    }
    if (keys.ArrowLeft) player.ang -= 1.8 * dt;
    if (keys.ArrowRight) player.ang += 1.8 * dt;
    if (keys.ArrowUp) pitch = Math.max(-80, Math.min(80, pitch + 50 * dt));
    if (keys.ArrowDown) pitch = Math.max(-80, Math.min(80, pitch - 50 * dt));
    player.ang = (player.ang % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (player.cool > 0) player.cool -= dt;
    if (player.invul > 0) player.invul -= dt;
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) {
        var id = player.reloadId;
        var g = GUNS[id];
        var ammo = player.ammo[id];
        if (g && ammo) {
          var need = g.mag - ammo.mag;
          var take = Math.min(need, ammo.reserve);
          ammo.mag += take;
          ammo.reserve -= take;
        }
      }
    }
    var idNow = gunId();
    var gNow = GUNS[idNow];
    if (gNow && gNow.energy && player.ammo[idNow]) {
      player.ammo[idNow].mag = Math.min(gNow.mag, player.ammo[idNow].mag + dt * 2);
    }
    if (fireHeld && gNow && gNow.auto) pullTrigger();
    var here = cellAt(player.x, player.y);
    if (here === '~') {
      hazardAcc += dt;
      if (hazardAcc > 0.45) { hazardAcc = 0; hurtPlayer(6, 'Hazard'); }
    }
    if (here === '+' && player.hp < player.maxHp && state.mode === 'hl') {
      player.hp = Math.min(player.maxHp, player.hp + 28 * dt);
    }
    if (here === '*' && state.mode === 'hl' && player.suit < 100) {
      player.suit = Math.min(100, player.suit + 28 * dt);
    }
    if (useHeld && !useLatch) {
      useLatch = true;
      if (player.cls === 'engineer') placeSentry();
    }
    if (!useHeld) useLatch = false;
    if (state.mode === 'tfc') flagTouch(player, true);
    if (state.mode === 'cs' && bomb) updateBomb(dt);
  }

  function updateBomb(dt) {
    if (bomb.planted) {
      bomb.timer -= dt;
      if (bomb.timer <= 0) {
        if (Math.hypot(player.x - bomb.x, player.y - bomb.y) < 7) hurtPlayer(120, 'C4');
        for (var i = 0; i < bots.length; i++) {
          if (bots[i].hp > 0 && Math.hypot(bots[i].x - bomb.x, bots[i].y - bomb.y) < 7) damageEnt(bots[i], 200, 'ak');
        }
        endRound('t', 'The bomb exploded');
        return;
      }
    }
    var near = nearestSite(player);
    var onSite = near.dist < 1.25;
    if (!bomb.planted && bomb.carrier === 'player' && player.team === 't' && useHeld && onSite && player.hp > 0) {
      bomb.planting += dt;
      if (bomb.planting >= 1.25) {
        bomb.planted = true;
        bomb.timer = 20;
        bomb.x = player.x;
        bomb.y = player.y;
        bomb.carrier = null;
        bomb.planting = 0;
        feedLine(profile.name, 'ak', 'planted the bomb');
        tone(220, 0.2, 'square', 0.04);
      }
    } else if (!useHeld || !onSite) bomb.planting = Math.max(0, bomb.planting - dt);
    if (!bomb.planted && !bomb.carrier && player.team === 't' && player.hp > 0 && Math.hypot(player.x - bomb.x, player.y - bomb.y) < 0.8) {
      bomb.carrier = 'player';
      note('You picked up the C4');
    }
    if (bomb.planted && player.team === 'ct' && player.hp > 0 && useHeld && Math.hypot(player.x - bomb.x, player.y - bomb.y) < 1.2) {
      bomb.defusing += dt;
      var need = player.kit ? 1.7 : 3.4;
      if (bomb.defusing >= need) endRound('ct', 'The bomb was defused');
    } else bomb.defusing = Math.max(0, bomb.defusing - dt * 0.5);
  }

  function update(dt) {
    if (!player) return;
    if ($('play').hidden) return;
    flash = Math.max(0, flash - dt);
    swing = Math.max(0, swing - dt * 3);
    recoil = Math.max(0, recoil - dt * 3);
    hurtFlash = Math.max(0, hurtFlash - dt);
    for (var i = floats.length - 1; i >= 0; i--) {
      floats[i].life -= dt;
      floats[i].y -= 28 * dt;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
    if (state.phase === 'roundend') {
      state.endIn -= dt;
      if (state.endIn <= 0) resetRound();
      paintHud();
      return;
    }
    if (state.phase === 'clear') { paintHud(); return; }
    if (state.phase === 'dead') {
      if (state.mode !== 'cs' && player.respawnIn > 0) {
        player.respawnIn -= dt;
        if (player.respawnIn <= 0) respawn();
      }
      paintHud();
      return;
    }
    if (state.mode === 'cs' && $('buy').hidden) state.buyTime = Math.max(0, state.buyTime - dt);
    if (state.mode === 'cs' && state.phase === 'play') {
      state.roundTime -= dt;
      if (state.roundTime <= 0 && bomb && !bomb.planted) endRound('ct', 'Time expired');
    }
    if (scopeLevel && gun().scope) pitch += (0 - pitch) * Math.min(1, dt * 6);
    updatePlayer(dt);
    if (player.hp > 0 && state.phase === 'play') {
      updateMonsters(dt);
      updateBots(dt);
      updateSentries(dt);
      updateRockets(dt);
      updateFlags(dt);
      for (var d = 0; d < doors.length; d++) {
        if (doors[d].open) continue;
        var cx = doors[d].x + 0.5;
        var cy = doors[d].y + 0.5;
        if (Math.hypot(player.x - cx, player.y - cy) < 1.35) doors[d].open = true;
      }
    }
    pushPresence(false);
    flushHits();
    paintHud();
  }

  function paintHud() {
    var info = $('matchInfo');
    var ammo = $('ammoLine');
    if (!info || !player) return;
    var hp = Math.max(0, Math.round(player.hp));
    if (state.phase === 'clear' || state.phase === 'roundend') {
      info.textContent = state.endText || '';
    } else if (state.phase === 'dead') {
      info.textContent = state.mode === 'cs' ? 'ELIMINATED — wait for the round' : 'You died. Respawning…';
    } else if (state.mode === 'hl') {
      info.textContent = 'HEALTH ' + hp + ' | SUIT ' + Math.round(player.suit);
    } else if (state.mode === 'cs') {
      var clock = Math.max(0, Math.ceil(state.roundTime));
      var mm = Math.floor(clock / 60);
      var ss = String(clock % 60);
      if (ss.length < 2) ss = '0' + ss;
      var line = 'HP ' + hp + ' | ARMOR ' + Math.round(player.armor || 0) + ' | $' + profile.cash + ' | ' + mm + ':' + ss;
      if (bomb && bomb.planted) line += ' | BOMB 0:' + String(Math.max(0, Math.ceil(bomb.timer))).padStart(2, '0');
      else if (bomb && bomb.carrier === 'player') line += bomb.planting > 0 ? ' | PLANTING' : ' | C4';
      else if (bomb && bomb.defusing > 0) line += ' | DEFUSING';
      if (state.buyTime > 0) line += ' | BUY ' + Math.ceil(state.buyTime);
      info.textContent = line;
    } else {
      var cls = (player.cls || 'soldier').toUpperCase();
      var line2 = 'RED ' + score.red + ' : ' + score.blue + ' BLU | ' + cls + ' | HP ' + hp;
      if (flags.red && flags.blue) {
        var enemy = player.team === 'red' ? flags.blue : flags.red;
        if (enemy && enemy.carrier === 'player') line2 += ' | FLAG';
      }
      info.textContent = line2;
    }
    if (state.phase === 'dead') ammo.textContent = '';
    else ammo.textContent = ammoText() + (scopeLevel && gun().scope ? '  ' + (scopeLevel === 2 ? '4x' : '2x') : '');
  }

  function ammoText() {
    var id = gunId();
    var g = GUNS[id];
    if (!g) return '';
    if (g.melee) return g.name;
    var a = player.ammo[id];
    if (!a) return g.name;
    if (g.energy) return g.name + '  ' + Math.floor(a.mag);
    if (player.reloading > 0 && player.reloadId === id) return g.name + '  reloading';
    return g.name + '  ' + a.mag + ' | ' + a.reserve;
  }

  function updateCam() {
    cam.dirX = Math.cos(player.ang);
    cam.dirY = Math.sin(player.ang);
    var scale = scopeLevel === 2 ? 0.16 : scopeLevel === 1 ? 0.32 : 0.66;
    cam.planeX = -cam.dirY * scale;
    cam.planeY = cam.dirX * scale;
  }

  function project(wx, wy) {
    var dx = wx - player.x;
    var dy = wy - player.y;
    var inv = cam.planeX * cam.dirY - cam.dirX * cam.planeY;
    if (Math.abs(inv) < 0.0001) return null;
    var invDet = 1 / inv;
    var tx = invDet * (cam.dirY * dx - cam.dirX * dy);
    var ty = invDet * (-cam.planeY * dx + cam.planeX * dy);
    if (ty <= 0.08) return null;
    var view = $('view');
    return {
      x: Math.floor((view.width / 2) * (1 + tx / ty)),
      y: Math.floor(view.height / 2 + pitch),
      ty: ty,
      tx: tx
    };
  }

  function wallPaint(ch, side, stripe) {
    var table = {
      hl: ['#2f6470', '#16343c', '#214852'],
      cs: ['#d2b48a', '#8a6240', '#c49a62'],
      tfc: ['#a84848', '#5c2424', '#7a3030']
    }[state.mode] || ['#888', '#444', '#666'];
    if (ch === 'C') return stripe ? '#a56b3c' : (side ? '#6b4423' : '#8a5a30');
    if (ch === 'D') return stripe ? '#8a7040' : (side ? '#4a3a22' : '#6a5430');
    if (ch === '=') return side ? '#3a4550' : '#52606c';
    if (stripe) return table[0];
    return side ? table[1] : table[2];
  }

  function render() {
    var view = $('view');
    if (!view || !player) return;
    var ctx = view.getContext('2d');
    var w = view.width;
    var h = view.height;
    updateCam();
    var horizon = h / 2 + pitch;
    var ceil = state.mode === 'hl' ? '#101820' : state.mode === 'cs' ? '#e4c89a' : '#79b4e0';
    var floor = state.mode === 'hl' ? '#1c1a16' : state.mode === 'cs' ? '#c4a36a' : '#3c4a30';
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, w, Math.max(0, horizon));
    ctx.fillStyle = floor;
    ctx.fillRect(0, Math.max(0, horizon), w, h);
    var zbuf = new Float32Array(w);
    for (var i = 0; i < w; i++) zbuf[i] = 1e9;
    var dirX = cam.dirX;
    var dirY = cam.dirY;
    for (var x = 0; x < w; x++) {
      var cameraX = 2 * x / w - 1;
      var rayX = dirX + cam.planeX * cameraX;
      var rayY = dirY + cam.planeY * cameraX;
      var mapX = Math.floor(player.x);
      var mapY = Math.floor(player.y);
      var deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
      var deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
      var stepX, stepY, sideX, sideY;
      if (rayX < 0) { stepX = -1; sideX = (player.x - mapX) * deltaX; }
      else { stepX = 1; sideX = (mapX + 1 - player.x) * deltaX; }
      if (rayY < 0) { stepY = -1; sideY = (player.y - mapY) * deltaY; }
      else { stepY = 1; sideY = (mapY + 1 - player.y) * deltaY; }
      var hit = 0;
      var side = 0;
      var guard = 0;
      var tile = '#';
      while (!hit && guard++ < 48) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
        else { sideY += deltaY; mapY += stepY; side = 1; }
        if (mapY < 0 || mapX < 0 || mapY >= grid.length || mapX >= grid[0].length) { hit = 1; tile = '#'; break; }
        tile = grid[mapY][mapX];
        if (tile === '#' || tile === '=' || tile === 'C' || (tile === 'D' && !doorOpen(mapX, mapY))) hit = 1;
      }
      var perp;
      if (side === 0) perp = (mapX - player.x + (1 - stepX) / 2) / (rayX || 0.0001);
      else perp = (mapY - player.y + (1 - stepY) / 2) / (rayY || 0.0001);
      if (perp < 0.05) perp = 0.05;
      zbuf[x] = perp;
      var lineH = Math.min(h * 2, Math.floor(h / perp));
      var y0 = Math.floor((h - lineH) / 2 + pitch);
      var wallX = side === 0 ? player.y + perp * rayY : player.x + perp * rayX;
      wallX -= Math.floor(wallX);
      var stripe = (Math.floor(wallX * 8) % 2) === 0;
      ctx.globalAlpha = Math.max(0.28, 1 - perp / 16);
      ctx.fillStyle = wallPaint(tile, side, stripe);
      ctx.fillRect(x, y0, 1, lineH);
      ctx.globalAlpha = 1;
    }
    var sprites = [];
    function pushSprite(ent, color, size, label) {
      if (!ent || ent.hp <= 0) return;
      sprites.push({ x: ent.x, y: ent.y, color: color, size: size || 1, label: label || '', hp: ent.hp, maxHp: ent.maxHp || ent.hp });
    }
    monsters.forEach(function (m) {
      var color = m.kind === 'headcrab' ? '#e0c04a' : m.kind === 'turret' ? '#b5b5b5' : '#6fbf4a';
      pushSprite(m, color, m.kind === 'turret' ? 0.7 : 0.9, m.name);
    });
    bots.forEach(function (b) {
      var color = b.team === 'ct' ? '#3a74c4' : b.team === 't' ? '#d0843a' : b.team === 'red' ? '#d02828' : '#2a62d0';
      pushSprite(b, color, 1, b.name);
    });
    remotes.forEach(function (r) {
      var color = r.team === 'ct' ? '#8ec0ff' : r.team === 't' ? '#ffb060' : r.team === 'red' ? '#ff6868' : r.team === 'blue' ? '#68a0ff' : '#d0d0d0';
      pushSprite(r, color, 1, taggedName(r.uid, r.name));
    });
    sentries.forEach(function (s) { pushSprite(s, s.team === 'blue' ? '#7aa0c8' : '#c08080', 0.62, 'Sentry'); });
    rockets.forEach(function (r) { sprites.push({ x: r.x, y: r.y, color: '#f0e080', size: 0.28, label: '' }); });
    decals.forEach(function (d) {
      var color = d.kind === 'health' ? '#3ddc6a' : d.kind === 'suit' ? '#4ab0ff' : '#cc3333';
      sprites.push({ x: d.x, y: d.y, color: color, size: d.kind === 'hazard' ? 0.35 : 0.5, label: '' });
    });
    sites.forEach(function (s) { sprites.push({ x: s.x, y: s.y, color: '#ff9900', size: 0.35, label: 'A' }); });
    if (bomb && (bomb.planted || !bomb.carrier)) sprites.push({ x: bomb.x, y: bomb.y, color: '#ff6600', size: 0.45, label: 'C4' });
    if (flags.red) sprites.push({ x: flags.red.x, y: flags.red.y, color: '#e02020', size: 0.8, label: 'RED' });
    if (flags.blue) sprites.push({ x: flags.blue.x, y: flags.blue.y, color: '#2060e8', size: 0.8, label: 'BLU' });
    for (var s = 0; s < sprites.length; s++) {
      var sp = sprites[s];
      var dx = sp.x - player.x;
      var dy = sp.y - player.y;
      var inv = cam.planeX * cam.dirY - cam.dirX * cam.planeY;
      if (Math.abs(inv) < 0.0001) continue;
      var invDet = 1 / inv;
      var tx = invDet * (cam.dirY * dx - cam.dirX * dy);
      var ty = invDet * (-cam.planeY * dx + cam.planeX * dy);
      if (ty <= 0.08) continue;
      var screenX = Math.floor((w / 2) * (1 + tx / ty));
      var spriteH = Math.abs(Math.floor(h / ty)) * sp.size;
      var spriteW = spriteH * 0.55;
      var y0 = Math.floor(h / 2 - spriteH / 2 + pitch);
      var x0 = Math.floor(screenX - spriteW / 2);
      ctx.globalAlpha = Math.max(0.4, 1 - ty / 16);
      for (var stripe = Math.max(0, x0); stripe < Math.min(w, x0 + spriteW); stripe++) {
        if (ty >= zbuf[stripe]) continue;
        var local = (stripe - x0) / spriteW;
        ctx.fillStyle = local > 0.35 && local < 0.65 ? shadeHex(sp.color) : '#111';
        ctx.fillRect(stripe, y0, 1, spriteH);
        if (local > 0.4 && local < 0.6) {
          ctx.fillStyle = sp.color;
          ctx.fillRect(stripe, y0, 1, Math.max(2, spriteH * 0.28));
        }
      }
      ctx.globalAlpha = 1;
      if (sp.label && ty < 10) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sp.label, screenX, y0 - 2);
      }
    }
    drawGun(ctx, w, h);
    drawRadar(ctx);
    if (hurtFlash > 0) {
      ctx.fillStyle = 'rgba(180, 0, 0, ' + Math.min(0.45, hurtFlash) + ')';
      ctx.fillRect(0, 0, 4, h);
      ctx.fillRect(w - 4, 0, 4, h);
      ctx.fillRect(0, 0, w, 4);
      ctx.fillRect(0, h - 4, w, 4);
    }
    for (var f = 0; f < floats.length; f++) {
      ctx.globalAlpha = Math.max(0, floats[f].life);
      ctx.fillStyle = floats[f].color;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(floats[f].text, floats[f].x, floats[f].y);
    }
    ctx.globalAlpha = 1;
    if (scopeLevel && gun().scope) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, scopeLevel === 2 ? 58 : 72, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#d8d8d8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 40, h / 2);
      ctx.lineTo(w / 2 + 40, h / 2);
      ctx.moveTo(w / 2, h / 2 - 40);
      ctx.lineTo(w / 2, h / 2 + 40);
      ctx.stroke();
    } else {
      var hy = h / 2 + pitch * 0.15;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w / 2 - 5, hy, 10, 1);
      ctx.fillRect(w / 2, hy - 5, 1, 10);
    }
    drawStick();
  }

  function shadeHex(hex) {
    return hex;
  }

  function drawGun(ctx, w, h) {
    var id = gunId();
    var bob = reduceMotion ? 0 : Math.sin(walkPhase) * 3;
    var kick = recoil * 16;
    ctx.save();
    ctx.translate(w * 0.68, h - 6 + bob - kick);
    if (id === 'crowbar' || id === 'knife' || id === 'wrench') {
      ctx.rotate(-0.7 - swing * 0.9);
      ctx.fillStyle = id === 'wrench' ? '#c0c0c0' : '#cc1e1e';
      ctx.fillRect(-5, -78, 10, 84);
      ctx.fillStyle = '#777';
      ctx.fillRect(-7, -10, 14, 16);
    } else if (id === 'rocket') {
      ctx.fillStyle = '#3f7a38';
      ctx.fillRect(-16, -58, 28, 18);
      ctx.fillRect(-8, -40, 14, 36);
      if (flash > 0) { ctx.fillStyle = '#ffcc66'; ctx.fillRect(-18, -70, 20, 14); }
    } else if (id === 'mini') {
      ctx.fillStyle = '#8d979b';
      ctx.fillRect(-28, -36, 48, 22);
      ctx.fillRect(-8, -18, 16, 22);
      if (flash > 0) { ctx.fillStyle = '#ffe080'; ctx.fillRect(-36, -34, 12, 10); }
    } else if (id === 'awp') {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-8, -92, 8, 88);
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(-14, -30, 20, 12);
    } else if (id === 'tau') {
      ctx.fillStyle = '#e07020';
      ctx.fillRect(-12, -70, 22, 16);
      ctx.fillRect(-6, -54, 12, 40);
      if (flash > 0) { ctx.fillStyle = '#fff2a0'; ctx.fillRect(-10, -86, 18, 16); }
    } else if (id === 'shot') {
      ctx.fillStyle = '#7a4a28';
      ctx.fillRect(-10, -78, 14, 70);
      ctx.fillRect(-16, -28, 24, 12);
      if (flash > 0) { ctx.fillStyle = '#ffe080'; ctx.fillRect(-8, -90, 12, 12); }
    } else {
      ctx.fillStyle = id === 'deagle' ? '#d8d8d8' : id === 'ak' ? '#6a3a22' : '#4d5a34';
      ctx.fillRect(-8, -64, 12, 52);
      ctx.fillRect(-18, -24, 22, 12);
      if (flash > 0) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-6, -78, 10, 14); }
    }
    ctx.restore();
  }

  function drawRadar(ctx) {
    ctx.fillStyle = 'rgba(0, 16, 0, 0.55)';
    ctx.fillRect(6, 6, 52, 52);
    ctx.strokeStyle = '#39ff6a';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, 52, 52);
    function dot(wx, wy, color) {
      var dx = wx - player.x;
      var dy = wy - player.y;
      var forward = dx * Math.cos(player.ang) + dy * Math.sin(player.ang);
      var right = dx * -Math.sin(player.ang) + dy * Math.cos(player.ang);
      var px = 32 + right * 3;
      var py = 32 - forward * 3;
      if (px < 8 || py < 8 || px > 56 || py > 56) return;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, 2, 2);
    }
    monsters.forEach(function (m) { if (m.hp > 0) dot(m.x, m.y, '#e0c04a'); });
    bots.forEach(function (b) { if (b.hp > 0) dot(b.x, b.y, b.team === player.team ? '#7ec8ff' : '#ff5555'); });
    remotes.forEach(function (r) { if (r.hp > 0) dot(r.x, r.y, '#ffffff'); });
    if (bomb && bomb.planted) dot(bomb.x, bomb.y, '#ff9900');
    ctx.fillStyle = '#b6ff6a';
    ctx.fillRect(31, 31, 3, 3);
  }

  function drawStick() {
    var c = $('stick');
    if (!c) return;
    var g = c.getContext('2d');
    var w = c.width;
    var h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    g.beginPath();
    g.arc(w / 2, h / 2, 36, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#39ff14';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#e6e6e6';
    g.beginPath();
    g.arc(w / 2 + stick.x * 22, h / 2 + stick.y * 22, 14, 0, Math.PI * 2);
    g.fill();
  }

  var loopGen = 0;
  function ensureLoop() {
    if (document.hidden || looping) return;
    looping = true;
    var gen = ++loopGen;
    lastT = 0;
    var tick = function (t) {
      if (!looping || gen !== loopGen || document.hidden) { looping = false; return; }
      var dt = 0.016;
      if (lastT) dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      try {
        update(dt);
        if (player && !$('play').hidden) render();
      } catch (err) {
        console.error(err);
        var info = $('matchInfo');
        if (info) info.textContent = 'Match error';
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      looping = false;
      loopGen += 1;
      if (audioCtx.ac && audioCtx.ac.suspend) audioCtx.ac.suspend();
      return;
    }
    if (audioCtx.ac && profile.sound && audioCtx.ac.resume) audioCtx.ac.resume();
    if (state.phase === 'play' && player) ensureLoop();
  });

  function paintPicks() {
    var teams = document.querySelectorAll('#lobby [data-team]');
    for (var i = 0; i < teams.length; i++) {
      teams[i].classList.toggle('is-on', teams[i].getAttribute('data-team') === state.pickTeam);
    }
    var classes = document.querySelectorAll('#lobby [data-class]');
    for (var j = 0; j < classes.length; j++) {
      classes[j].classList.toggle('is-on', classes[j].getAttribute('data-class') === state.pickClass);
    }
  }

  function openBuy() {
    if (state.mode !== 'cs' || !player) return;
    $('buy').hidden = false;
    $('cashLine').textContent = '$' + profile.cash;
    $('buyNote').textContent = state.buyTime > 0 ? 'Buy time ' + Math.ceil(state.buyTime) + 's' : 'Buy time is over';
    var buttons = document.querySelectorAll('[data-buy]');
    for (var i = 0; i < buttons.length; i++) {
      var id = buttons[i].getAttribute('data-buy');
      buttons[i].classList.toggle('is-poor', profile.cash < SHOP[id].cost || state.buyTime <= 0);
    }
  }

  function buyItem(id) {
    if (state.mode !== 'cs' || !player || !SHOP[id]) return;
    if (state.phase !== 'play' || state.buyTime <= 0) { note('Buy time is over'); return; }
    var item = SHOP[id];
    if (profile.cash < item.cost) { note('Not enough cash'); return; }
    profile.cash -= item.cost;
    if (item.slot === 'primary') {
      player.guns = player.guns.filter(function (g) { return g === 'knife' || g === 'pistol' || g === 'deagle'; });
      player.guns.push(id);
      player.wpn = player.guns.indexOf(id);
    } else if (item.slot === 'side') {
      player.guns = player.guns.filter(function (g) { return g !== 'pistol' && g !== 'deagle'; });
      var knifeAt = player.guns.indexOf('knife');
      player.guns.splice(knifeAt + 1, 0, id);
      player.wpn = player.guns.indexOf(id);
    } else if (item.slot === 'armor') {
      player.armor = 100;
      player.helmet = true;
    } else if (item.slot === 'kit') player.kit = true;
    if (GUNS[id]) {
      player.ammo[id] = { mag: GUNS[id].mag, reserve: GUNS[id].reserve };
    }
    saveProfile();
    note('Bought ' + item.name);
    openBuy();
    paintHud();
  }

  function toggleSound(btn) {
    profile.sound = !profile.sound;
    saveProfile();
    var label = profile.sound ? 'Sound on' : 'Sound off';
    $('sndBrowser').textContent = label;
    $('sndBrowser').setAttribute('aria-pressed', profile.sound ? 'true' : 'false');
    $('sndPlay').textContent = label;
    $('sndPlay').setAttribute('aria-pressed', profile.sound ? 'true' : 'false');
    if (profile.sound) {
      audioCtx();
      tone(660, 0.06, 'square', 0.03);
    }
  }

  function onPlayers(snap) {
    var counts = { hl: 0, cs: 0, tfc: 0 };
    var next = [];
    var prev = {};
    for (var i = 0; i < remotes.length; i++) prev[remotes[i].uid] = remotes[i];
    snap.forEach(function (child) {
      var v = child.val();
      if (!v || child.key === net.uid) return;
      if (counts[v.mode] !== undefined) counts[v.mode] += 1;
      if (!state.mode || v.mode !== state.mode) return;
      if (typeof v.updatedAt === 'number' && Date.now() - v.updatedAt > 20000) return;
      var ent = prev[child.key] || { uid: child.key, kind: 'remote', hp: v.hp, credited: false, hurtUntil: 0 };
      ent.name = String(v.name || 'Rival').slice(0, 16);
      ent.team = v.team;
      ent.x = Number(v.x) || ent.x || 0;
      ent.y = Number(v.y) || ent.y || 0;
      ent.weapon = v.weapon;
      if (!ent.hurtUntil || Date.now() > ent.hurtUntil) {
        if (Number(v.hp) > 40 && ent.credited) ent.credited = false;
        ent.hp = Number(v.hp);
      } else ent.hp = Math.min(ent.hp, Number(v.hp));
      ent.maxHp = 100;
      next.push(ent);
    });
    remotes = next;
    net.counts = counts;
    ['hl', 'cs', 'tfc'].forEach(function (mode) {
      var el = $('pop-' + mode);
      if (!el) return;
      el.textContent = net.ok ? String(counts[mode]) + ' online' : 'bots';
    });
  }

  function onBoard(snap) {
    var rows = [];
    snap.forEach(function (child) {
      var v = child.val();
      if (!v) return;
      rows.push({ uid: child.key, name: v.name, frags: v.frags });
    });
    rows.sort(function (a, b) { return (b.frags || 0) - (a.frags || 0); });
    var list = $('boardList');
    if (!list) return;
    list.textContent = '';
    if (!rows.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No frags posted yet. Yours: ' + profile.frags;
      list.appendChild(empty);
      return;
    }
    rows.slice(0, 8).forEach(function (row) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = row.name || 'Rookie';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(span, row.uid);
      li.appendChild(span);
      li.appendChild(document.createTextNode(' — ' + row.frags + ' frags'));
      list.appendChild(li);
    });
  }

  function pushPresence(force) {
    if (!net.ok || !net.uid || !player || typeof firebase === 'undefined') return;
    if (!force && Date.now() - net.last < 200) return;
    if (state.phase === 'browser') return;
    net.last = Date.now();
    var db = firebase.database();
    db.ref('fps/srate/' + net.uid).set(firebase.database.ServerValue.TIMESTAMP).then(function () {
      return db.ref('fps/players/' + net.uid).set({
        name: profile.name,
        mode: state.mode,
        team: player.team || 'none',
        cls: player.cls || '',
        x: Math.round(player.x * 100) / 100,
        y: Math.round(player.y * 100) / 100,
        ang: Math.round(player.ang * 1000) / 1000,
        hp: Math.max(0, Math.min(400, Math.round(player.hp))),
        weapon: gunId(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }).catch(function (err) {
      if (err && err.code === 'PERMISSION_DENIED') realmDown();
    });
  }

  function flushHits() {
    if (!net.ok || !net.uid || typeof firebase === 'undefined') return;
    var ids = Object.keys(hitQueue);
    if (!ids.length || Date.now() - net.lastHit < 140) return;
    net.lastHit = Date.now();
    var target = ids[0];
    var dmg = Math.max(1, Math.min(120, Math.round(hitQueue[target])));
    delete hitQueue[target];
    var db = firebase.database();
    db.ref('fps/hrate/' + net.uid).set(firebase.database.ServerValue.TIMESTAMP).then(function () {
      var id = db.ref('fps/inbox/' + target).push().key;
      return db.ref('fps/inbox/' + target + '/' + id).set({
        from: net.uid,
        dmg: dmg,
        mode: state.mode,
        t: firebase.database.ServerValue.TIMESTAMP
      });
    }).catch(function (err) {
      if (err && err.code === 'PERMISSION_DENIED') realmDown();
    });
  }

  function pushBoard() {
    if (!net.ok || !net.uid || typeof firebase === 'undefined') return;
    var db = firebase.database();
    db.ref('fps/srate/' + net.uid).set(firebase.database.ServerValue.TIMESTAMP).then(function () {
      return db.ref('fps/leaderboard/' + net.uid).set({
        name: profile.name,
        frags: profile.frags,
        deaths: profile.deaths,
        mode: state.mode || 'hl',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }).catch(function () {});
  }

  function watchInbox() {
    if (!net.ok || !net.uid || net.inboxOn || typeof firebase === 'undefined') return;
    net.inboxOn = true;
    firebase.database().ref('fps/inbox/' + net.uid).on('child_added', function (snap) {
      var v = snap.val();
      if (v && v.mode === state.mode && player && state.phase === 'play') hurtPlayer(v.dmg || 1, 'Rival');
      snap.ref.remove().catch(function () {});
    }, function () {});
  }

  function listenNet() {
    if (net.listened || !net.uid || typeof firebase === 'undefined') return;
    net.listened = true;
    var db = firebase.database();
    db.ref('fps/players').on('value', onPlayers, function () { realmDown(); });
    db.ref('fps/leaderboard').on('value', onBoard, function () {});
    db.ref('fps/players/' + net.uid).onDisconnect().remove().catch(function () {});
    watchInbox();
  }

  function bootNet() {
    try {
      if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG) { realmDown(); return; }
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
      firebase.auth().onAuthStateChanged(function (user) {
        net.user = user;
        net.uid = user ? user.uid : null;
        var owner = !!(user && user.email === OWNER);
        $('ownerTools').hidden = !owner;
        if (!window.MONDO_MEMBER) $('ownerBtn').textContent = owner ? 'Sign out' : 'Owner sign in';
        if (!user) firebase.auth().signInAnonymously().catch(function () { realmDown(); });
        else listenNet();
      });
    } catch (err) { realmDown(); }
  }

  function wipe(path) {
    if (typeof firebase === 'undefined') return;
    var ref = firebase.database().ref(path);
    ref.once('value').then(function (snap) {
      var updates = {};
      snap.forEach(function (child) { updates[child.key] = null; });
      if (Object.keys(updates).length) return ref.update(updates);
    }).then(function () { note('Cleared'); }).catch(function () { note('Could not clear'); });
  }

  function bind() {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('pname').value = profile.name;
    paintStats();
    var servers = document.querySelectorAll('.srv');
    for (var i = 0; i < servers.length; i++) {
      servers[i].addEventListener('click', function () { connect(this.getAttribute('data-mode')); });
    }
    var teamButtons = document.querySelectorAll('#lobby [data-team]');
    for (var t = 0; t < teamButtons.length; t++) {
      teamButtons[t].addEventListener('click', function () {
        state.pickTeam = this.getAttribute('data-team');
        paintPicks();
      });
    }
    var classButtons = document.querySelectorAll('#lobby [data-class]');
    for (var c = 0; c < classButtons.length; c++) {
      classButtons[c].addEventListener('click', function () {
        state.pickClass = this.getAttribute('data-class');
        paintPicks();
      });
    }
    $('deploy').addEventListener('click', deploy);
    $('lobbyBack').addEventListener('click', function () {
      if (state.live && state.resume) showPlay();
      else disconnect();
    });
    $('disc').addEventListener('click', disconnect);
    $('replay').addEventListener('click', function () { $('replay').hidden = true; startMatch(); });
    $('sndBrowser').addEventListener('click', toggleSound);
    $('sndPlay').addEventListener('click', toggleSound);
    $('btnFire').addEventListener('pointerdown', function (e) { e.preventDefault(); fireHeld = true; pullTrigger(); });
    $('btnFire').addEventListener('pointerup', function () { fireHeld = false; });
    $('btnFire').addEventListener('pointerleave', function () { fireHeld = false; });
    $('btnAim').addEventListener('click', toggleScope);
    $('btnReload').addEventListener('click', startReload);
    $('btnNext').addEventListener('click', nextWeapon);
    $('btnSpecial').addEventListener('click', function () {
      if (state.mode === 'cs') { if ($('buy').hidden) openBuy(); else $('buy').hidden = true; }
      else if (state.mode === 'tfc') openLobby(true);
      else { player.wpn = 0; scopeLevel = 0; }
    });
    $('btnUse').addEventListener('pointerdown', function (e) { e.preventDefault(); useHeld = true; });
    $('btnUse').addEventListener('pointerup', function () { useHeld = false; });
    $('btnUse').addEventListener('pointerleave', function () { useHeld = false; });
    $('buyClose').addEventListener('click', function () { $('buy').hidden = true; });
    var buys = document.querySelectorAll('[data-buy]');
    for (var b = 0; b < buys.length; b++) {
      buys[b].addEventListener('click', function () { buyItem(this.getAttribute('data-buy')); });
    }
    var view = $('view');
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button === 2) { toggleScope(); return; }
      look.on = true;
      look.x = e.clientX;
      look.y = e.clientY;
      look.id = e.pointerId;
      view.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse' && e.button === 0) { fireHeld = true; pullTrigger(); }
    });
    view.addEventListener('pointermove', function (e) {
      if (!look.on || e.pointerId !== look.id) return;
      var dx = e.clientX - look.x;
      var dy = e.clientY - look.y;
      look.x = e.clientX;
      look.y = e.clientY;
      if (!player) return;
      player.ang += dx * 0.005;
      pitch = Math.max(-80, Math.min(80, pitch - dy * 0.35));
    });
    view.addEventListener('pointerup', function (e) {
      look.on = false;
      if (e.pointerType === 'mouse') fireHeld = false;
    });
    view.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    view.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    var stickCv = $('stick');
    function stickAt(e) {
      var rect = stickCv.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * stickCv.width;
      var y = ((e.clientY - rect.top) / rect.height) * stickCv.height;
      var dx = (x - stickCv.width / 2) / 28;
      var dy = (y - stickCv.height / 2) / 28;
      var m = Math.hypot(dx, dy) || 1;
      if (m > 1) { dx /= m; dy /= m; }
      stick.x = dx;
      stick.y = dy;
      stick.on = true;
    }
    stickCv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      stickCv.setPointerCapture(e.pointerId);
      stickAt(e);
    });
    stickCv.addEventListener('pointermove', function (e) { if (stick.on) stickAt(e); });
    function stickOff() { stick.on = false; stick.x = 0; stick.y = 0; }
    stickCv.addEventListener('pointerup', stickOff);
    stickCv.addEventListener('pointercancel', stickOff);
    stickCv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!state.live || $('play').hidden) return;
      keys[e.code] = true;
      var swallow = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'KeyB', 'KeyQ'];
      if (swallow.indexOf(e.code) >= 0) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Space') { fireHeld = true; pullTrigger(); }
      if (e.code === 'KeyR') startReload();
      if (e.code === 'KeyQ' || e.code === 'KeyG') nextWeapon();
      if (e.code === 'KeyE') useHeld = true;
      if (e.code === 'KeyB') $('btnSpecial').click();
      if (e.code === 'Escape') $('buy').hidden = true;
    });
    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
      if (e.code === 'Space') fireHeld = false;
      if (e.code === 'KeyE') useHeld = false;
    });
    window.addEventListener('blur', function () { keys = {}; fireHeld = false; useHeld = false; stickOff(); });
    $('ownerBtn').addEventListener('click', function () {
      if (net.user && net.user.email) {
        firebase.auth().signOut().then(function () { return firebase.auth().signInAnonymously(); }).catch(function () {});
        return;
      }
      $('ownerError').hidden = true;
      $('ownerDialog').showModal();
    });
    $('ownerCancel').addEventListener('click', function () { $('ownerDialog').close(); });
    $('ownerForm').addEventListener('submit', function (e) {
      e.preventDefault();
      $('ownerError').hidden = true;
      firebase.auth().signInWithEmailAndPassword($('ownerEmail').value.trim(), $('ownerPass').value).then(function () {
        $('ownerDialog').close();
      }).catch(function () {
        $('ownerError').hidden = false;
        $('ownerError').textContent = 'Sign-in failed. Check the email and password.';
      });
    });
    $('clearBoard').addEventListener('click', function () { wipe('fps/leaderboard'); });
    $('clearArena').addEventListener('click', function () { wipe('fps/players'); });
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function snapshot() {
    return {
      mode: state.mode,
      phase: state.phase,
      hp: player ? Math.round(player.hp) : 0,
      suit: player ? Math.round(player.suit || 0) : 0,
      armor: player ? Math.round(player.armor || 0) : 0,
      maxHp: player ? player.maxHp : 0,
      cash: profile.cash,
      weapon: player ? gunId() : '',
      guns: player ? player.guns.slice() : [],
      team: player ? player.team : '',
      cls: player ? player.cls : '',
      frags: profile.frags,
      x: player ? player.x : 0,
      y: player ? player.y : 0,
      enemies: monsters.filter(function (m) { return m.hp > 0; }).map(function (m) {
        return { name: m.name, hp: m.hp, x: m.x, y: m.y, kind: m.kind };
      }),
      bots: bots.filter(function (b) { return b.hp > 0; }).length,
      buyTime: state.buyTime,
      bomb: bomb ? { planted: !!bomb.planted, timer: bomb.timer, planting: bomb.planting, carrier: bomb.carrier } : null,
      score: { red: score.red, blue: score.blue },
      rockets: rockets.length,
      sentries: sentries.filter(function (s) { return s.hp > 0; }).length,
      scope: scopeLevel === 2 ? 4 : scopeLevel === 1 ? 2 : 0,
      info: $('matchInfo') ? $('matchInfo').textContent : '',
      ammo: $('ammoLine') ? $('ammoLine').textContent : '',
      sites: sites.map(function (s) { return { x: s.x, y: s.y }; }),
      endText: state.endText
    };
  }

  bind();
  bootNet();

  window.MONDO_FPS = {
    connect: connect,
    deploy: deploy,
    disconnect: disconnect,
    setTeam: function (team) { state.pickTeam = team; paintPicks(); },
    setClass: function (cls) { state.pickClass = cls; paintPicks(); },
    buy: buyItem,
    openBuy: openBuy,
    fire: pullTrigger,
    next: nextWeapon,
    aim: toggleScope,
    use: function (down) { useHeld = !!down; },
    hold: function (code, down) {
      keys[code] = !!down;
      if (code === 'KeyE') useHeld = !!down;
      if (code === 'Space') { fireHeld = !!down; if (down) pullTrigger(); }
    },
    teleport: function (x, y) { if (player) { player.x = x; player.y = y; } },
    face: function (x, y) { if (player) player.ang = Math.atan2(y - player.y, x - player.x); },
    snapshot: snapshot
  };
})();
