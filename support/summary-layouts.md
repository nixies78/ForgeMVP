# The summary page's two layouts

The summary screen (`#/summary`, the last step of the questionnaire) has two designs at once, and a
switcher at the top of the page to move between them.

This note says what they are, because the switch is temporary and the losing layout is meant to be
deleted — and a deliberate duplicate that nobody wrote down is how a codebase ends up with two of
everything forever.

## The two layouts

| | **Classic** | **New** |
|---|---|---|
| The page opens with | "Here is your game." | "Here is your game.", then the **pitch card** |
| The pitch | not shown | the game's own one-liner, built from the game type, the brand and the answers |
| Name / Save / Share | a "Keep it" panel at the bottom, under the device plan | inside the pitch card, at the top |
| The core loop | diagram full width, "In words" underneath | "In words" in a 260px left column, diagram on the right |
| Everything else | identical | identical |

Classic is what shipped. It is unchanged, and it is the default: a session that has never touched the
switcher — including every existing browser and every shared link — sees exactly the page it saw
before. The redesign is opt-in.

The **arrows in the core-loop diagram are heavier on both layouts**. That was a fault in the drawing
rather than part of the redesign: the 2px lines and 7×5 heads read as hairlines once the SVG scaled
into the column. The numbers live at the top of `public/js/guide/render/loop.js`.

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

## How the switch works

- The choice is stored in this browser under `forge.guide.summaryLayout` (see `store.js`).
- `?layout=new` or `?layout=classic` in the address bar **wins over the stored choice**, so the two
  designs can be opened side by side in two tabs. Switching updates the address bar to match, so the
  URL and the page never disagree.
- The switcher is on both layouts, or there would be no way back.

## Retiring it

When the decision is made, delete the loser:

1. `public/js/guide/render/summary-classic.js` **or** `render/summary-new.js` — one line in
   `screens/summary.js`.
2. The `layoutSwitcher()` function at the bottom of `screens/summary.js`, and the `.g-layoutswitch*`
   rules in `css/guide.css`.
3. `summaryLayout` from `state.js`, `getSummaryLayout`/`setSummaryLayout` and `SUMMARY_LAYOUT_KEY` from
   `store.js`, the `?layout=` block and the `setSummaryLayout` action in `app.js`, the `layout*` strings
   in `content.js`, and the layout test in `tests/guide.test.mjs`.

Whatever is left of `render/summary-parts.js` — the plan panel, the recap, the save controls, the
legend, the Back row — is shared by both, so it stays either way.
