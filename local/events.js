(function () {
  'use strict';
  var TOWNS = ['All', 'Cocoa', 'Cocoa Beach', 'Merritt Island', 'Port Canaveral', 'Titusville', 'Melbourne', 'Viera', 'Rockledge'];
  var CATS = ['All', 'Launches', 'Music', 'Food & Markets', 'Family', 'Outdoors', 'Arts', 'Sports', 'Cruise'];
  var WHEN = ['Today', 'This Weekend', 'Next 7 days'];
  var CACHE = 'mondosupreme.local.ll2.v1';
  var LL2 = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=8';
  var when = 'Today';
  var town = 'All';
  var cat = 'All';
  var fileEvents = [];
  var liveLaunches = null;
  var community = [];
  var fileUpdated = '';
  var fileNote = '';
  var tick = 0;

  function $(id) { return document.getElementById(id); }
  function https(raw) {
    try {
      var url = new URL(String(raw || ''));
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch (e) { return ''; }
  }
  function chip(hostId, name, group, current, set) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = name;
    btn.setAttribute('aria-pressed', name === current ? 'true' : 'false');
    if (group === 'when') btn.setAttribute('role', 'tab');
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(btn.parentNode.children, function (el) { el.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      set(name);
      paint();
    });
    $(hostId).appendChild(btn);
  }
  function etParts(ms) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).formatToParts(new Date(ms));
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return map;
  }
  function offsetAt(ms) {
    var map = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms)).forEach(function (part) { map[part.type] = part.value; });
    var asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
    return asUtc - ms;
  }
  function etLocalToMs(stamp) {
    var bits = String(stamp || '').match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/);
    if (!bits) return NaN;
    var guess = Date.UTC(+bits[1], +bits[2] - 1, +bits[3], +bits[4], +bits[5]);
    return guess - offsetAt(guess);
  }
  function startOfDay(ms) {
    var map = etParts(ms);
    return etLocalToMs(map.year + '-' + map.month + '-' + map.day + 'T00:00');
  }
  function ymd(ms) {
    var map = etParts(ms);
    return map.year + '-' + map.month + '-' + map.day;
  }
  function weekday(ms) {
    return etParts(ms).weekday;
  }
  function windowFor(name, now) {
    var start = startOfDay(now);
    var day = 86400000;
    if (name === 'Today') return [start, start + day];
    if (name === 'This Weekend') {
      var label = weekday(now);
      if (label === 'Sat') return [start, start + 2 * day];
      if (label === 'Sun') return [start, start + day];
      var ahead = { Mon: 5, Tue: 4, Wed: 3, Thu: 2, Fri: 1 }[label] || 6;
      var sat = start + ahead * day;
      return [sat, sat + 2 * day];
    }
    return [start, start + 7 * day];
  }
  function overlaps(ev, range) {
    return ev.start < range[1] && ev.end > range[0];
  }
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function weekdayIndex(ms) {
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday(ms)];
  }
  function dayAt(ms, n) {
    var map = etParts(ms);
    return startOfDay(Date.UTC(+map.year, +map.month - 1, +map.day + n, 12, 0, 0));
  }
  function parseWeekdays(text) {
    var source = String(text || '').toLowerCase();
    var order = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    var days = [];
    function add(day) { if (days.indexOf(day) < 0) days.push(day); }
    var range = source.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[–—-]\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (range) {
      var cursor = order[range[1]];
      var stop = order[range[2]];
      for (var guard = 0; guard < 8; guard++) {
        add(cursor);
        if (cursor === stop) break;
        cursor = (cursor + 1) % 7;
      }
    }
    Object.keys(order).forEach(function (name) {
      if (new RegExp('\\b' + name + 's?\\b').test(source)) add(order[name]);
    });
    return days.length ? days : null;
  }
  function parseHours(text) {
    var match = String(text || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) return null;
    function toMin(hour, minute, ap) {
      hour = +hour;
      minute = +(minute || 0);
      if (ap) {
        ap = ap.toLowerCase();
        if (ap === 'pm' && hour < 12) hour += 12;
        if (ap === 'am' && hour === 12) hour = 0;
      }
      return hour * 60 + minute;
    }
    return [toMin(match[1], match[2], match[3] || match[6]), toMin(match[4], match[5], match[6])];
  }
  function seriesPhrase(days, endMs, selectNights) {
    var through = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric'
    }).format(new Date(endMs));
    if (selectNights) return 'Select nights · through ' + through;
    if (!days || days.length >= 7) return 'Through ' + through;
    if (days.length === 1) return 'Every ' + WEEKDAYS[days[0]] + ' · through ' + through;
    if (days.length === 2 && days.indexOf(0) >= 0 && days.indexOf(6) >= 0) return 'Every Saturday and Sunday · through ' + through;
    return 'Every ' + days.map(function (day) { return WEEKDAYS[day]; }).join(', ') + ' · through ' + through;
  }
  function project(ev, now, range) {
    if (!(ev.end > ev.start)) return null;
    if (ev.end - ev.start <= 30 * 60 * 60 * 1000) {
      if (ev.end <= now) return null;
      if (range && !overlaps(ev, range)) return null;
      return ev;
    }
    var blob = ev.title + ' ' + ev.description;
    var days = parseWeekdays(blob);
    var selectNights = /select nights|each night|every night|nightly/i.test(blob);
    if (!days) days = [0, 1, 2, 3, 4, 5, 6];
    var hours = parseHours(ev.description) || [minutesET(ev.start), minutesET(ev.end)];
    var open = hours[0];
    var close = hours[1];
    if (!(close > open)) close += 24 * 60;
    var seriesEnd = ev.end;
    for (var i = 0; i < 70; i++) {
      var dayStart = dayAt(Math.max(now, ev.start), i);
      if (dayStart > seriesEnd) break;
      if (days.indexOf(weekdayIndex(dayStart)) < 0) continue;
      var occStart = dayStart + open * 60000;
      var occEnd = dayStart + close * 60000;
      if (occStart < ev.start - 60000) continue;
      if (occEnd > seriesEnd + 60000) continue;
      if (occEnd <= now) continue;
      var next = {
        id: ev.id, title: ev.title, start: occStart, end: occEnd, town: ev.town, venue: ev.venue,
        category: ev.category, url: ev.url, description: ev.description, source: ev.source,
        sourceUrl: ev.sourceUrl, kind: ev.kind, uid: ev.uid, mine: ev.mine, series: true,
        seriesLabel: seriesPhrase(selectNights ? null : days, seriesEnd, selectNights)
      };
      if (range && !overlaps(next, range)) continue;
      return next;
    }
    return null;
  }
  function fmt(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(new Date(ms));
  }
  function clock(ms) {
    var diff = ms - Date.now();
    var sign = diff < 0 ? 'T+' : 'T-';
    var abs = Math.abs(diff);
    var d = Math.floor(abs / 86400000);
    var h = Math.floor(abs / 3600000) % 24;
    var m = Math.floor(abs / 60000) % 60;
    var s = Math.floor(abs / 1000) % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return sign + (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function fromFile(row) {
    var start = Date.parse(row.start);
    var end = Date.parse(row.end);
    if (!start) return null;
    if (!end || end <= start) end = start + 2 * 60 * 60 * 1000;
    var link = https(row.url);
    if (!link) return null;
    return {
      id: String(row.id || ''),
      title: String(row.title || '').slice(0, 160),
      start: start,
      end: end,
      town: String(row.town || ''),
      venue: String(row.venue || ''),
      category: String(row.category || 'Family'),
      url: link,
      description: String(row.description || '').slice(0, 400),
      source: String(row.source || 'Public schedule'),
      sourceUrl: https(row.sourceUrl),
      kind: row.kind || (row.category === 'Launches' ? 'launch' : 'event'),
      mine: false
    };
  }
  function fromLaunch(row) {
    var net = Date.parse(row.net || row.window_start || '');
    if (!net) return null;
    var end = Date.parse(row.window_end || '') || net + 60 * 60 * 1000;
    var pad = (row.pad && row.pad.name) || 'Cape Canaveral';
    var rocket = row.rocket && row.rocket.configuration && row.rocket.configuration.name || '';
    var provider = row.launch_service_provider && row.launch_service_provider.name || '';
    var status = row.status && row.status.name || '';
    var link = https(row.url) || 'https://ll.thespacedevs.com/';
    return {
      id: 'll2-' + String(row.id || net),
      title: String(row.name || 'Launch').slice(0, 160),
      start: net,
      end: end,
      town: 'Port Canaveral',
      venue: String(pad),
      category: 'Launches',
      url: link,
      description: [status, provider, rocket, pad].filter(Boolean).join(' · ').slice(0, 400),
      source: 'Launch Library 2',
      sourceUrl: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/',
      kind: 'launch',
      mine: false
    };
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; }
  }
  function writeCache(rows) {
    try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), rows: rows })); } catch (e) {}
  }
  function loadLaunches() {
    var cached = readCache();
    if (cached && cached.rows && Date.now() - cached.at < 20 * 60 * 1000) {
      liveLaunches = cached.rows.map(fromLaunch).filter(Boolean);
      paint();
      return;
    }
    fetch(LL2).then(function (res) {
      if (!res.ok) throw new Error('launch');
      return res.json();
    }).then(function (data) {
      var rows = data.results || [];
      writeCache(rows);
      liveLaunches = rows.map(fromLaunch).filter(Boolean);
      paint();
    }).catch(function () {
      liveLaunches = null;
      paint();
    });
  }
  function loadFile() {
    fetch('/local/events.json', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('file');
      return res.json();
    }).then(function (data) {
      fileUpdated = data.updated || '';
      fileEvents = (data.events || []).map(fromFile).filter(Boolean);
      var bad = (data.sources || []).filter(function (src) { return src && src.ok === false; }).map(function (src) { return src.name; });
      fileNote = bad.length ? 'Some schedules did not refresh: ' + bad.join(', ') + '.' : '';
      paint();
    }).catch(function () {
      fileNote = 'The saved schedule did not load. Live launches and community posts are still checked.';
      paint();
    });
  }
  function listenCommunity() {
    try {
      if (!window.firebase || !firebase.database) return;
      firebase.database().ref('local/events').limitToLast(40).on('value', function (snap) {
        var rows = [];
        snap.forEach(function (child) {
          var val = child.val() || {};
          var start = Number(val.start);
          var link = https(val.url);
          if (!start || !link || !val.title) return;
          rows.push({
            id: child.key,
            title: String(val.title).slice(0, 120),
            start: start,
            end: Number(val.end) > start ? Number(val.end) : start + 2 * 60 * 60 * 1000,
            town: String(val.town || ''),
            venue: String(val.venue || ''),
            category: String(val.category || 'Family'),
            url: link,
            description: String(val.description || '').slice(0, 280),
            source: 'Community',
            sourceUrl: '',
            kind: 'community',
            uid: String(val.uid || ''),
            mine: true
          });
        });
        community = rows;
        paint();
      }, function () {});
    } catch (e) {}
  }
  function combined() {
    var launches = liveLaunches && liveLaunches.length ? liveLaunches : fileEvents.filter(function (ev) { return ev.kind === 'launch'; });
    var rest = fileEvents.filter(function (ev) { return ev.kind !== 'launch'; });
    var seen = {};
    return launches.concat(rest, community).filter(function (ev) {
      var key = ev.title.toLowerCase() + '|' + ymd(ev.start) + '|' + ev.town;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) { return a.start - b.start; });
  }
  function selected(rows) {
    var now = Date.now();
    var range = windowFor(when, now);
    var list = [];
    rows.forEach(function (ev) {
      if (town !== 'All' && ev.town !== town) return;
      if (cat !== 'All' && ev.category !== cat) return;
      var next = project(ev, now, range);
      if (next) list.push(next);
    });
    if (!list.some(function (ev) { return ev.kind === 'launch'; }) && (cat === 'All' || cat === 'Launches')) {
      var next = rows.filter(function (ev) {
        return ev.kind === 'launch' && ev.start > Date.now() && (town === 'All' || ev.town === town);
      })[0];
      if (next && next.start < Date.now() + 21 * 86400000) list.push(next);
    }
    return list;
  }
  function minutesET(ms) {
    var map = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date(ms)).forEach(function (part) { map[part.type] = part.value; });
    return ((+map.hour) % 24) * 60 + (+map.minute);
  }
  function liveNow(ev) {
    var now = Date.now();
    if (now < ev.start || now >= ev.end) return false;
    return ymd(now) === ymd(ev.start) || ymd(now) === ymd(ev.end - 1);
  }
  function badgeParts(ms) {
    var map = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric'
    }).formatToParts(new Date(ms)).forEach(function (part) { map[part.type] = part.value; });
    return { mon: String(map.month || '').toUpperCase(), day: map.day || '' };
  }
  function timeOnly(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'
    }).format(new Date(ms));
  }
  function isAdmin() {
    return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
  }
  function uid() {
    var user = window.firebase && firebase.auth && firebase.auth().currentUser;
    return user && !user.isAnonymous ? user.uid : '';
  }
  function downloadIcs(ev) {
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mondosupreme//Local//EN',
      'BEGIN:VEVENT',
      'DTSTART:' + new Date(ev.start).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTEND:' + new Date(ev.end).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'SUMMARY:' + ev.title.replace(/[,\r\n;\\]/g, ' '),
      'LOCATION:' + (ev.venue || ev.town).replace(/[,\r\n;\\]/g, ' '),
      'URL:' + ev.url,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mondosupreme-event.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  function paint() {
    var host = $('eventList');
    if (!host) return;
    var rows = selected(combined());
    host.textContent = '';
    var updated = $('eventsUpdated');
    if (updated) {
      var whenText = fileUpdated ? 'Schedules checked ' + fmt(Date.parse(fileUpdated)) + ' Eastern.' : 'Waiting on the public schedules.';
      updated.textContent = whenText + (fileNote ? ' ' + fileNote : '');
    }
    var status = $('eventsStatus');
    if (!rows.length) {
      if (status) status.textContent = fileEvents.length || community.length || (liveLaunches && liveLaunches.length)
        ? 'Nothing in this window for those filters.'
        : 'No events are loaded yet. The place list below still works.';
      return;
    }
    if (status) status.textContent = rows.length + (rows.length === 1 ? ' event' : ' events');
    var me = uid();
    rows.forEach(function (ev) {
      var card = document.createElement('article');
      card.className = 'coast-card event-card';
      var row = document.createElement('div');
      row.className = 'event-row';
      var stamp = badgeParts(ev.start);
      var badge = document.createElement('div');
      badge.className = 'event-badge';
      var mon = document.createElement('b');
      mon.textContent = stamp.mon;
      var day = document.createElement('span');
      day.textContent = stamp.day;
      badge.appendChild(mon);
      badge.appendChild(day);
      var main = document.createElement('div');
      main.className = 'event-main';
      var title = document.createElement('h3');
      title.textContent = ev.title;
      if (liveNow(ev)) {
        var live = document.createElement('span');
        live.className = 'event-live';
        live.textContent = 'Live now';
        title.appendChild(document.createTextNode(' '));
        title.appendChild(live);
      }
      var meta = document.createElement('p');
      meta.className = 'event-meta';
      meta.textContent = timeOnly(ev.start) + ' · ' + ev.town + (ev.venue ? ' · ' + ev.venue : '');
      main.appendChild(title);
      main.appendChild(meta);
      if (ev.seriesLabel) {
        var series = document.createElement('p');
        series.className = 'event-series';
        series.textContent = ev.seriesLabel;
        main.appendChild(series);
      }
      row.appendChild(badge);
      row.appendChild(main);
      card.appendChild(row);
      if (ev.kind === 'launch') {
        var count = document.createElement('p');
        count.className = 'event-count';
        count.dataset.launch = String(ev.start);
        count.textContent = clock(ev.start);
        main.appendChild(count);
      }
      if (ev.description) {
        var desc = document.createElement('p');
        desc.className = 'event-desc';
        desc.textContent = ev.description;
        main.appendChild(desc);
        if (ev.description.length > 140) {
          var moreDesc = document.createElement('button');
          moreDesc.type = 'button';
          moreDesc.className = 'event-more';
          moreDesc.textContent = 'More';
          moreDesc.addEventListener('click', function () {
            var open = desc.classList.toggle('is-open');
            moreDesc.textContent = open ? 'Less' : 'More';
          });
          main.appendChild(moreDesc);
        }
      }
      var actions = document.createElement('div');
      actions.className = 'event-actions';
      function act(tag, label, aria) {
        var node = document.createElement(tag);
        node.className = 'btn event-act';
        if (aria) node.setAttribute('aria-label', aria);
        var icon = document.createElement('span');
        icon.className = 'event-ico';
        icon.setAttribute('aria-hidden', 'true');
        var word = document.createElement('span');
        word.textContent = label;
        node.appendChild(icon);
        node.appendChild(word);
        return { node: node, icon: icon };
      }
      var details = act('a', 'Details');
      details.icon.textContent = '↗';
      details.node.href = ev.url;
      details.node.target = '_blank';
      details.node.rel = 'noopener noreferrer';
      actions.appendChild(details.node);
      var maps = act('a', 'Directions');
      maps.icon.textContent = '⌖';
      maps.node.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((ev.venue ? ev.venue + ', ' : '') + ev.town + ', FL');
      maps.node.target = '_blank';
      maps.node.rel = 'noopener noreferrer';
      actions.appendChild(maps.node);
      var cal = act('button', 'Calendar', 'Add to calendar');
      cal.icon.textContent = '+';
      cal.node.type = 'button';
      cal.node.addEventListener('click', function () { downloadIcs(ev); });
      actions.appendChild(cal.node);
      if (ev.kind === 'community' && ev.id && isAdmin()) {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          firebase.database().ref('local/events/' + ev.id).remove().catch(function () {
            $('evStatus').textContent = 'That event stayed up. Publish the latest database rules, then try again.';
          });
        });
        actions.appendChild(remove);
      }
      main.appendChild(actions);
      var source = document.createElement('p');
      source.className = 'event-source';
      source.textContent = 'Source: ' + ev.source;
      if (ev.sourceUrl) {
        source.textContent = 'Source: ';
        var src = document.createElement('a');
        src.href = ev.sourceUrl;
        src.target = '_blank';
        src.rel = 'noopener noreferrer';
        src.textContent = ev.source;
        source.appendChild(src);
      }
      main.appendChild(source);
      host.appendChild(card);
    });
  }
  function syncEventForm() {
    var admin = isAdmin();
    var form = $('eventForm');
    var note = $('eventNote');
    if (form) form.hidden = !admin;
    if (note) note.hidden = admin;
  }
  function post(event) {
    event.preventDefault();
    var status = $('evStatus');
    if (!isAdmin()) { status.textContent = 'Only an admin can post an event.'; return; }
    var user = window.firebase && firebase.auth && firebase.auth().currentUser;
    if (!user || user.isAnonymous) { status.textContent = 'Sign in to post an event.'; return; }
    var title = $('evTitle').value.replace(/\s+/g, ' ').trim().slice(0, 120);
    var venue = $('evVenue').value.replace(/\s+/g, ' ').trim().slice(0, 80);
    var description = $('evDesc').value.replace(/\s+/g, ' ').trim().slice(0, 280);
    var link = https($('evUrl').value.trim());
    var start = etLocalToMs($('evStart').value);
    if (!title || !venue || !link || !start || start <= Date.now()) {
      status.textContent = 'Use a title, venue, an https link, and a start time that is still ahead.';
      return;
    }
    var payload = {
      title: title,
      start: start,
      town: $('evTown').value,
      venue: venue,
      category: $('evCat').value,
      url: link,
      description: description,
      uid: user.uid,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    firebase.database().ref('local/events').push(payload).then(function () {
      $('eventForm').reset();
      fillSelects();
      status.textContent = 'Posted. It shows for everyone who has this page open.';
    }).catch(function () {
      status.textContent = 'The post stayed on this form. Publish the latest database rules, then try again.';
    });
  }
  function fillSelects() {
    var townSel = $('evTown');
    var catSel = $('evCat');
    if (!townSel.options.length) {
      TOWNS.slice(1).forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        townSel.appendChild(opt);
      });
    }
    if (!catSel.options.length) {
      CATS.slice(1).forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        catSel.appendChild(opt);
      });
    }
  }
  function boot() {
    if (!$('eventList')) return;
    WHEN.forEach(function (name) { chip('whenTabs', name, 'when', when, function (value) { when = value; }); });
    TOWNS.forEach(function (name) { chip('eventTowns', name, 'town', town, function (value) { town = value; }); });
    CATS.forEach(function (name) { chip('eventCats', name, 'cat', cat, function (value) { cat = value; }); });
    fillSelects();
    $('eventForm').addEventListener('submit', post);
    document.addEventListener('mondo-owner', function () { syncEventForm(); paint(); });
    syncEventForm();
    document.addEventListener('mondo-member', paint);
    loadFile();
    loadLaunches();
    listenCommunity();
    tick = setInterval(function () {
      document.querySelectorAll('[data-launch]').forEach(function (node) {
        node.textContent = clock(Number(node.dataset.launch));
      });
    }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
