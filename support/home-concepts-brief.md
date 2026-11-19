# Home page concepts - shared brief (2026-11-17)

Standalone mock-ups of the Forge home page, each in a very different direction, so the owner can compare
ideas. **Static HTML/CSS only** - no app code, no data loading, buttons can be dead links (`href="#"`).
Light inline JS is fine for a flourish (scroll reveal, a ticker), never required.

The nine landing mock-ups, the three page prototypes (questions, lessons, randomiser) and the index that
lists them all are in `public/concepts/<slug>/` and `public/mockups/`.

## What every concept must share

The direction is yours; the frame around it is not, because the mock-ups are compared against each other
and against the app. The frame lives in one file, and you link it:

```html
<link rel="stylesheet" href="../_shared/chrome.css" />
```

That link goes **last in `<head>`**, after your own `<style>`, so the shared rules win a tie. It gives you
four class names and nothing else. `npm run verify` measures every page in the set against all of it, so a
mock-up that drifts is a failed check rather than something the owner finds later.

**The logo - `logo-wrap` and `logo-img`, one way, everywhere.** Header, footer, anywhere else, every
instance:

```html
<span class="logo-wrap"><img class="logo-img" src="../../assets/logo_epic.svg" alt="Epic Games" width="44" height="44"></span>
```

- The wrapper around the mark is `.logo-wrap` - that exact name on every page - and it is the *only* thing
  around the mark: no tile, badge, disc, frame, rotation, shadow, background or border. A box around a
  logo reads as a button, and it is what made thirteen pages look like thirteen sets of chrome.
- The mark is `.logo-img`: **44px**, hover shading to 80% - the app's own treatment
  (`public/css/shell.css`: `.sh-logo`, `.sh-logo img`, `.sh-logo:hover img`).
- **Do not style the logo in your page.** No `height`, `width`, `background`, `border`, `filter`,
  `transform` or `object-fit` on a mark or its wrapper, no `header img` / `footer img` rule that reaches it.
  If a rule of yours matches a mark, delete it.
- On a light page add `logo-img-black` to the mark. `logo_epic.svg` is a single white path, so the mark is
  recoloured (`filter: brightness(0)`) rather than seated on a dark tile: the tile is a second design to
  keep in step, and on a page whose own ink is black the mark then matches nothing.

**The header is 72px tall.** Same as the app's (`--sh-header-base`). Your bar keeps **your** colours, rule,
type and nav - the height and the mark are the two things that are fixed.

The 72px bar, the 44px mark and the 1136px column are the desktop rendering: a `@media` block of yours may
do what your design needs below that, and where a bar has to grow to fit a stacked layout `min-height` is
the way to say so.

**The column is `.wrap`, 1136px of content.** Every page's content and header sit in that one width, so the
mark and the wordmark line up down the page. The shared file owns the column entirely: `max-width` and the
gutter. **Set neither in your page** - a page that pads its own `.wrap` is inset twice, and that is what put
the logo in a different place on all fifteen pages once already.

The gutter is conditional rather than absent. Above 1280px the column keeps itself off the screen edge by
being narrower than the window, so there is no padding inside it and the content is the whole 1136px. Below
1280px the shared file adds `clamp(16px, 5vw, 64px)` - the app's own `--sh-inset` - and grows the column's
box by exactly that much, so the content stays 1136px wherever the window can spare it and becomes
everything the window has left where it cannot. A `@media` block of yours may lay out your design for small
screens; it must not put a gutter back on `.wrap`.

The app's own shell is wider (1240px, `--sh-content-max`) - a deliberate difference, not drift: a mock-up is
a pitch page read on its own, and the narrower column suits it.

**The wordmark is locked.** The "Forge" beside the mark is Archivo Black, uppercase, with `.06em` of
tracking, 20px in a header and 15px in a footer. That is the treatment on 1-cinematic, which the owner
called right and asked to freeze for future designs, so **do not set its font, size, weight or tracking in
your page**. Write it as `<span class="logo-word">Forge</span>` and let the shared rule uppercase it. There
is no vertical rule between the mark and the word: a separator element, or a `border-left` on the wordmark,
is not part of the design.

**Its colour is the mark's colour, and the shared file decides that too.** The wordmark is white, or black
where the mark beside it carries `logo-img-black` - never the surrounding text colour. It used to inherit,
which made "FORGE" grey in most footers while the white mark next to it stayed white. So do not set a
`color` on `.logo-word`: if you recolour the mark, the word follows on its own. Pointing at either the mark
or the word darkens both to 80% as one brand mark.

