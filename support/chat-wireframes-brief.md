# AI chat page - three wireframes (shared brief)

The chat page is the third way into Forge and the one nobody has designed: today it is a text box,
two buttons and a checkbox (`public/chat.html`). Every AI chat product on the web is that same box,
so this set exists to put three *structurally* different chats side by side and let the owner pick a
direction, not a colour.

These are **wireframes, not mockups**. No brand gradients, no key art, no character cut-outs, no
polish. The thing being judged is where the affordances sit, what happens on the cold canvas, and
what the conversation produces. Styling comes later, once a structure has won.

Three pages, one per direction, each in `public/concepts/<slug>/index.html`:

| slug | direction | the one-line argument |
| --- | --- | --- |
| `chat-1-launchpad` | **Launchpad** | The owner's suggestion, wireframed: example prompts and theme chips above a centred chat box. |
| `chat-2-workbench` | **Workbench** | The chat is the process, the design is the product: a live design panel fills in beside the conversation. |
| `chat-3-interview` | **Interview** | The AI speaks first and the answers are tappable: the blank box is the failure mode, so there is no blank box. |

All three are the same product: Forge's AI chat for Fortnite/UEFN game design. It takes an idea in
words, asks follow-ups, and returns **the exact game type, the UEFN devices it needs, and five build
steps**. Real numbers you may quote: 13 researched game types, 74 drafts, 10 category basics, 59
devices. Do not invent statistics.

## The frame (shared chrome - not the page's design)

Same rules as the rest of the mockup set, and `npm run verify` measures them on every page in
`public/concepts/`:

- **Static HTML/CSS only.** No app code, no data loading, no network. Dead links are fine (`href="#"`),
  but a link to a sibling page must name its `index.html`.
- Link the shared frame **last in `<head>`**, after your own `<style>`:
  `<link rel="stylesheet" href="../_shared/chrome.css" />`.
- **The header is 72px** and carries the locked lockup, in `.wrap`, on every page:
  ```html
  <header class="top wrap">
    <a class="logo-lockup" href="../../mockups/index.html" title="All mockups">
      <span class="logo-wrap"><img class="logo-img" src="../../assets/logo_epic.svg" alt="Epic Games" width="44" height="44"></span>
      <span class="logo-word">Forge</span>
    </a>
    <span class="top-right">AI chat · wireframe N of 3 · <Name></span>
  </header>
  ```
  Do not style the mark or the wordmark in your page: no `height`, `width`, `background`, `border`,
  `filter` or `transform` on `.logo-img` / `.logo-wrap` / `.logo-word`, and no `header img` rule.
- **The column is `.wrap`, 1136px of content, with no page gutter of your own.** Never set
  `max-width` or `padding-inline` on `.wrap` (chrome.css owns both). `padding-block` is yours.
- **These pages carry no `<footer>`.** They are screens of the app, like the question and randomiser
  prototypes, not pitch pages: the browser check asserts their absence.
- **No second Epic-logo image anywhere on the page** - the check measures every mark at 44px. Inside a
  wireframe, draw the app bar's brand slot as a grey placeholder square plus the word "Forge".
- **Paths are relative, never root-relative**: `../_shared/chrome.css`, `../../assets/...`. The pages are
  opened straight from disk as well as served.
- Works at desktop width and at ~400px with no horizontal scroll. Readable contrast for prose.
- A small fixed "Wireframe N - <Name>" tag sits in a corner in `.tag`.
- Fonts: the repo's Inter for everything; `ui-monospace` for the frame labels, the notation markers and
  any code-ish text. No Google Fonts needed.

## The wireframe notation (the set's shared visual language)

Deliberately greyscale, with exactly two colours of meaning. Every page uses this and nothing else:

- The page around the frames is dark (`--page`), so the wireframes read as sheets laid on the set.
- A **wireframe canvas** is light paper (`--paper`): `.frame` (dark bezel) > `.frame-label` (mono, upper
  case: which state is shown) > `.canvas`.
- **Ink**: real text for anything a user reads - labels, prompts, chips, buttons, message content. This
  is the copy being evaluated, so it is written out, not barred.
- **Grey bars** (`.ln`) stand in for body copy nobody is judging - the assistant's prose, a paragraph of
  help text. Never for a button, a chip or a heading.
