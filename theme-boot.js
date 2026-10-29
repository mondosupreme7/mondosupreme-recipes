(function () {
  if (window.top !== window.self) {
    try { window.top.location.replace(window.location.href); }
    catch (e1) {
      try { window.location.replace('about:blank'); } catch (e2) {}
    }
  }
  var KEY = 'mondosupreme.theme.v2';
  var named = { light: 1, dark: 1, harbor: 1, warm: 1, retro: 1 };
  var mode = 'system';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'system' || named[saved]) mode = saved;
  } catch (e) {}
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = mode === 'system' ? (dark ? 'dark' : 'light') : mode;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-theme-mode', mode);
})();
