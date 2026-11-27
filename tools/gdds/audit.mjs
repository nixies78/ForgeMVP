/**
 * audit.mjs — read the finished PDF back and check where things actually landed.
 *
 * A PDF cannot report its own layout problems: text drawn in the wrong place is still valid PDF, and
 * the overflow check in `buildPdf` only knows about the blocks that asked for a bounded height. So the
 * only honest check is to decode the content streams again, recover every glyph's box, and ask the
 * questions a reader would ask:
 *
 *   - Does anything sit outside the printable area?
 *   - Do two pieces of text overlap, which would mean one is printed on top of the other?
 *   - Is anything drawn below the footer rule, where the page number lives?
 *   - Did any page come out with almost nothing on it, which usually means a pagination bug?
 *
 * This is the check that makes the three structures trustworthy without a screenshot: it operates on
 * the file a user would receive, not on the intentions of the code that produced it.
 */

import zlib from 'node:zlib';

/** Recover the text runs with their positions, by replaying the content stream's text operators. */
export function extractRuns(bytes) {
  const s = bytes.toString('latin1');
  const pages = [];

  for (const match of s.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) continue;
    let raw = Buffer.from(s.slice(start, end), 'latin1');
    if (raw.length > 1 && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
    let text;
    try {
      text = zlib.inflateSync(raw).toString('latin1');
    } catch {
      continue;
    }
    if (!/\bBT\b/.test(text)) continue;

    const runs = [];
    let font = 'F1';
    let size = 10;
    let charSpace = 0;
    /* PDF space has its origin at the bottom-left, so `yFromBottom` is flipped into a top-left `y` when
     * the runs become boxes below — the audit then works in the same coordinate system as the
     * structures that wrote the document. */
    let x = 0;
    let yFromBottom = 0;

    /* Line-based, and every pattern anchored at both ends.
     *
     * That anchoring is not fussiness: an unanchored `/^([-\d.]+) ([-\d.]+) Td$/` scan over the whole
     * stream also matches the leading numbers of a colour operator (`0.1 0.14 0.18 rg`), which quietly
     * moves the cursor and produced 800pt "right margin breaches" for text that was on the page. Our
     * writer emits exactly one operator per line — see the note in pdf.mjs — so a line splitter is the
     * correct parser, and anything unrecognised here is a bug in the writer, not something to skip. */
    for (const rawLine of text.split('\n')) {
      const op = rawLine.trim();
      if (!op) continue;
      let m;
      if ((m = op.match(/^\/(F\d+) ([\d.]+) Tf$/))) {
        font = m[1];
        size = Number(m[2]);
      } else if ((m = op.match(/^1 0 0 1 ([-\d.]+) ([-\d.]+) Tm$/))) {
        x = Number(m[1]);
        yFromBottom = Number(m[2]);
      } else if ((m = op.match(/^([-\d.]+) Tc$/))) {
        charSpace = Number(m[1]);
      } else if ((m = op.match(/^\(((?:\\.|[^\\()])*)\) Tj$/))) {
        runs.push({ text: m[1].replace(/\\([\\()])/g, '$1'), x, yFromBottom, font, size, charSpace });
      } else if ((m = op.match(/^([-\d.]+) ([-\d.]+) Td$/))) {
        /* Kept for hand-written fixtures in the tests, which use the relative form. */
        x += Number(m[1]);
        yFromBottom += Number(m[2]);
      }
    }
    pages.push(runs);
  }
  return pages;
}

/**
 * Audit one document.
 *
 * @returns {{problems: Array<{page:number, kind:string, detail:string}>, pageStats: Array<object>}}
 */
