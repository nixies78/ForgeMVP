/**
 * Session state, the progress formula, and — the fix that matters most — an explicit predecessor
 * for every screen.
 *
 * v1 tracked progress as `qIndex = answers.length`, which meant answers were positional: you could
 * only step back one question, you could not edit a specific answer, and `goBackFromBrand()` popped
 * an answer, so going back from the Brand screen silently discarded the last thing the user said
 * (UEFN_GUIDE_V2_HANDOFF.md, Part 7 item 10).
 *
 * Here answers are keyed by `qId`, any answer can be edited, and each screen names its own
 * predecessor instead of inferring one from how many questions happen to be answered.
 *
 * Pure functions only — no DOM, no storage — so the whole flow is testable in node.
 */

import { DESIGN_MODES, WALKTHROUGH_STEPS } from './content.js';

export const SCREENS = [
  'home',
  'category',
  'gametype',
  'question',
  'brand',
  'restriction',
  'summary',
  'experience',
  'walkthrough',
  'placeholder'
];

/** The progress bands, verbatim from the brief (§ 2.1). The 40 → 44 gap is intentional: brand
 *  selection occupies a fixed band however many questions were asked. */
export const PROGRESS = {
  home: 0,
  category: 4,
  gametype: 10,
  questionBase: 16,
  questionBand: 24,
  brand: 44,
  restriction: 48,
  summary: 55,
  experience: 58,
  walkthroughBase: 60,
  walkthroughBand: 40
};

export function createState(dataset, options = {}) {
  return {
    screen: 'home',
    categoryKey: null,
    gameTypeKey: null,
    brandKey: null,
    previewBrandKey: null,
    /** The question currently on screen or being edited, e.g. after "Edit" from the summary. */
    qId: null,
    /** [{ qId, qPrompt, optionValue, optionLabel }] in the order answered. */
    answers: [],
    /**
     * Answers kept per game type, so switching game type or category and coming back does not throw
     * work away. The category screen promises exactly that, so it has to be true.
     */
    answerHistory: {},
    stepIndex: 0,
    gameId: null,
    gameName: '',
    devMode: Boolean(options.devMode),
    experienceLevel: 'beginner',
    /** Which of the three design modes a placeholder screen is showing. */
    mode: null,
    /** True while a single answer is being edited from the summary, so choosing returns there. */
    editing: false,
    /** { tone: 'info' | 'warn', text } — the one place a screen's message to the user is kept, so
     *  notices survive a re-render instead of being lost with the DOM. */
    notice: null
  };
}

/* --------------------------------- answers --------------------------------- */

export function answerFor(state, qId) {
  return state.answers.find((a) => a.qId === qId) || null;
}

export function hasAnswered(state, qId) {
  return Boolean(answerFor(state, qId));
}

/** Record (or replace) an answer, keeping the original order for questions already answered. */
export function recordAnswer(state, { qId, qPrompt, optionValue, optionLabel }) {
  const existing = answerFor(state, qId);
  if (existing) {
    existing.optionValue = optionValue;
    existing.optionLabel = optionLabel;
    existing.qPrompt = qPrompt;
  } else {
    state.answers.push({ qId, qPrompt, optionValue, optionLabel });
  }
  return state;
}

export function clearAnswer(state, qId) {
  state.answers = state.answers.filter((a) => a.qId !== qId);
  return state;
}

/** Questions the chosen game type asks. Drafts and custom entries ask none. */
export function questions(dataset, state) {
  const type = dataset.gameTypes[state.gameTypeKey];
  if (!type || !Array.isArray(type.questions)) return [];
  return type.questions;
}

/** The first question with no answer yet, or null when the list is finished. */
export function nextUnanswered(dataset, state) {
  return questions(dataset, state).find((q) => !hasAnswered(state, q.id)) || null;
}

export function questionIndex(dataset, state, qId) {
  return questions(dataset, state).findIndex((q) => q.id === qId);
}

/** The question before `qId` in the type's own order, or null at the start. */
export function previousQuestion(dataset, state, qId) {
  const list = questions(dataset, state);
  const index = list.findIndex((q) => q.id === qId);
  return index > 0 ? list[index - 1] : null;
}

/* --------------------------------- progress --------------------------------- */

/**
 * The exact v1 curve. Monotonic across the whole flow is a test requirement, so anything that
 * changes a band has to keep this shape.
 */
export function progressFor(dataset, state, options = {}) {
  const steps = options.steps || walkthroughSteps(state.experienceLevel);
  switch (state.screen) {
    case 'home':
      return PROGRESS.home;
    case 'category':
      return PROGRESS.category;
    case 'gametype':
      return PROGRESS.gametype;
    case 'question': {
      const list = questions(dataset, state);
      const index = state.qId ? Math.max(0, questionIndex(dataset, state, state.qId)) : state.answers.length;
      return Math.round(
        PROGRESS.questionBase + (index / Math.max(list.length, 1)) * PROGRESS.questionBand
      );
    }
    case 'brand':
      return PROGRESS.brand;
    case 'restriction':
      return PROGRESS.restriction;
    case 'summary':
      return PROGRESS.summary;
    case 'experience':
      return PROGRESS.experience;
    case 'walkthrough': {
      const span = Math.max(steps.length - 1, 1);
      return Math.round(PROGRESS.walkthroughBase + (state.stepIndex / span) * PROGRESS.walkthroughBand);
    }
    default:
      return PROGRESS.home;
  }
}

/* ------------------------------- walkthrough ------------------------------- */

