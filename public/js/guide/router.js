/**
 * Routing.
 *
 * v1 had none: browser Back left the app, refresh lost every answer, and nothing could be linked or
 * shared (UEFN_GUIDE_V2_HANDOFF.md, Part 7 item 4). This adds one screen per URL, working history,
 * and refresh-safe deep links.
 *
 * The routes live in the hash rather than the path because this app is served by a plain static
 * file server with no rewrite-to-index fallback — `/#/summary` reloads correctly, `/summary` would
 * 404. That is a constraint of the host, not a preference.
 */

import { SCREENS } from './state.js';

export const ROUTE_PREFIX = '#/';

/** Build the hash for a route object. */
export function toHash(route) {
  switch (route.screen) {
    case 'question':
      return `${ROUTE_PREFIX}q${route.qId ? `/${encodeURIComponent(route.qId)}` : ''}`;
    case 'walkthrough':
      return `${ROUTE_PREFIX}walk/${Number(route.stepIndex) || 0}`;
    case 'placeholder':
      return `${ROUTE_PREFIX}soon/${encodeURIComponent(route.mode || 'guided')}`;
    case 'home':
      return `${ROUTE_PREFIX}home`;
    default:
      return `${ROUTE_PREFIX}${route.screen}`;
  }
}

/** Parse a location hash into a route, tolerating junk. Unknown shapes give the home route. */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [head, ...rest] = raw.split('/');
  const segment = decodeURIComponent(head || '');
  const value = rest.length ? decodeURIComponent(rest.join('/')) : '';

  if (!segment || segment === 'home') return { screen: 'home' };
  if (segment === 'q') return { screen: 'question', qId: value || null };
  if (segment === 'walk') return { screen: 'walkthrough', stepIndex: Math.max(0, Number(value) || 0) };
  if (segment === 'soon') return { screen: 'placeholder', mode: value || 'guided' };
  if (SCREENS.includes(segment)) return { screen: segment };
  return { screen: 'home', unknown: segment };
}

/**
 * Move the session to a route, refusing routes the session cannot support.
 *
 * A deep link into the middle of the flow with no game type chosen (a fresh tab, a shared link, a
 * cleared session) cannot be honoured, so it is reported rather than half-rendered.
 */
export function applyRoute(dataset, state, route) {
  const needsGameType = ['question', 'brand', 'restriction', 'summary', 'experience', 'walkthrough'];
  if (needsGameType.includes(route.screen) && !state.gameTypeKey) {
    return { ok: false, reason: 'no-game-type', screen: route.screen };
  }
  /* The game type screen is where a game type gets chosen, so it must never require one — requiring
   * it sent anyone who picked a category straight back to the home screen. It does need a category to
   * list, and refusing is better than rendering an empty list. */
  if (route.screen === 'gametype' && !state.categoryKey) {
    return { ok: false, reason: 'no-category', screen: route.screen };
  }
  if (route.screen === 'question' && route.qId) {
    const type = dataset.gameTypes[state.gameTypeKey];
    const exists = type && (type.questions || []).some((q) => q.id === route.qId);
    if (!exists) return { ok: false, reason: 'unknown-question', screen: route.screen };
  }

  state.screen = route.screen;
  if (route.screen === 'question') state.qId = route.qId || null;
  if (route.screen === 'walkthrough') state.stepIndex = Math.max(0, route.stepIndex || 0);
  if (route.screen === 'placeholder') state.mode = route.mode || 'guided';
  return { ok: true };
}

/**
 * Wire the hash to a callback.
 *
 * `render` is called with the parsed route after `applyRoute` has moved the session. Returning
 * `false` means the route was refused and the app should show the home screen instead.
 */
export function startRouter(dataset, state, handlers) {
  const { onRoute, onRefused } = handlers;

  function handle() {
    const route = parseHash(window.location.hash);
    const applied = applyRoute(dataset, state, route);
    if (!applied.ok) {
      if (onRefused) onRefused(applied);
      return;
    }
    onRoute(route);
  }

  window.addEventListener('hashchange', handle);
  return { handle, stop: () => window.removeEventListener('hashchange', handle) };
}
