/**
 * brief.mjs — Structure A: **The Brief**. One page. Share it in a Discord message.
 *
 * What it is for: the moment before anyone commits. A creator deciding whether an idea is worth a
 * month, sending it to three friends to see if they will turn up, or pasting it into a voice-chat
 * thread. That reader is moving; they will not open a page two.
 *
 * This is the "one-page design doc" the industry keeps arriving back at, and the reason is not
 * brevity for its own sake — it is that a document nobody finishes communicates nothing. See
 * support/gdd-export.md for the sources behind each of the three structures.
 *
 * **The design rule for this page is subtraction, and it is enforced rather than intended.** There is
 * exactly one screenful of room: the device plan is reduced to a count and the four groups it falls
 * into, the settings to one line, and the missing sections to a single sentence naming them all.
 * Everything a reader might want next is on the other two structures — which is the honest place for
 * it, because this page's job is to be read.
 *
 * **Every block below is given a height budget and the total is checked.** The band comments in the
 * margin are the layout: the bands are sized so the page ends at 630pt with the footer at 784pt, and
 * every variable-height block asks for a `maxHeight` so that a longer pitch or a longer layout tip is
 * reported by `buildPdf` and fails the build rather than quietly pushing the tip off the page. A
 * one-page document that silently becomes two is this structure's characteristic failure.
 */

import { M, PAGE, CONTENT_WIDTH, PALETTES, PAGE_LIMIT, drawFooter, eyebrow } from '../kit.mjs';

export const BRIEF_META = {
  id: 'brief',
  name: 'The Brief',
  tagline: 'One page. Share it with the people you need a yes from.',
  pages: 1,
  reads: 'A friend, a collaborator, or past you in three weeks.'
};

