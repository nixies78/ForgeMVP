/**
 * Questions 8 - Guide.
 *
 * Same screen, same data contract, same flow:
 *
 *   Step 1 rows  <- meta.game_categories[]  { id, label, description }
 *   Step 2 rows  <- game_types{}            { category, label, description, status, is_custom }
 *
 * Two things are particular to this layout. The rows are a single-choice list, so each row is a button
 * carrying aria-pressed over a drawn radio - the radio is the visual, the pressed state is what assistive
 * technology reads, and the two are kept in step in one place. And the rail is the progress read-out: the
 * current step is marked there, the completed one is ticked, and the percentage lives under the steps
 * rather than in the content column, which is what a rail is for.
 */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 };
  const STORE_KEY = 'forge.questions8.dev';

  const els = {
    grid: document.getElementById('grid'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    dev: document.getElementById('devMode'),
    kicker: document.getElementById('kicker'),
    steps: document.getElementById('steps'),
    stepNow: document.getElementById('stepNow'),
    percentNow: document.getElementById('percentNow'),
    progressFill: document.getElementById('progressFill'),
    progress: document.querySelector('.bar')
  };

  const state = { step: 1, categoryId: null, devMode: false, data: null };

  function readDevMode() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeDevMode(on) {
    try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

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

  const liveTypes = (categoryId) =>
    Object.values(state.data.game_types).filter((t) => t.category === categoryId && t.status === 'live').length;

  function statusOf(t) {
    if (t.is_custom) return { word: 'Basics only', cls: '' };
    if (t.status === 'draft') return { word: 'Draft', cls: 'draft' };
    return { word: 'Researched', cls: 'live' };
  }

  /* ------------------------------- render ------------------------------- */

  function makeRow(item) {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.setAttribute('aria-pressed', 'false');
    row.title = item.key || '';           /* the real data key, for anyone who wants it */

    const radio = document.createElement('span');
    radio.className = 'radio';
    radio.setAttribute('aria-hidden', 'true');

    const txt = document.createElement('span');
    txt.className = 'txt';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title;
    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = item.desc;
    txt.append(t, d);

    const meta = document.createElement('span');
    meta.className = 'meta' + (item.status ? ' ' + item.status.cls : '');
    meta.textContent = item.meta;

    row.append(radio, txt, meta);
    row.addEventListener('click', () => {
      els.grid.querySelectorAll('.row').forEach((b) => b.setAttribute('aria-pressed', b === row ? 'true' : 'false'));
      if (item.onPick) item.onPick();
    });
    li.appendChild(row);
    return li;
  }

  function renderRail() {
    [...els.steps.children].forEach((li) => {
      const n = Number(li.dataset.step);
      if (n === state.step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      li.dataset.done = n < state.step ? 'true' : 'false';
    });
    const pct = PROGRESS[state.step];
    els.stepNow.textContent = String(state.step);
    els.percentNow.textContent = pct + '%';
    els.progressFill.style.width = pct + '%';
    els.progress.setAttribute('aria-valuenow', String(pct));
    els.progress.setAttribute('aria-valuetext', 'Step ' + state.step + ' of 2');
  }

  function render(where) {
    if (!state.data) return;
    const data = state.data;
    const step = state.step;
    const cats = data.meta.game_categories;

    els.grid.innerHTML = '';
    els.note.hidden = true;
    els.note.classList.remove('error');

    if (step === 1) {
      els.kicker.textContent = 'Step 1 · Category';
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first — you'll choose the exact game type next.";
      els.back.textContent = 'Back to my games';
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.dataset.step = 'home';

      cats.forEach((c) => {
        const n = liveTypes(c.id);
        els.grid.appendChild(makeRow({
          key: c.id,
          title: c.label,
          desc: c.description,
          meta: n + (n === 1 ? ' game type' : ' game types'),
          onPick: () => {
            state.categoryId = c.id;
            state.step = 2;
            render('heading');
            syncUrl();
          }
        }));
      });
    } else {
      const cat = cats.find((c) => c.id === state.categoryId) || cats[0];
      state.categoryId = cat.id;
      els.kicker.textContent = 'Step 2 · Game type';
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type — or start from the basics and shape it yourself.';
      els.back.textContent = 'Back';
      els.back.setAttribute('href', '../../index.html#/home'); /* stays a real link; step 2 intercepts it */
      els.back.dataset.step = 'back';

      typesFor(cat.id).forEach((t) => {
        els.grid.appendChild(makeRow({
          key: t.key,
          title: t.label,
          desc: t.description,
          meta: statusOf(t).word,
          status: statusOf(t),
          onPick: () => { /* steps 3 to 5 are not part of this mock-up */ }
        }));
      });

      const hidden = Object.values(data.game_types)
        .filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (hidden && !state.devMode) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft — turn on Dev mode to see them.';
        els.note.hidden = false;
      }
    }

    renderRail();

    if (where === 'heading') els.question.focus();
    else if (where === 'selection') {
      const s = els.grid.querySelector('.row[aria-pressed="true"]');
      if (s) s.focus();
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
    state.step = 1;
    render('heading');
    syncUrl();
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
      if (q.get('step') === '2' && cat && json.meta.game_categories.some((c) => c.id === cat)) {
        state.categoryId = cat;
        state.step = 2;
      }
      render(null);
    })
    .catch((err) => {
      els.note.textContent = 'Could not load the game categories (' + err.message + ').';
      els.note.classList.add('error');
      els.note.hidden = false;
      els.kicker.textContent = 'No data';
    });
})();
