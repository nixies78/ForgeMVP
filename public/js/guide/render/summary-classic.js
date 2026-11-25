/**
 * The summary as the app shipped it: title, core loop with the legend underneath, then the plan, the
 * recap and a panel for saving.
 *
 * This is the "Classic" side of the layout switcher in screens/summary.js, and it is deliberately kept
 * as it was. The redesign is a second layout beside it rather than a replacement, so the two can be
 * compared on the real page with real answers — which is the only way to tell whether the new one is
 * actually better. Nothing here should change while that comparison is live.
 */

import { h, frag } from '../dom.js';
import { effectiveCoreLoop } from '../data.js';
import { eyebrow, lead, noticeBox, pageTitle, panel, paragraph } from './ui.js';
import { renderCoreLoop } from './loop.js';
import { loopLegend } from './loop-legend.js';
import { backRow, nameAndStart, planPanel, recapPanel, saveControls, walkthroughNote } from './summary-parts.js';

export function renderSummaryClassic(ctx) {
  const { data, state, actions, store } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);
  const loop = effectiveCoreLoop(data, state.gameTypeKey);
  const saved = state.gameId ? store.get(state.gameId) : null;
  const { nameInput, startButton } = nameAndStart(ctx);

  return frag(
    eyebrow('Summary'),
    pageTitle('Here is your game.'),
    lead(`${type ? type.label : 'Your game'} · ${cat ? cat.label : ''} · ${brand ? brand.label : 'no brand'} — one page you can come back to.`),

    noticeBox(state.notice, () => actions.clearNotice()),

    panel({
      eyebrowText: 'Core loop',
      title: loop ? 'How the game plays' : 'No core loop recorded yet',
      className: 'g-panel-loop',
      children: [
        loop
          ? h('div', { class: 'g-loopwrap' }, renderCoreLoop(loop))
          : paragraph(
              'This game type resolves to the category baseline, and no core loop has been written for it yet. ' +
                'The device plan below is still valid.'
            ),
        loop ? loopLegend(loop) : null
      ]
    }),

    panel(planPanel(ctx)),

    panel(recapPanel(ctx)),

    panel({
      eyebrowText: 'Keep it',
      title: saved ? `Saved as "${saved.name}"` : 'Name and save this game',
      className: 'g-panel-save',
      children: saveControls(ctx, { nameInput, startButton })
    }),

    walkthroughNote(),

    backRow(ctx)
  );
}
