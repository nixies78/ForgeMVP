/**
 * Screen 2 — Category: "What type of game do you want to make?"
 *
 * The ten categories, with counts that tell the truth about what is behind each one. v1 kept every
 * category visible by marking the ten "Just give me the basics" entries as `live`, which made the two
 * categories with no researched types look as complete as the other eight (UEFN_GUIDE_V2_HANDOFF.md,
 * Part 7 item 3). They are still reachable here — that was the product decision — but a category with
 * no researched types says "Basics only" on its face.
 */

import { h, frag, plural } from '../dom.js';
import { categorySummaries } from '../data.js';
import { UI } from '../content.js';
import { badgeChip, button, buttonRow, choice, eyebrow, lead, pageTitle, paragraph } from '../render/ui.js';

export function renderCategory(ctx) {
  const { data, state, actions } = ctx;
  const summaries = categorySummaries(data, state.devMode).filter((c) => c.visible);

  return frag(
    eyebrow('Step 1 of 3'),
    pageTitle('What type of game do you want to make?'),
    lead(
      'Pick the closest fit. You can change this later from any screen, and nothing you have answered is lost when you do.'
    ),

    h(
      'div',
      { class: 'g-choices g-choices-2' },
      ...summaries.map((cat) =>
        choice({
          label: cat.label,
          description: cat.description,
          badges: categoryBadges(cat),
          meta: categoryMeta(cat),
          selected: state.categoryKey === cat.id,
          onSelect: () => actions.chooseCategory(cat.id)
        })
      )
    ),

    state.devMode
      ? paragraph(
          `Dev mode is on: all ${plural(data.gameTypeKeys.length, 'game type')} are listed, including the ${data.draftCount} that have not been researched yet.`
        )
      : h(
          'p',
          { class: 'g-meta-line' },
          UI.visibleWithDevModeOff,
          ' ',
          h(
            'button',
            {
              class: 'g-linkbtn',
              type: 'button',
              on: { click: () => actions.setDevMode(true) }
            },
            'Turn on dev mode'
          )
        ),

    /* Every step of the wizard carries its own way back (architecture spec v2); Home does not, because
     * there is nothing before it. */
    buttonRow([button({ label: UI.back, iconName: 'arrowLeft', onClick: () => actions.back() })])
  );
}

function categoryBadges(cat) {
  const badges = [];
  if (cat.researched) badges.push(badgeChip({ text: `${cat.researched} researched`, tone: 'accent' }));
  if (cat.baselineOnly) {
    badges.push(
      badgeChip({
        text: 'Basics only',
        tone: 'warn',
        title: 'No game type in this category has been researched yet, so the device list comes from the category baseline alone.'
      })
    );
  }
  if (cat.drafts && cat.researched) badges.push(badgeChip({ text: `${cat.drafts} drafts`, tone: 'neutral' }));
  return badges;
}

function categoryMeta(cat) {
  const parts = [];
  parts.push(plural(cat.total, 'game type'));
  if (cat.custom) parts.push(`${cat.custom} basics`);
  return parts.join(' · ');
}
