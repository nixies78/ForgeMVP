/**
 * Smoke tests for the static server: path safety plus real HTTP fetches of the
 * three pages. Run:  node tests/server.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';

import {
  createServer,
  describeListenError,
  resolveRequestPath,
  injectLiveReload,
  LIVE_RELOAD_PATH,
  LIVE_RELOAD_SNIPPET,
  PUBLIC_DIR,
} from '../server.js';

const ROOT = path.dirname(PUBLIC_DIR);

/* ----------------------------- path resolution ----------------------------- */

test('resolveRequestPath maps the routes we care about', () => {
  assert.equal(resolveRequestPath('/'), path.join(PUBLIC_DIR, 'index.html'));
  assert.equal(resolveRequestPath('/admin.html'), path.join(PUBLIC_DIR, 'admin.html'));
  assert.equal(resolveRequestPath('/chat.html'), path.join(PUBLIC_DIR, 'chat.html'));
  assert.equal(resolveRequestPath('/js/../js/admin.js'), path.join(PUBLIC_DIR, 'js', 'admin.js'));
  assert.equal(resolveRequestPath('/%61dmin.html'), path.join(PUBLIC_DIR, 'admin.html'));
});

test('resolveRequestPath refuses to escape the public folder', () => {
  // Plain ".." is already collapsed by URL parsing, so it lands inside public/ (and 404s).
  assert.equal(resolveRequestPath('/../../server.js'), path.join(PUBLIC_DIR, 'server.js'));
  // Percent-encoded traversal is decoded after parsing and must be rejected.
  assert.equal(resolveRequestPath('/..%2f..%2fserver.js'), null);
  assert.equal(resolveRequestPath('/..%2f..%2f..%2fWindows%2fwin.ini'), null);
  assert.equal(resolveRequestPath('/js/..%2f..%2fpackage.json'), null);
});

/* ----------------------------- real HTTP ----------------------------- */

test('the server serves every page and asset with the right content type', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const cases = [
    ['/', 'text/html', /UEFN Game Guide/],
    ['/', 'text/html', /css\/guide\.css/],
    ['/', 'text/html', /js\/guide\/app\.js/],
    ['/data/uefn_device_logic.json', 'application/json', /"game_types"/],
    ['/index.html', 'text/html', /href="admin\.html"/],
    ['/admin.html', 'text/html', /OpenRouter API key/],
    ['/admin.html', 'text/html', /choose the llm/i],
    ['/chat.html', 'text/html', /Chat test/],
    ['/css/styles.css', 'text/css', /--accent/],
    ['/js/config.js', 'text/javascript', /deepseek\/deepseek-v4\.1-flash/],
    ['/js/openrouter.js', 'text/javascript', /chat\/completions/],
    ['/js/admin.js', 'text/javascript', /testConnection/],
    ['/js/chat.js', 'text/javascript', /chatStream/],
    ['/assets/logo.svg', 'image/svg+xml', /<svg/],
    ['/assets/admin-logo.svg', 'image/svg+xml', /<svg/],
  ];

  for (const [pathname, type, bodyMatch] of cases) {
    const res = await fetch(base + pathname);
    const body = await res.text();
    assert.equal(res.status, 200, `${pathname} should load`);
    assert.ok(res.headers.get('content-type').includes(type), `${pathname} content type was ${res.headers.get('content-type')}`);
    assert.match(body, bodyMatch, `${pathname} contents`);
    // Must revalidate (no-cache + a strong ETag) rather than being blindly reused.
    assert.match(res.headers.get('cache-control'), /no-cache/, `${pathname} must revalidate`);
    assert.ok(res.headers.get('etag'), `${pathname} must carry an ETag or edits can go unseen`);
  }
});

test('every page links the admin page from its header', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await (await fetch(`${base}/`)).text();
  /* The header logo is the reset to the start of the guide (the architecture spec is explicit about
   * this); Admin, the header's one action, is the library's secondary control as of 1.2.0, and the mark is
   * the app's own component as of 1.2.1, when the legacy pill class stopped being drawn around it. */
  assert.match(home, /<a class="sh-logo" href="#\/home"/, 'the home page logo resets to the start of the guide');
  assert.match(home, /<img src="assets\/logo_epic\.svg"/, 'the header mark is the Epic logo 1.2.1 names');
  assert.match(home, /<a class="sh-btn sh-btn-secondary[^"]*" href="admin\.html"/, 'the Admin action reaches the admin page');
  /* The footer's system status carries the plain admin link, in the wording the spec gives it. */
  assert.match(home, /href="admin\.html"[^>]*>Go to admin page</, 'home page has a plain admin link');

  const admin = await (await fetch(`${base}/admin.html`)).text();
  assert.match(admin, /class="logo-link" href="index\.html"/, 'admin page logo links home');

  const chat = await (await fetch(`${base}/chat.html`)).text();
  assert.match(chat, /class="logo-link" href="index\.html"/, 'chat page logo links home');
});