export function renderBrief(model, options = {}) {
  const palette = PALETTES.brief;
  const { total = 1 } = options;

  return [
    {
      name: 'The Brief',
      width: PAGE.width,
      height: PAGE.height,
      limit: PAGE_LIMIT,
      draw(page) {
        /* --------------------------- masthead band · 0 → 112 --------------------------- */
        page.rect(0, 0, PAGE.width, 112, palette.dark);
        page.text(M.left, 28, 'GAME DESIGN BRIEF', {
          face: 'bold',
          size: 7.4,
          colour: palette.onDarkMuted,
          charSpace: 1.6
        });
        page.text(M.left, 42, model.name, {
          face: 'bold',
          size: 36,
          colour: palette.onDark,
          maxWidth: 330
        });
        page.text(
          M.left,
          86,
          `${model.categoryLabel}  ·  ${model.typeLabel}${
            model.brandIsReal ? `  ·  ${model.brandLabel}` : ''
          }  ·  ${model.version}`,
          { face: 'regular', size: 9, colour: palette.onDarkMuted, maxWidth: 400 }
        );

        /* The one number a reader can act on, on the dark band where the eye lands first.
         *
         * Note there is no `maxWidth` here, and that is deliberate: for an aligned run the box already
         * runs from `x` to the page's right margin, so a `maxWidth` could only ever narrow it. Passing
         * one is how the number this page leads with ended up printed 94pt into the margin — see the
         * clamp in pdf.mjs. Right-aligned and centred runs simply name the edge they align to. */
        page.text(PAGE.width - M.right, 40, String(model.counts.devices), {
          face: 'bold',
          size: 38,
          colour: palette.highlight,
          align: 'right',
          right: PAGE.width - M.right
        });
        page.text(PAGE.width - M.right, 82, 'DEVICES TO PLACE', {
          face: 'bold',
          size: 6.4,
          colour: palette.onDarkMuted,
          align: 'right',
          right: PAGE.width - M.right,
          charSpace: 0.9
        });

        /* ------------------------------ the pitch · 130 → 222 · 92pt ------------------------------ */
        let y = 130;
        y = page.para(M.left, y, model.pitchLine, {
          face: 'bold',
          size: 18,
          leading: 1.24,
          colour: palette.ink,
          maxWidth: CONTENT_WIDTH,
          maxHeight: 45,
          label: 'pitch line'
        });
        y += 6;
        if (model.hook) {
          y = page.text(M.left, y, `It plays ${lowerFirst(model.hookName)}.`, {
            face: 'italic',
            size: 11.5,
            colour: palette.accent
          });
          y += 3;
        }
        page.para(M.left, y + 5, model.typeDescription, {
          size: 9.4,
          leading: 1.4,
          colour: palette.body,
          maxWidth: CONTENT_WIDTH - 24,
          maxHeight: 28,
          label: 'type description'
        });

        /* ---------------------------- the facts strip · 232 → 280 · 48pt ----------------------------
         * At most three cells, and never more. Five fitted only if the values were short, and this
         * catalogue's are not: "Together against the game" needs 108pt at 8.6pt bold, so a five-way
         * split of 483pt clipped it — which the overflow report caught, twice. So the row is built from
         * the facts that exist rather than from a fixed list, and the players cell carries a second
         * labelled line for the session length rather than joining the two into one run-on. The verb
         * fact is dropped rather than trimmed, because the pitch line above already names the game type
         * and the hook and a third statement of it was the most disposable thing on the page.
         *
         * Drawn on the page's own background with rules between the cells rather than as a filled
         * panel, because three wide cells separated by hairlines read as a data row and a filled box
         * reads as a card. */
        const stripTop = 232;
        const factCells = buildFactCells(model.pitchFacts, model);
        const cellWidth = CONTENT_WIDTH / factCells.length;
        const stripHeight = 48;
        page.line(M.left, stripTop, PAGE.width - M.right, stripTop, palette.ink, 1);
        page.line(M.left, stripTop + stripHeight, PAGE.width - M.right, stripTop + stripHeight, palette.rule, 0.6);
        factCells.forEach((cell, i) => {
          const cx = M.left + i * cellWidth;
          const columnW = cellWidth - 14;
          page.text(cx, stripTop + 8, cell.label, {
            face: 'bold',
            size: 6.4,
            colour: palette.muted,
            charSpace: 0.8
          });
          /* The primary value gets three lines of room. The longest combined fact in the catalogue is
           * 42 characters and needs three in a 147pt cell; a two-line budget silently dropped the
           * session length. */
          let y = page.para(cx, stripTop + 19, cell.value, {
            face: 'bold',
            size: cell.sub ? 8.6 : 9,
            leading: 1.24,
            colour: palette.ink,
            maxWidth: columnW,
            maxHeight: cell.sub ? 22 : 36,
            label: `fact/${cell.label}`
          });
          if (cell.sub) {
            /* Flush with the primary value's block rather than spaced away from it, so the two lines
             * read as one cell rather than as two separate facts. */
            page.text(cx, y + 1, cell.sub.label, {
              face: 'bold',
              size: 6.4,
              colour: palette.muted,
              charSpace: 0.8
            });
            page.para(cx, y + 10, cell.sub.value, {
              face: 'regular',
              size: 8.2,
              leading: 1.2,
              colour: palette.body,
              maxWidth: columnW,
              maxHeight: 20,
              label: `fact/${cell.sub.label}`
            });
          }
          if (i) page.line(cx - 7, stripTop + 8, cx - 7, stripTop + stripHeight - 8, palette.rule, 0.6);
        });

        /* ------------------------------- the loop · 298 → 348 · 50pt ------------------------------- */
        y = 298;
        eyebrow(page, M.left, y, 'How a run goes', palette);
        y = drawLoopRail(page, model, palette, y + 14);

        /* ----------------------------- what it takes · 364 → 424 · 60pt ----------------------------- */
        y = 364;
        eyebrow(page, M.left, y, 'What it takes', palette);
        page.para(
          M.left,
          y + 14,
          `Forge resolves this design to ${model.counts.devices} devices: ${model.counts.core} for the core ` +
            `loop and ${model.counts.polish} for how it looks. Between them they carry ${model.counts.settings} ` +
            `settings, of which ${model.counts.decisions} change because of a decision you made.`,
          {
            size: 9.2,
            leading: 1.42,
            colour: palette.body,
            maxWidth: CONTENT_WIDTH - 152,
            maxHeight: 40,
            label: 'plan line'
          }
        );

        /* The phase breakdown as four counts rather than four lists — the list is Structure B. */
        const phaseX = PAGE.width - M.right - 144;
        let py = y + 12;
        model.phases.forEach((phase) => {
          page.text(phaseX, py, phase.label, { face: 'regular', size: 7.8, colour: palette.muted });
          page.text(PAGE.width - M.right, py, String(phase.devices.length), {
            face: 'bold',
            size: 8.4,
            colour: palette.ink,
            align: 'right',
            right: PAGE.width - M.right,
            maxWidth: 40
          });
          py += 11.5;
          page.line(phaseX, py - 4, PAGE.width - M.right, py - 4, palette.rule, 0.5);
        });

        /* ------------------------------- the tip · 440 → 484 · 44pt ------------------------------- */
        y = 440;
        if (model.layoutTip) {
          const tipHeight = 38;
          page.rect(M.left, y, CONTENT_WIDTH, tipHeight, palette.accentSoft);
          page.rect(M.left, y, 3, tipHeight, palette.accent);
          page.text(M.left + 11, y + 5, 'LAYOUT TIP', {
            face: 'bold',
            size: 6.4,
            colour: palette.accent,
            charSpace: 0.9
          });
          page.para(M.left + 11, y + 15, model.layoutTip, {
            size: 8.2,
            leading: 1.3,
            colour: palette.ink,
            maxWidth: CONTENT_WIDTH - 24,
            maxHeight: 22,
            label: 'layout tip'
          });
          y += tipHeight + 18;
        }

        /* --------------------- what the tool does not know · 496 → 560 · 64pt --------------------- */
        page.line(M.left, y, PAGE.width - M.right, y, palette.rule, 0.6);
        page.text(M.left, y + 8, 'WHAT THIS BRIEF CANNOT TELL YOU', {
          face: 'bold',
          size: 6.4,
          colour: palette.accent,
          charSpace: 0.9
        });
        page.para(
          M.left,
          y + 19,
          `Forge builds this page from the questions it asked. ${model.missing
            .map((m) => m.label)
            .join(', ')} — those are yours to write, and they are not guessed at here.`,
          {
            size: 7.8,
            leading: 1.35,
            colour: palette.muted,
            maxWidth: CONTENT_WIDTH,
            maxHeight: 38,
            label: 'missing line'
          }
        );

        drawFooter(page, model, palette, { total, label: 'Game Design Brief' });
      }
    }
  ];
}

