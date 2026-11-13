/**
 * The application: load the data, own the session, route the screens, and pass every screen the same
 * small set of actions.
 *
 * Deliberate differences from v1's structure, all of them consequences of the improvements plan:
 *   - the data is fetched once from one file rather than duplicated into the page;
 *   - the screens are separate modules rather than template literals inside one 230 KB file;
 *   - every handler is an addEventListener callback, never an `onclick="..."` string;
 *   - the router owns which screen is showing, so Back and refresh behave;
 *   - nothing is re-rendered wholesale except the screen region, so the header and the toggle keep
 *     their state and their focus.
 */

import { loadData } from './data.js';
import { browserStorage, createStore } from './store.js';
import { applySavedGame, createState, nextUnanswered, predecessor, progressFor, recordAnswer, savedGameNotice, trailFor, walkthroughSteps } from './state.js';
import { applyRoute, parseHash, startRouter, toHash } from './router.js';
import { measureHeader, wireHeroVideo, wirePriorityNav, wireSearch } from './chrome.js';
import { parseShare, shareUrl } from './share.js';
import { UI, WALKTHROUGH_STEPS } from './content.js';
import { fill } from './dom.js';
import { crumbs } from './render/ui.js';

import { renderHome } from './screens/home.js';
import { renderCategory } from './screens/category.js';
import { renderGameType } from './screens/gametype.js';
import { renderQuestion } from './screens/question.js';
import { renderBrand } from './screens/brand.js';
import { renderRestriction } from './screens/restriction.js';
import { renderSummary } from './screens/summary.js';
import { renderExperience } from './screens/experience.js';
import { renderWalkthrough } from './screens/walkthrough.js';
import { renderPlaceholder } from './screens/placeholder.js';

const SCREENS = {
  home: renderHome,
  category: renderCategory,
  gametype: renderGameType,
  question: renderQuestion,
  brand: renderBrand,
  restriction: renderRestriction,
  summary: renderSummary,
  experience: renderExperience,
  walkthrough: renderWalkthrough,
  placeholder: renderPlaceholder
};

const SCREEN_TITLES = {
  home: 'Design a game',
  category: 'Game category',
  gametype: 'Game type',
  question: 'Questions',
  brand: 'Brand template',
  restriction: 'Usage rules',
  summary: 'Summary',
  experience: 'Experience level',
  walkthrough: 'Build walkthrough',
  placeholder: 'Not built yet'
};

/* ------------------------------------ elements ------------------------------------ */

const els = {
  screen: document.getElementById('screen'),
  progressBar: document.getElementById('progressBar'),
  progressLabel: document.getElementById('progressLabel'),
  devButton: document.getElementById('devModeButton'),
  devState: document.getElementById('devModeState'),
  devWrap: document.getElementById('devModeWrap'),
  crumbs: document.getElementById('crumbs'),
  appHead: document.getElementById('appHead'),
  footerStatus: document.getElementById('footerStatus'),
  siteHeader: document.getElementById('siteHeader'),
  searchInput: document.getElementById('searchInput'),
  searchPanel: document.getElementById('searchPanel'),
  searchHint: document.getElementById('searchHint'),
  navList: document.getElementById('navList'),
  navMoreWrap: document.getElementById('navMoreWrap'),
  navMoreButton: document.getElementById('navMoreButton'),
  navMoreMenu: document.getElementById('navMoreMenu'),
  heroVideo: document.getElementById('heroVideo'),
  bootError: document.getElementById('bootError'),
  bootErrorText: document.getElementById('bootErrorText')
};

/** Set immediately: the page's watchdog uses this to tell "still loading" from "module never ran". */
document.documentElement.dataset.appReady = 'true';

/* ------------------------------------ boot ------------------------------------ */

boot().catch((error) => {
  showBootError(error);
});