/** `basic_nav` appears only for complete beginners — the level screen's one real effect. */
export function walkthroughSteps(experienceLevel, allSteps) {
  const source = allSteps || [];
  if (experienceLevel === 'beginner') return source;
  return source.filter((step) => step.id !== 'basic_nav');
}

/* ------------------------------- breadcrumb trail ------------------------------- */

/**
 * The trail shown in the app container's sticky header.
 *
 * This used to be built inside each screen, which is why the summary screen ended up with no trail at
 * all and the walkthrough's started somewhere different from the question screen's. One definition, in
 * the session layer, means every screen gets a consistent path and the shell can render it once.
 *
 * Each item is `{ label, href }`; the last one has no href because it is where you already are.
 */
export function trailFor(dataset, state) {
  const type = state.gameTypeKey ? dataset.gameTypes[state.gameTypeKey] : null;
  const category = type ? dataset.gameCategories.find((c) => c.id === type.category) : null;
  const catLabel = category ? category.label : 'Category';
  const typeLabel = type ? type.label : 'Game type';
  const home = { label: 'Home', href: '#/home' };
  const backTo = (label, href) => ({ label, href });

  switch (state.screen) {
    case 'category':
      return [home, { label: 'Category' }];

    case 'gametype':
      return [home, backTo('Category', '#/category'), { label: catLabel }];

    case 'question': {
      const list = questions(dataset, state);
      const index = state.qId ? questionIndex(dataset, state, state.qId) : state.answers.length;
      return [
        home,
        backTo(catLabel, '#/category'),
        backTo(typeLabel, '#/gametype'),
        { label: `Question ${Math.max(0, index) + 1} of ${list.length}` }
      ];
    }

    case 'brand':
      return [home, backTo(catLabel, '#/category'), backTo(typeLabel, '#/gametype'), { label: 'Brand template' }];

    case 'restriction':
      return [
        home,
        backTo(catLabel, '#/category'),
        backTo(typeLabel, '#/gametype'),
        backTo('Brand template', '#/brand'),
        { label: 'Usage rules' }
      ];

    case 'summary':
      return [home, backTo(catLabel, '#/category'), backTo(typeLabel, '#/gametype'), { label: 'Summary' }];

    case 'experience':
      return [backTo('Summary', '#/summary'), { label: 'Experience level' }];

    case 'walkthrough': {
      const steps = walkthroughSteps(state.experienceLevel, WALKTHROUGH_STEPS);
      return [
        backTo('Summary', '#/summary'),
        { label: `Step ${Math.min(state.stepIndex + 1, steps.length)} of ${steps.length}` }
      ];
    }

    case 'placeholder': {
      const mode = DESIGN_MODES.find((m) => m.id === state.mode);
      return [home, { label: mode ? mode.label : 'Not built yet' }];
    }

    default:
      return [{ label: 'Home' }];
  }
}

/* ------------------------------- predecessors ------------------------------- */

/**
 * Where "Back" goes from each screen, decided by name rather than inferred.
 *
 * The two rules the brief calls out explicitly:
 *   - back from Brand returns to the last question *with its answer intact* (not one answer popped);
 *   - a game type with no questions skips the question screen entirely, so its predecessor is the
 *     game-type screen.
 */
export function predecessor(dataset, state) {
  const list = questions(dataset, state);
  switch (state.screen) {
    case 'category':
      return { screen: 'home' };
    case 'gametype':
      return { screen: 'category' };
    case 'question': {
      const previous = state.qId ? previousQuestion(dataset, state, state.qId) : null;
      if (previous) return { screen: 'question', qId: previous.id };
      return list.length ? { screen: 'gametype' } : { screen: 'gametype' };
    }
    case 'brand':
      if (!list.length) return { screen: 'gametype' };
      return { screen: 'question', qId: state.answers.length ? state.answers[state.answers.length - 1].qId : list[0].id };
    case 'restriction':
      return { screen: 'brand' };
    case 'summary':
      return { screen: 'restriction' };
    case 'experience':
      return { screen: 'summary' };
    case 'walkthrough':
      if (state.stepIndex > 0) return { screen: 'walkthrough', stepIndex: state.stepIndex - 1 };
      return { screen: 'experience' };
    default:
      return null;
  }
}

/** Load a saved game back into a session. Per v1, a saved game jumps straight to the summary. */
export function applySavedGame(state, record, dataset) {
  state.gameId = record.id;
  state.gameName = record.name;
  state.categoryKey = record.categoryKey || (dataset.gameTypes[record.gameTypeKey] || {}).category || null;
  state.gameTypeKey = record.gameTypeKey;
  state.brandKey = record.brandKey || dataset.defaultBrandId;
  state.previewBrandKey = state.brandKey;
  /* Keep only answers the target type still asks. A save that points at a now-different question
   * list must not resurrect stale answers, but the user is told how many were dropped rather than
   * finding out by comparing. */
  const asked = new Set(questions(dataset, state).map((q) => q.id));
  const kept = (record.answers || []).filter((a) => asked.has(a.qId));
  state.answers = kept.map((a) => ({ ...a }));
  state.stepIndex = 0;
  return { droppedAnswers: Math.max(0, (record.answers || []).length - kept.length) };
}

/** A save that names a game type which is now a draft still loads — with a note, not in silence. */
export function savedGameNotice(dataset, record) {
  const type = dataset.gameTypes[record.gameTypeKey];
  if (!type) {
    return { tone: 'warn', text: `"${record.name}" was saved against a game type that no longer exists.` };
  }
  if (type.status === 'draft') {
    return {
      tone: 'info',
      text: `"${record.name}" uses ${type.label}, which is still a draft — its device list comes from the ${type.category} baseline.`
    };
  }
  return null;
}
