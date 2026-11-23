/**
 * reel-machine.js - the randomiser's behaviour, in one file, for every randomiser design.
 *
 * Randomiser 1 and 2 each carry their own copy of this logic inside their pages. The designs that
 * came after them share this one instead, so that five different-looking pages are provably the same
 * machine: same data (/data/randomiser.json), same rules (never land on the entry you are already
 * showing), same locks, same URL hash, same reduced-motion path, same end-of-spin frame.
 *
 * What lives here is behaviour only. Every colour, size, layout and word is the page's:
 *
 *   - the page marks up one container per reel and, inside it, the mounts it wants filled;
 *   - the page supplies `renderEntry()` - the look of one entry in the drum;
 *   - the page supplies `onState()` and `onResult()` and writes its own copy from them.
 *
 * ---------------------------------------------------------------------------------------------
 * PAGE CONTRACT
 * ---------------------------------------------------------------------------------------------
 *   <div id="reels">                        <- options.root
 *     <section data-reel="f">               <- one per key: f, t, h (missing ones are created)
 *       <p data-mount="label">Flavour</p>   <- optional, the page's own caption
 *       <div data-mount="window"></div>     <- the drum goes here (created if absent, at the end)
 *       <button data-lock>...</button>      <- optional; the module makes one if the page has none
 *       <span data-lock-text></span>        <- optional; gets "Lock"/"Unlock" written into it
 *     </section>
 *   </div>
 *
 * The module adds `.rm-window` + `.rm-strip` (+ `.rm-lock`) and toggles these on the reel container
 * and its lock, so a page can style every state without scripting it:
 *
 *   [data-reel]             .is-spinning        while that reel is moving
 *   .rm-strip               .is-moving          while it is fast enough to blur
 *   [data-lock]             .is-locked          when that reel is holding
 *
 * It sets aria-pressed / aria-label / disabled on the lock and the buttons; a page never has to.
 *
 * ---------------------------------------------------------------------------------------------
 * TWO GEOMETRIES
 * ---------------------------------------------------------------------------------------------
 * `geometry: 'strip'` (the default) is the drum every page so far uses: entries stacked vertically in
 * the window and the strip translated, so the last frame lands on the pixel the resting reel uses.
 *
 * `geometry: 'wheel'` is the same machine served on an arc - the reels as sections of a wheel of
 * fortune. The module builds a wheel of `wheelSectors` entries with the chosen one in the MIDDLE
 * sector, sets `--rm-angle` on each entry (`(index - middle) * wheelDegrees`, measured from the
 * pointer), and spins by ROTATING the strip to zero. It does not glide to a stop: the last
 * `wheelTicks` sectors are turned one at a time, each easing in and out, so the wheel ticks its way
 * round its final steps the way the one on television does. Nothing about the reels, locks, hash or
 * the choice itself changes: a page only has to place the hub and the sectors.
 *
 * The page owns that placement, because it is the look. The shape the module expects, with the hub at
 * the bottom-centre of the window:
 *
 *   [data-mount="window"] > .rm-window      { position: relative; overflow: hidden }
 *     .rm-strip                             { position: absolute; left: 50%; top: 100%; width: 0; height: 0 }
 *       .sector                             a child of the strip, one per entry:
 *                                           { position: absolute; left: 0; top: 0;
 *                                             width: var(--sector-w); height: var(--sector-h);
 *                                             margin-left: calc(var(--sector-w) / -2);
 *                                             margin-top: calc(var(--sector-h) / -2);
 *                                             transform-origin: 50% 50%;
 *                                             transform: rotate(var(--rm-angle)) translateY(calc(-1 * var(--hub-r))) }
 *
 * With the item's centre on the hub before the transform, `rotate(angle) translateY(-radius)` walks it
 * out along its own ray, and the label turns with the sector the way a real wheel's does.
 *
 * ---------------------------------------------------------------------------------------------
 * USE
 * ---------------------------------------------------------------------------------------------
 *   import { createMachine } from '../../js/reel-machine.js';
 *
 *   const machine = await createMachine({
 *     root: document.getElementById('reels'),
 *     spinButtons: [spinBtn],                      // disabled while spinning / all locked
 *     unlockButton: unlockBtn,                     // disabled while spinning
 *     status: statusEl,                            // "Couldn't load the reels (...)" goes here
 *     renderEntry,                                 // (entry, key, index) => Element
 *     onState,                                     // ({ spinning, allLocked, locked, values })
 *     onResult                                     // ({ flavour, type, hook, pitch, lead, hookPart, parts })
 *   });
 *
 *   spinBtn.addEventListener('click', machine.spin);
 *   machine.spin();            // one spin (a promise)
 *   machine.unlockAllAndSpin();
 *   machine.reels              // { f: [...], t: [...], h: [...], } once loaded
 *   machine.state              // { f, t, h: index|null, locked: { f, t, h } }
 *
 * `createMachine` resolves once the data is in and the drums are built. If the fetch fails it
 * reports through `status` and resolves to null, so a page can simply do nothing more.
 */

