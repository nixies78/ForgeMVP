# Lesson page concepts - shared brief (2026-11-24)

Eight alternate designs for the Lesson page, each in the visual language of a landing page the owner has
already approved, so he can see what the walkthrough screen looks like off the pitch pages and pick a
direction. This is the sibling of `home-concepts-brief.md` (the landing pages), `mockup-directions.md` and
the Question set in `public/concepts/questions-*`.

**`lessons-1-default` is the structure.** Every page here is that screen - the same elements, the same
order, the same behaviour, the same four steps of real content - wearing a different design system. The
design is the variable; the page's job is not.

## The set

| Page | Folder | Built from (landing page) |
| --- | --- | --- |
| L2 | `lessons-2-cinematic` | `1-cinematic` - Cinematic Launch |
| L3 | `lessons-3-funky` | `2-funky` - Sticker Pop |
| L4 | `lessons-4-lobby` | `3-lobby` - Choose Your Mode |
| L5 | `lessons-5-bento` | `5-bento` - Creator Bento |
| L6 | `lessons-6-quiet-blue-indigo` | `8-quiet-dark-blue-indigo` - Quiet Power, Blue + Indigo |
| L7 | `lessons-7-spotlight` | `9-spotlight` - Spotlight |
| L8 | `lessons-8-editor` | `10-uefn-editor` - The Editor |
| L9 | `lessons-9-item-shop` | `11-item-shop` - Item Shop |

Numbering is the set's own sequence (L1 is the default), exactly as the Question alternates are numbered:
the number is the order in the family, and the name says where the language came from.

## What is fixed

Two things, both measured on every page by `npm run verify` (`tests/browser-check.mjs`, phase three):

- **The chrome**, from `../_shared/chrome.css`, linked **last in `<head>`**: a 72px `<header>` holding the
  Epic mark at 44px inside `.logo-wrap` > `.logo-img`, the mark's left edge on the shared 1136px column,
  no box behind the mark, and the shared lockup (`.logo-lockup` with `.logo-word`) as the header's brand
  unit. Add `logo-img-black` where the bar is light. Your bar keeps your colours, your rule and your own
  controls - Home, Dev mode, whatever your design uses - and everything else about it.
- **The column** is `.wrap`, 1136px of content, and the shared file owns its gutter. Never set a width or
  padding on `.wrap` yourself. The trap this hides: **the header must not be a flex or grid container**.
  As a flex parent it shrink-wraps its `.wrap` child down to the lockup plus your two controls, which
  pulls the mark off the column - `npm run verify` reports it as "gives its column *n* px of content" and
  "the mark sits at a different x". The header's own flex row belongs on an element *inside* `.wrap`.
  Two pages in this set were built with a `display: flex` header and both had to be fixed.

  Likewise the mark: `logo-img` (white, `../../assets/logo_epic.svg`) on a dark bar, `logo-img-black` on a
  light one. The wrong one is invisible rather than obviously broken - a black mark on `#101014` still
  measures 44px and still passes every check except the eye.

**No footer.** These are screens of the app, not pitch pages: `lessons-1-default` and the Question
alternates carry none, and the verifier fails a mock-up that grows one. End the page after the card.

**Nothing else in the repo is touched.** One folder per page, `index.html` plus `lessons.js` beside it.
Relative paths only (`../../assets/...`, `../_shared/chrome.css`, `../../data/...`) - root-relative paths
break when a page is opened from disk and `tests/paths.test.mjs` fails on them.

## The structure, element by element

Read `lessons-1-default/index.html` and `lessons-1-default/lessons.js` before writing anything. The
inventory, in order, with the behaviour that has to survive the redesign:

| # | Element | Behaviour |
| --- | --- | --- |
| 1 | `<header class="wrap">` | 72px, the shared lockup, plus your own controls: a Home link back to `../../index.html#/home` and the `#devMode` control the script wires up, in your design's own treatment (as a pill, a switch, a key, a checkbox - whatever this concept uses) |
| 2 | Tagline | "Design your game, then follow a step-by-step walkthrough - with video - to actually build it." |
| 3 | Progress rail | `role="progressbar"`, driven by the current step (25 / 50 / 75 / 100%) |
| 4 | Crumbs | `Simulation & Tycoon › Just give me the basics · Brand: KPop Demon Hunters` |
| 5 | Stepper | Four steps from `STEPS`, current one marked `aria-current="step"`, earlier ones `.done`, each a `<button>` that jumps to that step |
| 6 | `<h1 id="stepTitle" tabindex="-1">` | The step title; the JS focuses it on a step change (`:focus { outline: none }`) |
| 7 | Video | 16:9 YouTube `<iframe>` (`https://www.youtube-nocookie.com/embed/RjLHj-gSfr8`), plus the "Video not loading? Watch on YouTube ↗" line |
| 8 | Body | `STEPS[i].body` as HTML: paragraphs, a numbered list, a `.tip`, and a `<h2>` + `<ul>` of devices in step 3. Keep every class the JS renders (`.devname`, `.tip`) or restyle them - the content itself is copied verbatim. **The list items are inline content with `<strong>` inside them**: an `li` that is a grid or flex container turns each of those into an item of its own, which stacks "Click / New Project / in the UEFN Project Browser" as three fragments. Hang the marker in the margin with `position: absolute` instead (two of the eight pages had this bug before a screenshot caught it) |
| 9 | MCP prompt | Label, one-line help, a read-only `<textarea>`, a Copy button, and a live status line |
| 10 | Feedback | A "Report a problem" trigger opening a `<dialog>`: five reason chips, optional text, optional email, an error line, Cancel and Send; Save is local only, and the toast says so |
| 11 | Actions | `← Back`, `Edit game type` (link to `../questions-1-default/index.html`), and `Next →` / `Finish` |
| 12 | Toast | Fixed, `role="status"`, shown for four seconds |
| 13 | Concept tag | Fixed in a corner: `Lessons 2 - Cinematic Launch` and so on, in the page's own styling |

