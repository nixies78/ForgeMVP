# The AI handover: what changes when a model fills the blanks

`support/gdd-template.json` is the contract and `tools/gdds/template.mjs` is its gate runner. This is
the reasoning behind both, and behind the two questions that prompted them: *how does the AI change
things*, and *what document structure would you pass to a model*.

---

## 1. What actually changes: the "missing" sections stop being missing

The current export is honest about a hard limit. The questionnaire knows the game type, the answers,
and the device resolution; it knows nothing about art direction, type and colour, level design, audio,
market, or build budget. So `AUTHORED_SECTIONS` names those sections and `drawMissing` prints, on every
structure, what the tool could not tell you and who has to write it.

That was a **content availability** problem. A model changes it into a **trust** problem, and those are
different problems with different solutions.

The shift, concretely. Right now the three structures each carry a section that says, in effect, *we
cannot help with this*. With a model in the loop they carry a section that says *here is a first draft,
here is what it was drafted from, and it is a draft*. The section is no longer absent; the absent thing
is confidence. That is a much better document and a much more dangerous one, because a plausible
paragraph about art direction reads exactly like a decided one.

So the important change is not that more sections get filled. It is that **provenance stops being a
nice-to-have and becomes the load-bearing part of the document.** The Ledger structure — every device,
every setting, and the decision that put it there — was the third of three options. It should probably
become the default one.

### The three kinds of content, which is the whole design

| Source | What it is | Generated? | Who can be held to it |
|---|---|---|---|
| **derived** | Computed from the catalogue and the answers. The device plan, the counts, the settings, the build order, the answer trace. | Never | The tool |
| **authored** | The reader's own taste, market, budget, team. There is no right answer to infer. | **Never** | The reader |
| **proposed** | Model-drafted from the wizard's answers, marked as a draft. The hook, art direction, audio, level pacing. | Yes | Nobody yet — that is the point |

Once a model can write, the temptation is to call everything `proposed` and ship something that reads
beautifully and is wrong in three places nobody can find. The schema exists to make that hard, and the
`authored` category is the part that has to be absolute: **an authored slot filled by the model is a
person's opinion being written for them.** Market positioning, monetisation, and build budget are the
clearest cases. A model asked *who is this for and how does it make money* will answer, fluently, and
the answer will be quoted in a meeting.

### Which slots are worth generating at all

Better ones than the obvious. The model's real advantage is not prose quality, it is that **the wizard
already contains constraints nobody has said out loud**, and the model can state them:

- `level.design` is the strongest AI slot in the template, because the answers constrain it more than
  any other prose. Four players, a shrinking zone, and rooms-and-corridors already decide a great deal
  about pacing. The model's job is to say what follows, not to invent.
- `pitch.hook` is next, because the catalogue holds what a game type *is* and not why this instance is
  worth an evening, and only the answers can supply the difference.
- `direction.art` and `direction.audio` are worth a draft precisely because the tool has no images and
  no audio. "Cold, low contrast, one warm light source" is more useful than a blank field, as long as
  it is marked as a suggestion.

Two things follow from this that are easy to get wrong:

1. **Generate derived content first, then pass it in as context.** A hook written before the device
   plan exists is a hook about an unknown game, and any number in it is uncheckable. Passing the
   resolved plan in is the difference between "a tense chase" and "ten minutes of quiet, then a shape at
   the end of the corridor that is already closer than it was."
2. **The quality of the proposal is bounded by the quality of the answers.** This is the real argument
   for asking more in the wizard. `mood`, `map_size`, `player_count` and `zone` are already doing
   disproportionate work in `level.design`. A question the wizard does not ask is a paragraph the model
   fills with the most common answer for the genre, which is exactly the paragraph the reader did not
   need.

---

## 2. What the template looks like

A JSON file, because it has to be read by a program as well as a person. Four parts.

**Slots.** Twenty of them, each with an id, a label, a `source`, and — for the ones that need it — its
inputs, its constraints, and either `because` (why it is proposed) or `prompt` (the question an authored
slot poses). Two fields carry most of the value:

