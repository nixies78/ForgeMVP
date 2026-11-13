/**
 * The resolution engine — the part of the app that actually produces the plan.
 *
 * `rebuildDevices()` answers: given a game type and the answers the user gave, which UEFN devices
 * does this game need, what are their settings, and *why* is each of those things here?
 *
 * The merge order is v1's, preserved exactly, because it is what makes the content model scale —
 * a new game type composes existing devices instead of re-researching them:
 *
 *   1. universal devices                        → "Always needed"
 *   2. the category baseline, if inherited      → "<Category> essentials"
 *   3. the game type's own devices              → the game type's label
 *   4. the game type's base_set_settings        → "Base setup (<Game Type>)"
 *   5. each answer's effects, in the order asked:
 *        add_devices  → the question prompt
 *        set_settings → "<question prompt> → <option label>"
 *        notes        → the question prompt
 *
 * Devices dedupe into one entry that keeps every source that asked for it, and setting overrides
 * append rather than replace — so a user reads the general advice *and* why their path changes it.
 * That layering is called out in the brief as the thing that makes the output feel expert rather
 * than generic, so it is the one behaviour not to simplify away.
 */

/** Cache keyed by data version + game type + answers. v1 ran this twice per walkthrough. */
const cache = new Map();

export function clearResolveCache() {
  cache.clear();
}

/** A stable key for one (dataset, game type, answers) triple. */
export function resolveCacheKey(dataset, gameTypeKey, answers) {
  const answered = (answers || [])
    .map((a) => `${a.qId}=${a.optionValue}`)
    .sort()
    .join('|');
  return `${dataset.version}#${Object.keys(dataset.gameTypes).length}#${gameTypeKey}#${answered}`;
}

/**
 * @returns {{
 *   devices: Array<object>, groups: Array<object>, notes: Array<object>,
 *   orphans: Array<object>, counts: object, gameTypeKey: string
 * }}
 */
