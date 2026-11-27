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
import zlib from 'node:zlib';

import { measure, wrap, blockHeight, FACES, toWinAnsi, buildPdf } from '../tools/gdds/pdf.mjs';
import { glyphPolylines, strokeWeight, hasGlyph, glyphCount } from '../tools/gdds/font.mjs';
import { renderPdfPageToPng, Canvas } from '../tools/gdds/png.mjs';
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

/**
 * One pixel of a rendered page, as `[r, g, b]`.
 *
 * The previews went a long way with every page drawn on near-black paper and no test that looked at a
 * single pixel, so these assertions read the raster rather than the code that produced it.
 */
const decodePixel = (png, x, y) => {
  const ihdr = png.indexOf('IHDR');
  const width = png.readUInt32BE(ihdr + 4);
  const raw = zlib.inflateSync(png.subarray(png.indexOf('IDAT') + 4, png.lastIndexOf('IEND') - 4));
  const i = y * (width * 3 + 1) + 1 + x * 3;
  return [raw[i], raw[i + 1], raw[i + 2]];
};

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

/* -------------------------------------------------------------------------------------------- */
/* The preview rasteriser                                                                        */
/* -------------------------------------------------------------------------------------------- */

test('every character the documents print has real glyph artwork', () => {
  /* The preview draws a visible box for anything it cannot draw, which is the right behaviour for a
   * viewer and a small lie about the printed page. This is the check that it never happens: every byte
   * that reaches the rasteriser resolves to real artwork.
   *
   * "Byte", not "character": the rasteriser reads the finished PDF, so what reaches it is WinAnsi. The
   * em dash in these documents is 0x97, not U+2014, and keying the font on the Unicode character left
   * the commonest punctuation in the document drawing as a box while every Unicode-based check passed. */
  const missing = new Set();
  for (const [, result] of built) {
    for (const ch of result.text) {
      const encoded = toWinAnsi(ch) || ch;
      for (const byte of encoded) {
        if (byte === '\n' || byte === ' ') continue;
        if (!hasGlyph(byte)) missing.add(byte);
      }
    }
  }
  assert.deepEqual(
    [...missing].map((c) => `${JSON.stringify(c)} U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`),
    [],
    'the preview has no artwork for these characters'
  );
});

test('the writer never emits a code point a latin1 string cannot carry', () => {
  /* The invariant that made the dash bug invisible for as long as it lasted.
   *
   * `pdfString` builds the PDF's literal string as a JS string and the file is assembled with a `latin1`
   * write, so **any code point above U+00FF is truncated to its last UTF-8 byte**. `toWinAnsi` used to
   * pass an en dash through as U+2013, which wrote as a single byte 0x13 — a control character — and the
   * document printed a stray glyph where a dash should be. Nothing failed: the PDF was valid, the audit
   * saw text, and the preview drew a box.
   *
   * Asserting it here means the next special character added to the transliterator has to name its
   * WinAnsi byte rather than hoping. */
  const offenders = new Map();
  for (const [, result] of built) {
    for (const ch of result.text) {
      const mapped = toWinAnsi(ch);
      if (!mapped) continue;
      for (const byte of mapped) {
        const code = byte.codePointAt(0);
        if (code > 0xff) {
          const key = `${JSON.stringify(ch)} U+${ch.codePointAt(0).toString(16).toUpperCase()} -> U+${code.toString(16).toUpperCase()}`;
          offenders.set(key, (offenders.get(key) || 0) + 1);
        }
      }
    }
  }
  assert.deepEqual(
    [...offenders],
    [],
    'these characters would be truncated by the latin1 write, losing all but the last UTF-8 byte'
  );
});

