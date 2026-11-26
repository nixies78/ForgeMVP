# Brand images

Two images per brand template, in **this folder**. All eight templates have both files now, so nothing here is a placeholder any more. To change a piece of art, replace the file in place and reload the page — no code changes needed. A file that is missing, or misnamed, shows a labelled placeholder rather than a broken image, so the art can be swapped one file at a time.

## 1. Logo — `<brand_id>_logo.webp`

| Spec | Value |
|---|---|
| **Size** | **512 × 512 px** (square) |
| **Format** | WebP with a **transparent background** (PNG works too, and so does SVG) |
| **Displayed at** | **64 × 64 px** on the selection tiles |
| **Scaling** | `object-fit: contain` — the whole logo always fits, nothing is cropped |

Used on the small selection tiles. Keep the mark centred with roughly **10% padding** inside the square so it doesn't touch the edges. It sits on a dark tile, so make sure the logo reads against dark — add a subtle light outline if the logo is mostly black.

Seven of the eight are the repository's own brand marks, shared with the brand reel on the randomiser mockup (`public/concepts/_media/randomiser/brands/`), so the wizard tile and the reel show the same art. The eighth, `original_logo.svg`, is the "no brand template" tile: it stands for no brand at all, so it is drawn here as a plain block rather than sourced from anywhere.

## 2. Hero / key art — `<brand_id>_hero.jpg`

| Spec | Value |
|---|---|
| **Size** | **1200 × 450 px** (8:3) |
| **Format** | JPG (PNG also fine) |
| **Displayed at** | up to ~750 px wide, scales down responsively |
| **Scaling** | `object-fit: cover` — fills the frame, edges may crop on narrow windows |

The banner at the top of the detail panel. This is the "sell it to me" image, so use proper key art rather than a flat screenshot.

It's a **letterbox shape** — 8:3 is a third shorter than a standard 16:9 frame — so compose for a wide, cinematic crop rather than a full scene. Because it's cropped with `cover`, **keep important detail and any text out of the outer ~5%**.

## Filenames

| Brand | Logo | Hero |
|---|---|---|
| Original (No Brand Template) | `original_logo.svg` | `original_hero.jpg` |
| Star Wars | `star_wars_logo.webp` | `star_wars_hero.jpg` |
| KPop Demon Hunters | `kpop_demon_hunters_logo.webp` | `kpop_demon_hunters_hero.jpg` |
| LEGO | `lego_logo.webp` | `lego_hero.jpg` |
| Squid Game | `squid_game_logo.webp` | `squid_game_hero.jpg` |
| The Walking Dead | `walking_dead_logo.webp` | `walking_dead_hero.jpg` |
| Teenage Mutant Ninja Turtles | `tmnt_logo.webp` | `tmnt_hero.jpg` |
| Fall Guys | `fall_guys_logo.webp` | `fall_guys_hero.jpg` |

## Adding a new brand later

The picker is fully data-driven. To add a brand, add an entry to `brand_templates` in `uefn_device_logic.json` with an `id`, `label`, `pitch`, `provides`, `images.logo`, `images.hero`, and `restriction_confirmation`, then drop in `<id>_logo.webp` and `<id>_hero.jpg`. The tile grid reflows automatically — no layout or code changes required.
