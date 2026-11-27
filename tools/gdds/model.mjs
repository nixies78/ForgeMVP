/**
 * model.mjs — the document model: everything a GDD can honestly say about a design, computed once.
 *
 * This is the seam the whole export feature turns on. The app already resolves a design into three
 * things — the pitch, the device plan, and the answers it was derived from — and those live in
 * `public/js/guide/`. A document template is a *presentation* of them, so nothing here lays anything
 * out and nothing here knows what a page is.
 *
 * It imports the app's own modules rather than reimplementing them. That is deliberate: the summary
 * screen and the PDF must not be able to disagree about what the plan is, and the only way to
 * guarantee that is for both to call `rebuildDevices`. It also means this file runs in node with no
 * DOM, which is what lets `npm test` build every document in about a second and lets a server render
 * a PDF without a browser anywhere in the stack.
 *
 * **The honest-parts rule.** The reference GDD (Closing Time) has eight sections: pitch, art style,
 * type and colour, level design, rules and player experience, systems and UI, market and build plan.
 * A questionnaire that asks ten questions about UEFN devices can supply the first, part of the fifth
 * and most of the sixth — and none of the art direction, level layout, audio spec or market data.
 * Those sections are not invented here and not filled with placeholder prose: every structure reports
 * `missing` for them, so a reader of the document can see what the tool did not know. A generated
 * document that quietly makes things up is worse than a short one.
 */

import { buildPitch, factsLine } from '../../public/js/guide/pitch.js';
import { rebuildDevices, universalPolishDevices } from '../../public/js/guide/resolve.js';
import { effectiveCoreLoop, effectiveLayoutTip } from '../../public/js/guide/data.js';
import { WALKTHROUGH_STEPS } from '../../public/js/guide/content.js';

/**
 * The sections a full GDD has and this tool cannot fill from a device questionnaire.
 *
 * Kept as data rather than as the absence of a section, because the document says so out loud: a
 * reader should be able to see which parts of their GDD are still theirs to write. Each entry names
 * what it would need, which is also the shopping list for closing the gap later.
 */
export const AUTHORED_SECTIONS = [
  {
    id: 'art_style',
    label: 'Art style and inspirations',
    needs: 'A reference-image library tagged by style, plus a chosen style on the answers.'
  },
  {
    id: 'type_colour',
    label: 'Type and colour in use',
    needs: 'A palette and font set per style, and the rules for combining them.'
  },
  {
    id: 'level_design',
    label: 'Level design and pacing',
    needs: 'A drawn or described layout — the tool has a layout tip, not a map.'
  },
  {
    id: 'audio',
    label: 'Audio and sound design',
    needs: 'An audio direction per game type, and the cues it is scored against.'
  },
  {
    id: 'market',
    label: 'Market, audience and monetisation',
    needs: 'Audience and trend data, and the creator\u2019s own monetisation intent \u2014 not a device choice.'
  },
  {
    id: 'build_estimate',
    label: 'Build time and scope budget',
    needs: 'A per-device and per-question time cost. The plan gives modules, not hours.'
  }
];

/** Device roles in the order a build happens, rather than the order the data file declares them. */
const BUILD_PHASES = [
  {
    id: 'foundation',
    label: 'Foundation',
    blurb: 'Spawns, rounds, teams and the rules the island starts with.',
    roles: ['player_setup', 'game_loop', 'zones_boundaries']
  },
  {
    id: 'loop',
    label: 'The loop',
    blurb: 'The devices that make the game recommence: objectives, scoring, progression.',
    roles: ['economy_progression', 'structures_interactables']
  },
  {
    id: 'opposition',
    label: 'Opposition and hazards',
    blurb: 'Whatever the player is up against, and whatever can hurt them.',
    roles: ['monster_setup', 'npc_setup', 'combat_hazards']
  },
  {
    id: 'movement',
    label: 'Movement and space',
    blurb: 'Traversal, vehicles and the shape of the playable area.',
    roles: ['traversal_vehicles']
  },
  {
    id: 'feedback',
    label: 'Feedback',
    blurb: 'What the player is told: HUD, prompts, and the atmosphere around them.',
    roles: ['ui_feedback', 'environment_atmosphere']
  }
];

