# Fortnite — Style Library

A markdown transcription of `support/Library--Styles--Fortnite.png`, plus the derived token names,
measured contrast ratios and component notes this repo's UI is built from.

**Source of the palette and type scale:** the poster image above, which documents a style study of
the Fortnite for Developers site. **Source of everything marked "derived":** this project.

| | |
|---|---|
| Poster title | Fortnite — Style Library (Fortnite / Developer Page Foundations) |
| Subtitle | "A screenshot-derived palette and type study of Fortnite for Developers." |
| Poster summary line | 12 color styles / 8 reconstructed text styles / Visual reference · 12 Nov 2026 |
| Upstream source | `fortnite.com/developer?lang=en-US`, screenshot captured 12 Nov 2026 |
| Local style names in the source file | `Fortnite/Color/*` and `Fortnite/Type/*` |

## Read this first: what the poster is, and what it is not

The poster states its own limits, and they matter:

- **It is sampled, not an official brand kit.** "Colours sampled from your full-page developer-page
  screenshot. Semantic roles, sizes, spacing, and corner radii are reconstructed for reuse, not
  verified website CSS."
- **The typefaces are substitutes.** "Archivo Black / Black Italic approximates the heavy display
  face; Inter approximates the UI face. Exact source fonts cannot be identified from this
  screenshot alone." The poster labels its own type section "Visual substitutes — font identities
  and CSS sizes are unverified."
- **Artwork colours are not tokens.** "Palette values are sampled pixels; role names are
  reconstructed. Artwork colours are not treated as interface tokens."

So this document is a *reconstruction* of a look, and it should be treated as the design contract for
this application rather than as Epic's brand specification. Anything marked **[derived]** below is
this project's decision, not something read off the poster.

---

## 1. Colour palette — 12 styles

Exactly as the poster states them, in the poster's order. CSS custom property names are
**[derived]**: they are what `public/css/tokens.css` actually defines.

### Dark surfaces, acid-yellow actions

| # | Hex | Poster role | Poster usage note | Token | Contrast on canvas **[derived]** |
|---|---|---|---|---|---|
| 1 | `#101014` | Canvas | Page background | `--fn-canvas` | — (is the canvas) |
| 2 | `#18181C` | Surface / Footer | Footer background | `--fn-surface-quiet` | — |
| 3 | `#26262A` | Surface / Card | News & resource cards | `--fn-surface-card` | — |
| 4 | `#3A3A3E` | Surface / Control | Utility controls | `--fn-surface-control` | — |
| 5 | `#F7FF19` | Action / Primary | Primary calls to action | `--fn-action` | 17.4:1 on canvas |
| 6 | `#E2E2E3` | Action / Secondary | Documentation buttons | `--fn-action-secondary` | 14.7:1 on canvas |

### Text, borders and states

| # | Hex | Poster role | Poster usage note | Token | Contrast **[derived]** |
|---|---|---|---|---|---|
| 7 | `#FFFFFF` | Text / Primary | Headings & strong labels | `--fn-text` | 19.0:1 on canvas · 15.1:1 on card |
| 8 | `#C3C3C4` | Text / Secondary | Supporting body copy | `--fn-text-secondary` | 10.8:1 on canvas · 8.6:1 on card |
| 9 | `#AEAEB0` | Text / Muted | Footer links & metadata | `--fn-text-muted` | 8.6:1 on canvas · 6.8:1 on card |
| 10 | `#000000` | Text / On action | Labels on bright buttons | `--fn-on-action` | 19.3:1 on action · 16.2:1 on action-secondary |
| 11 | `#3A3A3E` | Border / Subtle | Dividers & outlines | `--fn-border` | 1.7:1 on canvas — decorative, never text |
| 12 | `#505053` | Text / Disabled | Low-emphasis heading | `--fn-text-disabled` | 2.4:1 on canvas — see note |

**[derived] Notes on the two low-contrast entries.** The poster lists them without qualification, but
both fail WCAG AA for body text, so this project constrains where they may be used:

