/**
 * Tests for the pages under public/: that every reference in them can be resolved from disk.
 *
 * These pages are read two ways — through the server, where public/ is the web root, and straight from
 * the filesystem, by opening the file (file://). The second way has no web root and no directory
 * index, so two things that work over HTTP quietly break there, and both have:
 *
 *   - a root-relative reference ("/assets/logo_epic.svg") points at the drive root, C:/assets/..., not
 *     at public/assets/..., which is why the Epic mark was missing on every mockup page;
 *   - a link to a directory ("../concepts/7-three-steps/") is resolved by a server to that directory's
 *     index.html and by a filesystem to a directory listing, which is why clicking a mockup opened a
 *     list of files instead of the page.
 *
 * Neither fault is visible through the server, so nothing that runs over HTTP can catch them. This file
 * reads the markup instead, and both rules are enforced against the filesystem.
 *
 * Run:  node tests/paths.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

const PUBLIC = path.join(process.cwd(), 'public');

/** Every page, script and stylesheet that ships. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(html|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(process.cwd(), file).split(path.sep).join('/');

/** Every reference in a file that names a local path, as {value, line}. Anchored on the positions a URL
 * can occupy - an attribute, a url() - so a path named in passing in a comment or a regular expression
 * is not mistaken for a reference. */
function referencesIn(text) {
  const refs = [];
  const lines = text.split('\n');
  const patterns = [/\b(?:src|href)\s*=\s*"([^"]+)"/g, /\b(?:src|href)\s*=\s*'([^']+)'/g, /url\((["']?)([^"')]+)\1\)/g];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const value = (match[2] ?? match[1] ?? '').trim();
        if (value) refs.push({ value, line: index + 1 });
      }
    }
  });
  return refs;
}

/** Is this something a browser fetches from this checkout, rather than a protocol, an anchor or a
 * placeholder the page fills in at runtime? */
const isLocalPath = (value) =>
  value !== '' &&
  !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value) &&
  !value.includes('${') &&
  !value.startsWith('data:');

/** The one reference in the app that is a route rather than a file: the footer's "Server health" link
 * asks the server for /healthz, which is answered by code in server.js and is on no disk. Its rendered
 * side is still checked - the browser check fetches every footer href it finds, this one included. */
const SERVER_ROUTES = new Set(['healthz']);

const files = (await walk(PUBLIC)).sort();

test('every page in public/ can be read from disk, with no web root to lean on', async () => {
  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const { value, line } of referencesIn(text)) {
      /* "/assets/x" means public/assets/x to a server and C:/assets/x to the filesystem. There is no
       * exception: the app is served from public/ as its root, so nothing in it ever needs one. */
      if (/^\/(?!\/)/.test(value)) {
        offenders.push(`${rel(file)}:${line} is root-relative, which only works when a server serves public/ as the root: ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `root-relative references found:\n${offenders.join('\n')}`);
});

test('every link and asset in public/ resolves to a file that is really there', async () => {
  const problems = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const { value, line } of referencesIn(text)) {
      if (!isLocalPath(value)) continue;
      if (SERVER_ROUTES.has(value)) continue;
      const target = value.split('#')[0].split('?')[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), target);
      let info = null;
      try {
        info = await stat(resolved);
      } catch {
        problems.push(`${rel(file)}:${line} points at ${value}, which does not exist`);
        continue;
      }
      /* A directory is the fault this test exists for: over HTTP the server quietly serves its
       * index.html, and from disk the browser shows a listing instead of the page. */
      if (info.isDirectory()) {
        problems.push(`${rel(file)}:${line} links to the directory ${value} - name its index.html instead`);
      }
    }
  }
  assert.deepEqual(problems, [], `unresolvable references found:\n${problems.join('\n')}`);
});

test('the pages that are opened from disk carry the assets they need beside them', async () => {
  /* The mockups and concepts pages are opened directly, so anything they show has to be reachable by a
   * relative path. Their marks and their fonts are the two that broke, and both live in public/assets/. */
  const mockups = path.join(PUBLIC, 'mockups', 'index.html');
  const text = await readFile(mockups, 'utf8');
  assert.match(text, /src="\.\.\/assets\/logo_epic\.svg"/, 'the mockups page shows the Epic mark by a path that works from disk');

  const concepts = (await walk(path.join(PUBLIC, 'concepts'))).filter((f) => f.endsWith('.html'));
  for (const file of concepts) {
    const page = await readFile(file, 'utf8');
    for (const { value, line } of referencesIn(page)) {
      if (!/logo|fonts?\//.test(value)) continue;
      assert.ok(
        !value.startsWith('/'),
        `${rel(file)}:${line} reaches for ${value} through the web root; a page opened from disk has none`
      );
      const info = await stat(path.resolve(path.dirname(file), value.split('#')[0]));
      assert.ok(info.isFile(), `${rel(file)}:${line} wants ${value}, which is not a file`);
    }
  }
});
