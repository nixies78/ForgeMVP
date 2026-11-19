# Webpage Specification: Unreal Forge

**Current revision: 1.2.2 — 2026-11-16.** This is the specification *as built*. It is revised in place for
each release, and the file keeps its `_v2` name because the stylesheets, the tests and the changelog all
reach it by that path. `support/unreal_forge_changelog.md` records what each release changed and why;
1.2.0 reconciled the palette into one system, 1.2.1 settled the box, the control heights, the mark and the
progress ramp inside it, and 1.2.2 set the box's radius, frosted the header, and took the box back off the
mark's hover.

---

## Theme & Design Tokens

The palette is the authentic Unreal/Epic palette, and it is declared **once**, in `public/css/tokens.css`,
under the `--ue-*` names. Every value is a library value — `support/library.html` is the write-up of it,
taken from `unrealengine.com`, `store.epicgames.com` and `fortnite.com/developer`. `shell.css` and
`guide.css` consume those tokens and, as of 1.2.1, declare no colours of their own at all.

| Role | Value | Source |
| --- | --- | --- |
| Canvas | `#101014` | the published background |
| Elevated surfaces | `#18181C` the footer band, `#202024` controls and wells | the published neutral ramp |
| A box at rest (panel, card, list row) | `#1C1C20` | 1.2.1: 5% white over the canvas, flattened |
| A box under the pointer | `#28282C` | 1.2.1: 10% white over the canvas, flattened |
| A chosen answer, and the current step | `#28282C` | the store's own current-item fill |
| Sticky material | `#101014D9` (85%) | the library's material layer |
| Header background | `#101014` at 90% + `blur(12px)` | this spec: the canvas, frosted like the sticky bar |
| Text | 95% / 75% / 65% / 35% white | the published text steps |
| Secondary control | 15% white, 35% on hover | the published subtle fill and its hover |
| Subtle border | `#343437` | 1.2.1: 15% white over the canvas, flattened (1.5:1 — decoration) |
| Meaningful border | 35% white (3.5:1), 65% on hover | the published strong border and its hover step |
| Primary CTA | `#26BBFF`, hover `#69D0FF`, press `#33BFFF` | the Unreal accent and its steps |
| On the primary CTA | `#101014` (8.7:1 at rest, 11.5:1 on hover) | the library's dark label |
| Progress ramp | `#33BFFF` → `#868AFD` | 1.2.1: the published blue-400 and indigo-400 |
| Warning | `#F7D82B` | the library's warning hue |

**Typography.** `Inter` throughout — headings (H1, H2) and body/UI alike, in sentence case; no forced full
capitalisation. Bundled with the app rather than loaded from a CDN.

