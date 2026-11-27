/**
 * sprint.mjs — Structure B: **The Sprint Pack**. Pages organised by build order.
 *
 * What it is for: the four weeks after the yes. This is the document that sits open in a second
 * window while UEFN is in the first one. Its reader is not asking "what is this game" — they are
 * asking "what do I place next, and what do I set it to". So its organising axis is not the game, it
 * is the **order the work happens in**: modules are grouped into build phases, the settings are a
 * reference table rather than prose, and the answers get a page of their own because each one is a
 * change someone has to make in a Details panel.
 *
 * Why this is a different document and not a longer Brief: the Brief's organising axis is persuasion,
 * this one's is sequence. A long persuasive document is a bad sprint pack, and a short sequenced one
 * is a bad pitch. The three structures differ by *axis*, not by length — see the header of render.mjs.
 *
 * **Pagination here is measured, and measured once.** Two things have a variable height: a module card
 * (its purpose text may wrap to three lines) and a settings row (its advice may wrap to four). Both are
 * measured by the same exported function that draws them — `moduleCardHeight` and `ledgerRowHeight` —
 * because a paginator with its own estimator is exactly how a card ends up overlapping the one below
 * it. Everything is tested against `FLOOR` before it is drawn, and nothing is drawn twice.
 */

import { wrap, blockHeight } from '../pdf.mjs';
import { M, PAGE, CONTENT_WIDTH, PALETTES, PAGE_LIMIT, drawFooter, drawMissing, heading, eyebrow } from '../kit.mjs';

export const SPRINT_META = {
  id: 'sprint',
  name: 'The Sprint Pack',
  tagline: 'Built in the order you build it. Sits open beside the editor.',
  pages: '6+',
  reads: 'You, on a Tuesday, four weeks in.'
};

/** Three columns on a rhythm that divides CONTENT_WIDTH evenly. */
const COLS = 3;
const GUTTER = 15;
const COL_W = (CONTENT_WIDTH - GUTTER * (COLS - 1)) / COLS;

/** The lowest y anything may be drawn at, leaving room for the footer. One number, used everywhere. */
const FLOOR = PAGE.height - M.bottom - 24;

/** Type sizes, named once, because the paginator and the drawer must use the same ones. */
const T = {
  cardName: 8.8,
  cardRole: 5.6,
  cardBody: 7.4,
  cardBodyLead: 1.36,
  cardSource: 6.8,
  cardSourceLead: 1.28,
  ledgerName: 7.8,
  ledgerBody: 7.4,
  ledgerLead: 1.34
};

const GENERAL_W = 118;
const LEDGER_GAP = 20;
const LEDGER_SETTING_W = 148;
const LEDGER_DECISION_X = M.left + LEDGER_SETTING_W + GENERAL_W + LEDGER_GAP;
const LEDGER_DECISION_W = PAGE.width - M.right - LEDGER_DECISION_X;

/** Estimate of how long the document takes to read, printed on the cover. */
export function readingMinutes(model) {
  const words =
    380 +
    model.phases.reduce((n, p) => n + p.devices.length * 24, 0) +
    model.settingsRows.reduce((n, d) => n + d.settings.length * 18, 0) +
    model.notes.reduce((n, note) => n + note.text.split(/\s+/).length, 0);
  return Math.max(3, Math.round(words / 220));
}

/** Line count at a size and width, through the writer's own wrap so it cannot disagree with print. */
function lines(text, face, size, width) {
  return wrap(String(text || ''), face, size, width).length;
}

/* ============================== the two measured heights ==============================
 * Exported because they are the only arithmetic that decides a page break. A test asserts that the
 * page a card is drawn on is the page it was measured onto. */

/** The height a module card needs: heading, role, purpose, and the provenance line at its foot. */
export function moduleCardHeight(card) {
  const body =
    lines(card.device.purpose || '', 'regular', T.cardBody, COL_W - 20) * T.cardBody * T.cardBodyLead;
  const source =
    lines(card.device.sources.join(' · '), 'regular', T.cardSource, COL_W - 20) *
    T.cardSource *
    T.cardSourceLead;
  return 20 + body + 3 + source + 7;
}

/** The height a settings-ledger row needs. A device heading adds its own 26pt above the first row. */
export function ledgerRowHeight(row) {
  const general =
    lines(row.general, 'regular', T.ledgerBody, GENERAL_W) * T.ledgerBody * T.ledgerLead;
  const decision =
    lines(row.decision, 'regular', T.ledgerBody, LEDGER_DECISION_W) * T.ledgerBody * T.ledgerLead;
  return (row.device ? 26 : 0) + Math.max(general, decision) + 8;
}

