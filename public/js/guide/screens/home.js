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

/* What each way in looks like. Two sets are wired up so the two can be compared on the page itself:
 *
 *   photos  - the three photographs the owner pointed at, copied into public/assets (where the server can
 *             reach them; the repository's root assets/ folder is not served). They are local-only by the
 *             owner's decision and deliberately not committed, so a fresh clone shows this screen without them.
 *   lineart - the set another session committed in public/images/design_modes: white line art on the library
 *             canvas with token accents, drawn to match the app's own visual language. See that folder's
 *             README, which also supplies a `slots` alternate for the Randomise card.
 *
 * `?art=lineart` selects the second set; the photographs are the default. The switch exists only while the two
 * are being judged and goes once one is chosen. A mode with no entry in a set simply renders without a picture,
 * so either map is safe to trim. */
const ART_SETS = {
  photos: {
    guided: 'assets/guided_process.jpg',
    randomise: 'assets/wheel_of_fortune.jpg',
    ai_chat: 'assets/ai_chat.jpg'
  },
  lineart: {
    guided: 'images/design_modes/guided.jpg',
    randomise: 'images/design_modes/randomise.jpg',
    ai_chat: 'images/design_modes/ai_chat.jpg'
  }
};

/** The chosen set, and this mode's picture in it, or null when the mode has none. */
function artFor(modeId) {
  let which = 'photos';
  try {
    if (new URLSearchParams(location.search).get('art') === 'lineart') which = 'lineart';
  } catch {
    /* No location (a test harness importing this module): the default set is the right answer. */
  }
  const src = ART_SETS[which][modeId];
  return src ? { src } : null;
}

export function renderHome(ctx) {
  const { data, state, store, actions } = ctx;
  const saved = store.list();

  return frag(
    eyebrow('Design a Fortnite island, then build it'),
    pageTitle('Ready to make a game?'),
    /* 1.2.0 replaced the three-clause explanation with the line that matches the screen: the choices are
     * above it, and the saved games are below it. */
    lead("Pick how you'd like to design it — or scroll down to pick up where you left off."),

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
            art: artFor(mode.id),
            /* Concept 8b's semantics for the three tiles, which is what the palette is for: the mode you can
             * start now is lit in Blue, the two that are not built yet are Indigo. The badges say the same
             * thing in words, so the colour is never the only thing carrying the state. */
            tone: mode.status === 'live' ? 'blue' : 'indigo',
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
      ),
      /* The disclaimer used to sit in the page footer. The architecture spec (v2) gives the footer one
       * job - the system status and the admin link - so the note moved here, to the end of the home
       * screen, rather than being dropped. */
      h(
        'p',
        { class: 'g-muted g-small' },
        'Forge is an independent guide to building Fortnite islands in UEFN, and is not affiliated with ' +
          'Epic Games. Fortnite, Unreal Engine and UEFN are trademarks of Epic Games, Inc.'
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
