/**
 * Placeholder screen for the two design modes that are not built yet.
 *
 * The product decision was to keep all three panels on the home screen while Randomise and Chat with
 * AI are worked out, so this screen exists to make them honest: what the mode will do, what is
 * actually missing, and — for the chat mode — a working interim that already exists in this repo.
 */

import { h, frag } from '../dom.js';
import { DESIGN_MODES, PLACEHOLDER_NOTES, UI } from '../content.js';
import { button, buttonRow, eyebrow, lead, pageTitle, panel, paragraph } from '../render/ui.js';

export function renderPlaceholder(ctx) {
  const { state, actions } = ctx;
  const mode = DESIGN_MODES.find((m) => m.id === state.mode) || DESIGN_MODES[1];
  const notes = PLACEHOLDER_NOTES[mode.id] || [];

  return frag(
    eyebrow('Not built yet'),
    pageTitle(`${mode.label} is still being designed.`),
    lead(mode.description),

    panel({
      title: 'What is missing',
      className: 'g-panel-coming',
      children: [h('ul', { class: 'g-list' }, ...notes.map((line) => h('li', {}, line)))]
    }),

    mode.id === 'ai_chat'
      ? paragraph(
          'In the meantime this repository has a working chat page wired to the model configured on the admin page. ' +
            'It is a test harness rather than this design mode, but the connection works.'
        )
      : null,

    buttonRow([
      button({ label: 'Back to the three modes', iconName: 'arrowLeft', onClick: () => actions.go({ screen: 'home' }) }),
      mode.id === 'ai_chat'
        ? button({ label: 'Open the chat test page', variant: 'secondary', href: 'chat.html' })
        : button({ label: UI.guidedInstead, variant: 'primary', iconName: 'arrow', onClick: () => actions.go({ screen: 'category' }) })
    ])
  );
}
