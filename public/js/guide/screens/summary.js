/**
 * Screen 7 — Summary: the game's own pitch, the core loop, everything that was chosen, and somewhere
 * to save it.
 *
 * This module is now a dispatcher rather than a layout, because the screen has two of them:
 *
 *   - `classic` — the page as it shipped (render/summary-classic.js);
 *   - `new`     — the pitch-first redesign (render/summary-new.js).
 *
 * They are kept side by side on purpose. The redesign changes where things sit and what the page opens
 * with, and the owner asked to be able to see both on the real page with real answers rather than in a
 * screenshot — so the switcher sits above the title, the choice is remembered in this browser, and a
 * link can carry it (`?layout=new`) so the two can be put next to each other in two tabs.
 *
 * The switcher is a comparison tool and says so. When the decision is made, the losing layout, the
 * switcher and the `summaryLayout` state all go together, and this module goes back to being one
 * render function.
 */

import { h, frag } from '../dom.js';
import { UI } from '../content.js';
import { renderSummaryClassic } from '../render/summary-classic.js';
import { renderSummaryNew } from '../render/summary-new.js';

export const SUMMARY_LAYOUTS = ['classic', 'new'];

export function renderSummary(ctx) {
  const layout = ctx.state.summaryLayout === 'new' ? 'new' : 'classic';

  return frag(
    layoutSwitcher(ctx, layout),
    layout === 'new' ? renderSummaryNew(ctx) : renderSummaryClassic(ctx)
  );
}

/**
 * Which layout this session is showing. One place decides it, so the screen, the switcher's own state
 * and anything that links to a layout cannot disagree.
 */
function layoutSwitcher(ctx, current) {
  const options = [
    { id: 'classic', label: UI.layoutClassic },
    { id: 'new', label: UI.layoutNew }
  ];

  return h(
    'div',
    { class: 'g-layoutswitch', role: 'group', 'aria-label': UI.layoutLabel },
    h('p', { class: 'g-layoutswitch-label' }, UI.layoutLabel),
    h(
      'div',
      { class: 'g-layoutswitch-group' },
      ...options.map((option) =>
        h(
          'button',
          {
            type: 'button',
            class: `g-layoutswitch-btn${option.id === current ? ' is-on' : ''}`,
            'aria-pressed': option.id === current ? 'true' : 'false',
            /* `on`, not `onClick`: that is what dom.js's h() reads, and the button() helper's onClick
             * is a different contract. Getting it wrong writes a dead onclick attribute and the button
             * silently does nothing. */
            on: { click: () => ctx.actions.setSummaryLayout(option.id) }
          },
          option.label
        )
      )
    ),
    h('p', { class: 'g-layoutswitch-note' }, UI.layoutNote)
  );
}
