(function () {
  var KEY = 'mondosupreme.theme.v2';
  var NAMED = { light: 'Light', dark: 'Dark', harbor: 'Harbor', warm: 'Warm', retro: 'Retro' };

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function readMode() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'system' || NAMED[saved]) return saved;
    } catch (e) {}
    return 'system';
  }
  function writeMode(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
  }
  function resolve(mode) {
    return mode === 'system' ? systemTheme() : mode;
  }
  function apply(mode) {
    var theme = resolve(mode);
    var colors = { light: '#f4f3ef', dark: '#0b1220', harbor: '#0c1a1d', warm: '#f6f1e7', retro: '#008080' };
    var color = colors[theme] || colors.light;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.style.colorScheme = (theme === 'dark' || theme === 'harbor') ? 'dark' : 'light';
    document.documentElement.dataset.themeColor = color;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (node) {
      node.parentNode.removeChild(node);
    });
    var meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', color);
    document.head.appendChild(meta);
    var select = document.getElementById('themeSelect');
    if (select && select.value !== mode) select.value = mode;
  }
  function ensureSelect() {
    if (document.getElementById('themeSelect')) return;
    var label = document.createElement('label');
    label.className = 'theme-switch';
    var name = document.createElement('span');
    name.textContent = 'Theme';
    label.appendChild(name);
    var select = document.createElement('select');
    select.id = 'themeSelect';
    select.setAttribute('aria-label', 'Color theme');
    var system = document.createElement('option');
    system.value = 'system';
    system.textContent = 'System';
    select.appendChild(system);
    Object.keys(NAMED).forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = NAMED[id];
      select.appendChild(opt);
    });
    select.value = readMode();
    select.addEventListener('change', function () {
      writeMode(select.value);
      apply(select.value);
    });
    label.appendChild(select);
    var host = document.getElementById('shellMenu') || document.body;
    host.appendChild(label);
  }

  apply(readMode());
  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
      if (readMode() === 'system') apply('system');
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
  window.MONDO_THEME = { activeId: function () { return document.documentElement.getAttribute('data-theme'); }, mode: readMode };
  window.MONDO_THEME_MOUNT = function () {
    ensureSelect();
    apply(readMode());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureSelect);
  else ensureSelect();
})();
