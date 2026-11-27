/**
 * The summary as the redesign has it: the pitch first, then how the game plays, then the plan.
 *
 * Three things differ from the layout it replaces (render/summary-classic.js), and only three:
 *
 *   1. The page opens with the game itself. The questionnaire exists to produce one sentence about
 *      what you are making, and that sentence was previously nowhere on the page — you got a device
 *      count and a list of your own answers. It is now the first thing here, written the way the
 *      randomiser writes its result (see pitch.js for where each clause comes from).
 *   2. Naming, saving and sharing sit in a rail beside that sentence rather than in a panel of their
 *      own at the bottom ("Keep it"), which put the three things you do with a finished design below
 *      the fold, under the device plan. See the note on `pitchSplit` for why they are a rail.
 *   3. The core loop's two halves sit side by side: the words in a narrow column on the left, the
 *      drawing on the right. The drawing was the whole panel's width with the words pushed underneath
 *      it, which made the text read as a footnote to the picture rather than as the other way to read
 *      the same thing.
 *
 * What is deliberately unchanged: the screen's own title, the plan panel, the recap of every answer,
 * the walkthrough line and the way back. Those are what the page has to say, and the redesign is about
 * the order it says them in.
 *
 * The header went through a measurement pass before it was built this way. As a panel it stacked twelve
 * rows — three of which said the same thing about the same game — and came to 698px, which put the core
 * loop at 1113px: below the fold on every laptop. What a header has to carry is a title, a description
 * and the actions, and those belong in one band rather than in a stack.
 */

import { h, frag } from '../dom.js';
import { effectiveCoreLoop } from '../data.js';
import { UI } from '../content.js';
import { buildPitch, factsLine } from '../pitch.js';
import { button, eyebrow, noticeBox, pageTitle, panel, paragraph } from './ui.js';
import { renderCoreLoop } from './loop.js';
import { loopLegend } from './loop-legend.js';
import { backRow, nameAndStart, planColumns, walkthroughNote } from './summary-parts.js';

export function renderSummaryNew(ctx) {
  const { data, state, actions } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);
  const loop = effectiveCoreLoop(data, state.gameTypeKey);
  const pitch = buildPitch({ key: state.gameTypeKey, type, category: cat, brand });

  return frag(
    pitchBand(ctx, pitch, { type, cat, brand }),

    /* A receipt is drawn beside the button that earned it, inside the panel above; this slot is left for
     * the messages that are not receipts — the ones the user has to do something about. */
    state.notice && !state.notice.flash ? noticeBox(state.notice, () => actions.clearNotice()) : null,

    panel({
      eyebrowText: 'Core loop',
      title: loop ? 'How the game plays' : 'No core loop recorded yet',
      className: 'g-panel-loop',
      children: loop
        ? [
            /* The two halves of one answer. The words come first in the source as well as on the page:
             * a reader who never looks at the drawing still gets the loop, and a screen reader meets
             * the list before the image. */
            h(
              'div',
              { class: 'g-loopcols' },
              h('div', { class: 'g-loopcols-side' }, loopLegend(loop)),
              h('div', { class: 'g-loopcols-main' }, renderCoreLoop(loop))
            )
          ]
        : [
            paragraph(
              'This game type resolves to the category baseline, and no core loop has been written for it yet. ' +
                'The device plan below is still valid.'
            )
          ]
    }),

    planColumns(ctx),

    walkthroughNote(),

    backRow(ctx)
  );
}

/**
 * The game's own one-liner, and the panel that names and keeps it.
 *
 * Two columns, not a stack. `.g-pitch-text` on the left carries the title, the sentence, a line that
 * decodes it and a line of facts; `.g-pitch-save` on the right is the project's name field, Save, Share
 * and Start Building.
 *
 * The split is doing more than packing. Reading order and doing order are different orders, and a stack
 * has to pick one of them: put the sentence first and the controls are four rows down with the pitch
 * already scrolled past, or put the controls first and the page opens with a text box instead of with
 * the game. Side by side, both are true at once — the eye starts on the sentence, the hand finds the
 * controls at the same height, and the whole header is one band instead of a stack (about 270px against
 * 698px).
 *
 * Nothing here repeats itself. The sentence already names the type, the brand and the hook, so the type
 * is not named again as a heading, and the hook's own description is folded into the decoding line
 * rather than given a row.
 */
