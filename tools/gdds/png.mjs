/**
 * png.mjs — render a page of our own PDF to a PNG.
 *
 * Why: the three structures are proposals about *layout*, and a layout cannot be reviewed as text. The
 * usual answer is to print the page with a browser and screenshot it, and that is exactly what is not
 * available here — headless Chrome will not start inside this sandbox (its multi-process IPC needs
 * named pipes, which confined modes deny), and there is no image library in a repo whose only runtime
 * dependency is Node.
 *
 * What is available is that we wrote the PDF ourselves, so we know its dialect exactly: absolute text
 * matrices, filled and stroked rectangles, rounded rectangles, lines, circles, and the metrics of the
 * base-14 fonts. So this is not a general PDF renderer and does not try to be — it is a viewer for the
 * subset `pdf.mjs` emits, which is enough to see the page, and it fails loudly on anything it does not
 * recognise rather than silently drawing a page with a hole in it.
 *
 * Screen only. Never used for the printed document, which is the PDF itself.
 */

import zlib from 'node:zlib';
import { measure, FACES } from './pdf.mjs';
import { glyphPolylines, strokeWeight } from './font.mjs';

/**
 * One page of a PDF as a PNG.
 *
 * `background` is paper: three floats in 0..1, matching a PDF `rg` operator. It defaults to white,
 * which is what an A4 sheet is and what every page here assumes — the structures draw dark rules and
 * dark text and never paint a page background, so the paper is whatever the viewer provides.
 */
export function renderPdfPageToPng(bytes, pageIndex, options = {}) {
  const { scale = 2, background = [1, 1, 1] } = options;
  const s = bytes.toString('latin1');

  /* ---- page box ---- */
  const pageBoxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => ({
    w: Number(m[1]),
    h: Number(m[2])
  }));
  const box = pageBoxes[pageIndex];
  if (!box) throw new Error(`png: no /MediaBox for page ${pageIndex + 1}`);

  const width = Math.round(box.w * scale);
  const height = Math.round(box.h * scale);
  const canvas = new Canvas(width, height, background);

  /* ---- content streams, in page order ---- */
  const streams = [];
  for (const match of s.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) continue;
    let raw = Buffer.from(s.slice(start, end), 'latin1');
    if (raw.length > 1 && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
    try {
      const text = zlib.inflateSync(raw).toString('latin1');
      if (/\bBT\b/.test(text)) streams.push(text);
    } catch {
      /* not our content stream */
    }
  }
  const content = streams[pageIndex];
  if (!content) throw new Error(`png: page ${pageIndex + 1} has no content stream`);

  interpret(content, canvas, box, scale);

  return canvas.toPng();
}

/* ------------------------------- the interpreter ------------------------------- */

/**
 * Draw one page's content stream.
 *
 * One operator per line is not a parsing shortcut — it is the format `pdf.mjs` emits, and the painter
 * relies on it. Anything unrecognised **throws** rather than being skipped: a page that renders with a
 * silent hole in it is worse than one that refuses to render, because the hole looks like a design
 * decision to whoever is reviewing the layout.
 */
function interpret(content, canvas, box, scale) {
  let fill = [0, 0, 0];
  let stroke = [0, 0, 0];
  let lineWidth = 1;
  let font = 'F1';
  let fontSize = 10;
  let charSpace = 0;
  let path = [];
  let textMatrix = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === 'BT') {
      textMatrix = null;
      continue;
    }
    if (line === 'ET') continue;

    let m;
    if ((m = line.match(/^([\d.]+) ([\d.]+) ([\d.]+) rg$/))) {
      fill = [+m[1], +m[2], +m[3]];
      continue;
    }
    if ((m = line.match(/^([\d.]+) ([\d.]+) ([\d.]+) RG$/))) {
      stroke = [+m[1], +m[2], +m[3]];
      continue;
    }
    if ((m = line.match(/^([\d.]+) w$/))) {
      lineWidth = +m[1];
      continue;
    }
    if (/^(\[[\d ]*\] \d+ d|\[\] 0 d)$/.test(line)) continue;
    if ((m = line.match(/^\/(F\d+) ([\d.]+) Tf$/))) {
      font = m[1];
      fontSize = +m[2];
      continue;
    }
    if ((m = line.match(/^([-\d.]+) Tc$/))) {
      charSpace = +m[1];
      continue;
    }
    if ((m = line.match(/^1 0 0 1 ([-\d.]+) ([-\d.]+) Tm$/))) {
      textMatrix = { x: +m[1], y: +m[2] };
      continue;
    }
    if ((m = line.match(/^\(((?:\\.|[^\\()])*)\) Tj$/))) {
      if (!textMatrix) continue;
      const text = m[1].replace(/\\([\\()])/g, '$1');
      drawText(canvas, text, textMatrix, font, fontSize, charSpace, fill, box, scale);
      continue;
    }
    if ((m = line.match(/^([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re$/))) {
      path = [{ op: 're', x: +m[1], y: +m[2], w: +m[3], h: +m[4] }];
      continue;
    }
    if ((m = line.match(/^([-\d.]+) ([-\d.]+) m$/))) {
      path = [{ op: 'm', x: +m[1], y: +m[2] }];
      continue;
    }
    if ((m = line.match(/^([-\d.]+) ([-\d.]+) l$/))) {
      path.push({ op: 'l', x: +m[1], y: +m[2] });
      continue;
    }
    if ((m = line.match(/^([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) c$/))) {
      path.push({ op: 'c', x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], x: +m[5], y: +m[6] });
      continue;
    }
    if (line === 'f') {
      paintPath(canvas, path, fill, null, lineWidth, box, scale);
      path = [];
      continue;
    }
    if (line === 'S') {
      paintPath(canvas, path, null, stroke, lineWidth, box, scale);
      path = [];
      continue;
    }
    if (line === 'n') {
      path = [];
      continue;
    }
    throw new Error(`png: unrecognised content-stream operator: ${line.slice(0, 60)}`);
  }
}

