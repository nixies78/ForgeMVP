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
import { button, buttonRow, eyebrow, noticeBox, pageTitle, panel, paragraph } from './ui.js';
import { renderCoreLoop } from './loop.js';
import { loopLegend } from './loop-legend.js';
import { backRow, nameAndStart, planPanel, recapPanel, walkthroughNote } from './summary-parts.js';

export function renderSummaryNew(ctx) {
  const { data, state, actions } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);
  const loop = effectiveCoreLoop(data, state.gameTypeKey);
  const pitch = buildPitch({ key: state.gameTypeKey, type, category: cat, brand });

  return frag(
    pitchSplit(ctx, pitch, { type, cat, brand }),

    noticeBox(state.notice, () => actions.clearNotice()),

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

    panel(planPanel(ctx)),

    panel(recapPanel(ctx)),

    walkthroughNote(),

    backRow(ctx)
  );
}

/**
 * The game's own one-liner, with the three things you can do with it.
 *
 * Two columns, not a stack. On the left the title, the sentence, a line that decodes it and a line of
 * facts; on the right the name field, Start Building, Save and the share link, in a rail of their own.
 *
 * The rail is doing more than packing. Reading order and doing order are different orders, and a stack
 * has to pick one of them: put the sentence first and the controls are four rows down with the pitch
 * already scrolled past, or put the controls first and the page opens with a text box instead of with
 * the game. Side by side, both are true at once — the eye starts on the sentence, the hand finds the
 * buttons at the same height, and the whole header is one band instead of a stack (about 260px against
 * 698px).
 *
 * Nothing here repeats itself. The sentence already names the type, the brand and the hook, so the type
 * is not named again as a heading, and the hook's own description is folded into the decoding line
 * rather than given a row.
 */
function pitchSplit(ctx, pitch, { type, cat, brand }) {
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
    { class: 'g-pitchsplit' },

    h(
      'div',
      { class: 'g-pitchsplit-left' },
      eyebrow('Summary'),
      pageTitle('Here is your game.'),
      h('h2', { class: 'g-pitchsplit-line' }, pitch ? pitch.strapline : 'Your game'),
      h(
        'p',
        { class: 'g-pitchsplit-deck' },
        h('strong', {}, typeLabel),
        ' · ',
        cat ? cat.label : '—',
        brandLabel ? ' · ' : '',
        brandLabel || '',
        decoding ? ' — ' : '',
        decoding
      ),
      facts
        ? h('p', { class: 'g-pitchsplit-facts' }, h('span', {}, `${UI.underneath} `), facts)
        : null
    ),

    h('aside', { class: 'g-pitchsplit-rail', 'aria-label': 'Name and save this game' }, ...saveRail(ctx, pitch))
  );
}

/**
 * The rail: the name field, the primary action, then the two secondary ones.
 *
 * Start Building is full width above the pair because it is what the page is for, and because the button
 * is disabled until the game has a name — a disabled control you are about to enable should be the
 * obvious next thing, not the second of two buttons.
 */
function saveRail(ctx, pitch) {
  const { state, actions, store } = ctx;
  const saved = state.gameId ? store.get(state.gameId) : null;
  const named = Boolean(state.gameName && state.gameName.trim());
  const { nameInput, startButton } = nameAndStart(ctx);

  return [
    h('label', { class: 'g-label', for: 'gameName' }, UI.savePrompt),
    nameInput,
    startButton,
    buttonRow([
      button({
        label: saved ? 'Save changes' : UI.save,
        variant: 'secondary',
        onClick: () => actions.saveGame(nameInput.value)
      }),
      button({
        label: 'Copy a link to this plan',
        variant: 'quiet',
        onClick: () => actions.copyShareLink()
      })
    ]),
    h(
      'p',
      { class: 'g-meta-line g-small', id: 'gameNameHint' },
      named
        ? 'Saved in this browser only. Your answers are not sent anywhere.'
        : 'Saved in this browser only — give it a name to start building.'
    )
  ];
}
