/**
 * Screen 4 — Question: one question per screen, in the order the game type declares them.
 *
 * The footer is v1's: [ ← Back ] … [ Change game type ] [ Change category ]. What is different is
 * what Back does. In v1 the answers were positional and the "previous" step popped the last answer,
 * so going back destroyed work; here Back moves to the previous question and every answer stays,
 * including the one you just looked at.
 *
 * Questions are keyed by `qId`, which is also what makes editing a single answer from the summary
 * possible.
 */

import { h, frag, plural } from '../dom.js';
import { questions, questionIndex } from '../state.js';
import { UI } from '../content.js';
import { button, buttonRow, eyebrow, pageTitle, panel, paragraph } from '../render/ui.js';
export function renderQuestion(ctx) {
  const { data, state, actions } = ctx;
  const list = questions(data, state);
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const question = list.find((q) => q.id === state.qId) || list[0];
  if (!question) return paragraph('This game type has no questions.');

  const index = questionIndex(data, state, question.id);
  const answered = state.answers.find((a) => a.qId === question.id);
  const isLast = index >= list.length - 1;

  return frag(
    panel({
      eyebrowText: `Question ${index + 1} of ${list.length}`,
      /* The question itself is the screen's h1: it is what the whole screen is about, and it is where
       * focus lands when the screen changes. */
      heading: pageTitle(question.prompt),
      className: 'g-panel-question',
      children: [
        h(
          'div',
          { class: 'g-options', role: 'group', 'aria-label': question.prompt },
          ...(question.options || []).map((option) =>
            h(
              'button',
              {
                class: `g-option${answered && answered.optionValue === option.value ? ' is-selected' : ''}`,
                type: 'button',
                'aria-pressed': answered && answered.optionValue === option.value ? 'true' : 'false',
                on: { click: () => actions.chooseOption(question, option) }
              },
              h(
                'span',
                { class: 'g-option-row' },
                h('span', { class: 'g-option-label' }, option.label),
                answered && answered.optionValue === option.value
                  ? h('span', { class: 'g-option-marker' }, '✓ Chosen')
                  : null
              ),
              option.note ? h('span', { class: 'g-option-note' }, option.note) : null
            )
          )
        ),

        answered
          ? h(
              'p',
              { class: 'g-meta-line' },
              `You chose ${answered.optionLabel}. `,
              isLast ? 'Continue when you are ready.' : 'Change it any time — nothing after it is lost.'
            )
          : h('p', { class: 'g-meta-line' }, 'Pick the one that fits. You can change it later without losing the rest.')
      ]
    }),

    buttonRow(
      [
        button({ label: UI.back, iconName: 'arrowLeft', onClick: () => actions.back() }),

        h(
          'div',
          { class: 'g-btnrow-inner' },
          button({ label: UI.changeGameType, variant: 'quiet', onClick: () => actions.go({ screen: 'gametype' }) }),
          button({ label: UI.changeCategory, variant: 'quiet', onClick: () => actions.go({ screen: 'category' }) }),
          answered && isLast
            ? button({ label: 'Continue to brand', variant: 'primary', iconName: 'arrow', onClick: () => actions.toBrand() })
            : null
        )
      ],
      { between: true }
    ),

    h(
      'p',
      { class: 'g-meta-line g-small' },
      `${plural(state.answers.length, 'answer')} given · ${plural(list.length - state.answers.length, 'question')} left`
    )
  );
}
