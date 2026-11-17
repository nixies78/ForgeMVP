/* Lessons 1 - Default: the baseline Lesson page, faithful to the owner's mock-up.
 *
 * Content sources (copied in here so this mock-up runs standalone):
 *   Step 1        <- the owner's brief (wording given verbatim), which matches
 *                    public/js/guide/content.js WALKTHROUGH_STEPS.create_project + WALKTHROUGH_BRAND_LINE.
 *   Steps 2 - 4   <- public/js/guide/content.js WALKTHROUGH_STEPS (block_out, core_devices, look_good) body text,
 *                    plus public/data/uefn_device_logic.json for the "Just give me the basics" Simulation & Tycoon path:
 *                    category_baselines.sim_tycoon (devices + layout_tip), universal_devices,
 *                    universal_polish_devices, and each device's `purpose` from device_library.
 *   MCP prompts   <- written for this mock-up (no source in the app yet).
 * Video: the owner's YouTube video, the same one for every step for now.
 * The current step lives in the URL hash (#step=2) so a link opens on it. */
(function () {
  'use strict';

  const FEEDBACK_KEY = 'forge-lesson-feedback';

  const STEPS = [
    {
      title: 'Create Your Project',
      body:
        '<p>Open UEFN (via the Epic Games Launcher, or "Launch UEFN" from Fortnite\'s Creative options) and start a new project.</p>' +
        '<ol>' +
        '<li>Click <strong>New Project</strong> in the UEFN Project Browser.</li>' +
        '<li>Choose the <strong>KPop Demon Hunters</strong> brand template from the template picker so your project starts with its themed assets already loaded.</li>' +
        '<li>Give your project a name that matches your game idea.</li>' +
        '<li>Open the project — it loads into the UEFN editor with your starter island/assets ready to go.</li>' +
        '</ol>',
      prompt:
        'Create a new UEFN project from the KPop Demon Hunters brand template. ' +
        'Name it after my game idea (a Simulation & Tycoon island; ask me for the name if you don\'t know it). ' +
        'Then open the project in the UEFN editor and confirm the starter island and brand assets have loaded.'
    },
    {
      title: 'Block Out Your Island',
      body:
        '<p>Rough out the physical layout with basic shapes before placing any devices.</p>' +
        '<p>Don\'t worry about how it looks yet — this pass is about where things go and how players move between them.</p>' +
        '<p class="tip"><b>Layout tip:</b> Give each player a clearly bounded plot or system to grow, with visible headroom to expand into.</p>',
      prompt:
        'In my open UEFN project, block out a Simulation & Tycoon island using simple grey-box shapes only (no decoration yet). ' +
        'Create one clearly bounded plot per player with visible room to expand into, a small shared spawn area, ' +
        'and clear paths between the spawn and every plot. Tell me the plot count and size you used.'
    },
    {
      title: 'Add Your Core Game Loop Devices',
      body:
        '<p>Add the devices from your plan below, then open each one and set the options listed under it.</p>' +
        '<p>Configure them in the order shown: the game-loop devices first, because the devices under them depend on those choices.</p>' +
        '<h2>Your plan: Simulation &amp; Tycoon basics</h2>' +
        '<ul>' +
        '<li><span class="devname">Player Spawner</span> — spawns players into the island. Every experience needs at least one per team/role.</li>' +
        '<li><span class="devname">End Game</span> — configures how the match ends and who wins once triggered; wire in an event from a Tracker when your win condition is met.</li>' +
        '<li><span class="devname">Stat Creator</span> — creates the custom currency stat that drives the whole tycoon loop.</li>' +
        '<li><span class="devname">Stat Powerup</span> — grants or deducts the currency stat when triggered (earning/spending).</li>' +
        '<li><span class="devname">Tracker</span> — displays the player\'s currency/progress on their HUD.</li>' +
        '<li><span class="devname">Button</span> — the core interaction point for purchases/upgrades.</li>' +
        '<li><span class="devname">Timer</span> — round countdown, if your tycoon has a time limit.</li>' +
        '<li><span class="devname">Conditional Button</span> — only activates the upgrade if the player has enough currency.</li>' +
        '</ul>' +
        '<p class="tip"><b>Core loop:</b> Spawn at plot → Earn → Spend &amp; Upgrade → Grow. Win by reaching the goal first, or having the most when time runs out.</p>',
      prompt:
        'In my UEFN Simulation & Tycoon project, place and configure the core game-loop devices: ' +
        'a Player Spawner on each plot, a Stat Creator for a "Gold" currency (Player scope), a Tracker showing Gold on the HUD with the win target, ' +
        'Stat Powerups for earning Gold, Buttons and Conditional Buttons for purchases/upgrades that cost Gold, an optional round Timer, ' +
        'and an End Game device triggered when the Tracker reaches its target. Wire the events together and list every setting you changed.'
    },
    {
      title: 'Make It Look Good',
      body:
        '<p>Add the atmosphere and polish devices listed below — they change how the island feels without changing how it plays.</p>' +
        '<p>Wherever a device has an asset picker, reach for your brand template first.</p>' +
        '<ul>' +
        '<li><span class="devname">Sky Dome</span> — controls sky, lighting mood, fog and atmosphere; the fastest way to make an island feel intentional rather than default.</li>' +
        '<li><span class="devname">Customizable Light</span> — adds and colours light sources to set mood in specific areas.</li>' +
        '<li><span class="devname">Audio Player</span> — layers in ambience, music or stingers; sound design does as much for atmosphere as visuals.</li>' +
        '</ul>',
      prompt:
        'Polish my UEFN tycoon island without changing gameplay: add a Sky Dome with a mood that suits the KPop Demon Hunters brand, ' +
        'Customizable Lights to highlight each plot and the spawn area, and an Audio Player for background music/ambience. ' +
        'Replace grey-box shapes with KPop Demon Hunters brand-template assets wherever possible, and keep every path and plot boundary where it is.'
    }
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    stepper: $('stepper'), title: $('stepTitle'), body: $('stepBody'),
    video: $('video'), videoLink: $('videoLink'),
    prompt: $('prompt'), copy: $('copy'), copyStatus: $('copyStatus'),
    back: $('back'), next: $('next'),
    fbBtn: $('feedbackBtn'), dlg: $('feedback'), form: $('fbForm'), fbStep: $('fbStep'),
    fbClose: $('fbClose'), fbCancel: $('fbCancel'), fbError: $('fbError'),
    fbText: $('fbText'), fbEmail: $('fbEmail'),
    toast: $('toast'), dev: $('devMode')
  };

  let current = 0;

  function stepFromHash() {
    const m = /(?:^#|&)step=(\d+)/.exec(location.hash);
    const n = m ? parseInt(m[1], 10) - 1 : 0;
    return Math.min(Math.max(isNaN(n) ? 0 : n, 0), STEPS.length - 1);
  }

  function buildStepper() {
    els.stepper.innerHTML = '';
    STEPS.forEach((s, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step';
      b.dataset.i = String(i);
      b.innerHTML = '<span class="n" aria-hidden="true">' + (i + 1) + '</span><span></span>';
      b.lastChild.textContent = s.title;
      b.setAttribute('aria-label', 'Step ' + (i + 1) + ': ' + s.title);
      b.addEventListener('click', () => go(i, true));
      li.appendChild(b);
      els.stepper.appendChild(li);
    });
  }

  function render(focus) {
    const s = STEPS[current];
    document.title = s.title + ' · Lessons 1 - Default · Forge';
    els.stepper.querySelectorAll('.step').forEach((b, i) => {
      if (i === current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('done', i < current);
    });
    els.title.textContent = s.title;
    els.body.innerHTML = s.body;
    els.video.title = 'Video walkthrough: ' + s.title;
    els.prompt.value = s.prompt;
    els.copyStatus.textContent = '';
    els.fbStep.textContent = 'Step ' + (current + 1) + ': ' + s.title;

    els.back.disabled = current === 0;
    const last = current === STEPS.length - 1;
    els.next.textContent = last ? 'Finish' : 'Next: ' + STEPS[current + 1].title + ' →';
    if (focus) els.title.focus();
  }

  function go(i, focus) {
    i = Math.min(Math.max(i, 0), STEPS.length - 1);
    const hash = '#step=' + (i + 1);
    current = i;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    render(focus);
  }

  els.back.addEventListener('click', () => go(current - 1, true));
  els.next.addEventListener('click', () => {
    if (current < STEPS.length - 1) { go(current + 1, true); window.scrollTo({ top: els.title.offsetTop - 20 }); }
    else showToast('That\'s every step — nice work. (Finish would return to your games in the real app.)');
  });
  window.addEventListener('hashchange', () => { current = stepFromHash(); render(false); });

  /* ---------- Copy prompt ---------- */
  let copyTimer = 0;
  function copied(ok) {
    els.copyStatus.textContent = ok ? 'Copied' : 'Couldn\'t copy — the text is selected, press Ctrl+C';
    els.copy.textContent = ok ? 'Copied ✓' : 'Copy prompt';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { els.copy.textContent = 'Copy prompt'; els.copyStatus.textContent = ''; }, 2000);
  }
  function fallbackCopy() {
    els.prompt.focus();
    els.prompt.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    copied(ok);
  }
  els.copy.addEventListener('click', () => {
    const text = els.prompt.value;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => copied(true), fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  /* ---------- Feedback dialog ---------- */
  function openFeedback() {
    els.form.reset();
    els.fbError.textContent = '';
    els.dlg.showModal();
    const first = els.form.querySelector('input[name="reason"]');
    if (first) first.focus();
  }
  function closeFeedback() { els.dlg.close(); }
  els.fbBtn.addEventListener('click', openFeedback);
  els.fbClose.addEventListener('click', closeFeedback);
  els.fbCancel.addEventListener('click', closeFeedback);
  /* Escape closes natively (cancel event); return focus to the trigger whichever way it closes. */
  els.dlg.addEventListener('close', () => els.fbBtn.focus());
  /* Click on the backdrop closes too. */
  els.dlg.addEventListener('click', (e) => { if (e.target === els.dlg) closeFeedback(); });
  els.form.addEventListener('change', () => { els.fbError.textContent = ''; });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = els.form.querySelector('input[name="reason"]:checked');
    if (!reason) {
      els.fbError.textContent = 'Please choose what\'s wrong first.';
      els.form.querySelector('input[name="reason"]').focus();
      return;
    }
    const email = els.fbEmail.value.trim();
    if (email && !els.fbEmail.checkValidity()) {
      els.fbError.textContent = 'That email doesn\'t look right — fix it or leave it empty.';
      els.fbEmail.focus();
      return;
    }
    const report = {
      step: current + 1,
      stepTitle: STEPS[current].title,
      reason: reason.value,
      text: els.fbText.value.trim(),
      email: email,
      time: new Date().toISOString(),
      page: location.href
    };

    /* NO BACKEND YET. A real endpoint would go here, e.g.:
     *   fetch('/api/lesson-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
     *         body: JSON.stringify(report) })
     * and only fall back to localStorage if the request fails. For now the report is only stored locally. */
    let saved = false;
    try {
      const list = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
      const arr = Array.isArray(list) ? list : [];
      arr.push(report);
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(arr));
      saved = true;
    } catch (err) { saved = false; }

    closeFeedback();
    showToast(saved
      ? 'Thanks - feedback saved on this device (not sent anywhere yet)'
      : 'Thanks - but this browser blocked saving, so the feedback was not kept');
  });

  let toastTimer = 0;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4000);
  }

  /* Dev mode pill: kept for parity with the Question page header (no effect on this page). */
  els.dev.addEventListener('click', () => {
    els.dev.setAttribute('aria-pressed', els.dev.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });

  buildStepper();
  current = stepFromHash();
  if (!/step=/.test(location.hash)) history.replaceState(null, '', '#step=1');
  render(false);
})();
