/**
 * The core-loop diagram: entry → repeating loop → win/lose outcomes, drawn as inline SVG.
 *
 * Geometry. Everything is computed from the content, in a fixed 720-unit-wide viewBox that scales
 * to whatever width CSS gives it:
 *
 *   - The loop is a ring of radius RING_R. Each step is a rounded pill sitting *on* the ring, so the
 *     pills are the track and the arcs drawn between consecutive pills are tangential by
 *     construction (they are arcs of the same circle).
 *   - Pill width adapts to the step count: 2·R·sin(π/n) is the chord between neighbouring positions,
 *     so the pill is that chord minus a gap. Without this, six steps would overlap where three would
 *     look sparse.
 *   - Pill height grows from one text line to two, and the entry box and outcome boxes wrap to at
 *     most two lines, so no label is ever clipped.
 *   - The entry box is placed above the pills' bounding box and the outcome row below it, both
 *     measured from the *rendered* pill extents rather than from the ideal circle. That is why the
 *     arrows never collide with a pill at 12 or 6 o'clock, whatever the step count.
 *   - Text metrics are estimated from character counts (see CHAR_W), since measuring real glyph
 *     widths would need a layout pass. The estimate is deliberately conservative, and every label
 *     carries its full text in a <title> so a shortened label is never the only copy.
 *
 * Colours come from the app's tokens through CSS custom properties, so the drawing inherits the
 * Fortnite style library instead of carrying its own copy of the palette. They are applied as inline
 * styles rather than presentation attributes, because var() is only reliably supported there.
 *
 * Accessibility: the SVG is a single image with a title and a description that spells the loop out in
 * prose, so a screen reader gets the meaning rather than a list of shapes. Meaning is never carried
 * by colour alone — outcomes are distinguished by their own labels.
 */

const VW = 720;            // viewBox width, in units
const PAD = 28;            // outer margin
const RING_R = 132;        // ring radius
const LINE_H = 15;         // text line height inside pills and boxes
const FONT_STEP = 12.5;    // step label
const FONT_BOX = 14;       // entry and outcome text
const CHAR_W = 6.6;        // conservative average glyph width at FONT_STEP
const CHAR_W_BOX = 7.6;    // …at FONT_BOX
const MAX_STEP_LINES = 2;
const GAP = 26;            // vertical clearance between the pieces

let uid = 0;

/** Apply colours through inline styles, where var() is dependable. */
function paint(el, style) {
  for (const [key, value] of Object.entries(style)) el.style[key] = value;
  return el;
}

function make(tag, attrs = {}, style = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, String(value));
  }
  if (style) paint(el, style);
  return el;
}