/* ----------------------------------- painting ----------------------------------- */

/**
 * Flatten a path into a polyline in canvas space, cursor-following and all.
 *
 * Shared by the filler and the stroker so a shape's outline and its interior cannot disagree — which is
 * the class of bug that produced a hollow rounded rectangle where a filled one was drawn.
 */
function flattenPath(path, box, scale) {
  const toScreenX = (x) => x * scale;
  const toScreenY = (y) => (box.h - y) * scale;
  const points = [];
  let cursor = null;

  for (const seg of path) {
    if (seg.op === 'm') {
      cursor = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
      points.push(cursor);
    } else if (seg.op === 'l' && cursor) {
      cursor = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
      points.push(cursor);
    } else if (seg.op === 'c' && cursor) {
      /* Flattened into 12 straight segments. At 3x on an A4 page a corner is under four pixels wide, so
       * the difference between this and a true cubic is not visible. */
      const c1 = { x: toScreenX(seg.x1), y: toScreenY(seg.y1) };
      const c2 = { x: toScreenX(seg.x2), y: toScreenY(seg.y2) };
      const to = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
      let prev = cursor;
      for (let i = 1; i <= 12; i += 1) {
        const pt = cubicAt(cursor, c1, c2, to, i / 12);
        points.push(pt);
        prev = pt;
      }
      cursor = to;
    }
  }
  return points;
}

function paintPath(canvas, path, fill, stroke, lineWidth, box, scale) {
  if (path.length === 1 && path[0].op === 're') {
    const r = path[0];
    const x0 = r.x * scale;
    const y0 = (box.h - (r.y + r.h)) * scale;
    const w = r.w * scale;
    const h = r.h * scale;
    if (fill) canvas.fillRect(x0, y0, w, h, fill);
    if (stroke) canvas.strokeRect(x0, y0, w, h, stroke, Math.max(1, lineWidth * scale));
    return;
  }

  /* Everything else is a polyline of line segments and cubics: the rules, the connectors, the arrows,
   * and the rounded rectangles. Those last ones carry both a fill and a stroke, so both are honoured
   * here rather than only the stroke. */
  const points = flattenPath(path, box, scale);

  if (fill && points.length >= 3) canvas.fillPolygon(points, fill);
  if (stroke) {
    for (let i = 0; i + 1 < points.length; i += 1) {
      canvas.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, stroke, Math.max(1, lineWidth * scale));
    }
  }
}

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}

/**
 * Draw a text run.
 *
 * Glyph shapes come from `font.mjs`, a monoline vector font drawn on the text space's own axes, and are
 * stroked as polylines. Advances come from the real base-14 metrics, so a run ends exactly where the
 * printed run ends — which is what makes this view usable for reviewing layout rather than only for
 * looking at.
 *
 * This used to draw a 5x7 bitmap, and that was a mistake worth recording: the bitmap's rows ran
 * top-down while this function placed row 0 at the top of the ascent, so every glyph's shapes ended up
 * in the wrong half of the em and the letters were unrecognisable — a lowercase `a` drew as a blobby
 * box. At the 6 to 9pt sizes these structures set, the preview was unreadable rather than merely
 * coarse. Strokes on real axes have no convention to invert, and a caller can see what the page says.
 */
