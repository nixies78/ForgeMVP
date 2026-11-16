/**
 * Design-library scraper.
 *
 * Loads each of the three Epic front-end sites in a real headless Chrome, lets the page
 * hydrate, then reads the *computed* styles and declarations off the live DOM: the custom
 * properties each site publishes, a frequency-ranked colour and type census, the distinct
 * button/input/card treatments, and every logo, icon and font URL worth linking to.
 *
 * The output is raw evidence, not the document: support/library.html is curated by hand from
 * these dumps, because a library needs judgement about *why* a value is used, not just what it is.
 *
 * Run:  node tools/design-library-scrape.mjs [slug ...]
 * Out:  support/library-data/<slug>.json  (+ support/library-data/index.json)
 *
 * Chrome is driven over the DevTools Protocol the same way tests/browser-check.mjs does it.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT_DIR = path.join(ROOT, 'support', 'library-data');
const PROFILE = path.join(ROOT, '.scratch', 'chrome-profile-scrape');

const PORT = 9333;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SITES = [
  {
    slug: 'unreal-engine', url: 'https://www.unrealengine.com/', label: 'Unreal Engine',
    sameOrigin: ['/favicon.ico', '/cosmos/static/favicons/favicon.svg', '/cosmos/static/favicons/favicon-96x96.png', '/cosmos/static/favicons/apple-touch-icon.png', '/cosmos/static/favicons/site.webmanifest']
  },
  {
    slug: 'epic-games-store', url: 'https://store.epicgames.com/', label: 'Epic Games Store',
    sameOrigin: ['/favicon.ico', '/favicon.svg', '/favicon-32x32.png', '/egs-v2/assets/Inter-Light-CdXm_ABL.woff2', '/egs-v2/assets/InterTight-Bold-CPdZBAQJ.woff2']
  },
  {
    slug: 'fortnite-developer', url: 'https://www.fortnite.com/developer', label: 'Fortnite for Developers',
    sameOrigin: ['/favicon.ico', '/favicon.svg', '/remix/apple-touch-icon.png']
  }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) || null;
}

/* ------------------------------- CDP plumbing ------------------------------- */

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
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
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method && listeners.has(msg.method)) {
      for (const cb of listeners.get(msg.method)) cb(msg.params);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const on = (method, cb) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(cb);
  };

  return { send, on, close: () => ws.close() };
}

async function launchChrome() {
  const bin = findChrome();
  if (!bin) throw new Error('Chrome not found');
  await mkdir(PROFILE, { recursive: true });

  const child = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-features=Translate,BackForwardCache',
      '--disable-blink-features=AutomationControlled',
      '--hide-scrollbars',
      `--user-agent=${UA}`,
      '--window-size=1440,1000',
      'about:blank'
    ],
    { stdio: 'ignore', detached: false }
  );

  let version = null;
  for (let i = 0; i < 60 && !version; i += 1) {
    await sleep(250);
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    } catch {
      version = null;
    }
  }
  if (!version) throw new Error('Chrome did not expose a debugging port');
  return { child, version };
}

/* ------------------------------- extraction ------------------------------- */

/* One self-contained function, evaluated in the page. Kept as a string so it is obvious that
 * nothing here depends on Node. */
