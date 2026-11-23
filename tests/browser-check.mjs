/**
 * Browser verification for the UEFN Game Guide.
 *
 * Chrome's own `--dump-dom` and `--screenshot` snapshot before the app's data fetch resolves, so they
 * show an empty page and hide real bugs. This drives Chrome over the DevTools Protocol instead:
 * navigate, wait for the rendered DOM, assert on its text and structure, catch console errors, and
 * screenshot each screen at desktop and phone width. That makes it an end-to-end check of the whole
 * path a user takes — module load, data file fetch, resolution, rendering, focus — rather than a
 * static HTML check.
 *
 * It is not part of `npm test` because it needs Chrome and a running server:
 *
 *     npm start                     (in one terminal)
 *     npm run verify                (in another)
 *
 * Usage:  node tests/browser-check.mjs [baseUrl]
 * Set CHROME_PATH if Chrome is somewhere unusual. Screenshots land in .scratch/shots/.
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || process.env.GUIDE_URL || 'http://localhost:8080/';
const OUT = path.join(process.cwd(), '.scratch', 'shots');
const PORT = 9333;
const PROFILE = path.join(process.env.TEMP || process.env.TMPDIR || '.', 'forge-guide-chrome');

/** Where Chrome usually lives. CHROME_PATH wins if it is set. */
const CHROME = findChrome();

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

const SHARE =
  '?play=combat_elimination_deathmatch&a=team_mode%3Affa%2Cloadout%3Afixed%2Crespawns%3Arespawn%2Czone%3Afixed&brand=star_wars';

/** Every screen, what it must contain once rendered, and the width to capture it at.
 *  `back: false` marks the one screen with no step before it: the spec asks every screen of the wizard
 *  for a visible way back, and home is the entry point. */
const CHECKS = [
  { name: 'home', url: `${BASE}`, desktop: 1440, mobile: 420, back: false,
    must: ['Ready to make a game?', 'Answer Questions', 'Randomise', 'Chat with AI', 'researched game types', 'not affiliated'], mustNot: ['could not load its data'] },
  { name: 'category', url: `${BASE}#/category`, desktop: 1440,
    must: ['What type of game do you want to make?', 'Combat', 'Researched', 'Basics only'] },
  { name: 'gametype-dev', url: `${BASE}${SHARE}&dev=1#/gametype`, desktop: 1440,
    must: ['Which one exactly?', 'Draft', 'Essentials only', 'Researched'] },
  { name: 'question', url: `${BASE}${SHARE}#/q/team_mode`, desktop: 1440,
    must: ['Question 1 of 4', 'Change game type', 'Change category'] },
  { name: 'brand', url: `${BASE}${SHARE}#/brand`, desktop: 1440,
    must: ['brand template', 'Star Wars', 'Suited to'] },
  { name: 'restriction', url: `${BASE}${SHARE}#/restriction`, desktop: 1440,
    must: ['usage rules', "I'm okay with this", 'Brand Rules', 'Where this comes from'] },
  { name: 'summary', url: `${BASE}${SHARE}#/summary`, desktop: 1440, mobile: 420,
    must: ['Here is your game.', 'How the game plays', 'In words', 'Your plan', 'Every choice', 'Start Building'],
    hasSvg: true },
  { name: 'experience', url: `${BASE}${SHARE}#/experience`, desktop: 1440,
    must: ['experience level', 'Complete beginner', 'Basic Navigation'] },
  { name: 'walk-core', url: `${BASE}${SHARE}#/walk/3`, desktop: 1440,
    must: ['Add Your Core Game Loop Devices', 'Settings to change', 'Settings reminders', 'settings to check'] },
  { name: 'walk-look', url: `${BASE}${SHARE}#/walk/4`, desktop: 1440,
    must: ['Make It Look Good', 'Star Wars', 'atmosphere devices'] },
  { name: 'walk-beginner', url: `${BASE}${SHARE}#/walk/1`, desktop: 1440, mobile: 420,
    must: ['Basic Navigation', 'Details panel'] },
  { name: 'soon', url: `${BASE}#/soon/randomise`, desktop: 1440, back: false,
    must: ['still being designed', 'What is missing'] },
  { name: 'unknown-route', url: `${BASE}#/nonsense`, desktop: 1200, back: false,
    must: ['Ready to make a game?'] }
];

/* ------------------------------- CDP plumbing ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The alpha of a computed colour, so a translucent fill can be asserted as a number. A hex byte does
 * not round-trip exactly: #ffffff26 is 38/255, which Chrome reports as 0.149 rather than as 0.15. */
function alphaOf(colour) {
  const match = /rgba?\(([^)]+)\)/.exec(colour || '');
  if (!match) return NaN;
  const parts = match[1].split(',').map((p) => Number(p.trim()));
  return parts.length === 4 ? parts[3] : 1;
}

/** True when a computed colour is the given rgb triple at (about) the given alpha. */
function isColour(colour, rgb, alpha) {
  return new RegExp(`^rgba\\(${rgb},`).test(colour || '') && Math.abs(alphaOf(colour) - alpha) < 0.01;
}

/** Does the footer's href actually lead somewhere? A link whose label is right and whose target 404s is
 * the failure that a text assertion cannot see, so each unique href is fetched once against this run's
 * base URL and the answer is kept. */
const resolvedLinks = new Map();
async function linkResolves(href) {
  if (!href) return false;
  const url = new URL(href, BASE).href;
  if (resolvedLinks.has(url)) return resolvedLinks.get(url);
  let ok = false;
  try {
    const response = await fetch(url, { redirect: 'follow' });
    ok = response.ok;
    await response.arrayBuffer();
  } catch {
    ok = false;
  }
  resolvedLinks.set(url, ok);
  return ok;
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, events, close: () => ws.close() };
}

