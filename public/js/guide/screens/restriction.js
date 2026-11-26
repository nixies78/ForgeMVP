/**
 * Screen 6 — Restriction: the gate.
 *
 * This is a gate, not a checkbox, and the shape matters: the user reads the plain-English rules for
 * the brand they just chose, sees where the rules come from, and only then decides. The brief calls
 * this "the right shape for content that carries legal weight".
 *
 * The freshness stamp is a v2 addition. The restriction text was hand-transcribed from Epic's
 * per-brand rules pages and has a known expiry — the data file itself records that Epic's partner-fee
 * page is already stale about two brands — so the screen says when it was researched rather than
 * implying it is current forever.
 *
 * The gate is also the longest read in the wizard — three sections, and fourteen to nineteen rules
 * depending on the brand — so it is the one screen that collapses its panels and carries a section rail.
 * The reasoning for both, and for the way they work together, is in css/guide.css above `.g-gatecols`;
 * the part that belongs here is the rule that a jump must never land on a closed panel, so the rail
 * opens one before it scrolls to it.
 */

import { h, frag, richText } from '../dom.js';
import { UI } from '../content.js';
import { button, buttonRow, eyebrow, lead, pageTitle, panel, paragraph } from '../render/ui.js';

/* One observer for the rail, disconnected and replaced on every render of this screen. A live
 * IntersectionObserver is kept alive by the browser for as long as it is observing something, so one
 * left behind by the previous visit would hold that visit's panels — and the detached screen they
 * belong to — for the life of the page. */
let railObserver = null;

