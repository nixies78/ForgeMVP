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
import { measure, ascentOf } from './pdf.mjs';

/** Immutable-ish character grid covering one page, in a scale chosen by the caller. */
export function renderPdfPageToPng(bytes, pageIndex, options = {}) {
  const { scale = 2, background = [255, 255, 255] } = options;
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

function paintPath(canvas, path, fill, stroke, lineWidth, box, scale) {
  const toScreenX = (x) => x * scale;
  const toScreenY = (y) => (box.h - y) * scale;

  if (path.length === 1 && path[0].op === 're') {
    const r = path[0];
    const x0 = toScreenX(r.x);
    const y0 = toScreenY(r.y + r.h);
    const w = r.w * scale;
    const h = r.h * scale;
    if (fill) canvas.fillRect(x0, y0, w, h, fill);
    if (stroke) canvas.strokeRect(x0, y0, w, h, stroke, Math.max(1, lineWidth * scale));
    return;
  }

  /* Everything else is a polyline of line segments and cubics, which covers the rules, the connectors
   * and the rounded rectangles the three structures draw. */
  let cursor = null;
  for (const seg of path) {
    if (seg.op === 'm') {
      cursor = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
    } else if (seg.op === 'l' && cursor) {
      const to = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
      canvas.line(cursor.x, cursor.y, to.x, to.y, stroke || fill, Math.max(1, lineWidth * scale));
      cursor = to;
    } else if (seg.op === 'c' && cursor) {
      /* Flattened into 12 straight segments. At 2x on an A4 page a corner is under three pixels wide,
       * so the difference between this and a true cubic is not visible. */
      const c1 = { x: toScreenX(seg.x1), y: toScreenY(seg.y1) };
      const c2 = { x: toScreenX(seg.x2), y: toScreenY(seg.y2) };
      const to = { x: toScreenX(seg.x), y: toScreenY(seg.y) };
      let prev = cursor;
      for (let i = 1; i <= 12; i += 1) {
        const t = i / 12;
        const pt = cubicAt(cursor, c1, c2, to, t);
        canvas.line(prev.x, prev.y, pt.x, pt.y, stroke || fill, Math.max(1, lineWidth * scale));
        prev = pt;
      }
      cursor = to;
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
 * Glyph shapes come from a 5x7 bitmap defined below, scaled to the requested size. That is a
 * deliberate limitation: this is a proofing view for reviewing *layout* — where the text sits, how much
 * room it takes, whether it collides — and a stretched bitmap says all of that. It is not a
 * facsimile of the printed page and does not pretend to be; the advance widths come from the real font
 * metrics, so the boxes are exactly the printed ones even though the letterforms are schematic.
 */
function drawText(canvas, text, matrix, fontName, size, charSpace, colour, box, scale) {
  const faceKey = FACE_BY_NAME[fontName] || 'regular';
  const baselineY = (box.h - matrix.y) * scale;
  const ascent = Math.max(5, ascentOf(faceKey, size) * scale);
  let penX = matrix.x * scale;

  for (const ch of text) {
    /* The advance comes from the real metrics, so the run ends exactly where the printed run ends —
     * that is what makes this view usable for reviewing layout rather than just for looking at. */
    const advance = (measure(ch, faceKey, size) + charSpace) * scale;
    const bitmap = ch === ' ' ? null : GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS['?'];
    if (bitmap) {
      const rows = bitmap.length;
      const cols = bitmap[0].length;
      /* Glyphs are drawn at a fixed ink height and *centred* in their advance rather than stretched to
       * fill it: stretching makes a full stop as wide as an M, which is precisely the kind of thing
       * this view exists to reveal. */
      const cellH = ascent / 7;
      const cellW = cellH * 0.86;
      const inkWidth = cols * cellW;
      const offset = Math.max(0, (advance - inkWidth) / 2);
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (bitmap[r][c] !== '#') continue;
          canvas.fillRect(
            penX + offset + c * cellW,
            baselineY - ascent + r * cellH,
            Math.max(1, cellW + 0.7),
            Math.max(1, cellH + 0.7),
            colour
          );
        }
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

class Canvas {
  constructor(width, height, background) {
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
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 3;
    this.pixels[i] = Math.round(colour[0] * 255);
    this.pixels[i + 1] = Math.round(colour[1] * 255);
    this.pixels[i + 2] = Math.round(colour[2] * 255);
  }

  fillRect(x, y, w, h, colour) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.set(px, py, colour);
    }
  }

  strokeRect(x, y, w, h, colour, thickness) {
    this.fillRect(x, y, w, thickness, colour);
    this.fillRect(x, y + h - thickness, w, thickness, colour);
    this.fillRect(x, y, thickness, h, colour);
    this.fillRect(x + w - thickness, y, thickness, h, colour);
  }

  /** Bresenham, with a square brush of the requested thickness. */
  line(x0, y0, x1, y1, colour, thickness) {
    if (!colour) return;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    const half = Math.max(0, Math.floor(thickness / 2));
    for (;;) {
      if (half === 0) this.set(x, y, colour);
      else this.fillRect(x - half, y - half, half * 2 + 1, half * 2 + 1, colour);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
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

/* ------------------------------------ glyphs ------------------------------------
 * A 5x7 uppercase bitmap set, plus the lowercase and punctuation the three structures actually use.
 * Schematic on purpose — see the note on `drawText`.
 */
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['.###.', '....#', '.####', '#...#', '#...#', '#..##', '.##.#'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.###.', '#...#', '#....', '#....', '#...#', '.###.', '.....'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.###.', '#...#', '#####', '#....', '#...#', '.###.', '.....'],
  f: ['..##.', '.#...', '####.', '.#...', '.#...', '.#...', '.#...'],
  g: ['.####', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.###.'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '–': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.##..', '.##..', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '/': ['....#', '...#.', '..#..', '..#..', '.#...', '#....', '#....'],
  '\\': ['#....', '.#...', '..#..', '..#..', '...#.', '....#', '....#'],
  '(': ['..#..', '.#...', '#....', '#....', '#....', '.#...', '..#..'],
  ')': ['..#..', '...#.', '....#', '....#', '....#', '...#.', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#..##', '..###', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '©': ['.###.', '#...#', '#.##.', '#.#..', '#.##.', '#...#', '.###.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '◆': ['..#..', '.###.', '#####', '.###.', '..#..', '.....', '.....']
};
