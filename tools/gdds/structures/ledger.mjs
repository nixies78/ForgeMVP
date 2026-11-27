/**
 * ledger.mjs — Structure C: **The Ledger**. Pages organised by device system and evidence.
 *
 * What it is for: proving the plan is right, and knowing what to do when it is not. Its reader is
 * either the person who will build it and needs to know *why* each device is there, or the person who
 * comes back in three months asking "why is there a Volume in my island". Neither of them wants
 * narrative. Both of them want to be able to point at a line and say "that is why".
 *
 * Its organising axis is therefore **provenance**: every device carries the source that asked for it,
 * every setting carries whether it is the catalogue default or a change the user made, and the
 * document can be checked against its own totals. That is a genuinely different document from the
 * Brief (persuasion) and the Sprint Pack (sequence) — it is the one you *audit*.
 *
 * Typographically it is the opposite of the Brief: near-monochrome, serif body, rules everywhere,
 * figures in a monospaced face so a column of them can be checked by eye. The severity is the point —
 * this is the document a reader trusts because it looks like it expects to be checked.
 *
 * It ends with a verification sheet rather than a summary, because a document that can be checked and
 * does not offer to be is leaving work on the table.
 *
 * Like the Sprint Pack, every page break here is measured: `cardHeight` is used both to decide where a
 * card goes and to draw it, so a card cannot be measured onto one page and drawn onto the next.
 */

import { wrap } from '../pdf.mjs';
import { M, PAGE, CONTENT_WIDTH, PALETTES, PAGE_LIMIT, drawFooter, drawMissing, eyebrow } from '../kit.mjs';

export const LEDGER_META = {
  id: 'ledger',
  name: 'The Ledger',
  tagline: 'Every device, every setting, and the decision that put it there.',
  pages: '6+',
  reads: 'Whoever has to defend the plan later — including you.'
};

const FLOOR = PAGE.height - M.bottom - 24;

/* Card geometry, named once so the measurer and the drawer cannot drift apart. */
const CARD = {
  head: 30,
  gapAfterPurpose: 8,
  foot: 18,
  columnGap: 40,
  purposeSize: 8,
  purposeLead: 1.36,
  adviceSize: 7.4,
  adviceLead: 1.34,
  changeSize: 7,
  changeLead: 1.3,
  rowPad: 11
};

const CARD_PURPOSE_W = CONTENT_WIDTH - 24;
const CARD_COL_W = (CONTENT_WIDTH - CARD.columnGap) / 2;
const CARD_ADVICE_W = CARD_COL_W - 12;

/** Line count through the writer's own wrap, so pagination and printing cannot disagree. */
function lines(text, face, size, width) {
  return wrap(String(text || ''), face, size, width).length;
}

/* =============================== the system card height ===============================
 * Exported because it is the only arithmetic that decides where a card breaks. The test asserts that
 * the page a card is drawn on is the page it was measured onto. */

export function cardHeight(device) {
  const purpose =
    lines(device.purpose || '', 'serifItalic', CARD.purposeSize, CARD_PURPOSE_W) *
    CARD.purposeSize *
    CARD.purposeLead;
  const perColumn = Math.ceil(device.settings.length / 2);
  const columnHeight = (rows) => rows.reduce((n, setting) => n + settingRowHeight(setting), 0);
  const settingsHeight = Math.max(
    columnHeight(device.settings.slice(0, perColumn)),
    columnHeight(device.settings.slice(perColumn))
  );
  return CARD.head + purpose + CARD.gapAfterPurpose + settingsHeight + CARD.foot;
}

function settingRowHeight(setting) {
  const advice = lines(setting.general || '', 'serif', CARD.adviceSize, CARD_ADVICE_W);
  const change = setting.decisions.length
    ? lines(setting.decisions.map((d) => d.text).join(' '), 'serifItalic', CARD.changeSize, CARD_ADVICE_W)
    : 0;
  return (
    CARD.rowPad +
    Math.max(advice, 1) * CARD.adviceSize * CARD.adviceLead +
    change * CARD.changeSize * CARD.changeLead +
    6
  );
}

