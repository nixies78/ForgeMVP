/**
 * kit.mjs — the shared page furniture and the three colour palettes.
 *
 * The three structures are *supposed* to look different, so this file is small on purpose: it holds
 * only what should be identical in all of them (the page geometry every structure prints to, the
 * footer that says which document you are holding, and the one place a "missing section" is drawn).
 * Anything a structure would answer differently belongs in that structure's own file — a shared
 * layout helper is how three proposals quietly turn into one.
 *
 * Colours are written as PDF `r g b` operator strings because that is what the writer takes. The
 * values are the app's own palette (public/css/tokens.css) darkened or lightened where a screen
 * colour is too bright for paper — `--fn-accent` on a monitor is not the same ink as on a page.
 */

/* ------------------------------------ page geometry ------------------------------------ */

export const PAGE = { width: 595.28, height: 841.89 }; /* A4, in points */
export const M = { top: 52, right: 56, bottom: 58, left: 56 };
export const CONTENT_WIDTH = PAGE.width - M.left - M.right; /* 483.28pt ≈ 170mm */
export const CONTENT_TOP = M.top;
export const CONTENT_BOTTOM = PAGE.height - M.bottom;

/**
 * The lowest `y` a structure's *body* may reach, and the limit the writer enforces.
 *
 * Two different edges, and they were one for a while, which is why every page of all three structures
 * reported running 5pt past its bottom margin the moment the boundary check started working.
 *
 * `CONTENT_BOTTOM` is where body copy stops. The footer is not body copy: it sits *below* that line by
 * design, because a footer that shares a baseline with the last paragraph reads as part of it. So the
 * writer's limit has to be the bottom of the footer band, not the bottom of the text block — otherwise
 * the check fires on the furniture it was written to protect, on every page, and its first lesson to
 * its reader is to ignore it.
 */
export const FOOTER_BOTTOM = PAGE.height - M.bottom + 6; /* 789.89pt */

/** The limit to hand `buildPdf` so the boundary check measures against the footer, not the text. */
export const PAGE_LIMIT = FOOTER_BOTTOM;

/* --------------------------------------- palettes --------------------------------------- */

export const PALETTES = {
  /** Walks: momentum. Deep ink, one saturated accent, warm highlight. */
  brief: {
    ink: '0.06 0.09 0.12',
    body: '0.16 0.19 0.22',
    muted: '0.42 0.46 0.5',
    faint: '0.62 0.65 0.68',
    rule: '0.84 0.86 0.88',
    panel: '0.955 0.962 0.97',
    panelEdge: '0.88 0.9 0.92',
    accent: '0.886 0.149 0.239', /* --fn-accent, #E2263D */
    accentSoft: '0.98 0.9 0.91',
    highlight: '0.95 0.76 0.19', /* --fn-sale-yellow, #F2C230 */
    dark: '0.1 0.14 0.18',
    onDark: '1 1 1',
    onDarkMuted: '0.72 0.76 0.8'
  },

  /** Sprint Pack: execution. Boxy, dense, blueprint grey with a cyan rule. */
  sprint: {
    ink: '0.07 0.1 0.13',
    body: '0.18 0.21 0.24',
    muted: '0.4 0.44 0.48',
    faint: '0.6 0.64 0.67',
    rule: '0.78 0.81 0.84',
    panel: '0.94 0.95 0.965',
    panelEdge: '0.82 0.85 0.88',
    accent: '0.09 0.42 0.45', /* --fn-teal, #176B73 */
    accentSoft: '0.89 0.95 0.95',
    highlight: '0.83 0.55 0.11',
    dark: '0.12 0.16 0.2',
    onDark: '1 1 1',
    onDarkMuted: '0.7 0.75 0.78'
  },

  /** Ledger: auditability. Ruled, tabular, near-monochrome, colour only for the numbers. */
  ledger: {
    ink: '0.1 0.1 0.11',
    body: '0.2 0.2 0.22',
    muted: '0.44 0.44 0.47',
    faint: '0.65 0.65 0.68',
    rule: '0.86 0.86 0.87',
    panel: '0.965 0.965 0.97',
    panelEdge: '0.86 0.86 0.88',
    accent: '0.86 0.15 0.24',
    accentSoft: '0.97 0.92 0.93',
    highlight: '0.35 0.35 0.38',
    dark: '0.14 0.14 0.16',
    onDark: '1 1 1',
    onDarkMuted: '0.74 0.74 0.77'
  }
};

