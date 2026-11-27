/**
 * The gate runner for `support/gdd-template.json`.
 *
 * A template that is only prose is a wish. The part of this design that has to actually hold is the
 * gate list, because the failure mode with a model in the loop is not a bad sentence — it is a document
 * that reads well, is wrong in three places, and gives a reader no way to tell which three. Every gate
 * below is a check that can fail loudly on a finished draft, and each one names the failure it exists to
 * catch rather than the rule it enforces.
 *
 * Usage:
 *   node tools/gdds/template.mjs --self-test      # run the gates against the template's own example
 *   node tools/gdds/template.mjs --check <file>   # gate a generated draft
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = path.resolve(HERE, '..', '..', 'support', 'gdd-template.json');

export function loadTemplate(file = TEMPLATE_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Which slots a structure includes, by id prefix or exact id. */
export function slotsForStructure(template, structureId) {
  const structure = template.structures[structureId];
  if (!structure) throw new Error(`template: unknown structure ${structureId}`);
  const wanted = (id) => structure.includes.some((p) => p === id || (p.endsWith('.*') && id.startsWith(p.slice(0, -1))));
  const excluded = (id) => (structure.excludes || []).some((p) => p === id || (p.endsWith('.*') && id.startsWith(p.slice(0, -1))));
  return template.slots.filter((slot) => wanted(slot.id) && !excluded(slot.id));
}

/* -------------------------------------- the gates -------------------------------------- */

/** Words in a string, counting runs of non-space. */
const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

/** Every integer that appears in a string, as strings, so `2–4` yields `2` and `4`. */
const numbersIn = (text) => (String(text || '').match(/\d+/g) || []).map((n) => String(Number(n)));

function gateNoNumbersInProse(template, draft) {
  const problems = [];
  /* What the derived slots state. This is the set prose is not allowed to repeat. */
  const derivedNumbers = new Set();
  for (const slot of template.slots) {
    if (slot.source !== 'derived') continue;
    for (const n of numbersIn(draft.slots?.[slot.id]?.text)) derivedNumbers.add(n);
  }
  /* Counts the resolution produces, which are derived whatever the template says. */
  for (const n of numbersIn(JSON.stringify(draft.counts || {}))) derivedNumbers.add(n);

  for (const slot of template.slots) {
    if (slot.source !== 'proposed') continue;
    const text = draft.slots?.[slot.id]?.text;
    if (!text) continue;
    for (const n of numbersIn(text)) {
      if (derivedNumbers.has(n)) {
        problems.push({
          gate: 'no-numbers-in-prose',
          slot: slot.id,
          detail: `"${slot.id}" states ${n}, which a derived slot already holds — two sources for one number`
        });
      }
    }
  }
  return problems;
}

function gateProvenancePresent(template, draft) {
  const problems = [];
  for (const slot of template.slots) {
    if (slot.source !== 'proposed') continue;
    const entry = draft.slots?.[slot.id];
    if (!entry || !entry.text) continue;
    if (!Array.isArray(entry.because) || entry.because.length === 0) {
      problems.push({
        gate: 'provenance-present',
        slot: slot.id,
        detail: `"${slot.id}" is a draft with nothing recorded about what it was drafted from`
      });
    }
  }
  return problems;
}

function gateDraftMarked(template, draft) {
  const problems = [];
  for (const slot of template.slots) {
    if (slot.source !== 'proposed') continue;
    const entry = draft.slots?.[slot.id];
    if (!entry || !entry.text) continue;
    if (entry.state !== 'draft') {
      problems.push({
        gate: 'draft-marked',
        slot: slot.id,
        detail: `"${slot.id}" is proposed but its state is ${JSON.stringify(entry.state)}, not "draft"`
      });
    }
  }
  return problems;
}

function gateWordBudget(template, draft) {
  const problems = [];
  for (const slot of template.slots) {
    if (!slot.maxWords) continue;
    const text = draft.slots?.[slot.id]?.text;
    if (!text) continue;
    const count = words(text).length;
    if (count > slot.maxWords) {
      problems.push({
        gate: 'word-budget',
        slot: slot.id,
        detail: `"${slot.id}" is ${count} words against a budget of ${slot.maxWords}`
      });
    }
  }
  return problems;
}

function gateMustNot(template, draft) {
  const problems = [];
  for (const slot of template.slots) {
    const text = draft.slots?.[slot.id]?.text;
    if (!text || !slot.mustNot) continue;
    const lower = String(text).toLowerCase();
    for (const phrase of slot.mustNot) {
      if (lower.includes(String(phrase).toLowerCase())) {
        problems.push({
          gate: 'must-not',
          slot: slot.id,
          detail: `"${slot.id}" contains the forbidden phrase ${JSON.stringify(phrase)}`
        });
      }
    }
  }
  return problems;
}

function gateAuthoredUntouched(template, draft) {
  const problems = [];
  for (const slot of template.slots) {
    if (slot.source !== 'authored') continue;
    const entry = draft.slots?.[slot.id];
    if (!entry) continue;
    /* `awaiting-you` with no text is the correct state. Anything else means something wrote in it. */
    if (entry.text && entry.state !== 'human') {
      problems.push({
        gate: 'authored-untouched',
        slot: slot.id,
        detail: `"${slot.id}" is the reader's to write and it has content contributed by something else`
      });
    }
  }
  return problems;
}

export const GATES = [
  gateAuthoredUntouched,
  gateNoNumbersInProse,
  gateProvenancePresent,
  gateDraftMarked,
  gateWordBudget,
  gateMustNot
];