const EXTRACT = `(async () => {
  const out = { meta: {}, cssVariables: {}, fonts: [], typeStyles: [], colors: {}, radii: {}, shadows: {}, components: {}, assets: {}, layout: {}, nav: [] };

  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const cs = (el) => getComputedStyle(el);
  const label = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
    const id = el.id ? '#' + el.id : '';
    return tag + id + (cls ? '.' + cls : '');
  };
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);

  /* Everything below reads the *rendered* page, so three kinds of node have to go first or they
   * pollute the census: the consent overlay OneTrust injects (its own palette, its own type, and it
   * is on all three sites), anything that is not painted, and non-visual tags whose computed colour
   * is merely inherited. */
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BASE']);
  const COOKIE = '#onetrust-consent-sdk, .onetrust-pc-dark-filter, [id^=onetrust], [id^=ot-], [class*=ot-sdk], [class^=ot-]';
  const COOKIE_NAME = /onetrust|optanon/i;
  /* Walk ancestors *through* shadow boundaries: closest() stops at a shadow root, and OneTrust mounts
   * part of its overlay in one, which is how a 20px/20px "Privacy Preference Center" heading ended up
   * in the first census. */
  const inConsentUi = (el) => {
    let node = el;
    while (node) {
      if (node.matches && (node.matches(COOKIE) || COOKIE_NAME.test(node.id || '') ||
        COOKIE_NAME.test(typeof node.className === 'string' ? node.className : ''))) return true;
      node = node.parentElement || (node.getRootNode && node.getRootNode() !== document && node.getRootNode().host) || null;
    }
    return false;
  };
  const painted = (el) => {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (inConsentUi(el)) return false;
    const s = cs(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const visible = (el) => painted(el);

  /* All three sites put their global header inside a shadow root (unrealengine-navigation,
   * egs-navigation, fortnite-navigation), so a plain querySelectorAll would describe the page but
   * miss the single most reused component on it. Walk the composed tree instead. */
  const deepAll = (root) => {
    const out = [];
    const walk = (node) => {
      for (const el of node.querySelectorAll('*')) {
        out.push(el);
        if (el.shadowRoot) { out.push(...deepAll(el.shadowRoot)); }
      }
    };
    walk(root);
    return out;
  };
  const all = deepAll(document.body).filter(painted);
  const deepQuery = (selector) => deepAll(document.body).filter((el) => el.matches(selector));

  /* ---- meta ---- */
  out.meta = {
    url: location.href,
    title: document.title,
    description: (document.querySelector('meta[name=description]') || {}).content || '',
    themeColor: (document.querySelector('meta[name=theme-color]') || {}).content || '',
    ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || '',
    lang: document.documentElement.lang,
    generators: [...document.querySelectorAll('meta[name=generator]')].map((m) => m.content),
    stylesheetCount: document.styleSheets.length,
    nodeCount: all.length,
    bodyBg: cs(document.body).backgroundColor,
    bodyColor: cs(document.body).color,
    htmlBg: cs(document.documentElement).backgroundColor
  };

  /* ---- custom properties, straight off the stylesheets ---- */
  const vars = new Map();
  const readRules = (rules, href) => {
    for (const rule of rules) {
      try {
        if (rule.style) {
          for (const prop of rule.style) {
            if (prop.startsWith('--')) {
              const value = rule.style.getPropertyValue(prop).trim();
              const selector = rule.selectorText || '';
              const key = prop + '|' + selector;
              if (!vars.has(key)) vars.set(key, { name: prop, selector, value, href });
            }
          }
        }
        if (rule.cssRules) readRules(rule.cssRules, href);
      } catch { /* cross-origin or unsupported rule */ }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      readRules(sheet.cssRules, sheet.href || 'inline');
    } catch { /* cross-origin sheet: skip, no href leaked either */ }
  }
  out.cssVariables = [...vars.values()];

  /* ---- font families in use ---- */
  const fontMap = new Map();
  for (const el of all) {
    const style = cs(el);
    const key = style.fontFamily;
    if (!key) continue;
    if (!fontMap.has(key)) fontMap.set(key, { family: key, count: 0, samples: [], sizes: new Set(), weights: new Set() });
    const entry = fontMap.get(key);
    entry.count += 1;
    entry.sizes.add(style.fontSize);
    entry.weights.add(style.fontWeight);
    if (entry.samples.length < 4) {
      const t = text(el);
      if (t) entry.samples.push({ el: label(el), text: t });
    }
  }
  out.fonts = [...fontMap.values()]
    .map((f) => ({ family: f.family, count: f.count, samples: f.samples, sizes: [...f.sizes].slice(0, 8), weights: [...f.weights].slice(0, 8) }))
    .sort((a, b) => b.count - a.count);

  /* Fonts actually declared with @font-face, and the files behind them. */
  out.fontFaces = [];
  const readFaces = (rules) => {
    for (const rule of rules) {
      try {
        if (rule.constructor && rule.constructor.name === 'CSSFontFaceRule') {
          out.fontFaces.push({ family: rule.style.getPropertyValue('font-family'), weight: rule.style.getPropertyValue('font-weight'), style: rule.style.getPropertyValue('font-style'), src: rule.style.getPropertyValue('src').slice(0, 300) });
        }
        if (rule.cssRules) readFaces(rule.cssRules);
      } catch { /* skip */ }
    }
  };
  for (const sheet of document.styleSheets) { try { readFaces(sheet.cssRules); } catch { /* skip */ } }

  /* ---- type census: every distinct size/weight/line-height/case combination, with a sample ---- */
  const typeMap = new Map();
  const pushType = (el, role) => {
    const style = cs(el);
    const key = [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing, style.textTransform].join('|');
    if (!typeMap.has(key)) {
      typeMap.set(key, {
        role, el: label(el), sample: text(el),
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textTransform: style.textTransform,
        color: style.color, count: 0
      });
    }
    typeMap.get(key).count += 1;
  };
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => { if (painted(el)) pushType(el, el.tagName.toLowerCase()); });
  document.querySelectorAll('p').forEach((el) => { if (painted(el) && text(el).length > 40) pushType(el, 'body'); });
  document.querySelectorAll('a,button').forEach((el) => { if (painted(el) && text(el)) pushType(el, 'interactive'); });
  document.querySelectorAll('input,select,textarea').forEach((el) => { if (painted(el)) pushType(el, 'input'); });
  out.typeStyles = [...typeMap.values()].sort((a, b) => px(b.fontSize) - px(a.fontSize) || b.count - a.count).slice(0, 60);

  /* ---- colour census, split by what the colour is doing ---- */
  const census = (pick) => {
    const map = new Map();
    for (const el of all) {
      const value = pick(cs(el), el);
      if (!value) continue;
      const clean = value.replace(/\\s+/g, ' ').trim();
      if (!clean || clean === 'rgba(0, 0, 0, 0)' || clean === 'transparent' || clean === 'none') continue;
      const rect = el.getBoundingClientRect();
      const area = Math.round(rect.width * rect.height);
      if (!map.has(clean)) map.set(clean, { value: clean, count: 0, area: 0, samples: [] });
      const entry = map.get(clean);
      entry.count += 1;
      entry.area += area;
      if (entry.samples.length < 5) entry.samples.push({ el: label(el), text: text(el).slice(0, 40), area });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 60);
  };
  out.colors = {
    text: census((s) => s.color),
    background: census((s) => s.backgroundColor),
    border: census((s) => s.borderTopColor + ' / ' + s.borderTopWidth + ' ' + s.borderTopStyle),
    fill: census((s, el) => (el.tagName === 'svg' || el.tagName === 'path' || el.tagName === 'use' ? s.fill : '')),
    stroke: census((s, el) => (el.tagName === 'svg' || el.tagName === 'path' ? s.stroke : ''))
  };

  /* ---- shape and depth ---- */
  const radiusMap = new Map();
  const shadowMap = new Map();
  for (const el of all) {
    const style = cs(el);
    const r = style.borderRadius;
    if (r && r !== '0px') {
      if (!radiusMap.has(r)) radiusMap.set(r, { value: r, count: 0, samples: [] });
      const e = radiusMap.get(r); e.count += 1;
      if (e.samples.length < 4) e.samples.push(label(el));
    }
    const sh = style.boxShadow;
    if (sh && sh !== 'none') {
      if (!shadowMap.has(sh)) shadowMap.set(sh, { value: sh, count: 0, samples: [] });
      const e = shadowMap.get(sh); e.count += 1;
      if (e.samples.length < 4) e.samples.push(label(el));
    }
  }
  out.radii = [...radiusMap.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  out.shadows = [...shadowMap.values()].sort((a, b) => b.count - a.count).slice(0, 15);

  /* ---- components: group every button-ish and card-ish element by its computed signature ---- */
  const group = (nodes, kind) => {
    const map = new Map();
    for (const el of nodes) {
      const s = cs(el);
      const rect = el.getBoundingClientRect();
      const sig = [s.backgroundColor, s.color, s.borderRadius, s.borderTopWidth, s.borderTopColor, s.padding, s.fontSize, s.fontWeight, s.textTransform, s.boxShadow].join('|');
      if (!map.has(sig)) {
        map.set(sig, {
          kind, el: label(el), sample: text(el), href: el.getAttribute && el.getAttribute('href') ? el.getAttribute('href') : '',
          count: 0, width: Math.round(rect.width), height: Math.round(rect.height),
          background: s.backgroundColor, color: s.color, backgroundImage: s.backgroundImage === 'none' ? '' : s.backgroundImage.slice(0, 120),
          border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
          borderRadius: s.borderRadius, padding: s.padding, fontFamily: s.fontFamily,
          fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing, textTransform: s.textTransform, boxShadow: s.boxShadow,
          transition: s.transition === 'all 0s ease 0s' ? '' : s.transition.slice(0, 120),
          backdropFilter: s.backdropFilter
        });
      }
      map.get(sig).count += 1;
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 25);
  };

  const buttonish = [...document.querySelectorAll('a, button, [role=button], input[type=submit], input[type=button]')]
    .filter((el) => {
      if (!visible(el)) return false;
      const t = text(el);
      if (!t || t.length > 48) return false;
      const s = cs(el);
      const r = el.getBoundingClientRect();
      const styled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderTopWidth !== '0px' ||
        s.boxShadow !== 'none' || s.backgroundImage !== 'none';
      return styled && r.width >= 24 && r.width <= 640 && r.height >= 20 && r.height <= 96;
    });
  out.components.buttons = group(buttonish, 'button');

  /* Plain nav/footer/body links, so the library can say what an unstyled-ish link looks like. */
  out.components.links = group(
    [...document.querySelectorAll('a')].filter((el) => visible(el) && text(el) && cs(el).backgroundColor === 'rgba(0, 0, 0, 0)'),
    'link'
  );

  const inputs = [...document.querySelectorAll('input:not([type=hidden]), select, textarea, [role=search], [class*=search i]')]
    .filter((el) => visible(el) && el.getBoundingClientRect().width > 40);
  out.components.inputs = group(inputs, 'input');

  /* Cards: a block with a background or border, a real radius, and enough size to be a surface. */
  const cardish = all.filter((el) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 90 || r.width > 1200) return false;
    const surface = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderTopWidth !== '0px' || s.boxShadow !== 'none';
    return surface && (parseFloat(s.borderRadius) > 0 || s.boxShadow !== 'none');
  }).slice(0, 900);
  out.components.cards = group(cardish, 'card');

  /* Navigation: the header's own links, in order, with their computed treatment. The first painted
   * <header>/<nav> that is not the whole page is the one worth describing. */
  const header = [document.querySelector('header'), document.querySelector('nav'), document.querySelector('[class*=Header i]'), document.querySelector('[class*=Nav i]')]
    .filter(Boolean)
    .find((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 24 && r.height < 220 && r.width > 300;
    });
  if (header) {
    const hStyle = cs(header);
    out.layout.header = {
      el: label(header), height: Math.round(header.getBoundingClientRect().height),
      position: hStyle.position, top: hStyle.top, zIndex: hStyle.zIndex,
      background: hStyle.backgroundColor, backdropFilter: hStyle.backdropFilter,
      borderBottom: hStyle.borderBottomWidth + ' ' + hStyle.borderBottomStyle + ' ' + hStyle.borderBottomColor,
      padding: hStyle.padding, maxWidth: hStyle.maxWidth, justifyContent: hStyle.justifyContent
    };
  }
  const footer = document.querySelector('footer, [class*=footer i]');
  if (footer) {
    const fStyle = cs(footer);
    out.layout.footer = {
      el: label(footer), height: Math.round(footer.getBoundingClientRect().height),
      background: fStyle.backgroundColor, color: fStyle.color, padding: fStyle.padding,
      borderTop: fStyle.borderTopWidth + ' ' + fStyle.borderTopStyle + ' ' + fStyle.borderTopColor,
      links: [...footer.querySelectorAll('a')].slice(0, 40).map((a) => ({ text: text(a), href: a.href }))
    };
  }
  if (header) {
    out.nav = [...header.querySelectorAll('a, button')].slice(0, 30).map((el) => {
      const s = cs(el);
      return { text: text(el), href: el.href || '', color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, padding: s.padding, borderRadius: s.borderRadius, background: s.backgroundColor };
    });
  }
  out.layout.page = {
    maxWidth: cs(document.body).maxWidth,
    mainMaxWidth: (() => {
      const main = document.querySelector('main, [class*=container i], [class*=Container]');
      return main ? cs(main).maxWidth + ' / padding ' + cs(main).padding : '';
    })(),
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  };

  /* ---- assets: every logo, icon and image worth linking to ---- */
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const thirdParty = /cookielaw\\.org|onetrust/i;
  const images = [...document.querySelectorAll('img')].map((img) => ({
    src: abs(img.currentSrc || img.src), alt: img.alt, width: img.naturalWidth, height: img.naturalHeight,
    rendered: Math.round(img.getBoundingClientRect().width) + 'x' + Math.round(img.getBoundingClientRect().height),
    inHeader: !!(header && header.contains(img)), inFooter: !!(footer && footer.contains(img))
  })).filter((i) => i.src && !i.src.startsWith('data:') && !thirdParty.test(i.src));

  const icons = [...document.querySelectorAll('link[rel*=icon i], link[rel=apple-touch-icon], link[rel=manifest], link[rel=mask-icon]')]
    .map((l) => ({ rel: l.rel, href: abs(l.href), sizes: l.sizes ? l.sizes.value : '', type: l.type || '' }));

  const metaImages = ['og:image', 'twitter:image', 'msapplication-TileImage', 'og:logo']
    .map((key) => {
      const el = document.querySelector('meta[property="' + key + '"], meta[name="' + key + '"]');
      return el ? { key, value: abs(el.content) } : null;
    })
    .filter(Boolean);

  const svgUse = [...document.querySelectorAll('use')].map((u) => abs(u.getAttribute('href') || u.getAttribute('xlink:href') || '')).filter(Boolean);

  /* Inline SVG is how all three sites draw their marks, so the markup is what there is to show:
   * enough of it to identify the shape, plus where it sits. */
  const inlineSvg = [...document.querySelectorAll('svg')].map((svg) => {
    const r = svg.getBoundingClientRect();
    const parent = svg.closest('header, nav, footer') || null;
    const named = svg.querySelector('title, desc');
    const labelled = svg.getAttribute('aria-label') || (named ? named.textContent : '') ||
      (svg.closest('a,button') ? text(svg.closest('a,button')) : '');
    return {
      where: parent ? parent.tagName.toLowerCase() : 'body',
      w: Math.round(r.width), h: Math.round(r.height),
      viewBox: svg.getAttribute('viewBox') || '',
      label: (labelled || '').slice(0, 60),
      paths: svg.querySelectorAll('path, circle, rect, polygon, g').length,
      markup: svg.outerHTML.replace(/\\s+/g, ' ').slice(0, 420)
    };
  }).filter((s) => s.w >= 12 && s.h >= 8)
    .sort((a, b) => (b.where === 'header' ? 1 : 0) - (a.where === 'header' ? 1 : 0) || b.w * b.h - a.w * a.h)
    .slice(0, 24);

  /* CSS-drawn art: logos and icons are sometimes a background-image on a span. */
  const backgrounds = [...document.querySelectorAll('body *')]
    .filter((el) => visible(el) && cs(el).backgroundImage.includes('url('))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el: label(el), url: (cs(el).backgroundImage.match(/url\\((['"]?)([^'")]+)\\1\\)/) || [])[2] || '', w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((b) => b.url && /svg|png|jpg|webp/i.test(b.url) && !thirdParty.test(b.url))
    .slice(0, 30)
    .map((b) => ({ ...b, url: abs(b.url) }));

  /* SVG files referenced from CSS (mask images, sprite sheets). */
  const cssSvg = new Set();
  const scanBg = (rules) => {
    for (const rule of rules) {
      try {
        if (rule.style) {
          for (const prop of ['background-image', 'mask-image', '-webkit-mask-image', 'content']) {
            const v = rule.style.getPropertyValue(prop);
            if (v && v.includes('.svg')) {
              for (const m of v.matchAll(/url\\((['"]?)([^'")]+\\.svg)\\1\\)/g)) cssSvg.add(abs(m[2]));
            }
          }
        }
        if (rule.cssRules) scanBg(rule.cssRules);
      } catch { /* skip */ }
    }
  };
  for (const sheet of document.styleSheets) { try { scanBg(sheet.cssRules); } catch { /* skip */ } }

  out.assets = {
    images: images.slice(0, 60),
    logos: images.filter((i) => i.inHeader || (i.width >= 60 && i.height <= 80 && i.width / Math.max(i.height, 1) > 1.5)).slice(0, 25),
    icons,
    metaImages,
    inlineSvg,
    backgrounds,
    svgUse: [...new Set(svgUse)].slice(0, 40),
    cssSvg: [...cssSvg].slice(0, 40),
    inlineSvgCount: document.querySelectorAll('svg').length,
    stylesheets: [...document.styleSheets].map((s) => s.href).filter(Boolean).slice(0, 25),
    scripts: [...document.querySelectorAll('script[src]')].map((s) => abs(s.src)).slice(0, 25)
  };

  /* ---- the global header component, read through its shadow root ---- */
  const navHost = deepAll(document.body).find((el) => el.shadowRoot && /navigation|nav-/i.test(el.tagName)) ||
    [...document.querySelectorAll('*')].find((el) => el.shadowRoot);
  out.shadow = null;
  out.shadowCss = [];
  if (navHost && navHost.shadowRoot) {
    const root = navHost.shadowRoot;
    const hostStyle = cs(navHost);
    const hostRect = navHost.getBoundingClientRect();

    const sheets = [];
    for (const sheet of [...(root.adoptedStyleSheets || [])]) {
      try { sheets.push([...sheet.cssRules].map((r) => r.cssText).join('\\n')); } catch { /* skip */ }
    }
    root.querySelectorAll('style').forEach((s) => sheets.push(s.textContent || ''));
    for (const sheet of [...(document.adoptedStyleSheets || [])]) {
      try { sheets.push([...sheet.cssRules].map((r) => r.cssText).join('\\n')); } catch { /* skip */ }
    }

    const shadowStyles = (el) => {
      const s = cs(el);
      const r = el.getBoundingClientRect();
      return {
        el: label(el), box: Math.round(r.width) + 'x' + Math.round(r.height),
        bg: s.backgroundColor, color: s.color, font: s.fontFamily.split(',')[0], size: s.fontSize,
        weight: s.fontWeight, letterSpacing: s.letterSpacing, textTransform: s.textTransform,
        radius: s.borderRadius, padding: s.padding, border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
        text: text(el).slice(0, 40),
        img: el.tagName === 'IMG' ? abs(el.currentSrc || el.src) : '',
        svg: el.tagName.toLowerCase() === 'svg' ? el.outerHTML.replace(/\\s+/g, ' ').slice(0, 300) : '',
        href: el.getAttribute && el.getAttribute('href') ? abs(el.getAttribute('href')) : ''
      };
    };
    const shadowEls = [...root.querySelectorAll('*')].filter(painted);

    out.shadow = {
      host: navHost.tagName.toLowerCase(),
      hostStyle: {
        height: Math.round(hostRect.height), position: hostStyle.position, top: hostStyle.top,
        zIndex: hostStyle.zIndex, background: hostStyle.backgroundColor,
        backdropFilter: hostStyle.backdropFilter, borderBottom: hostStyle.borderBottomWidth + ' ' + hostStyle.borderBottomStyle + ' ' + hostStyle.borderBottomColor
      },
      elements: shadowEls.filter((e) => e.tagName !== 'STYLE').slice(0, 60).map(shadowStyles),
      images: shadowEls.filter((e) => e.tagName === 'IMG').map((e) => shadowStyles(e)),
      svgs: shadowEls.filter((e) => e.tagName.toLowerCase() === 'svg').slice(0, 12).map(shadowStyles),
      links: shadowEls.filter((e) => e.tagName === 'A' && text(e)).slice(0, 20).map(shadowStyles),
      inputs: shadowEls.filter((e) => e.tagName === 'INPUT' || e.tagName === 'BUTTON').slice(0, 12).map(shadowStyles),
      /* Custom properties the component declares for itself — how it is themed from outside. */
      customProperties: (() => {
        const found = [];
        for (const cssText of sheets) {
          for (const m of cssText.matchAll(/(--[\\w-]+)\\s*:\\s*([^;}]+)/g)) found.push({ name: m[1], value: m[2].trim() });
        }
        const seen = new Set();
        return found.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true))).slice(0, 240);
      })()
    };
    out.shadowCss = sheets.filter(Boolean).map((text, i) => ({ host: navHost.tagName.toLowerCase(), source: 'shadow-stylesheet-' + (i + 1), text: text.slice(0, 60000) }));
  }

  /* ---- brand marks: what actually sits in the top band of the page, and whether the site hides any
   * of it behind a shadow root (which would explain a nav that reads as unstyled sans-serif). */
  const inBand = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < 120 && r.bottom > 0 && r.width > 24 && r.height > 8;
  });
  out.brand = {
    customElements: [...new Set([...document.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()).filter((t) => t.includes('-')))].slice(0, 30),
    shadowHosts: [...document.querySelectorAll('*')].filter((e) => e.shadowRoot)
      .map((e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')).slice(0, 20),
    topBand: inBand
      .sort((a, b) => {
        const area = (el) => { const r = el.getBoundingClientRect(); const visual = el.tagName === 'IMG' || el.tagName.toLowerCase() === 'svg' ? 3 : 1; return r.width * r.height * visual; };
        return area(b) - area(a);
      })
      .slice(0, 12)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const link = el.closest('a');
        return {
          el: label(el), box: Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top),
          imgSrc: el.tagName === 'IMG' ? abs(el.currentSrc || el.src) : '',
          svgMarkup: el.tagName.toLowerCase() === 'svg' ? el.outerHTML.replace(/\\s+/g, ' ').slice(0, 300) : '',
          link: link ? link.href : '', linkLabel: link ? (link.getAttribute('aria-label') || '') : '',
          text: text(el).slice(0, 40), bg: cs(el).backgroundColor
        };
      })
  };

  return out;
})()`;

