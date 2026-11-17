/**
 * ForgeMVP - local always-on dev server.
 *
 * Runs `server.js --live` and keeps it running:
 *   - edits under public/ refresh open pages (server.js does that with --live);
 *   - an edit to server.js restarts the server, and open pages refresh once it is back;
 *   - a crash restarts the server after a short pause, backing off if it keeps failing;
 *   - a clean exit (for example "port already in use: another copy is running")
 *     stops the supervisor too, so logon never piles up duplicate copies.
 *
 * Started hidden at logon by autostart-forgemvp.vbs when .local/settings.ini has
 * LIVE=1. Output goes to .local/server.log, since there is no window to read it in.
 *
 *   node tools/dev-supervisor.mjs [--open]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server.js');
const LOCAL_DIR = path.join(ROOT, '.local');
const LOG_FILE = path.join(LOCAL_DIR, 'server.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

fs.mkdirSync(LOCAL_DIR, { recursive: true });
try {
  if (fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
} catch {
  // No log yet.
}
const log = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const note = (message) => {
  const line = `[${new Date().toISOString()}] supervisor: ${message}\n`;
  log.write(line);
  process.stdout.write(line);
};

let child = null;
let restarting = false;
let failures = 0;
let firstStart = true;

function start() {
  const args = [SERVER, '--live'];
  if (firstStart && process.argv.includes('--open')) args.push('--open');
  firstStart = false;

  const startedAt = Date.now();
  child = spawn(process.execPath, args, { cwd: ROOT, env: process.env, windowsHide: true });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  note(`started server (pid ${child.pid}) on port ${process.env.PORT || 8080}`);

  child.on('exit', (code, signal) => {
    child = null;
    if (restarting) {
      restarting = false;
      start();
      return;
    }
    if (code === 0) {
      note('server exited cleanly - stopping the supervisor');
      log.end(() => process.exit(0));
      return;
    }
    // A server that ran for a while before failing resets the backoff.
    failures = Date.now() - startedAt > 60000 ? 1 : failures + 1;
    const delay = Math.min(30000, 1000 * 2 ** (failures - 1));
    note(`server stopped (code ${code}, signal ${signal}) - restarting in ${delay / 1000}s`);
    setTimeout(start, delay);
  });
}

function restart(reason) {
  note(`${reason} - restarting server`);
  if (child) {
    restarting = true;
    child.kill();
  } else {
    start();
  }
}

// Watch the folder, not the file: editors and git often replace server.js
// (write a new file, rename it over the old one), which ends a watch on the file itself.
let debounce = null;
fs.watch(ROOT, (event, filename) => {
  if (filename !== 'server.js') return;
  clearTimeout(debounce);
  debounce = setTimeout(() => restart('server.js changed'), 300);
});

const stop = () => {
  note('stop requested');
  child?.kill();
  log.end(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start();
