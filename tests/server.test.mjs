/**
 * Smoke tests for the static server: path safety plus real HTTP fetches of the
 * three pages. Run:  node tests/server.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { createServer, resolveRequestPath, PUBLIC_DIR } from '../server.js';

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
    ['/', 'text/html', /Home Page/],
    ['/index.html', 'text/html', /href="admin\.html"/],
    ['/admin.html', 'text/html', /OpenRouter API key/],
    ['/admin.html', 'text/html', /choose the llm/i],
    ['/chat.html', 'text/html', /Chat test/],
    ['/css/styles.css', 'text/css', /--accent/],
    ['/js/config.js', 'text/javascript', /deepseek\/deepseek-v3\.2/],
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
  }
});

test('every page links the admin page from the top-right logo', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await (await fetch(`${base}/`)).text();
  assert.match(home, /<a class="logo-link" href="admin\.html"/, 'home page logo links to admin');
  assert.match(home, /href="admin\.html"[^>]*>Go to the admin page</, 'home page has a plain admin link');

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

test('the Admin link in the markup matches the admin page filename', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await (await fetch(`${base}/`)).text();
  const target = home.match(/logo-link" href="([^"]+)"/)?.[1];
  assert.ok(target, 'home page contains a top-right logo link');

  const res = await fetch(`${base}/${target}`);
  await res.text();
  assert.equal(res.status, 200, 'the logo link target exists');
});

test('every element id the page scripts look up exists in its markup', async () => {
  const pairs = [
    ['js/admin.js', 'admin.html'],
    ['js/chat.js', 'chat.html'],
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
    if (page !== 'index.html') {
      assert.match(html, /<script type="module" src="js\/[a-z]+\.js"><\/script>/, `${page} loads a module script`);
    }
  }
});