/* --------------------------------------- footer --------------------------------------- */

/**
 * The footer every page of every structure carries.
 *
 * Page numbers are the reader's only way to tell whether a page is missing, and "Draft v0.1" plus the
 * data version is the only way to tell whether the document in hand is the current one — which is the
 * difference between a printable plan and a loose sheet. Both go on every page for the same reason.
 *
 * `page.index` is zero-based, so the first page reads "1 of 6".
 */
export function drawFooter(page, model, palette, options = {}) {
  const { label = 'Game Design Document', total = null } = options;
  /* Inside the bottom margin, not below it.
   *
   * The footer used to sit at `height - M.bottom + 14`, which put its second line 19pt below the
   * margin the rest of the page respects. On paper that is invisible — there is still 44pt of sheet
   * underneath — but it means the document has no consistent bottom edge, and the audit, which reads
   * the finished file, reports the whole footer as running text in the reserved band 14 pages out of
   * 14. The number is worth keeping honest even when the eye cannot tell. */
  const y = PAGE.height - M.bottom - 4;

  page.line(M.left, y - 14, PAGE.width - M.right, y - 14, palette.rule, 0.6);
  page.text(M.left, y - 9, `${model.name}  ·  ${label}  ·  ${model.version}`, {
    face: 'regular',
    size: 7.4,
    colour: palette.muted
  });
  page.text(M.left, y + 1, `Forge catalogue v${model.provenance.dataVersion}  ·  ${model.dateLabel}`, {
    face: 'regular',
    size: 6.6,
    colour: palette.faint
  });
  /* Aligned to the margin edge with no explicit `right`: here `x` *is* the edge, so the default is
   * exactly right, and naming it as well would place the run's left edge at `x` instead. */
  page.text(PAGE.width - M.right, y - 9, total ? `${page.index + 1} / ${total}` : `${page.index + 1}`, {
    face: 'bold',
    size: 7.4,
    colour: palette.muted,
    align: 'right'
  });
}

/* ------------------------------------- missing parts ------------------------------------- */

/**
 * What the document cannot say.
 *
 * Every structure ends with this, and it is the most important page in each of them. A generated GDD
 * that stops where the tool's knowledge stops looks finished; one that names the gap tells the
 * reader where their own work starts. It is also the tool's own roadmap, printed.
 */
export function drawMissing(page, model, palette, y, options = {}) {
  const { columns = 2, title = 'What this document does not know' } = options;
  y = page.text(M.left, y, title.toUpperCase(), {
    face: 'bold',
    size: 8,
    colour: palette.accent,
    charSpace: 1.1
  });
  y += 6;
  y = page.para(
    M.left,
    y,
    'Forge builds this document from the questions it asked — a game type, your answers, and the ' +
      'devices they resolve to. The sections below are part of a full design document and are not ' +
      'derivable from those answers, so they are left for you rather than filled in.',
    { size: 8.6, leading: 1.45, colour: palette.body, maxWidth: CONTENT_WIDTH, label: 'missing intro' }
  );
  y += 10;

  const gap = 18;
  const colWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const rows = Math.ceil(model.missing.length / columns);
  /* Two passes so the columns line up: measure first, because each cell's height depends on how
   * long its "needs" line wrapped, and a second column drawn from a guessed height is what makes a
   * two-column list look ragged. */
  const measured = model.missing.map((item) => {
    const needsLines = page.countLines(item.needs, 'regular', 7.6, colWidth - 10);
    return { item, height: 12 + 11 + needsLines * 7.6 * 1.35 };
  });
  const blockHeight = Math.max(
    ...Array.from({ length: columns }, (_, c) =>
      measured.slice(c * rows, (c + 1) * rows).reduce((n, m) => n + m.height + 9, 0)
    )
  );

  for (let c = 0; c < columns; c += 1) {
    let cy = y;
    const x = M.left + c * (colWidth + gap);
    for (let r = 0; r < rows; r += 1) {
      const entry = measured[c * rows + r];
      if (!entry) break;
      page.line(x, cy, x + colWidth, cy, palette.rule, 0.5);
      page.text(x, cy + 5, entry.item.label, { face: 'bold', size: 9, colour: palette.ink });
      cy += 5 + 10 + 2;
      cy = page.para(x, cy, entry.item.needs, {
        size: 7.6,
        leading: 1.35,
        colour: palette.muted,
        maxWidth: colWidth,
        label: `missing/${entry.item.id}`
      });
      cy += 9;
    }
  }
  return y + blockHeight;
}

