/* Cinderwell: phone-first skirmish controls, fixed-step loop, local save. */
(function () {
  'use strict';

  var SIM = window.CINDER_SIM;
  var DRAW = window.CINDER_DRAW;
  var SAVE_KEY = 'mondosupreme.cinderwell.v1';
  var PREF_KEY = 'mondosupreme.cinderwell.prefs';
  var STEP = 1 / 30;

  var $ = function (id) { return document.getElementById(id); };
  var match = null;
  var ctx = null;
  var miniCtx = null;
  var camX = 0;
  var camY = 0;
  var zoom = 1;
  var viewW = 390;
  var viewH = 400;
  var sel = new Set();
  var placeType = '';
  var attackArm = false;
  var playing = false;
  var sheetOpen = false;
  var endShown = false;
  var acc = 0;
  var lastT = 0;
  var saveT = 0;
  var miniT = 0;
  var cardSig = '';
  var hotMap = {};
  var keys = {};
  var pointers = new Map();
  var gesture = 'none';
  var box = null;
  var pinch = null;
  var ghost = null;
  var idleCursor = 0;
  var soundOn = true;
  var reduced = false;
  var faction = 'kiln';
  var difficulty = 'normal';
  var dayOn = true;
  var loopOn = false;
  var dprCap = 2;

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        faction: faction, difficulty: difficulty, dayOn: dayOn ? 1 : 0, sound: soundOn ? 1 : 0
      }));
    } catch (e) { /* private mode */ }
  }
  function readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); }
    catch (e) { return null; }
  }
  function writeSave() {
    if (!match) return;
    var data = SIM.serialize(match);
    data.camX = Math.round(camX);
    data.camY = Math.round(camY);
    data.zoom = Math.round(zoom * 100) / 100;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
    catch (e) { /* full */ }
  }
  function juice() { return window.MONDO_JUICE || null; }
  function play(name) {
    var kit = juice();
    if (!kit || !soundOn) return;
    var now = performance.now();
    if (name === 'hit' && now < soundAt) return;
    if (name === 'hit') soundAt = now + 90;
    kit.play(name);
  }
  var soundAt = 0;
  function toast(text) {
    var node = $('toast');
    if (!node) return;
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { node.classList.remove('show'); }, 1600);
  }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function syncViewport() {
    var root = document.documentElement;
    if (!document.body.classList.contains('cinder-live')) {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
      return;
    }
    var vv = window.visualViewport;
    var top = vv ? vv.offsetTop : 0;
    var h = vv ? vv.height : window.innerHeight;
    var cssPx = window.MONDO_PAGE && window.MONDO_PAGE.cssPx ? window.MONDO_PAGE.cssPx : Math.round;
    root.style.setProperty('--vv-top', cssPx(top) + 'px');
    root.style.setProperty('--vv-h', cssPx(Math.max(1, h)) + 'px');
  }

  function resize() {
    var stage = $('stage');
    var canvas = $('world');
    var map = $('cwMap');
    if (!stage || !canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    viewW = Math.max(1, stage.clientWidth);
    viewH = Math.max(1, stage.clientHeight);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    var bw = Math.max(1, Math.round(viewW * dpr));
    var bh = Math.max(1, Math.round(viewH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    map.style.setProperty('width', '92px', 'important');
    map.style.setProperty('height', '92px', 'important');
    map.style.setProperty('aspect-ratio', '1 / 1', 'important');
    var mw = map.clientWidth;
    var mh = map.clientHeight;
    if (mw < 40 || mh < 40 || Math.abs(mw - mh) > 6) { mw = 88; mh = 88; }
    var mbw = Math.max(1, Math.round(mw * dpr));
    var mbh = Math.max(1, Math.round(mh * dpr));
    if (map.width !== mbw || map.height !== mbh) {
      map.width = mbw;
      map.height = mbh;
    }
    miniCtx = map.getContext('2d');
    miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    miniCtx.imageSmoothingEnabled = false;
    map._cssW = mw;
    map._cssH = mh;
    clampCam();
  }

  function clampCam() {
    if (!match) return;
    var worldW = SIM.W * SIM.TILE;
    var worldH = SIM.H * SIM.TILE;
    var vw = viewW / zoom;
    var vh = viewH / zoom;
    if (vw >= worldW) camX = (worldW - vw) / 2;
    else camX = Math.max(0, Math.min(worldW - vw, camX));
    if (vh >= worldH) camY = (worldH - vh) / 2;
    else camY = Math.max(0, Math.min(worldH - vh, camY));
  }

  function centerOn(x, y) {
    camX = x - (viewW / zoom) / 2;
    camY = y - (viewH / zoom) / 2;
    clampCam();
  }

  function lookAtHearth(side) {
    var i, b;
    for (i = 0; i < match.buildings.length; i++) {
      b = match.buildings[i];
      if (b.side === side && b.type === 'hearth' && !b.dead) {
        var c = SIM.centerOf(b);
        centerOn(c.x, c.y + 40);
        return;
      }
    }
  }

  function screenToWorld(sx, sy) {
    return { x: camX + sx / zoom, y: camY + sy / zoom };
  }
  function pageScale() {
    var n = window.MONDO_PAGE && window.MONDO_PAGE.factor ? window.MONDO_PAGE.factor() : 1;
    return n > 0 ? n : 1;
  }
  function localPoint(event) {
    var rect = $('world').getBoundingClientRect();
    var scale = pageScale();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale, rect: rect };
  }

  function selectedUnits() {
    var list = [];
    sel.forEach(function (id) {
      var ent = match.byId[id];
      if (ent && !ent.isB && !ent.dead) list.push(ent);
    });
    return list;
  }
  function selectedBuilding() {
    var found = null;
    sel.forEach(function (id) {
      var ent = match.byId[id];
      if (ent && ent.isB && !ent.dead) found = ent;
    });
    return found;
  }
  function unitIds(list) {
    var ids = [];
    var i;
    for (i = 0; i < list.length; i++) ids.push(list[i].id);
    return ids;
  }
  function onlyWorkers(list) {
    return list.length && list.every(function (u) { return u.type === 'worker'; });
  }

  function setSel(ids) {
    sel = new Set(ids);
    cardSig = '';
  }

  function orderAt(hit, world) {
    var list = selectedUnits();
    if (!list.length || match.over) return;
    var ids = unitIds(list);
    if (hit.unit && hit.unit.side !== 0 && !hit.unit.dead) {
      SIM.issue(match, ids, 'attack', 0, 0, { targetId: hit.unit.id });
      play('click');
      return;
    }
    if (hit.building && hit.building.side !== 0 && !hit.building.dead) {
      SIM.issue(match, ids, 'attack', 0, 0, { targetId: hit.building.id });
      play('click');
      return;
    }
    if (hit.building && hit.building.side === 0 && !hit.building.done && onlyWorkers(list)) {
      SIM.issue(match, ids, 'build', 0, 0, { buildId: hit.building.id });
      play('click');
      return;
    }
    if (hit.res && onlyWorkers(list)) {
      SIM.issue(match, ids, 'gather', world.x, world.y, { kind: hit.res === 'ore' ? 'ore' : 'thatch', tx: hit.tx, ty: hit.ty });
      play('click');
      return;
    }
    if (onlyWorkers(list) && !attackArm) SIM.issue(match, ids, 'move', world.x, world.y);
    else SIM.issue(match, ids, 'attackmove', world.x, world.y);
    attackArm = false;
    play('click');
  }

  function onTap(sx, sy, button, shift) {
    var world = screenToWorld(sx, sy);
    if (placeType && button !== 2) {
      tryPlace(world.x, world.y);
      return;
    }
    var hit = SIM.pick(match, world.x, world.y, 0);
    var command = button === 2 || attackArm;
    if (command && selectedUnits().length) {
      orderAt(hit, world);
      return;
    }
    if (hit.unit) {
      if (hit.unit.side === 0) {
        if (shift && sel.has(hit.unit.id)) sel.delete(hit.unit.id);
        else if (shift) sel.add(hit.unit.id);
        else setSel([hit.unit.id]);
        play('click');
        return;
      }
      if (selectedUnits().length) orderAt(hit, world);
      else { setSel([hit.unit.id]); }
      return;
    }
    if (hit.building) {
      var hands = selectedUnits();
      if (hit.building.side === 0 && !hit.building.done && onlyWorkers(hands)) {
        orderAt(hit, world);
        return;
      }
      if (hit.building.side !== 0 && hands.length) {
        orderAt(hit, world);
        return;
      }
      setSel([hit.building.id]);
      play('click');
      return;
    }
    if (hit.res && onlyWorkers(selectedUnits())) {
      orderAt(hit, world);
      return;
    }
    if (selectedUnits().length) orderAt(hit, world);
  }

  function tryPlace(x, y) {
    var def = SIM.DEFS[placeType];
    if (!def) { placeType = ''; return; }
    var tx = (x / SIM.TILE | 0) - (def.w >> 1);
    var ty = (y / SIM.TILE | 0) - (def.h >> 1);
    var hands = [];
    selectedUnits().forEach(function (u) { if (u.type === 'worker') hands.push(u.id); });
    if (!hands.length) { toast('Select a hand to build'); return; }
    var res = SIM.place(match, 0, placeType, tx, ty, hands);
    if (!res.ok) {
      toast(res.reason === 'cost' ? 'Need more ore or thatch' : 'That ground will not hold it');
      ghost = { type: placeType, tx: tx, ty: ty, ok: false };
      return;
    }
    placeType = '';
    ghost = null;
    play('launch');
    cardSig = '';
  }

  function runCommand(cmd) {
    if (!match || match.over) return;
    if (cmd === 'stop') {
      SIM.issue(match, unitIds(selectedUnits()), 'stop');
      attackArm = false;
      placeType = '';
      play('click');
      return;
    }
    if (cmd === 'hold') {
      SIM.issue(match, unitIds(selectedUnits()), 'hold');
      attackArm = false;
      play('click');
      return;
    }
    if (cmd === 'attack') {
      attackArm = !attackArm;
      placeType = '';
      toast(attackArm ? 'Tap where they should attack' : 'Attack-move off');
      return;
    }
    if (cmd === 'cancel') {
      placeType = '';
      ghost = null;
      attackArm = false;
      cardSig = '';
      return;
    }
    if (cmd.indexOf('build:') === 0) {
      var type = cmd.slice(6);
      if (!SIM.canAfford(match, 0, SIM.DEFS[type].cost)) { toast('Need more ore or thatch'); return; }
      placeType = placeType === type ? '' : type;
      attackArm = false;
      ghost = null;
      cardSig = '';
      if (placeType) toast('Tap open grass');
      return;
    }
    var building = selectedBuilding();
    if (cmd.indexOf('train:') === 0) {
      if (!building) return;
      var trained = SIM.train(match, building.id, cmd.slice(6));
      if (!trained.ok) toast(trained.reason === 'pop' ? 'Need a yard for more supply' : trained.reason === 'queue' ? 'Queue is full' : 'Need more ore or thatch');
      else play('click');
      cardSig = '';
      return;
    }
    if (cmd === 'research') {
      if (!building) return;
      var found = SIM.research(match, building.id);
      if (!found.ok) toast(found.reason === 'done' ? 'Already whetted' : 'Need more ore or thatch');
      else play('power');
      cardSig = '';
      return;
    }
    if (cmd === 'cancelBuild') {
      if (building) SIM.cancelBuild(match, building.id);
      setSel([]);
      play('click');
      return;
    }
    if (cmd === 'cancelTrain') {
      if (building) SIM.cancelTrain(match, building.id);
      play('click');
      cardSig = '';
    }
  }

  function selectIdle() {
    var ids = SIM.idsWhere(match, 0, function (u) { return u.type === 'worker' && u.order === 'idle'; });
    if (!ids.length) { toast('No idle hands'); return; }
    idleCursor = idleCursor % ids.length;
    var id = ids[idleCursor++];
    setSel([id]);
    var u = match.byId[id];
    if (u) centerOn(u.x, u.y);
  }
  function selectArmy() {
    var ids = SIM.idsWhere(match, 0, function (u) { return u.type !== 'worker'; });
    if (!ids.length) { toast('No army yet'); return; }
    setSel(ids);
    play('click');
  }

  function costText(cost) {
    if (!cost) return '';
    return cost[0] + '/' + cost[1];
  }
  function poor(cost) {
    return !SIM.canAfford(match, 0, cost);
  }

  function describe() {
    var units = selectedUnits();
    var building = selectedBuilding();
    var counts = {};
    var i;
    for (i = 0; i < units.length; i++) counts[units[i].type] = (counts[units[i].type] || 0) + 1;
    var bits = [];
    Object.keys(counts).forEach(function (type) {
      bits.push(counts[type] + ' ' + SIM.DEFS[type].name + (counts[type] > 1 ? 's' : ''));
    });
    if (bits.length) return bits.join(' · ');
    if (building) {
      var name = SIM.DEFS[building.type].name;
      if (!building.done) return name + ' · ' + Math.round(building.progress * 100) + '%';
      if (building.queue.length) return name + ' · ' + building.queue.length + ' in queue';
      return name + ' · ' + Math.max(0, Math.round(building.hp)) + '/' + building.hpMax;
    }
    return placeType ? 'Tap grass to raise a ' + SIM.DEFS[placeType].name : 'Tap a hand or a building';
  }

  function buttonList() {
    var units = selectedUnits();
    var building = selectedBuilding();
    var buttons = [];
    if (placeType) buttons.push({ cmd: 'cancel', label: 'Cancel', sub: 'esc', key: 'Escape' });
    if (!units.length && building) {
      if (!building.done) {
        buttons.push({ cmd: 'cancelBuild', label: 'Refund', sub: '75%', key: 'x' });
        return buttons;
      }
      var trains = SIM.trainsOf(match, building);
      var keys = ['c', 'p', 'o', 'u', 'v', 'g'];
      var ki = 0;
      trains.forEach(function (type) {
        var def = SIM.DEFS[type];
        buttons.push({ cmd: 'train:' + type, label: def.label, sub: costText(def.cost), key: keys[ki++] || '', poor: poor(def.cost) });
      });
      if (building.type === 'shrine' && !match.upgrades[0]) {
        buttons.push({ cmd: 'research', label: 'Whet', sub: costText(SIM.DEFS.shrine.research), key: 'k', poor: poor(SIM.DEFS.shrine.research) });
      }
      if (building.queue.length) buttons.push({ cmd: 'cancelTrain', label: 'Undo', sub: 'last', key: 'x' });
      return buttons.slice(0, 6);
    }
    if (onlyWorkers(units)) {
      [['barracks', 'Arms', 'b'], ['yard', 'Yard', 'y'], ['tower', 'Watch', 't'], ['shrine', 'Shrine', 'r']].forEach(function (row) {
        buttons.push({
          cmd: 'build:' + row[0],
          label: row[1],
          sub: costText(SIM.DEFS[row[0]].cost),
          key: row[2],
          poor: poor(SIM.DEFS[row[0]].cost),
          on: placeType === row[0]
        });
      });
      buttons.push({ cmd: 'stop', label: 'Stop', sub: 's', key: 's' });
      return buttons.slice(0, 6);
    }
    if (units.length) {
      buttons.push({ cmd: 'attack', label: 'Attack', sub: 'a', key: 'a', on: attackArm });
      buttons.push({ cmd: 'stop', label: 'Stop', sub: 's', key: 's' });
      buttons.push({ cmd: 'hold', label: 'Hold', sub: 'h', key: 'h' });
    }
    return buttons.slice(0, 6);
  }

  function paintCard() {
    if (!match) return;
    var info = describe();
    var buttons = buttonList();
    var sig = info + '|' + placeType + '|' + (attackArm ? 1 : 0) + '|' + buttons.map(function (b) {
      return b.cmd + (b.poor ? '!' : '') + (b.on ? '*' : '');
    }).join(',');
    var infoNode = $('info');
    if (infoNode.textContent !== info) infoNode.textContent = info;
    if (sig === cardSig) return;
    cardSig = sig;
    hotMap = { s: 'stop', h: 'hold', a: 'attack', escape: 'cancel' };
    var card = $('card');
    card.replaceChildren();
    buttons.forEach(function (b, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.cmd = b.cmd;
      if (b.poor) btn.classList.add('is-poor');
      if (b.on) btn.classList.add('is-on');
      btn.setAttribute('aria-pressed', b.on ? 'true' : 'false');
      var name = document.createElement('b');
      name.textContent = b.label;
      var sub = document.createElement('small');
      sub.textContent = b.sub || '';
      btn.appendChild(name);
      btn.appendChild(sub);
      if (b.key) hotMap[b.key.toLowerCase()] = b.cmd;
      hotMap[String(index + 1)] = b.cmd;
      card.appendChild(btn);
    });
  }

  function paintHud() {
    if (!match) return;
    var ore = String(match.res[0].ore | 0);
    var thatch = String(match.res[0].thatch | 0);
    var sup = SIM.supply(match, 0);
    var pop = sup.used + '/' + sup.cap;
    if ($('ore').textContent !== ore) $('ore').textContent = ore;
    if ($('thatch').textContent !== thatch) $('thatch').textContent = thatch;
    if ($('pop').textContent !== pop) $('pop').textContent = pop;
    var who = SIM.FACTIONS[match.faction[0]].name + ' · ' + SIM.FACTIONS[match.faction[1]].name;
    if ($('versus').textContent !== who) $('versus').textContent = who;
    var idle = SIM.idsWhere(match, 0, function (u) { return u.type === 'worker' && u.order === 'idle'; }).length;
    var idleLabel = 'Idle' + (idle ? ' ' + idle : '');
    if ($('btnIdle').textContent !== idleLabel) $('btnIdle').textContent = idleLabel;
    var alert = $('alert');
    var line = '';
    if (match.alert && match.alert.life > 0) line = match.alert.text;
    else if (match.note && match.note.life > 0) line = match.note.text;
    if (alert.dataset.line !== line) {
      alert.dataset.line = line;
      if (line) {
        alert.textContent = line;
        alert.classList.add('show');
      } else alert.classList.remove('show');
    }
    if (match.over && !endShown) {
      endShown = true;
      var won = match.winner === 0;
      $('endTitle').textContent = won ? SIM.FACTIONS[match.faction[0]].name + ' holds the basin' : (match.winner === 1 ? 'Your hearth fell' : 'Both hearths fell');
      $('end').hidden = false;
      play(won ? 'win' : 'hurt');
      var kit = juice();
      if (won && kit && !reduced) kit.confetti();
      writeSave();
    }
    paintCard();
  }

  function draw() {
    if (!ctx || !match) return;
    var kit = juice();
    var shake = kit && !reduced ? kit.shakeOffset() : { x: 0, y: 0 };
    DRAW.world(ctx, match, {
      camX: camX - shake.x, camY: camY - shake.y, zoom: zoom, w: viewW, h: viewH,
      sel: sel, ghost: ghost, box: box, reduced: reduced
    });
    if (miniCtx && performance.now() > miniT) {
      miniT = performance.now() + 140;
      DRAW.mini(miniCtx, match, {
        camX: camX, camY: camY, zoom: zoom, w: viewW, h: viewH,
        mw: $('cwMap')._cssW || 92, mh: $('cwMap')._cssH || 92,
        alert: match.alert
      });
    }
  }

  function frame(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    var kit = juice();
    if (kit && kit.timeScale) dt = kit.timeScale(dt);
    if (playing && match && !sheetOpen && !document.hidden) {
      var pan = 280 / zoom * dt;
      if (keys.ArrowLeft) camX -= pan;
      if (keys.ArrowRight) camX += pan;
      if (keys.ArrowUp) camY -= pan;
      if (keys.ArrowDown) camY += pan;
      clampCam();
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 5) {
        var fxBefore = match.fx.length;
        SIM.step(match, STEP);
        if (match.fx.length > fxBefore && match.fx[match.fx.length - 1].kind !== 'pop') {
          if (kit && !reduced) kit.shake(3, 120);
          play('hit');
        }
        acc -= STEP;
        n++;
      }
      saveT += dt;
      if (saveT > 5) { saveT = 0; writeSave(); }
    }
    if (playing) {
      draw();
      paintHud();
    }
    requestAnimationFrame(frame);
  }

  function ensureLoop() {
    if (loopOn) return;
    loopOn = true;
    requestAnimationFrame(frame);
  }

  function enterLive() {
    playing = true;
    document.body.classList.add('cinder-live');
    document.documentElement.classList.add('cinder-live');
    $('lobby').hidden = true;
    $('play').hidden = false;
    $('end').hidden = !match.over;
    endShown = !!match.over;
    sheetOpen = false;
    $('sheet').hidden = true;
    syncViewport();
    resize();
    ensureLoop();
  }

  function leaveLive() {
    writeSave();
    playing = false;
    document.body.classList.remove('cinder-live');
    document.documentElement.classList.remove('cinder-live');
    $('play').hidden = true;
    $('lobby').hidden = false;
    syncViewport();
    paintResume();
  }

  function begin(fromSave) {
    placeType = '';
    ghost = null;
    attackArm = false;
    sheetOpen = false;
    endShown = false;
    sel = new Set();
    cardSig = '';
    acc = 0;
    if (fromSave) {
      match = SIM.restore(fromSave);
      if (!match) { toast('That save could not be read'); return; }
      faction = match.faction[0];
      difficulty = match.difficulty;
      dayOn = !!match.dayOn;
      camX = fromSave.camX || 0;
      camY = fromSave.camY || 0;
      zoom = fromSave.zoom || 1;
    } else {
      match = SIM.create({ faction: faction, difficulty: difficulty, dayOn: dayOn, seed: (Math.random() * 0x7fffffff) | 0 });
      match.note = { text: 'Hands are gathering. Tap them, then Arms.', life: 5 };
      zoom = 1.2;
    }
    enterLive();
    if (!fromSave) lookAtHearth(0);
    else clampCam();
    resize();
    paintPicks();
  }

  function paintResume() {
    var data = readSave();
    var btn = $('resume');
    if (!data) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.textContent = data.over ? 'Review last skirmish' : 'Resume skirmish';
  }

  function paintPicks() {
    document.querySelectorAll('[data-faction]').forEach(function (btn) {
      var on = btn.getAttribute('data-faction') === faction;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-diff]').forEach(function (btn) {
      var on = btn.getAttribute('data-diff') === difficulty;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('dayOn').checked = dayOn;
    $('soundLobby').textContent = soundOn ? 'Sound on' : 'Sound off';
    $('soundLobby').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    var sheetSound = $('soundSheet');
    if (sheetSound) {
      sheetSound.textContent = soundOn ? 'Sound on' : 'Sound off';
      sheetSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    }
  }

  function onKey(event) {
    if (!playing || event.metaKey || event.ctrlKey || event.altKey) return;
    var key = event.key;
    keys[key] = true;
    if (event.repeat) return;
    if (key === 'Escape') {
      if (sheetOpen) { sheetOpen = false; $('sheet').hidden = true; return; }
      placeType = '';
      ghost = null;
      attackArm = false;
      cardSig = '';
      event.preventDefault();
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      var list = selectedUnits();
      if (list.length === 1) centerOn(list[0].x, list[0].y);
      else if (list.length) {
        var ax = 0;
        var ay = 0;
        list.forEach(function (u) { ax += u.x; ay += u.y; });
        centerOn(ax / list.length, ay / list.length);
      } else lookAtHearth(0);
      return;
    }
    if (key === 'f' || key === 'F') { selectIdle(); event.preventDefault(); return; }
    if (key === 'q' || key === 'Q') { selectArmy(); event.preventDefault(); return; }
    if (key === 'm' || key === 'M') { toggleSheet(); event.preventDefault(); return; }
    var cmd = hotMap[key.toLowerCase()] || hotMap[key];
    if (cmd) {
      runCommand(cmd);
      event.preventDefault();
    }
    if (key.indexOf('Arrow') === 0) event.preventDefault();
  }
  function onKeyUp(event) { keys[event.key] = false; }

  function toggleSheet() {
    sheetOpen = !sheetOpen;
    $('sheet').hidden = !sheetOpen;
    paintPicks();
  }

  function edgeStart(p) {
    return p.x < 28 || p.rect.width - p.x < 28;
  }

  function bindPointers() {
    var canvas = $('world');
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    canvas.addEventListener('pointerdown', function (event) {
      canvas.setPointerCapture(event.pointerId);
      var p = localPoint(event);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY, lx: p.x, ly: p.y, button: event.button });
      if (pointers.size >= 2) {
        gesture = 'pinch';
        pinch = null;
        box = null;
      } else if (event.button === 1) gesture = 'pan';
      else gesture = 'pending';
    });
    canvas.addEventListener('pointermove', function (event) {
      var cur = pointers.get(event.pointerId);
      if (!cur) return;
      var prevX = cur.x;
      var prevY = cur.y;
      cur.x = event.clientX;
      cur.y = event.clientY;
      var p = localPoint(event);
      if (pointers.size >= 2) {
        var pts = [];
        pointers.forEach(function (pt) { pts.push(pt); });
        var cx = (pts[0].x + pts[1].x) / 2;
        var cy = (pts[0].y + pts[1].y) / 2;
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        if (!pinch) pinch = { cx: cx, cy: cy, dist: dist, camX: camX, camY: camY, zoom: zoom, rectLeft: p.rect.left, rectTop: p.rect.top };
        var scale = pageScale();
        var worldX = pinch.camX + (pinch.cx - pinch.rectLeft) / scale / pinch.zoom;
        var worldY = pinch.camY + (pinch.cy - pinch.rectTop) / scale / pinch.zoom;
        zoom = Math.max(0.65, Math.min(1.65, pinch.zoom * (dist / pinch.dist)));
        camX = worldX - (cx - p.rect.left) / scale / zoom;
        camY = worldY - (cy - p.rect.top) / scale / zoom;
        clampCam();
        gesture = 'pinch';
        return;
      }
      if (gesture === 'locked' || gesture === 'pinch') return;
      var moved = Math.hypot(cur.x - cur.sx, cur.y - cur.sy) / pageScale();
      if (gesture === 'pending' && moved > 12) {
        var start = { x: cur.lx, y: cur.ly, rect: p.rect };
        if (cur.button === 2 || cur.button === 1 || edgeStart(start)) gesture = 'pan';
        else gesture = 'box';
      }
      if (gesture === 'pan') {
        camX -= (cur.x - prevX) / pageScale() / zoom;
        camY -= (cur.y - prevY) / pageScale() / zoom;
        clampCam();
      } else if (gesture === 'box') {
        var x0 = Math.min(cur.lx, p.x);
        var y0 = Math.min(cur.ly, p.y);
        box = { x: x0, y: y0, w: Math.abs(p.x - cur.lx), h: Math.abs(p.y - cur.ly) };
      } else if (placeType) {
        var world = screenToWorld(p.x, p.y);
        var def = SIM.DEFS[placeType];
        var tx = (world.x / SIM.TILE | 0) - (def.w >> 1);
        var ty = (world.y / SIM.TILE | 0) - (def.h >> 1);
        ghost = { type: placeType, tx: tx, ty: ty, ok: SIM.canPlace(match, 0, placeType, tx, ty) };
      }
    });
    function finish(event) {
      var cur = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);
      if (!cur) return;
      if (pointers.size > 0) {
        gesture = 'locked';
        pinch = null;
        box = null;
        return;
      }
      var moved = Math.hypot(cur.x - cur.sx, cur.y - cur.sy) / pageScale();
      if (gesture === 'box' && box && (box.w > 10 || box.h > 10)) {
        var a = screenToWorld(box.x, box.y);
        var b = screenToWorld(box.x + box.w, box.y + box.h);
        var ids = SIM.unitsInRect(match, a.x, a.y, b.x, b.y, 0);
        if (!ids.length) ids = SIM.unitsInRect(match, a.x - 18, a.y - 18, b.x + 18, b.y + 18, 0);
        if (event.shiftKey) ids.forEach(function (id) { sel.add(id); });
        else setSel(ids);
      } else if ((gesture === 'pending' || gesture === 'pan' && cur.button === 2) && moved < 12) {
        onTap(cur.lx, cur.ly, cur.button, event.shiftKey);
      } else if (gesture === 'pending') {
        onTap(cur.lx, cur.ly, cur.button, event.shiftKey);
      }
      gesture = 'none';
      pinch = null;
      box = null;
    }
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('wheel', function (event) {
      if (!playing) return;
      event.preventDefault();
      var p = localPoint(event);
      var old = zoom;
      zoom = Math.max(0.65, Math.min(1.65, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      var wx = camX + p.x / old;
      var wy = camY + p.y / old;
      camX = wx - p.x / zoom;
      camY = wy - p.y / zoom;
      clampCam();
    }, { passive: false });

    var map = $('cwMap');
    function jumpMap(event) {
      var rect = map.getBoundingClientRect();
      var mx = (event.clientX - rect.left) / rect.width;
      var my = (event.clientY - rect.top) / rect.height;
      centerOn(mx * SIM.W * SIM.TILE, my * SIM.H * SIM.TILE);
    }
    map.addEventListener('pointerdown', function (event) {
      map.setPointerCapture(event.pointerId);
      jumpMap(event);
    });
    map.addEventListener('pointermove', function (event) {
      if (event.buttons) jumpMap(event);
    });
  }

  function boot() {
    reduced = reducedMotion();
    var stored = prefs();
    if (stored.faction === 'reed' || stored.faction === 'kiln') faction = stored.faction;
    if (stored.difficulty === 'easy' || stored.difficulty === 'normal') difficulty = stored.difficulty;
    if (stored.dayOn != null) dayOn = !!stored.dayOn;
    if (stored.sound != null) soundOn = !!stored.sound;
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    paintPicks();
    paintResume();
    document.querySelectorAll('[data-faction]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        faction = btn.getAttribute('data-faction');
        savePrefs();
        paintPicks();
      });
    });
    document.querySelectorAll('[data-diff]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        difficulty = btn.getAttribute('data-diff');
        savePrefs();
        paintPicks();
      });
    });
    $('dayOn').addEventListener('change', function () {
      dayOn = $('dayOn').checked;
      if (match) match.dayOn = dayOn;
      savePrefs();
    });
    function flipSound() {
      soundOn = !soundOn;
      savePrefs();
      paintPicks();
      if (soundOn) play('click');
    }
    $('soundLobby').addEventListener('click', flipSound);
    $('soundSheet').addEventListener('click', flipSound);
    $('start').addEventListener('click', function () { begin(null); });
    $('resume').addEventListener('click', function () {
      var data = readSave();
      if (data) begin(data);
    });
    $('card').addEventListener('click', function (event) {
      var btn = event.target.closest('button');
      if (!btn || !$('card').contains(btn)) return;
      runCommand(btn.dataset.cmd);
    });
    $('btnIdle').addEventListener('click', selectIdle);
    $('btnArmy').addEventListener('click', selectArmy);
    $('btnStop').addEventListener('click', function () { runCommand('stop'); });
    $('btnMenu').addEventListener('click', toggleSheet);
    $('sheetClose').addEventListener('click', toggleSheet);
    $('giveUp').addEventListener('click', function () {
      if (!match || match.over) return;
      SIM.abandon(match, 0);
      sheetOpen = false;
      $('sheet').hidden = true;
    });
    $('leave').addEventListener('click', function () {
      sheetOpen = false;
      leaveLive();
    });
    $('rematch').addEventListener('click', function () { begin(null); });
    $('endLeave').addEventListener('click', leaveLive);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', function () { syncViewport(); resize(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { syncViewport(); resize(); });
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) writeSave();
    });
    window.addEventListener('pagehide', writeSave);
    bindPointers();
    window.CINDER = {
      get match() { return match; },
      get cam() { return { x: camX, y: camY, zoom: zoom }; },
      battle: function () {
        if (!match) return;
        var spot = SIM.debugBattle(match);
        centerOn(spot.x, spot.y);
        setSel(SIM.idsWhere(match, 0, function (u) { return u.type !== 'worker' && Math.abs(u.x - spot.x) < 220; }));
      },
      step: function (seconds) {
        var n = Math.round(seconds / STEP);
        var i;
        for (i = 0; i < n; i++) SIM.step(match, STEP);
      },
      selectWorkers: function () {
        setSel(SIM.idsWhere(match, 0, function (u) { return u.type === 'worker'; }));
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
