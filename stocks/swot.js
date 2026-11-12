/* Company SWOT cards. Reads stocks/swot/<TICKER>.json. A missing file renders nothing. */
(function () {
  'use strict';

  var TICKER = /^[A-Z]{1,5}(?:-[A-Z])?$/;
  var cache = Object.create(null);
  var openState = Object.create(null);
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var QUADS = [
    ['Strengths', 'strengths', 'is-pos'],
    ['Weaknesses', 'weaknesses', 'is-neg'],
    ['Opportunities', 'opportunities', 'is-pos'],
    ['Threats', 'threats', 'is-neg']
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function startsOpen(key) {
    /* Collapsed until the reader opens it, including at a 390px phone width.
       A SWOT link calls preferOpen before the card is built. */
    return openState[key] === true;
  }

  function dateLabel(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return String(iso || '');
    var month = MONTHS[Number(match[2]) - 1];
    if (!month) return String(iso);
    return month + ' ' + Number(match[3]) + ', ' + match[1];
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ''), window.location.origin);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      return parsed.href;
    } catch (e) {
      return '';
    }
  }

  function usable(data, ticker) {
    if (!data || typeof data !== 'object' || data.ticker !== ticker) return false;
    if (!TICKER.test(ticker) || typeof data.name !== 'string' || !data.name.trim()) return false;
    if (typeof data.seriousThreat !== 'boolean') return false;
    if (typeof data.decisionNote !== 'string' || !data.decisionNote.trim()) return false;
    for (var i = 0; i < QUADS.length; i++) {
      var list = data[QUADS[i][1]];
      if (!Array.isArray(list) || list.length < 2 || list.length > 3) return false;
      for (var j = 0; j < list.length; j++) {
        if (typeof list[j] !== 'string' || !list[j].trim()) return false;
      }
    }
    return true;
  }

  function fileUrl(ticker) {
    var path = window.location.pathname || '';
    var inPaper = path.indexOf('/paper/') !== -1 || /\/paper$/.test(path);
    return (inPaper ? '../swot/' : 'swot/') + encodeURIComponent(ticker) + '.json';
  }

  function load(ticker) {
    if (!TICKER.test(ticker || '')) return Promise.resolve(null);
    if (!Object.prototype.hasOwnProperty.call(cache, ticker)) {
      cache[ticker] = fetch(fileUrl(ticker))
        .then(function (response) {
          if (!response.ok) throw new Error('missing');
          return response.json();
        })
        .then(function (data) {
          return usable(data, ticker) ? data : null;
        })
        .catch(function () { return null; });
    }
    return cache[ticker];
  }

  function render(data, opts) {
    var stateKey = opts.stateKey || opts.id || data.ticker;
    var level = opts.level === 4 ? 'h4' : 'h3';
    var root = el('div', 'swot-block');
    if (opts.id) root.id = opts.id;

    if (data.seriousThreat === true) {
      var flag = el('p', 'swot-flag');
      flag.appendChild(el('b', '', 'Caution'));
      if (typeof data.threatNote === 'string' && data.threatNote.trim()) {
        flag.appendChild(document.createTextNode(' ' + data.threatNote.trim()));
      }
      root.appendChild(flag);
    }

    var details = el('details', 'swot-card');
    details.open = startsOpen(stateKey);
    details.addEventListener('toggle', function () {
      openState[stateKey] = details.open;
    });
    var summary = document.createElement('summary');
    summary.appendChild(el('span', 'swot-sum', 'SWOT'));
    if (data.seriousThreat === true) summary.appendChild(el('span', 'swot-chip', 'Caution'));
    details.appendChild(summary);

    var body = el('div', 'swot-body');
    var asOf = el('p', 'swot-asof');
    asOf.appendChild(el('b', '', data.name.trim()));
    var asOfText = dateLabel(data.asOf);
    if (asOfText) asOf.appendChild(document.createTextNode(' · As of ' + asOfText));
    body.appendChild(asOf);

    var grid = el('div', 'swot-grid');
    QUADS.forEach(function (quad) {
      var section = el('section', 'swot-quad ' + quad[2]);
      section.appendChild(el(level, '', quad[0]));
      var list = document.createElement('ul');
      data[quad[1]].forEach(function (item) {
        list.appendChild(el('li', '', item.trim()));
      });
      section.appendChild(list);
      grid.appendChild(section);
    });
    body.appendChild(grid);

    var decision = el('p', 'swot-decision');
    decision.appendChild(el('b', '', 'Decision'));
    decision.appendChild(document.createTextNode(' ' + data.decisionNote.trim()));
    body.appendChild(decision);

    if (data.seriousThreat !== true && typeof data.threatNote === 'string' && data.threatNote.trim()) {
      var note = el('details', 'swot-note');
      note.appendChild(el('summary', '', 'Threat note'));
      note.appendChild(el('p', '', data.threatNote.trim()));
      body.appendChild(note);
    }

    if (Array.isArray(data.sources) && data.sources.length) {
      var heading = el(level, 'swot-sources-title', 'Sources');
      var sources = el('ul', 'swot-sources');
      data.sources.forEach(function (source) {
        if (!source || typeof source.title !== 'string' || !source.title.trim()) return;
        var href = safeUrl(source.url);
        if (!href) return;
        var item = document.createElement('li');
        var link = el('a', '', source.title.trim());
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
        if (source.date) {
          var time = el('time', '', dateLabel(source.date));
          time.dateTime = String(source.date);
          item.appendChild(time);
        }
        sources.appendChild(item);
      });
      if (sources.childNodes.length) body.append(heading, sources);
    }

    details.appendChild(body);
    root.appendChild(details);
    return root;
  }

  function mount(slot, ticker, opts) {
    if (!slot) return;
    var options = opts || {};
    slot.replaceChildren();
    slot.dataset.swotFor = ticker || '';
    if (!TICKER.test(ticker || '')) return;
    load(ticker).then(function (data) {
      if (!slot.isConnected || slot.dataset.swotFor !== ticker) return;
      slot.replaceChildren();
      if (!data) return;
      var node = render(data, options);
      slot.appendChild(node);
      if (typeof options.onReady === 'function') options.onReady(node, data);
    });
  }

  function preferOpen(key) {
    openState[key] = true;
  }

  window.MONDO_SWOT = {
    load: load,
    mount: mount,
    preferOpen: preferOpen
  };
})();
