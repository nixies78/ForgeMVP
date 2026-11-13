# Home screen — "how do you want to design your game?" panels

Three panels on the home screen, one image each. Drop the files in **this folder**
using the exact filenames below and reload the page — no code changes needed.
Until a file exists, the card shows a labelled placeholder telling you the
filename and size, so you can add them one at a time.

## Spec (all three images)

| Spec | Value |
|---|---|
| **Size** | **900 × 600 px** (3:2) |
| **Format** | JPG (PNG also fine) |
| **Displayed at** | ~257 × 171 px in a 3-column row; full card width on mobile |
| **Scaling** | `object-fit: cover` — fills the frame, edges may crop |

The panels sit side by side, so they read as a set: **keep the three consistent**
in framing, colour temperature and busyness. A single clear focal point works far
better than a detailed scene at this size.

Because they're cropped with `cover`, **keep important detail and any text out of
the outer ~5%**. On narrow windows the card goes full width and the crop shifts,
so don't rely on exact edge positions.

Cards sit on a dark panel (`#1f232c`), so images that fade to dark at the bottom
blend in nicely. Avoid pure-white backgrounds — they glare against the dark UI.

## Filenames

| Panel | Filename | Suggested subject |
|---|---|---|
| Answer Questions | `guided.jpg` | A clear, orderly idea — a branching path, checklist, or step-by-step feel |
| Randomise | `randomise.jpg` | The wheel itself — spinning, colourful, a bit of motion blur |
| Chat with AI | `ai_chat.jpg` | Conversation — speech bubbles, a chat panel, or two-way exchange |

## Changing the copy or the order

All three panels are defined in one place in `uefn_game_wizard.html` — the
`DESIGN_MODES` array. Each entry has:

| Field | What it does |
|---|---|
| `label` | Panel heading |
| `description` | Body text under the heading |
| `button` | Button label |
| `icon` | Emoji shown in the placeholder before the image exists |
| `image` | Path to the image, relative to the HTML file |
| `status` | `live` routes into the real flow · `placeholder` shows the stub page |

Reorder the array to reorder the panels. Flip a `status` to `live` once its tool
is built and wire its button in `designModeCards()`.

The recommended size shown in the on-screen placeholder comes from
`DESIGN_MODE_ART_SPEC` — update it there and here together if the spec changes.
