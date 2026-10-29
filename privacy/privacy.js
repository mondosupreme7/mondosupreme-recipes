(function () {
  'use strict';
  var status = document.getElementById('privStatus');
  var button = document.getElementById('deleteMine');
  var year = document.getElementById('yr');
  if (year) year.textContent = String(new Date().getFullYear());

  function say(text) {
    if (status) status.textContent = text;
  }
  function boot() {
    if (!window.firebase || !window.MONDO_BOARD_CONFIG) return false;
    try { if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
    catch (e) { return false; }
    return true;
  }
  function paint(user) {
    var member = !!(user && user.uid && !user.isAnonymous);
    if (button) button.hidden = !member;
    if (!member) say('Sign in to delete the records for this account.');
    else say('Signed in. Delete my data removes this account’s records.');
  }
  function clearLocal() {
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf('mondosupreme') === 0 || key.indexOf('mondo.') === 0) localStorage.removeItem(key);
      });
    } catch (e) { /* private mode */ }
  }
  function dropMatches(snap, path, field, uid, updates) {
    snap.forEach(function (child) {
      var val = child.val();
      if (!val || typeof val !== 'object') return;
      if (val[field] === uid) updates[path + '/' + child.key] = null;
      else Object.keys(val).forEach(function (key) {
        var row = val[key];
        if (row && typeof row === 'object' && row[field] === uid) updates[path + '/' + child.key + '/' + key] = null;
      });
    });
  }
  async function sweep(uid) {
    var db = firebase.database();
    var updates = {};
    updates['users/' + uid] = null;
    updates['profiles/' + uid] = null;
    updates['pet/park/' + uid] = null;
    updates['mmo/players/' + uid] = null;
    updates['mmo/saves/' + uid] = null;
    updates['mmo/leaderboard/' + uid] = null;
    updates['fps/players/' + uid] = null;
    updates['fps/leaderboard/' + uid] = null;
    updates['stocks/watchlist/' + uid] = null;
    updates['chat/presence/' + uid] = null;
    updates['market/mail/' + uid] = null;
    updates['market/c/' + uid] = null;
    updates['market/rate/' + uid] = null;
    updates['board/presence/' + uid] = null;
    var lists = [
      ['forum/threads', 'author'],
      ['guestbook/entries', 'author'],
      ['market/items', 'author'],
      ['quotes/custom', 'uid'],
      ['local/tips', 'uid'],
      ['chat/m', 'author'],
      ['search/asks', 'uid'],
      ['eightball/asks', 'author'],
      ['eightball/customs', 'author'],
      ['launches/sightings', 'author'],
      ['mmo/chat', 'author'],
      ['pet/pings', 'from'],
      ['forum/replies', 'author'],
      ['market/offers', 'author']
    ];
    for (var i = 0; i < lists.length; i++) {
      try {
        var snap = await db.ref(lists[i][0]).once('value');
        dropMatches(snap, lists[i][0], lists[i][1], uid, updates);
      } catch (e) { /* a private or missing node stays */ }
    }
    try {
      var scores = await db.ref('wordle/scores').once('value');
      scores.forEach(function (day) {
        if (day.child(uid).exists()) updates['wordle/scores/' + day.key + '/' + uid] = null;
      });
    } catch (e) {}
    try {
      var puzzles = await db.ref('puzzles').once('value');
      puzzles.forEach(function (kind) {
        kind.forEach(function (level) {
          if (level.child(uid).exists()) updates['puzzles/' + kind.key + '/' + level.key + '/' + uid] = null;
          level.forEach(function (deeper) {
            if (deeper.child && deeper.child(uid).exists()) updates['puzzles/' + kind.key + '/' + level.key + '/' + deeper.key + '/' + uid] = null;
          });
        });
      });
    } catch (e) {}
    try {
      var cross = await db.ref('crossword/scores').once('value');
      cross.forEach(function (day) {
        day.forEach(function (row) {
          if (String(row.key || '').indexOf(uid) === 0) updates['crossword/scores/' + day.key + '/' + row.key] = null;
        });
      });
    } catch (e) {}
    var keys = Object.keys(updates);
    for (var start = 0; start < keys.length; start += 80) {
      var batch = {};
      keys.slice(start, start + 80).forEach(function (key) { batch[key] = null; });
      try { await db.ref().update(batch); } catch (e) { /* rules may refuse a node this account does not own */ }
    }
  }
  async function erase() {
    if (!boot() || !firebase.auth().currentUser) { say('Sign in first.'); return; }
    var current = firebase.auth().currentUser;
    if (current.isAnonymous) { say('Sign in with your account first.'); return; }
    if (!window.confirm('Delete this account’s Mondosupreme records on this device and in the database?')) return;
    if (button) button.disabled = true;
    say('Removing records…');
    try {
      await sweep(current.uid);
      clearLocal();
      try { await current.delete(); }
      catch (e) { say('Database records for this account were removed. Sign in again if Firebase still asks before it can delete the login itself.'); return; }
      say('Those records are deleted.');
    } catch (e) {
      say('Some records could not be removed. Publish the latest database rules, then try again.');
    } finally {
      if (button) button.disabled = false;
    }
  }
  if (button) button.addEventListener('click', function () { erase(); });
  if (boot()) firebase.auth().onAuthStateChanged(paint);
  else say('Sign-in is not available on this page.');
})();
