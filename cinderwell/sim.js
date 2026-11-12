/* Cinderwell skirmish simulation. No DOM. Fixed-step callers pass seconds. */
(function (root) {
  'use strict';

  var W = 56;
  var H = 56;
  var TILE = 32;
  var WORLD = W * TILE;
  var GRASS = 0;
  var WATER = 1;
  var CLIFF = 2;
  var TREE = 3;
  var ORE = 4;
  var PATH = 5;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  var FACTIONS = {
    kiln: {
      id: 'kiln',
      name: 'Kilnward',
      blurb: 'Soot and bronze. Furnace Guards shrug off arrows, and a Kiln Titan walks with the line.'
    },
    reed: {
      id: 'reed',
      name: 'Reedhost',
      blurb: 'Bone and reed. Mist Skiffs cross the river, and a Reed Saint mends the marsh line.'
    }
  };

  /* cost is [ore, thatch]. Bonus keys are target classes. */
  var DEFS = {
    worker: { label: 'Hand', name: 'Hand', plain: 'Worker', role: 'Gathers and builds', cls: 'worker', hp: 42, dmg: 3, range: 18, reload: 1, speed: 74, sight: 6, radius: 10, cost: [0, 50], time: 8 },
    pike: { label: 'Pike', name: 'Pike', plain: 'Pike', role: 'Melee, beats rams', cls: 'melee', hp: 96, dmg: 9, range: 34, reload: 0.85, speed: 68, sight: 7, radius: 11, cost: [35, 20], time: 9, bonus: { siege: 1.8, ranged: 1.15 } },
    bow: { label: 'Bow', name: 'Bow', plain: 'Bow', role: 'Ranged, beats pikes', cls: 'ranged', hp: 52, dmg: 7, range: 118, reload: 1.05, speed: 64, sight: 8, radius: 10, cost: [25, 35], time: 9, projectile: 'arrow', bonus: { melee: 1.55, siege: 1.5 } },
    ram: { label: 'Ram', name: 'Ram', plain: 'Ram', role: 'Cracks buildings', cls: 'siege', hp: 120, dmg: 11, range: 128, reload: 1.85, speed: 40, sight: 7, radius: 14, cost: [90, 40], time: 15, projectile: 'rock', aoe: 30, vsBuilding: 2.6 },
    guard: { label: 'Guard', name: 'Furnace Guard', plain: 'Guard', role: 'Shrugs off arrows', cls: 'melee', fac: 'kiln', hp: 156, dmg: 8, range: 34, reload: 1, speed: 54, sight: 7, radius: 13, cost: [55, 28], time: 12, armor: 0.5 },
    skiff: { label: 'Skiff', name: 'Mist Skiff', plain: 'Skiff', role: 'Crosses the river', cls: 'ranged', fac: 'reed', hp: 64, dmg: 9, range: 102, reload: 0.95, speed: 94, sight: 8, radius: 12, cost: [42, 36], time: 12, projectile: 'dart', water: true, bonus: { siege: 1.9 } },
    titan: { label: 'Titan', name: 'Kiln Titan', plain: 'Titan', role: 'Mythic melee', cls: 'mythic', fac: 'kiln', hp: 340, dmg: 18, range: 36, reload: 1.25, speed: 44, sight: 7, radius: 16, cost: [160, 90], time: 22, aoe: 36, vsBuilding: 1.45 },
    saint: { label: 'Saint', name: 'Reed Saint', plain: 'Saint', role: 'Heals your line', cls: 'mythic', fac: 'reed', hp: 196, dmg: 12, range: 114, reload: 1.15, speed: 52, sight: 8, radius: 12, cost: [145, 100], time: 22, projectile: 'mist', aoe: 28, heal: 3.2, healRange: 80 },
    hearth: { label: 'Hearth', name: 'Hearth', hp: 980, w: 3, h: 3, time: 1, sight: 8, cost: [0, 0], drop: true, supply: 12 },
    barracks: { label: 'Arms', name: 'Barracks', plain: 'Barracks', role: 'Trains soldiers', hp: 520, w: 3, h: 2, time: 12, sight: 7, cost: [40, 100] },
    yard: { label: 'Yard', name: 'Yard', plain: 'Yard', role: 'Drops off resources', hp: 380, w: 2, h: 2, time: 8, sight: 6, cost: [0, 80], drop: true, supply: 8 },
    tower: { label: 'Watch', name: 'Watchtower', plain: 'Tower', role: 'Shoots enemies', hp: 440, w: 2, h: 2, time: 14, sight: 9, cost: [80, 60], attack: 9, range: 156, reload: 0.9, projectile: 'arrow' },
    shrine: { label: 'Shrine', name: 'Shrine', plain: 'Shrine', role: 'Rams and mythic', hp: 420, w: 2, h: 2, time: 16, sight: 7, cost: [120, 90], research: [80, 40] }
  };

  function makeRng(seed) {
    var a = seed >>> 0;
    return {
      next: function () {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      },
      get: function () { return a >>> 0; },
      set: function (n) { a = n >>> 0; }
    };
  }

  function tileIndex(tx, ty) { return ty * W + tx; }
  function inMap(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }
  function tileAt(x, y) {
    return { x: Math.max(0, Math.min(W - 1, x / TILE | 0)), y: Math.max(0, Math.min(H - 1, y / TILE | 0)) };
  }
  function other(side) { return side === 0 ? 1 : 0; }
  function uniqueOf(fac) { return fac === 'kiln' ? 'guard' : 'skiff'; }
  function mythicOf(fac) { return fac === 'kiln' ? 'titan' : 'saint'; }

  function trainsOf(state, building) {
    var fac = state.faction[building.side];
    if (building.type === 'hearth') return ['worker'];
    if (building.type === 'barracks') return ['pike', 'bow', uniqueOf(fac)];
    if (building.type === 'shrine') return ['ram', mythicOf(fac)];
    return [];
  }

  function blocked(state, tx, ty, waterOk) {
    if (!inMap(tx, ty)) return true;
    var i = tileIndex(tx, ty);
    var t = state.terrain[i];
    if (t === CLIFF || t === TREE) return true;
    if (t === WATER && !waterOk) return true;
    if (state.occ[i]) return true;
    return false;
  }

  function openPoint(state, x, y, unit) {
    if (x < 4 || y < 4 || x >= WORLD - 4 || y >= WORLD - 4) return false;
    var t = tileAt(x, y);
    return !blocked(state, t.x, t.y, !!(unit && DEFS[unit.type].water));
  }

  function occupy(state, b, on) {
    var y, x, i;
    for (y = 0; y < b.h; y++) {
      for (x = 0; x < b.w; x++) {
        i = tileIndex(b.tx + x, b.ty + y);
        if (on) state.occ[i] = b.id;
        else if (state.occ[i] === b.id) state.occ[i] = 0;
      }
    }
    state.blockRev++;
  }

  function footprintFree(state, tx, ty, w, h) {
    var x, y, i;
    if (tx < 1 || ty < 1 || tx + w >= W - 1 || ty + h >= H - 1) return false;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = tileIndex(tx + x, ty + y);
        if ((state.terrain[i] !== GRASS && state.terrain[i] !== PATH) || state.occ[i]) return false;
      }
    }
    return true;
  }

  function unitOnFootprint(state, tx, ty, w, h) {
    var i, u, t;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead) continue;
      t = tileAt(u.x, u.y);
      if (t.x >= tx && t.x < tx + w && t.y >= ty && t.y < ty + h) return true;
    }
    return false;
  }

  function visibleFoot(state, side, tx, ty, w, h) {
    var fog = state.fog[side];
    var cx = tx + (w >> 1);
    var cy = ty + (h >> 1);
    var x, y, seen;
    if (!inMap(cx, cy) || fog[tileIndex(cx, cy)] !== 2) return false;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        seen = fog[tileIndex(tx + x, ty + y)];
        if (!seen) return false;
      }
    }
    return true;
  }

  /* The footprint is several tiles. A tap on open grass often covers a hand, a tree, or a dim corner. */
  function nearestSite(state, side, type, tx, ty, radius) {
    var limit = radius == null ? 7 : radius;
    var best = null;
    var bestD = 1e9;
    var r, dy, dx, d;
    for (r = 0; r <= limit; r++) {
      for (dy = -r; dy <= r; dy++) {
        for (dx = -r; dx <= r; dx++) {
          if (r && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!canPlace(state, side, type, tx + dx, ty + dy)) continue;
          d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { tx: tx + dx, ty: ty + dy }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function siteNearHearth(state, side, type) {
    var home = null;
    var i, b;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.side === side && b.type === 'hearth' && !b.dead) home = b;
    }
    if (!home) return null;
    return nearestSite(state, side, type, home.tx, home.ty + home.h + 1, 9);
  }

  function canPlace(state, side, type, tx, ty) {
    var d = DEFS[type];
    if (!d || !d.w || type === 'hearth') return false;
    if (!footprintFree(state, tx, ty, d.w, d.h)) return false;
    if (unitOnFootprint(state, tx, ty, d.w, d.h)) return false;
    if (side === 0 && !visibleFoot(state, 0, tx, ty, d.w, d.h)) return false;
    return true;
  }

  function centerOf(ent) {
    if (!ent) return { x: 0, y: 0 };
    if (ent.isB) return { x: (ent.tx + ent.w / 2) * TILE, y: (ent.ty + ent.h / 2) * TILE };
    return { x: ent.x, y: ent.y };
  }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Distance to a unit point, or to the nearest point on a building footprint. */
  function distToEnt(x, y, ent) {
    if (!ent || !ent.isB) return dist(x, y, ent.x, ent.y);
    var left = ent.tx * TILE;
    var top = ent.ty * TILE;
    var right = left + ent.w * TILE;
    var bot = top + ent.h * TILE;
    var cx = Math.max(left, Math.min(x, right));
    var cy = Math.max(top, Math.min(y, bot));
    return dist(x, y, cx, cy);
  }

  function nearestOpenTile(state, tx, ty, waterOk) {
    var r, dy, dx;
    if (inMap(tx, ty) && !blocked(state, tx, ty, waterOk)) return { x: tx, y: ty };
    for (r = 1; r < 12; r++) {
      for (dy = -r; dy <= r; dy++) {
        for (dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (inMap(tx + dx, ty + dy) && !blocked(state, tx + dx, ty + dy, waterOk)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return { x: tx, y: ty };
  }

  function adjacentPoint(state, tx, ty, w, h, unit) {
    var waterOk = !!(unit && DEFS[unit.type].water);
    var best = null;
    var bestD = 1e12;
    var x, y, cx, cy, d;
    for (y = ty - 1; y <= ty + h; y++) {
      for (x = tx - 1; x <= tx + w; x++) {
        if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
        if (!inMap(x, y) || blocked(state, x, y, waterOk)) continue;
        cx = (x + 0.5) * TILE;
        cy = (y + 0.5) * TILE;
        d = dist(unit.x, unit.y, cx, cy);
        if (d < bestD) { bestD = d; best = { x: cx, y: cy, tx: x, ty: y }; }
      }
    }
    if (!best) {
      var n = nearestOpenTile(state, tx, ty, waterOk);
      best = { x: (n.x + 0.5) * TILE, y: (n.y + 0.5) * TILE, tx: n.x, ty: n.y };
    }
    return best;
  }

  function touchingTile(unit, tx, ty) {
    var t = tileAt(unit.x, unit.y);
    return Math.max(Math.abs(t.x - tx), Math.abs(t.y - ty)) <= 1;
  }

  function touchingBuilding(unit, b) {
    var t = tileAt(unit.x, unit.y);
    var x0 = b.tx - 1;
    var y0 = b.ty - 1;
    var x1 = b.tx + b.w;
    var y1 = b.ty + b.h;
    return t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1 && !(t.x >= b.tx && t.x < b.tx + b.w && t.y >= b.ty && t.y < b.ty + b.h);
  }

  function flow(state, tx, ty, waterOk) {
    var key = tx + ',' + ty + ',' + (waterOk ? 1 : 0) + ',' + state.blockRev;
    var i, cached;
    for (i = 0; i < state.flows.length; i++) {
      cached = state.flows[i];
      if (cached.key === key) return cached.cost;
    }
    var open = nearestOpenTile(state, tx, ty, waterOk);
    var cost = new Int16Array(W * H);
    cost.fill(-1);
    var qx = new Int16Array(W * H);
    var qy = new Int16Array(W * H);
    var head = 0;
    var tail = 0;
    qx[tail] = open.x;
    qy[tail] = open.y;
    tail++;
    cost[tileIndex(open.x, open.y)] = 0;
    while (head < tail) {
      var x = qx[head];
      var y = qy[head];
      head++;
      var base = cost[tileIndex(x, y)];
      var d;
      for (d = 0; d < 8; d++) {
        var nx = x + DIRS[d][0];
        var ny = y + DIRS[d][1];
        if (!inMap(nx, ny) || cost[tileIndex(nx, ny)] >= 0) continue;
        if (blocked(state, nx, ny, waterOk)) continue;
        if (DIRS[d][0] !== 0 && DIRS[d][1] !== 0) {
          if (blocked(state, x + DIRS[d][0], y, waterOk) || blocked(state, x, y + DIRS[d][1], waterOk)) continue;
        }
        cost[tileIndex(nx, ny)] = base + (d < 4 ? 2 : 3);
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
    state.flows.push({ key: key, cost: cost });
    if (state.flows.length > 8) state.flows.shift();
    return cost;
  }

  function unstick(state, u) {
    var t = tileAt(u.x, u.y);
    if (!blocked(state, t.x, t.y, !!DEFS[u.type].water)) return;
    var n = nearestOpenTile(state, t.x, t.y, !!DEFS[u.type].water);
    u.x = (n.x + 0.5) * TILE;
    u.y = (n.y + 0.5) * TILE;
  }

  function rebuildHash(state) {
    var cells = new Map();
    var i, u, k, arr;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead) continue;
      k = ((u.x / 64) | 0) + ',' + ((u.y / 64) | 0);
      arr = cells.get(k);
      if (!arr) { arr = []; cells.set(k, arr); }
      arr.push(u);
    }
    state.cells = cells;
  }

  function nearby(state, x, y) {
    var cx = (x / 64) | 0;
    var cy = (y / 64) | 0;
    var out = [];
    var yy, xx, arr, i;
    for (yy = cy - 1; yy <= cy + 1; yy++) {
      for (xx = cx - 1; xx <= cx + 1; xx++) {
        arr = state.cells.get(xx + ',' + yy);
        if (!arr) continue;
        for (i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }

  function separate(state, u) {
    var list = nearby(state, u.x, u.y);
    var x = 0;
    var y = 0;
    var r = DEFS[u.type].radius || 12;
    var i, o, dx, dy, d, min, p;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === u || o.dead) continue;
      dx = u.x - o.x;
      dy = u.y - o.y;
      d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      min = r + (DEFS[o.type].radius || 12);
      if (d < min) {
        p = (min - d) / min;
        x += dx / d * p;
        y += dy / d * p;
      }
    }
    return { x: x, y: y };
  }

  function steer(state, u, dt, gx, gy) {
    var dx = gx - u.x;
    var dy = gy - u.y;
    var mag = Math.sqrt(dx * dx + dy * dy) || 1;
    var vx = dx / mag;
    var vy = dy / mag;
    var sep = separate(state, u);
    vx += sep.x * 1.35;
    vy += sep.y * 1.35;
    if (u.nudgeT > 0) {
      u.nudgeT -= dt;
      vx += u.nudgeX * 1.7;
      vy += u.nudgeY * 1.7;
    }
    mag = Math.sqrt(vx * vx + vy * vy) || 1;
    vx /= mag;
    vy /= mag;
    var step = DEFS[u.type].speed * dt;
    var ox = u.x;
    var oy = u.y;
    if (openPoint(state, u.x + vx * step, u.y, u)) u.x += vx * step;
    if (openPoint(state, u.x, u.y + vy * step, u)) u.y += vy * step;
    if (Math.abs(u.x - ox) + Math.abs(u.y - oy) < 0.35) u.stuck += dt;
    else u.stuck = 0;
    if (Math.abs(vx) > 0.25) u.facing = vx < 0 ? -1 : 1;
    u.anim = 'move';
    if (u.stuck > 0.85) {
      var ang = state.rng.next() * Math.PI * 2;
      u.nudgeX = Math.cos(ang);
      u.nudgeY = Math.sin(ang);
      u.nudgeT = 0.45;
      u.stuck = 0;
    }
  }

  function moveToward(state, u, dt, gx, gy) {
    unstick(state, u);
    var distGoal = dist(u.x, u.y, gx, gy);
    var tx = gx;
    var ty = gy;
    if (distGoal > 40) {
      var gt = tileAt(gx, gy);
      var waterOk = !!DEFS[u.type].water;
      var field = flow(state, gt.x, gt.y, waterOk);
      var ut = tileAt(u.x, u.y);
      var here = field[tileIndex(ut.x, ut.y)];
      if (here > 2) {
        var bestC = here;
        var best = null;
        var d, nx, ny, c;
        for (d = 0; d < 8; d++) {
          nx = ut.x + DIRS[d][0];
          ny = ut.y + DIRS[d][1];
          if (!inMap(nx, ny)) continue;
          c = field[tileIndex(nx, ny)];
          if (c >= 0 && c < bestC) { bestC = c; best = { x: (nx + 0.5) * TILE, y: (ny + 0.5) * TILE }; }
        }
        if (best) { tx = best.x; ty = best.y; }
      }
    }
    steer(state, u, dt, tx, ty);
  }

  function reveal(state, side, cx, cy, radius) {
    var fog = state.fog[side];
    var r = radius | 0;
    var y, x, dx, dy;
    for (y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= H) continue;
      for (x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= W) continue;
        dx = x - cx;
        dy = y - cy;
        if (dx * dx + dy * dy <= r * r) fog[tileIndex(x, y)] = 2;
      }
    }
  }

  function updateFog(state, side) {
    var fog = state.fog[side];
    var i, u, b, c, sight;
    for (i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead || u.side !== side) continue;
      c = tileAt(u.x, u.y);
      reveal(state, side, c.x, c.y, DEFS[u.type].sight || 6);
    }
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead || b.side !== side) continue;
      sight = DEFS[b.type].sight || 7;
      reveal(state, side, b.tx + (b.w >> 1), b.ty + (b.h >> 1), sight);
    }
  }

  function seenBy(state, side, ent) {
    var c = centerOf(ent);
    var t = tileAt(c.x, c.y);
    return state.fog[side][tileIndex(t.x, t.y)] === 2;
  }

  function living(ent) { return ent && !ent.dead && ent.hp > 0; }

  function kill(state, ent) {
    if (!ent || ent.dead) return;
    ent.dead = true;
    ent.deathT = 0;
    ent.hp = 0;
    ent.anim = 'death';
    if (ent.isB) {
      occupy(state, ent, false);
      var q, cost, item;
      for (q = 0; q < ent.queue.length; q++) {
        item = ent.queue[q];
        if (item === 'whet') cost = DEFS.shrine.research;
        else cost = DEFS[item] ? DEFS[item].cost : null;
        if (cost) {
          state.res[ent.side].ore += cost[0] >> 1;
          state.res[ent.side].thatch += cost[1] >> 1;
        }
      }
      ent.queue = [];
      burst(state, centerOf(ent).x, centerOf(ent).y, ent.type === 'hearth' ? 'big' : 'boom');
    } else {
      burst(state, ent.x, ent.y, DEFS[ent.type].cls === 'mythic' || DEFS[ent.type].cls === 'siege' ? 'boom' : 'pop');
    }
  }

  function burst(state, x, y, kind) {
    state.fx.push({ x: x, y: y, kind: kind, life: kind === 'big' ? 0.7 : 0.45, max: kind === 'big' ? 0.7 : 0.45 });
    if (state.fx.length > 48) state.fx.shift();
  }

  function alertPlayer(state, x, y, text) {
    if (state.time < state.alertAt) return;
    state.alertAt = state.time + 5;
    state.alertSeq = (state.alertSeq || 0) + 1;
    state.alert = { x: x, y: y, text: text, life: 3.4, seq: state.alertSeq };
  }

  /* Opening quiet. Easy holds the other banner for about five and a half minutes. */
  function graceOf(state) {
    if (state && state.grace === 0) return 0;
    return state && state.difficulty === 'easy' ? 330 : 90;
  }

  function truce(state) {
    return state.time < graceOf(state);
  }

  function deal(state, target, amount, fromSide) {
    if (!living(target) || amount <= 0 || target.side === fromSide) return;
    if (fromSide === 1 && target.side === 0 && truce(state)) return;
    target.hp -= amount;
    target.flash = 0.14;
    if (target.side === 0) alertPlayer(state, centerOf(target).x, centerOf(target).y, 'Under attack — tap to look');
    if (target.hp <= 0) kill(state, target);
  }

  function damageOf(state, atkType, target, side) {
    var def = DEFS[atkType];
    var dmg = def.dmg || def.attack || 8;
    var cls = target.isB ? 'building' : DEFS[target.type].cls;
    if (def.bonus && def.bonus[cls]) dmg *= def.bonus[cls];
    if (target.isB && def.vsBuilding) dmg *= def.vsBuilding;
    if (!target.isB && DEFS[target.type].armor && def.projectile) dmg *= 1 - DEFS[target.type].armor;
    if (state.upgrades[side]) dmg *= 1.2;
    dmg *= 0.9 + state.rng.next() * 0.2;
    return dmg;
  }

  function impact(state, shot) {
    var i, ent, c, d, hit;
    if (shot.aoe > 0) {
      for (i = 0; i < state.units.length; i++) {
        ent = state.units[i];
        if (!living(ent) || ent.side === shot.side) continue;
        if (dist(ent.x, ent.y, shot.tx, shot.ty) <= shot.aoe) deal(state, ent, shot.dmg, shot.side);
      }
      for (i = 0; i < state.buildings.length; i++) {
        ent = state.buildings[i];
        if (!living(ent) || ent.side === shot.side) continue;
        c = centerOf(ent);
        if (dist(c.x, c.y, shot.tx, shot.ty) <= shot.aoe + 12) deal(state, ent, shot.dmg, shot.side);
      }
      burst(state, shot.tx, shot.ty, shot.kind === 'rock' ? 'boom' : 'pop');
      return;
    }
    hit = null;
    var best = 22;
    for (i = 0; i < state.units.length; i++) {
      ent = state.units[i];
      if (!living(ent) || ent.side === shot.side) continue;
      d = dist(ent.x, ent.y, shot.tx, shot.ty);
      if (d < best) { best = d; hit = ent; }
    }
    if (!hit) {
      for (i = 0; i < state.buildings.length; i++) {
        ent = state.buildings[i];
        if (!living(ent) || ent.side === shot.side) continue;
        c = centerOf(ent);
        d = dist(c.x, c.y, shot.tx, shot.ty);
        if (d < 28) { hit = ent; break; }
      }
    }
    if (hit) deal(state, hit, shot.dmg, shot.side);
    if (shot.kind === 'rock') burst(state, shot.tx, shot.ty, 'boom');
  }

  function shoot(state, from, target, type, side) {
    var def = DEFS[type];
    var c = centerOf(target);
    var origin = centerOf(from);
    var dx = c.x - origin.x;
    var dy = c.y - origin.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var speed = def.projectile === 'rock' ? 150 : 260;
    state.shots.push({
      x: origin.x, y: origin.y - (from.isB ? 10 : 8),
      vx: dx / d * speed, vy: dy / d * speed,
      tx: c.x, ty: c.y,
      dmg: damageOf(state, type, target, side),
      aoe: def.aoe || 0,
      side: side,
      kind: def.projectile || 'arrow',
      life: 1.6
    });
    if (state.shots.length > 80) state.shots.shift();
  }

  function strike(state, u, target, dt) {
    var def = DEFS[u.type];
    var c = centerOf(target);
    if (c.x < u.x - 2) u.facing = -1;
    else if (c.x > u.x + 2) u.facing = 1;
    u.anim = 'attack';
    if (u.attackCd > 0) return;
    u.attackCd = def.reload;
    if (def.projectile) shoot(state, u, target, u.type, u.side);
    else {
      deal(state, target, damageOf(state, u.type, target, u.side), u.side);
      if (def.aoe) {
        var i, o;
        for (i = 0; i < state.units.length; i++) {
          o = state.units[i];
          if (!living(o) || o.side === u.side || o === target) continue;
          if (dist(o.x, o.y, c.x, c.y) <= def.aoe) deal(state, o, damageOf(state, u.type, o, u.side) * 0.65, u.side);
        }
        burst(state, c.x, c.y, 'pop');
      }
    }
  }

  function acquire(state, u) {
    var def = DEFS[u.type];
    var aggro = Math.max(def.range + 8, 88);
    var best = null;
    var bestScore = -1;
    var bestD = 1e12;
    var i, o, c, d, score;
    if (def.cls === 'siege' || def.vsBuilding > 1) {
      for (i = 0; i < state.buildings.length; i++) {
        o = state.buildings[i];
        if (!living(o) || o.side === u.side) continue;
        if (!seenBy(state, u.side, o)) continue;
        d = distToEnt(u.x, u.y, o);
        if (d < def.range + 20 && d < bestD) { best = o; bestD = d; bestScore = 4; }
      }
      if (best) return best;
    }
    for (i = 0; i < state.units.length; i++) {
      o = state.units[i];
      if (!living(o) || o.side === u.side) continue;
      if (!seenBy(state, u.side, o)) continue;
      d = dist(u.x, u.y, o.x, o.y);
      if (d > aggro) continue;
      score = DEFS[o.type].cls === 'worker' ? 1 : 3;
      if (score > bestScore || (score === bestScore && d < bestD)) { best = o; bestScore = score; bestD = d; }
    }
    if (best) return best;
    bestD = def.range + 6;
    for (i = 0; i < state.buildings.length; i++) {
      o = state.buildings[i];
      if (!living(o) || o.side === u.side) continue;
      if (!seenBy(state, u.side, o)) continue;
      d = distToEnt(u.x, u.y, o);
      if (d <= bestD) { best = o; bestD = d; }
    }
    return best;
  }

  function foeInRange(state, u) {
    var range = DEFS[u.type].range + 2;
    var best = null;
    var bestD = range;
    var i, o, d, c;
    for (i = 0; i < state.units.length; i++) {
      o = state.units[i];
      if (!living(o) || o.side === u.side) continue;
      d = dist(u.x, u.y, o.x, o.y);
      if (d <= bestD && seenBy(state, u.side, o)) { best = o; bestD = d; }
    }
    if (best) return best;
    for (i = 0; i < state.buildings.length; i++) {
      o = state.buildings[i];
      if (!living(o) || o.side === u.side) continue;
      if (!seenBy(state, u.side, o)) continue;
      d = distToEnt(u.x, u.y, o);
      if (d <= range) return o;
    }
    return null;
  }

  function nearestResource(state, x, y, kind) {
    var arr = kind === 'ore' ? state.ore : state.tree;
    var best = null;
    var bestD = 1e12;
    var i, tx, ty, d;
    for (i = 0; i < arr.length; i++) {
      if (arr[i] <= 0) continue;
      tx = i % W;
      ty = (i / W) | 0;
      d = dist(x, y, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      if (d < bestD) { bestD = d; best = { tx: tx, ty: ty }; }
    }
    return best;
  }

  function nearestDrop(state, side, x, y) {
    var best = null;
    var bestD = 1e12;
    var i, b, c, d;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (!living(b) || !b.done || b.side !== side) continue;
      if (!DEFS[b.type].drop) continue;
      c = centerOf(b);
      d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function clearNode(state, kind, tx, ty) {
    var i = tileIndex(tx, ty);
    if (kind === 'ore') state.ore[i] = 0;
    else state.tree[i] = 0;
    if (state.terrain[i] === TREE || state.terrain[i] === ORE) state.terrain[i] = GRASS;
    state.blockRev++;
  }

  function stepGather(state, u, dt) {
    var kind = u.kind === 'ore' ? 'ore' : 'thatch';
    var node, spot, drop, c, idx, take, key;
    if (u.carry >= 8) u.phase = 'toDrop';
    if (u.phase === 'toDrop') {
      drop = nearestDrop(state, u.side, u.x, u.y);
      if (!drop) { u.order = 'idle'; u.anim = 'idle'; return; }
      if (touchingBuilding(u, drop)) {
        key = u.carryKind === 'ore' ? 'ore' : 'thatch';
        state.res[u.side][key] += u.carry;
        state.floats.push({ x: u.x, y: u.y - 10, text: '+' + u.carry + (key === 'ore' ? ' ore' : ' thatch'), life: 0.9, side: u.side });
        if (state.floats.length > 20) state.floats.shift();
        u.carry = 0;
        u.phase = 'toNode';
        u.nodeTx = -1;
        u.anim = 'idle';
        return;
      }
      spot = adjacentPoint(state, drop.tx, drop.ty, drop.w, drop.h, u);
      moveToward(state, u, dt, spot.x, spot.y);
      return;
    }
    if (u.nodeTx < 0 || (kind === 'ore' ? state.ore : state.tree)[tileIndex(u.nodeTx, u.nodeTy)] <= 0) {
      node = nearestResource(state, u.x, u.y, kind);
      if (!node) { u.order = 'idle'; u.anim = 'idle'; return; }
      u.nodeTx = node.tx;
      u.nodeTy = node.ty;
      u.phase = 'toNode';
    }
    if (!touchingTile(u, u.nodeTx, u.nodeTy)) {
      spot = adjacentPoint(state, u.nodeTx, u.nodeTy, 1, 1, u);
      moveToward(state, u, dt, spot.x, spot.y);
      return;
    }
    u.anim = 'attack';
    u.workT += dt;
    if (u.workT < 1.15) return;
    u.workT = 0;
    idx = tileIndex(u.nodeTx, u.nodeTy);
    take = Math.min(8 - u.carry, kind === 'ore' ? state.ore[idx] : state.tree[idx]);
    if (take <= 0) { u.nodeTx = -1; return; }
    if (kind === 'ore') state.ore[idx] -= take;
    else state.tree[idx] -= take;
    u.carry += take;
    u.carryKind = kind;
    if ((kind === 'ore' ? state.ore[idx] : state.tree[idx]) <= 0) clearNode(state, kind, u.nodeTx, u.nodeTy);
    if (u.carry >= 8) u.phase = 'toDrop';
    c = centerOf({ x: (u.nodeTx + 0.5) * TILE, y: (u.nodeTy + 0.5) * TILE });
    if (c.x < u.x) u.facing = -1;
  }

  function stepBuild(state, u, dt) {
    var b = state.byId[u.buildId];
    var spot;
    if (!b || b.dead || b.done || !b.isB) { u.order = 'idle'; u.anim = 'idle'; u.buildId = 0; return; }
    if (!touchingBuilding(u, b)) {
      spot = adjacentPoint(state, b.tx, b.ty, b.w, b.h, u);
      moveToward(state, u, dt, spot.x, spot.y);
      return;
    }
    u.anim = 'attack';
    if (b.tx + b.w * 0.5 < u.x / TILE) u.facing = -1;
    else u.facing = 1;
  }

  function stepUnit(state, u, dt) {
    var tgt, c, def;
    if (u.dead) { u.deathT += dt; u.anim = 'death'; return; }
    u.flash = Math.max(0, u.flash - dt);
    u.attackCd = Math.max(0, u.attackCd - dt);
    def = DEFS[u.type];
    if (def.heal) {
      var i, ally, healed = false;
      for (i = 0; i < state.units.length; i++) {
        ally = state.units[i];
        if (!living(ally) || ally.side !== u.side || ally.hp >= ally.hpMax) continue;
        if (dist(u.x, u.y, ally.x, ally.y) <= def.healRange) {
          ally.hp = Math.min(ally.hpMax, ally.hp + def.heal * dt);
          healed = true;
        }
      }
      if (healed && u.anim !== 'attack' && u.anim !== 'move') u.anim = 'idle';
    }
    if (state.over && u.order !== 'idle') {
      /* Keep the last stride so a finished match still reads as a battle. */
    }
    if (u.side === 1 && u.type !== 'worker' && truce(state)) {
      if (u.order === 'attack' || u.order === 'attackmove' || u.order === 'hold') {
        u.order = 'idle';
        u.targetId = 0;
        u.anim = 'idle';
      }
    }
    if (u.order === 'hold') {
      tgt = foeInRange(state, u);
      if (tgt) strike(state, u, tgt, dt);
      else u.anim = 'idle';
      return;
    }
    if (u.order === 'attack' || u.order === 'attackmove') {
      tgt = state.byId[u.targetId];
      if (!living(tgt)) tgt = null;
      if (!tgt && u.order === 'attackmove') tgt = acquire(state, u);
      if (tgt) {
        u.targetId = tgt.id;
        c = centerOf(tgt);
        if (u.order === 'attackmove' && dist(u.x, u.y, u.gx, u.gy) > 260 && distToEnt(u.x, u.y, tgt) > def.range) {
          u.targetId = 0;
        } else if (distToEnt(u.x, u.y, tgt) <= def.range) {
          strike(state, u, tgt, dt);
          return;
        } else if (tgt.isB) {
          var edge = adjacentPoint(state, tgt.tx, tgt.ty, tgt.w, tgt.h, u);
          moveToward(state, u, dt, edge.x, edge.y);
          return;
        } else {
          moveToward(state, u, dt, c.x, c.y);
          return;
        }
      }
      if (u.order === 'attack') { u.order = 'idle'; u.anim = 'idle'; u.targetId = 0; return; }
    }
    if (u.order === 'move' || u.order === 'attackmove') {
      if (dist(u.x, u.y, u.gx, u.gy) < 16) { u.order = 'idle'; u.anim = 'idle'; return; }
      moveToward(state, u, dt, u.gx, u.gy);
      return;
    }
    if (u.order === 'gather') { stepGather(state, u, dt); return; }
    if (u.order === 'build') { stepBuild(state, u, dt); return; }
    u.anim = 'idle';
  }

  function buildersOn(state, b) {
    var n = 0;
    var i, u;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead || u.buildId !== b.id || u.order !== 'build') continue;
      if (touchingBuilding(u, b)) n++;
    }
    return Math.min(3, n);
  }

  function spawnUnit(state, side, type, x, y) {
    var def = DEFS[type];
    var spot = nearestOpenTile(state, tileAt(x, y).x, tileAt(x, y).y, !!def.water);
    var u = {
      id: ++state.nextId,
      isB: false,
      side: side,
      type: type,
      x: (spot.x + 0.5) * TILE,
      y: (spot.y + 0.5) * TILE,
      hp: def.hp,
      hpMax: def.hp,
      order: 'idle',
      gx: 0,
      gy: 0,
      targetId: 0,
      buildId: 0,
      phase: 'toNode',
      nodeTx: -1,
      nodeTy: -1,
      kind: 'thatch',
      carry: 0,
      carryKind: '',
      facing: side === 0 ? 1 : -1,
      anim: 'idle',
      animT: state.rng.next(),
      attackCd: state.rng.next() * (def.reload || 1),
      workT: 0,
      flash: 0,
      dead: false,
      deathT: 0,
      stuck: 0,
      nudgeT: 0,
      nudgeX: 0,
      nudgeY: 0
    };
    state.units.push(u);
    state.byId[u.id] = u;
    return u;
  }

  function addBuilding(state, side, type, tx, ty, done) {
    var d = DEFS[type];
    var b = {
      id: ++state.nextId,
      isB: true,
      side: side,
      type: type,
      tx: tx,
      ty: ty,
      w: d.w,
      h: d.h,
      hp: d.hp,
      hpMax: d.hp,
      progress: done ? 1 : 0,
      done: !!done,
      queue: [],
      queueT: 0,
      dead: false,
      deathT: 0,
      flash: 0,
      attackCd: 0
    };
    occupy(state, b, true);
    state.buildings.push(b);
    state.byId[b.id] = b;
    return b;
  }

  function stepBuildings(state, dt) {
    var i, b, n, item, def, c, spot;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead) { b.deathT += dt; b.flash = Math.max(0, b.flash - dt); continue; }
      b.flash = Math.max(0, b.flash - dt);
      if (!b.done) {
        n = buildersOn(state, b);
        if (n > 0) b.progress += dt * n / DEFS[b.type].time;
        if (b.progress >= 1) {
          b.progress = 1;
          b.done = true;
          burst(state, centerOf(b).x, centerOf(b).y, 'pop');
          if (b.side === 0) state.note = { text: DEFS[b.type].name + ' is up', life: 1.6 };
        }
      } else if (b.queue.length && !state.over) {
        item = b.queue[0];
        def = item === 'whet' ? { time: 16 } : DEFS[item];
        b.queueT += dt;
        if (b.queueT >= def.time) {
          b.queueT = 0;
          b.queue.shift();
          if (item === 'whet') {
            state.upgrades[b.side] = 1;
            if (b.side === 0) state.note = { text: 'Whetstone is keen', life: 1.6 };
          } else {
            c = centerOf(b);
            spot = adjacentPoint(state, b.tx, b.ty, b.w, b.h, { x: c.x, y: c.y + TILE, type: item });
            spawnUnit(state, b.side, item, spot.x, spot.y + 4);
          }
        }
      }
      if (b.done && DEFS[b.type].attack && !state.over && !(b.side === 1 && truce(state))) {
        b.attackCd = Math.max(0, b.attackCd - dt);
        if (b.attackCd <= 0) {
          var foe = null;
          var best = DEFS[b.type].range;
          var j, o, d;
          c = centerOf(b);
          for (j = 0; j < state.units.length; j++) {
            o = state.units[j];
            if (!living(o) || o.side === b.side) continue;
            if (!seenBy(state, b.side, o)) continue;
            d = dist(c.x, c.y, o.x, o.y);
            if (d < best) { best = d; foe = o; }
          }
          if (foe) {
            b.attackCd = DEFS[b.type].reload;
            shoot(state, b, foe, b.type, b.side);
          }
        }
      }
    }
  }

  function formation(n, x, y) {
    var cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    var out = [];
    var i, col, row;
    for (i = 0; i < n; i++) {
      col = i % cols;
      row = (i / cols) | 0;
      out.push({ x: x + (col - (cols - 1) / 2) * 28, y: y + (row - ((n / cols | 0) - 1) / 2) * 28 });
    }
    return out;
  }

  function issue(state, ids, order, x, y, extra) {
    extra = extra || {};
    var list = [];
    var i, u;
    for (i = 0; i < ids.length; i++) {
      u = state.byId[ids[i]];
      if (u && !u.isB && !u.dead) list.push(u);
    }
    if (!list.length) return 0;
    if (order === 'stop') {
      for (i = 0; i < list.length; i++) {
        list[i].order = 'idle';
        list[i].targetId = 0;
        list[i].buildId = 0;
        list[i].anim = 'idle';
      }
      return list.length;
    }
    if (order === 'hold') {
      for (i = 0; i < list.length; i++) {
        list[i].order = 'hold';
        list[i].targetId = 0;
        list[i].buildId = 0;
        list[i].anim = 'idle';
      }
      return list.length;
    }
    var slots = formation(list.length, x || 0, y || 0);
    for (i = 0; i < list.length; i++) {
      u = list[i];
      u.order = order;
      u.gx = slots[i].x;
      u.gy = slots[i].y;
      u.targetId = extra.targetId || 0;
      u.buildId = extra.buildId || 0;
      u.stuck = 0;
      if (order === 'gather') {
        u.kind = extra.kind === 'ore' ? 'ore' : 'thatch';
        u.phase = u.carry >= 8 ? 'toDrop' : 'toNode';
        if (extra.tx != null) { u.nodeTx = extra.tx; u.nodeTy = extra.ty; }
        else u.nodeTx = -1;
      }
      if (order === 'attack' && extra.targetId) {
        var tgt = state.byId[extra.targetId];
        if (tgt) {
          var c = centerOf(tgt);
          u.gx = c.x;
          u.gy = c.y;
        }
      }
    }
    return list.length;
  }

  function queuedCount(state, side) {
    var n = 0;
    var i, q, b;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead || b.side !== side) continue;
      for (q = 0; q < b.queue.length; q++) if (b.queue[q] !== 'whet') n++;
    }
    return n;
  }

  function supply(state, side) {
    var cap = 0;
    var used = 0;
    var i, b, u;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead || !b.done || b.side !== side) continue;
      cap += DEFS[b.type].supply || 0;
    }
    if (cap > 40) cap = 40;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (!u.dead && u.side === side) used++;
    }
    return { used: used, cap: cap };
  }

  function canAfford(state, side, cost) {
    return state.res[side].ore >= cost[0] && state.res[side].thatch >= cost[1];
  }

  function pay(state, side, cost) {
    state.res[side].ore -= cost[0];
    state.res[side].thatch -= cost[1];
  }

  function place(state, side, type, tx, ty, workerIds) {
    if (state.over) return { ok: false, reason: 'over' };
    var d = DEFS[type];
    if (!d || !d.w) return { ok: false, reason: 'type' };
    if (!canAfford(state, side, d.cost)) return { ok: false, reason: 'cost' };
    if (!canPlace(state, side, type, tx, ty)) return { ok: false, reason: 'spot' };
    pay(state, side, d.cost);
    var b = addBuilding(state, side, type, tx, ty, false);
    if (workerIds && workerIds.length) issue(state, workerIds, 'build', centerOf(b).x, centerOf(b).y, { buildId: b.id });
    return { ok: true, building: b };
  }

  function train(state, buildingId, type) {
    var b = state.byId[buildingId];
    if (!b || b.dead || !b.isB || !b.done || state.over) return { ok: false, reason: 'building' };
    var allowed = trainsOf(state, b);
    if (allowed.indexOf(type) < 0) return { ok: false, reason: 'type' };
    if (b.queue.length >= 5) return { ok: false, reason: 'queue' };
    if (b.queue.indexOf('whet') >= 0) return { ok: false, reason: 'whet' };
    var sup = supply(state, b.side);
    if (sup.used + queuedCount(state, b.side) >= sup.cap) return { ok: false, reason: 'pop' };
    var cost = DEFS[type].cost;
    if (!canAfford(state, b.side, cost)) return { ok: false, reason: 'cost' };
    pay(state, b.side, cost);
    b.queue.push(type);
    return { ok: true };
  }

  function research(state, buildingId) {
    var b = state.byId[buildingId];
    if (!b || b.dead || b.type !== 'shrine' || !b.done || state.over) return { ok: false, reason: 'building' };
    if (state.upgrades[b.side]) return { ok: false, reason: 'done' };
    if (b.queue.length) return { ok: false, reason: 'queue' };
    var cost = DEFS.shrine.research;
    if (!canAfford(state, b.side, cost)) return { ok: false, reason: 'cost' };
    pay(state, b.side, cost);
    b.queue.push('whet');
    return { ok: true };
  }

  function cancelTrain(state, buildingId) {
    var b = state.byId[buildingId];
    if (!b || !b.isB || b.dead || !b.queue.length) return { ok: false };
    var item = b.queue.pop();
    if (!b.queue.length) b.queueT = 0;
    var cost = item === 'whet' ? DEFS.shrine.research : (DEFS[item] ? DEFS[item].cost : null);
    if (cost) {
      state.res[b.side].ore += cost[0];
      state.res[b.side].thatch += cost[1];
    }
    return { ok: true };
  }

  function abandon(state, side) {
    var i;
    for (i = 0; i < state.buildings.length; i++) {
      if (state.buildings[i].side === side && state.buildings[i].type === 'hearth' && !state.buildings[i].dead) {
        kill(state, state.buildings[i]);
      }
    }
    checkWin(state);
  }

  function cancelBuild(state, buildingId) {
    var b = state.byId[buildingId];
    if (!b || !b.isB || b.dead || b.done || b.type === 'hearth') return { ok: false };
    state.res[b.side].ore += (DEFS[b.type].cost[0] * 3) / 4 | 0;
    state.res[b.side].thatch += (DEFS[b.type].cost[1] * 3) / 4 | 0;
    kill(state, b);
    b.deathT = 9;
    return { ok: true };
  }

  function workersNear(state, side, x, y) {
    var ids = [];
    var i, u;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead || u.side !== side || u.type !== 'worker') continue;
      ids.push({ id: u.id, d: dist(u.x, u.y, x, y) });
    }
    ids.sort(function (a, b) { return a.d - b.d; });
    return ids;
  }

  function stepAi(state, dt) {
    if (state.over) return;
    state.aiT -= dt;
    if (state.aiT > 0) return;
    var easy = state.difficulty === 'easy';
    state.aiT = easy ? 2.3 : 1.15;
    var side = 1;
    var home = null;
    var i, b, u;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.side === side && b.type === 'hearth' && living(b)) home = b;
    }
    if (!home) return;
    var workers = [];
    var army = [];
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead || u.side !== side) continue;
      if (u.type === 'worker') workers.push(u);
      else army.push(u);
    }
    var idleW = [];
    for (i = 0; i < workers.length; i++) if (workers[i].order === 'idle') idleW.push(workers[i].id);
    if (idleW.length) {
      var prefer = state.res[side].thatch < state.res[side].ore + 40 ? 'thatch' : 'ore';
      issue(state, idleW, 'gather', 0, 0, { kind: prefer });
    }
    var wantW = easy ? 5 : 8;
    var sup = supply(state, side);
    if (workers.length < wantW && sup.used < sup.cap && canAfford(state, side, DEFS.worker.cost)) train(state, home.id, 'worker');

    function has(type, includeSite) {
      var k;
      for (k = 0; k < state.buildings.length; k++) {
        b = state.buildings[k];
        if (b.side === side && b.type === type && !b.dead && (includeSite || b.done)) return b;
      }
      return null;
    }
    function tryBuild(type) {
      if (has(type, true)) return;
      if (!canAfford(state, side, DEFS[type].cost)) return;
      var fw = DEFS[type].w;
      var fh = DEFS[type].h;
      var r, dy, dx, tx, ty, ids, pick, w, n;
      for (r = 4; r <= 12; r++) {
        for (dy = -r; dy <= r; dy++) {
          for (dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            tx = home.tx + dx;
            ty = home.ty + Math.max(0, dy);
            if (!canPlace(state, side, type, tx, ty)) continue;
            ids = workersNear(state, side, (tx + fw / 2) * TILE, (ty + fh / 2) * TILE);
            pick = 0;
            for (n = 0; n < ids.length; n++) {
              w = state.byId[ids[n].id];
              if (w && w.order !== 'build') { pick = w.id; break; }
            }
            if (!pick) return;
            place(state, side, type, tx, ty, [pick]);
            return;
          }
        }
      }
    }
    if (!has('yard', true)) tryBuild('yard');
    else if (has('yard', false) && !has('barracks', true)) tryBuild('barracks');
    else if (!easy && has('barracks', false) && !has('tower', true) && army.length >= 2) tryBuild('tower');
    else if (has('barracks', false) && !has('shrine', true) && army.length >= (easy ? 8 : 4) && state.time > (easy ? 90 : 40)) tryBuild('shrine');
    else if (!easy && state.time > 70) {
      var towers = 0;
      for (i = 0; i < state.buildings.length; i++) if (state.buildings[i].side === side && state.buildings[i].type === 'tower' && !state.buildings[i].dead) towers++;
      if (towers < 2) tryBuild('tower');
    }

    var rax = has('barracks', false);
    if (rax && rax.queue.length < (easy ? 1 : 3)) {
      var mix = army.length % (easy ? 2 : 3);
      var choice = mix === 0 ? 'pike' : mix === 1 ? 'bow' : uniqueOf(state.faction[side]);
      train(state, rax.id, choice);
    }
    var shrine = has('shrine', false);
    if (shrine && shrine.queue.length < (easy ? 1 : 2)) {
      if (!easy && !state.upgrades[side] && army.length >= 4) research(state, shrine.id);
      else if (army.filter(function (a) { return a.type === 'ram'; }).length < (easy ? 1 : 2) && army.length >= (easy ? 7 : 3)) train(state, shrine.id, 'ram');
      else if (!easy && army.filter(function (a) { return DEFS[a.type].cls === 'mythic'; }).length < 1 && army.length >= 6) train(state, shrine.id, mythicOf(state.faction[side]));
    }

    var grace = graceOf(state);
    var waveCap = easy ? ((state.aiWaves || 0) === 0 ? 3 : 4) : 5;
    var ready = easy ? 2 : 4;
    if (state.time >= grace && state.time >= (state.aiNext || 0) && army.length >= ready) {
      var idleA = [];
      for (i = 0; i < army.length; i++) {
        if (army[i].order === 'idle' || army[i].order === 'hold') idleA.push(army[i].id);
      }
      if (idleA.length >= Math.min(army.length, easy ? 2 : 3)) {
        var foeHome = null;
        for (i = 0; i < state.buildings.length; i++) {
          b = state.buildings[i];
          if (b.side === 0 && b.type === 'hearth' && living(b)) foeHome = b;
        }
        if (foeHome) {
          var fc = centerOf(foeHome);
          issue(state, idleA.slice(0, waveCap), 'attackmove', fc.x, fc.y + 20);
          state.aiWaves = (state.aiWaves || 0) + 1;
          state.aiNext = state.time + (easy ? 80 : 32);
        }
      }
    }
    if (!easy && army.length && state.time > state.aiRetreat) {
      var myHp = 0;
      var foeHp = 0;
      var c = centerOf(home);
      for (i = 0; i < state.units.length; i++) {
        u = state.units[i];
        if (!living(u) || u.type === 'worker') continue;
        if (dist(u.x, u.y, c.x, c.y) > 420 && u.side === side) myHp += u.hp;
        if (u.side === 0 && dist(u.x, u.y, c.x, c.y) < 280) foeHp += u.hp;
      }
      if (foeHp > 80 && myHp > 0 && myHp < foeHp * 0.42) {
        var back = [];
        for (i = 0; i < army.length; i++) back.push(army[i].id);
        issue(state, back, 'move', c.x, c.y + 48);
        state.aiRetreat = state.time + 18;
      }
    }
  }

  function checkWin(state) {
    if (state.over) return;
    var a = false;
    var b = false;
    var i, bd;
    for (i = 0; i < state.buildings.length; i++) {
      bd = state.buildings[i];
      if (bd.dead || bd.type !== 'hearth') continue;
      if (bd.side === 0) a = true;
      if (bd.side === 1) b = true;
    }
    if (a && b) return;
    state.over = true;
    state.winner = a && !b ? 0 : !a && b ? 1 : -1;
  }

  function step(state, dt) {
    if (dt > 0.1) dt = 0.1;
    state.time += dt;
    if (state.dayOn) state.day = (state.day + dt / 180) % 1;
    var i;
    for (i = 0; i < state.fog.length; i++) updateFog(state, i);
    rebuildHash(state);
    stepBuildings(state, dt);
    for (i = 0; i < state.units.length; i++) stepUnit(state, state.units[i], dt);
    for (i = state.shots.length - 1; i >= 0; i--) {
      var s = state.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || dist(s.x, s.y, s.tx, s.ty) < 12) {
        impact(state, s);
        state.shots.splice(i, 1);
      }
    }
    for (i = state.fx.length - 1; i >= 0; i--) {
      state.fx[i].life -= dt;
      if (state.fx[i].life <= 0) state.fx.splice(i, 1);
    }
    for (i = state.floats.length - 1; i >= 0; i--) {
      state.floats[i].life -= dt;
      state.floats[i].y -= 14 * dt;
      if (state.floats[i].life <= 0) state.floats.splice(i, 1);
    }
    if (state.alert) {
      state.alert.life -= dt;
      if (state.alert.life <= 0) state.alert = null;
    }
    if (state.note) {
      state.note.life -= dt;
      if (state.note.life <= 0) state.note = null;
    }
    for (i = state.units.length - 1; i >= 0; i--) {
      if (state.units[i].dead && state.units[i].deathT > 2.3) {
        delete state.byId[state.units[i].id];
        state.units.splice(i, 1);
      }
    }
    for (i = state.buildings.length - 1; i >= 0; i--) {
      if (state.buildings[i].dead && state.buildings[i].deathT > 1.4) {
        delete state.byId[state.buildings[i].id];
        state.buildings.splice(i, 1);
      }
    }
    stepAi(state, dt);
    checkWin(state);
  }

  function paintDisk(terrain, cx, cy, r, type, rng, chance, allow) {
    var y, x, dx, dy, i;
    for (y = cy - r; y <= cy + r; y++) {
      for (x = cx - r; x <= cx + r; x++) {
        if (!inMap(x, y)) continue;
        dx = x - cx;
        dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        i = tileIndex(x, y);
        if (terrain[i] === CLIFF) continue;
        if (allow && terrain[i] !== allow) continue;
        if (rng.next() <= chance) terrain[i] = type;
      }
    }
  }

  function clearPad(terrain, tree, ore, cx, cy, r) {
    var y, x, i;
    for (y = cy - r; y <= cy + r; y++) {
      for (x = cx - r; x <= cx + r; x++) {
        if (!inMap(x, y)) continue;
        i = tileIndex(x, y);
        if (terrain[i] === CLIFF) continue;
        terrain[i] = GRASS;
        tree[i] = 0;
        ore[i] = 0;
      }
    }
  }

  function landConnected(terrain, tree, ore) {
    var seen = new Uint8Array(W * H);
    var qx = [10];
    var qy = [44];
    var head = 0;
    seen[tileIndex(10, 44)] = 1;
    while (head < qx.length) {
      var x = qx[head];
      var y = qy[head];
      head++;
      if (Math.abs(x - 46) + Math.abs(y - 10) < 6) return true;
      var d, nx, ny, i;
      for (d = 0; d < 4; d++) {
        nx = x + DIRS[d][0];
        ny = y + DIRS[d][1];
        if (!inMap(nx, ny)) continue;
        i = tileIndex(nx, ny);
        if (seen[i]) continue;
        if (terrain[i] === WATER || terrain[i] === CLIFF || tree[i] > 0) continue;
        seen[i] = 1;
        qx.push(nx);
        qy.push(ny);
      }
    }
    return false;
  }

  function generate(rng) {
    var terrain = new Uint8Array(W * H);
    var tree = new Uint8Array(W * H);
    var ore = new Uint8Array(W * H);
    var x, y, i;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) terrain[tileIndex(x, y)] = CLIFF;
      }
    }
    for (x = 1; x < W - 1; x++) {
      var ford = (x >= 15 && x <= 20) || (x >= 35 && x <= 40);
      if (ford) continue;
      for (y = 25; y <= 30; y++) terrain[tileIndex(x, y)] = WATER;
    }
    paintDisk(terrain, 8, 18, 4, WATER, rng, 0.85);
    paintDisk(terrain, 48, 40, 3, WATER, rng, 0.8);
    paintDisk(terrain, 6, 6, 3, CLIFF, rng, 1);
    paintDisk(terrain, 50, 50, 3, CLIFF, rng, 1);
    clearPad(terrain, tree, ore, 9, 44, 6);
    clearPad(terrain, tree, ore, 46, 10, 6);
    var clusters = [[12, 50, 4], [20, 40, 3], [14, 36, 3], [42, 16, 4], [34, 12, 3], [40, 20, 3], [24, 22, 3], [30, 34, 3], [8, 28, 2], [48, 30, 2]];
    var c;
    for (c = 0; c < clusters.length; c++) {
      paintDisk(terrain, clusters[c][0], clusters[c][1], clusters[c][2], TREE, rng, 0.72, GRASS);
    }
    var veins = [[15, 47, 2], [18, 41, 2], [12, 39, 1], [40, 13, 2], [44, 18, 2], [36, 11, 1], [27, 23, 2], [29, 33, 2]];
    for (c = 0; c < veins.length; c++) paintDisk(terrain, veins[c][0], veins[c][1], veins[c][2], ORE, rng, 0.8, GRASS);
    clearPad(terrain, tree, ore, 9, 44, 5);
    clearPad(terrain, tree, ore, 46, 10, 5);
    for (i = 0; i < terrain.length; i++) {
      if (terrain[i] === TREE) tree[i] = 80 + (rng.next() * 30 | 0);
      if (terrain[i] === ORE) ore[i] = 90 + (rng.next() * 40 | 0);
    }
    if (!landConnected(terrain, tree, ore)) {
      for (y = 12; y <= 42; y++) {
        for (x = 17; x <= 19; x++) {
          i = tileIndex(x, y);
          if (terrain[i] !== CLIFF) {
            terrain[i] = GRASS;
            tree[i] = 0;
            ore[i] = 0;
          }
        }
      }
    }
    carvePath(terrain, tree, ore, 12, 46, 18, 31);
    carvePath(terrain, tree, ore, 18, 31, 18, 24);
    carvePath(terrain, tree, ore, 44, 13, 37, 24);
    return { terrain: terrain, tree: tree, ore: ore };
  }

  function carvePath(terrain, tree, ore, x0, y0, x1, y1) {
    var x = x0;
    var y = y0;
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var guard = 0;
    while (guard < 80) {
      stampPath(terrain, tree, ore, x, y);
      if (x === x1 && y === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      guard += 1;
    }
  }

  function stampPath(terrain, tree, ore, x, y) {
    var nx, ny, i;
    for (ny = y; ny <= y + 1; ny++) {
      for (nx = x; nx <= x + 1; nx++) {
        if (!inMap(nx, ny)) continue;
        i = tileIndex(nx, ny);
        if (terrain[i] === CLIFF || terrain[i] === WATER) continue;
        terrain[i] = PATH;
        tree[i] = 0;
        ore[i] = 0;
      }
    }
  }

  function freshUnitFields(side, type, x, y, rng) {
    var def = DEFS[type];
    return {
      id: 0, isB: false, side: side, type: type, x: x, y: y,
      hp: def.hp, hpMax: def.hp, order: 'idle', gx: 0, gy: 0, targetId: 0, buildId: 0,
      phase: 'toNode', nodeTx: -1, nodeTy: -1, kind: 'thatch', carry: 0, carryKind: '',
      facing: side === 0 ? 1 : -1, anim: 'idle', animT: rng.next(), attackCd: rng.next(),
      workT: 0, flash: 0, dead: false, deathT: 0, stuck: 0, nudgeT: 0, nudgeX: 0, nudgeY: 0
    };
  }

  function create(opts) {
    opts = opts || {};
    var faction = opts.faction === 'reed' ? 'reed' : 'kiln';
    var difficulty = String(opts.difficulty == null ? '' : opts.difficulty).trim().toLowerCase() === 'easy' ? 'easy' : 'normal';
    var seed = (opts.seed != null ? opts.seed : (Math.random() * 0x7fffffff | 0)) >>> 0;
    var rng = makeRng(seed || 1);
    var map = generate(rng);
    var state = {
      seed: seed,
      rng: rng,
      faction: [faction, faction === 'kiln' ? 'reed' : 'kiln'],
      difficulty: difficulty,
      time: 0,
      day: 0.18,
      dayOn: opts.dayOn !== false,
      over: false,
      winner: -1,
      res: [{ ore: 110, thatch: 160 }, { ore: 110, thatch: 160 }],
      upgrades: [0, 0],
      terrain: map.terrain,
      tree: map.tree,
      ore: map.ore,
      occ: new Int32Array(W * H),
      fog: [new Uint8Array(W * H), new Uint8Array(W * H)],
      units: [],
      buildings: [],
      shots: [],
      fx: [],
      floats: [],
      byId: {},
      nextId: 1,
      blockRev: 1,
      flows: [],
      cells: new Map(),
      aiT: 0.4,
      aiRetreat: 0,
      aiNext: difficulty === 'easy' ? 330 : 90,
      aiWaves: 0,
      alertSeq: 0,
      alertAt: 0,
      alert: null,
      note: null
    };
    addBuilding(state, 0, 'hearth', 8, 42, true);
    addBuilding(state, 1, 'hearth', 45, 8, true);
    var n;
    for (n = 0; n < 4; n++) {
      var pw = spawnUnit(state, 0, 'worker', (10 + n) * TILE, 47 * TILE);
      var ew = spawnUnit(state, 1, 'worker', (46 + (n % 2)) * TILE, 13 * TILE);
      issue(state, [pw.id], 'gather', 0, 0, { kind: n % 2 ? 'ore' : 'thatch' });
      issue(state, [ew.id], 'gather', 0, 0, { kind: n % 2 ? 'ore' : 'thatch' });
    }
    updateFog(state, 0);
    updateFog(state, 1);
    return state;
  }

  function packBytes(u8) {
    var s = '';
    var i;
    for (i = 0; i < u8.length; i += 4096) {
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 4096)));
    }
    return btoa(s);
  }

  function unpackBytes(str, len) {
    var bin = atob(str);
    var u8 = new Uint8Array(len);
    var i;
    for (i = 0; i < len && i < bin.length; i++) u8[i] = bin.charCodeAt(i) & 255;
    return u8;
  }

  function serialize(state) {
    var units = [];
    var buildings = [];
    var i, u, b;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead) continue;
      units.push([u.id, u.side, u.type, Math.round(u.x), Math.round(u.y), Math.round(u.hp), u.order, Math.round(u.gx), Math.round(u.gy), u.targetId, u.buildId, u.phase, u.nodeTx, u.nodeTy, u.kind, u.carry, u.carryKind, u.facing]);
    }
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead) continue;
      buildings.push([b.id, b.side, b.type, b.tx, b.ty, Math.round(b.hp), Math.round(b.progress * 1000), b.done ? 1 : 0, b.queue.join(','), Math.round(b.queueT * 100) / 100]);
    }
    var explored = [new Uint8Array(W * H), new Uint8Array(W * H)];
    for (i = 0; i < W * H; i++) {
      explored[0][i] = state.fog[0][i] ? 1 : 0;
      explored[1][i] = state.fog[1][i] ? 1 : 0;
    }
    return {
      v: 1,
      seed: state.seed,
      rng: state.rng.get(),
      faction: state.faction.slice(),
      difficulty: state.difficulty,
      time: Math.round(state.time * 100) / 100,
      day: state.day,
      dayOn: state.dayOn ? 1 : 0,
      over: state.over ? 1 : 0,
      winner: state.winner,
      res: [{ ore: state.res[0].ore | 0, thatch: state.res[0].thatch | 0 }, { ore: state.res[1].ore | 0, thatch: state.res[1].thatch | 0 }],
      upgrades: state.upgrades.slice(),
      tree: packBytes(state.tree),
      ore: packBytes(state.ore),
      fog: [packBytes(explored[0]), packBytes(explored[1])],
      units: units,
      buildings: buildings,
      nextId: state.nextId,
      aiWaves: state.aiWaves || 0,
      aiNext: state.aiNext || 0
    };
  }

  function restore(data) {
    if (!data || data.v !== 1 || !data.seed) return null;
    try {
      var state = create({
        faction: data.faction && data.faction[0],
        difficulty: data.difficulty,
        seed: data.seed,
        dayOn: !!data.dayOn
      });
      state.units = [];
      state.buildings = [];
      state.byId = {};
      state.occ.fill(0);
      state.rng.set(data.rng >>> 0);
      state.time = data.time || 0;
      state.day = data.day || 0.18;
      state.over = !!data.over;
      state.winner = data.winner;
      state.res = data.res;
      state.upgrades = data.upgrades || [0, 0];
      state.nextId = data.nextId || 1;
      state.tree = unpackBytes(data.tree, W * H);
      state.ore = unpackBytes(data.ore, W * H);
      var map = generate(makeRng(data.seed || 1));
      state.terrain = map.terrain;
      var i;
      for (i = 0; i < W * H; i++) {
        if (state.terrain[i] === TREE || state.terrain[i] === ORE) state.terrain[i] = GRASS;
        if (state.terrain[i] === PATH) { state.tree[i] = 0; state.ore[i] = 0; }
        else if (state.tree[i] > 0 && state.terrain[i] === GRASS) state.terrain[i] = TREE;
        else if (state.ore[i] > 0 && state.terrain[i] === GRASS) state.terrain[i] = ORE;
      }
      for (i = 0; i < data.buildings.length; i++) {
        var row = data.buildings[i];
        var b = addBuilding(state, row[1], row[2], row[3], row[4], !!row[7]);
        b.id = row[0];
        state.byId[b.id] = b;
        delete state.byId[state.nextId];
        b.hp = row[5];
        b.progress = row[6] / 1000;
        b.done = !!row[7];
        b.queue = row[8] ? String(row[8]).split(',') : [];
        b.queueT = row[9] || 0;
        occupy(state, b, false);
        occupy(state, b, true);
      }
      /* addBuilding bumps nextId and writes occ with a temporary id. Restamp. */
      state.occ.fill(0);
      state.byId = {};
      for (i = 0; i < state.buildings.length; i++) {
        state.byId[state.buildings[i].id] = state.buildings[i];
        occupy(state, state.buildings[i], true);
      }
      state.blockRev++;
      for (i = 0; i < data.units.length; i++) {
        var ur = data.units[i];
        var u = freshUnitFields(ur[1], ur[2], ur[3], ur[4], state.rng);
        u.id = ur[0];
        u.hp = ur[5];
        u.order = ur[6] || 'idle';
        u.gx = ur[7];
        u.gy = ur[8];
        u.targetId = ur[9] || 0;
        u.buildId = ur[10] || 0;
        u.phase = ur[11] || 'toNode';
        u.nodeTx = ur[12];
        u.nodeTy = ur[13];
        u.kind = ur[14] || 'thatch';
        u.carry = ur[15] || 0;
        u.carryKind = ur[16] || '';
        u.facing = ur[17] || 1;
        state.units.push(u);
        state.byId[u.id] = u;
      }
      state.nextId = data.nextId;
      state.aiWaves = data.aiWaves || 0;
      state.aiNext = data.aiNext || 0;
      var f0 = unpackBytes(data.fog[0], W * H);
      var f1 = unpackBytes(data.fog[1], W * H);
      for (i = 0; i < W * H; i++) {
        state.fog[0][i] = f0[i] ? 1 : 0;
        state.fog[1][i] = f1[i] ? 1 : 0;
      }
      updateFog(state, 0);
      updateFog(state, 1);
      return state;
    } catch (err) {
      return null;
    }
  }

  function pick(state, x, y, viewer) {
    var bestU = null;
    var bestD = 22;
    var i, u, d, b, t, hitB;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead) continue;
      if (viewer != null && u.side !== viewer && !seenBy(state, viewer, u)) continue;
      d = dist(x, y, u.x, u.y - 8);
      if (d < bestD + (DEFS[u.type].radius > 14 ? 8 : 0)) { bestD = d; bestU = u; }
    }
    hitB = null;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead) continue;
      if (viewer != null && b.side !== viewer && state.fog[viewer][tileIndex(b.tx, b.ty)] === 0) continue;
      if (x >= b.tx * TILE - 4 && y >= b.ty * TILE - 6 && x <= (b.tx + b.w) * TILE + 4 && y <= (b.ty + b.h) * TILE + 4) hitB = b;
    }
    t = tileAt(x, y);
    var resKind = '';
    if (inMap(t.x, t.y)) {
      if (state.tree[tileIndex(t.x, t.y)] > 0) resKind = 'thatch';
      else if (state.ore[tileIndex(t.x, t.y)] > 0) resKind = 'ore';
    }
    return { unit: bestU, building: bestU ? null : hitB, tx: t.x, ty: t.y, res: resKind };
  }

  function unitsInRect(state, x0, y0, x1, y1, side) {
    var left = Math.min(x0, x1);
    var right = Math.max(x0, x1);
    var top = Math.min(y0, y1);
    var bot = Math.max(y0, y1);
    var ids = [];
    var i, u;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead || u.side !== side) continue;
      if (u.x >= left && u.x <= right && u.y >= top && u.y <= bot) ids.push(u.id);
    }
    return ids;
  }

  function idsWhere(state, side, pred) {
    var ids = [];
    var i, u;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (!u.dead && u.side === side && pred(u)) ids.push(u.id);
    }
    return ids;
  }

  function debugBattle(state) {
    state.grace = 0;
    var cx = 18 * TILE;
    var cy = 27 * TILE;
    function add(side, type, ox, oy, hp) {
      var u = spawnUnit(state, side, type, cx + ox, cy + oy);
      if (hp) u.hp = hp;
      return u;
    }
    var typesL = ['pike', 'pike', 'pike', 'bow', 'bow', 'ram', 'guard', 'titan'];
    var typesR = ['pike', 'pike', 'bow', 'bow', 'bow', 'ram', 'skiff', 'saint'];
    if (state.faction[0] !== 'kiln') {
      typesL = ['pike', 'pike', 'bow', 'bow', 'ram', 'skiff', 'skiff', 'saint'];
      typesR = ['pike', 'pike', 'pike', 'bow', 'ram', 'guard', 'guard', 'titan'];
    }
    var i;
    for (i = 0; i < typesL.length; i++) add(0, typesL[i], -70 - (i % 3) * 26, (i - 3) * 24, i === 3 ? 8 : 0);
    for (i = 0; i < typesR.length; i++) add(1, typesR[i], 70 + (i % 3) * 26, (i - 3) * 24, 0);
    var left = [];
    var right = [];
    for (i = 0; i < state.units.length; i++) {
      if (state.units[i].type === 'worker') continue;
      if (Math.abs(state.units[i].y - cy) > 140) continue;
      if (state.units[i].side === 0) left.push(state.units[i].id);
      else right.push(state.units[i].id);
    }
    issue(state, left, 'attackmove', cx + 40, cy);
    issue(state, right, 'attackmove', cx - 40, cy);
    state.res[0].ore = 500;
    state.res[0].thatch = 500;
    updateFog(state, 0);
    updateFog(state, 1);
    return { x: cx, y: cy };
  }

  root.CINDER_SIM = {
    W: W, H: H, TILE: TILE, WORLD: WORLD,
    GRASS: GRASS, WATER: WATER, CLIFF: CLIFF, TREE: TREE, ORE: ORE, PATH: PATH,
    FACTIONS: FACTIONS, DEFS: DEFS,
    create: create, step: step, issue: issue, place: place, canPlace: canPlace, nearestSite: nearestSite, siteNearHearth: siteNearHearth, train: train,
    research: research, cancelBuild: cancelBuild, cancelTrain: cancelTrain, abandon: abandon, supply: supply, canAfford: canAfford,
    serialize: serialize, restore: restore, pick: pick, unitsInRect: unitsInRect,
    idsWhere: idsWhere, trainsOf: trainsOf, centerOf: centerOf, uniqueOf: uniqueOf, graceOf: graceOf,
    mythicOf: mythicOf, debugBattle: debugBattle, workersNear: workersNear
  };
})(typeof window !== 'undefined' ? window : globalThis);
