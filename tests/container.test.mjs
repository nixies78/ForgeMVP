/**
 * Container / deployment tests.
 *
 * There is no Docker daemon in this environment, so these validate the Dockerfile
 * and .dockerignore structurally instead of building: the contract Cloud Run needs
 * (port, host, non-root, exec-form CMD), that every path the Dockerfile copies
 * exists, and that .dockerignore cannot silently exclude a file the build needs.
 *
 * Run:  node tests/container.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';

import {
  createServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  etagMatches,
  healthPayload,
  installGracefulShutdown,
  makeEtag,
  resolvePort,
} from '../server.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const readDockerfile = () => readFile(path.join(ROOT, 'Dockerfile'), 'utf8');
const readDockerignore = () => readFile(path.join(ROOT, '.dockerignore'), 'utf8');

/** Body of a named stage: FROM <image> AS <name> ... up to the next FROM.
 *  Line continuations are joined first, so a multi-line ENV still matches. */
function stageBody(dockerfile, name) {
  const joined = dockerfile.replace(/\\\r?\n\s*/g, ' ');
  const lines = joined.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${name}\\s*$`, 'i').test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^FROM\s/i.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/* --------------------------- Dockerfile structure --------------------------- */

test('the Dockerfile is a multi-stage build with a separate runtime stage', async () => {
  const dockerfile = await readDockerfile();

  const froms = dockerfile.match(/^FROM\s+\S+(\s+AS\s+\S+)?\s*$/gim) || [];
  assert.ok(froms.length >= 2, 'expected at least two FROM stages');
  assert.ok(stageBody(dockerfile, 'verify'), 'expected a "verify" stage');
  assert.ok(stageBody(dockerfile, 'runtime'), 'expected a "runtime" stage');

  const runtime = stageBody(dockerfile, 'runtime');
  assert.match(runtime, /COPY --from=verify/, 'the runtime stage must derive from the verified stage');
  assert.doesNotMatch(runtime, /COPY tests/, 'tests must not ship in the runtime image');
  assert.doesNotMatch(runtime, /\bRUN npm (ci|install)\b/, 'nothing to install: there are no dependencies');
});

test('the verify stage runs the whole test suite during the build', async () => {
  const verify = stageBody(await readDockerfile(), 'verify');
  for (const suite of ['tests/openrouter.test.mjs', 'tests/server.test.mjs', 'tests/container.test.mjs']) {
    assert.ok(verify.includes(suite), `the build must run ${suite}`);
  }
  assert.match(verify, /COPY \. \./, 'the verify stage must copy the repo so the suites can read what they assert on');
});

test('the runtime image satisfies the Cloud Run contract', async () => {
  const runtime = stageBody(await readDockerfile(), 'runtime');

  // Port from the environment, with 8080 as the documented fallback.
  assert.match(runtime, /ENV[^\n]*PORT=8080/, 'PORT must default to 8080 in the image');
  assert.match(runtime, /EXPOSE 8080/);
  assert.match(runtime, /ENV[^\n]*NODE_ENV=production/, 'production mode should be set');

  // Non-root.
  assert.match(runtime, /^USER (node|\d+)$/m, 'must not run as root');
  assert.doesNotMatch(runtime, /^USER root$/m);

  // Exec-form CMD so node is PID 1 and receives SIGTERM directly.
  assert.match(runtime, /CMD \["node", "server\.js"\]/, 'CMD must be exec form running server.js');
});

test('every path the Dockerfile copies exists in the repository', async () => {
  const dockerfile = await readDockerfile();

  for (const rawLine of dockerfile.split('\n')) {
    const line = rawLine.trim();
    if (!line.toUpperCase().startsWith('COPY')) continue;

    // Drop flags, the instruction, and the destination argument.
    const parts = line.split(/\s+/).filter((part) => !part.startsWith('--'));
    const sources = parts.slice(1, -1);
    for (const source of sources) {
      // `COPY --from=verify /app/x ./y`: the verify stage does `COPY . .`, so its
      // /app is the repo root and the source must exist here too.
      if (line.includes('--from=')) {
        assert.ok(source.startsWith('/app/'), `stage copy source should be under /app: ${source}`);
        await assert.doesNotReject(
          () => access(path.join(ROOT, source.replace('/app/', ''))),
          `Dockerfile copies "${source}" from the build stage, which does not exist in the repo`
        );
        continue;
      }
      await assert.doesNotReject(
        () => access(path.join(ROOT, source)),
        `Dockerfile copies "${source}", which does not exist`
      );
    }
  }
});

/* ------------------------------ .dockerignore ------------------------------ */

/** Turn .dockerignore lines into the set of repo-root-relative patterns. */
function dockerignorePatterns(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** Does one dockerignore pattern cover this repo-relative path (or any parent dir)? */
function patternCovers(pattern, relPath) {
  const parts = relPath.split('/');
  const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  const clean = pattern.replace(/^\*\*\//, '').replace(/\/$/, '');

  return ancestors.some((candidate) => {
    if (!clean.includes('*')) {
      return candidate === clean || candidate.split('/').pop() === clean;
    }
    const rx = new RegExp(
      '^' + clean.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
    );
    return rx.test(candidate) || rx.test(candidate.split('/').pop());
  });
}

function isDockerignored(relPath, patterns) {
  return patterns.some((pattern) => patternCovers(pattern, relPath));
}

test('the dockerignore matcher itself works', () => {
  const patterns = ['node_modules', '.env', '.env.*', '*.key', '.scratch', '**/node_modules', 'dist'];

  // Excluded.
  assert.equal(isDockerignored('node_modules', patterns), true);
  assert.equal(isDockerignored('node_modules/express/index.js', patterns), true);
  assert.equal(isDockerignored('.env', patterns), true);
  assert.equal(isDockerignored('.env.local', patterns), true);
  assert.equal(isDockerignored('secrets/server.key', patterns), true);
  assert.equal(isDockerignored('deep/nested/node_modules/x.js', patterns), true);
  assert.equal(isDockerignored('.scratch/render.dom.html', patterns), true);
  assert.equal(isDockerignored('dist/bundle.js', patterns), true);

  // Not excluded: the exact files the in-image test stage has to read.
  for (const needed of ['start.bat', 'autostart-forgemvp.vbs', 'Dockerfile', 'cloudbuild.yaml', 'package.json', 'server.js', 'public/admin.html', 'tests/server.test.mjs']) {
    assert.equal(isDockerignored(needed, patterns), false, `${needed} must not be ignored`);
  }
});

test('nothing the test suite reads is excluded from the build context', async () => {
  // The Dockerfile runs these same suites inside the build. If .dockerignore drops a
  // file they read, the read throws ENOENT and the image build fails - which is
  // exactly what happened once. Discover the reads from the test sources so this
  // cannot silently regress as the suites grow.
  const patterns = dockerignorePatterns(await readDockerignore());
  const suites = ['openrouter.test.mjs', 'server.test.mjs', 'container.test.mjs', 'guide.test.mjs'];

  const needed = new Set();

  for (const suite of suites) {
    const source = await readFile(path.join(ROOT, 'tests', suite), 'utf8');

    // Literal paths: path.join(ROOT, 'a', 'b') / path.join(PUBLIC_DIR, 'a', 'b').
    const calls = source.matchAll(/path\.join\((ROOT|PUBLIC_DIR)((?:,\s*'[^']*')+)\)/g);
    for (const [, base, args] of calls) {
      const segments = [...args.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      if (segments.length === 0) continue;
      const rel = base === 'PUBLIC_DIR' ? path.posix.join('public', ...segments) : segments.join('/');
      needed.add(rel);
    }
  }

  // Files referenced by name rather than by a path.join literal, plus the deployment
  // files this suite asserts on.
  for (const extra of [
    'Dockerfile',
    '.dockerignore',
    'cloudbuild.yaml',
    'package.json',
    'server.js',
    'start.bat',
    'install-startup.bat',
    'uninstall-startup.bat',
    'autostart-forgemvp.vbs',
  ]) {
    needed.add(extra);
  }

  assert.ok(needed.size >= 8, `expected to discover the files the suites read, found ${needed.size}`);

  let checked = 0;
  for (const rel of needed) {
    // Some discovered paths are computed expectations rather than files the suite
    // opens (e.g. resolveRequestPath('/../../server.js') expects public/server.js,
    // which deliberately does not exist). Only real files matter here.
    let exists = true;
    try {
      await access(path.join(ROOT, rel));
    } catch {
      exists = false;
    }
    if (!exists) continue;

    checked += 1;
    assert.equal(
      isDockerignored(rel, patterns),
      false,
      `.dockerignore excludes "${rel}", but the in-image test stage must be able to read it`
    );
  }

  assert.ok(checked >= 8, `expected to check at least 8 real files, checked ${checked}`);
});

test('.dockerignore excludes dependencies, VCS, secrets and caches', async () => {
  const patterns = dockerignorePatterns(await readDockerignore());

  for (const required of ['node_modules', '.git', '.env', '.cache', 'dist', 'coverage', '.DS_Store', '.scratch']) {
    assert.ok(patterns.includes(required), `.dockerignore should exclude ${required}`);
  }
  assert.ok(
    patterns.some((p) => p.startsWith('.env.')),
    'local env variants (.env.local etc.) must be excluded'
  );
});

test('.dockerignore never excludes something the Dockerfile copies', async () => {
  const dockerfile = await readDockerfile();
  const patterns = dockerignorePatterns(await readDockerignore());

  // Every file/dir a plain (non --from) COPY pulls in must survive the ignore file.
  const copied = [];
  for (const rawLine of dockerfile.split('\n')) {
    const line = rawLine.trim();
    if (!line.toUpperCase().startsWith('COPY') || line.includes('--from=')) continue;
    const parts = line.split(/\s+/).filter((part) => !part.startsWith('--'));
    copied.push(...parts.slice(1, -1));
  }
  assert.ok(copied.length > 0, 'expected the Dockerfile to copy some files');

  for (const source of copied) {
    const top = source.split('/')[0];
    assert.ok(
      !patterns.includes(source) && !patterns.includes(top) && !patterns.includes(`${top}/`),
      `.dockerignore excludes "${source}", but the Dockerfile needs to COPY it`
    );
    // A wildcard pattern such as *.md must not swallow a needed source either.
    for (const pattern of patterns.filter((p) => p.startsWith('*'))) {
      const suffix = pattern.slice(1);
      assert.ok(
        !source.endsWith(suffix),
        `.dockerignore pattern "${pattern}" would exclude the needed source "${source}"`
      );
    }
  }
});

/* ------------------------ server-side Cloud Run rules ------------------------ */

test('the server resolves PORT with an 8080 fallback', () => {
  assert.equal(DEFAULT_PORT, 8080);
  assert.equal(resolvePort({}), 8080, 'unset PORT falls back to 8080');
  assert.equal(resolvePort({ PORT: '' }), 8080);
  assert.equal(resolvePort({ PORT: 'abc' }), 8080);
  assert.equal(resolvePort({ PORT: '0' }), 8080, 'port 0 is not a valid listen port here');
  assert.equal(resolvePort({ PORT: '70000' }), 8080);
  assert.equal(resolvePort({ PORT: '9090' }), 9090, 'Cloud Run injects the real port');
  assert.equal(resolvePort({ PORT: '8080' }), 8080);
});

test('the server binds all interfaces', () => {
  assert.equal(DEFAULT_HOST, '0.0.0.0');
});

test('the running server answers /healthz over real HTTP', async (t) => {
  // In-process on an ephemeral port: no child process, and no chance of clashing
  // with a real service on 8080 while the suite runs.
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.match(res.headers.get('cache-control'), /no-store/, 'probes must not be cached');
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'forgemvp');
  assert.ok(Number.isInteger(body.uptimeSeconds));
});

test('healthPayload reports a healthy service', () => {
  const payload = healthPayload();
  assert.equal(payload.status, 'ok');
  assert.equal(payload.service, 'forgemvp');
  assert.ok(Number.isInteger(payload.uptimeSeconds));
});

test('SIGTERM shuts the server down gracefully and exits 0', async () => {
  // Cloud Run sends SIGTERM on every deploy and scale-down. node is PID 1 in the
  // container, where a signal with no handler is ignored - and the platform would
  // then SIGKILL the container, dropping in-flight requests.
  const closed = [];
  let exitCode = null;
  const fakeServer = {
    close(callback) {
      closed.push(true);
      callback?.();
    },
    closeIdleConnections() {
      closed.push('idle');
    },
  };

  const handle = installGracefulShutdown(fakeServer, {
    exit: (code) => {
      exitCode = code;
    },
    log: () => {},
  });

  try {
    assert.ok(process.listenerCount('SIGTERM') >= 1, 'a SIGTERM handler must be installed');
    assert.ok(process.listenerCount('SIGINT') >= 1, 'a SIGINT handler must be installed');

    process.emit('SIGTERM');

    assert.deepEqual(closed, [true, 'idle'], 'the server is closed and keep-alive sockets dropped');
    assert.equal(exitCode, 0, 'a signal-triggered shutdown is a clean exit, not a failure');

    // A second signal must not restart the shutdown sequence.
    process.emit('SIGTERM');
    assert.equal(closed.length, 2, 'the second signal is ignored while stopping');
  } finally {
    handle.dispose();
  }

  assert.equal(process.listenerCount('SIGTERM'), 0, 'handlers are removed on dispose');
});

/* ------------------------------ cloudbuild.yaml ------------------------------ */

test('the Cloud Build pipeline tests before it builds, then deploys on 8080', async () => {
  const pipeline = await readFile(path.join(ROOT, 'cloudbuild.yaml'), 'utf8');

  // A test step that covers every suite, and a build step that waits for it.
  assert.match(pipeline, /id:\s*test/, 'expected a test step');
  for (const suite of ['openrouter.test.mjs', 'server.test.mjs', 'container.test.mjs']) {
    assert.ok(pipeline.includes(suite), `the pipeline must run ${suite}`);
  }
  assert.match(pipeline, /id:\s*build[\s\S]*waitFor:\s*\["test"\]/, 'the build must wait for the tests');

  // Deploy step: the port Cloud Run routes to must match what the app listens on.
  assert.match(pipeline, /id:\s*deploy/, 'expected a deploy step');
  assert.match(pipeline, /"--port=8080"/, 'Cloud Run must be told to route to 8080');
  assert.match(pipeline, /--image=\$\{_REGION\}-docker\.pkg\.dev/, 'the deploy must use the pushed image');

  // No local-only paths leaking into the deployed pipeline.
  assert.doesNotMatch(pipeline, /file:\/\/\//);
});

test('the pipeline and the image agree on the Node major version', async () => {
  const dockerfile = await readDockerfile();
  const pipeline = await readFile(path.join(ROOT, 'cloudbuild.yaml'), 'utf8');

  const imageMajor = dockerfile.match(/FROM node:(\d+)-/)?.[1];
  const pipelineMajor = pipeline.match(/node:(\d+)-/)?.[1];
  assert.ok(imageMajor, 'the Dockerfile should pin a Node major version');
  assert.equal(pipelineMajor, imageMajor, 'the CI test step should use the same Node major as the image');
});

test('ETag helpers produce strong validators and match correctly', () => {
  const etag = makeEtag({ size: 1234, mtimeMs: 1_700_000_000_123 });
  assert.match(etag, /^"[0-9a-f]+-[0-9a-f]+"$/, 'a strong quoted validator');

  assert.equal(etagMatches(etag, etag), true);
  assert.equal(etagMatches(`"other", ${etag}`, etag), true, 'handles a list of validators');
  assert.equal(etagMatches('*', etag), true);
  assert.equal(etagMatches('"stale"', etag), false);
  assert.equal(etagMatches(undefined, etag), false);

  // Different size or mtime must produce a different validator, or clients would
  // keep serving a stale page script.
  assert.notEqual(makeEtag({ size: 1234, mtimeMs: 1_700_000_000_124 }), etag);
  assert.notEqual(makeEtag({ size: 1235, mtimeMs: 1_700_000_000_123 }), etag);
});