async function main() {
  if (!CHROME) {
    console.error('Chrome was not found. Set CHROME_PATH to the executable and try again.');
    process.exitCode = 1;
    return;
  }

  /* Fail early and usefully when the server is not up, rather than 13 identical timeouts. */
  try {
    const probe = await fetch(BASE);
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (error) {
    console.error(`Nothing is answering at ${BASE} (${error.message}).`);
    console.error('Start it with `npm start` in another terminal, then run this again.');
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${PORT}`,
      'about:blank'
    ],
    { stdio: 'ignore', detached: false }
  );

  /* Wait for the debugging endpoint. */
  let version = null;
  for (let i = 0; i < 60 && !version; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('Chrome did not expose a debugging port');

  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const { send, events, close } = await cdp(page.webSocketDebuggerUrl);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const results = [];

  for (const check of CHECKS) {
    const consoleErrors = [];
    events.length = 0;

    await send('Emulation.setDeviceMetricsOverride', {
      width: check.desktop,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Page.navigate', { url: check.url });

    /* Wait for the app to render, or give up after 10s. */
    let rendered = false;
    for (let i = 0; i < 40 && !rendered; i += 1) {
      await sleep(250);
      const probe = await send('Runtime.evaluate', {
        expression: "document.querySelector('#screen') && document.querySelector('#screen').children.length > 0",
        returnByValue: true
      });
      rendered = probe.result.value === true;
    }

    const dump = await send('Runtime.evaluate', {
      expression: `(() => {
        const screen = document.querySelector('#screen');
        return {
          ready: document.documentElement.dataset.appReady === 'true',
          rendered: !!screen && screen.children.length > 0,
          /* textContent, not innerText: a device's settings live inside a closed <details>, and they
           * are still rendered. */
          text: screen ? screen.textContent.replace(/\\s+/g, ' ') : '',
          svgs: screen ? screen.querySelectorAll('svg').length : 0,
          devices: screen ? screen.querySelectorAll('.g-device').length : 0,
          settings: screen ? screen.querySelectorAll('.g-setting').length : 0,
          cards: screen ? screen.querySelectorAll('.g-choice').length : 0,
          options: screen ? screen.querySelectorAll('.g-option').length : 0,
          details: screen ? screen.querySelectorAll('details').length : 0,
          headings: screen ? [...screen.querySelectorAll('h1,h2,h3,h4')].map((h) => h.tagName).join(',') : '',
          /* The page shell: the fixed header, the app container's sticky bar and the footer. The
           * architecture spec (v2) is a layout document, so these are the assertions that it was
           * followed - including the things it removed, which are checked for absence. */
          shell: (() => {
            const h1s = [...document.querySelectorAll('h1')];
            const head = document.getElementById('appHead');
            const app = document.getElementById('appContainer');
            const body = document.getElementById('appContainer').querySelector('.sh-app-body');
            const nav = document.querySelector('.sh-nav');
            const header = document.getElementById('siteHeader');
            const footer = document.querySelector('.sh-footer');
            const bar = document.getElementById('progressBar');
            const devToggle = document.getElementById('devModeButton');
            const adminButton = document.querySelector('.sh-btn-admin');
            const back = [...document.querySelectorAll('#screen button, #screen a')]
              .filter((el) => /^(←\\s*)?(back|previous|let's go back)/i.test((el.textContent || '').trim()));
            const admin = [...document.querySelectorAll('.sh-footer a')]
              .filter((el) => /admin/i.test(el.getAttribute('href') || ''));
            const headerRect = header ? header.getBoundingClientRect() : null;
            const appRect = app ? app.getBoundingClientRect() : null;
            return {
              h1Count: h1s.length,
              h1Text: h1s.map((el) => el.textContent.trim()).join('|'),
              h1InScreen: h1s.length === 1 ? (screen ? screen.contains(h1s[0]) : false) : false,
              headingsInScreen: screen ? [...screen.querySelectorAll('h1,h2,h3')].map((h) => h.tagName).join(',') : '',
              crumbs: (document.getElementById('crumbs') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim(),
              crumbLinks: document.querySelectorAll('#crumbs a.g-crumb').length,
              navItems: nav ? nav.querySelectorAll('.sh-nav-link').length : -1,
              navText: nav ? nav.textContent.replace(/\\s+/g, ' ').trim() : '',
              stickyTop: head ? getComputedStyle(head).position + ' ' + getComputedStyle(head).top : '',
              inset: body ? getComputedStyle(body).paddingLeft : '',
              /* 1.2.0 removed the search field and the Dev mode control from the header. Both are
               * asserted absent, so the release cannot half-happen: markup gone but wiring left behind. */
              headerSearch: !!header.querySelector('input, .sh-search, .sh-kbd'),
              headerDevMode: !!(header && devToggle && header.contains(devToggle)),
              devPressed: devToggle ? devToggle.getAttribute('aria-pressed') : '',
              devInFooter: !!(footer && devToggle && footer.contains(devToggle)),
              devLabel: devToggle ? devToggle.textContent.replace(/\\s+/g, ' ').trim() : '',
              /* The one action left in the header, and the library's secondary control rather than a
               * primary one: a translucent fill, and no icon. */
              adminInHeader: !!(header && adminButton && header.contains(adminButton)),
              adminClasses: adminButton ? adminButton.className : '',
              adminIcons: adminButton ? adminButton.querySelectorAll('img, svg').length : -1,
              adminBg: adminButton ? getComputedStyle(adminButton).backgroundColor : '',
              /* The label colour matters as much as the fill: guide.css's workspace link rule used to
               * reach into the header and repaint it with the workspace's muted colour. */
              adminColor: adminButton ? getComputedStyle(adminButton).color : '',
              footerAdminColor: (() => {
                const link = footer ? footer.querySelector('.sh-footer-admin') : null;
                return link ? getComputedStyle(link).color : '';
              })(),
              headerPosition: header ? getComputedStyle(header).position : '',
              headerBg: header ? getComputedStyle(header).backgroundColor : '',
              headerBorder: header ? getComputedStyle(header).borderBottomWidth : '',
              headerH: headerRect ? Math.round(headerRect.height) : 0,
              declaredHeaderH: getComputedStyle(document.documentElement).getPropertyValue('--sh-header-h').trim(),
              viewportWidth: window.innerWidth,
              bodyTopPad: body ? getComputedStyle(document.body).paddingTop : '',
              appTopBelowHeader: headerRect && appRect ? Math.round(appRect.top - headerRect.bottom) : -999,
              /* The sticky app header is borderless and translucent as of 1.2.0; 1.2.2 gave the site
               * header the same blur. */
              headBorder: head ? getComputedStyle(head).borderTopWidth + '/' + getComputedStyle(head).borderBottomWidth : '',
              headBg: head ? getComputedStyle(head).backgroundColor : '',
              headBackdrop: head ? getComputedStyle(head).backdropFilter : '',
              headerBackdrop: (() => {
                const el = document.querySelector('.sh-header');
                return el ? getComputedStyle(el).backdropFilter : '';
              })(),
              footerBorder: (() => {
                const el = document.querySelector('.sh-footer');
                return el ? getComputedStyle(el).borderTopWidth : '';
              })(),
              footerBg: footer ? getComputedStyle(footer).backgroundColor : '',
              footerAdminLinks: admin.length,
              /* The footer's links as the check needs them: what each one says, where it points, and — for
               * the hrefs the app builds itself — whether that is somewhere. labels is the lowercased,
               * whitespace-collapsed text, which is what the "is this link still here" assertion compares
               * against, so a label that gains a stray space does not fail the run. */
              footerLinkList: [...document.querySelectorAll('.sh-footer-link')].map((el) => ({
                label: (el.textContent || '').replace(/\\s+/g, ' ').trim(),
                raw: el.getAttribute('href') || ''
              })),
              footerLinkLabels: [...document.querySelectorAll('.sh-footer-link')].map((el) =>
                (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()
              ),
              footerLinks: footer ? footer.querySelectorAll('.sh-footer-link').length : -1,
              footerText: footer ? footer.textContent.replace(/\\s+/g, ' ').trim() : '',
              progressBg: bar ? getComputedStyle(bar).backgroundImage : '',
              backButtons: back.length,
              hero: !!document.querySelector('.sh-hero, #heroVideo, #heroTitle'),
              logo: (document.querySelector('.sh-logo img') || {}).getAttribute
                ? document.querySelector('.sh-logo img').getAttribute('src')
                : '',
              /* 1.2.1's numbers, measured rather than read out of the stylesheet: the mark carries no
               * border, the header's control is 32px, and the box is the panel trio. */
              logoBorder: (() => {
                const el = document.querySelector('.sh-logo');
                return el ? getComputedStyle(el).borderTopWidth : '';
              })(),
              navCtaHeight: (() => {
                const el = document.querySelector('.sh-btn');
                return el ? Math.round(el.getBoundingClientRect().height) : -1;
              })(),
              panel: (() => {
                /* A .g-panel-loop is the diagram's inset well (the scrim over whatever is behind it), not a
                 * raised box, so the trio is measured on a panel that is one. */
                const el = document.querySelector('.g-panel:not(.g-panel-loop)');
                if (!el) return null;
                const cs = getComputedStyle(el);
                return { bg: cs.backgroundColor, border: cs.borderTopColor };
              })()
            };
          })(),
          /* The first body CTA the screen shows, if it shows one. The recap row's Edit buttons are a
           * documented exception - a 32px control in a table cell - so they are not what this measures. */
          bodyCta: (() => {
            const el = screen && [...screen.querySelectorAll('.g-btn')].find((b) => !b.closest('.g-recap-value'));
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {
              label: (el.textContent || '').trim().slice(0, 40),
              height: Math.round(el.getBoundingClientRect().height),
              minHeight: cs.minHeight
            };
          })(),
          title: document.title,
          progress: (document.getElementById('progressLabel') || {}).textContent || '',
          barWidth: ((document.getElementById('progressBar') || {}).style || {}).width || '',
          bootError: !document.getElementById('bootError').hidden,
          scriptFailure: !document.getElementById('scriptFailure').hidden,
          focusTag: document.activeElement ? document.activeElement.tagName : '',
          focusText: document.activeElement ? (document.activeElement.textContent || '').trim().slice(0, 60) : '',
          /* 1.2.2: the heading still takes focus on a screen change, but it must not draw a ring while it
           * holds it. That box around the title on load is the thing this release removed, so it is
           * measured rather than trusted to a rule name. */
          focusOutline: (() => {
            const el = document.activeElement;
            if (!el) return '';
            const cs = getComputedStyle(el);
            return cs.outlineStyle === 'none' ? 'none' : cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor;
          })(),
          whiteSpace: (() => {
            const el = screen && screen.querySelector('.g-choice, .g-option');
            return el ? getComputedStyle(el).whiteSpace : '';
          })(),
          overflow: (() => {
            const els = screen ? [...screen.querySelectorAll('.g-choice, .g-choice-desc, .g-panel, .g-option')] : [];
            const wide = els.filter((el) => el.scrollWidth > el.clientWidth + 1);
            return wide.length ? wide.length + ' overflowing: ' + wide[0].className : 'none';
          })()
        };
      })()`,
      returnByValue: true
    });

    const state = dump.result.value;
    const problems = [];
    /* A footer link's href is only worth what the page behind it is worth, so each one is resolved against
     * this run's base URL before it is judged. Cached, because the same links appear on all thirteen
     * routes and the answer cannot change between them. The Dev mode entry is a button, so it has no href
     * to resolve and is judged on its label alone. */
    for (const link of state.shell.footerLinkList || []) {
      if (link.raw) link.ok = await linkResolves(link.raw);
    }
    if (!state.ready) problems.push('the module never set data-app-ready');
    if (!state.rendered) problems.push('nothing rendered into #screen');
    if (state.bootError) problems.push('the boot error banner is showing');
    if (state.scriptFailure) problems.push('the "scripts did not load" banner is showing');
    for (const needle of check.must) {
      if (!state.text.toLowerCase().includes(needle.toLowerCase())) {
        problems.push(`missing text: "${needle}"`);
      }
    }
    for (const needle of check.mustNot || []) {
      if (state.text.includes(needle)) problems.push(`unexpected text: "${needle}"`);
    }
    if (check.hasSvg && state.svgs < 1) problems.push('expected the core-loop diagram');
    /* One <h1> per screen, and it is the screen's own title: the spec removes the hero, so the title is
     * the only h1 in the document and the thing focus lands on. */
    if (state.shell.h1Count !== 1) {
      problems.push(`the page should have exactly one <h1>, found ${state.shell.h1Count}: "${state.shell.h1Text}"`);
    } else if (!state.shell.h1InScreen) {
      problems.push(`the <h1> should be the screen's title, found "${state.shell.h1Text}"`);
    }
    if (state.focusTag !== 'H1' && state.rendered && state.focusText) {
      problems.push(`focus landed on ${state.focusTag}, not the screen heading`);
    }
    /* The heading still takes that focus - it is how a screen reader learns the screen changed - but it
     * must not draw the focus ring while it holds it. 1.2.2: no blue box around the title on load. */
    if (state.focusTag === 'H1' && state.focusOutline !== 'none' && state.focusOutline !== '0px none rgb(0, 0, 0)') {
      problems.push(`the screen heading draws a focus ring (${state.focusOutline}); 1.2.2 removes it`);
    }
    if (state.shell.headingsInScreen.startsWith('H2')) {
      problems.push(`a heading level comes before the screen's title: ${state.shell.headingsInScreen}`);
    }
    if (!state.shell.crumbs) problems.push('the app container header shows no breadcrumb trail');
    /* Every crumb but the current step is a link back to that step (the spec's "clickable
     * breadcrumbs"). Screens with no step before them - home, and the stubs that render it - have a
     * one-crumb trail that is entirely the current step, so there is nothing to link to. */
    if (check.back !== false && state.shell.crumbLinks < 1) {
      problems.push('the breadcrumb trail has no clickable crumbs');
    }
    if (!state.shell.stickyTop.startsWith('sticky')) problems.push(`the app container header is not sticky (${state.shell.stickyTop})`);
    /* 1.2.0: the sticky bar is borderless and translucent, so content reads through it as it scrolls
     * under. The material is the canvas at 85%, which is not fully opaque. */
    if (state.shell.headBorder !== '0px/0px') {
      problems.push(`the app container header should be borderless, it has ${state.shell.headBorder} top/bottom`);
    }
    if (!isColour(state.shell.headBg, '16, 16, 20', 0.85)) {
      problems.push(`the app container header should be the canvas at 85%, it is ${state.shell.headBg}`);
    }
    if (!/blur/.test(state.shell.headBackdrop)) {
      problems.push(`the app container header should blur what scrolls under it (${state.shell.headBackdrop})`);
    }
    /* v2: a fixed header, 72px, painted with the body colour at 95%, with no bottom border. */
    if (state.shell.headerPosition !== 'fixed') problems.push(`the site header should be fixed, it is ${state.shell.headerPosition}`);
    /* 72px wherever the row fits; the check is on the measured height against the width this dump was
     * taken at, so a wrapped phone header is not mistaken for a broken desktop one. */
    if (state.shell.viewportWidth > 760 && state.shell.headerH !== 72) {
      problems.push(`the site header should be 72px tall at ${state.shell.viewportWidth}px, it is ${state.shell.headerH}px`);
    }
    /* v2 fixed a 72px header painted with the body colour at 95%, and 1.2.2 frosted it. The owner amended
     * that: the bar is transparent over the top of the page, so the artwork and the page's glow run to the top
     * of the window uninterrupted, and it takes the spec's tint and blur only once the page has scrolled under
     * it. Both states are asserted here, and both are measured in one pass, because the risk with a rule like
     * this is precisely that the second state is never reached - a header that never tints is as wrong as one
     * that always does. The probe returns to the top when it is done, so the checks that follow see the page
     * as they expect to. */
    const headerProbe = await send('Runtime.evaluate', {
      expression: `(async () => {
        const el = document.querySelector('.sh-header');
        if (!el) return null;
        const read = () => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, blur: cs.backdropFilter, cls: el.className.trim() };
        };
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 150));
        const atRest = read();
        /* A page with no room to scroll can never reach the scrolled state - and on such a page transparent is
         * the right answer rather than a failure, because the bar has nothing to sit over. Those pages are
         * reported as such and only their resting state is checked. */
        const canScroll = document.documentElement.scrollHeight > innerHeight + 4;
        if (!canScroll) return { canScroll, atRest, scrolled: null };
        window.scrollTo(0, Math.min(600, document.documentElement.scrollHeight - innerHeight));
        await new Promise((r) => setTimeout(r, 300));
        const scrolled = read();
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 150));
        return { canScroll, atRest, scrolled };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const headerStates = headerProbe.result.value;
    if (headerStates) {
      if (headerStates.atRest.bg !== 'rgba(0, 0, 0, 0)') {
        problems.push(`the site header should be transparent over the top of the page, it is ${headerStates.atRest.bg}`);
      }
      if (headerStates.scrolled) {
        if (headerStates.scrolled.bg !== 'rgba(16, 16, 20, 0.9)') {
          problems.push(`the site header should take the spec's rgba(16, 16, 20, 0.9) once the page has scrolled, it is ${headerStates.scrolled.bg}`);
        }
        /* A blur of 0px at rest is deliberate (a value the browser can interpolate, unlike `none`), so the
         * scrolled state is checked for a real radius rather than for the word. */
        if (!/blur\((?!0px)/.test(headerStates.scrolled.blur)) {
          problems.push(`the site header should frost what scrolls under it once scrolled (${headerStates.scrolled.blur})`);
        }
      } else if (headerStates.canScroll) {
        problems.push('the page can scroll but the header probe could not scroll it, so the scrolled state went unchecked');
      }
    } else {
      problems.push('no .sh-header was found to check its resting and scrolled states');
    }
    if (state.shell.headerBorder !== '0px') {
      problems.push(`the site header should have no bottom border, it has ${state.shell.headerBorder}`);
    }
    /* 1.2.0 took the search field and the Dev mode control out of the header. Asserted both ways: gone
     * from the header, and present in the footer, so neither can be lost in the move. */
    if (state.shell.headerSearch) problems.push('the header still carries the search field; 1.2.0 removes it');
    if (state.shell.headerDevMode) problems.push('the header still carries the Dev mode control; 1.2.0 moves it to the footer');
    if (!state.shell.devInFooter) problems.push('the footer does not carry the Dev mode control');
    if (!/dev mode\s*(on|off)/i.test(state.shell.devLabel)) {
      problems.push(`the Dev mode link does not state its state in words (${state.shell.devLabel})`);
    }
    /* The one action left in the header is Admin, as the library's secondary control. */
    if (!state.shell.adminInHeader) problems.push('the header does not carry the Admin action');
    if (!/sh-btn-secondary/.test(state.shell.adminClasses)) {
      problems.push(`Admin should be the secondary control, its classes are "${state.shell.adminClasses}"`);
    }
    if (state.shell.adminIcons !== 0) problems.push(`the Admin action should carry no icon, it has ${state.shell.adminIcons}`);
    if (!isColour(state.shell.adminBg, '255, 255, 255', 0.15)) {
      problems.push(`the Admin fill should be the library's 15% secondary step, it is ${state.shell.adminBg}`);
    }
    /* The label colours, computed: this is the assertion that would have caught guide.css's link rule
     * reaching into the shell. A declaration in shell.css is not proof of what the page paints. */
    if (!isColour(state.shell.adminColor, '255, 255, 255', 0.95)) {
      problems.push(`the Admin label should be the library's text colour (95% white), it is ${state.shell.adminColor}`);
    }
    if (!isColour(state.shell.footerAdminColor, '255, 255, 255', 0.75)) {
      problems.push(`the footer's admin link should be the library's secondary text colour, it is ${state.shell.footerAdminColor}`);
    }
    if (parseInt(state.shell.bodyTopPad, 10) < 72) {
      problems.push(`the page does not clear the fixed header (body padding-top ${state.shell.bodyTopPad})`);
    }
    if (state.shell.appTopBelowHeader < 0) {
      problems.push(`the app container sits under the fixed header (${state.shell.appTopBelowHeader}px below it)`);
    }
    /* The spec's 64px inset. Phones are allowed to ease it down to 16px, so this only fails when the
     * container is flush against the page edge at desktop width. */
    if (parseInt(state.shell.inset, 10) < 16) problems.push(`the app container has no page inset (${state.shell.inset})`);
    if (state.shell.footerBg === 'rgba(0, 0, 0, 0)') problems.push('the footer has no background');
    /* The spec's navigation is one item, and the footer is the utility bar: the status, the Dev mode
     * link 1.2.0 moved down here, and the admin entry point. */
    if (state.shell.navItems !== 1 || !/^home$/i.test(state.shell.navText)) {
      problems.push(`the header navigation should be the single item "Home", found ${state.shell.navItems}: "${state.shell.navText}"`);
    }
    if (state.shell.footerAdminLinks < 1) problems.push('the footer carries no "Go to admin page" link');
    if (!/go to admin page/i.test(state.shell.footerText)) problems.push('the footer admin link is not labelled "Go to admin page"');
    /* The footer's utility links, named rather than counted. The count said "two" until the mockups page
     * landed and its link was put here, and a number that has to be edited every time the app grows a page
     * is a check on the number instead of on the links. So: every link the footer carries must point at a
     * page that exists, and the three it should carry must all be there.
     *
     * Dev mode is matched by prefix on purpose: it is a button that states its own state, so its label is
     * "Dev mode on" or "Dev mode off" depending on the setting - and it is the one footer entry with no
     * href, which is why an empty href is not a broken one. */
    for (const link of state.shell.footerLinkList) {
      if (link.raw && !link.ok) {
        problems.push(`the footer link "${link.label}" points at ${link.raw}, which is not a page that exists`);
      }
    }
    for (const want of ['dev mode', 'home page mockups', 'go to admin page']) {
      const found = state.shell.footerLinkLabels.some((label) => label.startsWith(want));
      if (!found) {
        problems.push(`the footer is missing its "${want}" link; it carries: ${state.shell.footerLinkLabels.join(', ')}`);
      }
    }
    if (!/dev mode/i.test(state.shell.footerText)) problems.push('the footer does not mention Dev mode, which 1.2.0 moved into it');
    /* And nothing of the old footer content came back with it. */
    if (/not affiliated|epic games|sources?/i.test(state.shell.footerText.replace(/go to admin page|dev mode/gi, ''))) {
      problems.push(`the footer carries content beyond the status and the two links: "${state.shell.footerText}"`);
    }
    /* The progress bar is the published blue-to-indigo ramp as of 1.2.1, replacing Forge's own yellow. */
    if (!/rgb\(51,\s*191,\s*255\)/.test(state.shell.progressBg)) {
      problems.push(`the progress bar does not start at the palette's blue-400 #33BFFF (${state.shell.progressBg})`);
    }
    if (!/rgb\(134,\s*138,\s*253\)/.test(state.shell.progressBg)) {
      problems.push(`the progress bar does not end at the palette's indigo-400 #868AFD (${state.shell.progressBg})`);
    }
    /* v2 removes the hero, its video and its still. */
    if (state.shell.hero) problems.push('the hero is still in the document; the spec removes it');
    if (!/logo_epic\.svg$/.test(state.shell.logo)) {
      problems.push(`the header mark is not the Epic logo 1.2.1 names (${state.shell.logo})`);
    }
    /* 1.2.1: no border on the mark, and the two control heights it settled. */
    if (parseFloat(state.shell.logoBorder) !== 0) {
      problems.push(`the header mark draws a ${state.shell.logoBorder} border; 1.2.1 removes it`);
    }
    /* The footer's top border is gone too - and this one is a trap worth naming: the older chrome's bare
     * `footer` rule draws it from inside its cascade layer, so deleting the declaration is not enough,
     * the frame has to say `border: 0`. */
    if (parseFloat(state.shell.footerBorder) !== 0) {
      problems.push(`the footer still draws a ${state.shell.footerBorder} top border; 1.2.1 removes it`);
    }
    if (state.shell.navCtaHeight !== 32) {
      problems.push(`the navigation CTA is ${state.shell.navCtaHeight}px; 1.2.1 makes it 32px`);
    }
    /* The body CTA height is checked from the workspace's own stylesheet plus the rendered control: the
     * home screen has no .g-btn of its own, so the wizard screens are where this is measured. */
    if (state.bodyCta && state.bodyCta.height !== 40) {
      problems.push(`a body CTA measures ${state.bodyCta.height}px; 1.2.1 makes it 40px (${state.bodyCta.label})`);
    }
    if (state.bodyCta && parseFloat(state.bodyCta.minHeight) < 40) {
      problems.push(`a body CTA declares min-height ${state.bodyCta.minHeight}: ${state.bodyCta.label}`);
    }
    /* The panel trio: base, hover step and subtle edge, all three from the palette. */
    if (state.shell.panel && state.shell.panel.bg !== 'rgb(28, 28, 32)') {
      problems.push(`a panel rests on ${state.shell.panel.bg}; 1.2.1's base panel is #1c1c20`);
    }
    if (state.shell.panel && state.shell.panel.border !== 'rgb(52, 52, 55)') {
      problems.push(`a panel's edge is ${state.shell.panel.border}; 1.2.1's subtle border is #343437`);
    }
    /* Every screen of the wizard carries a visible way back (spec v2). */
    if (check.back !== false && state.shell.backButtons < 1) {
      problems.push(`the ${check.name} screen has no visible Back button`);
    }
    if (state.overflow !== 'none') problems.push(`content overflows its box — ${state.overflow}`);

    /* Missing brand art and videos are expected until the assets are supplied — the placeholders are
     * the point — so they are counted and reported, not treated as failures. */
    const logErrors = events
      .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      .map((e) => e.params.entry.text);
    const assetMisses = logErrors.filter((t) => /Failed to load resource/.test(t)).length;
    const realErrors = logErrors.filter((t) => !/Failed to load resource/.test(t));

    const pageErrors = realErrors.concat(
      events
        .filter((e) => e.method === 'Runtime.exceptionThrown')
        .map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description || ''))
    );

    await send('Page.captureScreenshot', { format: 'png' }).then(({ data }) =>
      writeFile(path.join(OUT, `${check.name}.png`), Buffer.from(data, 'base64'))
    );

    if (check.mobile) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: check.mobile,
        height: 900,
        deviceScaleFactor: 1,
        mobile: true
      });
      await sleep(400);
      /* The header is one 72px row while it fits and wraps into two when the row genuinely cannot hold
       * the logo, the Home link, the search field and both actions. Either way the invariant is the
       * same: nothing overflows, the destination survives, and whatever height the header ends up with
       * is the height the page offsets itself by. */
      const nav = await send('Runtime.evaluate', {
        expression: `(() => {
          const nav = document.getElementById('siteNav');
          const header = document.getElementById('siteHeader');
          const item = document.querySelector('.sh-nav-link');
          const admin = document.querySelector('.sh-btn-admin');
          const headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;
          const declared = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sh-header-h'));
          return {
            width: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
            items: item ? 1 : 0,
            itemVisible: item ? item.getBoundingClientRect().width > 0 : false,
            adminVisible: admin ? admin.getBoundingClientRect().width > 0 : false,
            headerH,
            declared: Math.round(declared),
            bodyTopPad: Math.round(parseFloat(getComputedStyle(document.body).paddingTop)),
            barOverflows: nav ? nav.scrollWidth > nav.clientWidth + 1 : false,
            docOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            /* Which element is wider than the viewport, so an overflow is a name and not a number. */
            widest: [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
              .slice(0, 3)
              .map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') +
                ' →' + Math.round(el.getBoundingClientRect().right) + 'px')
              .join(', ')
          };
        })()`,
        returnByValue: true
      });
      const navState = nav.result.value || {};
      if (!navState.itemVisible) {
        problems.push(`the Home link is not visible at ${check.mobile}px wide`);
      } else if (!navState.adminVisible) {
        problems.push(`the Admin action is not visible at ${check.mobile}px wide`);
      } else if (navState.barOverflows || navState.docOverflows) {
        problems.push(
          `the page overflows the viewport at ${check.mobile}px wide` +
            (navState.widest ? ` — widest: ${navState.widest}` : '')
        );
      } else if (Math.abs(navState.headerH - navState.declared) > 1 || Math.abs(navState.headerH - navState.bodyTopPad) > 1) {
        problems.push(
          `the header is ${navState.headerH}px tall but the page offsets it by ${navState.bodyTopPad}px ` +
            `(--sh-header-h ${navState.declared}px) at ${check.mobile}px wide`
        );
      } else {
        console.log(
          `       · header at ${check.mobile}px: ${navState.headerH}px, nav row ${navState.width}px, ` +
            `Home and Admin both visible, page offset matches`
        );
      }
      await send('Page.captureScreenshot', { format: 'png' }).then(({ data }) =>
        writeFile(path.join(OUT, `${check.name}-mobile.png`), Buffer.from(data, 'base64'))
      );
    }

    results.push({ name: check.name, state, problems, pageErrors });
    const flag = problems.length || pageErrors.length ? 'FAIL' : 'ok  ';
    console.log(
      `${flag} ${check.name.padEnd(16)} devices=${String(state.devices).padStart(3)} settings=${String(state.settings).padStart(3)} ` +
        `cards=${String(state.cards).padStart(2)} options=${String(state.options).padStart(2)} svg=${state.svgs} ` +
        `h=${state.headings} progress=${state.progress || '-'} focus=${state.focusTag} ws=${state.whiteSpace} assets-missing=${assetMisses}`
    );
    for (const p of problems) console.log(`       ! ${p}`);
    for (const e of pageErrors.slice(0, 4)) console.log(`       ! console: ${e}`);
    if (problems.some((p) => p.startsWith('missing text'))) {
      console.log(`       ? first 320 chars rendered: ${state.text.slice(0, 320)}`);
    }
  }

  /* Phase two: drive the wizard the way a person does — real clicks, no deep links — and check the
   * things a screenshot cannot: that an answer advances the flow, that the plan changes with the
   * answers, that saving, dev mode and deletion all work. */
  await driveTheWizard(send, results);

  /* Phase three: the mockups' own contract. */
  await checkMockupHeaders(send, results);

  close();
  chrome.kill();

  const failed = results.filter((r) => r.problems.length || r.pageErrors.length);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('Failures: ' + failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

/* ============================ phase three: the mockups' header ============================ */

/** The chrome every mockup page shares, so the pages can be compared against each other and against the
 * app. The whole treatment is in one place - public/concepts/_shared/chrome.css - which is also what makes
 * it checkable, because there is one definition to measure rather than thirteen.
 *
 * What is asserted, per page:
 *   - a <header> that is 72px, and a 44px Epic mark inside it, loaded, sitting within the bar;
 *   - that mark wrapped in .logo-wrap, with no box of its own: no background, no border;
 *   - a hover shade on the mark (measured by moving the pointer onto it, since only the browser knows);
 *   - a mark that contrasts with what is behind it, computed rather than assumed: the SVG is white, so a
 *     page either shows it that way or recolours it with .logo-img-black, and either choice has to work;
 *   - the shared stylesheet actually linked, and the column at 1136px.
 *
 * The pages are listed from the disk rather than from a list here: a new mockup is covered the day it
 * appears, not the day someone remembers to add it. Everything below is measured, never assumed. */
async function checkMockupHeaders(send, results) {
  const problems = [];
  const insets = [];
  const dir = path.join(process.cwd(), 'public', 'concepts');

  const pages = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    /* Folders beginning with _ hold assets and the shared stylesheet, not pages; concepts/index.html is a
     * one-line pointer to the mockups index rather than a mockup. */
    if (entry.isDirectory() && !entry.name.startsWith('_')) pages.push(`concepts/${entry.name}/index.html`);
  }
  pages.push('mockups/index.html');
  pages.sort();

  /* The footer is shared chrome like the bar and the column, so it is asserted the same way. Fifteen pages
   * carry it. The four app prototypes do not, on the owner's instruction - they are screens of the app, not
   * pitch pages - and that decision is checked from both sides, so neither a missing footer nor a stray one
   * goes unnoticed. The slogan is the owner's wording, quoted rather than paraphrased. */
  const SLOGAN = 'Design in Forge. Build in UEFN. Play in Fortnite.';
  const FOOTER_PAGES = new Set([
    'concepts/1-cinematic/index.html',
    'concepts/2-funky/index.html',
    'concepts/3-lobby/index.html',
    'concepts/4-editorial/index.html',
    'concepts/5-bento/index.html',
    'concepts/6-one-question/index.html',
    'concepts/7-three-steps/index.html',
    'concepts/8-quiet-dark/index.html',
    'concepts/8-quiet-dark-blue-indigo/index.html',
    'concepts/9-spotlight/index.html',
    'concepts/10-uefn-editor/index.html',
    'concepts/11-item-shop/index.html',
    'concepts/12-launcher/index.html',
    'concepts/13-patch-bay/index.html',
    'mockups/index.html'
  ]);
  /* Links the pages already had, which the owner asked to keep: 4-editorial's four, the index's one. */
  const FOOTER_LINKS = { 'concepts/4-editorial/index.html': 4, 'mockups/index.html': 1 };

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  for (const page of pages) {
    const before = problems.length;
    await send('Page.navigate', { url: new URL(page, BASE).href });
    await sleep(900);
    const measured = await send('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('header');
        if (!header) return { header: null };
        /* Every mark on the page, not just the header's: three mockups carry a second one in the footer,
         * and those were the ones measuring 23px and 26px and sitting inside a rotated pink frame. */
        const marks = [...document.images].filter((i) => /logo_epic/.test(i.getAttribute('src') || ''));
        const mark = marks.find((i) => header.contains(i)) || marks[0] || header.querySelector('img');

        /* What the mark sits on, composited from the outermost painted layer inwards. Reading one
         * element's background would report the wrong colour wherever a translucent sticky bar sits over
         * a coloured section, which is most of these pages; a gradient counts as a layer too, because
         * 9-spotlight paints its header with one. */
        const parse = (value) => {
          const m = /rgba?\\(([^)]+)\\)/.exec(value || '');
          if (!m) return null;
          const p = m[1].split(',').map((v) => parseFloat(v));
          return { r: p[0], g: p[1], b: p[2], a: p.length === 4 ? p[3] : 1 };
        };
        const gradientStop = (value) => {
          const hex = /#([0-9a-f]{6})/i.exec(value || '');
          if (hex) return { r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16), a: 1 };
          return parse(/rgb\\([^)]+\\)/.exec(value || '')?.[0] || '');
        };
        const behindOf = (el) => {
          const layers = [];
          let cursor = el ? el.parentElement : null;
          while (cursor) {
            const cs = getComputedStyle(cursor);
            let layer = parse(cs.backgroundColor);
            if (!layer || layer.a === 0) layer = gradientStop(cs.backgroundImage);
            if (layer && layer.a > 0) layers.push(layer);
            cursor = cursor.parentElement;
          }
          let behind = { r: 255, g: 255, b: 255 };
          for (const layer of layers.reverse()) {
            behind = {
              r: layer.r * layer.a + behind.r * (1 - layer.a),
              g: layer.g * layer.a + behind.g * (1 - layer.a),
              b: layer.b * layer.a + behind.b * (1 - layer.a)
            };
          }
          return behind;
        };
        const wrap = mark ? mark.parentElement : null;
        const wrapStyle = wrap ? getComputedStyle(wrap) : null;
        const behind = behindOf(wrap);
        const luminance = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        const markBlack = mark ? /brightness\\(0\\)/.test(getComputedStyle(mark).filter) : false;
        const light = Math.max(luminance(behind), markBlack ? 0 : 1);
        const dark = Math.min(luminance(behind), markBlack ? 0 : 1);
        /* The bar is measured by its rendered box. A mark is measured by offsetHeight, its laid-out
         * height, because a rotated frame's bounding box is bigger than the image inside it - which is how
         * 2-funky's mark measured 47px for a 44px image. */
        return {
          header: header.getBoundingClientRect().height,
          mark: mark ? mark.offsetHeight : null,
          /* A mark that measures 44px but sits outside the bar it belongs to is not a 72px header: the two
           * prototype pages used to carry a 156px lockup overhanging its bar, which two numbers cannot see. */
          markInside: mark
            ? (() => {
                const bar = header.getBoundingClientRect();
                const box = mark.getBoundingClientRect();
                return box.top >= bar.top - 1 && box.bottom <= bar.bottom + 1;
              })()
            : false,
          markSrc: mark ? mark.getAttribute('src') : null,
          markClass: mark ? String(mark.className || '') : null,
          markLoaded: mark ? (mark.loading === 'lazy' ? true : mark.complete && mark.naturalWidth > 0) : false,
          wrapClass: wrap ? String(wrap.className || '') : null,
          wrapBackground: wrapStyle ? wrapStyle.backgroundColor : null,
          wrapBorder: wrapStyle ? wrapStyle.borderTopWidth : null,
          sharedLink: !!document.querySelector('link[href*="_shared/chrome.css"]'),
          /* A footer link on a long mockup eases instead of snapping, on every page rather than on the seven
           * that had thought of it. */
          scrollBehaviour: getComputedStyle(document.documentElement).scrollBehavior,
          subLabel: document.querySelectorAll('.logo-sub, [class*="logo-sub"]').length,
          columns: [...document.querySelectorAll('.wrap')].map((el) => Math.round(el.getBoundingClientRect().width)),
          /* Where the mark sits inside its column, and how wide that column's content is. The absolute x
           * is not the thing to compare between pages: a page tall enough to scroll loses a scrollbar's
           * width to the viewport and everything shifts about 7px with it. The inset is what "the logo is
           * in the same place" means, and it is where a page that kept its own gutter, or centred its
           * lockup, gives itself away. The content width is what the owner chose: 1136px with no gutter at
           * a desktop width, which is not the same as a 1136px box with a gutter inside it. */
          inset: (() => {
            const column = mark ? mark.closest('.wrap') : null;
            if (!column) return null;
            const cs = getComputedStyle(column);
            const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            return {
              px: Math.round(mark.getBoundingClientRect().left - column.getBoundingClientRect().left),
              column: Math.round(column.getBoundingClientRect().left),
              mark: Math.round(mark.getBoundingClientRect().left),
              padding: cs.paddingLeft,
              content: Math.round(column.clientWidth - pad)
            };
          })(),
          markColour: markBlack ? 'black' : 'white',
          behind: 'rgb(' + Math.round(behind.r) + ', ' + Math.round(behind.g) + ', ' + Math.round(behind.b) + ')',
          contrast: +((light + 0.05) / (dark + 0.05)).toFixed(2),
          /* The footer, which is one footer across the set: the same lockup, the same wording, the same
           * height. The owner's brief was explicit - "epic logo and forge on all of them", 120px tall, the
           * slogan everywhere, the links kept - so each of those is measured rather than assumed. */
          footer: (() => {
            const foot = document.querySelector('footer');
            if (!foot) return null;
            const word = foot.querySelector('.logo-word');
            const hWord = document.querySelector('header .logo-word');
            const cs = word ? getComputedStyle(word) : null;
            const hcs = hWord ? getComputedStyle(hWord) : null;
            const slogan = foot.querySelector('.foot-slogan');
            const footMark = foot.querySelector('.logo-img');
            const row = foot.querySelector('.foot-inner');
            const footWordCs = word ? getComputedStyle(word) : null;
            const headWord = document.querySelector('header .logo-word');
            const headWordCs = headWord ? getComputedStyle(headWord) : null;
            return {
              height: Math.round(foot.getBoundingClientRect().height),
              cls: String(foot.className || ''),
              inner: !!foot.querySelector('.foot-inner'),
              lockup: !!foot.querySelector('.logo-lockup'),
              word: word ? word.textContent.replace(/\\s+/g, ' ').trim() : null,
              face: cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : null,
              size: cs ? cs.fontSize : null,
              transform: cs ? cs.textTransform : null,
              headerSize: hcs ? hcs.fontSize : null,
              slogan: slogan ? slogan.textContent.replace(/\\s+/g, ' ').trim() : null,
              /* The wordmark takes the mark's colour - white, or black beside a recoloured mark - in the
               * footer and in the header. Inheriting instead made "FORGE" grey in most footers while the mark
               * beside it stayed white, which is what the owner reported. */
              wordColour: footWordCs ? footWordCs.color : null,
              footMarkBlack: footMark ? /logo-img-black/.test(String(footMark.className || '')) : null,
              headWordColour: headWordCs ? headWordCs.color : null,
              /* Links the page put in its footer, not counting the lockup's own link. */
              links: [...foot.querySelectorAll('a')].filter((a) => !a.closest('.logo-lockup')).length,
              separators: document.querySelectorAll('.brand-sep, .logo-sep, .foot-sep, [class*="brand-sep"]').length,
              /* Where the footer's own mark sits, and how wide the row is. The lockup is the same lockup as
               * the header's, so it has to land on the same x: a footer that centred its content, or a row
               * that shrank to fit it, puts the mark somewhere else on the page it belongs to. */
              markLeft: footMark ? Math.round(footMark.getBoundingClientRect().left) : null,
              rowWidth: row ? Math.round(row.getBoundingClientRect().width) : null
            };
          })(),
          /* Every other mark on the page gets the same treatment as the header's: three mockups carry a
           * second one in the footer, and those were the ones at 23px and 26px. */
          others: marks.filter((i) => i !== mark).map((i) => {
            const w = i.parentElement;
            const ws = w ? getComputedStyle(w) : null;
            return {
              size: i.offsetHeight,
              loaded: i.loading === 'lazy' ? true : i.complete && i.naturalWidth > 0,
              cls: String(i.className || ''),
              wrapCls: w ? String(w.className || '') : '',
              background: ws ? ws.backgroundColor : null,
              border: ws ? ws.borderTopWidth : null,
              contrast: (() => {
                const b = behindOf(w);
                const black = /brightness\\(0\\)/.test(getComputedStyle(i).filter);
                const l1 = Math.max(luminance(b), black ? 0 : 1);
                const l2 = Math.min(luminance(b), black ? 0 : 1);
                return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
              })()
            };
          }),
          /* Below-the-fold images are marked loading="lazy" and have not been fetched yet, which is not
           * a fault - they are left out so that the check reports the ones that really failed. */
          images: [...document.images]
            .filter((i) => i.loading !== 'lazy' && !(i.complete && i.naturalWidth > 0))
            .map((i) => i.getAttribute('src'))
        };
      })()`,
      returnByValue: true
    });
    const state = measured.result.value || {};

    if (state.header == null) {
      problems.push(`${page} has no <header> at all, so it cannot carry the shared 72px bar`);
      continue;
    }
    if (Math.round(state.header) !== 72) problems.push(`${page} has a ${Math.round(state.header)}px header, not 72px`);
    if (state.mark == null) {
      problems.push(`${page} has no mark image in its header`);
    } else {
      if (Math.round(state.mark) !== 44) problems.push(`${page} shows its header mark at ${Math.round(state.mark)}px, not 44px`);
      if (!state.markInside) problems.push(`${page} draws its mark outside the header bar it belongs to`);
      if (!/\blogo-img\b/.test(state.markClass || '')) problems.push(`${page} does not give its mark the shared class logo-img (${state.markClass})`);
      if (!/\blogo-wrap\b/.test(state.wrapClass || '')) problems.push(`${page} does not give the mark's wrapper the shared class logo-wrap (${state.wrapClass})`);
      /* No box around the mark: the app's own logo has none, and a tile is what the owner asked to be rid of. */
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(state.wrapBackground || '')) {
        problems.push(`${page} paints a background behind its mark (${state.wrapBackground}) instead of letting the page show through`);
      }
      if (parseFloat(state.wrapBorder) > 0) problems.push(`${page} draws a ${state.wrapBorder} border around its mark`);
      if (state.contrast < 3) {
        problems.push(`${page} shows a ${state.markColour} mark on ${state.behind}, a contrast of ${state.contrast}:1`);
      }
    }
    /* A mark that did not load is invisible, and invisible is what the owner asked about, so loading is
     * checked on every mark rather than only on the header's. */
    if (state.mark != null && !state.markLoaded) problems.push(`${page} shows a mark that did not load (${state.markSrc})`);
    const otherMarks = state.others || [];
    otherMarks.forEach((m, n) => {
      const which = `the ${n === 0 ? 'second' : n + 1 + 'th'} mark on the page`;
      if (Math.round(m.size) !== 44) problems.push(`${page} shows ${which} at ${Math.round(m.size)}px, not 44px`);
      if (!m.loaded) problems.push(`${page} shows ${which} unloaded, so it is not visible`);
      if (!/\blogo-img\b/.test(m.cls)) problems.push(`${page} does not give ${which} the shared class logo-img (${m.cls})`);
      if (!/\blogo-wrap\b/.test(m.wrapCls)) problems.push(`${page} does not give ${which} the shared wrapper logo-wrap (${m.wrapCls})`);
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(m.background || '')) problems.push(`${page} paints a box behind ${which} (${m.background})`);
      if (parseFloat(m.border) > 0) problems.push(`${page} draws a ${m.border} border around ${which}`);
      if (m.contrast < 3) problems.push(`${page} shows ${which} at a contrast of only ${m.contrast}:1`);
    });
    /* The footer. Eleven pages carry the shared one; the four app prototypes (lessons-1-default,
     * questions-1-default, randomiser-1-slots, randomiser-2-quiet-blue) are screens of the app rather than
     * pitch pages, and the owner asked for the footer to be skipped there "for now" - so their absence is
     * checked as well, and a footer that turns up on one of them by accident is reported rather than
     * ignored. Links are counted outside the lockup, because the lockup is itself a link. */
    if (FOOTER_PAGES.has(page)) {
      const f = state.footer;
      if (!f) problems.push(`${page} has no <footer>, so it is missing the shared 120px footer`);
      else {
        if (!f.cls.split(/\s+/).includes('foot')) problems.push(`${page}'s footer is class "${f.cls}", not the shared "foot"`);
        if (!f.inner) problems.push(`${page}'s footer has no .foot-inner row, so the shared footer layout is not in use`);
        if (f.height !== 120) problems.push(`${page}'s footer is ${f.height}px tall, not the shared 120px`);
        if (!f.lockup) problems.push(`${page}'s footer has no .logo-lockup, so the mark and the wordmark are not one unit`);
        if (f.word == null || f.word.toLowerCase() !== 'forge') problems.push(`${page}'s footer wordmark reads ${JSON.stringify(f.word)}, not Forge`);
        if (f.face !== 'Archivo Black') problems.push(`${page}'s footer wordmark is set in ${f.face}, not the locked Archivo Black`);
        if (f.size !== '15px') problems.push(`${page}'s footer wordmark is ${f.size}, not the locked 15px`);
        if (f.transform !== 'uppercase') problems.push(`${page}'s footer wordmark is not uppercased by the shared rule`);
        if (f.headerSize !== '20px') problems.push(`${page}'s header wordmark is ${f.headerSize}, not the locked 20px`);
        /* The wordmark's colour is the mark's colour. Two pages were missing a header wordmark entirely
         * (8-quiet-dark and its indigo sibling) and the rest had a grey one in the footer. */
        const wantWord = f.footMarkBlack ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
        if (f.wordColour !== wantWord) problems.push(`${page}'s footer wordmark is ${f.wordColour} beside a ${f.footMarkBlack ? 'black' : 'white'} mark, not ${wantWord}`);
        const wantHeadWord = state.markColour === 'black' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
        if (f.headWordColour !== wantHeadWord) problems.push(`${page}'s header wordmark is ${f.headWordColour} beside a ${state.markColour} mark, not ${wantHeadWord}`);
        if (f.slogan !== SLOGAN) problems.push(`${page}'s footer says ${JSON.stringify(f.slogan)}, not the shared slogan`);
        if (f.separators) problems.push(`${page} still has ${f.separators} brand separator element(s), which the owner had removed`);
        /* The footer's lockup is the header's lockup, so it has to land on the same x - and the failure that
         * got past the first version of this check was a row that shrank to its content and centred (the
         * lockup 343px from where it belongs on 2-funky, 3-lobby, 4-editorial, 9-spotlight and the index). */
        if (f.rowWidth !== 1136) problems.push(`${page}'s footer row is ${f.rowWidth}px wide, not the shared 1136px column`);
        if (state.inset && f.markLeft !== state.inset.mark) {
          problems.push(`${page}'s footer puts its mark at x ${f.markLeft} where its own header puts it at ${state.inset.mark}`);
        }
        const wantLinks = FOOTER_LINKS[page] || 0;
        if (f.links !== wantLinks) problems.push(`${page}'s footer has ${f.links} link(s) outside its lockup, where it had ${wantLinks}`);
      }
    } else if (state.footer) {
      problems.push(`${page} has gained a <footer>, and the app prototypes were to keep none for now`);
    }
    if (!state.sharedLink) problems.push(`${page} does not link public/concepts/_shared/chrome.css`);
    if (state.scrollBehaviour !== 'smooth') problems.push(`${page} jumps to an anchor instead of scrolling to it (scroll-behavior: ${state.scrollBehaviour})`);
    if (state.subLabel) problems.push(`${page} still carries a lockup sub-label beside the wordmark, which the owner had removed`);
    if (!state.columns.length) problems.push(`${page} has no .wrap column`);
    else {
      const tooWide = state.columns.filter((w) => w > 1136);
      if (tooWide.length) problems.push(`${page} has a .wrap column ${Math.max(...tooWide)}px wide, over the shared 1136px`);
      /* The desktop contract: the column is 1136px of content, and no padding sits inside it. A page that
       * kept its own gutter would show up here as both a padding and a content width under 1136px. */
      else if (state.inset) {
        if (state.inset.padding !== '0px') problems.push(`${page} pads its column by ${state.inset.padding} at a desktop width, where the shared rule has no gutter`);
        if (state.inset.content !== 1136) problems.push(`${page} gives its column ${state.inset.content}px of content, not the shared 1136px`);
      } else if (!state.columns.includes(1136)) {
        problems.push(`${page} has no .wrap column at the shared 1136px (widest ${Math.max(...state.columns)}px)`);
      }
    }
    for (const src of state.images || []) problems.push(`${page} has an image that did not load: ${src}`);

    /* The hover shade is a browser fact, so it is measured by putting the pointer on the mark. The pointer
     * is parked off the bar first: it keeps its position across navigations, and a mark left hovered from
     * the previous page would read as a shade that was never there. */
    let shade = '';
    if (state.mark != null) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 990, buttons: 0 });
      await sleep(200);
      const at = await send('Runtime.evaluate', {
        expression: `(() => {
          const m = document.querySelector('.logo-img');
          const r = m.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: getComputedStyle(m).opacity };
        })()`,
        returnByValue: true
      });
      const spot = at.result.value || {};
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y, buttons: 0 });
      await sleep(300);
      const hovered = await send('Runtime.evaluate', {
        expression: `getComputedStyle(document.querySelector('.logo-img')).opacity`,
        returnByValue: true
      });
      const after = Number(hovered.result.value);
      shade = `${spot.before} -> ${hovered.result.value}`;
      if (!(after < Number(spot.before) - 0.01)) {
        problems.push(`${page} shows no shade when the pointer is on its mark (opacity ${spot.before} -> ${hovered.result.value})`);
      }
    }

    /* The wordmark shades with the mark - pointing at either shades both, which is what the owner asked for.
     * The footer is below the fold, so the page is scrolled to it before the pointer is placed. */
    let wordShade = '';
    if (state.footer && state.footer.word != null) {
      /* Scrolling once is not enough: three of these pages grow as their lazy images arrive, so one scroll
       * leaves the footer a thousand pixels below the fold and the pointer lands on nothing. Re-scroll until
       * the footer's own box says it is in view, exactly as the screenshot script has to. */
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.documentElement.scrollHeight); 1' });
        await sleep(500);
        const inView = await send('Runtime.evaluate', {
          expression: `(() => {
            const w = document.querySelector('footer .logo-word');
            if (!w) return true;
            const r = w.getBoundingClientRect();
            return r.bottom > 0 && r.bottom <= innerHeight + 1;
          })()`,
          returnByValue: true
        });
        if (inView.result.value) break;
      }
      const spot = await send('Runtime.evaluate', {
        expression: `(() => {
          const w = document.querySelector('footer .logo-word');
          if (!w) return null;
          const r = w.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
        returnByValue: true
      });
      const at2 = spot.result.value;
      if (at2) {
        /* Park the pointer and read the shade, retrying until the pointer is demonstrably on the wordmark.
         * A single pass was not enough and produced false failures: the page can still be growing under the
         * pointer as lazy images arrive, so the pointer ends up on whatever moved into that spot and reads a
         * perfectly correct opacity of 1 on a page with nothing wrong with it. elementFromPoint is what makes
         * the reading mean something - only when the wordmark is genuinely under the pointer does an opacity
         * of 1 count as a real problem. */
        let v = {};
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.documentElement.scrollHeight); 1' });
          await sleep(400);
          const at = await send('Runtime.evaluate', {
            expression: `(() => {
              const w = document.querySelector('footer .logo-word');
              if (!w) return null;
              const r = w.getBoundingClientRect();
              return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
            })()`,
            returnByValue: true
          });
          const point = at.result.value;
          if (!point) break;
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 300, buttons: 0 });
          await sleep(150);
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
          await sleep(350);
          const read = await send('Runtime.evaluate', {
            expression: `(() => {
              const w = document.querySelector('footer .logo-word');
              const m = document.querySelector('footer .logo-img');
              const hit = document.elementFromPoint(${point.x}, ${point.y});
              const onWord = Boolean(hit) && (hit === w || w.contains(hit) || hit.contains(w));
              return { word: getComputedStyle(w).opacity, mark: m ? getComputedStyle(m).opacity : null, onWord };
            })()`,
            returnByValue: true
          });
          v = read.result.value || {};
          if (v.onWord) break;
        }
        wordShade = `word ${v.word}, mark ${v.mark}`;
        const reached = v.onWord ? '' : ' - the pointer never landed on the wordmark, so this reading is not evidence';
        if (!(Number(v.word) < 0.99)) {
          problems.push(`${page}'s footer wordmark does not shade under the pointer (opacity ${v.word}${reached})`);
        }
        if (v.mark != null && !(Number(v.mark) < 0.99)) {
          problems.push(`${page}'s footer mark does not shade when the wordmark beside it is pointed at (opacity ${v.mark}${reached})`);
        }
      }
    }

    const verdict = problems.length > before ? 'FAIL ' : 'ok   ';
    console.log(
      `${verdict}chrome · ${page.replace('concepts/', '').replace('/index.html', '').padEnd(26)} ` +
        `header ${Math.round(state.header)}px, mark ${state.mark == null ? 'none' : Math.round(state.mark) + 'px'} ` +
        `${state.markColour} on ${state.behind} (${state.contrast}:1), column ${Math.max(0, ...(state.columns || [0]))}px` +
        `, x ${state.inset ? state.inset.mark + 'px' : '?'}` +
        (state.footer ? `, footer ${state.footer.height}px` : '') +
        (shade ? `, hover ${shade}` : '') +
        (wordShade ? `, footer hover ${wordShade}` : '')
    );
    if (state.inset) insets.push({ page, px: state.inset.px, padding: state.inset.padding, mark: state.inset.mark });
  }

  /* The column has two regimes, and the point of measuring them is the seam between them: no gutter at a
   * desktop width, where 1136px is the content; a gutter below 1280px, where the window is too narrow for
   * the column to keep itself off the screen edge. They have to meet without the content jumping, so the
   * three widths either side of the breakpoint are measured and compared. One page is enough - the rule is
   * one shared rule, and the page-by-page pass above has already checked every page follows it at 1440. */
  const regimePage = pages[0];
  await send('Page.navigate', { url: new URL(regimePage, BASE).href });
  await sleep(900);
  const regimes = [];
  for (const width of [1440, 1281, 1280, 1279, 900, 600, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = document.querySelector('.wrap');
        if (!c) return null;
        const cs = getComputedStyle(c);
        const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        return { gutter: parseFloat(cs.paddingLeft), content: Math.round(c.clientWidth - pad), available: document.documentElement.clientWidth };
      })()`,
      returnByValue: true
    });
    regimes.push({ width, ...res.result.value });
  }
  const at = (w) => regimes.find((r) => r.width === w) || {};
  for (const r of regimes) {
    /* Above the breakpoint the window's own margin is the gutter, so there must be none inside the column
     * and the content must be the full 1136px. Below it the gutter is the only margin, so it has to exist
     * and the content has to be narrower than the window. */
    if (r.width > 1280 && (r.gutter !== 0 || r.content !== 1136)) {
      problems.push(`at a ${r.width}px window the column has a ${r.gutter}px gutter and ${r.content}px of content, where the shared rule gives no gutter and 1136px`);
    }
    if (r.width <= 1280 && (r.gutter < 16 || r.content >= r.available)) {
      problems.push(`at a ${r.width}px window the column has a ${r.gutter}px gutter and ${r.content}px of content, where the shared rule gives it a real gutter inside the window`);
    }
  }
  const seam = [at(1279), at(1280), at(1281)].map((r) => r.content);
  if (Math.max(...seam) - Math.min(...seam) > 3) {
    problems.push(`the column's content jumps across the 1280px breakpoint: ${seam.join('px, ')}px at 1279/1280/1281`);
  }
  console.log(
    `ok   chrome · regimes               ` +
      regimes.map((r) => `${r.width}: ${r.content}px${r.gutter ? ` + ${r.gutter}px gutter` : ''}`).join(' · ')
  );
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* A short window. 1-cinematic is the only page whose header is fixed, so it takes no layout space and its
   * hero starts underneath - and that hero bottom-aligns its content, so on a window too short to hold the
   * content plus the nav's band the eyebrow slid up into the band. Measured at 1280x520, where the eyebrow's
   * text started at 69px against a 72px band. Every other page's header is sticky or static and therefore
   * occupies layout space, which is why this is a rule for the whole set rather than one page's worry: a page
   * that switches its header to fixed will fail here the moment it does. The tightest clearance is printed,
   * because "how much air is left" is the number that would have caught this before the owner did. */
  const cramped = [];
  for (const page of pages) {
    await send('Page.navigate', { url: new URL(page, BASE).href });
    await sleep(700);
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const nav = document.querySelector('header');
        if (!nav) return null;
        const band = nav.getBoundingClientRect().bottom;
        const leaves = [...document.querySelectorAll('body *')].filter((el) =>
          !nav.contains(el) && !el.children.length && (el.textContent || '').trim()
        ).filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
          return el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top >= 0;
        }).map((el) => ({ el, top: el.getBoundingClientRect().top }));
        const worst = leaves.slice().sort((a, b) => a.top - b.top)[0];
        const tops = leaves.map((c) => c.top);
        return {
          band: Math.round(band),
          fixed: getComputedStyle(nav).position === 'fixed',
          clearance: tops.length ? Math.round(Math.min(...tops) - band) : null,
          intruder: worst && worst.top < band
            ? worst.el.tagName.toLowerCase() + '.' + String(worst.el.className || '').split(' ')[0] + '"' +
              (worst.el.textContent || '').trim().slice(0, 20) + '" at ' + Math.round(worst.top) + 'px'
            : null
        };
      })()`,
      returnByValue: true
    });
    const v = res.result.value;
    if (!v) continue;
    cramped.push({ page, ...v });
    if (v.intruder) {
      problems.push(`${page} puts content inside its header's band in a 520px-tall window: ${v.intruder} against a ${v.band}px band`);
    }
  }
  const tightest = cramped.filter((c) => c.clearance != null).sort((a, b) => a.clearance - b.clearance)[0];
  console.log(
    `ok   chrome · short window          ` +
      (tightest
        ? `1280x520: tightest clearance ${tightest.clearance}px on ${tightest.page.replace('concepts/', '').replace('/index.html', '')}, ` +
          `${cramped.filter((c) => c.fixed).length} fixed header(s) of ${cramped.length}`
        : 'no content measured')
  );
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  /* One inset and one absolute position, or the logo is in a different place on every page - which is
   * exactly what the owner saw when the column width was shared but the gutter was still each page's own
   * business, and what the two prototype pages did by centring their lockup between two pills. Reported
   * with the pages attached, because "these five disagree" is the useful sentence and a number is not. */
  if (insets.length) {
    for (const [what, of] of [['inset inside its column', (i) => i.px], ['x on the page', (i) => i.mark]]) {
      const values = [...new Set(insets.map(of))].sort((a, b) => a - b);
      if (values.length > 1) {
        const byValue = values.map(
          (v) => `${v}px on ${insets.filter((i) => of(i) === v).map((i) => i.page.replace('concepts/', '').replace('/index.html', '')).join(', ')}`
        );
        problems.push(`the mark sits at ${values.length} different ${what}: ${byValue.join('; ')}`);
      }
    }
  }

  for (const problem of problems) console.log(`       ! ${problem}`);
  results.push({
    name: `mockup chrome (${pages.length} pages)`,
    state: { devices: 0, settings: 0, cards: 0, options: 0, svgs: 0, headings: '', progress: '', focusTag: '', whiteSpace: '', overflow: 'none',
      shell: { backButtons: 0, h1Count: 0, navItems: 0, crumbLinks: 0 } },
    problems,
    pageErrors: []
  });
}

