/**
 * preview.mjs — the proof: render PNGs of the documents, and audit where the text actually landed.
 *
 * Two jobs, and they exist for the same reason. A reviewer of a *layout* needs to see the page, and a
 * paginated document built by arithmetic needs to be checked against the arithmetic — so this tool
 * decodes the finished PDF (never the intentions of the code that made it), reconstructs every glyph's
 * box, reports collisions and margin breaches, and writes a PNG of each page so a human can look.
 *
 * It is the answer to "show me it works" for a deliverable that cannot be opened in this environment:
 * there is no PDF viewer available to the build, so the check is programmatic and the picture is
 * generated from the same file.
 *
 * Usage:
 *     node tools/gdds/preview.mjs                 # audit all three, PNG the first page of each
 *     node tools/gdds/preview.mjs --pages 1,2     # PNG those pages of every structure
 *     node tools/gdds/preview.mjs --no-png        # audit only
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measure } from './pdf.mjs';
import { auditPdf, useMetrics } from './audit.mjs';
import { renderPdfPageToPng } from './png.mjs';
import { loadDataset, buildStructure, STRUCTURES } from './render.mjs';
import { createDocModel, SAMPLE_DESIGN } from './model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Filenames are the sequence, not the structure's own id, so a directory listing reads in reading
 * order and matches what `render.mjs` writes.
 */
const FILE_PREFIX = {
  brief: '01-brief',
  sprint: '02-sprint-pack',
  ledger: '03-ledger'
};

function main() {
  const args = process.argv.slice(2);
  const noPng = args.includes('--no-png');
  const pagesArg = args[args.indexOf('--pages') + 1];
  const wantedPages =
    args.includes('--pages') && pagesArg
      ? pagesArg
          .split(',')
          .map((n) => Number.parseInt(n, 10) - 1)
          .filter(Number.isInteger)
      : [0];
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : path.join(ROOT, '.scratch', 'gdd', 'preview');
  const scaleIndex = args.indexOf('--scale');
  const scale = scaleIndex >= 0 ? Number.parseFloat(args[scaleIndex + 1]) : 3;

  useMetrics(measure);
  mkdirSync(outDir, { recursive: true });

  const dataset = loadDataset();
  const model = createDocModel({ dataset, ...SAMPLE_DESIGN });

  let failures = 0;

  console.log(`${model.name} — previewing ${STRUCTURES.length} structures\n`);

  for (const structure of STRUCTURES) {
    const result = buildStructure(structure, model);
    const { problems, pageStats } = auditPdf(result.bytes);

    console.log(`${result.name} — ${result.pages} page(s)`);
    console.log(`  runs per page: ${pageStats.map((p) => p.runs).join(', ')}`);
    const deepest = Math.max(...pageStats.map((p) => p.lowest));
    const widest = Math.max(...pageStats.map((p) => p.rightmost));
    console.log(`  lowest text y=${deepest.toFixed(1)}pt, widest text x=${widest.toFixed(1)}pt`);

    if (result.problems.length) {
      failures += 1;
      console.log(`  STRUCTURE INVALID: ${result.problems.join('; ')}`);
    }
    if (problems.length) {
      failures += 1;
      const byKind = new Map();
      for (const p of problems) byKind.set(p.kind, (byKind.get(p.kind) || 0) + 1);
      console.log(`  ${problems.length} layout problem(s):`);
      for (const [kind, count] of byKind) console.log(`    ${kind}: ${count}`);
      for (const p of problems.slice(0, 8)) {
        console.log(`    page ${p.page} — ${p.kind}: ${p.detail}`);
      }
      if (problems.length > 8) console.log(`    ...and ${problems.length - 8} more`);
    } else {
      console.log('  layout: clean — nothing outside the margins, nothing overlapping');
    }

    if (!noPng) {
      const prefix = FILE_PREFIX[result.id] || result.id;
      for (const pageIndex of wantedPages) {
        if (pageIndex >= result.pages) continue;
        const png = renderPdfPageToPng(result.bytes, pageIndex, { scale });
        const file = path.join(outDir, `${prefix}-p${pageIndex + 1}.png`);
        writeFileSync(file, png);
        console.log(`  image: ${path.relative(ROOT, file)} (${(png.length / 1024).toFixed(0)} KB)`);
      }
    }
    console.log('');
  }

  if (failures) {
    console.error(`${failures} structure(s) have layout problems.`);
    process.exitCode = 1;
  } else {
    console.log('All structures clean: valid PDFs, nothing outside the margins, nothing overlapping.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