async function boot() {
  let data;
  try {
    data = await loadData();
  } catch (error) {
    showBootError(error);
    return;
  }

  const store = createStore(browserStorage());
  const migration = store.migrateLegacy();

  /* ?dev=1 wins over the stored preference, so a dev link can be shared. */
  const devFromQuery = new URLSearchParams(window.location.search).get('dev');
  const devMode = devFromQuery === '1' ? true : devFromQuery === '0' ? false : store.getDevMode(data.defaultDevMode);

  const state = createState(data, { devMode });

  /* A shared session in the query string seeds the state, so a link into the middle of the flow has
   * something to resolve against — and so a plan can be sent to someone else. */
  const shared = parseShare(window.location.search, data);
  if (shared.gameTypeKey) {
    const type = data.gameTypes[shared.gameTypeKey];
    state.categoryKey = type.category;
    state.gameTypeKey = shared.gameTypeKey;
    state.brandKey = shared.brandKey;
    state.previewBrandKey = shared.brandKey;
    state.answers = shared.answers;
    if (shared.devMode !== null) state.devMode = shared.devMode;
  }

  const ctx = { data, state, store, actions: null };
  const actions = createActions(ctx);
  ctx.actions = actions;

  if (migration.imported || migration.dropped.length) {
    const parts = [];
    if (migration.imported) parts.push(`Imported ${migration.imported} saved game${migration.imported === 1 ? '' : 's'} from the previous version.`);
    if (migration.dropped.length) {
      parts.push(
        `${migration.dropped.length} could not be imported: ` +
          migration.dropped.map((d) => `${d.name} (${d.reason})`).join('; ') +
          '. They are still in the old storage and have not been deleted.'
      );
    }
    state.notice = { tone: migration.dropped.length ? 'warn' : 'info', text: parts.join(' ') };
  }

  if (shared.gameTypeKey && shared.ignored.length) {
    state.notice = {
      tone: 'warn',
      text: `Part of this link was ignored: ${shared.ignored.join('; ')}. The data has probably changed since the link was made.`
    };
  }

  wireShell(ctx);
  renderFooterStatus(ctx);
  startRouter(data, state, {    onRoute: () => renderScreen(ctx),
    onRefused: (refusal) => {
      state.notice = {
        tone: 'warn',
        text:
          refusal.reason === 'no-category'
            ? 'That link points at the game type list, but no category is chosen in this session yet. Pick a category first and it will work.'
            : refusal.reason === 'no-game-type'
              ? `That link points at the ${refusal.screen} screen, but no game type is chosen in this session yet. Pick a category and a game type, and the link will work.`
              : 'That link is not valid any more — the question it pointed at is not asked by this game type.'
      };
      goHome(ctx);
    }
  });

  if (!window.location.hash) {
    navigate(ctx, { screen: shared.gameTypeKey ? 'summary' : 'home' }, { replace: true });
  } else {
    const applied = applyRoute(data, state, parseHash(window.location.hash));
    renderScreen(ctx);
    if (!applied.ok) goHome(ctx);
  }
}

/**
 * Return to the home screen.
 *
 * The route has to be applied to the session as well as the address bar: when a route is refused the
 * session is still pointing at the screen that was refused, and rendering then draws the wrong screen
 * under a home hash.
 */
function goHome(ctx) {
  applyRoute(ctx.data, ctx.state, { screen: 'home' });
  navigate(ctx, { screen: 'home' }, { replace: true });
}

function showBootError(error) {
  if (els.bootError) {
    els.bootError.hidden = false;
    if (els.bootErrorText) {
      els.bootErrorText.textContent = `The guide could not load its data: ${error && error.message ? error.message : String(error)}. ` +
        'The data file lives at public/data/uefn_device_logic.json — check that it is there and reload.';
    }
  }
  if (els.screen) {
    fill(
      els.screen,
      Object.assign(document.createElement('p'), {
        className: 'g-muted',
        textContent: 'Nothing can be shown until the data file loads.'
      })
    );
  }
}

/* ------------------------------------ the shell ------------------------------------ */

function wireShell(ctx) {
  /* Dev mode is a button with a stated on/off state and `aria-pressed`, not a checkbox: the spec asks
   * for a control with clear active feedback, and a checkbox in a header reads as a form field. */
  if (els.devButton) {
    els.devButton.addEventListener('click', () => ctx.actions.setDevMode(!ctx.state.devMode));
  }

  measureHeader(els.siteHeader);
  wirePriorityNav({
    list: els.navList,
    moreWrap: els.navMoreWrap,
    moreButton: els.navMoreButton,
    moreMenu: els.navMoreMenu
  });
  wireSearch({ input: els.searchInput, panel: els.searchPanel, hint: els.searchHint });
  wireHeroVideo(els.heroVideo);
}

