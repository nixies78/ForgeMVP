/* Questions 3 - Cassette Deck: the question screen on a machine.
 *
 * The flow is the baseline's, unchanged (see questions-1-default/questions.js): the same data, the same
 * two steps, the same dev-mode rules, the same deep link. What this file adds is the deck's own read-outs
 * - the programme window, the counter, the level meter and the record lamp - all driven from the same two
 * numbers the baseline uses, so the machine cannot disagree with the screen.
 *
 * Data: /data/uefn_device_logic.json, the same file the real guide reads.
 *   Step 1 keys  <- meta.game_categories[]  { id, label, description }
 *   Step 2 keys  <- game_types{}            { category, label, description, status, is_custom } */
(function () {
  'use strict';

  const DATA_URL = '../../data/uefn_device_logic.json';
  const PROGRESS = { 1: 4, 2: 12 }; /* per cent filled per step, as on the baseline */
  const SEGMENTS = 50;              /* one segment per 2%: 4% lights two lamps, 12% lights six */

  const els = {
    stepSeg: document.getElementById('stepSeg'),
    stepWord: document.getElementById('stepWord'),
    countCap: document.getElementById('countCap'),
    count: document.getElementById('count'),
    counter: document.getElementById('counter'),
    meter: document.getElementById('meter'),
    devLamp: document.getElementById('devLamp'),
    qLabel: document.getElementById('qLabel'),
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

  /* The meter is built once and then only has segments lit or unlit: rebuilding it on every render would
     restart the transition and make the deck flicker as you answer. */
  const bars = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const seg = document.createElement('i');
    els.meter.appendChild(seg);
    bars.push(seg);
  }

  function readDevMode(fallback) {
    try {
      const v = localStorage.getItem('forge.questions3.dev');
      return v === null ? fallback : v === '1';
    } catch (e) { return fallback; }
  }
  function saveDevMode() {
    try { localStorage.setItem('forge.questions3.dev', state.devMode ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function typesIn(categoryId) {
    const rank = (t) => (t.is_custom ? 2 : t.status === 'draft' ? 1 : 0);
    return Object.keys(data.game_types)
      .map((key) => Object.assign({ key }, data.game_types[key]))
      .filter((t) => t.category === categoryId)
      .filter((t) => state.devMode || t.status === 'live')
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  function keyOf({ id, title, desc, selected, badge, onPick }) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const top = document.createElement('span');
    top.className = 'top';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = title;
    const led = document.createElement('span');
    led.className = 'led';
    led.setAttribute('aria-hidden', 'true');
    top.appendChild(t);
    top.appendChild(led);
    b.appendChild(top);
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

  /* The machine's own read-outs: programme, counter, meter. */
  function setProgress(step) {
    const pct = PROGRESS[step];
    els.stepSeg.textContent = step + '\u2013' + 2;
    els.stepWord.textContent = 'Step ' + step;
    els.counter.textContent = String(pct).padStart(3, '0');
    const lit = Math.round((pct / 100) * SEGMENTS);
    bars.forEach((bar, i) => bar.classList.toggle('on', i < lit));
    els.meter.setAttribute('aria-valuenow', String(pct));
    els.meter.setAttribute('aria-valuetext', 'Step ' + step + ' of 2');
  }

  function render(focusTarget) {
    els.grid.textContent = '';
    els.note.hidden = true;
    els.note.classList.remove('error');
    setProgress(state.step);

    if (state.step === 1) {
      els.qLabel.textContent = 'Q.01 \u00b7 Choose a category';
      els.question.textContent = 'What type of game do you want to make?';
      els.sub.textContent = "Pick the broad category first \u2014 you'll choose the exact game type next.";
      els.back.setAttribute('href', '../../index.html#/home');
      els.back.onclick = null;
      els.backSub.textContent = 'Back to my games';
      data.meta.game_categories.forEach((c) => {
        els.grid.appendChild(keyOf({
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
      els.countCap.textContent = 'Categories on tape';
    } else {
      const cat = data.meta.game_categories.find((c) => c.id === state.categoryId);
      els.qLabel.textContent = 'Q.02 \u00b7 Choose the exact type';
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
      types.forEach((t) => {
        els.grid.appendChild(keyOf({
          id: t.key,
          title: t.label,
          desc: t.description,
          selected: t.key === state.gameTypeKey,
          badge: t.status === 'draft' ? 'Draft' : null,
          onPick: (e) => {
            state.gameTypeKey = t.key;
            els.grid.querySelectorAll('.key').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
          }
        }));
      });
      els.countCap.textContent = types.length === 1 ? 'Game type on tape' : 'Game types on tape';
      const hidden = Object.values(data.game_types).filter((t) => t.category === cat.id && t.status === 'draft').length;
      if (!state.devMode && hidden) {
        els.note.textContent = hidden + ' more ' + cat.label + ' types are still in draft \u2014 turn Dev / test on to see them.';
        els.note.hidden = false;
      }
    }
    els.count.textContent = String(els.grid.querySelectorAll('.key').length);

    if (focusTarget === 'heading') els.question.focus();
    else if (focusTarget === 'selected') {
      const sel = els.grid.querySelector('[aria-pressed="true"]');
      if (sel) sel.focus();
    }
  }

  els.dev.addEventListener('click', () => {
    state.devMode = !state.devMode;
    els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');
    els.devLamp.classList.toggle('on', state.devMode);
    saveDevMode();
    if (data) render();
  });

  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => {
      data = json;
      state.devMode = readDevMode(Boolean(json.meta.dev_mode_default));
      els.dev.setAttribute('aria-pressed', state.devMode ? 'true' : 'false');
      els.devLamp.classList.toggle('on', state.devMode);
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
