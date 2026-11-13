/**
 * Screen 9 — Walkthrough: the build steps, with the generated device plan inside step 4.
 *
 * v1's five steps, kept in order, with the beginner-only Basic Navigation step filtered by the
 * experience level. Two things are deliberately not hardcoded any more: the step bodies live in
 * js/guide/content.js rather than inside this render function, and the atmosphere devices come from
 * the role flag in the data instead of an id checked inline.
 */

import { h, frag, plural, richText } from '../dom.js';
import { effectiveLayoutTip } from '../data.js';
import { rebuildDevices, universalPolishDevices } from '../resolve.js';
import { UI, WALKTHROUGH_STEPS, WALKTHROUGH_BRAND_LINE } from '../content.js';
import { walkthroughSteps } from '../state.js';
import { button, buttonRow, eyebrow, imageSlot, lead, pageTitle, panel, paragraph, sectionHeading } from '../render/ui.js';
import { deviceGroups, notesList, planSummary } from '../render/devices.js';

export function renderWalkthrough(ctx) {
  const { data, state, actions } = ctx;
  const steps = walkthroughSteps(state.experienceLevel, WALKTHROUGH_STEPS);
  const index = Math.min(Math.max(state.stepIndex, 0), steps.length - 1);
  const step = steps[index];
  const type = data.gameTypes[state.gameTypeKey];
  const brand = data.brandsById.get(state.brandKey);
  const next = steps[index + 1];

  return frag(
    eyebrow(`Build · Step ${index + 1} of ${steps.length}`),

    tracker(ctx, steps, index),

    panel({
      heading: pageTitle(step.title, { small: true }),
      className: 'g-panel-step',
      children: [
        videoSlot(step),
        ...step.body.map((line) => paragraph(line)),
        stepConditional(ctx, step, { brand, type })
      ]
    }),

    buttonRow(
      [
        button({ label: index === 0 ? UI.back : UI.previous, iconName: 'arrowLeft', onClick: () => actions.back() }),
        h(
          'div',
          { class: 'g-btnrow-inner' },
          button({ label: UI.editGameType, variant: 'quiet', onClick: () => actions.go({ screen: 'gametype' }) }),
          next
            ? button({
                label: `Next: ${next.title}`,
                variant: 'primary',
                iconName: 'arrow',
                onClick: () => actions.go({ screen: 'walkthrough', stepIndex: index + 1 })
              })
            : button({
                label: UI.finish,
                variant: 'primary',
                iconName: 'arrow',
                onClick: () => actions.finishWalkthrough()
              })
        )
      ],
      { between: true }
    )
  );
}

/** The step tracker: done / now / upcoming. State is text as well as styling, never colour alone. */
function tracker(ctx, steps, index) {
  const { actions } = ctx;
  return h(
    'nav',
    { class: 'g-tracker', 'aria-label': 'Build steps' },
    h(
      'ol',
      { class: 'g-tracker-list' },
      ...steps.map((step, i) => {
        const state = i === index ? 'current' : i < index ? 'done' : 'upcoming';
        const marker = state === 'current' ? 'Now' : state === 'done' ? 'Done' : 'Next';
        return h(
          'li',
          { class: `g-tracker-item is-${state}` },
          h(
            'a',
            {
              class: 'g-tracker-link',
              href: `#/walk/${i}`,
              'aria-current': state === 'current' ? 'step' : null,
              on: {
                click: (event) => {
                  event.preventDefault();
                  actions.go({ screen: 'walkthrough', stepIndex: i });
                }
              }
            },
            h('span', { class: 'g-tracker-num' }, String(i + 1)),
            h('span', { class: 'g-tracker-title' }, step.title),
            h('span', { class: 'g-tracker-marker' }, marker)
          )
        );
      })
    )
  );
}

/** A video slot that explains itself when the file is not there yet. */
function videoSlot(step) {
  const wrap = h('div', { class: 'g-video' });
  const video = h('video', {
    class: 'g-video-el',
    controls: true,
    preload: 'metadata',
    playsinline: true,
    src: step.video,
    'aria-label': `${step.title} walkthrough video`
  });
  video.addEventListener(
    'error',
    () => {
      video.remove();
      if (!wrap.querySelector('.g-videoph')) wrap.append(placeholder());
    },
    { once: true }
  );
  function placeholder() {
    return h(
      'div',
      { class: 'g-videoph' },
      h('span', { class: 'g-videoph-label' }, 'Video slot'),
      h('code', {}, step.video),
      h('span', { class: 'g-videoph-spec' }, 'Drop the file in videos/ with exactly this name and it appears here — no code change.')
    );
  }
  wrap.append(video);
  return wrap;
}

/** Step-specific extras: the brand line, the layout tip, the device plan, the polish devices. */
function stepConditional(ctx, step, { brand, type }) {
  const { data, state } = ctx;

  if (step.id === 'create_project') {
    const branded = brand && brand.id !== 'original';
    return h(
      'div',
      { class: 'g-tip' },
      h('strong', {}, 'Template: '),
      branded
        ? WALKTHROUGH_BRAND_LINE.branded(brand.label)
        : WALKTHROUGH_BRAND_LINE.original
    );
  }

  if (step.id === 'block_out') {
    const tip = effectiveLayoutTip(data, state.gameTypeKey);
    return tip ? h('div', { class: 'g-tip' }, h('strong', {}, `For ${type ? type.label : 'this game type'}: `), richText(tip)) : null;
  }

  if (step.id === 'core_devices') {
    const plan = rebuildDevices(data, state.gameTypeKey, state.answers);
    return frag(
      planSummary(plan.counts),
      ...(plan.orphans.length
        ? [
            h(
              'div',
              { class: 'g-notice g-notice-warn', role: 'status' },
              h(
                'p',
                {},
                `${plural(plan.orphans.length, 'setting override')} could not be matched to a device in this list. ` +
                  'That is a data problem worth reporting, not something you did.'
              )
            )
          ]
        : []),
      deviceGroups(plan.coreGroups, {
        emptyText: 'This game type resolves to the category baseline, which has no devices listed yet.'
      }),
      notesList(plan.notes)
    );
  }

  if (step.id === 'look_good') {
    const plan = rebuildDevices(data, state.gameTypeKey, state.answers);
    const polish = plan.polishGroups;
    return frag(
      brand
        ? h(
            'section',
            { class: 'g-brandblock' },
            sectionHeading(`Your ${brand.label} template`, { small: true }),
            paragraph(brand.description),
            h('ul', { class: 'g-list' }, ...(brand.provides || []).map((item) => h('li', {}, richText(item)))),
            brand.caveat ? h('p', { class: 'g-caveat-text' }, richText(brand.caveat)) : null
          )
        : null,
      deviceGroups(polish, { emptyText: '' }),
      h(
        'p',
        { class: 'g-meta-line' },
        'Plus the three atmosphere devices every island gets: ' +
          universalPolishDevices(data)
            .map((d) => d.name)
            .join(', ') +
          '.'
      )
    );
  }

  /* Any step may carry one tip, which is v1's shape for beginner guidance. */
  if (step.tip) return h('div', { class: 'g-tip' }, h('strong', {}, 'Tip: '), step.tip);

  return null;
}
