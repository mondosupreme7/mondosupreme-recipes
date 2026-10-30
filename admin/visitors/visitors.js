(function () {
  'use strict';

  var DAY = 86400000;
  var KEEP = 90 * DAY;
  var PAGE = 40;
  var rows = [];
  var shown = PAGE;
  var admin = false;
  var pruning = false;

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function bootFirebase() {
    if (!window.firebase || !firebase.initializeApp || !window.MONDO_BOARD_CONFIG) return false;
    if (!firebase.apps.length) {
      try { firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
      catch (e) {}
    }
    return !!(firebase.apps.length && firebase.database && firebase.auth);
  }
  function etDay(ms) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(ms));
    var bag = {};
    parts.forEach(function (part) { bag[part.type] = part.value; });
    return bag.year + '-' + bag.month + '-' + bag.day;
  }
  function etStamp(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(ms));
  }
  function setStatus(text) {
    var node = document.getElementById('visitStatus');
    if (node) node.textContent = text;
  }
  function showGate(text) {
    document.getElementById('visitApp').hidden = true;
    var gate = document.getElementById('visitGate');
    gate.hidden = false;
    gate.textContent = text;
  }
  function showApp() {
    document.getElementById('visitGate').hidden = true;
    document.getElementById('visitApp').hidden = false;
  }
  function inRange(row) {
    var from = document.getElementById('visitFrom').value;
    var to = document.getElementById('visitTo').value;
    var day = etDay(row.t);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }
  function since(ms) {
    return rows.filter(function (row) { return row.t >= ms; });
  }
  function unique(list) {
    var seen = Object.create(null);
    list.forEach(function (row) { if (row.visitor) seen[row.visitor] = true; });
    return Object.keys(seen).length;
  }
  function paintChip(id, label, list) {
    var node = document.getElementById(id);
    node.replaceChildren(el('b', label), el('strong', String(list.length)), el('span', unique(list) + ' visitors'));
  }
  function topList(node, pairs) {
    node.replaceChildren();
    if (!pairs.length) {
      node.appendChild(el('li', 'None in this range.'));
      return;
    }
    pairs.slice(0, 6).forEach(function (pair) {
      var item = document.createElement('li');
      item.append(el('span', pair[0] || '—'), el('b', String(pair[1])));
      node.appendChild(item);
    });
  }
  function counts(list, field) {
    var bag = Object.create(null);
    list.forEach(function (row) {
      var key = row[field] || '—';
      bag[key] = (bag[key] || 0) + 1;
    });
    return Object.keys(bag).map(function (key) { return [key, bag[key]]; })
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
  }
  function paint() {
    var now = Date.now();
    var todayKey = etDay(now);
    paintChip('chipToday', 'Today', rows.filter(function (row) { return etDay(row.t) === todayKey; }));
    paintChip('chipWeek', '7 days', since(now - 7 * DAY));
    paintChip('chipMonth', '30 days', since(now - 30 * DAY));
    var filtered = rows.filter(inRange).sort(function (a, b) { return b.t - a.t; });
    topList(document.getElementById('topPages'), counts(filtered, 'path'));
    topList(document.getElementById('topRefs'), counts(filtered, 'ref'));
    topList(document.getElementById('topPlaces'), counts(filtered, 'place'));
    var devices = document.getElementById('topDevices');
    devices.replaceChildren();
    [['Devices', counts(filtered, 'device')], ['Browsers', counts(filtered, 'client')]].forEach(function (group) {
      devices.appendChild(el('li', group[0]));
      (group[1].slice(0, 4)).forEach(function (pair) {
        var item = document.createElement('li');
        item.append(el('span', pair[0] || '—'), el('b', String(pair[1])));
        devices.appendChild(item);
      });
      if (!group[1].length) devices.appendChild(el('li', 'None in this range.'));
    });
    var list = document.getElementById('visitRows');
    list.replaceChildren();
    var slice = filtered.slice(0, shown);
    if (!slice.length) list.appendChild(el('p', 'No visits in this range.', 'visit-note'));
    slice.forEach(function (row) {
      var line = [etStamp(row.t), row.path || '—', row.place || '—', row.device || '—', row.client || ''].filter(Boolean).join(' · ');
      if (row.name) line += ' · ' + row.name;
      list.appendChild(el('p', line, 'visit-row'));
    });
    var more = document.getElementById('visitMore');
    more.hidden = filtered.length <= shown;
    more.textContent = 'Show more (' + Math.max(0, filtered.length - shown) + ' left)';
  }
  function normalize(id, value) {
    if (!value || typeof value !== 'object' || typeof value.t !== 'number') return null;
    return {
      id: id,
      t: value.t,
      path: String(value.path || ''),
      ref: String(value.ref || ''),
      client: String(value.client || ''),
      device: String(value.device || ''),
      screen: String(value.screen || ''),
      lang: String(value.lang || ''),
      place: String(value.place || ''),
      visitor: String(value.visitor || ''),
      name: String(value.name || '')
    };
  }
  function prune(manual) {
    if (!admin || pruning) return Promise.resolve(0);
    var cutoff = Date.now() - KEEP;
    var old = rows.filter(function (row) { return row.t < cutoff; });
    if (!old.length) {
      if (manual) setStatus('Nothing is older than 90 days.');
      return Promise.resolve(0);
    }
    pruning = true;
    var updates = {};
    old.forEach(function (row) { updates[row.id] = null; });
    return firebase.database().ref('visits').update(updates).then(function () {
      var drop = Object.create(null);
      old.forEach(function (row) { drop[row.id] = true; });
      rows = rows.filter(function (row) { return !drop[row.id]; });
      pruning = false;
      setStatus('Removed ' + old.length + ' log' + (old.length === 1 ? '' : 's') + ' older than 90 days.');
      paint();
      return old.length;
    }, function () {
      pruning = false;
      setStatus('Old logs stayed put. Publish the latest database rules, then try again.');
      return 0;
    });
  }
  function load() {
    return firebase.database().ref('visits').once('value').then(function (snap) {
      rows = [];
      snap.forEach(function (child) {
        var row = normalize(child.key, child.val());
        if (row) rows.push(row);
      });
      showApp();
      paint();
      return prune(false);
    }, function () {
      showApp();
      setStatus('The visit log could not be read. Publish the latest database rules, then reload.');
    });
  }
  function confirmAdmin() {
    if (!bootFirebase()) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      var timer = setTimeout(function () { finish(false); }, 2500);
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user || user.isAnonymous) return;
        clearTimeout(timer);
        firebase.database().ref('admins/' + user.uid).once('value').then(function (snap) {
          var still = firebase.auth().currentUser;
          finish(!!(still && still.uid === user.uid && snap.val() === true));
        }, function () { finish(false); });
      });
    });
  }
  function defaults() {
    var today = etDay(Date.now());
    var from = etDay(Date.now() - 30 * DAY);
    document.getElementById('visitFrom').value = from;
    document.getElementById('visitTo').value = today;
  }
  document.getElementById('yr').textContent = String(new Date().getFullYear());
  defaults();
  document.getElementById('visitApply').addEventListener('click', function () {
    shown = PAGE;
    paint();
  });
  document.getElementById('visitMore').addEventListener('click', function () {
    shown += PAGE;
    paint();
  });
  document.getElementById('visitClear').addEventListener('click', function () {
    if (!admin) return;
    if (!confirm('Clear visit logs older than 90 days?')) return;
    prune(true);
  });
  showGate('Checking access…');
  confirmAdmin().then(function (ok) {
    admin = ok;
    if (!ok) {
      showGate('Admins only');
      return;
    }
    load();
  });
})();
