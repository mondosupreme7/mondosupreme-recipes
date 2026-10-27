/* Full site backup. Anyone can export and restore this browser. Firebase writes stay with the owner. */
(function () {
  'use strict';
  var OWNER = 'cbrooks_911@yahoo.com';
  var LOCAL_KEYS = [
    'mondosupreme.recipes.v1',
    'mondosupreme.favs.v1',
    'mondosupreme.recipes.pushed.v1',
    'mondosupreme.wiki.v1',
    'mondosupreme.wiki.pushed.v1',
    'mondosupreme.forum.v1',
    'mondosupreme.forum.seen',
    'mondosupreme.guestbook.v1',
    'mondosupreme.grocery.v1',
    'mondosupreme.cruise_countdown.v1',
    'mondosupreme.theme.v1',
    'mondosupreme.arcade.v1',
    'mondosupreme.pet.v1',
    'mondosupreme.pet.v1.park',
    'mondosupreme.fps.v1',
    'mondosupreme.mmo.v1',
    'mondosupreme.winamp.v1',
    'mondosupreme.wakes.v1',
    'mondosupreme.hits.v1',
    'mondosupreme.chat.name',
    'mondosupreme.escape.v1',
    'mondosupreme.audio.v1',
    'mondosupreme.fx.v1',
    'mondosupreme.aim.v1',
    'mondosupreme.wiki.history.v1',
    'mondosupreme.pogs.v1',
    'mondosupreme.market.v1',
    'mondosupreme.8ball.v1',
    'mondosupreme.stocks.v1',
    'mondosupreme.quote_idx.v1',
    'mondosupreme.weather.v1',
    'mondosupreme.wordle.v1',
    'mondosupreme.search.v1'
  ];
  var CLOUD = [
    ['recipes', 'recipes/items'],
    ['wiki', 'wiki/items'],
    ['guestbook', 'guestbook/entries'],
    ['arcade', 'arcade/scores'],
    ['pet', 'pet/park'],
    ['fps', 'fps/leaderboard'],
    ['mmo', 'mmo/leaderboard'],
    ['countdown', 'countdown/next']
  ];

  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }
  function isOwner(user) {
    return !!(user && user.email && String(user.email).toLowerCase() === ownerEmail());
  }
  function bootFirebase() {
    if (!window.firebase || !firebase.initializeApp || !window.MONDO_BOARD_CONFIG) return false;
    if (!firebase.apps.length) {
      try { firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
      catch (e) { /* already started */ }
    }
    return !!(firebase.apps.length && firebase.database);
  }
  function readLocal() {
    var local = {};
    LOCAL_KEYS.forEach(function (key) {
      try {
        var value = localStorage.getItem(key);
        if (value != null) local[key] = value;
      } catch (e) {}
    });
    return local;
  }
  function once(path) {
    return firebase.database().ref(path).once('value').then(function (snap) {
      return snap.val();
    }, function () { return null; });
  }
  function download(payload) {
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mondosupreme-backup-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function exportBackup() {
    var payload = {
      kind: 'mondosupreme-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      local: readLocal(),
      cloud: {}
    };
    if (!bootFirebase() || !firebase.auth().currentUser) {
      download(payload);
      return;
    }
    var jobs = CLOUD.map(function (pair) {
      return once(pair[1]).then(function (value) {
        payload.cloud[pair[0]] = value;
      });
    });
    jobs.push(once('forum/threads').then(function (value) { payload.cloud.forumThreads = value; }));
    jobs.push(once('forum/replies').then(function (value) { payload.cloud.forumReplies = value; }));
    jobs.push(once('market/items').then(function (value) { payload.cloud.marketItems = value; }));
    jobs.push(once('market/offers').then(function (value) { payload.cloud.marketOffers = value; }));
    jobs.push(once('eightball/asks').then(function (value) { payload.cloud.eightballAsks = value; }));
    jobs.push(once('eightball/customs').then(function (value) { payload.cloud.eightballCustoms = value; }));
    Promise.all(jobs).then(function () { download(payload); }, function () { download(payload); });
  }
  function problems(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'This file is not a Mondosupreme backup.';
    if (data.kind !== 'mondosupreme-backup' || data.version !== 1) return 'This file is not a version 1 Mondosupreme backup.';
    if (!data.local || typeof data.local !== 'object' || Array.isArray(data.local)) return 'The backup is missing its local settings.';
    var keys = Object.keys(data.local);
    for (var i = 0; i < keys.length; i++) {
      if (LOCAL_KEYS.indexOf(keys[i]) === -1) return 'Unexpected setting: ' + keys[i];
      if (typeof data.local[keys[i]] !== 'string') return 'Setting ' + keys[i] + ' is not text.';
      if (data.local[keys[i]].length > 2000000) return 'Setting ' + keys[i] + ' is too large.';
    }
    if (data.cloud != null && (typeof data.cloud !== 'object' || Array.isArray(data.cloud))) return 'The cloud section is not an object.';
    return '';
  }
  function idOk(id, pattern) {
    return typeof id === 'string' && pattern.test(id);
  }
  function restoreLocal(data) {
    Object.keys(data.local).forEach(function (key) {
      localStorage.setItem(key, data.local[key]);
    });
  }
  function stampLeader(rows) {
    var next = {};
    if (!rows || typeof rows !== 'object') return next;
    Object.keys(rows).forEach(function (id) {
      if (!rows[id] || typeof rows[id] !== 'object') return;
      next[id] = Object.assign({}, rows[id], {updatedAt: firebase.database.ServerValue.TIMESTAMP});
    });
    return next;
  }
  function restoreCloud(data) {
    var cloud = data.cloud || {};
    var updates = {};
    function putMap(path, rows, pattern) {
      if (!rows || typeof rows !== 'object') return;
      Object.keys(rows).forEach(function (id) {
        if (!idOk(id, pattern) || rows[id] == null || typeof rows[id] !== 'object') return;
        updates[path + '/' + id] = rows[id];
      });
    }
    putMap('recipes/items', cloud.recipes, /^[A-Za-z0-9_-]{1,64}$/);
    putMap('wiki/items', cloud.wiki, /^[A-Za-z0-9_-]{1,64}$/);
    putMap('guestbook/entries', cloud.guestbook, /^[A-Za-z0-9_-]{1,64}$/);
    putMap('pet/park', cloud.pet, /^[A-Za-z0-9]{1,128}$/);
    putMap('fps/leaderboard', stampLeader(cloud.fps), /^[A-Za-z0-9]{1,128}$/);
    putMap('mmo/leaderboard', stampLeader(cloud.mmo), /^[A-Za-z0-9]{1,128}$/);
    if (cloud.arcade && typeof cloud.arcade === 'object') {
      ['seas', 'kitchen', 'breaker'].forEach(function (cart) {
        putMap('arcade/scores/' + cart, cloud.arcade[cart], /^[A-Za-z0-9_-]{1,80}$/);
      });
    }
    if (cloud.forumThreads && typeof cloud.forumThreads === 'object') {
      putMap('forum/threads', cloud.forumThreads, /^[A-Za-z0-9_-]{1,80}$/);
    }
    if (cloud.forumReplies && typeof cloud.forumReplies === 'object') {
      Object.keys(cloud.forumReplies).forEach(function (tid) {
        if (!idOk(tid, /^[A-Za-z0-9_-]{1,80}$/)) return;
        putMap('forum/replies/' + tid, cloud.forumReplies[tid], /^[A-Za-z0-9_-]{1,80}$/);
      });
    }
    if (cloud.marketItems && typeof cloud.marketItems === 'object') {
      putMap('market/items', cloud.marketItems, /^[A-Za-z0-9_-]{1,80}$/);
    }
    if (cloud.eightballAsks && typeof cloud.eightballAsks === 'object') {
      putMap('eightball/asks', cloud.eightballAsks, /^[A-Za-z0-9_-]{1,80}$/);
    }
    if (cloud.eightballCustoms && typeof cloud.eightballCustoms === 'object') {
      putMap('eightball/customs', cloud.eightballCustoms, /^[A-Za-z0-9_-]{1,80}$/);
    }
    if (cloud.marketOffers && typeof cloud.marketOffers === 'object') {
      Object.keys(cloud.marketOffers).forEach(function (lid) {
        if (!idOk(lid, /^[A-Za-z0-9_-]{1,80}$/)) return;
        putMap('market/offers/' + lid, cloud.marketOffers[lid], /^[A-Za-z0-9_-]{1,80}$/);
      });
    }
    if (cloud.countdown && typeof cloud.countdown === 'object' && /^\d{9}$/.test(cloud.countdown.mmsi || '') && /^\d{4}-\d{2}-\d{2}$/.test(cloud.countdown.date || '')) {
      updates['countdown/next'] = {
        mmsi: cloud.countdown.mmsi,
        date: cloud.countdown.date,
        name: String(cloud.countdown.name || '').slice(0, 80)
      };
    }
    var keys = Object.keys(updates);
    if (!keys.length) return Promise.resolve('local');
    var chain = Promise.resolve();
    keys.forEach(function (path) {
      chain = chain.then(function () {
        return firebase.database().ref(path).set(updates[path]);
      });
    });
    return chain.then(function () { return 'cloud'; });
  }
  function closeBtn(dlg) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shell-x';
    btn.textContent = 'X Close';
    btn.setAttribute('aria-label', 'Close');
    btn.addEventListener('click', function () { dlg.close(); });
    dlg.insertBefore(btn, dlg.firstChild);
  }
  function buildDialog() {
    var dlg = document.createElement('dialog');
    dlg.id = 'shellRestore';
    dlg.className = 'shell-find';
    var title = document.createElement('h2');
    title.textContent = 'Restore Full Backup';
    var copy = document.createElement('p');
    copy.textContent = 'Choose a Mondosupreme backup file. Settings on this browser are replaced. Recipes, notes, posts, and scores on the server are restored only in Owner Mode.';
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.id = 'shellRestoreFile';
    var note = document.createElement('p');
    note.id = 'shellRestoreNote';
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'shell-tool';
    go.textContent = 'Restore';
    dlg.append(title, copy, file, note, go);
    closeBtn(dlg);
    document.body.appendChild(dlg);
    var parsed = null;
    file.addEventListener('change', function () {
      parsed = null;
      note.textContent = '';
      var picked = file.files && file.files[0];
      if (!picked) return;
      picked.text().then(function (text) {
        try { parsed = JSON.parse(text); }
        catch (e) { note.textContent = 'That file is not JSON.'; return; }
        var error = problems(parsed);
        note.textContent = error || 'Backup looks valid. Confirm to restore it.';
        if (error) parsed = null;
      });
    });
    go.addEventListener('click', function () {
      if (!parsed) { note.textContent = 'Choose a valid backup file first.'; return; }
      if (!confirm('Restore this backup on this browser?')) return;
      try { restoreLocal(parsed); }
      catch (e) { note.textContent = 'This browser blocked local storage.'; return; }
      var user = window.firebase && firebase.auth && firebase.auth().currentUser;
      if (!isOwner(user) || !bootFirebase()) {
        note.textContent = 'Restored on this browser. Sign in as the owner to write the server copy.';
        return;
      }
      restoreCloud(parsed).then(function (mode) {
        note.textContent = mode === 'cloud' ? 'Restored on this browser and on the server.' : 'Restored on this browser.';
      }).catch(function () {
        note.textContent = 'This browser was restored. The server rejected part of the file. Publish the latest database rules and try again.';
      });
    });
    return dlg;
  }
  function mount() {
    var bar = document.querySelector('.shell-bar');
    if (!bar || document.getElementById('shellBackup')) return;
    var backup = document.createElement('button');
    backup.type = 'button';
    backup.className = 'shell-tool';
    backup.id = 'shellBackup';
    backup.textContent = 'Full Site Backup';
    var restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'shell-tool';
    restore.id = 'shellRestoreBtn';
    restore.textContent = 'Restore Full Backup';
    bar.append(backup, restore);
    var dialog = null;
    backup.addEventListener('click', exportBackup);
    restore.addEventListener('click', function () {
      if (!dialog) dialog = buildDialog();
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    });
    document.addEventListener('mondo-owner', function (event) {
      backup.textContent = event.detail && event.detail.on ? 'Full Site Backup' : 'Full Site Backup';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
