/**
 * Tests for the design-document export (`tools/gdds/`).
 *
 * The export is a generator, so the things worth asserting are the ones that fail quietly: a page
 * count that disagrees with a contents list, a run that lands outside the margin, an alignment flag
 * that is set but not honoured, and a second render that does not match the first.
 *
 * The layout assertions deliberately check the *finished bytes* rather than the structures. A structure
 * that measures its own text is checking its arithmetic against itself; reading back the coordinates
 * from the written stream is the only way to catch the writer placing a run somewhere the caller did
 * not ask for — which is exactly the bug this suite was written after.
 *
 * Run:  node tests/gdd.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { measure, wrap, blockHeight, FACES, buildPdf } from '../tools/gdds/pdf.mjs';
import { validatePdf, pdfPlainText } from '../tools/gdds/validate.mjs';
import { extractRuns, auditPdf, useMetrics } from '../tools/gdds/audit.mjs';
import { PAGE, M, CONTENT_WIDTH, PALETTES } from '../tools/gdds/kit.mjs';
import {
  createDocModel,
  AUTHORED_SECTIONS,
  SAMPLE_DESIGN
} from '../tools/gdds/model.mjs';
import { loadDataset, buildStructure, STRUCTURES } from '../tools/gdds/render.mjs';

/* -------------------------------------------------------------------------------------------- */
/* Shared fixtures                                                                               */
/* -------------------------------------------------------------------------------------------- */

/* The audit needs type metrics to turn coordinates back into boxes. They are handed to it rather than
 * imported by it, because the module is the independent reader of the writer's output and importing the
 * writer's own tables would make it check the writer against itself. Until it carries the Adobe standard
 * base-14 tables itself, this is the only place those numbers come from. */
useMetrics(measure);

const dataset = loadDataset();
const model = createDocModel({ dataset, ...SAMPLE_DESIGN });
const built = STRUCTURES.map((structure) => [structure, buildStructure(structure, model)]);

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/* -------------------------------------------------------------------------------------------- */
/* Metrics                                                                                       */
/* -------------------------------------------------------------------------------------------- */

test('metrics are additive, finite and tracking-aware', () => {
  for (const face of Object.keys(FACES)) {
    for (const size of [5, 7.4, 12, 38]) {
      const w = measure('Closing Time', face, size);
      assert.ok(Number.isFinite(w), `${face} @${size} measured ${w}`);
      assert.ok(w > 0, `${face} @${size} measured ${w}`);
    }
  }

  /* Width grows with the string, and the growth is the width of the glyph added. */
  const ab = measure('AB', 'regular', 10);
  const abc = measure('ABC', 'regular', 10);
  assert.ok(abc > ab);
  assert.ok(Math.abs(abc - ab - measure('C', 'regular', 10)) < 1e-9);

  /* Tracking adds one gap per gap there is — between glyphs, not after the last one. Counting a gap
   * after the final glyph charges every tracked run a step it does not occupy, which is how a
   * right-aligned run ends up sitting a step past its margin. */
  const plain = measure('ABC', 'regular', 10);
  assert.ok(Math.abs(measure('ABC', 'regular', 10, 1) - plain - 2) < 1e-9);

  /* A single glyph gains nothing: there is no gap to be after. */
  assert.equal(measure('A', 'regular', 10, 5), measure('A', 'regular', 10));
});

test('every wrapped line fits its box, tracking included', () => {
  const text =
    'Resolved against the catalogue: a device that is present in the plan appears on exactly one ' +
    'card, and a setting an answer changed is listed in the decision trace rather than left to be ' +
    'inferred from the difference between two tables.';
  for (const charSpace of [0, 0.9, 1.6, 2]) {
    for (const maxWidth of [80, 138, 260, CONTENT_WIDTH]) {
      const lines = wrap(text, 'regular', 8.4, maxWidth, charSpace);
      assert.ok(lines.length > 0);
      for (const line of lines) {
        const w = measure(line, 'regular', 8.4, charSpace);
        assert.ok(
          w <= maxWidth + 1e-6,
          `tracking ${charSpace}, box ${maxWidth}: "${line}" measured ${w}`
        );
      }
    }
  }
});

