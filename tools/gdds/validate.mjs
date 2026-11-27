/**
 * validate.mjs — read a PDF back and check it is structurally sound.
 *
 * A hand-built PDF fails in exactly one interesting way: the xref offsets drift, every reader then
 * refuses the file, and the bytes look fine in a hex dump. So every export checks itself — the
 * offsets must resolve to the object they claim, the trailer must point at a real catalog, and the
 * pages must come back out of the content streams. `npm test` runs this over each generated
 * document, which is the difference between "the writer ran" and "the file opens".
 */

import zlib from 'node:zlib';

/**
 * @returns {{ok: boolean, problems: string[], pageCount: number, texts: string[][]}}
 */
export function validatePdf(bytes) {
  const problems = [];
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.readFileSync ? null : Buffer.from(bytes);
  const s = buf.toString('latin1');

  if (!s.startsWith('%PDF-')) problems.push('missing %PDF- header');
  if (!s.trimEnd().endsWith('%%EOF')) problems.push('missing %%EOF trailer');

  const startxrefAt = s.lastIndexOf('startxref');
  if (startxrefAt < 0) {
    problems.push('no startxref');
    return { ok: false, problems, pageCount: 0, texts: [] };
  }
  const xrefAt = Number.parseInt(s.slice(startxrefAt + 'startxref'.length).trim(), 10);
  if (!Number.isFinite(xrefAt)) problems.push('startxref is not a number');
  else if (!s.startsWith('xref', xrefAt)) {
    problems.push(`startxref points at ${xrefAt}, which is not an "xref" table`);
  }

  /* ---- every xref entry must resolve to the object number it claims ----
   * `lines[0]` is "xref", `lines[1]` is the "0 N" subsection header, `lines[2]` is entry 0 — the
   * free head — and object n's row is `lines[2 + n]`. */
  const lines = s.slice(xrefAt).split('\n');
  const header = (lines[1] || '').trim().split(/\s+/);
  const count = Number.parseInt(header[1], 10);
  if (header[0] !== '0' || !Number.isFinite(count)) {
    problems.push(`unreadable xref subsection header "${lines[1]}"`);
  } else {
    for (let i = 1; i < count; i += 1) {
      const row = lines[2 + i] || '';
      if (row.slice(17, 18) !== 'n') {
        problems.push(`xref entry ${i} is not in use`);
        continue;
      }
      const offset = Number.parseInt(row.slice(0, 10), 10);
      const at = s.slice(offset, offset + 24);
      const m = at.match(/^(\d+) 0 obj\b/);
      if (!m) problems.push(`xref entry ${i} at offset ${offset} is not an object start`);
      else if (Number.parseInt(m[1], 10) !== i) {
        problems.push(`xref entry ${i} points at object ${m[1]}`);
      }
    }

    const trailer = s.slice(s.indexOf('trailer', xrefAt));
    const root = trailer.match(/\/Root (\d+) 0 R/);
    if (!root) problems.push('trailer has no /Root');
    else {
      const rootIndex = Number.parseInt(root[1], 10) - 1;
      const rootRow = lines[2 + rootIndex];
      const rootOffset = Number.parseInt((rootRow || '').slice(0, 10), 10);
      const rootBody = s.slice(rootOffset, rootOffset + 120);
      if (!/\/Type\s*\/Catalog/.test(rootBody)) {
        problems.push(`/Root ${root[1]} does not point at a /Catalog`);
      }
    }
  }

  /* ---- pull the text back out of every content stream ---- */
  const texts = [];
  for (const match of s.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) continue;
    let raw = Buffer.from(s.slice(start, end), 'latin1');
    if (raw.length > 1 && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
    let text;
    try {
      text = zlib.inflateSync(raw).toString('latin1');
    } catch {
      continue;
    }
    if (!/\bBT\b/.test(text)) continue;
    const strings = [];
    for (const tj of text.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      strings.push(tj[1].replace(/\\([\\()])/g, '$1'));
    }
    texts.push(strings);
  }
  if (!texts.length) problems.push('no text found in any content stream');

  return { ok: problems.length === 0, problems, pageCount: texts.length, texts };
}

/** Every word in the document, for the content assertions a build should make. */
export function pdfPlainText(bytes) {
  return validatePdf(bytes)
    .texts.flat()
    .join('\n');
}