Behaviour that must not change: `#step=N` in the URL hash opens that step and a step change rewrites it;
Back is disabled on step 1; Next reads `Next: <next title> →` and becomes `Finish` on the last step; the
prompt textarea holds the current step's prompt with a clipboard fallback; the dialog validates a reason
and an email, saves to `localStorage` under `forge-lesson-feedback`, and closes on Escape, backdrop or
Cancel, returning focus to the trigger.

Names, colours, materials, type, spacing and layout are yours; the wiring is not. All eight pages therefore
run **one** script, `lessons.js`, which is the baseline's behaviour with two differences: it names the page
from its own `.concept-tag` (so a copy cannot call itself by the wrong name) and it drives real progress
(`public/js/guide/app.js` computes progress from the step the creator is on; the baseline painted a flat
60% that no step ever matched). The file is already in each folder - a page does not write it, and does not
edit it.

### The markup contract that script expects

Give these elements these ids and the script runs unmodified. Everything else - the elements around them,
their classes, their nesting - is the design's own.

| id | what it is |
| --- | --- |
| `progressFill` | the fill inside the page's `[role="progressbar"]` rail; the script sets its `width` |
| `stepper` | the `<ol>` the four step buttons are built into; each `<button class="step">` gets a `<span class="n">` (the number) and a text span |
| `stepTitle` | the `<h1>`, `tabindex="-1"`, focused on a step change |
| `video` | the 16:9 `<iframe>` |
| `stepBody` | where the step's instructions are rendered - it needs the `.tip` and `.devname` classes styled, since the content uses them |
| `prompt` | the read-only `<textarea>` holding the step's MCP prompt |
| `copy` | the Copy button, and `copyStatus` the live line beside it |
| `back`, `next` | the two step controls |
| `feedbackBtn` | the "Report a problem" trigger |
| `feedback` | the `<dialog>`: a form `fbForm` holding five `input[name="reason"]` chips, `fbText`, `fbEmail`, an error line `fbError`, and buttons `fbClose` / `fbCancel` |
| `toast` | the fixed status line, `hidden` until it is used |
| `devMode` | the header's Dev mode control, `aria-pressed`, kept for parity with the Question page |

The dialog's own copy is fixed and belongs in every page as it stands in the baseline: "Report a problem"
with the step's number and title under it, the five reasons (Out of date, Doesn't work, Hard to follow,
Video problem, Something else), "What happened? (optional)", "Email (optional, if you'd like a reply)",
Cancel and Send, and the note "For now this is saved on this device only." Restyle it, keep the words.

## Layout freedom

Keep the order and keep every element. Beyond that the concept has the run of the page: a two-column
grid, a rail, panels, an inset viewport, a framed plate - whatever the landing page's own composition
does, applied to these eleven things. What must survive is that a creator can read the step, watch the
video, follow the instructions, copy the prompt and move on, in that order, at 400px as well as at 1440px,
with no horizontal scroll and AA contrast on body text.

## Where the design comes from

Each page takes its palette, its type treatment, its materials and its component vocabulary from the
landing page it is built from. Read that page in full - its `:root` block, its `@font-face`s, how it draws
a card, a button, a tile, a label, a badge - and use **its** values, not a memory of them. The brand
palette, gradients and extended tints those pages draw from are listed in `home-concepts-brief.md`.

What must not come across is a landing page's sales copy, its three ways in, or its footer. This screen is
what a creator sees *after* they have chosen: the plan exists, and this is the build.

## Checking the work

- `node tests/paths.test.mjs` - every path in the page resolves from disk. Run it before reporting back.
- `npm run verify` (needs a server and Chrome; the coordinating session runs it) measures the chrome
  contract on every page in `public/concepts/` automatically.
- `node .scratch/contract-check.mjs` - the fast local gate: the markup contract's ids, the tag, no footer,
  `chrome.css` last, `.wrap` sizing, root-relative paths. Cheaper than `npm run verify` and it names the
  missing id.
- `node .scratch/probe.mjs <url> "<expression>"` - measure rendered geometry instead of guessing from a
  screenshot ("how wide is that bar really").
- Screenshots are taken by the coordinating session at 1440 and 400 wide; a page that has never been
  looked at is not finished. Write the page so it survives that look: no clipped panels, no element
  overflowing its box, no text sitting on a colour it cannot be read on.

Do not commit, branch or push: the coordinating session reviews all eight together and commits them.