export function rebuildDevices(dataset, gameTypeKey, answers) {
  const key = resolveCacheKey(dataset, gameTypeKey, answers);
  const hit = cache.get(key);
  if (hit) return hit;

  const type = dataset.gameTypes[gameTypeKey] || null;
  const categoryLabel = (dataset.gameCategories.find((c) => c.id === (type && type.category)) || {}).label || 'Category';
  /** name → { name, role, purpose, sources[] } */
  const devices = new Map();
  /** name → Map(settingName → [{ source, value }]) */
  const overrides = new Map();
  /** [{ text, source }] */
  const notes = [];
  /** Overrides that name a device which is not in the resolved list. The data suite asserts there
   *  are none; if one ever appears it is surfaced rather than silently dropped, because an override
   *  nobody can see is worse than a visible oddity. */
  const orphans = [];

  const addDevice = (ref, source, purpose) => {
    const name = typeof ref === 'string' ? ref : ref && ref.ref;
    if (!name) return;
    const existing = devices.get(name);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (purpose && !existing.purposes.includes(purpose)) existing.purposes.push(purpose);
      return;
    }
    const library = dataset.deviceLibrary[name] || {};
    devices.set(name, {
      name,
      role: library.category || 'game_loop',
      purpose: library.purpose || '',
      /** Purpose text that a specific path supplied, which takes precedence in the UI. */
      purposes: purpose ? [purpose] : [],
      sources: [source]
    });
  };

  const addOverride = (deviceName, settingName, value, source) => {
    if (!deviceName || !settingName) return;
    if (!overrides.has(deviceName)) overrides.set(deviceName, new Map());
    const perSetting = overrides.get(deviceName);
    if (!perSetting.has(settingName)) perSetting.set(settingName, []);
    const list = perSetting.get(settingName);
    if (!list.some((row) => row.source === source && row.value === value)) list.push({ source, value });
  };

  // 1. always-on devices
  for (const name of dataset.universal) addDevice(name, 'Always needed');

  // 2. the category baseline, for game types that inherit it
  const baseline = dataset.baselines[type ? type.category : ''];
  if (type && type.inherits_baseline && baseline) {
    for (const ref of baseline.devices || []) addDevice(ref, `${categoryLabel} essentials`);
  }

  // 3. the game type's own devices
  if (type) {
    for (const ref of type.devices || []) addDevice(ref, type.label);

    // 4. its base setup
    for (const row of type.base_set_settings || []) {
      addOverride(row.device, row.setting, row.value, `Base setup (${type.label})`);
    }
  }

  // 5. everything the answers asked for, in the order they were asked
  for (const answer of answers || []) {
    const option = findOption(type, answer.qId, answer.optionValue);
    if (!option || !option.effects) continue;
    const effects = option.effects;

    for (const ref of effects.add_devices || []) addDevice(ref, answer.qPrompt, ref && ref.purpose);

    for (const text of effects.notes || []) notes.push({ text, source: answer.qPrompt });

    for (const row of effects.set_settings || []) {
      addOverride(row.device, row.setting, row.value, `${answer.qPrompt} → ${answer.optionLabel}`);
    }
  }

  // Device-specific notes that aren't tied to one setting, from the game type itself.
  if (type) {
    for (const text of type.extra_notes || []) notes.push({ text, source: `${type.label} guidance` });
  }

  /* ---- render-time merge: general guidance first, then every path-specific override ---- */

  const resolved = [...devices.values()].map((device) => {
    const library = dataset.deviceLibrary[device.name] || { settings: [] };
    const perSetting = overrides.get(device.name) || new Map();
    const settings = (library.settings || []).map((setting) => {
      const rows = [{ source: 'General guidance', text: setting.default }];
      for (const override of perSetting.get(setting.name) || []) {
        rows.push({ source: override.source, text: override.value, isOverride: true });
      }
      return { name: setting.name, rows };
    });

    /* An override naming a setting the library does not list would otherwise never be shown. */
    for (const [settingName, list] of perSetting) {
      if (settings.some((s) => s.name === settingName)) continue;
      settings.push({
        name: settingName,
        rows: list.map((o) => ({ source: o.source, text: o.value, isOverride: true })),
        notInLibrary: true
      });
    }

    return {
      ...device,
      purpose: device.purposes[0] || device.purpose,
      purposeCandidates: device.purposes,
      settings
    };
  });

  for (const [deviceName, perSetting] of overrides) {
    if (devices.has(deviceName)) continue;
    for (const [settingName, list] of perSetting) {
      for (const row of list) {
        orphans.push({ device: deviceName, setting: settingName, value: row.value, source: row.source });
      }
    }
  }

  // Group by device role, in the order the data declares the roles.
  const groups = [];
  for (const role of dataset.roles) {
    const inRole = resolved.filter((d) => d.role === role.id);
    if (!inRole.length) continue;
    groups.push({
      role: role.id,
      label: role.label,
      polishOnly: role.polishOnly,
      devices: inRole.sort((a, b) => a.name.localeCompare(b.name))
    });
  }
  const ungrouped = resolved.filter((d) => !dataset.roles.some((r) => r.id === d.role));
  if (ungrouped.length) groups.push({ role: 'other', label: 'Other devices', polishOnly: false, devices: ungrouped });

  const result = {
    gameTypeKey,
    devices: resolved,
    groups,
    coreGroups: groups.filter((g) => !g.polishOnly),
    polishGroups: groups.filter((g) => g.polishOnly),
    notes,
    orphans,
    counts: {
      devices: resolved.length,
      core: resolved.filter((d) => !isPolishGroup(dataset, d.role)).length,
      polish: resolved.filter((d) => isPolishGroup(dataset, d.role)).length,
      settings: resolved.reduce((n, d) => n + d.settings.length, 0),
      chosen: resolved.reduce((n, d) => n + d.settings.filter((s) => s.rows.some((r) => r.isOverride)).length, 0),
      notes: notes.length
    }
  };

  cache.set(key, result);
  return result;
}

function isPolishGroup(dataset, roleId) {
  const role = dataset.roles.find((r) => r.id === roleId);
  return Boolean(role && role.polishOnly);
}

/** The chosen option object for one answer, looked up in the game type's own question list. */
export function findOption(type, qId, optionValue) {
  if (!type || !Array.isArray(type.questions)) return null;
  const question = type.questions.find((q) => q.id === qId);
  if (!question) return null;
  return (question.options || []).find((o) => o.value === optionValue) || null;
}

/**
 * The three atmosphere devices every island gets on the polish step, from the data file's
 * `universal_polish_devices`. They are kept out of the core-loop list on purpose.
 */
export function universalPolishDevices(dataset) {
  return dataset.universalPolish.map((name) => {
    const library = dataset.deviceLibrary[name] || { settings: [] };
    return {
      name,
      role: library.category || 'environment_atmosphere',
      purpose: library.purpose || '',
      sources: ['Always needed'],
      purposeCandidates: [],
      settings: (library.settings || []).map((s) => ({
        name: s.name,
        rows: [{ source: 'General guidance', text: s.default }]
      }))
    };
  });
}
