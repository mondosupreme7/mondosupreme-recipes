(() => {
'use strict';
const KEY = 'mondosupreme.wiki.v1';
const LIMITS = { title: 200, body: 100000, tag: 40, tags: 30, id: 64, pages: 500 };
const WELCOME = [
  'This is a shared notebook. Anyone can add a page. Only the owner can edit, rename, delete, or restore an older copy. **Export** still makes a backup.',
  '',
  '## Write',
  '',
  'Tap **New page**. The title is the page name. Write the note in Markdown, then tap **Preview** to check it while you edit.',
  '',
  '- **bold** and *italic*',
  '- lists and checklists',
  '- `inline code`',
  '- links such as [Mondosupreme](https://mondosupreme.com/)',
  '',
  '```',
  'code stays as you typed it',
  '```',
  '',
  '- [x] Export a backup after you add something you want to keep',
  '- [ ] Try a checklist of your own',
  '',
  '## Link another page',
  '',
  'Write [[Kitchen notes]] to link a page by its title. A custom label looks like [[Kitchen notes|the kitchen]]. Tap a link that does not exist yet, fill the new page in, and save it.',
  '',
  '## Find and rename',
  '',
  'Search covers every title, tag, and the text of every page. Home also lists all pages and the ones you edited recently. Add tags in the editor, separated by commas.',
  '',
  'To rename a page, edit it and change the title. Links written as [[the old title]] are updated to the new name.',
  '',
  '## Print',
  '',
  'Open a page and tap **Print** when you want a paper copy.',
  '',
  '## Shared pages',
  '',
  'New pages show up for everyone once server sync is on. Until then, this browser keeps a local copy. A page named [[Kitchen notes]] links by title, and the bottom of each page lists what links here.'
].join('\n');

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function clipStr(v, max) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}
function cleanTitle(v) {
  return clipStr(v, LIMITS.title).replace(/[\[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
}
function clipBody(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, LIMITS.body);
}
function clipTags(v) {
  let arr = [];
  if (typeof v === 'string') arr = v.split(',');
  else if (Array.isArray(v)) arr = v;
  return [...new Set(arr.map(t => clipStr(t, LIMITS.tag).toLowerCase()).filter(Boolean))].slice(0, LIMITS.tags);
}
function cleanId(v) {
  return clipStr(v, LIMITS.id).replace(/[^A-Za-z0-9_-]/g, '');
}
function clipDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return '';
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
function safeHref(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000 || /[\u0000-\u001f\u007f\s"'<>\\`]/.test(trimmed)) return '';
  let url;
  try { url = new URL(trimmed); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  if (!url.hostname || url.username || url.password) return '';
  return url.href;
}
function safeImage(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const href = safeHref(trimmed);
  if (href.startsWith('https://') && href.length <= 2000) return href;
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length <= 140000) return trimmed;
  return '';
}
function safeHash(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return '';
  if (/^#\/page\/[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw;
  const made = raw.match(/^#\/new\/([A-Za-z0-9._~%!$&'()*+,;=:@/-]{1,400})$/);
  if (!made) return '';
  try {
    const title = cleanTitle(decodeURIComponent(made[1]));
    if (!title) return '';
    return '#/new/' + encodeURIComponent(title);
  } catch { return ''; }
}
function findPage(list, name) {
  const key = cleanTitle(name).toLowerCase();
  if (!key) return null;
  return (list || []).find(p => cleanTitle(p && p.title).toLowerCase() === key) || null;
}
function renderInline(text, ctx) {
  const allow = !ctx || ctx.links !== false;
  const pages = ctx && ctx.pages || [];
  let html = '';
  let plain = '';
  let i = 0;
  const flush = () => { if (plain) { html += esc(plain); plain = ''; } };
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        html += '<code>' + esc(text.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
    }
    if (allow && text.startsWith('![', i)) {
      const link = readLink(text, i, true);
      if (link) {
        flush();
        const href = safeImage(link.url);
        html += href
          ? '<img alt="' + esc(link.label) + '" src="' + esc(href) + '">'
          : esc(text.slice(i, link.end));
        i = link.end;
        continue;
      }
    }
    if (allow && text.startsWith('[[', i)) {
      const end = text.indexOf(']]', i + 2);
      if (end !== -1 && !/[\n\r]/.test(text.slice(i + 2, end))) {
        const inner = text.slice(i + 2, end);
        const bar = inner.indexOf('|');
        const name = cleanTitle(bar >= 0 ? inner.slice(0, bar) : inner);
        const label = (bar >= 0 ? inner.slice(bar + 1) : name).trim();
        if (name) {
          flush();
          const page = findPage(pages, name);
          const shown = renderInline(label || name, { pages, links: false });
          html += page
            ? '<a class="wiki-link" href="#/page/' + esc(page.id) + '">' + shown + '</a>'
            : '<a class="wiki-link is-missing" href="#/new/' + esc(encodeURIComponent(name)) + '">' + shown + '</a>';
          i = end + 2;
          continue;
        }
      }
    }
    if (allow && text[i] === '[') {
      const link = readLink(text, i, false);
      if (link) {
        flush();
        const href = safeHref(link.url);
        html += href
          ? '<a href="' + esc(href) + '" rel="noopener noreferrer">' + renderInline(link.label, { pages, links: false }) + '</a>'
          : esc(text.slice(i, link.end));
        i = link.end;
        continue;
      }
    }
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const mark = text.slice(i, i + 2);
      const end = text.indexOf(mark, i + 2);
      if (end > i + 2) {
        flush();
        html += '<strong>' + renderInline(text.slice(i + 2, end), { pages, links: allow }) + '</strong>';
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2);
      if (end > i + 2) {
        flush();
        html += '<del>' + renderInline(text.slice(i + 2, end), { pages, links: allow }) + '</del>';
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1 && text[i + 1] !== '*' && text[end - 1] !== '*') {
        flush();
        html += '<em>' + renderInline(text.slice(i + 1, end), { pages, links: allow }) + '</em>';
        i = end + 1;
        continue;
      }
    }
    if (allow && (text.startsWith('https://', i) || text.startsWith('http://', i) || text.startsWith('mailto:', i))) {
      const m = text.slice(i).match(/^(https?:\/\/[^\s<]+|mailto:[^\s<]+)/);
      if (m) {
        const visible = m[1].replace(/[),.;:!?]+$/g, '');
        const href = safeHref(visible);
        if (href) {
          flush();
          html += '<a href="' + esc(href) + '" rel="noopener noreferrer">' + esc(visible) + '</a>';
          i += visible.length;
          continue;
        }
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return html;
}
function readLink(text, i, bang) {
  let p = i;
  if (bang) {
    if (text[p] !== '!') return null;
    p += 1;
  }
  if (text[p] !== '[') return null;
  const close = text.indexOf(']', p + 1);
  if (close < 0 || text[close + 1] !== '(') return null;
  const end = text.indexOf(')', close + 2);
  if (end < 0) return null;
  const label = text.slice(p + 1, close);
  const url = text.slice(close + 2, end).trim();
  if (/[\n\r]/.test(label) || /[\s\n\r]/.test(url)) return null;
  return { end: end + 1, label, url };
}
function isBlockStart(line) {
  return /^```/.test(line.trim()) || /^#{1,6}\s+\S/.test(line) || /^>\s?/.test(line) ||
    /^\s*[-*+]\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line) || /^\s*([-*_])\1{2,}\s*$/.test(line);
}
function renderBlocks(lines, ctx) {
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      html += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>';
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(\S.*)$/);
    if (heading) {
      const level = heading[1].length;
      let idAttr = '';
      if (ctx && level <= 3 && ctx.top !== false) {
        const n = (ctx.hcount = (ctx.hcount || 0) + 1);
        idAttr = ' id="sec-' + n + '"';
      }
      html += '<h' + level + idAttr + '>' + renderInline(heading[2].trim(), ctx) + '</h' + level + '>';
      i += 1;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { html += '<hr>'; i += 1; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      html += '<blockquote>' + renderBlocks(buf, Object.assign({}, ctx, { top: false })) + '</blockquote>';
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html += '<' + tag + '>' + items.map(item => {
        const task = item.match(/^\[([ xX])\]\s*(.*)$/);
        if (!ordered && task) {
          const mark = task[1].toLowerCase() === 'x' ? ' checked' : '';
          return '<li class="task"><input type="checkbox" disabled' + mark + '> ' + renderInline(task[2], ctx) + '</li>';
        }
        return '<li>' + renderInline(item, ctx) + '</li>';
      }).join('') + '</' + tag + '>';
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) { buf.push(lines[i]); i += 1; }
    html += '<p>' + buf.map(part => renderInline(part, ctx)).join('<br>') + '</p>';
  }
  return html;
}
function renderMarkdown(src, pageList) {
  const text = String(src || '').replace(/\r\n?/g, '\n');
  return renderBlocks(text.split('\n'), { pages: Array.isArray(pageList) ? pageList : [], links: true });
}
function sanitizedTree(html) {
  const doc = document.implementation.createHTMLDocument('');
  const wrap = doc.createElement('div');
  wrap.innerHTML = html;
  const out = doc.createElement('div');
  const allowed = new Set(['A', 'P', 'BR', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'IMG', 'INPUT']);
  function copy(node, parent) {
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) { parent.appendChild(doc.createTextNode(child.textContent)); return; }
      if (child.nodeType !== 1 || !allowed.has(child.tagName)) {
        if (child.nodeType === 1) copy(child, parent);
        return;
      }
      const tag = child.tagName;
      if (tag === 'A') {
        const href = safeHref(child.getAttribute('href') || '') || safeHash(child.getAttribute('href') || '');
        if (!href) { copy(child, parent); return; }
        const el = doc.createElement('a');
        el.setAttribute('href', href);
        if (child.classList.contains('wiki-link')) el.classList.add('wiki-link');
        if (child.classList.contains('is-missing')) el.classList.add('is-missing');
        if (!href.startsWith('#')) el.setAttribute('rel', 'noopener noreferrer');
        parent.appendChild(el);
        copy(child, el);
        return;
      }
      if (tag === 'IMG') {
        const src = safeImage(child.getAttribute('src') || '');
        if (!src) return;
        const el = doc.createElement('img');
        el.setAttribute('src', src);
        el.setAttribute('alt', (child.getAttribute('alt') || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300));
        el.setAttribute('loading', 'lazy');
        el.setAttribute('referrerpolicy', 'no-referrer');
        parent.appendChild(el);
        return;
      }
      if (tag === 'INPUT') {
        if ((child.getAttribute('type') || '').toLowerCase() !== 'checkbox') return;
        const el = doc.createElement('input');
        el.setAttribute('type', 'checkbox');
        el.setAttribute('disabled', '');
        if (child.hasAttribute('checked')) el.setAttribute('checked', '');
        parent.appendChild(el);
        return;
      }
      const el = doc.createElement(tag.toLowerCase());
      if (tag === 'LI' && child.classList.contains('task')) el.classList.add('task');
      if (/^H[1-3]$/.test(tag)) {
        const id = child.getAttribute('id') || '';
        if (/^sec-\d{1,4}$/.test(id)) el.setAttribute('id', id);
      }
      parent.appendChild(el);
      if (tag !== 'BR' && tag !== 'HR') copy(child, el);
    });
  }
  copy(wrap, out);
  return out;
}
function paintMarkdown(el, md, list, opts) {
  if (!el) return;
  const tree = sanitizedTree(renderMarkdown(md, list));
  el.replaceChildren();
  [...tree.childNodes].forEach(node => el.appendChild(document.importNode(node, true)));
  el.classList.toggle('can-check', !!(opts && opts.checkable));
  if (opts && opts.checkable) el.querySelectorAll('input[type=checkbox]').forEach(box => { box.disabled = false; });
}
function rewriteWikiLinks(body, oldTitle, newTitle) {
  const from = cleanTitle(oldTitle).toLowerCase();
  const to = cleanTitle(newTitle);
  if (!from || !to) return String(body || '');
  const lines = String(body || '').split('\n');
  let fence = false;
  return lines.map(line => {
    if (/^```/.test(line.trim())) { fence = !fence; return line; }
    if (fence) return line;
    return line.replace(/\[\[([^\]\n|]+)(\|([^\]\n]*))?\]\]/g, (m, name, pipe, label) => {
      if (cleanTitle(name).toLowerCase() !== from) return m;
      const custom = label != null && cleanTitle(label) && cleanTitle(label).toLowerCase() !== from;
      return '[[' + to + (custom ? '|' + label.trim() : '') + ']]';
    });
  }).join('\n');
}
function freshId(seen) {
  let id = uid();
  while (seen.has(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) id = uid();
  seen.add(id);
  return id;
}
function uniqueTitle(title, used) {
  let t = title;
  let n = 2;
  while (used.has(t.toLowerCase())) {
    const suffix = ' (' + n + ')';
    t = (title.slice(0, LIMITS.title - suffix.length) + suffix).trim();
    n += 1;
    if (n > LIMITS.pages) break;
  }
  used.add(t.toLowerCase());
  return t;
}
function disambiguate(list) {
  const used = new Set();
  return list.map(p => {
    const title = uniqueTitle(p.title, used);
    return title === p.title ? p : { ...p, title };
  });
}
function normalizePage(raw, seen, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = cleanTitle(raw.title);
  if (!title) return null;
  let id = cleanId(raw.id);
  if (!id || seen.has(id)) id = freshId(seen);
  else seen.add(id);
  const created = clipDate(raw.created) || now;
  const page = {
    id, title,
    body: clipBody(raw.body),
    tags: clipTags(raw.tags),
    created,
    updated: clipDate(raw.updated) || created
  };
  const history = clipHistory(raw.history);
  if (history.length) page.history = history;
  return page;
}
function clipHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const rev of raw.slice(0, 5)) {
    if (!rev || typeof rev !== 'object' || Array.isArray(rev)) continue;
    const title = cleanTitle(rev.title);
    if (!title) continue;
    let t = clipDate(rev.t);
    if (!t && typeof rev.t === 'number' && rev.t > 0) t = new Date(rev.t).toISOString();
    out.push({ t: t || new Date().toISOString(), title, body: clipBody(rev.body), tags: clipTags(rev.tags) });
  }
  return out;
}
function pageLinkNames(body) {
  const lines = String(body || '').split('\n');
  let fence = false;
  const names = [];
  for (const line of lines) {
    if (/^```/.test(line.trim())) { fence = !fence; continue; }
    if (fence) continue;
    const re = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;
    let m;
    while ((m = re.exec(line))) {
      const name = cleanTitle(m[1]).toLowerCase();
      if (name) names.push(name);
    }
  }
  return names;
}
function backlinkPages(list, page) {
  const title = cleanTitle(page && page.title).toLowerCase();
  if (!title) return [];
  return (list || []).filter(p => p && p.id !== page.id && pageLinkNames(p.body).indexOf(title) >= 0);
}
function headingList(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let fence = false;
  const out = [];
  for (const line of lines) {
    if (/^```/.test(line.trim())) { fence = !fence; continue; }
    if (fence) continue;
    const m = line.match(/^(#{1,3})\s+(\S.*)$/);
    if (m) out.push({ level: m[1].length, text: plainHeading(m[2].trim()) });
  }
  return out;
}
function plainHeading(text) {
  return String(text || '')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, name, label) => (label || name).trim())
    .replace(/[`*_~]/g, '')
    .trim();
}
function toggleTask(body, index) {
  const lines = String(body || '').split('\n');
  let fence = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) { fence = !fence; continue; }
    if (fence) continue;
    if (/^\s*\d+[.)]\s+/.test(line)) continue;
    const m = line.match(/^(\s*[-*+]\s+)\[([ xX])\](\s*.*)$/);
    if (!m) continue;
    if (n === index) {
      const mark = m[2].toLowerCase() === 'x' ? ' ' : 'x';
      lines[i] = m[1] + '[' + mark + ']' + m[3];
      return lines.join('\n');
    }
    n += 1;
  }
  return String(body || '');
}
function rememberHistory(page) {
  const rev = {
    t: page.updated || new Date().toISOString(),
    title: page.title,
    body: page.body,
    tags: [...(page.tags || [])]
  };
  page.history = [rev, ...(page.history || [])].slice(0, 5);
}
function parseWikiBackup(data) {
  let arr;
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object' && Array.isArray(data.pages)) arr = data.pages;
  else return null;
  const seen = new Set();
  const now = new Date().toISOString();
  const out = [];
  for (const item of arr.slice(0, LIMITS.pages)) {
    const page = normalizePage(item, seen, now);
    if (page) out.push(page);
  }
  if (!out.length) return null;
  return { pages: disambiguate(out) };
}

let pages = [];
let query = '';
let tag = '';
let hlpMode = 'contents';
const HIST_KEY = 'mondosupreme.wiki.history.v1';
let editingId = null;
let editHash = '';
let snap = '';
let skipDirty = false;
let previewOn = false;

function snapshot() { return [$('#title').value, $('#tags').value, $('#body').value].join('\n'); }
function isDirty() { return snapshot() !== snap; }
function takeSnap() { snap = snapshot(); }
function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
const PUSHED = 'mondosupreme.wiki.pushed.v1';
const RULES_BANNER = 'Server sync waiting on updated Firebase rules — using local storage until published';
let serverLive = false, rulesBlocked = false, isOwner = false, myUid = '';
let quota = { n: 0, day: 0 }, quotaLoaded = false, quotaStop = false;
let heldPages = [], chain = Promise.resolve(), itemsRef = null, syncStarted = false, migrating = false, lastCreate = 0;
const pendingCreates = new Set(), unsynced = new Set();
let fellBack = false, listening = false;
function isStock(p) {
  if (!p || p.id !== 'welcome' || cleanTitle(p.title) !== 'Welcome') return false;
  const b = String(p.body || '');
  return b === WELCOME || b.includes('Pages in this wiki stay in this browser') || b.includes('## Saved on this device');
}
function canMutate() { return !!isOwner; }
function isAdminNow() { return !!(window.MONDO_MEMBER && window.MONDO_MEMBER.isOwner && window.MONDO_MEMBER.isOwner()); }
function showRulesBanner() {
  rulesBlocked = true;
  serverLive = false;
  const el = $('#syncBanner');
  if (el) { el.hidden = false; el.textContent = RULES_BANNER; }
  refreshViews();
}
function hideRulesBanner() {
  rulesBlocked = false;
  const el = $('#syncBanner');
  if (el) el.hidden = true;
}
function isDenied(err) {
  const code = String((err && err.code) || '') + ' ' + String((err && err.message) || '');
  return /PERMISSION_DENIED|permission[-_ ]denied/i.test(code);
}
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function todayStamp() { return Math.floor(Date.now() / 86400000) * 86400000; }
function loadPushed() { try { return new Set(JSON.parse(localStorage.getItem(PUSHED)) || []); } catch { return new Set(); } }
function rememberPushed(id) {
  const s = loadPushed();
  s.add(id);
  try { localStorage.setItem(PUSHED, JSON.stringify([...s])); } catch { /* keep going */ }
}
function clonePage(p) {
  return { ...p, tags: [...(p.tags || [])], history: (p.history || []).map(r => ({ ...r, tags: [...(r.tags || [])] })) };
}
function toServer(page, author, stampCreated) {
  const payload = {
    title: cleanTitle(page.title).replace(/[\r\n]+/g, ' '),
    body: clipBody(page.body),
    tags: (page.tags || []).join(',').slice(0, 1200),
    createdAt: stampCreated ? firebase.database.ServerValue.TIMESTAMP : page.createdAt,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
    author
  };
  const revs = {};
  (page.history || []).slice(0, 5).forEach((rev, i) => {
    const title = cleanTitle(rev.title);
    if (!title) return;
    let t = Date.parse(rev.t);
    if (!Number.isFinite(t) || t <= 0 || t > Date.now()) t = Date.now();
    revs[String(i)] = { t, title, body: clipBody(rev.body), tags: (rev.tags || []).join(',').slice(0, 1200) };
  });
  if (Object.keys(revs).length) payload.revs = revs;
  return payload;
}
function fromServer(id, v) {
  if (!v || typeof v !== 'object') return null;
  const title = cleanTitle(v.title);
  if (!title || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const createdAt = Number(v.createdAt) || 0;
  const updatedAt = Number(v.updatedAt) || createdAt;
  const history = [];
  if (v.revs && typeof v.revs === 'object') {
    Object.keys(v.revs).sort().forEach(key => {
      const rev = v.revs[key];
      const rt = rev && cleanTitle(rev.title);
      if (!rt) return;
      history.push({
        t: new Date(Number(rev.t) || updatedAt || Date.now()).toISOString(),
        title: rt,
        body: clipBody(rev.body),
        tags: clipTags(typeof rev.tags === 'string' ? rev.tags : [])
      });
    });
  }
  return {
    id, title,
    body: clipBody(v.body),
    tags: clipTags(typeof v.tags === 'string' ? v.tags : []),
    created: new Date(createdAt || Date.now()).toISOString(),
    updated: new Date(updatedAt || Date.now()).toISOString(),
    createdAt, updatedAt,
    author: typeof v.author === 'string' ? v.author : '',
    history: history.slice(0, 5)
  };
}
function refreshViews() {
  if (typeof document === 'undefined' || !$('#homeView')) return;
  if ($('#editorView') && !$('#editorView').hidden) return;
  const hash = location.hash || '';
  if (hash === '' || hash === '#' || hash === '#/') { renderHome(); return; }
  const m = hash.match(/^#\/page\/([A-Za-z0-9_-]+)$/);
  if (m) showPage(m[1], true);
}
function updateOwnerButton() {
  const b = $('#ownerBtn');
  if (b && !window.MONDO_MEMBER) b.textContent = isOwner ? 'Sign out' : 'Owner sign in';
  const tools = $('#adminTools');
  const note = $('#readNote');
  if (tools) tools.hidden = !isOwner;
  if (note) note.hidden = !!isOwner;
}
async function ensureQuota() {
  if (quotaLoaded || !myUid || typeof firebase === 'undefined') return;
  const snap = await firebase.database().ref('wiki/c/' + myUid).once('value');
  const v = snap.val() || {};
  quota = { n: Number(v.n) || 0, day: Number(v.day) || 0 };
  quotaLoaded = true;
}
async function createNow(id) {
  if (!isOwner) { pendingCreates.delete(id); return; }
  if (rulesBlocked || !serverLive || !myUid || !pendingCreates.has(id)) return;
  let page = pages.find(p => p.id === id);
  if (!page || isStock(page)) { pendingCreates.delete(id); return; }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) { pendingCreates.delete(id); unsynced.add(id); toast('That page could not be shared'); return; }
  page = pages.find(p => p.id === id);
  if (!page) { pendingCreates.delete(id); return; }
  const owner = isOwner;
  const updates = {};
  if (!owner) {
    await ensureQuota();
    const day = todayStamp();
    const seq = quota.day === day ? (quota.n || 0) + 1 : 1;
    if (seq > 40) {
      quotaStop = true;
      unsynced.add(id);
      pendingCreates.delete(id);
      toast('That is enough new pages for today. Try again tomorrow.');
      const err = new Error('quota');
      err.code = 'quota';
      throw err;
    }
    const wait = 2100 - (Date.now() - lastCreate);
    if (lastCreate && wait > 0) await sleep(wait);
    if (!pendingCreates.has(id)) return;
    const latest = pages.find(p => p.id === id);
    if (!latest) { pendingCreates.delete(id); return; }
    const fresh = toServer(latest, myUid, true);
    fresh.seq = seq;
    fresh.day = day;
    updates['wiki/items/' + id] = fresh;
    updates['wiki/rate/' + myUid] = firebase.database.ServerValue.TIMESTAMP;
    updates['wiki/c/' + myUid] = { n: seq, day };
    await firebase.database().ref().update(updates);
    lastCreate = Date.now();
    quota = { n: seq, day };
  } else {
    updates['wiki/items/' + id] = toServer(page, myUid, true);
    await firebase.database().ref().update(updates);
  }
  rememberPushed(id);
}
async function updateNow(id) {
  if (rulesBlocked || !serverLive || !isOwner || pendingCreates.has(id)) return;
  const page = pages.find(p => p.id === id);
  if (!page || !page.author || !page.createdAt) return;
  await firebase.database().ref('wiki/items/' + id).set(toServer(page, page.author, false));
}
async function removeNow(id) {
  if (rulesBlocked || !serverLive || !isOwner) return;
  await firebase.database().ref('wiki/items/' + id).remove();
}
function shareCreate(id) {
  pendingCreates.add(id);
  unsynced.delete(id);
  return enqueue(() => createNow(id)).catch(err => {
    pendingCreates.delete(id);
    if (err && err.code === 'quota') { unsynced.add(id); return; }
    unsynced.add(id);
    if (isDenied(err)) showRulesBanner();
    else if (serverLive) toast('Could not share that page. It is still saved in this browser.');
  });
}
function shareUpdate(id) {
  return enqueue(() => updateNow(id)).catch(err => {
    if (isDenied(err)) {
      if (!isOwner) toast('Only the owner can edit pages');
      else showRulesBanner();
    } else toast('Could not update that page on the server.');
  });
}
function shareRemove(id) {
  return enqueue(() => removeNow(id)).catch(err => {
    if (isDenied(err)) showRulesBanner();
    else toast('Could not delete that page on the server.');
  });
}
function applySnapshot(val) {
  const remote = [];
  if (val && typeof val === 'object') {
    for (const id of Object.keys(val)) {
      const page = fromServer(id, val[id]);
      if (page) remote.push(page);
    }
  }
  const remoteIds = new Set(remote.map(p => p.id));
  for (const id of [...pendingCreates]) if (remoteIds.has(id)) pendingCreates.delete(id);
  for (const id of [...unsynced]) if (remoteIds.has(id)) unsynced.delete(id);
  if (remote.length) {
    const seen = new Set(remoteIds);
    const top = [];
    const waiting = [
      ...pages.filter(p => (pendingCreates.has(p.id) || unsynced.has(p.id)) && !isStock(p)),
      ...heldPages.filter(p => !isStock(p) && !(p.author && p.createdAt))
    ];
    for (const p of waiting) {
      if (!p || seen.has(p.id) || remoteIds.has(p.id)) continue;
      seen.add(p.id);
      top.push(p);
    }
    pages = [...top, ...remote.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))];
    save();
  }
  refreshViews();
  migrateHeld(remoteIds);
}
function migrateHeld(remoteIds) {
  if (!isOwner || migrating || rulesBlocked || !serverLive || quotaStop) return;
  const pushed = loadPushed();
  const pool = [...heldPages, ...pages.filter(p => p && !(p.author && p.createdAt))];
  const seen = new Set();
  const todo = [];
  for (const p of pool) {
    if (!p || !p.id || seen.has(p.id) || remoteIds.has(p.id) || pushed.has(p.id) || isStock(p) || (p.author && p.createdAt)) continue;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)) continue;
    seen.add(p.id);
    todo.push(p);
  }
  if (!todo.length) return;
  migrating = true;
  (async () => {
    for (const p of todo) {
      if (rulesBlocked || quotaStop) break;
      if (!pages.some(x => x.id === p.id)) pages.unshift(clonePage(p));
      try { await shareCreate(p.id); } catch { break; }
    }
    save();
    migrating = false;
    refreshViews();
  })();
}
function listenItems() {
  if (listening || typeof firebase === 'undefined') return;
  listening = true;
  if (itemsRef) itemsRef.off();
  itemsRef = firebase.database().ref('wiki/items');
  itemsRef.on('value', snap => {
    hideRulesBanner();
    serverLive = true;
    applySnapshot(snap.val());
    updateOwnerButton();
  }, err => {
    serverLive = false;
    listening = false;
    if (isDenied(err)) showRulesBanner();
    else refreshViews();
  });
}
function configured() {
  const c = typeof window !== 'undefined' && window.MONDO_BOARD_CONFIG;
  return !!(c && c.apiKey && c.authDomain && c.databaseURL && c.projectId && c.appId);
}
function connectWiki() {
  if (syncStarted || typeof firebase === 'undefined' || !configured()) return;
  syncStarted = true;
  try { if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG); }
  catch { return; }
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      isOwner = false;
      myUid = '';
      updateOwnerButton();
      try { await firebase.auth().signInAnonymously(); } catch { serverLive = false; }
      return;
    }
    myUid = user.uid;
    isOwner = isAdminNow();
    if (!connectWiki.ownerListen) { connectWiki.ownerListen = true; document.addEventListener('mondo-owner', function () { var on = isAdminNow(); if (on === isOwner) return; isOwner = on; updateOwnerButton(); refreshViews(); }); }
    quotaLoaded = false;
    updateOwnerButton();
    listenItems();
    refreshViews();
  });
}
async function signInOwner(email, password) {
  await firebase.auth().signInWithEmailAndPassword(email, password);
}
async function signOutOwner() {
  isOwner = false;
  try { await firebase.auth().signOut(); } catch { /* anonymous sign-in follows */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pages)); }
  catch { toast('Could not save: storage full?'); }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!Array.isArray(data)) {
    const now = new Date().toISOString();
    pages = [{ id: 'welcome', title: 'Welcome', body: WELCOME, tags: ['start'], created: now, updated: now }];
    save();
    return;
  }
  pages = data.filter(p => p && typeof p === 'object' && !Array.isArray(p) && typeof p.id === 'string' && typeof p.title === 'string');
}
function editedLabel(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try { return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return new Date(t).toLocaleString(); }
}
function matches(p) {
  if (tag && !(p.tags || []).includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.title, p.body, ...(p.tags || [])].join('\n').toLowerCase().includes(q);
}
function row(p) {
  const when = editedLabel(p.updated);
  const tags = (p.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('');
  return '<a class="wiki-row" href="#/page/' + esc(p.id) + '"><span class="wiki-row-title">' + esc(p.title) + '</span>' +
    (when ? '<span class="meta">Edited ' + esc(when) + '</span>' : '') +
    (tags ? '<span class="tags">' + tags + '</span>' : '') + '</a>';
}
function pushHistory(page) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  list = list.filter(item => item && item.id !== page.id);
  list.unshift({ id: page.id, title: page.title, t: Date.now() });
  try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 30))); } catch { /* private mode */ }
}
function paintHistory() {
  const box = $('#historyView');
  if (!box) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { list = []; }
  box.replaceChildren();
  if (!Array.isArray(list) || !list.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No pages opened on this computer yet.';
    box.appendChild(empty);
    return;
  }
  list.forEach(item => {
    if (!item || !item.id) return;
    const link = document.createElement('a');
    link.className = 'wiki-row';
    link.href = '#/page/' + encodeURIComponent(item.id);
    const title = document.createElement('span');
    title.className = 'wiki-row-title';
    title.textContent = item.title || 'Untitled';
    link.appendChild(title);
    box.appendChild(link);
  });
}
function applyHlp() {
  document.querySelectorAll('.hlp-tabs [data-mode]').forEach(button => {
    button.setAttribute('aria-selected', button.dataset.mode === hlpMode ? 'true' : 'false');
  });
  const history = $('#historyView');
  const indexOnly = hlpMode === 'index';
  const showingHistory = hlpMode === 'history';
  if (history) history.hidden = !showingHistory;
  if ($('#recent')) $('#recent').hidden = showingHistory || indexOnly;
  if ($('#recentHead') && (showingHistory || indexOnly)) $('#recentHead').hidden = true;
  if ($('#all')) $('#all').hidden = showingHistory;
  if ($('#allHead') && showingHistory) $('#allHead').hidden = true;
  if ($('#tagBar') && showingHistory) $('#tagBar').hidden = true;
  if ($('#empty') && showingHistory) $('#empty').hidden = true;
  if (showingHistory) paintHistory();
}
function setHlp(mode) {
  hlpMode = mode || 'contents';
  if ($('#homeView') && $('#homeView').hidden && location.hash !== '#/' && location.hash !== '' && location.hash !== '#') {
    location.hash = '#/';
  }
  applyHlp();
  if (hlpMode === 'find') {
    const search = $('#search');
    if (search) search.focus();
  }
  if (hlpMode !== 'history') renderHome();
}
function renderHome() {
  if ($('#homeView').hidden) return;
  const filtered = pages.filter(matches);
  const recent = filtered.slice().sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).slice(0, 8);
  const all = filtered.slice().sort((a, b) => a.title.localeCompare(b.title));
  const tags = [...new Set(pages.flatMap(p => p.tags || []))].sort();
  const bar = $('#tagBar');
  bar.hidden = tags.length === 0;
  bar.innerHTML = tags.map(t => '<button type="button" class="tag" data-tag="' + esc(t) + '" aria-pressed="' + (t === tag) + '">#' + esc(t) + '</button>').join('');
  $('#recentHead').hidden = recent.length === 0;
  $('#recent').innerHTML = recent.map(row).join('');
  $('#allHead').hidden = all.length === 0;
  $('#allCount').textContent = all.length ? String(all.length) : '';
  $('#all').innerHTML = all.map(row).join('');
  const empty = $('#empty');
  empty.hidden = all.length !== 0 || hlpMode === 'history';
  empty.textContent = pages.length ? 'No pages match that search.' : (isOwner ? 'No pages yet. Tap New page to start one.' : 'No pages yet.');
  applyHlp();
}
function showHome() {
  editingId = null;
  editHash = '';
  $('#editorView').hidden = true;
  $('#pageView').hidden = true;
  $('#homeView').hidden = false;
  document.body.classList.remove('show-page');
  document.title = 'Mondosupreme Wiki';
  renderHome();
  window.scrollTo(0, 0);
}
function showPage(id, keepScroll) {
  editingId = null;
  editHash = '';
  const p = pages.find(x => x.id === id);
  $('#homeView').hidden = true;
  $('#editorView').hidden = true;
  $('#pageView').hidden = false;
  document.body.classList.add('show-page');
  const el = $('#pageView');
  if (!p) {
    document.title = 'Mondosupreme Wiki';
    el.innerHTML = '<p class="empty">That page is not here. <a href="#/">All pages</a></p>';
    if (!keepScroll) window.scrollTo(0, 0);
    return;
  }
  document.title = p.title + ' · Wiki';
  pushHistory(p);
  const tags = (p.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('');
  const when = editedLabel(p.updated);
  const own = canMutate();
  const links = backlinkPages(pages, p);
  el.innerHTML = '<article class="detail wiki-article"><div class="detail-inner"><div class="dbar no-print">' +
    '<a class="btn ghost" href="#/">← All pages</a>' +
    (own ? '<a class="btn ghost" href="#/edit/' + esc(p.id) + '">Edit</a><button type="button" class="btn ghost" id="btnHistory">History</button>' : '') +
    '<button type="button" class="btn ghost" id="btnPrint">Print</button>' +
    (own ? '<button type="button" class="btn danger" id="btnDelete">Delete</button>' : '') +
    '</div>' +
    (!isOwner ? '<p class="lock-note">This page is read-only. Only an admin can change it.</p>' : '') +
    '<h1>' + esc(p.title) + '</h1>' +
    (when ? '<p class="meta">Edited ' + esc(when) + '</p>' : '') +
    (tags ? '<div class="tags">' + tags + '</div>' : '') +
    '<div id="wikiToc"></div>' +
    '<div class="wiki-body" id="wikiBody"></div>' +
    '<section class="wiki-backlinks"><h2>What links here</h2>' +
    (links.length
      ? links.map(other => '<a href="#/page/' + esc(other.id) + '">' + esc(other.title) + '</a>').join('')
      : '<p class="meta">No pages link here yet.</p>') +
    '</section></div></article>';
  paintMarkdown($('#wikiBody'), p.body, pages, { checkable: own });
  fillToc($('#wikiToc'), headingList(p.body));
  $('#btnPrint').onclick = () => window.print();
  if ($('#btnDelete')) $('#btnDelete').onclick = () => deletePage(p);
  if ($('#btnHistory')) $('#btnHistory').onclick = () => openHistory(p);
  if (!keepScroll) window.scrollTo(0, 0);
}
function fillToc(box, headings) {
  if (!box) return;
  box.replaceChildren();
  if (!headings || headings.length < 2) return;
  const details = document.createElement('details');
  details.className = 'wiki-toc';
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Table of Contents';
  details.appendChild(summary);
  const list = document.createElement('ol');
  headings.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = 'toc-' + h.level;
    const a = document.createElement('a');
    a.href = '#sec-' + (i + 1);
    a.textContent = h.text || 'Section';
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById('sec-' + (i + 1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    li.appendChild(a);
    list.appendChild(li);
  });
  details.appendChild(list);
  box.appendChild(details);
}
function openHistory(page) {
  const box = $('#historyList');
  if (!box) return;
  box.replaceChildren();
  const revs = page.history || [];
  if (!revs.length) {
    const p = document.createElement('p');
    p.textContent = 'No earlier versions yet. The last five saves stay here.';
    box.appendChild(p);
  }
  revs.forEach(rev => {
    const card = document.createElement('article');
    card.className = 'history-card';
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = (editedLabel(rev.t) || 'Earlier') + ' · ' + rev.title;
    card.appendChild(meta);
    const preview = document.createElement('div');
    preview.className = 'wiki-body';
    paintMarkdown(preview, rev.body, pages);
    card.appendChild(preview);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.textContent = 'Restore this version';
    btn.onclick = () => restoreRevision(page.id, rev);
    card.appendChild(btn);
    box.appendChild(card);
  });
  $('#historyDialog').showModal();
}
function restoreRevision(id, rev) {
  if (!canMutate()) { toast('Only the owner can restore a version'); return; }
  const page = pages.find(p => p.id === id);
  if (!page || !rev) return;
  const oldTitle = page.title;
  rememberHistory(page);
  page.title = cleanTitle(rev.title) || page.title;
  page.body = clipBody(rev.body);
  page.tags = clipTags(rev.tags);
  page.updated = new Date().toISOString();
  if (oldTitle !== page.title) {
    pages.forEach(p => { if (p.id !== page.id) p.body = rewriteWikiLinks(p.body, oldTitle, page.title); });
    page.body = rewriteWikiLinks(page.body, oldTitle, page.title);
  }
  save();
  if (serverLive && !rulesBlocked && page.createdAt && page.author && !pendingCreates.has(page.id)) {
    shareUpdate(page.id);
    if (oldTitle !== page.title) {
      pages.forEach(p => { if (p.id !== page.id && p.createdAt && p.author) shareUpdate(p.id); });
    }
  }
  const dlg = $('#historyDialog');
  if (dlg && dlg.open) dlg.close();
  toast('Version restored');
  showPage(page.id);
}
function showEditor(id, prefill) {
  const hash = location.hash;
  if (!$('#editorView').hidden && editHash === hash && ((id && editingId === id) || (!id && !editingId))) return;
  const p = id ? pages.find(x => x.id === id) : null;
  if (id && !p) { location.hash = '#/'; return; }
  if (!canMutate()) {
    toast('Only an admin can change pages');
    location.hash = p ? '#/page/' + p.id : '#/';
    return;
  }
  editingId = p ? p.id : null;
  editHash = hash;
  $('#editorHeading').textContent = p ? 'Edit page' : 'New page';
  $('#title').value = p ? p.title : (prefill || '');
  $('#tags').value = p ? (p.tags || []).join(', ') : '';
  $('#body').value = p ? p.body : '';
  $('#btnDeleteEdit').hidden = !p;
  const templates = $('#templates');
  if (templates) templates.hidden = !!p;
  $('#homeView').hidden = true;
  $('#pageView').hidden = true;
  $('#editorView').hidden = false;
  document.body.classList.remove('show-page');
  document.title = (p ? 'Edit ' + p.title : 'New page') + ' · Mondosupreme Wiki';
  takeSnap();
  setPreview(previewOn);
  window.scrollTo(0, 0);
  if (!p) $('#title').focus();
  else if (!p.body) $('#body').focus();
}
function previewPages() {
  const title = cleanTitle($('#title').value);
  const list = pages.filter(p => p.id !== editingId);
  if (title) list.push({ id: editingId || 'draft', title, body: '', tags: [] });
  return list;
}
function updatePreview() {
  const title = cleanTitle($('#title').value) || 'Untitled';
  $('#previewTitle').textContent = title;
  paintMarkdown($('#previewBody'), $('#body').value, previewPages());
}
function setPreview(on) {
  previewOn = on;
  const btn = $('#btnPreview');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.textContent = on ? 'Hide preview' : 'Preview';
  $('#preview').hidden = !on;
  $('#panes').classList.toggle('is-preview', on);
  if (on) updatePreview();
}
function onSave() {
  const title = cleanTitle($('#title').value);
  if (!title) { toast('Add a title'); return; }
  if (pages.some(p => p.id !== editingId && cleanTitle(p.title).toLowerCase() === title.toLowerCase())) {
    toast('A page with that title already exists');
    return;
  }
  const prev = editingId ? pages.find(p => p.id === editingId) : null;
  if (prev && !canMutate()) { toast('Only the owner can edit pages'); return; }
  const shortened = $('#body').value.length > LIMITS.body;
  let body = clipBody($('#body').value);
  const tags = clipTags($('#tags').value);
  const now = new Date().toISOString();
  const renamed = [];
  if (prev && prev.title !== title) {
    pages.forEach(p => {
      if (p.id === prev.id) return;
      const next = rewriteWikiLinks(p.body, prev.title, title);
      if (next !== p.body) { p.body = next; renamed.push(p.id); }
    });
    body = rewriteWikiLinks(body, prev.title, title);
  }
  let id = editingId;
  if (prev) {
    rememberHistory(prev);
    prev.title = title;
    prev.body = body;
    prev.tags = tags;
    prev.updated = now;
  } else {
    id = freshId(new Set(pages.map(p => p.id)));
    pages.unshift({ id, title, body, tags, created: now, updated: now, author: '', createdAt: 0, history: [] });
  }
  save();
  if (serverLive && !rulesBlocked) {
    if (prev && prev.createdAt && prev.author && !pendingCreates.has(id)) {
      shareUpdate(id);
      renamed.forEach(other => {
        const page = pages.find(p => p.id === other);
        if (page && page.createdAt && page.author) shareUpdate(other);
      });
    } else shareCreate(id);
  } else if (!prev) unsynced.add(id);
  toast(shortened ? 'Page saved, and the extra text was cut to fit.' : 'Page saved');
  skipDirty = true;
  const dest = '#/page/' + id;
  if (location.hash === dest) route();
  else location.hash = dest;
}
function deletePage(p) {
  if (!p) return;
  if (!canMutate()) { toast('Only the owner can delete pages'); return; }
  if (!confirm('Delete "' + p.title + '"?')) return;
  const onServer = !!(p.createdAt && p.author && !pendingCreates.has(p.id));
  pages = pages.filter(x => x.id !== p.id);
  pendingCreates.delete(p.id);
  unsynced.delete(p.id);
  save();
  if (onServer) shareRemove(p.id);
  toast('Page deleted');
  skipDirty = true;
  if (location.hash === '#/' || location.hash === '' || location.hash === '#') route();
  else location.hash = '#/';
}
function cancelEdit() {
  skipDirty = true;
  if (editingId && pages.some(p => p.id === editingId)) location.hash = '#/page/' + editingId;
  else if (location.hash === '#/' || location.hash === '' || location.hash === '#') route();
  else location.hash = '#/';
}
function createFromTitle(encoded) {
  let title = '';
  try { title = decodeURIComponent(encoded); } catch { title = ''; }
  title = cleanTitle(title);
  if (!title) { location.hash = '#/'; return; }
  const existing = findPage(pages, title);
  if (existing) { location.hash = '#/page/' + existing.id; return; }
  showEditor(null, title);
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ site: 'Mondosupreme.com', version: 1, exported: new Date().toISOString(), pages }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mondosupreme-wiki-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exported');
}
function importJSON(file) {
  if (!isOwner) { toast('Only an admin can import pages'); return; }
  const rd = new FileReader();
  rd.onload = () => {
    let parsed;
    try { parsed = parseWikiBackup(JSON.parse(rd.result)); } catch { parsed = null; }
    if (!parsed) { alert("That file isn't a valid wiki backup."); return; }
    const clean = parsed.pages.map(clonePage);
    const replace = confirm('Import ' + clean.length + ' page(s).\nOK = replace all current pages\nCancel = merge with existing');
    if (!serverLive || rulesBlocked) {
      if (replace) pages = clean;
      else pages = disambiguate([...new Map([...pages, ...clean].map(p => [p.id, p])).values()]);
    } else if (!isOwner) {
      if (replace) toast('Only the owner can replace or delete pages. New ones will be added.');
      const existing = new Set(pages.map(p => p.id));
      clean.forEach(p => {
        if (existing.has(p.id) || pages.some(x => cleanTitle(x.title).toLowerCase() === cleanTitle(p.title).toLowerCase())) p.id = freshId(new Set(pages.map(x => x.id)));
        p.author = '';
        p.createdAt = 0;
        pages.unshift(p);
        shareCreate(p.id);
      });
    } else if (replace) {
      const keep = new Set(clean.map(p => p.id));
      const existing = new Map(pages.map(p => [p.id, p]));
      pages.forEach(p => { if (!keep.has(p.id) && p.createdAt && p.author) shareRemove(p.id); });
      pages = clean.map(p => {
        const prev = existing.get(p.id);
        if (prev && prev.author && prev.createdAt) return { ...p, author: prev.author, createdAt: prev.createdAt, history: p.history || prev.history || [] };
        return { ...p, author: '', createdAt: 0 };
      });
      pages.forEach(p => { if (p.createdAt && p.author) shareUpdate(p.id); else shareCreate(p.id); });
    } else {
      const existing = new Map(pages.map(p => [p.id, p]));
      clean.forEach(p => {
        const prev = existing.get(p.id);
        if (prev && prev.author && prev.createdAt) {
          const merged = { ...prev, ...p, author: prev.author, createdAt: prev.createdAt };
          const i = pages.findIndex(x => x.id === p.id);
          if (i >= 0) pages[i] = merged;
          shareUpdate(p.id);
        } else {
          if (prev || pages.some(x => cleanTitle(x.title).toLowerCase() === cleanTitle(p.title).toLowerCase())) p.id = freshId(new Set(pages.map(x => x.id)));
          p.author = '';
          p.createdAt = 0;
          pages.unshift(p);
          shareCreate(p.id);
        }
      });
    }
    save();
    toast('Imported ' + clean.length + ' page(s)');
    skipDirty = true;
    if (location.hash === '#/' || location.hash === '' || location.hash === '#') route();
    else location.hash = '#/';
  };
  rd.onerror = () => alert("That file isn't a valid wiki backup.");
  rd.readAsText(file);
}
function route() {
  const hash = location.hash || '';
  const editorOpen = $('#editorView') && !$('#editorView').hidden;
  if (editorOpen && !skipDirty && isDirty() && hash !== editHash) {
    if (!confirm('Leave without saving this page?')) {
      skipDirty = true;
      location.hash = editHash;
      return;
    }
  }
  skipDirty = false;
  if (hash === '' || hash === '#' || hash === '#/') { showHome(); return; }
  let m = hash.match(/^#\/page\/([A-Za-z0-9_-]+)$/);
  if (m) { showPage(m[1]); return; }
  m = hash.match(/^#\/edit\/([A-Za-z0-9_-]+)$/);
  if (m) { showEditor(m[1]); return; }
  if (hash === '#/new') { showEditor(null); return; }
  m = hash.match(/^#\/new\/(.+)$/);
  if (m) { createFromTitle(m[1]); return; }
  showHome();
}
const TEMPLATES = {
  blank: '',
  howto: '# What this is\n\nA short description of the job.\n\n## What you need\n\n- One thing\n\n## Steps\n\n1. First step\n2. Next step\n\n## If it goes wrong\n\nWhat to check.\n',
  pack: '# Packing list\n\n- [ ] Passport\n- [ ] Medicine\n- [ ] Charger\n\n## Already packed\n\n- [x] Tickets\n',
  cruise: '# Trip\n\n**Ship:** \n**Dates:** \n**Port:** \n\n## Plan\n\n- [ ] Boarding documents\n- [ ] \n\n## Notes\n\nWhat we want to remember.\n'
};
function wrapSel(before, after, placeholder) {
  const el = $('#body');
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const selected = el.value.slice(start, end) || placeholder;
  el.setRangeText(before + selected + after, start, end, 'select');
  const from = start + before.length;
  el.setSelectionRange(from, from + selected.length);
  el.focus();
  if (previewOn) updatePreview();
}
function insertLine(prefix) {
  const el = $('#body');
  const start = el.selectionStart || 0;
  const needBreak = start > 0 && el.value[start - 1] !== '\n';
  el.setRangeText((needBreak ? '\n' : '') + prefix, start, start, 'end');
  el.focus();
  if (previewOn) updatePreview();
}
function insertFmt(kind) {
  const el = $('#body');
  if (!el) return;
  if (kind === 'h1' || kind === 'h2') {
    const start = el.selectionStart || 0;
    const lineStart = el.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const prefix = kind === 'h1' ? '# ' : '## ';
    if (!el.value.slice(lineStart).startsWith(prefix)) el.setRangeText(prefix, lineStart, lineStart, 'end');
    el.focus();
    if (previewOn) updatePreview();
    return;
  }
  if (kind === 'bold') wrapSel('**', '**', 'bold');
  else if (kind === 'italic') wrapSel('*', '*', 'italic');
  else if (kind === 'link') wrapSel('[[', ']]', 'Page Name');
  else if (kind === 'task') insertLine('- [ ] ');
  else if (kind === 'bullet') insertLine('- ');
  else if (kind === 'code') {
    const selected = el.value.slice(el.selectionStart || 0, el.selectionEnd || 0);
    if (selected.indexOf('\n') >= 0) wrapSel('```\n', '\n```', selected);
    else wrapSel('`', '`', 'code');
  } else if (kind === 'photo') {
    $('#photoUrl').value = '';
    $('#photoDialog').showModal();
  }
}
function applyTemplate(kind) {
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, kind)) return;
  const next = TEMPLATES[kind];
  if ($('#body').value.trim() && !confirm('Replace the page text with this starter?')) return;
  $('#body').value = next;
  if (previewOn) updatePreview();
  $('#body').focus();
}
function insertImage(url) {
  const safe = safeImage(url);
  if (!safe) { toast('Use an https image link or a JPEG photo'); return; }
  const el = $('#body');
  const start = el.selectionStart || 0;
  const chunk = (start > 0 && el.value[start - 1] !== '\n' ? '\n' : '') + '![](' + safe + ')\n';
  if (el.value.length + chunk.length > LIMITS.body) { toast('That photo is too big for this page'); return; }
  el.setRangeText(chunk, start, el.selectionEnd || start, 'end');
  el.focus();
  if (previewOn) updatePreview();
}
function shrinkJpeg(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sw = img.naturalWidth || img.width || 1;
      const sh = img.naturalHeight || img.height || 1;
      let maxEdge = 1000;
      let quality = 0.7;
      let data = '';
      for (let attempt = 0; attempt < 8; attempt++) {
        const scale = Math.min(1, maxEdge / Math.max(sw, sh));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw * scale));
        c.height = Math.max(1, Math.round(sh * scale));
        const ctx = c.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try { data = c.toDataURL('image/jpeg', quality); } catch { data = ''; }
        if (data && data.length <= 70000 && safeImage(data)) { resolve(data); return; }
        if (quality > 0.45) quality = Math.round((quality - 0.1) * 100) / 100;
        else maxEdge = Math.round(maxEdge * 0.75);
        if (maxEdge < 280) break;
      }
      resolve('');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}
function init() {
  load();
  heldPages = pages.filter(p => !isStock(p)).map(clonePage);
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  $('#btnNew').onclick = () => { location.hash = '#/new'; };
  $('#btnExport').onclick = exportJSON;
  $('#importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  $('#search').addEventListener('input', e => { query = e.target.value; if (hlpMode === 'history') hlpMode = 'find'; renderHome(); });
  document.querySelectorAll('.hlp-tabs [data-mode]').forEach(button => {
    button.addEventListener('click', () => setHlp(button.dataset.mode));
  });
  $('#tagBar').addEventListener('click', e => {
    const button = e.target.closest('[data-tag]');
    if (!button) return;
    tag = tag === button.dataset.tag ? '' : button.dataset.tag;
    renderHome();
  });
  $('#btnPreview').onclick = () => setPreview(!previewOn);
  $('#body').addEventListener('input', () => { if (previewOn) updatePreview(); });
  $('#title').addEventListener('input', () => { if (previewOn) updatePreview(); });
  $('#title').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  $('#tags').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  $('#pageForm').addEventListener('submit', e => { e.preventDefault(); onSave(); });
  $('#btnCancel').onclick = cancelEdit;
  $('#btnDeleteEdit').onclick = () => deletePage(pages.find(p => p.id === editingId));
  document.querySelectorAll('[data-fmt]').forEach(btn => {
    btn.addEventListener('click', () => insertFmt(btn.dataset.fmt));
  });
  document.querySelectorAll('[data-tmpl]').forEach(btn => {
    btn.addEventListener('click', () => applyTemplate(btn.dataset.tmpl));
  });
  $('#photoCancel').onclick = () => $('#photoDialog').close();
  $('#photoForm').addEventListener('submit', e => {
    e.preventDefault();
    const url = $('#photoUrl').value.trim();
    if (!safeImage(url)) { toast('Use an https image link'); return; }
    insertImage(url);
    $('#photoDialog').close();
  });
  $('#photoFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const data = await shrinkJpeg(file);
    if (!data) { toast('Could not use that photo. Try a smaller JPEG.'); return; }
    insertImage(data);
    $('#photoDialog').close();
  });
  $('#historyClose').onclick = () => $('#historyDialog').close();
  $('#pageView').addEventListener('change', e => {
    const box = e.target;
    if (!box.matches || !box.matches('input[type=checkbox]')) return;
    if (!canMutate()) { box.checked = !box.checked; return; }
    const m = (location.hash || '').match(/^#\/page\/([A-Za-z0-9_-]+)$/);
    const page = m && pages.find(p => p.id === m[1]);
    if (!page) return;
    const boxes = [...$('#wikiBody').querySelectorAll('li.task input')];
    const next = toggleTask(page.body, boxes.indexOf(box));
    if (next === page.body) return;
    rememberHistory(page);
    page.body = next;
    page.updated = new Date().toISOString();
    save();
    if (serverLive && !rulesBlocked && page.createdAt && page.author && !pendingCreates.has(page.id)) shareUpdate(page.id);
    showPage(page.id, true);
  });
  const ownerBtn = $('#ownerBtn');
  if (ownerBtn) ownerBtn.onclick = () => {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) { toast('Shared sign-in is not available yet'); return; }
    const user = firebase.auth().currentUser;
    if (isAdminNow()) { signOutOwner(); return; }
    $('#ownerError').hidden = true;
    $('#ownerPass').value = '';
        $('#ownerDialog').showModal();
  };
  $('#ownerCancel').onclick = () => $('#ownerDialog').close();
  $('#ownerForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#ownerError').hidden = true;
    try {
      await signInOwner($('#ownerEmail').value.trim(), $('#ownerPass').value);
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
  window.addEventListener('hashchange', route);
  route();
  connectWiki();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderMarkdown, parseWikiBackup, rewriteWikiLinks, safeHref, safeImage, cleanTitle, toggleTask, headingList, backlinkPages, pageLinkNames };
}
})();
