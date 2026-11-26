/**
 * The page shell's behaviour, which is now one measurement.
 *
 * This is page furniture, not session logic, so it lives outside app.js and touches no session state.
 * Everything here is optional by design: if a piece of markup is missing the function returns quietly,
 * because a page that renders without its header still has to work.
 *
 * Three things used to be here, and the reasons they left are worth keeping:
 *   - the priority+ navigation. The spec asks for a single "Home" item and no overflow menu, so there is
 *     nothing to collapse and no measurement loop to keep in step with the item list.
 *   - the hero video. The spec removes the hero, so there is no video to start.
 *   - the search field, in 1.2.0. It was an honest dead end ("search is not built yet"), but the release
 *     removes search from the header altogether, and a shortcut that opens a field nobody can see is
 *     worse than no shortcut: the wiring, the Ctrl/⌘-K and "/" listeners and the status panel all went
 *     with the markup rather than being left behind to rot.
 */

/* ============================== measurements ============================== */

/**
 * Publish an element's real height as a CSS variable.
 *
 * The spec fixes the header at 72px, and both the body's top offset and the app container's sticky
 * header are positioned from it. On a very narrow screen the header's single row may still wrap, and if
 * the two disagree about the height, the sticky bar covers content. Measured rather than assumed.
 *
 * The crumb bar below it is measured the same way and for the same reason: its height is its padding
 * plus whichever of its children is tallest, and it wraps on a narrow screen, so a number written into
 * the stylesheet is a number that will be wrong somewhere. Anything that has to stick *below* both bars
 * - the rules gate's section rail - is positioned from the pair of them.
 *
 * Only a positive height is published: an element that is `display: none`, as the whole shell is in
 * print, must not overwrite the last real measurement with a zero.
 */
export function measureHeight(el, variable) {
  if (!el) return null;

  const apply = () => {
    const height = Math.round(el.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty(variable, `${height}px`);
  };

  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(el);
  else window.addEventListener('resize', apply);
  apply();

  return { apply };
}

/** The site header's height, as `--sh-header-h`. Kept as its own name because the shell reads it. */
export function measureHeader(header) {
  return measureHeight(header, '--sh-header-h');
}