- **Dashed** borders mean empty, placeholder or not-yet-built. Solid hairlines mean real chrome.
- **One live colour** (`--accent`, Epic blue #33BFFF): the primary action, the selected chip, the filled
  progress. Nothing else on the canvas is coloured.
- **Amber numbered markers** (`.mk`) sit inside the canvas next to the thing they describe; the notes
  panel beside the frame carries the matching number (`.note`). Notes are commentary, not UI - say so in
  the notes panel heading ("Not part of the UI").
- Phone frames are the same components at a smaller canvas font-size: `.phone > .canvas { font-size: 11.5px }`.
  All component sizes are in `em`, so the whole kit scales.
- Every page ends with **"What this direction bets on"** (what it is good at, what it risks, what to
  instrument if it ships) and links to the other two wireframes.

## The shared kit (copy this CSS verbatim into each page)

```css
@font-face {
  font-family: "Inter";
  src: url("../../assets/fonts/inter-latin-variable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
:root {
  --page: #0E0F12;        /* the concept page's own ground */
  --panel: #15181C;       /* bezels, notes */
  --rule: #2C3036;        /* page hairlines */
  --ink: #E9EAEC;         /* page text */
  --dim: #9BA0A7;         /* page secondary text */
  --paper: #F2F3F5;       /* wireframe canvas */
  --wf-ink: #23262B;      /* wireframe text */
  --wf-dim: #767D85;      /* wireframe secondary text */
  --wf-line: #C9CDD3;     /* wireframe hairline */
  --wf-line-2: #9AA0A7;   /* wireframe solid edge */
  --wf-dash: #B4BAC1;     /* empty state */
  --wf-fill: #FFFFFF;     /* wireframe surface */
  --wf-fill-2: #E4E7EA;   /* wireframe filled surface */
  --accent: #33BFFF;      /* the one live colour */
  --accent-ink: #0A2633;
  --note: #F9A91F;        /* annotations */
  --body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--page); color: var(--ink); font: 400 1rem/1.6 var(--body); }
main.wrap { padding-block: 40px 88px; }
h1 { font: 800 clamp(2rem, 4.6vw, 3rem)/1.04 var(--body); letter-spacing: -.025em; margin: 0 0 .5rem; }
.eyebrow { font: 700 .75rem/1 var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin: 0 0 14px; }
.lede { color: var(--ink); margin: 0 0 14px; max-width: 62ch; font-size: 1.05rem; }
.legend { color: var(--dim); font-size: .82rem; margin: 0; max-width: 78ch; }
.legend b { color: var(--ink); font-weight: 600; }
.sec { margin-top: 60px; }
.sec > h2 { font: 800 1.4rem/1.2 var(--body); letter-spacing: -.015em; margin: 0 0 10px; }
.sec > p { margin: 0 0 18px; color: var(--dim); max-width: 74ch; }
.cap { color: var(--dim); font-size: .82rem; margin: 12px 2px 0; }

/* one frame and its notes: 812px of canvas beside a 296px note column inside the 1136px column */
.row2 { display: grid; grid-template-columns: minmax(0, 1fr) 296px; gap: 28px; align-items: start; margin-top: 22px; }
.frame { background: var(--panel); border: 1px solid var(--rule); border-radius: 18px; padding: 12px; }
.frame-label { display: flex; justify-content: space-between; gap: 12px; padding: 2px 4px 10px;
  font: 600 11px/1.4 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.canvas { background: var(--paper); color: var(--wf-ink); border-radius: 10px; padding: 1.1em; font-size: 14px; line-height: 1.45; }

/* in-canvas chrome: the app bar, then the screen */
.appbar { display: flex; align-items: center; gap: .7em; padding-bottom: .9em; border-bottom: 1px solid var(--wf-line); }
.appmark { width: 1.6em; height: 1.6em; border-radius: .35em; background: var(--wf-line-2); flex: none; }
.appname { font: 800 .82em/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
.appnav { display: flex; gap: .5em; margin-left: 1em; }
.appnav i { display: block; width: 3.6em; height: .5em; border-radius: 1em; background: var(--wf-line); }
.soon { margin-left: auto; border: 1px solid var(--wf-line-2); border-radius: 1em; padding: .25em .7em;
  font: 700 .68em/1.3 var(--body); letter-spacing: .1em; text-transform: uppercase; color: var(--wf-dim); }
.screen { padding-top: 1.5em; }
.h3 { font: 700 1.25em/1.25 var(--body); letter-spacing: -.01em; margin: 0 0 .5em; }
.ln { display: block; height: .5em; border-radius: .4em; background: var(--wf-line); margin: .5em 0; }
.w90 { width: 90%; } .w75 { width: 75%; } .w60 { width: 60%; } .w40 { width: 40%; }

/* the composer, wherever it sits */
.composer { border: 1.5px dashed var(--wf-dash); border-radius: .7em; background: var(--wf-fill); padding: .85em .9em; }
.composer .ph { color: var(--wf-dim); font-size: .95em; }
.caret { display: inline-block; width: 1.5px; height: 1em; background: var(--wf-line-2); vertical-align: -.15em; }
.composer-foot { display: flex; align-items: center; gap: .6em; margin-top: 1.1em; font-size: .78em; color: var(--wf-dim); }
.composer-foot .spacer { margin-left: auto; }
.send { width: 2.1em; height: 2.1em; border-radius: 50%; background: var(--accent); color: var(--accent-ink);
  display: grid; place-items: center; flex: none; }
.alt { margin-left: auto; font-size: .78em; color: var(--wf-dim); }

/* starter shelf: eyebrow, prompt rows, chips, and the brief tray */
.wf-eyebrow { font: 700 .76em/1.3 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--wf-dim); margin: 0 0 .8em; }
.prow { display: flex; align-items: center; gap: .6em; background: var(--wf-fill); border: 1px solid var(--wf-line);
  border-radius: .5em; padding: .6em .8em; margin-bottom: .45em; font-size: .95em; }
.prow .cue { color: var(--wf-dim); }
.prow .go { margin-left: auto; font: 700 .72em/1 var(--body); color: var(--wf-dim); border: 1px solid var(--wf-line);
  border-radius: .4em; padding: .3em .55em; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: .4em; }
.chip { border: 1px solid var(--wf-line-2); border-radius: 1em; padding: .3em .8em; font-size: .85em; background: var(--wf-fill); white-space: nowrap; }
.chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
.tray { display: flex; align-items: center; flex-wrap: wrap; gap: .5em; border: 1px dashed var(--wf-dash);
  border-radius: .6em; padding: .7em .8em; background: var(--wf-fill); margin-top: 1.1em; font-size: .9em; }
.tray .lab { font: 700 .72em/1 var(--body); letter-spacing: .1em; text-transform: uppercase; color: var(--wf-dim); }
.brief-line { color: var(--wf-ink); }
.btn { display: inline-flex; align-items: center; gap: .45em; border-radius: .45em; padding: .5em .9em;
  font: 700 .85em/1 var(--body); border: 1px solid var(--wf-line-2); background: var(--wf-fill); color: var(--wf-ink); white-space: nowrap; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn[aria-disabled="true"] { background: var(--wf-fill-2); color: var(--wf-dim); border-color: var(--wf-line); }

/* the conversation */
.turn { display: flex; gap: .6em; margin-bottom: .8em; }
.turn.user { justify-content: flex-end; }
.avatar { width: 1.7em; height: 1.7em; border-radius: .4em; background: var(--wf-line-2); flex: none; }
.bub { max-width: 78%; border-radius: .8em; padding: .7em .85em; font-size: .92em; }
.bub.ai { background: var(--wf-fill); border: 1px solid var(--wf-line-2); }
.bub.user { background: var(--wf-fill-2); border: 1px solid var(--wf-line); }
.taprow { display: flex; flex-wrap: wrap; gap: .4em; margin-top: .7em; }
.tapcard { border: 1.5px solid var(--wf-line-2); border-radius: .6em; padding: .6em .8em; background: var(--wf-fill);
  font-size: .9em; font-weight: 600; }
.card { border: 1px solid var(--wf-line-2); border-radius: .7em; background: var(--wf-fill); padding: .9em; font-size: .9em; }
.card + .card { margin-top: .8em; }
.card-head { display: flex; align-items: center; gap: .5em; margin-bottom: .7em; }
.card-head .t { font: 700 .95em/1.2 var(--body); }
.state { border: 1px solid var(--wf-line-2); border-radius: 1em; padding: .2em .6em; font-size: .72em; font-weight: 700; color: var(--wf-dim); }
.slot { display: flex; align-items: baseline; gap: .6em; padding: .45em 0; border-top: 1px dashed var(--wf-line); font-size: .92em; }
.slot .k { min-width: 7.5em; color: var(--wf-dim); font-size: .82em; }
.slot .v.empty { color: var(--wf-dim); }
.dot { width: .55em; height: .55em; border-radius: 50%; border: 1.5px solid var(--wf-line-2); display: inline-block; }
.dot.on { background: var(--accent); border-color: var(--accent); }
.step { display: flex; align-items: center; gap: .6em; padding: .38em 0; border-top: 1px dashed var(--wf-line); font-size: .9em; }
.step .n { width: 1.5em; height: 1.5em; border-radius: .3em; background: var(--wf-fill-2); display: grid; place-items: center;
  font: 700 .75em/1 var(--body); color: var(--wf-dim); flex: none; }
.step .n.on { background: var(--accent); color: var(--accent-ink); }
.mk { display: inline-grid; place-items: center; width: 1.3em; height: 1.3em; border-radius: 50%; background: var(--note);
  color: #241a03; font: 700 .7em/1 var(--body); vertical-align: .2em; margin-left: .35em; flex: none; }

/* the notes panel: commentary beside the frame, never inside it */
.notes { display: grid; gap: 14px; align-content: start; }
.notes > .nh { font: 700 .72rem/1.3 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); margin: 0; }
.note { background: var(--panel); border: 1px solid var(--rule); border-left: 3px solid var(--note); border-radius: 10px; padding: 12px 14px; }
.note h4 { margin: 0 0 6px; font: 700 13px/1.35 var(--body); display: flex; gap: 8px; align-items: center; }
.note h4 .n { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--note);
  color: #241a03; font: 700 11px/1 var(--body); flex: none; }
.note p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--dim); }
.note p + p { margin-top: 6px; }

/* phone frames: the same kit at a smaller canvas size - everything inside is in em */
.phones { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 22px; }
.phone { width: 296px; background: var(--panel); border: 1px solid var(--rule); border-radius: 24px; padding: 10px; }
.phone .canvas { font-size: 11.5px; border-radius: 16px; padding: 1em; }

/* closing blocks */
.bets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 22px; }
.bet { background: var(--panel); border: 1px solid var(--rule); border-radius: 12px; padding: 16px 18px; }
.bet h3 { margin: 0 0 10px; font: 700 14px/1.3 var(--body); }
.bet ul { margin: 0; padding-left: 18px; color: var(--dim); font-size: 13.5px; line-height: 1.6; }
.siblings { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
.siblings a { color: var(--accent); font-size: .9rem; font-weight: 600; text-decoration: none; border-bottom: 1px solid transparent; }
.siblings a:hover { border-bottom-color: currentColor; }
.tag { position: fixed; left: 14px; bottom: 14px; z-index: 9; background: var(--panel); border: 1px solid var(--rule);
  border-radius: 999px; padding: 6px 12px; font: 600 11px/1.3 var(--mono); letter-spacing: .06em; color: var(--dim); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }

@media (max-width: 1080px) {
  .row2 { grid-template-columns: minmax(0, 1fr); }
  .bets { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 520px) {
  .canvas { font-size: 12.5px; }
  .phone { width: 100%; }
  .top-right { display: none; }
}
```

## What every wireframe must show

Each page shows the **same three moments**, so the directions are compared like for like:

1. **State 1 - the cold canvas.** Nothing sent yet. This is the state the product actually fails at
   today, and the state the owner's suggestion is about, so it gets the most space.
2. **State 2 - after the first exchange.** The transcript exists, the assistant has asked its follow-up,
   and whatever the direction does with its structure is visible.
3. **On a phone.** One `.phone` frame, because the three directions differ most at 400px.

State 2 in all three shows the same real output of the chat - **game type, the UEFN devices, the five
build steps** - so the difference is where it lives, not what it is. Use real device names
(`Prop Manipulator`, `Prop Mover`, `Round Settings Device`, `Player Spawn Pad`, `HUD Message Device`,
`End Game Device`) and a real-looking game type (`Prop Hunt - Draft`).

## The three directions in detail

### 1 - Launchpad (the owner's suggestion)

The page opens on a centred column: a title, a chat box, then **"You could ask something like"** with
four example prompts as rows, then **"Or choose some themes"** with twelve chips. Reading it back:
*is the suggestion clear?* - yes, and the wireframe is the answer to that question.

Content to use:

- Example prompts (rows), each with a "Fill the box" affordance so it is obvious a click seeds the
  composer rather than sending blind:
  1. "A prop hunt in an abandoned hotel, for four players"
  2. "A boss fight on a moving train - is that buildable?"
  3. "Turn my farming tycoon into something with more action"
  4. "Something my kids can play in ten minutes"
- Themes (twelve chips): Prop Hunt, Tycoon, Boss Fight, Parkour, Deathrun, Escape Room, Tower Defence,
  Hide & Seek, Racing, Survival, Co-op, Spooky.
- **State 1b (a small third frame on this page): three chips picked.** The chosen chips collect in a
  tray under the composer and are read back as one brief line - "Make it: a spooky prop hunt, co-op,
  ten-minute rounds" - with a blue **Write it for me** button. This is the part of the owner's idea that
  does the work: the chips do not just suggest, they build the first message.
- **State 2**: the shelf **collapses** to a single row of "Starters" under the transcript, and the
  themes come back as contextual reply chips on the assistant's follow-up question. The plan lands in
  the transcript as a card with the game type, four devices and the five build steps.
- Phone: the composer stays pinned to the bottom, and the shelf scrolls above it - the shelf must never
  push the box off the screen.

### 2 - Workbench (split view: the chat is the process, the design is the product)

Structurally the opposite of Launchpad: the canvas is two columns. Left is the conversation, right is
**"Your design"** - a panel that fills in as the conversation goes. Nothing about the chat changes
except that its output has a home that is visible while you talk.

- **State 1**: left column carries a three-line "how this works" (describe it -> Forge asks -> you get a
  plan), three compact example prompt rows, a six-chip quick-picks row directly above the composer, and
  the composer at the foot. Right column is the empty design panel: `Game type`, `Brand`, `Players`,
  `Devices 0 of 6`, `Build steps 0 of 5`, all dashed and empty, with one hint: "Answer in the chat, or
  click a slot to be asked about it." Numbered markers on the hint, the quick picks and the slots.
- **State 2**: the transcript has an idea, a follow-up question with three inline tap-answer chips and a
  second user turn; the panel is now partly filled - `Prop Hunt - Draft`, five devices with two marked
  "considered", two of five build steps ticked, and an **"Open questions"** list of two things the AI
  still needs ("Does a caught player spectate, or sit out?") that point back into the chat. The primary
  **Build in UEFN** button is visibly disabled until the plan is complete.
- Phone: the panel becomes a bottom sheet behind a two-tab switch - `Chat` / `Design (5)` - shown in a
  `.phone` frame. The point to make in the notes: at 400px the panel must never take the composer's
  place.
- Notes must state the risk honestly: two panes are two places to look, and the panel is dead weight
  for anyone who only wants a chat.

### 3 - Interview (the AI speaks first, and every answer is a tap)

The front page is not a text box: it is the **first turn of a conversation that has already started**.
The assistant asks one answerable question with big tappable answer cards, and typing is offered as a
link, never required. Every answer lands in the transcript as an editable decision card, so nothing is
lost and nothing is hidden behind a wizard.

- **State 1**: assistant card - "Let's find your game. You don't have to know the answer yet." - then
  the question "What should a player be doing in the first 30 seconds?" with six tap cards
  (Run and hide / Fight something / Build and farm / Explore / Race / Solve puzzles), then a row with
  the chip **"Not sure - surprise me"** and the link **"Skip - I'll type it"**. The composer sits at the
  foot as a single quiet line: "Or type it your own way...". A slim strip at the bottom of the canvas
  carries the brief being assembled: five dimmed dots, `Goal`, `Feel`, `Players`, `Devices`, `Steps`.
- **State 2**: three answers in. The transcript shows assistant question + user decision card (each with
  an edit affordance), a "Here's what I heard" summary card with **Fix this**, and the plan card - game
  type, three devices, five build steps with the first two filled - with **Refine in chat** and
  **Build in UEFN**. The strip now reads 3 of 5 with the answered labels filled in blue.
- Phone: the first turn only, tap cards stacked full width. The notes should say this is the direction
  that gets *better* on a phone rather than worse.
- The notes must also draw the line between this and the existing question wizard (`questions-*`): here
  the transcript persists, every answer is editable after the fact, the user can argue with the AI in
  prose at any point, and the AI may deviate from the script. The risk to name: it reads as a quiz if
  the tapping never ends, and a hidden free-text path is a dead end for the user who already knows what
  they want.

## The full mockup that follows the wireframes

Once the owner picks a structure, the next artefact is that structure at full fidelity. The first one is
Workbench, because its argument (the chat is the process, the design is the product) is the one that a
greyscale wireframe can only half make: the whole question is whether a live panel beside a conversation
reads as one workspace or as two windows that happen to be adjacent, and that cannot be judged without
depth, colour and type.

| page | direction | styling |
| --- | --- | --- |
| `chat-2b-workbench-quiet` | Workbench, as a real screen | The page is **Concept 8 (Quiet Power)**: `#101014`, hairlines instead of boxes, Inter Tight with negative tracking, `#33BFFF` for the one action and `#868AFD` for what a machine says about itself. The two things you touch are **Randomiser 2c (Portrait reels)**: a moulded case - a lit top edge, a dark bottom edge, one recessed well - plus keys that stand up off the surface and press down onto their skirt. |

Rules for a full mockup - the wireframe rules above, with these differences:

- **It is a screen, not a diagram.** No `.mk`/`.note` annotation layer, no greyscale, no dashed
  placeholders left as the subject of the page. Annotations come back only if a decision needs arguing.
- **One object per side, not a frame around both.** The conversation sits on the page itself; the only
  moulded thing under it is the composer, and the design panel is its own object beside it. The first
  pass wrapped both bays in a single case and the chat became a window inside a panel inside a page -
  three frames saying one thing, and the heaviest part of the screen was the part you only read. Depth
  belongs to what you press and to what reports progress, and to nothing else.
- **The panel never pushes the conversation.** It is `position: sticky` with a height of its own, so the
  composer is above the fold when the page loads at 1440x1000 *and* at 1440x780, and the panel floats
  along as the conversation grows. Test the fold at two window heights: at 62vh the composer's bottom
  edge was 20px past it, and at a laptop height the short-window media query is what buys the transcript
  its room back. Both lists in the panel (Devices, Build steps) are folded behind a `<details>` summary
  that keeps the count and the gauge visible while shut, because a panel that grows to 1100px is not a
  readout you can leave on screen. On one column the panel stops floating; a sticky panel under the thing
  it describes is a panel nobody scrolls back to.
- **It must work, not just look right.** The interactions are the argument: the box starts one line tall
  and grows with what is typed, a quick pick writes into it without sending, a tap answer on a message
  becomes a turn, an **Answer** key in the panel writes that answer into the transcript, ticks its build
  step, decides its device, moves both gauges and the state chip, and unlocks **Build in UEFN** only when
  nothing is owed. `Build in UEFN` then reports what it sent. Keep it to one small `<script>` with canned
  replies - no model, no network. Hovering **Answers owed** is where the sentence about where answers go
  lives (a tooltip, not a line of prose under the box), and a dictation key sits to the left of Send at
  Send's own height, reporting whether it is listening and nothing more.
- **The panel is recomputed, never patched.** Answering a question sets a flag, and one `render()` works out
  what the panel is: which questions are open, which of them the composer's counter is counting, which
  devices and steps are in, whether Build in UEFN is unlocked and what the status line says. So the same
  panel comes out whichever bay the answer came from and in whatever order the questions were answered, and
  the panel's count of open questions is literally the list the "Answers owed" number reads. Nothing is
  added and removed by hand, which is what used to let the two bays disagree. A tap answer inside an old
  message stops being pressable once its question has been settled anywhere - a settled question is not a
  question, and the transcript must not go on offering what the panel has already taken.
- **The pitch is spent over the conversation, not in one cut.** On load nothing has been said and the page
  is all pitch: full two-line headline, the lede at full opacity, the composer above the fold. The page's
  whole resize is one number, `--engage`, which the script sets to `min(1, turns / 8)` and the CSS
  interpolates with `@property` - so headline size, the intro's padding, the lede's opacity and the deck's
  height move together and cannot drift apart. Eight turns, because a turn is only half a turn: the ramp is
  spent over the first four things the user says and the four replies they get, which is about as long as
  the pitch deserves to be in the way. Four was the first guess and it gave itself away after two inputs. The
  two ends are exactly the states that were checked before the ramp existed (nothing said: 68px over two
  lines, 36px/26px of padding; conversation under way: one line at 34px, lede gone, 18px/14px), so the ramp
  is a path between two known screens rather than a third design. Two things stay discrete, because
  interpolating them would be interpolating a decision rather than a size: `is-underway` retires the
  "Conversation" label and the quick picks on the first user turn, and `is-compact` turns the second line of
  the headline into an inline span at `--engage 1`. Both are hidden with `visibility: hidden` as well as a
  collapsed height, so no invisible control stays in the tab order. The short-window media queries had to be
  ramped too: a fixed padding or headline clamp inside `@media (max-height: 840px)` pins the pitch on exactly
  the screens with the least room to spare.
- **It starts empty, and the empty state is worth judging.** The transcript says "No messages yet.", the
  panel's slots read "Not set", there are no gauges because nothing has been decided to count, "Answers owed
  0" is already inert, and Build in UEFN is disabled behind a status line that says what it is waiting for.
  The counts appear when the first question is answered, not at the top of the conversation: a progress bar
  before the first device is known is a progress bar for nothing.
- **And on load the box sits level with the panel.** The deck's height ramps 20rem -> 46rem along with
  everything else, and its empty end is measured rather than chosen: the panel is 323px tall and starts on
  the same line as the deck, so 20rem puts the composer's lower edge 3px inside the panel's foot, at
  1440x1000 and at 1440x780 alike. An empty transcript is not worth 576px of somebody's screen, and a box
  sitting in the middle of the page is what every other chat tool does before there is anything to read -
  the empty screen should look like a tool waiting, not like a page with a hole cut in it. The descent is
  the same animation seen from the other end: the composer's edge comes down 208px over the four inputs,
  which is the room the headline above handed over, no more.
- **A scripted walk-through runs on load, and it never presses Send.** Four lines type themselves into the
  box one character at a time with Send held down for the whole of it; then the strip waits, because pressing
  Send is the reviewer's move - that is the loop the screen is arguing for. When the reply lands it types the
  next line, and it stops for good the moment the reviewer sends anything of their own ("Demo stopped - the
  tool is yours") or presses Stop. After the fourth line the plan is complete and the key reads Run again,
  which puts the page back to the state it loaded in. No overlay and no modal: a demo a reviewer cannot
  escape is a demo that stops them trying the tool.
- **A finished count is not an affordance.** **Answers owed** wears the accent while answers are owed -
  blue means "there is something here for you" everywhere else on this page - and goes inert at zero: no
  accent, no dotted rule, no help cursor, no tooltip, no place in the tab order. The **Open questions**
  box leaves the panel entirely when nothing is owed, because it is the one dashed, provisional-looking
  thing in the panel and cannot also be the thing that says the plan is ready; the state chip, the two
  gauges, the lit Build in UEFN key and its status line say it, and a fifth statement in a box that still
  looks unfinished is a receipt. The panel drops from 667px to 436px when the box goes, which is what
  "the panel is the thing that goes to UEFN" should look like at the end.
- **Numbers are real, and the mockup shows them only where they are the point.** The stat strip a
  landing page would carry (13 researched game types, 74 drafts, 59 devices) is not on this page: the
  screen's job is the conversation and the panel, and a strip of totals between the pitch and the tool
  pushed the composer towards the fold. The rule that survives is the negative one - no invented number
  anywhere, and the panel's counts (5 of 6, 2 of 5) must be the ones the interactions actually produce.
- **The app-screen rule still holds**: no `<footer>`, one 44px mark in the 72px header, no root-relative
  paths, works at 400px with no horizontal scroll. A hero glow wider than the viewport (`120vw`) is the
  trap here: at 400px it pushes the layout viewport out with it and every fixed element moves with it.
  Use `min(880px, 100vw)`.

## Rules for each page

- One self-contained page: `public/concepts/<slug>/index.html`, CSS inline in a `<style>` block.
- Copy the kit above verbatim; add only page-specific rules under a clearly commented heading, and do
  not restyle the kit's classes.
- Numbers in `.mk` must match the `.note` numbers on that same page, and every marker in the canvas must
  have a note.
- Do not commit or push; the coordinating session reviews, verifies and commits.
- The local server serves `public/` with live reload, so the page is viewable at
  `http://forgeflavio.localhost:8650/concepts/<slug>/` (or `http://localhost:8080/...` from
  `npm start`). Check both widths before reporting back.