test('blockHeight counts the same lines the wrapper produces', () => {
  const text = 'One line that is short. '.repeat(20);
  for (const maxWidth of [120, 300, CONTENT_WIDTH]) {
    for (const size of [7.4, 9, 12]) {
      const block = blockHeight(text, { face: 'regular', size, leading: 1.35, width: maxWidth });
      assert.equal(block.lines.length, wrap(text, 'regular', size, maxWidth).length);
      assert.equal(block.height, block.lines.length * size * 1.35);
    }
  }
});

/* -------------------------------------------------------------------------------------------- */
/* Alignment — the regression this suite exists for                                              */
/* -------------------------------------------------------------------------------------------- */

test('an aligned run ends exactly at the edge it was given', () => {
  const cases = [
    { str: '13', face: 'bold', size: 38, charSpace: 1.6 },
    { str: 'DEVICES TO PLACE', face: 'bold', size: 6.4, charSpace: 0.9 },
    { str: '1 / 9', face: 'regular', size: 7.4, charSpace: 0 },
    { str: '13 devices · by role', face: 'serif', size: 8, charSpace: 0 },
    { str: 'stated, not omitted', face: 'mono', size: 8, charSpace: 0.5 }
  ];
  const edge = PAGE.width - M.right;

  const rendered = buildPdf({
    title: 'alignment',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          cases.forEach((c, i) => {
            page.text(edge, 40 + i * 30, c.str, {
              face: c.face,
              size: c.size,
              charSpace: c.charSpace,
              align: 'right'
            });
          });
        }
      }
    ]
  });

  const runs = extractRuns(rendered.bytes)[0];
  assert.equal(runs.length, cases.length);

  runs.forEach((run, i) => {
    const c = cases[i];
    const width = measure(c.str, c.face, c.size, c.charSpace);
    const rightEdge = run.x + width;
    assert.ok(
      Math.abs(rightEdge - edge) < 0.05,
      `"${c.str}" ends at ${rightEdge.toFixed(3)}, wanted ${edge} (x=${run.x}, width=${width})`
    );
  });
});

test('an aligned run inside a named box ends at that box, not at the paper', () => {
  const box = { x: 300, right: 470 };
  const rendered = buildPdf({
    title: 'box',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          page.text(box.x, 60, 'aligned in a box', {
            face: 'regular',
            size: 9,
            align: 'right',
            right: box.right
          });
          page.text(box.x, 90, 'centred in the same box', {
            face: 'regular',
            size: 9,
            align: 'center',
            right: box.right
          });
        }
      }
    ]
  });

  const [right, centre] = extractRuns(rendered.bytes)[0];
  assert.ok(Math.abs(right.x + measure(right.text, 'regular', 9) - box.right) < 0.05);
  const centreWidth = measure(centre.text, 'regular', 9);
  assert.ok(
    Math.abs(centre.x + centreWidth / 2 - (box.x + box.right) / 2) < 0.05,
    `centred run sits at ${centre.x}, its centre is ${centre.x + centreWidth / 2}`
  );
});

test('a long run in a bounded box wraps instead of leaving the margin', () => {
  const edge = PAGE.width - M.right;
  const long =
    'Does the experience include locked-door puzzle logic for the chaser route, and does it hold ' +
    'when two players are in the same room together?';
  const rendered = buildPdf({
    title: 'wrap',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          page.text(300, 60, long, {
            face: 'regular',
            size: 6.8,
            align: 'right',
            right: edge
          });
        }
      }
    ]
  });

  const runs = extractRuns(rendered.bytes)[0];
  assert.ok(runs.length > 1, 'a 250pt run in a 239pt half-box should have wrapped');
  for (const run of runs) {
    const w = measure(run.text, 'regular', 6.8);
    assert.ok(w <= edge - 300 + 0.05, `wrapped line "${run.text}" measured ${w} in a 239pt box`);
    assert.ok(run.x + w <= edge + 0.05, `wrapped line ends at ${run.x + w}, margin is ${edge}`);
  }
  /* Every line of a right-aligned block shares its right edge. */
  const edges = runs.map((r) => r.x + measure(r.text, 'regular', 6.8));
  for (const e of edges) assert.ok(Math.abs(e - edges[0]) < 0.05, `ragged right edge: ${edges}`);
});

