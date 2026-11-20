/* Questions 2 - Quiet Power (Blue + Indigo): the question screen, behaving exactly like the baseline.
 *
 * The behaviour is deliberately identical to questions-1-default, because the four designs on this page
 * type are meant to be compared against each other and against the app - a concept that also changed how
 * the screen works would be two variables in one test. Only the class names and the extra read-outs
 * (the "Step 1 of 2" eyebrow and the tile count) belong to this design.
 *
 * Data: /data/uefn_device_logic.json, the same file the real guide reads.
 *   Step 1 tiles  <- meta.game_categories[]  { id, label, description }
 *   Step 2 tiles  <- game_types{}            { category, label, description, status, is_custom }
 * Step 2 follows the real guide's rules (public/js/guide/data.js gameTypesInCategory): only `live`
 * types unless Dev mode is on, researched first, drafts next, "Just give me the basics" last. */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 }; /* percent filled per step - the app's overall position, as on the baseline */

  const els = {
    stepLabel: document.getElementById('stepLabel'),
    count: document.getElementById('count'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    grid: document.getElementById('grid'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    fill: document.getElementById('progressFill'),
    bar: document.querySelector('.track'),
    dev: document.getElementById('devMode')
  };

  const state = { step: 1, categoryId: null, gameTypeKey: null, devMode: false };
  let data = null;

  function readDevMode(fallback) {
    try {
      const v = localStorage.getItem('forge.questions2.dev');
      return v === null ? fallback : v === '1';
    } catch (e) { return fallback; }
  }
  function saveDevMode() {
    try { localStorage.setItem('forge.questions2.dev', state.devMode ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function typesIn(categoryId) {
    const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
    return Object.keys(data.game_types)
      .map((key) => Object.assign({ key }, data.game_types[key]))
      .filter((t) => t.category === categoryId)
      .filter((t) => state.devMode || t.status === 'live')
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  function tile({ id, title, desc, selected, badge, onPick }) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = title;
    b.appendChild(t);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = desc;
      b.appendChild(d);
    }
    if (badge) {
      const g = document.createElement('span');
      g.className = 'badge';
      g.textContent = badge;
      b.appendChild(g);
    }
    b.addEventListener('click', onPick);
    li.appendChild(b);
    return li;
  }

  function setProgress(step) {
    const pct = PROGRESS[step];
    els.fill.style.width = pct + '%';
    els.bar.setAttribute('aria-valuenow', String(pct));
    els.bar.setAttribute('aria-valuetext', 'Step ' + step + ' of 2');
    els.stepLabel.textContent = 'Step ' + step + ' of 2';
  }

  /* What is on the table right now, said out loud: ten categories, or however many types this category
     has. It is the one number a reader wants before committing, and it is counted from what rendered
     rather than from a constant, so Dev mode's extra drafts are included when they appear. */
  function setCount(what) {
    const n = els.grid.querySelectorAll('.tile').length;
    els.count.textContent = n + ' ' + what;
  }

  function render(focusTarget) {
    els.grid.textContent = '';
    els.note.hidden = true;
    els.note.classList.remove('error');
    setProgress(state.step);

    if (state.step === 1) {
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first — you'll choose the exact game type next.";
      els.back.textContent = '← Back to my games';
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.onclick = null;
      data.meta.game_categories.forEach((c) => {
        els.grid.appendChild(tile({
          id: c.id,
          title: c.label,
          desc: c.description,
          selected: c.id === state.categoryId,
          onPick: () => {
            if (state.categoryId !== c.id) state.gameTypeKey = null;
            state.categoryId = c.id;
            state.step = 2;
            render('heading');
          }
        }));
      });
      setCount('categories');
    } else {
      const cat = data.meta.game_categories.find((c) => c.id === state.categoryId);
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type — or start from the basics and shape it yourself.';
      els.back.textContent = '← Back';
      els.back.setAttribute('href', '#');
      els.back.onclick = (e) => {
        e.preventDefault();
        state.step = 1;
        render('selected');
      };
      const types = typesIn(cat.id);
      types.forEach((t) => {
        els.grid.appendChild(tile({
          id: t.key,
          title: t.label,
          desc: t.description,
          selected: t.key === state.gameTypeKey,
          badge: t.status === 'draft' ? 'Draft' : null,
          onPick: (e) => {
            state.gameTypeKey = t.key;
            els.grid.querySelectorAll('.tile').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
          }
        }));
      });
      setCount(types.length === 1 ? 'game type' : 'game types');
      const hidden = Object.values(data.game_types).filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (!state.devMode && hidden) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft — turn on Dev mode to see them.';
        els.note.hidden = false;
      }
    }

    if (focusTarget === 'heading') els.question.focus();
    else if (focusTarget === 'selected') {
      const sel = els.grid.querySelector('[aria-pressed="true"]');
      if (sel) sel.focus();
    }
  }

  els.dev.addEventListener('click', () => {
    state.devMode = !state.devMode;
    els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');
    saveDevMode();
    if (data) render();
  });

  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => {
      data = json;
      state.devMode = readDevMode(Boolean(json.meta.dev_mode_default));
      els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');
      /* ?step=2&cat=combat opens straight on Step 2 (handy for screenshots and the mock-ups page). */
      const q = new URLSearchParams(location.search);
      const cat = q.get('cat');
      if (cat && json.meta.game_categories.some((c) => c.id === cat)) {
        state.categoryId = cat;
        if (q.get('step') === '2') state.step = 2;
      }
      render();
    })
    .catch((err) => {
      els.note.textContent = 'Could not load the game categories (' + err.message + ').';
      els.note.classList.add('error');
      els.note.hidden = false;
    });
})();
