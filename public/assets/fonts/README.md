# Bundled fonts

Two substitute faces from the Fortnite style library (`support/FORTNITE_STYLE_LIBRARY.md`), bundled
locally so the app needs no network and no CDN — it has to work offline and from a local server.

| File | Family | Role in the style |
|---|---|---|
| `archivo-black-latin.woff2` | Archivo Black (400) | The heavy display face: Display, Section, Card title, Action |
| `inter-latin-variable.woff2` | Inter (variable, 100–900) | The UI face: Lead, Body, Navigation, Metadata |

Both are **visual substitutes**, exactly as the poster says: *"Archivo Black / Black Italic
approximates the heavy display face; Inter approximates the UI face. Exact source fonts cannot be
identified from a screenshot alone."*

Downloaded from Google Fonts (latin subset only). Archivo Black ships upright only, so the poster's
italic display styles are rendered by the browser's synthetic oblique — noted in `css/tokens.css`.

## Licence

Both families are under the SIL Open Font License 1.1, which permits bundling and redistribution:

- `OFL-ArchivoBlack.txt` — https://github.com/google/fonts/tree/main/ofl/archivoblack
- `OFL-Inter.txt` — https://github.com/google/fonts/tree/main/ofl/inter

Keep the licence files alongside the fonts; the OFL requires them to travel with the font software.