test('unknown paths return a helpful 404', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const res = await fetch(`${base}/nope.html`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Back to the home page/);
});

test('live reload is off by default, so production pages are served untouched', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const html = await (await fetch(`${base}/`)).text();
  assert.equal(html, await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8'));
  assert.equal((await fetch(`${base}${LIVE_RELOAD_PATH}`)).status, 404);
});

test('with live reload on, pages get the reload script and changes are announced', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-live-'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><body><p>hi</p></body>');
  const server = createServer(dir, { live: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  const res = await fetch(`${base}/`);
  const html = await res.text();
  assert.ok(html.includes(LIVE_RELOAD_SNIPPET + '</body>'), 'the script goes just before </body>');
  assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(html));

  const stream = await fetch(`${base}${LIVE_RELOAD_PATH}`);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let seen = decoder.decode((await reader.read()).value);
  assert.match(seen, /data: \w+/, 'the stream opens with the boot id');

  await writeFile(path.join(dir, 'index.html'), '<!doctype html><body><p>changed</p></body>');
  const deadline = Date.now() + 5000;
  while (!seen.includes('data: reload') && Date.now() < deadline) {
    seen += decoder.decode((await reader.read()).value);
  }
  assert.ok(seen.includes('data: reload'), 'a file change is announced to open pages');
  await reader.cancel();
});

test('injectLiveReload works with and without a closing body tag', () => {
  assert.equal(injectLiveReload('<p>a</p></body></html>'), '<p>a</p>' + LIVE_RELOAD_SNIPPET + '</body></html>');
  assert.equal(injectLiveReload('<p>a</p>'), '<p>a</p>' + LIVE_RELOAD_SNIPPET);
});

test('a revalidated request gets 304, so unchanged files are not resent', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const first = await fetch(`${base}/js/config.js`);
  const etag = first.headers.get('etag');
  await first.text();
  assert.ok(etag, 'the first response must expose an ETag');

  const second = await fetch(`${base}/js/config.js`, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304, 'an unchanged file must answer 304');
  assert.equal((await second.text()).length, 0, 'a 304 must not carry a body');

  // A stale validator must still get the real content.
  const third = await fetch(`${base}/js/config.js`, { headers: { 'If-None-Match': '"stale"' } });
  assert.equal(third.status, 200);
  assert.ok((await third.text()).length > 0);
});

test('the Admin link in the markup matches the admin page filename', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await (await fetch(`${base}/`)).text();

  /* The header's Admin action is the admin entry point, and its target has to be a real file. */
  const target = home.match(/class="sh-btn sh-btn-secondary[^"]*" href="([^"]+)"/)?.[1];
  assert.ok(target, 'the home page header carries an Admin action');

  const res = await fetch(`${base}/${target}`);
  await res.text();
  assert.equal(res.status, 200, 'the Admin action target exists');

  /* The logo no longer names a file: it resets to the start of the guide, so there is nothing to 404. */
  const logo = home.match(/<a class="sh-logo" href="([^"]+)"/)?.[1];
  assert.equal(logo, '#/home', 'the logo is a reset to the home route');
  /* The mark it draws, on the other hand, is a real file, and it is the one 1.2.1 names. */
  const mark = home.match(/<img src="(assets\/logo_epic\.svg)"/)?.[1];
  assert.ok(mark, 'the header draws the Epic mark');
  const markRes = await fetch(`${base}/${mark}`);
  assert.equal(markRes.status, 200, 'the Epic mark is served');
});