/* ---------------------------------------- helpers ---------------------------------------- */

/** A label in the style every heading in every structure starts from, then overrides. */
export function eyebrow(page, x, y, text, palette, options = {}) {
  return page.text(x, y, String(text).toUpperCase(), {
    face: 'bold',
    size: options.size || 7.6,
    colour: options.colour || palette.accent,
    charSpace: options.charSpace === undefined ? 1.1 : options.charSpace
  });
}

/**
 * A section heading: the size that makes a reader stop scrolling and start reading again.
 *
 * Every section in every structure used to be an `eyebrow` — 7.6pt, the same size as the small tracked
 * labels inside the cards, and under a point above the 8.6pt body text. So a page had one text size and
 * a reader had to find the section boundaries by reading for them. The tell was that the structure was
 * legible in the abstract and tiring in the hand.
 *
 * The printed type scale is roughly:
 *
 *   masthead         26pt   the game's name
 *   section           13pt   this
 *   card title         9pt   the device or setting name
 *   eyebrow          7.6pt   a label inside a card
 *   body             8.6pt   the prose
 *   caption / footer  7.4pt   provenance, page numbers
 *
 * `eyebrow` deliberately keeps its old size and stays in use for card labels and sub-labels, which is
 * what it was always for. The difference between the two is the whole point: on a page with panels and
 * prose, 13pt against 7.6pt reads as a hierarchy and 7.6pt against 7.6pt does not.
 *
 * `lead` is the gap from the heading's baseline to whatever comes next. Callers that lay out below a
 * heading use the return value, so the air that a larger size needs travels with it.
 */
export function heading(page, x, y, text, palette, options = {}) {
  const size = options.size || 13;
  const colour = options.colour || palette.ink;
  const baseline = page.text(x, y, String(text), {
    face: options.face || 'bold',
    size,
    colour,
    charSpace: options.charSpace === undefined ? -0.1 : options.charSpace,
    maxWidth: options.maxWidth === undefined ? CONTENT_WIDTH : options.maxWidth
  });
  /* Returned rather than assumed: a caller that hardcodes the old 7.6pt lead would draw the next line
   * through the descenders of the heading. */
  return baseline + (options.lead === undefined ? size * 0.34 : options.lead);
}

/**
 * A section heading with a rule under it, which is how most sections here are introduced.
 * Returns the y of the first free line below the rule.
 */
export function headingRule(page, x, y, text, palette, options = {}) {
  const after = heading(page, x, y, text, palette, options);
  const ruleY = after + (options.gap === undefined ? 5 : options.gap);
  rule(page, ruleY, palette, { weight: options.weight || 0.8, x, x2: options.x2 });
  return ruleY + (options.after === undefined ? 9 : options.after);
}

/** A full-width rule with a little air above it. */
export function rule(page, y, palette, options = {}) {
  page.line(options.x || M.left, y, options.x2 || PAGE.width - M.right, y, palette.rule, options.weight || 0.6);
  return y;
}

/**
 * A small number and its label, side by side — the unit every snapshot and fact row is built from.
 * Returns the height used, because callers lay these out in a row they have to fit.
 */
