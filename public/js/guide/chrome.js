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
 * Publish the header's real height as `--sh-header-h`.
 *
 * The spec fixes the header at 72px, and both the body's top offset and the app container's sticky
 * header are positioned from it. On a very narrow screen the header's single row may still wrap, and if
 * the two disagree about the height, the sticky bar covers content. Measured rather than assumed.
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
