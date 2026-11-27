/**
 * pdf.mjs — a small, dependency-free PDF writer.
 *
 * Why this exists rather than "print the page with Chrome": a hosted Forge has no browser to drive,
 * and the two obvious shortcuts both fail. Headless Chrome does not run inside the build sandbox
 * (its own multi-process IPC needs named pipes, which confined modes deny: "FATAL
 * mojo\public\cpp\platform\platform_channel.cc: Check failed: . : Access is denied"), and a
 * client-side `window.print()` hands the user a print dialog with the app's own chrome in the
 * margins. Writer libraries (pdfkit, pdf-lib, @react-pdf) mean a dependency tree inside a repo whose
 * only runtime dependency today is Node itself.
 *
 * What is left is the format. A PDF that uses the fourteen fonts every reader already has is a
 * header, a page tree, one content stream per page and an xref table — and a content stream is
 * PostScript-shaped text that Node's own zlib can compress. So the whole writer is here, it has no
 * install step, it runs on a server and in a test, and its layout arithmetic is exact: nothing can
 * reflow between the editor and the printer, because we place every glyph ourselves.
 *
 * Fonts: the base-14 with WinAnsiEncoding, so the file carries no embedded font data and opens
 * anywhere. That is a real trade — the app's own Inter and Archivo Black are woff2, which a PDF
 * reader cannot consume, so the branded type would have to be subsetted from TTF. See
 * support/gdd-export.md for what that costs and when it is worth paying.
 */

import zlib from 'node:zlib';

/* --------------------------------- base-14 fonts --------------------------------- */

/**
 * Helvetica, Times and Courier metrics. These are exact AFM advance widths, not estimates: getting
 * them wrong is what makes a hand-built PDF wrap a line in the wrong place or clip a word, so they
 * are the one thing in this file that is copied rather than computed.
 */
