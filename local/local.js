(function () {
  'use strict';
  var KEY = 'mondosupreme.local.tips.v1';
  var PLACES = [
    { id: 'pier', name: 'Cocoa Beach Pier', town: 'Cocoa Beach', cats: ['Dining', 'Launch viewing'], blurb: 'A long public pier for Atlantic views, fishing, and launch days when the trajectory favors the beach.' },
    { id: 'lori', name: 'Lori Wilson Park', town: 'Cocoa Beach', cats: ['Beach'], blurb: 'A wide beach park with a boardwalk. Hours and parking rules are posted by the city.' },
    { id: 'shepard', name: 'Alan Shepard Park', town: 'Cocoa Beach', cats: ['Beach', 'Launch viewing'], blurb: 'Oceanfront park near the pier, a common gathering spot when a launch is visible from shore.' },
    { id: 'fischer', name: 'Sidney Fischer Park', town: 'Cocoa Beach', cats: ['Beach'], blurb: 'Dune crossover and beach access toward the south end of the city.' },
    { id: 'jetty', name: 'Jetty Park', town: 'Port Canaveral', cats: ['Launch viewing', 'Beach'], blurb: 'County park at the port inlet. A classic spot for cruise traffic and many eastward launches.' },
    { id: 'tower', name: 'Exploration Tower', town: 'Port Canaveral', cats: ['Launch viewing'], blurb: 'The port’s observation tower. Check the day’s opening before you drive out.' },
    { id: 'rustys', name: 'Rusty\'s Seafood & Oyster Bar', town: 'Port Canaveral', cats: ['Dining'], blurb: 'Waterfront seafood at the port. Menus and trivia nights change, so call ahead.' },
    { id: 'grills', name: 'Grills Seafood Deck & Tiki Bar', town: 'Port Canaveral', cats: ['Dining', 'Trivia'], blurb: 'Casual port deck with a view of the water. Ask the host what this week’s evening lineup is.' },
    { id: 'village', name: 'Historic Cocoa Village', town: 'Cocoa', cats: ['Dining', 'Events'], blurb: 'Walkable river village of shops and restaurants. Weekend events are posted locally.' },
    { id: 'river', name: 'Cocoa Riverfront Park', town: 'Cocoa', cats: ['Events'], blurb: 'Public riverfront lawn in the village, used for community gatherings.' },
    { id: 'kiwanis', name: 'Kiwanis Island Park', town: 'Merritt Island', cats: ['Events'], blurb: 'Island park with fields and picnic space on the barge canal.' },
    { id: 'ulumay', name: 'Ulumay Wildlife Sanctuary', town: 'Merritt Island', cats: ['Events'], blurb: 'A quiet sanctuary trail on the island. Stay on marked paths.' },
    { id: 'rotary', name: 'Rotary Park', town: 'Merritt Island', cats: ['Events'], blurb: 'Neighborhood park on the island for an easy afternoon outdoors.' },
    { id: 'market', name: 'Cocoa Village weekend market', town: 'Cocoa', cats: ['Farmers market', 'Events'], blurb: 'Seasonal outdoor market energy in the village. Confirm the current morning before you go.' }
  ];
  var town = 'All';
  var cat = 'All';
  var q = '';
  function $(id) { return document.getElementById(id); }
  function tips() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function saveTips(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-80))); } catch (e) {} }
  function paint() {
    var host = $('places');
    host.textContent = '';
    var shown = PLACES.filter(function (place) {
      if (town !== 'All' && place.town !== town) return false;
      if (cat !== 'All' && place.cats.indexOf(cat) < 0) return false;
      if (q && (place.name + ' ' + place.blurb + ' ' + place.town).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    shown.forEach(function (place) {
      var card = document.createElement('article');
      card.className = 'coast-card place';
      var h = document.createElement('h2');
      h.textContent = place.name;
      var meta = document.createElement('p');
      meta.textContent = place.town + ' · ' + place.cats.join(', ');
      var p = document.createElement('p');
      p.textContent = place.blurb;
      card.appendChild(h);
      card.appendChild(meta);
      card.appendChild(p);
      var mine = tips().filter(function (tip) { return tip.place === place.id; });
      mine.slice(-3).forEach(function (tip) {
        var line = document.createElement('p');
        line.className = 'tip';
        line.textContent = '“' + tip.text + '” · ' + tip.rating + '/5';
        card.appendChild(line);
      });
      host.appendChild(card);
    });
    $('placeCount').textContent = shown.length + ' places';
  }
  function bootFilters() {
    ['All', 'Cocoa', 'Merritt Island', 'Port Canaveral', 'Cocoa Beach'].forEach(function (name) { addChip('towns', name, function () { town = name; paint(); }); });
    ['All', 'Dining', 'Launch viewing', 'Beach', 'Trivia', 'Farmers market', 'Events'].forEach(function (name) { addChip('cats', name, function () { cat = name; paint(); }); });
    var select = $('tipPlace');
    PLACES.forEach(function (place) {
      var opt = document.createElement('option');
      opt.value = place.id;
      opt.textContent = place.name;
      select.appendChild(opt);
    });
  }
  function addChip(hostId, name, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = name;
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(btn.parentNode.children, function (el) { el.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      onClick();
    });
    if (name === 'All') btn.setAttribute('aria-pressed', 'true');
    $(hostId).appendChild(btn);
  }
  function listen() {
    try {
      if (!window.firebase || !firebase.database) return;
      firebase.database().ref('local/tips').limitToLast(40).on('value', function (snap) {
        var remote = [];
        snap.forEach(function (child) {
          var val = child.val() || {};
          remote.push({ place: val.place, text: String(val.text || '').slice(0, 240), rating: Number(val.rating) || 0 });
        });
        if (remote.length) {
          saveTips(remote);
          paint();
        }
      }, function () {});
    } catch (e) {}
  }
  function boot() {
    bootFilters();
    $('q').addEventListener('input', function () { q = $('q').value.trim().toLowerCase(); paint(); });
    $('tipForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var text = $('tipText').value.replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!text) return;
      var tip = { place: $('tipPlace').value, text: text, rating: Number($('tipRating').value) || 5, t: Date.now() };
      var list = tips();
      list.push(tip);
      saveTips(list);
      $('tipText').value = '';
      paint();
      try {
        var user = window.firebase && firebase.auth && firebase.auth().currentUser;
        if (user) firebase.database().ref('local/tips').push(tip).catch(function () {});
      } catch (e) {}
      $('tipStatus').textContent = 'Tip saved on this device.';
    });
    paint();
    listen();
    var year = $('yr');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