export function renderLedger(model, options = {}) {
  const palette = PALETTES.ledger;
  const footer = (page, total) => drawFooter(page, model, palette, { total, label: 'Design Ledger' });

  /* ------------------------------ plan the page sequence ------------------------------ */

  const systemSlices = paginateSystems(model);
  const tracePage = 3 + systemSlices.length;
  const gapsPage = tracePage + 1;
  const sequence = [
    { id: 'title', title: 'Title and provenance', page: 1 },
    { id: 'verify', title: 'Verification sheet', page: 2 },
    ...systemSlices.map((slice, i) => ({
      id: `systems-${i}`,
      title: i === 0 ? 'The systems' : 'Systems (continued)',
      page: 3 + i
    })),
    { id: 'trace', title: 'Decision traceability', page: tracePage },
    { id: 'gaps', title: 'Open items', page: gapsPage }
  ];
  const total = sequence.length;

  const pages = [];

  /* ============================== page 1 · title sheet ============================== */

  pages.push({
    name: '1 · Title',
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      /* A ruled title sheet: no colour block, a heavy rule, and the document's own terms stated. */
      page.line(M.left, 60, PAGE.width - M.right, 60, palette.ink, 2);
      page.text(M.left, 70, 'DESIGN LEDGER', {
        face: 'bold',
        size: 7.6,
        colour: palette.muted,
        charSpace: 2
      });
      page.text(M.left, 86, model.name, {
        face: 'serifBold',
        size: 40,
        colour: palette.ink,
        maxWidth: CONTENT_WIDTH
      });
      page.text(
        M.left,
        134,
        `${model.categoryLabel} · ${model.typeLabel}${model.brandIsReal ? ` · ${model.brandLabel}` : ''}`,
        { face: 'serifItalic', size: 11.5, colour: palette.body, maxWidth: CONTENT_WIDTH }
      );
      page.para(M.left, 154, model.pitchLine, {
        face: 'serif',
        size: 12,
        leading: 1.35,
        colour: palette.muted,
        maxWidth: CONTENT_WIDTH - 120,
        maxHeight: 36,
        label: 'ledger standfirst'
      });

      /* the document's terms, as a table, because a ledger states its terms */
      let y = 214;
      page.text(M.left, y, 'PROVENANCE', { face: 'bold', size: 6.6, colour: palette.accent, charSpace: 1 });
      y += 12;
      const terms = [
        ['Design', `${model.typeLabel}, ${model.categoryLabel}`],
        ['Brand template', model.brandIsReal ? model.brandLabel : 'None — original IP'],
        ['Questions answered', `${model.answersCount} of ${model.questionsCount}`],
        ['Devices in the plan', `${model.counts.devices} (${model.counts.core} core, ${model.counts.polish} polish)`],
        ['Settings touched', `${model.counts.settings}, of which ${model.counts.decisions} changed by an answer`],
        ['Device catalogue', `Forge v${model.provenance.dataVersion} — ${model.provenance.deviceLibrary} devices`],
        ['Resolved on', model.dateLabel],
        ['Document version', `${model.version} — the same answers regenerate this document exactly`]
      ];
      terms.forEach(([term, value]) => {
        const valueLines = lines(value, 'serifBold', 9, CONTENT_WIDTH - 150);
        const height = Math.max(20, valueLines * 9 * 1.3 + 11);
        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
        page.text(M.left, y + 5, term, { face: 'serif', size: 9, colour: palette.muted });
        page.para(M.left + 150, y + 5, value, {
          face: 'serifBold',
          size: 9,
          leading: 1.3,
          colour: palette.ink,
          maxWidth: CONTENT_WIDTH - 150,
          maxHeight: height - 4,
          label: `term/${term}`
        });
        y += height;
      });
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);

      /* the terms of the document itself */
      y += 20;
      const termsText = ledgerTermsText();
      const termsH = 18 + lines(termsText, 'serif', 8.6, CONTENT_WIDTH - 24) * 8.6 * 1.4;
      page.rect(M.left, y, CONTENT_WIDTH, termsH, palette.panel);
      page.text(M.left + 11, y + 7, 'WHAT THIS DOCUMENT IS', {
        face: 'bold',
        size: 6.4,
        colour: palette.accent,
        charSpace: 0.9
      });
      page.para(M.left + 11, y + 18, termsText, {
        face: 'serif',
        size: 8.6,
        leading: 1.4,
        colour: palette.body,
        maxWidth: CONTENT_WIDTH - 24,
        maxHeight: termsH - 16,
        label: 'ledger terms'
      });

      y += termsH + 20;
      page.text(M.left, y, 'CONTENTS', { face: 'bold', size: 6.6, colour: palette.accent, charSpace: 1 });
      y += 12;
      sequence.forEach((entry) => {
        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.4);
        page.text(M.left, y + 5, entry.title, { face: 'serif', size: 9.4, colour: palette.ink });
        page.text(PAGE.width - M.right - 40, y + 5, String(entry.page), {
          face: 'mono',
          size: 9,
          colour: palette.body,
          align: 'right',
          right: PAGE.width - M.right - 40
        });
        y += 18;
      });

      footer(page, total);
    }
  });

  /* =========================== page 2 · verification sheet =========================== */

  pages.push({
    name: '2 · Verification',
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      eyebrow(page, M.left, y, 'Verification sheet', palette, { colour: palette.ink });
      page.text(PAGE.width - M.right, y, 'check these against your island', {
        face: 'serifItalic',
        size: 8,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 18;
      y = page.para(
        M.left,
        y,
        'The plan is arithmetic: a base set of devices for the game type, plus a device or a setting for ' +
          'each answer. So it can be checked. Each line below is a total this document asserts, with the ' +
          'check that would have to be true for it to be wrong.',
        {
          face: 'serif',
          size: 9,
          leading: 1.42,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 150,
          maxHeight: 50,
          label: 'verify intro'
        }
      );

      y += 8;
      const checks = verificationChecks(model);
      checks.forEach((check) => {
        const noteLines = lines(check.note, 'serif', 7.6, CONTENT_WIDTH - 96);
        const height = Math.max(30, noteLines * 7.6 * 1.32 + 24);
        if (y + height > FLOOR) return;
        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
        page.text(M.left, y + 8, check.value, {
          face: 'monoBold',
          size: 14,
          colour: check.ok ? palette.ink : palette.accent
        });
        page.text(M.left + 96, y + 8, check.label, {
          face: 'bold',
          size: 8.4,
          colour: palette.ink,
          maxWidth: CONTENT_WIDTH - 96
        });
        page.para(M.left + 96, y + 19, check.note, {
          face: 'serif',
          size: 7.6,
          leading: 1.32,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH - 96,
          maxHeight: noteLines * 7.6 * 1.32 + 2,
          label: `check/${check.label}`
        });
        y += height;
      });
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);

      /* the answers, listed, because they are the ledger's inputs */
      y += 20;
      page.text(M.left, y, 'INPUTS — THE ANSWERS THIS PLAN WAS RESOLVED FROM', {
        face: 'bold',
        size: 6.6,
        colour: palette.accent,
        charSpace: 0.9
      });
      y += 12;
      if (!model.decisions.length) {
        y = page.para(M.left, y + 4, 'No questions were answered; the plan is the game type\u2019s own set.', {
          face: 'serif',
          size: 9,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH,
          label: 'no answers'
        });
      }
      model.decisions.forEach((d, i) => {
        const promptLines = lines(d.prompt, 'serif', 8.4, CONTENT_WIDTH - 200);
        const valueLines = lines(d.label, 'serifBold', 8.4, 170);
        const height = Math.max(promptLines, valueLines) * 8.4 * 1.3 + 8;
        if (y + height > FLOOR) return;
        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.4);
        page.text(M.left, y + 5, String(i + 1).padStart(2, '0'), {
          face: 'mono',
          size: 8.4,
          colour: palette.muted
        });
        page.para(M.left + 22, y + 5, d.prompt, {
          face: 'serif',
          size: 8.4,
          leading: 1.3,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 200,
          maxHeight: promptLines * 8.4 * 1.3 + 2,
          label: `input/${d.qId}`
        });
        page.para(M.left + CONTENT_WIDTH - 170, y + 5, d.label, {
          face: 'serifBold',
          size: 8.4,
          leading: 1.3,
          colour: palette.ink,
          maxWidth: 170,
          maxHeight: valueLines * 8.4 * 1.3 + 2,
          label: `input-value/${d.qId}`
        });
        y += height;
      });

      footer(page, total);
    }
  });

  /* ======================== pages 3..n · the systems, one card each ======================== */

  systemSlices.forEach((slice, index) => {
    pages.push({
      name: `${3 + index} · Systems`,
      width: PAGE.width,
      height: PAGE.height,
      limit: PAGE_LIMIT,
      draw(page) {
        let y = M.top;
        eyebrow(page, M.left, y, index === 0 ? 'The systems' : 'The systems (continued)', palette, {
          colour: palette.ink
        });
        page.text(PAGE.width - M.right, y, `${model.counts.devices} devices · by role`, {
          face: 'serifItalic',
          size: 8,
          colour: palette.muted,
          align: 'right',
          right: PAGE.width - M.right
        });
        y += 16;
        if (index === 0) {
          y = page.para(
            M.left,
            y,
            'One card per device. The role is the group the catalogue files it under; the italic line at ' +
              'the foot of each card is the source that asked for it, which is the line to quote when ' +
              'somebody questions the device. Settings are listed with the catalogue\u2019s own advice, and ' +
              'any that one of your answers changed is marked.',
            {
              face: 'serif',
              size: 8.6,
              leading: 1.4,
              colour: palette.body,
              maxWidth: CONTENT_WIDTH - 60,
              maxHeight: 48,
              label: 'systems intro'
            }
          );
        }
        y += 8;

        slice.forEach((device) => {
          const height = cardHeight(device);
          if (y + height > FLOOR) return;
          drawSystemCard(page, device, palette, y, height);
          y += height + 8;
        });

        footer(page, total);
      }
    });
  });

  /* ====================== page · decision traceability (the point) ====================== */

  pages.push({
    name: `${tracePage} · Traceability`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      eyebrow(page, M.left, y, 'Decision traceability', palette, { colour: palette.ink });
      page.text(PAGE.width - M.right, y, 'answer → effect → device', {
        face: 'serifItalic',
        size: 8,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 18;
      y = page.para(
        M.left,
        y,
        'The whole chain, one row per effect. This is the page that answers "why is this here?" without ' +
          'anybody having to remember. A row whose effect is empty is an answer that changed nothing, ' +
          'recorded anyway so the omission is visible rather than assumed.',
        {
          face: 'serif',
          size: 8.8,
          leading: 1.42,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 130,
          maxHeight: 50,
          label: 'trace intro'
        }
      );
      y += 8;

      const cols = [
        { x: M.left, w: 24, label: '#' },
        { x: M.left + 26, w: 150, label: 'Answer' },
        { x: M.left + 178, w: 92, label: 'Effect' },
        { x: M.left + 274, w: CONTENT_WIDTH - 274, label: 'Lands on' }
      ];
      const traceRows = traceability(model);

      if (!traceRows.length) {
        y = page.para(M.left, y, 'No answers were given, so there is nothing to trace.', {
          face: 'serif',
          size: 9,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH,
          label: 'no trace'
        });
      }

      cols.forEach((col) => {
        page.text(col.x, y, col.label.toUpperCase(), {
          face: 'bold',
          size: 6.2,
          colour: palette.muted,
          charSpace: 0.8
        });
      });
      page.line(M.left, y + 10, PAGE.width - M.right, y + 10, palette.ink, 0.9);
      y += 12;

      traceRows.forEach((row) => {
        /* Each cell is measured at the size it will be drawn at, so `maxHeight` is a real budget and
         * the row's rule lands below all three cells rather than through one of them. */
        const bodyLines = Math.max(
          lines(row.answer, 'serifBold', 8, cols[1].w - 8),
          lines(row.effect, 'serif', 8, cols[2].w - 8),
          lines(row.lands, row.inert ? 'serifItalic' : 'serif', 8, cols[3].w - 8)
        );
        const height = bodyLines * 8 * 1.32 + 8;
        if (y + height > FLOOR) return;

        page.text(cols[0].x, y + 2, row.n, { face: 'mono', size: 8, colour: palette.muted });
        page.para(cols[1].x, y + 2, row.answer, {
          face: 'serifBold',
          size: 8,
          leading: 1.32,
          colour: palette.ink,
          maxWidth: cols[1].w - 8,
          maxHeight: height,
          label: `trace/${row.n}/answer`
        });
        page.para(cols[2].x, y + 2, row.effect, {
          face: 'serif',
          size: 8,
          leading: 1.32,
          colour: row.inert ? palette.faint : palette.body,
          maxWidth: cols[2].w - 8,
          maxHeight: height,
          label: `trace/${row.n}/effect`
        });
        page.para(cols[3].x, y + 2, row.lands, {
          face: row.inert ? 'serifItalic' : 'serif',
          size: 8,
          leading: 1.32,
          colour: row.inert ? palette.faint : palette.body,
          maxWidth: cols[3].w - 8,
          maxHeight: height,
          label: `trace/${row.n}/lands`
        });
        page.line(M.left, y + height - 2, PAGE.width - M.right, y + height - 2, palette.rule, 0.4);
        y += height;
      });

      footer(page, total);
    }
  });

  /* ==================================== open items ==================================== */

  pages.push({
    name: `${gapsPage} · Open items`,
    width: PAGE.width,
    height: PAGE.height,
    limit: PAGE_LIMIT,
    draw(page) {
      let y = M.top;
      eyebrow(page, M.left, y, 'Open items', palette, { colour: palette.ink });
      page.text(PAGE.width - M.right, y, 'stated, not omitted', {
        face: 'serifItalic',
        size: 8,
        colour: palette.muted,
        align: 'right',
        right: PAGE.width - M.right
      });
      y += 20;
      y = page.para(
        M.left,
        y,
        'A ledger is only worth as much as its list of what is missing. The sections below belong in a ' +
          'design document and are not derivable from a device questionnaire, so this document records ' +
          'them as outstanding rather than filling them with something plausible.',
        {
          face: 'serif',
          size: 9,
          leading: 1.42,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 60,
          maxHeight: 50,
          label: 'open intro'
        }
      );
      y += 50;
      y = drawMissing(page, model, palette, y, { columns: 2, title: 'Outstanding sections' });
      y += 18;
      page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.5);
      page.text(M.left, y + 8, 'CATALOGUE CAVEAT', {
        face: 'bold',
        size: 6.4,
        colour: palette.accent,
        charSpace: 0.9
      });
      page.para(
        M.left,
        y + 19,
        `Resolved against Forge's catalogue v${model.provenance.dataVersion} of ${model.provenance.deviceLibrary} ` +
          'devices. Device names and Details-panel field names change between UEFN releases. If a setting ' +
          'named in this ledger is not in the panel, check the current device documentation before ' +
          'concluding the plan is wrong — and if the field has been renamed, the ledger can be regenerated ' +
          'from the same answers once the catalogue is updated.',
        {
          face: 'serif',
          size: 8,
          leading: 1.4,
          colour: palette.muted,
          maxWidth: CONTENT_WIDTH,
          maxHeight: 50,
          label: 'ledger caveat'
        }
      );
      footer(page, total);
    }
  });

  return pages;
}

