/* Shared Magic 8-Ball answers and this browser's oracle state. */
(function () {
  'use strict';
  var KEY = 'mondosupreme.8ball.v1';
  var CLASSIC = [
    { text: 'IT IS CERTAIN', tone: 'yes' },
    { text: 'IT IS DECIDEDLY SO', tone: 'yes' },
    { text: 'WITHOUT A DOUBT', tone: 'yes' },
    { text: 'YES DEFINITELY', tone: 'yes' },
    { text: 'YOU MAY RELY ON IT', tone: 'yes' },
    { text: 'AS I SEE IT, YES', tone: 'yes' },
    { text: 'MOST LIKELY', tone: 'yes' },
    { text: 'OUTLOOK GOOD', tone: 'yes' },
    { text: 'YES', tone: 'yes' },
    { text: 'SIGNS POINT TO YES', tone: 'yes' },
    { text: 'REPLY HAZY, TRY AGAIN', tone: 'maybe' },
    { text: 'ASK AGAIN LATER', tone: 'maybe' },
    { text: 'BETTER NOT TELL YOU NOW', tone: 'maybe' },
    { text: 'CANNOT PREDICT NOW', tone: 'maybe' },
    { text: 'CONCENTRATE AND ASK AGAIN', tone: 'maybe' },
    { text: 'DON\'T COUNT ON IT', tone: 'no' },
    { text: 'MY REPLY IS NO', tone: 'no' },
    { text: 'MY SOURCES SAY NO', tone: 'no' },
    { text: 'OUTLOOK NOT SO GOOD', tone: 'no' },
    { text: 'VERY DOUBTFUL', tone: 'no' }
  ];
  var CYBER = [
    { text: 'ALL SIGNS POINT TO RADICAL', tone: 'yes' },
    { text: 'TOTALLY TUBULAR — YES', tone: 'yes' },
    { text: 'YES — THE WEB SAYS SO', tone: 'yes' },
    { text: 'WITHOUT A DOUBT, DUDE', tone: 'yes' },
    { text: 'IT IS DECIDEDLY RAD', tone: 'yes' },
    { text: 'SIGNS POINT TO AOL', tone: 'yes' },
    { text: 'MOST LIKELY YOU\'VE GOT MAIL', tone: 'yes' },
    { text: 'OUTLOOK GOOD, LIKE A WINAMP SKIN', tone: 'yes' },
    { text: 'YOU MAY RELY ON THE ORACLE', tone: 'yes' },
    { text: 'AS I SEE IT, YES — SAVE THE FILE', tone: 'yes' },
    { text: 'ASK JEEVES AGAIN LATER', tone: 'maybe' },
    { text: 'REPLY HAZY, TRY A FLOPPY', tone: 'maybe' },
    { text: '404 FORTUNE NOT FOUND', tone: 'maybe' },
    { text: 'MODEM DISCONNECTED — TRY AGAIN', tone: 'maybe' },
    { text: 'CONCENTRATE AND HIT REFRESH', tone: 'maybe' },
    { text: 'MY SOURCES SAY NO', tone: 'no' },
    { text: 'VERY DOUBTFUL', tone: 'no' },
    { text: 'DON\'T COUNT ON IT', tone: 'no' },
    { text: 'OUTLOOK NOT SO GOOD', tone: 'no' },
    { text: 'ACCESS DENIED', tone: 'no' }
  ];
  var FATE = [
    { text: 'YES — COOK THE PASTA', tone: 'yes' },
    { text: 'THE GALLEY SAYS SOUP', tone: 'yes' },
    { text: 'BAKE THE COOKIES TONIGHT', tone: 'yes' },
    { text: 'YES — SAIL TO COZUMEL', tone: 'yes' },
    { text: 'BOOK THE BALCONY CABIN', tone: 'yes' },
    { text: 'THE SHIP SAYS FULL STEAM', tone: 'yes' },
    { text: 'TRY THE MIDNIGHT BUFFET', tone: 'yes' },
    { text: 'OUTLOOK GOOD FOR TACOS', tone: 'yes' },
    { text: 'SIGNS POINT TO PANCAKES', tone: 'yes' },
    { text: 'YOU MAY RELY ON THE CROCKPOT', tone: 'yes' },
    { text: 'MAYBE — CHECK THE WEATHER', tone: 'maybe' },
    { text: 'THE MENU IS HAZY', tone: 'maybe' },
    { text: 'ASK THE MAITRE D AGAIN', tone: 'maybe' },
    { text: 'THE OVEN IS STILL PREHEATING', tone: 'maybe' },
    { text: 'CANNOT PREDICT THE PORT', tone: 'maybe' },
    { text: 'NO — SKIP THE LEFTOVERS', tone: 'no' },
    { text: 'MY SOURCES SAY STAY IN PORT', tone: 'no' },
    { text: 'VERY DOUBTFUL, ORDER TAKEOUT', tone: 'no' },
    { text: 'DON\'T COUNT ON THE BUFFET', tone: 'no' },
    { text: 'OUTLOOK NOT SO GOOD FOR SOUFFLE', tone: 'no' }
  ];
  var BASES = { classic: CLASSIC, cyber: CYBER, fate: FATE };

  function blank() {
    return { mode: 'classic', customs: [], last: null, motion: 0, privateToday: null, log: [], quotaDay: 0, quotaN: 0, lastPost: 0 };
  }
  function cleanCustom(row) {
    if (!row || typeof row !== 'object') return null;
    var text = String(row.text || '').replace(/[\r\n]+/g, ' ').trim();
    if (!text || text.length > 80) return null;
    if (row.tone !== 'yes' && row.tone !== 'maybe' && row.tone !== 'no') return null;
    var id = String(row.id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
    return { id: id, text: text, tone: row.tone, local: !!row.local };
  }
  function load() {
    var data = blank();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return data;
      if (raw.mode === 'cyber' || raw.mode === 'fate' || raw.mode === 'classic') data.mode = raw.mode;
      if (Array.isArray(raw.customs)) {
        raw.customs.forEach(function (row) {
          var custom = cleanCustom(row);
          if (custom && data.customs.length < 40) data.customs.push(custom);
        });
      }
      if (raw.last && typeof raw.last.text === 'string' && raw.last.text) {
        data.last = {
          q: String(raw.last.q || '').slice(0, 140),
          text: String(raw.last.text).slice(0, 80),
          tone: raw.last.tone === 'no' || raw.last.tone === 'maybe' ? raw.last.tone : 'yes',
          at: Number(raw.last.at) || 0
        };
      }
      data.motion = raw.motion ? 1 : 0;
      if (raw.privateToday && typeof raw.privateToday === 'object') {
        data.privateToday = {
          day: Number(raw.privateToday.day) || 0,
          yes: Math.max(0, Number(raw.privateToday.yes) || 0),
          maybe: Math.max(0, Number(raw.privateToday.maybe) || 0),
          no: Math.max(0, Number(raw.privateToday.no) || 0)
        };
      }
      if (Array.isArray(raw.log)) data.log = raw.log.slice(-40);
      data.quotaDay = Number(raw.quotaDay) || 0;
      data.quotaN = Number(raw.quotaN) || 0;
      data.lastPost = Number(raw.lastPost) || 0;
    } catch (e) { /* private mode or bad cache */ }
    return data;
  }
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        mode: data.mode,
        customs: (data.customs || []).slice(-40),
        last: data.last || null,
        motion: data.motion ? 1 : 0,
        privateToday: data.privateToday || null,
        log: (data.log || []).slice(-40),
        quotaDay: data.quotaDay || 0,
        quotaN: data.quotaN || 0,
        lastPost: data.lastPost || 0
      }));
      return true;
    } catch (e) { return false; }
  }
  function pool(data) {
    var mode = data.mode === 'cyber' || data.mode === 'fate' ? data.mode : 'classic';
    var list = BASES[mode].map(function (row) {
      return { text: row.text, tone: row.tone, mode: mode };
    });
    (data.customs || []).forEach(function (row) {
      var custom = cleanCustom(row);
      if (custom) list.push({ text: custom.text, tone: custom.tone, mode: 'custom' });
    });
    return list;
  }
  function pick(data) {
    var list = pool(data || load());
    return list[Math.floor(Math.random() * list.length)];
  }
  function dayStamp(now) {
    return Math.floor((now || Date.now()) / 86400000) * 86400000;
  }
  function quick() {
    var data = load();
    var picked = pick(data);
    var day = dayStamp(Date.now());
    if (!data.privateToday || data.privateToday.day !== day) data.privateToday = { day: day, yes: 0, maybe: 0, no: 0 };
    data.privateToday[picked.tone] += 1;
    data.last = { q: '', text: picked.text, tone: picked.tone, at: Date.now() };
    save(data);
    return data.last;
  }
  function toneCount(list) {
    var counts = { yes: 0, maybe: 0, no: 0 };
    list.forEach(function (row) { counts[row.tone] += 1; });
    return counts;
  }
  window.MONDO_ORACLE = {
    KEY: KEY,
    load: load,
    save: save,
    pool: pool,
    pick: pick,
    quick: quick,
    dayStamp: dayStamp,
    counts: function () {
      return { classic: toneCount(CLASSIC), cyber: toneCount(CYBER), fate: toneCount(FATE) };
    },
    has: function (text) {
      return CLASSIC.concat(CYBER, FATE).some(function (row) { return row.text === text; });
    }
  };
})();
