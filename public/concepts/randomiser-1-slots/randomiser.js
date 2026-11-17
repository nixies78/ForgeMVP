/**
 * Randomiser logic - pure functions, no DOM.
 *
 * Shared by the fruit-machine page (index.html beside this file) and by later randomiser designs,
 * and tested in plain node by tests/randomiser.test.mjs.
 *
 * Data comes from /data/randomiser.json (flavours, brands_on_flavour_reel, game_types, hooks).
 *
 * Reel keys used everywhere (and in the URL hash):  f = flavour reel, t = game type reel, h = hook reel.
 */

export const REEL_KEYS = ['f', 't', 'h'];

/**
 * Slug rule (used for image file names and for the URL hash):
 *   lowercase the name, turn every run of non-alphanumeric characters into one "-",
 *   then trim "-" from both ends.
 *   "K-Pop Demon Hunters"            -> "k-pop-demon-hunters"
 *   "Gentle — you can't really lose" -> "gentle-you-can-t-really-lose"
 *   "Sci-fi future"                  -> "sci-fi-future"
 * Accented letters are folded to plain ASCII first ("Café" -> "cafe").
 */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Image folder per kind of entry: /concepts/_media/randomiser/<folder>/<slug>.webp */
export const IMAGE_FOLDERS = { flavour: 'flavours', brand: 'brands', type: 'game-types', hook: 'hooks' };
export const IMAGE_ROOT = '/concepts/_media/randomiser';

export function imagePath(entry) {
  return `${IMAGE_ROOT}/${IMAGE_FOLDERS[entry.kind]}/${entry.slug}.webp`;
}

/**
 * "A" or "An", chosen by sound rather than spelling.
 * Vowel letter -> "An", except words that start with a "you"/"w" sound (Unicorn, User, One, Euro).
 * Silent-h words (Hour, Honest, Heir) -> "An". Initialisms whose first letter is said with a vowel
 * sound (FPS, MMO, RPG, X-Ray...) -> "An".
 */
export function article(word) {
  const w = String(word ?? '').trim();
  if (!w) return 'A';
  if (/^(hour|honest|honou?r|heir)/i.test(w)) return 'An';
  if (/^(uni|use|usu|ura|uro|uti|uto|eu|ewe|one\b|once|ufo)/i.test(w)) return 'A';
  const first = w.split(/[\s-]/)[0];
  if (first.length >= 2 && first === first.toUpperCase() && /^[A-Z]+$/.test(first)) {
    return /^[AEFHILMNORSX]/.test(first) ? 'An' : 'A';
  }
  return /^[aeiou]/i.test(w) ? 'An' : 'A';
}

