/**
 * Screen 3 — Game type: "Which one exactly?"
 *
 * Types for the chosen category, ordered researched → draft → "Just give me the basics", which is
 * v1's ordering and worth keeping: the fallback must never be mistaken for a researched entry.
 *
 * Drafts are visible only in dev mode, and every one of them carries its own explanation as a
 * tooltip — the data file's `research_notes` says exactly what has not been researched yet.
 */

import { h, frag, plural } from '../dom.js';
import { gameTypesInCategory, category as findCategory } from '../data.js';
import { badgeChip, choice, eyebrow, lead, pageTitle, paragraph } from '../render/ui.js';

export function renderGameType(ctx) {
  const { data, state, actions } = ctx;
  const cat = findCategory(data, state.categoryKey);
  const types = gameTypesInCategory(data, state.categoryKey, state.devMode);
  const researched = types.filter((t) => t.status === 'live' && !t.is_custom).length;

  return frag(
    eyebrow('Step 2 of 3'),
    pageTitle('Which one exactly?'),
    lead(
      "Choose the closest match. \"Just give me the basics\" skips the specifics and starts you with the " +
        'essential devices for this category, so you can shape the rest yourself as you build.'
    ),

    researched === 0
      ? paragraph(
          `Nothing in ${cat ? cat.label : 'this category'} has been researched yet, so every option here resolves to the ` +
            'category baseline rather than a tailored device list. That is still a working starting point, just a broader one.'
        )
      : null,

    h(
      'div',
      { class: 'g-choices g-choices-2' },
      ...types.map((type) =>
        choice({
          label: type.label,
          description: type.description,
          badges: typeBadges(type),
          meta: typeMeta(type),
          selected: state.gameTypeKey === type.key,
          onSelect: () => actions.chooseGameType(type.key)
        })
      )
    ),

    h('p', { class: 'g-meta-line' }, `Showing ${plural(types.length, 'game type')} in ${cat ? cat.label : 'this category'}.`),

    !state.devMode && data.draftCount
      ? h(
          'p',
          { class: 'g-meta-line' },
          `${data.draftCount} further game types are named but not researched. `,
          h(
            'button',
            { class: 'g-linkbtn', type: 'button', on: { click: () => actions.setDevMode(true) } },
            'Turn on dev mode'
          ),
          ' to see them badged as drafts.'
        )
      : null
  );
}

function typeBadges(type) {
  if (type.is_custom) {
    return [
      badgeChip({
        text: 'Essentials only',
        tone: 'accent',
        title: 'The essential devices for this category, with no game-type-specific advice.'
      })
    ];
  }
  if (type.status === 'draft') {
    return [
      badgeChip({
        text: 'Draft — core devices only',
        tone: 'warn',
        title: type.research_notes || 'Not researched yet'
      })
    ];
  }
  const badges = [badgeChip({ text: 'Researched', tone: 'accent', title: 'Devices, settings and questions are all researched for this type.' })];
  if (!type.inherits_baseline) badges.push(badgeChip({ text: 'Own device set', tone: 'neutral' }));
  return badges;
}

function typeMeta(type) {
  const questions = (type.questions || []).length;
  const devices = (type.devices || []).length;
  if (type.is_custom) return 'No questions — straight to the plan';
  if (type.status === 'draft') return `No questions yet · ${plural(devices, 'device')} of its own`;
  return `${plural(questions, 'question')} · ${plural(devices, 'device')} of its own`;
}
