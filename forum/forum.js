(function (root) {
  const KEY = 'mondosupreme.forum.v1';
  const SEEN = 'mondosupreme.forum.seen';
  const CATS = {
    general: 'General',
    recipes: 'Recipes & Food',
    cruises: 'Cruises & Travel',
    news: 'Site News / Blog',
    gaming: 'Gaming'
  };
  const MOODS = { smile: ':)', cool: 'B)', chef: 'chef', ship: 'ship', game: 'game', heart: '<3' };
  const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,23}$/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeHttps(raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return '';
    let url;
    try { url = new URL(raw); } catch (e) { return ''; }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return '';
    return url.href;
  }
  function inline(text) {
    let html = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '`') {
        const end = text.indexOf('`', i + 1);
        if (end > i && text.slice(i, end).indexOf('\n') < 0) {
          html += '<code>' + esc(text.slice(i + 1, end)) + '</code>';
          i = end + 1;
          continue;
        }
      }
      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2);
        if (end > i + 2) {
          html += '<strong>' + inline(text.slice(i + 2, end)) + '</strong>';
          i = end + 2;
          continue;
        }
      }
      if (text[i] === '*' && text[i + 1] !== '*') {
        const end = text.indexOf('*', i + 1);
        if (end > i + 1 && text.slice(i, end).indexOf('\n') < 0) {
          html += '<em>' + inline(text.slice(i + 1, end)) + '</em>';
          i = end + 1;
          continue;
        }
      }
      if (text[i] === '[') {
        const m = text.slice(i).match(/^\[([^\]\n]{1,80})\]\((https:\/\/[^)\s]{1,500})\)/);
        if (m) {
          const href = safeHttps(m[2]);
          html += href
            ? '<a href="' + esc(href) + '" rel="noopener nofollow ugc">' + esc(m[1]) + '</a>'
            : esc(m[0]);
          i += m[0].length;
          continue;
        }
      }
      const um = text.slice(i).match(/^https:\/\/[^\s<>"']+/);
      if (um && (i === 0 || /\s/.test(text[i - 1]))) {
        const raw = um[0].replace(/[.,);]+$/, '');
        const href = safeHttps(raw);
        html += href
          ? '<a href="' + esc(href) + '" rel="noopener nofollow ugc">' + esc(raw) + '</a>'
          : esc(raw);
        i += raw.length;
        continue;
      }
      html += esc(text[i]);
      i++;
    }
    return html;
  }
  function renderBody(src) {
    const text = String(src || '').replace(/\r\n/g, '\n').slice(0, 5000);
    return text.split(/\n{2,}/).map(p => '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>').join('');
  }
  function cleanName(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return NAME_RE.test(t) ? t : '';
  }
  function cleanTitle(s) {
    return String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  }
  function cleanBody(s, max) {
    const t = String(s || '').replace(/\r\n/g, '\n').trim();
    return t.slice(0, max);
  }
  function cleanCat(s) { return Object.prototype.hasOwnProperty.call(CATS, s) ? s : ''; }
  function cleanMood(s) { return Object.prototype.hasOwnProperty.call(MOODS, s) ? s : 'smile'; }
  function denied(err) {
    return /PERMISSION_DENIED|permission[-_ ]denied/i.test(String(err && (err.code || err.message) || ''));
  }
  function ownerEmail() {
    return String((typeof window !== 'undefined' && window.MONDO_BOARD_OWNER) || 'cbrooks_911@yahoo.com').toLowerCase();
  }

  const api = { renderBody, safeHttps, cleanName, cleanTitle, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cache = load();
  let serverThreads = null;
  let serverReplies = null;
  let serverViews = null;
  let gotThreads = false;
  let gotReplies = false;
  let gotViews = false;
  let readsOk = false;
  let rulesBlocked = false;
  let user = null;
  let isOwner = false;
  let banned = false;
  let banMap = {};
  let listening = false;
  let posting = false;
  let flushing = false;
  let painted = '';
  let query = '';
  let cat = 'all';
  let toastTimer = 0;

  function load() {
    const blank = { name: '', mood: 'smile', threads: {}, replies: {}, views: {}, lastPost: 0, quota: { n: 0, day: 0 } };
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '');
      if (!v || typeof v !== 'object') return blank;
      v.threads = v.threads && typeof v.threads === 'object' ? v.threads : {};
      v.replies = v.replies && typeof v.replies === 'object' ? v.replies : {};
      v.views = v.views && typeof v.views === 'object' ? v.views : {};
      v.quota = v.quota && typeof v.quota === 'object' ? v.quota : { n: 0, day: 0 };
      return Object.assign(blank, v);
    } catch (e) { return blank; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* private mode */ }
  }
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function showBanner() {
    rulesBlocked = true;
    const el = $('#syncBanner');
    if (el) el.hidden = false;
  }
  function hideBanner() {
    rulesBlocked = false;
    const el = $('#syncBanner');
    if (el) el.hidden = true;
  }
  function updateBanners() {
    if (rulesBlocked) showBanner(); else hideBanner();
    const ban = $('#banBanner');
    if (ban) ban.hidden = !(banned && !isOwner);
    const btn = $('#newBtn');
    if (btn) btn.disabled = banned && !isOwner;
    document.documentElement.dataset.forumSync = rulesBlocked ? 'local' : (readsOk ? 'live' : 'pending');
  }
  function seenSet() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || '[]')); } catch (e) { return new Set(); }
  }
  function markSeen(id) {
    const s = seenSet();
    s.add(id);
    sessionStorage.setItem(SEEN, JSON.stringify([...s].slice(-300)));
  }
  function makeId() {
    const prefix = user && user.uid ? user.uid : 'local';
    return (prefix + '_' + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  }
  function replyMap(tid) {
    const bag = cache.replies[tid];
    return bag && typeof bag === 'object' ? bag : {};
  }
  function activity(t) {
    let m = Number(t.updatedAt || t.createdAt || 0);
    Object.keys(replyMap(t.id)).forEach(id => {
      const c = Number(replyMap(t.id)[id].createdAt || 0);
      if (c > m) m = c;
    });
    return m;
  }
  function when(ms) {
    const t = Number(ms);
    if (!t) return '';
    try { return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return new Date(t).toLocaleString(); }
  }
  function moodEl(mood) {
    const s = document.createElement('span');
    s.className = 'mood ' + cleanMood(mood);
    s.textContent = MOODS[cleanMood(mood)];
    s.title = cleanMood(mood);
    return s;
  }
  function pills(t) {
    const wrap = document.createElement('span');
    wrap.className = 'pills';
    const bits = [];
    if (t.pinned) bits.push(['Sticky', '']);
    if (t.official) bits.push(['Official', 'official']);
    if (t.locked) bits.push(['Locked', 'lock']);
    bits.push([CATS[t.category] || 'General', 'cat']);
    bits.forEach(pair => {
      const n = document.createElement('span');
      n.className = 'pill ' + pair[1];
      n.textContent = pair[0];
      wrap.appendChild(n);
    });
    return wrap;
  }
  function passes(t) {
    if (cat !== 'all' && t.category !== cat) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    let blob = [t.title, t.body, t.name, CATS[t.category] || ''].join('\n');
    Object.keys(replyMap(t.id)).forEach(id => {
      const r = replyMap(t.id)[id];
      blob += '\n' + (r.body || '') + ' ' + (r.name || '');
    });
    return blob.toLowerCase().indexOf(q) >= 0;
  }
  function sorted() {
    return Object.keys(cache.threads).map(id => cache.threads[id]).filter(t => t && t.title && passes(t)).sort((a, b) => {
      const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pin) return pin;
      return activity(b) - activity(a);
    });
  }
  function paintRows() {
    const rows = $('#rows');
    const empty = $('#empty');
    if (!rows) return;
    rows.textContent = '';
    const list = sorted();
    const all = Object.keys(cache.threads).filter(id => cache.threads[id] && cache.threads[id].title);
    if (!list.length) {
      empty.hidden = false;
      empty.textContent = all.length ? 'No topics match.' : 'No threads yet. Start one.';
      return;
    }
    empty.hidden = true;
    list.forEach(t => {
      const tr = document.createElement('tr');
      if (t.pinned) tr.className = 'sticky';
      tr.setAttribute('data-thread', t.id);
      const topic = document.createElement('td');
      topic.setAttribute('data-label', 'Topic');
      const a = document.createElement('a');
      a.className = 'topic';
      a.href = '#/t/' + t.id;
      a.textContent = t.title;
      topic.appendChild(a);
      topic.appendChild(pills(t));
      const author = document.createElement('td');
      author.setAttribute('data-label', 'Author');
      author.className = 'author';
      author.appendChild(moodEl(t.mood));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.name || 'Guest';
      author.appendChild(name);
      const replies = document.createElement('td');
      replies.setAttribute('data-label', 'Replies');
      replies.className = 'counts';
      replies.textContent = String(Object.keys(replyMap(t.id)).length);
      const views = document.createElement('td');
      views.setAttribute('data-label', 'Views');
      views.className = 'counts';
      views.textContent = String(cache.views[t.id] || 0);
      const last = document.createElement('td');
      last.setAttribute('data-label', 'Last post');
      last.textContent = when(activity(t));
      tr.append(topic, author, replies, views, last);
      rows.appendChild(tr);
    });
    paintBans();
  }
  function paintBans() {
    const box = $('#ownerBans');
    const list = $('#banList');
    if (!box || !list) return;
    const ids = isOwner ? Object.keys(banMap).filter(id => banMap[id] === true && /^[A-Za-z0-9]{1,128}$/.test(id)) : [];
    box.hidden = !ids.length;
    list.textContent = '';
    ids.forEach(uid => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = uid;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ghost';
      btn.textContent = 'Unban';
      btn.setAttribute('data-act', 'unban');
      btn.setAttribute('data-uid', uid);
      li.append(span, btn);
      list.appendChild(li);
    });
  }
  function toolButton(act, id, label, extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost';
    b.textContent = label;
    b.setAttribute('data-act', act);
    b.setAttribute('data-id', id);
    if (extra) b.setAttribute('data-extra', extra);
    return b;
  }
  function postArticle(item, op, tid) {
    const art = document.createElement('article');
    art.className = 'post' + (op ? ' op' : '');
    art.setAttribute('data-post', item.id);
    const head = document.createElement('div');
    head.className = 'post-head';
    head.appendChild(moodEl(item.mood));
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = item.name || 'Guest';
    head.appendChild(who);
    if (op && item.official) {
      const badge = document.createElement('span');
      badge.className = 'pill official';
      badge.textContent = 'Official';
      head.appendChild(badge);
    }
    const time = document.createElement('time');
    time.dateTime = new Date(Number(item.createdAt) || Date.now()).toISOString();
    time.textContent = when(item.createdAt);
    head.appendChild(time);
    const body = document.createElement('div');
    body.className = 'post-body';
    body.innerHTML = renderBody(op ? item.body : String(item.body || '').slice(0, 2000));
    art.append(head, body);
    if (isOwner) {
      const tools = document.createElement('div');
      tools.className = 'owner-tools';
      if (op) {
        tools.append(
          toolButton('edit', item.id, 'Edit'),
          toolButton('delete', item.id, 'Delete'),
          toolButton('pin', item.id, item.pinned ? 'Unstick' : 'Sticky'),
          toolButton('lock', item.id, item.locked ? 'Unlock' : 'Lock'),
          toolButton('official', item.id, item.official ? 'Clear official' : 'Official')
        );
      } else {
        tools.append(
          toolButton('edit-reply', item.id, 'Edit', tid),
          toolButton('delete-reply', item.id, 'Delete', tid)
        );
      }
      if (item.author && item.author !== 'local' && /^[A-Za-z0-9]{1,128}$/.test(item.author)) {
        tools.appendChild(toolButton(op ? 'ban' : 'ban', item.author, 'Ban writer'));
      }
      art.appendChild(tools);
    }
    return art;
  }
  function showThread(id, keepDraft) {
    const t = cache.threads[id];
    const view = $('#threadView');
    $('#listView').hidden = true;
    $('#composeView').hidden = true;
    view.hidden = false;
    if (!t) {
      view.innerHTML = '<p class="empty-board">That topic is gone. <a href="#/">Back to the board</a></p>';
      return;
    }
    const draft = keepDraft && $('#replyBody') ? $('#replyBody').value : '';
    const draftName = keepDraft && $('#replyName') ? $('#replyName').value : '';
    view.textContent = '';
    const top = document.createElement('div');
    top.className = 'thread-top';
    const back = document.createElement('a');
    back.className = 'btn ghost';
    back.href = '#/';
    back.textContent = 'Board';
    const h = document.createElement('h2');
    h.textContent = t.title;
    top.append(back, h);
    view.appendChild(top);
    const meta = document.createElement('div');
    meta.className = 'pills';
    meta.appendChild(pills(t));
    const stats = document.createElement('span');
    stats.className = 'pill';
    const rc = Object.keys(replyMap(id)).length;
    stats.textContent = rc + ' replies · ' + (cache.views[id] || 0) + ' views';
    stats.setAttribute('data-views', String(cache.views[id] || 0));
    meta.appendChild(stats);
    view.appendChild(meta);
    view.appendChild(postArticle(t, true, id));
    const reps = Object.keys(replyMap(id)).map(rid => replyMap(id)[rid]).filter(r => r && r.body).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    reps.forEach(r => view.appendChild(postArticle(r, false, id)));
    if (t.locked && !isOwner) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'This topic is locked.';
      view.appendChild(p);
    } else if (banned && !isOwner) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'This browser is banned from posting.';
      view.appendChild(p);
    } else {
      const form = document.createElement('form');
      form.id = 'replyForm';
      form.innerHTML = '<h3>Reply</h3><div class="form-grid"><label>Display name<input id="replyName" maxlength="24" autocomplete="nickname"></label><label>Mood<select id="replyMood"><option value="smile">:) smile</option><option value="cool">B) cool</option><option value="chef">chef</option><option value="ship">ship</option><option value="game">game</option><option value="heart">&lt;3 heart</option></select></label></div><label>Comment<textarea id="replyBody" maxlength="2000" rows="5" required></textarea></label><p id="replyError" class="owner-error" hidden></p><button class="btn primary" type="submit">Post reply</button>';
      view.appendChild(form);
      $('#replyName').value = draftName || cache.name || '';
      $('#replyMood').value = cache.mood || 'smile';
      if (draft) $('#replyBody').value = draft;
      form.addEventListener('submit', e => { e.preventDefault(); submitReply(id); });
    }
    bumpView(t);
  }
  function showCompose(thread) {
    $('#listView').hidden = true;
    $('#threadView').hidden = true;
    $('#composeView').hidden = false;
    $('#composeTitle').textContent = thread ? 'Edit topic' : 'New topic';
    $('#postBtn').textContent = thread ? 'Save' : 'Post topic';
    $('#topicForm').dataset.id = thread ? thread.id : '';
    $('#postName').value = thread ? thread.name : (cache.name || '');
    $('#postMood').value = thread ? cleanMood(thread.mood) : cleanMood(cache.mood);
    $('#postCat').value = thread && CATS[thread.category] ? thread.category : 'general';
    $('#postTitle').value = thread ? thread.title : '';
    $('#postBody').value = thread ? thread.body : '';
    $('#postOfficial').checked = !!(thread && thread.official);
    $('#officialRow').hidden = !isOwner;
    $('#formError').hidden = true;
  }
  function parseRoute() {
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/t\/([A-Za-z0-9_-]{1,80})$/))) return { name: 'thread', id: m[1], key: h };
    if ((m = h.match(/^#\/edit\/([A-Za-z0-9_-]{1,80})$/))) return { name: 'edit', id: m[1], key: h };
    if (h === '#/new') return { name: 'new', key: h };
    return { name: 'list', key: '#/' };
  }
  function render() {
    updateBanners();
    const ownerBtn = $('#ownerBtn');
    if (ownerBtn) ownerBtn.textContent = isOwner ? 'Sign out' : 'Owner sign in';
    const route = parseRoute();
    if (route.name === 'list') {
      $('#listView').hidden = false;
      $('#threadView').hidden = true;
      $('#composeView').hidden = true;
      paintRows();
      painted = route.key;
      return;
    }
    const typing = document.activeElement && /^(replyBody|replyName|postBody|postTitle|postName)$/.test(document.activeElement.id);
    if (route.key !== painted && !typing) {
      painted = route.key;
      if (route.name === 'new') showCompose(null);
      else if (route.name === 'edit') {
        const t = cache.threads[route.id];
        if (!t || !isOwner) { location.hash = '#/'; return; }
        showCompose(t);
      } else showThread(route.id, false);
      return;
    }
    if (route.name === 'thread' && !typing) showThread(route.id, true);
    if (route.name === 'new' || route.name === 'edit') $('#officialRow').hidden = !isOwner;
  }
  function formError(msg) {
    const el = $('#formError');
    el.textContent = msg;
    el.hidden = !msg;
  }
  function fieldsFromForm() {
    const rawName = $('#postName').value.trim();
    const name = rawName ? cleanName(rawName) : 'Guest';
    if (!name) return formError('Display name should start with a letter or number. Letters, numbers, and spaces, up to 24 characters.');
    const title = cleanTitle($('#postTitle').value);
    if (!title) return formError('Add a title (up to 120 characters).');
    const body = cleanBody($('#postBody').value, 5000);
    if (!body) return formError('Write a post.');
    if (body.length > 5000) return formError('Posts can be up to 5,000 characters.');
    const category = cleanCat($('#postCat').value);
    if (!category) return formError('Pick a category.');
    formError('');
    return {
      name, title, body, category,
      mood: cleanMood($('#postMood').value),
      official: isOwner && $('#postOfficial').checked
    };
  }
  function dayStamp() { return Math.floor(Date.now() / 86400000) * 86400000; }
  function takeQuota() {
    const day = dayStamp();
    const q = cache.quota || { n: 0, day: 0 };
    const n = q.day === day ? Number(q.n) + 1 : 1;
    if (!isOwner && n > 40) {
      const err = new Error('Daily limit reached (40 posts).');
      err.code = 'quota';
      throw err;
    }
    const wait = 4000 - (Date.now() - (cache.lastPost || 0));
    return { n: isOwner ? n : n, day, wait: !isOwner && wait > 0 ? wait : 0 };
  }
  function rememberQuota(q) {
    if (!q || isOwner) {
      cache.lastPost = Date.now();
      return;
    }
    cache.quota = { n: q.n, day: q.day };
    cache.lastPost = Date.now();
  }
  async function serverQuota() {
    const day = dayStamp();
    let n = 1;
    const snap = await firebase.database().ref('forum/c/' + user.uid).once('value');
    const cur = snap.val();
    if (cur && cur.day === day) n = Number(cur.n) + 1;
    if (n > 40) {
      const err = new Error('Daily limit reached (40 posts).');
      err.code = 'quota';
      throw err;
    }
    const wait = 4000 - (Date.now() - (cache.lastPost || 0));
    if (wait > 0) await sleep(wait);
    return { n, day };
  }
  function threadRecord(fields, existing) {
    return {
      id: existing ? existing.id : makeId(),
      title: fields.title,
      body: fields.body,
      category: fields.category,
      name: fields.name,
      mood: fields.mood,
      author: existing && existing.author ? existing.author : (user ? user.uid : 'local'),
      createdAt: existing && existing.createdAt ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      pinned: existing ? !!existing.pinned : false,
      locked: existing ? !!existing.locked : false,
      official: isOwner ? !!fields.official : false,
      localOnly: true,
      pendingSync: true
    };
  }
  async function writeThread(record, quota) {
    const onServer = serverThreads && serverThreads[record.id];
    const payload = {
      title: record.title,
      body: record.body,
      category: record.category,
      name: record.name,
      mood: record.mood,
      author: user.uid,
      createdAt: onServer ? onServer.createdAt : firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      pinned: isOwner ? !!record.pinned : false,
      locked: isOwner ? !!record.locked : false,
      official: isOwner ? !!record.official : false
    };
    const updates = {};
    updates['forum/threads/' + record.id] = payload;
    if (!isOwner) {
      payload.seq = quota.n;
      payload.day = quota.day;
      payload.pinned = false;
      payload.locked = false;
      payload.official = false;
      updates['forum/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
      updates['forum/c/' + user.uid] = { n: quota.n, day: quota.day };
    }
    await firebase.database().ref().update(updates);
  }
  async function rulesMissing() {
    try {
      await firebase.database().ref('forum/threads').limitToFirst(1).once('value');
      return false;
    } catch (e) { return denied(e); }
  }
  async function submitTopic(e) {
    e.preventDefault();
    if (posting) return;
    if (banned && !isOwner) { formError('This browser is banned from posting.'); return; }
    const fields = fieldsFromForm();
    if (!fields) return;
    const editing = $('#topicForm').dataset.id || '';
    const existing = editing ? cache.threads[editing] : null;
    if (editing && (!existing || !isOwner)) { formError('Only the owner can edit a topic.'); return; }
    cache.name = fields.name;
    cache.mood = fields.mood;
    posting = true;
    $('#postBtn').disabled = true;
    try {
      if (existing && !existing.localOnly && readsOk && user) {
        await patchThread(existing.id, {
          title: fields.title, body: fields.body, category: fields.category,
          name: fields.name, mood: fields.mood, official: fields.official
        });
        location.hash = '#/t/' + existing.id;
        return;
      }
      const record = existing ? Object.assign({}, existing, fields, { official: isOwner ? !!fields.official : false, updatedAt: Date.now(), pendingSync: true, localOnly: true }) : threadRecord(fields, null);
      if (!readsOk || !user || (existing && existing.localOnly)) {
        if (!existing) {
          const q = takeQuota();
          if (q.wait) await sleep(q.wait);
          rememberQuota(q);
        }
        cache.threads[record.id] = record;
        save();
        toast(rulesBlocked ? 'Saved on this device until Firebase rules are published.' : 'Saved on this device.');
        painted = '';
        location.hash = '#/t/' + record.id;
        return;
      }
      const quota = isOwner ? null : await serverQuota();
      record.author = user.uid;
      await writeThread(record, quota);
      record.localOnly = false;
      record.pendingSync = false;
      cache.threads[record.id] = record;
      rememberQuota(quota || { n: 0, day: dayStamp() });
      save();
      toast('Posted.');
      painted = '';
      location.hash = '#/t/' + record.id;
    } catch (err) {
      if (err && err.code === 'quota') { formError(err.message); return; }
      if (denied(err) && await rulesMissing()) {
        showBanner();
        readsOk = false;
        const record = existing ? Object.assign({}, existing, fields, { localOnly: true, pendingSync: true }) : threadRecord(fields, null);
        cache.threads[record.id] = record;
        save();
        toast('Saved on this device until Firebase rules are published.');
        painted = '';
        location.hash = '#/t/' + record.id;
        return;
      }
      formError(err && err.code === 'quota' ? err.message : 'Could not post. Wait a few seconds, or shorten the post, and try again.');
    } finally {
      posting = false;
      $('#postBtn').disabled = false;
    }
  }
  async function submitReply(tid) {
    if (posting) return;
    const t = cache.threads[tid];
    if (!t) return;
    if (t.locked && !isOwner) { toast('This topic is locked.'); return; }
    if (banned && !isOwner) { toast('This browser is banned from posting.'); return; }
    const rawName = $('#replyName').value.trim();
    const name = rawName ? cleanName(rawName) : 'Guest';
    if (!name) { errEl.textContent = 'Display name should start with a letter or number. Letters, numbers, and spaces, up to 24 characters.'; errEl.hidden = false; return; }
    const body = cleanBody($('#replyBody').value, 2000);
    const mood = cleanMood($('#replyMood').value);
    const errEl = $('#replyError');
    if (!body) { errEl.textContent = 'Write a reply.'; errEl.hidden = false; return; }
    errEl.hidden = true;
    cache.name = name;
    cache.mood = mood;
    const id = makeId();
    const record = { id, body, name, mood, author: user ? user.uid : 'local', createdAt: Date.now(), localOnly: true, pendingSync: true };
    posting = true;
    try {
      if (t.localOnly || !readsOk || !user) {
        const q = takeQuota();
        if (q.wait) await sleep(q.wait);
        if (!cache.replies[tid]) cache.replies[tid] = {};
        cache.replies[tid][id] = record;
        rememberQuota(q);
        save();
        toast(rulesBlocked ? 'Saved on this device until Firebase rules are published.' : 'Saved on this device.');
        showThread(tid, false);
        return;
      }
      const quota = isOwner ? null : await serverQuota();
      const payload = {
        body, name, mood,
        author: user.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      const updates = {};
      updates['forum/replies/' + tid + '/' + id] = payload;
      if (!isOwner) {
        payload.seq = quota.n;
        payload.day = quota.day;
        updates['forum/rate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
        updates['forum/c/' + user.uid] = { n: quota.n, day: quota.day };
      }
      await firebase.database().ref().update(updates);
      record.localOnly = false;
      record.pendingSync = false;
      if (!cache.replies[tid]) cache.replies[tid] = {};
      cache.replies[tid][id] = record;
      rememberQuota(quota || { n: 0, day: dayStamp() });
      save();
      toast('Reply posted.');
      showThread(tid, false);
    } catch (err) {
      if (err && err.code === 'quota') { toast(err.message); return; }
      if (denied(err) && await rulesMissing()) {
        showBanner();
        readsOk = false;
        if (!cache.replies[tid]) cache.replies[tid] = {};
        cache.replies[tid][id] = record;
        save();
        toast('Saved on this device until Firebase rules are published.');
        showThread(tid, false);
        return;
      }
      toast('Could not post that reply. Wait a few seconds and try again.');
    } finally { posting = false; }
  }
  async function patchThread(id, changes) {
    const t = cache.threads[id];
    if (!t || !isOwner) return;
    const next = Object.assign({}, t, changes, { updatedAt: Date.now() });
    if (t.localOnly || !readsOk || !user) {
      cache.threads[id] = next;
      save();
      painted = '';
      render();
      return;
    }
    const payload = {
      title: next.title,
      body: next.body,
      category: next.category || 'general',
      name: next.name,
      mood: cleanMood(next.mood),
      author: t.author,
      createdAt: t.createdAt,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      pinned: !!next.pinned,
      locked: !!next.locked,
      official: !!next.official
    };
    try {
      await firebase.database().ref('forum/threads/' + id).set(payload);
      cache.threads[id] = next;
      save();
      painted = '';
    } catch (e) {
      toast('Could not save that change.');
    }
  }
  async function onTool(act, id, extra) {
    if (!isOwner) return;
    if (act === 'edit') { location.hash = '#/edit/' + id; return; }
    if (act === 'pin') { await patchThread(id, { pinned: !cache.threads[id].pinned }); render(); return; }
    if (act === 'lock') { await patchThread(id, { locked: !cache.threads[id].locked }); render(); return; }
    if (act === 'official') { await patchThread(id, { official: !cache.threads[id].official }); render(); return; }
    if (act === 'delete') {
      if (!confirm('Delete this topic and its replies?')) return;
      const t = cache.threads[id];
      if (!t) return;
      if (!t.localOnly && readsOk && user) {
        const updates = {};
        updates['forum/threads/' + id] = null;
        updates['forum/views/' + id] = null;
        Object.keys(replyMap(id)).forEach(rid => { updates['forum/replies/' + id + '/' + rid] = null; });
        try { await firebase.database().ref().update(updates); }
        catch (e) { toast('Could not delete that topic.'); return; }
      }
      delete cache.threads[id];
      delete cache.replies[id];
      delete cache.views[id];
      save();
      painted = '';
      location.hash = '#/';
      return;
    }
    if (act === 'ban' || act === 'unban') {
      const uid = act === 'unban' ? id : id;
      if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) { toast('That writer cannot be banned from here.'); return; }
      if (act === 'ban' && !confirm('Ban this writer from posting?')) return;
      try {
        await firebase.database().ref('forum/bans/' + uid).set(act === 'ban' ? true : null);
        if (act === 'unban') delete banMap[uid]; else banMap[uid] = true;
        save();
        toast(act === 'ban' ? 'Writer banned.' : 'Writer unbanned.');
        render();
      } catch (e) {
        toast('Bans turn on when Firebase rules are published.');
      }
      return;
    }
    if (act === 'delete-reply') {
      if (!confirm('Delete this reply?')) return;
      const bag = cache.replies[extra] || {};
      const r = bag[id];
      if (r && !r.localOnly && readsOk && user) {
        try { await firebase.database().ref('forum/replies/' + extra + '/' + id).set(null); }
        catch (e) { toast('Could not delete that reply.'); return; }
      }
      if (cache.replies[extra]) delete cache.replies[extra][id];
      save();
      painted = '';
      render();
      return;
    }
    if (act === 'edit-reply') {
      const bag = (cache.replies[extra] || {})[id];
      if (!bag) return;
      const next = prompt('Edit reply', bag.body);
      if (next == null) return;
      const body = cleanBody(next, 2000);
      if (!body) { toast('Reply cannot be empty.'); return; }
      if (bag.localOnly || !readsOk || !user) {
        bag.body = body;
        save();
        painted = '';
        render();
        return;
      }
      try {
        await firebase.database().ref('forum/replies/' + extra + '/' + id).set({
          body, name: bag.name, mood: cleanMood(bag.mood), author: bag.author, createdAt: bag.createdAt
        });
        bag.body = body;
        save();
        painted = '';
        render();
      } catch (e) { toast('Could not edit that reply.'); }
    }
  }
  async function bumpView(t) {
    if (!t || seenSet().has(t.id)) return;
    markSeen(t.id);
    if (t.localOnly || !readsOk || !user) {
      cache.views[t.id] = (Number(cache.views[t.id]) || 0) + 1;
      save();
      const el = $('[data-views]');
      if (el) {
        const rc = Object.keys(replyMap(t.id)).length;
        el.textContent = rc + ' replies · ' + cache.views[t.id] + ' views';
        el.setAttribute('data-views', String(cache.views[t.id]));
      }
      return;
    }
    try {
      const snap = await firebase.database().ref('forum/views/' + t.id).once('value');
      const n = (Number(snap.val()) || 0) + 1;
      const updates = {};
      updates['forum/views/' + t.id] = n;
      updates['forum/vrate/' + user.uid] = firebase.database.ServerValue.TIMESTAMP;
      await firebase.database().ref().update(updates);
    } catch (e) { /* a missed view is fine */ }
  }
  function mirror() {
    if (!readsOk) return;
    if (gotThreads) {
      const threads = {};
      Object.keys(serverThreads || {}).forEach(id => {
        if (serverThreads[id] && serverThreads[id].title) threads[id] = Object.assign({ id, localOnly: false, pendingSync: false }, serverThreads[id]);
      });
      Object.keys(cache.threads || {}).forEach(id => {
        const t = cache.threads[id];
        if (t && t.localOnly && !threads[id]) threads[id] = t;
      });
      cache.threads = threads;
    }
    if (gotReplies) {
      const replies = {};
      Object.keys(serverReplies || {}).forEach(tid => {
        replies[tid] = {};
        const bag = serverReplies[tid] || {};
        Object.keys(bag).forEach(id => {
          if (bag[id] && bag[id].body) replies[tid][id] = Object.assign({ id, localOnly: false, pendingSync: false }, bag[id]);
        });
      });
      Object.keys(cache.replies || {}).forEach(tid => {
        const bag = cache.replies[tid] || {};
        Object.keys(bag).forEach(id => {
          const r = bag[id];
          if (r && r.localOnly && !(replies[tid] && replies[tid][id])) {
            if (!replies[tid]) replies[tid] = {};
            replies[tid][id] = r;
          }
        });
      });
      cache.replies = replies;
    }
    if (gotViews) {
      const views = Object.assign({}, serverViews || {});
      Object.keys(cache.views || {}).forEach(id => {
        if (views[id] == null && cache.threads[id] && cache.threads[id].localOnly) views[id] = cache.views[id];
      });
      cache.views = views;
    }
    save();
  }
  async function flushPending() {
    if (flushing || !readsOk || !user) return;
    flushing = true;
    try {
      const pending = Object.keys(cache.threads).map(id => cache.threads[id]).filter(t => t && t.pendingSync && t.localOnly);
      for (let i = 0; i < pending.length; i++) {
        const t = pending[i];
        if (t.author && t.author !== 'local' && t.author !== user.uid) continue;
        try {
          const quota = isOwner ? null : await serverQuota();
          t.author = user.uid;
          await writeThread(t, quota);
          t.localOnly = false;
          t.pendingSync = false;
          rememberQuota(quota || null);
          save();
        } catch (e) {
          if (denied(e)) break;
          break;
        }
      }
    } finally { flushing = false; }
  }
  function listen() {
    if (listening || !user) return;
    listening = true;
    const db = firebase.database();
    const note = () => { mirror(); render(); if (readsOk) flushPending(); };
    db.ref('forum/threads').on('value', snap => {
      serverThreads = snap.val() || {};
      gotThreads = true;
      readsOk = true;
      hideBanner();
      note();
    }, err => {
      if (denied(err)) { readsOk = false; showBanner(); }
      render();
    });
    db.ref('forum/replies').on('value', snap => {
      serverReplies = snap.val() || {};
      gotReplies = true;
      if (!rulesBlocked) readsOk = true;
      note();
    }, err => { if (denied(err)) { readsOk = false; showBanner(); } render(); });
    db.ref('forum/views').on('value', snap => {
      serverViews = snap.val() || {};
      gotViews = true;
      note();
    }, err => { if (denied(err) && !gotThreads) { readsOk = false; showBanner(); } render(); });
    db.ref('forum/bans/' + user.uid).on('value', snap => {
      banned = snap.val() === true;
      render();
    }, () => {});
    if (isOwner) {
      db.ref('forum/bans').on('value', snap => {
        banMap = snap.val() || {};
        render();
      }, () => {});
    }
  }
  function connect() {
    const c = window.MONDO_BOARD_CONFIG;
    if (typeof firebase === 'undefined' || !c || !c.apiKey || !c.databaseURL) return;
    try { if (!firebase.apps.length) firebase.initializeApp(c); } catch (e) { return; }
    firebase.auth().onAuthStateChanged(async u => {
      if (!u) {
        user = null;
        isOwner = false;
        try { await firebase.auth().signInAnonymously(); } catch (e) { showBanner(); }
        render();
        return;
      }
      user = u;
      isOwner = !!(u.email && u.email.toLowerCase() === ownerEmail());
      listening = false;
      listen();
      render();
    });
  }
  function boot() {
    $('#yr').textContent = String(new Date().getFullYear());
    $('#search').addEventListener('input', () => { query = $('#search').value; paintRows(); });
    $('#catFilter').addEventListener('change', () => { cat = $('#catFilter').value; paintRows(); });
    $('#newBtn').addEventListener('click', () => {
      if (banned && !isOwner) { toast('This browser is banned from posting.'); return; }
      location.hash = '#/new';
      render();
    });
    $('#topicForm').addEventListener('submit', submitTopic);
    document.body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      onTool(b.getAttribute('data-act'), b.getAttribute('data-id') || b.getAttribute('data-uid'), b.getAttribute('data-extra'));
    });
    $('#ownerBtn').onclick = () => {
      if (typeof firebase === 'undefined' || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
      const current = firebase.auth().currentUser;
      if (current && current.email && current.email.toLowerCase() === ownerEmail()) {
        firebase.auth().signOut();
        return;
      }
      $('#ownerError').hidden = true;
      $('#ownerPass').value = '';
      $('#ownerEmail').value = ownerEmail();
      $('#ownerDialog').showModal();
    };
    $('#ownerCancel').onclick = () => $('#ownerDialog').close();
    $('#ownerForm').addEventListener('submit', async e => {
      e.preventDefault();
      $('#ownerError').hidden = true;
      try {
        await firebase.auth().signInWithEmailAndPassword($('#ownerEmail').value.trim(), $('#ownerPass').value);
        $('#ownerPass').value = '';
        $('#ownerDialog').close();
      } catch (err) {
        $('#ownerPass').value = '';
        const code = String(err && err.code || '');
        $('#ownerError').textContent = code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 || code.indexOf('user-not-found') >= 0
          ? 'That email or password is wrong.'
          : 'Could not sign in.';
        $('#ownerError').hidden = false;
      }
    });
    window.addEventListener('hashchange', () => render());
    render();
    connect();
  }
  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : this);
