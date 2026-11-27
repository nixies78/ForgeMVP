# Design-document export — three structures

The record of what was proposed for the exported game design document, why there are three of them,
and what the tool can and cannot honestly put in one.

Companion pieces:

- The mockup page type: `public/concepts/gdd-1-brief/`, `gdd-2-sprint-pack/`, `gdd-3-ledger/`, listed on
  `public/mockups/index.html` under **Design document**.
- The generator: `tools/gdds/` (see `tools/gdds/model.mjs` for the document model and `render.mjs` for
  the CLI).
- The tests: `tests/gdd.test.mjs`.
- The reference document this was measured against: `C:\Users\User\Downloads\Closing-Time-GDD.pdf`, the
  *Closing Time* GDD — 8 pages, A4, embedded Inter/VT323/Anton/SpecialElite.

---

## 1. Where this started

The question was whether the wizard's Summary view can export a PDF, what the limitations are, and
whether the user should see a preview before saving.

### Can it export a PDF? Yes — but not by printing a page

The obvious implementation is `window.print()` against a print stylesheet, or a headless browser
rendering the Summary screen to PDF. Both were attempted and both fail here:

- **Headless Chrome/Edge cannot run in this environment.** It dies at startup with
  `FATAL mojo\public\cpp\platform\platform_channel.cc:112] Check failed: . : Access is denied. (0x5)`.
  Chromium's multi-process IPC needs named pipes, which the sandbox denies. This is not a permissions
  prompt that a wider mode fixes — it is the sandbox boundary itself.
- **`window.print()` depends on the user's browser.** Page size, margins, headers and footers, and
  background graphics are all user settings. The output is not reproducible, and "Save as PDF" from a
  print dialog is a different document on every machine.

So the export was implemented as a **PDF writer in the repo**: `tools/gdds/pdf.mjs`, about 700 lines,
no dependencies, using `zlib.deflateSync` for content streams. It writes the file directly.

### The limitations, stated plainly

| Limitation | Why | What it costs |
|---|---|---|
| **Base-14 fonts only** | The repo ships `inter-latin-variable.woff2` and `archivo-black-latin.woff2`. Embedding a .woff2 in a PDF means decompressing it and building a TTF subset with a CID font and a ToUnicode CMap — a real subsetter. | The printed document is Helvetica/Times/Courier, not Forge's Inter. Every glyph is metrically correct; the brand face is the missing part. |
| **No images** | The generator has no image pipeline, and a device plan has no images to place. | No map, no reference board, no style frames. Those are `AUTHORED_SECTIONS` entries anyway. |
| **No hyperlinks or bookmarks** | The writer emits one content stream per page and a plain page tree. | A 9-page pack has no clickable contents. The contents list carries printed page numbers, which is the paper answer. |
| **Line-based text placement** | Every text run is `1 0 0 1 x y Tm` on its own line, one operator per line. | Content streams are larger than they need to be (a 9-page pack is 19 KB, so this is not a practical problem) — and it means the audit and the PNG painter can read a run's position by splitting lines, which is what makes independent verification cheap. |
| **Two-pass render for page totals** | A footer saying `3 / 9` needs the total, which is only known after the whole document is built. | Every structure renders twice. Deterministic and fast enough (the full set renders in well under a second), but it does mean the renderer must be pure. |
| **The preview is a proof, not a facsimile** | `tools/gdds/png.mjs` draws text with a monoline vector font (`tools/gdds/font.mjs`) while taking advances from the real font metrics. | Letterforms are simplified and a little heavier than the printed page — the stems are stroked slightly wider than Helvetica's real ones so that a stem has a solid middle rather than a soft grey edge. **Positions, line breaks and run lengths are exactly the printed ones**, which is what makes it usable for reviewing layout. It is not a substitute for opening the PDF. |

### Should there be a preview before saving?

**Yes, but not a picture of the PDF.** A rendered page image tells the user what they are about to get;
it does not let them change anything. The recommended shape is:

