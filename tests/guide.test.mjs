/**
 * Tests for the UEFN Game Guide.
 *
 * These run in plain node with no browser: everything worth asserting about the flow lives in the
 * pure modules beside the screens (data, state, resolve, store, router, share), which is precisely
 * why they were written that way.
 *
 * Run:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  parseData,
  categorySummaries,
  gameTypesInCategory,
  effectiveCoreLoop,
  effectiveLayoutTip,
  isBaselineOnly,
  brandsForGameType
} from '../public/js/guide/data.js';
import { rebuildDevices, findOption, universalPolishDevices, clearResolveCache } from '../public/js/guide/resolve.js';
import {
  createState,
  recordAnswer,
  answerFor,
  clearAnswer,
  questions,
  nextUnanswered,
  progressFor,
  predecessor,
  trailFor,
  applySavedGame,
  savedGameNotice,
  walkthroughSteps
} from '../public/js/guide/state.js';
import { createStore, memoryStorage, MAX_SAVED, SCHEMA, STORAGE_KEY, LEGACY_STORAGE_KEY, SUMMARY_LAYOUT_KEY, SUMMARY_BAR_KEY } from '../public/js/guide/store.js';
import { parseShare, buildShare } from '../public/js/guide/share.js';
import { articleFor, buildPitch, factsLine, TYPE_VOICE } from '../public/js/guide/pitch.js';
import { parseHash, toHash, applyRoute } from '../public/js/guide/router.js';
import { WALKTHROUGH_STEPS, DESIGN_MODES, EXPERIENCE_LEVELS, PLACEHOLDER_NOTES } from '../public/js/guide/content.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, '..', 'public');
const GUIDE_DIR = path.join(PUBLIC_DIR, 'js', 'guide');

const raw = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'data', 'uefn_device_logic.json'), 'utf8'));
const data = parseData(raw);

const researchedKeys = data.gameTypeKeys.filter((k) => data.gameTypes[k].status === 'live' && !data.gameTypes[k].is_custom);
const draftKeys = data.gameTypeKeys.filter((k) => data.gameTypes[k].status === 'draft');
/** The ten "Just give me the basics" entries: live, but with no questions of their own. */
const basicKeys = data.gameTypeKeys.filter((k) => data.gameTypes[k].is_custom);
const questionTypes = researchedKeys.filter((k) => (data.gameTypes[k].questions || []).length);
/** Game types that ask nothing at all, so the flow must skip straight past the question screen. */
const noQuestionTypes = basicKeys;

/** Every question in a type answered with its first option — a complete, valid answer set. */
function firstAnswers(key) {
  return (data.gameTypes[key].questions || []).map((q) => ({
    qId: q.id,
    qPrompt: q.prompt,
    optionValue: q.options[0].value,
    optionLabel: q.options[0].label
  }));
}

/** Create a session already pointed at a game type. `createState` only takes `devMode`. */
function sessionFor(key, extra = {}) {
  const state = createState(data, extra);
  state.gameTypeKey = key;
  state.categoryKey = data.gameTypes[key].category;
  return state;
}

/* ============================ data integrity ============================ */

test('the data file parses and keeps its shape', () => {
  assert.equal(data.gameTypeKeys.length, 97, 'ninety-seven game types, every one of them still present');
  assert.equal(researchedKeys.length, 13, 'thirteen researched game types');
  assert.equal(basicKeys.length, 10, 'ten "Just give me the basics" entries');
  assert.equal(draftKeys.length, 74, 'seventy-four drafts');
  assert.equal(data.liveCount + data.customCount, 23, 'twenty-three entries are offered with dev mode off');
  assert.equal(questionTypes.length, researchedKeys.length, 'every researched type asks its own questions');
  assert.ok(Object.keys(data.deviceLibrary).length >= 50, 'the device library is populated');
  assert.equal(data.brands.length, 8, 'eight brand templates');
  assert.equal(data.roles.length, 11, 'eleven device roles');
  assert.equal(data.gameCategories.length, 10, 'ten game categories');
});

test('every game type points at a real category, and every category is declared', () => {
  const known = new Set(data.gameCategories.map((c) => c.id));
  for (const key of data.gameTypeKeys) {
    const type = data.gameTypes[key];
    assert.ok(known.has(type.category), `${key} has a category that is not declared: ${type.category}`);
    assert.ok(type.label && type.description, `${key} has a label and a description`);
  }
});

test('every device a game type names exists in the device library', () => {
  const missing = [];
  const checkRefs = (refs, where) => {
    for (const ref of refs || []) {
      const name = typeof ref === 'string' ? ref : ref && ref.ref;
      if (!name) continue;
      if (!data.deviceLibrary[name]) missing.push(`${where} → ${name}`);
    }
  };

  for (const key of data.gameTypeKeys) {
    const type = data.gameTypes[key];
    checkRefs(type.devices, key);
    for (const question of type.questions || []) {
      for (const option of question.options || []) {
        checkRefs((option.effects || {}).add_devices, `${key}/${question.id}/${option.value}`);
      }
    }
  }
  for (const [catId, baseline] of Object.entries(data.baselines)) checkRefs(baseline.devices, `baseline ${catId}`);

  assert.deepEqual(missing, [], 'no dangling device references');
});

test('every setting override names a real device and a real setting', () => {
  const problems = [];
  const checkRows = (rows, where) => {
    for (const row of rows || []) {
      const device = data.deviceLibrary[row.device];
      if (!device) {
        problems.push(`${where}: unknown device ${row.device}`);
        continue;
      }
      if (!(device.settings || []).some((s) => s.name === row.setting)) {
        problems.push(`${where}: ${row.device} has no setting "${row.setting}"`);
      }
    }
  };

  for (const key of data.gameTypeKeys) {
    const type = data.gameTypes[key];
    checkRows(type.base_set_settings, `${key} base`);
    for (const question of type.questions || []) {
      for (const option of question.options || []) {
        checkRows((option.effects || {}).set_settings, `${key}/${question.id}/${option.value}`);
      }
    }
  }
  assert.deepEqual(problems, [], 'every override is applied to something that exists');
});

test('every question is answerable and every question id is unique within its type', () => {
  for (const key of questionTypes) {
    const ids = new Set();
    for (const question of data.gameTypes[key].questions) {
      assert.ok(question.id && question.prompt, `${key} question needs an id and a prompt`);
      assert.ok(!ids.has(question.id), `${key} repeats question id ${question.id}`);
      ids.add(question.id);
      assert.ok((question.options || []).length >= 2, `${key}/${question.id} needs at least two options`);
      const values = new Set();
      for (const option of question.options) {
        assert.ok(option.value && option.label, `${key}/${question.id} option needs a value and a label`);
        assert.ok(!values.has(option.value), `${key}/${question.id} repeats option value ${option.value}`);
        values.add(option.value);
      }
    }
  }
});

