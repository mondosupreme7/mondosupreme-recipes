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
  var HITS = 'mondosupreme.hits.v1';
  var BASE = 8421;
  var ON = '#ff3333';
  var OFF = '#4a0000';
  var SEGS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'
  };
  function digit(ch) {
    var on = SEGS[ch] || '';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 22 40');
    svg.setAttribute('aria-hidden', 'true');
    var parts = [
      ['a', '3', '2', '16', '5'],
      ['b', '16', '6', '4', '13'],
      ['c', '16', '21', '4', '13'],
      ['d', '3', '33', '16', '5'],
      ['e', '2', '21', '4', '13'],
      ['f', '2', '6', '4', '13'],
      ['g', '3', '17.5', '16', '5']
    ];
    parts.forEach(function (p) {
      var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', p[1]);
      r.setAttribute('y', p[2]);
      r.setAttribute('width', p[3]);
      r.setAttribute('height', p[4]);
      r.setAttribute('fill', on.indexOf(p[0]) >= 0 ? ON : OFF);
      svg.appendChild(r);
    });
    return svg;
  }
  function paintCounter(n) {
    var box = document.getElementById('counter');
    if (!box) return;
    var text = String(n);
    if (text.length < 6) text = ('000000' + text).slice(-6);
    box.setAttribute('aria-label', text + ' visits counted in this browser');
    box.replaceChildren();
    for (var i = 0; i < text.length; i++) box.appendChild(digit(text.charAt(i)));
  }
  document.addEventListener('DOMContentLoaded', function () {
    var year = document.getElementById('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    var seen = 0;
    try { seen = parseInt(localStorage.getItem(HITS) || '0', 10) || 0; } catch (e) { seen = 0; }
    seen += 1;
    try { localStorage.setItem(HITS, String(seen)); } catch (e) {}
    paintCounter(BASE + seen);
    var ring = ['/recipes/', '/cruises/', '/wiki/', '/board/', '/chat/', '/escape/'];
    var rand = document.getElementById('ringRand');
    if (rand) rand.href = ring[Math.floor(Math.random() * ring.length)];
  });
})();