1. The wizard's Summary data already exists as a model. Export the *model*, not a screenshot.
2. Preview on screen by rendering that model with the app's own DOM and CSS, with a print stylesheet
   whose page geometry matches the PDF's (A4, and the same margins). Preview and export then read the
   same source and cannot disagree about content — only about typography, which is the one difference
   worth showing.
3. Offer the structure choice at the point of preview, since that is the only decision the user makes
   about the export, and all three render from identical data.
4. Generate the PDF on download, not on preview. A preview that already cost a render will show stale
   content the moment an answer changes.

A page image preview is still worth having as a **thumbnail in the structure picker** — which is exactly
what the three mockup pages now are.

### Other observations

- **The honest-document problem is the real design question, not the file format.** The questionnaire
  can support a pitch, a device plan and per-answer provenance. It cannot support art direction, level
  layout, audio, market or a build estimate. The reference GDD has all of those. A generator that fills
  them with plausible text produces a document that is confidently wrong, which is worse than one with
  visible gaps. All three structures here name those sections as outstanding instead.
- **The reference GDD is organised by *topic*, and topics are not a workflow.** Eight numbered chapters
  each a different kind of content is a good way to *read* a finished design and a poor way to *work*
  from one. That observation is what produced three structures instead of three layouts for one.
- **Two counts in the reference document are worth copying.** It has a build plan with time estimates
  and a sign-off block. Sign-off is cheap to add and turns a document into an artifact; time estimates
  are not derivable, which is why they appear as a named gap rather than a table.
- **Colour on paper is not colour on screen.** `public/css/tokens.css` values are tuned for a dark UI.
  The three palettes in `tools/gdds/kit.mjs` are the same hues darkened or lightened for ink, and are
  documented as such at the definition.

---

## 2. What was researched

| Source | What it contributed |
|---|---|
| indiegameacademy.com — GDD template | The conventional chapter list: overview, gameplay, mechanics, art, audio, monetisation, schedule. This is the shape the *Closing Time* GDD follows. |
| Epic — *How to Design a Game in Fortnite Creative* | Domain-specific advice: what a UEFN experience needs documented that a generic GDD does not (island settings, device wiring, publish requirements). |
| gamineai.com — *UEFN Lesson 2: Core Loop and Experience Pillars* | The core loop as a first-class artifact, and pillars as the thing a design is argued from. |
| Unity — one-page GDD guidance | The one-page case: "your first game should fit on one page." The direct argument for Structure A existing at all. |
| strayspark.studio — indie GDD template | A template aimed at solo/small teams rather than publishers, which is closer to this audience. |
| ziva.sh, generalistprogrammer.com (2026) | Current practice and tooling; confirms the split between pitch documents and production documents. |

The consistent finding: **practitioners do not write one document, they write two or three for different
readers**, and the conventional single GDD template is a compromise between them. That is the premise
of the three structures.

---

## 3. The three structures

They are not three visual styles for one document. They differ by **organising axis**, and each axis is
a different job:

| | **A — The Brief** | **B — The Sprint Pack** | **C — The Ledger** |
|---|---|---|---|
| **Organising axis** | Persuasion | Sequence | Provenance |
| **Length** | 1 page | 9 pages | 7 pages |
| **Reader** | A friend, a collaborator, past you in three weeks | You, on a Tuesday, four weeks in | Whoever has to defend the plan later |
| **Answers** | Should we? | How do I build it? | Says who? |
| **Ends with** | What the tool cannot tell you | What this pack does not cover | Open items and a verification sheet |
| **Weight** | 4 KB | 19 KB | 14 KB |
| **Palette** | Deep ink, `--fn-accent` red, sale-yellow | Teal, `--fn-teal` | Near-neutral, serif and mono |

### A — The Brief

One page. The pitch at 18pt under a dark masthead with the device count reversed out of it; three fact
cells built from the facts that exist; the core loop as a left-to-right rail with WIN and LOSE cards at
the end; a four-row build order; a layout-tip callout; and a closing block naming the six sections the
tool cannot write.

The single-page constraint is the feature. It forces one decision about what matters, and it makes the
document readable in the time a potential collaborator will actually give it.