/** Ends a sentence with exactly one full stop (keeps an existing ! ? or …). */
export function endSentence(text) {
  const t = String(text ?? '').trim().replace(/[.\s]+$/, '');
  if (!t) return '';
  return /[!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Turns the raw JSON into three reels of entries.
 * Every entry: { kind, name, slug, image, ...original fields }.
 * Flavour reel = the flavours, then the brands (brands get phrase "set in the world of {brand}").
 */
export function buildReels(data) {
  const flavours = (data?.flavours ?? []).map(f => ({
    ...f, kind: 'flavour', name: f.name, slug: slugify(f.name), phrase: f.phrase
  }));
  const brands = (data?.brands_on_flavour_reel ?? []).map(b => {
    const name = typeof b === 'string' ? b : b.name;
    return { kind: 'brand', name, slug: slugify(name), phrase: `set in the world of ${name}` };
  });
  const types = (data?.game_types ?? []).map(t => ({ ...t, kind: 'type', slug: slugify(t.name) }));
  const hooks = (data?.hooks ?? []).map(h => ({ ...h, kind: 'hook', slug: slugify(h.name) }));
  const reels = { f: [...flavours, ...brands], t: types, h: hooks };
  for (const key of REEL_KEYS) for (const e of reels[key]) e.image = imagePath(e);
  return reels;
}

/** The phrase a flavour-reel entry contributes to the strapline. */
export function flavourPhrase(entry) {
  if (!entry) return '';
  if (entry.kind === 'brand') return `set in the world of ${entry.name}`;
  return String(entry.phrase ?? entry.name ?? '').trim();
}

/**
 * The one-line pitch:  "A/An {game type}, {flavour phrase}. {hook}."
 * e.g. "A Tycoon, full of vampires. Dry and deadpan."  Never produces "..".
 */
export function strapline(flavour, type, hook) {
  if (!flavour || !type || !hook) return '';
  const typeName = String(type.name).trim();
  const phrase = flavourPhrase(flavour).replace(/[.\s]+$/, '');
  return `${article(typeName)} ${typeName}, ${endSentence(phrase)} ${endSentence(hook.name)}`;
}

/** "{Game type} - {desc}." */
export function typeLine(type) {
  if (!type) return '';
  return type.desc ? `${type.name} - ${endSentence(type.desc)}` : type.name;
}

/** The "underneath" facts in order, empty ones skipped (Tycoon has no player count). */
export function underneathParts(type) {
  if (!type) return [];
  return ['verb', 'players', 'count', 'world', 'session']
    .map(k => String(type[k] ?? '').trim())
    .filter(Boolean);
}

/** "Underneath, that means: Hiding · A few against many · ..." */
export function underneathLine(type) {
  const parts = underneathParts(type);
  return parts.length ? `Underneath, that means: ${parts.join(' · ')}` : '';
}

/** "{Hook} - {desc}" */
export function hookLine(hook) {
  if (!hook) return '';
  return hook.desc ? `${hook.name} - ${endSentence(hook.desc)}` : hook.name;
}

/**
 * A random index in [0, length) that is not `current` (when there is more than one choice).
 * `current` may be null/undefined/-1 for "nothing shown yet". `rng` returns [0, 1).
 */
export function pickDifferent(length, current, rng = Math.random) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  const hasCurrent = Number.isInteger(current) && current >= 0 && current < length;
  if (!hasCurrent) return Math.min(length - 1, Math.floor(rng() * length));
  if (length === 1) return 0;
  // Pick from the other length-1 slots, then step over the current one.
  const r = Math.min(length - 2, Math.floor(rng() * (length - 1)));
  return r >= current ? r + 1 : r;
}

/**
 * State -> URL hash.  state = { f, t, h: index or null, locked: { f, t, h: bool } }
 * e.g. "#f=vampires&t=tycoon&h=dry-and-deadpan&lock=f,h".  Empty state -> "".
 */
export function encodeHash(state, reels) {
  const parts = [];
  for (const key of REEL_KEYS) {
    const entry = reels[key]?.[state?.[key]];
    if (entry) parts.push(`${key}=${encodeURIComponent(entry.slug)}`);
  }
  const locked = REEL_KEYS.filter(k => state?.locked?.[k] && reels[k]?.[state[k]]);
  if (locked.length) parts.push(`lock=${locked.join(',')}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/**
 * URL hash -> state. Unknown slugs, unknown keys and junk are ignored (that reel is just empty).
 * A lock is only honoured for a reel that has a value.
 */
export function decodeHash(hash, reels) {
  const state = { f: null, t: null, h: null, locked: { f: false, t: false, h: false } };
  let params;
  try {
    params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  } catch {
    return state;
  }
  for (const key of REEL_KEYS) {
    const raw = params.get(key);
    if (!raw) continue;
    const slug = slugify(raw);
    const index = (reels[key] ?? []).findIndex(e => e.slug === slug);
    if (index >= 0) state[key] = index;
  }
  const lock = (params.get('lock') ?? '').split(/[,\s]+/);
  for (const key of REEL_KEYS) state.locked[key] = lock.includes(key) && state[key] !== null;
  return state;
}
