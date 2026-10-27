(() => {
'use strict';
const KEY = 'mondosupreme.planner.v1';
const RECIPES = 'mondosupreme.recipes.v1';
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const SAMPLES = [
  { id: 'sample-1', title: 'Sample: Supreme Tomato Basil Pasta', category: 'Dinner', ingredients: ['400 g spaghetti', '4 tbsp olive oil', '4 garlic cloves', '800 g canned tomatoes', '1 handful fresh basil', 'Parmesan'] },
  { id: 'sample-2', title: 'Sample: Fluffy Buttermilk Pancakes', category: 'Breakfast', ingredients: ['2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '1/2 tsp baking soda', '1/2 tsp salt', '2 cups buttermilk', '2 eggs', '3 tbsp melted butter'] },
  { id: 'sample-3', title: 'Sample: Chickpea Coconut Curry', category: 'Dinner', ingredients: ['1 tbsp oil', '1 onion', '3 garlic cloves', '1 tbsp ginger', '2 tbsp curry powder', '2 cans chickpeas', '1 can coconut milk', '1 can diced tomatoes', '2 handfuls spinach', 'Rice'] }
];
const $ = s => document.querySelector(s);
let plan, recipes = [];

function empty() {
  const days = {};
  DAYS.forEach(day => {
    days[day[0]] = {};
    MEALS.forEach(meal => { days[day[0]][meal[0]] = { id: '', custom: '' }; });
  });
  return { days, checks: {} };
}
function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
  const base = empty();
  if (!raw || !raw.days) return base;
  DAYS.forEach(day => {
    MEALS.forEach(meal => {
      const cell = raw.days[day[0]] && raw.days[day[0]][meal[0]];
      if (cell) base.days[day[0]][meal[0]] = { id: String(cell.id || ''), custom: String(cell.custom || '').slice(0, 80) };
    });
  });
  base.checks = raw.checks && typeof raw.checks === 'object' ? raw.checks : {};
  return base;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch { /* full */ }
}
function loadRecipes() {
  try { recipes = JSON.parse(localStorage.getItem(RECIPES)) || []; } catch { recipes = []; }
  if (!Array.isArray(recipes) || !recipes.length) recipes = SAMPLES.map(row => Object.assign({}, row));
}
function aisle(line) {
  const s = line.toLowerCase();
  if (/milk|cheese|butter|yogurt|egg|cream|buttermilk/.test(s)) return 'Dairy';
  if (/chicken|beef|pork|fish|shrimp|bacon|sausage/.test(s)) return 'Meat & Seafood';
  if (/apple|onion|garlic|basil|spinach|tomato|lettuce|pepper|lemon|ginger|potato|herb/.test(s)) return 'Produce';
  if (/frozen|ice cream/.test(s)) return 'Frozen';
  if (/salt|pepper|curry|spice|cinnamon|powder|soda/.test(s)) return 'Spices';
  if (/bread|bun|tortilla|rice/.test(s)) return 'Bakery & Grains';
  return 'Pantry';
}
function paint() {
  const host = $('#week');
  host.replaceChildren();
  DAYS.forEach(day => {
    const card = document.createElement('section');
    card.className = 'day';
    const title = document.createElement('h2');
    title.textContent = day[1];
    card.appendChild(title);
    MEALS.forEach(meal => {
      const cell = plan.days[day[0]][meal[0]];
      const row = document.createElement('label');
      row.className = 'slot';
      const name = document.createElement('span');
      name.textContent = meal[1];
      const select = document.createElement('select');
      select.setAttribute('aria-label', day[1] + ' ' + meal[1] + ' recipe');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Pick a recipe';
      select.appendChild(blank);
      recipes.forEach(recipe => {
        const opt = document.createElement('option');
        opt.value = recipe.id || '';
        opt.textContent = recipe.title || 'Recipe';
        select.appendChild(opt);
      });
      select.value = cell.id && recipes.some(r => r.id === cell.id) ? cell.id : '';
      const custom = document.createElement('input');
      custom.maxLength = 80;
      custom.placeholder = 'Or type a custom meal';
      custom.value = cell.custom || '';
      custom.setAttribute('aria-label', day[1] + ' ' + meal[1] + ' custom meal');
      select.addEventListener('change', () => { cell.id = select.value; if (select.value) cell.custom = ''; custom.value = ''; save(); paintGrocery(); });
      custom.addEventListener('change', () => { cell.custom = custom.value.trim(); if (cell.custom) { cell.id = ''; select.value = ''; } save(); paintGrocery(); });
      row.appendChild(name);
      row.appendChild(select);
      row.appendChild(custom);
      card.appendChild(row);
    });
    host.appendChild(card);
  });
  paintGrocery();
}
function groceryLines() {
  const lines = [];
  DAYS.forEach(day => {
    MEALS.forEach(meal => {
      const cell = plan.days[day[0]][meal[0]];
      if (cell.id) {
        const recipe = recipes.filter(r => r.id === cell.id)[0];
        (recipe && recipe.ingredients || []).forEach(item => lines.push(String(item)));
      } else if (cell.custom) lines.push(cell.custom);
    });
  });
  const grouped = {};
  lines.forEach(line => {
    const key = line.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) return;
    const group = aisle(line);
    if (!grouped[group]) grouped[group] = {};
    if (!grouped[group][key]) grouped[group][key] = line.trim();
  });
  return grouped;
}
function paintGrocery() {
  const host = $('#grocery');
  host.replaceChildren();
  const grouped = groceryLines();
  const names = Object.keys(grouped).sort();
  if (!names.length) {
    host.textContent = 'Pick a meal and the grocery list fills in, grouped by aisle.';
    return;
  }
  names.forEach(name => {
    const box = document.createElement('section');
    box.className = 'aisle';
    const h = document.createElement('h3');
    h.textContent = name;
    box.appendChild(h);
    Object.keys(grouped[name]).forEach(key => {
      const id = name + '|' + key;
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!plan.checks[id];
      input.addEventListener('change', () => { plan.checks[id] = input.checked; save(); });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + grouped[name][key]));
      box.appendChild(label);
    });
    host.appendChild(box);
  });
}
function menuText() {
  const parts = ['MondoMeal Planner'];
  DAYS.forEach(day => {
    parts.push(day[1]);
    MEALS.forEach(meal => {
      const cell = plan.days[day[0]][meal[0]];
      const recipe = recipes.filter(r => r.id === cell.id)[0];
      const label = cell.custom || (recipe && recipe.title) || '—';
      parts.push('  ' + meal[1] + ': ' + label);
    });
  });
  return parts.join('\n');
}
function init() {
  const year = $('#yr');
  if (year) year.textContent = String(new Date().getFullYear());
  loadRecipes();
  plan = load();
  save();
  paint();
  $('#planPrint').onclick = () => window.print();
  $('#planCopy').onclick = async () => {
    const text = menuText();
    try { await navigator.clipboard.writeText(text); $('#planNote').textContent = 'Week copied. Paste it into a note or an email.'; }
    catch { $('#planNote').textContent = text; }
  };
  $('#planClear').onclick = () => {
    plan = empty();
    save();
    paint();
  };
}
document.addEventListener('DOMContentLoaded', init);
})();