**Fails at:** build detail, verifiability, and it dates badly — a persuasive page is written for a
decision that happens once.

### B — The Sprint Pack

Nine pages, organised in the order you work. Modules grouped by build phase in three columns; a
paginated ledger of all 36 settings with the catalogue's advice on the left and a tinted column wherever
an answer changed something; every answer and what it changed; the notes the device data records; the
five build steps and what each leaves behind; and a closing list of what the pack does not cover.

The tinted column is the load-bearing idea: it turns a 36-row wall into "these four are yours, the rest
are defaults."

**Fails at:** persuasion, and verifiability — it tells you what to do, not how to confirm it is coherent.

### C — The Ledger

Seven pages, serif and mono because a record reads differently from a pitch. One card per device
carrying the source that asked for it; a verification sheet of seven checks computed from the model; a
decision trace; and open items.

The verification sheet is the point. It is not a list of things to assert — it is seven counts the
document performs on itself, so a reader can open their island and confirm or refute each one. The
sample design yields `0 = 0` on "every setting an answer changed is listed in the decision trace",
because no answer in that sample changed a setting. That is reported rather than hidden, which is the
behaviour the whole structure is meant to demonstrate.

**Fails at:** being a first document, verbosity (provenance roughly doubles the length for the same
information), and it is only as honest as the model behind it.

---

## 4. The shared decision: honesty over completeness

This is the one non-negotiable in the set, and it is why all three structures end the same way.

`tools/gdds/model.mjs` exports `AUTHORED_SECTIONS`:

```
art_style      Art style and inspirations      needs a reference library tagged by style
type_colour    Type and colour in use          needs a palette and font set per style
level_design   Level design and pacing         the tool has a layout tip, not a map
audio          Audio direction                 needs a per-type cue list
market         Market and audience             needs trend data and the creator's monetisation
build_estimate Build time and cost             needs a per-device, per-question time cost
```

Every structure renders these as **missing**, and a test asserts that no row carries a `value`:
`every section the tool cannot write is declared, and none is invented`.

A document that claims to know your art direction after four device questions is not one you would
trust with the four answers it did get.

---

## 5. How it is built

```
tools/gdds/
  pdf.mjs             the writer: metrics, wrapping, page context, buildPdf
  kit.mjs             page geometry, three palettes, footer, missing-sections block, table
  model.mjs           the document model: resolved plan -> everything the document can say
  font.mjs            a monoline vector font, for the preview only — never in the PDF
  structures/
    brief.mjs         1 page
    sprint.mjs        9 pages
    ledger.mjs        7 pages
  validate.mjs        independent PDF validator, and plain-text extraction
  audit.mjs           geometric audit of the finished bytes
  png.mjs             interprets the writer's dialect and rasterises a page
  render.mjs          CLI: writes the PDFs
  preview.mjs         CLI: audit + PNG previews
```

```
node tools/gdds/render.mjs                 # all three
node tools/gdds/render.mjs sprint          # one
node tools/gdds/preview.mjs --pages 1,2    # audit + PNGs
```

### The writer's contract

- Content is placed **from the top-left**. One flip to PDF's bottom-left space happens inside
  `makePageContext`; nothing else needs to think about it.
- **One operator per line, absolute `Tm`.** This is a deliberate cost that makes verification cheap:
  both the audit and the PNG painter recover a line's position by splitting the stream on newlines.
- **Every text run restates the whole of `Tf`, `rg` and `Tc`.** Text state is inherited, and a run that
  omits `Tc` inherits the previous run's tracking. This produced the bug described below.
- **Every block declares its height.** `para({ maxHeight })` drops excess lines at a line boundary and
  records an overflow; it never silently crops.
- **`buildPdf` reports `{ overflow, notes }`.** `overflow` fails the build. `notes` are repairs — a
  `text()` call that needed two lines — that came out correct and are worth telling the author about.

### The verification story

`audit.mjs` decodes the finished PDF and reconstructs each run's box, then checks the left and right
margins, the top and bottom, the footer band, text overlap, and whether a page is nearly empty. It is
deliberately a separate reader from the writer: a structure measuring its own text is checking its
arithmetic against itself.

