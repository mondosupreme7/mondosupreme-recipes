(function () {
  function forward() {
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    if (search.length > 1 || hash.length > 1) {
      window.location.replace('/recipes/' + search + hash);
      return true;
    }
    return false;
  }
  if (forward()) return;
  window.addEventListener('hashchange', forward);
  document.addEventListener('DOMContentLoaded', function () {
    var year = document.getElementById('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  });
})();
