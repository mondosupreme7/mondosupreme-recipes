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
            db.ref('forum/replies').once('value').catch(function () { return null; })
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
    label.textContent = 'Search recipes, ships, notes, posts, and games';
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

  function boot() {
    var nav = document.querySelector('.site-header .site-nav');
    if (!nav || document.querySelector('.shell-bar')) return;
    window.__mondoPageAuth = appsReady();
    loadRemoteCache();

    var bar = document.createElement('div');
    bar.className = 'shell-bar';
    var pop = document.createElement('div');
    pop.className = 'shell-pop';
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'shell-tool';
    start.id = 'shellStart';
    start.textContent = '⊞ Start 98';
    start.setAttribute('aria-haspopup', 'true');
    start.setAttribute('aria-expanded', 'false');
    var menu = document.createElement('div');
    menu.className = 'shell-menu';
    menu.id = 'shellMenu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    var closeMenu = document.createElement('button');
    closeMenu.type = 'button';
    closeMenu.className = 'shell-x';
    closeMenu.textContent = 'X Close';
    menu.appendChild(closeMenu);
    var lastGroup = '';
    sections.forEach(function (item) {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        var label = document.createElement('div');
        label.className = 'shell-label';
        label.textContent = item.group;
        menu.appendChild(label);
      }
      var link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.title;
      link.setAttribute('role', 'menuitem');
      if (nav.querySelector('a[aria-current="page"]') && nav.querySelector('a[href="' + item.href + '"][aria-current="page"]')) {
        link.setAttribute('aria-current', 'page');
      }
      menu.appendChild(link);
    });
    pop.appendChild(start);
    pop.appendChild(menu);

    var findBtn = document.createElement('button');
    findBtn.type = 'button';
    findBtn.className = 'shell-tool';
    findBtn.id = 'shellFindBtn';
    findBtn.textContent = '🔍 Find';

    var ownerBtn = document.createElement('button');
    ownerBtn.type = 'button';
    ownerBtn.className = 'shell-tool';
    ownerBtn.id = 'shellOwner';
    ownerBtn.textContent = 'Sign in';

    bar.appendChild(pop);
    bar.appendChild(findBtn);
    bar.appendChild(ownerBtn);
    nav.parentNode.insertBefore(bar, nav);

    function setMenu(open) {
      menu.hidden = !open;
      start.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    start.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(menu.hidden);
    });
    closeMenu.addEventListener('click', function () { setMenu(false); });
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