Its tolerance is 1pt and nothing else — an allowance for the same unknown counted twice is just a bigger
allowance.

> **Known gap.** `audit.mjs` gets its type metrics from the writer's `measure` through
> `useMetrics(measure)`, because the writer uses base-14 fonts, which carry no `/Widths` array to read
> back. So the audit's *placement logic* is independent but its *font metrics* are not. Closing this
> means embedding the Adobe standard base-14 tables in `audit.mjs` and asserting them equal to the
> writer's tables in a test — a guarded second source of truth rather than a silent one. Not done yet;
> recorded here rather than left implicit.
>
> This gap has now cost something concrete, which is the argument for closing it. `measure` answered
> **556 and 1000** for the em dash depending on whether it was handed the character or the byte, and the
> audit could not see the inconsistency because it was asking the same function both questions. It
> reported the five overlaps the inconsistency produced and none of the cause. A test asserting the two
> readings are equal is now in place (`measure is idempotent under toWinAnsi`), which is the cheap half
> of the fix; the expensive half is the independent table, and it is still worth doing.

### The page-boundary check, and why it was dead

`buildPdf` has always ended with a check that a page did not run past its bottom margin. It tested
`typeof ctx.pageNo === 'number'`, and `pageNo` was `page.name` — which every page in all three
structures sets to a string (`'A'`, `'The modules'`). The condition was never true, so **the check never
ran on any page of any structure**. It was a guard whose name promised something its body did not do.

Fixing it meant the check immediately fired: every page of all three documents reported running 4.9pt
past the bottom margin. That was not a layout bug — it was the check measuring against `CONTENT_BOTTOM`
(where body copy stops) while the footer legitimately sits *below* that line. The fix is two distinct
edges rather than one: `CONTENT_BOTTOM` for body copy, `PAGE_LIMIT` (the bottom of the footer band) for
what the writer enforces. Both now pass for real.

---

## 6. Bugs found, and what they were

Recorded because each one is a shape worth recognising again.