/* ------------------------------------ actions ------------------------------------ */

function createActions(ctx) {
  const { data, state, store } = ctx;

  return {
    go: (route, options) => navigate(ctx, route, options),

    back() {
      const target = predecessor(data, state);
      navigate(ctx, target || { screen: 'home' });
    },

    clearNotice() {
      state.notice = null;
      renderScreen(ctx);
    },

    setDevMode(on) {
      state.devMode = Boolean(on);
      store.setDevMode(state.devMode);
      syncDevMode(ctx);
      renderScreen(ctx);
    },

    chooseCategory(categoryId) {
      state.categoryKey = categoryId;
      /* The game type belongs to the category, so it cannot survive the change. The answers do,
       * per game type — the category screen promises that and it is the reason answerHistory exists. */
      state.gameTypeKey = null;
      state.brandKey = null;
      state.previewBrandKey = null;
      state.answers = [];
      state.qId = null;
      navigate(ctx, { screen: 'gametype' });
    },

    chooseGameType(gameTypeKey) {
      switchGameType(ctx, gameTypeKey);
      const type = data.gameTypes[gameTypeKey];
      const first = nextUnanswered(data, state);
      if (type && (type.questions || []).length && first) {
        navigate(ctx, { screen: 'question', qId: first.id });
      } else {
        /* Zero-question game types skip the question screen entirely, as v1 did. */
        navigate(ctx, { screen: 'brand' });
      }
    },

    chooseOption(question, option) {
      recordAnswer(state, {
        qId: question.id,
        qPrompt: question.prompt,
        optionValue: option.value,
        optionLabel: option.label
      });

      /* Editing one answer from the summary returns to the summary — the user came from there. */
      if (state.editing) {
        state.editing = false;
        navigate(ctx, { screen: 'summary' });
        return;
      }

      const next = nextUnanswered(data, state);
      if (next) navigate(ctx, { screen: 'question', qId: next.id });
      else navigate(ctx, { screen: 'brand' });
    },

    toBrand: () => navigate(ctx, { screen: 'brand' }),

    editAnswer(qId) {
      state.editing = true;
      navigate(ctx, { screen: 'question', qId });
    },

    previewBrand(brandId) {
      state.previewBrandKey = brandId;
      renderScreen(ctx);
    },

    chooseBrand(brandId) {
      state.brandKey = brandId;
      state.previewBrandKey = brandId;
      navigate(ctx, { screen: 'restriction' });
    },

    acceptRestriction: () => navigate(ctx, { screen: 'summary' }),

    /** Copy a link to this exact plan. Falls back to showing the URL when the clipboard is blocked. */
    async copyShareLink() {
      const url = shareUrl(window.location, {
        gameTypeKey: state.gameTypeKey,
        answers: state.answers,
        brandKey: state.brandKey,
        devMode: state.devMode
      });
      try {
        await navigator.clipboard.writeText(url);
        state.notice = { tone: 'info', text: 'Link copied. Anyone opening it sees this exact plan, in this browser or another.' };
      } catch (error) {
        state.notice = { tone: 'info', text: `Copy this link: ${url}` };
      }
      renderScreen(ctx);
    },

    setName(name) {
      state.gameName = name;
    },

    saveGame(name) {
      const trimmed = (name || '').trim();
      if (!trimmed) {
        state.notice = { tone: 'warn', text: 'Give the game a name before saving.' };
        renderScreen(ctx);
        return;
      }
      const result = store.save({
        id: state.gameId,
        name: trimmed,
        categoryKey: state.categoryKey,
        gameTypeKey: state.gameTypeKey,
        brandKey: state.brandKey,
        answers: state.answers,
        devModeAtSave: state.devMode
      });

      if (!result.ok) {
        state.notice = {
          tone: 'warn',
          text:
            result.reason === 'quota'
              ? 'This browser is out of storage space, so the game could not be saved. Delete an old game and try again.'
              : result.reason === 'cap'
                ? `You can keep ${result.cap} saved games. Delete one to make room.`
                : 'This browser will not let the page store anything, so saving is unavailable. Your answers are still on screen.'
        };
      } else {
        state.gameId = result.record.id;
        state.gameName = result.record.name;
        state.notice = { tone: 'info', text: `Saved as "${result.record.name}". It will be on the home screen next time.` };
      }
      renderScreen(ctx);
    },

    loadSaved(id) {
      const record = store.get(id);
      if (!record) {
        state.notice = { tone: 'warn', text: 'That saved game could not be found — it may have been deleted in another tab.' };
        renderScreen(ctx);
        return;
      }
      const info = applySavedGame(state, record, data);
      const notice = savedGameNotice(data, record);
      if (notice) state.notice = notice;
      if (info.droppedAnswers) {
        const extra = `${info.droppedAnswers} answer${info.droppedAnswers === 1 ? '' : 's'} referred to questions this game type no longer asks and were left out.`;
        state.notice = state.notice ? { tone: state.notice.tone, text: `${state.notice.text} ${extra}` } : { tone: 'info', text: extra };
      }
      navigate(ctx, { screen: 'summary' });
    },

    renameSaved(id, name) {
      const result = store.rename(id, name);
      state.notice = result.ok
        ? { tone: 'info', text: `Renamed to "${result.record.name}".` }
        : { tone: 'warn', text: 'That name could not be saved.' };
      renderScreen(ctx);
    },

    removeSaved(id) {
      const result = store.remove(id);
      state.notice = result.ok ? { tone: 'info', text: 'Deleted.' } : { tone: 'warn', text: 'That game could not be deleted.' };
      if (result.ok && state.gameId === id) {
        state.gameId = null;
        state.gameName = '';
      }
      renderScreen(ctx);
    },

    chooseExperience(levelId) {
      state.experienceLevel = levelId;
      state.stepIndex = 0;
      navigate(ctx, { screen: 'walkthrough', stepIndex: 0 });
    },

    startBuilding() {
      if (!state.gameName || !state.gameName.trim()) {
        state.notice = { tone: 'warn', text: 'Give the game a name first — it is how you will find it again.' };
        renderScreen(ctx);
        return;
      }
      navigate(ctx, { screen: 'experience' });
    },

    finishWalkthrough() {
      state.notice = {
        tone: 'info',
        text: state.gameId
          ? 'That is the whole plan. Your game is saved — open it from this screen whenever you come back.'
          : 'That is the whole plan. Save it from the summary screen so you can find it again.'
      };
      navigate(ctx, { screen: 'home' });
    }
  };
}