/* A second, much smaller pass: what the same styles measure at a phone width. Two of the three sites
 * scale their headings with the viewport (one of them fluidly — it reports fractional px), so a single
 * desktop sample would misrepresent the scale. */
const TYPE_PROBE = `(() => {
  const cs = (el) => getComputedStyle(el);
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  const out = [];
  for (const sel of ['h1', 'h2', 'h3', 'p', 'a', 'button']) {
    const el = [...document.querySelectorAll(sel)].find((n) => text(n) && n.getBoundingClientRect().width > 0);
    if (!el) continue;
    const s = cs(el);
    out.push({
      sel, sample: text(el), fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight,
      letterSpacing: s.letterSpacing, textTransform: s.textTransform, fontFamily: s.fontFamily.split(',')[0]
    });
  }
  return { width: window.innerWidth, height: window.innerHeight, types: out };
})()`;

/* ------------------------------- driver ------------------------------- */

async function scrape(send, site) {
  await send('Page.navigate', { url: site.url });

  /* Wait for the document, then let the client-side framework settle. */
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    const state = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (state.result.value === 'complete') break;
  }
  await sleep(3500);

  const result = await send('Runtime.evaluate', { expression: EXTRACT, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(`extraction failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ''}`);
  }
  const data = result.result.value;

  /* The same page at a phone width, for the fluid part of the type scale. */
  data.responsive = [];
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(width === 1440 ? 600 : 1600);
    const probe = await send('Runtime.evaluate', { expression: TYPE_PROBE, returnByValue: true });
    if (probe.result && probe.result.value) data.responsive.push(probe.result.value);
  }
  await send('Emulation.clearDeviceMetricsOverride');

  /* Favicons, manifests and unused font weights are not fetched during a headless page load, and the
   * CDNs answer a scripted request with 403. Ask from inside the page instead: same origin, no bot wall. */
  if (site.sameOrigin && site.sameOrigin.length) {
    const probe = await send('Runtime.evaluate', {
      expression: `(async () => {
        const out = [];
        for (const p of ${JSON.stringify(site.sameOrigin)}) {
          try {
            const r = await fetch(p, { method: 'GET' });
            out.push({ path: p, status: r.status, mime: r.headers.get('content-type') || '', bytes: Number(r.headers.get('content-length') || 0) });
          } catch (e) { out.push({ path: p, status: 0, mime: '', error: String(e) }); }
        }
        return out;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    data.sameOrigin = (probe.result && probe.result.value) || [];
  }

  return data;
}

async function main() {
  const wanted = process.argv.slice(2);
  const sites = wanted.length ? SITES.filter((s) => wanted.includes(s.slug)) : SITES;
  await mkdir(OUT_DIR, { recursive: true });

  const { child, version } = await launchChrome();
  console.log(`chrome ${version.Browser}`);

  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const { send, on, close } = await cdp(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');

  /* Every response the real browser gets. Several of these files (the site's own favicons and font
   * binaries) answer 403 to a scripted fetch but load normally in a browser, so this log — not curl —
   * is the honest record of whether a remote asset can be linked. */
  await send('Network.enable');
  let responses = [];
  on('Network.responseReceived', (p) => {
    responses.push({ url: p.response.url, status: p.response.status, mime: p.response.mimeType, type: p.type, cached: !!p.response.fromDiskCache });
  });

  const index = [];
  try {
    for (const site of sites) {
      process.stdout.write(`· ${site.url} … `);
      responses = [];
      try {
        const data = await scrape(send, site);
        data.site = { slug: site.slug, url: site.url, label: site.label };
        data.scrapedAt = new Date().toISOString();
        const seen = new Set();
        data.network = responses
          .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
          .sort((a, b) => a.type.localeCompare(b.type) || a.url.localeCompare(b.url));

        /* The navigation component's own CSS is the single most reusable artefact on these pages, so
         * keep it verbatim next to the dump rather than buried in JSON. */
        if (data.shadowCss && data.shadowCss.length) {
          const css = data.shadowCss
            .map((sheet) => `/* ${site.url} — ${sheet.host} ${sheet.source} */\n${sheet.text}`)
            .join('\n\n');
          await writeFile(path.join(OUT_DIR, `${site.slug}-navigation.css`), css, 'utf8');
        }

        await writeFile(path.join(OUT_DIR, `${site.slug}.json`), JSON.stringify(data, null, 1), 'utf8');
        index.push({
          slug: site.slug, label: site.label, url: site.url, scrapedAt: data.scrapedAt,
          title: data.meta.title, nodes: data.meta.nodeCount,
          fonts: data.fonts.slice(0, 6).map((f) => f.family.split(',')[0].replace(/["']/g, '')),
          topBackgrounds: data.colors.background.slice(0, 6).map((c) => c.value),
          topText: data.colors.text.slice(0, 6).map((c) => c.value),
          buttons: data.components.buttons.length, cards: data.components.cards.length,
          cssVariables: data.cssVariables.length, images: data.assets.images.length
        });
        console.log(`ok  nodes=${data.meta.nodeCount} fonts=${data.fonts.length} vars=${data.cssVariables.length} buttons=${data.components.buttons.length} cards=${data.components.cards.length} imgs=${data.assets.images.length}`);
      } catch (error) {
        console.log(`FAILED: ${error.message}`);
        index.push({ slug: site.slug, url: site.url, label: site.label, error: error.message });
      }
    }
  } finally {
    close();
    child.kill();
  }

  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1), 'utf8');
  console.log(`\nwrote ${index.length} dump(s) to support/library-data/`);
}

await main();