| Bug | Symptom | Cause |
|---|---|---|
| **Alignment silently discarded** | Right-aligned runs drew left-aligned. `runWidth` and the aligned position both computed correctly, and `drawX` came out equal to `x`. | `drawX = Math.max(x, start)`. For any right-aligned run narrower than its box — all of them — the aligned position lies *left* of `x`, so the clamp returned `x` and threw the alignment away. It read like a safety net. |
| **Sticky `Tc`** | Runs reported as 60–150pt past the right margin while the structures' own overflow checks reported nothing wrong. | The writer emitted `Tc` only when non-zero, and `Tc` is text state. An untracked paragraph after a tracked label was drawn with the label's tracking. The layout *had* measured correctly. |
| **Inverted edge semantics** | Every footer page number 41pt past the margin. | With no `maxWidth`, the edge was `x + (width - x)` — which is just `width`, the paper. The call looked right and the one argument it passed meant the opposite of what was intended. |
| **Box measured, then overrun** | A 200pt caption in a 239pt box was measured as one line and drawn past the margin. | `text()` had no wrapping. A caller that names a bounded box is asking for text inside it, so `text()` now wraps when given a box and the run does not fit, and logs a note. |
| **Wrong width used for a measurement** | A ledger row's setting name was laid out as one line and wrapped into two when drawn. | The name was measured against the description column's width. Measured in its own box now, and the row's height accounts for it. |
| **Off-by-one in the validator** | A valid file reported xref mismatches. | Object *n*'s xref row is `lines[2 + n]`, not `lines[1 + n]`. |
| **Unanchored audit regex** | 800pt "right margin breaches" for text that was on the page. | `0.1 0.14 0.18 rg` matched as a `Td`. Fixed by parsing line-by-line with anchored patterns — which is why the writer emits one operator per line. |
| **Double-encoded UTF-8** | Em dashes and arrows mangled across three files. | PowerShell `Get-Content -Raw` + `Set-Content -Encoding UTF8`. Never edit these files that way; use the editor tools or `[System.IO.File]` with an explicit `UTF8Encoding($false)`. |
| **Dead boundary check** | A guard that could never fire. | Tested the page *name* for being a number. See above. |
| **Unreadable preview text** | Every glyph drew as a blobby box; the page had to be zoomed 3× to see that the letters were not letters. | The 5×7 bitmap font's rows ran top-down while the drawing code treated row 0 as the top of the ascent, so each glyph's shapes landed in the wrong half of the em — a lowercase `a` came out as an `o`-like box. Replaced with a monoline vector font on the text space's own axes, where there is no convention to invert. |
| **Dashes drawn as missing-glyph boxes** | The commonest punctuation in these documents showed as a `▯`. | WinAnsi encodes an em dash as byte `0x13`, not `U+2014`, so after the writer's encoding pass the rasteriser was handed `\u0013` — a code point the font had no entry for. The glyphs were keyed on the Unicode character, which is not what reaches the renderer. |
| **Stroke breaking into dashes** | Text read as dotted lines at 6–9pt. | The canvas drew lines with integer Bresenham and a square brush, so nothing could be stroked thinner than a pixel and a rounded brush left gaps in the stems. Replaced with distance-to-segment coverage and anti-aliased blending. |
| **Page images scaled to illegibility** | The mockup pages were right and the previews were right; the text was unreadable anyway. | Three pages were laid out side by side, scaling a 1191px page into ~260px. A design document is read one page at a time, so the mockup pages now show one per row at 900px with a link to the full-size PNG. |
| **A dash written as a control character** | The commonest punctuation in the document printed as a stray glyph, and text extraction returned commas in its place. | `toWinAnsi` passed the dashes through as `U+2014` and `U+2013`. Those are two code points, and `pdfString`'s output is written to the file with a `latin1` write, so each was truncated to the **last byte of its UTF-8 sequence** — an en dash became byte `0x13`, which is why the extracted text read `2\u00134` instead of `2–4`. A valid PDF with text in it, so nothing failed. Fixed by mapping the dashes to their WinAnsi code points (`0x96`, `0x97`) like every other special character, and asserted as "the writer never emits a code point a latin1 string cannot carry". |
| **`measure` was not idempotent under `toWinAnsi`** | The cover of the Sprint Pack drew a two-line paragraph as two lines with the second printed twice, 1pt apart; four more paragraphs in the Sprint Pack and one in the Ledger did the same. The audit reported five text overlaps. | The expensive one. The writer works in two string spaces: `wrap` and the layouts pass characters, `text()` measures the WinAnsi it is about to write. An em dash measured **556 units** as `U+2014` and **1000** as the byte `0x97`, so a line `wrap` fitted into a 459.28pt box measured 3.5pt wider when `text` measured it again — and since it no longer fitted, `text` re-wrapped a line that had already been wrapped. Because `para` hands each line to `text` with the box as its right edge, the third line landed at the same `y` as the second. Fixed by giving both spellings one width in `SPECIAL_WIDTHS`; the tables only covered codes 32–255, so anything outside Latin-1 was silently taking the `?` fallback. **Nothing about the layout was wrong**, which is why reading the layout code for an hour found nothing. |
| **A callout whose box was the wrong height** | The cover's caveat wrapped to three lines into a box sized for two. | A fixed 42pt box and `maxHeight: 22` agreed with each other and not with the text, whose length depends on the game type's name. The box is now sized from `blockHeight` of the paragraph, so the two numbers cannot disagree. |
| **Every page rendered on black paper** | The previews were dark with faint light lettering, reported twice as "the previews are black". The PDFs were correct throughout. | `Canvas` took its background as 0..255 while scaling it as though it were 0..1 — the same unit as a PDF `rg` operator, which is what the painter passes for every other colour. White arrived as `255 * 255 = 65025`, and a `Buffer` **truncates rather than clamping**, so byte `1` was stored. The paper was `rgb(1,1,1)`. Nothing failed, because a very dark grey is a valid raster, and **no test looked at a single pixel** — the "page is not blank" check counted every pixel as ink, so it was passing for the wrong reason. One unit for the module now, asserted by a test that reads a corner pixel. |
| **Rounded rectangles drawn hollow** | The brief's loop-entry box came out as a white panel with a thin dark border, so "Spawn In" was invisible against the paper it was supposed to sit on. It read as a deliberate design choice, which is why it survived a review. | `paintPath` only ever *filled* a bare `re`. A `roundRect` is four lines and four cubic arcs, so it took the `stroke || fill` branch and stroked its outline in the fill colour at the default line width. There is now a `fillPolygon` — winding by crossing count, anti-aliased per scanline — and the path is flattened once for the filler and the stroker so a shape's outline and its interior cannot disagree. |
| **The footer said how many pages there were, wrongly** | Every page of the nine-page Sprint Pack read "2 / 0" — and "1 / 0" on the cover. | `renderSprint` received `total` from the renderer's second pass and then shadowed it with `const total = sequence.length`, the number of rows in the cover's contents table. `sequence.length` is not referenced anywhere else in the file: it existed only to be wrong. The footer took 0 as its total and printed it. |
| **Text that never reached full ink** | Reported as "still seems low res on preview" after every other fault was fixed. The strokes were soft grey with no solid core. | A 7.4pt run was stroked at `size * 0.062` — 0.46pt, under half a pixel of coverage — so no stem ever reached full weight and the page read as though the raster were at half the resolution it was. The stem ratios are now a little above Helvetica's real ones, because the target is a stem with a solid middle at the size the text is set, not a metric. |