test('WinAnsi special characters map to their own code points, not to themselves', () => {
  /* Spot checks on the ones the documents actually use. Each of these is one byte in WinAnsi and would
   * be three if left as Unicode. */
  const singleByte = [
    ['\u2014', 0x97, 'em dash'],
    ['\u2013', 0x96, 'en dash'],
    ['\u00b7', 0xb7, 'middot'],
    ['\u2019', 0x27, 'right single quote'],
    ['\u201c', 0x22, 'left double quote'],
    ['\u201d', 0x22, 'right double quote'],
    ['\u00a0', 0x20, 'non-breaking space']
  ];
  for (const [ch, code, name] of singleByte) {
    const mapped = toWinAnsi(ch);
    assert.equal(
      mapped.length,
      1,
      `${name} mapped to ${mapped.length} bytes (${JSON.stringify(mapped)}), wanted one`
    );
    assert.equal(
      mapped.codePointAt(0),
      code,
      `${name} mapped to U+${mapped.codePointAt(0).toString(16).toUpperCase()}, wanted U+${code.toString(16).toUpperCase()}`
    );
  }

  /* These deliberately expand: there is no base-14 glyph for them, so they become the ASCII sequence
   * that reads the same. Each byte is still Latin-1, which is the invariant that matters. */
  const expansions = [
    ['\u2026', '...', 'ellipsis'],
    ['\u2192', '->', 'right arrow'],
    ['\u2190', '<-', 'left arrow'],
    ['\u2264', '<=', 'less or equal'],
    ['\u2265', '>=', 'greater or equal']
  ];
  for (const [ch, want, name] of expansions) {
    const mapped = toWinAnsi(ch);
    assert.equal(mapped, want, `${name} should expand to ${JSON.stringify(want)}`);
    for (const byte of mapped) {
      assert.ok(byte.codePointAt(0) <= 0xff, `${name} produced a byte above Latin-1`);
    }
  }

  /* And a character with no base-14 glyph at all is marked rather than dropped, so a reader can see
   * that something was lost. Dropping it silently would leave a word with a hole in it. */
  assert.equal(toWinAnsi('\u4e2d'), '?', 'an unrepresentable character should be marked, not dropped');
});

test('the preview font is shaped the way the rasteriser reads it', () => {
  /* A glyph is a list of strands, and a strand is a list of `[x, y]` pairs. One level of nesting too
   * few throws inside a `for...of` the first time that character is drawn — which happened three times
   * while the font was written, each time as a render-time crash naming a line rather than a glyph.
   * `font.mjs` validates at import, so importing it is the assertion; these calls then prove the
   * accessors work on every character the documents use. */
  assert.ok(glyphCount() > 90, `the font defines only ${glyphCount()} glyphs`);
  for (const [, result] of built) {
    for (const ch of result.text) {
      const encoded = toWinAnsi(ch) || ch;
      const byte = encoded[0];
      if (byte === '\n' || byte === ' ') continue;
      const polylines = glyphPolylines(byte, 0, 10, 20, 12);
      assert.ok(Array.isArray(polylines), `${JSON.stringify(byte)} did not return polylines`);
      for (const line of polylines) {
        for (const point of line) {
          assert.ok(
            Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
            `${JSON.stringify(byte)} produced a malformed point ${JSON.stringify(point)}`
          );
        }
      }
    }
  }
});

test('glyphs are drawn the right way up', () => {
  /* The bug this replaces put every glyph's shapes in the wrong half of the em, because the bitmap it
   * came from ran rows top-down while the drawing code treated row 0 as the top of the ascent. Text
   * space here is `y` up from the baseline, so an uppercase letter must have ink *above* the baseline
   * and a `g` or `p` must have ink below it. Both are asserted in canvas space, where `y` grows down. */
  const size = 100;
  const baselineY = 400;
  const inkRange = (ch) => {
    const polylines = glyphPolylines(ch, 0, 100, baselineY, size);
    const ys = polylines.flat().map(([, y]) => y);
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
  };

  for (const ch of ['A', 'B', 'H', 'T', 'X']) {
    const { top, bottom } = inkRange(ch);
    assert.ok(top < baselineY - size * 0.5, `${ch} has no ink above the baseline (top ${top})`);
    assert.ok(bottom <= baselineY + 1, `${ch} descends below the baseline (bottom ${bottom})`);
  }

  /* A descender really is a descender. */
  for (const ch of ['g', 'p', 'q', 'y']) {
    const { bottom } = inkRange(ch);
    assert.ok(bottom > baselineY + size * 0.08, `${ch} does not descend (bottom ${bottom})`);
  }

  /* An x-height letter is shorter than a cap-height one, which is the single easiest thing for a
   * font like this to get wrong in a way that still looks like text. */
  const capTop = inkRange('H').top;
  const xTop = inkRange('n').top;
  assert.ok(xTop > capTop + size * 0.1, `n (${xTop}) is not shorter than H (${capTop})`);
});

