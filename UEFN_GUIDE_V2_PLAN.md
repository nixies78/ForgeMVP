# UEFN Game Guide v2 — build plan (target: this repo)

**Companion to** `UEFN_GUIDE_V2_HANDOFF.md` (the v2 brief). That document says *what the system
must do*; this one says *what changes, where it lives, and in what order* — for this repository,
with the new Forge design.

**v1 reference implementation:** `C:\VibeCoding\UEFNGameGuide\`
- `uefn_game_wizard.html` (230 KB) — the whole v1 app; the behaviour reference.
- `uefn_device_logic.json` (200 KB) — the data substrate for v2. Verified against the brief:
  59 devices / 163 settings, 97 game types (23 live, 74 draft), 36 question instances across 13
  types, 10 category baselines, 8 brand templates.
- `uefn_device_logic.md` (80 KB) — human-readable render of the same data.
- `SPEC.md`, `GAME_SELECTION_REBUILD_PLAN.md` — v1's own review and last refactor plan.

Everything in the brief's Parts 3–6 is verified content and is **carried over as data, not
rewritten**. Device names, Details-panel setting names and recommended values were researched
against Epic's documentation; that text is the valuable part.

---

## 1. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Data substrate | `uefn_device_logic.json` from v1, carried over verbatim |
| 2 | "New style" | Reuse the Forge landing design system now in `public/css/landing.css`; extract shared tokens so landing and product cannot drift |
| 3 | First-build scope | All 97 types, drafts reachable behind dev mode, as v1 |
| 4 | Placeholder modes | All three home panels stay visible; Chat with AI and Randomise remain placeholders for now (both need product thought) |

Decision 2 implies v2 is a **hosted app in this repo**, not a single offline HTML file. That single
answer settles escaping, data loading, routing and asset hosting at once (brief Part 9, item 1).

---

## 2. Where it lives

```
public/guide.html              the wizard shell (app-shell pattern, like admin/chat)
public/css/guide.css           screen styles, page-scoped under body.guide
public/css/tokens.css          NEW: the Forge tokens, extracted from landing.css
public/js/guide/               the app, split by concern (not one 230 KB file)
  data.js                      loads + validates the dataset
  resolve.js                   rebuildDevices(): merge, dedup, provenance
  state.js                     answers keyed by qId; save/load; migration
  router.js                    screens, history, deep links
  screens/*.js                 one module per screen
  render/*.js                  device groups, settings panels, core-loop diagram
public/data/uefn_device_logic.json    the single source of truth
tests/guide.*.test.mjs         data integrity, resolution, behaviour
```

`server.js` already serves `public/` statically with ETags and correct cache headers, so no server
work is needed. The Docker runtime stage copies `public/`, so the data ships with the image.

---

## 3. The change list

### A. Data layer
1. **One home for the data.** v1 kept the JSON *and* a 152 KB inline copy in the HTML. v2 fetches
   `data/uefn_device_logic.json` once. Never both.
2. **Keep the schema.** Seven top-level keys, and `devices` / `questions` / `base_set_settings` /
   `extra_notes` are always arrays on all 97 entries — never null, never a bare object.
3. **Answers keyed by `qId`**, so any answer can be edited. v1's `qIndex = answers.length` allowed
   only one step back, and `goBackFromBrand()` silently discarded the last answer.
4. **Explicit predecessor per screen** instead of inferring it from array length.
5. **`environment_atmosphere` becomes data** — a flag on the role, not an id hardcoded in two
   render functions (those devices belong in "Make It Look Good", not the core-loop step).
6. **Fix the overloaded `live` flag.** The ten `is_custom` "Just give me the basics" entries are
   `live`, which makes Social & Roleplay and Strategy & Defense look as complete as the other
   eight despite having no researched types. Give `is_custom` its own visibility rule and surface
   "baseline only" honestly.
7. **Move prose and colour out of code**: the five walkthrough step bodies and the eleven
   device-role colours currently live in JS while everything else is data (brief item 5, item 14).
8. **Add `verified_on` per brand** plus a staleness warning. Restriction text carries legal weight
   and has a known expiry; `meta.brand_rules_research_note` already records one inaccuracy.

### B. Architecture
9. **Real routing.** Browser Back currently exits the app, refresh loses progress, nothing is
   linkable. One URL per screen, history integration, refresh-safe state.
10. **No `innerHTML` with unescaped values.** v1 interpolated raw JSON (which intentionally contains
    `<b>` markup) and user-supplied game names straight into HTML *and* into `onclick="…"` strings,
    so a name containing a quote breaks the handler. Escape interpolations, build DOM, and attach
    listeners properly.
11. **Memoise `rebuildDevices()`** — v1 ran it twice per walkthrough — and build the nav/breadcrumb
    once instead of copy-pasting it across seven render functions.
12. **Null-safe output as the normal path.** 84 of 97 types carry `core_loop: null` and
    `layout_tip: ""`, so every consumer falls back to the category baseline. v1 did this with
    `effectiveCoreLoop()` / `effectiveLayoutTip()`; keep that shape and treat it as the common case.
13. **localStorage discipline**: quota handling on write, cap on saved games, rename, delete
    confirmation, and telling the user when a save cannot be migrated instead of dropping it.

### C. The new style
14. **Extract the tokens** (`#101014` page, `#18181c` / `#202024` surfaces, `#26bbff` accent, dark
    ink on accent, `#26262c` lines) into `public/css/tokens.css`, and point both `landing.css` and
    the new `guide.css` at them. Landing and product share one visual language.
15. **Wizard pages use this repo's app-shell pattern**: the style link, the file:// rescue banner,
    the classic `local-server-check.js` tag, the admin entry point, and the script-failure
    watchdog — the things the existing tests and the file:// flow depend on.
16. **Redraw the core-loop diagram** as a real component, responsive, and accessible.
17. **Accessibility, properly this time.** v1 had one `sr-only` h1, zero `aria-*`, focus reset to
    body on every `innerHTML` swap, `alt=""` on brand logos, status by colour only, and no
    `prefers-reduced-motion`. This is a rebuild, so it is cheap now and expensive later.
18. **Align with the landing page's promises.** The new landing page advertises an example project
    card, a design-file preview with `SYSTEM / DESIGN DECISION / UNREAL STARTING POINT` rows and
    copy like "Spirit movement · Garden restoration · First playable scope". The wizard's real
    output should be recognisably that artifact, or the landing copy should change.

### D. Content and assets (the real bottleneck)
19. **The ten category baselines are the highest value per hour** and turn the 74 drafts from empty
    shells into something usable. v1 identified this and never did it; do it early.
20. **Assets that do not exist**: 0 of 8 brand logos, 0 of 3 design-mode images, and only 2 of the
    5 walkthrough videos under the expected filenames. Present: 8 brand heroes ✓,
    `01_ProjectSetup.mp4`, `02_BasicNavigation.mp4`. Missing: `03_BlockOut.mp4`,
    `04_CoreDevices.mp4`, `05_LookGood.mp4` (differently-named footage exists in `videos/`).
21. **Video hosting is an open problem, not a detail.** The files on disk are 274 MB, 166 MB and
    69 MB — over GitHub's 100 MB per-file limit, and they would bloat the container image if placed
    in `public/`. Needs object storage, a video host, or Git LFS — decided before step 4.
22. **Keep the media convention** (drop a correctly named file, reload, no code change) with the
    self-describing placeholder fallback. It was one of v1's genuine good ideas.
23. **Two honesty gaps**: three of four experience levels promise advanced content that does not
    exist, and the placeholder panels are dead ends. The brief's own rule is "a visible dead end is
    worse than no panel" — the chosen placeholders must at least say what is coming.

### E. Tests (brief Part 8, in this repo's `node:test` style)
24. **Data integrity**: every device reference resolves against `device_library`; every game type
    resolves to a non-empty device list (proving baseline inheritance); every `suggested_game_types`
    entry is real; every `set_settings` override names a device that is actually in that path's
    resolved list *and* a setting that exists on it; every `live` type has `core_loop`,
    `layout_tip` and at least one question, or is explicitly `is_custom`; every `draft` type has
    `research_notes`; `extra_notes` and `base_set_settings` are always arrays.
25. **Behaviour**: dev mode off shows only live types; saved games load regardless and a save
    pointing at a draft shows a note rather than vanishing; progress increases monotonically and
    the question band stays inside 16–40%; zero-question types skip the question screen;
    `basic_nav` appears only for `beginner`; back-from-Brand returns to the last question with its
    answer intact; a game name containing `'`, `"`, `<` and `&` renders safely and breaks nothing.
26. **Rendered checks** with headless Chrome, as used for the landing page: the flow at desktop and
    mobile widths, and the loop-diagram geometry for 1 vs 2+ outcomes.

---

## 4. Build order

Each phase proves something before the next depends on it (brief Appendix A).

| Phase | Work | Proves |
|---|---|---|
| 0 | Copy the JSON in, extract `tokens.css`, write the integrity suite | The model is sound and the data is complete before any UI exists |
| 1 | `resolve.js` — merge order, dedup, provenance, general-guidance + override | The output the whole tool exists to produce |
| 2 | `state.js` + `router.js` — `qId` keying, predecessors, history, saves | Navigation and persistence cannot regress |
| 3 | Screens in flow order: Home → Category → Game type → Question → Brand → Restriction → Summary → Experience → Walkthrough | The workflow, end to end, in the new style |
| 4 | Output rendering: device groups by role, settings panels, core-loop diagram, walkthrough | The artifact the landing page promises |
| 5 | The ten category baselines (content) | The 74 drafts stop being empty |
| 6 | Assets: logos, design-mode art, video hosting | The tool stops showing placeholders |

Phases 0–2 depend on no open decision and can start immediately.

---

## 5. Open questions (brief Part 9 items the decisions did not cover)

1. **Video hosting** — object storage, a video host, or Git LFS? Blocks phase 6 and the walkthrough
   screen's usefulness.
2. **Dev mode discoverability** — header toggle (visible to anyone the app is shared with),
   `?dev=1`, or a keyboard shortcut?
3. **Should "Just give me the basics" stay visible with dev mode off** in categories with no live
   types? v1 said yes, which is why two categories are reachable but thin.
4. **Is Time Trial / Team Elimination shipping `live` acceptable** when they reuse neighbouring
   research with one preset setting? Or should types be `draft` until independently researched?
5. **Who owns the brand restriction text, and on what cadence?** It carries legal weight and has a
   known expiry.
6. **What do "Experienced" and "Expert" actually get?** Either write that content or reword the
   options honestly.
7. **Where does the wizard sit in the app?** A new `guide.html` alongside admin and chat, and does
   it become the main entry the landing page's CTAs point at (currently `chat.html`)?
8. **Suggestion, not a decision:** the repo already has a working chat page wired to OpenRouter.
   "Chat with AI" could route there for now instead of being a dead end, at almost no cost — then
   the only true placeholder is Randomise.

---

## 6. Size note

v1 was 230 KB in one file: ~24 KB CSS, ~152 KB inlined data, ~53 KB logic. v2's logic is comparable
in scope (nine screens, one resolution engine, one diagram), but split into modules, with tests that
v1 never had. The data is the same 200 KB. This is a rebuild, not a rewrite of the domain content —
the research is done and it is on disk.

---

## 7. Status: built, and how it was checked

Phases 0–4 are done. `public/index.html` is the guide (the landing page it replaced is recoverable
with `git show b851d7a:public/index.html`, and `css/landing.css` is deliberately kept so that stays a
one-command restore).

| Area | Where |
|---|---|
| Style library (workspace) | `support/FORTNITE_STYLE_LIBRARY.md` → `public/css/tokens.css` + `public/css/guide.css` (no hex value in `guide.css`; retheming is a token edit) |
| Architecture spec (page shell) | `support/Forge--architecture_specification_v2.md` (current) and `..._v1.md` (the version it replaced) → `public/css/shell.css` (every hex value from the spec declared once as a `--sh-*` token) |
| Data | `public/data/uefn_device_logic.json` (one copy, fetched once), `public/js/guide/data.js` |
| Engine | `public/js/guide/resolve.js` (v1's five-step merge, provenance, appended overrides, memoised) |
| Session | `public/js/guide/state.js`, `store.js` (schema 3, v1 import, quota/cap reporting), `router.js`, `share.js` |
| Shell behaviour | `public/js/guide/chrome.js` (search field, header measurement) |
| Screens | `public/js/guide/screens/` — ten modules, one per screen |
| Rendering | `public/js/guide/dom.js` (no `innerHTML` anywhere), `render/ui.js`, `render/devices.js`, `render/loop.js` |
| Tests | `tests/guide.test.mjs` (54), `tests/server.test.mjs` (19, updated for the new page), `tests/browser-check.mjs` (`npm run verify`) |

**The page around the app (architecture spec v2).** `public/index.html` is the Forge page v2 describes:
a **fixed** 72px header with no bottom border, painted with the body colour at 95% (`rgba(16,16,20,.95)`)
rather than the v1 navy; the Epic Games Store logotype the spec names
(`assets/EGS-Logotype-2023-Vertical-White.svg`, 44px of the 72px row) as a reset to the start of the
guide; **one** navigation item, "Home", and therefore no priority+ overflow menu at all; the search field;
the Dev mode secondary action (`#5B5B65`, no border, its on/off state carried by a chip that turns cyan
when active, so it never competes with Admin); and Admin as the page's single primary action — **cyan
`#26BBFF` with a `#101014` label**, replacing v1's yellow. **The hero is gone**, with it the video, its
still, `<h1>Forge</h1>` and the "THINK, DESIGN, BUILD." strapline: the app container now sits directly
below the fixed header (the body is offset by the measured `--sh-header-h`), inset from the page edges,
with its own sticky header holding the clickable breadcrumb trail and a progress bar whose ramp runs from
`#26BBFF` to `#F7FF19`. The footer is a utility bar and nothing else — the system status with the "Go to
admin page" link inside it — so the guide's own footer copy (the Epic disclaimer) moved to the end of the
home screen rather than being dropped. Type is Inter in sentence case throughout, headings included: v2
is explicit about it, and the reference the spec was drawn from
(`support/screencapture-unrealengine-2026-11-13-14_41_45.png`) is set the same way. That supersedes the
poster's heavy italic display face for headings, so no rule in `guide.css` uses `--fn-font-display` any
more; the token and the font file stay because the style library still documents them.

Five things the spec did not settle, and how they were resolved: the inset eases to 16px on a phone
because 64px of gutter each side leaves nothing to read, and the header wraps to a second row at 760px
(measured, never assumed, so the page offset follows it); the search field is present, focuses on
`Ctrl/Cmd+K`, and says in words that it is not built yet, like Randomise and the AI chat panel; the
interim chat page is no longer linked from the header — v2 gives the header one item and the footer one
link — so it is reached from the "Chat with AI" stub screen, and the admin page links it directly; every
wizard step has a visible Back button, and home has none because there is nothing before it; and a screen
change returns to the top of the page, since there is no longer a hero to scroll past.

**Automated checks.** `npm test` runs 110 assertions across four files (21 + 54 + 19 + 16). `npm run verify` drives headless
Chrome over the DevTools Protocol in two phases: all thirteen routes at desktop and phone width
(asserting rendered text, heading structure, exactly one `<h1>` and it being the screen's own title,
focus landing on it, the fixed 72px header painted `rgba(16,16,20,0.95)` and the page clearing it, the
single "Home" nav item, the logotype from the spec, no trace of the hero, a breadcrumb trail with at
least one working link, the footer's admin link, the cyan-to-yellow progress ramp, a visible Back button
on every screen of the wizard, no content overflowing its box, no console errors, and a screenshot each),
then a click-through of the whole wizard with no deep links at all — category to game type to four
questions to brand to the usage-rules gate to the summary, naming and saving the game, the experience
question, all five build steps, finishing, the saved game surviving a reload, the Dev mode button
changing what the screens say, and deletion. Chrome's own `--dump-dom` is not enough: it snapshots before
the app's data fetch resolves, and it was a *screenshot* — not a text check — that revealed the badges
rendering as empty pills.

Bugs that checking threw up, all now fixed and covered: `store.migrateLegacy` was never exposed (the
app could not boot); a stray `;` in a panel body (module parse error); **the router required a game
type on the game type screen, so picking a category bounced you to the home screen with the category
screen still drawn underneath a home hash — the wizard was unusable by clicking, and only the
click-through found it**; long copy inside a `<button>` did not wrap and ran over the neighbouring
card; badges were wrapped in a second, empty badge; the question and walkthrough screens had no
`<h1>`, so focus stayed at the top of the document after every screen change; a file path crammed
into a 64 px tile rendered as a wall of letters; **the shared chrome stylesheet's `button:hover` outranked
the card rules and repainted every choice card light cyan with white text on it** (fixed by layering
`styles.css` and by banning hover fills in the workspace, both pinned by tests); the header squeezing the
navigation to zero width at phone size; and, from the v2 rebuild, three more that only the browser check
could have found — the header's height was read from the very variable its own measurement was published
into, so a phone-sized measurement stuck on desktop and (because nothing resized) the observer never
corrected it; the mobile header's navigation collapsed below the width of its single link and the link
spilled out of the box; and `gametype.js` called `UI.back` without importing `UI`, which broke that one
screen completely.

**Decisions taken from section 5.** Dev mode is a header toggle plus `?dev=1` (2). The basics entries
stay visible with dev mode off and are badged honestly (3). The experience levels are reworded to say
what they actually change (6). The wizard *is* the landing page rather than a new `guide.html` (7).
"Chat with AI" links to the existing chat page as an interim (8).

**Still open.** Video hosting (1): `02_BasicNavigation.mp4` is 274 MB and `03_BasicActorManipulation.mp4`
is 166 MB, both over GitHub's 100 MB limit, so the walkthrough shows self-describing video slots until
that is decided. Time Trial / Team Elimination shipping `live` (4) and brand-text ownership (5) are
content calls, not code. Level-specific material for Experienced and Expert (6) is still unwritten.

**Asset and data notes for whoever picks this up.**

- All eight brand hero images arrived and are wired up unchanged (the picker is data-driven, so they
  needed nothing but the right filenames). The eight brand *logos* are still missing, and one of them did
  need a fix rather than a drop-in: the file shipped as `TMNT_hero.jpg` while the data asks for
  `tmnt_hero.jpg` — which works on Windows and 404s in the container, so the filename was corrected and
  `tests/guide.test.mjs` now checks each brand's art against the real directory entry instead of the
  filesystem's forgiveness. `public/images/brands/Untitled-1.psd` is a 23 MB Photoshop working file; it
  is not committed (`.gitignore` excludes `*.psd`) and it should really live outside `public/`, because
  everything in there is served.
- `public/assets/Hero--Video.mp4` (50 MB) and `Hero--Fallback.png` are no longer referenced by anything,
  now that the spec removes the hero. They are still in the repository; deleting them saves ~52 MB
  whenever that is confirmed.
- One game type, `platforming_deathrun_obby`, sets an option on `Round Settings` without listing that
  device. The engine keeps it as an orphan with its provenance and the walkthrough reports it rather
  than dropping it silently; `tests/guide.test.mjs` pins that it is the only such case, so the test
  fails if the data is fixed or if another type acquires the same problem.
- `support/` (the poster, the Markdown cheat sheet, this plan) sits outside `public/`, so none of it is
  served by the app.

