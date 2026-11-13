/**
 * Persistence: saved games and the dev-mode toggle.
 *
 * Four things v1 got wrong that this module is written to avoid:
 *   1. writes could fail silently (no quota handling) — every write now reports `{ ok, reason }`;
 *   2. there was no cap, no rename and no confirmation on delete — there is now;
 *   3. unmigratable saves were dropped without telling anyone — they are reported and shown;
 *   4. the storage key was version-specific, so a new version orphaned the old saves — v2 reads
 *      v1's keys once and imports them.
 *
 * The storage itself is injected, so the whole module is testable in node with a plain Map-backed
 * adapter (see `memoryStorage`).
 */

export const SCHEMA = 3;
export const STORAGE_KEY = 'forge.guide.savedGames';
export const DEV_MODE_KEY = 'forge.guide.devMode';
/** v1's keys, read once so existing saves survive the upgrade. */
export const LEGACY_STORAGE_KEY = 'uefnGameCreatorGuide.savedGames';
export const LEGACY_DEV_MODE_KEY = 'uefnGameCreatorGuide.devMode';

/** Keep the list bounded: localStorage is per-origin and quota is shared with everything else. */
export const MAX_SAVED = 50;

/**
 * v1's schema-1 → schema-2 mapping, kept because it is also the record of how the old nine genres
 * were reorganised into the current taxonomy (UEFN_GUIDE_V2_HANDOFF.md, Part 6). Two of the nine
 * need an answer to decide between two destinations, which is why this takes the answers.
 */
export const LEGACY_GENRE_MAP = {
  elimination: () => 'combat_elimination_deathmatch',
  zone_wars: () => 'combat_zone_wars',
  box_fights: () => 'combat_box_fights',
  prop_hunt: () => 'party_prop_hunt',
  tycoon: () => 'sim_tycoon_tycoon',
  racing: () => 'sports_circuit_racing',
  rpg_adventure: () => 'adventure_action_rpg',
  parkour_deathrun: (answers) =>
    pick(answers, 'mode') === 'deathrun' ? 'platforming_deathrun_obby' : 'platforming_parkour',
  horror_escape: (answers) =>
    pick(answers, 'chaser') === 'no' && pick(answers, 'puzzles') === 'yes'
      ? 'puzzle_escape_room'
      : 'survival_horror_chase'
};

function pick(answers, qId) {
  const found = (answers || []).find((a) => a.qId === qId);
  return found ? found.optionValue : undefined;
}

/** A storage adapter good enough for tests, and a template for what a real one must provide. */
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

