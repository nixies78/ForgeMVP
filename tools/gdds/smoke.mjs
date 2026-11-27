/**
 * Smoke test for the PDF writer: a two-page document that exercises wrap, blockHeight, overflow
 * reporting, rectangles, rules, circles and every font family. Run it, open the result, delete it
 * when the real documents exist. Kept because "does the writer still work" is the first question
 * when a document comes out wrong, and this answers it in one second without any domain data.
 */

import { writeFileSync } from 'node:fs';
import { buildPdf, measure, wrap, FACES } from './pdf.mjs';

const W = 595.28;
const H = 841.89;
const M = 56;

const doc = {
  title: 'PDF writer smoke test',
  author: 'Forge',
  pages: [
    {
      width: W,
      height: H,
      draw(page) {
        let y = M;
        page.rect(0, 0, W, 120, '0.09 0.13 0.16');
        y = 40;
        y = page.text(M, y, 'Writer smoke test', { face: 'bold', size: 30, colour: '1 1 1' });
        y = page.text(M, y + 6, 'Base-14 metrics, top-left coordinates, zlib content streams', {
          face: 'italic',
          size: 11,
          colour: '0.78 0.82 0.85'
        });

        y = 150;
        y = page.text(M, y, 'SPECIMEN', { face: 'bold', size: 9, colour: '0.45 0.5 0.55', charSpace: 1.2 });
        y = page.text(M, y + 8, 'Helvetica regular, bold, oblique', { face: 'regular', size: 14 });
        y = page.text(M, y + 8, 'Times serif, bold, italic', { face: 'serif', size: 14 });
        y = page.text(M, y + 8, 'Courier monospaced, bold', { face: 'mono', size: 14 });

        y += 20;
        y = page.text(M, y, 'MEASUREMENT', { face: 'bold', size: 9, colour: '0.45 0.5 0.55', charSpace: 1.2 });
        const sample = 'Twenty-two modules and about 34 hours for a team of three with UEFN experience.';
        const width = measure(sample, 'regular', 10);
        y = page.text(M, y + 8, `measure() says ${width.toFixed(2)}pt for ${sample.length} characters`, {
          face: 'mono',
          size: 9
        });

        const wrapped = wrap(sample, 'regular', 10, 260);
        y += 20;
        page.rect(M, y - 4, 260, wrapped.length * 13.5 + 8, '0.95 0.96 0.97');
        y = page.para(M + 6, y, sample, { maxWidth: 248, size: 10, label: 'wrap demo' });

        y += 14;
        y = page.text(M, y, 'A filled rule, a stroked box and a ring:', { face: 'regular', size: 10 });
        page.rect(M, y + 6, 120, 6, '0.18 0.37 0.39');
        page.stroke(M + 140, y + 2, 120, 26, '0.7 0.72 0.75');
        page.circle(M + 300, y + 15, 13, '0.84 0.15 0.24');
        page.line(M, y + 44, W - M, y + 44, '0.8 0.82 0.84');

        /* Deliberate overflow: asks for 200pt of room in a 40pt slot. The writer must report it. */
        page.para(M, y + 60, sample.repeat(4), { maxWidth: W - M * 2, size: 10, maxHeight: 40, label: 'deliberate overflow' });
      }
    },
    {
      width: W,
      height: H,
      draw(page) {
        let y = M;
        y = page.text(M, y, 'Page two', { face: 'bold', size: 22 });
        y = page.para(M, y + 10, 'If this page exists, the page tree, the content streams and the xref table all agree.', {
          maxWidth: W - M * 2,
          size: 11
        });
        let x = M;
        for (const key of Object.keys(FACES)) {
          const face = FACES[key];
          page.text(x, y + 30, `${face.name} ${face.base}`, { face: key, size: 9 });
          y += 0;
          x = x + 0;
          page.text(M, y + 30 + Object.keys(FACES).indexOf(key) * 12, `${face.name} ${face.base}`, { face: key, size: 9 });
        }
      }
    }
  ]
};

const { bytes, pageCount, overflow } = buildPdf(doc);
const out = process.argv[2] || '.scratch/pdfprobe/writer-smoke.pdf';
writeFileSync(out, bytes);
console.log(`wrote ${out} — ${pageCount} page(s), ${bytes.length} bytes`);
console.log(`overflow reports: ${overflow.length}`);
for (const row of overflow) console.log(`  page ${row.page} "${row.label}": wanted ${row.wanted}pt, had ${row.allowed}pt`);
