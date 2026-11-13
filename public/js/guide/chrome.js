/**
 * The page shell's behaviour: the search field, and the one measurement the layout depends on.
 *
 * These are page furniture, not session logic, so they live outside app.js and touch no session state.
 * Everything here is optional by design: if a piece of markup is missing the function returns quietly,
 * because a page that renders without its header still has to work.
 *
 * v2 removed two things that used to be here, and the reasons are worth keeping:
 *   - the priority+ navigation. The spec now asks for a single "Home" item and no overflow menu, so
 *     there is nothing to collapse and no measurement loop to keep in step with the item list.
 *   - the hero video. The spec removes the hero, so there is no video to start.
 */

/* ============================== search ============================== */

/**
 * The search field is real, focusable and keyboard-shortcut-wired - and says plainly that the search
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

/* ============================== measurements ============================== */

/**
 * Publish the header's real height as `--sh-header-h`.
 *
 * The spec fixes the header at 72px, and both the body's top offset and the app container's sticky
 * header are positioned from it. On a very narrow screen the header's single row cannot hold the logo,
 * the Home link, the search field and both actions, so it wraps; if the two disagree about the height,
 * the sticky bar covers content. Measured rather than assumed.
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
