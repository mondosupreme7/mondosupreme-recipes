/* Seasonal GeoCities skins. Auto follows the visitor's local calendar.
   A manual pick is stored in mondosupreme.theme.v1. Melodies are original. */
(function () {
  var KEY = 'mondosupreme.theme.v1';
  var MONSTER = {
    name: 'monster_midi.mid',
    tempo: 76,
    wave: 'sawtooth',
    notes: [48, 51, 55, 51, 48, 46, 43, 0, 46, 48, 51, 55, 58, 55, 51, 48, 43, 41, 43, 48]
  };
  var JINGLE = {
    name: 'jingle98.mid',
    tempo: 118,
    wave: 'triangle',
    notes: [76, 79, 84, 79, 76, 72, 67, 72, 76, 79, 84, 88, 84, 79, 76, 72, 79, 76]
  };
  var THEMES = {
    halloween: { label: "Halloween", marquee: "~*~ HAPPY HALLOWEEN FROM MONDOSUPREME'S CYBER REALM ~*~", track: MONSTER },
    thanksgiving: { label: "Thanksgiving", marquee: "~*~ HAPPY THANKSGIVING FROM THE CYBER REALM ~*~" },
    christmas: { label: "Christmas", marquee: "~*~ HAPPY HOLIDAYS FROM MONDOSUPREME'S CYBER REALM ~*~", track: JINGLE },
    y2k: { label: 'Y2K Party', marquee: "~*~ Y2K COUNTDOWN — PARTY LIKE IT'S 1999 ~*~" },
    valentine: { label: "Valentine's", marquee: "~*~ BE MINE, CYBER REALM ~*~" },
    patrick: { label: "St. Patrick's", marquee: "~*~ TOP O' THE CYBER REALM ~*~" },
    july4: { label: "4th of July", marquee: "~*~ STARS AND STRIPES ON THE CYBER REALM ~*~" },
    spring: { label: 'Spring', marquee: "~*~ SPRING NEON ON THE CYBER REALM ~*~" },
    summer: { label: 'Summer Cruise', marquee: "~*~ SUMMER CRUISE ON THE CYBER REALM ~*~" },
    earlyautumn: { label: 'Early Autumn', marquee: "~*~ EARLY AUTUMN ON THE CYBER REALM ~*~" },
    winter: { label: 'Winter Ice', marquee: "~*~ WINTER ICE ON THE CYBER REALM ~*~" },
    classic: { label: "Classic GeoCities", marquee: "~*~ MONDOSUPREME'S CYBER REALM ~*~" }
  };
  var ORDER = ['halloween', 'thanksgiving', 'christmas', 'y2k', 'valentine', 'patrick', 'july4', 'spring', 'summer', 'earlyautumn', 'winter', 'classic'];

  function calendarTheme(date) {
    var d = date || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    if (m === 10) return 'halloween';
    if (m === 11) return 'thanksgiving';
    if (m === 12 && day === 31) return 'y2k';
    if (m === 12) return 'christmas';
    if (m === 1 && day <= 7) return 'y2k';
    if (m === 2 && day >= 10 && day <= 16) return 'valentine';
    if (m === 3 && day >= 14 && day <= 18) return 'patrick';
    if (m === 7 && day >= 1 && day <= 7) return 'july4';
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m === 9) return 'earlyautumn';
    return 'winter';
  }

  function readPref() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { mode: 'auto' };
      var data = JSON.parse(raw);
      if (data && data.mode === 'lock' && THEMES[data.id]) return { mode: 'lock', id: data.id };
      return { mode: 'auto' };
    } catch (e) {
      return { mode: 'auto' };
    }
  }

  function writePref(pref) {
    try {
      if (!pref || pref.mode !== 'lock') localStorage.setItem(KEY, JSON.stringify({ mode: 'auto' }));
      else localStorage.setItem(KEY, JSON.stringify({ mode: 'lock', id: pref.id }));
    } catch (e) { /* private mode */ }
  }

  function activeId() {
    var pref = readPref();
    if (pref.mode === 'lock') return pref.id;
    return calendarTheme();
  }

  function sprite(cls) {
    var s = document.createElement('span');
    s.className = cls;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function many(parent, cls, count) {
    if (!parent) return;
    for (var i = 0; i < count; i++) parent.appendChild(sprite(cls));
  }

  function paintSprites(id) {
    document.querySelectorAll('.theme-sprites').forEach(clear);
    var sky = document.querySelector('.theme-sky');
    clear(sky);
    var lights = document.querySelector('.xmas-lights');
    if (lights && lights.parentNode) lights.parentNode.removeChild(lights);
    var banner = document.querySelector('.y2k-banner');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    if (id === 'classic') return;
    var left = document.querySelector('.theme-sprites-l');
    var right = document.querySelector('.theme-sprites-r');
    var row = document.querySelector('.wordart-row');
    if (id === 'halloween') {
      if (left) { left.appendChild(sprite('px-pumpkin')); left.appendChild(sprite('px-bat')); }
      if (right) { right.appendChild(sprite('px-bat px-bat-b')); right.appendChild(sprite('px-pumpkin')); }
      many(sky, 'px-bat-fly', 2);
    } else if (id === 'thanksgiving') {
      if (left) { left.appendChild(sprite('px-leaf')); left.appendChild(sprite('px-leaf px-leaf-b')); }
      if (right) right.appendChild(sprite('px-turkey'));
      many(sky, 'px-fall px-leaf', 8);
    } else if (id === 'christmas') {
      if (left) left.appendChild(sprite('px-snow'));
      if (right) right.appendChild(sprite('px-snow'));
      many(sky, 'px-snow-fall', 12);
      if (row && row.parentNode) {
        var bar = document.createElement('div');
        bar.className = 'xmas-lights';
        bar.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 20; i++) bar.appendChild(document.createElement('i'));
        row.parentNode.insertBefore(bar, row);
      }
    } else if (id === 'y2k') {
      many(sky, 'px-fw', 6);
      if (row && row.parentNode) {
        var y = document.createElement('div');
        y.className = 'y2k-banner';
        var span = document.createElement('span');
        span.textContent = "~*~ Y2K COUNTDOWN — PARTY LIKE IT'S 1999 ~*~   GOLD · CYAN · MAGENTA   ";
        y.appendChild(span);
        row.parentNode.insertBefore(y, row);
      }
    } else if (id === 'valentine') {
      if (left) left.appendChild(sprite('px-heart'));
      if (right) right.appendChild(sprite('px-heart px-heart-b'));
      many(sky, 'px-fall px-heart', 7);
    } else if (id === 'patrick') {
      if (left) left.appendChild(sprite('px-clover'));
      if (right) right.appendChild(sprite('px-clover'));
      many(sky, 'px-fall px-clover', 7);
    } else if (id === 'july4') {
      if (left) left.appendChild(sprite('px-fw-inline'));
      if (right) right.appendChild(sprite('px-fw-inline'));
      many(sky, 'px-fw', 6);
    } else if (id === 'spring') {
      if (left) left.appendChild(sprite('px-bloom'));
      if (right) right.appendChild(sprite('px-bloom px-bloom-b'));
    } else if (id === 'summer') {
      if (left) left.appendChild(sprite('px-wave'));
      if (right) right.appendChild(sprite('px-wave'));
    } else if (id === 'earlyautumn') {
      if (left) left.appendChild(sprite('px-leaf'));
      if (right) right.appendChild(sprite('px-leaf px-leaf-b'));
      many(sky, 'px-fall px-leaf', 6);
    } else if (id === 'winter') {
      if (left) left.appendChild(sprite('px-snow'));
      if (right) right.appendChild(sprite('px-snow'));
      many(sky, 'px-snow-fall', 10);
    }
  }

  function paintWordart(id) {
    var h = document.querySelector('.wordart');
    if (!h) return;
    var msg = THEMES[id].marquee;
    if (id === 'classic') {
      h.textContent = msg;
      return;
    }
    h.textContent = '';
    var span = document.createElement('span');
    span.className = 'scroll';
    span.textContent = msg;
    h.appendChild(span);
  }

  function paint(id, updateJukebox) {
    if (!THEMES[id]) id = 'classic';
    document.documentElement.dataset.theme = id;
    paintWordart(id);
    paintSprites(id);
    var select = document.getElementById('themeSelect');
    if (select) {
      var auto = select.querySelector('option[value="auto"]');
      if (auto) auto.textContent = 'Auto (Current: ' + THEMES[calendarTheme()].label + ')';
      var pref = readPref();
      select.value = pref.mode === 'lock' ? pref.id : 'auto';
    }
    if (updateJukebox && window.MONDO_JUKEBOX && window.MONDO_JUKEBOX.setTracks) {
      var track = THEMES[id].track;
      window.MONDO_JUKEBOX.setTracks(track ? [track] : [], track ? track.name : '');
    }
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
    select.setAttribute('aria-label', '90s theme');
    var auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = 'Auto (Current: ' + THEMES[calendarTheme()].label + ')';
    select.appendChild(auto);
    ORDER.forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = THEMES[id].label;
      select.appendChild(opt);
    });
    var pref = readPref();
    select.value = pref.mode === 'lock' ? pref.id : 'auto';
    select.addEventListener('change', function () {
      if (select.value === 'auto') writePref({ mode: 'auto' });
      else writePref({ mode: 'lock', id: select.value });
      paint(activeId(), true);
    });
    label.appendChild(select);
    var host = document.querySelector('.hdr .actions') || document.querySelector('.hdr') || document.querySelector('.site-header');
    if (host) host.appendChild(label);
  }

  var current = activeId();
  document.documentElement.dataset.theme = current;
  window.MONDO_THEME_TRACKS = THEMES[current].track ? [THEMES[current].track] : [];
  window.MONDO_THEME = { calendarTheme: calendarTheme, themes: THEMES, activeId: activeId };
  window.MONDO_THEME_MOUNT = function () {
    ensureSelect();
    paint(activeId(), false);
  };
})();
