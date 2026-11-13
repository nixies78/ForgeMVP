/**
 * Screen 8 — Experience: asked fresh every session, never saved with the game.
 *
 * One level actually changes anything: only "Complete beginner" inserts the Basic Navigation step.
 * v1 promised advanced material to the other three and delivered it to nobody, so the wording here
 * describes what each option does, and the screen says out loud that the advanced content is not
 * written yet (UEFN_GUIDE_V2_HANDOFF.md, Part 9 item 8 — recorded as still open, not silently fixed).
 */

import { h, frag } from '../dom.js';
import { EXPERIENCE_LEVELS, EXPERIENCE_HONESTY_NOTE } from '../content.js';
import { button, buttonRow, choice, eyebrow, lead, pageTitle } from '../render/ui.js';

export function renderExperience(ctx) {
  const { state, actions } = ctx;

  return frag(
    eyebrow('Almost there'),
    pageTitle("What's your experience level with UEFN?"),
    lead('This decides how much hand-holding the walkthrough starts with. It is asked every time and never saved with the game.'),

    h(
      'div',
      { class: 'g-choices g-choices-2' },
      ...EXPERIENCE_LEVELS.map((level) =>
        choice({
          label: level.label,
          description: level.description,
          meta: level.effect,
          selected: state.experienceLevel === level.id,
          onSelect: () => actions.chooseExperience(level.id)
        })
      )
    ),

    h('p', { class: 'g-meta-line' }, EXPERIENCE_HONESTY_NOTE),

    buttonRow([button({ label: 'Back', iconName: 'arrowLeft', onClick: () => actions.back() })])
  );
}