/* ================================== system cards ================================== */

/**
 * Draw one system card.
 *
 * The card's bands are exactly the ones `cardHeight` measured: the caller passes the height, and every
 * band inside it is derived from the same `CARD` constants. That is the contract — if the two ever
 * diverge, the provenance line at the foot lands on top of the last setting.
 */
function drawSystemCard(page, device, palette, y, height) {
  page.line(M.left, y, PAGE.width - M.right, y, palette.ink, 1);
  page.text(M.left, y + 6, device.name, { face: 'serifBold', size: 12, colour: palette.ink });
  page.text(
    M.left,
    y + 21,
    `${device.roleLabel.toUpperCase()}   ·   ${device.settings.length} SETTING${device.settings.length === 1 ? '' : 'S'}`,
    { face: 'bold', size: 6, colour: palette.muted, charSpace: 0.7 }
  );
  page.text(PAGE.width - M.right, y + 7, `#${String(device.index).padStart(2, '0')}`, {
    face: 'mono',
    size: 10,
    colour: palette.faint,
    align: 'right',
    right: PAGE.width - M.right
  });

  const purposeLines = lines(device.purpose || '', 'serifItalic', CARD.purposeSize, CARD_PURPOSE_W);
  let cy = y + CARD.head;
  cy = page.para(M.left, cy, device.purpose || '', {
    face: 'serifItalic',
    size: CARD.purposeSize,
    leading: CARD.purposeLead,
    colour: palette.muted,
    maxWidth: CARD_PURPOSE_W,
    maxHeight: purposeLines * CARD.purposeSize * CARD.purposeLead + 2,
    label: `purpose/${device.name}`
  });

  const perColumn = Math.ceil(device.settings.length / 2);
  [0, 1].forEach((columnIndex) => {
    const rows = device.settings.slice(columnIndex * perColumn, (columnIndex + 1) * perColumn);
    let sy = cy + CARD.gapAfterPurpose;
    const x = M.left + columnIndex * (CARD_COL_W + CARD.columnGap);
    rows.forEach((setting) => {
      const rowHeight = settingRowHeight(setting);
      const changed = setting.decisions.length > 0;
      const advice = setting.general || '';
      const adviceLines = lines(advice, 'serif', CARD.adviceSize, CARD_ADVICE_W);
      const changeText = changed ? setting.decisions.map((d) => d.text).join(' ') : '';
      const changeLines = changed
        ? lines(changeText, 'serifItalic', CARD.changeSize, CARD_ADVICE_W)
        : 0;

      if (changed) page.rect(x - 4, sy - 2, CARD_COL_W + 4, rowHeight - 3, palette.accentSoft);
      page.text(x, sy, setting.name, {
        face: 'serifBold',
        size: 8,
        colour: palette.ink,
        maxWidth: CARD_ADVICE_W
      });
      if (changed) {
        page.text(x + CARD_COL_W - 12, sy, 'CHANGED', {
          face: 'bold',
          size: 5.4,
          colour: palette.accent,
          align: 'right',
          right: PAGE.width - M.right,
          
          charSpace: 0.6
        });
      }
      let ay = sy + CARD.rowPad;
      ay = page.para(x, ay, advice, {
        face: 'serif',
        size: CARD.adviceSize,
        leading: CARD.adviceLead,
        colour: palette.body,
        maxWidth: CARD_ADVICE_W,
        maxHeight: adviceLines * CARD.adviceSize * CARD.adviceLead + 2,
        label: `advice/${setting.name}`
      });
      if (changed) {
        page.para(x, ay + 1, changeText, {
          face: 'serifItalic',
          size: CARD.changeSize,
          leading: CARD.changeLead,
          colour: palette.accent,
          maxWidth: CARD_ADVICE_W,
          maxHeight: changeLines * CARD.changeSize * CARD.changeLead + 2,
          label: `change/${setting.name}`
        });
      }
      sy += rowHeight;
    });
  });

  /* the provenance line at the foot — the card's reason to exist */
  const footY = y + height - CARD.foot + 5;
  page.line(M.left, footY, PAGE.width - M.right, footY, palette.rule, 0.4);
  page.text(M.left, footY + 4, `Asked for by: ${device.sources.join(' · ')}`, {
    face: 'serifItalic',
    size: 7.2,
    colour: palette.muted,
    maxWidth: CONTENT_WIDTH
  });
}