/**
 * Switch game type, keeping each type's answers.
 *
 * Answers belong to the questions a game type asks, so they cannot follow you across types — but they
 * should not be thrown away either, or the promise that "nothing you have answered is lost" would be
 * false. They are stashed per type and restored on the way back.
 */
function switchGameType(ctx, gameTypeKey) {
  const { state } = ctx;
  if (state.gameTypeKey && state.gameTypeKey !== gameTypeKey) {
    state.answerHistory[state.gameTypeKey] = state.answers.map((a) => ({ ...a }));
  }
  state.gameTypeKey = gameTypeKey;
  state.answers = (state.answerHistory[gameTypeKey] || []).map((a) => ({ ...a }));
  state.qId = null;
  state.editing = false;
  state.brandKey = null;
  state.previewBrandKey = null;
  state.gameId = null;

  /* Drop answers whose question is not asked by the new type, so the plan cannot be built from a
   * question the game no longer asks. */
  const asked = new Set(((ctx.data.gameTypes[gameTypeKey] || {}).questions || []).map((q) => q.id));
  state.answers = state.answers.filter((a) => asked.has(a.qId));
}

/* ------------------------------------ rendering ------------------------------------ */

/** Move to a route: same hash re-renders, a new hash goes through history so Back works. */
function navigate(ctx, route, options = {}) {
  const hash = toHash(route);
  if (window.location.hash === hash) {
    renderScreen(ctx);
    return;
  }
  if (options.replace) {
    window.history.replaceState(null, '', hash);
    renderScreen(ctx);
    return;
  }
  window.location.hash = hash;
}