```json
{
  "id": "direction.art",
  "source": "proposed",
  "inputs": ["catalogue.<game_type>.description", "answers.mood"],
  "because": "The tool has no images and no taste model, but mood plus genre is a real constraint…",
  "maxWords": 120,
  "mustNot": ["name a specific artist or studio", "promise asset counts"],
  "severity": "draft-prose"
}
```

`because` is not documentation. It is the provenance record: the gate that makes an unattributable
paragraph impossible, and the string the document prints beside the draft.

**Structures.** `brief`, `sprint`, and `ledger` become a list of slot ids each one includes and
excludes. This is what makes three documents out of one template, and it means a slot cannot be edited
without every structure that uses it being accounted for.

**Generation.** Order (derived first), the context every proposal receives, low temperature, and the
failure behaviour: *leave the slot authored and print the question*. An empty question is honest; an
invented answer is not.

**Gates.** Six checks that run on a finished draft. This is the part that has to actually work, because
the failure mode is not a bad sentence.

| Gate | Catches |
|---|---|
| `authored-untouched` | The model filling a slot that is the reader's to write |
| `no-numbers-in-prose` | Prose stating a number a derived slot already holds — two sources for one number, and the prose is the one a reader remembers |
| `provenance-present` | A draft with nothing recorded about what it was drafted from |
| `draft-marked` | A draft that reads as a decision |
| `word-budget` | A model asked for 45 words writing 90, and overflowing a page |
| `must-not` | A named competitor, an invented figure, a promised asset count |

`node tools/gdds/template.mjs --self-test` runs the gates against the template's own example and then
asserts that each gate fires on a draft built to trip it. **A gate that cannot fail is worse than no
gate, because it looks like coverage** — and two of these cases were silently testing nothing when they
were first written by hand: one put a forbidden phrase in a slot with no `mustNot` list, another used
digits that collided with no derived number. Both reported "the gate is not checking anything" while
the gate was fine. The cases are now derived from the template, and the self-test fails if any gate
lacks one. A test that names a slot id is a second place the template is written down.

---

## 3. What this changes about the product, not the template

**Provenance is the feature.** The Ledger's answer trace — which answer put which device here — already
exists and already works. With a model in the loop it becomes the thing that makes the document
trustworthy, because it is the only part a reader can audit. It should be rendered in all three
structures, not just the third.

**The draft marker is computed, never maintained.** `provenance.draft_marker` derives from the set of
slots whose source is `proposed`. A hand-maintained list of "which sections are AI" would fall out of
date the first time a slot changed, and the document would then misrepresent itself.

**"What this cannot tell you" changes meaning and should stay.** Today it says *these sections are
missing*. With a model it says *these sections are drafts, and these ones are questions only you can
answer*. Both are worth printing on the page rather than in a footnote, and the second is arguably more
important than the first.

**Review is a state, not a checkbox.** A proposed slot has three states — `draft`, `accepted`,
`rewritten` — and the document should be able to show all three. The interesting number is not how much
of the document is AI; it is how much of it is still `draft` when someone builds from it.

---

## 4. Open questions this does not answer

- **Where does the model run?** The repo is zero-dependency and the export is a local Node script with
  no network. Calling a model means either a build-time step or a server call, and that is the first
  architectural decision this design forces.
- **Is the preview generated or deterministic?** The current preview renders the real PDF and is
  byte-reproducible. A model in the export path makes the preview non-deterministic unless the generated
  slots are cached and the preview renders the cache. It probably has to.
- **How does a reader accept a draft?** Editing the PDF is not a thing. The realistic answer is that
  `accepted` and `rewritten` live in the app and re-export, which means the app needs to store per-slot
  state — a bigger change than the export.
- **Who owns the prose?** If a model writes the hook and the reader ships it, the document should
  probably say so somewhere a reader will see. The template marks drafts; it does not yet mark *accepted
  model text*, and those are different claims.
- **Does the Ledger become the default?** I think it should when any slot is `proposed`, and the Brief
  stays the default when none are. That is a product decision, not a technical one.
