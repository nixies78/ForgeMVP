/* Questions 4 - Blueprint: the question screen as a drawing.
 *
 * The flow is the baseline's, unchanged (see questions-1-default/questions.js): the same data, the same two
 * steps, the same dev-mode rules, the same deep link. What this file adds is the drawing's own annotations -
 * a spec number per item, the sheet number, and the calibration bar that carries the progress - all driven
 * from the same values the baseline uses.
 *
 * Data: /data/uefn_device_logic.json, the same file the real guide reads.
 *   Step 1 items <- meta.game_categories[]  { id, label, description }
 *   Step 2 items <- game_types{}            { category, label, description, status, is_custom } */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 }; /* per cent filled per step, as on the baseline */

  const els = {
    itemLabel: document.getElementById('itemLabel'),
    sheetNo: document.getElementById('sheetNo'),
    titleSheet: document.getElementById('titleSheet'),
    scale: document.querySelector('.scale'),
    scaleLabel: document.getElementById('scaleLabel'),
    fill: document.getElementById('progressFill'),
    countLabel: document.getElementById('countLabel'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    grid: document.getElementById('grid'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    backSub: document.getElementById('backSub'),
    dev: document.getElementById('devMode')
  };

  const state = { step: 1, categoryId: null, gameTypeKey: null, devMode: false };
  let data = null;

  function readDevMode(fallback) {
    try {
      const v = localStorage.getItem('forge.questions4.dev');
      return v === null ? fallback : v === '1';
    } catch (e) { return fallback; }
  }
  function saveDevMode() {
    try { localStorage.setItem('forge.questions4.dev', state.devMode ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function typesIn(categoryId) {
    const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
    return Object.keys(data.game_types)
      .map((key) => Object.assign({ key }, data.game_types[key]))
      .filter((t) => t.category === categoryId)
      .filter((t) => state.devMode || t.status === 'live')
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  /* A drawing numbers its items, so every answer carries the item number of the sheet it is on. */
  function item({ no, id, title, desc, selected, stamp, onPick }) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const n = document.createElement('span');
    n.className = 'no';
    n.textContent = no;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = title;
    b.appendChild(n);
    b.appendChild(t);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = desc;
      b.appendChild(d);
    }
    const sel = document.createElement('span');
    sel.className = 'sel';
    sel.textContent = 'Selected';
    b.appendChild(sel);
    if (stamp) {
      const st = document.createElement('span');
      st.className = 'stamp';
      st.textContent = stamp;
      b.appendChild(st);
    }
    b.addEventListener('click', onPick);
    li.appendChild(b);
    return li;
  }

  function setProgress(step) {
    const pct = PROGRESS[step];
    els.fill.style.width = pct + '%';
    els.sheetNo.textContent = String(step);
    els.titleSheet.textContent = step + ' of 2';
    els.scaleLabel.textContent = 'Sheet ' + step + ' of 2 \u00b7 ' + pct + '%';
    els.scale.setAttribute('aria-valuenow', String(pct));
    els.scale.setAttribute('aria-valuetext', 'Sheet ' + step + ' of 2');
  }

  function render(focusTarget) {
    els.grid.textContent = '';
    els.note.hidden = true;
    els.note.classList.remove('error');
    setProgress(state.step);

    if (state.step === 1) {
      els.itemLabel.textContent = 'Item 1.0 \u00b7 choose a category';
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first \u2014 you'll choose the exact game type next.";
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.onclick = null;
      els.backSub.textContent = 'Back to my games';
      data.meta.game_categories.forEach((c, i) => {
        els.grid.appendChild(item({
          no: '1.' + String(i + 1).padStart(2, '0'),
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
    } else {
      const cat = data.meta.game_categories.find((c) => c.id === state.categoryId);
      els.itemLabel.textContent = 'Item 2.0 \u00b7 choose the exact type';
      els.question.textContent = 'Which kind of ' + cat.label + '?';
      els.sub.textContent = 'Pick the exact game type \u2014 or start from the basics and shape it yourself.';
      els.back.setAttribute('href', '#');
      els.back.onclick = (e) => {
        e.preventDefault();
        state.step = 1;
        render('selected');
      };
      els.backSub.textContent = 'Back a step';
      const types = typesIn(cat.id);
      types.forEach((t, i) => {
        els.grid.appendChild(item({
          no: '2.' + String(i + 1).padStart(2, '0'),
          id: t.key,
          title: t.label,
          desc: t.description,
          selected: t.key === state.gameTypeKey,
          stamp: t.status === 'draft' ? 'Draft' : null,
          onPick: (e) => {
            state.gameTypeKey = t.key;
            els.grid.querySelectorAll('.item').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
          }
        }));
      });
      const hidden = Object.values(data.game_types).filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (!state.devMode && hidden) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft \u2014 tick Show draft items to schedule them.';
        els.note.hidden = false;
      }
    }
    const n = els.grid.querySelectorAll('.item').length;
    els.countLabel.textContent = n + (n === 1 ? ' item' : ' items');

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