test('every element id the page scripts look up exists in its markup', async () => {
  const pairs = [
    ['js/admin.js', 'admin.html'],
    ['js/chat.js', 'chat.html'],
    ['js/guide/app.js', 'index.html'],
  ];

  for (const [script, page] of pairs) {
    const js = await readFile(path.join(PUBLIC_DIR, script), 'utf8');
    const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');

    const ids = [...js.matchAll(/(?:el|getElementById)\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, `${script} should look up element ids`);

    for (const id of new Set(ids)) {
      assert.ok(html.includes(`id="${id}"`), `${page} is missing id="${id}" required by ${script}`);
    }
  }
});

test('the pages load their scripts as ES modules', async () => {
  for (const page of ['index.html', 'admin.html', 'chat.html']) {
    const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="css\/styles\.css"/, `${page} loads the stylesheet`);
    // index.html's app is the guide, whose module lives under js/guide/.
    assert.match(html, /<script type="module" src="js\/[a-z/]+\.js"><\/script>/, `${page} loads a module script`);
  }
});

/* ------------- regression guards for the file:// trap ------------- */

test('every page detects being opened from disk and warns the user', async () => {
  for (const page of ['index.html', 'admin.html', 'chat.html']) {
    const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
    // A plain (non-module) inline script, because module scripts never run on file://.
    assert.match(
      html,
      /location\.protocol === 'file:' \? 'opened-from-disk' : 'served-over-http'/,
      `${page} must detect the file:// protocol with an inline script`
    );
    assert.match(html, /class="status warn local-server-warning"/, `${page} must contain the warning banner`);
    assert.match(html, /href="http:\/\/localhost:8080\//, `${page} must link to the servable URL`);
    assert.match(html, /install-startup\.bat/, `${page} must tell the user about the one-time installer`);
  }
});

test('the banner is hidden when the page is served over http', async () => {
  const css = await readFile(path.join(PUBLIC_DIR, 'css', 'styles.css'), 'utf8');
  assert.match(css, /\.local-server-warning \{ display: none; \}/);
  assert.match(css, /html\.opened-from-disk \.local-server-warning \{ display: block; \}/);
});

test('admin, chat and the guide detect a module that never loaded', async () => {
  const pages = [
    ['index.html', 'js/guide/app.js'],
    ['admin.html', 'js/admin.js'],
    ['chat.html', 'js/chat.js'],
  ];

  for (const [page, script] of pages) {
    const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
    const js = await readFile(path.join(PUBLIC_DIR, script), 'utf8');

    assert.match(html, /id="scriptFailure"/, `${page} needs the "scripts did not load" notice`);
    assert.match(html, /document\.documentElement\.dataset\.appReady !== 'true'/, `${page} needs the watchdog`);
    assert.match(
      html,
      /document\.getElementById\('scriptFailure'\)/,
      `${page} watchdog must reveal #scriptFailure`
    );
    assert.ok(html.includes('id="scriptFailure"') && html.includes("getElementById('scriptFailure')"),
      `${page} watchdog target must exist in the same page`);
    assert.match(js, /document\.documentElement\.dataset\.appReady = 'true'/, `${script} must flag itself as ready`);
  }
});

test('start.bat launches the server with a browser and no install step', async () => {
  const bat = await readFile(path.join(ROOT, 'start.bat'), 'utf8');
  assert.match(bat, /node server\.js --open/, 'start.bat runs the server in open mode');
  assert.match(bat, /where node/i, 'start.bat checks that Node is installed');
  assert.match(bat, /cd \/d "%~dp0"/, 'start.bat works from any working directory');
});

test('describeListenError turns a busy port into advice, not a crash', () => {
  const busy = describeListenError(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 8080);
  assert.equal(busy.alreadyRunning, true);
  assert.match(busy.message, /already in use/);
  assert.match(busy.message, /http:\/\/localhost:8080\/admin\.html/);

  const denied = describeListenError(Object.assign(new Error('listen EACCES'), { code: 'EACCES' }), 80);
  assert.equal(denied.alreadyRunning, false);
  assert.match(denied.message, /Permission denied/);

  assert.equal(describeListenError(new Error('boom'), 8080).alreadyRunning, false);
  assert.match(describeListenError(new Error('boom'), 8080).message, /boom/);
});

test('the logon launcher starts a hidden server and opens the admin page', async () => {
  const vbs = await readFile(path.join(ROOT, 'autostart-forgemvp.vbs'), 'utf8');

  assert.match(vbs, /\\server\.js"""/, 'launcher runs server.js by default');
  assert.match(vbs, /command & " --open"/, 'launcher opens the page unless OPEN=0');
  assert.match(vbs, /Setting\("PORT", "8080"\)/, 'the port defaults to 8080 without local settings');
  assert.match(vbs, /\\tools\\dev-supervisor\.mjs/, 'LIVE=1 runs the always-on dev supervisor');
  assert.match(vbs, /, 0, False/, 'the server window is hidden and not waited on');
  assert.match(vbs, /GetParentFolderName\(WScript\.ScriptFullName\)/, 'repo folder is derived from the script location');
  assert.match(vbs, /where node/, 'launcher looks up node.exe on PATH');
  assert.match(vbs, /%ProgramFiles%\\nodejs\\node\.exe/, 'launcher falls back to the default install path');
  assert.match(vbs, /MsgBox/, 'launcher reports a missing Node.js install');
  // "file://" may appear in the comments explaining why this exists; a real file URL
  // (file:///C:/...) must never be a target.
  assert.doesNotMatch(vbs, /file:\/\/\//, 'the launcher must never use a file:// path');
});

test('the installer registers the launcher in Startup and adds a desktop shortcut', async () => {
  const bat = await readFile(path.join(ROOT, 'install-startup.bat'), 'utf8');

  assert.match(bat, /%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup/, 'writes into the per-user Startup folder');
  assert.match(bat, /CreateShortcut\('%LNK%'\)/, 'creates the Startup shortcut');
  assert.match(bat, /TargetPath = 'wscript\.exe'/, 'the shortcut runs the launcher via wscript');
  assert.match(bat, /autostart-forgemvp\.vbs/, 'the shortcut points at the launcher in the repo, so later edits still apply');
  assert.match(bat, /set "LABEL=ForgeMVP Admin"/, 'the desktop shortcut is named ForgeMVP Admin by default');
  assert.match(bat, /URLFILE=%DESKTOP%\\%LABEL%\.url/, 'creates a desktop shortcut');
  assert.match(bat, /set "URLHOST=localhost"/, 'defaults to localhost');
  assert.match(bat, /set "PORT=8080"/, 'defaults to port 8080');
  assert.match(bat, /set "PAGE=admin\.html"/, 'defaults to the admin page');
  assert.match(bat, /SERVERURL=http:\/\/%URLHOST%:%PORT%\/%PAGE%/, 'the desktop shortcut opens the served page');
  assert.match(bat, /\.local\\settings\.ini/, 'reads per-copy settings');
  assert.match(bat, /TESTMODE/, 'supports a dry run so the installer can be checked safely');
  assert.doesNotMatch(bat, /file:\/\/\//, 'the installer must never use a file:// path');
});

test('the uninstaller removes both shortcuts', async () => {
  const bat = await readFile(path.join(ROOT, 'uninstall-startup.bat'), 'utf8');
  assert.match(bat, /del "%LNK%"/, 'removes the Startup shortcut');
  assert.match(bat, /del "%URLFILE%"/, 'removes the desktop shortcut');
});

test('a file:// page hands over to the server instead of dead-ending', async () => {
  const rescue = await readFile(path.join(PUBLIC_DIR, 'js', 'local-server-check.js'), 'utf8');

  assert.match(rescue, /location\.protocol !== 'file:'/, 'does nothing when already served over http');
  assert.match(rescue, /mode: 'no-cors'/, 'probes the server without needing CORS headers');
  assert.match(rescue, /location\.replace\(target\)/, 'redirects to the working URL when the server answers');
  assert.match(rescue, /not answering|did not answer/, 'explains the problem when the server is down');
  assert.doesNotMatch(rescue, /^\s*import\s/m, 'must stay a classic script: modules never load on file://');
});

test('every page loads the rescue script and names a probe target', async () => {
  for (const page of ['index.html', 'admin.html', 'chat.html']) {
    const html = await readFile(path.join(PUBLIC_DIR, page), 'utf8');
    assert.match(html, /<script src="js\/local-server-check\.js"><\/script>/, `${page} loads the rescue script`);
    assert.doesNotMatch(html, /<script type="module" src="js\/local-server-check\.js">/, `${page} must load it as a classic script`);
    assert.match(html, /id="probeNote"/, `${page} needs somewhere to report the probe result`);
    assert.match(html, /install-startup\.bat/, `${page} must tell the user about the one-time installer`);
  }
});
