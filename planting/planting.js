(function () {
  'use strict';
  var TZ = 'America/New_York';
  var NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var KINDS = [
    ['vegetable', 'Vegetables'],
    ['herb', 'Herbs'],
    ['fruit', 'Fruit'],
    ['flower', 'Flowers']
  ];
  var data = null;
  var month = nowMonth();

  function $(id) { return document.getElementById(id); }
  function nowMonth() {
    var raw = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric' }).format(new Date());
    var n = parseInt(raw, 10);
    return n >= 1 && n <= 12 ? n : 1;
  }
  function hashMonth() {
    var match = /^#([1-9]|1[0-2])$/.exec(location.hash || '');
    return match ? Number(match[1]) : 0;
  }
  function paintZone() {
    var zone = data.zone || {};
    $('plantZone').textContent = data.zip + ' · ' + data.place + ' · Zone ' + zone.code + ' · ' + zone.range;
    $('plantRegion').textContent = data.region + '. ' + (zone.period || '') + '. Was ' + (zone.previous || 'a colder half-zone') + '.';
  }
  function paintMonths() {
    var bar = $('plantMonths');
    bar.replaceChildren();
    var now = document.createElement('button');
    now.type = 'button';
    now.textContent = 'Now';
    now.setAttribute('aria-pressed', month === nowMonth() ? 'true' : 'false');
    now.addEventListener('click', function () { show(nowMonth(), true); });
    bar.appendChild(now);
    NAMES.forEach(function (name, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = name.slice(0, 3);
      button.setAttribute('aria-label', name);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-pressed', index + 1 === month ? 'true' : 'false');
      button.addEventListener('click', function () { show(index + 1, false); });
      bar.appendChild(button);
    });
    var seasons = $('plantSeasons');
    seasons.replaceChildren();
    (data.seasons || []).forEach(function (season) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = season.label;
      button.title = season.hint || '';
      button.setAttribute('aria-pressed', season.month === month ? 'true' : 'false');
      button.addEventListener('click', function () { show(season.month, false); });
      seasons.appendChild(button);
    });
  }
  function plantsFor(kind) {
    return (data.crops || []).filter(function (crop) {
      return crop.kind === kind && (crop.months || []).indexOf(month) !== -1;
    });
  }
  function paintLists() {
    var current = month === nowMonth();
    $('plantWhen').textContent = (current ? 'Good to plant now · ' : '') + NAMES[month - 1];
    var host = $('plantLists');
    host.replaceChildren();
    KINDS.forEach(function (pair) {
      var rows = plantsFor(pair[0]);
      if (!rows.length) return;
      var section = document.createElement('section');
      section.className = 'plant-group';
      var heading = document.createElement('h3');
      heading.textContent = pair[1];
      var list = document.createElement('ul');
      list.className = 'plant-chips';
      rows.forEach(function (crop) {
        var item = document.createElement('li');
        var name = document.createElement('span');
        name.textContent = crop.name;
        item.appendChild(name);
        if (crop.types) {
          var types = document.createElement('span');
          types.className = 'plant-type';
          types.textContent = crop.types;
          item.appendChild(types);
        }
        if (crop.note) {
          var small = document.createElement('small');
          small.textContent = crop.note;
          item.appendChild(small);
        }
        var seed = crop.seed;
        if (seed && typeof seed.url === 'string' && seed.url.indexOf('https://') === 0) {
          var link = document.createElement('a');
          link.className = 'plant-seed';
          link.href = seed.url;
          link.target = '_blank';
          link.rel = 'noopener nofollow';
          link.textContent = 'Seeds: ' + seed.variety + ', ' + seed.seller;
          item.appendChild(link);
        }
        list.appendChild(item);
      });
      section.append(heading, list);
      host.appendChild(section);
    });
  }
  function show(next, replaceNow) {
    month = next;
    if (replaceNow) history.replaceState(null, '', location.pathname);
    else history.replaceState(null, '', '#' + next);
    paintMonths();
    paintLists();
    var current = document.querySelector('#plantMonths [aria-pressed="true"]');
    if (current && current.scrollIntoView) current.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function paintFine() {
    var fine = $('plantFine');
    var bits = [data.frostNote, data.varietyNote, data.disclaimer].filter(Boolean);
    fine.replaceChildren();
    fine.appendChild(document.createTextNode(bits.join(' ')));
    var seedNote = $('plantSeedNote');
    if (seedNote) {
      seedNote.hidden = !data.seedNote;
      seedNote.textContent = data.seedNote || '';
    }
    (data.sources || []).forEach(function (source) {
      fine.appendChild(document.createTextNode(' '));
      var link = document.createElement('a');
      link.href = source.url;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.textContent = source.title;
      fine.appendChild(link);
      fine.appendChild(document.createTextNode('.'));
    });
  }
  var ZONE_FALLBACK = '32927 · Zone 10a · 30 to 35°F';
  function failZone() {
    var node = $('plantZone');
    if (node) node.textContent = ZONE_FALLBACK;
  }
  document.getElementById('yr').textContent = String(new Date().getFullYear());
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () {
    if (ctrl) ctrl.abort();
    else failZone();
  }, 4000);
  fetch('plants.json?v=3', ctrl ? { signal: ctrl.signal } : {}).then(function (res) {
    if (!res.ok) throw new Error('plants');
    return res.json();
  }).then(function (doc) {
    clearTimeout(timer);
    data = doc;
    month = hashMonth() || nowMonth();
    paintZone();
    paintMonths();
    paintLists();
    paintFine();
  }).catch(function () {
    clearTimeout(timer);
    failZone();
  });
})();