function label(x, y, content, { size = FONT_STEP, fill, weight = 400, anchor = 'middle', family } = {}) {
  const el = make(
    'text',
    { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle' },
    {
      fontFamily: family || 'var(--loop-font, Inter, "Segoe UI", system-ui, sans-serif)',
      fontSize: `${size}px`,
      fontWeight: String(weight),
      fill: fill || 'var(--loop-text, #FFFFFF)'
    }
  );
  el.textContent = content;
  return el;
}

/**
 * Wrap text to at most `maxLines` lines of at most `maxChars`, truncating with an ellipsis if it
 * still does not fit. Returns the lines so the caller can size the box from them.
 */
function wrap(value, maxChars, maxLines) {
  const words = String(value === null || value === undefined ? '' : value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let truncated = false;
  let current = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // Last allowed line: keep what fits and mark the rest as missing.
      truncated = true;
      current = `${current} …`;
      break;
    }
    lines.push(current);
    current = word;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (!lines.length) lines.push('');
  if (truncated) {
    const last = lines[lines.length - 1];
    if (last.length > maxChars) lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return { lines: lines.slice(0, maxLines), truncated: truncated || lines.length > maxLines };
}

/** A <title> child carrying the untruncated original, so shortening never loses information. */
function tooltip(full, shown) {
  if (!full || full === shown) return null;
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = full;
  return t;
}

/**
 * Render one core loop.
 *
 * @param {{entry?: string, loop?: string[], outcomes?: Array<{label?: string, detail?: string}>}} coreLoop
 * @returns {SVGSVGElement}
 */
export function renderCoreLoop(coreLoop) {
  uid += 1;
  const titleId = `loop-title-${uid}`;
  const descId = `loop-desc-${uid}`;

  const entryText = (coreLoop && coreLoop.entry) || '';
  const steps = ((coreLoop && coreLoop.loop) || []).filter((s) => typeof s === 'string' && s.trim());
  const outcomes = ((coreLoop && coreLoop.outcomes) || []).filter((o) => o && (o.label || o.detail));

  const root = make('svg', {
    viewBox: `0 0 ${VW} 240`,
    width: '100%',
    role: 'img',
    'aria-labelledby': `${titleId} ${descId}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'g-loop-svg'
  });
  root.style.display = 'block';
  root.style.height = 'auto';
  root.style.maxWidth = '100%';

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.id = titleId;
  title.textContent = steps.length
    ? `Core loop: ${steps.length} repeating steps with ${outcomes.length || 0} outcomes`
    : 'No core loop defined';
  root.append(title);

  const desc = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
  desc.id = descId;
  desc.textContent = describe(entryText, steps, outcomes);
  root.append(desc);

  if (!steps.length && !outcomes.length) {
    root.setAttribute('viewBox', `0 0 ${VW} 120`);
    root.append(
      label(VW / 2, 58, 'No core loop recorded for this game type yet.', {
        size: FONT_BOX,
        fill: 'var(--loop-muted, #C3C3C4)'
      })
    );
    return root;
  }

  /* ---------------------------- entry box ---------------------------- */
  const entryWrapped = wrap(entryText || 'Start', 58, 2);
  const entryW = Math.min(560, Math.max(240, longest(entryWrapped.lines) * CHAR_W_BOX + 44));
  const entryH = entryWrapped.lines.length * LINE_H * 1.25 + 22;
  const entryX = (VW - entryW) / 2;
  const entryY = PAD;

  const entryGroup = make('g', {});
  entryGroup.append(
    make(
      'rect',
      { x: entryX, y: entryY, width: entryW, height: entryH, rx: 8 },
      {
        fill: 'var(--loop-fill, #18181C)',
        stroke: 'var(--loop-accent, #F7FF19)',
        strokeWidth: '2'
      }
    )
  );
  entryWrapped.lines.forEach((line, i) => {
    const y = entryY + entryH / 2 + (i - (entryWrapped.lines.length - 1) / 2) * LINE_H * 1.25;
    entryGroup.append(label(VW / 2, y, line, { size: FONT_BOX, weight: 600 }));
  });
  const entryTip = tooltip(entryText, entryWrapped.lines.join(' '));
  if (entryTip) entryGroup.append(entryTip);
  root.append(entryGroup);

  /* ---------------------------- the ring of steps ---------------------------- */
  const count = steps.length;
  const maxPillW = 176;
  const chord = count > 1 ? 2 * RING_R * Math.sin(Math.PI / count) : RING_R;
  const pillW = Math.max(96, Math.min(maxPillW, chord - 16));
  const charsPerLine = Math.max(10, Math.floor((pillW - 22) / CHAR_W));

  const pills = steps.map((step, i) => {
    /* Start at 12 o'clock; the arrows are placed from measured extents, so a pill sitting exactly
     * at the top or bottom is a layout fact rather than a special case to avoid. */
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const wrapped = wrap(step, charsPerLine, MAX_STEP_LINES);
    const height = wrapped.lines.length * LINE_H + 20;
    return {
      index: i,
      text: step,
      wrapped,
      angle,
      x: Math.cos(angle) * RING_R,
      y: Math.sin(angle) * RING_R,
      w: pillW,
      h: height
    };
  });

  const entryBottom = entryY + entryH;
  const halfMax = Math.max(...pills.map((p) => p.h)) / 2;
  const cy = entryBottom + 34 + RING_R + halfMax;

  /* Faint track, so the ring reads as a loop even where no arrow is drawn. */
  root.append(
    make('circle', { cx: VW / 2, cy, r: RING_R, fill: 'none' }, {
      stroke: 'var(--loop-stroke, #3A3A3E)',
      strokeWidth: '1.5',
      strokeDasharray: '3 7'
    })
  );

  /* Tangential arrows between consecutive steps — arcs of the ring itself. */
  if (count > 1) {
    for (let i = 0; i < count; i += 1) {
      const from = pills[i];
      const to = pills[(i + 1) % count];
      root.append(tangentArc(from, to, cy));
    }
  } else {
    root.append(tangentArc(pills[0], { angle: pills[0].angle + Math.PI * 1.8 }, cy));
  }

  for (const pill of pills) {
    const cx = VW / 2 + pill.x;
    const py = cy + pill.y;
    const isFirst = pill.index === 0;
    const group = make('g', {});

    group.append(
      make(
        'rect',
        { x: cx - pill.w / 2, y: py - pill.h / 2, width: pill.w, height: pill.h, rx: 10 },
        isFirst
          ? { fill: 'var(--loop-accent, #F7FF19)', stroke: 'var(--loop-accent, #F7FF19)', strokeWidth: '1.5' }
          : {
              fill: 'var(--loop-fill, #18181C)',
              stroke: 'var(--loop-stroke, #3A3A3E)',
              strokeWidth: '1.5'
            }
      )
    );

    pill.wrapped.lines.forEach((line, i) => {
      const y = py + (i - (pill.wrapped.lines.length - 1) / 2) * LINE_H;
      group.append(
        label(cx, y, line, {
          size: FONT_STEP,
          weight: isFirst ? 600 : 500,
          fill: isFirst ? 'var(--loop-accent-ink, #000000)' : 'var(--loop-text, #FFFFFF)'
        })
      );
    });

    const tip = tooltip(pill.text, pill.wrapped.lines.join(' '));
    if (tip) group.append(tip);
    root.append(group);
  }

  const pillTop = Math.min(...pills.map((p) => cy + p.y - p.h / 2));
  const pillBottom = Math.max(...pills.map((p) => cy + p.y + p.h / 2));

  /* ------------------------- entry and exit arrows ------------------------- */
  const entryArrowEnd = Math.max(entryBottom + 14, pillTop - 10);
  root.append(
    arrow(VW / 2, entryBottom, VW / 2, entryArrowEnd, 'Enter the loop')
  );

  const outcomeTop = pillBottom + 44;
  if (outcomes.length) {
    root.append(arrow(VW / 2, pillBottom + 8, VW / 2, outcomeTop - 10, 'Leave the loop'));
  }

  /* ---------------------------- outcome boxes ---------------------------- */
  const outcomeH = 62;
  if (outcomes.length) {
    const gap = 20;
    const boxW = (VW - PAD * 2 - gap * (outcomes.length - 1)) / outcomes.length;
    const boxChars = Math.max(8, Math.floor((boxW - 24) / CHAR_W_BOX));
    outcomes.forEach((outcome, i) => {
      const x = PAD + i * (boxW + gap);
      const wrapped = wrap(outcome.detail || '', boxChars, 2);
      const lines = wrapped.lines.filter(Boolean);
      const group = make('g', {});

      group.append(
        make('rect', { x, y: outcomeTop, width: boxW, height: outcomeH, rx: 10 }, {
          fill: 'var(--loop-fill, #18181C)',
          stroke: 'var(--loop-stroke, #3A3A3E)',
          strokeWidth: '1.5'
        })
      );

      const labelText = String(outcome.label || '').toUpperCase();
      group.append(
        label(x + boxW / 2, outcomeTop + (lines.length ? 20 : outcomeH / 2), labelText, {
          size: 13,
          weight: 700,
          fill: 'var(--loop-text, #FFFFFF)'
        })
      );
      lines.forEach((line, li) => {
        group.append(
          label(x + boxW / 2, outcomeTop + 38 + li * LINE_H, line, {
            size: 12,
            fill: 'var(--loop-muted, #C3C3C4)'
          })
        );
      });

      const tip = tooltip(outcome.detail, lines.join(' '));
      if (tip) group.append(tip);
      root.append(group);
    });
  }

  const height = (outcomes.length ? outcomeTop + outcomeH : pillBottom + PAD) + PAD;
  root.setAttribute('viewBox', `0 0 ${VW} ${Math.round(height)}`);
  return root;
}

/** An arc between two pill positions, with an arrowhead at the end: the tangential direction. */
function tangentArc(from, to, cy) {
  const cx = VW / 2;
  const toAngle = to.angle <= from.angle ? to.angle + Math.PI * 2 : to.angle;
  const span = toAngle - from.angle;
  /* Leave the pills clear: shrink the arc at both ends by roughly half a pill's angular width. */
  const inset = Math.min(span * 0.28, 0.34);
  const a1 = from.angle + inset;
  const a2 = toAngle - inset;
  const sweep = span > Math.PI ? 1 : 1; // always clockwise on screen
  const p1 = { x: cx + Math.cos(a1) * RING_R, y: cy + Math.sin(a1) * RING_R };
  const p2 = { x: cx + Math.cos(a2) * RING_R, y: cy + Math.sin(a2) * RING_R };
  const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;

  const g = make('g', {});
  g.append(
    make(
      'path',
      { d: `M ${round(p1.x)} ${round(p1.y)} A ${RING_R} ${RING_R} 0 ${large} ${sweep} ${round(p2.x)} ${round(p2.y)}`, fill: 'none' },
      { stroke: 'var(--loop-muted, #C3C3C4)', strokeWidth: '2' }
    )
  );
  /* Arrowhead: a small triangle rotated to the arc's tangent at its end point. */
  const tangent = a2 + Math.PI / 2; // tangent direction when travelling clockwise
  g.append(triangle(p2.x, p2.y, tangent, 'var(--loop-accent, #F7FF19)'));
  return g;
}

/** A straight arrow with an arrowhead at the end. */
function arrow(x1, y1, x2, y2, name) {
  const g = make('g', {});
  g.append(
    make('path', { d: `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`, fill: 'none' }, {
      stroke: 'var(--loop-accent, #F7FF19)',
      strokeWidth: '2'
    })
  );
  const angle = Math.atan2(y2 - y1, x2 - x1);
  g.append(triangle(x2, y2, angle, 'var(--loop-accent, #F7FF19)'));
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = name;
  g.append(t);
  return g;
}

/** A filled arrowhead pointing along `angle`, with its tip at (x, y). */
function triangle(x, y, angle, fill) {
  const size = 7;
  const spread = 2.5;
  const points = [
    [0, 0],
    [-size, -spread],
    [-size, spread]
  ]
    .map(([dx, dy]) => {
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
      return `${round(x + rx)},${round(y + ry)}`;
    })
    .join(' ');
  return make('polygon', { points }, { fill });
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function longest(lines) {
  return lines.reduce((n, line) => Math.max(n, line.length), 0);
}

/** The whole loop as prose, for the SVG's <desc>. */
function describe(entry, steps, outcomes) {
  const parts = [];
  parts.push(entry ? `Entry: ${entry}.` : 'Entry not specified.');
  if (steps.length) parts.push(`Then repeat: ${steps.join(', then ')}.`);
  if (outcomes.length) {
    parts.push(
      outcomes
        .map((o) => `${o.label || 'Outcome'}${o.detail ? `: ${o.detail}` : ''}`)
        .join('. ')
        .concat('.')
    );
  }
  return parts.join(' ');
}
