/**
 * Screen 7 — Summary: the core loop, everything that was chosen, and somewhere to save it.
 *
 * Two things v2 does differently. The diagram is accompanied by a text legend, so the loop is
 * readable without seeing the drawing at all. And every answer in the recap has an Edit control that
 * jumps straight back to that question with its answer intact — in v1 answers were positional, so the
 * only way to change an early decision was to answer everything again.
 */

import { h, frag, plural, richText } from '../dom.js';
import { effectiveCoreLoop, effectiveLayoutTip } from '../data.js';
import { rebuildDevices } from '../resolve.js';
import { UI, WALKTHROUGH_STEPS } from '../content.js';
import { button, buttonRow, eyebrow, lead, noticeBox, pageTitle, panel, paragraph, sectionHeading } from '../render/ui.js';
import { renderCoreLoop } from '../render/loop.js';
import { planSummary } from '../render/devices.js';

export function renderSummary(ctx) {
  const { data, state, actions, store } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);
  const loop = effectiveCoreLoop(data, state.gameTypeKey);
  const plan = rebuildDevices(data, state.gameTypeKey, state.answers);
  const saved = state.gameId ? store.get(state.gameId) : null;

  const nameInput = h('input', {
    type: 'text',
    id: 'gameName',
    class: 'g-input',
    value: state.gameName || '',
    placeholder: UI.savePlaceholder,
    autocomplete: 'off',
    maxlength: '60',
    'aria-describedby': 'gameNameHint'
  });

  const startButton = button({
    label: UI.startBuilding,
    variant: 'primary',
    iconName: 'arrow',
    disabled: !state.gameName || !state.gameName.trim(),
    onClick: () => actions.startBuilding()
  });

  nameInput.addEventListener('input', () => {
    ctx.actions.setName(nameInput.value);
    const ready = Boolean(nameInput.value.trim());
    startButton.disabled = !ready;
    startButton.classList.toggle('is-disabled', !ready);
  });

  return frag(
    eyebrow('Summary'),
    pageTitle('Here is your game.'),
    lead(`${type ? type.label : 'Your game'} · ${cat ? cat.label : ''} · ${brand ? brand.label : 'no brand'} — one page you can come back to.`),

    noticeBox(state.notice, () => actions.clearNotice()),

    panel({
      eyebrowText: 'Core loop',
      title: loop ? 'How the game plays' : 'No core loop recorded yet',
      className: 'g-panel-loop',
      children: [
        loop
          ? h('div', { class: 'g-loopwrap' }, renderCoreLoop(loop))
          : paragraph(
              'This game type resolves to the category baseline, and no core loop has been written for it yet. ' +
                'The device plan below is still valid.'
            ),
        loop ? loopLegend(loop) : null
      ]
    }),

    panel({
      eyebrowText: 'Your plan',
      title: `${plural(plan.counts.devices, 'device')} to set up`,
      className: 'g-panel-plan',
      children: [
        planSummary(plan.counts),
        paragraph(
          'The full device list, with the settings to change and why each device is on it, is in step 4 of the build ' +
            'walkthrough. Nothing here is a file or a project — it is the plan you follow in the editor.'
        ),
        effectiveLayoutTip(data, state.gameTypeKey)
          ? h('p', { class: 'g-tip' }, h('strong', {}, 'Layout tip: '), richText(effectiveLayoutTip(data, state.gameTypeKey)))
          : null
      ]
    }),

    panel({
      eyebrowText: 'Every choice',
      title: 'What you decided',
      className: 'g-panel-recap',
      children: [
        h(
          'dl',
          { class: 'g-recap' },
          recapRow('Category', cat ? cat.label : '—', () => actions.go({ screen: 'category' })),
          recapRow(
            'Game type',
            type ? `${type.label}${type.status === 'draft' ? ' (draft — baseline devices)' : ''}` : '—',
            () => actions.go({ screen: 'gametype' })
          ),
          ...state.answers.map((answer) =>
            recapRow(answer.qPrompt, answer.optionLabel, () => actions.editAnswer(answer.qId))
          ),
          recapRow('Brand template', brand ? brand.label : '—', () => actions.go({ screen: 'brand' }))
        )
      ]
    }),

    panel({
      eyebrowText: 'Keep it',
      title: saved ? `Saved as "${saved.name}"` : 'Name and save this game',
      className: 'g-panel-save',
      children: [
        h('label', { class: 'g-label', for: 'gameName' }, UI.savePrompt),
        nameInput,
        h(
          'p',
          { class: 'g-meta-line g-small', id: 'gameNameHint' },
          'Saved in this browser only. Your answers are not sent anywhere.'
        ),
        buttonRow([
          button({
            label: saved ? 'Save changes' : UI.save,
            variant: 'secondary',
            onClick: () => actions.saveGame(nameInput.value)
          }),
          startButton
        ]),
        !state.gameName || !state.gameName.trim()
          ? h('p', { class: 'g-meta-line g-small' }, 'Give it a name to start building.')
          : null,
        buttonRow([
          button({
            label: 'Copy a link to this plan',
            variant: 'quiet',
            onClick: () => actions.copyShareLink()
          })
        ]),
        h(
          'p',
          { class: 'g-meta-line g-small' },
          'The link carries the game type, your answers and the brand — nothing else, and nothing personal.'
        )
      ]
    }),

    h(
      'p',
      { class: 'g-meta-line g-small' },
      `Walkthrough: ${plural(WALKTHROUGH_STEPS.length, 'step')} (${plural(WALKTHROUGH_STEPS.length - 1, 'step')} unless you are a complete beginner).`
    )
  );
}

function recapRow(term, value, onEdit) {
  return frag(
    h('dt', { class: 'g-recap-term' }, term),
    h(
      'dd',
      { class: 'g-recap-value' },
      h('span', {}, value),
      onEdit
        ? button({ label: 'Edit', variant: 'quiet', onClick: onEdit, title: `Change: ${term}` })
        : null
    )
  );
}

/** The loop as text, so the diagram is never the only way to read it. */
function loopLegend(loop) {
  return h(
    'div',
    { class: 'g-legend' },
    sectionHeading('In words', { small: true }),
    h(
      'ol',
      { class: 'g-legend-loop' },
      h('li', {}, h('strong', {}, 'Start: '), loop.entry || '—'),
      ...(loop.loop || []).map((step) => h('li', {}, step)),
      h('li', {}, h('strong', {}, 'Then repeat until it resolves.'))
    ),
    h(
      'ul',
      { class: 'g-legend-outcomes' },
      ...(loop.outcomes || []).map((outcome) =>
        h('li', {}, h('strong', {}, `${outcome.label}: `), outcome.detail || '')
      )
    )
  );
}
