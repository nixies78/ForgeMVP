# Brand images

Two images per brand template. Drop them in **this folder** using the exact filenames below and reload the page — no code changes needed. Until a file exists, the page shows a labelled placeholder instead of a broken image, so you can add them one at a time.

## 1. Logo — `<brand_id>_logo.png`

| Spec | Value |
|---|---|
| **Size** | **160 × 160 px** (square) |
| **Format** | PNG with a **transparent background** |
| **Displayed at** | 44 × 44 px (160px keeps it sharp on high-DPI screens) |
| **Scaling** | `object-fit: contain` — the whole logo always fits, nothing is cropped |

Used on the small selection tiles. Keep the mark centred with roughly **10% padding** inside the square so it doesn't touch the edges. It sits on a dark tile (`#12151c`), so make sure the logo reads against dark — add a subtle light outline if the logo is mostly black.

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
| Original (No Brand Template) | `original_logo.png` | `original_hero.jpg` |
| Star Wars | `star_wars_logo.png` | `star_wars_hero.jpg` |
| KPop Demon Hunters | `kpop_demon_hunters_logo.png` | `kpop_demon_hunters_hero.jpg` |
| LEGO | `lego_logo.png` | `lego_hero.jpg` |
| Squid Game | `squid_game_logo.png` | `squid_game_hero.jpg` |
| The Walking Dead | `walking_dead_logo.png` | `walking_dead_hero.jpg` |
| Teenage Mutant Ninja Turtles | `tmnt_logo.png` | `tmnt_hero.jpg` |
| Fall Guys | `fall_guys_logo.png` | `fall_guys_hero.jpg` |

## Adding a new brand later

The picker is fully data-driven. To add a brand, add an entry to `brand_templates` in `uefn_device_logic.json` with an `id`, `label`, `pitch`, `provides`, `images.logo`, `images.hero`, and `restriction_confirmation`, then drop in `<id>_logo.png` and `<id>_hero.jpg`. The tile grid reflows automatically — no layout or code changes required.