/**
 * Run every gate. Returns the problems rather than throwing, because the useful behaviour on a failing
 * draft is to show the author which slots to fix and let them keep the rest.
 */
export function checkDraft(template, draft) {
  return GATES.flatMap((gate) => gate(template, draft));
}

/* -------------------------------------- self test -------------------------------------- */

function selfTest() {
  const template = loadTemplate();
  let failures = 0;

  const report = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  };

  console.log('template shape');
  report('has slots', Array.isArray(template.slots) && template.slots.length > 0, `${template.slots?.length} slots`);
  const ids = (template.slots || []).map((s) => s.id);
  report('slot ids are unique', new Set(ids).size === ids.length);
  const sources = new Set(Object.keys(template.sources || {}));
  const badSource = (template.slots || []).find((s) => !sources.has(s.source));
  report('every slot names a known source', !badSource, badSource ? badSource.id : '');
  const noBecause = (template.slots || []).find((s) => s.source === 'proposed' && !s.because);
  report('every proposed slot says why it is proposed', !noBecause, noBecause ? noBecause.id : '');
  const authoredWithBecause = (template.slots || []).find((s) => s.source === 'authored' && !s.prompt);
  report('every authored slot poses a question', !authoredWithBecause, authoredWithBecause ? authoredWithBecause.id : '');

  console.log('\nstructures');
  for (const id of Object.keys(template.structures || {})) {
    const slots = slotsForStructure(template, id);
    const proposed = slots.filter((s) => s.source === 'proposed').length;
    const authored = slots.filter((s) => s.source === 'authored').length;
    report(
      `${id} resolves to slots`,
      slots.length > 0,
      `${slots.length} slots: ${slots.length - proposed - authored} derived, ${proposed} proposed, ${authored} authored`
    );
  }

  console.log('\nthe gates, against the template’s own example');
  const example = template.worked_example;
  const clean = checkDraft(template, example);
  report('the worked example passes every gate', clean.length === 0, clean.map((p) => p.detail).join('; '));

  /* And that each gate can actually fail. A gate that cannot fail is decoration.
   *
   * The cases are built from the template rather than written out by hand, because a hand-written case
   * names a slot id, and a slot id in a test is a second place the template is written down. Two of
   * these cases were silently testing nothing for exactly that reason: one put a forbidden phrase in a
   * slot that has no `mustNot` list, and one put digits in prose when the only derived numbers on hand
   * did not collide with them. Both reported "the gate is not checking anything" when the gate was
   * fine. Deriving the case from the slot's own field removes the whole class. */
  console.log('\neach gate fires when it should');
  const proposed = (template.slots || []).filter((s) => s.source === 'proposed');
  const first = proposed[0];
  const withMustNot = (template.slots || []).find((s) => s.mustNot && s.mustNot.length);
  const authored = (template.slots || []).find((s) => s.source === 'authored');
  const budgeted = proposed.find((s) => s.maxWords);
  let derivedNumber = null;
  for (const slot of template.slots || []) {
    if (slot.source !== 'derived') continue;
    const n = numbersIn(template.worked_example?.slots?.[slot.id]?.text)[0];
    if (n) {
      derivedNumber = n;
      break;
    }
  }
  /* The counts are always derived, whatever the template says, so `13` is a safe collision to test. */
  const collisionNumber = derivedNumber || '13';

  const cases = [
    ['authored-untouched', authored && { slots: { [authored.id]: { state: 'draft', text: 'Filled in by something that is not the reader.' } } }],
    [
      'no-numbers-in-prose',
      first && { slots: { [first.id]: { state: 'draft', because: ['x'], text: `It takes ${collisionNumber} minutes.` } }, counts: { devices: Number(collisionNumber) } }
    ],
    ['provenance-present', first && { slots: { [first.id]: { state: 'draft', text: 'Something creeps.' } } }],
    ['draft-marked', first && { slots: { [first.id]: { state: 'final', text: 'Something creeps.', because: ['x'] } } }],
    [
      'word-budget',
      budgeted && {
        slots: { [budgeted.id]: { state: 'draft', because: ['x'], text: Array.from({ length: budgeted.maxWords + 20 }, () => 'word').join(' ') } }
      }
    ],
    ['must-not', withMustNot && { slots: { [withMustNot.id]: { state: 'draft', because: ['x'], text: `It is ${withMustNot.mustNot[0]}.` } } }]
  ].filter(([, draft]) => draft);

  for (const [expected, draft] of cases) {
    const problems = checkDraft(template, { slots: {}, ...draft });
    const fired = problems.some((p) => p.gate === expected);
    report(`${expected} fires`, fired, fired ? '' : 'gate did not fire — it is not checking anything');
  }
  report(
    'every gate in the list has a case',
    cases.length === GATES.length,
    `${cases.length} cases for ${GATES.length} gates — add one for any gate that has no case`
  );

  console.log(`\n${failures === 0 ? 'template is consistent and every gate is live' : `${failures} problem(s)`}`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const file = args[args.indexOf('--check') + 1];
    const template = loadTemplate();
    const draft = JSON.parse(readFileSync(file, 'utf8'));
    const problems = checkDraft(template, draft);
    if (!problems.length) {
      console.log('draft passes every gate');
    } else {
      for (const p of problems) console.log(`  ${p.gate}  ${p.detail}`);
      console.log(`\n${problems.length} problem(s)`);
    }
    process.exit(problems.length ? 1 : 0);
  }
  process.exit(selfTest());
}
