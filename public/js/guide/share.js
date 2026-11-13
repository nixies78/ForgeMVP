/**
 * Shareable session links.
 *
 * The brief lists "no deep links; no shareable state" among the things v1 got wrong (Part 7 item 4).
 * This is the fix: a session can be encoded into the query string, so a plan can be linked to,
 * bookmarked, or sent to someone else, and a deep link into the middle of the flow has something to
 * resolve against.
 *
 * The encoding is deliberately dumb and readable rather than compact:
 *
 *   ?play=combat_elimination_deathmatch&a=team_mode:teams,loadout:fixed&brand=star_wars#/summary
 *
 * Only the game type, the answer *values* and the brand are encoded. Prompts and option labels are
 * looked up from the data file on arrival, because carrying them would let a link disagree with the
 * data it is rendered against.
 *
 * Pure functions, so both halves are unit-testable in node.
 */

const ANSWER_SEPARATOR = ',';
const PAIR_SEPARATOR = ':';

/**
 * Read a shared session out of a query string.
 *
 * Unknown game types, unknown questions and unknown option values are dropped rather than trusted: a
 * link is user input, and a stale one must not produce a half-built plan.
 */
export function parseShare(search, dataset) {
  const params = new URLSearchParams(search || '');
  const gameTypeKey = params.get('play');
  const brandId = params.get('brand');
  const dev = params.get('dev');

  const result = { gameTypeKey: null, brandKey: null, answers: [], devMode: null, ignored: [] };
  const type = gameTypeKey ? dataset.gameTypes[gameTypeKey] : null;
  if (!type) {
    if (gameTypeKey) result.ignored.push(`unknown game type "${gameTypeKey}"`);
    return result;
  }
  result.gameTypeKey = gameTypeKey;
  result.brandKey = brandId && dataset.brandsById.has(brandId) ? brandId : dataset.defaultBrandId;
  if (brandId && !dataset.brandsById.has(brandId)) result.ignored.push(`unknown brand "${brandId}"`);
  if (dev === '1') result.devMode = true;
  if (dev === '0') result.devMode = false;

  const raw = params.get('a');
  if (!raw) return result;

  for (const chunk of raw.split(ANSWER_SEPARATOR)) {
    const [qId, value] = chunk.split(PAIR_SEPARATOR);
    if (!qId || value === undefined) continue;
    const question = (type.questions || []).find((q) => q.id === qId);
    if (!question) {
      result.ignored.push(`"${qId}" is not a question this game type asks`);
      continue;
    }
    const option = (question.options || []).find((o) => o.value === value);
    if (!option) {
      result.ignored.push(`"${value}" is not an option for "${qId}"`);
      continue;
    }
    result.answers.push({
      qId,
      qPrompt: question.prompt,
      optionValue: option.value,
      optionLabel: option.label
    });
  }

  /* Keep them in the order the game type asks, so the plan reads the same however the link was built. */
  const order = (type.questions || []).map((q) => q.id);
  result.answers.sort((a, b) => order.indexOf(a.qId) - order.indexOf(b.qId));
  return result;
}

/** Build the query string for a session. Values are URL-encoded by URLSearchParams. */
export function buildShare({ gameTypeKey, answers, brandKey, devMode }) {
  if (!gameTypeKey) return '';
  const params = new URLSearchParams();
  params.set('play', gameTypeKey);
  const encoded = (answers || [])
    .map((a) => `${a.qId}${PAIR_SEPARATOR}${a.optionValue}`)
    .join(ANSWER_SEPARATOR);
  if (encoded) params.set('a', encoded);
  if (brandKey) params.set('brand', brandKey);
  if (devMode) params.set('dev', '1');
  return `?${params.toString()}`;
}

/** The full shareable URL for a session, including the route hash. */
export function shareUrl(location, session, hash = '#/summary') {
  const query = buildShare(session);
  return `${location.origin}${location.pathname}${query}${hash}`;
}