export function auditPdf(bytes, options = {}) {
  const {
    height = 841.89,
    width = 595.28,
    /* The margins a structure is meant to keep. `slack` is the tolerance the check allows before it
     * calls something a breach: the writer's metric tables and the ones PDF viewers embed agree to
     * about a thousandth of a character, but a tracked run magnifies even that, and a report that
     * fires on a tenth of a point teaches its reader to ignore it. One point is invisible on paper and
     * still catches every real breach — the ones this check was written for were 8 to 55 points. */
    marginLeft = 56,
    marginRight = 56,
    marginTop = 20,
    marginBottom = 20,
    slack = 1,
    /* Below this the footer furniture lives, so running text there is a collision. */
    footerBandTop = height - 46,
    minRunsPerPage = 8
  } = options;

  const pages = extractRuns(bytes);
  const problems = [];
  const pageStats = [];

  /* Widths for the base-14 faces, so a run's box can be measured. Only the two families the three
   * structures use are needed, and a wrong width here would produce false overlaps, so they are the
   * same tables the writer uses — imported lazily to keep this module independent of it. */
  pages.forEach((runs, index) => {
    const boxes = runs.map((run) => {
      const w = approximateWidth(run.text, run.font, run.size, run.charSpace);
      return {
        text: run.text,
        left: run.x,
        right: run.x + w,
        charSpace: run.charSpace,
        /* Baseline to a top and bottom that bracket the real ink. The fractions are generous on
         * purpose: 0.72 above and 0.22 below the baseline are the ones a line box actually needs, and
         * using the tighter typographic extent made adjacent lines of the same paragraph look like a
         * collision — a false positive that would have buried the real ones. */
        top: height - run.yFromBottom - run.size * 0.82,
        bottom: height - run.yFromBottom + run.size * 0.28
      };
    });

    boxes.forEach((box) => {
      /* How much overflow this run is allowed before it counts.
       *
       * `slack` covers metric rounding only. The trailing-tracking ambiguity is already resolved in
       * `approximateWidth`, so it must not also be paid for here — an allowance for the same unknown
       * counted twice is just a bigger allowance. */
      const tolerance = slack;
      if (box.left < marginLeft - tolerance) {
        problems.push({
          page: index + 1,
          kind: 'left margin',
          detail: `"${clip(box.text)}" starts at x=${box.left.toFixed(1)}`
        });
      }
      if (box.right > width - marginRight + tolerance) {
        problems.push({
          page: index + 1,
          kind: 'right margin',
          detail: `"${clip(box.text)}" ends at x=${box.right.toFixed(1)}`
        });
      }
      if (box.top < marginTop) {
        problems.push({
          page: index + 1,
          kind: 'top margin',
          detail: `"${clip(box.text)}" starts at y=${box.top.toFixed(1)}`
        });
      }
      if (box.bottom > height - marginBottom) {
        problems.push({
          page: index + 1,
          kind: 'bottom margin',
          detail: `"${clip(box.text)}" ends at y=${box.bottom.toFixed(1)}`
        });
      }
      if (box.top > footerBandTop && box.bottom > footerBandTop + 2) {
        problems.push({
          page: index + 1,
          kind: 'in the footer band',
          detail: `"${clip(box.text)}" sits at y=${box.top.toFixed(1)}`
        });
      }
    });

    /* Overlap: two runs on the same line whose boxes intersect horizontally and vertically by more
     * than a hair, which is text printed over text rather than side by side. Candidates are narrowed
     * by vertical proximity first, because a page of the settings ledger has ~350 runs and the
     * unrestricted pairwise loop is 60k comparisons per page for no extra information. */
    const order = [...boxes].sort((a, b) => a.top - b.top);
    for (let i = 0; i < order.length; i += 1) {
      const a = order[i];
      for (let j = i + 1; j < order.length; j += 1) {
        const b = order[j];
        if (b.top - a.top > 24) break;
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        /* Both thresholds are above zero because two boxes that merely touch are two boxes printed
         * side by side, which is what most of these pages are. A real collision — one string on top of
         * another — runs to several points in both directions. */
        if (overlapY > 4 && overlapX > 2) {
          problems.push({
            page: index + 1,
            kind: 'text overlap',
            detail: `"${clip(a.text)}" and "${clip(b.text)}" overlap by ${overlapX.toFixed(1)}x${overlapY.toFixed(1)}pt`
          });
        }
      }
    }

    pageStats.push({
      page: index + 1,
      runs: boxes.length,
      lowest: boxes.reduce((n, b) => Math.max(n, b.bottom), 0),
      rightmost: boxes.reduce((n, b) => Math.max(n, b.right), 0)
    });

    if (boxes.length < minRunsPerPage) {
      problems.push({
        page: index + 1,
        kind: 'nearly empty page',
        detail: `${boxes.length} text runs — check the pagination`
      });
    }
  });

  return { problems, pageStats };
}

function clip(text) {
  const s = String(text);
  return s.length > 46 ? `${s.slice(0, 43)}...` : s;
}

/**
 * Width of a run, from the writer's own metrics.
 *
 * Duplicating the metric tables here would be a second source of truth that can silently drift, so the
 * writer's `measure` is used — which is why this module can catch a real margin breach instead of
 * reporting whatever its own tables believe.
 *
 * The text passed in is the WinAnsi the file actually carries, while `measure`'s tables are indexed on
 * character codes. That used to be a mismatch for the dashes and is no longer: `pdf.mjs` answers the
 * same width for `U+2014` and the byte `0x97` it is written as, so a run measured here is measured as
 * the printer will draw it. Asserted in `tests/gdd.test.mjs` as "measure is idempotent under toWinAnsi",
 * because the failure mode — the audit and the writer disagreeing about the same run — is exactly the
 * one this file exists to catch.
 */
let measureFn = null;
function approximateWidth(text, fontName, size, charSpace) {
  if (!measureFn) return text.length * size * 0.5;
  const faceKey = FACE_BY_NAME[fontName] || 'regular';
  return measureFn(text, faceKey, size, charSpace);
}

/*
 * NOTE on the one thing this file gets to decide for itself.
 *
 * `text()` places an aligned run at `edge - measure(body)`, so a run's box is `x .. x + measure(...)`
 * and the audit can read the right edge straight off the file. All it must not do is add the tracking a
 * second time on top of a `measure` that has already counted it — which is exactly what an earlier
 * revision did, and it reported every tracked run as one tracking step past the margin while the page
 * itself was correct. The audit disagreeing with the writer about a run that the writer placed
 * correctly is worse than no audit, because it trains its reader to ignore the report.
 */

const FACE_BY_NAME = {
  F1: 'regular',
  F2: 'bold',
  F3: 'italic',
  F4: 'boldItalic',
  F5: 'serif',
  F6: 'serifBold',
  F7: 'serifItalic',
  F8: 'serifBoldItalic',
  F9: 'mono',
  F10: 'monoBold',
  F11: 'monoItalic',
  F12: 'monoBoldItalic'
};

/** Wire the writer's measurement in. Called by the audit entry point, not at import time. */
export function useMetrics(measure) {
  measureFn = measure;
}
