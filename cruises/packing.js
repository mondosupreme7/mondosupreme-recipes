(() => {
'use strict';
const KEY = 'mondosupreme.packing.v1';
const GROUPS = [
  ['Documents & SetSail Pass', ['Passport or REAL ID', 'SetSail pass saved in the app', 'Boarding time written down', 'Credit card and a little cash', 'Travel insurance page']],
  ['Cabin Hacks & Magnet Hooks', ['Magnetic hooks', 'Over-the-door organizer', 'Nightlight', 'Power strip with no surge protector', 'Lanyard for the SeaPass']],
  ['Pool & CocoCay', ['Reef-safe sunscreen', 'Swim shoes', 'Cover-up', 'Rash guard', 'Waterproof phone pouch']],
  ['Formal / Theme Nights', ['One dressy outfit', 'Theme-night shirt', 'Comfortable dress shoes', 'Compact jewelry']],
  ['First Aid', ['Motion bands', 'Pain reliever you already use', 'Bandages', 'Personal prescriptions', 'Aloe']]
];
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { checks: {} }; }
  catch { return { checks: {} }; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full */ }
}
function paint() {
  const host = document.getElementById('packList');
  if (!host) return;
  const data = load();
  host.replaceChildren();
  let done = 0, total = 0;
  GROUPS.forEach(group => {
    const box = document.createElement('section');
    box.className = 'pack-group';
    const h = document.createElement('h3');
    h.textContent = group[0];
    box.appendChild(h);
    group[1].forEach(item => {
      total++;
      const id = group[0] + '|' + item;
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!data.checks[id];
      if (input.checked) done++;
      input.addEventListener('change', () => {
        const next = load();
        next.checks[id] = input.checked;
        save(next);
        paintCount();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + item));
      box.appendChild(label);
    });
    host.appendChild(box);
  });
  const count = document.getElementById('packCount');
  if (count) count.textContent = done + ' / ' + total + ' packed';
}
function paintCount() {
  const data = load();
  let done = 0, total = 0;
  GROUPS.forEach(group => group[1].forEach(item => {
    total++;
    if (data.checks[group[0] + '|' + item]) done++;
  }));
  const count = document.getElementById('packCount');
  if (count) count.textContent = done + ' / ' + total + ' packed';
}
function show(which) {
  const fleet = document.getElementById('fleetPane');
  const pack = document.getElementById('packPane');
  const tabFleet = document.getElementById('tabFleet');
  const tabPack = document.getElementById('tabPack');
  const packing = which === 'pack';
  if (fleet) fleet.hidden = packing;
  if (pack) pack.hidden = !packing;
  if (tabFleet) tabFleet.setAttribute('aria-selected', packing ? 'false' : 'true');
  if (tabPack) tabPack.setAttribute('aria-selected', packing ? 'true' : 'false');
  if (!packing) window.dispatchEvent(new Event('mondo-fleet-show'));
}
function init() {
  const tabFleet = document.getElementById('tabFleet');
  const tabPack = document.getElementById('tabPack');
  if (!tabFleet || !tabPack) return;
  tabFleet.addEventListener('click', () => show('fleet'));
  tabPack.addEventListener('click', () => show('pack'));
  const reset = document.getElementById('packReset');
  if (reset) reset.addEventListener('click', () => { save({ checks: {} }); paint(); });
  if (location.hash === '#packing') show('pack');
  paint();
}
document.addEventListener('DOMContentLoaded', init);
})();
