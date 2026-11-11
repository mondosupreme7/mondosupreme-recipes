/* Cinderwell drawing. Pixel sprites are original art drawn in this file. */
(function (root) {
  'use strict';

  var K = {
    o: '#140e0a', d: '#3a2416', b: '#e09a45', e: '#ff6a1a', s: '#f6d0aa',
    c: '#6a341c', w: '#f7efe0', m: '#24160f', g: '#ffd27a', p: '#4a2a18'
  };
  var R = {
    o: '#0c1612', d: '#163528', b: '#efe0bc', e: '#8fd0a4', s: '#f4dcc2',
    c: '#1f5a40', w: '#f3fff6', m: '#9ad7e6', g: '#d6f5c4', p: '#24523c', t: '#1d6e80'
  };

  function hash(x, y) {
    var n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  }
  function palOf(fac) { return fac === 'reed' ? R : K; }
  function facOf(state, side) { return state.faction[side] === 'reed' ? 'reed' : 'kiln'; }
  function picked(view, id) {
    if (!view.sel) return false;
    return view.sel.has ? view.sel.has(id) : !!view.sel[id];
  }

  function blit(ctx, x, y, ps, width, parts, flip, flash) {
    var i, p, px, col;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      px = flip ? (width - p[0] - p[2]) : p[0];
      col = p[4];
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + px * ps), Math.round(y + p[1] * ps), Math.max(1, p[2] * ps), Math.max(1, p[3] * ps));
    }
  }

  function tileColor(kind, x, y, dim) {
    var n = hash(x, y);
    var c;
    if (kind === 1) c = (n % 3 === 0) ? '#14384f' : (n % 3 === 1) ? '#1a4d68' : '#18445e';
    else if (kind === 2) c = (n & 2) ? '#5c564c' : '#4a453c';
    else if (kind === 4) c = '#5e584e';
    else c = ['#2b572e', '#336434', '#3c713c', '#264e2b'][n % 4];
    if (!dim) return c;
    return kind === 0 || kind === 3 ? '#1a2c1c' : (kind === 1 ? '#102430' : '#24211c');
  }

  function drawGround(ctx, state, view, SIM) {
    var tile = SIM.TILE;
    var z = view.zoom;
    var x0 = Math.max(0, (view.camX / tile | 0) - 1);
    var y0 = Math.max(0, (view.camY / tile | 0) - 1);
    var x1 = Math.min(SIM.W - 1, Math.ceil((view.camX + view.w / z) / tile) + 1);
    var y1 = Math.min(SIM.H - 1, Math.ceil((view.camY + view.h / z) / tile) + 1);
    var fog = state.fog[0];
    var x, y, i, sx, sy, kind, dim, n, ps;
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, view.w, view.h);
    ps = Math.max(1, z);
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = y * SIM.W + x;
        sx = (x * tile - view.camX) * z;
        sy = (y * tile - view.camY) * z;
        if (!fog[i]) {
          ctx.fillStyle = '#07080c';
          ctx.fillRect(sx, sy, tile * z + 1, tile * z + 1);
          continue;
        }
        dim = fog[i] !== 2;
        kind = state.terrain[i];
        ctx.fillStyle = tileColor(kind === 3 ? 0 : kind, x, y, dim);
        ctx.fillRect(sx, sy, tile * z + 1, tile * z + 1);
        n = hash(x, y);
        if (!dim && kind !== 1 && kind !== 2 && kind !== 4 && n % 11 === 0) {
          ctx.fillStyle = n % 22 === 0 ? '#d7c15a' : '#1f4624';
          ctx.fillRect(sx + (n % 20) * ps, sy + ((n >> 4) % 18) * ps, ps, ps * 2);
        }
        if (kind === 1 && !dim) {
          var wave = view.reduced ? 0 : Math.sin(state.time * 1.6 + x * 0.7 + y) * 3 * z;
          ctx.fillStyle = 'rgba(186, 230, 240, 0.35)';
          ctx.fillRect(sx + 4 * z, sy + tile * z * 0.45 + wave, tile * z * 0.55, Math.max(1, z));
        }
        if (kind === 2) {
          ctx.fillStyle = dim ? '#161410' : '#2c2822';
          ctx.fillRect(sx, sy + tile * z * 0.42, tile * z + 1, tile * z * 0.58);
          ctx.fillStyle = dim ? '#3a342c' : '#7a7368';
          ctx.fillRect(sx, sy, tile * z + 1, Math.max(1, 2 * z));
        }
        if (kind === 4 && state.ore[i] > 0) {
          ctx.fillStyle = dim ? '#3a342c' : '#6d675c';
          ctx.fillRect(sx + 8 * z, sy + 10 * z, 16 * z, 12 * z);
          ctx.fillStyle = dim ? '#5c5338' : '#f0c14a';
          ctx.fillRect(sx + 12 * z, sy + 14 * z, 4 * z, 3 * z);
          if (!dim && !view.reduced && ((state.time * 3 + n) | 0) % 7 === 0) {
            ctx.fillStyle = '#fff4c2';
            ctx.fillRect(sx + 18 * z, sy + 12 * z, 2 * z, 2 * z);
          }
        }
      }
    }
  }

  function drawTree(ctx, sx, sy, z, variant, sway, dim) {
    var trunk = dim ? '#3a2a1c' : '#5a3a22';
    var leaf = dim ? '#1c3a22' : (variant % 5 === 0 ? '#6a8f32' : (variant % 2 ? '#2f8a45' : '#1f6b38'));
    var leaf2 = dim ? '#16301c' : '#163f22';
    ctx.fillStyle = trunk;
    ctx.fillRect(sx + 13 * z, sy + 16 * z, 6 * z, 14 * z);
    ctx.fillStyle = leaf2;
    ctx.fillRect(sx + (6 + sway) * z, sy + 8 * z, 20 * z, 14 * z);
    ctx.fillStyle = leaf;
    ctx.fillRect(sx + (8 + sway) * z, sy + 4 * z, 16 * z, 12 * z);
    ctx.fillRect(sx + (4 + sway) * z, sy + 10 * z, 24 * z, 8 * z);
    if (!dim) {
      ctx.fillStyle = '#b7e39a';
      ctx.fillRect(sx + (12 + sway) * z, sy + 6 * z, 3 * z, 2 * z);
    }
  }

  function kilnHearth(frame) {
    return [
      [2, 14, 20, 6, K.d],
      [4, 8, 16, 8, K.b],
      [6, 4, 6, 6, K.m],
      [7, 0, 4, 4, K.d],
      [8, 1, 2, 2, frame % 2 ? K.e : K.g],
      [8, 12, 8, 4, K.e],
      [9, 13, 6, 2, K.g],
      [1, 16, 3, 4, K.o],
      [20, 16, 3, 4, K.o],
      [0, 6, 3, 8, K.c],
      [21, 5, 3, 6, frame % 2 ? K.e : K.b]
    ];
  }
  function reedHearth(frame) {
    return [
      [1, 16, 3, 6, R.d], [20, 16, 3, 6, R.d], [6, 16, 3, 6, R.d], [15, 16, 3, 6, R.d],
      [2, 10, 20, 7, R.c],
      [1, 6, 22, 5, R.e],
      [3, 4, 18, 3, R.d],
      [18, 0, 2, 8, R.b],
      [20, 1, 4, 3, frame % 2 ? R.m : R.w],
      [6, 12, 4, 3, R.b],
      [14, 12, 4, 3, R.m]
    ];
  }
  function kilnArms() {
    return [
      [0, 10, 28, 8, K.d],
      [1, 6, 26, 5, K.c],
      [2, 4, 8, 4, K.b],
      [18, 3, 6, 5, K.m],
      [4, 12, 6, 4, K.o],
      [18, 12, 6, 4, K.o],
      [10, 8, 8, 3, K.e]
    ];
  }
  function reedArms() {
    return [
      [0, 8, 28, 8, R.d],
      [1, 5, 26, 4, R.e],
      [4, 2, 18, 4, R.c],
      [8, 10, 5, 4, R.b],
      [16, 10, 5, 4, R.m],
      [22, 0, 2, 6, R.b],
      [24, 1, 3, 2, R.w]
    ];
  }
  function yardParts(fac, frame) {
    var P = palOf(fac);
    return [
      [1, 8, 18, 8, P.d],
      [2, 4, 16, 5, P.b],
      [4, 10, 6, 4, fac === 'reed' ? R.e : K.e],
      [12, 11, 5, 3, P.c],
      [0, 12, 3, 4, P.o],
      [17, 12, 3, 4, P.o],
      [8, 2, 2, 3, frame % 2 ? P.w : P.b]
    ];
  }
  function towerParts(fac, frame) {
    var P = palOf(fac);
    return [
      [6, 14, 8, 6, P.d],
      [7, 6, 6, 9, P.c],
      [6, 3, 8, 4, P.b],
      [9, 0, 2, 4, P.o],
      [11, 1, 4, 2, frame % 2 ? (fac === 'reed' ? R.m : K.e) : P.w],
      [8, 10, 4, 3, fac === 'reed' ? R.m : K.w]
    ];
  }
  function shrineParts(fac, frame) {
    var P = palOf(fac);
    return [
      [2, 12, 16, 6, P.d],
      [4, 6, 12, 7, P.c],
      [6, 2, 8, 5, P.b],
      [8, 0, 4, 3, frame % 2 ? (fac === 'reed' ? R.m : K.e) : P.w],
      [3, 8, 3, 5, P.o],
      [14, 8, 3, 5, P.o]
    ];
  }

  function unitParts(fac, type, anim, frame) {
    var P = palOf(fac);
    var leg = frame % 2;
    var atk = anim === 'attack';
    var bob = anim === 'idle' && frame % 2 ? 1 : 0;
    var parts = [];
    function add(x, y, w, h, c) { parts.push([x, y + bob, w, h, c]); }
    if (anim === 'death') {
      return [
        [1, 10, 12, 3, P.d],
        [3, 8, 8, 2, P.b],
        [2, 11, 3, 2, P.s],
        [8, 9, 4, 2, P.e]
      ];
    }
    if (type === 'worker') {
      add(5, 2, 4, 3, P.s);
      add(4, 1, 6, 2, fac === 'reed' ? R.e : K.b);
      add(4, 5, 6, 4, fac === 'reed' ? R.c : K.c);
      add(5, 6, 4, 2, fac === 'reed' ? R.b : K.e);
      add(leg ? 4 : 6, 9, 2, 3, P.d);
      add(leg ? 8 : 5, 9, 2, 3, P.p);
      if (atk) add(10, 4, 5, 2, fac === 'reed' ? R.b : K.b);
      else add(9, 5, 3, 2, fac === 'reed' ? R.b : K.m);
      add(3, 5, 2, 3, P.s);
      return parts;
    }
    if (type === 'pike') {
      add(5, 1, 4, 3, P.s);
      add(4, 0, 6, 2, fac === 'reed' ? R.e : K.b);
      add(4, 4, 6, 5, fac === 'reed' ? R.c : K.d);
      add(3, 5, 3, 4, fac === 'reed' ? R.b : K.b);
      add(leg ? 4 : 7, 9, 2, 4, P.p);
      add(leg ? 8 : 5, 9, 2, 4, P.d);
      var spear = atk ? 12 : 10;
      add(spear, 2, 6, 1, P.w);
      add(spear + 5, 1, 2, 3, fac === 'reed' ? R.m : K.e);
      return parts;
    }
    if (type === 'bow') {
      add(5, 2, 4, 3, P.s);
      add(4, 1, 6, 2, fac === 'reed' ? R.d : K.m);
      add(4, 5, 5, 4, fac === 'reed' ? R.c : K.c);
      add(leg ? 4 : 7, 9, 2, 4, P.p);
      add(leg ? 7 : 5, 9, 2, 4, P.d);
      if (fac === 'reed') {
        add(atk ? 11 : 9, 4, 1, 6, R.b);
        add(atk ? 10 : 8, 4, 4, 1, R.w);
        add(atk ? 10 : 8, 9, 4, 1, R.w);
      } else {
        add(9, 5, 5, 2, K.m);
        add(atk ? 13 : 11, 4, 3, 1, K.w);
        add(atk ? 14 : 12, 6, 2, 1, K.e);
      }
      return parts;
    }
    if (type === 'ram') {
      var wheel = leg ? 1 : 0;
      return [
        [2, 6, 14, 5, fac === 'reed' ? R.e : K.b],
        [3, 4, 10, 3, fac === 'reed' ? R.d : K.d],
        [12, 5, 6, 3, fac === 'reed' ? R.b : K.e],
        [1, 11 + wheel, 3, 3, P.o],
        [12, 11 + (1 - wheel), 3, 3, P.o],
        [4, 7, 4, 2, fac === 'reed' ? R.m : K.g],
        [0, 7, 3, 2, P.w]
      ];
    }
    if (type === 'guard') {
      add(4, 1, 6, 3, K.b);
      add(5, 3, 4, 2, K.s);
      add(3, 5, 8, 5, K.d);
      add(2, 5, 4, 6, K.b);
      add(1, 6, 2, 5, K.e);
      add(leg ? 4 : 7, 10, 2, 4, K.p);
      add(leg ? 8 : 5, 10, 2, 4, K.m);
      add(atk ? 11 : 9, 4, 5, 2, K.e);
      return parts;
    }
    if (type === 'skiff') {
      var dip = leg ? 1 : 0;
      return [
        [1, 8 + dip, 16, 4, R.t],
        [2, 7 + dip, 14, 2, R.d],
        [4, 5 + dip, 8, 3, R.c],
        [10, 2, 2, 6, R.b],
        [12, 3, 4, 3, frame % 2 ? R.w : R.m],
        [3, 6, 3, 2, R.s],
        [0, 10 + dip, 3, 2, R.m],
        [15, 10 + dip, 3, 2, R.e]
      ];
    }
    if (type === 'titan') {
      var stomp = atk ? 1 : 0;
      return [
        [3, 2, 10, 4, K.d],
        [4, 0, 8, 3, K.b],
        [2, 0, 3, 3, K.e],
        [11, 0, 3, 3, K.e],
        [5, 3, 6, 2, K.g],
        [2, 6, 12, 6, K.m],
        [4, 7, 8, 3, K.e],
        [2, 12 + stomp, 4, 4, K.d],
        [10, 12 + (1 - stomp), 4, 4, K.b],
        [atk ? 13 : 12, 8, 5, 3, K.e]
      ];
    }
    if (type === 'saint') {
      add(6, 1, 4, 3, R.s);
      add(4, 0, 8, 2, R.e);
      add(7, 0, 2, 2, frame % 2 ? R.m : R.w);
      add(5, 4, 6, 7, R.c);
      add(4, 5, 2, 6, R.b);
      add(10, 5, 2, 6, R.m);
      add(leg ? 6 : 8, 11, 2, 4, R.d);
      add(leg ? 9 : 6, 11, 2, 4, R.p);
      add(atk ? 12 : 11, 2, 2, 10, R.b);
      add(atk ? 11 : 10, 1, 4, 2, R.m);
      return parts;
    }
    add(4, 2, 4, 4, P.b);
    return parts;
  }

  function buildingParts(fac, type, frame) {
    if (type === 'hearth') return fac === 'reed' ? reedHearth(frame) : kilnHearth(frame);
    if (type === 'barracks') return fac === 'reed' ? reedArms() : kilnArms();
    if (type === 'yard') return yardParts(fac, frame);
    if (type === 'tower') return towerParts(fac, frame);
    return shrineParts(fac, frame);
  }

  function buildingWidth(type) {
    if (type === 'hearth' || type === 'barracks') return 28;
    if (type === 'tower') return 20;
    return 22;
  }

  function pushDraw(list, y, fn) { list.push({ y: y, fn: fn }); }

  function drawWorld(ctx, state, view) {
    var SIM = root.CINDER_SIM;
    var z = view.zoom;
    var ps = Math.max(1, Math.round(z * 2));
    drawGround(ctx, state, view, SIM);
    var list = [];
    var fog = state.fog[0];
    var tile = SIM.TILE;
    var i, x, y, sx, sy, sway, dim, b, u, fac, frame, parts, footX, footY;
    var x0 = Math.max(0, (view.camX / tile | 0) - 1);
    var y0 = Math.max(0, (view.camY / tile | 0) - 1);
    var x1 = Math.min(SIM.W - 1, Math.ceil((view.camX + view.w / z) / tile) + 1);
    var y1 = Math.min(SIM.H - 1, Math.ceil((view.camY + view.h / z) / tile) + 1);
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = y * SIM.W + x;
        if (!fog[i] || state.terrain[i] !== SIM.TREE || state.tree[i] <= 0) continue;
        dim = fog[i] !== 2;
        sx = (x * tile - view.camX) * z;
        sy = (y * tile - view.camY) * z;
        sway = view.reduced ? 0 : Math.round(Math.sin(state.time * 1.2 + x) * 0.6);
        pushDraw(list, y * tile + tile, (function (ax, ay, variant, sw, d) {
          return function () { drawTree(ctx, ax, ay, z, variant, sw, d); };
        })(sx, sy, hash(x, y), sway, dim));
      }
    }
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.side !== 0 && fog[b.ty * SIM.W + b.tx] === 0 && !b.dead) continue;
      if (b.dead && b.deathT > 1.2) continue;
      fac = facOf(state, b.side);
      frame = view.reduced ? 0 : ((state.time * 2) | 0);
      footX = (b.tx * tile - view.camX) * z;
      footY = ((b.ty + b.h) * tile - view.camY) * z;
      dim = b.side !== 0 && fog[b.ty * SIM.W + b.tx] !== 2;
      pushDraw(list, (b.ty + b.h) * tile, (function (bd, fx, fy, fc, fr, d) {
        return function () {
          var width = buildingWidth(bd.type);
          var partsB = buildingParts(fc, bd.type, bd.dead ? 0 : fr);
          var scale = ps;
          var drawX = fx + ((bd.w * tile * z) - width * scale) / 2;
          var drawY = fy - (18 * scale);
          if (d || bd.dead) ctx.globalAlpha = bd.dead ? Math.max(0, 1 - bd.deathT) : 0.55;
          if (!bd.done && !bd.dead) {
            ctx.fillStyle = 'rgba(90, 70, 40, 0.85)';
            ctx.fillRect(fx, fy - bd.h * tile * z, bd.w * tile * z, bd.h * tile * z);
          }
          blit(ctx, drawX, drawY, scale, width, partsB, false, bd.flash > 0.06);
          ctx.globalAlpha = 1;
          if (!bd.done && !bd.dead) {
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(fx + 4, fy - 8 * z, bd.w * tile * z - 8, 4 * z);
            ctx.fillStyle = '#f0c14a';
            ctx.fillRect(fx + 4, fy - 8 * z, (bd.w * tile * z - 8) * bd.progress, 4 * z);
          }
          if (picked(view, bd.id) && !bd.dead) {
            ctx.strokeStyle = fc === 'reed' ? '#b7e39a' : '#ffb15a';
            ctx.lineWidth = 2;
            ctx.strokeRect(fx + 1, fy - bd.h * tile * z + 1, bd.w * tile * z - 2, bd.h * tile * z - 2);
          }
        };
      })(b, footX, footY, fac, frame, dim));
    }
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.side !== 0 && fog[(tileAtY(u.y) * SIM.W) + tileAtX(u.x)] !== 2 && !u.dead) continue;
      if (u.dead && u.deathT > 2.1) continue;
      pushDraw(list, u.y, (function (unit) {
        return function () {
          var f = facOf(state, unit.side);
          var fr = unit.anim === 'death' ? Math.min(3, (unit.deathT * 8) | 0) : ((state.time * (unit.anim === 'idle' ? 2 : 8) + unit.id) | 0);
          if (view.reduced && unit.anim !== 'death') fr = 0;
          var partsU = unitParts(f, unit.type, unit.dead ? 'death' : unit.anim, fr);
          var width = unit.type === 'titan' || unit.type === 'ram' || unit.type === 'skiff' ? 18 : 16;
          var scale = unit.type === 'titan' ? ps + Math.round(ps * 0.5) : ps;
          var ax = (unit.x - view.camX) * z - (width * scale) / 2;
          var ay = (unit.y - view.camY) * z - (14 * scale);
          if (unit.dead) ctx.globalAlpha = Math.max(0, 1 - Math.max(0, unit.deathT - 0.35) / 1.5);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(ax + 3 * scale, (unit.y - view.camY) * z - scale, width * scale - 6 * scale, scale);
          blit(ctx, ax, ay, scale, width, partsU, unit.facing < 0, false);
          if (unit.flash > 0.06 && !unit.dead) {
            ctx.fillStyle = '#fffaf3';
            ctx.fillRect(ax + width * scale * 0.35, ay + 4 * scale, 3 * scale, 3 * scale);
          }
          ctx.globalAlpha = 1;
          if (unit.carry > 0 && !unit.dead) {
            ctx.fillStyle = unit.carryKind === 'ore' ? '#f0c14a' : '#8fd0a4';
            ctx.fillRect(ax + width * scale - 3 * scale, ay + 6 * scale, 3 * scale, 3 * scale);
          }
          var showHp = picked(view, unit.id) || unit.hp < unit.hpMax;
          if (showHp && !unit.dead) {
            var bw = Math.max(12, width * scale * 0.7);
            var hx = (unit.x - view.camX) * z - bw / 2;
            var hy = ay - 4 * z;
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(hx, hy, bw, 3 * Math.max(1, z));
            ctx.fillStyle = unit.side === 0 ? '#86efac' : '#fca5a5';
            ctx.fillRect(hx, hy, bw * Math.max(0, unit.hp / unit.hpMax), 3 * Math.max(1, z));
          }
        };
      })(u));
    }
    list.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < list.length; i++) list[i].fn();

    for (i = 0; i < state.shots.length; i++) drawShot(ctx, state.shots[i], view);
    for (i = 0; i < state.fx.length; i++) drawFx(ctx, state.fx[i], view);
    for (i = 0; i < state.floats.length; i++) {
      if (state.floats[i].side !== 0) continue;
      var fl = state.floats[i];
      ctx.globalAlpha = Math.max(0, fl.life);
      ctx.fillStyle = '#f7efe0';
      ctx.font = '700 12px Inter, sans-serif';
      ctx.fillText(fl.text, (fl.x - view.camX) * z, (fl.y - view.camY) * z);
      ctx.globalAlpha = 1;
    }
    if (view.ghost) drawGhost(ctx, state, view, SIM);
    var night = 0;
    if (state.dayOn && !view.reduced) {
      var day = state.day;
      if (day >= 0.55 && day <= 0.97) {
        if (day < 0.68) night = (day - 0.55) / 0.13 * 0.42;
        else if (day < 0.88) night = 0.42;
        else night = (0.97 - day) / 0.09 * 0.42;
      }
    }
    if (night > 0.02) {
      ctx.fillStyle = 'rgba(8, 14, 32, ' + night + ')';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!view.reduced) {
        ctx.fillStyle = 'rgba(255, 150, 60, 0.55)';
        for (i = 0; i < state.buildings.length; i++) {
          b = state.buildings[i];
          if (b.dead || !b.done) continue;
          if (b.type !== 'hearth' && b.type !== 'tower') continue;
          sx = ((b.tx + b.w / 2) * tile - view.camX) * z;
          sy = ((b.ty + 0.3) * tile - view.camY) * z;
          ctx.fillRect(sx, sy, 3 * z, 3 * z);
        }
      }
    }
    if (view.box) {
      ctx.strokeStyle = '#f7efe0';
      ctx.lineWidth = 1;
      ctx.strokeRect(view.box.x, view.box.y, view.box.w, view.box.h);
      ctx.fillStyle = 'rgba(247, 239, 224, 0.12)';
      ctx.fillRect(view.box.x, view.box.y, view.box.w, view.box.h);
    }
  }

  function tileAtX(px) { return Math.max(0, Math.min(55, px / 32 | 0)); }
  function tileAtY(px) { return Math.max(0, Math.min(55, px / 32 | 0)); }

  function drawShot(ctx, s, view) {
    var z = view.zoom;
    var x = (s.x - view.camX) * z;
    var y = (s.y - view.camY) * z;
    var ang = Math.atan2(s.vy, s.vx);
    if (s.kind === 'rock') {
      ctx.fillStyle = '#6b5b4a';
      ctx.fillRect(x - 3 * z, y - 3 * z, 6 * z, 6 * z);
      ctx.fillStyle = '#d2c2a4';
      ctx.fillRect(x - z, y - z, 2 * z, 2 * z);
      return;
    }
    if (s.kind === 'mist') {
      ctx.fillStyle = 'rgba(190, 233, 242, 0.9)';
      ctx.fillRect(x - 3 * z, y - 2 * z, 7 * z, 4 * z);
      return;
    }
    ctx.strokeStyle = s.kind === 'dart' ? '#efe0bc' : '#ffe7a3';
    ctx.lineWidth = Math.max(2, z * 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang) * 8 * z, y - Math.sin(ang) * 8 * z);
    ctx.stroke();
  }

  function drawFx(ctx, fx, view) {
    if (view.reduced) return;
    var z = view.zoom;
    var x = (fx.x - view.camX) * z;
    var y = (fx.y - view.camY) * z;
    var t = 1 - fx.life / fx.max;
    var rad = (8 + t * (fx.kind === 'big' ? 36 : 22)) * z;
    ctx.globalAlpha = Math.max(0, fx.life / fx.max);
    ctx.strokeStyle = fx.kind === 'pop' ? '#f0c14a' : '#ff8a3d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
    ctx.fillStyle = '#fff4d6';
    var i, a;
    for (i = 0; i < 6; i++) {
      a = t * 4 + i;
      ctx.fillRect(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.4, 2 * z, 2 * z);
    }
    ctx.globalAlpha = 1;
  }

  function drawGhost(ctx, state, view, SIM) {
    var d = SIM.DEFS[view.ghost.type];
    if (!d) return;
    var z = view.zoom;
    var x = (view.ghost.tx * SIM.TILE - view.camX) * z;
    var y = (view.ghost.ty * SIM.TILE - view.camY) * z;
    ctx.fillStyle = view.ghost.ok ? 'rgba(134, 239, 172, 0.35)' : 'rgba(252, 165, 165, 0.35)';
    ctx.fillRect(x, y, d.w * SIM.TILE * z, d.h * SIM.TILE * z);
    ctx.strokeStyle = view.ghost.ok ? '#86efac' : '#fca5a5';
    ctx.strokeRect(x, y, d.w * SIM.TILE * z, d.h * SIM.TILE * z);
  }

  function drawMini(ctx, state, view) {
    var SIM = root.CINDER_SIM;
    var mw = view.mw;
    var mh = view.mh;
    var sx = mw / SIM.W;
    var sy = mh / SIM.H;
    var fog = state.fog[0];
    var x, y, i, kind;
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, mw, mh);
    for (y = 0; y < SIM.H; y++) {
      for (x = 0; x < SIM.W; x++) {
        i = y * SIM.W + x;
        if (!fog[i]) continue;
        kind = state.terrain[i];
        ctx.fillStyle = fog[i] === 2 ? tileColor(kind === 3 ? 0 : kind, x, y, false) : '#172017';
        if (kind === 1 && fog[i] === 2) ctx.fillStyle = '#1a4d68';
        if (kind === 2 && fog[i] === 2) ctx.fillStyle = '#5c564c';
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    var b, u, c;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.dead) continue;
      if (b.side !== 0 && fog[b.ty * SIM.W + b.tx] === 0) continue;
      ctx.fillStyle = b.side === 0 ? '#f0c14a' : '#fca5a5';
      ctx.fillRect(b.tx * sx, b.ty * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.dead) continue;
      c = (u.y / SIM.TILE | 0) * SIM.W + (u.x / SIM.TILE | 0);
      if (u.side !== 0 && fog[c] !== 2) continue;
      ctx.fillStyle = u.side === 0 ? '#ecfccb' : '#fecaca';
      ctx.fillRect((u.x / (SIM.W * SIM.TILE)) * mw, (u.y / (SIM.H * SIM.TILE)) * mh, 2, 2);
    }
    if (view.alert) {
      ctx.fillStyle = '#fde047';
      ctx.fillRect((view.alert.x / (SIM.W * SIM.TILE)) * mw - 2, (view.alert.y / (SIM.H * SIM.TILE)) * mh - 2, 5, 5);
    }
    var vx = (view.camX / (SIM.W * SIM.TILE)) * mw;
    var vy = (view.camY / (SIM.H * SIM.TILE)) * mh;
    var vw = (view.w / view.zoom) / (SIM.W * SIM.TILE) * mw;
    var vh = (view.h / view.zoom) / (SIM.H * SIM.TILE) * mh;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
  }

  root.CINDER_DRAW = { world: drawWorld, mini: drawMini };
})(typeof window !== 'undefined' ? window : globalThis);