test('every brand can be shown, gated and credited', () => {
  for (const brand of data.brands) {
    assert.ok(brand.label && brand.description && brand.pitch, `${brand.id} has label, description and pitch`);
    const confirmation = brand.restriction_confirmation;
    assert.ok(confirmation, `${brand.id} has a restriction_confirmation block`);
    assert.ok((confirmation.sections || []).length, `${brand.id} has at least one rule section`);
    assert.match(confirmation.guidelines_url || '', /^https:\/\//, `${brand.id} links to its official guidelines`);
    for (const section of confirmation.sections) {
      assert.ok(section.title && (section.rules || []).length, `${brand.id} rule sections carry titles and rules`);
    }
  }
  assert.ok(data.defaultBrandId && data.brandsById.has(data.defaultBrandId), 'the default brand exists');
});

/* ============================ the pitch (the summary's first line) ============================ */

test('every researched game type has a voice to pitch with', () => {
  /* The pitch is only as good as this table: a researched type with no entry gets the flat fallback,
   * which is exactly the thing the rewrite exists to avoid on the 13 types people actually reach. */
  assert.equal(researchedKeys.length, 13, 'thirteen researched types');
  for (const key of researchedKeys) {
    const voice = TYPE_VOICE[key];
    assert.ok(voice, `${key} has a voice`);
    assert.ok(voice.noun && voice.noun.trim(), `${key} names itself inside the sentence`);
    assert.ok(voice.hook && voice.hook.name && voice.hook.description, `${key} has a hook and a description of it`);
    assert.ok(Array.isArray(voice.facts) && voice.facts.length >= 3, `${key} says what it means underneath`);
    assert.ok(voice.facts.every((fact) => typeof fact === 'string' && fact.trim()), `${key} facts are all readable`);
  }
  /* And nothing is written for a type that does not exist, which is how a table like this rots. */
  for (const key of Object.keys(TYPE_VOICE)) {
    assert.ok(data.gameTypes[key], `TYPE_VOICE names ${key}, which is not a game type in the data`);
  }
});

test('the pitch reads the way the randomiser reads', () => {
  const box = buildPitch({
    key: 'combat_box_fights',
    type: data.gameTypes.combat_box_fights,
    category: data.gameCategories.find((c) => c.id === 'combat'),
    brand: data.brandsById.get('star_wars')
  });

  assert.equal(box.strapline, 'A Box Fight, set in the world of Star Wars. So fast you barely think.');
  assert.equal(box.noun, 'Box Fight', 'the sentence uses the singular, not the list heading "Box Fights"');
  assert.equal(box.hook.name, 'So fast you barely think');
  assert.equal(box.voice, 'researched');
  assert.equal(factsLine(box.facts), 'Fighting · Teams against each other · 2–4 · One arena · Under 5 minutes');

  /* An unbranded game drops the clause rather than naming "Original" as a world. */
  const plain = buildPitch({
    key: 'combat_box_fights',
    type: data.gameTypes.combat_box_fights,
    category: null,
    brand: data.brandsById.get('original')
  });
  assert.equal(plain.strapline, 'A Box Fight. So fast you barely think.');
});

test('the article is right, and a type with no voice is not given one', () => {
  assert.equal(articleFor('Box Fight'), 'A');
  assert.equal(articleFor('Elimination / Deathmatch'), 'An');
  assert.equal(articleFor('Action RPG'), 'An');
  assert.equal(articleFor('Horror Chase'), 'A');

  for (const key of researchedKeys) {
    const type = data.gameTypes[key];
    const pitch = buildPitch({ key, type, category: null, brand: null });
    assert.match(pitch.strapline, /^(A|An) /, `${key}: the sentence opens with an article`);
    assert.ok(!/^A [AEIOU]/.test(pitch.strapline.slice(2)), `${key}: no "A" before a vowel`);
    assert.ok(pitch.strapline.endsWith('.'), `${key}: the sentence closes`);
  }

  /* A draft has no hook and no facts, and none are invented for it: the pitch is its own description
   * and nothing else. 74 of the 97 types are drafts, so this is the common case, not the edge case. */
  const draft = buildPitch({ key: draftKeys[0], type: data.gameTypes[draftKeys[0]], category: null, brand: null });
  assert.equal(draft.hook, null, 'a draft is not given a voice it has not earned');
  assert.deepEqual(draft.facts, [], 'and no facts row is invented for it');
  assert.equal(draft.voice, 'baseline');
  assert.equal(draft.description, data.gameTypes[draftKeys[0]].description);

  /* The ten "just give me the basics" entries are described rather than named, because "A Just give me
   * the basics" is not a sentence. */
  const basicsKey = basicKeys.find((k) => data.gameTypes[k].category === 'combat');
  const basics = buildPitch({
    key: basicsKey,
    type: data.gameTypes[basicsKey],
    category: data.gameCategories.find((c) => c.id === 'combat'),
    brand: data.brandsById.get('star_wars')
  });
  assert.equal(basics.voice, 'essentials');
  assert.equal(basics.strapline, `An essentials combat build, set in the world of Star Wars. ${data.gameTypes[basicsKey].description}`);
  assert.ok(!/Just give me the basics,/.test(basics.strapline), 'the entry is never named as though it were a game');

  assert.equal(buildPitch({ key: 'nope', type: null }), null, 'no game type means no pitch, rather than a throw');
});

test('a game type always has a core loop to show, from itself or its baseline', () => {
  for (const key of researchedKeys) {
    const loop = effectiveCoreLoop(data, key);
    assert.ok(loop, `${key} resolves to a core loop`);
    assert.ok(loop.entry, `${key} core loop names an entry point`);
    assert.ok((loop.loop || []).length >= 1, `${key} core loop has at least one step`);
    assert.ok((loop.outcomes || []).length >= 1, `${key} core loop has at least one outcome`);
  }
  /* The null-safe fallback is the normal path, not an edge case: 84 of 97 types are null here. */
  assert.ok(data.gameTypeKeys.filter((k) => !data.gameTypes[k].core_loop).length > 50, 'most types fall back to a baseline');
  assert.equal(effectiveCoreLoop(data, 'no_such_type'), null, 'an unknown type resolves to null, not a throw');
  assert.equal(effectiveLayoutTip(data, 'no_such_type'), '', 'an unknown type resolves to an empty tip');
});

test('the honesty badges describe what is actually behind a category', () => {
  const summaries = categorySummaries(data, false);
  const byId = new Map(summaries.map((s) => [s.id, s]));

  for (const summary of summaries) {
    assert.equal(summary.baselineOnly, summary.researched === 0, `${summary.id} is baseline-only exactly when nothing is researched`);
    if (summary.baselineOnly) {
      assert.equal(summary.researched, 0);
      assert.ok(summary.total > 0, `${summary.id} still offers its basics entry`);
    }
  }
  /* The two categories with no researched types are the ones v1 disguised. Both stay reachable. */
  const baselineOnly = summaries.filter((s) => s.baselineOnly);
  assert.ok(baselineOnly.length >= 1, 'at least one category is honestly baseline-only');
  for (const summary of baselineOnly) assert.equal(summary.visible, true, `${summary.id} is still reachable with dev mode off`);
  assert.ok(byId.get('combat').researched > 0, 'combat has researched types');
});

test('game types are ordered researched → draft → basics, and drafts hide without dev mode', () => {
  for (const cat of data.gameCategories) {
    const withDev = gameTypesInCategory(data, cat.id, true);
    const withoutDev = gameTypesInCategory(data, cat.id, false);
    assert.ok(withoutDev.every((t) => t.status === 'live'), `${cat.id}: dev mode off shows only live entries`);

    const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
    const ranks = withDev.map(rank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${cat.id}: ordering is researched, draft, basics`);
  }
});

test('the polish role is a data flag, not a hardcoded id in a screen', async () => {
  assert.equal(data.roles.find((r) => r.id === 'environment_atmosphere').polishOnly, true);
  assert.ok(data.universalPolish.length, 'the three universal polish devices are declared in the data');
  const source = await readFile(path.join(GUIDE_DIR, 'screens', 'walkthrough.js'), 'utf8');
  assert.ok(!source.includes("'environment_atmosphere'"), 'the walkthrough does not name the polish role inline');
});

/* ============================ resolution ============================ */

test('universal devices appear in every plan', () => {
  for (const key of researchedKeys.slice(0, 6)) {
    const plan = rebuildDevices(data, key, []);
    for (const name of data.universal) {
      assert.ok(plan.devices.some((d) => d.name === name), `${key} includes the universal device ${name}`);
    }
  }
});

test('the same answers always produce the same plan', () => {
  const key = questionTypes[0];
  const answers = data.gameTypes[key].questions.map((q) => {
    const option = q.options[0];
    return { qId: q.id, qPrompt: q.prompt, optionValue: option.value, optionLabel: option.label };
  });

  clearResolveCache();
  const first = rebuildDevices(data, key, answers);
  clearResolveCache();
  const second = rebuildDevices(data, key, answers);
  assert.equal(JSON.stringify(first), JSON.stringify(second), 'the plan is deterministic');
});

test('a draft game type resolves from its category baseline without throwing', () => {
  for (const key of draftKeys.slice(0, 20)) {
    const plan = rebuildDevices(data, key, []);
    assert.ok(plan.counts.devices >= 0);
    assert.deepEqual(plan.orphans, [], `${key} has no orphaned overrides`);
    assert.ok(plan.coreGroups.every((g) => g.devices.length), 'empty groups are not emitted');
  }
  /* A game type that does not exist at all still produces a well-formed plan: the always-on devices,
   * nothing else, and no crash. */
  const missing = rebuildDevices(data, 'definitely_not_a_type', []);
  assert.equal(missing.counts.devices, data.universal.length, 'only the universal devices survive');
  assert.ok(missing.devices.every((d) => data.universal.includes(d.name)));
  assert.deepEqual(missing.orphans, []);
  assert.deepEqual(missing.notes, []);
});

test('answers add their devices and label where they came from', () => {
  const key = questionTypes.find((k) => {
    const type = data.gameTypes[k];
    return type.questions.some((q) => q.options.some((o) => ((o.effects || {}).add_devices || []).length));
  });
  assert.ok(key, 'at least one question adds a device');

  const type = data.gameTypes[key];
  const question = type.questions.find((q) => q.options.some((o) => ((o.effects || {}).add_devices || []).length));
  const option = question.options.find((o) => ((o.effects || {}).add_devices || []).length);
  const addedName = option.effects.add_devices[0].ref || option.effects.add_devices[0];

  const without = rebuildDevices(data, key, []);
  const with_ = rebuildDevices(data, key, [
    { qId: question.id, qPrompt: question.prompt, optionValue: option.value, optionLabel: option.label }
  ]);

  const device = with_.devices.find((d) => d.name === addedName);
  assert.ok(device, `${addedName} is in the plan once the answer says so`);
  assert.ok(device.sources.includes(question.prompt), 'the chip names the question that asked for it');
  assert.ok(!without.devices.some((d) => d.name === addedName) || without.devices.find((d) => d.name === addedName).sources.length < device.sources.length);
});

test('a path-specific setting appends to the general advice instead of replacing it', () => {
  const found = [];
  for (const key of questionTypes) {
    for (const question of data.gameTypes[key].questions) {
      for (const option of question.options) {
        for (const row of (option.effects || {}).set_settings || []) found.push({ key, question, option, row });
      }
    }
  }
  assert.ok(found.length, 'the data contains at least one setting override');

  const { key, question, option, row } = found[0];
  const plan = rebuildDevices(data, key, [
    { qId: question.id, qPrompt: question.prompt, optionValue: option.value, optionLabel: option.label }
  ]);
  const device = plan.devices.find((d) => d.name === row.device);
  assert.ok(device, 'the device the override targets is in the plan');

  const setting = device.settings.find((s) => s.name === row.setting);
  assert.ok(setting, 'the setting is present');
  assert.equal(setting.rows[0].source, 'General guidance', 'general guidance stays first');
  assert.ok(setting.rows.length >= 2, 'the override is appended under it');
  assert.equal(setting.rows[1].text, row.value);
  assert.equal(setting.rows[1].isOverride, true, 'the override is marked as one');
  assert.equal(setting.rows[1].source, `${question.prompt} → ${option.label}`, 'the override says which answer caused it');
});

test('a dangling override is reported with its provenance rather than dropped in silence', () => {
  /* One game type in the reference data sets an option on a device it never lists. The engine keeps
   * it in `orphans` (with where it came from and what it wanted to set) so the walkthrough can say so
   * out loud. If the data is ever fixed, or another type acquires the same problem, this test is the
   * place that notices either way. */
  const withOrphans = data.gameTypeKeys.filter((key) => rebuildDevices(data, key, firstAnswers(key)).orphans.length);
  assert.deepEqual(withOrphans, ['platforming_deathrun_obby'], 'exactly one game type has a dangling override');

  const plan = rebuildDevices(data, 'platforming_deathrun_obby', firstAnswers('platforming_deathrun_obby'));
  const orphan = plan.orphans[0];
  assert.equal(orphan.device, 'Round Settings');
  assert.equal(orphan.setting, 'Last Standing Wins');
  assert.ok(orphan.source && orphan.value, 'the report says what it came from and what it wanted to set');
  assert.ok(!plan.devices.some((d) => d.name === 'Round Settings'), 'and the device really is absent from the list, so it is not a false alarm');
});

test('the three universal polish devices stay out of the core-loop list', () => {
  const polish = universalPolishDevices(data);
  assert.equal(polish.length, 3);
  const key = researchedKeys[0];
  const plan = rebuildDevices(data, key, []);
  for (const device of polish) {
    assert.ok(!plan.coreGroups.some((g) => g.devices.some((d) => d.name === device.name)), `${device.name} is not a core-loop device`);
  }
});

test('findOption only answers questions the game type actually asks', () => {
  const key = questionTypes[0];
  const type = data.gameTypes[key];
  const question = type.questions[0];
  assert.ok(findOption(type, question.id, question.options[0].value), 'a real option is found');
  assert.equal(findOption(type, 'nope', 'nope'), null);
  assert.equal(findOption(type, question.id, 'nope'), null);
  assert.equal(findOption(null, question.id, question.options[0].value), null);
});

/* ============================ state and progress ============================ */

test('answers are keyed by question id, edited in place, and clearable', () => {
  const state = createState(data);
  recordAnswer(state, { qId: 'a', qPrompt: 'A?', optionValue: '1', optionLabel: 'One' });
  recordAnswer(state, { qId: 'b', qPrompt: 'B?', optionValue: '2', optionLabel: 'Two' });
  recordAnswer(state, { qId: 'a', qPrompt: 'A?', optionValue: '3', optionLabel: 'Three' });

  assert.equal(state.answers.length, 2, 'editing an answer does not add a second one');
  assert.equal(answerFor(state, 'a').optionLabel, 'Three', 'the answer was replaced');
  assert.equal(state.answers[0].qId, 'a', 'and keeps its original position');
  clearAnswer(state, 'a');
  assert.equal(state.answers.length, 1);
  assert.equal(answerFor(state, 'a'), null);
});

test('nextUnanswered walks the game type’s own order and then stops', () => {
  const key = questionTypes[0];
  const state = sessionFor(key);
  const list = questions(data, state);
  assert.equal(nextUnanswered(data, state).id, list[0].id);

  recordAnswer(state, { qId: list[0].id, qPrompt: list[0].prompt, optionValue: list[0].options[0].value, optionLabel: list[0].options[0].label });
  assert.equal(nextUnanswered(data, state).id, list[1].id);

  for (const question of list) {
    recordAnswer(state, { qId: question.id, qPrompt: question.prompt, optionValue: question.options[0].value, optionLabel: question.options[0].label });
  }
  assert.equal(nextUnanswered(data, state), null, 'a finished list has nothing left to ask');
});

test('progress never goes backwards across a whole run, and ends at 100', () => {
  for (const key of [...questionTypes.slice(0, 3), noQuestionTypes[0]]) {
    const type = data.gameTypes[key];
    const state = sessionFor(key);
    const steps = walkthroughSteps('beginner', WALKTHROUGH_STEPS);
    const seen = [];

    const record = () => seen.push({ screen: state.screen, value: progressFor(data, state, { steps }) });

    state.screen = 'home';
    record();
    state.screen = 'category';
    record();
    state.screen = 'gametype';
    record();

    for (const question of type.questions || []) {
      state.screen = 'question';
      state.qId = question.id;
      record();
      recordAnswer(state, { qId: question.id, qPrompt: question.prompt, optionValue: question.options[0].value, optionLabel: question.options[0].label });
    }

    state.screen = 'brand';
    record();
    state.screen = 'restriction';
    record();
    state.screen = 'summary';
    record();
    state.screen = 'experience';
    record();
    state.screen = 'walkthrough';
    for (let i = 0; i < steps.length; i += 1) {
      state.stepIndex = i;
      record();
    }

    for (let i = 1; i < seen.length; i += 1) {
      assert.ok(
        seen[i].value >= seen[i - 1].value,
        `${key}: progress dropped from ${seen[i - 1].value} (${seen[i - 1].screen}) to ${seen[i].value} (${seen[i].screen})`
      );
    }
    assert.equal(seen[0].value, 0, 'home is zero');
    assert.equal(seen[seen.length - 1].value, 100, `${key}: the last build step is 100%`);
  }
});

test('progress lands inside its documented band', () => {
  const key = questionTypes[0];
  const type = data.gameTypes[key];
  const state = sessionFor(key);

  state.screen = 'category';
  assert.equal(progressFor(data, state), 4);
  state.screen = 'gametype';
  assert.equal(progressFor(data, state), 10);
  state.screen = 'question';
  state.qId = type.questions[0].id;
  assert.equal(progressFor(data, state), 16, 'the first question sits at the start of its band');
  state.screen = 'brand';
  assert.equal(progressFor(data, state), 44);
  state.screen = 'restriction';
  assert.equal(progressFor(data, state), 48);
  state.screen = 'summary';
  assert.equal(progressFor(data, state), 55);
  state.screen = 'experience';
  assert.equal(progressFor(data, state), 58);
  state.screen = 'walkthrough';
  state.stepIndex = 0;
  assert.equal(progressFor(data, state), 60, 'the walkthrough starts at 60');
});

test('back from the brand screen keeps every answer', () => {
  const key = questionTypes[0];
  const type = data.gameTypes[key];
  const state = sessionFor(key);
  for (const question of type.questions) {
    recordAnswer(state, { qId: question.id, qPrompt: question.prompt, optionValue: question.options[0].value, optionLabel: question.options[0].label });
  }
  const before = state.answers.length;

  state.screen = 'brand';
  const route = predecessor(data, state);
  assert.equal(route.screen, 'question');
  assert.equal(route.qId, type.questions[type.questions.length - 1].id, 'back goes to the last question asked');
  assert.equal(state.answers.length, before, 'and nothing was popped off the answer list');
});

test('a game type with no questions never routes through the question screen', () => {
  const key = noQuestionTypes[0];
  const state = sessionFor(key);
  assert.equal((data.gameTypes[key].questions || []).length, 0, 'the basics entry really does ask nothing');

  state.screen = 'brand';
  assert.deepEqual(predecessor(data, state), { screen: 'gametype' }, 'brand falls back to the game type');
  state.screen = 'question';
  assert.deepEqual(predecessor(data, state), { screen: 'gametype' }, 'and so does a stray question route');
});

test('predecessors are defined for every screen the router can reach', () => {
  const key = questionTypes[0];
  const state = sessionFor(key);
  for (const screen of ['category', 'gametype', 'question', 'brand', 'restriction', 'summary', 'experience', 'walkthrough']) {
    state.screen = screen;
    const route = predecessor(data, state);
    assert.ok(route && route.screen, `${screen} has somewhere to go back to`);
  }
  state.screen = 'walkthrough';
  state.stepIndex = 1;
  assert.deepEqual(predecessor(data, state), { screen: 'walkthrough', stepIndex: 0 });
});

test('the experience level only changes the beginner step', () => {
  const beginner = walkthroughSteps('beginner', WALKTHROUGH_STEPS);
  assert.equal(beginner.length, WALKTHROUGH_STEPS.length);
  for (const level of ['some', 'experienced', 'expert']) {
    const steps = walkthroughSteps(level, WALKTHROUGH_STEPS);
    assert.equal(steps.length, WALKTHROUGH_STEPS.length - 1, `${level} skips exactly one step`);
    assert.ok(!steps.some((s) => s.id === 'basic_nav'), `${level} does not get Basic Navigation`);
  }
});

test('every walkthrough step is complete and points at a named video', () => {
  const ids = new Set();
  for (const step of WALKTHROUGH_STEPS) {
    assert.ok(step.id && step.title, 'a step needs an id and a title');
    assert.ok(!ids.has(step.id), `duplicate step id ${step.id}`);
    ids.add(step.id);
    assert.ok(step.body.length, `${step.id} has body copy`);
    assert.match(step.video, /^videos\/\d{2}_[A-Za-z]+\.mp4$/, `${step.id} names its video by convention`);
  }
});

/* ============================ saved games ============================ */

test('a saved game round-trips through storage', () => {
  const store = createStore(memoryStorage());
  const result = store.save({
    name: 'Mosslight',
    categoryKey: 'adventure',
    gameTypeKey: 'adventure_action_rpg',
    brandKey: 'original',
    answers: [{ qId: 'q1', qPrompt: 'Q?', optionValue: 'a', optionLabel: 'A' }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.record.schema, SCHEMA);

  const listed = store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'Mosslight');
  assert.equal(listed[0].answers.length, 1);
  assert.equal(store.get(result.record.id).gameTypeKey, 'adventure_action_rpg');
});

test('saving reports why it failed instead of failing quietly', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.save({ name: '   ' }), { ok: false, reason: 'name' }, 'a blank name is refused');
  assert.equal(store.save({ name: '  Trimmed  ' }).record.name, 'Trimmed', 'and a padded one is trimmed');

  const full = createStore(memoryStorage());
  for (let i = 0; i < MAX_SAVED; i += 1) {
    assert.equal(full.save({ name: `Game ${i}`, gameTypeKey: 'combat_zone_wars' }).ok, true);
  }
  const overflow = full.save({ name: 'One too many', gameTypeKey: 'combat_zone_wars' });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'cap');
  assert.equal(overflow.cap, MAX_SAVED);

  const noStorage = createStore(null);
  assert.deepEqual(noStorage.save({ name: 'Anywhere' }), { ok: false, reason: 'unavailable' });

  const throwing = createStore({
    getItem: () => null,
    setItem: () => {
      const error = new Error('full');
      error.name = 'QuotaExceededError';
      throw error;
    },
    removeItem: () => {}
  });
  assert.equal(throwing.save({ name: 'Big' }).reason, 'quota', 'a full quota is reported as quota');
});

test('saved games can be renamed and deleted, and listing is newest first', () => {
  let tick = 0;
  const store = createStore(memoryStorage(), { now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)) , newId: (() => { let n = 0; return () => `id${n++}`; })() });

  const a = store.save({ name: 'First', gameTypeKey: 'combat_zone_wars' });
  const b = store.save({ name: 'Second', gameTypeKey: 'combat_zone_wars' });
  assert.deepEqual(store.list().map((g) => g.name), ['Second', 'First'], 'newest first');

  assert.equal(store.rename(a.record.id, 'Renamed').ok, true);
  assert.equal(store.get(a.record.id).name, 'Renamed');
  assert.equal(store.rename('nope', 'X').reason, 'missing');
  assert.equal(store.rename(a.record.id, '  ').reason, 'name');

  assert.equal(store.remove(b.record.id).ok, true);
  assert.equal(store.list().length, 1);
  assert.equal(store.get(b.record.id), null);
});

test('the dev-mode preference persists', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  assert.equal(store.getDevMode(), false, 'off by default');
  store.setDevMode(true);
  assert.equal(createStore(storage).getDevMode(), true, 'and survives a reload');
});

test('the summary layout defaults to the one the app shipped with', () => {
  /* The redesign is opt-in while the two are being compared, so an existing session - or a cleared
   * storage - sees exactly the page it saw before. A stored value the app does not know is treated as
   * absent rather than trusted, because a stale key must not render a layout that no longer exists. */
  const storage = memoryStorage();
  const store = createStore(storage);
  assert.equal(store.getSummaryLayout(), 'classic', 'classic unless this browser says otherwise');

  store.setSummaryLayout('new');
  assert.equal(createStore(storage).getSummaryLayout(), 'new', 'and the choice survives a reload');
  assert.equal(store.getSummaryLayout('classic', ['classic']), 'classic', 'a layout the app no longer knows is ignored');

  const junk = createStore(memoryStorage({ [SUMMARY_LAYOUT_KEY]: JSON.stringify('sideways') }));
  assert.equal(junk.getSummaryLayout('classic'), 'classic', 'an unknown stored layout falls back');

  /* The state carries it too, and refuses anything but the two the screen can draw. */
  assert.equal(createState(data).summaryLayout, 'classic');
  assert.equal(createState(data, { summaryLayout: 'new' }).summaryLayout, 'new');
  assert.equal(createState(data, { summaryLayout: 'nonsense' }).summaryLayout, 'classic');

  /* The comparison bar is open unless this browser has rolled it up. It is the only way to reach the
   * other layout, so a session that has never touched it should find it; and it is a separate decision
   * from which layout is showing, because rolling the bar away is "stop showing me the tool", not
   * "stop comparing". */
  assert.equal(store.getSummaryBarOpen(), true, 'the bar starts open');
  assert.equal(createState(data).summaryBarOpen, true, 'and the state agrees');
  assert.equal(createState(data, { summaryBarOpen: false }).summaryBarOpen, false, 'and a rolled-up bar is carried too');

  store.setSummaryBarOpen(false);
  assert.equal(createStore(storage).getSummaryBarOpen(), false, 'rolled up survives a reload');
  assert.equal(store.getSummaryLayout(), 'new', 'and the layout it was comparing is untouched by that');
});

test('the comparison bar is the one thing painted outside the palette', async () => {
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');

  /* The whole app is one palette and one visual language, and this bar is the deliberate exception —
   * a temporary tool for comparing two designs, which must not read as part of the product. That is a
   * claim worth pinning, because it is the kind of exception that spreads: the moment a second
   * component consumes `--fn-compare`, the bar stops meaning "not the product" and starts being a
   * second accent.
   *
   * So: the colour is declared in tokens.css like every other, the bar is the only thing that consumes
   * it, and the bar is fixed across the top rather than sitting in the page's flow. */
  assert.match(tokens, /--fn-compare:\s*#[0-9A-Fa-f]{6}/, 'the exception colour is declared in tokens.css');

  const consumers = guide
    .split(/\n(?=\S)/)
    .flatMap((block) => (block.includes('var(--fn-compare)') ? block.match(/^[^{]*/)[0].trim().split(/,\s*/) : []));
  assert.ok(consumers.length > 0, 'the bar consumes the exception colour');
  for (const selector of consumers) {
    assert.ok(
      /\.g-compare/.test(selector),
      `${selector} consumes --fn-compare; only the comparison bar may, or the exception stops meaning anything`
    );
  }

  /* Fixed across the top of the window, above the site header's own layer, so it never pushes the
   * product down the page — a comparison tool that takes layout space has become part of the layout. */
  const bar = ruleBody(guide, '.g-compare');
  assert.match(bar, /position:\s*fixed/, 'the bar is fixed rather than in the page flow');
  assert.match(bar, /top:\s*0/, 'and sits at the very top of the window');
  assert.match(bar, /z-index:\s*(\d+)/, 'with a layer of its own');
  const layer = Number(bar.match(/z-index:\s*(\d+)/)[1]);
  const header = Number((await readFile(path.join(PUBLIC_DIR, 'css', 'shell.css'), 'utf8')).match(/\.sh-header\s*\{[^}]*z-index:\s*(\d+)/)[1]);
  assert.ok(layer > header, `the bar (${layer}) has to sit above the site header (${header})`);

  /* The guide's own button fills are the palette's, and none of them appear on the bar: it is drawn
   * from its own ink instead. */
  const barRules = guide.match(/\.g-compare[a-z-]*(?:\[[^\]]*\])?\s*\{[^}]*\}/g) || [];
  assert.ok(barRules.length >= 4, `the bar's rules were found to check (got ${barRules.length})`);
  for (const rule of barRules) {
    assert.ok(
      !/var\(--fn-(action|on-action|surface-|text|border)/.test(rule),
      `the bar borrows the guide's palette:\n${rule.trim()}`
    );
  }
});

test('switching layouts does not lay out a notice of its own', async () => {
  const app = await readFile(path.join(GUIDE_DIR, 'app.js'), 'utf8');

  /* The bar is fixed across the top of the summary and already says what it is and which layout is
   * showing, so a notice would be the same sentence a second time — pushed into the page's own content,
   * where it competes with the pitch for the first thing the eye lands on. The bar carries the
   * explanation permanently instead, which is also why it is not dismissible away to nothing. */
  const action = app.slice(app.indexOf('setSummaryLayout(layout)'), app.indexOf('setSummaryBar(open)'));
  assert.ok(action.length > 0, 'the action is found');
  assert.ok(!/state\.notice\s*=/.test(action), 'switching layouts sets no notice');

  /* And the bar's own explanation is in the markup, not in a notice. */
  const screen = await readFile(path.join(GUIDE_DIR, 'screens', 'summary.js'), 'utf8');
  assert.match(screen, /UI\.compareNote/, 'the bar carries the explanation itself');
  assert.match(screen, /data-open/, 'and has both an open and a rolled-up state');
  /* The rolled-up tab is a button like the other two, so the bar can always be brought back. */
  assert.match(screen, /g-compare-tab/, 'rolling it up leaves a way back to it');
});

test('v1 saved games are imported once, reported, and mapped to the new taxonomy', () => {
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify([
      { name: 'Old elimination game', genreKey: 'elimination', answers: [] },
      { name: 'Old deathrun', genreKey: 'parkour_deathrun', answers: [{ qId: 'mode', optionValue: 'deathrun' }] },
      { name: 'Old parkour', genreKey: 'parkour_deathrun', answers: [{ qId: 'mode', optionValue: 'parkour' }] },
      { name: 'Old escape room', genreKey: 'horror_escape', answers: [{ qId: 'chaser', optionValue: 'no' }, { qId: 'puzzles', optionValue: 'yes' }] },
      { name: 'Old chase', genreKey: 'horror_escape', answers: [{ qId: 'chaser', optionValue: 'yes' }] },
      { name: 'No genre at all', answers: [] },
      { name: 'Unknown genre', genreKey: 'mystery_meat' }
    ])
  });
  const store = createStore(storage);
  const report = store.migrateLegacy();

  assert.equal(report.imported, 5, 'five saves came across');
  assert.equal(report.dropped.length, 2, 'and two were reported, not silently lost');
  assert.ok(report.dropped.every((d) => d.name && d.reason), 'each drop says which game and why');

  const mine = new Map(store.list().map((g) => [g.name, g]));
  assert.equal(mine.get('Old elimination game').gameTypeKey, 'combat_elimination_deathmatch');
  assert.equal(mine.get('Old deathrun').gameTypeKey, 'platforming_deathrun_obby', 'the answer decided the destination');
  assert.equal(mine.get('Old parkour').gameTypeKey, 'platforming_parkour');
  assert.equal(mine.get('Old escape room').gameTypeKey, 'puzzle_escape_room');
  assert.equal(mine.get('Old chase').gameTypeKey, 'survival_horror_chase');
  assert.match(mine.get('Old deathrun').migratedFrom, /^genre:/);

  assert.equal(store.migrateLegacy().imported, 5, 'and a second run changes nothing');
});

test('importing is skipped when newer saves already exist', () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify([{ id: 'new', name: 'Newer', gameTypeKey: 'combat_zone_wars', answers: [] }]),
    [LEGACY_STORAGE_KEY]: JSON.stringify([{ name: 'Older', genreKey: 'elimination', answers: [] }])
  });
  const store = createStore(storage);
  assert.equal(store.migrateLegacy().imported, 0);
  assert.deepEqual(store.list().map((g) => g.name), ['Newer']);
});

