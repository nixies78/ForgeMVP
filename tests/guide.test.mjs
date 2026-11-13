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
import { createStore, memoryStorage, MAX_SAVED, SCHEMA, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../public/js/guide/store.js';
import { parseShare, buildShare } from '../public/js/guide/share.js';
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
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /href="chat\.html"/, 'the guide links to the working chat page');
  assert.match(html, /data\/uefn_device_logic\.json/, 'and exposes the data file for anyone without JavaScript');
});

test('the guide stays reachable without dev mode, and dev mode stays discoverable', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /id="devModeButton"[^>]*aria-pressed="false"/, 'the control is in the markup, not hidden behind a query param');
  assert.match(html, /id="devModeState"/, 'and it states its own on/off value, so colour is not the only signal');
  const app = await readFile(path.join(GUIDE_DIR, 'app.js'), 'utf8');
  assert.match(app, /devFromQuery/, 'and ?dev=1 still works for a shared link');
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

test('the shell palette and the workspace palette never mix', async () => {
  const shell = await readFile(path.join(PUBLIC_DIR, 'css', 'shell.css'), 'utf8');
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');

  /* The spec's palette, declared once, in the shell stylesheet. */
  for (const colour of ['#0E1128', '#18181C', '#23253A', '#3A3D4D', '#1CB0F6', '#26BBFF', '#F7FF19', '#B2B5C2']) {
    assert.ok(shell.includes(colour.toUpperCase()), `shell.css declares ${colour} from the architecture spec`);
  }

  /* And nowhere else. The two palettes do overlap in two values — #18181C and #F7FF19 are in both, which
   * is unsurprising given where both come from — but every hue unique to the shell must stay out of the
   * workspace, and cyan above all: nothing inside the container is allowed to use it. */
  for (const [name, source] of [['guide.css', guide], ['tokens.css', tokens]]) {
    for (const shellOnly of ['#1CB0F6', '#26BBFF', '#0E1128', '#23253A', '#3A3D4D', '#1e1e22', '#404043', '#5B5B65']) {
      assert.ok(
        !source.toLowerCase().includes(shellOnly.toLowerCase()),
        `${name} uses ${shellOnly}, which belongs to the shell`
      );
    }
  }

  /* guide.css carries no raw colours at all: everything is a token. */
  const hex = guide.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `guide.css uses raw colours: ${hex.join(', ')}`);
});

test('hover changes an edge and a lift, never a fill', async () => {
  const guide = await readFile(path.join(PUBLIC_DIR, 'css', 'guide.css'), 'utf8');
  const tokens = await readFile(path.join(PUBLIC_DIR, 'css', 'tokens.css'), 'utf8');

  /* The bug this pins: `button:hover` from the older stylesheet outranked the card rules and repainted
   * every choice card a light cyan, with white label text on it. The fix is the rule below, so the rule
   * is asserted rather than trusted. */
  const blocks = guide.match(/[^{}]*:hover[^{}]*\{[^}]*\}/g) || [];
  assert.ok(blocks.length >= 6, `hover rules were found to check (got ${blocks.length})`);
  for (const block of blocks) {
    /* A disabled control is the one documented exception: it removes a lift, it does not paint one. */
    if (/:disabled|is-disabled/.test(block)) continue;
    const paints = block.match(/(^|[;{]\s*)background(-color)?\s*:/g) || [];
    assert.deepEqual(paints, [], `a hover rule repaints a fill:\n${block.trim()}`);
    assert.ok(
      /border-color|box-shadow|transform|color|opacity|text-decoration/.test(block),
      `a hover rule changes nothing visible:\n${block.trim()}`
    );
  }

  /* The lift itself, so "slightly more noticeable than a colour change" is a number. */
  assert.match(tokens, /--fn-lift:\s*3px/, 'the hover lift is defined');
  assert.match(tokens, /--fn-shadow-hover/, 'and comes with a shadow to read as raised');
  assert.ok(!/--fn-action-hover|--fn-surface-card-hover/.test(tokens), 'the old hover fills are gone, not left to rot');
});

test('the page follows the architecture spec it was rebuilt from', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const chrome = await readFile(path.join(GUIDE_DIR, 'chrome.js'), 'utf8');

  /* One <h1>, in the hero, and the app container is labelled rather than headed. */
  assert.equal((html.match(/<h1/g) || []).length, 1, 'a page has exactly one h1');
  assert.match(html, /<h1 class="sh-hero-title" id="heroTitle">Forge<\/h1>/, 'the hero owns it');
  assert.match(html, /<h2 class="sh-hero-sub">THINK, DESIGN, BUILD\.<\/h2>/, 'with the spec\'s strapline under it');
  assert.match(html, /UEFN Game Guide<\/p>/, 'and the app container names the guide');

  /* Load order is the cascade: the older shared chrome first, then the workspace, then the frame. */
  const order = ['css/styles.css', 'css/tokens.css', 'css/guide.css', 'css/shell.css'].map((href) =>
    html.indexOf(`href="${href}"`)
  );
  assert.ok(order.every((i) => i > -1), 'all four stylesheets are linked');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'and in the documented order');

  /* The header, the hero and the container the spec describes. */
  assert.match(html, /class="sh-header" id="siteHeader"/, 'a sticky site header');
  assert.match(html, /id="navMoreWrap" hidden/, 'with a More menu for the collapsed items');
  assert.match(html, /id="appHead"/, 'the app container has its own header');
  assert.match(html, /src="js\/guide\/app\.js"/, 'and the app itself is one module');
  assert.match(html, /poster="assets\/Hero--Fallback\.png"/, 'the hero video has a still behind it');
  assert.match(html, /<source src="assets\/Hero--Video\.mp4"/, 'and the video itself');

  /* The spec asks for a resize observer rather than breakpoints for the priority+ navigation. */
  assert.match(chrome, /ResizeObserver/, 'the navigation collapses by measurement');

  /* The search field says it is not built yet instead of doing nothing quietly. */
  assert.match(chrome, /not built yet/i, 'the search field is honest about being unbuilt');
  assert.match(chrome, /ctrlKey \|\| event\.metaKey/, 'and Ctrl/Cmd+K focuses it');
});

test('every asset the page promises is on disk', async () => {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:src|href|poster)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(referenced.length >= 4, 'the page references its own assets');
  for (const rel of new Set(referenced)) {
    const full = path.join(PUBLIC_DIR, rel);
    const info = await stat(full).catch(() => null);
    assert.ok(info && info.size > 0, `${rel} is missing or empty`);
  }
});



/* ------------------------------ helpers ------------------------------ */

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
