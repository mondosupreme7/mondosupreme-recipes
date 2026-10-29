(function () {
  var KEY = 'mondosupreme.quote_idx.v1';
  var CURATED = [
    { text: 'The best way out is always through.', author: 'Robert Frost' },
    { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
    { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
    { text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison' },
    { text: 'The journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
    { text: 'What you are stands over you the while, and thunders so that I cannot hear what you say to the contrary.', author: 'Ralph Waldo Emerson' },
    { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
    { text: 'You must do the thing you think you cannot do.', author: 'Eleanor Roosevelt' },
    { text: 'I learned that courage was not the absence of fear, but the triumph over it.', author: 'Nelson Mandela' },
    { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
    { text: 'We are all in the gutter, but some of us are looking at the stars.', author: 'Oscar Wilde' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
    { text: 'Courage is resistance to fear, mastery of fear, not absence of fear.', author: 'Mark Twain' },
    { text: 'If you tell the truth, you don\'t have to remember anything.', author: 'Mark Twain' },
    { text: 'The only limit to our realization of tomorrow will be our doubts of today.', author: 'Franklin D. Roosevelt' },
    { text: 'The only thing we have to fear is fear itself.', author: 'Franklin D. Roosevelt' },
    { text: 'Injustice anywhere is a threat to justice everywhere.', author: 'Martin Luther King Jr.' },
    { text: 'Darkness cannot drive out darkness; only light can do that. Hate cannot drive out hate; only love can do that.', author: 'Martin Luther King Jr.' },
    { text: 'The time is always right to do what is right.', author: 'Martin Luther King Jr.' },
    { text: 'I am the master of my fate: I am the captain of my soul.', author: 'William Ernest Henley' },
    { text: 'Two roads diverged in a wood, and I—I took the one less traveled by.', author: 'Robert Frost' },
    { text: 'The woods are lovely, dark and deep, but I have promises to keep, and miles to go before I sleep.', author: 'Robert Frost' },
    { text: 'Tell me, what is it you plan to do with your one wild and precious life?', author: 'Mary Oliver' },
    { text: 'Hope is the thing with feathers that perches in the soul.', author: 'Emily Dickinson' },
    { text: 'I dwell in Possibility.', author: 'Emily Dickinson' },
    { text: 'Not all those who wander are lost.', author: 'J. R. R. Tolkien' },
    { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
    { text: 'Stay hungry. Stay foolish.', author: 'Stewart Brand' },
    { text: 'That\'s one small step for a man, one giant leap for mankind.', author: 'Neil Armstrong' },
    { text: 'The important thing is not to stop questioning.', author: 'Albert Einstein' },
    { text: 'Ask not what your country can do for you—ask what you can do for your country.', author: 'John F. Kennedy' },
    { text: 'I think, therefore I am.', author: 'René Descartes' },
    { text: 'This above all: to thine own self be true.', author: 'William Shakespeare' },
    { text: 'The fault, dear Brutus, is not in our stars, but in ourselves.', author: 'William Shakespeare' },
    { text: 'We few, we happy few, we band of brothers.', author: 'William Shakespeare' },
    { text: 'Brevity is the soul of wit.', author: 'William Shakespeare' },
    { text: 'What does not kill me makes me stronger.', author: 'Friedrich Nietzsche' },
    { text: 'I have nothing to offer but blood, toil, tears and sweat.', author: 'Winston Churchill' },
    { text: 'If I have seen further it is by standing on the shoulders of giants.', author: 'Isaac Newton' },
    { text: 'The mass of men lead lives of quiet desperation.', author: 'Henry David Thoreau' },
    { text: 'Our life is frittered away by detail. Simplify, simplify.', author: 'Henry David Thoreau' },
    { text: 'I am no bird; and no net ensnares me.', author: 'Charlotte Brontë' },
    { text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', author: 'Jane Austen' },
    { text: 'So we beat on, boats against the current, borne back ceaselessly into the past.', author: 'F. Scott Fitzgerald' },
    { text: 'All animals are equal, but some animals are more equal than others.', author: 'George Orwell' },
    { text: 'It was the best of times, it was the worst of times.', author: 'Charles Dickens' },
    { text: 'I am large, I contain multitudes.', author: 'Walt Whitman' },
    { text: 'Do I dare disturb the universe?', author: 'T. S. Eliot' },
    { text: 'Do not go gentle into that good night.', author: 'Dylan Thomas' },
    { text: 'If you can keep your head when all about you are losing theirs.', author: 'Rudyard Kipling' },
    { text: 'How wonderful it is that nobody need wait a single moment before starting to improve the world.', author: 'Anne Frank' },
    { text: 'I am not afraid of storms, for I am learning how to sail my ship.', author: 'Louisa May Alcott' },
    { text: 'The world breaks everyone and afterward many are strong at the broken places.', author: 'Ernest Hemingway' },
    { text: 'There is no greater agony than bearing an untold story inside you.', author: 'Maya Angelou' },
    { text: 'You may shoot me with your words, you may cut me with your eyes, you may kill me with your hatefulness, but still, like air, I\'ll rise.', author: 'Maya Angelou' },
    { text: 'Ships at a distance have every man\'s wish on board.', author: 'Zora Neale Hurston' },
    { text: 'Freeing yourself was one thing, claiming ownership of that freed self was another.', author: 'Toni Morrison' },
    { text: 'We accept the love we think we deserve.', author: 'Stephen Chbosky' },
    { text: 'It is only with the heart that one can see rightly; what is essential is invisible to the eye.', author: 'Antoine de Saint-Exupéry' },
    { text: 'It\'s no use going back to yesterday, because I was a different person then.', author: 'Lewis Carroll' },
    { text: 'Why, sometimes I\'ve believed as many as six impossible things before breakfast.', author: 'Lewis Carroll' },
    { text: 'You have brains in your head. You have feet in your shoes.', author: 'Dr. Seuss' },
    { text: 'Unless someone like you cares a whole awful lot, nothing is going to get better. It\'s not.', author: 'Dr. Seuss' },
    { text: 'I have always depended on the kindness of strangers.', author: 'Tennessee Williams' },
    { text: 'After all, tomorrow is another day.', author: 'Margaret Mitchell' },
    { text: 'The unexamined life is not worth living.', author: 'Socrates' },
    { text: 'Float like a butterfly, sting like a bee.', author: 'Muhammad Ali' },
    { text: 'If you want to go fast, go alone. If you want to go far, go together.', author: 'Unknown' },
    { text: 'Fall seven times and stand up eight.', author: 'Unknown' }
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

  function displayAuthor(author) {
    var text = String(author == null ? '' : author).replace(/^[\s\u2014\u2013\-]+/, '').trim();
    if (!text) return '';
    var name = text.replace(/[,.].*$/, '').trim();
    if (/^mondo\s*supreme$/i.test(name)) return 'Unknown';
    return text;
  }
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
    var shown = displayAuthor(quote.author);
    if (shown) byEl.appendChild(document.createTextNode('— ' + shown));
    if (quote.pinned) {
      var flag = document.createElement('span');
      flag.className = 'quote-flag';
      flag.textContent = 'PINNED';
      byEl.appendChild(flag);
    }
    if (kicker) kicker.textContent = 'Quote of the Visit · ' + (index + 1) + ' of ' + total;
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
      label.textContent = (quote.pinned ? '[pinned] ' : '') + quote.text + (displayAuthor(quote.author) ? ' — ' + displayAuthor(quote.author) : '');
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