test("v1's dev-mode preference is carried across once", () => {
  const storage = memoryStorage({ 'uefnGameCreatorGuide.devMode': 'true' });
  const store = createStore(storage);
  store.migrateLegacy();
  assert.equal(store.getDevMode(), true);
});

test('loading a saved game restores the session and reports what it could not use', () => {
  const key = questionTypes[0];
  const type = data.gameTypes[key];
  const state = createState(data);
  const info = applySavedGame(
    state,
    {
      id: 'saved1',
      name: 'Old plan',
      gameTypeKey: key,
      categoryKey: type.category,
      brandKey: 'original',
      answers: [
        { qId: type.questions[0].id, optionValue: type.questions[0].options[0].value, optionLabel: type.questions[0].options[0].label, qPrompt: type.questions[0].prompt },
        { qId: 'a_question_nobody_asks', optionValue: 'x', optionLabel: 'X', qPrompt: 'Gone?' }
      ]
    },
    data
  );

  assert.equal(state.gameTypeKey, key);
  assert.equal(state.categoryKey, type.category);
  assert.equal(state.gameId, 'saved1');
  assert.equal(state.gameName, 'Old plan');
  assert.equal(info.droppedAnswers, 1, 'the stale answer is counted, not silently kept');
  assert.equal(state.answers.length, 1);
});