const METRICS = {
  helvetica: {
    widths: {
      32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333,
      42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278, 48: 556, 49: 556, 50: 556, 51: 556,
      52: 556, 53: 556, 54: 556, 55: 556, 56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584,
      62: 584, 63: 556, 64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
      72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778, 80: 667, 81: 778,
      82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667, 89: 667, 90: 611, 91: 278,
      92: 278, 93: 278, 94: 469, 95: 556, 96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556,
      102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
      111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722,
      120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584, 128: 556, 130: 333,
      131: 556, 132: 500, 133: 1000, 134: 556, 135: 556, 136: 333, 137: 1000, 138: 667, 139: 333,
      140: 1000, 142: 611, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 150: 556, 151: 1000,
      /* 150 is the en dash at 556 and 151 the em dash at 1000, per Helvetica's own metrics. The em dash
       * was copied in as 556 — the same width as the en dash, which is wrong and was invisible for as
       * long as nothing measured a dash that was not already WinAnsi-encoded. It mattered immediately
       * once `measure` had to give the same answer for `U+2014` and the byte `0x97` it is written as. */
      152: 333, 153: 1000, 154: 500, 155: 556, 156: 944, 158: 500, 159: 667, 160: 278, 161: 333,
      162: 556, 163: 556, 164: 556, 165: 556, 166: 260, 167: 556, 168: 333, 169: 737, 170: 370,
      171: 556, 172: 584, 173: 333, 174: 737, 175: 552, 176: 400, 177: 549, 178: 333, 179: 333,
      180: 333, 181: 576, 182: 537, 183: 278, 184: 333, 185: 333, 186: 365, 187: 556, 188: 834,
      189: 834, 190: 834, 191: 611, 192: 667, 193: 667, 194: 667, 195: 667, 196: 667, 197: 667,
      198: 1000, 199: 722, 200: 667, 201: 667, 202: 667, 203: 667, 204: 278, 205: 278, 206: 278,
      207: 278, 208: 722, 209: 722, 210: 778, 211: 778, 212: 778, 213: 778, 214: 778, 215: 584,
      216: 778, 217: 722, 218: 722, 219: 722, 220: 722, 221: 667, 222: 667, 223: 611, 224: 556,
      225: 556, 226: 556, 227: 556, 228: 556, 229: 556, 230: 889, 231: 500, 232: 556, 233: 556,
      234: 556, 235: 556, 236: 278, 237: 278, 238: 278, 239: 278, 240: 556, 241: 556, 242: 556,
      243: 556, 244: 556, 245: 556, 246: 556, 247: 549, 248: 556, 249: 556, 250: 556, 251: 556,
      252: 556, 253: 500, 254: 556, 255: 500
    },
    ascent: 718,
    descent: -207,
    xHeight: 523
  },
  times: {
    widths: {
      32: 250, 33: 333, 34: 408, 35: 500, 36: 500, 37: 833, 38: 778, 39: 180, 40: 333, 41: 333,
      42: 500, 43: 564, 44: 250, 45: 333, 46: 250, 47: 278, 48: 500, 49: 500, 50: 500, 51: 500,
      52: 500, 53: 500, 54: 500, 55: 500, 56: 500, 57: 500, 58: 278, 59: 278, 60: 564, 61: 564,
      62: 564, 63: 444, 64: 921, 65: 722, 66: 667, 67: 667, 68: 722, 69: 611, 70: 556, 71: 722,
      72: 722, 73: 333, 74: 389, 75: 722, 76: 611, 77: 889, 78: 722, 79: 722, 80: 556, 81: 722,
      82: 667, 83: 556, 84: 611, 85: 722, 86: 722, 87: 944, 88: 722, 89: 722, 90: 611, 91: 333,
      92: 278, 93: 333, 94: 469, 95: 500, 96: 333, 97: 444, 98: 500, 99: 444, 100: 500, 101: 444,
      102: 333, 103: 500, 104: 500, 105: 278, 106: 278, 107: 500, 108: 278, 109: 778, 110: 500,
      111: 500, 112: 500, 113: 500, 114: 333, 115: 389, 116: 278, 117: 500, 118: 500, 119: 722,
      120: 500, 121: 500, 122: 444, 123: 480, 124: 200, 125: 480, 126: 541, 128: 500, 130: 333,
      131: 500, 132: 444, 133: 1000, 134: 500, 135: 500, 136: 333, 137: 1000, 138: 556, 139: 333,
      140: 889, 142: 611, 145: 333, 146: 333, 147: 444, 148: 444, 149: 350, 150: 500, 151: 1000,
      152: 333, 153: 980, 154: 444, 155: 500, 156: 722, 158: 444, 159: 722, 160: 250, 161: 333,
      162: 500, 163: 500, 164: 500, 165: 500, 166: 200, 167: 500, 168: 333, 169: 760, 170: 276,
      171: 500, 172: 564, 173: 333, 174: 760, 175: 500, 176: 400, 177: 564, 178: 300, 179: 300,
      180: 333, 181: 500, 182: 453, 183: 250, 184: 333, 185: 300, 186: 310, 187: 500, 188: 750,
      189: 750, 190: 750, 191: 444, 192: 722, 193: 722, 194: 722, 195: 722, 196: 722, 197: 722,
      198: 889, 199: 667, 200: 611, 201: 611, 202: 611, 203: 611, 204: 333, 205: 333, 206: 333,
      207: 333, 208: 722, 209: 722, 210: 722, 211: 722, 212: 722, 213: 722, 214: 722, 215: 564,
      216: 722, 217: 722, 218: 722, 219: 722, 220: 722, 221: 722, 222: 556, 223: 500, 224: 444,
      225: 444, 226: 444, 227: 444, 228: 444, 229: 444, 230: 667, 231: 444, 232: 444, 233: 444,
      234: 444, 235: 444, 236: 278, 237: 278, 238: 278, 239: 278, 240: 500, 241: 500, 242: 500,
      243: 500, 244: 500, 245: 500, 246: 500, 247: 564, 248: 500, 249: 500, 250: 500, 251: 500,
      252: 500, 253: 500, 254: 500, 255: 500
    },
    ascent: 683,
    descent: -217,
    xHeight: 450
  }
};

/* Courier is monospaced, so its metrics are four numbers rather than a table. */
const COURIER_WIDTH = 600;
const COURIER_ASCENT = 629;
const COURIER_DESCENT = -157;
const COURIER_XHEIGHT = 426;