test('bold runs are stroked heavier than regular ones', () => {
  /* Half these structures' hierarchy is carried by weight alone, so the preview has to show it. */
  const regular = strokeWeight('helvetica', 'normal', 10);
  const bold = strokeWeight('helvetica', 'bold', 10);
  assert.ok(bold > regular, `bold ${bold} is not heavier than regular ${regular}`);
  assert.ok(regular >= 0.5, `a regular stem of ${regular}px would be invisible`);
});

test('a rendered page is a valid PNG of the expected size', () => {
  const [, brief] = built[0];
  for (const scale of [1, 2]) {
    const png = renderPdfPageToPng(brief.bytes, 0, { scale });
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG');
    assert.equal(png.subarray(12, 16).toString('latin1'), 'IHDR');
    assert.equal(
      png.readUInt32BE(16),
      Math.round(PAGE.width * scale),
      `width at scale ${scale}`
    );
    assert.equal(
      png.readUInt32BE(20),
      Math.round(PAGE.height * scale),
      `height at scale ${scale}`
    );
  }
});

test('a rendered page is not blank, and its ink is where the text is', () => {
  /* The check that the rasteriser actually drew something. A page of a real document that came back
   * uniformly background would be the worst failure mode of all: a preview that silently shows nothing
   * while every other test passes.
   *
   * The threshold is low because dense text still covers well under one per cent of an A4 page, and the
   * figures here moved by a factor of twenty when the paper was fixed — every pixel used to count as
   * ink, because the "paper" was rgb(1,1,1). "Dark" meant "not the background" only by accident. */
  const [, sprint] = built[1];
  const png = renderPdfPageToPng(sprint.bytes, 1, { scale: 1 });
  const inflated = zlib.inflateSync(png.subarray(png.indexOf('IDAT') + 4, png.lastIndexOf('IEND') - 4));
  let dark = 0;
  let light = 0;
  let darkest = 255;
  for (let row = 0; row < PAGE.height; row += 1) {
    for (let col = 0; col < PAGE.width; col += 1) {
      const i = row * (PAGE.width * 3 + 1) + 1 + col * 3;
      const luma = (inflated[i] + inflated[i + 1] + inflated[i + 2]) / 3;
      if (luma < darkest) darkest = luma;
      if (luma < 128) dark += 1;
      else light += 1;
    }
  }
  const total = dark + light;
  assert.ok(dark / total > 0.0005, `page 2 of the Sprint Pack is ${((dark / total) * 100).toFixed(2)}% ink — it looks blank`);
  assert.ok(light / total > 0.9, `a page should be mostly paper, it is ${((light / total) * 100).toFixed(0)}% light`);
  /* And the ink reaches real ink: a stem with a solid middle, not a grey smudge. Sampled many times
   * over, so this is the minimum, which is what "does any glyph reach full weight" asks. */
  assert.ok(darkest < 90, `the darkest pixel on the page is luma ${darkest} — the text never reaches ink`);
});

test('measure answers the same width for a character and for the byte it is encoded to', () => {
  /* The single most expensive bug in this generator, and the hardest to see.
   *
   * The writer works in two string spaces: callers and `wrap` pass characters, while `text()` measures
   * the WinAnsi it is about to write. If those two readings of the same run disagree, `wrap` fits a line
   * into a box and `text` then decides it does not fit and re-wraps it — and because `para` hands each
   * already-wrapped line to `text` with the box as its right edge, the extra line lands on top of the
   * previous one.
   *
   * An em dash read 556 units as `U+2014` (no table entry, so the fallback) and 1000 as the byte `0x97`
   * (a control character, which does have one). A line `wrap` measured at 456.7pt measured 460.8pt when
   * `text` looked again, 460.8 does not fit 459.28, and the cover of the Sprint Pack drew a three-line
   * paragraph as two lines with the second printed twice. Nothing about the layout was wrong.
   *
   * This asserts the invariant that prevents it, for every character the documents actually contain. */
  for (const [, result] of built) {
    for (const ch of result.text) {
      const encoded = toWinAnsi(ch);
      if (!encoded || encoded === ch) continue;
      /* Only the one-to-one mappings can be compared: an ellipsis becomes three periods and an arrow
       * two characters, and those *should* measure differently because they draw differently. */
      if (encoded.length !== 1) continue;
      const asChar = measure(ch, 'regular', 10);
      const asByte = measure(encoded, 'regular', 10);
      assert.equal(
        asByte.toFixed(6),
        asChar.toFixed(6),
        `${JSON.stringify(ch)} measures ${asChar} but its byte ${JSON.stringify(encoded)} measures ${asByte}`
      );
    }
  }
});

