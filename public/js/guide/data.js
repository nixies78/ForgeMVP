/**
 * The data layer: one home for the domain data, plus the indexes and visibility rules the screens
 * ask questions of.
 *
 * v1 shipped the same ~152 KB of JSON twice — once inlined in the HTML and once as a separate file —
 * and kept them in sync by hand. Here there is exactly one copy, `public/data/uefn_device_logic.json`,
 * fetched once at startup. It is treated as verified reference content: device names, Details-panel
 * setting names and recommended values were researched against Epic's documentation and are carried
 * over verbatim (UEFN_GUIDE_V2_HANDOFF.md, "Everything in Parts 3–6 is verified content").
 *
 * Nothing in this module touches the DOM, so it is unit-testable in plain node.
 */

export const DATA_URL = 'data/uefn_device_logic.json';

/**
 * Device roles that behave differently from the rest.
 *
 * v1 checked for the id `environment_atmosphere` inline in two render functions to decide that those
 * devices belong in "Make It Look Good" rather than the core-loop step. The brief asks for that to be
 * data rather than a hardcoded id (Part 4.5), so it is a flag here, and adding a second such role
 * later is a one-line change instead of a hunt through the screens.
 */
export const ROLE_FLAGS = {
  environment_atmosphere: { polishOnly: true }
};

/** The role that polish devices belong to, and the flag that marks it. */
export function isPolishRole(roleId) {
  return Boolean(ROLE_FLAGS[roleId] && ROLE_FLAGS[roleId].polishOnly);
}

/**
 * Validate the raw JSON and build the indexes the app works with.
 *
 * Throws with a specific message rather than returning something half-built: a data file that is
 * missing a top-level key is a build error, not a runtime condition to paper over.
 */
export function parseData(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('the data file did not parse to an object');

  for (const key of [
    'meta',
    'universal_devices',
    'universal_polish_devices',
    'device_library',
    'category_baselines',
    'game_types',
    'brand_templates'
  ]) {
    if (!(key in raw)) throw new Error(`the data file has no "${key}" section`);
  }
  if (!Array.isArray(raw.brand_templates)) throw new Error('brand_templates must be an array');

  const gameTypeKeys = Object.keys(raw.game_types);
  const brandsById = new Map(raw.brand_templates.map((b) => [b.id, b]));

  const dataset = {
    raw,
    title: raw.meta.title || 'UEFN Game Guide',
    version: raw.meta.version || '1',
    description: raw.meta.description || '',
    howItWorks: Array.isArray(raw.meta.how_it_works) ? raw.meta.how_it_works : [],
    /** The eleven device-role groupings, in the order devices are grouped and listed in. */
    roles: raw.meta.categories.map((c) => ({ id: c.id, label: c.label, polishOnly: isPolishRole(c.id) })),
    /** The ten top-level game categories the first screen asks about. */
    gameCategories: raw.meta.game_categories,
    deviceLibrary: raw.device_library,
    baselines: raw.category_baselines,
    gameTypes: raw.game_types,
    gameTypeKeys,
    brands: raw.brand_templates,
    brandsById,
    brandImageSpec: raw.meta.brand_image_spec || null,
    brandRulesNote: raw.meta.brand_rules_research_note || '',
    defaultBrandId: raw.meta.default_brand_id || (raw.brand_templates[0] && raw.brand_templates[0].id),
    defaultDevMode: Boolean(raw.meta.dev_mode_default),
    universal: raw.universal_devices.map((d) => d.ref),
    universalPolish: raw.universal_polish_devices.map((d) => d.ref)
  };

  dataset.liveCount = gameTypeKeys.filter((k) => raw.game_types[k].status === 'live' && !raw.game_types[k].is_custom).length;
  dataset.draftCount = gameTypeKeys.filter((k) => raw.game_types[k].status === 'draft').length;
  dataset.customCount = gameTypeKeys.filter((k) => raw.game_types[k].is_custom).length;

  return dataset;
}

/** Fetch and parse the data file. Only ever called from the browser. */
export async function loadData(url = DATA_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`could not load ${url} (HTTP ${response.status})`);
  return parseData(await response.json());
}

/* ---------------------------------- lookups ---------------------------------- */

export function gameType(dataset, key) {
  return dataset.gameTypes[key] || null;
}

