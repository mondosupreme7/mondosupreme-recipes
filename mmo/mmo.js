/* World of MondoCraft. Pixel combat realm. Sound stays off. Saved in mondosupreme.mmo.v1. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.mmo.v1';
  var TILE = 32;
  var BOSS_MAX = 900;
  var NAME_RE = /^[A-Za-z][A-Za-z0-9 ]{0,15}$/;
  var $ = function (id) { return document.getElementById(id); };

  var ITEMS = {
    poker: { name: 'Dented Candle Poker', slot: 'weapon', rarity: 'uncommon', dmg: 3, gs: 4 },
    cloak: { name: 'Goldhaven Cloak', slot: 'chest', rarity: 'uncommon', hp: 12, gs: 5 },
    shiv: { name: 'Bandit Shiv', slot: 'weapon', rarity: 'rare', dmg: 7, gs: 12 },
    cleaver: { name: 'Crossroads Cleaver', slot: 'weapon', rarity: 'rare', dmg: 10, gs: 18 },
    thunder: { name: 'Thunderfury, Blessed Blade of the Supreme', slot: 'weapon', rarity: 'epic', dmg: 22, gs: 80 }
  };
  var Q = {
    candle: { giver: 'marshal', title: 'You No Take Candle', text: 'Kobold Candle Snatchers are hauling off every candle in Goldhaven Shire. Marshal wants four of them stopped.', obj: 'Kobold Candle Snatchers', need: 4, xp: 80, gold: 8, item: 'poker', unlock: 'wolves' },
    wolves: { giver: 'marshal', title: 'Prowlers on the Road', text: 'Forest Wolves have been pacing the Goldhaven road. Cull three of them.', obj: 'Forest Wolves', need: 3, xp: 90, gold: 8, item: 'cloak', unlock: 'defias' },
    defias: { giver: 'marshal', title: 'Bandits at the Bend', text: 'Defias Bandits are working the east road. Defeat three and bring the shire some quiet.', obj: 'Defias Bandits', need: 3, xp: 120, gold: 12, item: 'shiv' },
    hunt: { giver: 'warchief', title: 'Crossroads Cull', text: 'The Barren Crossroads is overrun. Slay 4 Sunscale Raptors and 3 Bristleback Boars.', obj: 'Crossroads game', need: 7, xp: 200, gold: 20, item: 'cleaver' },
    fire: { giver: 'warchief', title: 'By Fire Be Purged', text: 'Ragnorak the Firelord stirs in the Molten Core Lair. End him.', obj: 'Ragnorak the Firelord', need: 1, xp: 400, gold: 50, item: 'thunder' }
  };
  var QORDER = ['candle', 'wolves', 'defias', 'hunt', 'fire'];
  var CLASSES = {
    warrior: {
      res: 'rage', label: 'Warrior',
      abilities: [
        { id: 'charge', name: 'Charge', cost: 0, cd: 4000, range: 220, dmg: 2.4, rageGain: 20 },
        { id: 'heroic', name: 'Heroic Strike', cost: 15, cd: 2500, range: 48, dmg: 1.7 },
        { id: 'whirl', name: 'Whirlwind', cost: 25, cd: 8000, aoe: 72, dmg: 1.2 },
        { id: 'wall', name: 'Shield Wall', cost: 10, cd: 20000, buff: 'wall', dur: 6000 }
      ]
    },
    mage: {
      res: 'mana', label: 'Mage',
      abilities: [
        { id: 'frost', name: 'Frostbolt', cost: 8, cd: 1500, range: 220, dmg: 1.5 },
        { id: 'fire', name: 'Fireball', cost: 14, cd: 2500, range: 220, dmg: 2.2 },
        { id: 'nova', name: 'Frost Nova', cost: 12, cd: 10000, buff: 'nova' },
        { id: 'intel', name: 'Arcane Intellect', cost: 16, cd: 20000, buff: 'intel', dur: 20000 }
      ]
    },
    paladin: {
      res: 'mana', label: 'Paladin',
      abilities: [
        { id: 'crusader', name: 'Crusader Strike', cost: 8, cd: 2000, range: 48, dmg: 1.5 },
        { id: 'judge', name: 'Judgment', cost: 10, cd: 2500, range: 200, dmg: 1.6 },
        { id: 'light', name: 'Holy Light', cost: 18, cd: 4000, heal: true },
        { id: 'bubble', name: 'Divine Shield', cost: 15, cd: 30000, buff: 'bubble', dur: 4000 }
      ]
    },
    rogue: {
      res: 'energy', label: 'Rogue',
      abilities: [
        { id: 'sinister', name: 'Sinister Strike', cost: 25, cd: 1200, range: 48, dmg: 1.2 },
        { id: 'evisc', name: 'Eviscerate', cost: 35, cd: 1500, range: 48, dmg: 1 },
        { id: 'sprint', name: 'Sprint', cost: 10, cd: 20000, buff: 'sprint', dur: 6000 },
        { id: 'vanish', name: 'Vanish', cost: 20, cd: 25000, buff: 'vanish', dur: 4000 }
      ]
    }
  };
  var BLURB = {
    warrior: 'Rage builds as you fight. Charge in, then spend it on Heroic Strike, Whirlwind, and Shield Wall.',
    mage: 'Mana fuels Frostbolt and Fireball. Frost Nova roots a pack. Arcane Intellect sharpens every hit.',
    paladin: 'Crusader Strike and Judgment smite foes. Holy Light mends you or a nearby ally. Divine Shield saves you.',
    rogue: 'Energy returns quickly. Sinister Strike builds combo points. Eviscerate spends them. Sprint and Vanish get you out.'
  };
  var ZONES = {
    goldhaven: { name: 'Elwynn / Goldhaven Shire', sub: 'Lv 1–4' },
    crossroads: { name: 'The Barren Crossroads', sub: 'Lv 4–8' },
    molten: { name: 'Molten Core Lair', sub: 'Raid' }
  };
  var LINKS = {
    'goldhaven:R': { zone: 'crossroads', side: 'L' },
    'crossroads:L': { zone: 'goldhaven', side: 'R' },
    'crossroads:R': { zone: 'molten', side: 'L' },
    'molten:L': { zone: 'crossroads', side: 'R' }
  };
  var MAPS = {
    goldhaven: [
      '################################',
      '#~~~~..K.....T.....K.....W.....#',
      '#~~~~.....W......T......K......#',
      '#.M..K.......D......W..........#',
      '#..............D....K..........#',
      '#,,,,,,,,,,,,,,,,,,,,,,,,,,>,,.#',
      '#.K...T....W......D............#',
      '#@....W....K....T......W.......#',
      '#.....T..........K......D......#',
      '#..K......W......T......D......#',
      '#......D......K......W.........#',
      '#..W......T......K.............#',
      '################################'
    ],
    crossroads: [
      '################################',
      '#<,,,,,,,,,,,,,,,,,,,,,,,,,,>,.#',
      '#.....R.....B.....R.....B......#',
      '#.C......B......R......B.......#',
      '#....R......B......R...........#',
      '#..B.....R......B......R.......#',
      '#..............................#',
      '#..R......B......R......B......#',
      '################################'
    ],
    molten: [
      '################################',
      '#<,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
      '#..............F...............#',
      '#~~~~~~~~~..............~~~~~~~#',
      '#~~~~~~~~~..............~~~~~~~#',
      '#...~~~~~~~~~~~~~~~~~~~~~~~~...#',
      '#..............................#',
      '################################'
    ]
  };
  var KIND = {
    K: { kind: 'kobold', name: 'Kobold Candle Snatcher', hp: 22, dmg: 4, xp: 14, gold: 1, level: 1, hostile: true },
    W: { kind: 'wolf', name: 'Forest Wolf', hp: 36, dmg: 6, xp: 18, gold: 2, level: 2, hostile: true },
    D: { kind: 'defias', name: 'Defias Bandit', hp: 48, dmg: 7, xp: 24, gold: 3, level: 3, hostile: true },
    R: { kind: 'raptor', name: 'Sunscale Raptor', hp: 70, dmg: 9, xp: 32, gold: 4, level: 5, hostile: true },
    B: { kind: 'boar', name: 'Bristleback Boar', hp: 64, dmg: 8, xp: 28, gold: 3, level: 4, hostile: true },
    F: { kind: 'boss', name: 'Ragnorak the Firelord', hp: BOSS_MAX, dmg: 7, xp: 220, gold: 30, level: 10, hostile: true, boss: true },
    M: { kind: 'npc', name: 'Marshal', giver: 'marshal', hostile: false, hp: 1, level: 20 },
    C: { kind: 'npc', name: 'Warchief', giver: 'warchief', hostile: false, hp: 1, level: 20 }
  };

  var player = null;
  var playing = false;
  var zoneId = 'goldhaven';
  var world = null;
  var ents = [];
  var bots = [];
  var remoteAll = [];
  var floats = [];
  var fires = [];
  var logs = [];
  var keys = {};
  var joy = { x: 0, y: 0, on: false };
  var cam = { x: 0, y: 0 };
  var dest = null;
  var targetId = null;
  var cd = {};
  var autoOn = false;
  var autoAt = 0;
  var potionAt = 0;
  var lastCombat = 0;
  var portalLock = 0;
  var idSeq = 1;
  var factionPick = '';
  var classPick = '';
  var dialogQuest = '';
  var yellTimer = 0;
  var saveTimer = 0;
  var lastRemote = 0;
  var presenceAt = 0;
  var myUid = '';
  var myUser = null;
  var realmLive = false;
  var realmDead = false;
  var heardPlayers = false;
  var seenChat = {};
  var hall = {};
  var lastSay = 0;
  var loopOn = false;
  var canvas, ctx, joyCanvas, joyCtx;

  function freshQuests() {
    return {
      candle: { s: 'a', n: 0 },
      wolves: { s: 'l', n: 0 },
      defias: { s: 'l', n: 0 },
      hunt: { s: 'a', r: 0, b: 0 },
      fire: { s: 'a', n: 0 }
    };
  }
  function ownerEmail() {
    return String((window.MONDO_BOARD_OWNER) || 'cbrooks_911@yahoo.com').toLowerCase();
  }
  function isDenied(err) {
    var code = String((err && err.code) || '') + ' ' + String((err && err.message) || '');
    return /PERMISSION_DENIED|permission[-_ ]denied/i.test(code);
  }
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2400);
  }
  function now() { return performance.now(); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function resName() { return CLASSES[player.cls].res; }
  function maxHp() {
    var h = 48 + player.level * 14;
    if (player.cls === 'warrior') h += 20;
    else if (player.cls === 'paladin') h += 12;
    else if (player.cls === 'rogue') h += 4;
    var chest = ITEMS[player.equip.chest];
    if (chest && chest.hp) h += chest.hp;
    return h;
  }
  function power() {
    var w = ITEMS[player.equip.weapon];
    var n = 8 + player.level * 3 + (w ? w.dmg : 0);
    if (player.intelUntil > now()) n *= 1.3;
    return n;
  }
  function gearScore() {
    var g = player.level * 5;
    ['weapon', 'chest'].forEach(function (s) {
      var it = ITEMS[player.equip[s]];
      if (it) g += it.gs;
    });
    player.bag.forEach(function (id) {
      var it = ITEMS[id];
      if (it) g += Math.floor(it.gs / 2);
    });
    return g;
  }
  function xpNeed() { return 40 + (player.level - 1) * 30; }
  function hasItem(id) {
    return player.equip.weapon === id || player.equip.chest === id || player.bag.indexOf(id) >= 0;
  }
  function packQuests() {
    var q = player.quests;
    return [
      'candle:' + q.candle.s + ':' + q.candle.n,
      'wolves:' + q.wolves.s + ':' + q.wolves.n,
      'defias:' + q.defias.s + ':' + q.defias.n,
      'hunt:' + q.hunt.s + ':' + q.hunt.r + ':' + q.hunt.b,
      'fire:' + q.fire.s + ':' + q.fire.n
    ].join(';');
  }
  function unpackQuests(s) {
    var base = freshQuests();
    if (!s || typeof s !== 'string') return base;
    s.split(';').forEach(function (part) {
      var bits = part.split(':');
      var id = bits[0];
      if (!base[id] || !/^[aprdl]$/.test(bits[1] || '')) return;
      base[id].s = bits[1];
      if (id === 'hunt') {
        base[id].r = clamp(Number(bits[2]) || 0, 0, 9);
        base[id].b = clamp(Number(bits[3]) || 0, 0, 9);
      } else base[id].n = clamp(Number(bits[2]) || 0, 0, 9);
    });
    return base;
  }
  function packBag() { return player.bag.filter(function (id) { return ITEMS[id]; }).join(','); }
  function unpackBag(s) {
    if (!s) return [];
    return String(s).split(',').filter(function (id) { return ITEMS[id]; });
  }

  function log(kind, text) {
    logs.push({ kind: kind, text: text });
    if (logs.length > 80) logs.shift();
    var row = document.createElement('p');
    row.className = 'log-' + kind;
    row.textContent = text;
    var box = $('log');
    box.appendChild(row);
    while (box.children.length > 80) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    $('peek').textContent = text;
  }
  function yell() {
    log('yell', 'Ragnorak the Firelord: BY FIRE BE PURGED!');
    var y = $('yell');
    y.textContent = 'BY FIRE BE PURGED!';
    y.hidden = false;
    clearTimeout(yellTimer);
    yellTimer = setTimeout(function () { y.hidden = true; }, 2200);
  }
  function floatNum(x, y, text, color) {
    floats.push({ x: x, y: y, text: String(text), color: color, born: now() });
  }

  function saveLocal() {
    if (!player) return;
    var data = {
      v: 1,
      name: player.name,
      faction: player.faction,
      cls: player.cls,
      level: player.level,
      xp: player.xp | 0,
      gold: player.gold | 0,
      zone: zoneId,
      x: Math.round(player.x || 0),
      y: Math.round(player.y || 0),
      hp: Math.max(0, Math.round(player.hp)),
      res: Math.max(0, Math.round(player.res)),
      potions: player.potions | 0,
      quests: player.quests,
      bag: player.bag.slice(),
      equip: { weapon: player.equip.weapon || '', chest: player.equip.chest || '' },
      savedAt: Date.now()
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full */ }
    return data;
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function saveBoth() {
    saveLocal();
    if (!realmLive || !myUid || typeof firebase === 'undefined') return;
    var wait = 3200 - (Date.now() - lastRemote);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushSave, Math.max(80, wait));
  }
  function pushSave() {
    if (!realmLive || !myUid || !player) return;
    lastRemote = Date.now();
    var stamp = firebase.database.ServerValue.TIMESTAMP;
    var updates = {};
    updates['mmo/saves/' + myUid] = {
      name: player.name,
      faction: player.faction,
      cls: player.cls,
      level: player.level,
      xp: player.xp | 0,
      gold: player.gold | 0,
      zone: zoneId,
      x: clamp(Math.round(player.x), 0, 4000),
      y: clamp(Math.round(player.y), 0, 4000),
      hp: clamp(Math.round(player.hp), 0, 5000),
      res: clamp(Math.round(player.res), 0, 100),
      potions: clamp(player.potions | 0, 0, 99),
      weapon: player.equip.weapon || '',
      chest: player.equip.chest || '',
      qs: packQuests(),
      bag: packBag(),
      gear: clamp(gearScore(), 0, 9999),
      updatedAt: stamp
    };
    updates['mmo/srate/' + myUid] = stamp;
    updates['mmo/leaderboard/' + myUid] = {
      name: player.name,
      faction: player.faction,
      cls: player.cls,
      level: player.level,
      gear: clamp(gearScore(), 0, 9999),
      updatedAt: stamp
    };
    firebase.database().ref().update(updates).catch(function (err) {
      if (isDenied(err) && !heardPlayers) realmDown();
    });
  }
  function applyRemote(v) {
    if (!v || !v.name || !CLASSES[v.cls]) return;
    var made = {
      name: v.name,
      faction: v.faction === 'horde' ? 'horde' : 'alliance',
      cls: v.cls,
      level: clamp(v.level | 0, 1, 12),
      xp: v.xp | 0,
      gold: v.gold | 0,
      zone: ZONES[v.zone] ? v.zone : 'goldhaven',
      x: Number(v.x),
      y: Number(v.y),
      hp: Number(v.hp),
      res: Number(v.res) || 0,
      potions: clamp(v.potions | 0, 0, 99),
      quests: unpackQuests(v.qs),
      bag: unpackBag(v.bag),
      equip: { weapon: ITEMS[v.weapon] ? v.weapon : '', chest: ITEMS[v.chest] ? v.chest : '' },
      combo: 0
    };
    enterWorld(made, true);
  }

  function realmDown() {
    if (realmDead) return;
    realmDead = true;
    realmLive = false;
    $('syncBanner').hidden = false;
    if (playing) placeBots();
  }
  function realmUp() {
    realmLive = true;
    realmDead = false;
    heardPlayers = true;
    $('syncBanner').hidden = true;
    bots = [];
  }

  function buildZone(id) {
    var lines = MAPS[id];
    var tiles = [];
    var spawned = [];
    var portals = [];
    var start = { x: TILE, y: TILE };
    lines.forEach(function (line, y) {
      if (line.length !== lines[0].length) throw new Error('map ' + id);
      var row = [];
      for (var x = 0; x < line.length; x++) {
        var c = line.charAt(x);
        var t = 'floor';
        if (c === '#') t = 'block';
        else if (c === '~') t = 'liquid';
        else if (c === ',') t = 'path';
        else if (c === 'T') t = 'tree';
        else         if (c === '<' || c === '>') {
          t = 'portal';
          portals.push({ side: c === '<' ? 'L' : 'R', x: x, y: y });
        }
        row.push(t);
        if (c === '@') start = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
        if (KIND[c] && c !== '@') {
          var spec = KIND[c];
          spawned.push({
            id: 'e' + (idSeq++),
            kind: spec.kind,
            name: spec.name,
            giver: spec.giver || '',
            hostile: !!spec.hostile,
            boss: !!spec.boss,
            level: spec.level || 1,
            hp: spec.hp || 1,
            maxHp: spec.hp || 1,
            dmg: spec.dmg || 0,
            xp: spec.xp || 0,
            gold: spec.gold || 0,
            x: (x + 0.5) * TILE,
            y: (y + 0.5) * TILE,
            homeX: (x + 0.5) * TILE,
            homeY: (y + 0.5) * TILE,
            dead: false,
            tagged: false,
            barked: false,
            aggro: false,
            nextSwing: 0,
            nextFire: 0,
            rootedUntil: 0
          });
        }
      }
      tiles.push(row);
    });
    return { w: lines[0].length, h: lines.length, tiles: tiles, ents: spawned, portals: portals, start: start };
  }
  function loadZone(id) {
    zoneId = id;
    world = buildZone(id);
    ents = world.ents;
    fires = [];
    dest = null;
    targetId = null;
    $('zoneLabel').firstChild.nodeValue = ZONES[id].name + ' ';
    $('zoneSub').textContent = ZONES[id].sub;
    if (!realmLive) placeBots();
  }
  function placeBots() {
    if (!player) return;
    bots = [
      { id: 'bot1', name: 'Tessa Brook', faction: 'alliance', cls: 'mage', level: 3, hp: 90, maxHp: 90, x: player.x + 48, y: player.y + 16, bot: true },
      { id: 'bot2', name: 'Haruk Ashstep', faction: 'horde', cls: 'warrior', level: 3, hp: 110, maxHp: 110, x: player.x - 42, y: player.y + 20, bot: true }
    ];
  }
  function blocked(x, y) {
    if (!world) return true;
    var tx = Math.floor(x / TILE);
    var ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || ty >= world.h || tx >= world.w) return true;
    var t = world.tiles[ty][tx];
    return t === 'block' || t === 'liquid' || t === 'tree';
  }
  function solid(x, y) {
    return blocked(x - 8, y) || blocked(x + 8, y) || blocked(x, y - 8) || blocked(x, y + 8);
  }
  function moveBody(body, vx, vy, speed, dt) {
    var len = Math.hypot(vx, vy);
    if (!len) return;
    var nx = body.x + (vx / len) * speed * dt;
    var ny = body.y + (vy / len) * speed * dt;
    if (!solid(nx, body.y)) body.x = nx;
    if (!solid(body.x, ny)) body.y = ny;
  }

  function findEnt(id) {
    var i;
    for (i = 0; i < ents.length; i++) if (ents[i].id === id) return ents[i];
    for (i = 0; i < bots.length; i++) if (bots[i].id === id) return bots[i];
    for (i = 0; i < remoteAll.length; i++) if (remoteAll[i].id === id && remoteAll[i].zone === zoneId) return remoteAll[i];
    return null;
  }
  function targeted() { return targetId ? findEnt(targetId) : null; }
  function grantXp(n) {
    player.xp += n;
    while (player.level < 12 && player.xp >= xpNeed()) {
      player.xp -= xpNeed();
      player.level += 1;
      player.hp = maxHp();
      if (resName() !== 'rage') player.res = 100;
      log('quest', 'You have reached level ' + player.level + '!');
      floatNum(player.x, player.y - 20, 'LEVEL UP', '#ffd100');
    }
  }
  function grantItem(id) {
    if (!ITEMS[id] || hasItem(id)) return;
    var it = ITEMS[id];
    var cur = player.equip[it.slot];
    if (!cur || ITEMS[cur].gs <= it.gs) {
      if (cur) player.bag.push(cur);
      player.equip[it.slot] = id;
    } else player.bag.push(id);
    log('loot', 'You receive [' + it.name + '].');
  }
  function credit(kind) {
    function bump(id, key, need) {
      var st = player.quests[id];
      if (!st || st.s !== 'p') return;
      st[key] = (st[key] || 0) + 1;
      var done = id === 'hunt' ? (st.r >= 4 && st.b >= 3) : st[key] >= need;
      if (done) {
        st.s = 'r';
        log('quest', Q[id].title + ' is ready to turn in.');
      }
    }
    if (kind === 'kobold') bump('candle', 'n', 4);
    if (kind === 'wolf') bump('wolves', 'n', 3);
    if (kind === 'defias') bump('defias', 'n', 3);
    if (kind === 'raptor') bump('hunt', 'r', 4);
    if (kind === 'boar') bump('hunt', 'b', 3);
    if (kind === 'boss') bump('fire', 'n', 1);
  }
  function syncBoss(dmg) {
    if (!realmLive || !myUid || typeof firebase === 'undefined') return;
    var hit = clamp(Math.round(dmg), 1, 250);
    firebase.database().ref('mmo/raid/boss').transaction(function (cur) {
      var stamp = firebase.database.ServerValue.TIMESTAMP;
      if (!cur) return { hp: clamp(BOSS_MAX - hit, 0, BOSS_MAX), maxHp: BOSS_MAX, updatedAt: stamp };
      var hp = clamp(Number(cur.hp) - hit, 0, BOSS_MAX);
      return { hp: hp, maxHp: BOSS_MAX, updatedAt: stamp };
    }).then(function (res) {
      var v = res && res.snapshot && res.snapshot.val();
      var boss = ents.filter(function (e) { return e.boss; })[0];
      if (v && boss && !boss.dead) boss.hp = v.hp;
    }).catch(function (err) {
      if (isDenied(err) && !heardPlayers) realmDown();
    });
  }
  function hurt(ent, raw, source) {
    if (!ent || ent.dead || !ent.hostile) return;
    var n = Math.max(1, Math.round(raw));
    ent.hp -= n;
    if (source === 'player') {
      ent.tagged = true;
      lastCombat = now();
      if (player.cls === 'warrior') player.res = clamp(player.res + 5, 0, 100);
      if (ent.kind === 'kobold' && !ent.barked) {
        ent.barked = true;
        log('chat', ent.name + ': You no take candle!');
      }
      if (ent.boss && !ent.aggro) {
        ent.aggro = true;
        yell();
      }
      floatNum(ent.x, ent.y - 8, n, '#ffe14a');
      log('combat', 'You hit ' + ent.name + ' for ' + n + '.');
      if (ent.boss) syncBoss(n);
    }
    if (ent.hp <= 0) killMob(ent);
  }
  function killMob(ent) {
    if (ent.dead) return;
    ent.dead = true;
    ent.hp = 0;
    ent.respawnAt = now() + (ent.boss ? 90000 : 12000);
    if (!ent.tagged) return;
    grantXp(ent.xp);
    player.gold += ent.gold;
    log('combat', ent.name + ' dies. +' + ent.xp + ' XP, +' + ent.gold + ' gold.');
    credit(ent.kind);
    if (ent.boss) {
      grantItem('thunder');
      log('yell', 'The Firelord falls. The lair goes quiet.');
    }
    saveBoth();
  }
  function damagePlayer(n, from) {
    if (!player || player.hp <= 0) return;
    if (player.bubbleUntil > now()) return;
    if (player.wallUntil > now()) n = Math.max(1, Math.round(n * 0.4));
    else n = Math.max(1, Math.round(n));
    player.hp -= n;
    lastCombat = now();
    if (player.cls === 'warrior') player.res = clamp(player.res + 3, 0, 100);
    floatNum(player.x, player.y - 16, n, '#ff3030');
    if (from) log('combat', from + ' hits you for ' + n + '.');
    if (player.hp <= 0) die();
  }
  function die() {
    player.hp = Math.round(maxHp() * 0.5);
    player.res = resName() === 'rage' ? 0 : 100;
    log('combat', 'You have died. The spirit healer walks you back.');
    var start = world.start;
    player.x = start.x;
    player.y = start.y;
    dest = null;
    targetId = null;
    saveBoth();
  }
  function markerFor(giver) {
    var ids = QORDER.filter(function (id) { return Q[id].giver === giver; });
    if (ids.some(function (id) { return player.quests[id].s === 'r'; })) return '?';
    if (ids.some(function (id) { return player.quests[id].s === 'a'; })) return '!';
    return '';
  }
  function offerFor(giver) {
    var ids = QORDER.filter(function (id) { return Q[id].giver === giver; });
    var i;
    for (i = 0; i < ids.length; i++) if (player.quests[ids[i]].s === 'r') return { id: ids[i], mode: 'turnin' };
    for (i = 0; i < ids.length; i++) if (player.quests[ids[i]].s === 'a') return { id: ids[i], mode: 'accept' };
    for (i = 0; i < ids.length; i++) if (player.quests[ids[i]].s === 'p') return { id: ids[i], mode: 'progress' };
    return null;
  }
  function questProgress(id) {
    var st = player.quests[id];
    if (id === 'hunt') return 'Sunscale Raptors ' + st.r + '/4 · Bristleback Boars ' + st.b + '/3';
    return Q[id].obj + ' ' + (st.n || 0) + '/' + Q[id].need;
  }
  function openQuest(ent) {
    if (!ent || !ent.giver) return;
    if (dist(ent, player) > 90) { log('quest', 'Too far away to talk.'); return; }
    var offer = offerFor(ent.giver);
    var box = $('questDialog');
    if (!offer) {
      $('questTitle').textContent = ent.name;
      $('questText').textContent = ent.giver === 'marshal' ? 'Goldhaven holds, for now. Keep your weapon close.' : 'The Crossroads watches the road to the fire.';
      $('questObj').textContent = '';
      $('questReward').textContent = '';
      $('questAccept').hidden = true;
      $('questComplete').hidden = true;
      box.hidden = false;
      dialogQuest = '';
      return;
    }
    var q = Q[offer.id];
    dialogQuest = offer.id;
    $('questTitle').textContent = q.title;
    $('questText').textContent = q.text;
    $('questObj').textContent = questProgress(offer.id);
    var reward = ITEMS[q.item];
    $('questReward').textContent = 'Reward: ' + q.xp + ' XP, ' + q.gold + ' gold, [' + (reward ? reward.name : 'supplies') + ']';
    $('questAccept').hidden = offer.mode !== 'accept';
    $('questComplete').hidden = offer.mode !== 'turnin';
    box.hidden = false;
  }
  function acceptQuest() {
    if (!dialogQuest || player.quests[dialogQuest].s !== 'a') return;
    player.quests[dialogQuest].s = 'p';
    log('quest', 'Quest accepted: ' + Q[dialogQuest].title);
    $('questDialog').hidden = true;
    saveBoth();
    renderQuestLog();
  }
  function completeQuest() {
    if (!dialogQuest || player.quests[dialogQuest].s !== 'r') return;
    var q = Q[dialogQuest];
    player.quests[dialogQuest].s = 'd';
    grantXp(q.xp);
    player.gold += q.gold;
    if (q.item) grantItem(q.item);
    player.potions = clamp(player.potions + 1, 0, 99);
    if (q.unlock && player.quests[q.unlock].s === 'l') player.quests[q.unlock].s = 'a';
    log('quest', 'Quest complete: ' + q.title);
    $('questDialog').hidden = true;
    saveBoth();
    renderQuestLog();
    renderChar();
  }
  function talkNearest() {
    var best = null;
    var bd = 90;
    ents.forEach(function (e) {
      if (!e.giver) return;
      var d = dist(e, player);
      if (d < bd) { bd = d; best = e; }
    });
    if (best) openQuest(best);
    else log('quest', 'Nobody close enough to talk to.');
  }

  function cast(index) {
    if (!playing || !player) return;
    var ab = CLASSES[player.cls].abilities[index];
    if (!ab) return;
    var t = now();
    if ((cd[ab.id] || 0) > t) { log('combat', ab.name + ' is not ready.'); return; }
    if (player.res < ab.cost) { log('combat', 'Not enough ' + resName() + '.'); return; }
    var target = targeted();
    if (ab.heal) {
      player.res -= ab.cost;
      cd[ab.id] = t + ab.cd;
      var amount = Math.round(18 + player.level * 6);
      var ally = lowestAlly();
      ally.hp = clamp(ally.hp + amount, 0, ally.maxHp || maxHp());
      if (ally.ref === player) player.hp = ally.hp;
      floatNum(ally.x, ally.y - 12, amount, '#7dff6a');
      log('combat', 'Holy Light heals ' + ally.name + ' for ' + amount + '.');
      lastCombat = t;
      return;
    }
    if (ab.buff) {
      player.res -= ab.cost;
      cd[ab.id] = t + ab.cd;
      if (ab.buff === 'wall') { player.wallUntil = t + ab.dur; log('combat', 'Shield Wall surrounds you.'); }
      if (ab.buff === 'bubble') { player.bubbleUntil = t + ab.dur; log('combat', 'Divine Shield. You are immune.'); }
      if (ab.buff === 'sprint') { player.sprintUntil = t + ab.dur; log('combat', 'Sprint. Your feet fly.'); }
      if (ab.buff === 'intel') { player.intelUntil = t + ab.dur; log('combat', 'Arcane Intellect brightens your spells.'); }
      if (ab.buff === 'vanish') {
        player.goneUntil = t + ab.dur;
        ents.forEach(function (e) { e.tagged = false; });
        targetId = null;
        log('combat', 'You vanish from sight.');
      }
      if (ab.buff === 'nova') {
        var rooted = 0;
        ents.forEach(function (e) {
          if (!e.dead && e.hostile && dist(e, player) < 84) { e.rootedUntil = t + 3000; rooted++; }
        });
        log('combat', rooted ? 'Frost Nova roots ' + rooted + '.' : 'Frost Nova cracks the empty ground.');
      }
      return;
    }
    if (ab.aoe) {
      player.res -= ab.cost;
      cd[ab.id] = t + ab.cd;
      var hits = 0;
      ents.forEach(function (e) {
        if (!e.dead && e.hostile && dist(e, player) < ab.aoe) { hurt(e, power() * ab.dmg, 'player'); hits++; }
      });
      if (!hits) log('combat', ab.name + ' finds nothing to hit.');
      if (ab.rageGain) player.res = clamp(player.res + ab.rageGain, 0, 100);
      return;
    }
    if (!target || target.dead || !target.hostile) { log('combat', 'You need a hostile target.'); return; }
    if (dist(target, player) > ab.range) { log('combat', 'Out of range.'); return; }
    player.res -= ab.cost;
    cd[ab.id] = t + ab.cd;
    if (ab.rageGain) player.res = clamp(player.res + ab.rageGain, 0, 100);
    if (ab.id === 'charge') {
      var ang = Math.atan2(target.y - player.y, target.x - player.x);
      var nx = target.x - Math.cos(ang) * 30;
      var ny = target.y - Math.sin(ang) * 30;
      if (!solid(nx, ny)) { player.x = nx; player.y = ny; }
    }
    var mult = ab.dmg;
    if (ab.id === 'sinister') player.combo = clamp((player.combo || 0) + 1, 0, 5);
    if (ab.id === 'evisc') {
      mult = 0.9 * Math.max(1, player.combo || 1);
      player.combo = 0;
    }
    hurt(target, power() * mult, 'player');
    if (player.cls !== 'mage') autoOn = true;
  }
  function lowestAlly() {
    var list = [{ name: player.name, hp: player.hp, maxHp: maxHp(), x: player.x, y: player.y, ref: player }];
    bots.forEach(function (b) { list.push({ name: b.name, hp: b.hp, maxHp: b.maxHp, x: b.x, y: b.y, ref: b }); });
    list.sort(function (a, b) { return (a.hp / a.maxHp) - (b.hp / b.maxHp); });
    return list[0];
  }
  function potion() {
    if (!playing) return;
    var t = now();
    if (potionAt > t) { log('combat', 'The potion is still settling.'); return; }
    if (player.potions <= 0) { log('loot', 'You have no potions.'); return; }
    player.potions -= 1;
    potionAt = t + 10000;
    var heal = Math.round(maxHp() * 0.45);
    player.hp = clamp(player.hp + heal, 0, maxHp());
    if (resName() === 'rage') player.res = clamp(player.res + 25, 0, 100);
    else player.res = clamp(player.res + 35, 0, 100);
    floatNum(player.x, player.y - 18, heal, '#7dff6a');
    log('loot', 'You drink a potion and recover ' + heal + ' health.');
  }
  function toggleAuto() {
    autoOn = !autoOn;
    $('autoBtn').setAttribute('aria-pressed', autoOn ? 'true' : 'false');
    $('autoBtn').classList.toggle('on', autoOn);
    log('combat', autoOn ? 'Auto-attack on.' : 'Auto-attack off.');
  }
  function tabTarget() {
    var list = ents.filter(function (e) { return e.hostile && !e.dead; });
    list.sort(function (a, b) { return dist(a, player) - dist(b, player); });
    if (!list.length) { targetId = null; return; }
    var i = -1;
    list.forEach(function (e, idx) { if (e.id === targetId) i = idx; });
    targetId = list[(i + 1) % list.length].id;
  }
  function swingAuto(t) {
    if (!autoOn || t < autoAt) return;
    var target = targeted();
    if (!target || target.dead || !target.hostile) return;
    var reach = player.cls === 'mage' ? 200 : 46;
    if (dist(target, player) > reach) return;
    autoAt = t + 2000;
    var bonus = player.cls === 'warrior' ? 0 : 0;
    hurt(target, power() * (player.cls === 'mage' ? 0.7 : 1) + bonus, 'player');
    if (player.cls === 'warrior') player.res = clamp(player.res + 8, 0, 100);
  }

  function stepToward(body, x, y, speed, dt) {
    moveBody(body, x - body.x, y - body.y, speed, dt);
  }
  function update(dt) {
    if (!playing || !player || !world) return;
    var t = now();
    if (resName() === 'mana') player.res = clamp(player.res + 8 * dt, 0, 100);
    else if (resName() === 'energy') player.res = clamp(player.res + 20 * dt, 0, 100);
    else if (t - lastCombat > 4000) player.res = clamp(player.res - 4 * dt, 0, 100);
    var vx = 0;
    var vy = 0;
    if (keys.a || keys.arrowleft) vx -= 1;
    if (keys.d || keys.arrowright) vx += 1;
    if (keys.w || keys.arrowup) vy -= 1;
    if (keys.s || keys.arrowdown) vy += 1;
    if (joy.on) { vx = joy.x; vy = joy.y; }
    if (!vx && !vy && dest) {
      if (dist(player, dest) < 6) dest = null;
      else { vx = dest.x - player.x; vy = dest.y - player.y; }
    } else if (vx || vy) dest = null;
    var speed = player.sprintUntil > t ? 220 : 128;
    moveBody(player, vx, vy, speed, dt);
    if (t > portalLock) {
      var tx = Math.floor(player.x / TILE);
      var ty = Math.floor(player.y / TILE);
      var gate = world.portals.filter(function (p) { return p.x === tx && p.y === ty; })[0];
      if (gate) usePortal(gate.side);
    }
    var hidden = player.goneUntil > t;
    ents.forEach(function (ent) {
      if (ent.dead) {
        if (t > ent.respawnAt) {
          ent.dead = false;
          ent.hp = ent.maxHp;
          ent.x = ent.homeX;
          ent.y = ent.homeY;
          ent.tagged = false;
          ent.barked = false;
          ent.aggro = false;
        }
        return;
      }
      if (!ent.hostile) return;
      if (t < ent.rootedUntil) return;
      var d = dist(ent, player);
      var aggro = ent.boss ? 200 : 52;
      if (!hidden && (ent.tagged || d < aggro)) {
        if (ent.boss && !ent.aggro) { ent.aggro = true; yell(); }
        var reach = ent.boss ? 40 : 28;
        if (d > reach) stepToward(ent, player.x, player.y, ent.boss ? 58 : 78, dt);
        else if (t > ent.nextSwing) {
          ent.nextSwing = t + (ent.boss ? 1800 : 1500);
          damagePlayer(ent.dmg, ent.name);
        }
        if (ent.boss && t > ent.nextFire) {
          ent.nextFire = t + 5500;
          fires.push({ x: player.x, y: player.y, until: t + 1600, next: 0 });
          yell();
        }
      }
    });
    fires = fires.filter(function (f) { return f.until > t; });
    fires.forEach(function (f) {
      if (dist(player, f) < 34 && t > f.next) {
        f.next = t + 450;
        damagePlayer(6, 'Living flame');
      }
    });
    if (!realmLive) {
      bots.forEach(function (b) {
        var prey = null;
        var pd = 140;
        ents.forEach(function (e) {
          if (e.dead || !e.tagged) return;
          var dd = dist(b, e);
          if (dd < pd) { pd = dd; prey = e; }
        });
        if (prey) {
          if (pd > 30) stepToward(b, prey.x, prey.y, 90, dt);
          else if (t > (b.next || 0)) { b.next = t + 1300; hurt(prey, 6, 'bot'); }
        } else if (dist(b, player) > 78) stepToward(b, player.x, player.y, 100, dt);
      });
    }
    swingAuto(t);
    remoteAll.forEach(function (o) {
      if (o.zone !== zoneId) return;
      o.x += (o.tx - o.x) * Math.min(1, dt * 6);
      o.y += (o.ty - o.y) * Math.min(1, dt * 6);
    });
    if (t > presenceAt) { presenceAt = t + 450; pushPresence(); }
    var near = false;
    ents.forEach(function (e) { if (e.giver && dist(e, player) < 80) near = true; });
    $('talkBtn').hidden = !near;
    if (!$('questDialog').hidden && dialogQuest) {
      var giver = Q[dialogQuest].giver;
      var npc = ents.filter(function (e) { return e.giver === giver; })[0];
      if (!npc || dist(npc, player) > 140) $('questDialog').hidden = true;
    }
  }
  function usePortal(side) {
    var link = LINKS[zoneId + ':' + side];
    if (!link) return;
    portalLock = now() + 1200;
    loadZone(link.zone);
    var destPortal = world.portals.filter(function (p) { return p.side === link.side; })[0];
    var dir = link.side === 'L' ? 1 : -1;
    player.x = (destPortal.x + dir * 1.7 + 0.5) * TILE;
    player.y = (destPortal.y + 0.5) * TILE;
    if (solid(player.x, player.y)) player.x = (destPortal.x + 0.5) * TILE;
    log('travel', 'You arrive in ' + ZONES[zoneId].name + '.');
    saveBoth();
  }
  function pushPresence() {
    if (!realmLive || !myUid || !player || typeof firebase === 'undefined') return;
    var bubble = player.bubbleUntil > now() ? String(player.bubble || '').replace(/[\r\n]/g, ' ').slice(0, 80) : '';
    firebase.database().ref('mmo/players/' + myUid).set({
      name: player.name,
      faction: player.faction,
      cls: player.cls,
      level: player.level,
      zone: zoneId,
      x: clamp(Math.round(player.x), 0, 4000),
      y: clamp(Math.round(player.y), 0, 4000),
      hp: clamp(Math.round(player.hp), 0, 5000),
      maxHp: clamp(maxHp(), 1, 5000),
      bubble: bubble,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).catch(function (err) {
      if (isDenied(err) && !heardPlayers) realmDown();
    });
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(320, Math.floor(rect.width));
    var h = Math.max(220, Math.floor(rect.height));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }
  function drawActor(x, y, kind, faction, cls) {
    var sx = Math.round(x - cam.x);
    var sy = Math.round(y - cam.y);
    var shirt = '#8d6b34';
    if (cls === 'mage' || kind === 'mage') shirt = '#7c4dff';
    else if (cls === 'paladin' || kind === 'paladin') shirt = '#f5d76e';
    else if (cls === 'rogue' || kind === 'rogue') shirt = '#3d6b4f';
    else if (cls === 'warrior' || kind === 'warrior') shirt = '#8d5a34';
    if (kind === 'kobold') shirt = '#e6c34a';
    if (kind === 'wolf') shirt = '#8d8d8d';
    if (kind === 'defias') shirt = '#a32020';
    if (kind === 'raptor') shirt = '#3f8f4e';
    if (kind === 'boar') shirt = '#8a5a32';
    if (kind === 'boss') {
      ctx.fillStyle = '#ff6a00';
      ctx.fillRect(sx - 16, sy - 42, 32, 28);
      ctx.fillRect(sx - 20, sy - 50, 6, 12);
      ctx.fillRect(sx + 14, sy - 50, 6, 12);
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(sx - 8, sy - 34, 4, 4);
      ctx.fillRect(sx + 4, sy - 34, 4, 4);
      return;
    }
    var skin = kind === 'kobold' ? '#c9a24a' : '#e6b48a';
    ctx.fillStyle = shirt;
    ctx.fillRect(sx - 6, sy - 20, 12, 10);
    ctx.fillStyle = faction === 'horde' ? '#c41e3a' : (faction === 'alliance' ? '#2458c9' : shirt);
    ctx.fillRect(sx - 6, sy - 16, 12, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(sx - 4, sy - 28, 8, 8);
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(sx - 5, sy - 10, 4, 8);
    ctx.fillRect(sx + 1, sy - 10, 4, 8);
    if (kind === 'kobold') {
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(sx + 6, sy - 26, 3, 6);
    }
  }
  function taggedName(uid, name) {
    var badge = window.MONDO_MEMBER ? window.MONDO_MEMBER.badgeText(uid) : '';
    return badge ? (name + ' ' + badge) : name;
  }
  function drawName(x, y, text, color) {
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(text, Math.round(x - cam.x) + 1, Math.round(y - cam.y) - 33);
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x - cam.x), Math.round(y - cam.y) - 34);
  }
  function render() {
    if (!ctx || !world || !player) return;
    var w = canvas.width;
    var h = canvas.height;
    var maxX = Math.max(0, world.w * TILE - w);
    var maxY = Math.max(0, world.h * TILE - h);
    cam.x = clamp(player.x - w / 2, 0, maxX);
    cam.y = clamp(player.y - h / 2, 0, maxY);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    var x0 = Math.floor(cam.x / TILE);
    var y0 = Math.floor(cam.y / TILE);
    var x1 = Math.ceil((cam.x + w) / TILE);
    var y1 = Math.ceil((cam.y + h) / TILE);
    for (var ty = y0; ty < y1; ty++) {
      for (var tx = x0; tx < x1; tx++) {
        if (ty < 0 || tx < 0 || ty >= world.h || tx >= world.w) continue;
        var tile = world.tiles[ty][tx];
        var color = '#2f7d32';
        if (zoneId === 'crossroads') color = (tx + ty) % 2 ? '#c4a36a' : '#b8956a';
        if (zoneId === 'molten') color = (tx + ty) % 2 ? '#3a241c' : '#2c1b16';
        if (zoneId === 'goldhaven') color = (tx + ty) % 2 ? '#2f7d32' : '#276b2b';
        if (tile === 'path') color = zoneId === 'molten' ? '#6b5344' : '#cbb684';
        if (tile === 'liquid') color = zoneId === 'molten' ? '#e85d04' : '#1d4e89';
        if (tile === 'block') color = zoneId === 'molten' ? '#140808' : '#143018';
        if (tile === 'tree') color = '#1d4a22';
        if (tile === 'portal') color = '#6d28d9';
        ctx.fillStyle = color;
        ctx.fillRect(tx * TILE - cam.x, ty * TILE - cam.y, TILE, TILE);
        if (tile === 'tree') {
          ctx.fillStyle = '#14381a';
          ctx.fillRect(tx * TILE - cam.x + 12, ty * TILE - cam.y + 8, 8, 16);
          ctx.fillStyle = '#2f8f3a';
          ctx.fillRect(tx * TILE - cam.x + 6, ty * TILE - cam.y + 2, 20, 12);
        }
      }
    }
    fires.forEach(function (f) {
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(f.x - cam.x - 12, f.y - cam.y - 12, 24, 24);
    });
    ents.forEach(function (ent) {
      if (ent.dead) return;
      drawActor(ent.x, ent.y, ent.kind, '', ent.giver ? 'paladin' : '');
      if (ent.hostile) {
        ctx.fillStyle = '#300';
        ctx.fillRect(ent.x - cam.x - 12, ent.y - cam.y - 44, 24, 3);
        ctx.fillStyle = ent.boss ? '#ff6a00' : '#2e8b22';
        ctx.fillRect(ent.x - cam.x - 12, ent.y - cam.y - 44, 24 * clamp(ent.hp / ent.maxHp, 0, 1), 3);
      }
      var plate = ent.hostile ? '#ffd100' : '#fff';
      drawName(ent.x, ent.y, ent.name, plate);
      if (ent.giver) {
        var mark = markerFor(ent.giver);
        if (mark) {
          ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
          ctx.fillStyle = '#ffd100';
          ctx.textAlign = 'center';
          ctx.fillText(mark, ent.x - cam.x, ent.y - cam.y - 48);
        }
      }
      if (ent.id === targetId) {
        ctx.strokeStyle = '#ffd100';
        ctx.strokeRect(ent.x - cam.x - 14, ent.y - cam.y - 30, 28, 30);
      }
    });
    bots.forEach(function (b) {
      drawActor(b.x, b.y, b.cls, b.faction, b.cls);
      drawName(b.x, b.y, b.name, b.faction === 'horde' ? '#ff4d4d' : '#6ea8ff');
    });
    remoteAll.forEach(function (o) {
      if (o.zone !== zoneId) return;
      drawActor(o.x, o.y, o.cls, o.faction, o.cls);
      drawName(o.x, o.y, taggedName(o.uid, o.name), o.faction === 'horde' ? '#ff4d4d' : '#6ea8ff');
      if (o.bubble) {
        ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(o.bubble, o.x - cam.x, o.y - cam.y - 50);
      }
    });
    drawActor(player.x, player.y, player.cls, player.faction, player.cls);
    drawName(player.x, player.y, taggedName(myUid, player.name), player.faction === 'horde' ? '#ff4d4d' : '#6ea8ff');
    if (player.bubbleUntil > now() && player.bubble) {
      ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(player.bubble, player.x - cam.x, player.y - cam.y - 50);
    }
    var t = now();
    floats.forEach(function (f) {
      var age = (t - f.born) / 900;
      if (age >= 1) return;
      ctx.font = '700 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Verdana, Roboto, Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y - 20 - age * 26);
    });
    for (var i = floats.length - 1; i >= 0; i--) if (t - floats[i].born > 900) floats.splice(i, 1);
    if (joyCanvas && joyCtx && joyCanvas.offsetParent !== null) {
      joyCtx.clearRect(0, 0, 128, 128);
      joyCtx.strokeStyle = '#c9a227';
      joyCtx.lineWidth = 3;
      joyCtx.beginPath();
      joyCtx.arc(64, 64, 48, 0, Math.PI * 2);
      joyCtx.stroke();
      joyCtx.fillStyle = '#d4d0c8';
      joyCtx.beginPath();
      joyCtx.arc(64 + joy.x * 28, 64 + joy.y * 28, 16, 0, Math.PI * 2);
      joyCtx.fill();
    }
  }
  function setFill(el, pct, extra) {
    var n = clamp(Math.round(pct), 0, 100);
    el.className = 'fill p' + n + (extra ? ' ' + extra : '');
  }
  function ui() {
    if (!player) return;
    $('playerName').textContent = player.name;
    $('playerLevel').textContent = 'Lv ' + player.level + ' ' + CLASSES[player.cls].label;
    setFill($('playerHp'), player.hp / maxHp() * 100, player.hp / maxHp() < 0.3 ? 'low' : '');
    var res = resName();
    setFill($('playerRes'), player.res, res);
    setFill($('xpFill'), (player.xp / xpNeed()) * 100, 'xp');
    var target = targeted();
    if (!target) {
      $('targetName').textContent = 'No target';
      $('targetLevel').textContent = '';
      $('targetMeta').textContent = 'Select a creature, hero, or quest giver.';
      setFill($('targetHp'), 0, '');
    } else {
      $('targetName').textContent = target.name;
      $('targetLevel').textContent = target.level ? 'Lv ' + target.level : '';
      var max = target.maxHp || target.hp || 1;
      setFill($('targetHp'), (target.hp / max) * 100, target.hp / max < 0.3 ? 'low' : '');
      $('targetMeta').textContent = target.hostile ? (target.boss ? 'Raid boss' : 'Hostile') : (target.giver ? 'Quest giver' : 'Ally');
    }
    var abs = CLASSES[player.cls].abilities;
    for (var i = 0; i < 4; i++) {
      var btn = $('ab' + i);
      btn.querySelector('.nm').textContent = abs[i].name;
      var left = (cd[abs[i].id] || 0) - now();
      var overlay = btn.querySelector('.cd');
      if (left <= 0) overlay.className = 'cd p0';
      else overlay.className = 'cd p' + clamp(Math.ceil(left / abs[i].cd * 100), 1, 100);
    }
    var pleft = potionAt - now();
    $('potionBtn').querySelector('.nm').textContent = 'Potion ' + player.potions;
    $('potionBtn').querySelector('.cd').className = pleft <= 0 ? 'cd p0' : 'cd p' + clamp(Math.ceil(pleft / 10000 * 100), 1, 100);
    $('autoBtn').classList.toggle('on', autoOn);
    drawPortrait($('playerPortrait'), player.cls, player.faction);
    drawPortrait($('targetPortrait'), target ? (target.kind || target.cls || 'npc') : '', target && target.faction);
  }
  function drawPortrait(cv, kind, faction) {
    if (!cv) return;
    var c = cv.getContext('2d');
    c.fillStyle = '#1a120c';
    c.fillRect(0, 0, 40, 40);
    c.fillStyle = faction === 'horde' ? '#c41e3a' : '#2458c9';
    c.fillRect(8, 22, 24, 8);
    c.fillStyle = kind === 'boss' ? '#ff6a00' : '#e6b48a';
    c.fillRect(12, 8, 16, 14);
    if (kind === 'kobold') { c.fillStyle = '#ff6600'; c.fillRect(28, 6, 4, 8); }
  }
  function renderQuestLog() {
    var box = $('questList');
    box.textContent = '';
    QORDER.forEach(function (id) {
      var st = player.quests[id];
      if (st.s === 'l') return;
      var p = document.createElement('p');
      var label = Q[id].title + ' — ';
      if (st.s === 'a') label += 'available';
      else if (st.s === 'p') label += questProgress(id);
      else if (st.s === 'r') label += 'ready to turn in';
      else label += 'complete';
      p.textContent = label;
      box.appendChild(p);
    });
    if (!box.children.length) {
      var empty = document.createElement('p');
      empty.textContent = 'Your quest log is empty.';
      box.appendChild(empty);
    }
  }
  function renderChar() {
    if (!player) return;
    var box = $('charBody');
    box.textContent = '';
    function line(text, rarity) {
      var p = document.createElement('p');
      if (rarity) p.className = 'r-' + rarity;
      p.textContent = text;
      box.appendChild(p);
    }
    line(player.name + ' — Lv ' + player.level + ' ' + CLASSES[player.cls].label + ' — ' + (player.faction === 'horde' ? 'Crimson Horde' : 'Grand Alliance'));
    line('Gold: ' + player.gold + ' · Gear score: ' + gearScore());
    ['weapon', 'chest'].forEach(function (slot) {
      var id = player.equip[slot];
      var it = ITEMS[id];
      if (it) line(slot.charAt(0).toUpperCase() + slot.slice(1) + ': [' + it.name + ']', it.rarity);
      else line(slot.charAt(0).toUpperCase() + slot.slice(1) + ': empty');
    });
    if (!player.bag.length) line('Bags are empty.');
    player.bag.forEach(function (id) {
      var it = ITEMS[id];
      if (it) line('Bag: [' + it.name + ']', it.rarity);
    });
  }
  function renderHall() {
    var rows = [];
    Object.keys(hall).forEach(function (k) {
      var v = hall[k];
      if (v && v.name) rows.push(v);
    });
    if (player && !rows.some(function (r) { return r.name === player.name && r.cls === player.cls; })) {
      rows.push({ name: player.name, faction: player.faction, cls: player.cls, level: player.level, gear: gearScore(), local: true });
    }
    rows.sort(function (a, b) { return (b.level - a.level) || (b.gear - a.gear); });
    var box = $('hallList');
    box.textContent = '';
    rows.slice(0, 10).forEach(function (r, i) {
      var p = document.createElement('p');
      p.textContent = (i + 1) + '. ' + r.name + ' — Lv ' + r.level + ' ' + (CLASSES[r.cls] ? CLASSES[r.cls].label : r.cls) + ' · GS ' + (r.gear || 0) + ' · ' + (r.faction === 'horde' ? 'Horde' : 'Alliance');
      box.appendChild(p);
    });
    if (!box.children.length) {
      var empty = document.createElement('p');
      empty.textContent = 'The hall is empty. Level up and it will remember you.';
      box.appendChild(empty);
    }
  }
  function togglePanel(id) {
    var el = $(id);
    var wasHidden = el.hidden;
    ['panelQuest', 'panelChar', 'panelChat', 'panelHall'].forEach(function (k) { $(k).hidden = true; });
    el.hidden = !wasHidden;
    if (!el.hidden) {
      renderQuestLog();
      renderChar();
      renderHall();
    }
  }

  function worldPoint(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (canvas.width / rect.width) + cam.x,
      y: (ev.clientY - rect.top) * (canvas.height / rect.height) + cam.y
    };
  }
  function pickWorld(ev) {
    if (!playing) return;
    var p = worldPoint(ev);
    var best = null;
    var bd = 30;
    ents.concat(bots).concat(remoteAll.filter(function (o) { return o.zone === zoneId; })).forEach(function (e) {
      if (e.dead) return;
      var d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    });
    if (best) {
      targetId = best.id;
      if (best.giver && dist(best, player) < 90) openQuest(best);
      return;
    }
    if (!solid(p.x, p.y)) dest = p;
  }

  function enterWorld(data, fromRemote) {
    player = data;
    player.combo = player.combo || 0;
    player.bag = player.bag || [];
    player.equip = player.equip || { weapon: '', chest: '' };
    player.quests = player.quests || freshQuests();
    if (!player.hp) player.hp = maxHp();
    if (resName() === 'rage' && !fromRemote) player.res = 0;
    if (resName() !== 'rage' && player.res == null) player.res = 100;
    playing = true;
    document.body.classList.add('is-playing');
    $('create').hidden = true;
    $('play').hidden = false;
    loadZone(player.zone || 'goldhaven');
    if (Number.isFinite(player.x) && Number.isFinite(player.y) && player.x > 0) {
      player.x = player.x;
      player.y = player.y;
    } else {
      player.x = world.start.x;
      player.y = world.start.y;
    }
    if (!realmLive) placeBots();
    resize();
    ui();
    saveLocal();
    log('travel', 'Welcome to ' + ZONES[zoneId].name + ', ' + player.name + '.');
  }
  function newHero() {
    var name = $('heroName').value.replace(/\s+/g, ' ').trim();
    if (!NAME_RE.test(name)) {
      $('createError').hidden = false;
      $('createError').textContent = 'Use a name of letters, numbers, and spaces, up to 16 characters.';
      return;
    }
    if (factionPick !== 'alliance' && factionPick !== 'horde') {
      $('createError').hidden = false;
      $('createError').textContent = 'Choose Grand Alliance or Crimson Horde.';
      return;
    }
    if (!CLASSES[classPick]) {
      $('createError').hidden = false;
      $('createError').textContent = 'Choose a class.';
      return;
    }
    $('createError').hidden = true;
    var hero = {
      name: name,
      faction: factionPick,
      cls: classPick,
      level: 1,
      xp: 0,
      gold: 0,
      zone: 'goldhaven',
      hp: 0,
      res: classPick === 'warrior' ? 0 : 100,
      potions: 5,
      quests: freshQuests(),
      bag: [],
      equip: { weapon: '', chest: '' },
      x: null,
      y: null
    };
    enterWorld(hero, false);
    saveBoth();
  }

  function bootAuth() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG) { realmDown(); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
    } catch (e) { realmDown(); return; }
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        firebase.auth().signInAnonymously().catch(function () { realmDown(); });
        return;
      }
      myUser = user;
      myUid = user.uid;
      var owner = !!(user.email && user.email.toLowerCase() === ownerEmail());
      $('ownerTools').hidden = !owner;
      if (!window.MONDO_MEMBER) $('ownerBtn').textContent = owner ? 'Owner sign out' : 'Owner sign in';
      listenRealm();
      firebase.database().ref('mmo/saves/' + myUid).once('value').then(function (snap) {
        var remote = snap.val();
        var local = loadLocal();
        if (remote && (!local || Number(remote.updatedAt) > Number(local.savedAt || 0) + 4000)) applyRemote(remote);
      }).catch(function (err) { if (isDenied(err)) realmDown(); });
    });
  }
  function listenRealm() {
    if (listenRealm.done || !myUid) return;
    listenRealm.done = true;
    var db = firebase.database();
    db.ref('mmo/players/' + myUid).onDisconnect().remove();
    db.ref('mmo/players').on('value', function (snap) {
      realmUp();
      var list = [];
      var clock = Date.now();
      snap.forEach(function (ch) {
        if (ch.key === myUid) return;
        var v = ch.val() || {};
        if (!v.name || !v.updatedAt || clock - Number(v.updatedAt) > 15000) return;
        list.push({
          id: 'p' + ch.key,
          uid: ch.key,
          name: String(v.name).slice(0, 16),
          faction: v.faction === 'horde' ? 'horde' : 'alliance',
          cls: CLASSES[v.cls] ? v.cls : 'warrior',
          level: v.level | 0,
          zone: v.zone,
          tx: Number(v.x) || 0,
          ty: Number(v.y) || 0,
          x: Number(v.x) || 0,
          y: Number(v.y) || 0,
          hp: Number(v.hp) || 1,
          maxHp: Number(v.maxHp) || 1,
          bubble: v.bubble || ''
        });
      });
      list.forEach(function (n) {
        var prev = remoteAll.filter(function (o) { return o.id === n.id; })[0];
        if (prev) { n.x = prev.x; n.y = prev.y; }
      });
      remoteAll = list;
    }, function (err) { if (isDenied(err)) realmDown(); });
    db.ref('mmo/leaderboard').on('value', function (snap) {
      hall = snap.val() || {};
      if (!$('panelHall').hidden) renderHall();
    }, function (err) { if (isDenied(err)) realmDown(); });
    db.ref('mmo/chat').limitToLast(30).on('child_added', function (snap) {
      if (seenChat[snap.key]) return;
      seenChat[snap.key] = true;
      var v = snap.val() || {};
      if (!v.text || v.author === myUid) return;
      log('chat', String(v.name || 'Hero') + ': ' + String(v.text).slice(0, 80));
    }, function () { /* chat can fail closed */ });
    db.ref('mmo/raid/boss').on('value', function (snap) {
      var v = snap.val();
      var boss = ents.filter(function (e) { return e.boss; })[0];
      if (v && boss && realmLive && !boss.dead) {
        boss.hp = Number(v.hp);
        boss.maxHp = BOSS_MAX;
        if (boss.hp <= 0) killMob(boss);
      }
    }, function () { /* local boss still fights */ });
  }
  async function ownerMutate(path) {
    if (!myUser || !myUser.email || myUser.email.toLowerCase() !== ownerEmail()) return;
    var snap = await firebase.database().ref(path).once('value');
    var updates = {};
    snap.forEach(function (ch) { updates[path + '/' + ch.key] = null; });
    if (Object.keys(updates).length) await firebase.database().ref().update(updates);
  }

  var loopQueued = false;
  function queueLoop() {
    if (loopQueued || document.hidden) return;
    loopQueued = true;
    loopOn = true;
    requestAnimationFrame(loop);
  }
  function loop(ts) {
    loopQueued = false;
    if (document.hidden) { loopOn = false; return; }
    var dt = Math.min(0.05, (ts - (loop.last || ts)) / 1000);
    loop.last = ts;
    update(dt || 0);
    render();
    if (playing) ui();
    queueLoop();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { loopOn = false; return; }
    queueLoop();
  });

  function boot() {
    canvas = $('world');
    ctx = canvas.getContext('2d');
    joyCanvas = $('joy');
    joyCtx = joyCanvas.getContext('2d');
    var yr = $('yr');
    if (yr) yr.textContent = String(new Date().getFullYear());
    document.querySelectorAll('[data-faction]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        factionPick = btn.getAttribute('data-faction');
        document.querySelectorAll('[data-faction]').forEach(function (b) { b.classList.toggle('on', b === btn); });
      });
    });
    document.querySelectorAll('[data-class]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        classPick = btn.getAttribute('data-class');
        document.querySelectorAll('[data-class]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        $('classBlurb').textContent = BLURB[classPick] || '';
      });
    });
    $('enterWorld').addEventListener('click', newHero);
    $('heroName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); newHero(); } });
    for (var i = 0; i < 4; i++) (function (n) { $('ab' + n).addEventListener('click', function () { cast(n); }); })(i);
    $('autoBtn').addEventListener('click', toggleAuto);
    $('potionBtn').addEventListener('click', potion);
    $('talkBtn').addEventListener('click', talkNearest);
    $('questBtn').addEventListener('click', function () { togglePanel('panelQuest'); });
    $('charBtn').addEventListener('click', function () { togglePanel('panelChar'); });
    $('chatBtn').addEventListener('click', function () { togglePanel('panelChat'); });
    $('hallBtn').addEventListener('click', function () { togglePanel('panelHall'); });
    $('questAccept').addEventListener('click', acceptQuest);
    $('questComplete').addEventListener('click', completeQuest);
    $('questClose').addEventListener('click', function () { $('questDialog').hidden = true; });
    $('reroll').addEventListener('click', function () {
      if (!window.confirm('Retire this hero and create a new one on this device?')) return;
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      location.reload();
    });
    $('sayForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var text = $('sayInput').value.replace(/[\r\n]/g, ' ').trim().slice(0, 80);
      $('sayInput').value = '';
      if (!text || !player) return;
      if (Date.now() - lastSay < 1500) { log('chat', 'You speak too quickly.'); return; }
      lastSay = Date.now();
      log('chat', player.name + ': ' + text);
      player.bubble = text;
      player.bubbleUntil = now() + 6000;
      if (!realmLive || !myUid || typeof firebase === 'undefined') return;
      var id = firebase.database().ref().push().key;
      var updates = {};
      updates['mmo/chat/' + id] = {
        name: player.name,
        faction: player.faction,
        zone: zoneId,
        text: text,
        author: myUid,
        t: firebase.database.ServerValue.TIMESTAMP
      };
      updates['mmo/crate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
      firebase.database().ref().update(updates).catch(function (err) {
        if (isDenied(err) && !heardPlayers) realmDown();
      });
    });
    canvas.addEventListener('pointerdown', pickWorld);
    joyCanvas.addEventListener('pointerdown', function (e) {
      joy.on = true;
      joyCanvas.setPointerCapture(e.pointerId);
      aimJoy(e);
    });
    joyCanvas.addEventListener('pointermove', function (e) { if (joy.on) aimJoy(e); });
    function endJoy(e) {
      joy.on = false;
      joy.x = 0;
      joy.y = 0;
      try { joyCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }
    joyCanvas.addEventListener('pointerup', endJoy);
    joyCanvas.addEventListener('pointercancel', endJoy);
    window.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      keys[e.key.toLowerCase()] = true;
      if (e.key >= '1' && e.key <= '4') { e.preventDefault(); cast(Number(e.key) - 1); }
      if (e.key === '5') { e.preventDefault(); potion(); }
      if (e.key === 'Tab') { e.preventDefault(); tabTarget(); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (playing) talkNearest(); }
      if (e.key === ' ') { e.preventDefault(); if (playing) toggleAuto(); }
      if (/^arrow/i.test(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('resize', resize);
    $('ownerBtn').addEventListener('click', function () {
      if (typeof firebase === 'undefined' || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
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
    $('ownerForm').addEventListener('submit', function (e) {
      e.preventDefault();
      $('ownerError').hidden = true;
      firebase.auth().signInWithEmailAndPassword($('ownerEmail').value.trim(), $('ownerPass').value).then(function () {
        $('ownerPass').value = '';
        $('ownerDialog').close();
      }).catch(function () {
        $('ownerPass').value = '';
        $('ownerError').textContent = 'Could not sign in.';
        $('ownerError').hidden = false;
      });
    });
    $('resetRaid').addEventListener('click', function () {
      firebase.database().ref('mmo/raid/boss').set({
        hp: BOSS_MAX,
        maxHp: BOSS_MAX,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).then(function () { toast('Raid boss reset'); }).catch(function () { toast('Could not reset the raid'); });
    });
    $('clearHall').addEventListener('click', function () {
      ownerMutate('mmo/leaderboard').then(function () { toast('Hall of fame cleared'); }).catch(function () { toast('Could not clear the hall'); });
    });
    $('clearPlayers').addEventListener('click', function () {
      ownerMutate('mmo/players').then(function () { toast('Realm presence cleared'); }).catch(function () { toast('Could not clear players'); });
    });

    var saved = loadLocal();
    if (saved && saved.name && CLASSES[saved.cls]) {
      enterWorld({
        name: saved.name,
        faction: saved.faction === 'horde' ? 'horde' : 'alliance',
        cls: saved.cls,
        level: clamp(saved.level | 0, 1, 12),
        xp: saved.xp | 0,
        gold: saved.gold | 0,
        zone: ZONES[saved.zone] ? saved.zone : 'goldhaven',
        x: Number(saved.x),
        y: Number(saved.y),
        hp: Number(saved.hp) || 0,
        res: Number(saved.res) || 0,
        potions: clamp(saved.potions | 0, 0, 99),
        quests: saved.quests || freshQuests(),
        bag: unpackBag((saved.bag || []).join ? saved.bag.join(',') : saved.bag),
        equip: {
          weapon: saved.equip && ITEMS[saved.equip.weapon] ? saved.equip.weapon : '',
          chest: saved.equip && ITEMS[saved.equip.chest] ? saved.equip.chest : ''
        }
      }, true);
    }
    bootAuth();
    resize();
    queueLoop();

    window.MONDO_MMO = {
      player: function () {
        return {
          name: player && player.name,
          level: player && player.level,
          xp: player && player.xp,
          gold: player && player.gold,
          zone: zoneId,
          x: player && player.x,
          y: player && player.y,
          hp: player && player.hp,
          cls: player && player.cls,
          faction: player && player.faction,
          bag: player ? player.bag.slice() : [],
          equip: player ? { weapon: player.equip.weapon, chest: player.equip.chest } : {},
          quests: player ? JSON.parse(JSON.stringify(player.quests)) : {}
        };
      },
      nearest: function (kind) {
        var best = null;
        var bd = 1e9;
        ents.forEach(function (e) {
          if (e.dead || e.kind !== kind) return;
          var d = dist(e, player);
          if (d < bd) { bd = d; best = e; }
        });
        return best ? { id: best.id, x: best.x, y: best.y, hp: best.hp, name: best.name } : null;
      },
      goto: function (x, y) { if (player) { player.x = x; player.y = y; dest = null; } },
      targetId: function (id) { targetId = id; },
      quest: function (id) { return player && player.quests[id]; },
      inWorld: function () { return playing; },
      realm: function () { return realmLive ? 'live' : 'solo'; },
      bots: function () { return bots.length; },
      logText: function () { return logs.map(function (l) { return l.text; }).join('\n'); }
    };
  }
  function aimJoy(e) {
    var rect = joyCanvas.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 128 - 64;
    var y = ((e.clientY - rect.top) / rect.height) * 128 - 64;
    var m = Math.hypot(x, y) || 1;
    if (m > 40) { x = x / m * 40; y = y / m * 40; }
    joy.x = x / 40;
    joy.y = y / 40;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
