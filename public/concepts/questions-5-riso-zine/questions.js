/* Questions 5 - Riso Zine: the question screen as a two-pass print.
 *
 * The flow is the baseline's, unchanged (see questions-1-default/questions.js): the same data, the same two
 * steps, the same dev-mode rules, the same deep link. What this file adds is the print's own furniture - the
 * folio number on the question, the ink bar that carries the progress, the run counter and the hand-numbered
 * edition line - all driven from the same values the baseline uses.
 *
 * Data: /data/uefn_device_logic.json, the same file the real guide reads.
 *   Step 1 strips <- meta.game_categories[]  { id, label, description }
 *   Step 2 strips <- game_types{}            { category, label, description, status, is_custom } */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 }; /* per cent of the run, per step, as on the baseline */
  const PATCHES = 25;               /* one patch of ink per 4% */

  const els = {
    runbar: document.getElementById('runbar'),
    runLabel: document.getElementById('runLabel'),
    folio: document.getElementById('folio'),
    folioLabel: document.getElementById('folioLabel'),
    question: document.getElementById('question'),
    sub: document.getElementById('sub'),
    grid: document.getElementById('grid'),
    note: document.getElementById('note'),
    back: document.getElementById('back'),
    backSub: document.getElementById('backSub'),
    dev: document.getElementById('devMode'),
    editionNo: document.getElementById('editionNo'),
    countLabel: document.getElementById('countLabel')
  };

  const state = { step: 1, categoryId: null, gameTypeKey: null, devMode: false };
  let data = null;

  /* The ink bar is printed once; progress only decides which patches have ink on them. Every other patch
     takes the second pass, so the bar reads as a two-colour print rather than as a meter. */
  const patches = [];
  for (let i = 0; i < PATCHES; i += 1) {
    const p = document.createElement('i');
    if (i % 2) p.className = 'alt';
    els.runbar.appendChild(p);
    patches.push(p);
  }

  function readDevMode(fallback) {
    try {
      const v = localStorage.getItem('forge.questions5.dev');
      return v === null ? fallback : v === '1';
    } catch (e) { return fallback; }
  }
  function saveDevMode() {
    try { localStorage.setItem('forge.questions5.dev', state.devMode ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function typesIn(categoryId) {
    const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
    return Object.keys(data.game_types)
      .map((key) => Object.assign({ key }, data.game_types[key]))
      .filter((t) => t.category === categoryId)
      .filter((t) => state.devMode || t.status === 'live')
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  function strip({ no, id, title, desc, selected, stamp, onPick }) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'strip';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const tape = document.createElement('span');
    tape.className = 'tape';
    tape.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span');
    n.className = 'no';
    n.textContent = no;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = title;
    b.appendChild(tape);
    b.appendChild(n);
    b.appendChild(t);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = desc;
      b.appendChild(d);
    }
    const picked = document.createElement('span');
    picked.className = 'picked';
    picked.textContent = 'Overprinted';
    b.appendChild(picked);
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
    const lit = Math.round((pct / 100) * PATCHES);
    patches.forEach((p, i) => p.classList.toggle('on', i < lit));
    els.runbar.setAttribute('aria-valuenow', String(pct));
    els.runbar.setAttribute('aria-valuetext', 'Page ' + step + ' of 2');
    els.runLabel.innerHTML = 'Page <em>' + step + '</em> of 2 \u00b7 run ' +
      String(pct).padStart(3, '0') + '/100';
    els.editionNo.textContent = step + ' of 2';
  }

  function render(focusTarget) {
    els.grid.textContent = '';
    els.note.hidden = true;
    els.note.classList.remove('error');
    setProgress(state.step);

    if (state.step === 1) {
      els.folio.textContent = '01';
      els.folioLabel.textContent = 'Choose a category';
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first \u2014 you'll choose the exact game type next.";
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.onclick = null;
      els.backSub.textContent = 'Back to my games';
      data.meta.game_categories.forEach((c, i) => {
        els.grid.appendChild(strip({
          no: String(i + 1).padStart(2, '0'),
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
      els.folio.textContent = '02';
      els.folioLabel.textContent = 'Choose the exact type';
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
        els.grid.appendChild(strip({
          no: String(i + 1).padStart(2, '0'),
          id: t.key,
          title: t.label,
          desc: t.description,
          selected: t.key === state.gameTypeKey,
          stamp: t.status === 'draft' ? 'Draft' : null,
          onPick: (e) => {
            state.gameTypeKey = t.key;
            els.grid.querySelectorAll('.strip').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
          }
        }));
      });
      const hidden = Object.values(data.game_types).filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (!state.devMode && hidden) {
        els.note.textContent = hidden + ' more ' + cat.label + ' strips are still in draft \u2014 stamp Show drafts to pull them.';
        els.note.hidden = false;
      }
    }
    const n = els.grid.querySelectorAll('.strip').length;
    els.countLabel.textContent = n + (n === 1 ? ' strip' : ' strips');

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