test('the punctuation the generator relies on has real Helvetica widths', () => {
  /* The tables only cover codes 32 to 255, so anything outside Latin-1 needs a deliberate width or it
   * silently takes the fallback. These are Helvetica's printed values, not approximations of them. */
  const expected = [
    ['\u2014', 1000, 'em dash'],
    ['\u2013', 556, 'en dash'],
    ['\u2026', 1000, 'ellipsis'],
    ['\u00b7', 278, 'middot'],
    ['\u2019', 222, 'right single quote'],
    ['\u201c', 333, 'left double quote']
  ];
  for (const [ch, want, name] of expected) {
    const got = measure(ch, 'regular', 1000);
    assert.ok(
      Math.abs(got - want) < 1,
      `${name} measures ${got} units, wanted ${want} — a fallback in disguise`
    );
  }

  /* An em dash and an en dash are different widths. Getting that wrong is invisible until something
   * measures a dash on its own. */
  assert.notEqual(
    measure('\u2014', 'regular', 1000),
    measure('\u2013', 'regular', 1000),
    'the em dash and the en dash cannot both be 556 units'
  );
});

test('a paragraph never draws two of its lines at the same height', () => {
  /* The symptom the metric bug produced, asserted directly so it cannot come back through another
   * route: whatever a paragraph does internally, its lines descend monotonically and never collide. */
  const { bytes } = buildPdf({
    title: 'paragraph spacing',
    pages: [
      {
        name: 'p',
        width: 595.28,
        height: 841.89,
        limit: 800,
        draw(page) {
          page.para(56, 40, 'Match your mood \u2014 cold blue/green for horror, warm for cozy scenes.', {
            face: 'regular',
            size: 7.4,
            leading: 1.3,
            colour: '0 0 0',
            maxWidth: 200,
            label: 'probe'
          });
        }
      }
    ]
  });
  const runs = extractRuns(bytes)[0];
  assert.ok(runs.length >= 2, `the probe should wrap to at least two lines, got ${runs.length}`);
  const pitches = runs.slice(1).map((run, i) => runs[i].yFromBottom - run.yFromBottom);
  for (const pitch of pitches) {
    assert.ok(pitch > 4, `two lines of one paragraph are ${pitch.toFixed(2)}pt apart`);
  }
});

test('the Brief reads the pitch facts as facts, not as one comma-joined string', () => {
  /* `model.pitch.facts` is an **array**. The Brief passed it through `String()` before splitting it on
   * the middle dot the model uses, so `['Surviving', 'Together against the game', …]` became
   * `"Surviving,Together against the game,…"`, the split found nothing, the whole row came back as one
   * element, and every positional read was wrong. The page said:
   *
   *   PLAYERS · SESSION   "Surviving, Together against the game, 2–4, Rooms and corridors, 15–45 minutes"
   *
   * which wrapped to two lines and read as five unrelated things. Asserted on the label/value pairs the
   * page actually prints, because the bug was invisible in the source and visible instantly on the page. */
  /* The text comes back from the finished PDF as WinAnsi, so the en dash in the expected strings is the
   * byte `0x96` and not `U+2013`. Comparing in the encoded space keeps the test reading the document
   * rather than reading its own expectations. */
  const brief = built[0][1].text;
  const want = (s) => toWinAnsi(s);
  assert.ok(
    !/Surviving,/.test(brief),
    'the facts were joined with commas and then split on the wrong character'
  );

  for (const expected of [
    'PLAYERS',
    'Together against the game · 2–4',
    'SESSION',
    '15–45 minutes',
    'WHERE IT HAPPENS',
    'Rooms and corridors',
    'THE PLAN'
  ]) {
    assert.ok(
      brief.includes(want(expected)),
      `the Brief never prints ${JSON.stringify(expected)}`
    );
  }

  /* And the model's own joined line is what the structure reads, so the two cannot drift. */
  assert.ok(model.pitchFacts.includes(' · '), 'the model should join the facts with a middle dot');
  assert.equal(
    model.pitchFacts.split(' · ').length,
    model.pitch.facts.length,
    'the joined line should carry every fact'
  );
});

