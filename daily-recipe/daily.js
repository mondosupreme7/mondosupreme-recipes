/* MondoTV '98. Today's show is a function of the viewer's calendar date. */
(function () {
  'use strict';
  var OWNER = 'cbrooks_911@yahoo.com';
  var RECIPE_KEY = 'mondosupreme.recipes.v1';
  var GROCERY_KEY = 'mondosupreme.grocery.v1';
  var ID_RE = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  var pool = [];
  var ring = [];
  var feature = null;
  var rotation = {};
  var current = null;
  var currentIndex = 0;
  var mode = 'today';
  var archiveDate = '';
  var fetchedAt = '';

  function $(id) { return document.getElementById(id); }
  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function localISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function todayISO() { return localISO(new Date()); }
  function shiftDate(iso, days) {
    var parts = iso.split('-');
    var utc = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    utc.setUTCDate(utc.getUTCDate() + days);
    return utc.getUTCFullYear() + '-' + pad(utc.getUTCMonth() + 1) + '-' + pad(utc.getUTCDate());
  }
  function dayNumber(iso) {
    var parts = iso.split('-');
    return Math.floor(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000);
  }
  function pickIndex(iso, count) {
    if (!count) return 0;
    var n = dayNumber(iso);
    return ((n % count) + count) % count;
  }
  function linesOf(value) {
    if (Array.isArray(value)) return value.map(function (line) { return String(line || '').trim(); }).filter(Boolean);
    return String(value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }
  function clip(value, max) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  }
  function videoFromRow(row) {
    if (!row || !/^[A-Za-z0-9_-]{11}$/.test(row.videoId || '')) return null;
    var id = row.videoId;
    return {
      videoId: id,
      title: clip(row.title, 180) || id,
      channel: clip(row.channel, 80),
      handle: clip(row.handle, 80),
      published: /^\d{4}-\d{2}-\d{2}$/.test(row.published || '') ? row.published : '',
      thumbnail: /^https:\/\/i\.ytimg\.com\/\S+$/.test(row.thumbnail || '') ? row.thumbnail : ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'),
      youtube: 'https://www.youtube.com/watch?v=' + id,
      ingredients: linesOf(row.ingredients).slice(0, 40),
      steps: linesOf(row.steps).slice(0, 24),
      blurb: clip(row.blurb, 600)
    };
  }
  function rebuildRing() {
    var byId = {};
    pool.forEach(function (row) {
      var video = videoFromRow(row);
      if (video) byId[video.videoId] = video;
    });
    Object.keys(rotation || {}).forEach(function (id) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      var extra = videoFromRow(Object.assign({ videoId: id }, rotation[id] || {}));
      if (!extra) return;
      if (!byId[id] || (extra.ingredients.length && !byId[id].ingredients.length)) byId[id] = extra;
    });
    ring = Object.keys(byId).sort().map(function (id) { return byId[id]; });
  }
  function featuredToday() {
    if (!feature || feature.date !== todayISO()) return null;
    return videoFromRow(feature);
  }
  function videoForDate(iso) {
    if (iso === todayISO()) {
      var picked = featuredToday();
      if (picked) return picked;
    }
    if (!ring.length) return null;
    return ring[pickIndex(iso, ring.length)];
  }
  function channelLabel(index) {
    if (index < 0) return 'CH ★';
    return 'CH ' + pad(((index % 98) + 2));
  }
  function indexOf(video) {
    if (!video) return -1;
    for (var i = 0; i < ring.length; i++) if (ring[i].videoId === video.videoId) return i;
    return -1;
  }
  function setText(id, text) {
    var node = $(id);
    if (node) node.textContent = text;
  }
  function fillList(id, items, empty) {
    var node = $(id);
    if (!node) return;
    node.replaceChildren();
    if (!items.length) {
      var li = document.createElement('li');
      li.textContent = empty;
      node.appendChild(li);
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      node.appendChild(li);
    });
  }
  function show(video, label, index) {
    if (!video) return;
    current = video;
    currentIndex = index == null ? indexOf(video) : index;
    mode = label;
    var frame = $('player');
    var src = 'https://www.youtube-nocookie.com/embed/' + video.videoId + '?rel=0';
    if (frame && frame.src.indexOf(video.videoId) === -1) frame.src = src;
    setText('channelReadout', channelLabel(currentIndex));
    setText('showTitle', video.title);
    var bits = [video.channel || 'YouTube', video.published ? 'published ' + video.published : ''].filter(Boolean);
    setText('showMeta', bits.join(' · '));
    var watch = $('watch');
    if (watch) watch.href = video.youtube;
    fillList('ingredients', video.ingredients, 'No ingredient list in the description. The method is in the video.');
    var steps = video.steps.length ? video.steps : ['Watch the full method in the video.'];
    fillList('steps', steps, '');
    var note = $('blurb');
    if (note) {
      note.hidden = !video.blurb;
      note.textContent = video.blurb ? 'From the chef: ' + video.blurb : '';
    }
    var back = $('backToday');
    if (back) back.hidden = label === 'today';
    paintArchive();
  }
  function showToday() {
    archiveDate = todayISO();
    var video = videoForDate(archiveDate);
    show(video, 'today', video ? indexOf(video) : 0);
  }
  function paintArchive() {
    var list = $('archive');
    if (!list) return;
    list.replaceChildren();
    var today = todayISO();
    for (var i = 0; i < 30; i++) {
      var iso = shiftDate(today, -i);
      var video = videoForDate(iso);
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.date = iso;
      if (mode !== 'surf' && archiveDate === iso) btn.setAttribute('aria-current', 'true');
      var time = document.createElement('time');
      time.dateTime = iso;
      time.textContent = iso;
      btn.appendChild(time);
      btn.appendChild(document.createTextNode(' ' + (video ? video.title : 'No show')));
      if (i === 0 && featuredToday()) btn.appendChild(document.createTextNode(' (webmaster\'s pick)'));
      btn.addEventListener('click', function (event) {
        var date = event.currentTarget.dataset.date;
        archiveDate = date;
        var pick = videoForDate(date);
        show(pick, date === todayISO() ? 'today' : 'archive', pick ? indexOf(pick) : 0);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  }
  function step(delta) {
    if (!ring.length) return;
    var next = currentIndex < 0 ? (delta > 0 ? 0 : ring.length - 1) : (currentIndex + delta + ring.length) % ring.length;
    archiveDate = '';
    show(ring[next], 'surf', next);
  }
  function surprise() {
    if (ring.length < 2) return;
    var next = currentIndex;
    var guard = 0;
    while (next === currentIndex && guard < 8) {
      next = Math.floor(Math.random() * ring.length);
      guard += 1;
    }
    archiveDate = '';
    show(ring[next], 'surf', next);
  }
  function loadRecipes() {
    try {
      var data = JSON.parse(localStorage.getItem(RECIPE_KEY));
      if (Array.isArray(data)) return data;
    } catch (e) { /* start a new box */ }
    return [];
  }
  function saveToCookbook() {
    if (!current) return;
    var id = 'yt_' + current.videoId;
    var recipes = loadRecipes();
    var exists = recipes.some(function (recipe) { return recipe && recipe.id === id; });
    if (!exists) {
      var tags = ['youtube', 'mondotv'];
      var slug = String(current.channel || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
      if (slug) tags.push(slug);
      recipes.unshift({
        id: id,
        title: clip(current.title, 200),
        category: 'Dinner',
        photo: current.thumbnail,
        servings: '',
        prep: 0,
        cook: 0,
        ingredients: current.ingredients.slice(0, 80),
        steps: (current.steps.length ? current.steps : ['Watch the full method on YouTube: ' + current.youtube]).slice(0, 40),
        notes: ('MondoTV \'98 · ' + (current.channel || 'YouTube') + (current.published ? ' · ' + current.published : '') + '\n' + current.youtube + (current.blurb ? '\n' + current.blurb : '')).replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000),
        tags: tags,
        author: '',
        createdAt: 0
      });
      localStorage.setItem(RECIPE_KEY, JSON.stringify(recipes));
    }
    location.href = '/recipes/#/recipe/' + encodeURIComponent(id);
  }
  function addGrocery() {
    if (!current) return;
    if (!current.ingredients.length) {
      setText('actionStatus', 'No ingredients were listed in the description, so the grocery list was left as it is.');
      return;
    }
    var data = { items: [] };
    try {
      var saved = JSON.parse(localStorage.getItem(GROCERY_KEY));
      if (saved && Array.isArray(saved.items)) data = saved;
    } catch (e) { /* new list */ }
    var added = 0;
    current.ingredients.forEach(function (line, index) {
      var text = clip(line, 120);
      if (!text) return;
      var dup = data.items.some(function (item) {
        return item && !item.checked && String(item.text || '').toLowerCase() === text.toLowerCase();
      });
      if (dup) return;
      data.items.push({
        id: 'yt' + current.videoId + index.toString(36),
        text: text,
        checked: false,
        recipeId: 'yt_' + current.videoId,
        recipeTitle: clip(current.title, 200),
        custom: false
      });
      added += 1;
    });
    localStorage.setItem(GROCERY_KEY, JSON.stringify(data));
    setText('actionStatus', added ? 'Added ' + added + ' ingredient' + (added === 1 ? '' : 's') + ' to the grocery list.' : 'Those ingredients were already on the grocery list.');
  }
  function paintFresh() {
    var when = fetchedAt ? fetchedAt.replace('T', ' ').replace('Z', ' UTC') : 'the last saved pool';
    setText('fresh', ring.length + ' videos in the pool. Snapshot ' + when + '. Today\'s show follows this browser\'s calendar date.');
    setText('airDate', todayISO());
  }
  function render() {
    rebuildRing();
    paintFresh();
    if (mode === 'surf' && ring[currentIndex]) show(ring[currentIndex], 'surf', currentIndex);
    else if (mode === 'archive' && archiveDate) show(videoForDate(archiveDate), 'archive', indexOf(videoForDate(archiveDate)));
    else showToday();
  }
  function bootFirebase() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG) return false;
    try { if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
    catch (e) { return false; }
    return true;
  }
  function watchCloud() {
    if (!bootFirebase()) return;
    firebase.auth().onAuthStateChanged(function (user) {
      var box = $('ownerBox');
      var isOwner = !!(user && user.email && user.email.toLowerCase() === ownerEmail());
      if (box) box.hidden = !isOwner;
    });
    firebase.database().ref('dailyRecipe').on('value', function (snap) {
      var val = snap.val() || {};
      feature = val.feature || null;
      rotation = val.rotation || {};
      render();
    }, function () {
      setText('ownerStatus', 'Firebase rules for /dailyRecipe are not published yet. The file pool still plays.');
    });
  }
  function videoIdFrom(url) {
    var match = String(url || '').match(ID_RE);
    return match ? match[1] : '';
  }
  function lookupOembed(id) {
    return fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id))
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }
  function recordFrom(id, meta) {
    var known = ring.filter(function (video) { return video.videoId === id; })[0];
    var title = clip($('ytTitle').value || (meta && meta.title) || (known && known.title) || 'YouTube recipe', 140);
    return {
      videoId: id,
      title: title,
      channel: clip((meta && meta.author_name) || (known && known.channel) || 'YouTube', 80),
      published: (known && known.published) || '',
      ingredients: ((known && known.ingredients) || []).join('\n').slice(0, 8000),
      steps: ((known && known.steps) || ['Watch the full method in the video.']).join('\n').slice(0, 8000),
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      youtube: 'https://www.youtube.com/watch?v=' + id,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
  }
  function saveOverride(action, id) {
    return lookupOembed(id).then(function (meta) {
      if (meta && meta.title && !$('ytTitle').value) $('ytTitle').value = clip(meta.title, 140);
      var body = recordFrom(id, meta);
      if (action === 'feature') {
        body.date = todayISO();
        return firebase.database().ref('dailyRecipe/feature').set(body);
      }
      delete body.videoId;
      return firebase.database().ref('dailyRecipe/rotation/' + id).set(body);
    });
  }
  function bind() {
    $('chMinus').addEventListener('click', function () { step(-1); });
    $('chPlus').addEventListener('click', function () { step(1); });
    $('surprise').addEventListener('click', surprise);
    $('backToday').addEventListener('click', showToday);
    $('saveRecipe').addEventListener('click', saveToCookbook);
    $('addGrocery').addEventListener('click', addGrocery);
    var form = $('ownerForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var submitter = event.submitter || document.activeElement;
      var action = submitter && submitter.value === 'rotate' ? 'rotate' : 'feature';
      var id = videoIdFrom($('ytUrl').value);
      if (!id) {
        setText('ownerStatus', 'That does not look like a YouTube video URL.');
        return;
      }
      if (!bootFirebase()) {
        setText('ownerStatus', 'Firebase is not available on this page.');
        return;
      }
      setText('ownerStatus', 'Saving…');
      saveOverride(action, id).then(function () {
        setText('ownerStatus', action === 'feature' ? 'Today\'s show is now that video.' : 'Added to the rotation.');
      }).catch(function () {
        setText('ownerStatus', 'Could not write /dailyRecipe. Publish the rules in board/database.rules.json, then try again.');
      });
    });
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  function loadPool() {
    var bust = Math.floor(Date.now() / 600000);
    return fetch('daily.json?t=' + bust).then(function (res) {
      if (!res.ok) throw new Error('pool');
      return res.json();
    }).then(function (data) {
      pool = Array.isArray(data.videos) ? data.videos : [];
      fetchedAt = data.fetchedAt || '';
      render();
    }).catch(function () {
      setText('fresh', 'The recipe pool could not be loaded.');
    });
  }
  bind();
  loadPool();
  watchCloud();
})();
