(function () {
  'use strict';
  var KEY = 'mondosupreme.grocery.v1';
  var FLAG = 'mondosupreme.grocery.plannerMigrated.v1';
  var AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Household'];
  var FRACS = { '½': 1 / 2, '⅓': 1 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
  var QTY_RE = /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?:\s*([-–])\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?))?/;
  var UNIT_PLURAL = { cup: 'cups', tbsp: 'tbsp', tsp: 'tsp', g: 'g', kg: 'kg', oz: 'oz', lb: 'lbs', ml: 'ml', l: 'l', pinch: 'pinches', clove: 'cloves', can: 'cans', handful: 'handfuls', teaspoon: 'teaspoons', tablespoon: 'tablespoons' };
  var UNIT_ONE = {};
  Object.keys(UNIT_PLURAL).forEach(function (one) {
    UNIT_ONE[one] = one;
    UNIT_ONE[UNIT_PLURAL[one]] = one;
  });
  var SAMPLES = [
    { id: 'sample-1', title: 'Sample: Supreme Tomato Basil Pasta', category: 'Dinner', servings: 4, ingredients: ['400 g spaghetti', '4 tbsp olive oil', '4 garlic cloves, sliced', '800 g canned San Marzano tomatoes', '1 handful fresh basil', 'Salt & pepper', 'Parmesan, to serve'] },
    { id: 'sample-2', title: 'Sample: Fluffy Buttermilk Pancakes', category: 'Breakfast', servings: 4, ingredients: ['2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '1/2 tsp baking soda', '1/2 tsp salt', '2 cups buttermilk', '2 eggs', '3 tbsp melted butter'] },
    { id: 'sample-3', title: 'Sample: Chickpea Coconut Curry', category: 'Dinner', servings: 4, ingredients: ['1 tbsp oil', '1 onion, diced', '3 garlic cloves', '1 tbsp grated ginger', '2 tbsp curry powder', '2 cans chickpeas, drained', '1 can coconut milk', '1 can diced tomatoes', '2 handfuls spinach', 'Rice, to serve'] }
  ];
  var catalog = [];
  var usingSamples = false;
  var pendingAdds = [];
  var bootedT = 0;
  var pullSettled = false;
  var cloudPlan = null;
  var cloudPlanReady = false;

  function $(id) { return document.getElementById(id); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function status(text) { var n = $('gStatus'); if (n) n.textContent = text; }
  function parseQtyToken(token) {
    var text = String(token || '').trim();
    if (FRACS[text] != null) return FRACS[text];
    var m = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) { var d = +m[3]; return d ? +m[1] + (+m[2] / d) : null; }
    m = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) { var den = +m[2]; return den ? +m[1] / den : null; }
    var n = Number(text);
    return isFinite(n) ? n : null;
  }
  function formatQty(n) {
    if (!isFinite(n) || n <= 0) return '0';
    var rounded = Math.round(n * 1000) / 1000;
    var nearest = Math.round(rounded);
    if (Math.abs(rounded - nearest) < 0.001) return String(nearest);
    var whole = Math.floor(rounded + 1e-9);
    var frac = rounded - whole;
    var table = [[1, 8, '1/8'], [1, 4, '1/4'], [1, 3, '1/3'], [3, 8, '3/8'], [1, 2, '1/2'], [5, 8, '5/8'], [2, 3, '2/3'], [3, 4, '3/4'], [7, 8, '7/8']];
    var best = '';
    var err = 0.021;
    table.forEach(function (row) {
      var gap = Math.abs(frac - row[0] / row[1]);
      if (gap < err) { err = gap; best = row[2]; }
    });
    if (frac > 0.98) return String(whole + 1);
    if (!best) return String(Math.round(rounded * 100) / 100);
    return whole ? whole + ' ' + best : best;
  }
  function scaleLine(line, factor) {
    var text = String(line == null ? '' : line);
    if (factor === 1) return text;
    var m = text.match(QTY_RE);
    if (!m) return text;
    var a = parseQtyToken(m[1]);
    if (a == null) return text;
    var b = m[3] ? parseQtyToken(m[3]) : null;
    if (m[3] && b == null) return text;
    var shown = b == null ? formatQty(a * factor) : formatQty(a * factor) + '-' + formatQty(b * factor);
    return shown + text.slice(m[0].length);
  }
  function groceryParts(line) {
    var text = String(line || '').replace(/\s+/g, ' ').trim();
    var m = text.match(QTY_RE);
    if (!m || m[3]) return { key: text.toLowerCase(), qty: null, text: text };
    var qty = parseQtyToken(m[1]);
    if (qty == null) return { key: text.toLowerCase(), qty: null, text: text };
    var rest = text.slice(m[0].length).replace(/^\s+/, '');
    var unitMatch = rest.match(/^([A-Za-z]+)\b\s*(.*)$/);
    var unit = '';
    var tail = rest;
    if (unitMatch && UNIT_ONE[unitMatch[1].toLowerCase()]) {
      unit = UNIT_ONE[unitMatch[1].toLowerCase()];
      tail = unitMatch[2] || '';
    }
    return { key: (unit + '|' + tail).toLowerCase().replace(/\s+/g, ' ').trim(), qty: qty, unit: unit, tail: tail, text: text };
  }
  function groceryText(parts, qty) {
    if (parts.qty == null) return parts.text;
    var word = parts.unit ? (Math.abs(qty - 1) < 0.001 ? parts.unit : (UNIT_PLURAL[parts.unit] || parts.unit)) : '';
    return [formatQty(qty), word, parts.tail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  function aisleFor(text) {
    var s = String(text || '').toLowerCase();
    if (/lettuce|tomato|onion|garlic|basil|spinach|apple|banana|ginger|lemon|lime|herb|pepper|potato|carrot|cilantro|parsley/.test(s)) return 'Produce';
    if (/chicken|beef|pork|fish|shrimp|salmon|turkey|steak|bacon|sausage/.test(s)) return 'Meat & Seafood';
    if (/milk|butter|egg|cheese|yogurt|parmesan|buttermilk|cream/.test(s)) return 'Dairy & Eggs';
    if (/bread|bun|bagel|tortilla|roll|baguette/.test(s)) return 'Bakery';
    if (/frozen|ice cream/.test(s)) return 'Frozen';
    if (/soap|paper|detergent|sponge|foil|trash|cleaner/.test(s)) return 'Household';
    return 'Pantry';
  }
  function emptyData() { return { items: [], picks: [], migratedPlanner: false, t: 0 }; }
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (data && Array.isArray(data.items)) {
        if (!Array.isArray(data.picks)) data.picks = [];
        return data;
      }
    } catch (e) {}
    return emptyData();
  }
  function save(data) {
    data.t = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    syncCloud(data);
  }
  function flagSet() {
    try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }
  function setFlag() {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
  }
  function byId(id) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }
  function baseServings(recipe) {
    var n = Number(recipe && recipe.servings);
    return n > 0 ? n : 1;
  }
  function findOpen(data, key) {
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i].checked) continue;
      if (groceryParts(data.items[i].text).key === key) return data.items[i];
    }
    return null;
  }
  function addLine(data, text, recipe, aisle) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    var parts = groceryParts(text);
    var open = findOpen(data, parts.key);
    if (open && parts.qty != null && groceryParts(open.text).qty != null) {
      var prior = groceryParts(open.text);
      open.text = groceryText(prior, prior.qty + parts.qty);
      if (!open.aisle) open.aisle = aisle || aisleFor(open.text);
      return;
    }
    if (open && parts.qty == null) return;
    var chosen = aisle && AISLES.indexOf(aisle) >= 0 ? aisle : aisleFor(text);
    data.items.push({
      id: uid(),
      text: text,
      aisle: chosen,
      checked: false,
      recipeId: recipe && recipe.id || '',
      recipeTitle: recipe && recipe.title || '',
      custom: !recipe
    });
  }
  function subtractLine(data, text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    var parts = groceryParts(text);
    var open = findOpen(data, parts.key);
    if (!open) return;
    if (parts.qty == null || groceryParts(open.text).qty == null) {
      if (open.text.toLowerCase() === text.toLowerCase()) {
        data.items = data.items.filter(function (item) { return item.id !== open.id; });
      }
      return;
    }
    var prior = groceryParts(open.text);
    var next = prior.qty - parts.qty;
    if (next <= 0.001) data.items = data.items.filter(function (item) { return item.id !== open.id; });
    else open.text = groceryText(prior, next);
  }
  function applyRecipe(data, recipe, fromServings, toServings) {
    if (!recipe) return;
    var base = baseServings(recipe);
    var lines = recipe.ingredients || [];
    lines.forEach(function (raw) {
      if (fromServings > 0) subtractLine(data, scaleLine(raw, fromServings / base));
      if (toServings > 0) addLine(data, scaleLine(raw, toServings / base), recipe);
    });
  }
  function ingredientList(value) {
    if (Array.isArray(value)) return value.map(function (line) { return String(line || '').trim(); }).filter(Boolean);
    if (typeof value === 'string') return value.split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
    return [];
  }
  function normalize(id, value) {
    if (!value || typeof value !== 'object') return null;
    var title = String(value.title || '').replace(/\s+/g, ' ').trim();
    if (!title || !id) return null;
    var servings = Number(value.servings);
    return {
      id: String(id),
      title: title.slice(0, 160),
      category: String(value.category || '').slice(0, 40),
      servings: servings >= 1 && servings <= 999 ? servings : 0,
      ingredients: ingredientList(value.ingredients).slice(0, 80)
    };
  }
  function readLocalRecipes() {
    try {
      var rows = JSON.parse(localStorage.getItem('mondosupreme.recipes.v1') || 'null');
      if (!Array.isArray(rows)) return [];
      return rows.map(function (row) { return normalize(row && row.id, row); }).filter(Boolean);
    } catch (e) { return []; }
  }
  function syncCloud(data) {
    try {
      if (!window.firebase || !firebase.auth || !firebase.database) return;
      var user = firebase.auth().currentUser;
      if (!user) return;
      firebase.database().ref('users/' + user.uid + '/grocery').set({
        items: data.items,
        picks: data.picks || [],
        migratedPlanner: !!data.migratedPlanner,
        t: data.t || Date.now()
      }).catch(function () { status('Saved on this device.'); });
    } catch (e) {}
  }
  function adoptRemote(remote) {
    if (!remote || !Array.isArray(remote.items)) return;
    var local = load();
    if ((local.t || 0) > bootedT) return;
    if (!remote.items.length && local.items.length) return;
    if (local.items.length && !(remote.t && remote.t > (local.t || 0))) return;
    var next = {
      items: remote.items,
      picks: Array.isArray(remote.picks) ? remote.picks : [],
      migratedPlanner: !!remote.migratedPlanner,
      t: remote.t || Date.now()
    };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    if (next.migratedPlanner) setFlag();
    render();
    status('Loaded the list from your account.');
  }
  function parseRemote(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (e) { return null; }
    }
    if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return null;
    return value;
  }
  function readPlanLocal() {
    try { return JSON.parse(localStorage.getItem('mondosupreme.planner.v1') || 'null'); } catch (e) { return null; }
  }
  function applyPlan(plan) {
    if (!plan || !plan.days) return 0;
    var data = load();
    var added = 0;
    Object.keys(plan.days).forEach(function (day) {
      Object.keys(plan.days[day] || {}).forEach(function (meal) {
        var cell = plan.days[day][meal] || {};
        var recipe = byId(cell.id);
        if (recipe) {
          var pick = null;
          data.picks.forEach(function (row) { if (row.id === recipe.id) pick = row; });
          var prev = pick ? Number(pick.servings) || 0 : 0;
          var next = prev + baseServings(recipe);
          if (next > 999) next = 999;
          if (!pick) data.picks.push({ id: recipe.id, servings: next });
          else pick.servings = next;
          applyRecipe(data, recipe, prev, next);
          added += 1;
        } else if (cell.custom) {
          addLine(data, cell.custom, null);
          added += 1;
        }
      });
    });
    data.migratedPlanner = true;
    save(data);
    return added;
  }
  function finishMigration() {
    if (flagSet() || load().migratedPlanner) {
      setFlag();
      var marked = load();
      if (!marked.migratedPlanner) {
        marked.migratedPlanner = true;
        save(marked);
      }
      return;
    }
    var plan = readPlanLocal() || cloudPlan;
    var added = applyPlan(plan);
    setFlag();
    var data = load();
    data.migratedPlanner = true;
    save(data);
    if (added) status('Moved ' + added + ' saved meal' + (added === 1 ? '' : 's') + ' onto this grocery list.');
  }
  function tryFinishMigration() {
    if (flagSet() || load().migratedPlanner) {
      finishMigration();
      return;
    }
    if (!pullSettled) return;
    if (!cloudPlanReady && !readPlanLocal()) return;
    finishMigration();
  }
  function pullCloud() {
    bootedT = load().t || 0;
    try {
      if (!window.firebase || !firebase.auth || !firebase.database || !firebase.apps || !firebase.apps.length) {
        pullSettled = true;
        cloudPlanReady = true;
        tryFinishMigration();
        return;
      }
      firebase.auth().onAuthStateChanged(function (user) {
        if (pullSettled && cloudPlanReady) return;
        if (!user) return;
        var pending = 2;
        function done() {
          pending -= 1;
          if (pending > 0) return;
          pullSettled = true;
          cloudPlanReady = true;
          tryFinishMigration();
          flushAdds();
          render();
        }
        firebase.database().ref('users/' + user.uid + '/grocery').once('value').then(function (snap) {
          adoptRemote(parseRemote(snap.val()));
        }).catch(function () {}).then(done);
        if (flagSet()) {
          cloudPlanReady = true;
          done();
          return;
        }
        firebase.database().ref('users/' + user.uid + '/planner').once('value').then(function (snap) {
          var raw = snap.val();
          if (typeof raw === 'string') {
            try { cloudPlan = JSON.parse(raw); } catch (e) { cloudPlan = null; }
          }
        }).catch(function () {}).then(function () {
          cloudPlanReady = true;
          done();
        });
      });
      setTimeout(function () {
        if (pullSettled) return;
        if (firebase.auth().currentUser) return;
        pullSettled = true;
        cloudPlanReady = true;
        tryFinishMigration();
      }, 2500);
    } catch (e) {
      pullSettled = true;
      cloudPlanReady = true;
      tryFinishMigration();
    }
  }
  function addRecipe(recipe) {
    if (!recipe) return;
    var data = load();
    var pick = null;
    data.picks.forEach(function (row) { if (row.id === recipe.id) pick = row; });
    var prev = pick ? Number(pick.servings) || 0 : 0;
    var next = prev + baseServings(recipe);
    if (next > 999) next = 999;
    if (next === prev) {
      status(recipe.title + ' is already on the list.');
      return;
    }
    if (!pick) data.picks.push({ id: recipe.id, servings: next });
    else pick.servings = next;
    applyRecipe(data, recipe, prev, next);
    save(data);
    render();
    status('Added ' + recipe.title + ' · ' + next + ' servings.');
  }
  function queueAdd(id) {
    if (!id) return;
    var recipe = byId(id);
    if (!recipe) {
      if (pendingAdds.indexOf(id) < 0) pendingAdds.push(id);
      status('Looking up that recipe…');
      return;
    }
    addRecipe(recipe);
  }
  function flushAdds(finalAttempt) {
    if (!pendingAdds.length) return;
    var still = [];
    pendingAdds.forEach(function (id) {
      if (byId(id)) addRecipe(byId(id));
      else still.push(id);
    });
    pendingAdds = still;
    if (still.length && (finalAttempt || !usingSamples)) status('That recipe is not in the notebook.');
  }
  function consumeAdd() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    var id = params.get('add');
    if (!id) return;
    params.delete('add');
    var next = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
    try { history.replaceState(null, '', next); } catch (e) {}
    queueAdd(id);
  }
  function setServings(id, servings) {
    var recipe = byId(id);
    var data = load();
    var pick = null;
    data.picks.forEach(function (row) { if (row.id === id) pick = row; });
    if (!pick) return;
    var prev = Number(pick.servings) || baseServings(recipe);
    var next = Math.max(1, Math.min(999, Number(servings) || prev));
    if (next === prev) return;
    pick.servings = next;
    if (recipe) applyRecipe(data, recipe, prev, next);
    save(data);
    render();
    status('Servings updated.');
  }
  function removePick(id) {
    var recipe = byId(id);
    var data = load();
    var pick = null;
    data.picks.forEach(function (row) { if (row.id === id) pick = row; });
    if (!pick) return;
    if (recipe) applyRecipe(data, recipe, Number(pick.servings) || 0, 0);
    data.picks = data.picks.filter(function (row) { return row.id !== id; });
    save(data);
    render();
    status('Removed that recipe.');
  }
  function renderHits() {
    var host = $('recipeHits');
    if (!host) return;
    var q = ($('recipeSearch') && $('recipeSearch').value || '').trim().toLowerCase();
    var list = catalog.filter(function (recipe) {
      if (!q) return true;
      return [recipe.title, recipe.category].concat(recipe.ingredients).join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice(0, q ? 20 : 8);
    host.textContent = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'grocery-empty';
      empty.textContent = catalog.length ? 'No recipes match that search.' : 'Recipes will show up when the kitchen notebook loads.';
      host.appendChild(empty);
      return;
    }
    list.forEach(function (recipe) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn recipe-hit';
      var name = document.createElement('span');
      name.textContent = recipe.title;
      btn.appendChild(name);
      var meta = document.createElement('small');
      meta.textContent = (recipe.servings ? recipe.servings + ' servings' : 'Add');
      btn.appendChild(meta);
      btn.addEventListener('click', function () { addRecipe(recipe); });
      host.appendChild(btn);
    });
  }
  function renderPicks() {
    var host = $('picks');
    if (!host) return;
    var data = load();
    host.textContent = '';
    if (!data.picks.length) {
      var empty = document.createElement('p');
      empty.className = 'grocery-empty';
      empty.textContent = 'Nothing picked yet. Search above and tap a recipe.';
      host.appendChild(empty);
      return;
    }
    data.picks.forEach(function (pick) {
      var recipe = byId(pick.id);
      var row = document.createElement('div');
      row.className = 'pick-row';
      var title = document.createElement('strong');
      title.textContent = recipe ? recipe.title : 'Saved recipe';
      var label = document.createElement('label');
      label.textContent = 'Servings';
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '999';
      input.value = String(pick.servings || 1);
      input.setAttribute('aria-label', (recipe ? recipe.title : 'Recipe') + ' servings');
      input.addEventListener('change', function () { setServings(pick.id, input.value); });
      label.appendChild(input);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () { removePick(pick.id); });
      row.appendChild(title);
      row.appendChild(label);
      row.appendChild(remove);
      host.appendChild(row);
    });
  }
  function aisleName(item) {
    var name = item.aisle || aisleFor(item.text);
    return AISLES.indexOf(name) >= 0 ? name : 'Pantry';
  }
  function renderList() {
    var data = load();
    var host = $('aisles');
    if (!host) return;
    host.textContent = '';
    AISLES.forEach(function (name) {
      var items = data.items.filter(function (item) { return aisleName(item) === name; });
      if (!items.length) return;
      var section = document.createElement('section');
      section.className = 'aisle';
      var h = document.createElement('h2');
      h.textContent = name;
      section.appendChild(h);
      items.forEach(function (item) {
        var row = document.createElement('label');
        row.className = 'check-row' + (item.checked ? ' is-done' : '');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!item.checked;
        box.addEventListener('change', function () {
          var fresh = load();
          var found = null;
          fresh.items.forEach(function (rowItem) { if (rowItem.id === item.id) found = rowItem; });
          if (found) found.checked = box.checked;
          save(fresh);
          render();
          countStatus();
        });
        var span = document.createElement('span');
        span.textContent = item.text;
        row.appendChild(box);
        row.appendChild(span);
        section.appendChild(row);
      });
      host.appendChild(section);
    });
  }
  function countStatus() {
    var data = load();
    var open = data.items.filter(function (item) { return !item.checked; }).length;
    status(open ? open + ' still to pick up.' : (data.items.length ? 'List complete.' : 'The list is empty.'));
  }
  function render() {
    renderHits();
    renderPicks();
    renderList();
  }
  function listText() {
    var data = load();
    var lines = ['MondoRecipe Grocery List'];
    AISLES.forEach(function (name) {
      var items = data.items.filter(function (item) { return !item.checked && aisleName(item) === name; });
      if (!items.length) return;
      lines.push('');
      lines.push(name);
      items.forEach(function (item) { lines.push('- ' + item.text); });
    });
    return lines.length > 1 ? lines.join('\n') : 'MondoRecipe Grocery List is empty.';
  }
  function copyList() {
    var text = listText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status('Copied the open items.'); }).catch(function () { status(text); });
    } else status(text);
  }
  function shareList() {
    var text = listText();
    if (navigator.share) {
      navigator.share({ title: 'MondoRecipe Grocery List', text: text }).then(function () {
        status('Share sheet opened.');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copyList();
      });
      return;
    }
    copyList();
  }
  function mergeRemoteRecipe(recipe) {
    var i;
    for (i = 0; i < catalog.length; i++) if (catalog[i].id === recipe.id) { catalog[i] = recipe; return; }
    catalog.push(recipe);
  }
  function loadFirebaseRecipes() {
    try {
      if (!window.firebase || !firebase.database || !firebase.apps || !firebase.apps.length) return;
      firebase.database().ref('recipes/items').once('value').then(function (snap) {
        var val = snap.val() || {};
        var remote = [];
        Object.keys(val).forEach(function (id) {
          var recipe = normalize(id, val[id]);
          if (recipe) remote.push(recipe);
        });
        if (remote.length && usingSamples) {
          var picked = {};
          load().picks.forEach(function (pick) { picked[pick.id] = true; });
          catalog = remote.slice();
          SAMPLES.forEach(function (row) {
            if (picked[row.id] && !catalog.some(function (recipe) { return recipe.id === row.id; })) {
              catalog.push(normalize(row.id, row));
            }
          });
          usingSamples = false;
        } else {
          remote.forEach(mergeRemoteRecipe);
        }
        flushAdds(true);
        render();
      }).catch(function () { flushAdds(true); });
    } catch (e) {}
  }
  function bootCatalog() {
    catalog = readLocalRecipes();
    usingSamples = !catalog.length;
    if (usingSamples) catalog = SAMPLES.map(function (row) { return normalize(row.id, row); });
  }
  function boot() {
    var aisle = $('gAisle');
    if (aisle) {
      AISLES.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        aisle.appendChild(opt);
      });
    }
    bootCatalog();
    render();
    consumeAdd();
    var search = $('recipeSearch');
    if (search) search.addEventListener('input', renderHits);
    var form = $('gForm');
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = load();
      addLine(data, $('gText').value, null, $('gAisle').value);
      $('gText').value = '';
      save(data);
      render();
    });
    $('gClear').addEventListener('click', function () {
      var data = load();
      data.items = data.items.filter(function (item) { return !item.checked; });
      save(data);
      render();
      status('Cleared the checked items.');
    });
    $('gCopy').addEventListener('click', copyList);
    $('gShare').addEventListener('click', shareList);
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
    loadFirebaseRecipes();
    pullCloud();
    tryFinishMigration();
    flushAdds();
    var note = $('gStatus') ? $('gStatus').textContent : '';
    if (note === 'The list is empty.' || /still to pick up|List complete/.test(note)) countStatus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