/**
 * Split the devices into pages of cards, measured.
 *
 * Devices keep catalogue order within their role. The first page carries the running head plus the
 * intro paragraph and later pages carry only the head — a 56pt difference the split has to know about,
 * which is why the top offsets below are not the same number.
 */
function paginateSystems(model) {
  const devices = model.settingsRows.map((row, i) => ({ ...row, index: i + 1 }));

  const pages = [];
  let current = [];
  let y = M.top + 56;
  devices.forEach((device) => {
    const height = cardHeight(device);
    if (y + height > FLOOR) {
      pages.push(current);
      current = [];
      y = M.top + 30;
    }
    current.push(device);
    y += height + 8;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

/* =================================== traceability =================================== */

/**
 * One row per effect of every answer — the answer → effect → device chain.
 *
 * Effects are exploded rather than summarised: an answer that adds three devices and sets one setting
 * becomes four rows, because a summary row cannot be pointed at. This is the page that makes the
 * document auditable, so its rows are the smallest unit of evidence rather than the smallest unit of
 * typing.
 */
function traceability(model) {
  const rows = [];
  let n = 0;
  model.decisions.forEach((decision) => {
    const push = (effect, lands, inert) => {
      n += 1;
      rows.push({
        n: String(n).padStart(2, '0'),
        answer: decision.label,
        effect,
        lands,
        inert: Boolean(inert)
      });
    };
    decision.addedDevices.forEach((device) => push('adds a device', device));
    decision.setSettings.forEach((setting) =>
      push('changes a setting', `${setting.device} → ${setting.setting}`)
    );
    if (decision.notes.length) push('adds a note', `${decision.notes[0].slice(0, 96)}…`);
    if (decision.inert) push('no effect', 'This option confirms the default plan. Nothing to change.', true);
  });
  return rows;
}

/* ================================= verification sheet ================================= */

/**
 * The checks the document asserts about itself.
 *
 * Computed from the model, not typed in, so the sheet cannot drift from the plan it describes — which
 * is the failure mode of a hand-written verification page. `ok` is false when a check finds something
 * a reader should look at, and the figure is coloured accordingly.
 */
function verificationChecks(model) {
  const seen = new Map();
  model.settingsRows.forEach((device) => {
    device.settings.forEach((setting) => {
      const key = `${device.device}::${setting.name}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
  });
  const duplicated = [...seen.values()].filter((n) => n > 1).length;
  const decisionsWithoutEffect = model.decisions.filter((d) => d.inert).length;
  const settingsWithoutAdvice = model.settingsRows.reduce(
    (n, device) => n + device.settings.filter((s) => !s.general).length,
    0
  );

  return [
    {
      value: String(model.counts.devices),
      label: 'Devices asserted',
      note: `${model.counts.core} core plus ${model.counts.polish} polish. Pick a device at random from the build and it should be on the systems cards.`,
      ok: true
    },
    {
      value: String(model.counts.settings),
      label: 'Settings asserted',
      note: 'One row per device–setting pair in the ledger. Count them and the figure should match.',
      ok: true
    },
    {
      value: String(model.counts.decisions),
      label: 'Settings changed by an answer',
      note: 'Each one is tinted on its card and in the ledger, so it can be found without reading.',
      ok: true
    },
    {
      value: duplicated === 0 ? '0' : String(duplicated),
      label: 'Duplicate setting rows',
      note:
        duplicated === 0
          ? 'No setting appears twice for the same device.'
          : 'A setting is listed twice for one device — check the catalogue entry before building from it.',
      ok: duplicated === 0
    },
    {
      value: settingsWithoutAdvice === 0 ? '0' : String(settingsWithoutAdvice),
      label: 'Settings with no catalogue advice',
      note:
        settingsWithoutAdvice === 0
          ? 'Every setting in this plan carries a recommendation from the device data.'
          : 'These were changed by an answer without the catalogue offering guidance on them.',
      ok: settingsWithoutAdvice === 0
    },
    {
      value: String(decisionsWithoutEffect),
      label: 'Answers that changed nothing',
      note: 'Recorded rather than hidden: an answer with no effect is valid, and knowing which one it was saves a hunt later.',
      ok: true
    },
    {
      value: `${model.answersCount}/${model.questionsCount}`,
      label: 'Questions answered',
      note: model.unanswered.length
        ? `${model.unanswered.length} unanswered — the plan uses the game type\u2019s default for those.`
        : 'Every question this game type asks has an answer.',
      ok: model.unanswered.length === 0
    }
  ];
}

/** The paragraph in the "what this document is" box on the title sheet. */
function ledgerTermsText() {
  return (
    'A record of a resolved plan, not a design. Everything in it was derived from the game type and ' +
    'the answers listed on the next page, and none of it was written by hand. Where the tool had no ' +
    'basis for a section, the section says so rather than guessing — see the open items at the back.'
  );
}