/* ============================ phase two: the click-through ============================ */

async function driveTheWizard(send, results) {
  const problems = [];

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  };

  const screenText = () => evaluate("document.querySelector('#screen').textContent.replace(/\\s+/g, ' ')");

  const waitFor = async (needle, label) => {
    let last = '';
    for (let i = 0; i < 40; i += 1) {
      last = await screenText();
      if (last.toLowerCase().includes(needle.toLowerCase())) return;
      await sleep(200);
    }
    const where = await evaluate('location.hash');
    throw new Error(`waiting for "${needle}" (${label}) timed out at ${where}; screen shows: ${last.slice(0, 240)}`);
  };

  /** Click the first element matching `selector` whose text contains `text`. */
  const click = async (selector, text) => {
    const outcome = await evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = ${text == null ? 'els[0]' : `els.find((e) => e.textContent.toLowerCase().includes(${JSON.stringify(
        String(text).toLowerCase()
      )}))`};
      if (!el) return 'missing';
      el.click();
      return 'clicked';
    })()`);
    if (outcome !== 'clicked') throw new Error(`could not click ${selector}${text ? ` containing "${text}"` : ''}`);
  };

  const step = async (label, needle, action) => {
    if (action) await action();
    await waitFor(needle, label);
    console.log(`ok   flow · ${label}`);
  };

  try {
    /* A clean browser: the profile persists between runs, and a leftover save would make the saved-games
     * assertion pass for the wrong reason. */
    await send('Page.navigate', { url: BASE });
    await sleep(600);
    await evaluate('localStorage.clear()');
    await send('Page.navigate', { url: BASE });
    await sleep(600);

    await step('home → answer questions', 'Ready to make a game?');
    await step('→ category', 'What type of game do you want to make?', () => click('.g-choice', 'Answer Questions'));

    /* v2 removes the hero, so a screen change returns to the top of the page and the app's sticky
     * header sits directly under the fixed site header. */
    const landing = await evaluate(`(() => {
      const head = document.getElementById('appHead');
      const header = document.getElementById('siteHeader');
      if (!head || !header) return null;
      return {
        top: Math.round(head.getBoundingClientRect().top),
        headerHeight: Math.round(header.getBoundingClientRect().height),
        scrollY: Math.round(window.scrollY)
      };
    })()`);
    if (landing && landing.scrollY !== 0) {
      problems.push(`a screen change left the page scrolled to ${landing.scrollY}px, not the top`);
    } else if (landing && (landing.top < landing.headerHeight || landing.top > landing.headerHeight + 64)) {
      problems.push(
        `a screen change left the app header at ${landing.top}px (site header is ${landing.headerHeight}px tall, scrollY ${landing.scrollY})`
      );
    } else if (landing) {
      console.log(`ok   flow · a screen change returns to the top, with the app header clear of the fixed site header`);
    }
    /* Back has to work, not just exist: the spec asks each step to return to the previous one. */
    await evaluate(`(() => {
      const back = [...document.querySelectorAll('#screen button, #screen a')]
        .find((el) => /^(\\u2190\\s*)?(back|previous|let's go back)/i.test((el.textContent || '').trim()));
      if (back) back.click();
    })()`);
    await sleep(500);
    const homeAgain = await evaluate("(document.getElementById('screen') || {}).textContent || ''");
    if (!/Ready to make a game\\?/.test(homeAgain)) {
      problems.push('the Back button on the first wizard step did not return to the previous screen');
    } else {
      console.log('ok   flow · the Back button on the category screen returns to the home screen');
    }
    await step('→ category again', 'What type of game do you want to make?', () => click('.g-choice', 'Answer Questions'));
    await step('→ game type', 'Which one exactly?', () => click('.g-choice', 'Combat'));
    await step('→ questions', 'Question 1 of', () => click('.g-choice', 'Elimination / Deathmatch'));

    /* Answer every question with its first option until the brand screen appears. */
    let answered = 0;
    for (let i = 0; i < 12; i += 1) {
      const text = await screenText();
      if (text.includes('brand template')) break;
      const outcome = await evaluate(`(() => {
        const el = document.querySelector('.g-option');
        if (!el) return 'none';
        el.click();
        return 'clicked';
      })()`);
      if (outcome !== 'clicked') throw new Error('ran out of answer options before the brand screen');
      answered += 1;
      await sleep(250);
    }
    if (answered !== 4) throw new Error(`expected four questions, clicked through ${answered}`);
    await step('answered all four questions', 'brand template');

    /* The chosen option is stated, and the plan reflects what was answered. */
    const chosenText = await screenText();
    if (!chosenText.includes('brand template')) problems.push('the brand screen did not appear after the questions');

    await step('→ usage rules', 'usage rules', () => click('.g-btn-primary'));
    await step('→ summary', 'Here is your game.', () => click('.g-btn-primary', "I'm okay with this"));

    /* The plan is derived from the answers, so it must name devices and settings, not just exist. */
    const planText = await screenText();
    if (!/\d+ devices?/.test(planText) || !planText.includes('settings to check')) {
      problems.push('the summary does not summarise the device plan');
    }

    /* Start Building is gated on a name, and the gate is a disabled control rather than a lecture. */
    const gated = await evaluate(`(() => {
      const start = [...document.querySelectorAll('.g-btn-primary')].pop();
      return start.disabled ? 'disabled' : 'enabled';
    })()`);
    if (gated !== 'disabled') problems.push('Start Building was clickable with no name');

    await evaluate(`(() => {
      const input = document.getElementById('gameName');
      input.value = 'Mosslight';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    await step('name it, save it, then start building', 'experience level', async () => {
      await click('.g-btn-secondary', 'Save');
      await sleep(400);
      await click('.g-btn-primary', 'Start Building');
    });

    await step('→ walkthrough', 'Create Your Project', () => click('.g-choice', 'Complete beginner'));

    /* Next through the remaining steps. */
    for (let i = 0; i < 6; i += 1) {
      const text = await screenText();
      if (text.includes('Finish & back to my games')) break;
      await click('.g-btn-primary', 'Next:');
      await sleep(350);
    }
    /* The finish button navigates home, so the thing to wait for is the home screen it lands on. */
    await step('finished the walkthrough', 'Your games', () => click('.g-btn-primary', 'Finish'));

    /* The game is on the home screen, and it survives a reload. */
    await step('the saved game is listed', 'Mosslight');
    const savedMeta = await screenText();
    if (!savedMeta.includes('Combat')) problems.push('the saved game does not name its category');
    if (!savedMeta.includes('saved ')) problems.push('the saved game shows no saved date');

    await send('Page.reload');
    await sleep(900);
    await waitFor('Mosslight', 'the saved game after a reload');
    console.log('ok   flow · the saved game survives a reload');

    const persisted = await evaluate(
      "Object.keys(localStorage).filter((k) => k.startsWith('forge.guide')).join(',')"
    );
    if (!persisted.includes('forge.guide.savedGames')) problems.push(`saved games are not in storage (${persisted})`);

    /* Dev mode is a real control, not just a query parameter. */
    await send('Page.navigate', { url: `${BASE}#/category` });
    await sleep(700);
    const beforeToggle = await screenText();
    await evaluate("document.getElementById('devModeButton').click()");
    await sleep(400);
    const afterToggle = await screenText();
    const pressed = await evaluate("document.getElementById('devModeButton').getAttribute('aria-pressed')");
    if (pressed !== 'true') problems.push(`the Dev mode button does not report itself as pressed (aria-pressed=${pressed})`);
    if (beforeToggle === afterToggle) {
      problems.push('the dev-mode toggle changed nothing on screen');
    } else if (!afterToggle.includes('Dev mode is on')) {
      problems.push('dev mode was toggled but the screen does not say so');
    } else {
      console.log('ok   flow · the dev-mode toggle changes what the screens say');
    }

    /* Deletion, with the confirmation accepted. */
    await send('Page.navigate', { url: `${BASE}#/home` });
    await sleep(700);
    await evaluate('window.confirm = () => true');
    await click('.g-btn-danger', 'Delete');
    await sleep(500);
    const afterDelete = await screenText();
    if (afterDelete.includes('Mosslight')) problems.push('deleting a saved game left it on screen');
    else console.log('ok   flow · deleting a saved game removes it');
  } catch (error) {
    problems.push(`the click-through stopped: ${error.message}`);
  }

  for (const problem of problems) console.log(`       ! ${problem}`);

  results.push({
    name: 'wizard click-through',
    state: { devices: 0, settings: 0, cards: 0, options: 0, svgs: 0, headings: '', progress: '', focusTag: '', whiteSpace: '', overflow: 'none',
      shell: { backButtons: 0, h1Count: 0, navItems: 0, crumbLinks: 0 } },
    problems,
    pageErrors: []
  });
}

await main();