**Every header carries the lockup**, not a bare mark - the mark and "Forge" together, in that order, as an
`<a class="logo-lockup">`. Two pages and the mockups index shipped with the mark alone, which the owner
read as missing branding.

**A fixed header has to be paid for in the page.** Every mockup's header is in the layout (`sticky` or
`static`) except 1-cinematic's, which is `position: fixed` so its hero art can bleed behind it - and a fixed
header takes no space, so the first section starts underneath it. That is fine until the window is too short
to hold the section's content plus the header's 72px, at which point bottom-aligned content slides up into
the header: 1-cinematic's eyebrow started 69px from the top in a 520px-tall window, with the header ending
at 72. Its hero therefore reserves the band with
`padding-top: calc(72px + env(safe-area-inset-top, 0px))`, which does nothing while there is room and is
what keeps the content clear when there is not. If you make a header fixed, do the same.

**The footer is shared as well**, on every pitch page - the four app screens (lessons-1-default,
questions-1-default, randomiser-1-slots, randomiser-2-quiet-blue) are screens of the app rather than pitch
pages and carry none. Where it appears it is always this, including the wording:

```html
<footer class="foot">
  <div class="wrap foot-inner">
    <a class="logo-lockup" href="#" aria-label="Forge home">
      <span class="logo-wrap"><img class="logo-img" src="../../assets/logo_epic.svg" alt="Epic Games" width="44" height="44"></span>
      <span class="logo-word">Forge</span>
    </a>
    <span class="foot-slogan">Design in Forge. Build in UEFN. Play in Fortnite.</span>
    <nav class="foot-links" aria-label="Footer"><!-- the page's own links, if it has any --></nav>
  </div>
</footer>
```

`Design in Forge. Build in UEFN. Play in Fortnite.` is the slogan, not an example of one. `.foot` is 120px
tall at a desktop width, and the shared file owns that height, the row layout and the 13px type. Your page
owns the footer's background, its rule colour, its text colour and its link colours, and keeps whatever links
it already had.

