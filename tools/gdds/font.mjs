/**
 * font.mjs — a monoline vector font, so the PNG preview can draw readable text.
 *
 * Why this exists at all: the preview started as a 5x7 bitmap font, which was wrong in a way that took
 * a zoomed crop to see. Its rows ran top-down while the drawing code treated row 0 as the *top of the
 * ascent*, so every glyph had its vertical axis on the same convention as the layout but the shapes
 * themselves were segregated into the wrong half of the em — a lowercase `a`, whose bitmap is two rows
 * of `###` then a row of `#.#`, came out as a blobby `o`-like box. At the 6 to 9pt sizes these
 * structures actually set, the result was not "low resolution", it was unreadable, and a preview whose
 * text cannot be read is a preview that cannot do the one thing it exists for.
 *
 * What replaces it: real letterforms as stroked polylines on the text space's own axes — `y` up from the
 * baseline, `x` right from the glyph's left side bearing — so there is no convention to get backwards.
 * Advances still come from the base-14 font metrics in `pdf.mjs`, so a run still ends exactly where the
 * printed run ends and the layout stays honest; only the letterforms are simplified.
 *
 * The design space matches Helvetica's proportions (1000-unit em, 700 cap height, 500 x-height,
 * -210 descender) so the shapes sit correctly against metrics measured for those fonts, and a stroke
 * weight derived from the real stem widths makes bold look bolder than regular.
 *
 * This is a preview font, not a text face. It is deliberately not in the PDF.
 */

/* Metric landmarks of Helvetica, as fractions of the 1000-unit em. */
export const TEXT_SPACE = {
  em: 1000,
  cap: 700,
  xHeight: 500,
  ascender: 730,
  descender: -210
};

/* The widest the artwork of any glyph gets, so a caller can centre it in its advance. */
const ART_W = 640;

/* ------------------------------------------------------------------------------------------------ */
/* Curve helpers — flatten a quadratic into points, so everything downstream is a polyline            */
/* ------------------------------------------------------------------------------------------------ */

