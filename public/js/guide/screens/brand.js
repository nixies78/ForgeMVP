/**
 * Screen 5 — Brand: the template the island will be built from.
 *
 * The badge is deliberately framed the other way round from v1's: instead of "this brand suits these
 * types", the panel says whether the brand suits *the type you just chose*, which is the question the
 * user actually has at this point.
 *
 * "Let's go back" is an explicit route, not an afterthought: by now every design question has been
 * answered, and discovering that a brand's rules do not suit the game is a normal, expected moment.
 */

import { h, frag, plural, richText } from '../dom.js';
import { brandsForGameType, brandAssets } from '../data.js';
import { button, buttonRow, badgeChip, eyebrow, imageSlot, lead, pageTitle, panel, paragraph } from '../render/ui.js';

export function renderBrand(ctx) {
  const { data, state, actions } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brands = brandsForGameType(data, state.gameTypeKey);
  const preview = brands.find((b) => b.id === (state.previewBrandKey || state.brandKey)) || brands[0];
  const chosen = brands.find((b) => b.id === state.brandKey);
  /* Asset paths and size specs come from the data file's own image spec, so the convention has one
   * definition rather than one per screen. */
  const previewAssets = preview ? brandAssets(data, preview) : null;

  return frag(
    eyebrow('Step 3 of 3'),
    pageTitle('Now pick a brand template to build with.'),
    lead(
      'A brand template decides which starter assets your island begins with. It changes how your game looks and ' +
        'what you can legally build with — it does not change which devices the game needs.'
    ),

    h(
      'div',
      { class: 'g-brandstrip', role: 'list' },
      ...brands.map((brand) => {
        const tile = brandAssets(data, brand);
        return h(
          'div',
          { role: 'listitem' },
          h(
            'button',
            {
              class: `g-brandtile${preview && preview.id === brand.id ? ' is-previewing' : ''}${state.brandKey === brand.id ? ' is-chosen' : ''}`,
              type: 'button',
              'aria-pressed': state.brandKey === brand.id ? 'true' : 'false',
              on: { click: () => actions.previewBrand(brand.id) }
            },
            imageSlot({
              src: tile.logo,
              alt: '',
              spec: tile.logoSpec,
              className: 'g-brandlogo',
              label: brand.label,
              compact: true
            }),
            h('span', { class: 'g-brandtile-label' }, brand.label),
            state.brandKey === brand.id ? h('span', { class: 'g-brandtile-marker' }, '✓ Chosen') : null
          )
        );
      })
    ),

    preview
      ? panel({
          eyebrowText: 'Brand detail',
          title: preview.label,
          className: 'g-panel-brand',
          actions: [
            preview.suitsChosenType
              ? badgeChip({ text: `Suited to ${type ? type.label : 'your game type'}`, tone: 'accent' })
              : badgeChip({ text: 'Not specifically matched', tone: 'neutral', title: 'This brand does not list your game type as a natural fit, but you can still build with it.' })
          ],
          children: [
            imageSlot({
              src: previewAssets.hero,
              alt: `${preview.label} key art`,
              spec: previewAssets.heroSpec,
              className: 'g-brandhero',
              label: `${preview.label} key art`
            }),
            paragraph(preview.description),
            h('p', { class: 'g-pitch' }, preview.pitch),
            h(
              'div',
              { class: 'g-provides' },
              h('h4', { class: 'g-subhead' }, 'What it gives you'),
              h('ul', { class: 'g-list' }, ...(preview.provides || []).map((item) => h('li', {}, richText(item))))
            ),
            preview.caveat
              ? h('div', { class: 'g-caveat' }, h('h4', { class: 'g-subhead' }, 'Worth knowing'), h('p', {}, richText(preview.caveat)))
              : null,
            h(
              'p',
              { class: 'g-meta-line' },
              h(
                'a',
                { href: preview.restriction_confirmation.guidelines_url, target: '_blank', rel: 'noreferrer noopener' },
                preview.restriction_confirmation.guidelines_label || 'Official guidelines'
              ),
              ' · usage rules are summarised on the next screen before anything is committed.'
            )
          ]
        })
      : null,

    buttonRow(
      [
        button({ label: "← Let's go back", onClick: () => actions.back() }),
        h(
          'div',
          { class: 'g-btnrow-inner' },
          button({
            label: preview && state.brandKey === preview.id ? `Continue with ${preview.label}` : `Use ${preview ? preview.label : 'this brand'}`,
            variant: 'primary',
            iconName: 'arrow',
            onClick: () => actions.chooseBrand(preview ? preview.id : null)
          })
        )
      ],
      { between: true }
    ),

    h('p', { class: 'g-meta-line g-small' }, `${plural(brands.length, 'brand template')} available. Brand art is convention-based — drop a correctly named file in images/brands/ and it appears here with no code change.`)
  );
}