The footer has to be distinguishable from what sits behind it, and once is enough: a footer whose background
differs from the page needs no rule (2-funky's ink on yellow), and one at the page's own colour needs a 1px
`border-top` in the page's rule colour (5-bento, 9-spotlight). Not both. The mark has to stay legible, so a
light footer takes `logo-img-black`.

**Anchors ease rather than snap.** The shared file sets `scroll-behavior: smooth` on `html` (with a
`prefers-reduced-motion` override back to `auto`), so a footer link dissolves to its target on every page:
seven pages had worked this out for themselves and 5-bento, 7-three-steps and 2-funky had not, which the
owner noticed. Do not declare it in your page.

## What the page is for

A **sales pitch** that encourages people to design a Fortnite island with Forge and then build it in
UEFN (Unreal Editor for Fortnite). It should feel **epic and professional**, guide the visitor down the
page in a clear order, and not be overcomplicated. Every concept must make the visitor want to start.

What Forge actually does (use these facts, rewrite the words freely in your concept's voice):

- **Three ways to start a design:**
  1. **Answer questions** - a short set of questions narrows the idea to an exact game type and builds
     a step-by-step plan. (Ready today.)
  2. **Spin the wheel / Randomise** - not sure what to make? It picks a game type, a twist and a brand
     to build around. (Coming soon.)
  3. **Chat with AI** - describe the idea in your own words; the AI asks follow-ups and turns it into a
     buildable plan. (Coming soon.)
- The result: the exact game type, the UEFN devices it needs, and five build steps.
- Real numbers from the app you may quote: **13 researched game types, 74 drafts, 10 category basics,
  59 devices**.
- Current tagline: "Take your game from idea to executable. Design in Forge, let AI tools bring it to
  life in Unreal Engine and tap into Fortnite's vibrant developer economy."
- **Do not invent statistics** (payout totals, player counts, creator numbers). If a section wants a
  big number, use one of the real ones above, or a clearly marked placeholder like `[stat]`.

Suggested flow (reorder or reinterpret per concept): hero with one clear call to action -> why build
for Fortnite -> the three ways in -> what you walk away with -> proof / game types -> final call to action.

## Brand rules (UEFN visual identity, brand.epicgames.com/document/586)

**Typography**
- Titles and hero text: **Inter Tight Bold** (tight letterforms, presence at large sizes; never for body).
- Subheadings, eyebrows, labels: **Inter Bold**.
- Body: **Inter Regular**.
- Display typeface for large-scale display and event headers: **Heading Now 37 Extrabold**. We do not
  have that font file; the repo's stand-in is **Archivo Black** (`/assets/fonts/archivo-black-latin.woff2`).
- Use weight and size, not extra typefaces, to build hierarchy.
- Font files: Inter is at `/assets/fonts/inter-latin-variable.woff2`. Inter Tight may be loaded from
  Google Fonts (`https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&display=swap`).

**Primary palette**: Blue `#33BFFF`, Indigo `#868AFD`, Purple `#BB6BF0`, Pink `#E166B6`, Red `#FD5E5E`,
Brown `#A98166`, Orange `#FE8539`, Amber `#F9A91F`, Yellow `#F7D82B`, Lime `#AAE755`, Green `#5FE367`,
Teal `#44D5BF`, Black `#000000`, White `#FFFFFF`.

**Gradients** (start -> end): Blue `#33BFFF->#DFBAF8`, Indigo `#868AFD->#F1B8DD`, Purple `#BB6BF0->#FEB4B4`,
Pink `#E166B6->#FFC6A3`, Red `#FD5E5E->#FCD796`, Orange `#FE8539->#FBED9C`, Amber `#F9A91F->#D7F4B0`,
Yellow `#F7D82B->#B4F2B8`, Lime `#AAE755->#A8EBE1`, Green `#5FE367->#A0E1FF`, Teal `#44D5BF->#C7C8FE`.

**Neutrals (dark UI)**: `#101014`, `#18181C`, `#202024`, `#28282C`, `#303034`, `#404044`, `#787678`, `#ACACAD`.

**Extended palette** (dark -> light tints per hue):
Blue `#0A2633 #185977 #258CBB #69D0FF #A0E1FF` · Indigo `#1B1C33 #3F4076 #6265BA #A6A9FE #C7C8FE` ·
Purple `#251530 #573270 #894EB0 #CD92F4 #DFBAF8` · Pink `#2D1424 #693055 #A54B85 #E98FC9 #F1B8DD` ·
Red `#331313 #762C2C #BA4545 #FE8989 #FEB4B4` · Brown `#221A14 #4F3C30 #7C5E4B #C0A28F #D7C4B8` ·
Orange `#331B0B #773E1B #BA622A #FEA66E #FFC6A3` · Amber `#322206 #744F0E #B77C17 #FBC05B #FCD796` ·
Yellow `#312B09 #736514 #B59E20 #F9E264 #FBED9C` · Lime `#222E11 #4F6C28 #7DA93E #C1ED82 #D7F4B0` ·
Green `#132D15 #2C6A30 #46A64C #8AEA90 #B4F2B8` · Teal `#0E2B26 #206359 #329C8C #76E0D0 #A8EBE1`.

**Logo**: the Epic mark is at `../../assets/logo_epic.svg` (white). Do not recolour, stretch or add effects
to it.

## Images

Web-sized copies live in `/concepts/_media/` (list with sizes in `/concepts/_media/index.json`).
The repo owner approved publishing these copies (2026-11-17), so they are committed. Reference
them from there; never copy them elsewhere in the repo.

- `art-*.webp` - Epic/Fortnite marketing key art and banners (1900x600 headers, 1920x1080 key art,
  1200x630 share images, 576 squares). `art-cltm-evergreen-{boxfights,prophunt,tycoon}-2k.webp` are
  game-type key art - great for "pick a game type" tiles; two of them have transparency.
- `char-*.webp` - transparent cut-out renders of Fortnite outfits, pickaxes, gliders and back blings.
  Ideal for characters breaking out of frames, sticker collages, or a hero line-up.

Use `loading="lazy"` below the fold. Not every image needs to appear.

## Rules for each concept

- One self-contained page: `public/concepts/<slug>/index.html`, with its CSS inline in a `<style>`
  block (or a sibling `style.css` in the same folder). Touch **no other file** in the repo.
- Paths, and this one matters: **relative, never from a web root**. `../_media/...` for images and
  `../../assets/...` for fonts and the logo. `/assets/logo_epic.svg` looks right in a served page and
  breaks in an opened one - these pages get opened straight from disk, where `/assets/` is the drive
  root, and a directory link (`../concepts/other/`) shows a file listing instead of a page. Link to
  `index.html` by name. `tests/paths.test.mjs` fails on both.
- Works at desktop width and at phone width (~400px) with no horizontal scroll.
- Readable contrast (WCAG AA for body text).
- Put a small fixed "Concept N - <name>" tag in a corner so screenshots stay identifiable.
- Do not commit, branch or push - the coordinating session reviews and commits.
- The local server at `http://forgeflavio.localhost:8650/` serves `public/` with live reload, so the
  page is viewable at `http://forgeflavio.localhost:8650/concepts/<slug>/` as soon as it is saved.
  Check it in the browser at both widths before reporting back.