/** One point on a quadratic Bézier. */
function q(p0, c, p1, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

/** A quadratic Bézier as points from `p0` to `p1`, excluding `p0`. */
function arc(p0, c, p1, steps = 10) {
  const out = [];
  for (let i = 1; i <= steps; i += 1) out.push(q(p0, c, p1, i / steps));
  return out;
}

/** A full closed oval by four quadratics. Returns a closed polyline. */
function oval(cx, cy, rx, ry, steps = 8) {
  const top = [cx, cy + ry];
  const bottom = [cx, cy - ry];
  const right = [cx + rx, cy];
  const left = [cx - rx, cy];
  const k = 0.5523;
  return [
    ...arc(top, [cx + rx * k, cy + ry], right, steps),
    ...arc(right, [cx + rx, cy - ry * k], bottom, steps),
    ...arc(bottom, [cx - rx * k, cy - ry], left, steps),
    ...arc(left, [cx - rx, cy + ry * k], top, steps),
    top
  ];
}

/** Half an oval: `'bottom'` draws the lower bowl from left to right. */
function bowl(cx, cy, rx, ry, side, steps = 8) {
  const k = 0.5523;
  const left = [cx - rx, cy];
  const right = [cx + rx, cy];
  const bottom = [cx, cy - ry];
  const top = [cx, cy + ry];
  if (side === 'bottom') {
    return [
      ...arc(left, [cx - rx, cy - ry * k], bottom, steps),
      ...arc(bottom, [cx + rx * k, cy - ry], right, steps)
    ];
  }
  return [
    ...arc(left, [cx - rx, cy + ry * k], top, steps),
    ...arc(top, [cx + rx * k, cy + ry], right, steps)
  ];
}

/** A polyline through points, as a single stroke. */
const s = (...pts) => pts;

/* ------------------------------------------------------------------------------------------------ */
/* The glyph set                                                                                     */
/*                                                                                                   */
/* Each entry is a list of polylines. y is up: baseline 0, x-height 500, cap 700, descender -210.     */
/* ------------------------------------------------------------------------------------------------ */

const H = TEXT_SPACE.xHeight; /* 500 */
const C = TEXT_SPACE.cap; /* 700 */
const A = TEXT_SPACE.ascender; /* 730 */
const D = TEXT_SPACE.descender; /* -210 */
const W = 520; /* the default lowercase body width */

const GLYPHS = {
  /* ---- space and the simple marks ---- */
  ' ': [],
  '!': [s([140, C], [140, 200]), s([140, 80], [140, 0])],
  '"': [s([90, C], [90, 520]), s([240, C], [240, 520])],
  '#': [
    s([60, 190], [430, 190]),
    s([60, 360], [430, 360]),
    s([170, 500], [110, 40]),
    s([330, 500], [270, 40])
  ],
  $: [
    ...(() => {
      const o = oval(250, 290, 190, 210, 9);
      return [o];
    })(),
    s([250, C + 20], [250, -40])
  ],
  '%': [
    oval(130, 430, 105, 105, 7),
    oval(400, 170, 105, 105, 7),
    s([450, 540], [80, 60])
  ],
  '&': [
    [...oval(200, 420, 110, 110, 7)],
    [...arc([190, 320], [470, 60], [330, 40], 10)],
    s([330, 40], [90, 210])
  ],
  "'": [s([120, C], [120, 520])],
  '(': [[...arc([300, C], [40, 350], [190, -60], 12), ...arc([190, -60], [40, -130], [300, D - 80], 12)]],
  ')': [[...arc([90, C], [350, 350], [200, -60], 12), ...arc([200, -60], [350, -130], [90, D - 80], 12)]],
  '*': [
    s([200, 620], [200, 300]),
    s([30, 550], [370, 370]),
    s([30, 370], [370, 550])
  ],
  '+': [s([60, 320], [430, 320]), s([245, 135], [245, 505])],
  ',': [[[140, 70], [150, -30], [60, -130]]],
  '-': [s([60, 280], [400, 280])],
  '.': [[[110, 50], [190, 50], [190, 0], [110, 0], [110, 50]]],
  '/': [s([400, C + 40], [70, D - 40])],

  /* ---- digits ---- */
  0: [[...oval(257, 300, 195, 300, 10), [452, 300], [62, 300]]],
  1: [s([130, 520], [290, C]), s([290, C], [290, 0]), s([110, 0], [450, 0])],
  2: [[...arc([80, 500], [255, 760], [430, 520], 10), ...arc([430, 520], [445, 330], [90, 0], 12), [90, 0], [455, 0]]],
  3: [[...arc([80, 570], [250, 730], [420, 580], 8), ...arc([420, 580], [445, 450], [280, 340], 8), ...arc([280, 340], [470, 240], [420, 20], 9), ...arc([420, 20], [250, -70], [70, 110], 8)]],
  4: [s([330, C], [70, 190]), s([70, 190], [470, 190]), s([330, 460], [330, 0])],
  5: [s([420, C], [110, C]), s([110, C], [100, 380]), [...arc([100, 380], [250, 480], [400, 380], 8), ...arc([400, 380], [520, 120], [250, -20], 10), ...arc([250, -20], [80, 40], [50, 120], 6)]],
  6: [[...arc([400, 700], [80, 380], [80, 240], 10)], [...oval(250, 240, 195, 250, 10)]],
  7: [s([60, C], [470, C]), s([470, C], [180, 0])],
  8: [[...oval(255, 520, 175, 190, 9)], [...oval(255, 240, 205, 235, 10)]],
  9: [[...arc([90, 90], [420, 260], [420, 430], 10)], [...oval(255, 440, 190, 250, 10)]],

  /* ---- uppercase ---- */
  A: [s([125, 0], [270, C]), s([270, C], [415, 0]), s([70, 230], [470, 230])],
  B: [
    s([120, 0], [120, C]),
    s([120, C], [300, C]),
    [...arc([300, C], [430, 540], [300, 375], 8)],
    s([120, 375], [300, 375]),
    [...arc([300, 375], [460, 190], [300, 0], 9)],
    s([120, 0], [300, 0])
  ],
  C: [[...arc([430, 560], [270, 760], [120, 560], 10), ...arc([120, 560], [-10, 350], [120, 140], 10), ...arc([120, 140], [270, -60], [430, 140], 10)]],
  D: [s([120, 0], [120, C]), s([120, C], [260, C]), [...arc([260, C], [500, 400], [260, 0], 12)], s([120, 0], [260, 0])],
  E: [s([120, 0], [120, C]), s([120, C], [450, C]), s([120, 375], [390, 375]), s([120, 0], [450, 0])],
  F: [s([120, 0], [120, C]), s([120, C], [450, C]), s([120, 375], [390, 375])],
  G: [[...arc([430, 560], [270, 760], [120, 560], 10), ...arc([120, 560], [-10, 350], [120, 140], 10), ...arc([120, 140], [270, -60], [430, 140], 10)], s([430, 140], [430, 320]), s([430, 320], [290, 320])],
  H: [s([120, 0], [120, C]), s([430, 0], [430, C]), s([120, 355], [430, 355])],
  I: [s([160, 0], [160, C])],
  J: [s([400, C], [400, 150]), [...arc([400, 150], [250, -60], [70, 130], 10)]],
  K: [s([120, 0], [120, C]), s([430, C], [120, 330]), s([210, 400], [440, 0])],
  L: [s([120, 0], [120, C]), s([120, 0], [420, 0])],
  M: [s([110, 0], [110, C]), s([110, C], [285, 190]), s([285, 190], [460, C]), s([460, C], [460, 0])],
  N: [s([120, 0], [120, C]), s([120, C], [440, 0]), s([440, 0], [440, C])],
  O: [[...oval(275, 350, 210, 350, 11)]],
  P: [s([120, 0], [120, C]), s([120, C], [300, C]), [...arc([300, C], [480, 480], [300, 360], 9)], s([120, 360], [300, 360])],
  Q: [[...oval(275, 350, 210, 350, 11)], s([340, 140], [490, -30])],
  R: [s([120, 0], [120, C]), s([120, C], [300, C]), [...arc([300, C], [480, 480], [300, 360], 9)], s([120, 360], [300, 360]), s([250, 360], [450, 0])],
  S: [[...arc([440, 570], [275, 750], [110, 580], 9), ...arc([110, 580], [-20, 440], [200, 370], 9), ...arc([200, 370], [450, 300], [440, 120], 10), ...arc([440, 120], [275, -70], [80, 110], 9)]],
  T: [s([275, 0], [275, C]), s([60, C], [490, C])],
  U: [[...arc([120, C], [120, 90], [290, 0], 12), ...arc([290, 0], [460, 90], [460, C], 12)]],
  V: [s([80, C], [280, 0]), s([280, 0], [480, C])],
  W: [s([60, C], [185, 0]), s([185, 0], [300, 480]), s([300, 480], [415, 0]), s([415, 0], [540, C])],
  X: [s([90, 0], [460, C]), s([460, 0], [90, C])],
  Y: [s([90, C], [275, 340]), s([460, C], [275, 340]), s([275, 340], [275, 0])],
  Z: [s([90, C], [460, C]), s([460, C], [90, 0]), s([90, 0], [460, 0])],

  /* ---- lowercase ---- */
  a: [[...oval(255, 250, 175, 250, 9)], s([430, H], [430, 0])],
  b: [s([110, 0], [110, A]), [...oval(295, 250, 185, 250, 9)]],
  c: [[...arc([415, 390], [255, 540], [110, 400], 8), ...arc([110, 400], [-20, 250], [110, 100], 8), ...arc([110, 100], [255, -60], [415, 110], 8)]],
  d: [s([440, 0], [440, A]), [...oval(255, 250, 185, 250, 9)]],
  e: [
    s([80, 260], [440, 260]),
    [...arc([440, 260], [270, 520], [110, 400], 9)],
    [...arc([110, 400], [-20, 250], [110, 100], 8)],
    [...arc([110, 100], [255, -60], [420, 100], 8)]
  ],
  f: [
    [...arc([330, 660], [215, 760], [150, 640], 8)],
    s([150, 640], [150, 0]),
    s([20, H], [290, H])
  ],
  g: [
    [...oval(285, 250, 175, 250, 9)],
    s([460, H], [460, -40]),
    [...arc([460, -40], [290, D - 40], [115, 20], 10)]
  ],
  h: [s([110, 0], [110, A]), [...arc([110, 380], [300, 580], [450, 380], 9)], s([450, 380], [450, 0])],
  i: [s([110, 0], [110, H]), s([110, 640], [110, 660])],
  j: [s([140, H], [140, -80]), [...arc([140, -80], [30, D - 40], [-30, -60], 8)], s([140, 640], [140, 660])],
  k: [s([110, 0], [110, A]), s([400, H], [110, 200]), s([210, 290], [420, 0])],
  l: [s([130, 0], [130, A])],
  m: [
    s([110, 0], [110, H]),
    [...arc([110, 360], [245, 550], [360, 360], 9)],
    s([360, 360], [360, 0]),
    [...arc([360, 360], [490, 550], [600, 360], 9)],
    s([600, 360], [600, 0])
  ],
  n: [s([110, 0], [110, H]), [...arc([110, 370], [295, 570], [450, 370], 9)], s([450, 370], [450, 0])],
  o: [[...oval(255, 250, 185, 250, 9)]],
  p: [s([110, D], [110, H]), [...oval(295, 250, 185, 250, 9)]],
  q: [s([460, D], [460, H]), [...oval(275, 250, 185, 250, 9)]],
  r: [s([110, 0], [110, H]), [...arc([110, 350], [255, 560], [410, 390], 8)]],
  s: [[...arc([390, 415], [250, 550], [110, 425], 8), ...arc([110, 425], [10, 330], [180, 275], 7), ...arc([180, 275], [400, 215], [390, 70], 8), ...arc([390, 70], [240, -60], [70, 80], 8)]],
  t: [s([160, 640], [160, 90]), [...arc([160, 90], [280, -50], [390, 40], 8)], s([10, H], [310, H])],
  u: [[...arc([110, H], [110, 130], [280, 0], 10), ...arc([280, 0], [430, 120], [450, H], 10)]],
  v: [s([60, H], [250, 0]), s([250, 0], [440, H])],
  w: [s([40, H], [150, 0]), s([150, 0], [255, 400]), s([255, 400], [360, 0]), s([360, 0], [470, H])],
  x: [s([70, 0], [430, H]), s([430, 0], [70, H])],
  y: [s([60, H], [255, 60]), s([440, H], [175, D])],
  z: [s([80, H], [420, H]), s([420, H], [80, 0]), s([80, 0], [420, 0])],

  /* ---- punctuation and the rest of the printable set ---- */
  ':': [s([140, 380], [140, 300]), s([140, 90], [140, 10])],
  ';': [s([140, 380], [140, 300]), s([140, 90], [150, -20]), s([150, -20], [60, -120])],
  '<': [s([420, 470], [80, 280]), s([80, 280], [420, 90])],
  '=': [s([70, 380], [430, 380]), s([70, 190], [430, 190])],
  '>': [s([80, 470], [420, 280]), s([420, 280], [80, 90])],
  '?': [[...arc([100, 500], [250, 780], [400, 520], 10), ...arc([400, 520], [410, 380], [255, 300], 8)], s([255, 300], [255, 220]), s([255, 90], [255, 0])],
  '@': [
    [...oval(300, 280, 180, 200, 9)],
    [...oval(300, 280, 300, 320, 11)],
    s([580, 100], [600, 300])
  ],
  '[': [s([320, C], [120, C]), s([120, C], [120, -60]), s([120, -60], [320, -60])],
  '\\': [s([70, C + 40], [400, D - 40])],
  ']': [s([100, C], [300, C]), s([300, C], [300, -60]), s([300, -60], [100, -60])],
  '^': [s([80, 460], [260, 700]), s([260, 700], [440, 460])],
  _: [s([0, -140], [540, -140])],
  '`': [s([90, C], [230, 600])],
  '{': [
    [...arc([330, C], [200, C], [200, 400], 8)],
    s([200, 400], [200, 280]),
    [...arc([200, 280], [120, 180], [200, 80], 8)],
    s([200, 80], [200, -40]),
    [...arc([200, -40], [200, -160], [330, -160], 8)]
  ],
  '|': [s([140, C + 40], [140, D - 40])],
  '}': [
    [...arc([110, C], [240, C], [240, 400], 8)],
    s([240, 400], [240, 280]),
    [...arc([240, 280], [320, 180], [240, 80], 8)],
    s([240, 80], [240, -40]),
    [...arc([240, -40], [240, -160], [110, -160], 8)]
  ],
  '~': [[...arc([70, 340], [170, 470], [270, 340], 7), ...arc([270, 340], [370, 210], [470, 340], 7)]],
  '·': [[[240, 340], [320, 340], [320, 260], [240, 260], [240, 340]]],
  '—': [s([0, 300], [560, 300])],
  '–': [s([0, 300], [500, 300])],
  /* WinAnsi puts the dashes on control code points — an em dash is byte 0x13, not U+2014 — so the
   * preview is handed `\u0013` and `\u0014` after the writer's encoding pass. Without these entries the
   * commonest character in these documents drew as a missing-glyph box, which is how they were noticed. */
  '\u0013': [s([0, 300], [560, 300])],
  '\u0014': [s([0, 300], [500, 300])],
  '“': [s([70, C], [70, 520]), s([220, C], [220, 520])],
  '”': [s([110, C], [110, 520]), s([260, C], [260, 520])],
  '‘': [s([120, C], [120, 520])],
  '’': [s([120, C], [120, 520])],
  '…': [
    [[60, 50], [110, 50], [110, 0], [60, 0], [60, 50]],
    [[220, 50], [270, 50], [270, 0], [220, 0], [220, 50]],
    [[380, 50], [430, 50], [430, 0], [380, 0], [380, 50]]
  ],
  '→': [s([60, 250], [420, 250]), s([420, 250], [300, 370]), s([420, 250], [300, 130])],
  '↳': [s([80, 520], [80, 140]), s([80, 140], [130, 80]), s([130, 80], [420, 80]), s([420, 80], [330, 170]), s([420, 80], [330, -10])],
  '≈': [
    [...arc([60, 330], [160, 460], [260, 330], 7), ...arc([260, 330], [360, 200], [460, 330], 7)],
    [...arc([60, 140], [160, 270], [260, 140], 7), ...arc([260, 140], [360, 10], [460, 140], 7)]
  ],
  '•': [[...oval(255, 250, 105, 105, 7)]]
};

/* Anything not drawn explicitly. A visible box is the right answer for a preview: it says "this
 * character exists and I do not have it", which is more useful than a blank that could be a space. */
const FALLBACK = [
  [[80, 0], [400, 0], [400, 700], [80, 700], [80, 0]],
  s([80, 0], [400, 700]),
  s([80, 700], [400, 0])
];

/* The artwork width of each glyph, so the caller can centre it in the real advance — and, at the same
 * time, a check that every glyph is shaped the way the rest of this module assumes.
 *
 * The check is not ceremony. Handing a glyph one level of nesting too few produces `[[x, y], ...]`
 * instead of `[[[x, y], ...]]`, which throws inside a `for...of` the first time that character is
 * drawn — three times already while this file was being written, each time as a render-time crash
 * whose message named a line rather than a glyph. Raising at import, naming the glyph and the strand,
 * turns that into a one-line diagnosis. */
const WIDTHS = new Map();
for (const [ch, strokes] of Object.entries(GLYPHS)) {
  if (!Array.isArray(strokes)) throw new Error(`font: glyph ${JSON.stringify(ch)} is not a list`);
  let max = 0;
  strokes.forEach((line, index) => {
    if (!Array.isArray(line) || line.length === 0) {
      throw new Error(`font: glyph ${JSON.stringify(ch)} strand ${index} is not a non-empty polyline`);
    }
    for (const point of line) {
      if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new Error(
          `font: glyph ${JSON.stringify(ch)} strand ${index} has a malformed point ${JSON.stringify(point)} — ` +
            'a strand is a list of [x, y] pairs, and a glyph is a list of strands'
        );
      }
      max = Math.max(max, point[0]);
    }
  });
  WIDTHS.set(ch, max);
}

