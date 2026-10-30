/* Marketplace classifieds. Firebase when the rules allow it, this browser otherwise. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.market.v1';
  var PHOTO_MAX = 70000;
  var PHOTO_RULE = 80000;
  var DAY_MS = 86400000;
  var NEW_MS = 2 * DAY_MS;
  var RATE_MS = 6000;
  var DAILY = 24;
  var CATS = {
    electronics: 'Electronics',
    home: 'Home & Kitchen',
    collectibles: 'Collectibles & Toys',
    outdoors: 'Outdoors & Fishing',
    boats: 'Boats & Marine',
    cruise: 'Cruise & Travel',
    clothing: 'Clothing',
    free: 'Free',
    misc: 'Misc'
  };
  var CAT_MAP = { tech: 'electronics', toys: 'collectibles', home: 'home', cruise: 'cruise', misc: 'misc' };
  var CONDITIONS = { new: 'New', like: 'Like new', good: 'Good', fair: 'Fair', parts: 'For parts' };
  var COND_MAP = { new: 'new', mint: 'like', good: 'good', parts: 'parts', fair: 'fair', like: 'like' };
  var NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ ]{0,23}$/;
  var PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  var ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

  var $ = function (sel) { return document.querySelector(sel); };
  var cache = load();
  var user = null;
  var isOwner = false;
  var readsOk = false;
  var rulesBlocked = false;
  var mailBlocked = false;
  var listenedUid = '';
  var mailUid = '';
  var posting = false;
  var anonTimer = 0;
  var query = '';
  var cat = 'all';
  var sort = 'newest';
  var cond = 'all';
  var priceMin = '';
  var priceMax = '';
  var serverItems = null;
  var serverOffers = null;
  var inbox = {};
  var gotItems = false;
  var gotOffers = false;
  var step = 1;
  var photoDraft = [];

  function isAdminNow() {
    return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
  }
  function denied(err) {
    return /PERMISSION_DENIED|permission[-_ ]denied/i.test(String(err && (err.code || err.message) || ''));
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    if (!data.items || typeof data.items !== 'object' || Array.isArray(data.items)) data.items = {};
    if (!data.offers || typeof data.offers !== 'object' || Array.isArray(data.offers)) data.offers = {};
    if (!data.mail || typeof data.mail !== 'object' || Array.isArray(data.mail)) data.mail = {};
    if (!data.quota || typeof data.quota !== 'object') data.quota = { n: 0, day: 0 };
    data.name = typeof data.name === 'string' ? data.name : '';
    data.seeded = !!data.seeded;
    data.lastPost = Number(data.lastPost) || 0;
    return data;
  }
  function save() {
    try {
      var raw = JSON.stringify(cache);
      if (raw.length > 1800000) return false;
      localStorage.setItem(KEY, raw);
      return true;
    } catch (e) { return false; }
  }
  function canonCat(value) {
    if (Object.prototype.hasOwnProperty.call(CATS, value)) return value;
    if (Object.prototype.hasOwnProperty.call(CAT_MAP, value)) return CAT_MAP[value];
    return 'misc';
  }
  function canonCond(value) {
    if (Object.prototype.hasOwnProperty.call(COND_MAP, value)) return COND_MAP[value];
    return 'good';
  }
  function statusOf(item) {
    if (!item) return 'active';
    if (item.status === 'sold' || item.status === 'pending' || item.status === 'active') return item.status;
    return item.sold ? 'sold' : 'active';
  }
  function photosOf(item) {
    var list = [];
    function push(raw) {
      var safe = safePhoto(raw);
      if (safe && list.indexOf(safe) === -1 && list.length < 4) list.push(safe);
    }
    if (item && item.photos) {
      if (Array.isArray(item.photos)) item.photos.forEach(push);
      else if (typeof item.photos === 'object') ['0', '1', '2', '3'].forEach(function (key) { push(item.photos[key]); });
    }
    if (item) push(item.photo);
    return list;
  }
  function scrubItem(item) {
    if (!item || typeof item !== 'object') return item;
    delete item.contact;
    item.category = canonCat(item.category);
    item.condition = canonCond(item.condition);
    item.status = statusOf(item);
    item.sold = item.status === 'sold';
    var photos = photosOf(item);
    item.photos = photos;
    item.photo = photos[0] || '';
    return item;
  }
  function swatch(label, color) {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 360;
      var ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return '';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 360, 360);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 180, 180);
      var data = canvas.toDataURL('image/jpeg', 0.72);
      return data.length <= PHOTO_MAX && PHOTO_RE.test(data) ? data : '';
    } catch (e) { return ''; }
  }
  function sample(id, fields) {
    var photos = fields.photo ? [fields.photo] : [];
    return scrubItem({
      id: id,
      title: fields.title,
      price: fields.price,
      condition: fields.condition,
      category: fields.category,
      location: fields.location,
      description: fields.description,
      seller: fields.seller,
      photo: photos[0] || '',
      photos: photos,
      author: 'local',
      createdAt: fields.createdAt,
      updatedAt: fields.createdAt,
      sold: !!fields.sold,
      status: fields.sold ? 'sold' : 'active',
      featured: !!fields.featured,
      official: false,
      localOnly: true,
      sample: true
    });
  }
  function seed() {
    var walkman = cache.items['sample-walkman'];
    var retiredSeller = String.fromCharCode(114, 101, 116, 114, 111, 99, 111, 100, 121);
    if (walkman && String(walkman.seller || '').toLowerCase() === retiredSeller) walkman.seller = 'Mondosupreme';
    if (cache.seeded) return;
    cache.seeded = true;
    var now = Date.now();
    if (!cache.items['sample-walkman']) {
      cache.items['sample-walkman'] = sample('sample-walkman', {
        title: 'Sony Walkman WM-FX195',
        price: 2499,
        condition: 'good',
        category: 'electronics',
        location: 'Cocoa, ships in a bubble mailer',
        description: 'Yellow sports Walkman. It still rewinds, it still eats AA batteries, and the radio hiss is part of the charm.',
        seller: 'Mondosupreme',
        photo: swatch('Walkman', '#0f766e'),
        createdAt: now - 5 * DAY_MS,
        featured: true
      });
    }
    if (!cache.items['sample-pogs']) {
      cache.items['sample-pogs'] = sample('sample-pogs', {
        title: 'Tube of milk-cap pogs',
        price: 350,
        condition: 'like',
        category: 'collectibles',
        location: 'Merritt Island, pickup',
        description: 'A full tube of milk caps, slammer included. Colors from a 1995 school cafeteria.',
        seller: 'PogKid',
        photo: swatch('Pogs', '#b45309'),
        createdAt: now - 2 * 60 * 60 * 1000,
        featured: false
      });
    }
    if (!cache.items['sample-binoculars']) {
      cache.items['sample-binoculars'] = sample('sample-binoculars', {
        title: 'Deck binoculars, sold on the last sailing',
        price: 4000,
        condition: 'good',
        category: 'cruise',
        location: 'Port Canaveral',
        description: 'A sample of a finished sale. Questions close when a listing is marked sold.',
        seller: 'HarborDesk',
        photo: swatch('Sold', '#1e3a8a'),
        createdAt: now - 9 * DAY_MS,
        sold: true
      });
    }
    save();
  }
  function scrubAll() {
    Object.keys(cache.items).forEach(function (id) {
      if (cache.items[id]) scrubItem(cache.items[id]);
    });
    Object.keys(cache.mail).forEach(function (id) {
      var row = cache.mail[id];
      if (!row || !row.localOnly) delete cache.mail[id];
    });
    save();
  }
  function cleanName(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return NAME_RE.test(text) ? text : '';
  }
  function cleanLine(value, max) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  }
  function cleanBody(value, max) {
    return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
  }
  function cleanCat(value) { return Object.prototype.hasOwnProperty.call(CATS, value) ? value : ''; }
  function cleanCondition(value) { return Object.prototype.hasOwnProperty.call(CONDITIONS, value) ? value : ''; }
  function parsePrice(raw) {
    var text = String(raw || '').replace(/[$,\s]/g, '');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
    var cents = Math.round(Number(text) * 100);
    if (!isFinite(cents) || cents < 0 || cents > 100000000) return null;
    return cents;
  }
  function formatPriceInput(raw) {
    var text = String(raw || '').replace(/[^\d.]/g, '');
    var parts = text.split('.');
    var dollars = parts[0].replace(/^0+(?=\d)/, '').slice(0, 7);
    if (!dollars && parts.length > 1) dollars = '0';
    if (parts.length === 1) return dollars;
    return dollars + '.' + parts.slice(1).join('').slice(0, 2);
  }
  function formatMoney(cents) {
    var n = Number(cents);
    if (!isFinite(n)) n = 0;
    if (n === 0) return 'Free';
    return '$' + (n / 100).toFixed(2);
  }
  function safeHttps(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 500) return '';
    var url;
    try { url = new URL(raw); } catch (e) { return ''; }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return '';
    return url.href;
  }
  function safePhoto(raw) {
    if (typeof raw !== 'string' || raw.length > PHOTO_RULE) return '';
    if (!raw) return '';
    if (PHOTO_RE.test(raw)) return raw;
    return safeHttps(raw);
  }
  function when(ms) {
    var t = Number(ms);
    if (!t) return '';
    try { return new Date(t).toLocaleString(); } catch (e) { return ''; }
  }
  function ago(ms) {
    var t = Number(ms);
    if (!t) return '';
    var delta = Date.now() - t;
    if (delta < 60000) return 'Just now';
    var mins = Math.floor(delta / 60000);
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs === 1 ? '1 hour ago' : hrs + ' hours ago';
    var days = Math.floor(hrs / 24);
    if (days < 14) return days === 1 ? '1 day ago' : days + ' days ago';
    try { return new Date(t).toLocaleDateString(); } catch (e) { return ''; }
  }
  function makeId() {
    var prefix = user && user.uid ? String(user.uid).replace(/[^A-Za-z0-9]/g, '').slice(0, 28) : 'local';
    return (prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  }
  function offerBag(id) {
    var bag = cache.offers[id];
    return bag && typeof bag === 'object' ? bag : {};
  }
  function offerCount(id) {
    var bag = offerBag(id);
    return Object.keys(bag).filter(function (key) { return bag[key] && bag[key].body; }).length;
  }
  function toast(text) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  function showBanner() {
    rulesBlocked = true;
    var el = $('#syncBanner');
    if (el) el.hidden = false;
  }
  function hideBanner() {
    rulesBlocked = false;
    var el = $('#syncBanner');
    if (el) el.hidden = true;
  }
  function formError(text) {
    var el = $('#formError');
    if (!el) return false;
    el.textContent = text || '';
    el.hidden = !text;
    return false;
  }
  function photoEl(src, alt, className, lazy) {
    var safe = safePhoto(src);
    if (!safe) {
      var ph = document.createElement('div');
      ph.className = (className || 'lot-photo') + ' lot-ph';
      ph.setAttribute('role', 'img');
      ph.setAttribute('aria-label', 'No photo');
      ph.textContent = 'No photo';
      return ph;
    }
    var img = document.createElement('img');
    img.className = className || 'lot-photo';
    img.alt = alt || 'Listing photo';
    img.loading = lazy === false ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.src = safe;
    return img;
  }
  function chip(text, cls) {
    var el = document.createElement('span');
    el.className = 'chip' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  }
  function chipsFor(item, parent) {
    var wrap = document.createElement('span');
    wrap.className = 'chips';
    wrap.appendChild(chip(CONDITIONS[canonCond(item.condition)] || 'Good'));
    var status = statusOf(item);
    if (status === 'sold') wrap.appendChild(chip('Sold', 'sold'));
    else if (status === 'pending') wrap.appendChild(chip('Pending'));
    else if (Date.now() - Number(item.createdAt || 0) < NEW_MS) wrap.appendChild(chip('New'));
    if (item.featured) wrap.appendChild(chip('Featured'));
    if (item.official) wrap.appendChild(chip('Official'));
    parent.appendChild(wrap);
  }
  function fillText(el, text) {
    var src = String(text || '');
    var re = /https:\/\/[^\s<>"']+/g;
    var last = 0;
    var match;
    while ((match = re.exec(src))) {
      el.appendChild(document.createTextNode(src.slice(last, match.index)));
      var raw = match[0].replace(/[.,);]+$/, '');
      var href = safeHttps(raw);
      if (href) {
        var link = document.createElement('a');
        link.href = href;
        link.rel = 'noopener noreferrer nofollow ugc';
        link.textContent = raw;
        el.appendChild(link);
        if (match[0].length > raw.length) el.appendChild(document.createTextNode(match[0].slice(raw.length)));
      } else el.appendChild(document.createTextNode(match[0]));
      last = match.index + match[0].length;
    }
    el.appendChild(document.createTextNode(src.slice(last)));
  }
  function route() {
    var hash = location.hash || '#/';
    var edit = hash.match(/^#\/edit\/([A-Za-z0-9_-]{1,80})$/);
    var item = hash.match(/^#\/item\/([A-Za-z0-9_-]{1,80})$/);
    if (hash === '#/new') return { view: 'new' };
    if (edit) return { view: 'edit', id: edit[1] };
    if (item) return { view: 'item', id: item[1] };
    return { view: 'list' };
  }
  function boundCents(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;
    var parsed = parsePrice(text);
    return parsed == null ? null : parsed;
  }
  function visibleItems() {
    var q = query.trim().toLowerCase();
    var min = boundCents(priceMin);
    var max = boundCents(priceMax);
    return Object.keys(cache.items).map(function (id) {
      var item = cache.items[id];
      if (!item || !item.title) return null;
      item.id = id;
      return item;
    }).filter(function (item) {
      if (!item) return false;
      var category = canonCat(item.category);
      var condition = canonCond(item.condition);
      if (cat !== 'all' && category !== cat) return false;
      if (cond !== 'all' && condition !== cond) return false;
      var price = Number(item.price) || 0;
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
      if (!q) return true;
      var blob = [item.title, item.description, item.seller, item.location, CATS[category] || ''].join(' ').toLowerCase();
      return blob.indexOf(q) !== -1;
    }).sort(function (a, b) {
      if (sort === 'low') return (Number(a.price) || 0) - (Number(b.price) || 0) || b.createdAt - a.createdAt;
      if (sort === 'high') return (Number(b.price) || 0) - (Number(a.price) || 0) || b.createdAt - a.createdAt;
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.createdAt - a.createdAt;
    });
  }
  function paintRows() {
    var body = $('#rows');
    var empty = $('#empty');
    var skeleton = $('#skeleton');
    if (!body) return;
    var items = visibleItems();
    var sig = items.map(function (item) {
      return item.id + ':' + item.price + ':' + statusOf(item) + ':' + (item.featured ? 1 : 0);
    }).join('|') + '|' + query + '|' + cat + '|' + sort + '|' + cond + '|' + priceMin + '|' + priceMax;
    if (skeleton) {
      skeleton.hidden = true;
      skeleton.setAttribute('aria-busy', 'false');
    }
    if (paintRows.sig === sig) {
      empty.hidden = items.length > 0;
      return;
    }
    paintRows.sig = sig;
    body.textContent = '';
    empty.hidden = items.length > 0;
    var any = Object.keys(cache.items).some(function (id) { return cache.items[id] && cache.items[id].title; });
    var title = $('#emptyTitle');
    var copy = $('#emptyCopy');
    if (title) title.textContent = any ? 'Nothing matches those filters' : 'Nothing in the marketplace yet';
    if (copy) copy.textContent = any ? 'Clear the search, pick another category, or widen the price range.' : 'Be the first to post a photo and a price.';
    items.forEach(function (item) {
      var card = document.createElement('a');
      card.className = 'lot-card' + (statusOf(item) === 'sold' ? ' sold' : '');
      card.href = '#/item/' + encodeURIComponent(item.id);
      card.appendChild(photoEl(photosOf(item)[0], item.title, 'lot-photo', true));
      var info = document.createElement('div');
      info.className = 'lot-body';
      var price = document.createElement('p');
      price.className = 'lot-price';
      price.textContent = formatMoney(item.price);
      var name = document.createElement('p');
      name.className = 'lot-title';
      name.textContent = item.title;
      info.appendChild(price);
      info.appendChild(name);
      chipsFor(item, info);
      if (item.location) {
        var place = document.createElement('p');
        place.className = 'lot-place';
        place.textContent = item.location;
      info.appendChild(place);
      }
      var time = document.createElement('time');
      time.className = 'lot-time';
      if (item.createdAt) time.dateTime = new Date(Number(item.createdAt)).toISOString();
      time.textContent = ago(item.createdAt);
      info.appendChild(time);
      card.appendChild(info);
      body.appendChild(card);
    });
  }
  function showList() {
    $('#listView').hidden = false;
    $('#detailView').hidden = true;
    $('#formView').hidden = true;
    paintRows();
  }
  function ownsItem(item) {
    return !!(user && item && item.author && item.author === user.uid);
  }
  function ownerButtons(parent, item) {
    var own = ownsItem(item);
    if (!isOwner && !own) return;
    var bar = document.createElement('div');
    bar.className = 'owner-tools';
    function btn(act, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.setAttribute('data-act', act);
      b.setAttribute('data-id', item.id);
      b.textContent = label;
      bar.appendChild(b);
    }
    var status = statusOf(item);
    btn('edit', 'Edit');
    if (status === 'pending') btn('pending', 'Mark as available');
    else btn('pending', 'Mark as pending');
    if (status === 'sold') btn('sold', 'Mark as available');
    else btn('sold', 'Mark as sold');
    btn('delete', 'Delete');
    if (isOwner) btn('feature', item.featured ? 'Unfeature' : 'Feature');
    parent.appendChild(bar);
  }
  function metaLine(list, label, value) {
    var row = document.createElement('div');
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.appendChild(value);
    row.appendChild(dt);
    row.appendChild(dd);
    list.appendChild(row);
  }
  function mailRows(lid) {
    var map = {};
    Object.keys(cache.mail || {}).forEach(function (id) {
      var row = cache.mail[id];
      if (row && row.localOnly && row.lid === lid && row.body) map[id] = Object.assign({ id: id }, row);
    });
    Object.keys(inbox).forEach(function (id) {
      var row = inbox[id];
      if (row && row.lid === lid && row.body) map[id] = Object.assign({ id: id, localOnly: false }, row);
    });
    return Object.keys(map).map(function (id) { return map[id]; }).sort(function (a, b) {
      return Number(a.createdAt) - Number(b.createdAt);
    });
  }
  function detailSig(id) {
    var item = cache.items[id] || {};
    var mail = mailRows(id);
    return [item.updatedAt, statusOf(item), item.price, item.title, offerCount(id), mail.length, mail.map(function (row) { return row.id; }).join(',')].join('|');
  }
  function gallery(item) {
    var photos = photosOf(item);
    var box = document.createElement('div');
    box.className = 'gallery';
    var track = document.createElement('div');
    track.className = 'gallery-track';
    track.setAttribute('data-i', '0');
    if (!photos.length) {
      var slide = document.createElement('div');
      slide.className = 'gallery-slide';
      slide.appendChild(photoEl('', item.title, 'detail-photo', false));
      track.appendChild(slide);
      box.appendChild(track);
      return box;
    }
    photos.forEach(function (src, index) {
      var slide = document.createElement('div');
      slide.className = 'gallery-slide';
      slide.appendChild(photoEl(src, item.title + ' photo ' + (index + 1), 'detail-photo', index > 0));
      track.appendChild(slide);
    });
    box.appendChild(track);
    if (photos.length < 2) return box;
    var index = 0;
    function go(delta) {
      index = (index + delta + photos.length) % photos.length;
      track.setAttribute('data-i', String(index));
      box.querySelectorAll('.dots button').forEach(function (dot, i) {
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn gal-btn gal-prev';
    prev.setAttribute('aria-label', 'Previous photo');
    prev.textContent = '‹';
    prev.addEventListener('click', function () { go(-1); });
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn gal-btn gal-next';
    next.setAttribute('aria-label', 'Next photo');
    next.textContent = '›';
    next.addEventListener('click', function () { go(1); });
    box.appendChild(prev);
    box.appendChild(next);
    var dots = document.createElement('div');
    dots.className = 'dots';
    photos.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Photo ' + (i + 1));
      if (i === 0) dot.setAttribute('aria-current', 'true');
      dot.addEventListener('click', function () { go(i - index); });
      dots.appendChild(dot);
    });
    box.appendChild(dots);
    var startX = 0;
    box.addEventListener('touchstart', function (event) {
      if (!event.changedTouches || !event.changedTouches[0]) return;
      startX = event.changedTouches[0].clientX;
    }, { passive: true });
    box.addEventListener('touchend', function (event) {
      if (!event.changedTouches || !event.changedTouches[0]) return;
      var dx = event.changedTouches[0].clientX - startX;
      if (dx > 40) go(-1);
      else if (dx < -40) go(1);
    }, { passive: true });
    return box;
  }
  function showDetail(id, force) {
    var view = $('#detailView');
    var sig = detailSig(id);
    if (!force && view.dataset.id === id && view.dataset.sig === sig && !view.hidden) {
      $('#listView').hidden = true;
      $('#formView').hidden = true;
      return;
    }
    var item = cache.items[id];
    $('#listView').hidden = true;
    $('#formView').hidden = true;
    view.hidden = false;
    view.dataset.id = id;
    view.dataset.sig = sig;
    view.textContent = '';
    var back = document.createElement('div');
    back.className = 'detail-nav';
    var backLink = document.createElement('a');
    backLink.className = 'btn ghost';
    backLink.href = '#/';
    backLink.textContent = 'Back to listings';
    var share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn';
    share.setAttribute('data-act', 'share');
    share.setAttribute('data-id', id);
    share.textContent = 'Share';
    back.appendChild(backLink);
    back.appendChild(share);
    view.appendChild(back);
    if (!item) {
      var missing = document.createElement('p');
      missing.textContent = 'That listing is gone.';
      view.appendChild(missing);
      return;
    }
    item.id = id;
    view.appendChild(gallery(item));
    var title = document.createElement('h2');
    title.textContent = item.title;
    view.appendChild(title);
    chipsFor(item, view);
    var price = document.createElement('p');
    price.className = 'detail-price';
    price.textContent = formatMoney(item.price);
    view.appendChild(price);
    var list = document.createElement('dl');
    list.className = 'meta';
    metaLine(list, 'Category', CATS[canonCat(item.category)] || 'Misc');
    var sellerNode = document.createElement('span');
    sellerNode.textContent = item.seller || '';
    if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(sellerNode, item.author);
    metaLine(list, 'Seller', sellerNode);
    metaLine(list, 'Location', item.location || 'Not listed');
    metaLine(list, 'Posted', when(item.createdAt));
    if (item.updatedAt && item.updatedAt !== item.createdAt) metaLine(list, 'Updated', when(item.updatedAt));
    view.appendChild(list);
    var desc = document.createElement('div');
    desc.className = 'desc';
    fillText(desc, item.description || '');
    view.appendChild(desc);
    ownerButtons(view, item);
    paintQa(view, item);
    paintMail(view, item);
  }
  function paintQa(view, item) {
    var id = item.id;
    var qa = document.createElement('section');
    qa.className = 'qa';
    var heading = document.createElement('h3');
    heading.textContent = 'Questions';
    qa.appendChild(heading);
    var list = document.createElement('div');
    list.className = 'qa-list';
    var offers = Object.keys(offerBag(id)).map(function (oid) {
      var row = offerBag(id)[oid];
      if (!row || !row.body) return null;
      row.id = oid;
      return row;
    }).filter(Boolean).sort(function (a, b) { return Number(a.createdAt) - Number(b.createdAt); });
    if (!offers.length) {
      var none = document.createElement('p');
      none.textContent = 'No questions yet. Ask one below, or send a private message.';
      list.appendChild(none);
    }
    offers.forEach(function (row) {
      var card = document.createElement('article');
      card.className = 'qa-card';
      var head = document.createElement('header');
      var kind = document.createElement('span');
      kind.className = 'qa-kind';
      kind.textContent = row.kind === 'offer' ? 'Offer' : 'Question';
      var who = document.createElement('strong');
      who.textContent = row.name || 'Guest';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(who, row.author);
      var time = document.createElement('time');
      if (row.createdAt) time.dateTime = new Date(Number(row.createdAt)).toISOString();
      time.textContent = when(row.createdAt);
      head.appendChild(kind);
      head.appendChild(who);
      head.appendChild(time);
      var body = document.createElement('p');
      fillText(body, row.body);
      card.appendChild(head);
      card.appendChild(body);
      if (isOwner || (user && row.author === user.uid)) {
        var tools = document.createElement('div');
        tools.className = 'owner-tools';
        [['edit-offer', 'Edit'], ['delete-offer', 'Delete']].forEach(function (pair) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn';
          b.setAttribute('data-act', pair[0]);
          b.setAttribute('data-id', row.id);
          b.setAttribute('data-extra', id);
          b.textContent = pair[1];
          tools.appendChild(b);
        });
        card.appendChild(tools);
      }
      list.appendChild(card);
    });
    qa.appendChild(list);
    if (statusOf(item) === 'sold') {
      var note = document.createElement('p');
      note.className = 'sold-note';
      note.textContent = 'This listing is sold.';
      qa.appendChild(note);
    } else {
      var form = document.createElement('form');
      form.id = 'offerForm';
      var nameLabel = document.createElement('label');
      nameLabel.appendChild(document.createTextNode('Your name'));
      var nameInput = document.createElement('input');
      nameInput.id = 'offerName';
      nameInput.maxLength = 24;
      nameInput.autocomplete = 'nickname';
      nameInput.value = cache.name || '';
      nameInput.required = true;
      nameLabel.appendChild(nameInput);
      var kindLabel = document.createElement('label');
      kindLabel.appendChild(document.createTextNode('This is a'));
      var kindSelect = document.createElement('select');
      kindSelect.id = 'offerKind';
      [['question', 'Question'], ['offer', 'Offer']].forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        kindSelect.appendChild(opt);
      });
      kindLabel.appendChild(kindSelect);
      var bodyLabel = document.createElement('label');
      bodyLabel.appendChild(document.createTextNode('Question or offer'));
      var bodyInput = document.createElement('textarea');
      bodyInput.id = 'offerBody';
      bodyInput.maxLength = 400;
      bodyInput.rows = 3;
      bodyInput.required = true;
      bodyLabel.appendChild(bodyInput);
      var err = document.createElement('p');
      err.id = 'offerError';
      err.className = 'owner-error';
      err.hidden = true;
      var actions = document.createElement('div');
      actions.className = 'form-actions';
      var submit = document.createElement('button');
      submit.className = 'btn primary';
      submit.type = 'submit';
      submit.id = 'offerBtn';
      submit.textContent = 'Post question';
      actions.appendChild(submit);
      form.appendChild(nameLabel);
      form.appendChild(kindLabel);
      form.appendChild(bodyLabel);
      form.appendChild(err);
      form.appendChild(actions);
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitOffer(id);
      });
      qa.appendChild(form);
    }
    view.appendChild(qa);
  }
  function paintMail(view, item) {
    var section = document.createElement('section');
    section.className = 'mail';
    var heading = document.createElement('h3');
    heading.textContent = 'Private messages';
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = mailBlocked
      ? 'Private messages stay on this device until the database rules are published.'
      : 'Only you and the other person can read these. They are not on the public listing.';
    section.appendChild(heading);
    section.appendChild(note);
    var rows = mailRows(item.id);
    var list = document.createElement('div');
    list.className = 'mail-list';
    if (!rows.length && user && item.author === user.uid) {
      var wait = document.createElement('p');
      wait.textContent = 'When a buyer messages you, the note shows up here.';
      list.appendChild(wait);
    }
    rows.forEach(function (row) {
      var card = document.createElement('article');
      card.className = 'mail-card';
      var head = document.createElement('header');
      var who = document.createElement('strong');
      who.textContent = row.name || 'Message';
      var time = document.createElement('time');
      if (row.createdAt) time.dateTime = new Date(Number(row.createdAt)).toISOString();
      time.textContent = when(row.createdAt);
      head.appendChild(who);
      head.appendChild(time);
      var body = document.createElement('p');
      body.textContent = row.body;
      card.appendChild(head);
      card.appendChild(body);
      list.appendChild(card);
    });
    section.appendChild(list);
    if (statusOf(item) === 'sold') {
      var sold = document.createElement('p');
      sold.className = 'sold-note';
      sold.textContent = 'This listing is sold, so new messages are closed.';
      section.appendChild(sold);
    } else if (!user) {
      var sign = document.createElement('p');
      sign.textContent = 'A private message is available once sign-in finishes. You can also ask in the public questions.';
      section.appendChild(sign);
    } else if (item.author !== user.uid) {
      section.appendChild(mailForm(item, user.uid, item.author));
    } else if (rows.length) {
      var buyers = {};
      rows.forEach(function (row) { if (row.buyer && row.buyer !== user.uid) buyers[row.buyer] = true; });
      Object.keys(buyers).forEach(function (buyer) {
        section.appendChild(mailForm(item, buyer, user.uid, 'Reply'));
      });
    }
    view.appendChild(section);
  }
  function mailForm(item, buyer, seller, label) {
    var form = document.createElement('form');
    form.className = 'mail-form';
    form.dataset.buyer = buyer;
    form.dataset.seller = seller;
    var nameLabel = document.createElement('label');
    nameLabel.appendChild(document.createTextNode('Your name'));
    var nameInput = document.createElement('input');
    nameInput.maxLength = 24;
    nameInput.autocomplete = 'nickname';
    nameInput.value = cache.name || (item.author === (user && user.uid) ? item.seller : '') || '';
    nameLabel.appendChild(nameInput);
    var bodyLabel = document.createElement('label');
    bodyLabel.appendChild(document.createTextNode(label || 'Message the seller'));
    var bodyInput = document.createElement('textarea');
    bodyInput.maxLength = 400;
    bodyInput.rows = 3;
    bodyInput.required = true;
    bodyLabel.appendChild(bodyInput);
    var err = document.createElement('p');
    err.className = 'owner-error';
    err.hidden = true;
    var actions = document.createElement('div');
    actions.className = 'form-actions';
    var submit = document.createElement('button');
    submit.className = 'btn primary';
    submit.type = 'submit';
    submit.textContent = label || 'Send private message';
    actions.appendChild(submit);
    form.appendChild(nameLabel);
    form.appendChild(bodyLabel);
    form.appendChild(err);
    form.appendChild(actions);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitMail(item.id, buyer, seller, nameInput.value, bodyInput.value, err);
    });
    return form;
  }
  function setTabs() {
    document.querySelectorAll('#catTabs button').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-cat') === cat ? 'true' : 'false');
    });
  }
  function showStep(n) {
    step = n;
    document.querySelectorAll('#itemForm .step').forEach(function (el) {
      el.hidden = el.getAttribute('data-step') !== String(n);
    });
    var labels = ['Details', 'Price', 'Photos', 'Preview'];
    var label = $('#stepLabel');
    if (label) label.textContent = 'Step ' + n + ' of 4 · ' + labels[n - 1];
    $('#stepBack').hidden = n === 1;
    $('#stepNext').hidden = n === 4;
    $('#postBtn').hidden = n !== 4;
    if (n === 4) paintPreview();
  }
  function validateStep(n) {
    if (n === 1) {
      if (!cleanLine($('#postTitle').value, 80)) return formError('Add a title, up to 80 characters.');
      if (!cleanCat($('#postCat').value)) return formError('Pick a category.');
      if (!cleanCondition($('#postCondition').value)) return formError('Pick a condition.');
      if (!cleanBody($('#postBody').value, 2000)) return formError('Add a description.');
    }
    if (n === 2) {
      if (parsePrice($('#postPrice').value) == null) return formError('Enter a price from $0.00 to $1,000,000.00. Use 0 for free.');
      if (!cleanName($('#postSeller').value)) return formError('Seller name should start with a letter or number. Letters, numbers, underscores, and spaces, up to 24 characters.');
    }
    formError('');
    return true;
  }
  function paintPhotoStrip() {
    var strip = $('#photoStrip');
    var preview = $('#photoPreview');
    if (!strip) return;
    strip.textContent = '';
    photoDraft.forEach(function (src, index) {
      var thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.appendChild(photoEl(src, 'Photo ' + (index + 1), 'thumb', true));
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove photo ' + (index + 1));
      remove.addEventListener('click', function () {
        photoDraft.splice(index, 1);
        paintPhotoStrip();
      });
      thumb.appendChild(remove);
      strip.appendChild(thumb);
    });
    if (preview) {
      if (photoDraft[0]) {
        preview.src = photoDraft[0];
        preview.alt = 'Selected photo';
        preview.hidden = false;
      } else {
        preview.removeAttribute('src');
        preview.hidden = true;
      }
    }
  }
  function addDraft(src) {
    var safe = safePhoto(src);
    if (!safe) return false;
    if (photoDraft.length >= 4) {
      formError('Four photos is the limit.');
      return false;
    }
    if (safe.length > PHOTO_RULE) {
      formError('That photo is too big to store. Try a smaller one.');
      return false;
    }
    photoDraft.push(safe);
    formError('');
    paintPhotoStrip();
    return true;
  }
  function paintPreview() {
    var box = $('#preview');
    if (!box) return;
    var fields = fieldsFromForm(true);
    box.textContent = '';
    if (!fields) return;
    if (photoDraft[0]) box.appendChild(photoEl(photoDraft[0], fields.title, 'detail-photo', false));
    var title = document.createElement('h3');
    title.textContent = fields.title;
    var price = document.createElement('p');
    price.className = 'detail-price';
    price.textContent = formatMoney(fields.price);
    var meta = document.createElement('p');
    meta.textContent = [CONDITIONS[fields.condition], CATS[fields.category], fields.seller, fields.location].filter(Boolean).join(' · ');
    var desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = fields.description;
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = photoDraft.length ? photoDraft.length + ' photo' + (photoDraft.length === 1 ? '' : 's') + ' ready.' : 'No photo yet. You can still post.';
    box.appendChild(title);
    box.appendChild(price);
    box.appendChild(meta);
    box.appendChild(desc);
    box.appendChild(note);
  }
  function showForm(id, force) {
    var painted = id || 'new';
    if (!force && $('#formView').dataset.painted === painted && !$('#formView').hidden) {
      $('#listView').hidden = true;
      $('#detailView').hidden = true;
      return;
    }
    var existing = id ? cache.items[id] : null;
    if (id && (!existing || !(isOwner || ownsItem(existing)))) {
      location.hash = existing ? '#/item/' + id : '#/';
      return;
    }
    $('#listView').hidden = true;
    $('#detailView').hidden = true;
    $('#formView').hidden = false;
    $('#formView').dataset.painted = painted;
    $('#formTitle').textContent = existing ? 'Edit listing' : 'Post an item';
    $('#postBtn').textContent = existing ? 'Save listing' : 'Post item';
    $('#itemForm').dataset.id = existing ? existing.id : '';
    $('#postTitle').value = existing ? existing.title : '';
    $('#postPrice').value = existing ? (Number(existing.price) / 100).toFixed(2) : '';
    $('#postCondition').value = existing ? canonCond(existing.condition) : '';
    $('#postCat').value = existing ? canonCat(existing.category) : '';
    $('#postSeller').value = existing ? existing.seller : (cache.name || '');
    $('#postLocation').value = existing ? (existing.location || '') : '';
    $('#postBody').value = existing ? existing.description : '';
    $('#photoUrl').value = '';
    $('#photoFile').value = '';
    photoDraft = existing ? photosOf(existing).slice(0, 4) : [];
    formError('');
    setPhotoNote('');
    paintPrice();
    paintPhotoStrip();
    showStep(1);
  }
  function setPhotoNote(text) {
    var note = $('#photoNote');
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || '';
  }
  function paintPrice() {
    var el = $('#priceReadout');
    if (!el) return;
    var cents = parsePrice($('#postPrice').value);
    el.textContent = cents == null ? '' : formatMoney(cents);
  }
  function drawJpeg(img, edge, quality) {
    var scale = Math.min(1, edge / Math.max(img.width, img.height, 1));
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    try { return canvas.toDataURL('image/jpeg', quality); } catch (e) { return ''; }
  }
  function shrinkFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('photo')); };
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var edge = 720;
          var quality = 0.72;
          var data = '';
          var i;
          for (i = 0; i < 12; i++) {
            data = drawJpeg(img, edge, quality);
            if (data && data.length <= PHOTO_MAX && PHOTO_RE.test(data)) {
              resolve(data);
              return;
            }
            if (quality > 0.42) quality = Math.round((quality - 0.1) * 100) / 100;
            else edge = Math.max(160, Math.round(edge * 0.75));
            if (edge <= 160 && quality <= 0.42) break;
          }
          reject(new Error('photo'));
        };
        img.onerror = function () { reject(new Error('photo')); };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }
  function fieldsFromForm(silent) {
    var title = cleanLine($('#postTitle').value, 80);
    if (!title) return silent ? null : formError('Add a title, up to 80 characters.');
    var price = parsePrice($('#postPrice').value);
    if (price == null) return silent ? null : formError('Enter a price from $0.00 to $1,000,000.00. Use 0 for free.');
    var condition = cleanCondition($('#postCondition').value);
    if (!condition) return silent ? null : formError('Pick a condition.');
    var category = cleanCat($('#postCat').value);
    if (!category) return silent ? null : formError('Pick a category.');
    var seller = cleanName($('#postSeller').value);
    if (!seller) return silent ? null : formError('Seller name should start with a letter or number. Letters, numbers, underscores, and spaces, up to 24 characters.');
    var location = cleanLine($('#postLocation').value, 80);
    var description = cleanBody($('#postBody').value, 2000);
    if (!description) return silent ? null : formError('Add a description.');
    if (!silent) formError('');
    return { title: title, price: price, condition: condition, category: category, seller: seller, location: location, description: description, photos: photoDraft.slice(0, 4) };
  }
  function dayStamp() { return Math.floor(Date.now() / DAY_MS) * DAY_MS; }
  function takeQuota() {
    var day = dayStamp();
    var q = cache.quota || { n: 0, day: 0 };
    var n = q.day === day ? Number(q.n) + 1 : 1;
    if (!isOwner && n > DAILY) {
      var err = new Error('Daily limit reached (24 listings and questions).');
      err.code = 'quota';
      throw err;
    }
    var wait = RATE_MS - (Date.now() - (cache.lastPost || 0));
    return { n: n, day: day, wait: !isOwner && wait > 0 ? wait : 0 };
  }
  function rememberQuota(q) {
    cache.lastPost = Date.now();
    if (!q || isOwner) return;
    cache.quota = { n: q.n, day: q.day };
  }
  function baseRecord(fields, existing) {
    var photos = (fields.photos || []).slice(0, 4);
    var status = existing ? statusOf(existing) : 'active';
    return scrubItem({
      id: existing ? existing.id : makeId(),
      title: fields.title,
      price: fields.price,
      condition: fields.condition,
      category: fields.category,
      location: fields.location,
      description: fields.description,
      seller: fields.seller,
      photo: photos[0] || '',
      photos: photos,
      author: existing && existing.author ? existing.author : (user ? user.uid : 'local'),
      createdAt: existing && existing.createdAt ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      sold: status === 'sold',
      status: status,
      featured: existing ? !!existing.featured : false,
      official: existing ? !!existing.official : !!isOwner,
      localOnly: true,
      pendingSync: !existing || !existing.sample,
      sample: existing ? !!existing.sample : false
    });
  }
  function wirePayload(record, quota, fresh) {
    var photos = {};
    photosOf(record).forEach(function (src, index) { photos[String(index)] = src; });
    var status = statusOf(record);
    var payload = {
      title: record.title,
      price: record.price,
      condition: canonCond(record.condition),
      category: canonCat(record.category),
      location: record.location || '',
      description: record.description,
      seller: record.seller,
      photo: photos['0'] || '',
      photos: photos,
      status: status,
      author: record.author,
      createdAt: fresh ? firebase.database.ServerValue.TIMESTAMP : record.createdAt,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      sold: status === 'sold',
      featured: !!record.featured,
      official: !!record.official
    };
    if (quota) {
      payload.seq = quota.n;
      payload.day = quota.day;
      payload.sold = false;
      payload.status = 'active';
      payload.featured = false;
      payload.official = false;
    }
    return payload;
  }
  async function serverQuota() {
    var day = dayStamp();
    var n = 1;
    var snap = await firebase.database().ref('market/c/' + user.uid).once('value');
    var cur = snap.val();
    if (cur && cur.day === day) n = Number(cur.n) + 1;
    if (n > DAILY) {
      var err = new Error('Daily limit reached (24 listings and questions).');
      err.code = 'quota';
      throw err;
    }
    var wait = RATE_MS - (Date.now() - (cache.lastPost || 0));
    if (wait > 0) await sleep(wait);
    return { n: n, day: day };
  }
  async function rulesMissing() {
    try {
      await firebase.database().ref('market/items').limitToFirst(1).once('value');
      return false;
    } catch (e) { return denied(e); }
  }
  function keepLocal(record) {
    cache.items[record.id] = record;
    var kept = save();
    toast(kept ? (rulesBlocked ? 'Saved on this device until Firebase rules are published.' : 'Saved on this device.') : 'This browser is full. Remove an older photo listing.');
  }
  async function submitItem(event) {
    event.preventDefault();
    if (posting) return;
    if (step < 4) {
      if (!validateStep(step)) return;
      showStep(step + 1);
      return;
    }
    var fields = fieldsFromForm();
    if (!fields) { showStep(1); return; }
    var editing = $('#itemForm').dataset.id || '';
    var existing = editing ? cache.items[editing] : null;
    if (editing && (!existing || !(isOwner || ownsItem(existing)))) { formError('Only the seller can edit this listing.'); return; }
    if (fields.photos.some(function (src) { return src && src.length > PHOTO_RULE; })) {
      formError('That photo is too big to store. Try a smaller one.');
      return;
    }
    posting = true;
    $('#postBtn').disabled = true;
    try {
      cache.name = fields.seller;
      if (existing && !existing.localOnly && readsOk && user) {
        await patchItem(existing.id, fields);
        location.hash = '#/item/' + existing.id;
        return;
      }
      var record = baseRecord(fields, existing);
      if (existing && existing.sample) record.sample = true;
      if (!readsOk || !user || record.sample || (existing && existing.localOnly)) {
        if (!existing) {
          var localQuota = takeQuota();
          if (localQuota.wait) await sleep(localQuota.wait);
          rememberQuota(localQuota);
        }
        record.pendingSync = !record.sample;
        keepLocal(record);
        location.hash = '#/item/' + record.id;
        return;
      }
      var quota = isOwner ? null : await serverQuota();
      record.author = user.uid;
      record.official = !!isOwner;
      var updates = {};
      updates['market/items/' + record.id] = wirePayload(record, quota, true);
      if (!isOwner) {
        updates['market/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
        updates['market/c/' + user.uid] = { n: quota.n, day: quota.day };
      }
      await firebase.database().ref().update(updates);
      record.localOnly = false;
      record.pendingSync = false;
      cache.items[record.id] = record;
      rememberQuota(quota);
      if (!save()) toast('Posted online. This browser could not keep a copy.');
      else toast('Posted.');
      location.hash = '#/item/' + record.id;
    } catch (err) {
      if (err && err.code === 'quota') { formError(err.message); return; }
      if (denied(err) && await rulesMissing()) {
        showBanner();
        readsOk = false;
        var fallback = baseRecord(fields, existing);
        if (!existing) {
          try { rememberQuota(takeQuota()); } catch (e) { formError(e.message); return; }
        }
        keepLocal(fallback);
        location.hash = '#/item/' + fallback.id;
        return;
      }
      if (denied(err)) {
        showBanner();
        var local = baseRecord(fields, existing);
        if (!existing) {
          try {
            var q = takeQuota();
            if (q.wait) await sleep(q.wait);
            rememberQuota(q);
          } catch (e) { formError(e.message); return; }
        }
        keepLocal(local);
        location.hash = '#/item/' + local.id;
        return;
      }
      formError('Could not post. Wait a few seconds and try again.');
    } finally {
      posting = false;
      var btn = $('#postBtn');
      if (btn) btn.disabled = false;
    }
  }
  async function submitOffer(lid) {
    if (posting) return;
    var item = cache.items[lid];
    var errEl = $('#offerError');
    if (!item || statusOf(item) === 'sold') { toast('This listing is sold.'); return; }
    var name = cleanName($('#offerName').value);
    if (!name) { errEl.textContent = 'Name should start with a letter or number. Letters, numbers, underscores, and spaces, up to 24 characters.'; errEl.hidden = false; return; }
    var body = cleanBody($('#offerBody').value, 400).replace(/[\r\n]+/g, ' ').trim();
    if (!body) { errEl.textContent = 'Write a question or an offer.'; errEl.hidden = false; return; }
    if (body.length > 400) { errEl.textContent = 'Keep it to 400 characters.'; errEl.hidden = false; return; }
    var kind = $('#offerKind').value === 'offer' ? 'offer' : 'question';
    errEl.hidden = true;
    cache.name = name;
    var id = makeId();
    var record = { id: id, kind: kind, name: name, body: body, author: user ? user.uid : 'local', createdAt: Date.now(), localOnly: true, pendingSync: true };
    posting = true;
    $('#offerBtn').disabled = true;
    try {
      if (item.localOnly || item.sample || !readsOk || !user) {
        var localQuota = takeQuota();
        if (localQuota.wait) await sleep(localQuota.wait);
        if (!cache.offers[lid]) cache.offers[lid] = {};
        cache.offers[lid][id] = record;
        rememberQuota(localQuota);
        save();
        toast(rulesBlocked ? 'Saved on this device until Firebase rules are published.' : 'Saved on this device.');
        showDetail(lid, true);
        return;
      }
      var quota = isOwner ? null : await serverQuota();
      var payload = {
        kind: kind,
        name: name,
        body: body,
        author: user.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      var updates = {};
      updates['market/offers/' + lid + '/' + id] = payload;
      if (!isOwner) {
        payload.seq = quota.n;
        payload.day = quota.day;
        updates['market/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
        updates['market/c/' + user.uid] = { n: quota.n, day: quota.day };
      }
      await firebase.database().ref().update(updates);
      record.author = user.uid;
      record.localOnly = false;
      record.pendingSync = false;
      if (!cache.offers[lid]) cache.offers[lid] = {};
      cache.offers[lid][id] = record;
      rememberQuota(quota);
      save();
      toast(kind === 'offer' ? 'Offer posted.' : 'Question posted.');
      showDetail(lid, true);
    } catch (err) {
      if (err && err.code === 'quota') { toast(err.message); return; }
      if (denied(err)) {
        showBanner();
        readsOk = false;
        if (!cache.offers[lid]) cache.offers[lid] = {};
        cache.offers[lid][id] = record;
        save();
        toast('Saved on this device until Firebase rules are published.');
        showDetail(lid, true);
        return;
      }
      toast('Could not post that. Wait a few seconds and try again.');
    } finally {
      posting = false;
      var btn = $('#offerBtn');
      if (btn) btn.disabled = false;
    }
  }
  async function submitMail(lid, buyer, seller, nameRaw, bodyRaw, errEl) {
    if (posting) return;
    var item = cache.items[lid];
    if (!item || statusOf(item) === 'sold') { toast('This listing is sold.'); return; }
    if (!user) { toast('Sign-in is still starting.'); return; }
    var name = cleanName(nameRaw);
    if (!name) { errEl.textContent = 'Name should start with a letter or number. Letters, numbers, underscores, and spaces, up to 24 characters.'; errEl.hidden = false; return; }
    var body = cleanBody(bodyRaw, 400).replace(/[\r\n]+/g, ' ').trim();
    if (!body) { errEl.textContent = 'Write a short message.'; errEl.hidden = false; return; }
    if (buyer !== user.uid && seller !== user.uid) { errEl.textContent = 'Only the buyer and the seller can use this thread.'; errEl.hidden = false; return; }
    errEl.hidden = true;
    cache.name = name;
    var id = makeId();
    var record = { id: id, lid: lid, buyer: buyer, seller: seller, name: name, body: body, createdAt: Date.now(), localOnly: true };
    posting = true;
    try {
      var remoteSeller = item.author && item.author !== 'local' && !item.sample && !item.localOnly;
      if (!remoteSeller || !readsOk) {
        var localQuota = takeQuota();
        if (localQuota.wait) await sleep(localQuota.wait);
        cache.mail[id] = record;
        rememberQuota(localQuota);
        save();
        toast('Saved on this device.');
        showDetail(lid, true);
        return;
      }
      var quota = isOwner ? null : await serverQuota();
      var payload = {
        lid: lid,
        buyer: buyer,
        seller: seller,
        name: name,
        body: body,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      var updates = {};
      updates['market/mail/' + buyer + '/' + id] = payload;
      if (seller !== buyer) updates['market/mail/' + seller + '/' + id] = payload;
      if (!isOwner && quota) {
        updates['market/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
        updates['market/c/' + user.uid] = { n: quota.n, day: quota.day };
      }
      await firebase.database().ref().update(updates);
      record.localOnly = false;
      inbox[id] = record;
      delete cache.mail[id];
      rememberQuota(quota);
      save();
      toast('Message sent.');
      showDetail(lid, true);
    } catch (err) {
      if (err && err.code === 'quota') { toast(err.message); return; }
      if (denied(err)) {
        mailBlocked = true;
        var q2 = null;
        try { q2 = takeQuota(); } catch (e) { toast(e.message); return; }
        if (q2.wait) await sleep(q2.wait);
        cache.mail[id] = record;
        rememberQuota(q2);
        save();
        toast('Saved on this device until Firebase rules are published.');
        showDetail(lid, true);
        return;
      }
      toast('Could not send that. Wait a few seconds and try again.');
    } finally { posting = false; }
  }
  async function patchItem(id, changes) {
    var item = cache.items[id];
    if (!item || !(isOwner || ownsItem(item))) return;
    if (!isOwner) {
      changes = Object.assign({}, changes, {
        featured: !!item.featured,
        official: !!item.official,
        author: item.author,
        createdAt: item.createdAt
      });
    }
    if (changes.photos) {
      changes.photo = changes.photos[0] || '';
    }
    if (changes.status) changes.sold = changes.status === 'sold';
    if (changes.sold === true) changes.status = 'sold';
    if (changes.sold === false && changes.status !== 'pending') changes.status = changes.status || 'active';
    var next = scrubItem(Object.assign({}, item, changes, { updatedAt: Date.now(), id: id }));
    delete next.contact;
    if (item.localOnly || item.sample || !readsOk || !user) {
      cache.items[id] = next;
      save();
      return;
    }
    var payload = wirePayload(next, null, false);
    payload.author = item.author;
    payload.createdAt = item.createdAt;
    try {
      await firebase.database().ref('market/items/' + id).set(payload);
      next.localOnly = false;
      cache.items[id] = next;
      save();
    } catch (e) {
      if (denied(e)) showBanner();
      toast('Could not save that change.');
      throw e;
    }
  }
  async function shareItem(id) {
    var item = cache.items[id];
    if (!item) return;
    var url = location.origin + '/market/#/item/' + encodeURIComponent(id);
    var data = { title: item.title, text: item.title + ' · ' + formatMoney(item.price), url: url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(url); toast('Link copied.'); return; } catch (e) {}
    }
    toast('Copy this link: ' + url);
  }
  async function onTool(act, id, extra) {
    if (act === 'share') { shareItem(id); return; }
    if (act === 'edit' || act === 'sold' || act === 'pending' || act === 'delete') {
      var owned = cache.items[id];
      if (!owned || !(isOwner || ownsItem(owned))) return;
    } else if (act !== 'edit-offer' && act !== 'delete-offer' && !isOwner) return;
    if (act === 'edit') { location.hash = '#/edit/' + id; return; }
    if (act === 'sold' || act === 'pending' || act === 'feature') {
      var item = cache.items[id];
      if (!item) return;
      var changes;
      if (act === 'feature') changes = { featured: !item.featured };
      else if (act === 'pending') changes = statusOf(item) === 'pending' ? { status: 'active', sold: false } : { status: 'pending', sold: false };
      else changes = statusOf(item) === 'sold' ? { status: 'active', sold: false } : { status: 'sold', sold: true };
      try { await patchItem(id, changes); } catch (e) { return; }
      render(true);
      return;
    }
    if (act === 'delete') {
      if (!confirm('Delete this listing and its questions?')) return;
      var doomed = cache.items[id];
      if (!doomed) return;
      if (!doomed.localOnly && !doomed.sample && readsOk && user) {
        var updates = {};
        updates['market/items/' + id] = null;
        Object.keys(offerBag(id)).forEach(function (oid) {
          if (!offerBag(id)[oid].localOnly) updates['market/offers/' + id + '/' + oid] = null;
        });
        try { await firebase.database().ref().update(updates); }
        catch (e) { toast('Could not delete that listing.'); return; }
      }
      delete cache.items[id];
      delete cache.offers[id];
      save();
      location.hash = '#/';
      return;
    }
    if (act === 'delete-offer') {
      var bag = cache.offers[extra] || {};
      var row = bag[id];
      if (!row || !(isOwner || (user && row.author === user.uid))) return;
      if (!confirm('Delete this question or offer?')) return;
      if (row && !row.localOnly && readsOk && user) {
        try { await firebase.database().ref('market/offers/' + extra + '/' + id).set(null); }
        catch (e) { toast('Could not delete that.'); return; }
      }
      if (cache.offers[extra]) delete cache.offers[extra][id];
      save();
      render(true);
      return;
    }
    if (act === 'edit-offer') {
      var current = (cache.offers[extra] || {})[id];
      if (!current || !(isOwner || (user && current.author === user.uid))) return;
      var nextBody = prompt('Edit question or offer', current.body);
      if (nextBody == null) return;
      var body = cleanBody(nextBody, 400).replace(/[\r\n]+/g, ' ').trim();
      if (!body) { toast('That cannot be empty.'); return; }
      if (current.localOnly || !readsOk || !user) {
        current.body = body;
        save();
        render(true);
        return;
      }
      try {
        await firebase.database().ref('market/offers/' + extra + '/' + id).set({
          kind: current.kind === 'offer' ? 'offer' : 'question',
          name: current.name,
          body: body,
          author: current.author,
          createdAt: current.createdAt
        });
        current.body = body;
        save();
        render(true);
      } catch (e) { toast('Could not edit that.'); }
    }
  }
  function mirror() {
    if (!readsOk) return;
    if (gotItems) {
      var items = {};
      Object.keys(serverItems || {}).forEach(function (id) {
        if (!ID_RE.test(id) || !serverItems[id] || !serverItems[id].title) return;
        items[id] = scrubItem(Object.assign({ id: id, localOnly: false, pendingSync: false, sample: false }, serverItems[id]));
        delete items[id].contact;
      });
      Object.keys(cache.items || {}).forEach(function (id) {
        var item = cache.items[id];
        if (item && item.localOnly && !items[id]) items[id] = scrubItem(item);
      });
      cache.items = items;
    }
    if (gotOffers) {
      var offers = {};
      Object.keys(serverOffers || {}).forEach(function (lid) {
        if (!ID_RE.test(lid)) return;
        offers[lid] = {};
        var bag = serverOffers[lid] || {};
        Object.keys(bag).forEach(function (id) {
          if (!ID_RE.test(id) || !bag[id] || !bag[id].body) return;
          offers[lid][id] = Object.assign({ id: id, localOnly: false, pendingSync: false }, bag[id]);
        });
      });
      Object.keys(cache.offers || {}).forEach(function (lid) {
        var bag = cache.offers[lid] || {};
        Object.keys(bag).forEach(function (id) {
          var row = bag[id];
          if (row && row.localOnly && !(offers[lid] && offers[lid][id])) {
            if (!offers[lid]) offers[lid] = {};
            offers[lid][id] = row;
          }
        });
      });
      cache.offers = offers;
    }
    save();
  }
  async function flushPending() {
    if (flushPending.running || !readsOk || !user) return;
    flushPending.running = true;
    try {
      var pending = Object.keys(cache.items).map(function (id) { return cache.items[id]; }).filter(function (item) {
        return item && item.pendingSync && item.localOnly && !item.sample;
      });
      for (var i = 0; i < pending.length; i++) {
        var item = pending[i];
        if (item.author && item.author !== 'local' && item.author !== user.uid) continue;
        try {
          var quota = isOwner ? null : await serverQuota();
          item.author = user.uid;
          if (isOwner) item.official = true;
          var updates = {};
          updates['market/items/' + item.id] = wirePayload(item, quota, true);
          if (!isOwner) {
            updates['market/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
            updates['market/c/' + user.uid] = { n: quota.n, day: quota.day };
          }
          await firebase.database().ref().update(updates);
          item.localOnly = false;
          item.pendingSync = false;
          rememberQuota(quota);
          save();
        } catch (e) {
          if (denied(e)) showBanner();
          break;
        }
      }
    } finally { flushPending.running = false; }
  }
  function listen() {
    if (!user || listenedUid === user.uid) return;
    var db = firebase.database();
    if (listenedUid) {
      db.ref('market/items').off();
      db.ref('market/offers').off();
    }
    listenedUid = user.uid;
    var note = function () { mirror(); render(); if (readsOk) flushPending(); };
    db.ref('market/items').on('value', function (snap) {
      serverItems = snap.val() || {};
      gotItems = true;
      readsOk = true;
      hideBanner();
      note();
    }, function (err) {
      if (denied(err)) { readsOk = false; showBanner(); }
      render();
    });
    db.ref('market/offers').on('value', function (snap) {
      serverOffers = snap.val() || {};
      gotOffers = true;
      if (!rulesBlocked) readsOk = true;
      note();
    }, function (err) {
      if (denied(err)) { readsOk = false; showBanner(); }
      render();
    });
    listenMail();
  }
  function listenMail() {
    if (!user || mailUid === user.uid) return;
    var db = firebase.database();
    if (mailUid) db.ref('market/mail/' + mailUid).off();
    mailUid = user.uid;
    inbox = {};
    db.ref('market/mail/' + user.uid).on('value', function (snap) {
      var next = {};
      var val = snap.val() || {};
      Object.keys(val).forEach(function (id) {
        if (!ID_RE.test(id) || !val[id] || !val[id].body) return;
        if (val[id].buyer !== user.uid && val[id].seller !== user.uid) return;
        next[id] = val[id];
      });
      inbox = next;
      mailBlocked = false;
      render();
    }, function (err) {
      if (denied(err)) mailBlocked = true;
    });
  }
  function connect() {
    var config = window.MONDO_BOARD_CONFIG;
    if (typeof firebase === 'undefined' || !config || !config.apiKey || !config.databaseURL) return;
    try { if (!firebase.apps.length) firebase.initializeApp(config); } catch (e) { return; }
    firebase.auth().onAuthStateChanged(function (next) {
      if (!next) {
        user = null;
        isOwner = false;
        inbox = {};
        clearTimeout(anonTimer);
        anonTimer = setTimeout(function () {
          if (firebase.auth().currentUser) return;
          firebase.auth().signInAnonymously().catch(function () { showBanner(); });
        }, 600);
        render();
        return;
      }
      clearTimeout(anonTimer);
      user = next;
      isOwner = isAdminNow();
      if (!connect.ownerListen) {
        connect.ownerListen = true;
        document.addEventListener('mondo-owner', function () {
          var on = isAdminNow();
          if (on === isOwner) return;
          isOwner = on;
          render();
        });
      }
      listen();
      render();
    });
  }
  function render(force) {
    var ownerBtn = $('#ownerBtn');
    if (ownerBtn && !window.MONDO_MEMBER) ownerBtn.textContent = isOwner ? 'Sign out' : 'Owner sign in';
    var where = route();
    var active = document.activeElement;
    var typing = active && active.closest && (active.closest('#itemForm') || active.closest('#offerForm') || active.closest('.mail-form'));
    if (where.view === 'new' || where.view === 'edit') {
      if (!(typing && active.closest('#itemForm'))) showForm(where.view === 'edit' ? where.id : '', force);
      return;
    }
    if (where.view === 'item') {
      if (!typing) showDetail(where.id, force);
      return;
    }
    showList();
  }
  function boot() {
    seed();
    scrubAll();
    var year = $('#yr');
    if (year) year.textContent = String(new Date().getFullYear());
    $('#search').addEventListener('input', function () { query = $('#search').value; paintRows(); });
    $('#sort').addEventListener('change', function () { sort = $('#sort').value; paintRows(); });
    $('#condFilter').addEventListener('change', function () {
      cond = $('#condFilter').value;
      if (!CONDITIONS[cond]) cond = 'all';
      paintRows();
    });
    $('#priceMin').addEventListener('input', function () {
      priceMin = formatPriceInput($('#priceMin').value);
      if (priceMin !== $('#priceMin').value) $('#priceMin').value = priceMin;
      paintRows();
    });
    $('#priceMax').addEventListener('input', function () {
      priceMax = formatPriceInput($('#priceMax').value);
      if (priceMax !== $('#priceMax').value) $('#priceMax').value = priceMax;
      paintRows();
    });
    $('#catTabs').addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-cat]');
      if (!btn) return;
      cat = btn.getAttribute('data-cat') || 'all';
      if (!CATS[cat] && cat !== 'all') cat = 'all';
      setTabs();
      paintRows();
    });
    $('#itemForm').addEventListener('submit', submitItem);
    $('#stepNext').addEventListener('click', function () {
      if (!validateStep(step)) return;
      showStep(Math.min(4, step + 1));
    });
    $('#stepBack').addEventListener('click', function () {
      formError('');
      showStep(Math.max(1, step - 1));
    });
    $('#postPrice').addEventListener('input', function () {
      var next = formatPriceInput($('#postPrice').value);
      if (next !== $('#postPrice').value) $('#postPrice').value = next;
      paintPrice();
    });
    $('#postPrice').addEventListener('blur', function () {
      var cents = parsePrice($('#postPrice').value);
      if (cents != null) $('#postPrice').value = (cents / 100).toFixed(2);
      paintPrice();
    });
    $('#photoFile').addEventListener('change', function () {
      var files = $('#photoFile').files ? Array.prototype.slice.call($('#photoFile').files) : [];
      if (!files.length) return;
      setPhotoNote('Resizing photo…');
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          if (photoDraft.length >= 4) return;
          return shrinkFile(file).then(function (data) { addDraft(data); });
        });
      });
      chain.then(function () {
        setPhotoNote(photoDraft.length ? 'Photo ready.' : '');
        $('#photoFile').value = '';
      }).catch(function () {
        setPhotoNote('');
        formError('That photo is too big to store. Try a smaller one.');
      });
    });
    $('#addPhotoUrl').addEventListener('click', function () {
      var href = safeHttps($('#photoUrl').value.trim());
      if (!href) { formError('Photo URLs have to start with https://'); return; }
      if (addDraft(href)) {
        $('#photoUrl').value = '';
        setPhotoNote('Photo ready.');
      }
    });
    document.body.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      onTool(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn.getAttribute('data-extra'));
    });
    $('#ownerBtn').addEventListener('click', function () {
      if (typeof firebase === 'undefined' || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
      if (isAdminNow()) {
        firebase.auth().signOut();
        return;
      }
      $('#ownerError').hidden = true;
      $('#ownerPass').value = '';
      $('#ownerDialog').showModal();
    });
    $('#ownerCancel').addEventListener('click', function () { $('#ownerDialog').close(); });
    $('#ownerForm').addEventListener('submit', function (event) {
      event.preventDefault();
      $('#ownerError').hidden = true;
      firebase.auth().signInWithEmailAndPassword($('#ownerEmail').value.trim(), $('#ownerPass').value).then(function () {
        $('#ownerPass').value = '';
        $('#ownerDialog').close();
      }).catch(function () {
        $('#ownerPass').value = '';
        $('#ownerError').textContent = 'That email or password is wrong.';
        $('#ownerError').hidden = false;
      });
    });
    window.addEventListener('hashchange', function () { render(true); });
    connect();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