function drawText(canvas, text, matrix, fontName, size, charSpace, colour, box, scale) {
  const faceKey = FACE_BY_NAME[fontName] || 'regular';
  const face = FACES[faceKey] || FACES.regular;
  const baselineY = (box.h - matrix.y) * scale;
  const points = size * scale;
  const weight = strokeWeight(face.family, face.style, points);
  let penX = matrix.x * scale;

  for (const ch of text) {
    /* The advance comes from the real metrics, so the run ends exactly where the printed run ends. */
    const advance = (measure(ch, faceKey, size) + charSpace) * scale;
    if (ch !== ' ') {
      for (const line of glyphPolylines(ch, penX, advance, baselineY, points)) {
        for (let i = 1; i < line.length; i += 1) {
          canvas.line(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], colour, weight);
        }
        /* A single-point stroke (a dot) has nothing to join, so it is stamped. */
        if (line.length === 1) canvas.dot(line[0][0], line[0][1], colour, weight);
      }
    }
    penX += advance;
  }
}

const FACE_BY_NAME = {
  F1: 'regular',
  F2: 'bold',
  F3: 'italic',
  F4: 'boldItalic',
  F5: 'serif',
  F6: 'serifBold',
  F7: 'serifItalic',
  F8: 'serifBoldItalic',
  F9: 'mono',
  F10: 'monoBold',
  F11: 'monoItalic',
  F12: 'monoBoldItalic'
};

/* ------------------------------------- canvas ------------------------------------- */

/**
 * A page raster: a flat RGB buffer, `width * height * 3` bytes, with the paper already laid down.
 *
 * Exported so a test can assert the paper colour reaches the pixels, which is not a hypothetical: every
 * preview was reviewed for a while with the page rendering on **near-black instead of white**.
 *
 * The colours here are the writer's own: three floats in 0..1, the same form as a PDF `rg` operator and
 * the same form `blend` takes. They used to be 0..255 while the constructor scaled them as though they
 * were 0..1, so white arrived as `255 * 255 = 65025` and a `Buffer` — which truncates rather than
 * clamping — stored byte `1`. The paper was `rgb(1,1,1)`, the text was drawn over it in white and dark
 * greys, and the pages read as black with faint light lettering. Nothing failed, because a very dark
 * grey is a perfectly valid raster.
 *
 * One unit for the whole module now, and it is the unit the content stream already uses.
 */