/**
 * Turn a resolved design into the document model.
 *
 * @param {object} input
 * @param {object} input.dataset      the parsed `uefn_device_logic.json` (see guide/data.js)
 * @param {string} input.gameName     what the user called it
 * @param {string} input.gameTypeKey  e.g. 'survival_horror_chase'
 * @param {string} input.brandKey     e.g. 'original'
 * @param {Array}  input.answers      [{ qId, qPrompt, optionValue, optionLabel }]
 * @param {string} [input.version]    the draft version string printed under the title
 * @param {string} [input.date]       ISO date, for a reproducible document
 * @param {boolean} [input.verbose]   true for an experienced reader (drops the basic-navigation step)
 */
export function createDocModel(input) {
  const {
    dataset,
    gameName = 'Untitled game',
    gameTypeKey,
    brandKey,
    answers = [],
    version = 'v0.1',
    date = new Date().toISOString().slice(0, 10),
    verbose = false
  } = input;

  const type = dataset.gameTypes[gameTypeKey] || null;
  if (!type) throw new Error(`createDocModel: no game type "${gameTypeKey}" in the data file`);

  const category = dataset.gameCategories.find((c) => c.id === type.category) || null;
  const brand = dataset.brandsById.get(brandKey) || dataset.brandsById.get(dataset.defaultBrandId);
  const plan = rebuildDevices(dataset, gameTypeKey, answers);
  const coreLoop = effectiveCoreLoop(dataset, gameTypeKey);
  const layoutTip = effectiveLayoutTip(dataset, gameTypeKey);
  const pitch = buildPitch({ key: gameTypeKey, type, category, brand });
  const polish = universalPolishDevices(dataset);

  const brandIsReal = Boolean(brand && brand.id && brand.id !== 'original');

  /* ---- the device plan, reorganised from "grouped by role" into "grouped by build order" ---- */

  const phases = BUILD_PHASES.map((phase) => {
    const devices = [];
    for (const roleId of phase.roles) {
      const group = plan.groups.find((g) => g.role === roleId);
      if (group) devices.push(...group.devices.map((d) => ({ roleLabel: group.label, ...d })));
    }
    return { ...phase, devices };
  }).filter((phase) => phase.devices.length);

  /* Any role the phases above do not name would otherwise vanish from the document, which is the one
   * failure mode a build-order reorganisation invites. Collected and reported rather than dropped. */
  const placed = new Set(phases.flatMap((p) => p.devices.map((d) => d.name)));
  const unplaced = plan.devices.filter((d) => !placed.has(d.name));

  const settingsRows = plan.devices.map((device) => ({
    device: device.name,
    role: device.role,
    roleLabel: (dataset.roles.find((r) => r.id === device.role) || {}).label || device.role,
    purpose: device.purpose || '',
    sources: device.sources,
    settings: device.settings.map((setting) => ({
      name: setting.name,
      notInLibrary: Boolean(setting.notInLibrary),
      /* The general guidance is what the library says; everything after it is there because of an
       * answer. Kept apart so the document can mark which lines are the user's own decisions. */
      general: (setting.rows.find((r) => !r.isOverride) || {}).text || '',
      decisions: setting.rows
        .filter((r) => r.isOverride)
        .map((r) => ({ source: r.source, text: r.text }))
    }))
  }));

  const settingCount = settingsRows.reduce((n, d) => n + d.settings.length, 0);
  const decisionsCount = settingsRows.reduce(
    (n, d) => n + d.settings.filter((s) => s.decisions.length).length,
    0
  );

  /* ---- the answers, with the device each one actually added, so a decision has a consequence ---- */

  const decisions = answers.map((answer) => {
    const question = (type.questions || []).find((q) => q.id === answer.qId) || null;
    const option = question
      ? (question.options || []).find((o) => o.value === answer.optionValue) || null
      : null;
    const effects = (option && option.effects) || {};
    return {
      qId: answer.qId,
      prompt: answer.qPrompt || (question && question.prompt) || answer.qId,
      value: answer.optionValue,
      label: answer.optionLabel,
      addedDevices: (effects.add_devices || []).map((d) => (typeof d === 'string' ? d : d.ref)),
      setSettings: (effects.set_settings || []).map((s) => ({
        device: s.device,
        setting: s.setting,
        value: s.value
      })),
      notes: effects.notes || [],
      /** True when the answer changed nothing — worth knowing, and worth saying. */
      inert: !(effects.add_devices || []).length && !(effects.set_settings || []).length
    };
  });

  const allNotes = [
    ...plan.notes.map((n) => ({ ...n, scope: 'game type' })),
    ...decisions.flatMap((d) => d.notes.map((text) => ({ text, source: d.label, scope: 'answer' })))
  ];

  const steps = verbose ? WALKTHROUGH_STEPS.filter((s) => s.id !== 'basic_nav') : WALKTHROUGH_STEPS;

  return {
    /* identity */
    name: gameName,
    version,
    date,
    dateLabel: formatDate(date),
    typeLabel: type.label,
    typeNoun: pitch ? pitch.noun : type.label,
    typeDescription: type.description || '',
    categoryLabel: category ? category.label : '—',
    brandLabel: brand ? brand.label : '—',
    brandIsReal,
    brandDescription: brandIsReal ? brand.description || '' : '',
    status: type.status,
    isBaselineOnly: type.status === 'draft',
    isEssentials: Boolean(type.is_custom),

    /* pitch */
    pitch,
    pitchLine: pitch ? pitch.strapline : `${gameName}.`,
    pitchFacts: pitch ? factsLine(pitch.facts) : '',
    hook: pitch ? pitch.hook : null,
    hookName: pitch && pitch.hook ? pitch.hook.name : '',

    /* play */
    coreLoop,
    layoutTip,

    /* the plan */
    plan,
    phases,
    unplaced,
    settingsRows,
    notes: allNotes,
    polish,

    /* the input */
    decisions,
    answersCount: answers.length,
    questionsCount: (type.questions || []).length,
    unanswered: (type.questions || []).filter(
      (q) => !answers.some((a) => a.qId === q.id)
    ).map((q) => q.prompt),

    /* numbers a document puts on a cover or in a snapshot */
    counts: {
      devices: plan.counts.devices,
      core: plan.counts.core,
      polish: plan.counts.polish,
      settings: settingCount,
      decisions: decisionsCount,
      notes: allNotes.length,
      modules: plan.counts.devices,
      steps: steps.length
    },

    /* build */
    steps,

    /* what this document cannot say, and will not pretend to */
    missing: AUTHORED_SECTIONS,

    /* provenance, printed in the footer of every structure */
    provenance: {
      dataVersion: dataset.version,
      deviceLibrary: Object.keys(dataset.deviceLibrary).length,
      generated: new Date().toISOString().slice(0, 10)
    }
  };
}

function formatDate(iso) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const parts = String(iso).split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  return `${d} ${months[m - 1] || m} ${y}`;
}

/**
 * The sample design every structure is demonstrated on.
 *
 * Four answers, chosen so they are not all the same: a game type whose answers add devices, one
 * answer whose option adds a *setting override* rather than a device, and one answer that adds
 * nothing at all. A template that only ever renders "yes" answers never meets an inert row or an
 * empty consequence list, which is exactly what breaks in front of a user.
 */
export const SAMPLE_DESIGN = {
  gameName: 'Closing Time',
  gameTypeKey: 'survival_horror_chase',
  brandKey: 'walking_dead',
  version: 'v0.1',
  date: '2026-11-17',
  answers: [
    {
      qId: 'puzzles',
      qPrompt: 'Does the experience include locked-door puzzles/clues (escape-room style)?',
      optionValue: 'yes',
      optionLabel: 'Yes, puzzles'
    },
    {
      qId: 'narrative',
      qPrompt: 'Does it need narrative dialogue/clues delivered to the player?',
      optionValue: 'no',
      optionLabel: 'No'
    }
  ]
};