/** The widest x in a glyph's artwork. */
function artWidth(ch) {
  return WIDTHS.get(ch) ?? ART_W;
}

/**
 * The strokes for one character, drawn into the box `[x, x + advance]` with the baseline at `baselineY`.
 *
 * `x` and `baselineY` are in *canvas* pixels, `y` increasing downward, and `size` is in pixels — so the
 * caller has already applied the page scale. The glyph is centred in its advance rather than stretched
 * to fill it, because stretching makes a full stop as wide as an `M`, which is the single most useful
 * thing a layout preview can show.
 *
 * Returns polylines in canvas space, ready to stroke.
 */
export function glyphPolylines(ch, x, advance, baselineY, size) {
  const strokes = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? FALLBACK;
  if (!strokes.length) return [];
  const unit = size / TEXT_SPACE.em;
  const body = artWidth(ch) * unit;
  const offset = x + Math.max(0, (advance - body) / 2);
  return strokes.map((line) =>
    line.map(([gx, gy]) => [offset + gx * unit, baselineY - gy * unit])
  );
}

/**
 * The stem weight to stroke a glyph with, in canvas pixels.
 *
 * Taken from the face's real stem-to-size ratio rather than a constant, so a bold run reads as bolder
 * than a regular one in the preview — which matters, because half these structures' hierarchy is
 * carried by weight alone.
 */
export function strokeWeight(faceFamily, faceStyle, size) {
  const bold = faceStyle === 'bold' || faceStyle === 'boldItalic';
  if (faceFamily === 'courier') return bold ? Math.max(1, size * 0.115) : Math.max(1, size * 0.075);
  if (faceFamily === 'times') return bold ? Math.max(1, size * 0.1) : Math.max(0.9, size * 0.055);
  return bold ? Math.max(1.1, size * 0.105) : Math.max(1, size * 0.062);
}

/** How many characters this font can draw. Used by the tests. */
export function glyphCount() {
  return Object.keys(GLYPHS).length;
}

/**
 * Whether this font has real artwork for a character.
 *
 * The preview falls back to a visible box for anything it cannot draw, which is the right behaviour —
 * a box says "this character is here and I do not have it", where a blank could be a space. But a
 * fallback box in a preview is a small lie about the printed page, so the tests assert that every
 * character the three structures actually print resolves to real artwork.
 */
export function hasGlyph(ch) {
  if (GLYPHS[ch]) return true;
  const upper = ch.toUpperCase();
  return upper !== ch && Boolean(GLYPHS[upper]);
}
