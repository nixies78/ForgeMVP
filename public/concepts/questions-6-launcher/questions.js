/**
 * Questions 6 - Launcher.
 *
 * The same screen the app ships (questions-1-default), so the flow, the copy and the data contract are
 * identical:
 *
 *   Step 1 tiles  <- meta.game_categories[]  { id, label, description }
 *   Step 2 tiles  <- game_types{}            { category, label, description, status, is_custom }
 *
 * What this version adds is the metric each tile carries, taken from the data rather than invented:
 * on step 1 a category shows how many live game types it holds, and on step 2 an option shows its own
 * status in the app's own words - Researched, Draft, or Basics only. That is the store-like idea of a
 * card that says something useful rather than only naming itself, and it is also the honest thing to
 * show, because it is exactly the number the draft note below the grid is talking about.
 */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 }; /* percent filled per step, same as the app */
  const STORE_KEY = 'forge.questions6.dev';

  const els = {
    grid: document.getElementById('grid'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    dev: document.getElementById('devMode'),
    count: document.getElementById('count'),
    stepNo: document.getElementById('stepNo'),
    stepName: document.getElementById('stepName'),
    stepLabel: document.getElementById('stepLabel'),
    progressFill: document.getElementById('progressFill'),
    progress: document.querySelector('.bar')
  };

  const state = { step: 1, categoryId: null, devMode: false, data: null };

  /* ------------------------------- state ------------------------------- */

  function readDevMode() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeDevMode(on) {
    try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /* Custom ("Basics only") first, then live, then draft - the app's ordering. */
  const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);

  function typesFor(categoryId) {
    const data = state.data;
    if (!data) return [];
    return Object.keys(data.game_types)
      .map((key) => Object.assign({ key }, data.game_types[key]))
      .filter((t) => t.category === categoryId)
      .filter((t) => state.devMode || t.status === 'live')
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  const liveTypesFor = (categoryId) =>
    Object.values(state.data.game_types).filter((t) => t.category === categoryId && t.status === 'live').length;

  /* The status word, in the app's own vocabulary. */
  const statusWord = (t) => (t.is_custom ? 'Basics only' : t.status === 'draft' ? 'Draft' : 'Researched');

  /* ------------------------------- render ------------------------------- */

  const TICK = 'M1 5.2 4 8.2 10.4 1.6';

  function makeCard(item) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('aria-pressed', 'false');

    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title;

    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = item.desc;

    const foot = document.createElement('span');
    foot.className = 'metarow';

    const metric = document.createElement('span');
    metric.className = 'metric';
    metric.textContent = item.metric;
    foot.appendChild(metric);

    const chip = document.createElement('span');
    chip.className = 'chip';
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.innerHTML = '<svg viewBox="0 0 12 10" aria-hidden="true" width="11" height="9" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + TICK + '"/></svg>Selected';
    chip.appendChild(pill);
    foot.appendChild(chip);

    card.append(t, d, foot);
    card.addEventListener('click', () => {
      els.grid.querySelectorAll('.card').forEach((b) => b.setAttribute('aria-pressed', b === card ? 'true' : 'false'));
      if (item.onPick) item.onPick();
    });
    const li = document.createElement('li');
    li.appendChild(card);
    return li;
  }

  function render(where) {
    if (!state.data) return;
    const data = state.data;
    const step = state.step;

    els.grid.innerHTML = '';
    els.note.hidden = true;
    els.note.classList.remove('error');

    if (step === 1) {
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first — you'll choose the exact game type next.";
      els.stepNo.textContent = '[01]';
      els.stepName.textContent = 'Category';
      els.back.textContent = 'Back to my games';
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.dataset.step = 'home';

      const cats = data.meta.game_categories;
      els.count.textContent = cats.length + ' categories';
      cats.forEach((c) => {
        const n = liveTypesFor(c.id);
        els.grid.appendChild(makeCard({
          title: c.label,
          desc: c.description,
          metric: n + (n === 1 ? ' game type' : ' game types'),
          onPick: () => {
            state.categoryId = c.id;
            state.step = 2;
            render('heading');
            syncUrl();
          }
        }));
      });
    } else {
      const cat = data.meta.game_categories.find((c) => c.id === state.categoryId)
        || data.meta.game_categories[0];
      state.categoryId = cat.id;
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type — or start from the basics and shape it yourself.';
      els.stepNo.textContent = '[02]';
      els.stepName.textContent = 'Game type';
      els.back.textContent = 'Back';
      els.back.setAttribute('href', '../../index.html#/home'); /* stays a real link; step 2 intercepts it */
      els.back.dataset.step = 'back';

      const types = typesFor(cat.id);
      els.count.textContent = types.length + (types.length === 1 ? ' game type' : ' game types');
      types.forEach((t) => {
        els.grid.appendChild(makeCard({
          title: t.label,
          desc: t.description,
          metric: statusWord(t),
          onPick: () => { /* step 3 of the guide is not part of this mock-up */ }
        }));
      });

      const hidden = Object.values(data.game_types)
        .filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (hidden && !state.devMode) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft — turn on Dev mode to see them.';
        els.note.hidden = false;
      }
    }

    els.stepLabel.textContent = 'Step ' + step + ' of 2';
    const pct = PROGRESS[step];
    els.progressFill.style.width = pct + '%';
    els.progress.setAttribute('aria-valuenow', String(pct));
    els.progress.setAttribute('aria-valuetext', 'Step ' + step + ' of 2');

    if (where === 'heading') els.question.focus();
    else if (where === 'selection') {
      const sel = els.grid.querySelector('.card[aria-pressed="true"]');
      if (sel) sel.focus();
    }
  }

  function syncUrl() {
    const params = new URLSearchParams(location.search);
    params.set('step', String(state.step));
    if (state.step === 2 && state.categoryId) params.set('cat', state.categoryId);
    else params.delete('cat');
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }

  /* ------------------------------- wiring ------------------------------- */

  els.dev.addEventListener('click', () => {
    state.devMode = !state.devMode;
    els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');
    writeDevMode(state.devMode);
    render(null);
  });

  els.back.addEventListener('click', (e) => {
    if (els.back.dataset.step !== 'back') return; /* step 1 keeps its real link home */
    e.preventDefault();
    const previous = state.categoryId;
    state.step = 1;
    render(previous ? 'heading' : null);
    syncUrl();
  });

  els.question.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.question.blur(); }
  });

  /* ------------------------------- boot ------------------------------- */

  state.devMode = readDevMode();
  els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');

  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => {
      state.data = json;
      const q = new URLSearchParams(location.search);
      const cat = q.get('cat');
      const wantsStep2 = q.get('step') === '2';
      if (wantsStep2 && cat && json.meta.game_categories.some((c) => c.id === cat)) {
        state.categoryId = cat;
        state.step = 2;
      }
      render(null);
    })
    .catch((err) => {
      els.note.textContent = 'Could not load the game categories (' + err.message + ').';
      els.note.classList.add('error');
      els.note.hidden = false;
      els.count.textContent = 'No data';
    });
})();