/**
 * The core loop as a horizontal rail: entry, the repeating steps, the two outcomes.
 *
 * A rail rather than the app's ring diagram, because this page has one band of height for it and a
 * rail is the shape that fits a band. It carries the same information — the app's SVG has an entry
 * node, numbered loop steps and labelled outcomes, and so does this.
 *
 * Every text block here is budgeted for two lines at its own size, because outcome details ("Escape
 * or survive until time runs out") are long enough to need it in a 96pt box. A one-line budget is
 * what truncated them; the overflow reports said so.
 */
function drawLoopRail(page, model, palette, y) {
  const loop = model.coreLoop;
  const steps = (loop && loop.loop) || [];
  if (!steps.length) {
    return page.para(M.left, y, 'No core loop is recorded for this game type.', {
      size: 9,
      colour: palette.muted,
      maxWidth: CONTENT_WIDTH,
      label: 'loop missing'
    });
  }

  const height = 34;
  const entryW = 82;
  const outcomeW = 98;
  const gap = 14;
  const railY = y + height / 2;
  const stepW = (CONTENT_WIDTH - entryW - outcomeW * 2 - gap * (steps.length + 2)) / steps.length;

  page.roundRect(M.left, y, entryW, height, 4, { fill: palette.dark });
  page.para(M.left + 7, y + 6, loop.entry || 'Start', {
    face: 'bold',
    size: 8,
    leading: 1.2,
    colour: palette.onDark,
    maxWidth: entryW - 14,
    maxHeight: 23,
    label: 'loop entry'
  });

  let x = M.left + entryW;
  const connector = (from) => {
    page.line(from + 3, railY, from + gap - 3, railY, palette.faint, 0.8);
    page.line(from + gap - 6, railY - 2.4, from + gap - 3, railY, palette.faint, 0.8);
    page.line(from + gap - 6, railY + 2.4, from + gap - 3, railY, palette.faint, 0.8);
  };
  connector(x);

  x += gap;
  steps.forEach((step, i) => {
    page.rect(x, y, stepW, height, palette.panel);
    page.stroke(x, y, stepW, height, palette.panelEdge, 0.6);
    page.text(x + 6, y + 4, String(i + 1).padStart(2, '0'), {
      face: 'bold',
      size: 6.4,
      colour: palette.accent
    });
    page.para(x + 6, y + 13, step, {
      face: 'bold',
      size: 7.8,
      leading: 1.18,
      colour: palette.ink,
      maxWidth: stepW - 12,
      maxHeight: 20,
      label: `loop step ${i + 1}`
    });
    x += stepW;
    connector(x);
    x += gap;
  });

  const outcomes = (loop.outcomes || []).slice(0, 2);
  outcomes.forEach((outcome, i) => {
    const ox = x + i * (outcomeW + gap);
    const isWin = /win/i.test(outcome.label || '');
    page.rect(ox, y, outcomeW, height, isWin ? palette.accentSoft : palette.panel);
    page.stroke(ox, y, outcomeW, height, isWin ? palette.accent : palette.panelEdge, 0.6);
    page.text(ox + 6, y + 4, String(outcome.label || '').toUpperCase(), {
      face: 'bold',
      size: 6.4,
      colour: isWin ? palette.accent : palette.muted,
      charSpace: 0.8
    });
    page.para(ox + 6, y + 13, outcome.detail || '', {
      size: 7.4,
      leading: 1.16,
      colour: palette.body,
      maxWidth: outcomeW - 12,
      maxHeight: 20,
      label: `outcome ${i}`
    });
  });

  return y + height;
}

