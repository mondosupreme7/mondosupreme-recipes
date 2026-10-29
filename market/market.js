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
    tech: 'Electronics & Retro Tech',
    toys: 'Collectibles & Toys',
    home: 'Home & Kitchen',
    cruise: 'Cruise & Travel Gear',
    misc: 'Misc'
  };
  var CONDITIONS = {
    new: 'New',
    mint: 'Mint in Box',
    good: 'Good Used',
    parts: 'For Parts / Retro'
  };
  var NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ ]{0,23}$/;
  var PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  var ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  var OFFICIAL = '★ Official Seller (999) ★';

  var $ = function (sel) { return document.querySelector(sel); };
  var cache = load();
  var user = null;
  var isOwner = false;
  var readsOk = false;
  var rulesBlocked = false;
  var listenedUid = '';
  var posting = false;
  var anonTimer = 0;
  var query = '';
  var cat = 'all';
  var sort = 'newest';
  var serverItems = null;
  var serverOffers = null;
  var gotItems = false;
  var gotOffers = false;

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
  function sample(id, fields) {
    return {
      id: id,
      title: fields.title,
      price: fields.price,
      condition: fields.condition,
      category: fields.category,
      location: fields.location,
      description: fields.description,
      seller: fields.seller,
      contact: fields.contact,
      photo: '',
      author: 'local',
      createdAt: fields.createdAt,
      updatedAt: fields.createdAt,
      sold: !!fields.sold,
      featured: !!fields.featured,
      official: false,
      localOnly: true,
      sample: true
    };
  }
  function seed() {
    if (cache.seeded) return;
    cache.seeded = true;
    var now = Date.now();
    if (!cache.items['sample-walkman']) {
      cache.items['sample-walkman'] = sample('sample-walkman', {
        title: 'Sony Walkman WM-FX195',
        price: 2499,
        condition: 'good',
        category: 'tech',
        location: 'Kitchen drawer, ships in a bubble mailer',
        description: 'Yellow sports Walkman. It still rewinds, it still eats AA batteries, and the radio hiss is part of the charm.',
        seller: 'RetroCody',
        contact: 'Ask on this listing',
        createdAt: now - 5 * DAY_MS,
        featured: true
      });
    }
    if (!cache.items['sample-pogs']) {
      cache.items['sample-pogs'] = sample('sample-pogs', {
        title: 'Tube of milk-cap pogs',
        price: 350,
        condition: 'mint',
        category: 'toys',
        location: 'Pickup or a stamped envelope',
        description: 'A full tube of milk caps, slammer included. Colors from a 1995 school cafeteria.',
        seller: 'PogKid',
        contact: 'Leave a question or an offer below',
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
        location: 'Already sailed',
        description: 'A sample of a finished sale. The Q&A closes when a listing is marked sold.',
        seller: 'HarborDesk',
        contact: 'This one already sold',
        createdAt: now - 9 * DAY_MS,
        sold: true
      });
    }
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
  function formatMoney(cents) {
    var n = Number(cents);
    if (!isFinite(n)) n = 0;
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
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }
  function gavelSvg() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'gavel-ph');
    svg.setAttribute('aria-hidden', 'true');
    [[1, 3, 9, 2, '#c4a574'], [1, 5, 9, 2, '#8b5a2b'], [8, 2, 3, 2, '#e8e8e8'], [4, 7, 2, 6, '#6b3e1e'], [3, 12, 4, 2, '#3a2412']].forEach(function (cell) {
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(cell[0]));
      rect.setAttribute('y', String(cell[1]));
      rect.setAttribute('width', String(cell[2]));
      rect.setAttribute('height', String(cell[3]));
      rect.setAttribute('fill', cell[4]);
      svg.appendChild(rect);
    });
    return svg;
  }
  function photoNode(src, alt, className) {
    var safe = safePhoto(src);
    if (!safe) return gavelSvg();
    var img = document.createElement('img');
    img.className = className || 'lot-photo';
    img.alt = alt || 'Listing photo';
    img.src = safe;
    return img;
  }
  function addBadge(parent, text, cls) {
    var badge = document.createElement('span');
    badge.className = 'ebay-badge blink ' + cls;
    badge.textContent = text;
    parent.appendChild(badge);
  }
  function badgesFor(item, parent) {
    var wrap = document.createElement('span');
    wrap.className = 'badges';
    if (item.sold) addBadge(wrap, 'SOLD!', 'sold');
    if (item.featured) addBadge(wrap, 'FEATURED!', 'feat');
    if (!item.sold && Date.now() - Number(item.createdAt || 0) < NEW_MS) addBadge(wrap, 'NEW LISTING!', 'fresh');
    if (item.official) {
      var star = document.createElement('span');
      star.className = 'ebay-badge official';
      star.textContent = OFFICIAL;
      wrap.appendChild(star);
    }
    if (wrap.childNodes.length) parent.appendChild(wrap);
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
      } else {
        el.appendChild(document.createTextNode(match[0]));
      }
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
  function visibleItems() {
    var q = query.trim().toLowerCase();
    return Object.keys(cache.items).map(function (id) {
      var item = cache.items[id];
      if (!item || !item.title) return null;
      item.id = id;
      return item;
    }).filter(function (item) {
      if (!item) return false;
      if (cat !== 'all' && item.category !== cat) return false;
      if (!q) return true;
      var blob = [item.title, item.description, item.seller, item.location, item.contact].join(' ').toLowerCase();
      return blob.indexOf(q) !== -1;
    }).sort(function (a, b) {
      if (sort === 'low') return a.price - b.price || b.createdAt - a.createdAt;
      if (sort === 'high') return b.price - a.price || b.createdAt - a.createdAt;
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.createdAt - a.createdAt;
    });
  }
  function paintRows() {
    var body = $('#rows');
    var empty = $('#empty');
    if (!body) return;
    var items = visibleItems();
    var sig = items.map(function (item) {
      return item.id + ':' + item.price + ':' + (item.sold ? 1 : 0) + ':' + (item.featured ? 1 : 0) + ':' + offerCount(item.id);
    }).join('|') + '|' + query + '|' + cat + '|' + sort;
    if (paintRows.sig === sig) {
      empty.hidden = items.length > 0;
      return;
    }
    paintRows.sig = sig;
    body.textContent = '';
    empty.hidden = items.length > 0;
    items.forEach(function (item) {
      var tr = document.createElement('tr');
      if (item.featured) tr.classList.add('featured');
      if (item.sold) tr.classList.add('sold');
      var itemTd = document.createElement('td');
      itemTd.setAttribute('data-label', 'Item');
      var cell = document.createElement('div');
      cell.className = 'item-cell';
      cell.appendChild(photoNode(item.photo, item.title, 'lot-photo'));
      var copy = document.createElement('div');
      copy.className = 'item-copy';
      var link = document.createElement('a');
      link.className = 'item-link';
      link.href = '#/item/' + encodeURIComponent(item.id);
      link.textContent = item.title;
      copy.appendChild(link);
      badgesFor(item, copy);
      if (item.location) {
        var place = document.createElement('p');
        place.textContent = item.location;
        copy.appendChild(place);
      }
      cell.appendChild(copy);
      itemTd.appendChild(cell);
      var priceTd = document.createElement('td');
      priceTd.setAttribute('data-label', 'Price');
      priceTd.className = 'price';
      priceTd.textContent = formatMoney(item.price);
      var condTd = document.createElement('td');
      condTd.setAttribute('data-label', 'Condition');
      condTd.textContent = CONDITIONS[item.condition] || item.condition || '';
      var sellerTd = document.createElement('td');
      sellerTd.setAttribute('data-label', 'Seller');
      var seller = document.createElement('div');
      seller.className = 'seller-name';
      seller.textContent = item.seller || '';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(seller, item.author);
      sellerTd.appendChild(seller);
      if (item.official) {
        var star = document.createElement('div');
        star.className = 'ebay-badge official';
        star.textContent = OFFICIAL;
        sellerTd.appendChild(star);
      }
      var qaTd = document.createElement('td');
      qaTd.setAttribute('data-label', 'Q&A');
      qaTd.textContent = String(offerCount(item.id));
      tr.appendChild(itemTd);
      tr.appendChild(priceTd);
      tr.appendChild(condTd);
      tr.appendChild(sellerTd);
      tr.appendChild(qaTd);
      body.appendChild(tr);
    });
  }
  function showList() {
    $('#listView').hidden = false;
    $('#detailView').hidden = true;
    $('#formView').hidden = true;
    paintRows();
  }
  function metaRow(table, label, valueNode) {
    var tr = document.createElement('tr');
    var th = document.createElement('th');
    th.textContent = label;
    var td = document.createElement('td');
    if (typeof valueNode === 'string') td.textContent = valueNode;
    else td.appendChild(valueNode);
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  }
  function ownsItem(item) {
    return !!(user && user.email && item && item.author === user.uid);
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
    btn('edit', 'Edit');
    btn('sold', item.sold ? 'Mark as available' : 'Mark as SOLD');
    if (isOwner) {
      btn('feature', item.featured ? 'Unfeature' : 'Feature / Pin');
      btn('delete', 'Delete');
    }
    parent.appendChild(bar);
  }
  function showDetail(id, force) {
    var view = $('#detailView');
    if (!force && view.dataset.id === id && !view.hidden) {
      $('#listView').hidden = true;
      $('#formView').hidden = true;
      return;
    }
    var item = cache.items[id];
    $('#listView').hidden = true;
    $('#formView').hidden = true;
    view.hidden = false;
    view.dataset.id = id;
    view.textContent = '';
    var back = document.createElement('div');
    back.className = 'detail-nav';
    var backLink = document.createElement('a');
    backLink.className = 'btn ghost';
    backLink.href = '#/';
    backLink.textContent = '« Back to listings';
    back.appendChild(backLink);
    view.appendChild(back);
    if (!item) {
      var missing = document.createElement('p');
      missing.textContent = 'That listing is gone.';
      view.appendChild(missing);
      return;
    }
    item.id = id;
    var layout = document.createElement('div');
    layout.className = 'detail-layout';
    var pic = photoNode(item.photo, item.title, 'detail-photo');
    if (!safePhoto(item.photo)) pic.classList.add('detail-ph');
    layout.appendChild(pic);
    var info = document.createElement('div');
    var title = document.createElement('h2');
    title.textContent = item.title;
    info.appendChild(title);
    badgesFor(item, info);
    var price = document.createElement('p');
    price.className = 'detail-price';
    price.textContent = formatMoney(item.price);
    info.appendChild(price);
    var table = document.createElement('table');
    table.className = 'meta';
    metaRow(table, 'Condition', CONDITIONS[item.condition] || '');
    metaRow(table, 'Category', CATS[item.category] || '');
    var sellerNode = document.createElement('span');
    sellerNode.textContent = item.seller || '';
    if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(sellerNode, item.author);
    metaRow(table, 'Seller', sellerNode);
    if (item.official) metaRow(table, 'Rating', OFFICIAL);
    metaRow(table, 'Location', item.location || 'Not listed');
    var contact = document.createElement('span');
    fillText(contact, item.contact || '');
    metaRow(table, 'How to buy', contact);
    metaRow(table, 'Posted', when(item.createdAt));
    info.appendChild(table);
    layout.appendChild(info);
    view.appendChild(layout);
    var desc = document.createElement('div');
    desc.className = 'desc';
    fillText(desc, item.description || '');
    view.appendChild(desc);
    ownerButtons(view, item);
    var qa = document.createElement('section');
    qa.className = 'qa';
    var heading = document.createElement('h3');
    heading.textContent = 'Public Q&A / Offers';
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
      none.textContent = 'No questions yet. Ask one below.';
      list.appendChild(none);
    }
    offers.forEach(function (row) {
      var card = document.createElement('article');
      card.className = 'qa-card';
      var head = document.createElement('header');
      var kind = document.createElement('span');
      kind.className = 'qa-kind';
      kind.textContent = row.kind === 'offer' ? 'OFFER' : 'QUESTION';
      var who = document.createElement('strong');
      who.textContent = row.name || 'Guest';
      if (window.MONDO_MEMBER) window.MONDO_MEMBER.adorn(who, row.author);
      var time = document.createElement('time');
      time.dateTime = row.createdAt ? new Date(Number(row.createdAt)).toISOString() : '';
      time.textContent = when(row.createdAt);
      head.appendChild(kind);
      head.appendChild(who);
      head.appendChild(time);
      var body = document.createElement('p');
      fillText(body, row.body);
      card.appendChild(head);
      card.appendChild(body);
      if (isOwner) {
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
    if (item.sold) {
      var note = document.createElement('p');
      note.className = 'sold-note';
      note.textContent = 'This listing is sold.';
      qa.appendChild(note);
    } else {
      var form = document.createElement('form');
      form.id = 'offerForm';
      var grid = document.createElement('div');
      grid.className = 'form-grid';
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
      grid.appendChild(nameLabel);
      grid.appendChild(kindLabel);
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
      submit.textContent = 'Post to this listing';
      actions.appendChild(submit);
      form.appendChild(grid);
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
  function setTabs() {
    document.querySelectorAll('#catTabs button').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-cat') === cat ? 'true' : 'false');
    });
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
    $('#postCondition').value = existing ? existing.condition : '';
    $('#postCat').value = existing ? existing.category : '';
    $('#postSeller').value = existing ? existing.seller : (cache.name || '');
    $('#postLocation').value = existing ? (existing.location || '') : '';
    $('#postBody').value = existing ? existing.description : '';
    $('#postContact').value = existing ? existing.contact : '';
    $('#photoUrl').value = existing && safeHttps(existing.photo) ? existing.photo : '';
    $('#photoFile').value = '';
    $('#photoClear').checked = false;
    $('#photoClearRow').hidden = !(existing && existing.photo);
    formError('');
    setPhotoNote('');
    var preview = $('#photoPreview');
    var kept = existing ? safePhoto(existing.photo) : '';
    if (kept) {
      preview.src = kept;
      preview.alt = existing.title;
      preview.hidden = false;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
  }
  function setPhotoNote(text) {
    var note = $('#photoNote');
    note.hidden = !text;
    note.textContent = text || '';
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
  function fieldsFromForm() {
    var title = cleanLine($('#postTitle').value, 80);
    if (!title) return formError('Add a title, up to 80 characters.');
    var price = parsePrice($('#postPrice').value);
    if (price == null) return formError('Price must be from $0.00 to $1,000,000.00.');
    var condition = cleanCondition($('#postCondition').value);
    if (!condition) return formError('Pick a condition.');
    var category = cleanCat($('#postCat').value);
    if (!category) return formError('Pick a category.');
    var seller = cleanName($('#postSeller').value);
    if (!seller) return formError('Seller name should start with a letter or number. Letters, numbers, underscores, and spaces, up to 24 characters.');
    var location = cleanLine($('#postLocation').value, 80);
    var description = cleanBody($('#postBody').value, 2000);
    if (!description) return formError('Add a description.');
    var contact = cleanLine($('#postContact').value, 160);
    if (!contact) return formError('Add a way to buy: an email, a chat handle, or “ask below”.');
    formError('');
    return { title: title, price: price, condition: condition, category: category, seller: seller, location: location, description: description, contact: contact };
  }
  async function photoFromForm(existing) {
    var file = $('#photoFile').files && $('#photoFile').files[0];
    if (file) {
      setPhotoNote('Resizing photo…');
      try {
        var data = await shrinkFile(file);
        setPhotoNote('Photo ready.');
        return data;
      } catch (e) {
        formError('That photo is too big to store. Try a smaller one.');
        setPhotoNote('');
        throw e;
      }
    }
    var typed = $('#photoUrl').value.trim();
    if (typed) {
      var href = safeHttps(typed);
      if (!href) {
        formError('Photo URLs have to start with https://');
        throw new Error('url');
      }
      return href;
    }
    if ($('#photoClear').checked) return '';
    return existing && safePhoto(existing.photo) ? existing.photo : '';
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
    return {
      id: existing ? existing.id : makeId(),
      title: fields.title,
      price: fields.price,
      condition: fields.condition,
      category: fields.category,
      location: fields.location,
      description: fields.description,
      seller: fields.seller,
      contact: fields.contact,
      photo: fields.photo || '',
      author: existing && existing.author ? existing.author : (user ? user.uid : 'local'),
      createdAt: existing && existing.createdAt ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      sold: existing ? !!existing.sold : false,
      featured: existing ? !!existing.featured : false,
      official: existing ? !!existing.official : !!isOwner,
      localOnly: true,
      pendingSync: !existing || !existing.sample,
      sample: existing ? !!existing.sample : false
    };
  }
  function wirePayload(record, quota, fresh) {
    var payload = {
      title: record.title,
      price: record.price,
      condition: record.condition,
      category: record.category,
      location: record.location || '',
      description: record.description,
      seller: record.seller,
      contact: record.contact,
      photo: record.photo || '',
      author: record.author,
      createdAt: fresh ? firebase.database.ServerValue.TIMESTAMP : record.createdAt,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      sold: !!record.sold,
      featured: !!record.featured,
      official: !!record.official
    };
    if (quota) {
      payload.seq = quota.n;
      payload.day = quota.day;
      payload.sold = false;
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
    var fields = fieldsFromForm();
    if (!fields) return;
    var editing = $('#itemForm').dataset.id || '';
    var existing = editing ? cache.items[editing] : null;
    if (editing && (!existing || !(isOwner || ownsItem(existing)))) { formError('Only the seller can edit this listing.'); return; }
    posting = true;
    $('#postBtn').disabled = true;
    try {
      fields.photo = await photoFromForm(existing);
      if (fields.photo && fields.photo.length > PHOTO_RULE) {
        formError('That photo is too big to store. Try a smaller one.');
        return;
      }
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
      if (err && err.message === 'photo') return;
      if (err && err.message === 'url') return;
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
      formError('Could not post. Wait a few seconds and try again.');
    } finally {
      posting = false;
      $('#postBtn').disabled = false;
    }
  }
  async function submitOffer(lid) {
    if (posting) return;
    var item = cache.items[lid];
    var errEl = $('#offerError');
    if (!item || item.sold) { toast('This listing is sold.'); return; }
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
      if (denied(err) && await rulesMissing()) {
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
    var next = Object.assign({}, item, changes, { updatedAt: Date.now(), id: id });
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
      cache.items[id] = next;
      save();
    } catch (e) {
      toast('Could not save that change.');
      throw e;
    }
  }
  async function onTool(act, id, extra) {
    if (act === 'edit' || act === 'sold') {
      var owned = cache.items[id];
      if (!owned || !(isOwner || ownsItem(owned))) return;
    } else if (!isOwner) return;
    if (act === 'edit') { location.hash = '#/edit/' + id; return; }
    if (act === 'sold' || act === 'feature') {
      var item = cache.items[id];
      if (!item) return;
      var changes = act === 'sold' ? { sold: !item.sold } : { featured: !item.featured };
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
      if (!confirm('Delete this question or offer?')) return;
      var bag = cache.offers[extra] || {};
      var row = bag[id];
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
      if (!current) return;
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
        items[id] = Object.assign({ id: id, localOnly: false, pendingSync: false, sample: false }, serverItems[id]);
      });
      Object.keys(cache.items || {}).forEach(function (id) {
        var item = cache.items[id];
        if (item && item.localOnly && !items[id]) items[id] = item;
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
        } catch (e) { break; }
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
  }
  function connect() {
    var config = window.MONDO_BOARD_CONFIG;
    if (typeof firebase === 'undefined' || !config || !config.apiKey || !config.databaseURL) return;
    try { if (!firebase.apps.length) firebase.initializeApp(config); } catch (e) { return; }
    firebase.auth().onAuthStateChanged(function (next) {
      if (!next) {
        user = null;
        isOwner = false;
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
      if (!connect.ownerListen) { connect.ownerListen = true; document.addEventListener('mondo-owner', function () { var on = isAdminNow(); if (on === isOwner) return; isOwner = on; render(); }); }
      listen();
      render();
    });
  }
  function render(force) {
    var ownerBtn = $('#ownerBtn');
    if (ownerBtn && !window.MONDO_MEMBER) ownerBtn.textContent = isOwner ? 'Sign out' : 'Owner sign in';
    var where = route();
    var active = document.activeElement;
    var typing = active && active.closest && (active.closest('#itemForm') || active.closest('#offerForm'));
    if (where.view === 'new' || where.view === 'edit') {
      if (!(typing && active.closest('#itemForm'))) showForm(where.view === 'edit' ? where.id : '', force);
      return;
    }
    if (where.view === 'item') {
      if (!(typing && active.closest('#offerForm'))) showDetail(where.id, force);
      return;
    }
    showList();
  }
  function boot() {
    seed();
    var year = $('#yr');
    if (year) year.textContent = String(new Date().getFullYear());
    $('#search').addEventListener('input', function () { query = $('#search').value; paintRows(); });
    $('#sort').addEventListener('change', function () { sort = $('#sort').value; paintRows(); });
    $('#catTabs').addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-cat]');
      if (!btn) return;
      cat = btn.getAttribute('data-cat') || 'all';
      if (!CATS[cat] && cat !== 'all') cat = 'all';
      setTabs();
      paintRows();
    });
    $('#itemForm').addEventListener('submit', submitItem);
    $('#photoFile').addEventListener('change', function () {
      var file = $('#photoFile').files && $('#photoFile').files[0];
      if (!file) return;
      setPhotoNote('Resizing photo…');
      shrinkFile(file).then(function (data) {
        var preview = $('#photoPreview');
        preview.src = data;
        preview.alt = 'Selected photo';
        preview.hidden = false;
        setPhotoNote('Photo ready.');
        $('#photoClear').checked = false;
      }).catch(function () {
        setPhotoNote('');
        formError('That photo is too big to store. Try a smaller one.');
      });
    });
    document.body.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      onTool(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn.getAttribute('data-extra'));
    });
    $('#ownerBtn').addEventListener('click', function () {
      if (typeof firebase === 'undefined' || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
      var current = firebase.auth().currentUser;
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
    window.addEventListener('hashchange', render);
    connect();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
