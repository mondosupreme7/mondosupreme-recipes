(function () {
  function forward() {
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    if (search.length > 1 || hash.length > 1) {
      window.location.replace('/recipes/' + search + hash);
      return true;
    }
    return false;
  }
  if (forward()) return;
  window.addEventListener('hashchange', forward);
  var HITS = 'mondosupreme.hits.v1';
  var SHARED = 'mondosupreme.hits.shared';
  var SESSION = 'mondosupreme.hits.visit';
  var BASE = 8421;
  var ON = '#ff3333';
  var OFF = '#4a0000';
  var SEGS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
  };
  function digit(ch) {
    var on = SEGS[ch] || '';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 22 40');
    svg.setAttribute('aria-hidden', 'true');
    var parts = [
      ['a', '3', '2', '16', '5'],
      ['b', '16', '6', '4', '13'],
      ['c', '16', '21', '4', '13'],
      ['d', '3', '33', '16', '5'],
      ['e', '2', '21', '4', '13'],
      ['f', '2', '6', '4', '13'],
      ['g', '3', '17.5', '16', '5']
    ];
    parts.forEach(function (p) {
      var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', p[1]);
      r.setAttribute('y', p[2]);
      r.setAttribute('width', p[3]);
      r.setAttribute('height', p[4]);
      r.setAttribute('fill', on.indexOf(p[0]) >= 0 ? ON : OFF);
      svg.appendChild(r);
    });
    return svg;
  }
  function paintCounter(n) {
    var box = document.getElementById('counter');
    if (!box) return;
    var text = String(n);
    if (text.length < 6) text = ('000000' + text).slice(-6);
    box.setAttribute('aria-label', String(n) + ' site-wide visits');
    box.setAttribute('title', 'Live site-wide visitor count');
    box.replaceChildren();
    for (var i = 0; i < text.length; i++) box.appendChild(digit(text.charAt(i)));
  }
  function readNum(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null || raw === '') return null;
      var n = parseInt(raw, 10);
      return n >= 0 && n <= 100000000 ? n : null;
    } catch (e) { return null; }
  }
  function writeNum(key, n) {
    try { localStorage.setItem(key, String(n)); } catch (e) {}
  }
  function visited() {
    try { return sessionStorage.getItem(SESSION) === '1'; } catch (e) { return false; }
  }
  function markVisited() {
    try { sessionStorage.setItem(SESSION, '1'); } catch (e) {}
  }
  function localTotal() {
    var seen = readNum(HITS);
    return BASE + (seen == null ? 0 : seen);
  }
  function paintCached() {
    var shared = readNum(SHARED);
    paintCounter(shared == null ? localTotal() : shared);
  }
  function denied(err) {
    var code = String((err && err.code) || '') + ' ' + String((err && err.message) || '');
    return /PERMISSION_DENIED|permission[-_ ]denied/i.test(code);
  }
  var fellBack = false;
  var listening = false;
  function useLocalFallback() {
    if (fellBack) return;
    fellBack = true;
    var shared = readNum(SHARED);
    if (shared == null && !visited()) {
      var seen = readNum(HITS);
      seen = (seen == null ? 0 : seen) + 1;
      writeNum(HITS, seen);
      markVisited();
    }
    paintCached();
  }
  function configured() {
    var c = window.MONDO_BOARD_CONFIG;
    return !!(c && c.apiKey && c.authDomain && c.databaseURL && c.projectId && c.appId);
  }
  function watchHits() {
    if (listening) return;
    listening = true;
    var bumped = false;
    var ref = firebase.database().ref('hits/total');
    ref.on('value', function (snap) {
      var n = snap.val();
      if (typeof n !== 'number' || n < 0) n = 0;
      writeNum(SHARED, Math.floor(n));
      paintCounter(Math.floor(n));
      if (!bumped && !visited()) {
        bumped = true;
        countVisit();
      }
    }, function (err) {
      if (denied(err)) useLocalFallback();
      else paintCached();
    });
  }
  function countVisit() {
    var user = firebase.auth().currentUser;
    if (!user) return;
    var uid = user.uid;
    var tries = 0;
    function once() {
      firebase.database().ref('hits/total').once('value').then(function (snap) {
        var cur = snap.val();
        var next = (typeof cur === 'number' && cur >= 0 ? Math.floor(cur) : 0) + 1;
        var updates = {};
        updates['hits/total'] = next;
        updates['hits/rate/' + uid] = firebase.database.ServerValue.TIMESTAMP;
        return firebase.database().ref().update(updates);
      }).then(function () {
        markVisited();
      }).catch(function (err) {
        if (denied(err) || tries >= 4) {
          markVisited();
          return;
        }
        tries += 1;
        setTimeout(once, 250 * tries);
      });
    }
    once();
  }
  function connectHits() {
    if (typeof firebase === 'undefined' || !configured()) {
      useLocalFallback();
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
    } catch (e) {
      useLocalFallback();
      return;
    }
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        firebase.auth().signInAnonymously().catch(function () { useLocalFallback(); });
        return;
      }
      watchHits();
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var year = document.getElementById('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    paintCached();
    connectHits();
    var ring = ['/recipes/', '/cruises/', '/wiki/', '/board/', '/chat/', '/escape/'];
    var rand = document.getElementById('ringRand');
    if (rand) rand.href = ring[Math.floor(Math.random() * ring.length)];
  });
})();
