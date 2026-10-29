import fs from 'fs';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE || '/tmp/pwcheck/package.json');
const { chromium } = require('playwright-core');

const pages = [
  ['home', '/'],
  ['recipes', '/recipes/'],
  ['daily-recipe', '/daily-recipe/'],
  ['planner', '/planner/'],
  ['cruises', '/cruises/'],
  ['weather', '/weather/'],
  ['launches', '/launches/'],
  ['tides', '/tides/'],
  ['tropics', '/tropics/'],
  ['local', '/local/'],
  ['grocery', '/grocery/'],
  ['wiki', '/wiki/'],
  ['forum', '/forum/'],
  ['board', '/board/'],
  ['rules', '/board/rules.html'],
  ['chat', '/chat/'],
  ['market', '/market/'],
  ['stocks', '/stocks/'],
  ['8ball', '/8ball/'],
  ['wordle', '/wordle/'],
  ['crossword', '/crossword/'],
  ['connections', '/connections/'],
  ['search', '/search/'],
  ['radio', '/radio/'],
  ['arcade', '/arcade/'],
  ['pet', '/pet/'],
  ['mmo', '/mmo/'],
  ['fps', '/fps/'],
  ['escape', '/escape/'],
  ['privacy', '/privacy/']
];

function lin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function lum(rgb) {
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function contrast(a, b) {
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const auditJs = `(() => {
  function parse(c) {
    if (!c) return null;
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function lin(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function lum(rgb) {
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  }
  function contrast(a, b) {
    const hi = Math.max(lum(a), lum(b));
    const lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05);
  }
  function bgOf(el) {
    let bg = { r: 11, g: 18, b: 32, a: 1 };
    const chain = [];
    let node = el;
    while (node) { chain.push(node); node = node.parentElement; }
    chain.reverse();
    for (const n of chain) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a <= 0) continue;
      bg = c.a >= 0.99 ? c : over(c, bg);
    }
    return bg;
  }
  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) return node.textContent.trim().slice(0, 60);
    }
    return '';
  }
  const fails = [];
  const seen = new Set();
  const nodes = document.querySelectorAll('body *');
  nodes.forEach((el) => {
    if (!visible(el)) return;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'PATH' || tag === 'CANVAS') return;
    let sample = hasDirectText(el);
    const isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!sample && !isField) return;
    if (isField && !sample) sample = el.getAttribute('placeholder') || el.getAttribute('aria-label') || tag;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg || fg.a < 0.2) return;
    const bg = bgOf(el);
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    if (ratio >= 4.5) return;
    const key = tag + '|' + Math.round(fg.r) + ',' + Math.round(fg.g) + ',' + Math.round(fg.b) + '|' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + '|' + (el.className && el.className.toString ? el.className.toString().slice(0, 60) : '');
    if (seen.has(key)) return;
    seen.add(key);
    fails.push({
      tag,
      cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 70),
      fg: s.color,
      bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
      ratio,
      sample
    });
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
    if (!visible(el)) return;
    const ph = getComputedStyle(el, '::placeholder').color;
    const fg = parse(ph);
    if (!fg) return;
    const bg = bgOf(el);
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    if (ratio >= 4.5) return;
    fails.push({ tag: 'PLACEHOLDER', cls: (el.id || el.className || '').toString().slice(0, 70), fg: ph, bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')', ratio, sample: el.getAttribute('placeholder').slice(0, 40) });
  });
  return fails;
})()`;

const base = process.env.AUDIT_BASE || 'http://127.0.0.1:8788';
const outPath = process.env.AUDIT_OUT || '/tmp/contrast-audit.json';

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const report = { failures: 0, byPage: {} };
for (const theme of ['dark', 'harbor']) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript((name) => {
    try { localStorage.setItem('mondosupreme.theme.v2', name); } catch (e) {}
  }, theme);
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const [name, path] of pages) {
    const key = theme + ' ' + name;
    try {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(400);
      const fails = await page.evaluate(auditJs);
      report.byPage[key] = fails;
      report.failures += fails.length;
    } catch (error) {
      report.byPage[key] = [{ tag: 'LOAD', cls: '', fg: '', bg: '', ratio: 0, sample: String(error).slice(0, 140) }];
      report.failures += 1;
    }
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
const lines = Object.entries(report.byPage).map(([k, v]) => k + ' ' + v.length).join('\n');
console.log('TOTAL ' + report.failures);
console.log(lines);
