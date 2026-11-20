/**
 * Questions 9 - Console.
 *
 * Same screen, same data contract, same flow:
 *
 *   Step 1 rows  <- meta.game_categories[]  { id, label, description }
 *   Step 2 rows  <- game_types{}            { category, label, description, status, is_custom }
 *
 * Each row carries three things: a monospace index, the answer itself, and a state chip. The chip is the
 * app's own vocabulary - Researched, Draft, Basics only - with Epic's status colours behind it, so the
 * reason an option is or is not available is stated on the row instead of hidden behind a toggle. The row
 * that is chosen lifts its fill, takes a 2px select-coloured edge down its left and fills the tick at its
 * end; the tick is always in the row, so choosing cannot change a row's height.
 *
 * Dev mode is a checkbox here rather than a pill, because a console is where a checkbox belongs - and it
 * is the one control on the page that does not have to look like a button.
 */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 };
  const STORE_KEY = 'forge.questions9.dev';
  const HOME = '../../index.html#/home';
  const TICK = 'M1 5.2 4 8.2 10.4 1.6';

  const els = {
    grid: document.getElementById('grid'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    dev: document.getElementById('devMode'),
    crumb: document.getElementById('crumb'),
    thName: document.getElementById('thName'),
    thState: document.getElementById('thState'),
    stepText: document.getElementById('stepText'),
    percentText: document.getElementById('percentText'),
    progressFill: document.getElementById('progressFill'),
    progress: document.querySelector('.mini')
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

  /* the app's three states, each with the chip Epic's status colours would give it */
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
    row.className = 'trow';
    row.setAttribute('aria-pressed', 'false');
    if (item.key) row.title = item.key;      /* the real data key, for anyone who wants it */

    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = item.index;

    const txt = document.createElement('span');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title;
    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = item.desc;
    txt.append(t, d);

    const rt = document.createElement('span');
    rt.className = 'rt';
    const chip = document.createElement('span');
    chip.className = 'chip' + (item.status ? ' ' + item.status.cls : '');
    if (item.status) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      chip.appendChild(dot);
    }
    chip.appendChild(document.createTextNode(item.chipText));
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.innerHTML = '<svg viewBox="0 0 12 10" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="' + TICK + '"/></svg>';
    rt.append(chip, tick);

    row.append(idx, txt, rt);
    row.addEventListener('click', () => {
      els.grid.querySelectorAll('.trow').forEach((b) => b.setAttribute('aria-pressed', b === row ? 'true' : 'false'));
      if (item.onPick) item.onPick();
    });
    li.appendChild(row);
    return li;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function render(where) {
    if (!state.data) return;
    const data = state.data;
    const step = state.step;
    const cats = data.meta.game_categories;

    els.grid.innerHTML = '';
    els.note.hidden = true;
    els.note.classList.remove('error');

    if (step === 1) {
      els.crumb.textContent = 'New game';
      els.thName.textContent = 'Category';
      els.thState.textContent = 'Types';
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first — you'll choose the exact game type next.";
      els.back.textContent = 'Back to my games';
      els.back.dataset.step = 'home';

      cats.forEach((c, i) => {
        const n = liveTypes(c.id);
        els.grid.appendChild(makeRow({
          key: c.id,
          index: pad(i + 1),
          title: c.label,
          desc: c.description,
          status: null,                       /* every category is live, so the count is what matters here */
          chipText: n + (n === 1 ? ' type' : ' types'),
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
      els.crumb.textContent = cat.label;
      els.thName.textContent = 'Game type';
      els.thState.textContent = 'Status';
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type — or start from the basics and shape it yourself.';
      els.back.textContent = 'Back';
      els.back.dataset.step = 'back';

      typesFor(cat.id).forEach((t, i) => {
        const st = statusOf(t);
        els.grid.appendChild(makeRow({
          key: t.key,
          index: pad(i + 1),
          title: t.label,
          desc: t.description,
          status: st,
          chipText: st.word,
          onPick: () => { /* the rest of the guide is not part of this mock-up */ }
        }));
      });

      const hidden = Object.values(data.game_types)
        .filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (hidden && !state.devMode) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft — turn on Dev mode to see them.';
        els.note.hidden = false;
      }
    }

    const pct = PROGRESS[step];
    els.stepText.textContent = 'step ' + step + '/2';
    els.percentText.textContent = pct + '%';
    els.progressFill.style.width = pct + '%';
    els.progress.setAttribute('aria-valuenow', String(pct));
    els.progress.setAttribute('aria-valuetext', 'Step ' + step + ' of 2');

    if (where === 'heading') els.question.focus();
    else if (where === 'selection') {
      const s = els.grid.querySelector('.trow[aria-pressed="true"]');
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

  els.dev.addEventListener('change', () => {
    state.devMode = els.dev.checked;
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
  els.dev.checked = state.devMode;
  els.back.setAttribute('href', HOME);

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
      els.percentText.textContent = '—';
    });
})();
