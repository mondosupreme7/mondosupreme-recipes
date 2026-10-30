/* Shared Start menu, Find, and owner chip. One cached file for every section. */
(function () {
  'use strict';
  var FIND_KEY = 'mondosupreme.find.v1';
  var FIND_TTL = 5 * 60 * 1000;
  var remote = [];
  var remoteAt = 0;
  var loading = false;

  function clip(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 180);
  }
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (e) { return null; }
  }
  function isOwnerUser() {
    return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner());
  }
  function appsReady() {
    return !!(window.firebase && firebase.apps && firebase.apps.length && firebase.auth);
  }
  function bootFirebase() {
    if (!window.firebase || !firebase.initializeApp || !window.MONDO_BOARD_CONFIG) return false;
    if (!firebase.apps.length) {
      try { firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
      catch (e) { /* another script won the race */ }
    }
    return appsReady();
  }

  var sections = [
    { group: 'Home', title: 'Home', href: '/', text: 'landing mondosupreme' },
    { group: 'Home', title: 'AI Search', href: '/search/', text: 'ask mondo jeeves search engine cyber butler altavista yahoo' },
    { group: 'Kitchen', title: 'Recipes', href: '/recipes/', text: 'kitchen cookbook food' },
    { group: 'Kitchen', title: 'Grocery List', href: '/grocery/', text: 'mondorecipe grocery list recipes servings aisle shopping' },
    { group: 'Kitchen', title: 'Recipe TV', href: '/daily-recipe/', text: 'daily recipe youtube mondotv realplayer chef' },
    { group: 'Harbor', title: 'Cruises', href: '/cruises/', text: 'ships harbor royal caribbean' },
    { group: 'Harbor', title: 'Weather', href: '/weather/', text: 'weather radar doppler forecast cocoa port canaveral local on the 8s' },
    { group: 'Harbor', title: 'Launches', href: '/launches/', text: 'cape canaveral kennedy rocket falcon artemis starship countdown 32927' },
    { group: 'Harbor', title: 'Stocks', href: '/stocks/', text: 'mondoquote oversold rsi swing screen stocks' },
    { group: 'Notes', title: 'Wiki', href: '/wiki/', text: 'notes wiki' },
    { group: 'Notes', title: 'Forum', href: '/forum/', text: 'bulletin posts forum' },
    { group: 'Shop', title: 'Market', href: '/market/', text: 'ebay classifieds market mondobay for sale' },
    { group: 'Play', title: 'Wordle', href: '/wordle/', text: 'mondoword daily wordle puzzle five letter cyber' },
    { group: 'Play', title: 'Crossword', href: '/crossword/', text: 'mini crossword trivia daily five by five clues' },
    { group: 'Play', title: '8-Ball', href: '/8ball/', text: 'magic 8-ball mystic oracle fortune sphere' },
    { group: 'Play', title: 'Board', href: '/board/', text: 'drawing whiteboard' },
    { group: 'Play', title: 'Chat', href: '/chat/', text: 'chat room talk' },
    { group: 'Play', title: 'Arcade', href: '/arcade/', text: 'games arcade' },
    { group: 'Play', title: 'Pet', href: '/pet/', text: 'virtual pet egg mondogotchi habitat' },
    { group: 'Play', title: 'Radio', href: '/radio/', text: 'mondofm radio soundboard winamp somafm synth' },
    { group: 'Play', title: 'MMO', href: '/mmo/', text: 'world of mondocraft' },
    { group: 'Play', title: 'FPS', href: '/fps/', text: 'half-strike fortress' },
    { group: 'Play', title: 'Locked Room', href: '/escape/', text: 'escape door ???' },
    { group: 'Home', title: 'Privacy', href: '/privacy/', text: 'privacy delete my data account' }
  ];
  var games = [
    { kind: 'Game', title: 'High Seas Cruiser', href: '/arcade/', text: 'arcade seas cruise cart' },
    { kind: 'Game', title: 'Supreme Kitchen Rush', href: '/arcade/', text: 'arcade kitchen cart' },
    { kind: 'Game', title: 'Cyber Brick Breaker 1999', href: '/arcade/', text: 'arcade breaker cart' },
    { kind: 'Game', title: 'Virtual Pet', href: '/pet/', text: 'pet egg tamagotchi' },
    { kind: 'Game', title: 'Craft', href: '/mmo/', text: 'mmo mondocraft goldhaven' },
    { kind: 'Game', title: "Half-Strike — Sector C Labs", href: '/fps/', text: 'fps half-life labs crowbar' },
    { kind: 'Game', title: 'Half-Strike — de_sandstorm', href: '/fps/', text: 'fps counter-strike bomb sandstorm' },
    { kind: 'Game', title: "Half-Strike — 2Fort_99", href: '/fps/', text: 'fps team fortress sentry 2fort' },
    { kind: 'Game', title: 'The Locked Room', href: '/escape/', text: 'escape room door' }
  ];

  function addItem(list, item) {
    if (!item || !item.title || !item.href) return;
    item.kind = item.kind || 'Page';
    item.text = clip(item.text || item.title, 240);
    item.title = clip(item.title, 160);
    list.push(item);
  }
  function localItems() {
    var list = [];
    var recipes = readJson('mondosupreme.recipes.v1');
    if (Array.isArray(recipes)) {
      recipes.forEach(function (recipe) {
        if (!recipe || !recipe.title) return;
        var bits = [recipe.category].concat(recipe.tags || [], recipe.ingredients || [], recipe.notes || []);
        addItem(list, {
          kind: 'Recipe',
          title: recipe.title,
          href: '/recipes/#/recipe/' + encodeURIComponent(recipe.id || ''),
          text: bits.join(' ')
        });
      });
    }
    var pages = readJson('mondosupreme.wiki.v1');
    if (Array.isArray(pages)) {
      pages.forEach(function (page) {
        if (!page || !page.title) return;
        addItem(list, {
          kind: 'Wiki',
          title: page.title,
          href: '/wiki/#/page/' + encodeURIComponent(page.id || ''),
          text: [page.tags, page.body].join(' ')
        });
      });
    }
    var forum = readJson('mondosupreme.forum.v1');
    if (forum && forum.threads) {
      Object.keys(forum.threads).forEach(function (id) {
        var thread = forum.threads[id];
        if (!thread || !thread.title) return;
        var replies = forum.replies && forum.replies[id];
        var extra = '';
        if (replies) {
          Object.keys(replies).forEach(function (rid) {
            if (replies[rid] && replies[rid].body) extra += ' ' + replies[rid].body;
          });
        }
        addItem(list, {
          kind: 'Forum',
          title: thread.title,
          href: '/forum/#/t/' + encodeURIComponent(id),
          text: [thread.category, thread.body, extra].join(' ')
        });
      });
    }
    var market = readJson('mondosupreme.market.v1');
    if (market && market.items) {
      Object.keys(market.items).forEach(function (id) {
        var item = market.items[id];
        if (!item || !item.title) return;
        var extra = '';
        var bag = market.offers && market.offers[id];
        if (bag) {
          Object.keys(bag).forEach(function (oid) {
            if (bag[oid] && bag[oid].body) extra += ' ' + bag[oid].body;
          });
        }
        addItem(list, {
          kind: 'Listing',
          title: item.title,
          href: '/market/#/item/' + encodeURIComponent(id),
          text: [item.category, item.description, item.seller, extra].join(' ')
        });
      });
    }
    return list;
  }
  function catalog() {
    var list = [];
    sections.forEach(function (item) {
      addItem(list, { kind: 'Section', title: item.title, href: item.href, text: item.group + ' ' + item.text });
    });
    games.forEach(function (item) { addItem(list, item); });
    return list.concat(localItems(), remote);
  }
  function matches(item, query) {
    if (!query) return item.kind === 'Section' || item.kind === 'Game';
    var blob = (item.title + ' ' + item.kind + ' ' + item.text).toLowerCase();
    var parts = query.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (blob.indexOf(parts[i]) === -1) return false;
    }
    return true;
  }
  function rememberRemote(items) {
    remote = items;
    remoteAt = Date.now();
    try { sessionStorage.setItem(FIND_KEY, JSON.stringify({ at: remoteAt, items: items })); }
    catch (e) { /* private mode or a full disk */ }
  }
  function loadRemoteCache() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(FIND_KEY) || 'null');
      if (saved && saved.items && Date.now() - saved.at < FIND_TTL) {
        remote = saved.items;
        remoteAt = saved.at;
      }
    } catch (e) { /* ignore a bad cache */ }
  }
  function mapNode(kind, href, id, node, text) {
    if (!node) return null;
    var title = node.title || node.name || clip(node.body, 80);
    if (!title) return null;
    return {
      kind: kind,
      title: clip(title, 160),
      href: href,
      text: clip(text, 240)
    };
  }
  function pullRemote() {
    var ships = fetch('/cruises/fleet.json', { cache: 'force-cache' }).then(function (response) {
      if (!response.ok) return [];
      return response.json();
    }).then(function (data) {
      var list = [];
      var rows = data && data.ships;
      if (!Array.isArray(rows)) return list;
      rows.forEach(function (ship) {
        if (!ship || !ship.name) return;
        addItem(list, {
          kind: 'Ship',
          title: ship.name,
          href: '/cruises/#' + encodeURIComponent(ship.mmsi || ''),
          text: [ship.class, ship.year, ship.imo, ship.mmsi].join(' ')
        });
      });
      return list;
    }).catch(function () { return []; });

    var cloud = Promise.resolve([]);
    if (bootFirebase() && firebase.database) {
      cloud = new Promise(function (resolve) {
        var auth = firebase.auth();
        var unsub = function () {};
        var finish = function (user) {
          if (!user) { resolve([]); return; }
          var db = firebase.database();
          Promise.all([
            db.ref('recipes/items').once('value').catch(function () { return null; }),
            db.ref('wiki/items').once('value').catch(function () { return null; }),
            db.ref('forum/threads').once('value').catch(function () { return null; }),
            db.ref('forum/replies').once('value').catch(function () { return null; }),
            db.ref('market/items').once('value').catch(function () { return null; })
          ]).then(function (snaps) {
            var list = [];
            var recipes = snaps[0] && snaps[0].val();
            if (recipes) {
              Object.keys(recipes).forEach(function (id) {
                var node = recipes[id];
                if (!node) return;
                addItem(list, mapNode('Recipe', '/recipes/#/recipe/' + encodeURIComponent(id), id, node, [node.category, node.tags, node.ingredients, node.notes].join(' ')));
              });
            }
            var notes = snaps[1] && snaps[1].val();
            if (notes) {
              Object.keys(notes).forEach(function (id) {
                var node = notes[id];
                addItem(list, mapNode('Wiki', '/wiki/#/page/' + encodeURIComponent(id), id, node, [node.tags, node.body].join(' ')));
              });
            }
            var threads = snaps[2] && snaps[2].val();
            var replies = snaps[3] && snaps[3].val();
            if (threads) {
              Object.keys(threads).forEach(function (id) {
                var node = threads[id];
                var extra = '';
                var bag = replies && replies[id];
                if (bag) {
                  Object.keys(bag).forEach(function (rid) {
                    if (bag[rid] && bag[rid].body) extra += ' ' + bag[rid].body;
                  });
                }
                addItem(list, mapNode('Forum', '/forum/#/t/' + encodeURIComponent(id), id, node, [node.category, node.body, extra].join(' ')));
              });
            }
            var listings = snaps[4] && snaps[4].val();
            if (listings) {
              Object.keys(listings).forEach(function (id) {
                var node = listings[id];
                addItem(list, mapNode('Listing', '/market/#/item/' + encodeURIComponent(id), id, node, [node.category, node.description, node.seller].join(' ')));
              });
            }
            resolve(list);
          }).catch(function () { resolve([]); });
        };
        if (auth.currentUser) { finish(auth.currentUser); return; }
        var settled = false;
        unsub = auth.onAuthStateChanged(function (user) {
          if (settled) return;
          if (user) { settled = true; unsub(); finish(user); return; }
          if (window.__mondoPageAuth) return;
          auth.signInAnonymously().catch(function () { if (!settled) { settled = true; unsub(); finish(null); } });
        });
        setTimeout(function () {
          if (settled) return;
          settled = true;
          try { unsub(); } catch (e) { /* already detached */ }
          finish(auth.currentUser);
        }, 2500);
      });
    }
    return Promise.all([ships, cloud]).then(function (parts) {
      var signedIn = !bootFirebase() || !!(firebase.auth && firebase.auth().currentUser);
      remote = parts[0].concat(parts[1]);
      if (signedIn) rememberRemote(remote);
    });
  }

  function paintResults(root, query) {
    var items = catalog().filter(function (item) { return matches(item, query); }).slice(0, 40);
    root.replaceChildren();
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'shell-empty';
      empty.textContent = loading ? 'Looking through the site…' : 'Nothing matched.';
      root.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'shell-hit';
      link.href = item.href;
      var kind = document.createElement('span');
      kind.className = 'shell-kind';
      kind.textContent = item.kind;
      var title = document.createElement('b');
      title.textContent = item.title;
      link.appendChild(kind);
      link.appendChild(title);
      li.appendChild(link);
      root.appendChild(li);
    });
  }

  function hasOwnClose(dlg) {
    if (dlg.querySelector('.shell-x,[data-close],[value="cancel"],.close')) return true;
    var buttons = dlg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var label = (buttons[i].getAttribute('aria-label') || buttons[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(close|cancel|x|x close)$/i.test(label)) return true;
    }
    return false;
  }
  function armDialogs(scope) {
    (scope || document).querySelectorAll('dialog').forEach(function (dlg) {
      if (hasOwnClose(dlg)) return;
      var heading = dlg.querySelector('h2');
      if (heading && !dlg.getAttribute('aria-labelledby')) {
        if (!heading.id) heading.id = (dlg.id || 'dlg') + 'Title';
        dlg.setAttribute('aria-labelledby', heading.id);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shell-x';
      btn.textContent = '\u00d7';
      btn.setAttribute('aria-label', 'Close');
      btn.addEventListener('click', function () {
        if (typeof dlg.close === 'function') dlg.close();
      });
      var header = dlg.querySelector(':scope > header');
      if (!header) {
        header = document.createElement('header');
        if (heading && heading.parentNode === dlg) header.appendChild(heading);
        dlg.insertBefore(header, dlg.firstChild);
      }
      header.appendChild(btn);
    });
  }
  window.MONDO_SHELL_ARM = armDialogs;

  function buildFind() {
    var dlg = document.createElement('dialog');
    dlg.id = 'shellFind';
    dlg.className = 'shell-find';
    dlg.setAttribute('aria-labelledby', 'shellFindTitle');
    var title = document.createElement('h2');
    title.id = 'shellFindTitle';
    title.textContent = 'Find';
    var label = document.createElement('label');
    label.textContent = 'Search recipes, ships, notes, posts, listings, and games';
    var input = document.createElement('input');
    input.id = 'shellFindInput';
    input.type = 'search';
    input.autocomplete = 'off';
    input.enterKeyHint = 'search';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.placeholder = 'Try pasta, Oasis, fortress, or 8-ball';
    input.setAttribute('aria-label', 'Search the site');
    label.appendChild(input);
    var results = document.createElement('ul');
    results.id = 'shellFindResults';
    results.className = 'shell-results';
    dlg.appendChild(title);
    dlg.appendChild(label);
    dlg.appendChild(results);
    document.body.appendChild(dlg);
    armDialogs(dlg.parentNode);
    input.addEventListener('input', function () { paintResults(results, input.value.trim()); });
    dlg.addEventListener('close', function () { input.value = ''; });
    return { dlg: dlg, input: input, results: results };
  }

  function buildOwnerDialog() {
    var dlg = document.createElement('dialog');
    dlg.id = 'shellOwnerDialog';
    dlg.className = 'shell-find';
    var title = document.createElement('h2');
    title.textContent = 'Owner sign-in';
    var copy = document.createElement('p');
    copy.textContent = 'Sign in with your email and password. Webmaster tools turn on when this account is listed under admins. The password is checked by Firebase and is not stored here.';
    var form = document.createElement('form');
    var emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email';
    var email = document.createElement('input');
    email.type = 'email';
    email.autocomplete = 'username';
    email.required = true;
    emailLabel.appendChild(email);
    var passLabel = document.createElement('label');
    passLabel.textContent = 'Password';
    var pass = document.createElement('input');
    pass.type = 'password';
    pass.autocomplete = 'current-password';
    pass.required = true;
    passLabel.appendChild(pass);
    var err = document.createElement('p');
    err.hidden = true;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'shell-tool';
    submit.textContent = 'Sign in';
    form.appendChild(emailLabel);
    form.appendChild(passLabel);
    form.appendChild(err);
    form.appendChild(submit);
    dlg.appendChild(title);
    dlg.appendChild(copy);
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    armDialogs(document);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      err.hidden = true;
      if (!bootFirebase()) {
        err.textContent = 'Sign-in is not available on this page.';
        err.hidden = false;
        return;
      }
      firebase.auth().signInWithEmailAndPassword(email.value.trim(), pass.value).then(function () {
        pass.value = '';
        dlg.close();
      }).catch(function () {
        pass.value = '';
        err.textContent = 'That email or password is wrong.';
        err.hidden = false;
      });
    });
    return dlg;
  }

  var AUDIO_KEY = 'mondosupreme.audio.v1';
  var FX_KEY = 'mondosupreme.fx.v1';
  var programs = [
    { title: "Ask the Butler", href: '/search/', icon: 'search' },
    { title: 'Recipes', href: '/recipes/', icon: 'pot' },
    { title: 'Grocery List', href: '/grocery/', icon: 'meal' },
    { title: "Recipe TV", href: '/daily-recipe/', icon: 'tv' },
    { title: 'Cruises', href: '/cruises/', icon: 'ship' },
    { title: "Weather", href: '/weather/', icon: 'radar' },
    { title: "Launch Control", href: '/launches/', icon: 'rocket' },
    { title: 'Tide & Surf', href: '/tides/', icon: 'tide' },
    { title: 'Connections', href: '/connections/', icon: 'puzzle' },
    { title: 'Local Guide', href: '/local/', icon: 'pin' },
    { title: 'Tropics', href: '/tropics/', icon: 'storm' },
    { title: "Stocks", href: '/stocks/', icon: 'chart' },
    { title: "Word Game", href: '/wordle/', icon: 'word' },
    { title: "Mini Crossword", href: '/crossword/', icon: 'cross' },
    { title: 'Wiki', href: '/wiki/', icon: 'book' },
    { title: 'Paint', href: '/board/', icon: 'paint' },
    { title: 'Chat', href: '/chat/', icon: 'aim' },
    { title: 'Arcade', href: '/arcade/', icon: 'joy' },
    { title: 'Virtual Pet', href: '/pet/', icon: 'egg' },
    { title: "Radio", href: '/radio/', icon: 'radio' },
    { title: 'Bulletin Forum', href: '/forum/', icon: 'forum' },
    { title: "Marketplace", href: '/market/', icon: 'gavel' },
    { title: "Mystic 8-Ball", href: '/8ball/', icon: 'ball' },
    { title: 'Craft', href: '/mmo/', icon: 'sword' },
    { title: "Half-Strike '99", href: '/fps/', icon: 'gun' },
    { title: 'ASH_HOUSE.EXE', href: '/escape/', icon: 'door' }
  ];
  var toyLinks = [
    { title: '56k Dial-Up', href: '/#dialup', icon: 'modem' },
    { title: 'Magic 8-Ball', href: '/8ball/', icon: 'ball' },
    { title: 'Lava Lamp', href: '/#lava', icon: 'lava' },
    { title: 'Pog Collection', href: '/#pogs', icon: 'pog' },
    { title: 'Desktop blue screen', href: '/#bsod', icon: 'bsod' }
  ];
  var ICONS = {
    pot: [[2,10,12,4,'#c0c0c0'],[4,6,8,4,'#808080'],[6,4,4,2,'#404040'],[1,10,2,2,'#000'],[13,10,2,2,'#000'],[5,12,6,2,'#000']],
    ship: [[2,8,12,3,'#fff'],[6,5,4,3,'#c0c0c0'],[4,11,10,2,'#000080'],[8,3,2,2,'#ff0000'],[1,11,2,2,'#003399'],[13,11,2,2,'#003399']],
    book: [[3,2,10,12,'#000080'],[5,2,8,12,'#fff'],[6,5,6,1,'#000'],[6,8,6,1,'#000'],[6,11,4,1,'#000']],
    paint: [[2,10,8,4,'#c0c0c0'],[8,4,2,8,'#804000'],[10,2,4,4,'#ff0000'],[3,12,6,1,'#000'],[4,8,2,2,'#0000ff']],
    aim: [[2,2,12,12,'#ffff00'],[4,6,2,2,'#000'],[10,6,2,2,'#000'],[5,10,6,2,'#000']],
    joy: [[4,2,8,4,'#000'],[6,6,4,2,'#c0c0c0'],[2,8,12,4,'#000080'],[4,9,2,2,'#ff0000'],[10,9,2,2,'#00ff00']],
    egg: [[5,2,6,4,'#fff'],[4,6,8,6,'#ffe14a'],[6,8,4,2,'#000'],[3,12,10,2,'#808080']],
    note: [[3,2,10,12,'#fff'],[5,5,6,1,'#000080'],[5,8,6,1,'#000080'],[5,11,4,1,'#000080'],[11,2,2,3,'#ffcc00']],
    gavel: [[1,3,9,2,'#c4a574'],[1,5,9,2,'#8b5a2b'],[8,2,3,2,'#e8e8e8'],[4,7,2,6,'#6b3e1e'],[3,12,4,2,'#3a2412']],
    sword: [[8,1,2,8,'#c0c0c0'],[6,8,6,2,'#ffd100'],[8,10,2,4,'#804000'],[4,3,3,2,'#ff0000']],
    gun: [[2,6,8,3,'#404040'],[8,4,4,3,'#808080'],[10,7,4,2,'#000'],[3,9,3,3,'#654321']],
    door: [[4,2,8,12,'#6b3a1f'],[10,8,2,2,'#ffd100'],[5,3,6,4,'#87ceeb'],[6,12,4,2,'#000']],
    modem: [[2,6,12,6,'#c0c0c0'],[4,8,2,2,'#00ff00'],[7,8,2,2,'#ffff00'],[10,4,2,2,'#000'],[11,2,2,2,'#000']],
    ball: [[4,2,8,8,'#000'],[6,4,4,4,'#fff'],[7,10,2,4,'#000'],[5,10,6,2,'#000']],
    lava: [[6,2,4,2,'#c0c0c0'],[5,4,6,10,'#202060'],[7,6,2,3,'#ff00ff'],[6,11,3,2,'#ff6600']],
    pog: [[3,3,10,10,'#ff6600'],[5,5,6,6,'#ffff00'],[6,7,4,2,'#000']],
    bsod: [[2,2,12,12,'#0000aa'],[4,5,8,1,'#fff'],[4,7,8,1,'#fff'],[4,9,6,1,'#fff']],
    quote: [[2,2,12,12,'#001800'],[3,4,7,1,'#39ff14'],[3,6,9,1,'#39ff14'],[3,8,6,1,'#39ff14'],[3,11,4,1,'#ffcc00']],
    word: [[1,1,6,6,'#538d4e'],[9,1,6,6,'#c9b458'],[1,9,6,6,'#3a3a3a'],[9,9,6,6,'#538d4e']],
    tv: [[1,3,14,8,'#202020'],[2,4,12,6,'#001800'],[3,5,10,1,'#39ff14'],[4,7,6,1,'#39ff14'],[6,11,4,2,'#808080'],[3,13,10,1,'#404040']],
    radar: [[2,2,12,8,'#000080'],[3,3,10,1,'#ff7a00'],[3,5,7,1,'#fff'],[3,7,5,1,'#7fdfff'],[6,10,4,2,'#c0c0c0'],[4,12,8,2,'#808080'],[12,1,2,2,'#ffcc00']],
    search: [[4,1,8,3,'#1a1a1a'],[2,4,12,2,'#1a1a1a'],[3,7,8,8,'#000080'],[5,9,4,4,'#7fdfff'],[10,12,3,2,'#ffd100'],[12,14,2,2,'#c0c0c0']],
    meal: [[2,6,12,6,'#fff'],[4,4,8,2,'#ff6600'],[3,8,10,2,'#39ff14'],[6,2,4,2,'#ffe14a']],
    rocket: [[6,1,4,3,'#fff'],[7,4,2,4,'#ff0000'],[5,8,6,2,'#c0c0c0'],[4,10,8,2,'#000080'],[6,12,4,2,'#ff6600']],
    radio: [[2,4,12,8,'#000080'],[4,6,3,3,'#39ff14'],[9,6,3,3,'#ffcc00'],[6,12,4,2,'#c0c0c0'],[3,2,2,2,'#000']],
    cross: [[1,1,4,4,'#000080'],[6,1,4,4,'#000'],[11,1,4,4,'#000080'],[1,6,4,4,'#000'],[6,6,4,4,'#000080'],[11,6,4,4,'#000'],[1,11,4,4,'#000080'],[6,11,4,4,'#000'],[11,11,4,4,'#000080']],
    home: [[2,7,12,2,'#c0c0c0'],[4,9,8,5,'#808080'],[7,11,2,3,'#fff'],[6,4,4,3,'#000080']],
    shield: [[6,2,4,2,'#c0c0c0'],[4,4,8,7,'#000080'],[6,6,4,3,'#7fdfff'],[7,11,2,3,'#c0c0c0']],
    tide: [[1,3,14,2,'#000080'],[1,7,14,2,'#1084d0'],[1,11,14,2,'#7fdfff']],
    puzzle: [[2,2,5,5,'#ffcc00'],[9,2,5,5,'#00aa00'],[2,9,5,5,'#ff0000'],[9,9,5,5,'#0000ff']],
    pin: [[6,1,4,4,'#ff0000'],[7,5,2,6,'#404040'],[5,11,6,2,'#808080']],
    storm: [[2,3,12,4,'#c0c0c0'],[5,8,4,2,'#ffff00'],[6,10,2,4,'#000080']],
    chart: [[2,12,3,2,'#00aa00'],[6,8,3,6,'#00aa00'],[10,5,3,9,'#00aa00'],[2,14,12,1,'#000']],
    forum: [[1,2,10,7,'#fff'],[3,4,6,1,'#000080'],[3,6,5,1,'#000080'],[1,9,6,4,'#c0c0c0'],[8,6,7,6,'#ffffcc']]
  };
  /* Self-hosted line icons. 24px grid, uniform 2px stroke, Lucide/Phosphor style. Original drawings, no CDN. */
  var LINE = {
    home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.8V20h12V9.8"/><path d="M10 20v-5h4v5"/>',
    pot: '<path d="M5 10h14"/><path d="M7 10v7.5A2.5 2.5 0 0 0 9.5 20h5a2.5 2.5 0 0 0 2.5-2.5V10"/><path d="M9 7.5a3 3 0 0 1 6 0"/>',
    ship: '<path d="M3 15h18"/><path d="M5 15l1.5 4h11L19 15"/><path d="M8 15V8h6l3 3v4"/><path d="M12 8V4"/>',
    book: '<path d="M12 6.5C10.5 5 8.2 4 5 4v14c3.2 0 5.5 1 7 2.5C13.5 19 15.8 18 19 18V4c-3.2 0-5.5 1-7 2.5z"/><path d="M12 6.5V20.5"/>',
    paint: '<path d="m14.5 5.5 4 4"/><path d="m13 7 4 4-7.5 7.5H5.5V14z"/>',
    aim: '<path d="M5 16.5A8 8 0 1 1 8.5 19L4 20.5 5 16.5z"/>',
    joy: '<rect x="2.5" y="8" width="19" height="9" rx="4.5"/><path d="M7 12.5h3M8.5 11v3"/><circle cx="15.5" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.5" r=".8" fill="currentColor" stroke="none"/>',
    egg: '<path d="M12 21c4.2 0 7-3.4 7-7.6C19 8.2 16.2 3 12 3S5 8.2 5 13.4C5 17.6 7.8 21 12 21z"/>',
    note: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/><path d="M9.5 12h5M9.5 16h3.5"/>',
    gavel: '<path d="M4 20h6"/><path d="m8 16 6-6"/><path d="m11 7 6 6"/><path d="m13 5 6 6-5 5-6-6z"/>',
    sword: '<path d="M14.5 4.5 20 10l-8.5 8.5"/><path d="M11.5 15.5 8 19"/><path d="M6.5 17.5 4 20"/><path d="m9 13 2 2"/>',
    gun: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    door: '<path d="M7 3.5h10V21H7z"/><path d="M14.5 12h.01"/>',
    modem: '<path d="M4 14h16v5H4z"/><path d="M8 14V8.5M12 14V5M16 14v-4"/>',
    ball: '<circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" font-size="10" font-family="Inter, ui-sans-serif, sans-serif" font-weight="700" fill="currentColor" stroke="none">8</text>',
    lava: '<path d="M9 3.5h6v2.2l-1 13.3H10L9 5.7z"/><path d="M11 9.5h2M10.5 14h3"/>',
    pog: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    bsod: '<rect x="3.5" y="4" width="17" height="12" rx="1.5"/><path d="M8 20h8M7 8h10M7 11.5h6"/>',
    quote: '<path d="M4 18V9l4-3v12"/><path d="M12 18V9l4-3v12"/><path d="M4 18h16"/>',
    word: '<rect x="2" y="8" width="3.1" height="8" rx=".5" fill="currentColor" stroke="none"/><rect x="6.15" y="8" width="3.1" height="8" rx=".5" fill="currentColor" stroke="none"/><rect x="10.3" y="8" width="3.1" height="8" rx=".5" fill="currentColor" stroke="none"/><rect x="14.45" y="8" width="3.1" height="8" rx=".5" fill="currentColor" stroke="none"/><rect x="18.6" y="8" width="3.1" height="8" rx=".5" fill="currentColor" stroke="none"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M8 3.5 12 6l4-2.5"/>',
    radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 5-4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    meal: '<circle cx="8" cy="20" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none"/><path d="M3 4h2l1.6 9.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6"/>',
    rocket: '<path d="M12 2.5 16.5 12v3.5h-9V12z"/><path d="M7.5 13.5 4.5 17l4-1.2"/><path d="M16.5 13.5 19.5 17l-4-1.2"/><path d="M10.5 19h3L12 21.5z"/><circle cx="12" cy="10" r="1.1" fill="currentColor" stroke="none"/>',
    radio: '<rect x="3" y="8" width="18" height="11" rx="2"/><circle cx="8" cy="13.5" r="2"/><path d="M13 12h5M13 15h3.5M7.5 8 14 3.5"/>',
    cross: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    shield: '<path d="M12 3 19 6v6.2c0 4.2-2.9 6.8-7 7.8-4.1-1-7-3.6-7-7.8V6z"/>',
    apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    tide: '<path d="M3 7c1.2 1.2 2.2 1.8 3.6 1.8 2.2 0 2.6-1.8 4.6-1.8s2.4 1.8 4.6 1.8c1.4 0 2.4-.6 3.6-1.8"/><path d="M3 12c1.2 1.2 2.2 1.8 3.6 1.8 2.2 0 2.6-1.8 4.6-1.8s2.4 1.8 4.6 1.8c1.4 0 2.4-.6 3.6-1.8"/><path d="M3 17c1.2 1.2 2.2 1.8 3.6 1.8 2.2 0 2.6-1.8 4.6-1.8s2.4 1.8 4.6 1.8c1.4 0 2.4-.6 3.6-1.8"/>',
    puzzle: '<circle cx="7" cy="7" r="2.1"/><circle cx="17" cy="7" r="2.1"/><circle cx="7" cy="17" r="2.1"/><circle cx="17" cy="17" r="2.1"/><path d="M9.1 7h5.8M7 9.1v5.8M17 9.1v5.8M9.1 17h5.8"/>',
    pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>',
    storm: '<path d="M8 16h8.2a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.6A3.1 3.1 0 0 0 8 16z"/><path d="m11 9.5 2.6 3.4H11L13.2 17"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/>',
    forum: '<path d="M6 16.5 3.5 19V6.5A2.5 2.5 0 0 1 6 4h8a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5z"/><path d="M10 16.5V18a2 2 0 0 0 2 2h5.2L20.5 22v-8A2 2 0 0 0 18.5 12H16"/>'
  };
  /* Tile fill plus a dark stroke. Same pair in light and dark so the icon never sits white-on-navy. */
  var ACCENT = {
    home: ['#e2e8f0', '#0f172a'],
    pot: ['#ffedd5', '#9a3412'],
    ship: ['#ccfbf1', '#115e59'],
    book: ['#f3e8ff', '#6b21a8'],
    paint: ['#fce7f3', '#9d174d'],
    aim: ['#dbeafe', '#1e3a8a'],
    joy: ['#fef9c3', '#854d0e'],
    egg: ['#fef3c7', '#92400e'],
    note: ['#e2e8f0', '#0f172a'],
    gavel: ['#f5f5f4', '#44403c'],
    sword: ['#ffe4e6', '#be123c'],
    gun: ['#e2e8f0', '#1e293b'],
    door: ['#f5f5f4', '#292524'],
    modem: ['#cffafe', '#155e75'],
    ball: ['#f1f5f9', '#0f172a'],
    lava: ['#ffedd5', '#c2410c'],
    pog: ['#fef9c3', '#a16207'],
    bsod: ['#dbeafe', '#1e3a8a'],
    quote: ['#d1fae5', '#065f46'],
    word: ['#dcfce7', '#166534'],
    tv: ['#ede9fe', '#5b21b6'],
    radar: ['#e0f2fe', '#0c4a6e'],
    search: ['#e0e7ff', '#312e81'],
    meal: ['#dcfce7', '#14532d'],
    rocket: ['#ffe4e6', '#9f1239'],
    radio: ['#fde68a', '#713f12'],
    cross: ['#ede9fe', '#5b21b6'],
    shield: ['#d1fae5', '#065f46'],
    apps: ['#e2e8f0', '#334155'],
    tide: ['#cffafe', '#155e75'],
    puzzle: ['#fef3c7', '#92400e'],
    pin: ['#fee2e2', '#991b1b'],
    storm: ['#ddd6fe', '#4c1d95'],
    chart: ['#ecfccb', '#3f6212'],
    forum: ['#e2e8f0', '#1e293b']
  };
  function lineSvg(name, className) {
    var cls = className ? ' class="' + className + '"' : '';
    return '<svg' + cls + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (LINE[name] || LINE.note) + '</svg>';
  }
  function appTile(name) {
    var tile = document.createElement('span');
    tile.className = 'app-tile';
    var colors = ACCENT[name] || ACCENT.note;
    tile.style.setProperty('--app-bg', colors[0]);
    tile.style.setProperty('--app-ink', colors[1]);
    tile.innerHTML = lineSvg(name);
    return tile;
  }
  function glyphPair(name) {
    var wrap = document.createElement('span');
    wrap.className = 'dock-glyph';
    var modern = document.createElement('span');
    modern.className = 'app-modern';
    modern.innerHTML = lineSvg(name);
    var classic = document.createElement('span');
    classic.className = 'app-pixel';
    classic.appendChild(pixelIcon(name));
    wrap.appendChild(modern);
    wrap.appendChild(classic);
    return wrap;
  }
  function pixelIcon(name) {
    var cells = ICONS[name] || ICONS.pot;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    cells.forEach(function (cell) {
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
  function audioMuted() {
    var saved = readJson(AUDIO_KEY);
    return !!(saved && saved.muted);
  }
  function setMuted(muted) {
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ muted: !!muted })); } catch (e) { /* private mode */ }
    document.documentElement.setAttribute('data-muted', muted ? '1' : '0');
    document.dispatchEvent(new CustomEvent('mondo-audio', { detail: { muted: !!muted } }));
  }
  function readFx() {
    var saved = readJson(FX_KEY) || {};
    return { scan: saved.scan ? 1 : 0, stars: saved.stars ? 1 : 0 };
  }
  function applyFx(fx) {
    document.documentElement.setAttribute('data-scan', fx.scan ? '1' : '0');
    document.documentElement.setAttribute('data-stars', fx.stars ? '1' : '0');
  }
  function writeFx(fx) {
    try { localStorage.setItem(FX_KEY, JSON.stringify({ scan: fx.scan ? 1 : 0, stars: fx.stars ? 1 : 0 })); } catch (e) { /* private mode */ }
    applyFx(fx);
    document.dispatchEvent(new CustomEvent('mondo-fx', { detail: fx }));
  }
  window.MONDO_AUDIO = { muted: function () { return document.documentElement.getAttribute('data-muted') === '1'; }, setMuted: setMuted };
  window.MONDO_FX = {
    get: readFx,
    set: function (patch) {
      var fx = readFx();
      if (patch && patch.scan != null) fx.scan = patch.scan ? 1 : 0;
      if (patch && patch.stars != null) fx.stars = patch.stars ? 1 : 0;
      writeFx(fx);
    }
  };
  function menuLink(item) {
    var link = document.createElement('a');
    link.className = 'studio-app';
    link.href = item.href;
    link.removeAttribute('role');
    var modern = document.createElement('span');
    modern.className = 'app-modern';
    modern.appendChild(appTile(item.icon));
    link.appendChild(modern);
    var classic = document.createElement('span');
    classic.className = 'app-pixel';
    classic.appendChild(pixelIcon(item.icon));
    link.appendChild(classic);
    var label = document.createElement('span');
    label.className = 'app-label';
    var dot = item.title.lastIndexOf('.');
    if (dot > 4 && item.title.length > 12) {
      label.appendChild(document.createTextNode(item.title.slice(0, dot)));
      label.appendChild(document.createElement('wbr'));
      label.appendChild(document.createTextNode(item.title.slice(dot)));
    } else label.textContent = item.title;
    link.appendChild(label);
    var path = location.pathname;
    var here = item.href === '/' ? path === '/' : path.indexOf(item.href) === 0;
    if (here) link.setAttribute('aria-current', 'page');
    return link;
  }
  function armStars() {
    if (document.getElementById('starTrail')) return;
    var box = document.createElement('div');
    box.id = 'starTrail';
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
    var last = 0;
    var nodes = [];
    document.addEventListener('pointermove', function (event) {
      if (document.documentElement.getAttribute('data-stars') !== '1') return;
      if (document.documentElement.getAttribute('data-shell-paused') === '1') return;
      var now = Date.now();
      if (now - last < 40) return;
      last = now;
      var star = document.createElement('span');
      star.className = 'star-bit';
      star.textContent = '★';
      star.style.left = Math.round(event.clientX - 6) + 'px';
      star.style.top = Math.round(event.clientY - 8) + 'px';
      box.appendChild(star);
      nodes.push(star);
      while (nodes.length > 12) {
        var old = nodes.shift();
        if (old.parentNode) old.parentNode.removeChild(old);
      }
      setTimeout(function () {
        if (star.parentNode) star.parentNode.removeChild(star);
        var index = nodes.indexOf(star);
        if (index >= 0) nodes.splice(index, 1);
      }, 560);
    }, { passive: true });
  }
  function paintClock(node) {
    if (!node || document.hidden) return;
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    node.textContent = hours + ':' + (minutes < 10 ? '0' : '') + minutes + ' ' + suffix;
    node.dateTime = now.toISOString();
  }

  function tagSection() {
    var path = location.pathname;
    var section = 'studio-portal';
    if (path.indexOf('/recipes') === 0 || path.indexOf('/daily-recipe') === 0 || path.indexOf('/grocery') === 0 || path.indexOf('/planner') === 0) section = 'studio-kitchen';
    else if (path.indexOf('/cruises') === 0 || path.indexOf('/weather') === 0 || path.indexOf('/launches') === 0) section = 'studio-telemetry';
    else if (path.indexOf('/stocks') === 0) section = 'studio-finance';
    else if (path.indexOf('/search') === 0 || path.indexOf('/wiki') === 0) section = 'studio-editorial';
    else if (path.indexOf('/forum') === 0 || path.indexOf('/chat') === 0 || path.indexOf('/market') === 0 || path.indexOf('/board') === 0) section = 'studio-community';
    else if (path.indexOf('/arcade') === 0 || path.indexOf('/pet') === 0 || path.indexOf('/mmo') === 0 || path.indexOf('/fps') === 0 || path.indexOf('/wordle') === 0 || path.indexOf('/crossword') === 0 || path.indexOf('/8ball') === 0 || path.indexOf('/escape') === 0) section = 'studio-game';
    document.body.classList.add(section);
  }
  function linkPrivacy() {
    var foot = document.querySelector('footer.site-footer .wrap');
    if (!foot) {
      var footer = document.createElement('footer');
      footer.className = 'site-footer';
      foot = document.createElement('div');
      foot.className = 'wrap';
      footer.appendChild(foot);
      document.body.appendChild(footer);
    }
    if (foot.querySelector('a[href="/privacy/"]')) return;
    if (foot.textContent.trim()) foot.appendChild(document.createTextNode(' · '));
    var link = document.createElement('a');
    link.href = '/privacy/';
    link.textContent = 'Privacy';
    foot.appendChild(link);
  }
  function boot() {
    writeFx({ scan: 0, stars: 0 });
    document.documentElement.setAttribute('data-muted', audioMuted() ? '1' : '0');
    tagSection();
    var nav = document.querySelector('.site-header .site-nav');
    if (!nav || document.querySelector('.studio-nav')) return;
    window.__mondoPageAuth = appsReady();
    loadRemoteCache();

    var taskbar = document.createElement('header');
    taskbar.className = 'studio-nav';
    taskbar.id = 'win98Taskbar';
    var brand = document.createElement('a');
    brand.className = 'studio-brand';
    brand.href = '/';
    brand.setAttribute('aria-label', 'Mondosupreme');
    brand.innerHTML = '<span class="studio-mark" aria-hidden="true">M</span><span class="studio-word" aria-hidden="true">Mondosupreme</span>';
    var links = document.createElement('nav');
    links.className = 'studio-links';
    links.setAttribute('aria-label', 'Primary');
    [
      ['Recipes', '/recipes/'],
      ['Cruises', '/cruises/'],
      ['Weather', '/weather/'],
      ['Tides', '/tides/'],
      ['Launches', '/launches/'],
      ['Grocery List', '/grocery/'],
      ['Puzzles', '/connections/'],
      ['Local', '/local/'],
      ['Tropics', '/tropics/'],
      ['Markets', '/stocks/'],
      ['Search', '/search/'],
      ['Community', '/forum/'],
      ['Games', '/arcade/']
    ].forEach(function (pair) {
      var a = document.createElement('a');
      a.href = pair[1];
      a.textContent = pair[0];
      if (location.pathname.indexOf(pair[1]) === 0) a.setAttribute('aria-current', 'page');
      links.appendChild(a);
    });
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'studio-apps';
    start.id = 'shellStart';
    start.setAttribute('aria-haspopup', 'true');
    start.setAttribute('aria-expanded', 'false');
    start.setAttribute('aria-controls', 'shellMenu');
    start.setAttribute('aria-label', 'All Apps');
    start.innerHTML = lineSvg('apps', 'nav-ico') + '<span class="nav-label">All Apps</span><kbd>⌘K</kbd>';
    var menu = document.createElement('nav');
    menu.className = 'studio-drawer';
    menu.id = 'shellMenu';
    menu.setAttribute('aria-label', 'All apps');
    var popoverOk = typeof menu.showPopover === 'function';
    if (popoverOk) {
      menu.setAttribute('popover', 'auto');
      start.setAttribute('popovertarget', 'shellMenu');
    } else menu.hidden = true;
    var groups = [
      ['Kitchen & Food', ['Recipes', 'Grocery List', 'Recipe TV']],
      ['Space Coast & Travel', ['Cruises', 'Weather', 'Launch Control', 'Tide & Surf', 'Local Guide', 'Tropics']],
      ['Finance & Search', ['Stocks', 'Ask the Butler', 'Wiki']],
      ['Community', ['Bulletin Forum', 'Chat', 'Paint', 'Marketplace', 'Radio']],
      ['Game Studio', ['Arcade', 'Virtual Pet', 'Word Game', 'Connections', 'Mini Crossword', 'Mystic 8-Ball', 'Craft', "Half-Strike '99", 'ASH_HOUSE.EXE']]
    ];
    groups.forEach(function (group) {
      var block = document.createElement('section');
      block.className = 'studio-group';
      var heading = document.createElement('h2');
      heading.textContent = group[0];
      block.appendChild(heading);
      var list = document.createElement('div');
      list.className = 'studio-apps-grid';
      group[1].forEach(function (title) {
        var item = null;
        for (var i = 0; i < programs.length; i++) if (programs[i].title === title) item = programs[i];
        if (item) list.appendChild(menuLink(item));
      });
      block.appendChild(list);
      menu.appendChild(block);
    });
    var studio = document.createElement('div');
    studio.className = 'studio-apps-grid';
    studio.appendChild(menuLink({ title: 'Home', href: '/', icon: 'home' }));
    studio.appendChild(menuLink({ title: 'Privacy', href: '/privacy/', icon: 'shield' }));
    menu.insertBefore(studio, menu.firstChild);
    var actions = document.createElement('div');
    actions.className = 'studio-actions shell-bar';
    var findBtn = document.createElement('button');
    findBtn.type = 'button';
    findBtn.className = 'studio-ghost';
    findBtn.id = 'shellFindBtn';
    findBtn.setAttribute('aria-label', 'Find');
    findBtn.innerHTML = lineSvg('search', 'nav-ico') + '<span class="nav-label">Find</span>';
    var ownerBtn = document.createElement('button');
    ownerBtn.type = 'button';
    ownerBtn.className = 'studio-account';
    ownerBtn.id = 'shellOwner';
    ownerBtn.setAttribute('aria-label', 'Sign in');
    ownerBtn.innerHTML = '<span class="nav-avatar" aria-hidden="true">S</span><span class="nav-label">Sign In</span>';
    var muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'studio-ghost';
    muteBtn.id = 'shellMute';
    function paintMute() {
      var muted = audioMuted();
      muteBtn.textContent = muted ? 'MIDI Off' : 'Sound';
      muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', muted ? 'Sound is muted' : 'Mute sound and MIDI');
    }
    paintMute();
    muteBtn.addEventListener('click', function () {
      setMuted(!audioMuted());
      paintMute();
    });
    var clock = document.createElement('time');
    clock.className = 'studio-clock';
    clock.id = 'shellClock';
    paintClock(clock);
    actions.appendChild(findBtn);
    actions.appendChild(muteBtn);
    actions.appendChild(ownerBtn);
    taskbar.appendChild(brand);
    taskbar.appendChild(links);
    taskbar.appendChild(start);
    taskbar.appendChild(actions);
    taskbar.appendChild(clock);
    document.body.appendChild(taskbar);
    document.body.appendChild(menu);
    var dockNames = { Home: 'home', Recipes: 'pot', 'Grocery List': 'meal', Weather: 'radar', Search: 'search' };
    var dock = document.createElement('nav');
    dock.className = 'studio-dock';
    dock.setAttribute('aria-label', 'Shortcuts');
    [
      ['Home', '/', 'Home'],
      ['Recipes', '/recipes/', 'Recipes'],
      ['Grocery', '/grocery/', 'Grocery List'],
      ['Weather', '/weather/', 'Weather'],
      ['Search', '/search/', 'Search']
    ].forEach(function (pair) {
      var a = document.createElement('a');
      a.href = pair[1];
      a.appendChild(glyphPair(dockNames[pair[2]] || 'note'));
      var label = document.createElement('span');
      label.textContent = pair[0];
      a.appendChild(label);
      if (pair[0] !== pair[2]) a.setAttribute('aria-label', pair[2]);
      if (pair[1] === '/' ? location.pathname === '/' : location.pathname.indexOf(pair[1]) === 0) a.setAttribute('aria-current', 'page');
      dock.appendChild(a);
    });
    var more = document.createElement('button');
    more.type = 'button';
    more.appendChild(glyphPair('apps'));
    var moreLabel = document.createElement('span');
    moreLabel.textContent = 'More';
    more.appendChild(moreLabel);
    more.setAttribute('aria-label', 'All apps');
    more.addEventListener('click', function (event) {
      event.stopPropagation();
      start.click();
    });
    dock.appendChild(more);
    document.body.appendChild(dock);
    var tray = menu;
    function parkTheme() {
      var theme = document.querySelector('.theme-switch');
      if (!theme) return;
      if (menu.firstChild !== theme) menu.insertBefore(theme, menu.firstChild);
    }
    parkTheme();
    setTimeout(parkTheme, 0);
    var clockQuery = window.matchMedia('(min-width:901px)');
    var clockTimer = 0;
    function syncClock() {
      if (clockQuery.matches && !document.hidden) {
        paintClock(clock);
        if (!clockTimer) clockTimer = setInterval(function () { paintClock(clock); }, 1000);
      } else if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = 0;
      }
    }
    syncClock();
    if (clockQuery.addEventListener) clockQuery.addEventListener('change', syncClock);
    else if (clockQuery.addListener) clockQuery.addListener(syncClock);

    function menuOpen() {
      return popoverOk ? menu.matches(':popover-open') : !menu.hidden;
    }
    function setMenu(open) {
      if (popoverOk) {
        if (open && !menuOpen()) menu.showPopover();
        if (!open && menuOpen()) menu.hidePopover();
      } else {
        menu.hidden = !open;
        start.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }
    if (popoverOk) {
      menu.addEventListener('toggle', function (event) {
        start.setAttribute('aria-expanded', event.newState === 'open' ? 'true' : 'false');
      });
    } else {
      start.addEventListener('click', function (event) {
        event.stopPropagation();
        setMenu(menu.hidden);
      });
      document.addEventListener('click', function (event) {
        if (!menu.hidden && !menu.contains(event.target) && event.target !== start) setMenu(false);
      });
    }
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        setMenu(!menuOpen());
      }
      if (event.key === 'Escape' && !popoverOk) setMenu(false);
    });

    var find = buildFind();
    var ownerDialog = null;
    findBtn.addEventListener('click', function () {
      setMenu(false);
      paintResults(find.results, '');
      if (typeof find.dlg.showModal === 'function') find.dlg.showModal();
      find.input.focus();
      if (Date.now() - remoteAt < FIND_TTL) return;
      loading = true;
      paintResults(find.results, find.input.value.trim());
      pullRemote().then(function () {
        loading = false;
        if (find.dlg.open) paintResults(find.results, find.input.value.trim());
      });
    });

    function paintAccount(btn, label) {
      var face = btn.querySelector('.nav-label');
      var chip = btn.querySelector('.nav-avatar');
      if (face) {
        face.textContent = label;
        if (chip) {
          var letter = String(label || '').replace(/[^A-Za-z0-9]/g, '').charAt(0);
          chip.textContent = (letter || 'S').toUpperCase();
        }
      } else btn.textContent = label;
      btn.setAttribute('aria-label', label === 'Sign In' ? 'Sign in' : label);
    }
    function paintOwner() {
      var on = isOwnerUser();
      var label = window.MONDO_MEMBER ? window.MONDO_MEMBER.buttonLabel() : (on ? 'Webmaster' : 'Sign In');
      paintAccount(ownerBtn, label);
      ownerBtn.classList.toggle('is-owner', on);
      ownerBtn.setAttribute('aria-pressed', window.MONDO_MEMBER && window.MONDO_MEMBER.isMember() ? 'true' : (on ? 'true' : 'false'));
    }
    document.addEventListener('mondo-owner', paintOwner);
    document.addEventListener('mondo-member', paintOwner);
    linkPrivacy();
    function attachChip() {
      if (!appsReady() || attachChip.done) return;
      attachChip.done = true;
      firebase.auth().onAuthStateChanged(paintOwner);
    }
    attachChip();
    document.addEventListener('DOMContentLoaded', function () {
      attachChip();
      setTimeout(attachChip, 0);
    });
    setTimeout(attachChip, 0);
    setTimeout(attachChip, 400);

    ownerBtn.addEventListener('click', function () {
      if (window.MONDO_MEMBER) return;
      setMenu(false);
      var pageBtn = document.getElementById('ownerBtn') || document.getElementById('owner');
      if (pageBtn) { pageBtn.click(); return; }
      if (!bootFirebase()) return;
      attachChip();
      var user = firebase.auth().currentUser;
      if (isOwnerUser()) {
        firebase.auth().signOut().catch(function () {});
        return;
      }
      if (!ownerDialog) ownerDialog = buildOwnerDialog();
      if (typeof ownerDialog.showModal === 'function' && !ownerDialog.open) ownerDialog.showModal();
    });

    armDialogs(document);
    var current = nav.querySelector('[aria-current="page"]');
    if (current && current.scrollIntoView) current.scrollIntoView({ inline: 'center', block: 'nearest' });

    document.addEventListener('visibilitychange', function () {
      document.documentElement.setAttribute('data-shell-paused', document.hidden ? '1' : '0');
      if (!document.hidden) document.documentElement.removeAttribute('data-shell-paused');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
