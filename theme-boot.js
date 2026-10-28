(function () {
  var KEY = 'mondosupreme.theme.v2';
  var named = { light: 1, dark: 1, harbor: 1, warm: 1 };
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
