/**
 * ForgeMVP - rescue a page that was opened straight from disk.
 *
 * Deliberately a PLAIN (non-module) script: browsers refuse to load ES modules on
 * file:// pages, but classic scripts still run, so this is the one piece of code
 * that can help when someone double-clicks public\admin.html.
 *
 * If the local server is up, it sends the browser to the http:// address where the
 * page actually works. If it is not up, it says so instead of leaving a dead page.
 *
 * Does nothing at all when the page is already served over http(s).
 */
(function () {
  if (location.protocol !== 'file:') return;

  var note = document.getElementById('probeNote');
  var page = location.pathname.split('/').pop() || 'index.html';
  var origin = 'http://localhost:8080';
  var target = origin + '/' + page;
  var settled = false;

  function say(text) {
    if (note) note.textContent = text;
  }

  say('Looking for the ForgeMVP server at ' + origin + ' ...');

  var giveUp = setTimeout(function () {
    if (settled) return;
    settled = true;
    say(
      origin +
        ' did not answer, so the server is not running. Double-click install-startup.bat once ' +
        '(it makes the server start with Windows), or start.bat for now, then reload this page.'
    );
  }, 3000);

  if (typeof fetch !== 'function') {
    clearTimeout(giveUp);
    settled = true;
    say('This browser cannot check for the local server. Start it with start.bat, then open ' + target);
    return;
  }

  fetch(origin + '/', { mode: 'no-cors', cache: 'no-store' })
    .then(function () {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      say('Found the server - opening ' + target);
      location.replace(target);
    })
    .catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      say(
        origin +
          ' is not answering, so the server is not running. Double-click install-startup.bat once ' +
          '(it makes the server start with Windows), or start.bat for now, then reload this page.'
      );
    });
})();