export function figure(page, x, y, value, label, palette, options = {}) {
  const { size = 20, labelSize = 7, width = null, align = 'left', colour = null } = options;
  page.text(x, y, String(value), {
    face: 'bold',
    size,
    colour: colour || palette.ink,
    align,
    maxWidth: width
  });
  page.text(x, y + size * 1.02, String(label).toUpperCase(), {
    face: 'bold',
    size: labelSize,
    colour: palette.muted,
    charSpace: 0.7,
    align,
    maxWidth: width
  });
  return size * 1.02 + labelSize * 1.3;
}

export function countLines(page, text, face, size, width) {
  return page.countLines(text, face, size, width);
}

/* ---------------------------------------- tables ---------------------------------------- */

/**
 * A ruled table, measured before it is drawn.
 *
 * `drawTable` lays a table out over one or more pages and is the only reason the settings ledger fits:
 * a device's settings run to thirty-six rows across thirteen devices, which is two pages of table and
 * would need paginating by hand otherwise. It measures every row first, then fills a page, then starts
 * another — so the table can never be cut mid-row, and its column widths are decided once by the
 * caller rather than drifting page to page.
 *
 * Columns: `{ key, label, width, face, size, colour, leading, gap }`. A column narrower than its
 * content wraps rather than overflowing, because a cell that runs under the next column is the one
 * table failure a reader cannot see past.
 *
 * @returns {{y: number, pageIndex: number, rowsDrawn: number, done: boolean}}
 */
export function drawTable(pages, pageIndex, y, rows, columns, palette, options = {}) {
  const {
    topMargin = M.top,
    bottomMargin = M.bottom + 26,
    rowPad = 7,
    fontSize = 8,
    leading = 1.32,
    label = 'table'
  } = options;

  const contentWidth = columns.reduce((n, c) => n + c.width, 0);
  const startX = options.x === undefined ? M.left : options.x;

  const drawHeader = (page, at) => {
    columns.forEach((col, i) => {
      const x = startX + columns.slice(0, i).reduce((n, c) => n + c.width, 0);
      page.text(x, at, col.label.toUpperCase(), {
        face: 'bold',
        size: 6.4,
        colour: palette.muted,
        charSpace: 0.8,
        maxWidth: col.width - (col.gap || 10)
      });
    });
    page.line(startX, at + 11, startX + contentWidth, at + 11, palette.ink, 0.9);
    return at + 11;
  };

  const measureRow = (page, row) => {
    let tallest = 0;
    columns.forEach((col) => {
      const text = row[col.key] === undefined || row[col.key] === null ? '' : String(row[col.key]);
      const lines = page.countLines(text, col.face || 'regular', col.size || fontSize, col.width - (col.gap || 10));
      tallest = Math.max(tallest, lines * (col.size || fontSize) * (col.leading || leading));
    });
    return tallest + rowPad;
  };

  let page = pages[pageIndex];
  let headerBottom = y;

  const newPage = () => {
    pageIndex += 1;
    page = pages[pageIndex];
    if (!page) throw new Error(`drawTable: ran out of pages for "${label}"`);
    headerBottom = drawHeader(page, topMargin);
  };

  headerBottom = drawHeader(page, y);
  let cursor = headerBottom + 2;
  let drawn = 0;

  for (const row of rows) {
    const height = measureRow(page, row);
    if (cursor + height > PAGE.height - bottomMargin) {
      newPage();
      cursor = headerBottom + 2;
    }
    columns.forEach((col, i) => {
      const x = startX + columns.slice(0, i).reduce((n, c) => n + c.width, 0);
      const text = row[col.key] === undefined || row[col.key] === null ? '' : String(row[col.key]);
      page.para(x, cursor + 1, text, {
        face: col.face || 'regular',
        size: col.size || fontSize,
        leading: col.leading || leading,
        colour: row.__accent && col.key === (row.__accentKey || col.key) ? palette.accent : col.colour || palette.body,
        maxWidth: col.width - (col.gap || 10),
        maxHeight: height,
        label: `${label}/${col.key}`
      });
    });
    page.line(startX, cursor + height - 1, startX + contentWidth, cursor + height - 1, palette.rule, 0.5);
    cursor += height;
    drawn += 1;
  }

  return { y: cursor, pageIndex, rowsDrawn: drawn, done: drawn === rows.length };
}
