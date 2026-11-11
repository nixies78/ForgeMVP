/**
 * ForgeMVP - zero-dependency static web server.
 *
 * Serves the `public/` folder. Run with:  npm start   (or  node server.js)
 * Override the port with:                 set PORT=8080 && npm start
 *
 * The site is plain static HTML/CSS/JS (no build step), so the same `public/`
 * folder can be deployed as-is to Google Cloud (Firebase Hosting / Cloud Run /
 * a GCS bucket) when you turn on continuous deployment.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PUBLIC_DIR = path.join(__dirname, 'public');

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

export function createServer(publicDir = PUBLIC_DIR) {
  return http.createServer((req, res) => {
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

      const ext = path.extname(target).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        // no-store, not no-cache: this is a local dev server for files that change
        // constantly, and without ETag/Last-Modified a "no-cache" response lets the
        // browser heuristically reuse a stale page script, which looks like broken code.
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      };

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

export function startServer({ port = Number(process.env.PORT) || 5173, host = process.env.HOST || '0.0.0.0', open = false } = {}) {
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