export class Canvas {
  constructor(width, height, background = [1, 1, 1]) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 3);
    const [r, g, b] = background.map((c) => Math.round(c * 255));
    for (let i = 0; i < width * height; i += 1) {
      this.pixels[i * 3] = r;
      this.pixels[i * 3 + 1] = g;
      this.pixels[i * 3 + 2] = b;
    }
  }

  set(x, y, colour) {
    this.blend(Math.round(x), Math.round(y), colour, 1);
  }

  /**
   * Fill a closed polygon, anti-aliased, by sampling each pixel's centre against the shape.
   *
   * This exists because `paintPath` only ever *filled* a bare `re`. Everything with a corner radius —
   * `roundRect`, which the brief's loop-entry box and the sprint pack's phase chips use — arrives as
   * moveto/lineto/curveto, and for those the old code took the `stroke || fill` branch and stroked the
   * outline instead. The result was a hollow box where the design called for a filled dark one, drawn in
   * the fill colour at a default line width. It looked like a deliberate white panel with a dark border,
   * which is exactly why it survived a review.
   *
   * Winding by crossing count, which is correct for the simple convex shapes drawn here and costs one
   * pass over the segments per row.
   */
  fillPolygon(points, colour) {
    if (points.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));

    for (let py = y0; py <= y1; py += 1) {
      const cy = py + 0.5;
      const crossings = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (a.y === b.y) continue;
        const lo = a.y < b.y ? a : b;
        const hi = a.y < b.y ? b : a;
        if (cy < lo.y || cy >= hi.y) continue;
        /* Horizontal position where this edge crosses the sample row. */
        crossings.push(lo.x + ((cy - lo.y) / (hi.y - lo.y)) * (hi.x - lo.x));
      }
      if (!crossings.length) continue;
      crossings.sort((m, n) => m - n);

      for (let i = 0; i + 1 < crossings.length; i += 2) {
        /* Span between a pair of crossings, with the ends anti-aliased over one pixel. */
        const spanFrom = crossings[i];
        const spanTo = crossings[i + 1];
        const first = Math.max(0, Math.floor(spanFrom));
        const last = Math.min(this.width - 1, Math.ceil(spanTo) - 1);
        for (let px = first; px <= last; px += 1) {
          const left = Math.max(px, spanFrom);
          const right = Math.min(px + 1, spanTo);
          const coverage = right - left;
          if (coverage > 0) this.blend(px, py, colour, coverage);
        }
      }
    }
  }

  /**
   * Composite `colour` over one pixel at `coverage` (0..1).
   *
   * Anti-aliasing is not cosmetic here. A text glyph is drawn as polylines of a stroke about a pixel
   * wide, and at the 6 to 9pt sizes these structures set, a rounded brush that lands on whole pixels
   * leaves gaps in the stems: the text reads as dashes rather than letters. Coverage blending turns
   * those gaps into grey, which is what the eye reads as a stroke.
   */
  blend(px, py, colour, coverage) {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    if (coverage <= 0) return;
    const a = Math.min(1, coverage);
    const i = (py * this.width + px) * 3;
    for (let c = 0; c < 3; c += 1) {
      const dst = this.pixels[i + c];
      const src = colour[c] * 255;
      this.pixels[i + c] = dst + (src - dst) * a;
    }
  }

  /**
   * An axis-aligned rectangle with fractional edges, anti-aliased on all four.
   *
   * This is the primitive everything filled goes through — text strokes, rules, panels — so the
   * coverage maths lives here once rather than in each caller. A rectangle whose edges land on pixel
   * boundaries costs the same as before, because every coverage comes out as exactly 1.
   */
  fillRect(x, y, w, h, colour) {
    if (!colour || w <= 0 || h <= 0) return;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py += 1) {
      /* Vertical coverage: the overlap of [y, y+h) with this pixel's row. */
      const cy = Math.min(y + h, py + 1) - Math.max(y, py);
      if (cy <= 0) continue;
      for (let px = x0; px < x1; px += 1) {
        const cx = Math.min(x + w, px + 1) - Math.max(x, px);
        if (cx <= 0) continue;
        this.blend(px, py, colour, cx * cy);
      }
    }
  }

  strokeRect(x, y, w, h, colour, thickness) {
    this.fillRect(x, y, w, thickness, colour);
    this.fillRect(x, y + h - thickness, w, thickness, colour);
    this.fillRect(x, y, thickness, h, colour);
    this.fillRect(x + w - thickness, y, thickness, h, colour);
  }

  /** A dot, for a single-point stroke such as the `i` tittle in `font.mjs`. */
  dot(cx, cy, colour, thickness) {
    this.line(cx - 0.01, cy, cx + 0.01, cy, colour, thickness);
  }

  /**
   * A line of the given width, anti-aliased.
   *
   * Coverage is the pixel's distance to the segment, which is what makes a one-pixel-wide stroke come
   * out as a stroke rather than a staircase of blocks. Bresenham with an integer square brush was the
   * previous implementation and it is the wrong tool for this: it cannot draw a stroke thinner than a
   * pixel, so every glyph at 6pt was drawn at roughly double its intended stem weight and broke into
   * dashes where a rounded brush left gaps.
   *
   * The distance test is done over the segment's bounding box only, so the cost is proportional to the
   * stroke's own area rather than to the page.
   */
  line(x0, y0, x1, y1, colour, thickness) {
    if (!colour) return;
    const half = Math.max(0.35, thickness / 2);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half - 1));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(x0, x1) + half + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half - 1));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(y0, y1) + half + 1));

    const vx = x1 - x0;
    const vy = y1 - y0;
    const lenSq = vx * vx + vy * vy;

    for (let py = minY; py <= maxY; py += 1) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px += 1) {
        const cx = px + 0.5;
        /* Distance from the pixel centre to the segment, clamped to the segment's ends. */
        let t = lenSq > 0 ? ((cx - x0) * vx + (cy - y0) * vy) / lenSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = cx - (x0 + t * vx);
        const dy = cy - (y0 + t * vy);
        const dist = Math.sqrt(dx * dx + dy * dy);
        /* Coverage falls off over one pixel at the stroke's edge. */
        const coverage = half + 0.5 - dist;
        if (coverage > 0) this.blend(px, py, colour, Math.min(1, coverage));
      }
    }
  }

  /** A PNG with no interlacing, no palette, no alpha: one IHDR, one zlib IDAT, one IEND. */
  toPng() {
    const raw = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y += 1) {
      raw[y * (this.width * 3 + 1)] = 0; /* filter type 0: none */
      this.pixels.copy(raw, y * (this.width * 3 + 1) + 1, y * this.width * 3, (y + 1) * this.width * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; /* bit depth */
    ihdr[9] = 2; /* colour type: truecolour */
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0))
    ]);
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, crc]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