test('a saved game that names a draft or missing type is explained, not broken', () => {
  const draftKey = draftKeys[0];
  const notice = savedGameNotice(data, { name: 'Draft game', gameTypeKey: draftKey });
  assert.ok(notice, 'a draft save produces a notice');
  assert.match(notice.text, /draft/i);

  const missing = savedGameNotice(data, { name: 'Gone', gameTypeKey: 'was_never_a_type' });
  assert.equal(missing.tone, 'warn');
  assert.match(missing.text, /no longer exists/);

  const fine = savedGameNotice(data, { name: 'Fine', gameTypeKey: questionTypes[0] });
  assert.equal(fine, null, 'a healthy save says nothing');
});

/* ============================ routing and sharing ============================ */

test('every screen has a route, and the route survives a round trip', () => {
  const routes = [
    { screen: 'home' },
    { screen: 'category' },
    { screen: 'gametype' },
    { screen: 'question', qId: 'team_mode' },
    { screen: 'brand' },
    { screen: 'restriction' },
    { screen: 'summary' },
    { screen: 'experience' },
    { screen: 'walkthrough', stepIndex: 3 },
    { screen: 'placeholder', mode: 'randomise' }
  ];
  for (const route of routes) {
    const parsed = parseHash(toHash(route));
    assert.equal(parsed.screen, route.screen, `${route.screen} round-trips`);
    if (route.qId) assert.equal(parsed.qId, route.qId);
    if (route.stepIndex !== undefined) assert.equal(parsed.stepIndex, route.stepIndex);
    if (route.mode) assert.equal(parsed.mode, route.mode);
  }
  assert.equal(parseHash('#/nonsense').screen, 'home', 'junk falls back to home');
  assert.equal(parseHash('').screen, 'home');
});

