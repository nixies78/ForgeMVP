# Home page concepts - shared brief (2026-11-17)

Standalone mock-ups of the Forge home page, each in a very different direction, so the owner can compare
ideas. **Static HTML/CSS only** - no app code, no data loading, buttons can be dead links (`href="#"`).
Light inline JS is fine for a flourish (scroll reveal, a ticker), never required.

The nine landing mock-ups, the three page prototypes (questions, lessons, randomiser) and the index that
lists them all are in `public/concepts/<slug>/` and `public/mockups/`.

## What every concept must share

The direction is yours; the frame around it is not, because the mock-ups are compared against each other
and against the app. One header, in every concept:

- **72px tall**, carrying the **Epic mark at 44px** (`../../assets/logo_epic.svg`, `height: 44px;
  width: auto`). Those two numbers are the app's own header (`public/css/shell.css`: `.sh-header-inner {
  min-height: 72px }`, `.sh-logo img { height: 44px }`), and `npm run verify` measures all thirteen pages
  against them, so a mock-up that drifts is reported as a failed check rather than discovered later.
- Your header keeps **your** colours, your dividing rule, your type and your nav - it is the two
  dimensions that are fixed, not the treatment.
- Small-screen rules are yours: the 72/44 contract is the desktop rendering, and a `@media` block may do
  what your design needs below that.

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