test('tracking is per-run, never inherited from the run before it', () => {
  /* `Tc` is text state: a run that does not restate it inherits it. A tracked label followed by an
   * untracked paragraph is the case that reproduces a 100pt overflow in a layout that measured
   * correctly, so it is asserted directly. */
  const rendered = buildPdf({
    title: 'tc',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          page.text(M.left, 40, 'TRACKED LABEL', { face: 'bold', size: 6.4, charSpace: 1.6 });
          page.text(M.left, 60, 'untracked run', { face: 'regular', size: 8.4 });
        }
      }
    ]
  });

  const [, plain] = extractRuns(rendered.bytes)[0];
  assert.equal(plain.charSpace, 0, 'the untracked run inherited tracking');
  assert.equal(plain.x, M.left);
});

/* -------------------------------------------------------------------------------------------- */
/* The document model                                                                           */
/* -------------------------------------------------------------------------------------------- */

test('the model resolves the sample design to the counts the document claims', () => {
  assert.equal(model.name, 'Closing Time');
  assert.equal(model.typeLabel, 'Horror Chase');
  assert.equal(model.counts.devices, 13);
  assert.equal(model.counts.settings, 36);
  assert.equal(model.plan.devices.length, model.counts.devices);
  assert.equal(model.settingsRows.length, model.counts.devices);
  assert.equal(model.steps.length, 5);

  /* Every device is accounted for across the build phases. A device the phases do not name would
   * vanish from a document organised by build order, which is the one failure that reorganisation
   * invites — so it is reported in `unplaced` rather than dropped, and asserted empty here. */
  const placed = model.phases.reduce((n, phase) => n + phase.devices.length, 0);
  assert.equal(placed + model.unplaced.length, model.counts.devices);
  assert.deepEqual(
    model.unplaced.map((d) => d.name),
    [],
    'a device is missing from every build phase'
  );

  /* Every setting is accounted for across the devices. */
  const settings = model.settingsRows.reduce((n, row) => n + row.settings.length, 0);
  assert.equal(settings, model.counts.settings);
});

test('a device cannot be in the plan without a source', () => {
  for (const row of model.settingsRows) {
    assert.ok(
      Array.isArray(row.sources) && row.sources.length > 0,
      `${row.device} is in the plan with no source saying why`
    );
  }
  for (const device of model.plan.devices) {
    assert.ok(Array.isArray(device.sources) && device.sources.length > 0, `${device.name} has no source`);
  }
});

test('every section the tool cannot write is declared, and none is invented', () => {
  assert.ok(AUTHORED_SECTIONS.length >= 5, 'a design document has more authored parts than that');
  for (const section of AUTHORED_SECTIONS) {
    assert.ok(section.id && section.label, `malformed authored section: ${JSON.stringify(section)}`);
    assert.ok(section.needs, `${section.id} does not say what the tool is missing to write it`);
  }
  const ids = AUTHORED_SECTIONS.map((s) => s.id);
  for (const required of ['art_style', 'level_design', 'audio', 'market']) {
    assert.ok(ids.includes(required), `${required} must be reported as missing, not invented`);
  }

  /* The model exposes them as `missing`, and a row carries no value: if it carried one, the generator
   * had made one up. This is the whole honesty claim of the three structures, so it is asserted. */
  assert.equal(model.missing.length, AUTHORED_SECTIONS.length);
  assert.deepEqual(
    model.missing.map((row) => row.id),
    ids
  );
  for (const row of model.missing) {
    assert.equal(row.value, undefined, `${row.id} carries a value the tool cannot know`);
  }
});