/** localStorage, but a version that cannot throw (private mode, disabled storage, quota). */
export function browserStorage() {
  try {
    const probe = '__forge_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createStore(storage, options = {}) {
  const now = options.now || (() => new Date());
  const newId = options.newId || (() => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`);
  /** Reported by `migrationReport()` so the UI can say what happened instead of dropping data. */
  const migration = { imported: 0, converted: 0, dropped: [], ran: false };

  function readJson(key, fallback) {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (!storage) return { ok: false, reason: 'unavailable' };
    try {
      storage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (error) {
      const quota =
        error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22);
      return { ok: false, reason: quota ? 'quota' : 'unavailable', error };
    }
  }

  /**
   * Bring one stored record up to the current schema.
   * Returns `{ record }` on success or `{ dropped, reason }` so the caller can report it — v1
   * discarded these silently, which is how a user's saved game disappeared without explanation.
   */
  function upgrade(entry) {
    if (!entry || typeof entry !== 'object') return { dropped: entry, reason: 'not a saved game record' };

    let record = { ...entry };

    // v1 schema 1: a flat genre key instead of a category + game type.
    if (!record.gameTypeKey && record.genreKey) {
      const map = LEGACY_GENRE_MAP[record.genreKey];
      if (!map) return { dropped: entry, reason: `unknown legacy genre "${record.genreKey}"` };
      record.gameTypeKey = map(record.answers);
      record.categoryKey = record.categoryKey || null;
      record.migratedFrom = `genre:${record.genreKey}`;
    }

    if (!record.gameTypeKey) return { dropped: entry, reason: 'no game type recorded' };
    if (!Array.isArray(record.answers)) record.answers = [];

    // Answers for questions the target type no longer asks are dropped, per v1's behaviour —
    // but counted, so the import summary can mention it.
    record.answers = record.answers
      .filter((a) => a && a.qId && a.optionValue !== undefined)
      .map((a) => ({
        qId: a.qId,
        qPrompt: a.qPrompt || a.qId,
        optionValue: a.optionValue,
        optionLabel: a.optionLabel || a.optionValue
      }));

    record.schema = SCHEMA;
    record.id = record.id || newId();
    record.name = (record.name || '').trim() || 'Untitled game';
    record.savedAt = record.savedAt || now().toISOString();
    delete record.genreKey;
    return { record };
  }

  function list() {
    const stored = readJson(STORAGE_KEY, []);
    const arr = Array.isArray(stored) ? stored : [];
    return arr
      .map((entry) => upgrade(entry))
      .flatMap((result) => (result.record ? [result.record] : []))
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }

  /** Import v1's saves the first time v2 runs. Reports what it could not take across. */
  function migrateLegacy() {
    if (migration.ran) return migration;
    migration.ran = true;

    const legacyDev = storage && storage.getItem(LEGACY_DEV_MODE_KEY);
    if (legacyDev !== null && legacyDev !== undefined && storage.getItem(DEV_MODE_KEY) === null) {
      writeJson(DEV_MODE_KEY, legacyDev === 'true' || legacyDev === true);
    }

    const legacy = readJson(LEGACY_STORAGE_KEY, null);
    if (!Array.isArray(legacy) || !legacy.length) return migration;

    const existing = Array.isArray(readJson(STORAGE_KEY, [])) ? readJson(STORAGE_KEY, []) : [];
    if (existing.length) return migration; // already imported, or the user has newer saves

    const imported = [];
    for (const entry of legacy) {
      const result = upgrade(entry);
      if (result.record) {
        imported.push(result.record);
        migration.imported += 1;
        if (result.record.migratedFrom) migration.converted += 1;
      } else {
        migration.dropped.push({ name: (entry && entry.name) || '(unnamed)', reason: result.reason });
      }
    }
    if (imported.length) writeJson(STORAGE_KEY, imported);
    return migration;
  }

  return {
    migrationReport: () => migration,

    /** Read v1's saves once, on first boot. Reports what came across and what could not. */
    migrateLegacy,

    list,

    get(id) {
      return list().find((g) => g.id === id) || null;
    },

    /**
     * Save a game. `ok:false` carries a reason the UI turns into a real message:
     * `quota` (storage full), `cap` (too many saved games), `unavailable` (storage blocked).
     */
    save({ id, name, categoryKey, gameTypeKey, brandKey, answers, devModeAtSave }) {
      const games = list();
      const trimmed = (name || '').trim();
      if (!trimmed) return { ok: false, reason: 'name' };

      let record = id ? games.find((g) => g.id === id) : null;
      if (!record) {
        if (games.length >= MAX_SAVED) return { ok: false, reason: 'cap', cap: MAX_SAVED };
        record = { id: newId(), savedAt: now().toISOString() };
        games.push(record);
      }

      Object.assign(record, {
        schema: SCHEMA,
        name: trimmed,
        categoryKey: categoryKey || record.categoryKey || null,
        gameTypeKey: gameTypeKey || record.gameTypeKey || null,
        brandKey: brandKey || record.brandKey || null,
        answers: (answers || []).map((a) => ({
          qId: a.qId,
          qPrompt: a.qPrompt,
          optionValue: a.optionValue,
          optionLabel: a.optionLabel
        })),
        savedAt: now().toISOString()
      });
      if (devModeAtSave !== undefined) record.devModeAtSave = Boolean(devModeAtSave);

      const written = writeJson(STORAGE_KEY, dedupe(games));
      if (!written.ok) return written;
      return { ok: true, record };
    },

    rename(id, name) {
      const trimmed = (name || '').trim();
      if (!trimmed) return { ok: false, reason: 'name' };
      const games = list();
      const record = games.find((g) => g.id === id);
      if (!record) return { ok: false, reason: 'missing' };
      record.name = trimmed;
      record.savedAt = now().toISOString();
      const written = writeJson(STORAGE_KEY, dedupe(games));
      return written.ok ? { ok: true, record } : written;
    },

    remove(id) {
      const games = list().filter((g) => g.id !== id);
      const written = writeJson(STORAGE_KEY, dedupe(games));
      return written.ok ? { ok: true, removed: id } : written;
    },

    getDevMode(fallback = false) {
      const value = readJson(DEV_MODE_KEY, null);
      if (value === null || value === undefined) return fallback;
      return value === true || value === 'true';
    },

    setDevMode(on) {
      return writeJson(DEV_MODE_KEY, Boolean(on));
    }
  };

  function dedupe(games) {
    return [...new Map(games.map((g) => [g.id, g])).values()].sort((a, b) =>
      String(b.savedAt).localeCompare(String(a.savedAt))
    );
  }
}