/** The twelve faces built from those three families. `name` is what a content stream writes. */
export const FACES = {
  regular: { name: 'F1', family: 'helvetica', style: 'normal', base: 'Helvetica' },
  bold: { name: 'F2', family: 'helvetica', style: 'bold', base: 'Helvetica-Bold' },
  italic: { name: 'F3', family: 'helvetica', style: 'italic', base: 'Helvetica-Oblique' },
  boldItalic: { name: 'F4', family: 'helvetica', style: 'boldItalic', base: 'Helvetica-BoldOblique' },
  serif: { name: 'F5', family: 'times', style: 'normal', base: 'Times-Roman' },
  serifBold: { name: 'F6', family: 'times', style: 'bold', base: 'Times-Bold' },
  serifItalic: { name: 'F7', family: 'times', style: 'italic', base: 'Times-Italic' },
  serifBoldItalic: { name: 'F8', family: 'times', style: 'boldItalic', base: 'Times-BoldItalic' },
  mono: { name: 'F9', family: 'courier', style: 'normal', base: 'Courier' },
  monoBold: { name: 'F10', family: 'courier', style: 'bold', base: 'Courier-Bold' },
  monoItalic: { name: 'F11', family: 'courier', style: 'italic', base: 'Courier-Oblique' },
  monoBoldItalic: { name: 'F12', family: 'courier', style: 'boldItalic', base: 'Courier-BoldOblique' }
};

const FACE_ORDER = Object.keys(FACES);

/**
 * Width of one character, in 1/1000 em.
 *
 * The tables cover codes 32 to 255, so a character outside Latin-1 has no entry and silently takes the
 * fallback — which is how an em dash came to be measured at 556 units when Helvetica prints it at 1000.
 * Everything downstream inherited that: a line `wrap` fitted into a 459.28pt box measured 3.5pt wider
 * when `text` measured the *encoded* line, so `text` re-wrapped a line that had already been wrapped,
 * and `para`'s third line landed on top of its second. The audit reported an overlap on the cover of the
 * Sprint Pack that no amount of reading the layout code could explain, because the layout was right.
 *
 * Two readings therefore have to agree, and they are handled in one place:
 *
 *   `U+2014`  the character a caller writes, outside the table
 *   `0x97`    the byte it is encoded to, inside the table at Helvetica's width for a control character
 *
 * `SPECIAL_WIDTHS` answers for both, keyed on either, and is consulted before the table. A character
 * that is in neither place keeps its fallback.
 */
const SPECIAL_WIDTHS = {
  /* Helvetica's printed widths for the punctuation this generator uses. Both the character and the
   * WinAnsi byte are listed so the answer cannot depend on which form the caller passed. */
  0x2014: 1000, 0x97: 1000, /* em dash */
  0x2013: 556, 0x96: 556, /* en dash */
  0x2026: 1000, 0x85: 1000, /* ellipsis */
  0x2022: 350, 0x95: 350, /* bullet */
  0x2018: 222, 0x91: 222, /* left single quote */
  0x2019: 222, 0x92: 222, /* right single quote */
  0x201c: 333, 0x93: 333, /* left double quote */
  0x201d: 333, 0x94: 333 /* right double quote */
};

function glyphWidth(family, code) {
  if (family === 'courier') return COURIER_WIDTH;
  const special = SPECIAL_WIDTHS[code];
  if (special !== undefined) return special;
  const table = METRICS[family].widths;
  return table[code] !== undefined ? table[code] : table[63];
}

/**
 * Width of a string at a size, in points.
 *
 * `charSpace` is accepted here so that this is the **one** function that answers "how wide will this
 * be", tracking included. Everything else — wrapping, alignment, the audit's own boxes — goes through
 * it. When the tracking was applied at some call sites and not others, the writer and the audit
 * disagreed about the same run by exactly two tracking steps, which looks like a rendering bug and is
 * really a second source of truth.
 *
 * `n - 1`, not `n`. Sources disagree about whether PDF's `Tc` inserts a gap after the final glyph, but
 * the disagreement only matters if the wrong answer is chosen: a gap after the last glyph moves
 * nothing, so counting it as width charges every tracked run one step it does not occupy. That is how
 * each right-aligned run in these documents came to overshoot its margin by exactly one tracking step —
 * the same error, in the same direction, every time.
 */
export function measure(text, faceKey, size, charSpace = 0) {
  const face = FACES[faceKey] || FACES.regular;
  const str = String(text === null || text === undefined ? '' : text);
  let total = 0;
  for (let i = 0; i < str.length; i += 1) total += glyphWidth(face.family, str.charCodeAt(i));
  return (total * size) / 1000 + charSpace * Math.max(0, str.length - 1);
}

/**
 * Font ascent above the baseline, in points. Used to place a line's box rather than its baseline, so
 * that a block of text can be measured before any of it is drawn.
 */
