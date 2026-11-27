/**
 * render.mjs — the export: a resolved design in, three PDFs out, plus the report that says whether
 * they are any good.
 *
 * **Why three structures and not one.** The reference document (`Closing Time`) is one answer to
 * "what is a GDD" — eight numbered chapters, each a different *kind* of content, read front to back.
 * It is a good document and it is not the only shape, because a design document has at least three
 * jobs and they do not want the same layout:
 *
 *   1. **Getting a yes.** A reader who is deciding, skimming on a phone, in a thread. One page, the
 *      pitch first, the facts in a row. This is **The Brief**.
 *   2. **Getting it built.** A reader with the editor open, wanting the next device and its settings,
 *      in the order the work happens. Sequence, density, tables. This is **The Sprint Pack**.
 *   3. **Getting it defended.** A reader asking "why is this here?" — including you in three months.
 *      Provenance on every line, checkable totals, the chain from answer to effect. **The Ledger**.
 *
 * The reference document mixes all three jobs into one book, which is why its page 1 has to work as a
 * pitch and its page 8 has to work as a build plan. Splitting them is the proposal: same underlying
 * design, three documents, pick by who is reading. The three differ by **organising axis** —
 * persuasion, sequence, provenance — and any two of them that share an axis are a layout change
 * rather than a structure.
 *
 * **What all three share** is the honesty rule enforced in model.mjs: none of them invent a section
 * the questionnaire cannot fill. Each ends by naming what is missing, which is also why they are
 * credible — a document that claims to know your art direction after four device questions is not one
 * you would trust with the four answers it did get.
 *
 * Usage:
 *     node tools/gdds/render.mjs                 # all three, into .scratch/gdd/
 *     node tools/gdds/render.mjs brief           # one of them
 *     node tools/gdds/render.mjs --out <dir>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';
import { validatePdf, pdfPlainText } from './validate.mjs';
import { parseData } from '../../public/js/guide/data.js';
import { createDocModel, SAMPLE_DESIGN } from './model.mjs';
import { renderBrief, BRIEF_META } from './structures/brief.mjs';
import { renderSprint, SPRINT_META } from './structures/sprint.mjs';
import { renderLedger, LEDGER_META } from './structures/ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export const STRUCTURES = [
  { meta: BRIEF_META, render: renderBrief, file: '01-brief' },
  { meta: SPRINT_META, render: renderSprint, file: '02-sprint-pack' },
  { meta: LEDGER_META, render: renderLedger, file: '03-ledger' }
];

/** Load the catalogue the app ships. Read from disk so the export needs no server. */
export function loadDataset() {
  const raw = readFileSync(path.join(ROOT, 'public', 'data', 'uefn_device_logic.json'), 'utf8');
  return parseData(JSON.parse(raw));
}

/**
 * Build one structure.
 *
 * @returns {{id: string, name: string, bytes: Buffer, pages: number, overflow: Array, problems: string[]}}
 */
export function buildStructure(structure, model) {
  /* The page count is not known before rendering — the sprint pack and the ledger both paginate by
   * content — so the renderer runs once to count, and the footers are told the total on the second
   * pass. Two passes rather than a footer that guesses, because "3 / ?" is worse than no footer. */
  let pages = structure.render(model, { total: null });
  pages = structure.render(model, { total: pages.length });

  const { bytes, pageCount, overflow, notes } = buildPdf({
    title: `${model.name} — ${structure.meta.name}`,
    author: 'Forge',
    subject: `${model.typeLabel} game design document`,
    keywords: `UEFN, game design document, ${model.typeLabel}, ${model.categoryLabel}`,
    creator: 'Forge — GDD export',
    /* The document's own date, not the clock. `model.date` is an ISO day (`2026-11-17`) and the writer
     * wants a Date, so it is anchored at UTC midnight — the footer already prints this day, and
     * embedding a different instant was both inconsistent with the page and a source of byte
     * differences between two builds of the same content. */
    creationDate: new Date(`${model.date}T00:00:00Z`),
    pages
  });

  const validation = validatePdf(bytes);
  return {
    id: structure.meta.id,
    name: structure.meta.name,
    tagline: structure.meta.tagline,
    reads: structure.meta.reads,
    bytes,
    pages: pageCount,
    overflow,
    notes: notes || [],
    problems: validation.problems,
    text: pdfPlainText(bytes)
  };
}

/* ----------------------------------------- cli ----------------------------------------- */

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : path.join(ROOT, '.scratch', 'gdd');
  const wanted = args.filter((a) => !a.startsWith('--') && a !== outDir);

  const dataset = loadDataset();
  const model = createDocModel({ dataset, ...SAMPLE_DESIGN });
  const chosen = wanted.length
    ? STRUCTURES.filter((s) => wanted.includes(s.meta.id))
    : STRUCTURES;

  if (!chosen.length) {
    console.error(`No structure matched. Available: ${STRUCTURES.map((s) => s.meta.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`${model.name} — ${model.typeLabel} (${model.categoryLabel}), ${model.brandLabel}`);
  console.log(`${model.pitchLine}`);
  console.log(
    `${model.counts.devices} devices · ${model.counts.settings} settings · ` +
      `${model.counts.decisions} changed by an answer · ${model.notes.length} notes\n`
  );

  let failed = 0;
  for (const structure of chosen) {
    const result = buildStructure(structure, model);
    const file = path.join(outDir, `${structure.file}.pdf`);
    writeFileSync(file, result.bytes);

    const kb = (result.bytes.length / 1024).toFixed(1);
    console.log(`${result.name.padEnd(16)} ${String(result.pages).padStart(2)} pages  ${kb.padStart(7)} KB  ${path.relative(ROOT, file)}`);
    console.log(`                 ${result.tagline}`);
    console.log(`                 reads: ${result.reads}`);

    if (result.problems.length) {
      failed += 1;
      console.log(`  STRUCTURE INVALID: ${result.problems.join('; ')}`);
    }
    if (result.overflow.length) {
      failed += 1;
      for (const row of result.overflow) {
        console.log(
          `  OVERFLOW page ${row.page}: "${row.label}" wanted ${row.wanted}pt, allowed ${row.allowed}pt`
        );
      }
    }
    /* Repairs, not failures. Printed because a `text` call that needed two lines is a layout that
     * expected one, and the author should decide whether the box or the copy is wrong — but the page
     * came out correct, so it does not fail the build. */
    for (const note of result.notes) {
      console.log(`  NOTE page ${note.page}: ${note.label} wrapped — ${note.detail}`);
    }
    console.log('');
  }

  if (failed) {
    console.error(`${failed} structure(s) failed — fix the layout, do not ship it.`);
    process.exitCode = 1;
  } else {
    console.log('All structures valid and inside their margins.');
  }
}

/* Run only when invoked directly, so the build can import this without rendering. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