- `--fn-border` (`#3A3A3E`) at 1.7:1 is below the 3:1 that WCAG asks of *meaningful* UI boundaries.
  Use it for dividers and decorative outlines only. Where a border carries meaning (a selected
  option, a focused control, an input edge) use `--fn-text-muted` (8.6:1) or the accent instead.
- `--fn-text-disabled` (`#505053`) at 2.4:1 is exempt from contrast requirements because WCAG does
  not apply them to genuinely disabled controls — so it must only ever be applied to controls that
  are actually disabled, and never to describing text, metadata or a label a user needs to read.

**[derived] Ratios are not on the poster.** They were computed here from the sRGB values using the
WCAG relative-luminance formula, because this app is being rebuilt with accessibility as a
requirement rather than a later retrofit.

### Rules implied by the palette

1. **One accent, spent sparingly.** The poster's own summary is "Dark surfaces. Acid-yellow actions."
   Yellow means *act* — a primary button, the current step, the single most important number on a
   screen. It is not a decorative colour and there is no second accent.
2. **Surfaces step in threes.** Canvas → card → control, each lighter than the last, replace what
   would otherwise be borders and drop shadows.
3. **No hue-coding.** Because the palette has no second hue, status and grouping must be carried by
   text, weight, labels and position — never by colour alone. (This is also what makes the
   redrawn core-loop diagram legible to colour-blind users.)
4. **[derived] Hover never repaints a fill.** A hover state may only strengthen the border and lift the
   element. The fill a label sits on must be identical at rest and under the cursor, so a hover can
   never move text onto a background its contrast was not measured against. This is not theory: a
   stylesheet inherited from the older pages styled `button:hover` with a light blue fill, which
   outranked the card's own rule and turned every card into white-on-light-cyan. A hover that changes
   the background is the one state change that can silently destroy readability, so it is banned
   outright rather than tuned. Text links are the single exception — brightening a *link's* own text
   on an unchanged background is safe.

---

## 1b. Where this library applies, and where it does not

This palette governs **the workspace** — everything inside the app container: choice cards, question
options, device cards, settings panels, the core-loop diagram, the walkthrough tracker.

The **page shell** around it — site header, hero, footer, and the inset container's chrome (breadcrumb
bar and progress bar) — follows `support/Forge--architecture_specification.md` instead: Unreal Navy
`#0E1128`, the `#101014 → #202024 → #101014` body gradient, the `#18181C` footer, Panel Charcoal
`#23253A` inputs, Outline Slate `#3A3D4D` borders, cyan `#1CB0F6` / `#26BBFF` for active states, and the
cyan-to-yellow progress gradient. The two systems agree where they overlap — both use `#101014` as the
dark canvas and `#F7FF19` as the action colour — and the shell is the only place a second hue (cyan) is
allowed, because nothing in the shell carries content status.

The boundary is a cascade boundary too, not just a drawing convention: the shell's palette lives in
`public/css/shell.css` (from the architecture spec) and the workspace's in `public/css/tokens.css` +
`public/css/guide.css` (from this library). The shared chrome stylesheet for the older admin and chat
pages is wrapped in a `@layer chrome` block so its element selectors can never outrank the app's own
component rules again.

Two consequences that are worth knowing before editing either file:

- **Hover discipline is a workspace rule.** It is asserted over `guide.css` only (`tests/guide.test.mjs`,
  "hover changes an edge and a lift, never a fill"). The shell's own controls change their fill on hover
  — the navigation's wash, the secondary button's lift in value — because a wash toward white raises
  contrast there rather than destroying it, and because the shell follows the architecture spec, which
  specifies those states. The moment such a state is applied to something inside the container, the rule
  applies again.
- **Heading levels belong to the page, not to the components.** The hero owns the page's only `<h1>`, so
  `pageTitle()` renders an `<h2>`, `sectionHeading()` an `<h3>` and `cardTitle()` an `<h4>`
  (`public/js/guide/render/ui.js`). The screen's heading is focused after every route change by id
  (`#screen-title`), not by tag.