export function ascentOf(faceKey, size) {
  const face = FACES[faceKey] || FACES.regular;
  if (face.family === 'courier') return (COURIER_ASCENT * size) / 1000;
  return (METRICS[face.family].ascent * size) / 1000;
}

export function descentOf(faceKey, size) {
  const face = FACES[faceKey] || FACES.regular;
  if (face.family === 'courier') return (COURIER_DESCENT * size) / 1000;
  return (METRICS[face.family].descent * size) / 1000;
}

/* ----------------------------------- text helpers ----------------------------------- */

/**
 * Text to the bytes a WinAnsi content stream can carry.
 *
 * PDF strings are Latin-1 with a backslash escape, so *the result must be one byte per character*. Any
 * code point left above U+00FF is truncated by the `latin1` write that turns this string into the file,
 * and what survives is the last byte of its UTF-8 sequence — which is how an en dash became byte 0x13,
 * a control character, and printed as a stray glyph in every document containing one.
 *
 * So the special characters are mapped to their WinAnsi code points rather than transliterated to
 * themselves. WinAnsi is CP1252 in the 0x80-0x9F range: an en dash is 0x96 and an em dash 0x97, not
 * U+2013 and U+2014. `png.mjs` draws exactly those bytes, because they are what reaches it.
 */
export function toWinAnsi(text) {
  let out = '';
  for (const ch of String(text === null || text === undefined ? '' : text)) {
    const code = ch.codePointAt(0);
    if (code === 0x2014) out += '\u0097'; /* em dash -> WinAnsi 0x97 */
    else if (code === 0x2013) out += '\u0096'; /* en dash -> WinAnsi 0x96 */
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x2026) out += '...';
    else if (code === 0x2192) out += '->';
    else if (code === 0x2190) out += '<-';
    /* A bullet has no WinAnsi code point of its own, so it is drawn as the middot, which does (0xB7). */
    else if (code === 0x00b7 || code === 0x2022) out += '\u00b7';
    else if (code === 0x2713) out += 'v';
    else if (code === 0x2717) out += 'x';
    else if (code === 0x2264) out += '<=';
    else if (code === 0x2265) out += '>=';
    else if (code === 0x00a0) out += ' ';
    else if (code === 0x2010 || code === 0x2011) out += '-';
    else if (code === 0x2032) out += "'";
    else if (code === 0x2033) out += '"';
    else if (code <= 0xff) out += ch;
    /* Anything else has no glyph in a base-14 font. `?` rather than dropping it: a document that loses
     * the right-hand side of a word is worse than one that shows where it lost something. */
    else out += '?';
  }
  return out;
}

