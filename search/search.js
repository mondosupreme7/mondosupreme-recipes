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
    item.blurb = String(item.blurb || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    item.title = String(item.title).replace(/\s+/g, ' ').trim().slice(0, 160);
    item.asked = Array.isArray(item.asked) ? item.asked.map(function (q) { return cleanQ(q); }).filter(Boolean).slice(0, 3) : [];
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
  function oneLine(value) {
    var text = String(value || '').replace(/[#>*_`\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    var sentence = text.match(/^[^.!?]+[.!?]?/);
    var line = sentence ? sentence[0].trim() : text;
    if (line.length > 180) line = line.slice(0, 177) + '…';
    return line;
  }
  function seedStatic() {
    [
      ['Home', '/', 'landing welcome mondosupreme', 'Mondosupreme — recipes, a daily YouTube recipe show, cruise ship positions, weather, puzzles, search, stocks, a wiki, and the games.', ['What is on the home page?']],
      ['Recipes', '/recipes/', 'kitchen cookbook mastercook food dinner backyard chef', 'Mondosupreme Recipes — your personal recipe collection at Mondosupreme.com', ['How do I make fluffy buttermilk pancakes?', 'Where are the Backyard Chef recipes?']],
      ['Recipe TV', '/daily-recipe/', 'daily youtube recipe show chef', 'Recipe TV plays a different YouTube recipe every day.', ['What is playing on Recipe TV?']],
      ['Cruises', '/cruises/', 'royal caribbean ships harbor port canaveral', 'Last-known position of every Royal Caribbean International ship, plus Port Canaveral cruise deals.', ['Where are the Royal Caribbean ships?']],
      ['Weather', '/weather/', 'doppler radar forecast cocoa local on the 8s', 'Weather, a WeatherStar 4000 style Doppler radar and local forecast. Cocoa and Port Canaveral by default, plus any ZIP or city.', ["What's the weather in Cocoa today?", "What's the forecast for Port Canaveral?"]],
      ['Tides', '/tides/', 'port canaveral tide high low surf', 'Port Canaveral tide predictions, a 48-hour curve, and Cocoa Beach swell, wind, and sunrise.', ["What's tonight's Port Canaveral tide?", 'When is the next high tide at Port Canaveral?']],
      ['Launches', '/launches/', 'cape canaveral launch rocket liftoff', 'Cape Canaveral Launch Control. Upcoming KSC and CCSFS launches, a T-minus clock, and a Cocoa 32927 viewing guide.', ["What's the next Cape launch?", 'When is the next liftoff from Cape Canaveral?']],
      ['Word Game', '/wordle/', 'daily wordle five letter puzzle', 'Word Game, a daily 5-letter word puzzle in a game-show grid, plus free play and a 90s, cruise, and kitchen bonus word.', ["What's today's five-letter puzzle?"]],
      ['Ask Mondo', '/search/', 'ask mondo hollis butler search questions', 'Ask Mondo a plain-English question. Hollis looks through recipes, the weather, tides, stocks, and the rest of this site.', ['What can Hollis answer?']],
      ['Stocks', '/stocks/', 'oversold rsi swing screen finance buy zone', 'Stocks, a swing screen of US common stocks on Nasdaq, the NYSE, and NYSE American. Informational only, not financial advice.', ['Why is the top stock on the list?', "What is the top pick's buy zone?"]],
      ['Wiki', '/wiki/', 'notes articles launches tides arcade recipes', 'Short articles about Space Coast launches, Port Canaveral tides, the arcade, and Backyard Chef.', ['What articles are in the wiki?']],
      ['Paint', '/board/', 'paint shared drawing board whiteboard', 'Paint style shared drawing board on Mondosupreme.', ['How do I open the drawing board?']],
      ['Chat', '/chat/', 'chat room talk public', 'Chat style public chat on Mondosupreme.', ['How do I join the public chat?']],
      ['Arcade', '/arcade/', 'arcade games high seas cruiser kitchen rush brick breaker lantern coil saltflare needlewake phosphor halls night ford', 'Arcade — High Seas Cruiser, Supreme Kitchen Rush, Cyber Brick Breaker, and Lantern Coil, plus Saltflare, Needlewake, Phosphor Halls, and Night Ford.', ['What games are in the arcade?']],
      ['Saltflare', '/saltflare/', 'formation shooter moths flare skiff', 'Saltflare — a formation shooter. Slide a flare skiff along the night marsh and clear the moth line.', ['How do you play Saltflare?']],
      ['Needlewake', '/needlewake/', 'vector shards glass needle field', 'Needlewake — a vector shard shooter. Pilot a glass needle through a field of spinning shards.', ['How do you play Needlewake?']],
      ['Phosphor Halls', '/phosphor/', 'maze lamp moth crumbs wardens cold lamp', 'Phosphor Halls — a lamp moth eats crumbs while four wardens hunt. A cold lamp turns them.', ['How do you play Phosphor Halls?']],
      ['Night Ford', '/nightford/', 'hopper cricket barges porch lights carts river', 'Night Ford — hop a lantern cricket across night carts and river barges until every porch light is burning.', ['How do you play Night Ford?']],
      ['Virtual Pet', '/pet/', 'virtual pet egg tamagotchi', 'Virtual Pet — a live virtual pet. Feed it, dress it, and wave at friends in the Pet Park.', ['How does the virtual pet work?']],
      ['Forum', '/forum/', 'bulletin board posts blog', 'Mondosupreme Bulletin Board for recipes, cruises, games, and site news.', ['What is the bulletin board for?']],
      ['Marketplace', '/market/', 'classifieds for sale listings', 'Marketplace — post things for sale, add photos from your phone, and message the seller on the listing.', ['How do Marketplace listings work?']],
      ['Mystic 8-Ball', '/8ball/', 'magic eight ball fortune', 'Mystic 8-Ball — classic fortunes, a cyber oracle, and cruise and kitchen fate.', ['What does the 8-Ball say?']],
      ['Craft', '/mmo/', 'pixel mmo realm goldhaven', 'Craft — a pixel realm. Pick a faction and class, quest from Goldhaven to the Molten Core, and meet other heroes.', ['What is Craft?']],
      ['Half Strike Fortress', '/fps/', 'fps fortress labs sandstorm', 'Half Strike Fortress — a first-person blast. Sector C Labs, de_sandstorm, and 2Fort.', ['What maps does Half Strike Fortress have?']],
      ['Cinderlatch', '/escape/', 'cinderlatch escape door', 'A door in the house that does not introduce itself.', ['What is Cinderlatch?']],
      ['Planting', '/planting/', 'garden planting zone 10a 32927 cocoa vegetables herbs flowers fruit calendar', 'What to plant in ZIP 32927, Port St. John and Cocoa, Florida. USDA zone 10a and the Central Florida calendar, by month.', ['What should I plant in 32927?']]
    ].forEach(function (row) {
      addItem({ kind: 'App', title: row[0], href: row[1], text: row[2], blurb: row[3], asked: row[4] });
    });
    [
      ['sample-1', 'Sample: Supreme Tomato Basil Pasta', 'Dinner pasta tomatoes basil garlic vegetarian spaghetti', 'Dinner recipe in the kitchen notebook.', 10, 20, 4],
      ['sample-2', 'Sample: Fluffy Buttermilk Pancakes', 'Breakfast brunch pancakes buttermilk maple syrup fluffy', 'Breakfast recipe in the kitchen notebook.', 10, 15, 4],
      ['sample-3', 'Sample: Chickpea Coconut Curry', 'Dinner vegan curry chickpeas coconut milk spinach rice', 'Dinner recipe in the kitchen notebook.', 15, 25, 4]
    ].forEach(function (row) {
      addItem({
        kind: 'Recipe',
        title: row[1],
        href: '/recipes/#/recipe/' + row[0],
        text: row[2],
        blurb: row[3],
        prep: row[4],
        cook: row[5],
        servings: row[6],
        asked: ['How do I make ' + row[1].replace(/^Sample:\s*/, '') + '?']
      });
    });
  }
  function absorbLocal() {
    eachRecord(readJson('mondosupreme.recipes.v1'), function (row) {
      if (!row || typeof row !== 'object') return;
      delete row.photo;
      if (!row.title) return;
      addItem({
        kind: 'Recipe',
        title: row.title,
        href: '/recipes/#/recipe/' + encodeURIComponent(row.id || ''),
        text: [row.category, textOf(row.ingredients), textOf(row.steps), row.notes, textOf(row.tags)].join(' '),
        blurb: row.category ? row.category + ' recipe in the kitchen notebook.' : oneLine(row.notes),
        prep: typeof row.prep === 'number' ? row.prep : undefined,
        cook: typeof row.cook === 'number' ? row.cook : undefined,
        servings: typeof row.servings === 'number' ? row.servings : undefined,
        asked: ['How do I make ' + row.title + '?']
      });
    });
    eachRecord(readJson('mondosupreme.wiki.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Wiki', title: row.title, href: '/wiki/#/page/' + encodeURIComponent(row.id || ''), text: textOf(row.body).slice(0, 400), blurb: oneLine(row.body) });
    });
    eachRecord(readJson('mondosupreme.forum.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Forum', title: row.title, href: '/forum/#/t/' + encodeURIComponent(row.id || ''), text: [row.category, row.body, row.name].join(' '), blurb: oneLine(row.body) });
    });
    eachRecord(readJson('mondosupreme.market.v1'), function (row) {
      if (!row || !row.title) return;
      addItem({ kind: 'Marketplace', title: row.title, href: '/market/#/item/' + encodeURIComponent(row.id || ''), text: [row.category, row.price, row.description, row.location].join(' '), blurb: oneLine(row.description) });
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
          addItem({
            kind: 'Ship',
            title: ship.name,
            href: '/cruises/',
            text: 'Royal Caribbean ' + ship.class + ' class ' + (ship.year || '') + ' cruise ship',
            blurb: 'Royal Caribbean ' + (ship.class ? ship.class + ' class ' : '') + 'ship' + (ship.year ? ', ' + ship.year : '') + '.',
            asked: ['Which Royal Caribbean ship is ' + ship.name + '?']
          });
        });
      }).catch(function () {}),
      loadJson('/cruises/canaveral-deals.json').then(function (data) {
        (data.deals || []).forEach(function (deal) {
          addItem({
            kind: 'Deal',
            title: (deal.ship ? deal.ship + ' — ' : '') + (deal.title || 'Port Canaveral sailing'),
            href: deal.url || '/cruises/',
            external: !!deal.url,
            text: [deal.portsLabel, deal.sailDate, deal.nights ? deal.nights + ' nights' : '', deal.startingPrice ? '$' + deal.startingPrice : '', 'Port Canaveral'].join(' '),
            blurb: [deal.portsLabel, deal.sailDate, deal.nights ? deal.nights + ' nights' : ''].filter(Boolean).join(' · ') || 'Port Canaveral sailing.'
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
      addItem({
        kind: 'Recipe', title: row.title, href: '/recipes/#/recipe/' + encodeURIComponent(row.id || key),
        text: [row.category, textOf(row.ingredients), row.notes].join(' '),
        blurb: row.category ? row.category + ' recipe in the kitchen notebook.' : oneLine(row.notes),
        prep: typeof row.prep === 'number' ? row.prep : undefined,
        cook: typeof row.cook === 'number' ? row.cook : undefined,
        servings: typeof row.servings === 'number' ? row.servings : undefined,
        asked: ['How do I make ' + row.title + '?']
      });
    });
    take('wiki/items', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Wiki', title: row.title, href: '/wiki/#/page/' + encodeURIComponent(row.id || key), text: textOf(row.body).slice(0, 400), blurb: oneLine(row.body) });
    });
    take('forum/threads', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Forum', title: row.title, href: '/forum/#/t/' + encodeURIComponent(row.id || key), text: [row.category, row.body].join(' '), blurb: oneLine(row.body) });
    });
    take('market/items', function (row, key) {
      if (!row.title) return;
      addItem({ kind: 'Marketplace', title: row.title, href: '/market/#/item/' + encodeURIComponent(row.id || key), text: [row.category, row.price, row.description, row.location, row.sold ? 'sold' : ''].join(' '), blurb: oneLine(row.description) });
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
    var block = $('alsoBlock');
    if (!bar) return;
    if (!list || !list.length) {
      bar.innerHTML = '';
      if (block) block.hidden = true;
      return;
    }
    if (block) block.hidden = false;
    bar.innerHTML = list.map(function (q) {
      return '<button class="btn chip" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');
  }
  function paintHits(body, hits, empty) {
    if (!hits.length) { body.innerHTML = '<p class="ask-empty">' + esc(empty) + '</p>'; return; }
    if (body && body.id === 'webBody') {
      var webWin = $('webWin');
      if (webWin) webWin.hidden = false;
    }
    body.innerHTML = '<ul class="hit-list">' + hits.map(function (hit) {
      var href = safeUrl(hit.url || hit.href);
      var img = hit.thumb && allowImg(hit.thumb) ? '<img alt="" src="' + esc(hit.thumb) + '">' : '';
      var ext = hit.external || (href && href.indexOf(location.host) === -1);
      var attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
      var snip = hit.snippet || hit.blurb || '';
      return '<li class="hit">' + img + '<div><p class="hit-kind">' + esc(hit.kind || 'Page') + '</p><p class="hit-title"><a href="' + esc(href) + '"' + attrs + '>' + esc(hit.title) + '</a></p>' + (snip ? '<p>' + esc(snip) + '</p>' : '') + '</div></li>';
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
      return { kind: hit.kind, title: hit.title, url: hit.href, snippet: hit.blurb || '', external: hit.external };
    }), 'Nothing in the house matched those words.');
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
    if (/\b(weather|forecast|temperature|raining|rain|doppler)\b/.test(s)) return 'weather';
    if (/launch|liftoff|\bcape\b|rocket|falcon|artemis|spacex/.test(s)) return 'launch';
    if (/tide|high tide|low tide/.test(s)) return 'tide';
    if (/stock|ticker|buy zone|oversold|screener/.test(s) || /why/.test(s) && /list|pick|stock|screen/.test(s)) return 'stock';
    if (/\b(plant|planting|garden|sow)\b/.test(s) || (/32927/.test(s) && /\b(grow|growing)\b/.test(s))) return 'plant';
    if (/recipe|cook|pancake|bake|breakfast|chicken|beef|pork|dinner|dish|pasta|ingredient|backyard|chef/.test(s)) return 'recipe';
    return '';
  }
  function factResult(opts) {
    return {
      status: opts.status || '',
      heading: opts.heading || '',
      answer: opts.answer || '',
      linkTitle: opts.linkTitle || '',
      href: opts.href || '',
      extra: opts.extra || []
    };
  }
  function skyName(code) {
    if (typeof code !== 'number' || !isFinite(code)) return '';
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Cloudy';
    if (code <= 48) return 'Fog';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    return 'Thunder';
  }
  function weatherPlace(q) {
    var places = [
      { name: 'Cocoa', lat: 28.38612, lon: -80.742, test: /cocoa|32927/ },
      { name: 'Port Canaveral', lat: 28.4103, lon: -80.6188, test: /port canaveral|\bcanaveral\b/ },
      { name: 'Orlando', lat: 28.5383, lon: -81.3792, test: /\borlando\b/ },
      { name: 'Miami', lat: 25.7617, lon: -80.1918, test: /\bmiami\b/ },
      { name: 'CocoCay / Nassau', lat: 25.43, lon: -77.65, test: /cococay|nassau/ },
      { name: 'Caribbean', lat: 18.2, lon: -70.5, test: /\bcaribbean\b/ }
    ];
    var s = String(q || '').toLowerCase();
    var i;
    for (i = 0; i < places.length; i++) if (places[i].test.test(s)) return places[i];
    var named = s.match(/\b(?:in|for|at)\s+([a-z][a-z .'-]{1,40})/);
    if (named) {
      var place = named[1].replace(/\b(today|tonight|now|right now|this morning|this afternoon|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (place && !/^(my|our|this|that|town|area|house|kitchen)$/.test(place)) return null;
    }
    return places[0];
  }
  function answerWeather(q) {
    var place = weatherPlace(q);
    var link = { linkTitle: 'Weather', href: '/weather/' };
    if (!place) {
      return Promise.resolve(factResult({
        status: 'That place is not one of the saved Weather presets. The Weather page can look it up.',
        linkTitle: link.linkTitle,
        href: link.href
      }));
    }
    var meteo = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto';
    var points = 'https://api.weather.gov/points/' + place.lat.toFixed(4) + ',' + place.lon.toFixed(4);
    var conditions = withTimeout(fetch(points, { headers: { Accept: 'application/geo+json' } }).then(function (res) {
      if (!res.ok) throw new Error('nws');
      return res.json();
    }).then(function (data) {
      var forecast = data.properties && data.properties.forecast;
      if (!forecast) throw new Error('nws');
      return fetch(forecast, { headers: { Accept: 'application/geo+json' } }).then(function (res) {
        if (!res.ok) throw new Error('nws');
        return res.json();
      });
    }).then(function (cast) {
      var periods = (cast.properties && cast.properties.periods) || [];
      return (periods[0] && periods[0].shortForecast) || '';
    }), 4000);
    return Promise.all([getJSON(meteo), conditions]).then(function (pair) {
      var cur = (pair[0] && pair[0].current) || {};
      var temp = typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) + '°' : '';
      var cond = pair[1] || skyName(cur.weather_code);
      if (!temp && !cond) throw new Error('empty');
      var line = temp && cond ? temp + ' and ' + cond : (temp || cond);
      return factResult({
        status: 'The current ' + place.name + ' weather is on the card.',
        heading: 'Weather',
        answer: line + ' in ' + place.name + '.',
        linkTitle: link.linkTitle,
        href: link.href
      });
    }).catch(function () {
      return factResult({
        status: 'The forecast did not answer. The Weather page is still there.',
        linkTitle: link.linkTitle,
        href: link.href
      });
    });
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
    var link = { linkTitle: 'Launches', href: '/launches/' };
    return getJSON('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?location__ids=12,27&limit=8').then(function (data) {
      var best = null;
      (data.results || []).forEach(function (row) {
        var when = new Date(row.net || row.window_start || '');
        if (isNaN(when.getTime()) || when.getTime() < Date.now() - 3600000) return;
        if (!best || when < best.when) best = { when: when, name: row.name || 'Launch' };
      });
      if (!best) throw new Error('empty');
      var whenText = '';
      try {
        whenText = best.when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      } catch (e) { whenText = best.when.toLocaleString(); }
      if (!whenText) throw new Error('empty');
      return factResult({
        status: 'The next Cape launch is on the card.',
        heading: 'Next launch',
        answer: best.name + ' — ' + whenText + '.',
        linkTitle: link.linkTitle,
        href: link.href
      });
    }).catch(function () {
      return factResult({
        status: 'The launch list did not answer. The calendar is still there.',
        linkTitle: link.linkTitle,
        href: link.href
      });
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
      return factResult({
        status: 'The next Port Canaveral tide is on the card.',
        heading: 'Next tide',
        answer: 'Next ' + kind.toLowerCase() + ' tide at ' + clock + '.',
        linkTitle: 'Tides',
        href: '/tides/'
      });
    }).catch(function () {
      return factResult({
        status: 'The tide station did not answer.',
        linkTitle: 'Tides',
        href: '/tides/'
      });
    });
  }
  function confirmingSignals(row) {
    return (row.swingSignals || []).filter(function (label) {
      return label !== 'Near 52w low' && label !== 'Pullback from high' && label !== 'Uptrend pullback';
    });
  }
  function shockFromSeries(row) {
    if (!row) return false;
    if (row.shock) return true;
    if ((row.flags || []).indexOf('Falling knife') !== -1) return true;
    if (typeof row.dayChange === 'number' && row.dayChange <= -9) return true;
    var closes = row.series && row.series.c;
    if (!closes || closes.length < 2) return false;
    var start = Math.max(1, closes.length - 8);
    var i;
    for (i = start; i < closes.length; i++) {
      if (!(closes[i - 1] > 0)) continue;
      if ((closes[i] / closes[i - 1] - 1) * 100 <= -9) return true;
    }
    return false;
  }
  function displayActionable(row) {
    if (!row || row.swingEligible !== true) return false;
    if (typeof row.swingScore !== 'number' || row.swingScore < 36) return false;
    if (row.above200 !== true || row.sma200Rising === false) return false;
    if (typeof row.vsSma200 !== 'number' || row.vsSma200 < 5) return false;
    if (typeof row.drop21 === 'number' && row.drop21 <= -15) return false;
    if (typeof row.avgDollarVolume !== 'number' || row.avgDollarVolume < 20000000) return false;
    if ((row.flags || []).indexOf('Earnings within 7 days') !== -1 || shockFromSeries(row) || row.planStyle === 'none') return false;
    if (typeof row.rewardRisk !== 'number' || row.rewardRisk < 2) return false;
    var signals = confirmingSignals(row);
    return signals.indexOf('Volume reversal') !== -1 && signals.length >= 2;
  }
  function answerStock() {
    var link = { linkTitle: 'Stocks', href: '/stocks/' };
    return getJSON('/stocks/oversold.json').then(function (data) {
      var market = data.market || {};
      if (typeof market.vsSma200 === 'number' && market.vsSma200 < 0) {
        return factResult({
          status: 'This pass does not name a top stock.',
          heading: 'Top stock',
          answer: 'SPY is under its 200-day, so this pass does not name a top stock to watch.',
          linkTitle: link.linkTitle,
          href: link.href
        });
      }
      var list = (data.stocks || []).filter(displayActionable).sort(function (a, b) {
        var score = (b.swingScore || 0) - (a.swingScore || 0);
        if (score) return score;
        return String(a.symbol).localeCompare(String(b.symbol));
      });
      var row = list[0];
      if (!row) {
        return factResult({
          status: 'This pass does not name a top stock.',
          heading: 'Top stock',
          answer: 'No name passes the swing rules on this pass.',
          linkTitle: link.linkTitle,
          href: link.href
        });
      }
      if (typeof row.entryLow !== 'number' || typeof row.entryHigh !== 'number') {
        return factResult({
          status: row.symbol + ' is the top pick. The screen did not include a buy zone.',
          linkTitle: link.linkTitle,
          href: link.href
        });
      }
      return factResult({
        status: row.symbol + ' is the top pick.',
        heading: 'Top stock',
        answer: row.symbol + ' buy zone $' + row.entryLow.toFixed(2) + '–$' + row.entryHigh.toFixed(2) + '. Not financial advice.',
        linkTitle: link.linkTitle,
        href: link.href
      });
    }).catch(function () {
      return factResult({
        status: 'The stock screen did not answer.',
        linkTitle: link.linkTitle,
        href: link.href
      });
    });
  }
  function recipeLine(rec) {
    if (!rec || !rec.title) return '';
    var hasPrep = typeof rec.prep === 'number' && isFinite(rec.prep);
    var hasCook = typeof rec.cook === 'number' && isFinite(rec.cook);
    var hasServ = typeof rec.servings === 'number' && isFinite(rec.servings) && rec.servings > 0;
    if (!hasPrep && !hasCook && !hasServ) return '';
    var bits = [];
    if (hasPrep || hasCook) bits.push(((hasPrep ? rec.prep : 0) + (hasCook ? rec.cook : 0)) + ' min total');
    if (hasServ) bits.push(rec.servings + (rec.servings === 1 ? ' serving' : ' servings'));
    return rec.title + ' — ' + bits.join(', ') + '.';
  }
  function recipeWords(q) {
    return String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (word) {
      return word.length > 2 && !/^(the|and|for|from|with|dish|recipe|cook|what|whats|how|tonight|some|any|make|fluffy)$/.test(word);
    });
  }
  function scoreRecipe(title, blob, words) {
    var score = 0;
    words.forEach(function (word) {
      if (title.indexOf(word) !== -1) score += 3;
      else if (blob.indexOf(word) !== -1) score += 1;
    });
    return score;
  }
  function answerRecipe(q) {
    var linkHome = { linkTitle: 'Recipes', href: '/recipes/' };
    var words = recipeWords(q);
    var best = null;
    var bestScore = 0;
    function consider(row, score) {
      if (score > bestScore) { bestScore = score; best = row; }
    }
    index.forEach(function (item) {
      if (!item || item.kind !== 'Recipe') return;
      var title = String(item.title || '').toLowerCase();
      consider({
        title: item.title,
        href: item.href,
        prep: item.prep,
        cook: item.cook,
        servings: item.servings,
        ready: true
      }, scoreRecipe(title, title + ' ' + String(item.text || '').toLowerCase(), words));
    });
    return getJSON('/recipes/collections/backyard-chef-index.json').then(function (data) {
      (data.items || []).forEach(function (item) {
        var title = String(item[1] || '').toLowerCase();
        var blob = title + ' ' + String(item[2] || '') + ' ' + String(item[6] || '') + ' ' + String(item[7] || '');
        consider({
          id: item[0],
          title: item[1],
          href: '/recipes/#/recipe/' + encodeURIComponent(item[0] || ''),
          part: item[4] || 0,
          ready: false
        }, scoreRecipe(title, blob, words));
      });
      return finishRecipe(best, bestScore, linkHome);
    }).catch(function () {
      if (best && bestScore) return finishRecipe(best, bestScore, linkHome);
      return factResult({
        status: 'The recipe box did not answer.',
        linkTitle: linkHome.linkTitle,
        href: linkHome.href
      });
    });
  }
  function finishRecipe(best, bestScore, linkHome) {
    if (!best || !bestScore) {
      return factResult({
        status: 'No recipe in the kitchen matched that.',
        linkTitle: linkHome.linkTitle,
        href: linkHome.href
      });
    }
    function pack(line) {
      if (!line) {
        return factResult({
          status: 'That card does not list a total time or servings.',
          linkTitle: best.title || linkHome.linkTitle,
          href: best.href || linkHome.href
        });
      }
      return factResult({
        status: 'The recipe time and servings are on the card.',
        heading: 'Recipe',
        answer: line,
        linkTitle: best.title || linkHome.linkTitle,
        href: best.href || linkHome.href
      });
    }
    if (best.ready) return pack(recipeLine(best));
    var part = best.part || 0;
    return getJSON('/recipes/collections/backyard-chef-' + (part + 1) + '.json').then(function (data) {
      var full = null;
      (data.recipes || []).some(function (row) {
        if (row && row.id === best.id) { full = row; return true; }
        return false;
      });
      return pack(recipeLine(full || best));
    }).catch(function () {
      return factResult({
        status: 'That recipe card did not answer.',
        linkTitle: best.title || linkHome.linkTitle,
        href: best.href || linkHome.href
      });
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
      return factResult({
        status: 'The ' + names[month - 1] + ' planting list is on the card.',
        heading: 'Planting',
        answer: lead,
        linkTitle: 'Planting',
        href: '/planting/#' + month,
        extra: lines.length ? lines : ['The calendar has no named crops for this month.']
      });
    }).catch(function () {
      return factResult({
        status: 'The planting notes did not answer.',
        linkTitle: 'Planting',
        href: '/planting/'
      });
    });
  }
  function siteFacts(q) {
    var intent = siteIntent(q);
    if (intent === 'weather') return answerWeather(q);
    if (intent === 'launch') return answerLaunch();
    if (intent === 'tide') return answerTide();
    if (intent === 'stock') return answerStock();
    if (intent === 'recipe') return answerRecipe(q);
    if (intent === 'plant') return answerPlant();
    return Promise.resolve(null);
  }
  var titleWordCache = null;
  function titleWords() {
    if (titleWordCache && titleWordCache.n === index.length) return titleWordCache.words;
    var seen = {};
    var words = [];
    index.forEach(function (item) {
      String(item.title || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
        if (w.length > 3 && !STOP[w] && !seen[w]) { seen[w] = 1; words.push(w); }
      });
    });
    titleWordCache = { n: index.length, words: words };
    return words;
  }
  function bestScore(q) {
    var toks = tokens(q);
    var best = 0;
    index.forEach(function (item) {
      var s = scoreItem(item, q, toks);
      if (s > best) best = s;
    });
    return best;
  }
  function editDistance(a, b) {
    if (a === b) return 0;
    var la = a.length;
    var lb = b.length;
    if (!la || !lb) return Math.max(la, lb);
    if (Math.abs(la - lb) > 2) return 9;
    var prev = [];
    var i;
    var j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      var cur = [i];
      var ca = a.charAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cost = ca === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[lb];
  }
  function suggestQuery(q) {
    var rawTokens = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!rawTokens.length) return '';
    var words = titleWords();
    var wordSet = {};
    words.forEach(function (w) { wordSet[w] = 1; });
    var changed = false;
    var next = rawTokens.map(function (tok) {
      if (tok.length < 5 || wordSet[tok] || STOP[tok]) return tok;
      var limit = tok.length >= 7 ? 2 : 1;
      var best = '';
      var bestD = limit + 1;
      for (var n = 0; n < words.length; n++) {
        var w = words[n];
        if (Math.abs(w.length - tok.length) > limit) continue;
        var d = editDistance(tok, w);
        if (d > 0 && d < bestD) {
          if ((tok.indexOf(w) !== -1 || w.indexOf(tok) !== -1) && Math.abs(tok.length - w.length) > 1) continue;
          bestD = d;
          best = w;
          if (d === 1) break;
        }
      }
      if (!best) return tok;
      changed = true;
      return best;
    });
    if (!changed) return '';
    var phrase = next.join(' ');
    var flat = String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (phrase === flat) return '';
    var before = bestScore(q);
    var after = bestScore(phrase);
    if (after <= 0 && !siteIntent(phrase)) return '';
    if (before > 0 && after < before + 3) return '';
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }
  function normPhrase(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function paintDidYou(q, titles) {
    var el = $('didYou');
    if (!el) return;
    var alt = suggestQuery(q);
    var altKey = normPhrase(alt);
    var answered = $('answerFact') && !$('answerFact').hidden && $('answerFact').textContent.trim();
    var already = altKey && (titles || []).some(function (title) { return normPhrase(title) === altKey; });
    if (!alt || already || answered) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = 'Did you mean <button type="button" class="did-you-q" data-q="' + esc(alt) + '">' + esc(alt) + '?</button>';
  }
  function paintFact(fact) {
    var title = $('briefTitle');
    var factEl = $('answerFact');
    var lead = $('answerLead');
    var body = $('briefBody');
    if (!title || !lead) return '';
    var answer = fact && fact.answer ? String(fact.answer) : '';
    var href = fact && fact.href ? safeUrl(fact.href) : '';
    var linkTitle = fact && fact.linkTitle ? String(fact.linkTitle) : '';
    if (factEl) {
      factEl.hidden = !answer;
      factEl.textContent = answer;
    }
    if (answer) title.textContent = (fact && fact.heading) || 'Answer';
    else if (href) title.textContent = 'You may find my answer at…';
    else title.textContent = 'Nothing in the house matched that.';
    if (href && linkTitle) {
      var ext = href.indexOf(location.host) === -1;
      lead.hidden = false;
      lead.innerHTML = '<a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(linkTitle) + '</a>';
    } else {
      lead.hidden = true;
      lead.innerHTML = '';
    }
    var extra = (fact && fact.extra) || [];
    if (body) {
      body.innerHTML = extra.length
        ? '<div class="brief-local">' + extra.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>'
        : '';
    }
    return linkTitle;
  }
  function alsoAsked(q, sites) {
    var out = [];
    var seen = {};
    function add(text) {
      var t = cleanQ(text);
      if (!t || t.length < 8) return;
      var key = normPhrase(t);
      if (!key || key === normPhrase(q) || seen[key]) return;
      seen[key] = 1;
      out.push(t);
    }
    (sites || []).forEach(function (hit) {
      if (!hit) return;
      (hit.asked || []).forEach(add);
      if (hit.kind === 'Recipe' && hit.title) add('How do I make ' + String(hit.title).replace(/^Sample:\s*/, '') + '?');
      else if (hit.kind === 'Ship' && hit.title) add('Which Royal Caribbean ship is ' + hit.title + '?');
    });
    if (out.length < 4) {
      index.forEach(function (item) {
        if (!item || !item.asked) return;
        item.asked.forEach(function (text) { if (out.length < 4) add(text); });
      });
    }
    return out.slice(0, 4);
  }
  function run(raw) {
    var q = cleanQ(raw);
    var input = $('q');
    if (input && input.value !== q) input.value = q;
    if (q.length < 2) {
      document.body.classList.remove('is-asking', 'has-results');
      $('askStatus').textContent = 'Ask at least two characters.';
      return;
    }
    var mine = ++ticket;
    document.body.classList.add('is-asking', 'has-results');
    function finishAsk() {
      if (mine !== ticket) return;
      document.body.classList.remove('is-asking');
    }
    rememberUrl(q);
    $('askStatus').textContent = 'Hollis is checking the house notes…';
    postAsk(q);
    var intent = siteIntent(q);
    var tools = parseTools(q);
    Promise.all([siteFacts(q), loadCatalog().catch(function () { return null; })]).then(function (parts) {
      var fact = parts[0];
      if (mine !== ticket) return;
      var sites = [];
      try { sites = siteHits(q); } catch (e) { sites = []; }
      var cardTitle = '';
      if (fact && (fact.answer || fact.href)) {
        cardTitle = paintFact(fact);
        $('askStatus').textContent = fact.status || 'Hollis checked the house notes.';
        paintTools(tools);
      } else if (tools.length) {
        $('briefTitle').textContent = 'Here is what I worked out.';
        if ($('answerFact')) { $('answerFact').hidden = true; $('answerFact').textContent = ''; }
        $('answerLead').hidden = true;
        $('answerLead').innerHTML = '';
        $('briefBody').innerHTML = tools.map(function (tool) {
          return '<article class="tool-card"><strong>' + esc(tool.value) + '</strong><p>' + esc(tool.label) + '</p><p class="hit-meta">' + esc(tool.detail) + '</p></article>';
        }).join('');
        $('askStatus').textContent = 'Hollis worked that out from the question.';
        paintTools([]);
      } else if (sites.length) {
        cardTitle = paintFact({ href: sites[0].href, linkTitle: sites[0].title });
        $('askStatus').textContent = 'Hollis found a page in the house.';
        paintTools([]);
      } else {
        paintFact(null);
        $('briefBody').innerHTML = outsideBrief();
        $('askStatus').textContent = 'That one is outside the house notes.';
        paintTools([]);
      }
      var didTitles = [];
      if (cardTitle) didTitles.push(cardTitle);
      if (sites[0] && sites[0].title) didTitles.push(sites[0].title);
      paintDidYou(q, didTitles);
      paintChips(alsoAsked(q, sites));
      paintHits($('siteBody'), sites.map(function (hit) {
        return { kind: hit.kind, title: hit.title, url: hit.href, snippet: hit.blurb || '', external: hit.external };
      }), 'Nothing else in the house matched those words.');
      $('webWin').hidden = true;
      $('deepWin').hidden = true;
      if (intent) $('webBody').innerHTML = '<p class="ask-empty">This answer is from the site\'s own notes.</p>';
      finishAsk();
    }).catch(function () {
      if (mine !== ticket) return;
      paintFact(null);
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
