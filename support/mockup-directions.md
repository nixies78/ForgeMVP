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

AI chat: C1 Launchpad (prompts and theme chips above the box - the owner's own suggestion, drawn),
C2 Workbench (conversation and a live design panel side by side), C3 Interview (the AI speaks first and
the answers are taps). These three are **wireframes**, not mockups: they share one greyscale notation and
answer a structural question - where the affordances sit and what the conversation produces - because the
chat page's problem is not its palette. The brief is `support/chat-wireframes-brief.md`.

AI chat, in colour: C2b Workbench (Quiet Power) - the first full mockup of a chat direction. Workbench's
structure, given a material: Concept 8's dark page (hairlines, Inter Tight, blue action, indigo detail),
with Randomiser 2c's moulding spent on exactly two objects - the composer under the conversation and the
design panel beside it. It is a working screen rather than a picture of one - answering an open question
in the panel writes it into the transcript, ticks its build step, decides its device and unlocks Build in
UEFN - because the direction's whole claim (one workspace, not two windows) can only be judged in motion.

C2b was then revised against that claim, and the revision is the interesting part. The case came off: with
both bays inside one moulded box the chat read as a window inside a panel inside a page, so the transcript
now sits on the page, only the composer is moulded, and the page's own flat pill is what sends. The
composer's box starts one line tall and grows with the typing; the note that used to sit under it became a
tooltip on **Answers owed**; the panel stopped being a grid column of equal height (it was setting the
conversation's height and pushing the composer past the fold) and became a sticky readout with Devices and
Build steps folded behind a summary that keeps their gauges visible. Three things were only found by
measuring rather than looking: a gradient surface read as lighter than its recess until the pixels were
sampled, the composer's bottom landed 20px past the fold at a laptop height, and the transcript opened on
the oldest turn rather than the newest because Inter loads after the first layout.

A later pass answered a different complaint - the tool was accurate but cramped, and too much of the screen
was scaffolding rather than work. The page now changes job on the user's first message: the hero gives up
208px (h1 to one line, lede gone), the "Conversation (n messages)" label and the quick picks retire, and
the height goes to the transcript, which more than doubles at laptop height. On load nothing moves, and the
trigger is the first message rather than a scroll position, so the pitch is never cut short mid-read and
the state cannot stick half-applied. Two smaller corrections came with it, both of them the same mistake in
different clothes: a control that reports work owed was wearing the accent when the work was *finished*
(now blue while answers are owed, inert at zero, with no tooltip and no tab stop), and the Open questions
box stayed on screen after the questions were answered - the one dashed, provisional-looking element in the
panel, saying the plan was ready. It now leaves when nothing is owed, and the panel drops from 667px to
436px, which is what the finished state should look like. The same pass found that the listening
microphone's hover went black: the grey key's hover rule tied with the pressed state on specificity and was
written later in the file, so a red key turned grey under the pointer it was reached for with.

The pass after that was about time rather than layout. The page now opens with nothing in the conversation -
"No messages yet.", "Not set" in the panel, no gauges to show, "Answers owed 0" already inert - because a
tool's unused state is part of what a reviewer is judging, and because the owner asked to see it. The hero no
longer changes job in one cut on the first message: the resize became one interpolated number, `--engage` =
`min(1, turns / 8)`, carrying the headline, the intro's padding, the lede's opacity and the deck's height
from the full two-line pitch to the one-line compact state across the first four inputs and their four
replies. The first version divided by four and the checker caught it in the numbers - two inputs finished the
ramp, which is not "the heading resizes as the chat grows, input by input". The short-window media queries
had to be ramped too, or a fixed padding and headline clamp inside them pinned the pitch on exactly the
screens with the least room. A scripted walk-through then types four user lines into the box a character at a
time with Send held down for the whole of it, waits for the reviewer to press it, and steps aside the moment
they send something of their own; the four lines are the very answers the panel's questions accept, so the
walk-through and the panel are one conversation and the plan is complete when the script runs out. No
overlay: the owner wanted the walk-through, not an explanation of it. The panel itself stopped being
maintained and started being recomputed - one flag per answered question, one `render()` that works out the
whole panel - so answering in any order, from either bay, cannot leave the two sides disagreeing; and the tap
chips inside an old message go inert once their question has been settled anywhere else, because a settled
question is not a question. The owner then had one more look at the empty state and said what a reviewer's
eye says: the box should not start at the foot of a tall empty column, because every other chat tool puts it
in the middle of the page before there is anything to read. So the deck's own height ramps with everything
else, 20rem to 46rem, and its empty end is a measurement rather than a taste: the panel is 323px tall and
starts on the same line, so 20rem lands the composer's lower edge 3px inside the panel's foot at both window
heights. The box then comes down 208px over the four inputs, which is exactly the room the headline above
gives up - the descent is the same animation seen from the other end.

## What the chat set deliberately does not settle

The three chat wireframes are the first entry in the set that is about a *mechanism* rather than a
material, and the first that reads as an app screen rather than a pitch page: no art, no brand gradients,
no footer, one accent colour, and every block of copy is real. C2b then took one of the three structures
and gave it a material, which is the order the set wants: structure first, material second. What is still
open for the chat page is a material for C1 or C3 (a launcher's surface for Launchpad, something card-like
for Interview), a full mockup of the phone state of any of them, and any decision at all about what the
conversation does *after* the plan exists - refine, rebuild or fork. What must not happen is a fourth
structure that is really one of these three with the shelf moved.

Two things C2b raised were waiting on the owner rather than on work, and one of them has since been built:

- **What an Answer key should actually do.** Today it is a one-click transaction: the panel writes the
  user's answer *and* the bot's reply into the transcript in the same move, which is what makes the loop
  visible in a single click for review. The owner's reading is that this is wrong - pressing Answer should
  move the question *into the chat*, with the bot asking it and the user answering (a canned answer while
  there is no model), because a panel that does the user's talking is the one thing this direction claims
  not to be. Nothing has been changed in that direction: the misfire that let a click on the question text
  answer it was a plain defect and was fixed, and the shape of the flow is untouched until it is decided.
  What did change underneath it is that the panel now records that a question was answered and recomputes
  itself instead of being patched, so moving a question's home from the panel into the chat is a small
  change rather than a rewrite when the owner decides.
  Two shapes are on the table - Answer moves the question into the chat and the canned answer sends itself
  after a beat, or it moves the question in and pre-fills the composer with the canned answer, unsent, and
  the reviewer presses Send (the second reuses the rule the quick picks already follow). Either way the
  panel's "owed" count and the question waiting in the transcript have to become one fact rather than two,
  and free text arriving where the mockup expects one of N options needs a matcher - which the real data
  makes natural, since `public/data/uefn_device_logic.json` already gives each question an id, a prompt and
  options carrying their effects.
- **The guided demo is built, minus the pop-up, and one question inside it is still open.** It went in
  exactly as asked except for the overlay that was going to lock the tool until the reviewer started: the
  page loads on the empty state instead, the demo types its canned lines with Send dead until the typing
  stops and never presses Send itself, and the loop ends when the script runs out - with Run again to see it
  twice and Stop to take the tool back. What is still open is where the questions come from: the three here
  are hardcoded, while `public/data/uefn_device_logic.json` already gives each of the 13 researched game
  types its own question list, and starting the walk-through from that real data would make the panel's
  numbers real in the same move the rest of the page already is.

## What "different" has to mean

The set already covers dark restraint, arcade colour, neon glow, mono terminal, light editorial and
sports broadcast. A new direction is only worth building if it changes the *material* - the thing the
page appears to be made of - rather than recolouring a layout we already have. Hardware, paper and
drafting were the three materials the set had not touched; the question page has now used all three,
so the next direction has to find a fourth rather than a fourth way of printing the same sheet.
