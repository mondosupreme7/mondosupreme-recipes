/* 90s guestbook. Firebase when the rules allow it, this browser otherwise. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.guestbook.v1';
  var MOODS = ['chill', 'hype', 'cozy', 'wow'];
  var MOOD_LABELS = {chill: 'Chill', hype: 'Hype', cozy: 'Cozy', wow: 'Wow'};
  var STAMP_ART = {
    sun: [[6, 1, 4, 2, '#ff0'], [7, 0, 2, 1, '#ff0'], [2, 6, 2, 4, '#ff0'], [12, 6, 2, 4, '#ff0'], [4, 4, 8, 8, '#fc0'], [6, 6, 2, 2, '#000'], [9, 6, 2, 2, '#000'], [6, 10, 4, 1, '#c60']],
    alien: [[4, 2, 8, 3, '#3d3'], [3, 5, 10, 6, '#3d3'], [4, 6, 2, 2, '#000'], [10, 6, 2, 2, '#000'], [6, 11, 4, 3, '#3d3'], [5, 14, 2, 2, '#163'], [9, 14, 2, 2, '#163']],
    ship: [[2, 8, 12, 3, '#14c'], [4, 6, 8, 2, '#fff'], [6, 4, 4, 2, '#fff'], [7, 2, 2, 2, '#f33'], [1, 11, 3, 2, '#9cf'], [6, 11, 3, 2, '#9cf'], [11, 11, 3, 2, '#9cf']],
    chef: [[4, 3, 8, 3, '#fff'], [3, 5, 3, 3, '#fff'], [10, 5, 3, 3, '#fff'], [5, 8, 6, 2, '#fff'], [6, 10, 4, 4, '#eee'], [4, 14, 8, 2, '#ccc']],
    flame: [[7, 1, 2, 3, '#ff0'], [6, 4, 4, 3, '#f80'], [5, 7, 6, 4, '#f30'], [6, 11, 4, 3, '#fc0'], [7, 8, 2, 3, '#ff0']],
    cat: [[3, 2, 3, 3, '#80f'], [10, 2, 3, 3, '#80f'], [4, 4, 8, 6, '#c6f'], [5, 6, 2, 2, '#000'], [9, 6, 2, 2, '#000'], [7, 8, 2, 1, '#309'], [4, 10, 8, 3, '#80f'], [3, 12, 2, 3, '#80f'], [11, 12, 2, 3, '#80f']],
    moon: [[5, 1, 6, 2, '#fc0'], [4, 3, 5, 2, '#fd0'], [3, 5, 5, 6, '#fc0'], [4, 11, 5, 2, '#fd0'], [5, 13, 6, 2, '#fc0']],
    star: [[7, 0, 2, 5, '#fc0'], [4, 5, 8, 2, '#fd0'], [1, 6, 14, 2, '#fc0'], [3, 8, 10, 2, '#fd0'], [5, 10, 6, 2, '#fc0'], [4, 12, 3, 3, '#fd0'], [9, 12, 3, 3, '#fc0']],
    heart: [[2, 2, 5, 4, '#f46'], [9, 2, 5, 4, '#f46'], [2, 5, 12, 4, '#e23'], [4, 9, 8, 2, '#e23'], [6, 11, 4, 2, '#c12'], [7, 13, 2, 2, '#c12']],
    fish: [[1, 6, 4, 4, '#086'], [4, 5, 8, 6, '#1bd'], [11, 6, 4, 4, '#0aa'], [11, 7, 2, 2, '#012'], [6, 11, 3, 2, '#086'], [7, 4, 3, 2, '#7ef']],
    palm: [[7, 8, 2, 6, '#a62'], [6, 14, 4, 2, '#753'], [5, 1, 6, 3, '#3c6'], [2, 3, 4, 3, '#2a4'], [10, 3, 4, 3, '#2a4'], [4, 5, 8, 2, '#174'], [1, 4, 2, 2, '#3c6'], [13, 4, 2, 2, '#3c6']],
    rocket: [[7, 0, 2, 3, '#f33'], [6, 3, 4, 7, '#eee'], [7, 4, 2, 2, '#28d'], [4, 6, 2, 4, '#39c'], [10, 6, 2, 4, '#39c'], [6, 10, 4, 2, '#bbb'], [5, 12, 2, 3, '#f80'], [7, 12, 2, 4, '#ff0'], [9, 12, 2, 3, '#f60']]
  };
  var entries = [];
  var owner = false;
  var stamps = [];

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
  function cleanMood(value) {
    var text = String(value || '');
    return MOODS.indexOf(text) >= 0 ? text : '';
  }
  function cleanStamp(value) {
    var text = String(value || '');
    return stamps.indexOf(text) >= 0 ? text : 'sun';
  }
  function status(text, bad) {
    var node = $('gbStatus');
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
    node.classList.toggle('is-error', !!(text && bad));
  }
  function markInvalid(id) {
    var node = $(id);
    if (!node) return;
    node.setAttribute('aria-invalid', 'true');
    if (node.focus) node.focus();
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
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('aria-hidden', 'true');
    (STAMP_ART[kind] || STAMP_ART.sun).forEach(function (px) { rect(svg, px[0], px[1], px[2], px[3], px[4]); });
    return svg;
  }
  function stampCaption(value) {
    var found = '';
    document.querySelectorAll('#gbForm input[name="stamp"]').forEach(function (input) {
      if (input.value !== value) return;
      var span = input.parentNode && input.parentNode.querySelector('span');
      found = span ? span.textContent : 'Stamp';
    });
    return found || 'Stamp';
  }
  function syncStampName() {
    var picked = document.querySelector('#gbForm input[name="stamp"]:checked');
    var name = $('gbStampName');
    if (!name) return;
    name.textContent = picked ? stampCaption(picked.value) : 'Cool Sun';
  }
  function when(ms) {
    var time = Number(ms);
    if (!time) return '';
    try {
      return new Date(time).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
    } catch (e) {
      return '';
    }
  }
  function addMeta(parent, text) {
    if (!text) return;
    parent.appendChild(document.createTextNode(' · ' + text));
  }
  function paint() {
    var list = $('gbList');
    var clear = $('gbClear');
    var empty = $('gbEmpty');
    var count = $('gbCount');
    var sortNode = $('gbSort');
    var filterNode = $('gbFilter');
    if (!list) return;
    if (clear) clear.hidden = !owner;
    var newest = !sortNode || sortNode.value !== 'old';
    var filter = filterNode ? filterNode.value : '';
    var rows = entries.filter(function (entry) {
      return !filter || entry.stamp === filter;
    });
    rows.sort(function (a, b) {
      var delta = (a.createdAt || 0) - (b.createdAt || 0);
      return newest ? -delta : delta;
    });
    list.replaceChildren();
    rows.forEach(function (entry) {
      var card = document.createElement('article');
      card.className = 'gb-entry';
      var mark = document.createElement('div');
      mark.className = 'gb-mark';
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', stampCaption(entry.stamp));
      mark.appendChild(stampSvg(entry.stamp));
      var body = document.createElement('div');
      body.className = 'gb-body';
      var title = document.createElement('p');
      title.className = 'gb-meta';
      var strong = document.createElement('strong');
      strong.textContent = entry.name || 'Guest';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(strong, entry.author);
      title.appendChild(strong);
      var mood = cleanMood(entry.mood);
      if (mood) {
        var moodEl = document.createElement('span');
        moodEl.className = 'gb-mood-read';
        moodEl.dataset.mood = mood;
        var dot = document.createElement('i');
        dot.setAttribute('aria-hidden', 'true');
        moodEl.appendChild(dot);
        moodEl.appendChild(document.createTextNode(MOOD_LABELS[mood]));
        title.appendChild(document.createTextNode(' '));
        title.appendChild(moodEl);
      }
      addMeta(title, entry.location);
      addMeta(title, when(entry.createdAt));
      if (entry.localOnly) addMeta(title, 'this computer');
      body.appendChild(title);
      var note = document.createElement('p');
      note.className = 'gb-note';
      note.textContent = entry.note || '';
      body.appendChild(note);
      if (entry.homepage) {
        var home = document.createElement('p');
        home.className = 'gb-home';
        var link = document.createElement('a');
        link.href = entry.homepage;
        link.rel = 'noopener noreferrer';
        link.textContent = entry.homepage;
        home.appendChild(link);
        body.appendChild(home);
      }
      card.append(mark, body);
      if (owner) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn ghost gb-delete';
        del.textContent = 'Delete';
        del.addEventListener('click', function () { removeEntry(entry); });
        card.appendChild(del);
      }
      list.appendChild(card);
    });
    if (empty) {
      empty.hidden = rows.length > 0;
      empty.textContent = filter ? 'No notes with that stamp.' : 'No notes yet.';
    }
    if (count) {
      var noun = rows.length === 1 ? 'note' : 'notes';
      var next = filter ? (rows.length + ' ' + noun + ' with this stamp') : (rows.length + ' ' + noun);
      if (count.textContent !== next) count.textContent = next;
    }
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
      var value = snap.val() || {};
      var rows = Object.keys(value).map(function (id) {
        return Object.assign({id: id}, value[id]);
      });
      status('');
      merge(rows);
    }, function () {
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
  function resetForm() {
    var form = $('gbForm');
    if (form) form.reset();
    var more = $('gbMore');
    if (more) more.open = false;
    syncStampName();
    ['gbName', 'gbNote', 'gbHome', 'gbWhere'].forEach(function (id) {
      var node = $(id);
      if (node) node.removeAttribute('aria-invalid');
    });
  }
  function sign(event) {
    event.preventDefault();
    if (sign.pending) return;
    var name = cleanName($('gbName').value);
    var note = cleanNote($('gbNote').value);
    var homepage = cleanHome($('gbHome').value);
    var location = cleanWhere($('gbWhere').value);
    var moodNode = document.querySelector('#gbForm input[name="mood"]:checked');
    var mood = cleanMood(moodNode ? moodNode.value : '');
    var stampNode = document.querySelector('#gbForm input[name="stamp"]:checked');
    var stamp = cleanStamp(stampNode ? stampNode.value : 'sun');
    if (!name) {
      status('Use a name of letters, numbers, underscores, and spaces.', true);
      markInvalid('gbName');
      return;
    }
    if (!note) {
      status('Write a short note, up to 280 characters.', true);
      markInvalid('gbNote');
      return;
    }
    if (homepage == null) {
      var more = $('gbMore');
      if (more) more.open = true;
      status('A homepage has to start with https://', true);
      markInvalid('gbHome');
      return;
    }
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
    if (mood) row.mood = mood;
    function finish(message) {
      sign.pending = false;
      var button = $('gbSign');
      if (button) button.disabled = false;
      resetForm();
      var filter = $('gbFilter');
      if (filter && filter.value && filter.value !== row.stamp) {
        filter.value = '';
        paint();
      }
      status(message);
    }
    function keepLocal(message) {
      var local = readLocal();
      local.push(row);
      writeLocal(local);
      merge(entries.filter(function (item) { return !item.localOnly; }));
      finish(message);
    }
    var base = db();
    if (!base || !user) {
      keepLocal('Saved on this computer.');
      return;
    }
    sign.pending = true;
    var button = $('gbSign');
    if (button) button.disabled = true;
    var payload = {
      name: name,
      stamp: stamp,
      note: note,
      homepage: homepage,
      location: location,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      author: user.uid
    };
    if (mood) payload.mood = mood;
    var updates = {};
    updates['guestbook/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
    updates['guestbook/entries/' + row.id] = payload;
    base.ref().update(updates).then(function () {
      finish('Signed. Welcome to the book.');
    }).catch(function () {
      keepLocal('Saved on this computer until the guestbook rules are published.');
    });
  }
  function keepSignInView() {
    var note = $('gbNote');
    var signBtn = $('gbSign');
    var more = $('gbMore');
    var vv = window.visualViewport;
    if (!note || !signBtn || !vv || document.activeElement !== note || (more && more.open)) return;
    var rect = signBtn.getBoundingClientRect();
    var bottom = vv.offsetTop + vv.height;
    if (rect.bottom > bottom - 8) signBtn.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  function boot() {
    var form = $('gbForm');
    if (!form) return;
    stamps = Object.keys(STAMP_ART);
    document.querySelectorAll('#gbForm .gb-stamp').forEach(function (label) {
      var input = label.querySelector('input');
      if (!input || !STAMP_ART[input.value]) return;
      var caption = label.querySelector('span');
      label.insertBefore(stampSvg(input.value), caption || null);
    });
    var filter = $('gbFilter');
    if (filter) {
      document.querySelectorAll('#gbForm input[name="stamp"]').forEach(function (input) {
        if (stamps.indexOf(input.value) < 0) return;
        var opt = document.createElement('option');
        opt.value = input.value;
        opt.textContent = stampCaption(input.value);
        filter.appendChild(opt);
      });
      filter.addEventListener('change', paint);
    }
    var sort = $('gbSort');
    if (sort) sort.addEventListener('change', paint);
    form.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || target.name !== 'stamp') return;
      syncStampName();
      var label = target.closest ? target.closest('.gb-stamp') : null;
      if (label && label.scrollIntoView) label.scrollIntoView({inline: 'nearest', block: 'nearest'});
    });
    form.addEventListener('invalid', function (event) {
      var target = event.target;
      if (!target) return;
      event.preventDefault();
      target.setAttribute('aria-invalid', 'true');
      if (target.id === 'gbName') status('Use a name of letters, numbers, underscores, and spaces.', true);
      else if (target.id === 'gbNote') status('Write a short note, up to 280 characters.', true);
      else status('Check that field and try again.', true);
      var more = $('gbMore');
      if (more && target.closest && target.closest('#gbMore')) more.open = true;
      if (target.focus) target.focus();
    }, true);
    form.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.removeAttribute) target.removeAttribute('aria-invalid');
      if ($('gbStatus') && !$('gbStatus').hidden) status('');
    });
    form.addEventListener('submit', sign);
    var note = $('gbNote');
    if (note) {
      note.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
      });
      note.addEventListener('focus', function () {
        window.setTimeout(keepSignInView, 320);
      });
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        window.setTimeout(keepSignInView, 50);
      });
    }
    var clear = $('gbClear');
    if (clear) clear.addEventListener('click', clearAll);
    syncStampName();
    merge([]);
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (user) {
        owner = isOwner();
        if (!boot.ownerListen) {
          boot.ownerListen = true;
          document.addEventListener('mondo-owner', function () {
            var on = isOwner();
            if (on === owner) return;
            owner = on;
            paint();
          });
        }
        if (user) watch();
        else merge([]);
        paint();
      });
    } else watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
