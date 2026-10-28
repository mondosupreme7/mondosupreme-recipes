(function () {
  'use strict';
  var KEY = 'mondosupreme.grocery.v1';
  var AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Household'];
  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (data && Array.isArray(data.items)) return data;
    } catch (e) {}
    return { items: [] };
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    syncCloud(data);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function aisleFor(text) {
    var s = text.toLowerCase();
    if (/lettuce|tomato|onion|garlic|basil|spinach|apple|banana|ginger|lemon|lime|herb|pepper|potato|carrot/.test(s)) return 'Produce';
    if (/chicken|beef|pork|fish|shrimp|salmon|turkey|steak|bacon|sausage/.test(s)) return 'Meat & Seafood';
    if (/milk|butter|egg|cheese|yogurt|parmesan|buttermilk|cream/.test(s)) return 'Dairy & Eggs';
    if (/bread|bun|bagel|tortilla|roll|baguette/.test(s)) return 'Bakery';
    if (/frozen|ice cream/.test(s)) return 'Frozen';
    if (/soap|paper|detergent|sponge|foil|trash|cleaner/.test(s)) return 'Household';
    return 'Pantry';
  }
  function status(text) { var n = $('gStatus'); if (n) n.textContent = text; }
  function syncCloud(data) {
    try {
      if (!window.firebase || !firebase.auth || !firebase.database) return;
      var user = firebase.auth().currentUser;
      if (!user) return;
      firebase.database().ref('users/' + user.uid + '/grocery').set({ items: data.items, t: Date.now() }).then(function () {
        status('Saved on this device and in your account.');
      }).catch(function () { status('Saved on this device.'); });
    } catch (e) { status('Saved on this device.'); }
  }
  function pullCloud() {
    try {
      if (!window.firebase || !firebase.auth || !firebase.database) return;
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) return;
        firebase.database().ref('users/' + user.uid + '/grocery').once('value').then(function (snap) {
          var remote = snap.val();
          if (!remote || !Array.isArray(remote.items) || !remote.items.length) return;
          var local = load();
          if (!local.items.length || (remote.t && remote.t > (local.t || 0))) {
            localStorage.setItem(KEY, JSON.stringify({ items: remote.items, t: remote.t || Date.now() }));
            render();
            status('Loaded the list from your account.');
          }
        }).catch(function () {});
      });
    } catch (e) {}
  }
  function addItem(text, aisle) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    var data = load();
    var key = text.toLowerCase();
    if (data.items.some(function (item) { return !item.checked && item.text.toLowerCase() === key; })) {
      status('That item is already on the list.');
      return;
    }
    data.items.push({ id: uid(), text: text, aisle: aisle || aisleFor(text), checked: false });
    data.t = Date.now();
    save(data);
    render();
  }
  function render() {
    var data = load();
    var host = $('aisles');
    if (!host) return;
    host.textContent = '';
    AISLES.forEach(function (name) {
      var items = data.items.filter(function (item) { return (item.aisle || 'Pantry') === name; });
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
          var found = fresh.items.filter(function (row) { return row.id === item.id; })[0];
          if (found) found.checked = box.checked;
          fresh.t = Date.now();
          save(fresh);
          render();
        });
        var span = document.createElement('span');
        span.textContent = item.text;
        row.appendChild(box);
        row.appendChild(span);
        section.appendChild(row);
      });
      host.appendChild(section);
    });
    var open = data.items.filter(function (item) { return !item.checked; }).length;
    status(open ? open + ' still to pick up.' : (data.items.length ? 'List complete.' : 'The list is empty.'));
  }
  function readRecipes() {
    try { return JSON.parse(localStorage.getItem('mondosupreme.recipes.v1')) || []; } catch (e) { return []; }
  }
  function importRecipes() {
    var recipes = readRecipes();
    var n = 0;
    recipes.forEach(function (recipe) {
      (recipe.ingredients || []).forEach(function (line) {
        var before = load().items.length;
        addItem(line, aisleFor(line));
        if (load().items.length > before) n += 1;
      });
    });
    status('Imported ' + n + ' ingredient lines from saved recipes.');
  }
  function importPlanner() {
    var plan = null;
    try { plan = JSON.parse(localStorage.getItem('mondosupreme.planner.v1')); } catch (e) {}
    var recipes = readRecipes();
    var byId = {};
    recipes.forEach(function (recipe) { byId[recipe.id] = recipe; });
    var n = 0;
    var days = plan && plan.days || {};
    Object.keys(days).forEach(function (day) {
      Object.keys(days[day] || {}).forEach(function (meal) {
        var cell = days[day][meal] || {};
        var recipe = byId[cell.id];
        if (recipe) {
          (recipe.ingredients || []).forEach(function (line) {
            var before = load().items.length;
            addItem(line);
            if (load().items.length > before) n += 1;
          });
        } else if (cell.custom) {
          var before = load().items.length;
          addItem(cell.custom);
          if (load().items.length > before) n += 1;
        }
      });
    });
    status(plan ? 'Imported ' + n + ' lines from the meal planner.' : 'No meal plan was saved on this device.');
  }
  function copyList() {
    var lines = load().items.filter(function (item) { return !item.checked; }).map(function (item) {
      return item.aisle + ': ' + item.text;
    });
    var text = lines.join('\n') || 'Grocery list is empty.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status('Copied the open items.'); }).catch(function () { status(text); });
    } else status(text);
  }
  function boot() {
    var aisle = $('gAisle');
    AISLES.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      aisle.appendChild(opt);
    });
    $('gForm').addEventListener('submit', function (event) {
      event.preventDefault();
      addItem($('gText').value, $('gAisle').value);
      $('gText').value = '';
    });
    $('gRecipes').addEventListener('click', importRecipes);
    $('gPlan').addEventListener('click', importPlanner);
    $('gClear').addEventListener('click', function () {
      var data = load();
      data.items = data.items.filter(function (item) { return !item.checked; });
      data.t = Date.now();
      save(data);
      render();
    });
    $('gCopy').addEventListener('click', copyList);
    render();
    pullCloud();
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
