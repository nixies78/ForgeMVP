/**
 * ForgeMVP - rescue a page that was opened straight from disk.
 *
 * Deliberately a PLAIN (non-module) script: browsers refuse to load ES modules on
 * file:// pages, but classic scripts still run, so this is the one piece of code
 * that can help when someone double-clicks public\admin.html - or a mockup under
 * public\concepts\, which fetches its data and so cannot work from disk either.
 *
 * If the local server is up, it sends the browser to the http:// address where the
 * page actually works. If it is not up, it says so instead of leaving a dead page.
 *
 * Does nothing at all when the page is already served over http(s).
 */
(function () {
  if (location.protocol !== 'file:') return;

  var origin = 'http://localhost:8080';
  var note = null;
  var settled = false;

  /**
   * Where this page sits below the site root, so the redirect lands on the same page.
   *
   * A mockup lives two folders down (concepts/randomiser-1-slots/index.html), and
   * redirecting to its file name alone lands the reader on the home page - which is the
   * fault this function exists to prevent. The site root is read out of this script's own
   * URL: it is served from js/, directly below that root, so the answer stays right
   * without this file having to know the folder is called "public" or where the checkout
   * happens to live.
   */
  function pagePath() {
    var here = location.href.replace(/[?#].*$/, '');
    var src = document.currentScript && document.currentScript.src;
    if (src) {
      var root = src.replace(/[?#].*$/, '').replace(/\/[^/]*$/, ''); // .../js
      root = root.replace(/\/[^/]*$/, '/');                         // the site root
      if (here.indexOf(root) === 0) return here.slice(root.length);
    }
    var marker = here.indexOf('/public/');           // a checkout whose root is public/
    if (marker !== -1) return here.slice(marker + '/public/'.length);
    return here.split('/').pop() || 'index.html';    // last resort: a flat page
  }

  var target = origin + '/' + pagePath();

  /** The app pages name a #probeNote of their own. A mockup has none, so one is made on
   *  demand - and only for a message worth showing, so a page that is about to hand
   *  over cleanly never flashes a warning bar. */
  function notice() {
    if (note) return note;
    note = document.getElementById('probeNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'probeNote';
      note.setAttribute('role', 'status');
      note.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
        'background:#2A1113;color:#FE8989;border-top:2px solid #FE8989;' +
        'font:600 14px/1.5 system-ui,"Segoe UI",sans-serif;padding:10px 14px;';
      (document.body || document.documentElement).appendChild(note);
    }
    return note;
  }

  /** Quiet: only the page's own element, if it has one. */
  function say(text) {
    var existing = document.getElementById('probeNote');
    if (existing) existing.textContent = text;
  }

  /** Loud: make sure the reader sees it, on a page that never had somewhere to put it. */
  function announce(text) {
    notice().textContent = text;
  }

  say('Looking for the ForgeMVP server at ' + origin + ' ...');

  var giveUp = setTimeout(function () {
    if (settled) return;
    settled = true;
    announce(
      origin +
        ' did not answer, so the server is not running. Double-click install-startup.bat once ' +
        '(it makes the server start with Windows), or start.bat for now, then reload this page.'
    );
  }, 3000);

  if (typeof fetch !== 'function') {
    clearTimeout(giveUp);
    settled = true;
    announce('This browser cannot check for the local server. Start it with start.bat, then open ' + target);
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
      announce(
        origin +
          ' is not answering, so the server is not running. Double-click install-startup.bat once ' +
          '(it makes the server start with Windows), or start.bat for now, then reload this page.'
      );
    });
})();