test('the paper is white, in the unit the painter actually uses', () => {
  /* Every preview was reviewed for a while with the page rendering on near-black instead of white. The
   * canvas took colours as 0..1 — the same form as a PDF `rg` — but its callers passed 0..255, so white
   * arrived as 255 * 255 = 65025 and a `Buffer`, which truncates rather than clamping, stored byte 1.
   * The paper was rgb(1,1,1) and the text was drawn over it in white and dark greys.
   *
   * Nothing failed, because a very dark grey is a perfectly valid raster, and no assertion anywhere
   * looked at a pixel. This one does. */
  const paper = new Canvas(4, 3);
  assert.deepEqual([...paper.pixels], new Array(4 * 3 * 3).fill(255), 'the default paper is not white');

  const explicit = new Canvas(2, 1, [1, 1, 1]);
  assert.deepEqual([...explicit.pixels], [255, 255, 255, 255, 255, 255]);

  /* And the same through the public entry point, because that is where the wrong unit was passed. */
  const { bytes } = buildPdf({
    title: 'paper',
    pages: [{ name: 'p', width: 40, height: 30, limit: 20, draw: (p) => p.text(2, 2, '.', { face: 'regular', size: 3, colour: '0 0 0' }) }]
  });
  const png = renderPdfPageToPng(bytes, 0, { scale: 1 });
  const corner = decodePixel(png, 0, 0);
  assert.deepEqual(corner, [255, 255, 255], `a blank corner came out rgb(${corner.join(',')})`);
});

test('a filled shape with curved corners is filled, not just outlined', () => {
  /* `paintPath` only ever filled a bare `re`. A `roundRect` arrives as moveto/lineto/curveto, so it took
   * the stroke branch and drew its outline in the fill colour at a default line width — a hollow box
   * where the design called for a solid dark one, which reads as a deliberate white panel and therefore
   * survived a review. */
  const canvas = new Canvas(40, 20, [1, 1, 1]);
  canvas.fillPolygon(
    [
      { x: 5, y: 5 },
      { x: 35, y: 5 },
      { x: 35, y: 15 },
      { x: 5, y: 15 }
    ],
    [0, 0, 0]
  );
  let black = 0;
  for (let i = 0; i < canvas.pixels.length; i += 3) if (canvas.pixels[i] === 0) black += 1;
  /* Pixel centres from 5.5 to 34.5 across and 5.5 to 14.5 down: 30 by 10. */
  assert.equal(black, 300, `the interior is ${black} pixels, expected the whole 30x10 span`);

  /* Through the real path: a rounded rectangle comes out darker in the middle than at an unfilled spot. */
  const { bytes } = buildPdf({
    title: 'roundrect',
    pages: [
      {
        name: 'p',
        width: 200,
        height: 120,
        limit: 110,
        draw(p) {
          p.roundRect(20, 40, 120, 34, 4, { fill: '0.1 0.14 0.18' });
          p.text(24, 46, 'Spawn In', { face: 'bold', size: 8, colour: '1 1 1' });
        }
      }
    ]
  });
  const png = renderPdfPageToPng(bytes, 0, { scale: 1 });
  /* Sampled in the middle of the shape rather than near an edge, so the rounded corners and the
   * anti-aliased boundary are both out of the way: the box is 20..140 across and, on screen,
   * 46..80 down, but the point of the test is the interior, not the boundary. */
  const inside = decodePixel(png, 80, 63);
  const outside = decodePixel(png, 180, 63);
  assert.ok(inside[0] < 100, `the box interior is rgb(${inside.join(',')}) — it was not filled`);
  assert.deepEqual(outside, [255, 255, 255], 'the space beside the box should be bare paper');
});

test('every page says how many pages there are', () => {
  /* The Sprint Pack's footer read "2 / 0" on every page. The total is passed in on the renderer's
   * second pass, but a `const total = sequence.length` further down the function shadowed it — the
   * number of rows in the cover's contents table, and 0 for a document whose cover has no table yet.
   * A variable named for one thing and holding another, presented as a rendering fault. */
  for (const [structure, result] of built) {
    const numbers = result.text.split('\n').filter((line) => /^\d+ \/ \d+$/.test(line));
    assert.equal(
      numbers.length,
      result.pages,
      `${structure.meta.name} prints ${numbers.length} page numbers across ${result.pages} pages`
    );
    for (const [i, label] of numbers.entries()) {
      assert.equal(
        label,
        `${i + 1} / ${result.pages}`,
        `${structure.meta.name} page ${i + 1} says ${JSON.stringify(label)}`
      );
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