test('a deep link is refused rather than half-rendered when the session cannot support it', () => {
  const empty = createState(data);
  const refused = applyRoute(data, empty, { screen: 'summary' });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'no-game-type');
  assert.equal(empty.screen, 'home', 'the session did not move');

  const state = createState(data);
  state.gameTypeKey = questionTypes[0];
  state.categoryKey = data.gameTypes[questionTypes[0]].category;
  assert.equal(applyRoute(data, state, { screen: 'summary' }).ok, true);
  assert.equal(state.screen, 'summary');

  const badQuestion = applyRoute(data, state, { screen: 'question', qId: 'not_a_question' });
  assert.equal(badQuestion.ok, false);
  assert.equal(badQuestion.reason, 'unknown-question');
});

test('picking a category reaches the game type screen', () => {
  /* The screen where a game type is chosen must not require one: requiring it bounced everyone who
   * picked a category back to the home screen, with the category screen still drawn underneath a home
   * hash. That is the whole wizard, so it is pinned here. */
  const state = createState(data);
  state.categoryKey = 'combat';
  const route = parseHash(toHash({ screen: 'gametype' }));
  const applied = applyRoute(data, state, route);
  assert.equal(applied.ok, true, 'the game type screen is reachable once a category is chosen');
  assert.equal(state.screen, 'gametype');

  /* With no category at all there is nothing to list, so it is refused by name rather than drawn empty. */
  const empty = createState(data);
  const refused = applyRoute(data, empty, { screen: 'gametype' });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'no-category');
  assert.equal(empty.screen, 'home');

  /* And a refused route must leave the session on the screen the app will actually draw. */
  const half = createState(data);
  half.screen = 'gametype';
  assert.equal(applyRoute(data, half, { screen: 'home' }).ok, true);
  assert.equal(half.screen, 'home');
});

test('a shared link carries the session and rebuilds it exactly', () => {
  const key = questionTypes[0];
  const type = data.gameTypes[key];
  const answers = type.questions.map((q) => ({
    qId: q.id,
    qPrompt: q.prompt,
    optionValue: q.options[q.options.length - 1].value,
    optionLabel: q.options[q.options.length - 1].label
  }));

  const query = buildShare({ gameTypeKey: key, answers, brandKey: 'original', devMode: false });
  const parsed = parseShare(query, data);

  assert.equal(parsed.gameTypeKey, key);
  assert.equal(parsed.brandKey, 'original');
  assert.deepEqual(parsed.answers.map((a) => `${a.qId}=${a.optionValue}`), answers.map((a) => `${a.qId}=${a.optionValue}`));
  assert.deepEqual(parsed.ignored, []);

  /* Prompts and labels come back from the data, not from the link: a link cannot disagree with it. */
  assert.equal(parsed.answers[0].qPrompt, type.questions[0].prompt);
});

test('a stale or hand-edited link is trimmed with an explanation', () => {
  const key = questionTypes[0];
  const parsed = parseShare(`?play=${key}&a=nope:1,brand_only&brand=not_a_brand`, data);

  assert.equal(parsed.gameTypeKey, key, 'the good part of the link still works');
  assert.equal(parsed.brandKey, data.defaultBrandId, 'an unknown brand falls back to the default');
  assert.equal(parsed.answers.length, 0);
  assert.ok(parsed.ignored.some((line) => /nope/.test(line)), 'the unknown question is reported');
  assert.ok(parsed.ignored.some((line) => /brand/.test(line)), 'the unknown brand is reported');

  const unknownType = parseShare('?play=not_a_type&a=x:1', data);
  assert.equal(unknownType.gameTypeKey, null);
  assert.equal(unknownType.answers.length, 0);
  assert.ok(unknownType.ignored.length);
});

/* ============================ markup and content discipline ============================ */