The through-line: **the failures that took longest were the ones where the code read as correct** — a
clamp that looked defensive, a guard that looked like it ran, an operator that looked per-run, a metric
table that looked complete, a font whose comment said "deliberate limitation" where the truth was
"inverted axis". Every one of them was caught by looking at the output rather than the source — reading
the finished bytes, or in the font's case by zooming into the rendered page — which is the argument for
the audit and the preview existing at all.

Two of them were found only because a *different* bug was fixed and the output changed. The dash encoding
exposed the metric gap, and the metric gap exposed the callout's fixed height. That is worth recording on
its own: a generator with no independent reader of its output would have shipped all three, and the
second one was invisible until the first was fixed.

The black-paper bug is the sharpest lesson in this list, and it is not about arithmetic. The preview
existed *because* nothing else could check the layout, it was looked at repeatedly, and it still took
three reports of "the previews are black" to find a unit mismatch in a constructor — because the report
was read as a rendering symptom rather than as a measurement, and because the one test that touched the
raster asked a question ("is the page blank?") that near-black paper answers with a confident yes. A
dark background makes the ink/dark count *larger*, so the test got **more** reassuring as the bug got
worse. When a check has a wrong assumption about the background baked into it, fixing the background
looks like a regression, which is exactly what happened: repairing the paper dropped the measured ink
from 6.3% to 0.23% and turned a passing test red.

The rounded-rectangle bug is the second lesson: two faults in the same render hid each other. The box
was not filled, and the text inside it was white on white, so there was nothing to see where something
should be — the absence looked like a margin.

---

## 7. Open questions

- **A second sample design.** The current sample has zero answers that change a setting, so the Ledger's
  tinted "CHANGED" path and the Brief's decision rows never render. A design using
  `combat_elimination_deathmatch` with `team_mode=teams`, `loadout=fixed`, `respawns=out` and
  `zone=shrinking` would exercise that path and is the single change that would most improve the
  demonstration.
- **Audit metrics independence.** See the known gap above.
- **Which structure does the product ship?** The recommendation is not one: offer the choice, defaulting
  to the Brief, with the Sprint Pack behind "I am ready to build" — because the reader changes, and the
  wrong document for the reader is worse than no document.
- **Where does the export live?** The Summary view is where the data is complete, which makes it the
  natural place. But the Brief is most useful *before* the plan is finished, which argues for offering it
  from the wizard at any point with the sections still empty.
- **Does the plan need a real time estimate?** It is currently a named gap. Producing one means a
  per-device and per-question cost model, which is a data question rather than a layout one.
