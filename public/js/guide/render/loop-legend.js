/**
 * The core loop in words: the text half of the diagram.
 *
 * The diagram is one rendering of the loop and this is the other, and neither is allowed to be the
 * only way in. The legend reads in the order the loop actually happens — entry, the repeating steps,
 * then the outcomes — which is the order the drawing runs in as well.
 *
 * It lives here rather than in a screen because the summary has two layouts now (see
 * screens/summary.js) and both show it: one under the diagram, one beside it in its own column. The
 * words are the same either way.
 */

import { h } from '../dom.js';
import { sectionHeading } from './ui.js';

export function loopLegend(loop) {
  return h(
    'div',
    { class: 'g-legend' },
    sectionHeading('In words', { small: true }),
    h(
      'ol',
      { class: 'g-legend-loop' },
      h('li', {}, h('strong', {}, 'Start: '), loop.entry || '—'),
      ...(loop.loop || []).map((step) => h('li', {}, step)),
      h('li', {}, h('strong', {}, 'Then repeat until it resolves.'))
    ),
    h(
      'ul',
      { class: 'g-legend-outcomes' },
      ...(loop.outcomes || []).map((outcome) =>
        h('li', {}, h('strong', {}, `${outcome.label}: `), outcome.detail || '')
      )
    )
  );
}