import {
  REEL_KEYS, buildReels, strapline, endSentence, underneathParts,
  pickDifferent, encodeHash, decodeHash
} from '../concepts/randomiser-1-slots/randomiser.js';
import { reelIconHTML, checkIcons, hasIcon } from '../concepts/randomiser-1-slots/reel-icon.js';

export { REEL_KEYS };

/** The reel keys in words, for the lock buttons' accessible names. */
const REEL_LABELS = { f: 'flavour', t: 'game type', h: 'hook' };

/** "K-Pop Demon Hunters" -> "KD", "Vampires" -> "VA". Used by the placeholder a page gets for a
 *  missing image. */
export function initials(name) {
  const words = String(name ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * The picture for one entry: its recolourable reel icon (reel-icon.js, painted with --icon-dark /
 * --icon-main / --icon-light), or - for an entry without one - a block carrying the entry's initials and
 * "Image coming". A page composes this into its own entry markup, so the reel pictures behave the same
 * everywhere. Whether an icon exists was checked once, when the reels were built (checkIcons below).
 *
 * The box carries `k-<kind>` (k-flavour, k-brand, k-type, k-hook) so a page can theme each reel's icons
 * on that class, and `has-icon` once it holds an icon rather than the placeholder.
 */
export function entryImage(entry, { className = 'rm-pic', placeholderClass = 'rm-ph' } = {}) {
  const box = document.createElement('div');
  box.className = className;
  if (!entry) return box;
  if (entry.kind) box.classList.add(`k-${entry.kind}`);
  if (hasIcon(entry.image)) {
    box.classList.add('has-icon');
    box.innerHTML = reelIconHTML(entry.image, entry.name);
  } else {
    box.append(entryPlaceholder(entry, placeholderClass));
  }
  return box;
}

function entryPlaceholder(entry, placeholderClass) {
  const ph = document.createElement('div');
  ph.className = placeholderClass;
  ph.setAttribute('aria-hidden', 'true');
  const short = document.createElement('span');
  short.className = 'rm-initials';
  short.textContent = initials(entry.name);
  const note = document.createElement('span');
  note.className = 'rm-coming';
  note.textContent = 'Image coming';
  ph.append(short, note);
  return ph;
}

/** The padlock R1 and R2 draw, for a page that wants that mark. A page is free to use its own. */
export const PADLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
  <path class="rm-shackle" d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/><rect x="4.5" y="11" width="15" height="10" rx="2.2" fill="currentColor" fill-opacity=".18"/></svg>`;

/**
 * Mount one randomiser into a page.
 * Resolves to the machine, or to null when the reels could not be loaded (reported through `status`).
 */
export async function createMachine(options) {
  const {
    root,
    dataUrl = '../../data/randomiser.json',
    spinMs = { f: 1300, t: 1750, h: 2200 },   // the reels stop left to right
    stripBase = 14,                            // entries scrolled through on the first reel
    /* 'strip' stacks the entries and translates them; 'wheel' builds a wheel and rotates it. See the
       header: in wheel mode each entry gets --rm-angle and the page places the hub and the sectors. */
    geometry = 'strip',
    wheelSectors = 8,                          // sectors a wheel draws, the chosen one in the middle
    wheelDegrees = 360 / wheelSectors,         // the angle between two sector centres
    wheelTurns = 3,                            // full turns before a wheel settles
    wheelTicks = 3,                            // of those turns, the last sectors it ticks round one at a time
    renderEntry = entry => entryImage(entry),
    onState = () => {},
    onResult = () => {},
    spinButtons = [],
    unlockButton = null,
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  } = options;

  const isWheel = geometry === 'wheel';
  const wheelMiddle = Math.floor(wheelSectors / 2);

  const say = (text, kind = '') => {
    if (options.status) {
      options.status.textContent = text;
      options.status.classList.toggle('is-error', kind === 'error');
    }
  };

  let data;
  try {
    const res = await fetch(dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    say(`Couldn't load the reels (${err.message}). Reload to try again.`, 'error');
    return null;
  }

  const reels = buildReels(data);
  await checkIcons(REEL_KEYS.flatMap(k => reels[k]));
  const state = { f: null, t: null, h: null, locked: { f: false, t: false, h: false } };
  const ui = {};                 // per reel: { reel, window, strip, lock }
  let spinning = false;
  let spinCount = 0;             // how many spins have finished, so a page can react to one ending
  say('');                       // clears the page's "Loading the reels…"

  /* ---------- the drums ---------- */

  function buildReel(key) {
    let reel = root.querySelector(`[data-reel="${key}"]`);
    if (!reel) {
      reel = document.createElement('div');
      reel.dataset.reel = key;
      root.append(reel);
    }
    let windowMount = reel.querySelector('[data-mount="window"]');
    if (!windowMount) {
      windowMount = document.createElement('div');
      windowMount.dataset.mount = 'window';
      reel.append(windowMount);
    }
    const win = document.createElement('div');
    win.className = 'rm-window';
    const strip = document.createElement('div');
    strip.className = 'rm-strip';
    win.append(strip);
    windowMount.append(win);

    let lock = reel.querySelector('[data-lock]');
    if (!lock) {
      lock = document.createElement('button');
      lock.type = 'button';
      lock.setAttribute('data-lock', '');
      lock.className = 'rm-lock';
      const mount = reel.querySelector('[data-mount="lock"]');
      (mount ?? reel).append(lock);
    }
    lock.setAttribute('aria-pressed', 'false');
    lock.addEventListener('click', () => toggleLock(key));

    ui[key] = { reel, window: win, strip, lock };
  }

  /* ---------- rendering ---------- */

  /** One entry in a reel, in the page's own clothes. `index` is where it sits in the run the reel is
   *  playing (a drum's item, or a wheel's sector); a page that does not care can ignore it. */
  const paintEntry = (key, entry, index = null) => {
    const node = renderEntry(entry, key, index);
    if (isWheel && index !== null) {
      node.style.setProperty('--rm-angle', `${(index - wheelMiddle) * wheelDegrees}deg`);
    }
    return node;
  };

  /** The entries a wheel draws: the chosen one in the middle sector, distinct others either side of it.
   *  `index` of null is the undealt wheel a page shows before the first spin, and every sector is empty. */
  function wheelEntries(list, index) {
    if (index === null || index === undefined) return new Array(wheelSectors).fill(null);
    const picks = new Array(wheelSectors).fill(null);
    picks[wheelMiddle] = list[index];
    const used = new Set([index]);
    for (let offset = 1; offset <= wheelMiddle; offset += 1) {
      for (const i of [wheelMiddle - offset, wheelMiddle + offset]) {
        if (i < 0 || i >= wheelSectors) continue;
        /* pickDifferent keeps a wheel from showing the same entry in two sectors, and from showing the
           value the reel was already sitting on. */
        let pick = pickDifferent(list.length, index);
        while (used.has(pick)) pick = pickDifferent(list.length, pick);
        used.add(pick);
        picks[i] = list[pick];
      }
    }
    return picks;
  }

  /** Come to rest: a drum shows one entry, a wheel shows its whole arc with the chosen entry at the
   *  pointer (angle zero is straight up, which is where the page puts the marker). */
  function showStill(key) {
    const { strip } = ui[key];
    strip.classList.remove('is-moving');
    strip.style.transition = 'none';
    if (isWheel) {
      strip.replaceChildren(...wheelEntries(reels[key], state[key]).map((entry, i) => paintEntry(key, entry, i)));
      strip.style.transform = 'rotate(0deg)';
      return;
    }
    strip.style.transform = 'translateY(0)';
    strip.replaceChildren(paintEntry(key, reels[key][state[key]] ?? null));
  }

  function paint() {
    const allLocked = REEL_KEYS.every(k => state.locked[k]);
    for (const key of REEL_KEYS) {
      const { reel, lock } = ui[key];
      const locked = state.locked[key];
      reel.classList.toggle('is-locked', locked);
      lock.classList.toggle('is-locked', locked);
      lock.setAttribute('aria-pressed', String(locked));
      lock.setAttribute('aria-label', `${locked ? 'Unlock' : 'Lock'} the ${REEL_LABELS[key]} reel`);
      lock.disabled = spinning || state[key] === null;
      lock.title = state[key] === null ? 'Spin first' : '';
      const text = lock.querySelector('[data-lock-text]');
      if (text) text.textContent = locked ? 'Unlock' : 'Lock';
    }
    for (const btn of spinButtons) btn.disabled = spinning || allLocked;
    if (unlockButton) unlockButton.disabled = spinning;

    onState({
      spinning,
      spinCount,
      allLocked,
      keys: REEL_KEYS,
      locked: { ...state.locked },
      values: Object.fromEntries(REEL_KEYS.map(k => [k, reels[k][state[k]] ?? null])),
      counts: Object.fromEntries(REEL_KEYS.map(k => [k, reels[k].length]))
    });

    const f = reels.f[state.f], t = reels.t[state.t], h = reels.h[state.h];
    if (f && t && h && !spinning) {
      const pitch = strapline(f, t, h);
      const hookPart = endSentence(h.name);
      /* The pitch is split at the hook rather than rebuilt here, so randomiser.js is still the one
         place that decides what a pitch says. A page puts the two parts where it likes - every
         current design puts the hook on a line of its own. */
      const lead = pitch.endsWith(hookPart) ? pitch.slice(0, -hookPart.length).trim() : pitch;
      onResult({
        flavour: f, type: t, hook: h,
        pitch, lead, hookPart,
        parts: underneathParts(t),
        hash: encodeHash(state, reels)
      });
    } else {
      onResult(null);
    }
  }

  /* ---------- locks, hash, spinning ---------- */

  function toggleLock(key) {
    if (spinning || state[key] === null) return;
    state.locked[key] = !state.locked[key];
    paint();
    saveHash();
  }

  function saveHash() {
    const hash = encodeHash(state, reels);
    history.replaceState(null, '', hash || location.pathname + location.search);
  }

  function loadHash() {
    const next = decodeHash(location.hash, reels);
    Object.assign(state, next);
    for (const key of REEL_KEYS) showStill(key);
    paint();
  }

  /** The keyframes a wheel turns on: a sweep that gives up its speed, then one segment per sector over the
   *  last few sectors, each easing in and out. That pause at the end of every segment is the tick - the
   *  wheel moves a sector, stops, moves a sector, stops - which is how a wheel of fortune lets you count
   *  the last two or three steps instead of gliding into the answer. The final tick swings a hair past its
   *  sector and settles back, the way a pointer does. */
  function wheelFrames(turns, degrees, ticks) {
    const spin = -360 * turns;
    const handOver = -ticks * degrees;         // where the sweep gives up and the ticks take over
    const sweep = 0.58;                        // of the whole duration: the fast part, then the counting
    const frames = [
      { transform: `rotate(${spin}deg)`, easing: 'cubic-bezier(.17, .6, .4, 1)' },
      { transform: `rotate(${handOver}deg)`, offset: sweep, easing: 'cubic-bezier(.3, .02, .4, 1)' }
    ];
    for (let tick = 1; tick <= ticks; tick += 1) {
      const angle = handOver + tick * degrees;
      const offset = sweep + ((1 - sweep) * tick) / ticks;
      if (tick === ticks) {
        // The last sector: past it by a degree and back, landing on exactly zero.
        frames.push({ transform: `rotate(${angle + 1}deg)`, offset: Math.max(sweep, offset - 0.03), easing: 'cubic-bezier(.4, 0, .6, 1)' });
        frames.push({ transform: 'rotate(0deg)', offset: 1 });
      } else {
        frames.push({ transform: `rotate(${angle}deg)`, offset, easing: 'cubic-bezier(.3, .02, .4, 1)' });
      }
    }
    return frames;
  }

  /** A wheel coming to rest: fresh sectors with the chosen entry in the middle one, turned from a few
   *  full turns back to zero. No measurement is needed - the geometry is known - and zero is the angle
   *  the resting wheel sits at, so the last frame of the animation is the still frame. */
  function animateWheel(key, to, duration) {
    return new Promise(resolve => {
      const { reel, strip } = ui[key];
      if (reducedMotion.matches) {
        showStill(key);
        return resolve();
      }
      const items = wheelEntries(reels[key], to).map((entry, i) => paintEntry(key, entry, i));
      strip.replaceChildren(...items);

      reel.classList.add('is-spinning');
      strip.classList.add('is-moving');
      strip.style.transition = 'none';
      strip.style.transform = `rotate(${-360 * wheelTurns}deg)`;
      const anim = strip.animate(wheelFrames(wheelTurns, wheelDegrees, wheelTicks), { duration, fill: 'forwards' });

      const unblur = setTimeout(() => strip.classList.remove('is-moving'), duration * 0.55);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(unblur);
        reel.classList.remove('is-spinning');
        strip.classList.remove('is-moving');
        anim.cancel();
        strip.style.transform = 'rotate(0deg)';
        resolve();
      };
      anim.finished.then(finish, finish);
      setTimeout(finish, duration + 300);   // a hidden tab may never finish the animation
    });
  }

  function animateReel(key, from, to, duration, extra) {
    if (isWheel) return animateWheel(key, to, duration);
    return new Promise(resolve => {
      const { reel, window: win, strip } = ui[key];
      if (reducedMotion.matches) {
        showStill(key);
        return resolve();
      }
      const list = reels[key];
      // Strip: the entry shown now, a run of random entries, then the target.
      const entries = [list[from] ?? null];
      const count = stripBase + extra;
      let prev = from;
      for (let i = 0; i < count; i++) {
        prev = pickDifferent(list.length, prev);
        entries.push(list[prev]);
      }
      if (entries[entries.length - 1] === list[to]) entries.pop();
      entries.push(list[to]);
      const items = entries.map((entry, i) => paintEntry(key, entry, i));
      strip.replaceChildren(...items);
      const last = items[items.length - 1];

      reel.classList.add('is-spinning');
      strip.classList.add('is-moving');
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      // Measure the real distance to the target entry (not count x height), so the last frame lands
      // on exactly the pixel the resting reel will use - whatever height the page gives an entry.
      const distance = last.getBoundingClientRect().top - strip.getBoundingClientRect().top;
      const settle = Math.min(10, win.clientHeight * 0.06);

      // One continuous motion: decelerate to a near-stop just past the target, then ease back onto
      // it. Velocity is (close to) zero where the two parts meet, so there is no visible kink.
      const anim = strip.animate([
        { transform: 'translateY(0)', easing: 'cubic-bezier(.2, .62, .28, 1)' },
        { transform: `translateY(${-(distance + settle)}px)`, offset: 0.9, easing: 'cubic-bezier(.45, 0, .55, 1)' },
        { transform: `translateY(${-distance}px)` }
      ], { duration, fill: 'forwards' });

      // Drop the blur while the reel is still slowing, not on the last frame.
      const unblur = setTimeout(() => strip.classList.remove('is-moving'), duration * 0.55);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(unblur);
        reel.classList.remove('is-spinning');
        strip.classList.remove('is-moving');
        // Keep the element that is already on screen (its image is loaded) and remove the rest in the
        // same frame as resetting the offset, so nothing moves or reloads when the reel comes to rest.
        for (const el of items) if (el !== last) el.remove();
        anim.cancel();
        strip.style.transform = 'translateY(0)';
        resolve();
      };
      anim.finished.then(finish, finish);
      setTimeout(finish, duration + 300);   // a hidden tab may never finish the animation
    });
  }

  const spin = async () => {
    if (spinning) return;
    const keys = REEL_KEYS.filter(k => !state.locked[k]);
    if (!keys.length) return;
    spinning = true;
    say('');
    const from = {};
    for (const key of keys) {
      from[key] = state[key];
      state[key] = pickDifferent(reels[key].length, state[key]);
    }
    paint();

    const quick = reducedMotion.matches;
    await Promise.all(keys.map((key, i) =>
      animateReel(key, from[key], state[key], quick ? 0 : spinMs[key], i * 4)));

    spinning = false;
    spinCount += 1;
    paint();
    saveHash();
  };

  const unlockAllAndSpin = () => {
    if (spinning) return;
    for (const key of REEL_KEYS) state.locked[key] = false;
    return spin();
  };

  /* ---------- build and first paint ---------- */

  for (const key of REEL_KEYS) buildReel(key);
  loadHash();
  addEventListener('hashchange', () => { if (!spinning) loadHash(); });

  return { spin, unlockAllAndSpin, reels, state, keys: REEL_KEYS, showStill, paint, reducedMotion };
}