function renderScreen(ctx) {
  const { data, state } = ctx;
  const renderer = SCREENS[state.screen] || SCREENS.home;

  let node;
  try {
    node = renderer(ctx);
  } catch (error) {
    node = errorPanel(error);
  }

  if (els.screen) fill(els.screen, node);

  renderTrail(ctx);
  syncDevMode(ctx);
  updateProgress(ctx);
  document.title = `${SCREEN_TITLES[state.screen] || 'Guide'} · ${UI.appName}`;

  /* Where the page scrolls to when a screen changes. The hero belongs to the page, so home starts at
   * the top of it; every other screen lands on the app container instead, with its sticky bar sitting
   * just under the site header. Scrolling to the top there would show the hero again on every single
   * step of a nine-screen flow, with the screen the user just moved to below the fold. */
  if (state.screen === 'home') {
    window.scrollTo(0, 0);
  } else if (els.appHead) {
    const headerHeight = els.siteHeader ? els.siteHeader.getBoundingClientRect().height : 0;
    const top = els.appHead.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo(0, Math.max(0, top));
  }

  /* Focus the screen's own title, by id rather than by tag, so the heading level can change without
   * quietly breaking the focus handoff. */
  const heading = els.screen && els.screen.querySelector('#screen-title');
  if (heading) heading.focus({ preventScroll: true });
}

/** The breadcrumb trail lives in the app container's sticky header, not inside each screen. */
function renderTrail(ctx) {
  if (!els.crumbs) return;
  const trail = trailFor(ctx.data, ctx.state);
  fill(els.crumbs, crumbs(trail));
}

/** One place updates the Dev mode control, so its label, its state chip and its pill always agree. */
function syncDevMode(ctx) {
  const on = Boolean(ctx.state.devMode);
  if (els.devButton) els.devButton.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (els.devState) els.devState.textContent = on ? 'on' : 'off';
  if (els.devWrap) els.devWrap.hidden = !on;
}

/** The footer's status line: real numbers from the data that actually loaded, plus the health endpoint. */
function renderFooterStatus(ctx) {
  if (!els.footerStatus) return;
  const { data } = ctx;
  const live = data.gameTypeKeys.filter((key) => data.gameTypes[key].status === 'live').length;
  const devices = Object.keys(data.deviceLibrary || {}).length;
  els.footerStatus.replaceChildren();
  els.footerStatus.append(
    document.createTextNode(`${live} game types ready · ${data.draftCount} draft · ${devices} devices in the library. `)
  );
  const health = document.createElement('a');
  health.href = 'healthz';
  health.textContent = 'Server status';
  els.footerStatus.append(health);
}

function updateProgress(ctx) {
  const { data, state } = ctx;
  const steps = walkthroughSteps(state.experienceLevel, WALKTHROUGH_STEPS);
  const percent = progressFor(data, state, { steps });
  if (els.progressBar) els.progressBar.style.width = `${percent}%`;
  if (els.progressLabel) els.progressLabel.textContent = `${percent}%`;
  const track = document.getElementById('progressTrack');
  if (track) track.setAttribute('aria-valuenow', String(percent));
}

function errorPanel(error) {
  const wrap = document.createElement('div');
  wrap.className = 'g-notice g-notice-warn';
  wrap.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.className = 'g-notice-text';
  title.textContent = 'This screen failed to render.';
  const detail = document.createElement('code');
  detail.textContent = error && error.message ? error.message : String(error);
  const hint = document.createElement('p');
  hint.className = 'g-meta-line';
  hint.textContent = 'The rest of the guide still works — go back and try another route.';
  wrap.append(title, detail, hint);
  return wrap;
}

/* This module is browser-only by design: it touches the DOM at import time so that the page's
 * watchdog can tell "the module never ran" from "the data is still loading". Everything worth testing
 * without a browser lives in the pure modules beside it — data, state, resolve, store, router, share —
 * and is covered by tests/guide.test.mjs. */
