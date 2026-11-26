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
 * screenshot — so the choice is remembered in this browser and a link can carry it (`?layout=new`) so
 * the two can be put next to each other in two tabs.
 *
 * The control for that is the comparison bar, and it is deliberately not built like the rest of the
 * app:
 *
 *   - It is fixed across the very top of the window and overlaps the site header, rather than sitting at
 *     the top of the page's content. A tool that pushes the product down the page is a tool that has
 *     become part of it.
 *   - It wears a colour from outside the palette (tokens.css, `--fn-compare`). Every other surface in
 *     the guide is the library's; this one is not, so that it reads as an instrument over the page.
 *   - It rolls up. Rolling it up leaves a small tab in the gutter, so the bar costs nothing once the
 *     comparison is done but can always be brought back.
 *   - It carries its own explanation, so switching layouts lays out no notice of its own. The bar is
 *     always on screen while the summary is, so a notice would only be the same sentence twice.
 *
 * All of that goes when the decision is made: the losing layout, this bar, the `summaryLayout` and
 * `summaryBarOpen` state and the key they are stored under are one deletion, and this module goes back
 * to being one render function.
 */

import { h, frag } from '../dom.js';
import { UI } from '../content.js';
import { renderSummaryClassic } from '../render/summary-classic.js';
import { renderSummaryNew } from '../render/summary-new.js';

export const SUMMARY_LAYOUTS = ['classic', 'new'];

export function renderSummary(ctx) {
  const layout = ctx.state.summaryLayout === 'new' ? 'new' : 'classic';

  return frag(
    compareBar(ctx, layout),
    layout === 'new' ? renderSummaryNew(ctx) : renderSummaryClassic(ctx)
  );
}

/**
 * The temporary bar across the top of the window, or the tab it rolls up to.
 *
 * One function for both states rather than two elements and a class, because the rolled-up tab is a
 * different thing on screen — a single control with a label — not the same bar shrunk. Rendering it
 * here also means the bar can never disagree with `state`, which is the only place the layout lives.
 */
function compareBar(ctx, current) {
  const open = ctx.state.summaryBarOpen !== false;
  const label = current === 'new' ? UI.compareNew : UI.compareClassic;

  if (!open) {
    return h(
      'div',
      { class: 'g-compare', 'data-open': 'false' },
      h(
        'button',
        {
          type: 'button',
          class: 'g-compare-tab',
          'aria-expanded': 'false',
          'aria-label': `${UI.compareOpenTitle} — ${label}`,
          title: UI.compareOpenTitle,
          /* `on`, not `onClick`: that is what dom.js's h() reads. The button() helper's onClick is a
           * different contract, and getting it wrong writes a dead onclick attribute that fails
           * silently. */
          on: { click: () => ctx.actions.setSummaryBar(true) }
        },
        h('span', { class: 'g-compare-tab-dot', 'aria-hidden': 'true' }),
        UI.compareTab,
        h('span', { class: 'g-compare-tab-value' }, label)
      )
    );
  }

  return h(
    'div',
    { class: 'g-compare', 'data-open': 'true', role: 'region', 'aria-label': UI.compareLabel },
    h(
      'div',
      { class: 'g-compare-in' },
      h('span', { class: 'g-compare-mark', 'aria-hidden': 'true' }, '◆'),
      h('p', { class: 'g-compare-title' }, UI.compareLabel),
      h(
        'div',
        { class: 'g-compare-group', role: 'group', 'aria-label': UI.compareLabel },
        ...SUMMARY_LAYOUTS.map((id) =>
          h(
            'button',
            {
              type: 'button',
              class: 'g-compare-btn',
              'aria-pressed': id === current ? 'true' : 'false',
              on: { click: () => ctx.actions.setSummaryLayout(id) }
            },
            id === 'new' ? UI.compareNew : UI.compareClassic
          )
        )
      ),
      h('p', { class: 'g-compare-note' }, UI.compareNote),
      h(
        'button',
        {
          type: 'button',
          class: 'g-compare-toggle',
          'aria-expanded': 'true',
          'aria-label': UI.compareHide,
          title: UI.compareHide,
          on: { click: () => ctx.actions.setSummaryBar(false) }
        },
        h('span', { 'aria-hidden': 'true' }, '×')
      )
    )
  );
}