export function category(dataset, id) {
  return dataset.gameCategories.find((c) => c.id === id) || null;
}

export function gameTypesInCategory(dataset, categoryId, devMode) {
  const list = dataset.gameTypeKeys
    .map((key) => ({ key, ...dataset.gameTypes[key] }))
    .filter((t) => t.category === categoryId)
    .filter((t) => devMode || t.status === 'live');

  /* v1's ordering: researched types first, then drafts, and the "Just give me the basics"
   * fallback always last so it cannot be mistaken for a researched entry. */
  const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
  return list.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

/**
 * Per-category counts and an honest visibility verdict.
 *
 * v1 marked the ten "Just give me the basics" entries as `live`, which kept every category visible
 * with dev mode off — including the two with no researched types at all, which then looked as
 * complete as the other eight. The brief calls this out (Part 7, item 3). The categories stay
 * reachable here, because that was the product decision, but each one reports what it actually
 * contains so the badge never overstates it.
 */
export function categorySummaries(dataset, devMode) {
  return dataset.gameCategories.map((cat) => {
    const all = dataset.gameTypeKeys
      .map((key) => ({ key, ...dataset.gameTypes[key] }))
      .filter((t) => t.category === cat.id);
    const researched = all.filter((t) => t.status === 'live' && !t.is_custom).length;
    const drafts = all.filter((t) => t.status === 'draft').length;
    const custom = all.filter((t) => t.is_custom).length;
    return {
      ...cat,
      researched,
      drafts,
      custom,
      total: all.length,
      /** Shown when dev mode is off: nothing here is tailored, only the baseline. */
      baselineOnly: researched === 0,
      visible: devMode || researched + custom > 0
    };
  });
}

/**
 * Does this game type resolve from a category baseline only?
 *
 * True for the 74 drafts, which have no devices, no questions and no core loop of their own.
 */
export function isBaselineOnly(gameTypeEntry) {
  return Boolean(gameTypeEntry) && gameTypeEntry.status === 'draft';
}

/* ------------------------- core loop and layout tip, null-safely ------------------------- */

/**
 * 84 of the 97 game types carry `core_loop: null` and an empty `layout_tip`, so the fallback to the
 * category baseline is the common case rather than the edge case. Every consumer goes through these
 * two functions — v1 needed the same pair, and the brief is explicit that it must stay that way.
 */
export function effectiveCoreLoop(dataset, gameTypeKey) {
  const type = gameType(dataset, gameTypeKey);
  if (type && type.core_loop) return type.core_loop;
  const baseline = dataset.baselines[type ? type.category : gameTypeKey];
  return (baseline && baseline.core_loop) || null;
}

export function effectiveLayoutTip(dataset, gameTypeKey) {
  const type = gameType(dataset, gameTypeKey);
  if (type && type.layout_tip) return type.layout_tip;
  const baseline = dataset.baselines[type ? type.category : gameTypeKey];
  return (baseline && baseline.layout_tip) || '';
}

/* --------------------------------- brand helpers --------------------------------- */

export function brandsForGameType(dataset, gameTypeKey) {
  return dataset.brands.map((brand) => ({
    ...brand,
    suitsChosenType: Array.isArray(brand.suggested_game_types) && brand.suggested_game_types.includes(gameTypeKey)
  }));
}

/** The assets a brand should have, per the convention in the data file's own image spec. */
export function brandAssets(dataset, brand) {
  const spec = dataset.brandImageSpec;
  const ids = (spec && spec.brand_ids) || dataset.brands.map((b) => b.id);
  const size = (spec && spec.logo && spec.logo.displayed_at_px) || 44;
  return {
    logo: `images/brands/${brand.id}_logo.png`,
    hero: (brand.images && brand.images.hero) || `images/brands/${brand.id}_hero.jpg`,
    logoDisplayPx: size,
    /** Told to a contributor by the placeholder, so a missing file is self-explaining. */
    logoSpec: (spec && spec.logo && `${spec.logo.size_px} ${spec.logo.format}`) || '160x160 PNG, transparent',
    heroSpec: (spec && spec.hero && `${spec.hero.size_px} ${spec.hero.format}`) || '1200x450 JPG (8:3)',
    hasLogo: false,
    knownBrandIds: ids
  };
}