**Control heights.** Navigation CTAs are `32px` (the header's Admin action); body CTAs are `40px`, which is
what the library's own primary buttons measure. The one documented exception is the recap row's `Edit`
button, which is `32px` because a 40px control breaks the table it sits in. Inputs stay at `44px`: they are
not CTAs, and 44px is the touch target a phone wants.

**Radii.** Two values, and they are the two the library publishes for the two things they cover: a **box**
(a panel, a card, an option, a tile, an image slot) takes `16px`, the published container step —
the store's own parent radii are 16px — and a **control** (a button, an input, a list chip) keeps `8px`,
which is what the library's buttons and navigation items measure. 1.2.2 raised the box radius; the control
radius deliberately stayed, because a 32px-tall button with a 16px radius is a pill.

**A chosen box wears a 1px edge.** 1.2.2 halved the selected border from `2px` to `1px`, so a selected card,
brand tile or tracker row is the same weight as every other box and says what it is with its colour, its
fill and its marker instead. It also removes a pixel of movement: growing a border on selection shifted
everything inside the box by one pixel.

**Hover language.** An interactive surface (a choice card, an option, a brand tile, a tracker row) repaints
its whole fill — the box's own step, `#1C1C20` to `#28282C` — strengthens its edge from the subtle step to
the meaningful one, and lifts 3px. A container does not repaint: hovering a control inside a panel must not
light the panel up as though it were clickable. A control (a button) changes its fill and nothing else: no
lift, no shadow, no border change on hover.

---

## Layout Structure
Classic three-part structure:
1. Header (Fixed / Always Visible)
2. Body (Web App Container)
3. Footer

---

## Header Specifications

*   **Positioning:** Fixed / persistent (`position: fixed; top: 0; width: 100%; z-index: 50`) — remains
    permanently visible at the top of the viewport across all scroll depths (does not hide or auto-collapse
    on scroll).
*   **Background:** `#101014` at 90% opacity (`rgba(16, 16, 20, 0.90)`) with `backdrop-filter: blur(12px)` —
    as of 1.2.2 the header frosts exactly like the sticky bar inside the app, so content reads through it as
    it scrolls under. Both read one value, `--sh-blur`, because two copies of an effect are two effects
    waiting to drift apart. The tint eased from 95% to 90% in the same release: a blur behind an almost
    opaque fill is an effect nobody can see.
*   **Height:** `72px` (`64px` at 760px and below; the measured height is published as `--sh-header-h`)
*   **Border:** None (Clean edge)
*   **Features (Left to Right):**
    1. **Logo:** The Epic mark, from `/public/assets/logo_epic.svg` (1.2.1; it replaced the store's vertical
       logotype), sized to 44px of the 72px bar. It links back to the start of the guide and carries **no
       border and no box in any state**: 1.2.2 removed the translucent wash 1.2.1 had given it, because a
       wash on a 44px square reads as a grey button appearing under the pointer. The hover is the mark
       itself changing shade (`opacity: 0.8`), which adds nothing to the layout.
    2. **Navigation:** Single item: `"Home"` (no additional links or "More" overflow menu)
    3. **CTA — Secondary:**
        *   Label: `"Admin"`
        *   Height: `32px` (a navigation CTA)
        *   Fill: 15% white, no border, no icon
        *   Text colour: the library's default text colour (95% white)
*   **Removed in 1.2.0:** the search box, and the "Dev mode" control (both listed as header features in
    1.1.0). Dev mode now lives in the footer; search is not built, and is no longer offered.

---

## Body Specifications

*   **Background:** 3-stop gradient (`#101014`, `#202024`, `#101014`)
*   **Hero Section:** Removed (the web app container sits directly below the fixed header with the
    appropriate top offset).

### Web App Container

*   **Layout & Spacing:** Inset from the page edges by at least `64px` (eased to `16px` on a phone), with
   top padding/margin accounting for the `72px` fixed header.
*   **Sticky Sub-Header:** Remains visible while scrolling inside the workspace, and as of 1.2.0 is
   **completely borderless and semi-transparent** — no rules above or below, and a material tint of the
   canvas at 85% with a blur, so content scrolling under it stays recognisable. It holds:
    *   **Interactive Breadcrumb Bar:** Clickable trail links that navigate directly to their corresponding
        wizard sections/steps (retained).
    *   **Visual Progress Bar:** The linear gradient runs from the palette's blue-400 to its indigo-400
        (`#33BFFF` → `#868AFD`) as of 1.2.1, which replaced Forge's own cyan-to-yellow.
*   **Panels:** Every panel and every interactive surface shares one box: the base fill `#1C1C20`, the
    subtle edge `#343437`, and the hover step `#28282C` for the surfaces you can act on.
*   **Lead copy:** `"Pick how you'd like to design it — or scroll down to pick up where you left off."`
*   **Wizard Navigation:** Every screen/step inside the web app wizard includes a visible `"Back"` button to
   return to the previous step.

### Focus and the screen title

Every screen change moves focus to the screen's own `<h1>`, which is `tabindex="-1"`: that move is how a
screen reader hears that the screen changed, and it is the app's own behaviour rather than an accident.
**That title draws no focus ring.** The ring belongs to the keyboard, and nobody tabbed to it — a title
reachable only programmatically cannot be a position marker, so suppressing its ring hides nothing.

1.2.2 asked for the heading's `tabindex` to be removed instead so that no blue box could appear around the
title on load. The box came from something else, and the fix is narrower than the request: the ring
exemption has been in `guide.css` since before 1.2.0, but it named `<h2>`, which is what screen titles were
while the page still had a hero. 1.2.0 removed the hero and the title became the page's only `<h1>`, so the
exemption stopped matching and the ring came back. The exemption now names both. The `tabindex` stays,
because removing it removes the announcement — and this is the one place where the built page deliberately
does less than the changelog's wording says.

---

## Footer Specifications

*   **Background Color:** `#18181C`
*   **Border:** None — 1.2.1 removed the top border, so the footer is a band of colour and nothing else.
*   **Content:** Minimal utility bar containing only:
    *   **System Status** indicator (its dot, and the status line)
    *   **Dev mode** link — a control that states its own on/off value, relocated here from the header in
        1.2.0
    *   **`"Home page mockups"`** — a link to the design explorations under `public/mockups/`, added after
        1.2.2 and the only footer entry that points outside the app. It is a door to work in progress, not
        part of the guide, which is why it sits in the utility bar rather than in the navigation: the
        header's one item stays "Home".
    *   **Admin Navigation Link:** `"Go to admin page"`
*   **Removed in 1.2.0:** everything else the footer used to carry. The guide's own footnotes (sources, the
    Epic disclaimer) live at the end of the home screen, where a reader is when they matter.

---

## Not part of this specification

`public/concepts/` (the home-page mockups, and the prototype pages under them) and `public/mockups/` are
design explorations kept in this repository: they are experiments about what the page could be, they are
served from the same `public/` tree, and nothing in the app depends on them. This document describes the
app. Where the two disagree, the app wins — the concepts are allowed to disagree, which is the point of
them.

They are also opened straight from disk, which the app is not: every path in them is relative to the file
that names it, and every link to a page names its `index.html`. A server resolves `/assets/x` to
`public/assets/x` and `dir/` to `dir/index.html`; a filesystem resolves them to `C:/assets/x` and a
directory listing. `tests/paths.test.mjs` enforces both rules against the filesystem, because no check that
runs through the server can see either fault.

What they do share with the app is its chrome: a 72px header, a 44px Epic mark that shades to 80% under the
pointer, and a content column. That chrome is defined once, in `public/concepts/_shared/chrome.css`, which
every mockup links - one definition rather than fifteen that drift - and `npm run verify` measures each page
against it: the bar's height, the mark's size, the class names (`logo-wrap` / `logo-img`), the absence of
any box around the mark, the hover shade, the mark's contrast against whatever it sits on, and the column.
Everything else about a mockup's header - colour, rule, type, the nav it holds - is the mockup's own.

The column is the one place they deliberately differ from the app: mockups use 1136px where the shell above
uses 1240px (`--sh-content-max`), because a mockup is a pitch page read on its own and the narrower column
suits it. That 1136px is the content, not a box with a gutter inside it: above a 1280px window there is no
padding in the column at all, and below it the shared file adds the app's own `--sh-inset` gutter and grows
the column's box by the same amount, so the content is 1136px wherever the window can spare it and the two
regimes meet without a step. The same file owns the footer - the mark and a locked wordmark, one slogan, 120px
- and the four app screens deliberately carry none, because they are screens of the app rather than pitch
pages. `support/home-concepts-brief.md` states all of this for whoever writes the next one.
