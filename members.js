/* Shared member accounts. Email/password on Firebase, guests stay anonymous. */
(function () {
  'use strict';
  var OWNER = 'cbrooks_911@yahoo.com';
  var HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
  var AVATARS = ['alien', 'cat', 'captain', 'chef', 'wizard', 'skater', 'smiley', 'flame'];
  var AVATAR_LABELS = { alien: 'Alien', cat: 'Cyber Cat', captain: 'Cruise Captain', chef: 'Chef', wizard: 'Wizard', skater: 'Skater', smiley: 'Smiley', flame: 'Flame' };
  var COLORS = { k: '#111111', g: '#39ff14', w: '#ffffff', y: '#ffe14a', b: '#2458a6', r: '#e10600', o: '#ff6600', p: '#7a00b4', s: '#c0c0c0', n: '#e8b48a', c: '#7fdfff' };
  var SPRITES = {
    alien: ['..gggg..', '.gwwwwg.', 'gkwkkwkg', 'gwwwwwwg', '.gwwwwg.', '..gggg..', '..g..g..', '.gg..gg.'],
    cat: ['oo....oo', 'ookkkkoo', '.okwwko.', '.okkkko.', '..knnk..', '..knnk..', '..oooo..', '..o..o..'],
    captain: ['bbbbbbbb', 'bwwwwwwb', 'bwkwwkwb', '.bnnnnb.', '..bnnb..', '..nnnn..', '..bbbb..', '..b..b..'],
    chef: ['wwwwwwww', '.wwwwww.', '..nnnn..', '.nnnnnn.', '.nknnkn.', '..nnnn..', '..wwww..', '..w..w..'],
    wizard: ['pppppppp', '.pppppp.', '..pkkp..', '.nnnnnn.', '.nknnkn.', '..nnnn..', '..pppp..', '..p..p..'],
    skater: ['rrrr....', 'rrrrrr..', '..nknn..', '.nnnnn..', '..nnnn..', '.bbbbb..', '..b..b..', '.oo..oo.'],
    smiley: ['..yyyy..', '.yyyyyy.', 'yykyykyy', 'yyyyyyyy', 'yykyykyy', '.ykkkky.', '..yyyy..', '........'],
    flame: ['...rr...', '..roor..', '.roooor.', 'rooyoorr', '.roooor.', '..roor..', '...yy...', '........']
  };
  var SYNC = [
    ['favs', 'mondosupreme.favs.v1', 20000],
    ['grocery', 'mondosupreme.grocery.v1', 40000],
    ['countdown', 'mondosupreme.cruise_countdown.v1', 4000],
    ['pet', 'mondosupreme.pet.v1', 80000],
    ['mmo', 'mondosupreme.mmo.v1', 80000],
    ['fps', 'mondosupreme.fps.v1', 40000],
    ['arcade', 'mondosupreme.arcade.v1', 40000],
    ['stocks', 'mondosupreme.stocks.v1', 20000],
    ['weather', 'mondosupreme.weather.v1', 4000],
    ['wordle', 'mondosupreme.wordle.v1', 20000],
    ['planner', 'mondosupreme.planner.v1', 40000],
    ['packing', 'mondosupreme.packing.v1', 20000]
  ];
  var user = null;
  var profile = null;
  var directory = {};
  var pushed = '';
  var listening = false;
  var authDialog = null;
  var profileDialog = null;
  var anonTimer = 0;
  var saving = false;

  function ownerEmail() {
    return String(window.MONDO_BOARD_OWNER || OWNER).toLowerCase();
  }
  function isOwnerUser(next) {
    return !!(next && next.email && String(next.email).toLowerCase() === ownerEmail());
  }
  function isMemberUser(next) {
    return !!(next && next.email);
  }
  function bootFirebase() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
    } catch (e) { return false; }
    return true;
  }
  function avatarSvg(id, size) {
    var rows = SPRITES[id] || SPRITES.smiley;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', String(size || 32));
    svg.setAttribute('height', String(size || 32));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('mava');
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var fill = COLORS[row.charAt(x)];
        if (!fill) continue;
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', '1');
        rect.setAttribute('height', '1');
        rect.setAttribute('fill', fill);
        svg.appendChild(rect);
      }
    });
    return svg;
  }
  function badgeText(uid) {
    var row = directory[uid];
    if (!row) return '';
    if (row.webmaster) return "[★ Webmaster ★]";
    if (row.member) return "[Member '98]";
    return '';
  }
  function buttonLabel() {
    if (isOwnerUser(user)) return '[👑 Webmaster: Cody]';
    if (isMemberUser(user)) return '[👤 ' + ((profile && profile.handle) || 'Member') + ']';
    return "[👤 Sign In / Join '98]";
  }
  function paintButtons() {
    var label = buttonLabel();
    ['shellOwner', 'ownerBtn', 'owner'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.textContent = label;
      btn.setAttribute('aria-pressed', isMemberUser(user) ? 'true' : 'false');
    });
  }
  function refreshMarks() {
    document.querySelectorAll('[data-member-uid]').forEach(function (node) {
      adorn(node, node.getAttribute('data-member-uid'));
    });
  }
  function announce() {
    paintButtons();
    applyNames();
    refreshMarks();
    document.dispatchEvent(new CustomEvent('mondo-member', {
      detail: { member: isMemberUser(user), owner: isOwnerUser(user), handle: profile && profile.handle || '' }
    }));
    document.dispatchEvent(new CustomEvent('mondo-owner', { detail: { on: isOwnerUser(user) } }));
  }
  function cleanHandle(value) {
    return HANDLE_RE.test(String(value || '').trim()) ? String(value).trim() : '';
  }
  function cleanStatus(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  }
  function shortName(handle, max) {
    var text = String(handle || '').replace(/_/g, '').replace(/[^A-Za-z0-9]/g, '');
    if (!/^[A-Za-z]/.test(text)) return '';
    return text.slice(0, max || 16);
  }
  function initials(handle) {
    var text = String(handle || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (text.slice(0, 3) || 'AAA');
  }
  function applyNames() {
    if (!isMemberUser(user) || !profile || !profile.handle) return;
    var handle = profile.handle;
    [
      ['name', handle],
      ['postName', handle],
      ['replyName', handle],
      ['postSeller', handle],
      ['gbName', handle],
      ['askName', handle]
    ].forEach(function (pair) { fill(pair[0], pair[1]); });
    fillDefault('ownerName', shortName(handle, 12) || 'You', ['', 'You']);
    fillDefault('pname', shortName(handle, 16), ['', 'Rookie']);
    fillDefault('heroName', shortName(handle, 16), ['']);
    fillDefault('initials', initials(handle), ['', 'AAA']);
    chipNear('name');
    chipNear('postName');
    chipNear('postSeller');
    chipNear('gbName');
    chipNear('askName');
    chipNear('pname');
    chipNear('heroName');
    chipNear('ownerName');
    try {
      if (!localStorage.getItem('mondosupreme.chat.name')) localStorage.setItem('mondosupreme.chat.name', handle);
    } catch (e) { /* private mode */ }
  }
  function fill(id, value) {
    var el = document.getElementById(id);
    if (!el || !value) return;
    var cur = el.value.trim();
    if (cur && el.dataset.memberFilled === '1' && cur !== el.dataset.memberValue) return;
    if (cur && el.dataset.memberFilled !== '1') return;
    if (cur === value) {
      el.dataset.memberFilled = '1';
      el.dataset.memberValue = value;
      return;
    }
    el.value = value;
    el.dataset.memberFilled = '1';
    el.dataset.memberValue = value;
  }
  function fillDefault(id, value, defaults) {
    var el = document.getElementById(id);
    if (!el || !value) return;
    if (defaults.indexOf(el.value.trim()) >= 0) {
      el.value = '';
      el.dataset.memberFilled = '1';
      el.dataset.memberValue = '';
    }
    fill(id, value);
  }
  function chipNear(id) {
    var el = document.getElementById(id);
    if (!el || !user) return;
    var host = el.parentNode;
    if (!host) return;
    var chip = null;
    for (var i = 0; i < host.children.length; i++) {
      if (host.children[i].classList && host.children[i].classList.contains('member-chip')) chip = host.children[i];
    }
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'member-chip';
      host.insertBefore(chip, el);
    }
    adorn(chip, user.uid);
  }
  function clearMarks(node) {
    Array.prototype.slice.call(node.children).forEach(function (kid) {
      if (kid.classList && (kid.classList.contains('mava') || kid.classList.contains('mbadge'))) kid.remove();
    });
  }
  function adorn(node, uid) {
    if (!node || !uid) return;
    node.setAttribute('data-member-uid', uid);
    clearMarks(node);
    var row = directory[uid];
    if (!row) return;
    node.insertBefore(avatarSvg(row.avatar, 20), node.firstChild);
    var text = badgeText(uid);
    if (!text) return;
    var badge = document.createElement('span');
    badge.className = 'mbadge' + (row.webmaster ? ' is-web' : '');
    badge.textContent = ' ' + text;
    node.appendChild(badge);
  }
  function readLocal(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function writeLocal(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
      return true;
    } catch (e) { return false; }
  }
  function syncSnapshot() {
    var bag = {};
    SYNC.forEach(function (row) { bag[row[0]] = readLocal(row[1]).slice(0, row[2]); });
    return JSON.stringify(bag);
  }
  async function pullSync(data) {
    var changed = false;
    SYNC.forEach(function (row) {
      var remote = data && typeof data[row[0]] === 'string' ? data[row[0]] : '';
      if (!remote || remote.length > row[2]) return;
      if (readLocal(row[1]) !== remote) {
        writeLocal(row[1], remote);
        changed = true;
      }
    });
    pushed = syncSnapshot();
    if (changed && !sessionStorage.getItem('mondo.member.reload')) {
      sessionStorage.setItem('mondo.member.reload', '1');
      location.reload();
    }
  }
  async function pushSync() {
    if (!isMemberUser(user) || !bootFirebase()) return;
    var snap = syncSnapshot();
    if (snap === pushed) return;
    var bag = JSON.parse(snap);
    var updates = {};
    SYNC.forEach(function (row) {
      if (bag[row[0]]) updates['users/' + user.uid + '/' + row[0]] = bag[row[0]];
    });
    updates['users/' + user.uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;
    try {
      await firebase.database().ref().update(updates);
      pushed = snap;
    } catch (e) { /* rules or offline; local copy remains */ }
  }
  function profilePayload(fields) {
    return {
      handle: fields.handle,
      avatar: AVATARS.indexOf(fields.avatar) >= 0 ? fields.avatar : 'smiley',
      status: cleanStatus(fields.status),
      member: true,
      webmaster: isOwnerUser(user),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
  }
  function waitSaving() {
    return new Promise(function (resolve) {
      (function poll() {
        if (!saving) resolve();
        else setTimeout(poll, 40);
      })();
    });
  }
  async function saveProfile(fields) {
    if (!bootFirebase()) throw new Error('offline');
    var current = firebase.auth().currentUser;
    if (!isMemberUser(current)) throw new Error('guest');
    user = current;
    saving = true;
    try {
      var payload = profilePayload(fields);
      profile = {
        handle: payload.handle,
        avatar: payload.avatar,
        status: payload.status,
        member: true,
        webmaster: !!payload.webmaster
      };
      directory[current.uid] = profile;
      announce();
      await firebase.database().ref('users/' + current.uid).update(payload);
    } finally {
      saving = false;
    }
  }
  function listenDirectory() {
    if (listening || !bootFirebase() || !firebase.auth().currentUser) return;
    listening = true;
    firebase.database().ref('users').on('value', function (snap) {
      directory = snap.val() || {};
      if (user && directory[user.uid]) profile = directory[user.uid];
      announce();
    }, function () { /* readable after rules are published */ });
  }
  async function loadOwn(next) {
    await waitSaving();
    if (!isMemberUser(next) || !user || user.uid !== next.uid) {
      profile = null;
      announce();
      return;
    }
    try {
      var snap = await firebase.database().ref('users/' + next.uid).once('value');
      await waitSaving();
      if (!user || user.uid !== next.uid) return;
      var data = snap.val();
      if (profile && profile.handle && (!data || !data.handle)) {
        announce();
        return;
      }
      if (!data || !data.handle) {
        var handle = isOwnerUser(next) ? 'Cody' : suggestHandle(next.email);
        await firebase.database().ref('users/' + next.uid).update(profilePayload({
          handle: handle,
          avatar: isOwnerUser(next) ? 'captain' : 'smiley',
          status: isOwnerUser(next) ? 'Webmaster online' : ''
        }));
        profile = { handle: handle, avatar: isOwnerUser(next) ? 'captain' : 'smiley', status: '', member: true, webmaster: isOwnerUser(next) };
      } else {
        profile = data;
        await pullSync(data);
      }
      directory[next.uid] = profile;
    } catch (e) {
      if (!profile || !profile.handle) {
        profile = { handle: isOwnerUser(next) ? 'Cody' : 'Member', avatar: 'smiley', member: true, webmaster: isOwnerUser(next) };
      }
    }
    announce();
    pushSync();
  }
  function suggestHandle(email) {
    var stem = String(email || '').split('@')[0].replace(/[^A-Za-z0-9_]/g, '');
    if (!/^[A-Za-z]/.test(stem)) stem = 'M' + stem;
    stem = stem.slice(0, 16) || 'Member';
    return HANDLE_RE.test(stem) ? stem : 'Member98';
  }
  function ensureGuest() {
    if (!bootFirebase()) return;
    clearTimeout(anonTimer);
    anonTimer = setTimeout(function () {
      if (firebase.auth().currentUser) return;
      firebase.auth().signInAnonymously().catch(function () {});
    }, 700);
  }
  function authError(err) {
    var code = String(err && err.code || '').toLowerCase();
    if (code.indexOf('email-already-in-use') >= 0) return 'That email already has an account. Use Sign In.';
    if (code.indexOf('weak-password') >= 0) return 'Use a password of at least 6 characters.';
    if (code.indexOf('invalid-email') >= 0) return 'That email does not look right.';
    if (code.indexOf('wrong-password') >= 0 || code.indexOf('invalid-credential') >= 0 || code.indexOf('user-not-found') >= 0) return 'That email or password is wrong.';
    if (code.indexOf('too-many-requests') >= 0) return 'Too many tries. Wait a minute and try again.';
    if (code.indexOf('permission-denied') >= 0 || code.indexOf('permission_denied') >= 0) return 'The account is in. Publish the latest database rules so the screen name can be saved.';
    return 'That did not work. Check the email and password and try again.';
  }
  function field(label, input) {
    var wrap = document.createElement('label');
    wrap.textContent = label;
    wrap.appendChild(input);
    return wrap;
  }
  function makeInput(type, autocomplete) {
    var input = document.createElement('input');
    input.type = type;
    input.autocomplete = autocomplete;
    input.required = type !== 'text' || autocomplete === 'nickname';
    return input;
  }
  function buildAuth() {
    var dlg = document.createElement('dialog');
    dlg.id = 'memberAuth';
    dlg.className = 'shell-find member-dialog';
    var title = document.createElement('h2');
    title.textContent = "Sign In / Join '98";
    var tabs = document.createElement('div');
    tabs.className = 'member-tabs';
    var signTab = document.createElement('button');
    signTab.type = 'button';
    signTab.textContent = 'Sign In';
    var joinTab = document.createElement('button');
    joinTab.type = 'button';
    joinTab.textContent = 'Create Account';
    tabs.append(signTab, joinTab);
    var signForm = document.createElement('form');
    var email = makeInput('email', 'username');
    var pass = makeInput('password', 'current-password');
    var signErr = document.createElement('p');
    signErr.className = 'member-err';
    signErr.hidden = true;
    var signRow = document.createElement('div');
    signRow.className = 'member-row';
    var signBtn = document.createElement('button');
    signBtn.type = 'submit';
    signBtn.className = 'shell-tool';
    signBtn.textContent = 'Sign In';
    var forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.className = 'shell-tool';
    forgot.textContent = 'Forgot password?';
    signRow.append(signBtn, forgot);
    signForm.append(field('Email', email), field('Password', pass), signErr, signRow);
    var joinForm = document.createElement('form');
    joinForm.hidden = true;
    var jEmail = makeInput('email', 'username');
    var jPass = makeInput('password', 'new-password');
    jPass.minLength = 6;
    var jHandle = makeInput('text', 'nickname');
    jHandle.maxLength = 20;
    jHandle.required = true;
    jHandle.placeholder = 'xX_CyberChef98_Xx';
    var jStatus = makeInput('text', 'off');
    jStatus.required = false;
    jStatus.maxLength = 80;
    jStatus.placeholder = 'Away surfing the MondoNet';
    var picker = document.createElement('div');
    picker.className = 'avatar-picker';
    var chosen = 'smiley';
    AVATARS.forEach(function (id) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-choice';
      btn.dataset.avatar = id;
      btn.setAttribute('aria-pressed', id === chosen ? 'true' : 'false');
      btn.setAttribute('aria-label', AVATAR_LABELS[id]);
      btn.appendChild(avatarSvg(id, 32));
      var cap = document.createElement('span');
      cap.textContent = AVATAR_LABELS[id];
      btn.appendChild(cap);
      btn.addEventListener('click', function () {
        chosen = id;
        picker.querySelectorAll('button').forEach(function (node) {
          node.setAttribute('aria-pressed', node.dataset.avatar === chosen ? 'true' : 'false');
        });
      });
      picker.appendChild(btn);
    });
    var joinErr = document.createElement('p');
    joinErr.className = 'member-err';
    joinErr.hidden = true;
    var joinBtn = document.createElement('button');
    joinBtn.type = 'submit';
    joinBtn.className = 'shell-tool';
    joinBtn.textContent = "Create Account";
    joinForm.append(
      field('Email', jEmail),
      field('Password', jPass),
      field('90s Screen Name / Handle', jHandle),
      field('Status / Away Message (optional)', jStatus)
    );
    var legend = document.createElement('p');
    legend.textContent = '90s Pixel Avatar';
    joinForm.append(legend, picker, joinErr, joinBtn);
    function show(which) {
      var signing = which === 'sign';
      signForm.hidden = !signing;
      joinForm.hidden = signing;
      signTab.setAttribute('aria-pressed', signing ? 'true' : 'false');
      joinTab.setAttribute('aria-pressed', signing ? 'false' : 'true');
    }
    signTab.addEventListener('click', function () { show('sign'); });
    joinTab.addEventListener('click', function () { show('join'); });
    show('sign');
    signForm.addEventListener('submit', function (event) {
      event.preventDefault();
      signErr.hidden = true;
      if (!bootFirebase()) { signErr.textContent = 'Sign-in is not available on this page.'; signErr.hidden = false; return; }
      firebase.auth().signInWithEmailAndPassword(email.value.trim(), pass.value).then(function () {
        pass.value = '';
        dlg.close();
      }).catch(function (err) {
        pass.value = '';
        signErr.textContent = authError(err);
        signErr.hidden = false;
      });
    });
    forgot.addEventListener('click', function () {
      signErr.hidden = true;
      var to = email.value.trim();
      if (!to) { signErr.textContent = 'Type the email first, then ask for the reset note.'; signErr.hidden = false; return; }
      if (!bootFirebase()) return;
      firebase.auth().sendPasswordResetEmail(to).then(function () {
        signErr.textContent = 'Check that inbox for a password reset note.';
        signErr.hidden = false;
      }).catch(function (err) {
        signErr.textContent = authError(err);
        signErr.hidden = false;
      });
    });
    joinForm.addEventListener('submit', function (event) {
      event.preventDefault();
      joinErr.hidden = true;
      var handle = cleanHandle(jHandle.value);
      if (!handle) { joinErr.textContent = 'Use a handle of 2 to 20 letters, numbers, and underscores. Start with a letter.'; joinErr.hidden = false; return; }
      if (!bootFirebase()) { joinErr.textContent = 'Accounts are not available on this page.'; joinErr.hidden = false; return; }
      saving = true;
      firebase.auth().createUserWithEmailAndPassword(jEmail.value.trim(), jPass.value).then(function () {
        jPass.value = '';
        return saveProfile({ handle: handle, avatar: chosen, status: jStatus.value });
      }).then(function () {
        dlg.close();
      }).catch(function (err) {
        saving = false;
        jPass.value = '';
        joinErr.textContent = authError(err);
        joinErr.hidden = false;
      });
    });
    dlg.append(title, tabs, signForm, joinForm);
    document.body.appendChild(dlg);
    armClose(dlg);
    return dlg;
  }
  function armClose(dlg) {
    if (dlg.querySelector('.shell-x')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shell-x';
    btn.textContent = 'X Close';
    btn.setAttribute('aria-label', 'Close');
    btn.addEventListener('click', function () { if (typeof dlg.close === 'function') dlg.close(); });
    dlg.insertBefore(btn, dlg.firstChild);
  }
  function buildProfile() {
    var dlg = document.createElement('dialog');
    dlg.id = 'memberProfile';
    dlg.className = 'shell-find member-dialog';
    var title = document.createElement('h2');
    title.id = 'memberProfileTitle';
    var form = document.createElement('form');
    var handle = makeInput('text', 'nickname');
    handle.maxLength = 20;
    handle.required = true;
    var status = makeInput('text', 'off');
    status.required = false;
    status.maxLength = 80;
    var picker = document.createElement('div');
    picker.className = 'avatar-picker';
    var chosen = 'smiley';
    AVATARS.forEach(function (id) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-choice';
      btn.dataset.avatar = id;
      btn.setAttribute('aria-label', AVATAR_LABELS[id]);
      btn.appendChild(avatarSvg(id, 32));
      var cap = document.createElement('span');
      cap.textContent = AVATAR_LABELS[id];
      btn.appendChild(cap);
      btn.addEventListener('click', function () {
        chosen = id;
        picker.querySelectorAll('button').forEach(function (node) {
          node.setAttribute('aria-pressed', node.dataset.avatar === chosen ? 'true' : 'false');
        });
      });
      picker.appendChild(btn);
    });
    var err = document.createElement('p');
    err.className = 'member-err';
    err.hidden = true;
    var row = document.createElement('div');
    row.className = 'member-row';
    var save = document.createElement('button');
    save.type = 'submit';
    save.className = 'shell-tool';
    save.textContent = 'Save profile';
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'shell-tool';
    out.textContent = 'Sign Out';
    row.append(save, out);
    form.append(field('90s Screen Name / Handle', handle), field('Status / Away Message', status), picker, err, row);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      err.hidden = true;
      var next = cleanHandle(handle.value);
      if (!next) { err.textContent = 'Use 2 to 20 letters, numbers, and underscores.'; err.hidden = false; return; }
      saveProfile({ handle: next, avatar: chosen, status: status.value }).then(function () {
        dlg.close();
      }).catch(function () {
        err.textContent = 'The profile stayed on this device. Publish the latest database rules, then save again.';
        err.hidden = false;
      });
    });
    out.addEventListener('click', function () {
      dlg.close();
      signOut();
    });
    dlg.append(title, form);
    dlg.addEventListener('close', function () {});
    dlg.showProfile = function () {
      title.textContent = isOwnerUser(user) ? 'Webmaster: Cody' : ((profile && profile.handle) || 'Member');
      handle.value = (profile && profile.handle) || '';
      status.value = (profile && profile.status) || '';
      chosen = profile && AVATARS.indexOf(profile.avatar) >= 0 ? profile.avatar : 'smiley';
      picker.querySelectorAll('button').forEach(function (node) {
        node.setAttribute('aria-pressed', node.dataset.avatar === chosen ? 'true' : 'false');
      });
      err.hidden = true;
    };
    document.body.appendChild(dlg);
    armClose(dlg);
    return dlg;
  }
  function openAuth() {
    if (!authDialog) authDialog = buildAuth();
    if (typeof authDialog.showModal === 'function' && !authDialog.open) authDialog.showModal();
  }
  function openProfile() {
    if (!profileDialog) profileDialog = buildProfile();
    profileDialog.showProfile();
    if (typeof profileDialog.showModal === 'function' && !profileDialog.open) profileDialog.showModal();
  }
  function onButton() {
    if (!bootFirebase()) return;
    if (isMemberUser(firebase.auth().currentUser)) openProfile();
    else openAuth();
  }
  function signOut() {
    if (!bootFirebase()) return;
    firebase.auth().signOut().then(function () {
      profile = null;
      user = null;
      announce();
      return firebase.auth().signInAnonymously();
    }).catch(function () {});
  }
  function connect() {
    if (!bootFirebase()) return;
    firebase.auth().onAuthStateChanged(function (next) {
      clearTimeout(anonTimer);
      user = next;
      if (!next) {
        profile = null;
        announce();
        ensureGuest();
        return;
      }
      if (!isMemberUser(next)) {
        profile = null;
        listenDirectory();
        announce();
        return;
      }
      listenDirectory();
      loadOwn(next);
    });
    ensureGuest();
  }
  document.addEventListener('click', function (event) {
    var btn = event.target && event.target.closest && event.target.closest('#ownerBtn, #owner, #shellOwner');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onButton();
  }, true);
  window.MONDO_MEMBER = {
    buttonLabel: buttonLabel,
    badgeText: badgeText,
    adorn: adorn,
    avatarSvg: avatarSvg,
    isMember: function () { return isMemberUser(user); },
    isOwner: function () { return isOwnerUser(user); },
    handle: function () { return profile && profile.handle || ''; },
    avatar: function () { return profile && profile.avatar || ''; },
    uid: function () { return user && user.uid || ''; },
    open: onButton,
    signOut: signOut
  };
  function boot() {
    paintButtons();
    connect();
    setInterval(paintButtons, 400);
    setInterval(applyNames, 1000);
    setInterval(function () { if (isMemberUser(user)) pushSync(); }, 4000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pushSync();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
