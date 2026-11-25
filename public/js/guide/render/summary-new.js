/**
 * The summary as the redesign has it: the pitch first, then how the game plays, then the plan.
 *
 * Three things differ from the layout it replaces (render/summary-classic.js), and only three:
 *
 *   1. The page opens with the game itself. The questionnaire exists to produce one sentence about
 *      what you are making, and that sentence was previously nowhere on the page — you got a device
 *      count and a list of your own answers. It is now the first thing here, written the way the
 *      randomiser writes its result (see pitch.js for where each clause comes from).
 *   2. Naming, saving and sharing moved into that card. They were a panel of their own at the bottom
 *      ("Keep it"), which put the three things you do with a finished design below the fold, under the
 *      device plan. They belong to the pitch, so they sit with it.
 *   3. The core loop's two halves sit side by side: the words in a narrow column on the left, the
 *      drawing on the right. The drawing was the whole panel's width with the words pushed underneath
 *      it, which made the text read as a footnote to the picture rather than as the other way to read
 *      the same thing.
 *
 * What is deliberately unchanged: the screen's own title, the lead, the plan panel, the recap of every
 * answer, the walkthrough line and the way back. Those are what the page has to say, and the redesign
 * is about the order it says them in.
 */

import { h, frag } from '../dom.js';
import { effectiveCoreLoop } from '../data.js';
import { UI } from '../content.js';
import { buildPitch, factsLine } from '../pitch.js';
import { eyebrow, lead, noticeBox, pageTitle, panel, paragraph } from './ui.js';
import { renderCoreLoop } from './loop.js';
import { loopLegend } from './loop-legend.js';
import { backRow, nameAndStart, planPanel, recapPanel, saveControls, walkthroughNote } from './summary-parts.js';

export function renderSummaryNew(ctx) {
  const { data, state, actions } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);
  const loop = effectiveCoreLoop(data, state.gameTypeKey);
  const pitch = buildPitch({ key: state.gameTypeKey, type, category: cat, brand });
  const { nameInput, startButton } = nameAndStart(ctx);

  return frag(
    eyebrow('Summary'),
    pageTitle('Here is your game.'),
    lead(`${type ? type.label : 'Your game'} · ${cat ? cat.label : ''} · ${brand ? brand.label : 'no brand'} — one page you can come back to.`),

    noticeBox(state.notice, () => actions.clearNotice()),

    pitchPanel(ctx, pitch, { nameInput, startButton }),

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

/** The game's own one-liner, with the three things you can do with it underneath. */
function pitchPanel(ctx, pitch, controls) {
  const facts = pitch ? factsLine(pitch.facts) : '';

  return panel({
    eyebrowText: UI.startingPoint,
    heading: h('h2', { class: 'g-pitchcard-line' }, pitch ? pitch.strapline : 'Your game'),
    className: 'g-pitchcard',
    children: [
      /* The type's own description. Skipped for the "just give me the basics" entries, whose
       * description is already inside the sentence above it, and where naming the entry would print
       * "Just give me the basics" as though it were a game. */
      pitch && pitch.voice !== 'essentials' && pitch.description
        ? h('p', { class: 'g-pitchcard-line-item' }, h('strong', {}, pitch.noun), ' — ', pitch.description)
        : null,

      facts
        ? h(
            'p',
            { class: 'g-pitchcard-facts' },
            h('span', { class: 'g-pitchcard-facts-lead' }, `${UI.underneath} `),
            facts
          )
        : null,

      pitch && pitch.hook
        ? h(
            'p',
            { class: 'g-pitchcard-line-item' },
            h('strong', {}, pitch.hook.name),
            ' — ',
            pitch.hook.description
          )
        : null,

      h('hr', { class: 'g-hr' }),

      ...saveControls(ctx, controls)
    ]
  });
}
