/* 90s guestbook. Firebase when the rules allow it, this browser otherwise. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.guestbook.v1';
  var STAMPS = ['sun', 'alien', 'ship', 'chef', 'flame', 'cat'];
  var entries = [];
  var cloudOn = false;
  var owner = false;

  function $(id) { return document.getElementById(id); }
  function isAdminNow() {
  return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
}
  function isOwner() {
    return isAdminNow();
  }

  function readLocal() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function writeLocal(rows) {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {}
  }
  function cleanName(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return /^[A-Za-z0-9_][A-Za-z0-9_ ]{0,23}$/.test(text) ? text : '';
  }
  function cleanNote(value) {
    var text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    return text.length >= 1 && text.length <= 280 ? text : '';
  }
  function cleanHome(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    return /^https:\/\/\S+$/.test(text) && text.length <= 200 ? text : null;
  }
  function cleanWhere(value) {
    var text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    return text.length <= 40 ? text : text.slice(0, 40);
  }
  function status(text) {
    var node = $('gbStatus');
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
  }
  function rect(svg, x, y, w, h, fill) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.setAttribute('x', x);
    node.setAttribute('y', y);
    node.setAttribute('width', w);
    node.setAttribute('height', h);
    node.setAttribute('fill', fill);
    svg.appendChild(node);
  }
  function stampSvg(kind) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '32');
    svg.setAttribute('height', '32');
    svg.setAttribute('aria-hidden', 'true');
    var art = {
      sun: [[6, 1, 4, 2, '#ff0'], [7, 0, 2, 1, '#ff0'], [2, 6, 2, 4, '#ff0'], [12, 6, 2, 4, '#ff0'], [4, 4, 8, 8, '#fc0'], [6, 6, 2, 2, '#000'], [9, 6, 2, 2, '#000'], [6, 10, 4, 1, '#c60']],
      alien: [[4, 2, 8, 3, '#3d3'], [3, 5, 10, 6, '#3d3'], [4, 6, 2, 2, '#000'], [10, 6, 2, 2, '#000'], [6, 11, 4, 3, '#3d3'], [5, 14, 2, 2, '#163'], [9, 14, 2, 2, '#163']],
      ship: [[2, 8, 12, 3, '#14c'], [4, 6, 8, 2, '#fff'], [6, 4, 4, 2, '#fff'], [7, 2, 2, 2, '#f33'], [1, 11, 3, 2, '#9cf'], [6, 11, 3, 2, '#9cf'], [11, 11, 3, 2, '#9cf']],
      chef: [[4, 3, 8, 3, '#fff'], [3, 5, 3, 3, '#fff'], [10, 5, 3, 3, '#fff'], [5, 8, 6, 2, '#fff'], [6, 10, 4, 4, '#eee'], [4, 14, 8, 2, '#ccc']],
      flame: [[7, 1, 2, 3, '#ff0'], [6, 4, 4, 3, '#f80'], [5, 7, 6, 4, '#f30'], [6, 11, 4, 3, '#fc0'], [7, 8, 2, 3, '#ff0']],
      cat: [[3, 2, 3, 3, '#80f'], [10, 2, 3, 3, '#80f'], [4, 4, 8, 6, '#c6f'], [5, 6, 2, 2, '#000'], [9, 6, 2, 2, '#000'], [7, 8, 2, 1, '#309'], [4, 10, 8, 3, '#80f'], [3, 12, 2, 3, '#80f'], [11, 12, 2, 3, '#80f']]
    };
    (art[kind] || art.sun).forEach(function (px) { rect(svg, px[0], px[1], px[2], px[3], px[4]); });
    return svg;
  }
  function when(ms) {
    var time = Number(ms);
    if (!time) return '';
    return new Date(time).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
  }
  function paint() {
    var list = $('gbList');
    var clear = $('gbClear');
    if (!list) return;
    if (clear) clear.hidden = !owner;
    list.replaceChildren();
    var rows = entries.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    rows.forEach(function (entry) {
      var card = document.createElement('article');
      card.className = 'gb-entry';
      var mark = document.createElement('div');
      mark.appendChild(stampSvg(entry.stamp));
      var body = document.createElement('div');
      var title = document.createElement('p');
      var strong = document.createElement('strong');
      strong.textContent = entry.name || 'Guest';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(strong, entry.author);
      title.appendChild(strong);
      if (entry.location) title.appendChild(document.createTextNode(' · ' + entry.location));
      if (entry.createdAt) title.appendChild(document.createTextNode(' · ' + when(entry.createdAt)));
      if (entry.localOnly) title.appendChild(document.createTextNode(' · this computer'));
      body.appendChild(title);
      var note = document.createElement('p');
      note.className = 'gb-note';
      note.textContent = entry.note || '';
      body.appendChild(note);
      if (entry.homepage) {
        var home = document.createElement('p');
        var link = document.createElement('a');
        link.href = entry.homepage;
        link.rel = 'noopener noreferrer';
        link.textContent = entry.homepage;
        home.appendChild(link);
        body.appendChild(home);
      }
      if (owner) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn ghost';
        del.textContent = 'Delete';
        del.addEventListener('click', function () { removeEntry(entry); });
        body.appendChild(del);
      }
      card.append(mark, body);
      list.appendChild(card);
    });
  }
  function merge(cloud) {
    var local = readLocal();
    var byId = Object.create(null);
    local.forEach(function (row) {
      if (row && row.id) byId[row.id] = Object.assign({localOnly: true}, row);
    });
    (cloud || []).forEach(function (row) {
      if (!row || !row.id) return;
      byId[row.id] = row;
    });
    entries = Object.keys(byId).map(function (id) { return byId[id]; });
    paint();
  }
  function db() {
    if (!window.firebase || !firebase.initializeApp || !window.MONDO_BOARD_CONFIG) return null;
    if (!firebase.apps.length) {
      try { firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
      catch (e) { return null; }
    }
    return firebase.apps.length && firebase.database ? firebase.database() : null;
  }
  function watch() {
    var base = db();
    var user = window.firebase && firebase.auth && firebase.auth().currentUser;
    if (!base || !user) {
      merge([]);
      if (!base) status('Guestbook is saved on this computer.');
      return;
    }
    if (watch.armed) return;
    watch.armed = true;
    base.ref('guestbook/entries').on('value', function (snap) {
      cloudOn = true;
      var value = snap.val() || {};
      var rows = Object.keys(value).map(function (id) {
        return Object.assign({id: id}, value[id]);
      });
      status('');
      merge(rows);
    }, function () {
      cloudOn = false;
      merge([]);
      status('Guestbook rules are not published yet. Notes stay on this computer.');
    });
  }
  function removeEntry(entry) {
    var local = readLocal().filter(function (row) { return row.id !== entry.id; });
    writeLocal(local);
    var base = db();
    if (base && owner && !entry.localOnly) {
      base.ref('guestbook/entries/' + entry.id).remove().catch(function () {});
    }
    merge(entries.filter(function (row) { return row.id !== entry.id && !row.localOnly; }));
  }
  function clearAll() {
    if (!owner || !confirm('Clear every guestbook note?')) return;
    var base = db();
    var pending = entries.filter(function (row) { return !row.localOnly; });
    writeLocal([]);
    if (!base) { merge([]); return; }
    Promise.all(pending.map(function (row) {
      return base.ref('guestbook/entries/' + row.id).remove().catch(function () {});
    })).then(function () { merge([]); });
  }
  function sign(event) {
    event.preventDefault();
    var name = cleanName($('gbName').value);
    var note = cleanNote($('gbNote').value);
    var homepage = cleanHome($('gbHome').value);
    var location = cleanWhere($('gbWhere').value);
    var stampNode = document.querySelector('input[name="stamp"]:checked');
    var stamp = stampNode && STAMPS.indexOf(stampNode.value) >= 0 ? stampNode.value : 'sun';
    if (!name) { status('Use a name of letters, numbers, underscores, and spaces.'); return; }
    if (!note) { status('Write a short note, up to 280 characters.'); return; }
    if (homepage == null) { status('A homepage has to start with https://'); return; }
    var user = window.firebase && firebase.auth && firebase.auth().currentUser;
    var row = {
      id: (user && user.uid ? user.uid : 'local') + '_' + Date.now().toString(36),
      name: name,
      stamp: stamp,
      note: note,
      homepage: homepage,
      location: location,
      createdAt: Date.now(),
      author: user ? user.uid : 'local',
      localOnly: true
    };
    function keepLocal(message) {
      var local = readLocal();
      local.push(row);
      writeLocal(local);
      $('gbForm').reset();
      var sun = document.querySelector('input[name="stamp"][value="sun"]');
      if (sun) sun.checked = true;
      status(message);
      merge(entries.filter(function (item) { return !item.localOnly; }));
    }
    var base = db();
    if (!base || !user) {
      keepLocal('Saved on this computer.');
      return;
    }
    var payload = {
      name: name,
      stamp: stamp,
      note: note,
      homepage: homepage,
      location: location,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      author: user.uid
    };
    var updates = {};
    updates['guestbook/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
    updates['guestbook/entries/' + row.id] = payload;
    base.ref().update(updates).then(function () {
      $('gbForm').reset();
      var sun = document.querySelector('input[name="stamp"][value="sun"]');
      if (sun) sun.checked = true;
      status('Signed. Welcome to the book.');
    }).catch(function () {
      keepLocal('Saved on this computer until the guestbook rules are published.');
    });
  }
  function boot() {
    if (!$('gbForm')) return;
    $('gbForm').addEventListener('submit', sign);
    var clear = $('gbClear');
    if (clear) clear.addEventListener('click', clearAll);
    document.querySelectorAll('.gb-stamps label').forEach(function (label) {
      var input = label.querySelector('input');
      if (!input) return;
      label.insertBefore(stampSvg(input.value), input.nextSibling);
    });
    merge([]);
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (user) {
        owner = isOwner();
        if (!boot.ownerListen) { boot.ownerListen = true; document.addEventListener('mondo-owner', function () { var on = isOwner(); if (on === owner) return; owner = on; paint(); }); }
        if (user) watch();
        else merge([]);
        paint();
      });
    } else watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
