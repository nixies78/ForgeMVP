# Directions we have not used yet

A place to keep the design directions that were proposed and deferred, so the next mockup session does
not have to invent a slate from scratch. Each one is a style *and* a subject: the subject matters as much
as the palette, because a mockup only earns its keep when the styling does something for the page rather
than sitting on top of it.

## The question page, in two groups

**Group one - material studies (Q3, Q4, Q5).** These change what the page appears to be made of: hardware,
drafting paper, printed paper. They are the furthest from Epic's own styling, and were read as off-brand
for a screen that has to ship; they are kept because the material is the point of a comparison, and because
two of them contributed ideas the on-brand set then used - the latched answer with its own lamp, and a state
written on the option itself rather than implied.

**Group two - on-brand options (Q6 to Q9).** Four *structures* inside Epic's own system, all dark, all drawn
from measured values rather than from a reading of the brand:

- **Q6 Launcher** - hero and card grid, in the language of launcher.epicgames.com.
- **Q7 Store** - filter row, then a two-up product grid whose cards carry a real metadata row.
- **Q8 Guide** - a step rail carrying the progress, answers as radio rows. The most app-like.
- **Q9 Console** - a spec table with monospace indices and state chips. The most tool-like.

Their evidence is `support/library-data/launcher-epicgames-com.json` - scraped the same way as the other
three sites, and now listed in `support/library-data/index.json` - together with the values already curated
in `support/library.html`: what Epic's pages publish as `--color-background-elevated-high-select: #28282c`,
`--color-text-select-default: #26bbff`, `--color-border-focus: #fff`,
`--color-fill-secondary-default/-hover: #ffffff26/#ffffff59`, `--color-fill-primary-default: #26bbff`, and
the status colours `--color-text-success: #45c761` and `--color-text-warning: #ffc229`.

One rule from the library that group two follows on purpose: **nothing moves on hover or on selection.**
Epic changes a fill and lightens a border; it does not lift, scale or translate an element. Selection is
carried by the fill, a select-coloured border and a marked control - which is also what keeps a chosen card
from resizing the grid row it sits in.

## Proposed, and since built (2026-11-20)

The three below were proposed here and have now been built, as the three lighter designs on the question
page (see `public/concepts/questions-3-cassette-deck/`, `-4-blueprint/`, `-5-riso-zine/`). They are kept
in this file because the *reason* each one was proposed is still the reason it earns its place in the set:
a material changes what the page appears to be made of, which is what makes a comparison worth reading.
One deliberate departure is recorded against the blueprint, where the recorded direction and the brief for
that slot disagreed.

**Cassette deck - 90s hi-fi hardware.** Warm grey plastic, chunky bevels and a hairline of chrome,
tiny dark LCD windows with segmented-looking numerals, a transport row (PLAY / ROLL / REC), printed
knobs and a serial-number plate. The machine is the deck; the page around it reads like the product
manual: specifications table, a numbered parts diagram, a "care and handling" note where the
how-it-works steps go. Good for a randomiser or an editor screen, where real hardware controls are
the thing being borrowed. Worth it because everything else in the set is flat and typographic -
this one is physical. *Built as the question page: the display well carries the step and the counter,
the level meter carries the progress, and the answers are keys that latch down with a lamp each.*

**Blueprint - technical drawing.** Deep blue graph paper with a fine grid, white and cyan ink, no
fills at all. Dimension lines with arrowheads at both ends, leader lines with callouts, a title block
in the bottom-right corner, tolerances and notes in a corner. The three reels become gauges with
measured scales; the pitch is annotated as a specification; the buttons are stamped plates
(`RUN`, `RESET`). Best on a page where accuracy is the promise - a plan, a device list, a build sheet.
*Built as the question page, on white drafting stock rather than the deep blue sheet: this slot in the
set exists to move away from the dark styling, so the deep blue is quoted once, in the title block,
and the drawing itself is blue ink on white. Same material, the sheet turned over.*

**Riso zine - printed by hand.** Two overprinted inks (riso pink and riso blue) on off-white, with the
multiply blend where they cross, a visible paper grain and a slight misregistration. Cut-paper strips
for the reels, taped-on captions, photocopied halftones, a hand-numbered edition line. The natural
home is a page aimed at young creators rather than a tool page: a landing page, a creator profile, a
"what you could make" gallery. *Built as the question page: the answers are the cut-paper strips, the
progress is an ink bar, and the folio number and edition line carry the two steps.*

**Broadcast scoreboard** - *used for Randomiser 3.* Kept here as a record of the shape the set has
already taken, not as an option.

## Directions already in the set

Landing pages: 1 Cinematic Launch, 2 Sticker Pop, 3 Choose Your Mode (game lobby), 4 The Pitch
(editorial), 5 Creator Bento, 6 One Question, 7 Three Steps, 8 Quiet Power (lime, and its blue +
indigo sibling), 9 Spotlight.

Question pages: Q1 Default (the app's current screen, the baseline), Q2 Quiet Power (blue + indigo, the dark
reference), Q3 Cassette Deck, Q4 Blueprint, Q5 Riso Zine (the three material studies), Q6 Launcher, Q7 Store,
Q8 Guide, Q9 Console (the four on-brand options).

Randomiser: R1 Fruit Machine (amber), R2 Quiet Power (blue + indigo), R2b Quiet Power as one widget,
R3 Broadcast scoreboard, R4 Neon Arcade, R5 Terminal (tool only), R6 Editorial (light, wheel reels),
R6b Editorial with the wheel on its side.

## What "different" has to mean

The set already covers dark restraint, arcade colour, neon glow, mono terminal, light editorial and
sports broadcast. A new direction is only worth building if it changes the *material* - the thing the
page appears to be made of - rather than recolouring a layout we already have. Hardware, paper and
drafting were the three materials the set had not touched; the question page has now used all three,
so the next direction has to find a fourth rather than a fourth way of printing the same sheet.