export function renderSprint(model, options = {}) {
  const palette = PALETTES.sprint;
  /* The page total arrives on the renderer's second pass. It used to be shadowed further down by
   * `const total = sequence.length`, which is the number of rows in the cover's contents table and not
   * the number of pages — so the footer read "2 / 0" on every page of a nine-page document. It looked
   * like a rendering fault and was a variable named for one thing and holding another. */
  const { total = null } = options;
  const footer = (page) => drawFooter(page, model, palette, { total, label: 'Sprint Pack' });

  /* ============================== plan the page sequence ==============================
   * The sequence is decided before any page object exists, because the cover prints a contents table
   * with real page numbers and a contents table with guessed numbers is worse than none. */

  const moduleCards = model.phases.flatMap((phase) =>
    phase.devices.map((device) => ({ phase, device }))
  );
  const modulePages = paginateModules(moduleCards);
  const ledgerRows = settingsRowsFor(model);
  const ledgerPages = paginateLedger(ledgerRows);

  const moduleStart = 2;
  const ledgerStart = moduleStart + modulePages.length;
  const afterLedger = ledgerStart + ledgerPages.length;
  const sequence = [
    { id: 'cover', title: 'The pack in numbers', note: 'scope, read time, contents', page: 1 },
    ...modulePages.map((slice, i) => ({
      id: `modules-${i}`,
      title: i === 0 ? 'The modules, by build phase' : 'Modules (continued)',
      note:
        i === 0
          ? `${model.counts.devices} devices in ${model.phases.length} phases`
          : `${slice.length} more cards`,
      page: moduleStart + i
    })),
    ...ledgerPages.map((slice, i) => ({
      id: `ledger-${i}`,
      title: i === 0 ? 'Settings ledger' : 'Settings ledger (continued)',
      note: i === 0 ? `${model.counts.settings} settings, catalogue order` : `${slice.length} more rows`,
      page: ledgerStart + i
    })),
    {
      id: 'decisions',
      title: 'Decisions and their effects',
      note: `${model.answersCount} answers · ${model.counts.decisions} changed something`,
      page: afterLedger
    },
    {
      id: 'notes',
      title: 'Before you place anything',
      note: `${model.notes.length} notes from the data`,
      page: afterLedger + 1
    },
    { id: 'order', title: 'Build order', note: `${model.steps.length} steps`, page: afterLedger + 2 },
    { id: 'gaps', title: 'Open items', note: 'what this pack does not cover', page: afterLedger + 3 }
  ];

  const pages = [];

  /* ================================= page 1 · cover ================================= */

  pages.push({
    name: '1 · Cover',
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      page.rect(0, 0, PAGE.width, 208, palette.dark);
      page.text(M.left, 32, 'SPRINT PACK', {
        face: 'bold',
        size: 7.4,
        colour: palette.onDarkMuted,
        charSpace: 1.8
      });
      page.text(M.left, 48, model.name, {
        face: 'bold',
        size: 40,
        colour: palette.onDark,
        maxWidth: CONTENT_WIDTH
      });
      page.text(
        M.left,
        96,
        `${model.categoryLabel}  ·  ${model.typeLabel}${
          model.brandIsReal ? `  ·  ${model.brandLabel}` : ''
        }`,
        { face: 'regular', size: 10, colour: palette.onDarkMuted, maxWidth: CONTENT_WIDTH }
      );
      page.para(M.left, 116, model.pitchLine, {
        face: 'bold',
        size: 12.5,
        leading: 1.3,
        colour: palette.onDark,
        maxWidth: CONTENT_WIDTH - 80,
        maxHeight: 42,
        label: 'cover pitch'
      });
      page.text(M.left, 172, `${model.version}  ·  ${model.dateLabel}`, {
        face: 'regular',
        size: 9,
        colour: palette.onDarkMuted
      });
      page.text(PAGE.width - M.right, 172, `Read in about ${readingMinutes(model)} minutes`, {
        face: 'regular',
        size: 9,
        colour: palette.onDarkMuted,
        align: 'right',
        right: PAGE.width - M.right
      });

      /* the four numbers the pack is held to */
      let y = 238;
      page.text(M.left, y, 'THE PACK IN NUMBERS', {
        face: 'bold',
        size: 7.2,
        colour: palette.accent,
        charSpace: 1.1
      });
      const figures = [
        [String(model.counts.devices), 'MODULES TO PLACE'],
        [String(model.counts.settings), 'SETTINGS TO CHECK'],
        [String(model.counts.decisions), 'CHANGED BY AN ANSWER'],
        [String(model.steps.length), 'BUILD STEPS']
      ];
      const figW = CONTENT_WIDTH / figures.length;
      figures.forEach(([value, label], i) => {
        const x = M.left + i * figW;
        page.text(x, y + 14, value, { face: 'bold', size: 28, colour: palette.ink });
        page.text(x, y + 46, label, {
          face: 'bold',
          size: 6,
          colour: palette.muted,
          charSpace: 0.7,
          maxWidth: figW - 10
        });
        if (i) page.line(x - 8, y + 14, x - 8, y + 54, palette.rule, 0.5);
      });

      /* the contents, with the page numbers decided above */
      y += 84;
      page.line(M.left, y, PAGE.width - M.right, y, palette.ink, 1);
      sequence.forEach((entry) => {
        if (entry.id === 'cover') return;
        y += 14.5;
        page.text(M.left, y, entry.title, { face: 'bold', size: 9.2, colour: palette.ink });
        page.text(M.left + 216, y, entry.note, {
          face: 'regular',
          size: 7.8,
          colour: palette.muted,
          maxWidth: 230
        });
        page.text(PAGE.width - M.right, y, String(entry.page), {
          face: 'bold',
          size: 9,
          colour: palette.accent,
          align: 'right',
          right: PAGE.width - M.right
        });
        page.line(M.left, y + 11, PAGE.width - M.right, y + 11, palette.rule, 0.5);
      });

      /* and the one caveat that belongs on a cover
       *
       * The box is sized from the paragraph rather than fixed, because the paragraph's length depends on
       * the game type's name: a fixed 42pt box with `maxHeight: 22` held two lines, and a caveat that
       * wrapped to three had its last line placed *on top of* the second. The box's height and the
       * paragraph's `maxHeight` have to be the same number, and the only number that is right is the one
       * the text actually needs. */
      y += 28;
      const caveat = blockingCaveat(model);
      const caveatWidth = CONTENT_WIDTH - 24;
      const caveatHeight = blockHeight(caveat, {
        face: 'regular',
        size: 7.8,
        leading: 1.3,
        width: caveatWidth
      }).height;
      const boxHeight = caveatHeight + 20;
      page.rect(M.left, y, CONTENT_WIDTH, boxHeight, palette.accentSoft);
      page.rect(M.left, y, 3, boxHeight, palette.accent);
      page.text(M.left + 11, y + 6, 'BEFORE YOU START', {
        face: 'bold',
        size: 6.2,
        colour: palette.accent,
        charSpace: 0.9
      });
      page.para(M.left + 11, y + 17, caveat, {
        size: 7.8,
        leading: 1.3,
        colour: palette.ink,
        maxWidth: caveatWidth,
        maxHeight: caveatHeight + 1,
        label: 'cover caveat'
      });

      footer(page);
    }
  });

  /* ============================ the modules, by build phase ============================ */

  modulePages.forEach((slice, index) => {
    pages.push({
      name: `${moduleStart + index} · Modules`,
      width: PAGE.width,
      height: PAGE.height,
      limit: PAGE_LIMIT,
      draw(page) {
        let y = M.top;
        heading(page, M.left, y, index === 0 ? 'The modules' : 'The modules (continued)', palette);
        page.text(PAGE.width - M.right, y, 'in the order you place them', {
          face: 'regular',
          size: 7.2,
          colour: palette.muted,
          align: 'right',
          right: PAGE.width - M.right
        });
        y += 16;
        if (index === 0) {
          y = page.para(
            M.left,
            y,
            'Every device the plan resolves to, grouped by the phase of work it belongs to rather than ' +
              'by the panel it lives in. The line under each name is why it is there — "Always needed" ' +
              'and one of your own answers are different instructions to the person placing it.',
            {
              size: 8.4,
              leading: 1.4,
              colour: palette.body,
              maxWidth: CONTENT_WIDTH - 40,
              maxHeight: 40,
              label: 'modules intro'
            }
          );
        }
        y += 10;

        /* Three columns. A phase heading resets them to one baseline, so the grouping stays legible
         * even when a phase boundary falls at the foot of a page. The slice came from
         * `paginateModules`, which measured with `moduleCardHeight` — the same function used below —
         * so every card in the slice fits on this page by construction. */
        let columnY = [y, y, y];
        let currentPhase = null;

        slice.forEach((card) => {
          if (card.phase.id !== currentPhase) {
            if (currentPhase !== null) {
              const bottom = Math.max(...columnY);
              columnY = [bottom, bottom, bottom];
            }
            currentPhase = card.phase.id;
            const headingY = columnY[0];
            page.line(M.left, headingY, PAGE.width - M.right, headingY, palette.ink, 1);
            page.text(M.left, headingY + 6, card.phase.label, {
              face: 'bold',
              size: 11,
              colour: palette.ink
            });
            page.text(M.left, headingY + 20, card.phase.blurb, {
              face: 'regular',
              size: 7.2,
              colour: palette.muted,
              maxWidth: CONTENT_WIDTH - 120
            });
            page.text(PAGE.width - M.right, headingY + 8, String(card.phase.devices.length), {
              face: 'bold',
              size: 11,
              colour: palette.accent,
              align: 'right',
              right: PAGE.width - M.right
            });
            const next = headingY + 32;
            columnY = [next, next, next];
          }

          const height = moduleCardHeight(card);
          const target = columnY.indexOf(Math.min(...columnY));
          const x = M.left + target * (COL_W + GUTTER);
          if (columnY[target] + height <= FLOOR) {
            drawModuleCard(page, model, card, palette, x, columnY[target], height);
            columnY[target] += height + 9;
          }
        });

        footer(page);
      }
    });
  });

  /* ================================ the settings ledger ================================ */

  ledgerPages.forEach((slice, index) => {
    pages.push({
      name: `${ledgerStart + index} · Settings`,
      width: PAGE.width,
      height: PAGE.height,
      limit: PAGE_LIMIT,
      draw(page) {
        let y = M.top;
        heading(page, M.left, y, index === 0 ? 'Settings ledger' : 'Settings ledger (continued)', palette);
        page.text(PAGE.width - M.right, y, 'set these in order, with the Details panel open', {
          face: 'regular',
          size: 7.2,
          colour: palette.muted,
          align: 'right',
          right: PAGE.width - M.right
        });
        y += 16;
        if (index === 0) {
          y = page.para(
            M.left,
            y,
            `Every setting the plan touches, in catalogue order: ${model.counts.settings} of them across ` +
              `${model.counts.devices} devices. The middle block is what the device data recommends. The ` +
              `right-hand block is tinted wherever one of your answers changed the value — ` +
              `${model.counts.decisions} settings in this plan.`,
            {
              size: 8.4,
              leading: 1.4,
              colour: palette.body,
              maxWidth: CONTENT_WIDTH - 40,
              maxHeight: 40,
              label: 'ledger intro'
            }
          );
        }
        y += 10;
        drawLedgerSlice(page, slice, palette, y);
        footer(page);
      }
    });
  });

  /* =============================== decisions and effects =============================== */

  pages.push({
    name: `${afterLedger} · Decisions`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      heading(page, M.left, y, 'Decisions', palette);
      page.text(PAGE.width - M.right, y, 'every answer, and what it changed', {
        face: 'regular',
        size: 7.2,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 18;
      y = page.para(
        M.left,
        y,
        'Read this when a device is behaving oddly. Each row is a question you answered, the answer you ' +
          'gave, and what it did to the plan. A row marked "no effect" is not a defect — some options ' +
          'confirm the default — but it is worth knowing which of your answers did no work.',
        {
          size: 8.6,
          leading: 1.4,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 130,
          maxHeight: 52,
          label: 'decisions intro'
        }
      );

      page.text(PAGE.width - M.right - 118, M.top + 18, `${model.answersCount} of ${model.questionsCount}`, {
        face: 'bold',
        size: 20,
        colour: palette.ink
      });
      page.text(PAGE.width - M.right - 118, M.top + 42, 'QUESTIONS ANSWERED', {
        face: 'bold',
        size: 6,
        colour: palette.muted,
        charSpace: 0.7
      });

      const cols = [
        { x: M.left, w: 200, size: 8, face: 'regular', label: 'Question' },
        { x: M.left + 208, w: 88, size: 8, face: 'bold', label: 'Your answer' },
        { x: M.left + 300, w: CONTENT_WIDTH - 300, size: 8, face: 'regular', label: 'What changed' }
      ];
      y += 4;
      cols.forEach((col) => {
        page.text(col.x, y, col.label.toUpperCase(), {
          face: 'bold',
          size: 6.2,
          colour: palette.muted,
          charSpace: 0.8
        });
      });
      page.line(M.left, y + 11, PAGE.width - M.right, y + 11, palette.ink, 0.9);
      y += 13;

      model.decisions.forEach((d) => {
        const cells = [d.prompt, d.label, effectCell(d)];
        const height =
          Math.max(...cells.map((text, i) => lines(text, cols[i].face, cols[i].size, cols[i].w - 8))) *
            cols[0].size *
            1.34 +
          9;
        if (y + height > FLOOR) return;
        cells.forEach((text, i) => {
          page.para(cols[i].x, y + 2, text, {
            face: cols[i].face,
            size: cols[i].size,
            leading: 1.34,
            colour: i === 2 && !d.inert ? palette.ink : palette.body,
            maxWidth: cols[i].w - 8,
            maxHeight: height,
            label: `decision/${d.qId}/${i}`
          });
        });
        page.line(M.left, y + height - 2, PAGE.width - M.right, y + height - 2, palette.rule, 0.5);
        y += height;
      });

      if (model.unanswered.length) {
        y += 16;
        page.text(M.left, y, 'NOT ANSWERED — THE PLAN FALLS BACK TO THE GAME TYPE', {
          face: 'bold',
          size: 6.4,
          colour: palette.accent,
          charSpace: 0.9
        });
        model.unanswered.forEach((prompt) => {
          y = page.para(M.left, y + 12, `—  ${prompt}`, {
            size: 7.8,
            leading: 1.32,
            colour: palette.body,
            maxWidth: CONTENT_WIDTH,
            label: 'unanswered'
          });
        });
      }

      footer(page);
    }
  });

  /* ================================ notes and gotchas ================================ */

  pages.push({
    name: `${afterLedger + 1} · Gotchas`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      heading(page, M.left, y, 'Before you place anything', palette);
      page.text(PAGE.width - M.right, y, `${model.notes.length} notes from the device data`, {
        face: 'regular',
        size: 7.2,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 20;
      y = page.para(
        M.left,
        y,
        'The traps the device data records: a setting that does nothing without a second device, two ' +
          'devices to pick between, a win condition that has to be wired rather than selected. These are ' +
          'the cheapest hours you will ever save.',
        {
          size: 8.6,
          leading: 1.4,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 40,
          maxHeight: 40,
          label: 'notes intro'
        }
      );
      y += 10;

      if (!model.notes.length) {
        page.para(M.left, y, 'The device data records no pitfalls for this game type.', {
          size: 9,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH,
          label: 'no notes'
        });
      }

      const noteW = (CONTENT_WIDTH - 14) / 2;
      const colX = [M.left, M.left + noteW + 14];
      const colY = [y, y];
      model.notes.forEach((note, i) => {
        const bodyH = lines(note.text, 'regular', 8, noteW - 22) * 8 * 1.38;
        const height = bodyH + 30;
        const target = colY[0] <= colY[1] ? 0 : 1;
        if (colY[target] + height > FLOOR) return;
        const nx = colX[target];
        const ny = colY[target];
        page.rect(nx, ny, noteW, height, palette.panel);
        page.rect(nx, ny, 2.5, height, palette.accent);
        page.text(nx + 11, ny + 7, String(i + 1).padStart(2, '0'), {
          face: 'bold',
          size: 8,
          colour: palette.accent
        });
        page.text(nx + 25, ny + 7, note.source, {
          face: 'bold',
          size: 7,
          colour: palette.muted,
          maxWidth: noteW - 36
        });
        page.para(nx + 11, ny + 20, note.text, {
          size: 8,
          leading: 1.38,
          colour: palette.body,
          maxWidth: noteW - 22,
          maxHeight: bodyH + 4,
          label: `note ${i + 1}`
        });
        colY[target] += height + 10;
      });

      footer(page);
    }
  });

  /* ================================== build order ================================== */

  pages.push({
    name: `${afterLedger + 2} · Build order`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      heading(page, M.left, y, 'Build order', palette);
      page.text(PAGE.width - M.right, y, 'the steps, and what each one leaves behind', {
        face: 'regular',
        size: 7.2,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 22;

      model.steps.forEach((step, i) => {
        const bodyH = step.body.reduce(
          (n, lineText) => n + lines(lineText, 'regular', 8.2, CONTENT_WIDTH - 150) * 8.2 * 1.4 + 2,
          0
        );
        const tipH = step.tip ? lines(step.tip, 'italic', 7.6, CONTENT_WIDTH - 150) * 7.6 * 1.32 + 4 : 0;
        const height = 23 + bodyH + tipH + 6;
        if (y + height > FLOOR) return;

        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
        page.text(M.left, y + 6, String(i + 1).padStart(2, '0'), {
          face: 'bold',
          size: 15,
          colour: palette.accent
        });
        page.text(M.left, y + 24, 'STEP', {
          face: 'bold',
          size: 5.6,
          colour: palette.faint,
          charSpace: 0.7
        });
        page.text(M.left + 34, y + 7, step.title, { face: 'bold', size: 11.5, colour: palette.ink });

        let by = y + 23;
        step.body.forEach((lineText) => {
          by = page.para(M.left + 34, by, lineText, {
            size: 8.2,
            leading: 1.4,
            colour: palette.body,
            maxWidth: CONTENT_WIDTH - 150,
            maxHeight: lines(lineText, 'regular', 8.2, CONTENT_WIDTH - 150) * 8.2 * 1.4 + 2,
            label: `step ${i + 1} body`
          });
          by += 2;
        });
        if (step.tip) {
          page.para(M.left + 34, by + 2, step.tip, {
            face: 'italic',
            size: 7.6,
            leading: 1.32,
            colour: palette.accent,
            maxWidth: CONTENT_WIDTH - 150,
            maxHeight: tipH + 2,
            label: `step ${i + 1} tip`
          });
        }
        y += height;
      });

      y += 4;
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
      y += 12;
      page.text(M.left, y, 'THE PLAN THIS ORDER APPLIES TO', {
        face: 'bold',
        size: 6.4,
        colour: palette.accent,
        charSpace: 0.9
      });
      y += 12;
      const phaseW = (CONTENT_WIDTH - 3 * 10) / 4;
      model.phases.forEach((phase, i) => {
        const x = M.left + i * (phaseW + 10);
        page.text(x, y, phase.label, { face: 'bold', size: 8.4, colour: palette.ink });
        page.text(x, y + 12, `${phase.devices.length} modules`, {
          face: 'regular',
          size: 7.4,
          colour: palette.muted
        });
        page.para(x, y + 23, phase.blurb, {
          size: 6.8,
          leading: 1.3,
          colour: palette.faint,
          maxWidth: phaseW,
          maxHeight: lines(phase.blurb, 'regular', 6.8, phaseW) * 6.8 * 1.3 + 2,
          label: `phase blurb ${i}`
        });
      });

      footer(page);
    }
  });

  /* =================================== open items =================================== */

  pages.push({
    name: `${afterLedger + 3} · Open items`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      heading(page, M.left, y, 'Open items', palette);
      page.text(PAGE.width - M.right, y, 'what this pack does not cover', {
        face: 'regular',
        size: 7.2,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 22;
      y = drawMissing(page, model, palette, y, { columns: 2, title: 'Still yours to write' });
      y += 14;
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
      page.text(M.left, y + 8, 'CHECK BEFORE YOU PUBLISH', {
        face: 'bold',
        size: 6.4,
        colour: palette.accent,
        charSpace: 0.9
      });
      page.para(
        M.left,
        y + 19,
        `Resolved against Forge's catalogue v${model.provenance.dataVersion} (${model.provenance.deviceLibrary} ` +
          'devices). Device names and Details-panel field names change between UEFN releases: if a setting ' +
          'named here is not in the panel, check the current device documentation before assuming the plan is wrong.',
        {
          size: 7.8,
          leading: 1.38,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH,
          maxHeight: 40,
          label: 'publish check'
        }
      );

      footer(page);
    }
  });

  return pages;
}

/* ================================== module cards ================================== */

function drawModuleCard(page, model, card, palette, x, y, height) {
  const device = card.device;
  /* A device is "from an answer" when it is not the game type's own set, not the category baseline and
   * not universal. Those three sources are the plan's baseline; anything else is the user's doing, and
   * that distinction is the whole reason the line is printed. */
  const fromAnswer = device.sources.some(
    (s) => s !== 'Always needed' && s !== model.typeLabel && !/essentials$/.test(s)
  );

  page.rect(x, y, COL_W, height, fromAnswer ? palette.accentSoft : palette.panel);
  page.rect(x, y, 2.5, height, fromAnswer ? palette.accent : palette.panelEdge);
  page.text(x + 10, y + 6, device.name, {
    face: 'bold',
    size: T.cardName,
    colour: palette.ink,
    maxWidth: COL_W - 18
  });
  page.text(x + 10, y + 19, device.roleLabel.toUpperCase(), {
    face: 'bold',
    size: T.cardRole,
    colour: palette.faint,
    charSpace: 0.6,
    maxWidth: COL_W - 18
  });

  const purposeY = y + 28;
  const purposeH =
    lines(device.purpose || '', 'regular', T.cardBody, COL_W - 20) * T.cardBody * T.cardBodyLead;
  page.para(x + 10, purposeY, device.purpose || '', {
    size: T.cardBody,
    leading: T.cardBodyLead,
    colour: palette.body,
    maxWidth: COL_W - 20,
    maxHeight: purposeH + 2,
    label: `card/${device.name}`
  });

  const sourceH =
    lines(device.sources.join(' · '), 'regular', T.cardSource, COL_W - 20) *
    T.cardSource *
    T.cardSourceLead;
  page.para(x + 10, purposeY + purposeH + 3, device.sources.join(' · '), {
    face: 'italic',
    size: T.cardSource,
    leading: T.cardSourceLead,
    colour: fromAnswer ? palette.accent : palette.muted,
    maxWidth: COL_W - 20,
    maxHeight: sourceH + 2,
    label: `card-source/${device.name}`
  });
}

/**
 * Split the module cards into pages, by build phase.
 *
 * Uses `moduleCardHeight` — the measurement the drawer uses — so a card cannot be measured onto one
 * page and drawn on the next. A phase heading costs 32pt and resets the three columns to one baseline.
 */
function paginateModules(cards) {
  const pages = [];
  let current = [];
  let columnY = [M.top + 72, M.top + 72, M.top + 72];
  let currentPhase = null;

  const reset = (y) => {
    columnY = [y, y, y];
  };

  cards.forEach((card) => {
    if (card.phase.id !== currentPhase) {
      if (currentPhase !== null) reset(Math.max(...columnY));
      currentPhase = card.phase.id;
      reset(columnY[0] + 32);
    }

    const height = moduleCardHeight(card);
    let target = columnY.indexOf(Math.min(...columnY));

    if (columnY[target] + height > FLOOR) {
      pages.push(current);
      current = [];
      /* The phase heading is re-emitted on the new page, so the columns restart beneath it. */
      reset(M.top + 40);
      currentPhase = card.phase.id;
      reset(columnY[0] + 32);
      target = columnY.indexOf(Math.min(...columnY));
    }

    current.push(card);
    columnY[target] += height + 9;
  });

  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

/* ================================== the ledger ================================== */

/** One row per device–setting pair: the name, what the catalogue advises, what an answer changed. */
function settingsRowsFor(model) {
  const rows = [];
  model.settingsRows.forEach((device) => {
    device.settings.forEach((setting, i) => {
      rows.push({
        device: i === 0 ? device.device : '',
        role: i === 0 ? device.roleLabel : '',
        setting: setting.name + (setting.notInLibrary ? '  (not in the catalogue)' : ''),
        general: setting.general || '',
        decision: setting.decisions.length ? setting.decisions.map((d) => d.text).join(' ') : '—',
        decisionSource: setting.decisions.length ? setting.decisions[0].source : ''
      });
    });
  });
  return rows;
}

/** Split the ledger rows into pages using `ledgerRowHeight`, the drawer's own measurement. */
function paginateLedger(rows) {
  const pages = [];
  let current = [];
  let y = M.top + 50;
  rows.forEach((row) => {
    const height = ledgerRowHeight(row);
    if (y + height > FLOOR) {
      pages.push(current);
      current = [];
      y = M.top + 40;
    }
    current.push(row);
    y += height;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

/**
 * Draw one page of the settings ledger.
 *
 * Grouped by device, with a heavier rule at each new device, because that is the boundary a reader
 * scans for — and because the Details panel presents a device's settings the same way.
 */
function drawLedgerSlice(page, slice, palette, y) {
  page.text(M.left, y, 'SETTING', { face: 'bold', size: 6.2, colour: palette.muted, charSpace: 0.8 });
  page.text(M.left + LEDGER_SETTING_W, y, 'WHAT THE CATALOGUE ADVISES', {
    face: 'bold',
    size: 6.2,
    colour: palette.muted,
    charSpace: 0.8
  });
  page.text(LEDGER_DECISION_X, y, 'WHAT YOUR ANSWERS CHANGE', {
    face: 'bold',
    size: 6.2,
    colour: palette.accent,
    charSpace: 0.8
  });
  page.line(M.left, y + 10, PAGE.width - M.right, y + 10, palette.ink, 0.9);
  y += 13;

  slice.forEach((row) => {
    if (row.device) {
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.4);
      page.text(M.left, y + 5, row.device, { face: 'bold', size: 9.4, colour: palette.ink });
      page.text(M.left, y + 17, row.role.toUpperCase(), {
        face: 'bold',
        size: 5.6,
        colour: palette.faint,
        charSpace: 0.6
      });
      y += 26;
    }

    /* Measured in the box it is drawn in, not in the description column's width. The setting name used
     * to be measured against the wrong width, so a long name like "Show HUD Messages / Show Minimap /
     * etc." was laid out as one line and silently wrapped into two when it was drawn — which the row's
     * shared description height did not account for. */
    const nameH =
      lines(row.setting, 'bold', T.ledgerName, LEDGER_SETTING_W - 10) * T.ledgerName * T.ledgerLead;
    const generalH =
      lines(row.general, 'regular', T.ledgerBody, GENERAL_W) * T.ledgerBody * T.ledgerLead;
    const decisionH =
      lines(row.decision, 'regular', T.ledgerBody, LEDGER_DECISION_W) * T.ledgerBody * T.ledgerLead;
    const height = Math.max(nameH, generalH, decisionH) + 8;

    page.para(M.left, y + 1, row.setting, {
      face: 'bold',
      size: T.ledgerName,
      leading: T.ledgerLead,
      colour: palette.ink,
      maxWidth: LEDGER_SETTING_W - 10,
      maxHeight: nameH + 2,
      label: `setting/${row.setting}`
    });
    page.para(M.left + LEDGER_SETTING_W, y + 1, row.general, {
      size: T.ledgerBody,
      leading: T.ledgerLead,
      colour: palette.muted,
      maxWidth: GENERAL_W,
      maxHeight: generalH + 2,
      label: `general/${row.setting}`
    });
    if (row.decision !== '—') {
      page.rect(LEDGER_DECISION_X - 6, y - 1, LEDGER_DECISION_W + 6, height - 2, palette.accentSoft);
      page.para(LEDGER_DECISION_X, y + 1, row.decision, {
        size: T.ledgerBody,
        leading: T.ledgerLead,
        colour: palette.ink,
        maxWidth: LEDGER_DECISION_W - 8,
        maxHeight: decisionH + 2,
        label: `decision/${row.setting}`
      });
      page.text(LEDGER_DECISION_X, y + height - 8, `from your answer: ${row.decisionSource}`, {
        face: 'italic',
        size: 6,
        colour: palette.accent,
        maxWidth: LEDGER_DECISION_W - 8
      });
    } else {
      page.text(LEDGER_DECISION_X, y + 1, '—  leave the default', {
        face: 'regular',
        size: T.ledgerBody,
        colour: palette.faint
      });
    }
    page.line(M.left, y + height - 1, PAGE.width - M.right, y + height - 1, palette.rule, 0.4);
    y += height;
  });
  return y;
}

/* =================================== helpers =================================== */

function effectCell(d) {
  const parts = [];
  if (d.addedDevices.length) parts.push(`Added ${d.addedDevices.join(', ')}.`);
  d.setSettings.forEach((s) => parts.push(`Set ${s.device} → ${s.setting}.`));
  if (d.notes.length) parts.push('Added a note — see the notes page.');
  if (!parts.length) parts.push('No effect — this option confirms the default plan.');
  return parts.join(' ');
}

/** The one thing that must be said on a cover: the plan is the game type's, not a quoted budget. */
function blockingCaveat(model) {
  if (model.isBaselineOnly) {
    return 'This game type is still a draft in the catalogue, so the modules below come from the category baseline rather than a researched plan. Treat the list as a starting point.';
  }
  return `These are the ${model.typeLabel} plan plus the effects of your ${model.answersCount} answers. Place them in the listed order — devices further down depend on the choices above them.`;
}
