(function () {
  var btn = document.getElementById('copyRules');
  var status = document.getElementById('copyStatus');
  var view = document.getElementById('rulesView');
  var fallback = document.getElementById('rulesFallback');
  var text = '';

  function say(msg) {
    if (status) status.textContent = msg;
  }

  function load() {
    return fetch('/board/database.rules.json', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('load');
      return res.text();
    }).then(function (raw) {
      var parsed = JSON.parse(raw);
      if (!parsed.rules) throw new Error('shape');
      text = raw.charAt(raw.length - 1) === '\n' ? raw : raw + '\n';
      if (view) view.textContent = text;
      if (fallback) fallback.value = text;
      var lines = text.split('\n').filter(function (line) { return line.length; }).length;
      say(lines + ' lines ready. One tap copies the whole file.');
      return text;
    }).catch(function () {
      say('Could not load board/database.rules.json.');
      return '';
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    if (!fallback) return Promise.reject(new Error('copy'));
    fallback.hidden = false;
    fallback.value = value;
    fallback.focus();
    fallback.select();
    return document.execCommand('copy') ? Promise.resolve() : Promise.reject(new Error('copy'));
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var ready = text ? Promise.resolve(text) : load();
      ready.then(function (value) {
        if (!value) throw new Error('empty');
        return copyText(value);
      }).then(function () {
        var lines = text.split('\n').filter(function (line) { return line.length; }).length;
        say('Copied all ' + lines + ' lines. Paste them into the Firebase rules editor.');
      }).catch(function () {
        if (fallback && text) {
          fallback.hidden = false;
          fallback.value = text;
          fallback.focus();
          fallback.select();
          say('The full JSON is highlighted in the box. Copy that selection.');
        }
      });
    });
  }

  load();

  var uidBox = document.getElementById('uidBox');
  var uidValue = document.getElementById('uidValue');
  var uidStatus = document.getElementById('uidStatus');
  var copyUid = document.getElementById('copyUid');

  function paintUid(user) {
    var signedIn = !!(user && user.uid && !user.isAnonymous);
    if (uidBox) uidBox.hidden = false;
    if (uidValue) uidValue.textContent = signedIn ? user.uid : 'Sign in to reveal this user id.';
    if (copyUid) copyUid.hidden = !signedIn;
  }
  function watchUid() {
    if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) return;
    firebase.auth().onAuthStateChanged(paintUid);
  }
  if (copyUid) {
    copyUid.addEventListener('click', function () {
      var value = uidValue ? uidValue.textContent : '';
      if (!value) return;
      var done = function () { if (uidStatus) uidStatus.textContent = 'Copied the user id.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done).catch(done);
      else done();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchUid);
  else watchUid();
})();