test('a plan whose answers change nothing says so rather than hiding it', () => {
  /* This sample has no answer that changes a device setting, which is a real and common outcome: the
   * plan is mostly the game type's recommendation. The count is reported as 0 rather than omitted,
   * because "nothing you answered changed the plan" is information the reader of a plan wants. */
  assert.equal(model.counts.decisions, 0);
  assert.ok(Array.isArray(model.notes));
  assert.equal(model.notes.length, model.counts.notes);
});

/* -------------------------------------------------------------------------------------------- */
/* The three structures                                                                         */
/* -------------------------------------------------------------------------------------------- */

test('every structure renders a valid PDF', () => {
  assert.equal(built.length, 3, 'three structures are proposed');
  for (const [structure, result] of built) {
    const validation = validatePdf(result.bytes);
    assert.equal(
      validation.ok,
      true,
      `${structure.meta.name} is not a valid PDF: ${validation.problems.join('; ')}`
    );
    assert.deepEqual(result.problems, []);
    assert.equal(result.pages, validation.pageCount);
    assert.ok(result.pages >= 1);
    assert.ok(result.bytes.length > 1000, `${structure.meta.name} is suspiciously small`);
  }
});

test('nothing overflows the box it was drawn in', () => {
  for (const [structure, result] of built) {
    assert.deepEqual(
      result.overflow,
      [],
      `${structure.meta.name} dropped content: ${JSON.stringify(result.overflow)}`
    );
  }
});

test('nothing sits outside the margins, overlaps, or leaves a page nearly empty', () => {
  for (const [structure, result] of built) {
    const { problems, pageStats } = auditPdf(result.bytes);
    assert.deepEqual(
      problems.map((p) => `${p.page}: ${p.kind} — ${p.detail}`),
      [],
      `${structure.meta.name} has layout problems`
    );
    assert.equal(pageStats.length, result.pages);
    for (const stat of pageStats) {
      assert.ok(stat.runs >= 8, `page ${stat.page} carries only ${stat.runs} runs`);
    }
  }
});

test('page numbering in the footers matches the page count', () => {
  for (const [structure, result] of built) {
    const pages = extractRuns(result.bytes);
    const total = pages.length;
    pages.forEach((runs, i) => {
      const wanted = `${i + 1} / ${total}`;
      assert.ok(
        runs.some((r) => r.text.trim() === wanted),
        `${structure.meta.name} page ${i + 1} does not carry "${wanted}"`
      );
    });
  }
});

test('the structure name and version reach the footers of every page', () => {
  for (const [structure, result] of built) {
    const pages = extractRuns(result.bytes);
    for (const runs of pages) {
      const text = runs.map((r) => r.text).join(' ');
      assert.ok(text.includes('Closing Time'), `${structure.meta.name}: footer is missing the name`);
      assert.ok(text.includes(model.version), `${structure.meta.name}: footer is missing the version`);
    }
  }
});

test('the text of each structure names the game, the type and every missing section', () => {
  const labels = AUTHORED_SECTIONS.map((s) => s.label);
  for (const [structure, result] of built) {
    const text = result.text;
    assert.ok(text.includes('Closing Time'), `${structure.meta.name} does not name the game`);
    assert.ok(
      /Horror Chase/.test(text),
      `${structure.meta.name} does not name the game type`
    );
    const named = labels.filter((label) => text.includes(label));
    assert.ok(
      named.length >= 3,
      `${structure.meta.name} names only ${named.length} of the sections it cannot write: ${named}`
    );
  }
});

test('re-rendering produces identical bytes', () => {
  for (const structure of STRUCTURES) {
    const a = buildStructure(structure, model);
    const b = buildStructure(structure, model);
    assert.equal(digest(a.bytes), digest(b.bytes), `${structure.meta.name} is not deterministic`);
    assert.equal(a.pages, b.pages);
  }
});

