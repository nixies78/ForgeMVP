/**
 * The pieces both summary layouts are made of.
 *
 * The summary screen has two designs now (see screens/summary.js): the one the app shipped with, and
 * the pitch-first redesign. They differ in what sits where and in how the core loop is laid out — not
 * in what the page says. The device plan, the recap of every answer, the name field and its three
 * actions, the walkthrough line and the way back are the same on both, so they are written once here
 * and placed twice.
 *
 * Keeping them in one module is also what keeps the comparison honest: if the two layouts drifted in
 * their copy, the switcher would be comparing wording rather than layout.
 */

import { h, frag, plural, richText } from '../dom.js';
import { effectiveLayoutTip } from '../data.js';
import { rebuildDevices } from '../resolve.js';
import { UI, WALKTHROUGH_STEPS } from '../content.js';
import { button, buttonRow, paragraph } from './ui.js';
import { planSummary } from './devices.js';

/** One row of the recap: a term, its value, and the control that goes back and changes it. */
export function recapRow(term, value, onEdit) {
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

/**
 * The name field and the button it gates.
 *
 * They come as a pair because the button is disabled until the field has something in it, so whoever
 * places them has to place both. The handler is on the field itself, so it works wherever they end up.
 */
export function nameAndStart(ctx) {
  const { state, actions } = ctx;

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
    actions.setName(nameInput.value);
    const ready = Boolean(nameInput.value.trim());
    startButton.disabled = !ready;
    startButton.classList.toggle('is-disabled', !ready);
  });

  return { nameInput, startButton };
}

/** The name field, Save, Start Building and the share link, in the order they are read. */
export function saveControls(ctx, { nameInput, startButton }) {
  const { state, actions, store } = ctx;
  const saved = state.gameId ? store.get(state.gameId) : null;

  return [
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
  ];
}

/** "Your plan": the device counts, the note, and the layout tip when the data has one. */
export function planPanel(ctx) {
  const { data, state } = ctx;
  const plan = rebuildDevices(data, state.gameTypeKey, state.answers);
  const tip = effectiveLayoutTip(data, state.gameTypeKey);

  return {
    eyebrowText: 'Your plan',
    title: `${plural(plan.counts.devices, 'device')} to set up`,
    className: 'g-panel-plan',
    children: [
      planSummary(plan.counts),
      paragraph(
        'The full device list, with the settings to change and why each device is on it, is in step 4 of the build ' +
          'walkthrough. Nothing here is a file or a project — it is the plan you follow in the editor.'
      ),
      tip ? h('p', { class: 'g-tip' }, h('strong', {}, 'Layout tip: '), richText(tip)) : null
    ]
  };
}

/** "Every choice": the category, the game type, every answer, and the brand. */
export function recapPanel(ctx) {
  const { data, state, actions } = ctx;
  const type = data.gameTypes[state.gameTypeKey];
  const cat = data.gameCategories.find((c) => c.id === (type && type.category));
  const brand = data.brandsById.get(state.brandKey);

  return {
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
  };
}

/** The line under everything that counts the walkthrough's steps. */
export function walkthroughNote() {
  return h(
    'p',
    { class: 'g-meta-line g-small' },
    `Walkthrough: ${plural(WALKTHROUGH_STEPS.length, 'step')} (${plural(WALKTHROUGH_STEPS.length - 1, 'step')} unless you are a complete beginner).`
  );
}

/** The way back to the last step before the plan is committed (architecture spec v2). */
export function backRow(ctx) {
  return buttonRow([
    button({ label: UI.back, iconName: 'arrowLeft', variant: 'secondary', onClick: () => ctx.actions.back() })
  ]);
}
