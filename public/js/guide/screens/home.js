/**
 * Screen 1 — Home.
 *
 * Three design-mode panels, then the saved-games list, exactly as v1 ordered it. The guided mode is
 * the real flow; the other two are visible but honest about being unbuilt, because the brief's rule
 * is that a visible dead end is worse than no panel and the product decision was to keep all three
 * on display while they are worked out.
 */

import { h, frag, plural } from '../dom.js';
import { DESIGN_MODES, UI } from '../content.js';
import { button, buttonRow, choice, eyebrow, pageTitle, paragraph, lead, badgeChip, panel } from '../render/ui.js';

export function renderHome(ctx) {
  const { data, state, store, actions } = ctx;
  const saved = store.list();

  return frag(
    eyebrow('Design a Fortnite island, then build it'),
    pageTitle('Ready to make a game?'),
    lead(
      'Answer a short set of questions about the game you want. The guide narrows it to an exact game type, ' +
        'lists the UEFN devices it needs with the settings to change, and shows how the loop fits together.'
    ),

    h(
      'div',
      { class: 'g-choices g-choices-3', role: 'list' },
      ...DESIGN_MODES.map((mode) =>
        h(
          'div',
          { role: 'listitem' },
          choice({
            label: mode.label,
            description: mode.description,
            badges:
              mode.status === 'live'
                ? [badgeChip({ text: 'Ready', tone: 'accent' })]
                : [badgeChip({ text: 'Not built yet', tone: 'neutral', title: 'This design mode is a placeholder for now' })],
            meta: mode.action,
            onSelect: () =>
              mode.status === 'live'
                ? actions.go({ screen: 'category' })
                : actions.go({ screen: 'placeholder', mode: mode.id })
          })
        )
      )
    ),

    h('p', { class: 'g-meta-line' }, `${data.liveCount} researched game types · ${data.draftCount} drafts · ${data.customCount} category basics · ${Object.keys(data.deviceLibrary).length} devices`),

    savedGames(ctx, saved),

    h(
      'details',
      { class: 'g-details' },
      h('summary', { class: 'g-details-summary' }, 'How this works'),
      h(
        'ol',
        { class: 'g-howit' },
        ...data.howItWorks.map((line) => h('li', {}, line.replace(/^Step \d+:\s*/, '')))
      ),
      h(
        'p',
        { class: 'g-muted g-small' },
        'Device names and Details-panel settings were researched against Epic\'s official UEFN documentation. ' +
          'This tool is guidance: it produces a plan you follow in the editor, not files or code.'
      )
    )
  );
}

function savedGames(ctx, saved) {
  const { store, actions, data } = ctx;

  return panel({
    eyebrowText: UI.savedGamesTitle,
    title: saved.length ? plural(saved.length, 'saved game') : null,
    className: 'g-panel-saved',
    children: [
      saved.length
        ? h(
            'ul',
            { class: 'g-savedlist' },
            ...saved.map((game) => savedRow(ctx, game))
          )
        : h('p', { class: 'g-muted' }, UI.noSavedGames)
    ]
  });
}

function savedRow(ctx, game) {
  const { data, actions } = ctx;
  const type = data.gameTypes[game.gameTypeKey];
  const label = type ? type.label : 'Unknown game type';
  const category = data.gameCategories.find((c) => c.id === (type ? type.category : game.categoryKey));
  const when = formatDate(game.savedAt);
  const isDraft = Boolean(type && type.status === 'draft');

  return h(
    'li',
    { class: 'g-saveditem' },
    h(
      'div',
      { class: 'g-savedmain' },
      h('h4', { class: 'g-savedname' }, game.name),
      h(
        'p',
        { class: 'g-savedmeta' },
        category ? `${category.label} › ` : '',
        label,
        when ? ` · saved ${when}` : '',
        isDraft ? ' · draft game type' : ''
      ),
      game.migratedFrom
        ? h('p', { class: 'g-muted g-small' }, `Imported from an older version (${game.migratedFrom.replace('genre:', 'genre ')}) and mapped to this game type.`)
        : null
    ),
    buttonRow([
      button({
        label: 'Open',
        variant: 'primary',
        href: '#',
        onClick: (event) => {
          event.preventDefault();
          actions.loadSaved(game.id);
        }
      }),
      button({
        label: UI.rename,
        variant: 'quiet',
        onClick: () => {
          const next = window.prompt(`${UI.savePrompt}`, game.name);
          if (next === null) return;
          actions.renameSaved(game.id, next);
        }
      }),
      button({
        label: UI.remove,
        variant: 'danger',
        onClick: () => {
          if (!window.confirm(`Delete "${game.name}"? This cannot be undone.`)) return;
          actions.removeSaved(game.id);
        }
      })
    ])
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
