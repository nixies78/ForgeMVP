/**
 * ForgeMVP - zero-dependency static web server.
 *
 * Serves the `public/` folder. Run with:  npm start   (or  node server.js)
 * Override the port with:                 set PORT=8080 && npm start
 *
 * The site is plain static HTML/CSS/JS (no build step), so the same `public/`
 * folder can be deployed as-is to Google Cloud (Cloud Run / Firebase Hosting /
 * a GCS bucket) when you turn on continuous deployment.
 *
 * Cloud Run contract: the port comes from $PORT (falling back to 8080), the
 * socket binds 0.0.0.0 so the platform's sidecar can reach it, /healthz answers
 * for probes, and SIGTERM is handled explicitly - `node` runs as PID 1 in the
 * container, where a signal with no handler is ignored and the platform would
 * have to SIGKILL the container mid-request.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PUBLIC_DIR = path.join(__dirname, 'public');

/** Cloud Run injects PORT; 8080 is the documented fallback. */
export const DEFAULT_PORT = 8080;
export const DEFAULT_HOST = '0.0.0.0';

/** Resolve the port from the environment the same way everywhere. */
export function resolvePort(env = process.env) {
  const fromEnv = Number(env.PORT);
  return Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536 ? fromEnv : DEFAULT_PORT;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a request URL to a file inside PUBLIC_DIR, or null if it escapes. */
export function resolveRequestPath(urlPath, publicDir = PUBLIC_DIR) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  if (pathname === '') pathname = '/index.html';

  const target = path.resolve(publicDir, '.' + pathname);
  const root = path.resolve(publicDir);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // path traversal attempt
  return target;
}

/** Strong validator, so a revalidating browser only refetches what really changed. */
export function makeEtag(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

/** Whether the client's If-None-Match already matches our ETag. */
export function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  return ifNoneMatch
    .split(',')
    .map((part) => part.trim())
    .some((part) => part === etag || part === '*');
}

/** Liveness payload for Cloud Run / monitoring probes. */
export function healthPayload() {
  return {
    status: 'ok',
    service: 'forgemvp',
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function createServer(publicDir = PUBLIC_DIR) {
  return http.createServer((req, res) => {
    // Probes must not touch the filesystem or the static cache logic.
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname === '/healthz') {
      const body = JSON.stringify(healthPayload());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    const target = resolveRequestPath(req.url || '/', publicDir);

    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }

    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!doctype html><meta charset="utf-8"><title>404 - ForgeMVP</title>' +
            '<body style="font-family:system-ui;background:#0e1116;color:#e8ecf1;padding:48px">' +
            '<h1>404 - Not found</h1><p>No page at <code>' +
            escapeHtml(req.url || '/') +
            '</code>.</p><p><a style="color:#63b3ff" href="/">Back to the home page</a> ' +
            '&middot; <a style="color:#63b3ff" href="/admin.html">Admin</a></p></body>'
        );
        return;
      }

      const etag = makeEtag(stat);
      const ext = path.extname(target).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        // no-cache (NOT no-store): the browser must revalidate every time, but with a
        // strong ETag an unchanged file answers 304 instead of resending the body.
        // Sending no-cache without a validator is what lets a browser heuristically
        // reuse a stale page script, which looks exactly like broken code.
        'Cache-Control': 'no-cache',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
      };

      if (etagMatches(req.headers['if-none-match'], etag)) {
        res.writeHead(304, headers);
        res.end();
        return;
      }

      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(target).pipe(res);
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * Turn a listen failure into something a human can act on.
 * Pure, so it can be tested without stubbing process.exit.
 */
export function describeListenError(err, port) {
  if (err?.code === 'EADDRINUSE') {
    return {
      alreadyRunning: true,
      message:
        `Port ${port} is already in use - ForgeMVP looks like it is already running, so this second copy will stop. ` +
        `Open http://localhost:${port}/admin.html instead of starting another one.`,
    };
  }
  if (err?.code === 'EACCES') {
    return {
      alreadyRunning: false,
      message: `Permission denied binding port ${port}. Try another one, e.g. set PORT=8080 && npm start`,
    };
  }
  return { alreadyRunning: false, message: `Could not start the server: ${err?.message || err}` };
}

/**
 * Graceful shutdown. Cloud Run sends SIGTERM before every scale-down and deploy,
 * then SIGKILLs after the grace period. `node` is PID 1 in the container, and a
 * PID 1 process ignores signals it has no handler for - so without this, in-flight
 * requests are dropped on every deploy.
 *
 * `exit` is injectable so the behaviour can be unit tested.
 */
export function installGracefulShutdown(server, { exit = (code) => process.exit(code), timeoutMs = 8000, log = console.log } = {}) {
  let stopping = false;

  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    log(`  ${signal} received - finishing in-flight requests, then stopping.`);
    server.close(() => exit(0));
    // Keep-alive connections would otherwise hold the process open.
    server.closeIdleConnections?.();
    // Backstop if a request never finishes; unref'd so it cannot delay a clean exit.
    setTimeout(() => exit(0), timeoutMs).unref?.();
  };

  const onTerm = () => shutdown('SIGTERM');
  const onInt = () => shutdown('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);

  return {
    dispose() {
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
    },
  };
}

export function startServer({ port = resolvePort(), host = process.env.HOST || DEFAULT_HOST, open = false } = {}) {
  const server = createServer();

  server.on('error', (err) => {
    const info = describeListenError(err, port);
    console.error('');
    console.error(`  ${info.message}`);
    console.error('');
    // The logon auto-start racing an already-running server is normal, not a failure:
    // open the browser anyway, then leave quietly.
    if (info.alreadyRunning) {
      if (open) openBrowser(`http://localhost:${port}/admin.html`);
      process.exit(0);
    }
    process.exit(1);
  });

  server.listen(port, host, () => {
    const actual = server.address().port;
    console.log('');
    console.log('  ForgeMVP is running');
    console.log('  -------------------');
    console.log(`  Home page : http://localhost:${actual}/`);
    console.log(`  Admin page: http://localhost:${actual}/admin.html`);
    console.log(`  Chat test : http://localhost:${actual}/chat.html`);
    console.log(`  Health    : http://localhost:${actual}/healthz`);
    for (const addr of lanAddresses()) {
      console.log(`  On your network (others can open this): http://${addr}:${actual}/`);
    }
    console.log('');
    console.log('  Use these http:// addresses, not the file:// path - browsers block the');
    console.log('  page scripts when a page is opened straight from disk.');
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
    // Only reported as openable once the socket is genuinely listening, so no race.
    if (open) openBrowser(`http://localhost:${actual}/admin.html`);
  });

  installGracefulShutdown(server);
  return server;
}

/** Hand a URL to the OS default browser. Best-effort - never throws. */
export function openBrowser(url) {
  const commands = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
  };
  const [command, args] = commands[process.platform] || ['xdg-open', [url]];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) found.push(net.address);
    }
  }
  return found;
}

// Only auto-start when executed directly, not when imported by a test.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer({ open: process.argv.includes('--open') });
}