/** The id a section's panel carries, so the rail has something to point at. */
function sectionId(title) {
  return `gate-${String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "1 rules" is not a sentence: the rail states the size of what it is pointing at. */
function ruleCount(count) {
  return count === 1 ? '1 rule' : `${count} rules`;
}

/**
 * Mark the section the reader is looking at.
 *
 * The band the observer watches is the strip just below the two sticky bars: a section counts as current
 * from the moment its top reaches the reader's eye until the next one takes over. Both bar heights are
 * measured at runtime and published as custom properties (js/guide/chrome.js), so the band is computed
 * from them rather than written down as a number that only holds at one width.
 *
 * Nothing in the band does not clear the mark. Between two panels there is the standing-rules note and a
 * gap, and a rail that went blank every time the reader crossed one would flicker for no reason.
 */
function observeRail(items) {
  if (railObserver) {
    railObserver.disconnect();
    railObserver = null;
  }
  if (typeof IntersectionObserver !== 'function') return;

  const styles = getComputedStyle(document.documentElement);
  const bars =
    (parseFloat(styles.getPropertyValue('--sh-header-h')) || 72) +
    (parseFloat(styles.getPropertyValue('--sh-app-head-h')) || 40);

  const inBand = new Set();
  let current = items[0] || null;

  const sync = () => {
    /* The topmost section in the band is the one being read; anything below it is only in the band
     * because the reader is on the way to it. */
    const hit = items.find((item) => inBand.has(item.node));
    if (hit) current = hit;
    for (const item of items) {
      item.control.classList.toggle('is-current', item === current);
      if (item === current) item.control.setAttribute('aria-current', 'true');
      else item.control.removeAttribute('aria-current');
    }
  };

  railObserver = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (record.isIntersecting) inBand.add(record.target);
        else inBand.delete(record.target);
      }
      sync();
    },
    { rootMargin: `-${Math.round(bars + 8)}px 0px -55% 0px`, threshold: 0 }
  );

  for (const item of items) railObserver.observe(item.node);
}

/**
 * One rule, with its lead-in marked for promotion unless the sentence runs straight on from it.
 *
 * Every rule in the data opens with a bold lead-in, and turning that lead-in into its own line is what
 * makes a list of nineteen rules scannable instead of a wall (css/guide.css, `.g-rules`). But 23 of the
 * 121 rules are written as a clause plus the rest of the sentence — "You can use 'Star Wars' plus location
 * and character names in your island title, as long as you don't imply Disney made or endorsed it" — and
 * promoting the clause would start the next line with the comma that joins it to the sentence it belongs
 * to. The comma immediately after the bold is that signal, and it is the only one that needs handling: a
 * lead-in that runs on into an em dash or a lowercase clause reads as a heading over its own definition
 * either way.
 */
function ruleItem(rule) {
  const item = h('li', {}, richText(rule));
  const lead = item.querySelector('b:first-child');
  const next = lead && lead.nextSibling;
  if (next && String(next.textContent || '').trimStart().startsWith(',')) item.classList.add('is-runon');
  return item;
}

export function renderRestriction(ctx) {
  const { data, state, actions } = ctx;
  const brand = data.brandsById.get(state.brandKey) || data.brands[0];
  const type = data.gameTypes[state.gameTypeKey];
  const confirmation = brand.restriction_confirmation || { sections: [], guidelines_url: '', guidelines_label: '' };
  const licensed = brand.id !== 'original';
  const sections = confirmation.sections || [];

  /* The panels are built before the rail, because the rail points at them: each entry scrolls to a panel
   * and opens it, so the panels have to exist and carry their ids first. The first section starts open —
   * the screen is asking the reader to agree to what is in these panels, and a page of closed bars asks
   * for agreement to something the reader has not seen. */
  const sectionPanels = sections.map((section, index) => {
    const node = panel({
      title: section.title,
      className: 'g-panel-rules',
      collapsible: true,
      open: index === 0,
      children: [h('ul', { class: 'g-rules' }, ...(section.rules || []).map(ruleItem))]
    });
    node.id = sectionId(section.title);
    return node;
  });

  const sourcePanel = panel({
    eyebrowText: 'Where this comes from',
    className: 'g-panel-source',
    collapsible: true,
    children: [
      h(
        'p',
        {},
        h(
          'a',
          { href: confirmation.guidelines_url, target: '_blank', rel: 'noreferrer noopener' },
          confirmation.guidelines_label || 'Official guidelines'
        ),
        licensed ? ' — the full, authoritative version. The summary above is a plain-English reading of it.' : ''
      ),
      brand.verified_on
        ? h('p', { class: 'g-meta-line' }, `Rules verified on ${brand.verified_on}.`)
        : h(
            'p',
            { class: 'g-meta-line' },
            'These rules were transcribed from Epic\'s per-brand pages and are dated — no per-brand verification date is recorded yet.'
          ),
      data.brandRulesNote ? h('p', { class: 'g-small g-muted' }, richText(data.brandRulesNote)) : null,
      (confirmation.source_urls || []).length
        ? h(
            'ul',
            { class: 'g-list g-list-tight' },
            ...confirmation.source_urls.map((url) =>
              h('li', {}, h('a', { href: url, target: '_blank', rel: 'noreferrer noopener' }, url))
            )
          )
        : null
    ]
  });
  sourcePanel.id = sectionId('Where this comes from');

  const jumpTo = (item) => {
    /* Open first, then move: a rail that scrolled to a closed panel would look broken, and the reader
     * would have to click twice to see the thing they asked for. */
    item.node.open = true;
    const head = item.node.querySelector('summary');
    /* Focus follows the jump, because the rail is a navigation control and a keyboard user who used it
     * should end up at the destination rather than back at the top of the page. `preventScroll` keeps it
     * from fighting the scroll below, which is the one that respects the sticky bars. */
    if (head) head.focus({ preventScroll: true });
    item.node.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const railItems = [
    ...sections.map((section, index) => ({
      node: sectionPanels[index],
      label: section.title,
      count: ruleCount((section.rules || []).length)
    })),
    { node: sourcePanel, label: 'Where this comes from', count: null }
  ].map((item) => ({
    ...item,
    control: h(
      'button',
      { type: 'button', class: 'g-gaterail-link', on: { click: () => jumpTo(item) } },
      item.label,
      item.count ? h('span', { class: 'g-gaterail-count' }, item.count) : null
    )
  }));

  const rail = h(
    'nav',
    { class: 'g-gaterail', 'aria-label': 'Sections on this page' },
    h('p', { class: 'g-gaterail-title' }, 'On this page'),
    h(
      'ul',
      { class: 'g-gaterail-list' },
      ...railItems.map((item) => h('li', {}, item.control))
    )
  );

  observeRail(railItems);

  return frag(
    eyebrow('Before you commit'),
    pageTitle(`${brand.label} comes with some usage rules.`),
    lead('Read these once. If they do not suit the game you are designing, go back — nothing is committed yet.'),

    h(
      'div',
      { class: 'g-gatecols' },
      h(
        'div',
        { class: 'g-gate-main' },
        ...sectionPanels,
        licensed
          ? h(
              'div',
              { class: 'g-legalnote' },
              h(
                'p',
                {},
                'On top of this brand\'s own rules, the standard Fortnite Developer Rules apply. Joining the Fortnite ' +
                  'Developer Program and signing the IP Partner Licensing Agreement is required, and one signature covers every brand.'
              )
            )
          : null,
        sourcePanel
      ),
      rail
    ),

    type ? paragraph(`Chosen game type: ${type.label}. The brand affects the assets you build with, not the device list.`) : null,

    buttonRow(
      [
        button({ label: UI.back, iconName: 'arrowLeft', onClick: () => actions.back() }),
        button({ label: "I'm okay with this", variant: 'primary', iconName: 'arrow', onClick: () => actions.acceptRestriction() })
      ],
      { between: true }
    )
  );
}
