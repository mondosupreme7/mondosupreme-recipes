(() => {
'use strict';
const KEY = 'mondosupreme.wiki.v1';
const LIMITS = { title: 200, body: 100000, tag: 40, tags: 30, id: 64, pages: 500 };
const WELCOME = [
  'Pages in this wiki stay in this browser on this device. Use **Export** to back up or move them, and **Import** to bring a backup back.',
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
  'Write [[Kitchen notes]] to link a page by its title. A custom label looks like [[Kitchen notes|the kitchen]]. Tap a link that does not exist yet and the page is created so you can fill it in.',
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
  '## Saved on this device',
  '',
  'Clearing browser data, or opening Mondosupreme on another phone, will not have the pages you wrote here. Export a JSON file first if you want to keep them.'
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
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (!url.hostname || url.username || url.password) return '';
    return url.href;
  }
  if (url.protocol === 'mailto:') {
    if (!/^[^@\s]+@[^@\s]+$/.test(url.pathname)) return '';
    return url.href;
  }
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
        const href = safeHref(link.url);
        html += href.startsWith('https://')
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
      html += '<h' + level + '>' + renderInline(heading[2].trim(), ctx) + '</h' + level + '>';
      i += 1;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { html += '<hr>'; i += 1; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      html += '<blockquote>' + renderBlocks(buf, ctx) + '</blockquote>';
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
        const task = item.match(/^\[([ xX])\]\s+(\S.*)$/);
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
        const src = safeHref(child.getAttribute('src') || '');
        if (!src.startsWith('https://')) return;
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
      parent.appendChild(el);
      if (tag !== 'BR' && tag !== 'HR') copy(child, el);
    });
  }
  copy(wrap, out);
  return out;
}
function paintMarkdown(el, md, list) {
  if (!el) return;
  const tree = sanitizedTree(renderMarkdown(md, list));
  el.replaceChildren();
  [...tree.childNodes].forEach(node => el.appendChild(document.importNode(node, true)));
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
  return {
    id, title,
    body: clipBody(raw.body),
    tags: clipTags(raw.tags),
    created,
    updated: clipDate(raw.updated) || created
  };
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
  empty.hidden = all.length !== 0;
  empty.textContent = pages.length ? 'No pages match that search.' : 'No pages yet. Tap New page to start one.';
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
function showPage(id) {
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
    el.innerHTML = '<p class="empty">That page is not on this device. <a href="#/">All pages</a></p>';
    window.scrollTo(0, 0);
    return;
  }
  document.title = p.title + ' · Mondosupreme Wiki';
  const tags = (p.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('');
  const when = editedLabel(p.updated);
  el.innerHTML = '<article class="detail wiki-article"><div class="detail-inner"><div class="dbar no-print">' +
    '<a class="btn ghost" href="#/">← All pages</a><a class="btn ghost" href="#/edit/' + esc(p.id) + '">Edit</a>' +
    '<button type="button" class="btn ghost" id="btnPrint">Print</button>' +
    '<button type="button" class="btn danger" id="btnDelete">Delete</button></div>' +
    '<h1>' + esc(p.title) + '</h1>' +
    (when ? '<p class="meta">Edited ' + esc(when) + '</p>' : '') +
    (tags ? '<div class="tags">' + tags + '</div>' : '') +
    '<div class="wiki-body" id="wikiBody"></div></div></article>';
  paintMarkdown($('#wikiBody'), p.body, pages);
  $('#btnPrint').onclick = () => window.print();
  $('#btnDelete').onclick = () => deletePage(p);
  window.scrollTo(0, 0);
}
function showEditor(id) {
  const hash = location.hash;
  if (!$('#editorView').hidden && editHash === hash && ((id && editingId === id) || (!id && !editingId))) return;
  const p = id ? pages.find(x => x.id === id) : null;
  if (id && !p) { location.hash = '#/'; return; }
  editingId = p ? p.id : null;
  editHash = hash;
  $('#editorHeading').textContent = p ? 'Edit page' : 'New page';
  $('#title').value = p ? p.title : '';
  $('#tags').value = p ? (p.tags || []).join(', ') : '';
  $('#body').value = p ? p.body : '';
  $('#btnDeleteEdit').hidden = !p;
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
  const shortened = $('#body').value.length > LIMITS.body;
  let body = clipBody($('#body').value);
  const tags = clipTags($('#tags').value);
  const now = new Date().toISOString();
  const prev = editingId ? pages.find(p => p.id === editingId) : null;
  if (prev && prev.title !== title) {
    pages.forEach(p => { if (p.id !== prev.id) p.body = rewriteWikiLinks(p.body, prev.title, title); });
    body = rewriteWikiLinks(body, prev.title, title);
  }
  let id = editingId;
  if (prev) {
    prev.title = title;
    prev.body = body;
    prev.tags = tags;
    prev.updated = now;
  } else {
    id = freshId(new Set(pages.map(p => p.id)));
    pages.unshift({ id, title, body, tags, created: now, updated: now });
  }
  save();
  toast(shortened ? 'Page saved, and the extra text was cut to fit.' : 'Page saved');
  skipDirty = true;
  const dest = '#/page/' + id;
  if (location.hash === dest) route();
  else location.hash = dest;
}
function deletePage(p) {
  if (!p) return;
  if (!confirm('Delete "' + p.title + '"?')) return;
  pages = pages.filter(x => x.id !== p.id);
  save();
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
  const now = new Date().toISOString();
  const id = freshId(new Set(pages.map(p => p.id)));
  pages.unshift({ id, title, body: '', tags: [], created: now, updated: now });
  save();
  toast('Page created');
  location.hash = '#/edit/' + id;
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
  const rd = new FileReader();
  rd.onload = () => {
    let parsed;
    try { parsed = parseWikiBackup(JSON.parse(rd.result)); } catch { parsed = null; }
    if (!parsed) { alert("That file isn't a valid wiki backup."); return; }
    const clean = parsed.pages;
    const replace = confirm('Import ' + clean.length + ' page(s).\nOK = replace all current pages\nCancel = merge with existing');
    if (replace) pages = clean;
    else pages = disambiguate([...new Map([...pages, ...clean].map(p => [p.id, p])).values()]);
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
function init() {
  load();
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  $('#btnNew').onclick = () => { location.hash = '#/new'; };
  $('#btnExport').onclick = exportJSON;
  $('#importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  $('#search').addEventListener('input', e => { query = e.target.value; renderHome(); });
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
  window.addEventListener('hashchange', route);
  route();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderMarkdown, parseWikiBackup, rewriteWikiLinks, safeHref, cleanTitle };
}
})();
