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
 */

import { h, frag, richText } from '../dom.js';
import { button, buttonRow, eyebrow, lead, pageTitle, panel, paragraph } from '../render/ui.js';

export function renderRestriction(ctx) {
  const { data, state, actions } = ctx;
  const brand = data.brandsById.get(state.brandKey) || data.brands[0];
  const type = data.gameTypes[state.gameTypeKey];
  const confirmation = brand.restriction_confirmation || { sections: [], guidelines_url: '', guidelines_label: '' };
  const licensed = brand.id !== 'original';

  return frag(
    eyebrow('Before you commit'),
    pageTitle(`${brand.label} comes with some usage rules.`),
    lead('Read these once. If they do not suit the game you are designing, go back — nothing is committed yet.'),

    ...(confirmation.sections || []).map((section) =>
      panel({
        title: section.title,
        className: 'g-panel-rules',
        children: [h('ul', { class: 'g-rules' }, ...(section.rules || []).map((rule) => h('li', {}, richText(rule))))]
      })
    ),

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

    panel({
      eyebrowText: 'Where this comes from',
      className: 'g-panel-source',
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
    }),

    type ? paragraph(`Chosen game type: ${type.label}. The brand affects the assets you build with, not the device list.`) : null,

    buttonRow(
      [
        button({ label: "← Let's go back", onClick: () => actions.back() }),
        button({ label: "I'm okay with this", variant: 'primary', iconName: 'arrow', onClick: () => actions.acceptRestriction() })
      ],
      { between: true }
    )
  );
}
