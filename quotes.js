(function () {
  var KEY = 'mondosupreme.quote_idx.v1';
  var CURATED = [
    { text: 'The best way out is always through.', author: 'Robert Frost' },
    { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
    { text: 'Whether you think you can, or you think you can\'t, you\'re right.', author: 'Henry Ford' },
    { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
    { text: 'I have not failed. I\'ve just found 10,000 ways that will not work.', author: 'Thomas Edison' },
    { text: 'The journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
    { text: 'What you do speaks so loudly that I cannot hear what you say.', author: 'Ralph Waldo Emerson' },
    { text: 'Keep your face always toward the sunshine, and shadows will fall behind you.', author: 'Walt Whitman' },
    { text: 'It is never too late to be what you might have been.', author: 'George Eliot' },
    { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
    { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
    { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
    { text: 'You are never too old to set another goal or to dream a new dream.', author: 'C. S. Lewis' },
    { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
    { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
    { text: 'All our dreams can come true, if we have the courage to pursue them.', author: 'Walt Disney' },
    { text: 'Fall seven times and stand up eight.', author: 'Japanese proverb' },
    { text: 'A person who never made a mistake never tried anything new.', author: 'Albert Einstein' },
    { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
    { text: 'Be yourself; everyone else is already taken.', author: 'Oscar Wilde' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: 'Courage is resistance to fear, mastery of fear, not absence of fear.', author: 'Mark Twain' },
    { text: 'The only limit to our realization of tomorrow will be our doubts of today.', author: 'Franklin D. Roosevelt' },
    { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
    { text: 'Keep going. The next page is where it gets good.', author: 'Mondosupreme' },
    { text: 'Your modem is slow. Your curiosity is not. Keep clicking.', author: 'Mondosupreme, 1998' },
    { text: 'The guestbook remembers the people who were kind.', author: 'Mondosupreme' },
    { text: 'Under construction is a promise, not an apology.', author: 'A GeoCities footer' },
    { text: 'You have mail, and it might be exactly the note you needed.', author: 'Mondosupreme' },
    { text: 'Best viewed with hope, at any resolution.', author: 'Mondosupreme' },
    { text: 'The webring only works if somebody links forward.', author: 'Mondosupreme' },
    { text: 'Dial-up taught patience. Patience still compiles.', author: 'Mondosupreme' },
    { text: 'A blinking NEW! badge never built the page. You did.', author: 'Mondosupreme' },
    { text: 'Save early, save often, and tell your friends you love them.', author: 'Mondosupreme' },
    { text: 'The visitor counter started at zero. So did everything good.', author: 'Mondosupreme' },
    { text: 'Starfield backgrounds fade. The friends in the chat room do not.', author: 'Mondosupreme' },
    { text: 'If the page is still loading, the good part is on its way.', author: 'Mondosupreme' },
    { text: 'Hit counters do not measure courage. Showing up does.', author: 'Mondosupreme' },
    { text: 'Netscape crashed. The idea did not. Reopen the window.', author: 'Mondosupreme' },
    { text: 'Guestbooks filled up one kind sentence at a time.', author: 'Mondosupreme' },
    { text: 'You do not need a T1 line to send a good idea.', author: 'Mondosupreme' },
    { text: 'The under-construction gif is dancing because you kept going.', author: 'Mondosupreme' },
    { text: 'Somewhere a cursor is blinking, waiting for your next honest line.', author: 'Mondosupreme' },
    { text: '800 by 600 was enough room for a whole world.', author: 'Mondosupreme' },
    { text: 'The MIDI is cheesy. The welcome is sincere.', author: 'Mondosupreme' },
    { text: 'Refresh the page. Then refresh your nerve.', author: 'Mondosupreme' },
    { text: 'No frames were harmed, and neither were you. Continue.', author: 'Mondosupreme' },
    { text: 'A site this handmade means somebody believed you would visit.', author: 'Mondosupreme' },
    { text: 'The sparkle text is extra. Your effort is the point.', author: 'Mondosupreme' },
    { text: 'Log on. Leave the place a little kinder than you found it.', author: 'Mondosupreme' },
    { text: 'Yesterday\'s homepage is proof you can ship something.', author: 'Mondosupreme' },
    { text: 'The 404 is a door, not a verdict. Try the next link.', author: 'Mondosupreme' },
    { text: 'Pixel by pixel is still a picture.', author: 'Mondosupreme' },
    { text: 'Somebody bookmarked you. Be worth the bookmark.', author: 'Mondosupreme' },
    { text: 'You made it past the dial tone. That already counts.', author: 'Mondosupreme' },
    { text: 'Leave a note in the guestbook of somebody\'s day.', author: 'Mondosupreme' },
    { text: 'Progress looks like a half-built table and a second try.', author: 'Mondosupreme' },
    { text: 'The web was built by people who refused to wait for permission.', author: 'Mondosupreme' },
    { text: 'Turn the volume up on the good idea and down on the doubt.', author: 'Mondosupreme' },
    { text: 'A single link can reroute a whole afternoon toward hope.', author: 'Mondosupreme' },
    { text: 'You are the webmaster of your next hour. Publish something kind.', author: 'Mondosupreme' },
    { text: 'The cursor blinks because the sentence is not finished.', author: 'Mondosupreme' },
    { text: 'Even a floppy disk was a place to keep what mattered.', author: 'Mondosupreme' },
    { text: 'Come back tomorrow. The webring saved you a seat.', author: 'Mondosupreme' },
    { text: 'Make it sincere. The font can be Comic Sans.', author: 'Mondosupreme' },
    { text: 'The welcome mat is the sparkle gif. The rest is up to you.', author: 'Mondosupreme' },
    { text: 'Small pages, kept updated, outlast the loud ones.', author: 'Mondosupreme' },
    { text: 'If you are reading this, the connection held. So can you.', author: 'Mondosupreme' },
    { text: 'Don\'t wait for the perfect template. Ship the page you have.', author: 'Mondosupreme' },
    { text: 'A guest book signature is a tiny vow to come back.', author: 'Mondosupreme' },
    { text: 'The rainbow horizontal rule was never the point. You were.', author: 'Mondosupreme' },
    { text: 'One more honest try beats a perfect plan left offline.', author: 'Mondosupreme' }
  ];
  var textEl = document.getElementById('quoteText');
  var byEl = document.getElementById('quoteBy');
  var nextBtn = document.getElementById('quoteNext');
  var kicker = document.querySelector('.quote-kicker');
  var form = document.getElementById('quoteOwner');
  var statusEl = document.getElementById('quoteStatus');
  var customList = document.getElementById('quoteCustom');
  if (!textEl || !nextBtn) return;

  var custom = [];
  var current = null;
  var committed = false;
  var owner = false;

  function readLast() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw == null || raw === '') return NaN;
      var n = parseInt(raw, 10);
      return isFinite(n) ? n : NaN;
    } catch (e) {
      return NaN;
    }
  }
  function writeLast(index) {
    try { localStorage.setItem(KEY, String(index)); } catch (e) {}
  }
  function pool() {
    var list = CURATED.map(function (quote) {
      return { text: quote.text, author: quote.author, pinned: false, id: '' };
    });
    custom.forEach(function (quote) {
      var match = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].text === quote.text && list[i].author === quote.author) {
          match = list[i];
          break;
        }
      }
      if (match) {
        match.pinned = !!(quote.pinned || match.pinned);
        if (quote.id) match.id = quote.id;
      } else {
        list.push(quote);
      }
    });
    return list;
  }
  function pick(list, last) {
    var n = list.length;
    if (n <= 1) return 0;
    if (!isFinite(last)) return 0;
    var prev = Math.floor(last);
    var next = (prev + 1) % n;
    var guard = 0;
    while (guard < n && prev >= 0 && prev < n && list[next].text === list[prev].text && list[next].author === list[prev].author) {
      next = (next + 1) % n;
      guard++;
    }
    if (next === prev) next = (next + 1) % n;
    return next;
  }
  function paint(quote, index, total) {
    current = quote;
    textEl.textContent = quote.text;
    byEl.textContent = '';
    byEl.appendChild(document.createTextNode('— ' + quote.author));
    if (quote.pinned) {
      var flag = document.createElement('span');
      flag.className = 'quote-flag';
      flag.textContent = 'PINNED';
      byEl.appendChild(flag);
    }
    if (kicker) kicker.textContent = 'Windows 98 · Tip of the Visit · ' + (index + 1) + ' of ' + total;
  }
  function choice() {
    var list = pool();
    var next = pick(list, readLast());
    return { list: list, next: next, quote: list[next] };
  }
  function preview() {
    var picked = choice();
    paint(picked.quote, picked.next, picked.list.length);
  }
  function commit() {
    if (committed) return;
    committed = true;
    var picked = choice();
    writeLast(picked.next);
    paint(picked.quote, picked.next, picked.list.length);
  }
  function showNext() {
    if (!committed) commit();
    var list = pool();
    if (list.length < 2) return;
    var next = pick(list, readLast());
    writeLast(next);
    paint(list[next], next, list.length);
  }
  function refreshSame() {
    if (!current) return;
    var index = readLast();
    var list = pool();
    if (!isFinite(index) || index < 0 || index >= list.length) return;
    var quote = list[index];
    if (quote.text === current.text && quote.author === current.author) paint(quote, index, list.length);
  }
  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }
  function renderCustom() {
    if (!customList) return;
    customList.textContent = '';
    custom.forEach(function (quote) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.className = 'quote-custom-text';
      label.textContent = (quote.pinned ? '[pinned] ' : '') + quote.text + ' — ' + quote.author;
      var pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'btn';
      pinBtn.textContent = quote.pinned ? 'Unpin' : 'Pin';
      pinBtn.addEventListener('click', function () {
        savePin(quote.id, !quote.pinned);
      });
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function () {
        removeQuote(quote.id);
      });
      li.appendChild(label);
      li.appendChild(pinBtn);
      li.appendChild(removeBtn);
      customList.appendChild(li);
    });
  }
  function applyCustom(snap) {
    var next = [];
    snap.forEach(function (child) {
      var value = child.val() || {};
      if (typeof value.text !== 'string' || typeof value.author !== 'string') return;
      next.push({
        id: child.key,
        text: value.text,
        author: value.author,
        pinned: value.pinned === true,
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0
      });
    });
    next.sort(function (a, b) {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id < b.id ? -1 : 1;
    });
    custom = next;
    renderCustom();
    try { sessionStorage.setItem('mondosupreme.quotes.cache.v1', JSON.stringify(custom)); } catch (e) {}
    if (!committed) commit();
    else refreshSame();
  }
  function readCache() {
    try {
      var raw = sessionStorage.getItem('mondosupreme.quotes.cache.v1');
      if (raw == null) return false;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;
      custom = parsed.filter(function (quote) {
        return quote && typeof quote.text === 'string' && typeof quote.author === 'string';
      }).map(function (quote) {
        return {
          id: typeof quote.id === 'string' ? quote.id : '',
          text: quote.text,
          author: quote.author,
          pinned: quote.pinned === true,
          createdAt: typeof quote.createdAt === 'number' ? quote.createdAt : 0
        };
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  function db() {
    if (typeof firebase === 'undefined' || !window.MONDO_BOARD_CONFIG || !window.MONDO_BOARD_CONFIG.apiKey) return null;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONDO_BOARD_CONFIG);
      return firebase.database();
    } catch (e) {
      return null;
    }
  }
  function savePin(id, pinned) {
    var database = db();
    if (!database || !id) return;
    database.ref('quotes/custom/' + id).update({ pinned: pinned }).then(function () {
      setStatus(pinned ? 'Pinned.' : 'Unpinned.');
    }).catch(function () {
      setStatus('Could not update that quote. Publish the /quotes rules, then try again.');
    });
  }
  function removeQuote(id) {
    var database = db();
    if (!database || !id) return;
    database.ref('quotes/custom/' + id).remove().then(function () {
      setStatus('Removed from the shared pool.');
    }).catch(function () {
      setStatus('Could not remove that quote.');
    });
  }
  function addQuote(text, author, pinned) {
    var database = db();
    if (!database) {
      setStatus('Quotes need Firebase before they can be saved.');
      return;
    }
    database.ref('quotes/custom').push({
      text: text,
      author: author,
      pinned: pinned,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      setStatus('Added to the shared pool.');
      var input = document.getElementById('quoteInput');
      var authorInput = document.getElementById('quoteAuthorInput');
      var pin = document.getElementById('quotePin');
      if (input) input.value = '';
      if (authorInput) authorInput.value = '';
      if (pin) pin.checked = false;
    }).catch(function () {
      setStatus('Could not add that quote. Sign in as the webmaster and publish the /quotes rules.');
    });
  }
  function pinCurrent() {
    if (!current) return;
    if (current.id) {
      savePin(current.id, true);
      return;
    }
    var existing = null;
    for (var i = 0; i < custom.length; i++) {
      if (custom[i].text === current.text && custom[i].author === current.author) {
        existing = custom[i];
        break;
      }
    }
    if (existing) {
      savePin(existing.id, true);
      return;
    }
    addQuote(current.text, current.author, true);
  }
  function setOwner(on) {
    owner = !!on;
    if (form) form.hidden = !owner;
  }

  nextBtn.addEventListener('click', showNext);
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!owner) return;
      var input = document.getElementById('quoteInput');
      var authorInput = document.getElementById('quoteAuthorInput');
      var pin = document.getElementById('quotePin');
      var text = input ? input.value.replace(/\s+/g, ' ').trim() : '';
      var author = authorInput ? authorInput.value.replace(/\s+/g, ' ').trim() : '';
      if (!text || !author) return;
      if (text.length > 240 || author.length > 60) {
        setStatus('Keep the quote under 240 characters and the author under 60.');
        return;
      }
      addQuote(text, author, !!(pin && pin.checked));
    });
  }
  var pinCurrentBtn = document.getElementById('quotePinCurrent');
  if (pinCurrentBtn) pinCurrentBtn.addEventListener('click', pinCurrent);
  document.addEventListener('mondo-owner', function (event) {
    setOwner(event.detail && event.detail.on);
  });
  if (window.MONDO_MEMBER && typeof window.MONDO_MEMBER.isOwner === 'function') {
    setOwner(window.MONDO_MEMBER.isOwner());
  }
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && committed) showNext();
  });

  var database = db();
  if (readCache() || !database) commit();
  else preview();
  if (!database) return;
  database.ref('quotes/custom').on('value', function (snap) {
    applyCustom(snap);
  }, function () {
    if (!committed) commit();
  });
  setTimeout(function () {
    if (!committed) commit();
  }, 800);
})();