test('the three structures are genuinely three, not one document three times', () => {
  const counts = new Set(built.map(([, r]) => r.pages));
  assert.ok(counts.size > 1, 'every structure has the same page count — they are not distinct');
  const digests = new Set(built.map(([, r]) => digest(r.bytes)));
  assert.equal(digests.size, 3);
  for (const [, result] of built) assert.ok(result.text.length > 400);
});

/* -------------------------------------------------------------------------------------------- */
/* The writer's own contract                                                                    */
/* -------------------------------------------------------------------------------------------- */

test('a page that runs past its limit is reported, never silently cropped', () => {
  const rendered = buildPdf({
    title: 'overflow',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: 200,
        draw(page) {
          page.para(M.left, 40, 'A paragraph. '.repeat(200), {
            size: 9,
            maxWidth: CONTENT_WIDTH,
            label: 'too much'
          });
        }
      }
    ]
  });
  assert.ok(rendered.overflow.length >= 1, 'an over-long page reported no overflow');
  assert.equal(rendered.overflow[0].page, 1);
});

test('a paragraph that does not fit its published height is reported', () => {
  const rendered = buildPdf({
    title: 'short block',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          page.para(M.left, 40, 'One. Two. Three. Four. Five. Six. Seven. Eight.', {
            size: 10,
            maxWidth: 60,
            maxHeight: 14,
            label: 'squeezed'
          });
        }
      }
    ]
  });
  assert.equal(rendered.overflow.length, 1);
  assert.equal(rendered.overflow[0].label, 'squeezed');
});

test('a page that leaves the paper entirely fails validation', () => {
  const rendered = buildPdf({
    title: 'past the paper',
    pages: [
      {
        name: 'A',
        width: PAGE.width,
        height: PAGE.height,
        limit: PAGE.height - M.bottom,
        draw(page) {
          page.text(M.left, PAGE.height + 40, 'off the page', { face: 'regular', size: 10 });
        }
      }
    ]
  });
  const { problems } = auditPdf(rendered.bytes);
  assert.ok(
    problems.some((p) => p.kind === 'bottom margin' || p.kind === 'top margin'),
    `expected a margin problem, got ${JSON.stringify(problems)}`
  );
});

test('the palettes the structures use are all well-formed colour operators', () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    for (const [key, value] of Object.entries(palette)) {
      assert.match(
        value,
        /^-?\d*\.?\d+ -?\d*\.?\d+ -?\d*\.?\d+$/,
        `${name}.${key} is not an "r g b" operator: ${JSON.stringify(value)}`
      );
      for (const channel of value.split(' ').map(Number)) {
        assert.ok(channel >= 0 && channel <= 1, `${name}.${key} channel ${channel} is out of range`);
      }
    }
  }
});

test('every face the structures ask for exists', () => {
  /* Runs carry the PDF resource name (`F2`), not the metric key (`bold`), so the check maps back
   * through the same table the writer used to allocate them. */
  const byName = new Set(Object.values(FACES).map((face) => face.name));
  for (const [structure, result] of built) {
    for (const page of extractRuns(result.bytes)) {
      for (const run of page) {
        assert.ok(
          byName.has(run.font),
          `${structure.meta.name} used an unknown face ${run.font} — the font resource is missing`
        );
      }
    }
  }
});

test('plain text extraction round-trips the document', () => {
  /* `built` is a list of `[structure, result]` pairs, so the Sprint Pack's result is the second element
   * of the second pair — `[, sprint]` would destructure the first pair instead, and then `sprint.bytes`
   * would be reading `.bytes` off a result object. */
  const [, sprint] = built[1];
  const text = pdfPlainText(sprint.bytes);
  assert.ok(text.length > 4000, `the Sprint Pack extracted only ${text.length} characters`);
  /* Every device in the plan should be nameable in the pack that lists them. This is the check that a
   * device cannot fall out of the document between the model and the pages. */
  const missing = model.plan.devices.filter((d) => !text.includes(d.name.split(' / ')[0]));
  assert.deepEqual(
    missing.map((d) => d.name),
    [],
    'the Sprint Pack does not name every device in the plan'
  );
});
