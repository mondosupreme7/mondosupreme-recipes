/* Ask the Butler — keyless brief, Wikipedia, DuckDuckGo, and this site. */
(function () {
  'use strict';
  var PREF_KEY = 'mondosupreme.search.v1';
  var MODES = {
    all: 'All Web & AI',
    cook: 'Cooking & Recipes',
    cruise: 'Cruises & Travel',
    retro: 'Classics',
    tech: 'Tech & Finance',
    site: 'Search Inside Mondosupreme'
  };
  var RADICAL = [
    'What is Perfect Day at CocoCay?',
    'How do I make fluffy buttermilk pancakes?',
    'Which Royal Caribbean ship is Harmony of the Seas?',
    'What was a 56k modem?',
    'How many cups are in a liter?',
    'What is RSI in stock trading?',
    'What is Port Canaveral?',
    'Convert 350 F to C',
    'What is an Oasis-class cruise ship?',
    'What is a Tamagotchi?',
    'How many tablespoons are in a cup?',
    'What is 15% of 80?'
  ];
  var STOP = { the: 1, and: 1, for: 1, how: 1, what: 1, who: 1, why: 1, when: 1, where: 1, is: 1, a: 1, an: 1, of: 1, to: 1, in: 1, on: 1, do: 1, does: 1, can: 1, i: 1, my: 1, with: 1, from: 1, are: 1, was: 1, that: 1, this: 1 };
  var ALIAS = {
    cup: 'cup', cups: 'cup',
    tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
    teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
    milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
    liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
    floz: 'floz',
    ounce: 'oz', ounces: 'oz', oz: 'oz',
    kilogram: 'kg', kilograms: 'kg', kg: 'kg',
    gram: 'g', grams: 'g', g: 'g',
    pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
    kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', km: 'km',
    mile: 'mi', miles: 'mi', mi: 'mi',
    meter: 'm', meters: 'm', metre: 'm', metres: 'm', m: 'm',
    foot: 'ft', feet: 'ft', ft: 'ft',
    celsius: 'c', fahrenheit: 'f', c: 'c', f: 'f'
  };
  var VOL = { cup: 236.588, tbsp: 14.787, tsp: 4.929, ml: 1, l: 1000, floz: 29.574 };
  var MASS = { kg: 1000, g: 1, lb: 453.592, oz: 28.3495 };
  var LEN = { km: 1000, m: 1, mi: 1609.344, ft: 0.3048 };
  var index = [];
  var indexSeen = {};
  var catalogReady = null;
  var authUser = null;
  var isOwner = false;
  var cloudStarted = false;
  var ticket = 0;
  var posted = {};
  var pendingAsk = null;
  var mode = 'all';
  var isPublic = true;
  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cleanQ(value) {
    return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  }
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (e) { return null; }
  }
  function savePref() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ public: isPublic, mode: mode })); }
    catch (e) { /* private mode */ }
  }
  function loadPref() {
    var saved = readJson(PREF_KEY);
    if (saved && MODES[saved.mode]) mode = saved.mode;
    if (saved && typeof saved.public === 'boolean') isPublic = saved.public;
  }
  function fmt(n) {
    if (!isFinite(n)) return '';
    var a = Math.abs(n);
    var d = a >= 100 ? 1 : (a >= 10 ? 2 : 3);
    return n.toFixed(d).replace(/\.?0+$/, '');
  }
  function calc(expr) {
    var s = String(expr || '').replace(/\s+/g, '');
    if (!s || !/^[\d.+\-*/()%]+$/.test(s)) return null;
    if (!/[+\-*/%]/.test(s.slice(1))) return null;
    var out = [];
    var ops = [];
    var i = 0;
    var prev = '';
    function prec(op) { return op === '+' || op === '-' ? 1 : 2; }
    function apply(op) {
      var b = out.pop();
      var a = out.pop();
      if (a == null || b == null) return false;
      if (op === '+') out.push(a + b);
      else if (op === '-') out.push(a - b);
      else if (op === '*') out.push(a * b);
      else if (op === '/') { if (b === 0) return false; out.push(a / b); }
      else if (op === '%') out.push(a % b);
      else return false;
      return true;
    }
    while (i < s.length) {
      var c = s.charAt(i);
      if ((c >= '0' && c <= '9') || c === '.') {
        var j = i + 1;
        while (j < s.length && ((s.charAt(j) >= '0' && s.charAt(j) <= '9') || s.charAt(j) === '.')) j++;
        var num = parseFloat(s.slice(i, j));
        if (!isFinite(num)) return null;
        out.push(num);
        prev = 'n';
        i = j;
        continue;
      }
      if (c === '(') { ops.push(c); prev = '('; i++; continue; }
      if (c === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') { if (!apply(ops.pop())) return null; }
        if (!ops.length || ops.pop() !== '(') return null;
        prev = 'n';
        i++;
        continue;
      }
      if ('+-*/%'.indexOf(c) !== -1) {
        if (prev !== 'n' && c === '-') out.push(0);
        else if (prev !== 'n') return null;
        while (ops.length && ops[ops.length - 1] !== '(' && prec(ops[ops.length - 1]) >= prec(c)) {
          if (!apply(ops.pop())) return null;
        }
        ops.push(c);
        prev = c;
        i++;
        continue;
      }
      return null;
    }
    while (ops.length) {
      var op = ops.pop();
      if (op === '(' || !apply(op)) return null;
    }
    if (out.length !== 1 || !isFinite(out[0])) return null;
    return out[0];
  }
  function canonUnit(raw, fluid, recipe) {
    var word = String(raw || '').toLowerCase().replace(/°/g, '').replace(/\./g, '').replace(/\s+/g, '');
    if (word === 'floz') return 'floz';
    if (word === 'c') return recipe ? 'cup' : 'c';
    if (word === 'f') return 'f';
    var id = ALIAS[word];
    if (id === 'oz' && fluid) return 'floz';
    return id || '';
  }
  function family(id) {
    if (VOL[id]) return 'vol';
    if (MASS[id]) return 'mass';
    if (LEN[id]) return 'len';
    if (id === 'c' || id === 'f') return 'temp';
    return '';
  }
  function toBase(id, n) {
    if (VOL[id]) return n * VOL[id];
    if (MASS[id]) return n * MASS[id];
    if (LEN[id]) return n * LEN[id];
    return n;
  }
  function fromBase(id, n) {
    if (VOL[id]) return n / VOL[id];
    if (MASS[id]) return n / MASS[id];
    if (LEN[id]) return n / LEN[id];
    return n;
  }
  function convertTemp(n, from, to) {
    var c = from === 'f' ? (n - 32) * 5 / 9 : n;
    return to === 'f' ? c * 9 / 5 + 32 : c;
  }
  function siblings(id) {
    if (id === 'c' || id === 'f') return id === 'c' ? ['f'] : ['c'];
    var table = VOL[id] ? VOL : MASS[id] ? MASS : LEN[id] ? LEN : null;
    if (!table) return [];
    return Object.keys(table).filter(function (k) { return k !== id; }).slice(0, 4);
  }
  function unitLabel(id) {
    return { cup: 'cups', tbsp: 'tbsp', tsp: 'tsp', ml: 'ml', l: 'L', floz: 'fl oz', kg: 'kg', g: 'g', lb: 'lb', oz: 'oz', km: 'km', m: 'm', mi: 'mi', ft: 'ft', c: '°C', f: '°F' }[id] || id;
  }
  function parseTools(q) {
    var tools = [];
    var seen = {};
    function add(tool) {
      var key = tool.label + '|' + tool.value;
      if (seen[key]) return;
      seen[key] = 1;
      tools.push(tool);
    }
    var pct = q.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/i);
    if (pct) {
      var pv = parseFloat(pct[1]) / 100 * parseFloat(pct[2]);
      add({ label: pct[1] + '% of ' + pct[2], value: fmt(pv), detail: 'Percent of a number.' });
    }
    var howMany = q.match(/how many\s+([a-z. ]+?)\s+(?:are\s+)?in\s+(?:an?\s+)?(?:(\d+(?:\.\d+)?)\s*)?([a-z. °]+)/i);
    if (howMany) {
      var recipeQ = mode === 'cook' || /cup|tbsp|tsp|flour|butter|recipe|ml|liter|litre/i.test(q);
      var dest = canonUnit(howMany[1], /fl/.test(howMany[1]), recipeQ);
      var src = canonUnit(howMany[3], /fl/.test(howMany[3]), recipeQ);
      var count = howMany[2] ? parseFloat(howMany[2]) : 1;
      if (dest && src && family(dest) && family(dest) === family(src)) {
        var base = family(dest) === 'temp' ? convertTemp(count, src, dest) : fromBase(dest, toBase(src, count));
        add({ label: fmt(count) + ' ' + unitLabel(src) + ' → ' + unitLabel(dest), value: fmt(base) + ' ' + unitLabel(dest), detail: 'Recipe and unit converter.' });
      }
    }
    var expr = q.replace(/,/g, '').match(/\(?-?\d[\d\s.+\-*/()%]*/);
    if (expr && /[+\-*/%]/.test(expr[0].replace(/^\s*-/, ''))) {
      var value = calc(expr[0]);
      if (value != null && !pct) add({ label: expr[0].replace(/\s+/g, ' ').trim(), value: fmt(value), detail: 'Calculated on this computer. Nothing left the browser.' });
    }
    var re = /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|cups?|tablespoons?|tbsp|teaspoons?|tsp|millilit(?:er|re)s?|ml|lit(?:er|re)s?|kilograms?|kg|grams?|pounds?|lbs?|ounces?|oz|kilometers?|kilometres?|km|miles?|mi|met(?:er|re)s?|feet|foot|ft|°\s*[cf]|celsius|fahrenheit|[cf])\b/ig;
    var match;
    var guard = 0;
    while ((match = re.exec(q)) && guard < 4) {
      guard++;
      var recipe = mode === 'cook' || /cup|tbsp|tsp|flour|butter|recipe|ml|liter|litre/i.test(q);
      var fluid = /fl/i.test(match[2]) || /(?:to|in|into)\s+(?:cups?|ml|millilit|lit|tbsp|tsp)/i.test(q);
      var from = canonUnit(match[2], fluid, recipe);
      if (!from) continue;
      var n = parseFloat(match[1]);
      var targetWord = '';
      var after = q.slice(match.index + match[0].length);
      var target = after.match(/^\s*(?:to|in|into)\s+(fl\.?\s*oz|cups?|tablespoons?|tbsp|teaspoons?|tsp|millilit(?:er|re)s?|ml|lit(?:er|re)s?|kilograms?|kg|grams?|pounds?|lbs?|ounces?|oz|kilometers?|kilometres?|km|miles?|mi|met(?:er|re)s?|feet|foot|ft|°\s*[cf]|celsius|fahrenheit|[cf])\b/i);
      if (target) targetWord = canonUnit(target[1], /fl/i.test(target[1]), recipe || !!VOL[from]);
      var list = targetWord && family(targetWord) === family(from) ? [targetWord] : siblings(from);
      if (from === 'oz' && !targetWord) list = ['g', 'lb'];
      var bits = [];
      list.forEach(function (to) {
        if (to === from) return;
        var out;
        if (family(from) === 'temp') out = convertTemp(n, from, to);
        else if (family(from) && family(from) === family(to)) out = fromBase(to, toBase(from, n));
        else return;
        bits.push(fmt(out) + ' ' + unitLabel(to));
      });
      if (bits.length) add({ label: fmt(n) + ' ' + unitLabel(from), value: bits.join(' · '), detail: 'Math, units, and recipe measures.' });
    }
    return tools;
  }
  function tokens(q) {
    var out = [];
    q.toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length > 1 && !STOP[w]) out.push(w);
    });
    return out;
  }
  function addItem(item) {
    if (!item || !item.title || !item.href) return;
    var key = item.kind + '|' + item.title.toLowerCase().replace(/^sample:\s*/, '');
    if (indexSeen[key]) return;
    indexSeen[key] = 1;
    item.text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    item.title = String(item.title).replace(/\s+/g, ' ').trim().slice(0, 160);
    index.push(item);
  }
  function eachRecord(raw, fn) {
    if (!raw) return;
    if (Array.isArray(raw)) { raw.forEach(function (row) { fn(row); }); return; }
    if (typeof raw !== 'object') return;
    if (raw.threads && raw.threads !== raw) { eachRecord(raw.threads, fn); return; }
    if (raw.items && raw.items !== raw) { eachRecord(raw.items, fn); return; }
    if (raw.pages && raw.pages !== raw) { eachRecord(raw.pages, fn); return; }
    Object.keys(raw).forEach(function (key) { fn(raw[key], key); });
  }
  function textOf(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(textOf).join(' ');
    if (typeof value === 'string') return value;
    return '';
  }
  function seedStatic() {
    [
      ['App', 'Home', '/', 'landing welcome mondosupreme'],
      ['App', 'Recipes', '/recipes/', 'kitchen cookbook mastercook food dinner'],
      ['App', 'Recipe TV', '/daily-recipe/', 'daily youtube recipe show chef'],
      ['App', 'Cruises', '/cruises/', 'royal caribbean ships harbor port canaveral'],
      ['App', 'Weather', '/weather/', 'doppler radar forecast cocoa local on the 8s'],
      ['App', 'Word Game', '/wordle/', 'daily wordle five letter puzzle'],
      ['App', 'AI Search', '/search/', 'ask mondo jeeves cyber butler search engine'],
      ['App', 'Stocks', '/stocks/', 'oversold rsi swing screen finance'],
      ['App', 'Wiki', '/wiki/', 'encarta notes how-to notebook'],
      ['App', 'Drawing Board', '/board/', 'ms paint shared whiteboard'],
      ['App', 'Chat', '/chat/', 'aim chat room talk'],
      ['App', 'Arcade', '/arcade/', '90s games neon cabinet'],
      ['App', 'Virtual Pet', '/pet/', 'virtual pet egg tamagotchi'],
      ['App', 'Forum', '/forum/', 'bulletin board posts blog'],
      ['App', 'Marketplace', '/market/', 'classifieds for sale ebay listings'],
      ['App', 'Mystic 8-Ball', '/8ball/', 'magic eight ball fortune'],
      ['App', 'Craft', '/mmo/', 'pixel mmo realm'],
      ['App', 'Half-Strike', '/fps/', 'goldsrc fps labs'],
      ['App', 'CINDERLATCH', '/escape/', 'cinderlatch escape door'],
      ['App', 'Planting', '/planting/', 'garden planting zone 10a 32927 cocoa vegetables herbs flowers fruit calendar']
    ].forEach(function (row) { addItem({ kind: row[0], title: row[1], href: row[2], text: row[3] }); });
    [
      ['sample-1', 'Supreme Tomato Basil Pasta', 'Dinner pasta tomatoes basil garlic vegetarian', '400 g spaghetti, olive oil, garlic, San Marzano tomatoes, basil, Parmesan'],
      ['sample-2', 'Fluffy Buttermilk Pancakes', 'Breakfast brunch pancakes buttermilk maple syrup', '2 cups flour, sugar, baking powder, buttermilk, eggs, melted butter'],
      ['sample-3', 'Chickpea Coconut Curry', 'Dinner vegan curry chickpeas coconut milk spinach rice', 'onion, garlic, ginger, curry powder, chickpeas, coconut milk, tomatoes']
    ].forEach(function (row) {
      addItem({ kind: 'Recipe', title: row[1], href: '/recipes/#/recipe/' + row[0], text: row[2] + ' ' + row[3] });
    });
  }
  function absorbLocal() {
    eachRecord(readJson('mondosupreme.recipes.v1'), function (row) {
      if (!row || typeof row !== 'object') return;
      delete row.photo;
      if (!row.title) return;
      addItem({ kind: 'Recipe', title: row.title, href: '/recipes/#/recipe/' + encodeURIComponent(row.id || ''), text: [row.category, textOf(row.ingredients), textOf(row.steps), row.notes, textOf(row.tags)].join(' ') });
    });
    eachRecord(readJson('mondosupreme.wiki.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Wiki', title: row.title, href: '/wiki/#/page/' + encodeURIComponent(row.id || ''), text: textOf(row.body).slice(0, 400) });
    });
    eachRecord(readJson('mondosupreme.forum.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Forum', title: row.title, href: '/forum/#/t/' + encodeURIComponent(row.id || ''), text: [row.category, row.body, row.name].join(' ') });
    });
    eachRecord(readJson('mondosupreme.market.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Marketplace', title: row.title, href: '/market/#/item/' + encodeURIComponent(row.id || ''), text: [row.category, row.price, row.description, row.location].join(' ') });
    });
  }
  function loadJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('catalog');
      return res.json();
    });
  }
  function loadCatalog() {
    if (catalogReady) return catalogReady;
    catalogReady = Promise.all([
      loadJson('/cruises/fleet.json').then(function (data) {
        (data.ships || []).forEach(function (ship) {
          addItem({ kind: 'Ship', title: ship.name, href: '/cruises/', text: 'Royal Caribbean ' + ship.class + ' class ' + (ship.year || '') + ' cruise ship' });
        });
      }).catch(function () {}),
      loadJson('/cruises/canaveral-deals.json').then(function (data) {
        (data.deals || []).forEach(function (deal) {
          addItem({
            kind: 'Deal',
            title: (deal.ship ? deal.ship + ' — ' : '') + (deal.title || 'Port Canaveral sailing'),
            href: deal.url || '/cruises/',
            external: !!deal.url,
            text: [deal.portsLabel, deal.sailDate, deal.nights ? deal.nights + ' nights' : '', deal.startingPrice ? '$' + deal.startingPrice : '', 'Port Canaveral'].join(' ')
          });
        });
      }).catch(function () {})
    ]);
    return catalogReady;
  }
  function absorbCloud() {
    if (cloudStarted || !authUser || !window.firebase || !firebase.database) return;
    cloudStarted = true;
    var db = firebase.database();
    function take(path, map) {
      db.ref(path).limitToLast(24).once('value').then(function (snap) {
        var val = snap.val() || {};
        Object.keys(val).forEach(function (key) {
          var row = val[key];
          if (!row || typeof row !== 'object') return;
          delete row.photo;
          delete row.image;
          delete row.thumbnail;
          map(row, key);
        });
      }).catch(function () {});
    }
    take('recipes/items', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Recipe', title: row.title, href: '/recipes/#/recipe/' + encodeURIComponent(row.id || key), text: [row.category, textOf(row.ingredients), row.notes].join(' ') });
    });
    take('wiki/items', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Wiki', title: row.title, href: '/wiki/#/page/' + encodeURIComponent(row.id || key), text: textOf(row.body).slice(0, 400) });
    });
    take('forum/threads', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Forum', title: row.title, href: '/forum/#/t/' + encodeURIComponent(row.id || key), text: [row.category, row.body].join(' ') });
    });
    take('market/items', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Marketplace', title: row.title, href: '/market/#/item/' + encodeURIComponent(row.id || key), text: [row.category, row.price, row.description, row.location, row.sold ? 'sold' : ''].join(' ') });
    });
  }
  function scoreItem(item, q, toks) {
    var title = item.title.toLowerCase();
    var hay = title + ' ' + item.text.toLowerCase();
    var s = 0;
    if (q && title.indexOf(q.toLowerCase()) !== -1) s += 12;
    toks.forEach(function (t) {
      if (title.indexOf(t) !== -1) s += 5;
      else if (hay.indexOf(t) !== -1) s += 2;
    });
    if (s <= 0) return 0;
    if (mode === 'cook' && item.kind === 'Recipe') s += 4;
    if (mode === 'cruise' && (item.kind === 'Ship' || item.kind === 'Deal' || item.href === '/cruises/')) s += 4;
    if (mode === 'retro' && item.kind === 'App' && /arcade|pet|word|8-ball|chat|board/i.test(item.text + item.title)) s += 3;
    if (mode === 'tech' && /stock|wiki|rsi|search/i.test(item.text + item.title)) s += 3;
    return s;
  }
  function siteHits(q) {
    var toks = tokens(q);
    var ranked = [];
    index.forEach(function (item) {
      var s = scoreItem(item, q, toks);
      if (s > 0) ranked.push({ item: item, s: s });
    });
    ranked.sort(function (a, b) { return b.s - a.s || a.item.title.localeCompare(b.item.title); });
    var picked = [];
    var per = {};
    function take(row, cap) {
      var n = per[row.item.kind] || 0;
      if (n >= cap) return;
      per[row.item.kind] = n + 1;
      picked.push(row.item);
    }
    ranked.forEach(function (row) { if (picked.length < 8) take(row, 2); });
    ranked.forEach(function (row) {
      if (picked.length >= 8) return;
      if (picked.indexOf(row.item) === -1) picked.push(row.item);
    });
    return picked.slice(0, 8);
  }
  function safeUrl(url) {
    if (!url) return '';
    try {
      var u = new URL(url, location.origin);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* drop it */ }
    return '';
  }
  function allowImg(url) {
    try {
      var host = new URL(url).hostname;
      return /(^|\.)wikipedia\.org$/.test(host) || /(^|\.)wikimedia\.org$/.test(host) || host === 'api.duckduckgo.com' || host === 'text.pollinations.ai';
    } catch (e) { return false; }
  }
  function sentences(text, n) {
    var parts = String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [];
    if (!parts.length && text) parts = [String(text)];
    return parts.map(function (s) { return s.trim(); }).filter(Boolean).slice(0, n);
  }
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      promise.then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      });
    });
  }
  function fetchWiki(q) {
    var url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&origin=*&srlimit=4&srsearch=' + encodeURIComponent(q);
    return fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      var hits = ((data.query || {}).search || []).slice(0, 4);
      return Promise.all(hits.map(function (hit) {
        var title = hit.title;
        var summaryUrl = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'));
        return fetch(summaryUrl).then(function (res) { return res.ok ? res.json() : null; }).then(function (sum) {
          return {
            title: title,
            snippet: (sum && sum.extract) || hit.snippet.replace(/<[^>]+>/g, ''),
            url: (sum && sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page) || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'))),
            thumb: sum && sum.thumbnail && sum.thumbnail.source,
            description: sum && sum.description
          };
        }).catch(function () {
          return { title: title, snippet: hit.snippet.replace(/<[^>]+>/g, ''), url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) };
        });
      }));
    });
  }
  function flattenDDG(topics, out) {
    (topics || []).forEach(function (topic) {
      if (!topic) return;
      if (topic.Topics) flattenDDG(topic.Topics, out);
      else if (topic.Text && topic.FirstURL) out.push({ title: topic.Text, url: topic.FirstURL, snippet: topic.Text });
    });
    return out;
  }
  function fetchDDG(q) {
    var url = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=' + encodeURIComponent(q);
    return fetch(url).then(function (res) { return res.text(); }).then(function (text) {
      var data = JSON.parse(text);
      var related = flattenDDG(data.RelatedTopics, []).slice(0, 5);
      return {
        heading: data.Heading || '',
        abstract: data.AbstractText || '',
        url: data.AbstractURL || '',
        image: data.Image || '',
        related: related
      };
    });
  }
  function askModel(q) {
    var system = 'You are Ask the Butler, the cyber-butler of Mondosupreme.com, a retro personal site about recipes, Royal Caribbean cruises, weather, word puzzles, and retro web toys. Answer in two short plain-text paragraphs. Then list three key facts, each starting with a dash. Finish with one line of three real follow-up questions about the user topic, separated by vertical bars, in this shape: FOLLOWUPS: a specific question | another specific question | a third specific question. Replace those placeholders with questions a visitor would actually ask. Do not invent citations. If you are unsure, say so in one sentence. No markdown headings.';
    var user = 'Mode: ' + (MODES[mode] || 'All Web & AI') + '. Question: ' + q;
    var body = JSON.stringify({ model: 'openai', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    return fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function (res) { return res.text(); }).then(function (text) {
      var content = text;
      try {
        var data = JSON.parse(text);
        content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || text;
      } catch (e) { /* plain text */ }
      return String(content || '').trim();
    }).catch(function () {
      var prompt = system + ' ' + user;
      if (prompt.length > 900) return '';
      return fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt)).then(function (res) { return res.ok ? res.text() : ''; }).catch(function () { return ''; });
    });
  }
  function parseModel(text) {
    var raw = String(text || '').trim();
    var chips = [];
    var mark = raw.match(/FOLLOWUPS:\s*(.+)$/im);
    if (mark) {
      chips = mark[1].split('|').map(function (s) { return cleanQ(s).replace(/^["']|["']$/g, ''); }).filter(function (s) {
        return s.length > 8 && !/^(a |another |a third )?(first|second|third|specific) question/i.test(s) && !/^question about\b/i.test(s);
      }).slice(0, 3);
      raw = raw.slice(0, mark.index).trim();
    }
    var facts = [];
    var paras = [];
    raw.split(/\n+/).forEach(function (line) {
      var t = line.replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (/^[-*•]\s+/.test(t)) facts.push(t.replace(/^[-*•]\s+/, ''));
      else paras.push(t);
    });
    return { paragraphs: paras.slice(0, 3), facts: facts.slice(0, 4), chips: chips };
  }
  function paintTools(tools) {
    var win = $('toolWin');
    var body = $('toolBody');
    if (!tools.length) { win.hidden = true; body.innerHTML = ''; return; }
    win.hidden = false;
    body.innerHTML = tools.map(function (tool) {
      return '<article class="tool-card"><strong>' + esc(tool.value) + '</strong><p>' + esc(tool.label) + '</p><p class="hit-meta">' + esc(tool.detail) + '</p></article>';
    }).join('');
  }
  function paintChips(list) {
    var bar = $('chipBar');
    if (!list.length) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = list.map(function (q) {
      return '<button class="btn chip" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');
  }
  function paintHits(body, hits, empty) {
    if (!hits.length) { body.innerHTML = '<p class="ask-empty">' + esc(empty) + '</p>'; return; }
    body.innerHTML = '<ul class="hit-list">' + hits.map(function (hit) {
      var href = safeUrl(hit.url || hit.href);
      var img = hit.thumb && allowImg(hit.thumb) ? '<img alt="" src="' + esc(hit.thumb) + '">' : '<img alt="" src="/favicon.ico">';
      var ext = hit.external || (href && href.indexOf(location.host) === -1);
      var attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<li class="hit">' + img + '<div><p class="hit-kind">' + esc(hit.kind || 'Web') + '</p><p class="hit-title"><a href="' + esc(href) + '"' + attrs + '>' + esc(hit.title) + '</a></p><p>' + esc(hit.snippet || hit.text || '') + '</p></div></li>';
    }).join('') + '</ul>';
  }
  function paintDeep(q) {
    var row = $('deepRow');
    var links = [
      ['Google', 'https://www.google.com/search?q='],
      ['DuckDuckGo', 'https://duckduckgo.com/?q='],
      ['Perplexity', 'https://www.perplexity.ai/search?q='],
      ['YouTube', 'https://www.youtube.com/results?search_query=']
    ];
    $('deepWin').hidden = false;
    row.innerHTML = links.map(function (link) {
      return '<a target="_blank" rel="noopener noreferrer" href="' + esc(link[1] + encodeURIComponent(q)) + '">' + esc(link[0]) + '</a>';
    }).join('');
  }
  function renderLocal(q, pack) {
    var tools = parseTools(q);
    paintTools(tools);
    var wiki = pack.wiki || [];
    var ddg = pack.ddg || { abstract: '', related: [], heading: '', url: '' };
    var sites = pack.sites || [];
    var facts = [];
    var paragraphs = [];
    if (tools.length) paragraphs.push(tools.map(function (t) { return t.label + ' = ' + t.value; }).join(' '));
    if (wiki[0] && wiki[0].snippet) {
      sentences(wiki[0].snippet, 2).forEach(function (s) { facts.push(s); });
      paragraphs.push(wiki[0].snippet);
    }
    if (ddg.abstract) {
      paragraphs.push(ddg.abstract);
      if (!facts.length) sentences(ddg.abstract, 2).forEach(function (s) { facts.push(s); });
    }
    if (mode === 'site') {
      paragraphs = [];
      facts = sites.slice(0, 3).map(function (s) { return s.title + ' — ' + s.text; });
      paragraphs.push(sites.length ? 'The butler looked only inside Mondosupreme and found ' + sites.length + ' matching corner' + (sites.length === 1 ? '' : 's') + '.' : 'The butler looked through Mondosupreme and did not find a close match. Try a ship name, a recipe, or an app.');
    }
    if (!paragraphs.length) paragraphs.push('The butler is still pulling the wires. The notes below fill in as soon as a source answers.');
    var cites = [];
    wiki.forEach(function (hit) { if (hit.url) cites.push({ title: hit.title + ' — Wikipedia', url: hit.url }); });
    if (ddg.url) cites.push({ title: (ddg.heading || 'DuckDuckGo instant answer'), url: ddg.url });
    sites.slice(0, 3).forEach(function (hit) { cites.push({ title: hit.title + ' — Mondosupreme', url: hit.href }); });
    var html = '';
    html += '<div class="brief-local"><h3>Ground truth</h3>' + paragraphs.slice(0, 3).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    if (facts.length) html += '<ul class="fact-list">' + facts.slice(0, 4).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
    if (cites.length) html += '<ul class="cite-list">' + cites.map(function (c) {
      var href = safeUrl(c.url);
      var ext = href.indexOf(location.host) === -1;
      return '<li><a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(c.title) + '</a></li>';
    }).join('') + '</ul>';
    html += '</div>';
    $('briefBody').innerHTML = html;
    var chips = [];
    wiki.slice(1, 4).forEach(function (hit) { chips.push('What is ' + hit.title + '?'); });
    (ddg.related || []).slice(0, 2).forEach(function (hit) {
      var bit = String(hit.title || '').split(' - ')[0].trim();
      if (bit && bit.length < 80) chips.push(bit.charAt(0).toUpperCase() + bit.slice(1));
    });
    if (mode === 'site') sites.slice(0, 3).forEach(function (hit) { chips.push(hit.title); });
    paintChips(chips.slice(0, 4));
    paintHits($('siteBody'), sites.map(function (hit) {
      return { kind: hit.kind, title: hit.title, url: hit.href, snippet: hit.text, external: hit.external };
    }), 'No Mondosupreme page matched those words.');
    var web = wiki.map(function (hit) {
      return { kind: 'Wikipedia', title: hit.title, url: hit.url, snippet: hit.description || sentences(hit.snippet, 1)[0] || '', thumb: hit.thumb };
    });
    if (ddg.abstract) web.unshift({ kind: 'DuckDuckGo', title: ddg.heading || q, url: ddg.url || 'https://duckduckgo.com/?q=' + encodeURIComponent(q), snippet: ddg.abstract, external: true });
    (ddg.related || []).forEach(function (hit) {
      web.push({ kind: 'DuckDuckGo', title: hit.title.split(' - ')[0], url: hit.url, snippet: hit.snippet, external: true });
    });
    if (mode === 'site') {
      $('webBody').innerHTML = '<p class="ask-empty">This mode stays inside Mondosupreme. Switch to All Web &amp; AI for Wikipedia and DuckDuckGo.</p>';
    } else {
      paintHits($('webBody'), web.slice(0, 8), 'The web sources did not answer. The brief above still uses this site.');
    }
    paintDeep(q);
    return chips;
  }
  function renderAi(parsed, localChips) {
    if (!parsed || (!parsed.paragraphs.length && !parsed.facts.length)) return;
    var block = document.createElement('div');
    block.className = 'brief-ai';
    block.innerHTML = '<h3>Cyber-Butler</h3>' + parsed.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (parsed.facts.length ? '<ul class="fact-list">' + parsed.facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '');
    var body = $('briefBody');
    if (body.firstChild) body.insertBefore(block, body.firstChild);
    else body.appendChild(block);
    if (parsed.chips.length) paintChips(parsed.chips);
    else if (!localChips.length) paintChips(parsed.chips);
  }
  function rememberUrl(q) {
    if (!history.replaceState) return;
    var url = '/search/?q=' + encodeURIComponent(q) + '&mode=' + encodeURIComponent(mode);
    history.replaceState(null, '', url);
  }
  function postAsk(q) {
    if (!isPublic) return;
    var key = q.toLowerCase();
    var now = Date.now();
    if (posted[key] && now - posted[key] < 120000) return;
    if (!window.firebase || !firebase.database || !authUser) { pendingAsk = q; return; }
    posted[key] = now;
    pendingAsk = null;
    firebase.database().ref('search/asks').push({
      q: q,
      mode: mode,
      uid: authUser.uid,
      at: firebase.database.ServerValue.TIMESTAMP
    }).catch(function () { /* The public wire waits until the rules are published. */ });
  }
  var siteMemo = {};
  function getJSON(url) {
    if (siteMemo[url]) return siteMemo[url];
    siteMemo[url] = fetch(url).then(function (res) {
      if (!res.ok) throw new Error('status');
      return res.json();
    });
    return siteMemo[url];
  }
  function siteIntent(q) {
    var s = q.toLowerCase();
    if (/launch|liftoff|cape|rocket|falcon|artemis|spacex/.test(s)) return 'launch';
    if (/tide|high tide|low tide/.test(s)) return 'tide';
    if (/stock|ticker|buy zone|oversold|screener/.test(s) || /why/.test(s) && /list|pick|stock|screen/.test(s)) return 'stock';
    if (/\b(plant|planting|garden|sow)\b/.test(s) || (/32927/.test(s) && /\b(grow|growing)\b/.test(s))) return 'plant';
    if (/recipe|cook|chicken|beef|pork|dinner|dish|pasta|ingredient|backyard|chef/.test(s)) return 'recipe';
    return '';
  }
  function briefHtml(title, paragraphs, links) {
    return '<div class="brief-local"><h3>' + esc(title) + '</h3>' +
      paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (links && links.length ? '<ul class="cite-list">' + links.map(function (link) {
        return '<li><a href="' + esc(link[1]) + '">' + esc(link[0]) + '</a></li>';
      }).join('') + '</ul>' : '') + '</div>';
  }
  function outsideBrief() {
    return briefHtml('On this site', [
      'The butler answers the next Cape launch, tonight\'s Port Canaveral tide, a recipe from the kitchen, why the top stock is on the list, and what to plant in 32927. That question is outside those notes.'
    ], [['Launches', '/launches/'], ['Tides', '/tides/'], ['Recipes', '/recipes/'], ['Stocks', '/stocks/'], ['Planting', '/planting/'], ['Weather', '/weather/']]);
  }
  function answerLaunch() {
    return getJSON('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=8').then(function (data) {
      var best = null;
      (data.results || []).forEach(function (row) {
        var when = new Date(row.net || row.window_start || '');
        if (isNaN(when.getTime()) || when.getTime() < Date.now() - 3600000) return;
        if (!best || when < best.when) best = { when: when, name: row.name || 'Launch', pad: (row.pad && row.pad.name) || 'the Cape' };
      });
      if (!best) throw new Error('empty');
      var ms = best.when.getTime() - Date.now();
      var hours = Math.floor(Math.abs(ms) / 3600000);
      var mins = Math.floor(Math.abs(ms) / 60000) % 60;
      var phrase = hours > 0 ? 'in ' + hours + 'h ' + mins + 'm' : 'in ' + mins + 'm';
      return {
        status: 'The next Cape launch is on the card.',
        html: briefHtml('Next launch', [best.name + ' from ' + best.pad + ', ' + phrase + '.'], [['Launch calendar', '/launches/']])
      };
    }).catch(function () {
      return {
        status: 'The launch wire did not answer. The calendar is still there.',
        html: briefHtml('Next launch', ['The launch list did not answer just now. The Cape calendar is on the Launches page.'], [['Launch calendar', '/launches/']])
      };
    });
  }
  function answerTide() {
    var start = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()).replace(/-/g, '');
    var url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8721604&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json&begin_date=' + start + '&range=48';
    return getJSON(url).then(function (data) {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (part) { map[part.type] = part.value; });
      var nowKey = map.year + '-' + map.month + '-' + map.day + ' ' + map.hour + ':' + map.minute;
      var next = null;
      (data.predictions || []).forEach(function (row) {
        var match = String(row.t || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        if (!match) return;
        var key = match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5];
        if (key < nowKey) return;
        if (!next || key < next.key) next = { key: key, hour: Number(match[4]), minute: match[5], type: row.type, v: Number(row.v) };
      });
      if (!next) throw new Error('empty');
      var clock = ((next.hour % 12) || 12) + ':' + next.minute + (next.hour >= 12 ? ' PM' : ' AM');
      var kind = next.type === 'H' ? 'High' : 'Low';
      return {
        status: 'Tonight\'s Port Canaveral tide is on the card.',
        html: briefHtml('Port Canaveral tide', [kind + ' tide ' + clock + ', ' + next.v.toFixed(1) + ' ft.'], [['Tide & Surf', '/tides/']])
      };
    }).catch(function () {
      return {
        status: 'The tide station did not answer.',
        html: briefHtml('Port Canaveral tide', ['The tide station did not answer just now. Highs and lows are on the Tide page.'], [['Tide & Surf', '/tides/']])
      };
    });
  }
  function answerStock() {
    return getJSON('/stocks/oversold.json').then(function (data) {
      var list = (data.stocks || []).filter(function (row) { return row && row.symbol && typeof row.price === 'number'; });
      list.sort(function (a, b) {
        var aSwing = a.swingEligible && typeof a.swingScore === 'number' && a.swingScore >= 20 ? 1 : 0;
        var bSwing = b.swingEligible && typeof b.swingScore === 'number' && b.swingScore >= 20 ? 1 : 0;
        if (aSwing !== bSwing) return bSwing - aSwing;
        var left = typeof a.rankScore === 'number' ? a.rankScore : (a.score || 0);
        var right = typeof b.rankScore === 'number' ? b.rankScore : (b.score || 0);
        return right - left || String(a.symbol).localeCompare(String(b.symbol));
      });
      var row = list[0];
      if (!row) throw new Error('empty');
      var because = row.swingEligible ? 'it is a swing-bottom setup' : 'it leads the latest screen';
      if (typeof row.rankScore === 'number') because += ', rank ' + String(row.rankScore).replace(/\.0$/, '');
      var signals = (row.swingSignals || []).filter(function (label) {
        return label !== 'Near 52w low' && label !== 'Pullback from high' && label !== 'Uptrend pullback';
      }).slice(0, 3);
      if (signals.length) because += ', ' + signals.join(', ');
      var change = '';
      if (typeof row.dayChange === 'number') {
        change = ' ' + (row.dayChange > 0 ? '+' : '') + row.dayChange.toFixed(1).replace(/\.0$/, '') + '% today.';
      }
      var zone = (typeof row.entryLow === 'number' && typeof row.entryHigh === 'number')
        ? ' Buy zone $' + row.entryLow.toFixed(2) + '–$' + row.entryHigh.toFixed(2) + '.' : '';
      var stop = typeof row.stop === 'number' ? ' Stop $' + row.stop.toFixed(2) + '.' : '';
      var target = typeof row.target === 'number' ? ' Target $' + row.target.toFixed(2) + '.' : '';
      var sentence = row.symbol + ' is the top name because ' + because + '. Last $' + row.price.toFixed(2) + '.' + change + zone + stop + target + ' Informational only, not financial advice.';
      return {
        status: row.symbol + ' is the top name on the screen.',
        html: briefHtml('Top stock', [sentence], [['Stocks', '/stocks/']])
      };
    }).catch(function () {
      return {
        status: 'The stock screen did not answer.',
        html: briefHtml('Top stock', ['The screener file did not answer just now. The list is on the Stocks page.'], [['Stocks', '/stocks/']])
      };
    });
  }
  function answerRecipe(q) {
    return getJSON('/recipes/collections/backyard-chef-index.json').then(function (data) {
      var words = q.toLowerCase().split(/[^a-z0-9]+/).filter(function (word) {
        return word.length > 2 && !/^(the|and|for|from|with|dish|recipe|cook|what|whats|how|tonight|some|any)$/.test(word);
      });
      var best = null;
      var bestScore = 0;
      (data.items || []).forEach(function (item) {
        var title = String(item[1] || '').toLowerCase();
        var blob = title + ' ' + String(item[2] || '') + ' ' + String(item[6] || '') + ' ' + String(item[7] || '');
        var score = 0;
        words.forEach(function (word) {
          if (title.indexOf(word) !== -1) score += 3;
          else if (blob.indexOf(word) !== -1) score += 1;
        });
        if (score > bestScore) { bestScore = score; best = item; }
      });
      if (!best || !bestScore) {
        return {
          status: 'No recipe in the kitchen matched that.',
          html: briefHtml('Recipes', ['Nothing in the Backyard Chef cards matched those words. Search the recipe box directly.'], [['Recipes', '/recipes/']])
        };
      }
      var snippet = String(best[6] || '').replace(/\s+/g, ' ').trim();
      if (snippet.length > 140) snippet = snippet.slice(0, 137) + '…';
      var where = [best[7], best[2]].filter(Boolean).join(' · ');
      var line = best[1] + (where ? ' (' + where + ').' : '.');
      if (snippet) line += ' The card starts: ' + snippet;
      return {
        status: 'A matching recipe is on the card.',
        html: briefHtml('Recipe', [line], [['Open the recipe', '/recipes/#/recipe/' + encodeURIComponent(best[0])]])
      };
    }).catch(function () {
      return {
        status: 'The recipe box did not answer.',
        html: briefHtml('Recipes', ['The recipe index did not answer just now. The kitchen is on the Recipes page.'], [['Recipes', '/recipes/']])
      };
    });
  }
  function answerPlant() {
    return getJSON('/planting/plants.json?v=2').then(function (doc) {
      var raw = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' }).format(new Date());
      var month = parseInt(raw, 10);
      var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var groups = { vegetable: 'Vegetables', herb: 'Herbs', fruit: 'Fruit', flower: 'Flowers' };
      var lines = [];
      Object.keys(groups).forEach(function (kind) {
        var items = (doc.crops || []).filter(function (crop) {
          return crop.kind === kind && (crop.months || []).indexOf(month) !== -1;
        });
        if (!items.length) return;
        var shown = items.slice(0, 6).map(function (crop) {
          if (!crop.types) return crop.name;
          var bit = crop.types.split('. ')[0].replace(/\.$/, '');
          if (bit.length > 72) bit = bit.slice(0, 69) + '…';
          return crop.name + ' (' + bit + ')';
        });
        var extra = items.length > 6 ? ', and ' + (items.length - 6) + ' more' : '';
        lines.push(groups[kind] + ': ' + shown.join('; ') + extra + '.');
      });
      var zone = doc.zone || {};
      var lead = 'In ' + names[month - 1] + ', ZIP ' + doc.zip + ' is Central Florida, zone ' + zone.code + ' (' + zone.range + ').';
      return {
        status: 'The ' + names[month - 1] + ' planting list is on the card.',
        html: briefHtml('Planting', [lead].concat(lines.length ? lines : ['The calendar has no named crops for this month.']), [['Planting', '/planting/#' + month]])
      };
    }).catch(function () {
      return {
        status: 'The planting notes did not answer.',
        html: briefHtml('Planting', ['The planting file did not answer just now. The month list is on the Planting page.'], [['Planting', '/planting/']])
      };
    });
  }
  function siteFacts(q) {
    var intent = siteIntent(q);
    if (intent === 'launch') return answerLaunch();
    if (intent === 'tide') return answerTide();
    if (intent === 'stock') return answerStock();
    if (intent === 'recipe') return answerRecipe(q);
    if (intent === 'plant') return answerPlant();
    return Promise.resolve(null);
  }
  function run(raw) {
    var q = cleanQ(raw);
    var input = $('q');
    if (input && input.value !== q) input.value = q;
    if (q.length < 2) {
      document.body.classList.remove('is-asking');
      $('askStatus').textContent = 'Ask at least two characters.';
      return;
    }
    var mine = ++ticket;
    document.body.classList.add('is-asking');
    function finishAsk() {
      if (mine !== ticket) return;
      document.body.classList.remove('is-asking');
    }
    rememberUrl(q);
    $('askStatus').textContent = 'The butler is checking the house notes…';
    postAsk(q);
    var intent = siteIntent(q);
    Promise.all([siteFacts(q), loadCatalog().catch(function () { return null; })]).then(function (parts) {
      var fact = parts[0];
      if (mine !== ticket) return;
      if (fact) {
        $('briefBody').innerHTML = fact.html;
        $('askStatus').textContent = fact.status;
      } else {
        $('briefBody').innerHTML = outsideBrief();
        $('askStatus').textContent = 'That one is outside the butler\'s site notes.';
      }
      paintChips([]);
      var sites = [];
      try { sites = siteHits(q); } catch (e) { sites = []; }
      paintHits($('siteBody'), sites.map(function (hit) {
        return { kind: hit.kind, title: hit.title, url: hit.href, snippet: hit.text, external: hit.external };
      }), 'No other Mondosupreme page matched those words.');
      if (intent) {
        $('webBody').innerHTML = '<p class="ask-empty">This answer is from the site\'s own notes.</p>';
        $('deepWin').hidden = true;
      }
      finishAsk();
    }).catch(function () {
      if (mine !== ticket) return;
      $('briefBody').innerHTML = outsideBrief();
      $('askStatus').textContent = 'The house notes did not answer.';
      finishAsk();
    });
  }
  function paintWire(val) {
    var list = $('wireList');
    var rows = [];
    if (val) {
      Object.keys(val).forEach(function (id) {
        var row = val[id];
        if (row && row.q) rows.push({ id: id, q: row.q, at: row.at || 0, mode: row.mode || '' });
      });
    }
    rows.sort(function (a, b) { return b.at - a.at; });
    rows = rows.slice(0, 12);
    if (!rows.length) {
      list.innerHTML = '<li class="ask-empty">The wire is quiet. A public question can show up here.</li>';
      return;
    }
    list.innerHTML = rows.map(function (row) {
      var remove = isOwner ? '<button class="btn wire-remove" type="button" data-remove="' + esc(row.id) + '">Remove</button>' : '';
      return '<li><button class="wire-q" type="button" data-q="' + esc(row.q) + '">' + esc(row.q) + '</button>' + remove + '</li>';
    }).join('');
  }
  function watchWire() {
    if (!window.firebase || !firebase.database || !firebase.apps || !firebase.apps.length) return;
    firebase.database().ref('search/asks').limitToLast(20).on('value', function (snap) {
      paintWire(snap.val());
    }, function () {
      $('wireList').innerHTML = '<li class="ask-empty">The public wire is waiting on updated Firebase rules. Search on this page still works.</li>';
    });
  }
  function setMode(next) {
    if (!MODES[next]) return;
    mode = next;
    savePref();
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
  }
  function setPublic(next) {
    isPublic = !!next;
    savePref();
    $('privPublic').setAttribute('aria-pressed', isPublic ? 'true' : 'false');
    $('privPrivate').setAttribute('aria-pressed', isPublic ? 'false' : 'true');
    $('privNote').textContent = isPublic
      ? 'Public questions join What Visitors Are Asking. Private questions stay on this computer.'
      : 'Private is on. This question stays on this computer and skips the visitor wire.';
  }
  function isAdminNow() {
    return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
  }
  function bootAuth() {
    if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) return;
    firebase.auth().onAuthStateChanged(function (user) {
      authUser = user || null;
      isOwner = isAdminNow();
      if (!bootAuth.ownerListen) { bootAuth.ownerListen = true; document.addEventListener('mondo-owner', function () { var on = isAdminNow(); if (on === isOwner) return; isOwner = on; }); }
      absorbCloud();
      if (user && pendingAsk) postAsk(pendingAsk);
    });
  }
  function init() {
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    loadPref();
    setMode(mode);
    setPublic(isPublic);
    seedStatic();
    absorbLocal();
    loadCatalog();
    bootAuth();
    watchWire();
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var voice = $('voiceBtn');
    if (!Rec) voice.hidden = true;
    else voice.addEventListener('click', function () {
      var rec = new Rec();
      rec.lang = 'en-US';
      rec.onresult = function (event) {
        var said = event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript;
        if (said) run(said);
      };
      rec.onerror = function () { $('askStatus').textContent = 'Dictation did not catch that. Type the question instead.'; };
      $('askStatus').textContent = 'Listening…';
      try { rec.start(); } catch (e) { $('askStatus').textContent = 'Dictation is already listening.'; }
    });
    $('askForm').addEventListener('submit', function (event) {
      event.preventDefault();
      run($('q').value);
    });
    $('radicalBtn').addEventListener('click', function () {
      run(RADICAL[Math.floor(Math.random() * RADICAL.length)]);
    });
    $('modeBar').addEventListener('click', function (event) {
      var btn = event.target.closest('.mode-btn');
      if (!btn) return;
      setMode(btn.getAttribute('data-mode'));
      if (cleanQ($('q').value).length >= 2) run($('q').value);
    });
    $('privPublic').addEventListener('click', function () { setPublic(true); });
    $('privPrivate').addEventListener('click', function () { setPublic(false); });
    document.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-q]');
      if (chip && chip.getAttribute('data-q')) { run(chip.getAttribute('data-q')); return; }
      var remove = event.target.closest('[data-remove]');
      if (remove && isOwner && window.firebase && firebase.database) {
        firebase.database().ref('search/asks/' + remove.getAttribute('data-remove')).remove().catch(function () {});
      }
    });
    var params = new URLSearchParams(location.search);
    if (MODES[params.get('mode')]) setMode(params.get('mode'));
    if (params.get('q')) run(params.get('q'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