/** Escape a WinAnsi string for a literal PDF string object. */
function pdfString(text) {
  return `(${toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

/**
 * Wrap to lines that fit `maxWidth`.
 *
 * `charSpace` is a first-class argument rather than something applied afterwards, because PDF's `Tc`
 * widens every gap after a glyph and therefore the *line*: a heading tracked out at 0.9pt is 8% wider
 * than its glyph metrics say, and a wrapper that ignores the tracking happily returns one line that
 * does not fit. That is exactly how a tracked label ended up 8pt past the right margin with the
 * measurement code insisting it was fine.
 *
 * The tracking counts once per character, not once per gap: PDF applies `Tc` after *every* glyph,
 * including the last, so a 17-character label is 17 tracking steps wider, not 16. Counting gaps left
 * every tracked run one step short — small, real, and invisible until the audit reconstructed the boxes
 * from the file and found them disagreeing with the code that wrote it.
 */
export function wrap(text, faceKey, size, maxWidth, charSpace = 0) {
  const str = String(text === null || text === undefined ? '' : text);
  const tracked = (s) => measure(s, faceKey, size, charSpace);
  const lines = [];
  for (const paragraph of str.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (tracked(candidate) <= maxWidth || !line) {
        if (tracked(candidate) > maxWidth && !line) {
          /* A single word wider than the column — a URL, or a device name in a narrow cell. Break it
           * at the last character that fits rather than letting it run out of the box. */
          let chunk = '';
          for (const ch of word) {
            if (tracked(chunk + ch) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How tall a wrapped block is, in points — the measurement every layout decision is made from. */
export function blockHeight(text, { face = 'regular', size = 10, leading = 1.35, width }) {
  const lines = wrap(text, face, size, width);
  return { lines, height: lines.length * size * leading };
}

/* ------------------------------------ the writer ------------------------------------ */

/**
 * Build the PDF bytes.
 *
 * Returns `{ bytes, pages, overflow }`. `overflow` is every block that was asked for more room than
 * it had: the layout is never silently cropped, it reports. Callers turn that into an exit code, so a
 * document that has outgrown its template fails a build instead of shipping with a paragraph missing
 * its last line.
 */
export function buildPdf(spec) {
  const {
    title = 'Untitled',
    author = '',
    subject = '',
    keywords = '',
    creator = 'Forge',
    pages = []
  } = spec || {};

  if (!pages.length) throw new Error('buildPdf: a document needs at least one page');

  const overflow = [];
  /* Layout repairs that are not failures — see the wrapping note in `text()`. Collected rather than
   * printed so the caller can decide what they mean; a build does not fail on them. */
  const notes = [];
  const pageStreams = pages.map((page, index) => {
    const ctx = makePageContext(page, index, overflow, notes);
    page.draw(ctx);
    /* The boundary check. A structure hands the writer the `y` it finished at, which is the only way
     * to catch the failure that matters: content that ran past the bottom margin and off the page.
     * Nothing here can crop it back — the point is that the run reports it loudly instead of
     * producing a page whose last entry is simply absent. */
    if (typeof ctx.limit === 'number' && ctx.lastY > ctx.limit) {
      overflow.push({
        page: index + 1,
        label: `${ctx.label || `page ${index + 1}`} ran past the bottom margin`,
        wanted: round(ctx.lastY),
        allowed: round(ctx.limit)
      });
    }
    return ctx.finish();
  });

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length; /* object numbers are 1-based and match array order */
  };

  /* 1 catalog, 2 page tree, 3 info, then 12 font descriptors. The page objects and their content
   * streams are appended after, so the numbers here stay stable and readable. */
  const catalogNum = add('');
  const pagesNum = add('');
  const infoNum = add('');
  const fontNums = {};
  for (const key of FACE_ORDER) {
    const face = FACES[key];
    fontNums[key] = add(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${face.base} /Encoding /WinAnsiEncoding >>`
    );
  }
  const fontResource = FACE_ORDER.map((key) => `/${FACES[key].name} ${fontNums[key]} 0 R`).join(' ');

  const pageNums = [];
  for (const stream of pageStreams) {
    const compressed = zlib.deflateSync(Buffer.from(stream, 'latin1'));
    const contentNum = add({
      dict: `<< /Length ${compressed.length} /Filter /FlateDecode >>`,
      stream: compressed
    });
    pageNums.push(
      add(
        `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${round(pages[0].width || 595.28)} ` +
          `${round(pages[0].height || 841.89)}] /Resources << /Font << ${fontResource} >> ` +
          `/ProcSet [/PDF /Text] >> /Contents ${contentNum} 0 R >>`
      )
    );
  }

  objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objects[pagesNum - 1] =
    `<< /Type /Pages /Count ${pageNums.length} /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] >>`;
  objects[infoNum - 1] =
    `<< /Title ${pdfString(title)} /Author ${pdfString(author)} /Subject ${pdfString(subject)} ` +
    `/Keywords ${pdfString(keywords)} /Creator ${pdfString(creator)} ` +
    `/Producer ${pdfString(creator)} /CreationDate ${pdfString(pdfDate(new Date()))} >>`;

  /* ---- serialise, recording each object's byte offset for the xref ---- */
  const chunks = [];
  const offsets = [];
  let cursor = 0;
  const push = (value) => {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    chunks.push(buf);
    cursor += buf.length;
  };

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  objects.forEach((obj, i) => {
    offsets[i] = cursor;
    if (typeof obj === 'string') {
      push(`${i + 1} 0 obj\n${obj}\nendobj\n`);
    } else {
      push(`${i + 1} 0 obj\n${obj.dict}\nstream\n`);
      push(obj.stream);
      push('\nendstream\nendobj\n');
    }
  });

  const xrefAt = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\n`;
  xref += `startxref\n${xrefAt}\n%%EOF\n`;
  push(xref);

  return { bytes: Buffer.concat(chunks), pageCount: pageStreams.length, overflow, notes };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function pdfDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * One page's drawing surface.
 *
 * Coordinates are given **from the top-left**, the way a layout is described and the way CSS works,
 * and flipped here into PDF's bottom-left space exactly once. That is the whole reason this function
 * exists: every other module in this folder places things in a coordinate system it can reason about.
 */
function makePageContext(page, index, overflow, notes) {
  const width = page.width || 595.28;
  const height = page.height || 841.89;
  const parts = [];

  const X = (x) => round(x);
  const Y = (y) => round(height - y);

  const ctx = {
    index,
    /**
     * The 1-based number of this page, as the reader counts pages.
     *
     * Distinct from `label`, and the distinction is not cosmetic: the boundary check below used to test
     * `page.name` for being a number, which meant it never fired on any page in any of the three
     * structures — they all name their pages `'A'`, `'The modules'` and so on. A page could run 400pt
     * off the bottom and the build would report success. Nothing needed the name; everything that
     * reports a failure needs the number.
     */
    number: index + 1,
    /** What this page is called in an overflow report, so a failure names a page and not a number. */
    label: page.name || null,
    width,
    height,
    /** The lowest `y` a structure is allowed to reach. Set by the caller from its own margins. */
    limit: page.limit === undefined ? height - 40 : page.limit,
    /** The last `y` a drawing call reported. Compared against `limit` when the page is done. */
    lastY: 0,
    /** Record that something wanted more room than it had. Never silently cropped. */
    overflow(label, wanted, allowed) {
      overflow.push({ page: index + 1, label, wanted: round(wanted), allowed: round(allowed) });
    },
    /** Layout repairs that are worth logging but are not failures. See the wrapping note in `text()`. */
    notes: notes || [],

    measure: (text, face, size, charSpace = 0) => measure(text, face, size, charSpace),
    wrap: (text, face, size, maxWidth, charSpace = 0) => wrap(text, face, size, maxWidth, charSpace),
    blockHeight,

    /* ------------------------------- primitives ------------------------------- */

    /** Fill a rectangle. `radius` is accepted and ignored — kept square on purpose, see the note below. */
    rect(x, y, w, h, colour) {
      /* One operator per line, with the colour set on its own line. The writer emits it joined
       * otherwise, and joined operators make every consumer of the content stream — this repo's audit
       * and its PNG painter — need a tokeniser instead of a line splitter. The extra newline costs
       * nothing after deflate and removes a class of bug from both. */
      parts.push(`${colour} rg\n${X(x)} ${Y(y + h)} ${round(w)} ${round(h)} re\nf`);
      return ctx;
    },

    /**
     * A rounded rectangle, filled or stroked — the pill, the card and the callout box.
     *
     * PDF has no rounded-rectangle operator: it is four lines and four cubic arcs, and 0.5523 is the
     * standard circular-arc-to-Bézier constant, not a fudge factor. Each corner is written as
     * "arc out, arc in, line", in PDF's own space, so the path closes.
     */
    roundRect(x, y, w, h, r, options = {}) {
      const { fill = null, stroke = null, lineWidth = 0.7 } = options;
      if (!fill && !stroke) return ctx;
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      const k = radius * 0.5523;
      const left = X(x);
      const right = X(x + w);
      const top = Y(y);
      const bottom = Y(y + h);
      /* In PDF space the bottom edge is the numerically smaller y, so the corners are named by their
       * canvas position and the coordinates below follow from that. One operator per element, because
       * both consumers of this stream — the audit and the PNG painter — read it line by line. */
      const path = [
        `${X(x + radius)} ${bottom} m`,
        `${X(x + w - radius)} ${bottom} l`,
        `${X(x + w - radius + k)} ${bottom} ${right} ${Y(y + h - radius) + k} ${right} ${Y(y + h - radius)} c`,
        `${right} ${Y(y + radius) - k} ${X(x + w - radius + k)} ${top} ${X(x + w - radius)} ${top} c`,
        `${X(x + radius)} ${top} l`,
        `${X(x + radius - k)} ${top} ${left} ${Y(y + radius) - k} ${left} ${Y(y + radius)} c`,
        `${left} ${Y(y + h - radius) + k} ${X(x + radius - k)} ${bottom} ${X(x + radius)} ${bottom} c`
      ].join('\n');
      if (fill) parts.push(`${fill} rg\n${path}\nf`);
      if (stroke) parts.push(`${stroke} RG\n${round(lineWidth)} w\n${path}\nS`);
      return ctx;
    },

    stroke(x, y, w, h, colour, lineWidth = 0.6) {
      parts.push(`${colour} RG\n${round(lineWidth)} w\n${X(x)} ${Y(y + h)} ${round(w)} ${round(h)} re\nS`);
      return ctx;
    },

    line(x1, y1, x2, y2, colour, lineWidth = 0.6) {
      parts.push(`${colour} RG\n${round(lineWidth)} w\n${X(x1)} ${Y(y1)} m\n${X(x2)} ${Y(y2)} l\nS`);
      return ctx;
    },

    dashedLine(x1, y1, x2, y2, colour, lineWidth = 0.6, dash = 3) {
      parts.push(
        `[${dash} ${dash}] 0 d\n${colour} RG\n${round(lineWidth)} w\n` +
          `${X(x1)} ${Y(y1)} m\n${X(x2)} ${Y(y2)} l\nS\n[] 0 d`
      );
      return ctx;
    },

    /** A ring — the core-loop diagram's node. Four Bézier arcs, because PDF has no circle operator. */
    circle(cx, cy, r, colour, lineWidth = 0.8) {
      const k = 0.5523 * r;
      parts.push(
        `${colour} RG\n${round(lineWidth)} w\n${X(cx + r)} ${Y(cy)} m\n` +
          `${X(cx + r)} ${Y(cy - k)} ${X(cx + k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c\n` +
          `${X(cx - k)} ${Y(cy - r)} ${X(cx - r)} ${Y(cy - k)} ${X(cx - r)} ${Y(cy)} c\n` +
          `${X(cx - r)} ${Y(cy + k)} ${X(cx - k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c\n` +
          `${X(cx + k)} ${Y(cy + r)} ${X(cx + r)} ${Y(cy + k)} ${X(cx + r)} ${Y(cy)} c\nS`
      );
      return ctx;
    },

    /**
     * One line of text, drawn with its **top** at `y`.
     *
     * Top-anchored rather than baseline-anchored, because that is what a layout needs: a heading's
     * height is its font size times its leading, and nothing else in the file has to know where the
     * baseline of Helvetica sits.
     */
    text(x, y, str, options = {}) {
      const {
        face = 'regular',
        size = 10,
        colour = '0 0 0',
        align = 'left',
        maxWidth = null,
        right = null,
        charSpace = 0,
        label = 'text'
      } = options;
      const body = toWinAnsi(str);
      if (!body) return y;

      /* Where the alignment box ends. `x` is the left edge of a left-aligned run and the *right* edge
       * of an aligned one, which is the only reading that makes
       * `text(PAGE.width - M.right, y, str, { align: 'right' })` mean what it says: align to the
       * margin. `right` names the edge explicitly for the case where `x` is not it — a run aligned
       * inside a box that starts elsewhere. `maxWidth` builds a box from `x`, clamped to the paper, so
       * it can narrow a box but never place one off the page.
       *
       * Getting this inverted — stretching to `x + (width - x)` whenever no `maxWidth` was given, which
       * is just `width` — put every footer page number 41pt past the right margin. The call looked
       * right in the source and the one argument it passed had the opposite of its intended meaning. */
      const edge =
        right !== null
          ? right
          : maxWidth === null
            ? align === 'left'
              ? null
              : x
            : Math.min(x + maxWidth, width);

      /* Wrapping, when the caller gave a box and the run does not fit it.
       *
       * `text` is documented as a single line, and it stays that: a one-line caller gets a one-line
       * behaviour. But a caller that names a bounded box is asking for text to live inside it, and
       * silently overrunning the box is never what that caller meant. The Ledger's right-aligned page
       * captions are exactly this case — one string, bounded box, overflowing by 6 to 37 points — and
       * the honest response is to wrap them and let the reader see two tidy lines rather than to spill
       * off the margin. It only kicks in when there *is* a box and the text does not fit, so nothing
       * that currently fits changes shape. */

      const boxWidth = edge === null ? null : edge - x;
      const pieces =
        boxWidth !== null && boxWidth > 0 && measure(body, face, size, charSpace) > boxWidth
          ? wrap(body, face, size, boxWidth, charSpace)
          : [body];
      let lowest = y;
      pieces.forEach((line, i) => {
        const lineWidth = measure(line, face, size, charSpace);
        const drawX =
          align === 'left' ? x : align === 'center' ? x + (edge - x - lineWidth) / 2 : edge - lineWidth;
        const baseline = y + i * size * 1.2 + ascentOf(face, size);
        /* One operator per line, and `Tm` rather than `Td`: an absolute text matrix makes each run's
         * position self-contained, so a consumer of this stream — the repo's audit and its PNG painter —
         * can recover where a line landed without replaying every relative move before it. It costs four
         * numbers instead of two and removes a whole class of off-by-one from the checking code.
         *
         * `Tc` is emitted **always**, including when it is zero.
         *
         * It is state, not a per-run setting: a run that says nothing about tracking inherits whatever
         * the previous run left behind. Emitting it only when non-zero meant an untracked paragraph
         * following a tracked label was drawn with the label's tracking — every line 0.9pt per character
         * too wide, which the layout had measured as fitting. Those are the runs that came back as
         * right-margin breaches of 60 to 150 points while the structures' own overflow checks reported
         * nothing wrong, because the structures were right: the text did fit, and then a sticky operator
         * widened it. Text state is cheap to restate and expensive to inherit, so every run states all
         * of it. */
        parts.push(
          [
            'BT',
            `/${FACES[face].name} ${round(size)} Tf`,
            `${colour} rg`,
            `${round(charSpace)} Tc`,
            `1 0 0 1 ${X(drawX)} ${Y(baseline)} Tm`,
            `${pdfString(line)} Tj`,
            'ET'
          ].join('\n')
        );
        lowest = y + (i + 1) * size * 1.2;
      });
      if (pieces.length > 1) {
        /* Wrapping here is a repair, not a failure: the page came out correct rather than clipped, so
         * it must not be reported as an overflow — a build that fails on a page it rendered properly
         * teaches its reader to stop reading the report. It is logged anyway, because a `text` call
         * that needed two lines is a layout that expected one, and its author should decide whether the
         * box or the copy is wrong. */
        ctx.notes.push({
          page: index + 1,
          label,
          kind: 'wrapped',
          detail: `"${body.slice(0, 40)}" needed ${pieces.length} lines in a ${round(boxWidth)}pt box`
        });
      }
      ctx.lastY = Math.max(ctx.lastY, lowest);
      return lowest;
    },

    /**
     * A paragraph. Returns the `y` below it.
     *
     * `maxHeight` is the contract that stops a page quietly losing its last paragraph: when the text
     * does not fit, the overflow is recorded and the excess lines are dropped at a line boundary, so
     * the page stays readable and the build still fails.
     */
    para(x, y, text, options = {}) {
      const {
        face = 'regular',
        size = 10,
        leading = 1.35,
        colour = '0 0 0',
        maxWidth,
        align = 'left',
        right = null,
        maxHeight = null,
        label = 'paragraph',
        charSpace = 0
      } = options;
      const lines = wrap(text, face, size, maxWidth, charSpace);
      const step = size * leading;
      /* A NaN budget would silently drop the whole paragraph, so it is treated as "unbounded" and
       * the caller's own layout check catches it instead. */
      const budget = maxHeight === null || Number.isNaN(maxHeight) ? null : maxHeight;
      const allowed = budget === null ? lines.length : Math.floor(budget / step + 1e-6);
      const drawn = allowed >= lines.length ? lines : lines.slice(0, Math.max(0, allowed));
      if (drawn.length < lines.length) {
        ctx.overflow(label, lines.length * step, budget === null ? Infinity : budget);
      }
      /* The highest `y` anything was actually drawn at, so an unbounded block still trips the page
       * boundary check rather than sailing past the footer. */
      ctx.lastY = Math.max(ctx.lastY, y + drawn.length * step);
      /* The alignment box is handed to each line as an edge, not as a `maxWidth` to be reinterpreted.
       * A wrapped line is exactly the box's width, so `maxWidth` would put an aligned one back at `x`
       * — the same mistake as the clamp `text()` used to apply, one level up. */
      const edge =
        right !== null
          ? right
          : maxWidth === undefined || maxWidth === null
            ? null
            : Math.min(x + maxWidth, width);
      drawn.forEach((lineText, i) => {
        ctx.text(x, y + i * step, lineText, {
          face,
          size,
          colour,
          align,
          right: edge,
          charSpace
        });
      });
      return y + drawn.length * step;
    },

    /** The number of lines a paragraph will take, without drawing it. */
    countLines(text, face, size, maxWidth, charSpace = 0) {
      return wrap(text, face, size, maxWidth, charSpace).length;
    },

    /** How wide a run of text will be drawn, tracking included — for callers placing a second box. */
    widthOf(text, face, size, charSpace = 0) {
      const s = toWinAnsi(text);
      return measure(s, face, size, charSpace);
    },

    finish() {
      return parts.join('\n');
    }
  };

  return ctx;
}
