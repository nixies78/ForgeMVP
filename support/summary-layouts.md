# The summary page's two layouts

The summary screen (`#/summary`, the last step of the questionnaire) has two designs at once, and a
comparison bar across the top of the window to move between them.

This note says what they are, because the comparison is temporary and the losing layout is meant to be
deleted — and a deliberate duplicate that nobody wrote down is how a codebase ends up with two of
everything forever.

## The two layouts

| | **Classic** | **New** |
|---|---|---|
| The top block | a title, a lead, then everything below | one band: title, pitch and specs on the left, the name/save/share rail on the right |
| The pitch | not shown | the game's own one-liner, built from the game type, the brand and the answers |
| Name / Save / Share | a "Keep it" panel at the bottom, under the device plan | a rail beside the pitch, at the top |
| The core loop | diagram full width, "In words" underneath | "In words" in a 260px left column, diagram on the right |
| Height of the top block | 114px — it carries almost nothing | about 272px |
| Everything else | identical | identical |

Classic is what shipped. It is unchanged, and it is the default: a session that has never touched the
comparison bar — including every existing browser and every shared link — sees exactly the page it saw
before. The redesign is opt-in.

The **arrows in the core-loop diagram are heavier on both layouts**. That was a fault in the drawing
rather than part of the redesign: the 2px lines and 7×5 heads read as hairlines once the SVG scaled
into the column. The numbers live at the top of `public/js/guide/render/loop.js`.

## Why the header is a band and not a card

The redesign first shipped as a card, and the owner's verdict was that "the top part is still way too
bulky". It was: **698px**, which put the core loop at **1113px** — below the fold on every laptop, so
the drawing the page exists to show was something you had to scroll to find.

The card stacked twelve rows, and three of them said the same thing about the same game: the sentence
already carries the type and the hook, and then the type's description and the hook's description each
got a row of their own. Six ways to make it smaller, measured in a real browser at 1440×1000, are in
`.scratch/summary-mocks/` (throwaway, not committed); the one that shipped is the split band at 272px.

What it does differently:

1. **One statement.** The sentence is the page's headline, and the screen's own title is sized down to a
   label above it rather than being a second headline competing with it.
2. **One decoding line.** `Type · Category · Brand — what it is`, with the hook's description riding at
   the end of it, instead of one row per fact.
3. **A rail, not a stack.** Reading order and doing order are different orders, and a stack has to pick
   one of them: sentence first and the controls are four rows down, controls first and the page opens
   with a text box instead of with the game. Side by side, both are true at once — the eye starts on the
   sentence, the hand finds the buttons at the same height.
4. **The name field, Save and the share link** are one row under Start Building, which is full width
   because it is what the page is for and because it is the control gated on the name.

## Where the pitch comes from

`public/js/guide/pitch.js`.

The randomiser page (`public/concepts/randomiser-*`) prints a result as:

> A Box Fight, set in the world of Star Wars. So fast you barely think.

— a game type, a brand and a hook, all three drawn from `public/data/randomiser.json`. The guide's own
data file has none of that: a game type is a label, a description, a device list, some questions and a
core loop, and no voice at all. So:

1. **The type** comes from the data. `TYPE_VOICE` overrides the name where the list heading does not
   read as a sentence ("Box Fights" → "A Box Fight").
2. **The brand** is the middle clause, which is the rule the randomiser's own file names
   (`"Brands use \"set in the world of {brand}\""`). An unbranded game drops the clause rather than
   saying "set in the world of Original".
3. **The hook and the facts row** are written by hand, for the **13 researched game types only** —
   the ones that ask questions and get a tailored plan, so the ones anyone can actually arrive at with
   a game worth pitching. The hook names are the owner's own vocabulary from the randomiser's hook
   list; the example titles that file appends to each description belong to the reels and are dropped.

The other 84 game types (74 drafts and the 10 "just give me the basics" entries) get no invented
voice. A draft reads as its own description; a basics entry is described rather than named, because
"A Just give me the basics" is not a sentence. `tests/guide.test.mjs` holds all of this.

## The comparison bar

It is deliberately not built like the rest of the app, and each of those decisions is load-bearing:

- **Fixed across the very top of the window, above the site header** (z-index 60 against the header's
  50). A comparison tool that pushes the product down the page has become part of the layout. It is
  exactly 72px tall — the header's own height — so an open bar covers the whole header rather than
  leaving a sliver of it showing underneath, which read as a rendering fault.
- **A colour from outside the palette** (`--fn-compare` in `tokens.css`). Every other surface in the
  guide is the library's, so a bar that is not reads as an instrument over the page. Magenta, because
  the palette already owns blue (actions), indigo (the ramp) and yellow (warning). One test pins that
  the bar is the *only* thing that consumes it: the moment a second component does, the exception stops
  meaning anything and becomes a second accent.
- **It rolls up.** Rolling it up leaves a tab in the window's gutter — top-left on a desktop, bottom-left
  under 700px where the gutter is too narrow to clear the logo — and the header is whole again. The
  state is remembered, so that is decided once.
- **It carries its own explanation**, so switching layouts lays out **no notice**. The bar is on screen
  whenever the summary is, so a notice was the same sentence a second time, sitting in the page's own
  content where it competed with the pitch for the first thing the eye lands on.
- **Its controls state their own colours**, and hover changes only colour and border — never a fill.
  A hover that paints has to paint one of the palette's three documented hover fills, and this bar is
  not the palette's.
- **It is on the summary screen only.** Everywhere else in the guide there is nothing to compare.

`?layout=new` and `?layout=classic` in the query string **win over the stored choice**, so the two
designs can be opened side by side in two tabs. Switching updates the address bar to match, so the URL
and the page can never disagree. The "Copy a link to this plan" button deliberately does **not** carry
`layout`: the layout is a local comparison tool, not part of the plan.

## Retiring it

When the decision is made, delete the loser:

1. `public/js/guide/render/summary-classic.js` **or** `render/summary-new.js` — one line in
   `screens/summary.js`.
2. `compareBar()` at the foot of `screens/summary.js`, the `.g-compare*` rules in `css/guide.css`, and
   `--fn-compare` / `--fn-compare-ink` from `tokens.css`.
3. `summaryLayout` and `summaryBarOpen` from `state.js`; `getSummaryLayout`, `setSummaryLayout`,
   `getSummaryBarOpen`, `setSummaryBarOpen` and their two keys from `store.js`; the `?layout=` block and
   the `setSummaryLayout` / `setSummaryBar` actions in `app.js`; the `compare*` strings in `content.js`;
   and the three tests that name them in `tests/guide.test.mjs`.

Whatever is left of `render/summary-parts.js` — the plan panel, the recap, the save controls the classic
layout uses, the legend, the Back row — is shared, so it stays either way.