---

## 2. Typography — 8 text styles

Poster values are `size / line-height` in px, measured from the screenshot and reconstructed.

| Poster name | Size / line | Face (substitute) | Poster example | Token |
|---|---|---|---|---|
| Display | 48 / 48 | Archivo Black **Italic** | FORTNITE FOR DEVELOPERS | `--fn-type-display` |
| Section | 36 / 40 | Archivo Black **Italic** | DEVELOPER TOOLS | `--fn-type-section` |
| Card title | 24 / 28 | Archivo Black | Get Unreal Editor for Fortnite › | `--fn-type-card` |
| Lead | 18 / 28 | Inter Regular | Design, build, and publish your game using powerful Unreal Engine creation tools. | `--fn-type-lead` |
| Body | 16 / 24 | Inter Regular | Fortnite Creative lets you build directly in Fortnite on console, PC, or mobile. | `--fn-type-body` |
| Navigation | 14 / 20 | Inter Medium | Overview · Developer Tools · Platform and Economy · Developer Stories | `--fn-type-nav` |
| Action | 16 / 20 | Archivo Black | GET UNREAL EDITOR FOR FORTNITE | `--fn-type-action` |
| Metadata | 10 / 14 | Inter Bold, uppercase | OCT 15, 2026 / DEVELOPMENT NEWS | `--fn-type-meta` |

**The poster's own rule, verbatim:** *"Uppercase, extra-heavy italic for display. Upright bold for
actions and cards. Neutral sans-serif for supporting copy."*

**[derived] How that becomes a rule set:**

- **Display and Section are uppercase and italic**, always. They are the only italic text in the UI.
  Use them for the app's screen titles and the big section headings.
- **Card title and Action are upright bold**, never italic, never uppercase (Action only *looks*
  uppercase in the poster because its example string is written that way).
- **Everything readable is Inter** — lead, body, navigation, metadata. The UI face carries all
  supporting copy, all paragraph text and all labels a user has to read carefully.
- **Metadata is the only tracked-out style**: 10/14, bold, uppercase, used for eyebrows, counts and
  timestamps. It is the natural home for things like "QUESTION 2 OF 4" and "3 DEVICES · 2 NOTES".
- **Weight does the work surfaces would otherwise do.** Because there is no drop shadow and no
  coloured accent for grouping, hierarchy comes from the display face, from size, and from the
  uppercase/italic contrast.

**[derived] Desktop sizes are a ceiling, not a fixed size.** The poster is a desktop screenshot. The
app scales Display and Section down on narrow screens (see `--fn-type-*` clamps in `tokens.css`);
Lead, Body, Navigation, Action and Metadata stay at their poster sizes at every width, because they
are already small enough to be readable on a phone.

---

## 3. Interface treatments

The poster documents three treatments and four rules. Reproduced, then extended.

### As drawn

| Treatment | Fill | Text | Radius | Notes |
|---|---|---|---|---|
| **Primary / download** | `#F7FF19` | `#000000` | 8 px | Uppercase Archivo Black 16/20, generous horizontal padding. The only bright fill in the UI. |
| **Secondary / documentation** | `#E2E2E3` | `#000000` | 8 px | Same silhouette as primary, lower emphasis. |
| **Resource card** | `#26262A` | Title `#FFFFFF`, body `#C3C3C4` | 10 px | Card title 24/28 with a `›` affordance, body copy 16/24, generous padding. |

**Poster rules, verbatim:** *"8 px button radius · 10 px card radius · generous negative space ·
bright fills reserved for actions."*

### [derived] Extensions this app needs

The poster covers a marketing page. This app is a nine-screen wizard, so the same language has to
cover controls it never shows. These are this project's decisions, made by extending the rules above
rather than inventing new colours or a second accent:

