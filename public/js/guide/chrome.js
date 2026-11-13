/**
 * The page shell's behaviour: the priority+ navigation, the search field, the hero video, and the two
 * measurements the layout depends on.
 *
 * These are page furniture, not session logic, so they live outside app.js and touch no session state.
 * Everything here is optional by design: if a piece of markup is missing the function returns quietly,
 * because a page that renders without its header still has to work.
 */

/* ============================== priority+ navigation ============================== */

/**
 * Collapse the tail of the navigation into a "More" menu as the space runs out.
 *
 * The spec asks for a resize observer rather than breakpoints, which is the right call here: the
 * available width depends on the logo, the search field and the two calls to action, not on the
 * viewport alone.
 *
 * The items are moved between the two lists rather than duplicated, so there is exactly one link per
 * destination in the document at any time and no keyboard trap in a hidden copy.
 */
export function wirePriorityNav({ list, moreWrap, moreButton, moreMenu }) {
  if (!list || !moreWrap || !moreButton || !moreMenu) return null;

  const home = list;
  let collapsed = [];
  let open = false;

  const setOpen = (next) => {
    open = next;
    moreMenu.hidden = !open;
    moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  moreButton.addEventListener('click', () => setOpen(!open));
  document.addEventListener('click', (event) => {
    if (open && !moreWrap.contains(event.target)) setOpen(false);
  });
  moreWrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      moreButton.focus();
    }
  });

  /** Items are restored to the main list, then moved out one at a time until it fits. */
  const relayout = () => {
    setOpen(false);
    for (const item of collapsed.splice(0)) home.append(item);

    const available = home.parentElement ? home.parentElement.clientWidth : 0;
    moreWrap.hidden = true;
    /* Anything still overflowing is a candidate; the More button itself needs room, so it is made
     * visible first and the loop re-checks against the width it takes. */
    while (list.scrollWidth > available + 1 && list.children.length > 1) {
      const last = list.lastElementChild;
      if (!last) break;
      collapsed.unshift(last);
      moreMenu.prepend(last);
    }
    moreWrap.hidden = collapsed.length === 0;
  };

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => relayout());
    observer.observe(list.parentElement || list);
  } else {
    window.addEventListener('resize', relayout);
  }
  /* Fonts change the intrinsic widths, and the first layout can happen before they load. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
  relayout();

  return { relayout, close: () => setOpen(false) };
}

/* ============================== search ============================== */

/**
 * The search field is real, focusable and keyboard-shortcut-wired — and says plainly that the search
 * itself is not built yet.
 *
 * The alternative was a field that silently does nothing, which is the one thing this app has been
 * careful not to do anywhere else (see the Randomise and Chat-with-AI panels). The placeholder names
 * the route that does work, so an honest dead end still helps.
 */
export function wireSearch({ input, panel, hint }) {
  if (!input || !panel) return null;

  const shortcut = navigator.platform && /Mac/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  if (hint) hint.textContent = shortcut;

  const message = () => {
    panel.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = 'Search is not built yet.';
    const rest = document.createElement('span');
    rest.textContent =
      ' It will look across all 97 game types, their devices and their settings. Until then, ' +
      '"New game" walks you to the same place in three steps.';
    panel.append(strong, rest);
  };

  const show = () => {
    message();
    panel.hidden = false;
  };
  const hide = () => {
    panel.hidden = true;
  };

  input.addEventListener('focus', show);
  input.addEventListener('input', show);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      hide();
      input.blur();
    }
    /* Nothing to submit, and a form post would reload the page. */
    if (event.key === 'Enter') event.preventDefault();
  });
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && event.target !== input) hide();
  });

  document.addEventListener('keydown', (event) => {
    const key = (event.key || '').toLowerCase();
    if (key === 'k' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      input.focus();
      show();
    }
    if (key === '/' && !event.ctrlKey && !event.metaKey && document.activeElement !== input) {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        event.preventDefault();
        input.focus();
      }
    }
  });

  return { show, hide };
}

/* ============================== hero video ============================== */

/**
 * Start the hero video, once, and only when it is welcome.
 *
 * `preload="none"` plus the poster frame means the page is complete and readable without the 50 MB
 * file: the still is the same art, so the hero never shows an empty band. Playback is skipped entirely
 * when the user has asked for less motion, and a rejected `play()` (autoplay policy, blocked media,
 * missing file) is ignored — the poster frame stays, which is the intended fallback.
 */
export function wireHeroVideo(video) {
  if (!video) return null;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return { started: false, reason: 'reduced-motion' };

  const start = () => {
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  };

  /* Idle, so the video never competes with the app's data fetch and first render. */
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2500 });
  } else {
    window.setTimeout(start, 1200);
  }

  return { started: true, reason: 'scheduled' };
}

/* ============================== measurements ============================== */

/**
 * Publish the header's real height as `--sh-header-h`.
 *
 * The spec fixes the header at 72px and the app container's sticky header sits directly below it. The
 * priority+ navigation can make the header taller on a narrow screen, and if the two disagree the
 * sticky bar covers content, so the value is measured instead of assumed.
 */
export function measureHeader(header) {
  if (!header) return null;

  const apply = () => {
    const height = Math.round(header.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty('--sh-header-h', `${height}px`);
  };

  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(header);
  else window.addEventListener('resize', apply);
  apply();

  return { apply };
}
