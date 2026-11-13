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
import { writeFile, mkdir } from 'node:fs/promises';
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

/** Every screen, what it must contain once rendered, and the width to capture it at. */
const CHECKS = [
  { name: 'home', url: `${BASE}`, desktop: 1440, mobile: 420,
    must: ['Ready to make a game?', 'Answer Questions', 'Randomise', 'Chat with AI', 'researched game types'], mustNot: ['could not load its data'] },
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
  { name: 'soon', url: `${BASE}#/soon/randomise`, desktop: 1440,
    must: ['still being designed', 'What is missing'] },
  { name: 'unknown-route', url: `${BASE}#/nonsense`, desktop: 1200,
    must: ['Ready to make a game?'] }
];

/* ------------------------------- CDP plumbing ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
          /* The page shell: the hero, the header, the app container's sticky bar and the footer. The
           * architecture spec is a layout document, so these are the assertions that it was followed. */
          shell: (() => {
            const h1s = [...document.querySelectorAll('h1')];
            const head = document.getElementById('appHead');
            const app = document.getElementById('appContainer');
            const moreWrap = document.getElementById('navMoreWrap');
            const moreMenu = document.getElementById('navMoreMenu');
            const list = document.getElementById('navList');
            const panel = document.getElementById('searchPanel');
            const header = document.getElementById('siteHeader');
            const footer = document.querySelector('.sh-footer');
            const video = document.getElementById('heroVideo');
            const source = video ? video.querySelector('source') : null;
            return {
              h1Count: h1s.length,
              h1Text: h1s.map((el) => el.textContent.trim()).join('|'),
              crumbs: (document.getElementById('crumbs') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim(),
              navItems: list ? list.children.length : -1,
              navMoreHidden: moreWrap ? moreWrap.hidden : null,
              navMoreItems: moreMenu ? moreMenu.children.length : -1,
              stickyTop: head ? getComputedStyle(head).position + ' ' + getComputedStyle(head).top : '',
              inset: app ? getComputedStyle(app).paddingLeft : '',
              panelHidden: panel ? panel.hidden : null,
              devPressed: document.getElementById('devModeButton')
                ? document.getElementById('devModeButton').getAttribute('aria-pressed')
                : '',
              headerBg: header ? getComputedStyle(header).backgroundColor : '',
              footerBg: footer ? getComputedStyle(footer).backgroundColor : '',
              poster: video ? video.getAttribute('poster') : '',
              videoSrc: source ? source.getAttribute('src') : ''
            };
          })(),
          title: document.title,
          progress: (document.getElementById('progressLabel') || {}).textContent || '',
          barWidth: ((document.getElementById('progressBar') || {}).style || {}).width || '',
          bootError: !document.getElementById('bootError').hidden,
          scriptFailure: !document.getElementById('scriptFailure').hidden,
          focusTag: document.activeElement ? document.activeElement.tagName : '',
          focusText: document.activeElement ? (document.activeElement.textContent || '').trim().slice(0, 60) : '',
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
    /* The hero owns the page's only <h1>; a screen's own title is an <h2> and is where focus lands. */
    if (state.shell.h1Count !== 1) {
      problems.push(`the page should have exactly one <h1>, found ${state.shell.h1Count}: "${state.shell.h1Text}"`);
    } else if (!/^forge$/i.test(state.shell.h1Text)) {
      problems.push(`the page's <h1> should be the hero title, found "${state.shell.h1Text}"`);
    }
    if (state.focusTag !== 'H2' && state.rendered) problems.push(`focus landed on ${state.focusTag}, not the screen heading`);
    if (!state.shell.crumbs) problems.push('the app container header shows no breadcrumb trail');
    if (!state.shell.stickyTop.startsWith('sticky')) problems.push(`the app container header is not sticky (${state.shell.stickyTop})`);
    if (state.shell.panelHidden !== true) problems.push('the search panel is showing before anyone has searched');
    if (state.shell.headerBg === 'rgba(0, 0, 0, 0)') problems.push('the site header has no background');
    if (state.shell.footerBg === 'rgba(0, 0, 0, 0)') problems.push('the footer has no background');
    /* The navigation must never lose a link: every item is either in the bar or behind More. */
    const navTotal = state.shell.navItems + state.shell.navMoreItems;
    if (navTotal !== 4) {
      problems.push(`the navigation has ${state.shell.navItems} items in the bar and ${state.shell.navMoreItems} behind More, not 4`);
    } else if (state.shell.navMoreItems > 0 && state.shell.navMoreHidden) {
      problems.push('navigation items were collapsed with no More button to reach them');
    }
    /* And at this width — 1440px, where these checks run — there is room for all of them. */
    if (state.shell.navMoreItems > 0) {
      problems.push(`the navigation collapsed ${state.shell.navMoreItems} item(s) into More at desktop width`);
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
      /* The priority+ navigation is the one piece of the spec that only shows up at a narrow width.
       * The invariant is not "it collapses" — a phone in two rows has room for all four — it is that
       * the bar is never squeezed to nothing and no destination is lost. */
      const nav = await send('Runtime.evaluate', {
        expression: `(() => {
          const nav = document.getElementById('siteNav');
          const more = document.getElementById('navMoreWrap');
          const menu = document.getElementById('navMoreMenu');
          const list = document.getElementById('navList');
          return {
            width: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
            inBar: list ? list.children.length : -1,
            behind: menu ? menu.children.length : -1,
            moreVisible: more ? !more.hidden : null,
            listOverflows: list ? list.scrollWidth > list.clientWidth + 1 : false,
            barOverflows: nav ? nav.scrollWidth > nav.clientWidth + 1 : false
          };
        })()`,
        returnByValue: true
      });
      const navState = nav.result.value || {};
      if (navState.width < 120) {
        problems.push(`the navigation was squeezed to ${navState.width}px at ${check.mobile}px wide`);
      } else if (navState.barOverflows || navState.listOverflows) {
        problems.push(`the navigation overflows its row at ${check.mobile}px wide`);
      } else if (navState.behind > 0 && !navState.moreVisible) {
        problems.push(`items were collapsed with no More button at ${check.mobile}px wide`);
      } else if (navState.inBar + navState.behind !== 4) {
        problems.push(`only ${navState.inBar + navState.behind} of 4 navigation links survive at ${check.mobile}px wide`);
      } else {
        console.log(
          `       · priority+ nav at ${check.mobile}px: ${navState.inBar} in the bar` +
            (navState.behind ? `, ${navState.behind} behind More` : ', nothing collapsed')
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

  close();
  chrome.kill();

  const failed = results.filter((r) => r.problems.length || r.pageErrors.length);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('Failures: ' + failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
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

    /* The hero is above the app, so where a screen change lands matters: on the hero again, and every
     * step of the flow is below the fold. */
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
    if (landing && (landing.top < 0 || landing.top > landing.headerHeight + 24)) {
      problems.push(
        `a screen change left the app header at ${landing.top}px (site header is ${landing.headerHeight}px tall, scrollY ${landing.scrollY})`
      );
    } else if (landing) {
      console.log(`ok   flow · a screen change lands on the app container (scrollY ${landing.scrollY}), not the hero`);
    }
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
    state: { devices: 0, settings: 0, cards: 0, options: 0, svgs: 0, headings: '', progress: '', focusTag: '', whiteSpace: '', overflow: 'none' },
    problems,
    pageErrors: []
  });
}

await main();
