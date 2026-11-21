/* Renders stocks/crypto.json. Prices stay in decimal form, including sub-millionth quotes. */
(function () {
  var year = document.getElementById('yr');
  if (year) year.textContent = String(new Date().getFullYear());

  var card = document.getElementById('sleeveCard');
  var updated = document.getElementById('updated');
  var stats = document.getElementById('sleeveStats');
  var status = document.getElementById('status');
  var rules = document.getElementById('rules');
  var watch = document.getElementById('watch');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function usd(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    var abs = Math.abs(n);
    var digits = abs >= 100 && Math.abs(n - Math.round(n)) < 1e-8 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
    var body = abs.toFixed(digits);
    if (digits === 8) body = body.replace(/0+$/, '').replace(/\.$/, '');
    var parts = body.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '\u2212' : '') + '$' + parts.join('.');
  }

  function pct(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    var rounded = Math.round(n);
    var mark = rounded < 0 ? '\u2212' : rounded > 0 ? '+' : '';
    return mark + String(Math.abs(rounded)) + '%';
  }

  function tone(value) {
    var n = Number(value);
    if (!isFinite(n) || n === 0) return '';
    return n < 0 ? 'is-down' : 'is-up';
  }

  function stat(label, value, className) {
    var node = el('div', className ? 'paper-stat ' + className : 'paper-stat');
    node.appendChild(el('span', '', label));
    node.appendChild(el('b', '', value));
    return node;
  }

  function dayLabel(iso) {
    var parts = String(iso || '').slice(0, 10).split('-');
    var month = MONTHS[Number(parts[1]) - 1];
    if (!month || parts.length < 3) return String(iso || '');
    return month + ' ' + Number(parts[2]) + ', ' + parts[0];
  }

  function updatedLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return 'Updated ' + String(iso || '');
    var text = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
    return 'Updated ' + text + ' ET';
  }

  function positionsLabel(list) {
    if (!list || !list.length) return 'None';
    var names = [];
    list.forEach(function (item) {
      if (typeof item === 'string' && item) names.push(item);
      else if (item && item.symbol) names.push(item.symbol);
    });
    return names.length ? names.join(', ') : String(list.length);
  }

  function coinCard(row) {
    var cardNode = el('article', 'paper-card');
    var symbol = row.symbol || '';
    var name = row.name && row.name !== symbol ? symbol + ' ' + row.name : (symbol || row.name || '');
    cardNode.appendChild(el('h3', '', name));
    var grid = el('div', 'paper-stats');
    grid.appendChild(stat('Price', usd(row.price)));
    grid.appendChild(stat('30-day', pct(row.chg30d), tone(row.chg30d)));
    grid.appendChild(stat('vs 200-day', pct(row.vs200d), tone(row.vs200d)));
    grid.appendChild(stat('200-day', usd(row.ma200)));
    cardNode.appendChild(grid);
    if (row.note) cardNode.appendChild(el('p', 'paper-fine', row.note));
    return cardNode;
  }

  function fail(message) {
    if (status) status.textContent = message;
    if (card) card.removeAttribute('aria-busy');
  }

  fetch(new URL('../crypto.json', window.location.href).href, { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('missing');
      return response.json();
    })
    .then(function (data) {
      var sleeve = data.sleeve || {};
      if (updated) updated.textContent = updatedLabel(data.updatedAt);
      if (stats) {
        stats.appendChild(stat('Equity', usd(sleeve.equity)));
        stats.appendChild(stat('Cash', usd(sleeve.cash)));
        stats.appendChild(stat('Positions', positionsLabel(sleeve.positions)));
        stats.appendChild(stat('Started', dayLabel(sleeve.start)));
      }
      if (status) status.textContent = data.status || '';
      (data.rules || []).forEach(function (rule) {
        if (rules) rules.appendChild(el('li', '', rule));
      });
      (data.watchlist || []).forEach(function (row) {
        if (watch) watch.appendChild(coinCard(row));
      });
      if (card) card.removeAttribute('aria-busy');
    })
    .catch(function () {
      fail('The sleeve file did not load.');
    });
})();