/* ------------------------------ reading the pitch facts ------------------------------ */

/**
 * The facts strip's cells, built from the facts that exist rather than from a fixed five.
 *
 * The row is `verb · players · count · where · session` by the randomiser data file's own ordering, and
 * the only respect in which rows differ is whether the count is present. So this reads the row
 * positionally from the end — session last, where second-to-last — and `players` is second when a count
 * is present and third when it is not.
 *
 * A cell is `{ label, value, sub }`, where `sub` is an optional second labelled line. The players cell
 * uses it, because joining the facts into one line is what produced the worst line on the page:
 *
 *   "Surviving, Together against the game, 2–4, Rooms and corridors, 15–45 minutes"
 *
 * That is `players · count · session` joined with a middle dot, which assumed three short phrases. The
 * real values are clauses, so the line wrapped and read as a list of five things separated by commas.
 * Labelling the parts fixes both problems at once: it is shorter, and it answers the question the
 * reader actually has — which phrase is *who* and which is *how long*.
 *
 * Never more than three cells: each is a column of 483/n points, and at four or five the longest values
 * in the catalogue stop fitting on one line and eat the strip's height budget.
 */
function buildFactCells(pitchFacts, model) {
  const list = factList(pitchFacts);
  const session = list.length ? list[list.length - 1] : '';
  const where = list.length >= 2 ? list[list.length - 2] : '';
  const players = list.length >= 2 ? list[1] : '';
  const count = list.length >= 5 ? list[list.length - 3] : '';
  /* "Surviving · 2–4" is one fact — who, and how many of them. */
  const who = [players, count].filter(Boolean).join(' · ');

  const cells = [{ label: 'PLAYERS', value: who, sub: session ? { label: 'SESSION', value: session } : null }];
  if (where) cells.push({ label: 'WHERE IT HAPPENS', value: where, sub: null });
  cells.push({
    label: 'THE PLAN',
    value: `${model.counts.devices} devices · ${model.counts.settings} settings`,
    sub: null
  });
  return cells;
}

/**
 * The pitch facts as a list.
 *
 * Read from `model.pitchFacts` — the middle-dot joined line the model already builds — rather than from
 * `model.pitch.facts`. That array was being run through `String()` here, which joins with **commas**:
 * `['Surviving', 'Together against the game', '2–4', …]` became
 * `"Surviving,Together against the game,2–4,…"`. The `split('·')` that followed then found nothing to
 * split, the whole row came back as one element, and every positional read was wrong:
 *
 *   `PLAYERS · SESSION`   "Surviving, Together against the game, 2–4, Rooms and corridors, 15–45 minutes"
 *
 * which wrapped to two lines and read as a list of five unrelated things. It was the worst line on the
 * page for as long as it existed, and it was one `String()` call on a value that was already an array.
 *
 * Going through `pitchFacts` puts the string/list decision where the rest of the model's formatting
 * lives, and means this function only has one shape to handle.
 */
function factList(pitchFacts) {
  return String(pitchFacts || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
}

function lowerFirst(text) {
  const s = String(text || '');
  if (!s) return '';
  /* Only the first character, and only for a sentence that is not already a proper noun: "Slow and
   * creeping" becomes "slow and creeping", while an em-dash clause keeps its capital. */
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
