/**
 * Rendering the plan: device groups, individual devices, their settings, and the provenance that
 * says why each one is on the list.
 *
 * The provenance chips are a feature the brief asks to keep: telling a non-technical user *why* a
 * device is in their list ("Always needed", "Combat essentials", the game type's label, or the
 * question that added it) is what makes the output read as advice rather than a dump.
 *
 * The per-setting merge is the other half of that: general guidance first, then every path-specific
 * override underneath it, each labelled with where it came from.
 */

import { h, frag, plural, richText } from '../dom.js';

/** One provenance chip. Plain text, so it survives any content. */
export function sourceChip(source) {
  return h('span', { class: 'g-chip', title: `Included because: ${source}` }, source);
}

/** A device card: what it is, why it is here, and a collapsible list of its settings. */
export function deviceCard(device) {
  const settingCount = device.settings.length;
  const overrideCount = device.settings.filter((s) => s.rows.some((r) => r.isOverride)).length;

  const summary = h(
    'summary',
    { class: 'g-settings-summary' },
    h('span', { class: 'g-settings-title' }, settingCount ? `Settings to change (${settingCount})` : 'No settings to change'),
    overrideCount
      ? h('span', { class: 'g-settings-badge' }, `${overrideCount} tailored to your answers`)
      : null
  );

  const settings = h(
    'div',
    { class: 'g-settings' },
    ...device.settings.map((setting) =>
      h(
        'div',
        { class: 'g-setting' },
        h('div', { class: 'g-setting-name' }, setting.name),
        ...setting.rows.map((row) =>
          h(
            'p',
            { class: `g-setting-text${row.isOverride ? ' is-override' : ''}` },
            row.isOverride ? h('span', { class: 'g-setting-source' }, row.source) : null,
            richText(row.text)
          )
        ),
        setting.notInLibrary
          ? h(
              'p',
              { class: 'g-setting-warning' },
              'This setting is not listed in the device library — the value below comes from your answers alone.'
            )
          : null
      )
    )
  );

  return h(
    'article',
    { class: 'g-device' },
    h(
      'header',
      { class: 'g-device-head' },
      h('h4', { class: 'g-device-name' }, device.name),
      h('div', { class: 'g-device-sources' }, ...device.sources.map(sourceChip))
    ),
    device.purpose ? h('p', { class: 'g-device-purpose' }, richText(device.purpose)) : null,
    settingCount || device.settings.length ? h('details', { class: 'g-settings-details' }, summary, settings) : null
  );
}

/** A role group: the heading, a count, then its devices. */
export function deviceGroup(group) {
  return h(
    'section',
    { class: 'g-rogroup' },
    h(
      'header',
      { class: 'g-rolegroup-head' },
      h('h3', { class: 'g-rolegroup-title' }, group.label),
      h('span', { class: 'g-rolegroup-count' }, plural(group.devices.length, 'device'))
    ),
    h('div', { class: 'g-device-list' }, ...group.devices.map(deviceCard))
  );
}

/** Every group in one block, in the order the data declares the roles. */
export function deviceGroups(groups, options = {}) {
  if (!groups.length) {
    return h('p', { class: 'g-muted' }, options.emptyText || 'No devices to show for this game yet.');
  }
  return frag(...groups.map(deviceGroup));
}

/** "Settings reminders": free-text guidance that is not tied to one specific setting. */
export function notesList(notes) {
  if (!notes.length) return null;
  return h(
    'section',
    { class: 'g-notes' },
    h('h3', { class: 'g-notes-title' }, 'Settings reminders'),
    h(
      'ul',
      { class: 'g-notes-list' },
      ...notes.map((note) =>
        h(
          'li',
          {},
          h('span', { class: 'g-note-source' }, note.source),
          h('span', { class: 'g-note-text' }, richText(note.text))
        )
      )
    )
  );
}

/** A one-line summary of the plan, used above the device list. */
export function planSummary(counts) {
  return h(
    'p',
    { class: 'g-plan-summary' },
    `${plural(counts.devices, 'device')} · ${counts.settings} settings to check` +
      (counts.chosen ? ` · ${counts.chosen} changed by your answers` : '') +
      (counts.notes ? ` · ${plural(counts.notes, 'reminder')}` : '')
  );
}