function pitchBand(ctx, pitch, { type, cat, brand }) {
  const { state } = ctx;
  const facts = pitch ? factsLine(pitch.facts) : '';
  const typeLabel = pitch ? pitch.noun : type ? type.label : 'Your game';
  const brandLabel = brand && brand.id && brand.id !== 'original' ? brand.label : null;

  /* "Type · Category · Brand — what it is." The brand is left out for "Original (No Brand Template)",
   * which is not a world to name, and for the same reason the sentence above it drops the clause. The
   * description is the type's own, straight from the data file, and is skipped for the "just give me the
   * basics" entries, whose description is already inside the sentence above it — naming the entry would
   * print "Just give me the basics" as though it were a game. The hook's description rides at the end of
   * the same line, because it is a clause about the same sentence rather than a new thought. */
  const description = pitch && pitch.voice !== 'essentials' ? pitch.description : '';
  const hookNote = pitch && pitch.hook ? pitch.hook.description : '';
  const decoding = [description, hookNote].filter(Boolean).join(' ');

  return h(
    'div',
    { class: 'g-pitch' },

    h(
      'div',
      { class: 'g-pitch-text' },
      eyebrow('Summary'),
      pageTitle('Here is your game.'),
      h('h2', { class: 'g-pitch-line' }, pitch ? pitch.strapline : 'Your game'),
      h(
        'p',
        { class: 'g-pitch-deck' },
        h('strong', {}, typeLabel),
        ' · ',
        cat ? cat.label : '—',
        brandLabel ? ' · ' : '',
        brandLabel || '',
        decoding ? ' — ' : '',
        decoding
      ),
      facts ? h('p', { class: 'g-pitch-facts' }, h('span', {}, `${UI.underneath} `), facts) : null
    ),

    h('aside', { class: 'g-pitch-save', 'aria-label': 'Name and save this project' }, ...pitchSave(ctx))
  );
}

/**
 * The receipt for Save or Share: a chip that appears over the field's label line, right-aligned so it
 * sits above the two buttons below it — the panel's rightmost controls. `flash` names which button was
 * pressed, so the stylesheet shifts Save's receipt left by exactly one button and one gap and it lines up
 * over Save rather than over the pair.
 *
 * **It is always rendered, and empty when there is nothing to say.** A live region that is already in the
 * document and then changes its text is announced far more reliably than one inserted at the same moment
 * as its text, which is the case screen readers disagree about most. `is-quiet` is the empty state: a
 * pill with no fill and no words, invisible but still present.
 *
 * Not every notice is a receipt. One the user has not dealt with yet (the browser refused to store
 * anything, you are at your saved-game limit) is drawn in the notice slot above, where it stays until it
 * is dismissed.
 */
function flashChip(notice) {
  const flash = notice && notice.flash ? notice.flash : null;
  return h(
    'p',
    { class: `g-toast ${flash ? `g-toast-${flash}` : 'is-quiet'}`, role: 'status' },
    flash ? notice.text : ''
  );
}

/**
 * The save panel: the project's name, the two things you can do with it, and Start Building.
 *
 * The name field and its two actions are **one row**, and the actions are icon buttons. That is a fix
 * rather than a preference: as labelled buttons they shared the panel's width, and "Save changes" and
 * "Copy a link to this plan" both wrapped to two lines — two ragged two-line labels on the page's
 * primary control block, next to a single-line field. An icon button cannot wrap, is the same height as
 * the field it belongs to, and puts the two actions where the thing they act on is.
 *
 * Save is **disabled until there is something to save** — no name yet, or a name that is already what
 * is stored — so it reports state rather than offering an action that would do nothing. Share is always
 * available, because the link is valid whether or not the game has been saved.
 *
 * The panel carries no storage caveat. "Saved in this browser only. Your answers are not sent
 * anywhere." is a real thing to say once, and the home screen says it where saving is explained; under
 * a Save button it was the third line of fine print in a header that had too many.
 */
function pitchSave(ctx) {
  const { state, actions, store } = ctx;
  const record = state.gameId ? store.get(state.gameId) : null;
  const storedName = record ? record.name : null;
  const name = (state.gameName || '').trim();
  const canSave = Boolean(name) && name !== storedName;

  const { nameInput, startButton } = nameAndStart(ctx, { describedBy: null });

  const saveButton = button({
    label: UI.save,
    title: record ? 'Save changes' : 'Save this game',
    iconName: 'save',
    iconOnly: true,
    variant: 'secondary',
    disabled: !canSave,
    onClick: () => actions.saveGame(nameInput.value)
  });

  const shareButton = button({
    label: UI.share,
    title: UI.shareTitle,
    iconName: 'link',
    iconOnly: true,
    variant: 'secondary',
    onClick: () => actions.copyShareLink()
  });

  /* Save follows the field itself, so it turns on the moment the name differs from what is stored and
   * turns off again the moment it does not — including when someone types a change and then types it
   * back. `button()` attaches its handler whether or not the control starts disabled, which is what
   * makes enabling it here work. */
  nameInput.addEventListener('input', () => {
    const next = nameInput.value.trim();
    const ready = Boolean(next) && next !== storedName;
    saveButton.disabled = !ready;
    saveButton.classList.toggle('is-disabled', !ready);
  });

  return [
    h('label', { class: 'g-label', for: 'gameName' }, UI.savePrompt),
    h('div', { class: 'g-pitch-save-row' }, nameInput, saveButton, shareButton, flashChip(state.notice)),
    startButton
  ];
}
