/* Shared Start menu, Find, and owner chip. One cached file for every section. */
(function () {
  'use strict';
  var OWNER = 'cbrooks_911@yahoo.com';
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
  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }
  function isOwnerUser(user) {
    return !!(user && user.email && String(user.email).toLowerCase() === ownerEmail());
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
    { group: 'Kitchen', title: 'Recipes', href: '/recipes/', text: 'kitchen cookbook food' },
    { group: 'Harbor', title: 'Cruises', href: '/cruises/', text: 'ships harbor royal caribbean' },
    { group: 'Notes', title: 'Wiki', href: '/wiki/', text: 'notes wiki' },
    { group: 'Notes', title: 'Forum', href: '/forum/', text: 'bulletin posts forum' },
    { group: 'Shop', title: 'Market', href: '/market/', text: 'ebay classifieds market mondobay for sale' },
    { group: 'Play', title: 'Board', href: '/board/', text: 'drawing whiteboard' },
    { group: 'Play', title: 'Chat', href: '/chat/', text: 'chat room talk' },
    { group: 'Play', title: 'Arcade', href: '/arcade/', text: 'games arcade' },
    { group: 'Play', title: 'Pet', href: '/pet/', text: 'virtual pet egg' },
    { group: 'Play', title: 'MMO', href: '/mmo/', text: 'world of mondocraft' },
    { group: 'Play', title: 'FPS', href: '/fps/', text: 'half-strike fortress' },
    { group: 'Play', title: 'Locked Room', href: '/escape/', text: 'escape door ???' }
  ];
  var games = [
    { kind: 'Game', title: 'High Seas Cruiser', href: '/arcade/', text: 'arcade seas cruise cart' },
    { kind: 'Game', title: 'Supreme Kitchen Rush', href: '/arcade/', text: 'arcade kitchen cart' },
    { kind: 'Game', title: 'Cyber Brick Breaker 1999', href: '/arcade/', text: 'arcade breaker cart' },
    { kind: 'Game', title: 'Virtual Pet', href: '/pet/', text: 'pet egg tamagotchi' },
    { kind: 'Game', title: 'World of MondoCraft', href: '/mmo/', text: 'mmo mondocraft goldhaven' },
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
      root.appendChild(link);
    });
  }

  function armDialogs(scope) {
    (scope || document).querySelectorAll('dialog').forEach(function (dlg) {
      if (dlg.querySelector('.shell-x')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shell-x';
      btn.textContent = 'X Close';
      btn.setAttribute('aria-label', 'Close');
      btn.addEventListener('click', function () {
        if (typeof dlg.close === 'function') dlg.close();
      });
      dlg.insertBefore(btn, dlg.firstChild);
    });
  }

  function buildFind() {
    var dlg = document.createElement('dialog');
    dlg.id = 'shellFind';
    dlg.className = 'shell-find';
    var title = document.createElement('h2');
    title.id = 'shellFindTitle';
    title.textContent = 'Find';
    var label = document.createElement('label');
    label.textContent = 'Search recipes, ships, notes, posts, listings, and games';
    var input = document.createElement('input');
    input.id = 'shellFindInput';
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = 'Try pasta, Oasis, or fortress';
    input.setAttribute('aria-label', 'Search the site');
    label.appendChild(input);
    var results = document.createElement('div');
    results.id = 'shellFindResults';
    results.className = 'shell-results';
    results.setAttribute('role', 'listbox');
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
    copy.textContent = 'Sign in once with the owner email. Owner Mode stays on across the site. The password is checked by Firebase and is not stored here.';
    var form = document.createElement('form');
    var emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email';
    var email = document.createElement('input');
    email.type = 'email';
    email.autocomplete = 'username';
    email.required = true;
    email.value = ownerEmail();
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
    { title: 'Recipes', href: '/recipes/', icon: 'pot' },
    { title: 'Cruises', href: '/cruises/', icon: 'ship' },
    { title: 'Encarta Wiki', href: '/wiki/', icon: 'book' },
    { title: 'MS Paint Board', href: '/board/', icon: 'paint' },
    { title: 'AIM Chat', href: '/chat/', icon: 'aim' },
    { title: '90s Arcade', href: '/arcade/', icon: 'joy' },
    { title: 'MondoGotchi Pet', href: '/pet/', icon: 'egg' },
    { title: 'Bulletin Forum', href: '/forum/', icon: 'note' },
    { title: "MondoBay '98", href: '/market/', icon: 'gavel' },
    { title: 'World of MondoCraft', href: '/mmo/', icon: 'sword' },
    { title: "Half-Strike '99", href: '/fps/', icon: 'gun' },
    { title: 'ASH_HOUSE.EXE', href: '/escape/', icon: 'door' }
  ];
  var toyLinks = [
    { title: '56k Dial-Up', href: '/#dialup', icon: 'modem' },
    { title: 'Magic 8-Ball', href: '/#eight', icon: 'ball' },
    { title: 'Lava Lamp', href: '/#lava', icon: 'lava' },
    { title: 'Pog Collection', href: '/#pogs', icon: 'pog' },
    { title: 'Windows 98 BSOD', href: '/#bsod', icon: 'bsod' }
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
    bsod: [[2,2,12,12,'#0000aa'],[4,5,8,1,'#fff'],[4,7,8,1,'#fff'],[4,9,6,1,'#fff']]
  };
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
    link.className = 'win98-item';
    link.href = item.href;
    link.setAttribute('role', 'menuitem');
    link.appendChild(pixelIcon(item.icon));
    var label = document.createElement('span');
    label.textContent = item.title;
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

  function boot() {
    applyFx(readFx());
    document.documentElement.setAttribute('data-muted', audioMuted() ? '1' : '0');
    armStars();
    var nav = document.querySelector('.site-header .site-nav');
    if (!nav || document.querySelector('.shell-bar')) return;
    window.__mondoPageAuth = appsReady();
    loadRemoteCache();

    var taskbar = document.createElement('div');
    taskbar.className = 'win98-taskbar';
    taskbar.id = 'win98Taskbar';
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'win98-start';
    start.id = 'shellStart';
    start.textContent = '⊞ Start';
    start.setAttribute('aria-haspopup', 'true');
    start.setAttribute('aria-expanded', 'false');
    var menu = document.createElement('div');
    menu.className = 'shell-menu win98-menu';
    menu.id = 'shellMenu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    var side = document.createElement('div');
    side.className = 'win98-side';
    side.textContent = 'Mondosupreme 98';
    var cols = document.createElement('div');
    cols.className = 'win98-cols';
    var left = document.createElement('div');
    left.className = 'win98-col';
    var right = document.createElement('div');
    right.className = 'win98-col';
    var leftLabel = document.createElement('div');
    leftLabel.className = 'shell-label';
    leftLabel.textContent = 'Programs';
    var rightLabel = document.createElement('div');
    rightLabel.className = 'shell-label';
    rightLabel.textContent = '90s Toys';
    left.appendChild(leftLabel);
    programs.forEach(function (item) { left.appendChild(menuLink(item)); });
    var home = menuLink({ title: 'Home', href: '/', icon: 'note' });
    left.appendChild(home);
    right.appendChild(rightLabel);
    toyLinks.forEach(function (item) { right.appendChild(menuLink(item)); });
    var scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'win98-item';
    scanBtn.id = 'fxScan';
    scanBtn.appendChild(pixelIcon('bsod'));
    var scanText = document.createElement('span');
    scanBtn.appendChild(scanText);
    var starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'win98-item';
    starBtn.id = 'fxStars';
    starBtn.appendChild(pixelIcon('pog'));
    var starText = document.createElement('span');
    starBtn.appendChild(starText);
    function paintFxButtons() {
      var fx = readFx();
      scanText.textContent = fx.scan ? 'CRT Scanlines: On' : 'CRT Scanlines: Off';
      starText.textContent = fx.stars ? 'Star Trail: On' : 'Star Trail: Off';
      scanBtn.setAttribute('aria-pressed', fx.scan ? 'true' : 'false');
      starBtn.setAttribute('aria-pressed', fx.stars ? 'true' : 'false');
    }
    paintFxButtons();
    scanBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var fx = readFx();
      writeFx({ scan: fx.scan ? 0 : 1, stars: fx.stars });
      paintFxButtons();
    });
    starBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var fx = readFx();
      writeFx({ scan: fx.scan, stars: fx.stars ? 0 : 1 });
      paintFxButtons();
    });
    document.addEventListener('mondo-fx', paintFxButtons);
    right.appendChild(scanBtn);
    right.appendChild(starBtn);
    var closeMenu = document.createElement('button');
    closeMenu.type = 'button';
    closeMenu.className = 'shell-x';
    closeMenu.textContent = 'X Close';
    cols.appendChild(left);
    cols.appendChild(right);
    menu.appendChild(side);
    menu.appendChild(cols);
    menu.appendChild(closeMenu);

    var bar = document.createElement('div');
    bar.className = 'shell-bar';
    var findBtn = document.createElement('button');
    findBtn.type = 'button';
    findBtn.className = 'shell-tool';
    findBtn.id = 'shellFindBtn';
    findBtn.textContent = 'Find';
    var ownerBtn = document.createElement('button');
    ownerBtn.type = 'button';
    ownerBtn.className = 'shell-tool';
    ownerBtn.id = 'shellOwner';
    ownerBtn.textContent = 'Sign in';
    bar.appendChild(findBtn);
    bar.appendChild(ownerBtn);

    var tray = document.createElement('div');
    tray.className = 'win98-tray';
    var muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'win98-mute';
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
    clock.className = 'win98-clock';
    clock.id = 'shellClock';
    paintClock(clock);
    tray.appendChild(muteBtn);
    tray.appendChild(clock);
    taskbar.appendChild(start);
    taskbar.appendChild(bar);
    taskbar.appendChild(tray);
    document.body.appendChild(taskbar);
    document.body.appendChild(menu);
    function parkTheme() {
      var theme = document.querySelector('.theme-switch');
      if (theme && theme.parentNode !== tray) tray.insertBefore(theme, muteBtn);
    }
    parkTheme();
    setTimeout(parkTheme, 0);
    setInterval(function () { paintClock(clock); }, 1000);

    function setMenu(open) {
      menu.hidden = !open;
      start.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    start.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(menu.hidden);
    });
    closeMenu.addEventListener('click', function () { setMenu(false); });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('click', function (event) {
      if (!menu.hidden && !menu.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
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

    function paintOwner(user) {
      var on = isOwnerUser(user);
      ownerBtn.textContent = on ? 'Owner Mode: ON' : 'Sign in';
      ownerBtn.classList.toggle('is-owner', on);
      ownerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      document.dispatchEvent(new CustomEvent('mondo-owner', {detail: {on: on}}));
    }
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
      setMenu(false);
      var pageBtn = document.getElementById('ownerBtn') || document.getElementById('owner');
      if (pageBtn) { pageBtn.click(); return; }
      if (!bootFirebase()) return;
      attachChip();
      var user = firebase.auth().currentUser;
      if (isOwnerUser(user)) {
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