| App component | Treatment |
|---|---|
| **Choice card** (category, game type, experience level) | Resource-card surface (`--fn-surface-card`), 10 px radius, card-title type for the label, body type for the description. Chosen: 1 px `--fn-action` outline plus a text marker, never a colour change alone. |
| **Option row** (a question's answers) | `--fn-surface-control` at rest, `--fn-canvas` when chosen, with an accent outline and a `✓`/text state marker. Full-width, left-aligned, minimum 44 px tall for touch. |
| **Device card** | Same as resource card. The role grouping is a metadata eyebrow plus a hairline, not a per-role colour. |
| **Settings panel** | `--fn-canvas` inside the card, hairline `--fn-border` between settings, setting name in Navigation type, guidance in Body type. |
| **Progress / step tracker** | Metadata type; the completed and current steps are distinguished by weight and by the accent on the current one only. Never "green means done". |
| **Core-loop diagram** | Dark surfaces, hairline strokes, accent reserved for the entry point and the arrowheads. Text-only legend beneath it, so the diagram is not the only carrier of meaning. |
| **Restriction / legal block** | Card surface, Section type for each titled rule list, Body type for the rules, and an explicit "verified on" date in Metadata type. |
| **Focus ring** | 2 px `--fn-action` outline with a 2 px offset, on every focusable control. The accent is the only colour available to signal focus, so it is spent there. |
| **Disabled control** | `--fn-text-disabled` for the label, `--fn-surface-quiet` for the fill, `cursor: not-allowed`, and it must be genuinely disabled. A disabled control also does **not** lift on hover — a lift invites a click the control will not honour. |
| **Hover** (every card, tile, option and button) | Border strengthens to `--fn-border-strong` (or `--fn-text` where the border was already strong, and `--fn-on-action` on the yellow action) and the element lifts by `--fn-lift` (3 px) with `--fn-shadow-hover`. **The fill does not change at all.** Keyboard focus gets the same lift as hover, so the two are equivalent. The lift is skipped under `prefers-reduced-motion`, which zeroes `--fn-motion`. |
| **Print** (a device plan taken to another screen) | The one place the poster's palette is abandoned: paper is white and ink is black, so `--fn-print-paper` / `--fn-print-ink` / `--fn-print-rule` substitute for the screen colours and the header, buttons and progress bar are dropped. |

**Spacing [derived]:** nothing in the poster fixes a spacing scale, so this app uses a 4 px base
step (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96) and expresses the poster's "generous negative space"
as: `--fn-screen-top` of top padding before a screen title (56 px at desktop width, easing to 28 px on
a phone via `clamp()`), 32 px between a section title and its content, 24 px between cards, and never
less than 24 px of padding inside a card. The one value that has to survive a 360 px viewport is the
screen-top gap, which is why it is the only one with a clamp.

---

## 4. Usage and provenance (from the poster)

- **Sampled, not an official brand kit.** Colours come from a full-page developer-page screenshot.
  Semantic roles, sizes, spacing and corner radii are reconstructed for reuse, not verified website CSS.
- **Editable font substitutes.** Archivo Black / Black Italic approximates the heavy display face;
  Inter approximates the UI face. Exact source fonts cannot be identified from a screenshot alone.
- **Source.** `fortnite.com/developer?lang=en-US` · Screenshot captured 12 Nov 2026 · Local styles:
  `Fortnite/Color/*` and `Fortnite/Type/*`.

**[derived] A note on the relationship to the rest of this repo.** The Fortnite style library is one
of two visual languages now present: the Forge landing page (`public/css/landing.css`, accent
`#26bbff`) and this one (accent `#F7FF19`). They are deliberately independent files — the app is
styled from `tokens.css` + `guide.css` and does not import the landing tokens, because the two accents
mean different things in different products and merging them would leave neither looking intentional.
If a single brand system is wanted later, `tokens.css` is the only file that has to change.

---

## 5. Token reference

The single implementation of everything above is **`public/css/tokens.css`**. Colour, type and
spacing names used in this document are defined there and nowhere else; `guide.css` consumes them and
hardcodes no hex value. If a value in this document and a value in `tokens.css` disagree, the poster
image is the tiebreaker and `tokens.css` is the bug.