test('no guide script can inject markup: the app never sets HTML from a string', async () => {
  const files = await walk(GUIDE_DIR);
  const offenders = [];
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    /* Comments are stripped first: several of them quote the v1 anti-pattern in order to explain why
     * it is gone, and a test that cannot read prose is a test nobody can explain themselves in. */
    const source = (await readFile(file, 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    const relative = path.relative(PUBLIC_DIR, file).replace(/\\/g, '/');
    for (const pattern of [
      /\.innerHTML\s*=/,
      /\.outerHTML\s*=/,
      /insertAdjacentHTML/,
      /document\.write/,
      /\beval\(/,
      /new Function\(/,
      /* The v1 anti-pattern, in the two shapes it can take: an attribute inside a string, or an
       * attribute name handed to setAttribute. `onClick:` in an object literal is a plain JS property
       * and is what the safe `h()`/`button()` helpers take, so it is not matched here. */
      /on(click|change|input|submit|load|error)\s*=\s*["'`]/i,
      /setAttribute\(\s*["'`]on/i
    ]) {
      if (pattern.test(source)) offenders.push(`${relative} matches ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], 'markup is only ever built as nodes');
});

test('the chat page keeps working as an interim entry point', async () => {
  /* The header used to carry the link. The architecture spec (v2) gives the header one item - Home -
   * and the footer one link, so the interim chat page is reached from the app instead: the "Chat with
   * AI" panel on the home screen leads to the stub, and the stub links to the page itself. */
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.ok(!/href="chat\.html"/.test(html), 'the shell no longer links the chat page from its header');
  const placeholder = await readFile(path.join(GUIDE_DIR, 'screens', 'placeholder.js'), 'utf8');
  assert.match(placeholder, /href: 'chat\.html'/, 'the stub screen links the working chat page');
  assert.match(html, /data\/uefn_device_logic\.json/, 'and the page exposes the data file for anyone without JavaScript');
  const header = await readFile(path.join(PUBLIC_DIR, 'admin.html'), 'utf8');
  assert.match(header, /href="chat\.html"/, 'and the admin page still reaches it directly');
});

test('the guide stays reachable without dev mode, and dev mode stays discoverable', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /id="devModeButton"[^>]*aria-pressed="false"/, 'the control is in the markup, not hidden behind a query param');
  assert.match(html, /id="devModeState"/, 'and it states its own on/off value, so colour is not the only signal');
  /* 1.2.0 moved it out of the header and into the utility footer, where it is styled as a link. It is
   * still the same control with the same state, which is why it is still a button: a plain link has
   * nowhere to say "off". */
  assert.ok(
    html.indexOf('id="devModeButton"') > html.indexOf('<footer class="sh-footer">'),
    'the control lives in the footer as of 1.2.0'
  );
  const app = await readFile(path.join(GUIDE_DIR, 'app.js'), 'utf8');
  assert.match(app, /devFromQuery/, 'and ?dev=1 still works for a shared link');
  assert.match(app, /devButton\.addEventListener\('click'/, 'and the footer link still toggles it');
});

test('the screen list in the router matches the screens that exist', async () => {
  const files = await readdir(path.join(GUIDE_DIR, 'screens'));
  const modules = files.filter((f) => f.endsWith('.js'));
  assert.equal(modules.length, 10, 'ten screens are implemented');

  const app = await readFile(path.join(GUIDE_DIR, 'app.js'), 'utf8');
  for (const screen of ['home', 'category', 'gametype', 'question', 'brand', 'restriction', 'summary', 'experience', 'walkthrough', 'placeholder']) {
    assert.ok(app.includes(`${screen}: render`), `app.js wires the ${screen} screen`);
  }
});

test('the copy that promises something is backed by the behaviour', () => {
  /* "nothing you have answered is lost" — so answers must be kept per game type. */
  const state = sessionFor(questionTypes[0]);
  assert.deepEqual(state.answerHistory, {}, 'answers are stashed per game type');
  assert.equal(state.editing, false, 'and editing starts off');
  assert.equal(DESIGN_MODES.filter((m) => m.status === 'planned').length, 2, 'two design modes are honestly marked planned');
  for (const mode of DESIGN_MODES.filter((m) => m.status === 'planned')) {
    assert.ok(PLACEHOLDER_NOTES[mode.id] && PLACEHOLDER_NOTES[mode.id].length, `${mode.id} says what is missing`);
  }
  assert.equal(EXPERIENCE_LEVELS.length, 4);
  assert.ok(EXPERIENCE_LEVELS.every((l) => l.effect), 'each level says what it actually changes');
});

test('an honest badge is shown for types that only inherit a baseline', () => {
  /* Drafts and the basics entries have no devices, questions or core loop of their own, so what they
   * show comes from the category baseline — and both screens say so. */
  assert.equal(isBaselineOnly(data.gameTypes[draftKeys[0]]), true, 'a draft is baseline advice');
  assert.equal(isBaselineOnly(data.gameTypes[researchedKeys[0]]), false, 'a researched type is not');
  assert.equal(isBaselineOnly(data.gameTypes[basicKeys[0]]), false, 'the basics entries are their own thing, not baseline-only');

  /* Every researched type carries its own core loop, which is what makes it "researched". */
  for (const key of researchedKeys) {
    assert.equal(effectiveCoreLoop(data, key), data.gameTypes[key].core_loop, `${key} uses its own core loop`);
  }
  /* And every one of them names devices of its own, so the plan is tailored rather than inherited. */
  for (const key of researchedKeys) {
    assert.ok((data.gameTypes[key].devices || []).length, `${key} lists its own devices`);
  }
});

/* ======================= the page shell (architecture spec) ======================= */

test('the breadcrumb trail has one definition, and every screen has a trail', async () => {
  const key = questionTypes[0];
  const state = sessionFor(key);
  const type = data.gameTypes[key];
  const category = data.gameCategories.find((c) => c.id === type.category);
  state.answers = firstAnswers(key);
  state.qId = type.questions[0].id;

  /* Every screen gets a trail that ends where the user actually is. */
  for (const screen of ['home', 'category', 'gametype', 'question', 'brand', 'restriction', 'summary', 'experience', 'walkthrough', 'placeholder']) {
    state.screen = screen;
    const trail = trailFor(data, state);
    assert.ok(trail.length >= 1, `${screen} has a trail`);
    const last = trail[trail.length - 1];
    assert.equal(last.href, undefined, `${screen}: the last crumb is where you are, so it is not a link`);
    assert.ok(last.label, `${screen}: the last crumb is labelled`);
    for (const item of trail.slice(0, -1)) {
      assert.ok(item.href, `${screen}: every earlier crumb links somewhere (${item.label})`);
      assert.ok(item.label, `${screen}: every earlier crumb is labelled`);
    }
  }

  /* The trail names the real session, not a generic one. */
  state.screen = 'question';
  const questionTrail = trailFor(data, state).map((c) => c.label);
  assert.deepEqual(questionTrail, ['Home', category.label, type.label, 'Question 1 of 4'], 'the question trail names the path taken');

  state.screen = 'walkthrough';
  state.experienceLevel = 'beginner';
  state.stepIndex = 0;
  const walkTrail = trailFor(data, state);
  assert.equal(walkTrail[walkTrail.length - 1].label, `Step 1 of ${WALKTHROUGH_STEPS.length}`, 'the walkthrough crumb counts real steps');
  assert.equal(walkTrail[0].href, '#/summary', 'and it hangs off the summary it was started from');

  state.screen = 'placeholder';
  state.mode = DESIGN_MODES[0].id;
  assert.equal(trailFor(data, state)[1].label, DESIGN_MODES[0].label, 'a placeholder names the mode it is about');

  /* The screen modules no longer build their own: that is what let the summary screen ship with no
   * trail at all and the walkthrough's start somewhere different from the question screen's. */
  for (const file of await walk(path.join(GUIDE_DIR, 'screens'))) {
    const source = await readFile(file, 'utf8');
    assert.ok(!/\bcrumbs\(/.test(source), `${path.basename(file)} builds its own trail again`);
  }
});

test('the palette is declared once, and both layers consume it', async () => {
  const shell = await readFile(path.join(PUBLIC_DIR, 'css', 'shell.css'), 'utf8');
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');

  /* 1.2.0 reconciled the palettes: the shell used to declare its own spec colours and the workspace
   * carried a second, Fortnite-derived set. There is one palette now, under the --ue-* names, and it
   * lives in tokens.css. These are its values - the library's neutrals, its white alphas, its accent,
   * 1.2.1's panel trio, and the two hue families the progress ramp runs between. */
  for (const colour of [
    '#101014', /* the canvas */
    '#18181C', /* an elevated, quiet surface: the footer band */
    '#202024', /* an elevated, raised surface: controls and wells */
    '#28282C', /* the box under the pointer, and what the store paints a current nav item with */
    '#1C1C20', /* 1.2.1: a panel, a card, a list row - at rest */
    '#343437', /* 1.2.1: and the subtle edge they all rest on */
    '#101014D9', /* the sticky material: the canvas at 85% */
    '#00000059', /* the inset scrim */
    '#FFFFFF', /* the headline white */
    '#FFFFFFF2', /* text, at 95% */
    '#FFFFFFBF', /* supporting text, at 75% */
    '#FFFFFFA6', /* the strong border's hover step */
    '#FFFFFF59', /* the accessible border step, and disabled text */
    '#FFFFFF26', /* a secondary control at rest */
    '#26BBFF', /* the accent */
    '#69D0FF', /* and its hover step */
    '#33BFFF', /* and its press step: the palette's blue-400 */
    '#868AFD', /* 1.2.1: the ramp's far end, the palette's indigo-400 */
    '#101014', /* the label the library puts on the accent */
    '#F7D82B' /* the warning hue */
  ]) {
    assert.ok(tokens.toUpperCase().includes(colour.toUpperCase()), `tokens.css declares ${colour} from the library`);
  }

  /* The Fortnite blueprint palette is retired, not merely unused: none of it may survive anywhere.
   * 1.2.1 retired the ramp's yellow as well - the progress bar runs between two published palette steps
   * now - so shell.css finally declares no colour of its own, and that is pinned rather than described. */
  const retired = ['#E2E2E3', '#C3C3C4', '#AEAEB0', '#3A3A3E', '#26262A', '#D2DA00', '#0A0A0D', '#F7FF19'];
  const shellHex = (shell.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toUpperCase());
  assert.deepEqual([...new Set(shellHex)], [], `shell.css declares no colour of its own: ${shellHex.join(', ')}`);
  for (const [name, source] of [['tokens.css', tokens], ['guide.css', guide], ['shell.css', shell]]) {
    for (const gone of retired) {
      assert.ok(
        !source.toUpperCase().includes(gone.toUpperCase()),
        `${name} still uses ${gone}, which 1.2.0 retired`
      );
    }
  }
  /* And so is the shell's own v2 palette, Panel Charcoal included. Its v1 navy and cyan are still gone. */
  for (const gone of ['#23253A', '#3A3D4D', '#B2B5C2', '#5B5B65', '#1e1e22', '#404043', '#0E1128', '#1CB0F6']) {
    for (const [name, source] of [['shell.css', shell], ['tokens.css', tokens], ['guide.css', guide]]) {
      assert.ok(!source.toUpperCase().includes(gone.toUpperCase()), `${name} still uses ${gone}`);
    }
  }

  /* The shell consumes the palette instead of declaring it, and keeps only its own geometry. */
  assert.match(shell, /--sh-primary:\s*var\(--ue-accent\)/, 'the shell takes the accent from the palette');
  assert.match(shell, /--sh-ink-on-primary:\s*var\(--ue-on-accent\)/, 'and the accent label with it');
  /* The footer's step is taken at 88% rather than whole, like every other surface, so the page's glow is not cut
   * off by a solid strip across the bottom. It still reads the palette's own step and still adds no colour of its
   * own, which is what this check is for - and the palette's step itself stays exactly as published. */
  assert.match(shell, /--sh-footer:\s*color-mix\(in srgb,\s*var\(--ue-elevated-low\)\s*88%,\s*transparent\)/, 'the footer is the palette\'s quiet surface, at the alpha the surfaces carry');
  assert.match(shell, /--sh-header-bg:\s*var\(--ue-canvas-header\)/, 'the header tint is the palette\'s canvas at 95%');
  assert.match(shell, /--sh-header-base:\s*72px/, 'and its geometry - the 72px bar - is decided here');

  /* The workspace's roles alias the same palette, which is what "reconciled" means in practice. */
  assert.match(tokens, /--fn-action:\s*var\(--ue-accent\)/, 'the workspace action is the palette accent');
  assert.match(tokens, /--fn-on-action:\s*var\(--ue-on-accent\)/, 'with the palette\'s label on it');
  assert.match(tokens, /--fn-text:\s*var\(--ue-text\)/, 'and its text steps are the library\'s');

  /* guide.css carries no raw colours at all: everything is a token. */
  const hex = guide.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `guide.css uses raw colours: ${hex.join(', ')}`);
});

/** The body of one CSS rule, for the pins below. */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} is declared`);
  return match[1];
}

test('the workspace stylesheet cannot reach into the shell', async () => {
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const shell = await readFile(path.join(PUBLIC_DIR, 'css', 'shell.css'), 'utf8');

  /* The bug this pins, found while landing 1.2.0: `body` carries the `g-app` class, so the workspace's
   * link rule `.g-app a` also matched the shell's header and footer links. It is one class more specific
   * than any of the shell's own link classes, so it won - and the Admin action's label, which the spec
   * and this suite both describe as the library's text colour, was painted in the workspace's muted one
   * instead. Loading order cannot beat a specificity gap; the selector has to be scoped. */
  /* The rule, not the mention: this test's own comment names the selector it forbids. */
  assert.ok(!/\.g-app\s+a\s*[,{]/.test(guide), 'the workspace styles its links by region, not by the body class');
  assert.match(guide, /\.g-main a\s*\{/, 'and the region is the app container');
  /* The shell answers with its own rules, and they are the ones that apply: nothing in the shell is
   * styled from the workspace's file, and the shell's controls state their own colours. */
  assert.match(shell, /\.sh-btn-secondary\s*\{[^}]*color:\s*var\(--sh-text\)/, 'the Admin control states its own label colour');
  assert.match(shell, /\.sh-footer-link\s*\{[^}]*color:\s*var\(--sh-gray\)/, 'and so do the footer links');
});

test('hover repaints an interactive surface by one library step, and controls do not lift', async () => {
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');

  /* The bug this test exists for: `button:hover` from the older stylesheet outranked the card rules and
   * repainted every choice card light cyan, with white label text on it.
   *
   * 1.2.0 changed the hover language from "an edge and a lift, never a fill" to the library's: an
   * interactive surface repaints its whole fill. So the fills are pinned instead - a hover may only paint
   * a documented hover token, never a colour of its own - which is what keeps a repaint from ever being a
   * colour nobody measured. */
  const allowedFills = [
    'var(--fn-surface-panel-hover)', /* an interactive surface, a tracker row, a quiet action: the box under the pointer */
    'var(--fn-surface-subtle-hover)', /* a secondary control: 15% -> 35% */
    'var(--fn-action-hover)' /* the accent: default -> hover */
  ];
  const blocks = guide.match(/[^{}]*:hover[^{}]*\{[^}]*\}/g) || [];
  assert.ok(blocks.length >= 6, `hover rules were found to check (got ${blocks.length})`);
  for (const block of blocks) {
    /* A disabled control is the one documented exception: it removes a lift, it does not paint one. */
    if (/:disabled|is-disabled/.test(block)) continue;
    for (const paint of block.match(/(?:^|[;{]\s*)background(?:-color)?\s*:\s*([^;}]+)/g) || []) {
      const value = paint.replace(/^[;{\s]*background(?:-color)?\s*:\s*/, '').trim();
      assert.ok(
        allowedFills.includes(value),
        `a hover rule paints ${value}, which is not a documented hover fill:\n${block.trim()}`
      );
    }
    assert.ok(
      /border-color|box-shadow|transform|color|opacity|text-decoration|background/.test(block),
      `a hover rule changes nothing visible:\n${block.trim()}`
    );
  }

  /* The surfaces you can act on repaint, lift, and strengthen their edge; a control repaints and stays put. */
  for (const selector of ['.g-choice:hover', '.g-option:hover', '.g-brandtile:hover']) {
    const body = ruleBody(guide, selector);
    assert.match(body, /background:\s*var\(--fn-surface-panel-hover\)/, `${selector} repaints its fill`);
    assert.match(body, /border-color:\s*var\(--fn-border-strong\)/, `${selector} strengthens its edge under the pointer`);
    assert.match(body, /translateY\(calc\(var\(--fn-lift\) \* -1\)\)/, `${selector} still lifts`);
  }
  const tracker = ruleBody(guide, '.g-tracker-link:hover');
  assert.match(tracker, /background:\s*var\(--fn-surface-panel-hover\)/, 'a tracker row steps up from the surface it sits on');
  assert.match(tracker, /translateY\(calc\(var\(--fn-lift\) \* -1\)\)/, 'and lifts with it');
  /* 1.2.1's card edge: the subtle step at rest, the accessible one on hover. That is the whole reason the
   * rest border is allowed to be a 1.5:1 value - it is never the only thing carrying the boundary, because
   * the pointer is what brings the strong one. */
  for (const selector of ['.g-choice', '.g-option', '.g-brandtile', '.g-tracker-link']) {
    assert.match(ruleBody(guide, selector), /border: 1px solid var\(--fn-border\)/, `${selector} rests on the subtle edge`);
  }

  for (const selector of ['.g-btn-primary:hover', '.g-btn-secondary:hover', '.g-btn-quiet:hover', '.g-btn-danger:hover']) {
    const body = ruleBody(guide, selector);
    assert.ok(
      !/transform|box-shadow/.test(body),
      `${selector} must not lift: a control brightens, it does not jump (1.2.0)`
    );
  }
  /* The primary action drops the hover border; the secondary keeps the library's brightness ramp. */
  const primaryHover = ruleBody(guide, '.g-btn-primary:hover');
  assert.match(primaryHover, /background:\s*var\(--fn-action-hover\)/, 'the primary action brightens on hover');
  assert.ok(!/border-color:\s*var\(--fn-(?!action\b)/.test(primaryHover), 'and no longer repaints a border to do it');
  assert.match(ruleBody(guide, '.g-btn-secondary'), /background:\s*var\(--fn-surface-subtle\)/, 'the secondary action rests at 15% white');
  assert.match(ruleBody(guide, '.g-btn-secondary:hover'), /background:\s*var\(--fn-surface-subtle-hover\)/, 'and brightens to 35%, the library\'s secondary step');

  /* A container is not an interactive surface: hovering a control inside a panel must not repaint the
   * panel, or the whole block flashes and claims to be clickable. */
  assert.ok(!/\.g-panel[^{]*:hover/.test(guide), 'a panel container does not repaint on hover');

  /* The lift itself, so "slightly more noticeable than a colour change" is a number. */
  assert.match(tokens, /--fn-lift:\s*3px/, 'the hover lift is defined');
  assert.match(tokens, /--fn-shadow-hover/, 'and comes with a shadow to read as raised');
  /* And the hover fills are the library's published steps, aliased rather than invented. */
  /* The alpha itself is the owner's to set, and it has already moved once (88% to 55%), so it is not pinned to a
   * number here: what is pinned is the shape - the role reads its palette step through a color-mix and names an
   * alpha - and the browser guard measures that the result really is translucent. */
  assert.match(tokens, /--fn-surface-panel-hover:\s*color-mix\(in srgb,\s*var\(--ue-surface-panel-hover\)\s*\d+%,\s*transparent\)/, 'the box hover is 1.2.1\'s panel step, at an alpha the surfaces carry');
  assert.match(tokens, /--ue-surface-panel:\s*#1C1C20/, 'and the box rests on 1.2.1\'s panel fill');
  /* None of that reaches the palette. The steps below stay the published, opaque values, and only the roles
   * mapped onto them carry an alpha - so "declared once, consumed by both layers" still means what it says. */
  assert.match(tokens, /--ue-surface-panel-hover:\s*#28282C/, 'the box hover step stays the published opaque value');
  assert.match(tokens, /--fn-surface-subtle-hover:\s*color-mix\(in srgb,\s*var\(--ue-fill-subtle-hover\)\s*\d+%,\s*transparent\)/, 'and the control hover is the published subtle step, at an alpha the surfaces carry');
  assert.match(tokens, /--fn-action-hover:\s*var\(--ue-accent-hover\)/, 'and the accent hover is the library\'s own');
});

test('the page follows the architecture spec it was rebuilt from', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const chrome = await readFile(path.join(GUIDE_DIR, 'chrome.js'), 'utf8');
  const app = await readFile(path.join(GUIDE_DIR, 'app.js'), 'utf8');

  /* v2 removes the hero, so the shell has no headings at all: every <h1> on the page belongs to the
   * screen the app is showing, and render/ui.js builds it. */
  assert.equal((html.match(/<h1/g) || []).length, 0, 'the shell has no heading of its own');
  assert.ok(!/sh-hero|heroTitle|Hero--Video|Hero--Fallback/.test(html), 'and no trace of the hero it removed');
  assert.match(html, /UEFN Game Guide<\/p>/, 'the app container names the guide');

  /* Load order is the cascade: the older shared chrome first, then the workspace, then the frame. */
  const order = ['css/styles.css', 'css/tokens.css', 'css/guide.css', 'css/shell.css'].map((href) =>
    html.indexOf(`href="${href}"`)
  );
  assert.ok(order.every((i) => i > -1), 'all four stylesheets are linked');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'and in the documented order');

  /* The header the spec describes: fixed, 72px in the stylesheet, and carrying exactly one navigation
   * item, the mark and one action. 1.2.0 removed the search field and the Dev mode toggle from it; 1.2.1
   * swapped the mark for the Epic logo and took the legacy pill class off it. */
  assert.match(html, /class="sh-header" id="siteHeader"/, 'a site header');
  assert.match(html, /class="sh-logo" href="#\/home"/, 'with the mark, which resets to the start');
  assert.match(html, /src="assets\/logo_epic\.svg"/, 'and it is the asset 1.2.1 names');
  assert.ok(
    !/class="logo-link/.test(html),
    'the app no longer carries the legacy class whose pill border and navy hover 1.2.1 removed'
  );
  assert.ok(!/navMore|navList/.test(html), 'and no overflow menu, because there is one nav item');
  const navItems = html.match(/class="sh-nav-link"/g) || [];
  assert.equal(navItems.length, 1, 'the navigation is a single item');
  assert.match(html, /class="sh-nav-link" href="#\/home">Home</, 'and the item is Home');
  assert.match(html, /id="appHead"/, 'the app container has its own header');
  assert.match(html, /src="js\/guide\/app\.js"/, 'and the app itself is one module');
  /* The search field is gone, markup and all - not hidden, and not left wired to a shortcut that would
   * focus nothing. */
  assert.ok(!/sh-search|searchInput|searchHint|searchPanel|sh-kbd|sh-break/.test(html), 'the search field left with its markup');
  /* chrome.js is allowed to say in a comment that the field once existed; what may not survive is the
   * wiring: the module, the field lookup, and the Ctrl/Cmd-K shortcut that focused it. */
  assert.ok(!/wireSearch|searchInput|searchPanel/.test(chrome), 'and its wiring left with it');
  assert.ok(!/ctrlKey \|\| event\.metaKey/.test(chrome), 'and so did the shortcut that focused it');
  assert.ok(!/wireSearch/.test(app), 'and the app no longer wires it');

  /* The header's one action is Admin, and as of 1.2.0 it is the library's secondary control: a
   * translucent fill, the library's default text colour, and no icon. */
  assert.match(html, /class="sh-btn sh-btn-secondary sh-btn-admin" href="admin\.html"/, 'Admin is the secondary action');
  assert.ok(!/admin-logo\.svg/.test(html), 'and it carries no icon');
  const shell = await readFile(path.join(PUBLIC_DIR, 'css', 'shell.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');
  assert.match(shell, /--sh-primary:\s*var\(--ue-accent\)/, 'the accent is the palette\'s');
  assert.match(shell, /--sh-ink-on-primary:\s*var\(--ue-on-accent\)/, 'and its label is the palette\'s dark ink');
  assert.match(shell, /--sh-header-bg:\s*var\(--ue-canvas-header\)/, 'the header is the canvas at 90%');
  /* And the palette holds that exact value, because the spec names it and a serialisation is not a
   * colour: the check below fails if it drifts by a single alpha step. 1.2.2 eased the tint from 95% to
   * 90%, so the header's new backdrop blur has something to blur. */
  assert.match(tokens, /--ue-canvas-header:\s*rgba\(16, 16, 20, 0\.90\)/, 'the 90% canvas tint is declared once, in the palette');
  /* 1.2.2: one blur, shared by the fixed header and the sticky app bar. Two copies of an effect are two
   * effects waiting to drift apart. */
  assert.match(shell, /--sh-blur:\s*blur\(12px\)/, 'the frame has one frosted depth');
  assert.match(shell, /backdrop-filter:\s*var\(--sh-blur\)/, 'the header frosts like the app bar');
  assert.match(shell, /position:\s*fixed/, 'the header is fixed');
  /* The header's own height is a minimum, and the page offset is a separate variable that chrome.js
   * publishes the measured height into. They are deliberately not the same property: a header sized
   * from the variable that holds its own measurement pins that measurement. */
  assert.match(shell, /--sh-header-base:\s*72px/, 'and 72px tall');
  /* The progress ramp runs between the palette's blue and indigo steps as of 1.2.1, replacing Forge's own
   * cyan-to-yellow: two published families, aliased, so the shell still declares no colour of its own. */
  assert.match(shell, /--sh-progress-from:\s*var\(--ue-palette-blue-400\)/, 'the ramp starts on the palette\'s blue');
  assert.match(shell, /--sh-progress-to:\s*var\(--ue-palette-indigo-400\)/, 'and ends on its indigo');
  assert.match(tokens, /--ue-palette-blue-400:\s*#33BFFF/, 'both of which the palette declares');
  assert.match(tokens, /--ue-palette-indigo-400:\s*#868AFD/, 'at the weight the library publishes them at');
  /* The mark's hover. 1.2.1 gave it a translucent wash; 1.2.2 took the box away and made the mark change
   * its own shade, because a wash on a 44px square reads as a grey button appearing under the pointer.
   * So the hover must paint nothing of its own at all, and it must not draw an edge in any state. */
  const logo = ruleBody(shell, '.sh-logo');
  assert.match(logo, /border:\s*0/, 'the mark has no border to begin with');
  const logoHover = ruleBody(shell, '.sh-logo:hover img');
  assert.match(logoHover, /opacity:\s*0\.8/, 'the mark answers the pointer by changing its own shade');
  assert.ok(!/background/.test(logoHover), 'and not by painting a box behind itself');
  assert.ok(
    !/--sh-logo-hover/.test(shell),
    'the wash token went with it, so nothing can quietly reinstate the box'
  );
  assert.ok(!/\.sh-logo:hover[^{]*\{[^}]*border/.test(shell), 'never by drawing an outline');
  /* 1.2.1 split the control heights: the header's controls are 32px, the body's 40px. */
  assert.match(ruleBody(shell, '.sh-btn'), /height:\s*32px/, 'a navigation CTA is 32px');
  const guideCss = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  assert.match(ruleBody(guideCss, '.g-btn'), /min-height:\s*40px/, 'and a body CTA is 40px');
  /* 1.2.2: the published container radius for boxes, the library's control radius for controls. Applied
   * to the tokens, because that is the only place a radius is decided - and to the selected states, which
   * must wear a 1px edge like every other box rather than growing a heavier one. */
  assert.match(tokens, /--fn-radius-card:\s*16px/, 'a box takes the published 16px container radius');
  assert.match(tokens, /--fn-radius-button:\s*8px/, 'a control keeps the library\'s 8px');
  assert.match(
    ruleBody(guideCss, '.g-choice.is-selected'),
    /border-width:\s*1px/,
    'a chosen card wears a 1px edge, not a 2px one'
  );
  assert.match(ruleBody(guideCss, '.g-brandtile.is-chosen'), /border-width:\s*1px/, 'and so does a chosen brand');
  assert.match(
    ruleBody(guideCss, '.g-tracker-item.is-current .g-tracker-link'),
    /border-width:\s*1px/,
    'and so does the current tracker row'
  );
  assert.ok(
    !/border-width:\s*2px/.test(guideCss.replace(/\/\*[\s\S]*?\*\//g, '')),
    'no selected box grew back to 2px'
  );
  /* The sticky app header is borderless and translucent as of 1.2.0: no rules above or below. */
  const appHead = ruleBody(shell, '.sh-app-head');
  assert.match(appHead, /border:\s*0/, 'the app container\'s sticky header carries no border');
  assert.ok(!/\d+px solid/.test(appHead), 'and no rule above or below it in its place');
  /* Its material is conditional now. The owner asked for the bar to be transparent over the top of the page, so
   * the artwork and the page's glow run to the top of the window uninterrupted, and to take the canvas material
   * only once the page has scrolled under it. Both halves are asserted - the resting rule and the state that
   * switches it - because a bar that never takes its material is as wrong as one that never lets the page show
   * through. The site header above it is the opposite case and stays tinted at all times. */
  assert.match(appHead, /background:\s*transparent/, 'and is transparent over the top of the page');
  assert.match(
    ruleBody(shell, '.sh-app-head.is-scrolled'),
    /background:\s*var\(--sh-material\)/,
    'and is painted with the canvas material once the page has scrolled, so content reads through it'
  );

  /* The footer is the utility bar, and only that: the status, and the two ways out. Dev mode moved
   * here from the header in 1.2.0. */
  const footerAt = html.indexOf('<footer class="sh-footer">');
  assert.ok(footerAt > -1, 'there is a utility footer');
  assert.ok(html.indexOf('id="devModeButton"') > footerAt, 'and Dev mode lives inside it now');
  assert.match(html, /class="sh-footer-link sh-footer-admin" href="admin\.html">Go to admin page</, 'with the admin link beside it');
  /* Nothing of the old footer content is left: no second navigation, and no guide credits. */
  assert.ok(!/class="sh-nav"/.test(html.slice(footerAt)), 'the footer carries no navigation of its own');

  /* The header height is measured, not assumed: the page offsets itself by it and the app's sticky bar
   * positions itself from it. */
  assert.match(chrome, /ResizeObserver/, 'the header height is measured');
  assert.match(app, /measureHeader/, 'and published for the layout to use');
  assert.ok(!/wirePriorityNav|wireHeroVideo/.test(chrome + app), 'the priority+ nav and hero video are gone with the hero');
});

test('every wizard screen carries a visible way back, and home does not', async () => {
  const dir = path.join(GUIDE_DIR, 'screens');
  const screens = await readdir(dir);
  const withBack = [];
  for (const file of screens.filter((f) => f.endsWith('.js'))) {
    /* A step's way back is either the shared previousStep() affordance or a button that calls
     * actions.back() - the stub screens walk back with go({screen:'home'}) instead, which is still a
     * way back. What matters is that the screen builds one.
     *
     * The check reads the screen's own module *and the guide modules it imports*, because the summary
     * has two layouts now and they share one Back row in render/summary-parts.js. Following the real
     * imports keeps the question the test was always asking - does this screen have a way back? - as
     * opposed to where in the module tree the string happens to be written. It is also stricter than
     * reading one file: a screen that imports its Back row from shared furniture still has to reach a
     * module that actually builds one. */
    const sources = await moduleSources(path.join(dir, file));
    const combined = [...sources.values()].join('\n');
    if (/actions\.back\(\)/.test(combined) || /label: '(←\s*)?Back/.test(combined)) withBack.push(file.replace('.js', ''));
  }
  for (const screen of ['category', 'gametype', 'question', 'brand', 'restriction', 'summary', 'experience', 'walkthrough', 'placeholder']) {
    assert.ok(withBack.includes(screen), `the ${screen} screen has no Back control`);
  }
  assert.ok(!withBack.includes('home'), 'home has no Back control, because there is nothing before it');
});

test('every brand hero the data names is on disk, with the exact case it is spelled with', async () => {
  /* A Windows filesystem is case-insensitive and the deployment is not, so a file named TMNT_hero.jpg
   * resolves in development and 404s in the container. The check is on the real directory entry. */
  const dataPath = path.join(PUBLIC_DIR, 'data', 'uefn_device_logic.json');
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  const dir = path.join(PUBLIC_DIR, 'images', 'brands');
  const entries = await readdir(dir).catch(() => []);
  const missing = [];
  for (const brand of data.brand_templates) {
    const rel = brand.images && brand.images.hero;
    if (!rel) continue;
    const name = path.basename(rel);
    if (!entries.includes(name)) missing.push(`${brand.id}: ${name}`);
  }
  assert.deepEqual(missing, [], `brand art is named differently on disk:\n  ${missing.join('\n  ')}`);
});

test('every asset the page promises is on disk', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:src|href|poster)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  /* v2 removes the hero, so the shell references its two marks and the favicon rather than a poster, a
   * video and a logo. What is asserted is that nothing it references is missing. */
  assert.ok(referenced.length >= 2, 'the page references its own assets');
  for (const rel of new Set(referenced)) {
    const full = path.join(PUBLIC_DIR, rel);
    const info = await stat(full).catch(() => null);
    assert.ok(info && info.size > 0, `${rel} is missing or empty`);
  }
});



/* ------------------------------ helpers ------------------------------ */

/**
 * A module's own source, plus the source of every relative import it reaches inside js/guide.
 *
 * Used by the checks that ask a question about a screen rather than about a file — "does this screen
 * have a way back?" — where the answer may be assembled from shared furniture in the render/ folder.
 * Only paths under js/guide are followed, so the walk stays inside the app.
 */
async function moduleSources(entry, seen = new Map()) {
  if (seen.has(entry)) return seen;
  let source;
  try {
    source = await readFile(entry, 'utf8');
  } catch {
    return seen;
  }
  seen.set(entry, source);
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = path.resolve(path.dirname(entry), match[1]);
    if (target.startsWith(GUIDE_DIR)) await moduleSources(target, seen);
  }
  return seen;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
