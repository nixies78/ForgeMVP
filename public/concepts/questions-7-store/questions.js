/**
 * Questions 7 - Store.
 *
 * Same screen, same data contract and same flow as the app's own questions page:
 *
 *   Step 1 cards  <- meta.game_categories[]  { id, label, description }
 *   Step 2 cards  <- game_types{}            { category, label, description, status, is_custom }
 *
 * The listing idiom changes what each card says. On step 1 the metadata row carries the number of live
 * game types the category holds; on step 2 it carries the option's status in the app's own words, with
 * Epic's status colours - Researched in success green, Draft in warning amber, "Basics only" left neutral
 * because it is neither. The card's key-art edge is one of Epic's three published card gradients, keyed to
 * the category, so every option of a category wears its category's colour.
 */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 };
  const STORE_KEY = 'forge.questions7.dev';
  const ART = ['var(--grad-blue)', 'var(--grad-indigo)', 'var(--grad-purple)'];
  const TICK = 'M1 5.2 4 8.2 10.4 1.6';

  const els = {
    grid: document.getElementById('grid'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    dev: document.getElementById('devMode'),
    count: document.getElementById('count'),
    stepLabel: document.getElementById('stepLabel'),
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

  /* The app's own three states, and the status colour each one earns. */
  function statusOf(t) {
    if (t.is_custom) return { word: 'Basics only', cls: '' };
    if (t.status === 'draft') return { word: 'Draft', cls: 'draft' };
    return { word: 'Researched', cls: 'live' };
  }

  /* ------------------------------- render ------------------------------- */

  function makeCard(item) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pcard';
    card.setAttribute('aria-pressed', 'false');
    card.style.setProperty('--art', ART[item.art % ART.length]);

    const art = document.createElement('span');
    art.className = 'art';

    const body = document.createElement('span');
    body.className = 'body';

    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title;

    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = item.desc;

    const foot = document.createElement('span');
    foot.className = 'metarow';

    const meta = document.createElement('span');
    meta.className = 'meta' + (item.status ? ' ' + item.status.cls : '');
    if (item.status) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      meta.appendChild(dot);
    }
    meta.appendChild(document.createTextNode(item.meta));

    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.innerHTML = '<svg viewBox="0 0 12 10" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="' + TICK + '"/></svg>';

    foot.append(meta, mark);
    body.append(t, d, foot);

    const sel = document.createElement('span');
    sel.className = 'sel';
    sel.textContent = 'Selected';

    card.append(art, body, sel);
    card.addEventListener('click', () => {
      els.grid.querySelectorAll('.pcard').forEach((b) => b.setAttribute('aria-pressed', b === card ? 'true' : 'false'));
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
    const cats = data.meta.game_categories;

    els.grid.innerHTML = '';
    els.note.hidden = true;
    els.note.classList.remove('error');

    if (step === 1) {
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first — you'll choose the exact game type next.";
      els.back.textContent = 'Back to my games';
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.dataset.step = 'home';
      els.count.innerHTML = '<b>' + cats.length + '</b> categories';

      cats.forEach((c, i) => {
        const n = liveTypes(c.id);
        els.grid.appendChild(makeCard({
          title: c.label,
          desc: c.description,
          meta: n + (n === 1 ? ' game type' : ' game types'),
          art: i,
          onPick: () => {
            state.categoryId = c.id;
            state.step = 2;
            render('heading');
            syncUrl();
          }
        }));
      });
    } else {
      const index = Math.max(0, cats.findIndex((c) => c.id === state.categoryId));
      const cat = cats[index];
      state.categoryId = cat.id;
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type — or start from the basics and shape it yourself.';
      els.back.textContent = 'Back';
      els.back.setAttribute('href', '../../index.html#/home'); /* stays a real link; step 2 intercepts it */
      els.back.dataset.step = 'back';

      const types = typesFor(cat.id);
      els.count.innerHTML = '<b>' + types.length + '</b> ' + (types.length === 1 ? 'game type' : 'game types');
      types.forEach((t) => {
        els.grid.appendChild(makeCard({
          title: t.label,
          desc: t.description,
          meta: statusOf(t).word,
          status: statusOf(t),
          art: index,
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
      const s = els.grid.querySelector('.pcard[aria-pressed="true"]');
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
      els.count.textContent = 'No data';
    });
})();
