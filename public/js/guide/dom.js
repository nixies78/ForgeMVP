/**
 * Safe DOM construction — the only way this app is allowed to build markup.
 *
 * v1 built every screen by assigning a template literal to `innerHTML`, which meant user-supplied
 * game names and JSON strings (which intentionally contain `<b>` markup) went straight into the
 * document, and into `onclick="..."` attributes. A game name containing a quote broke the handler.
 *
 * So this module never produces a string of markup. `h()` builds real nodes and treats every string it
 * is given as text, and `richText()` is the one place allowed to interpret markup — and only a
 * two-tag subset of it, with everything else escaping to literal text.
 */

/** Create an element. Children may be nodes, strings (added as text) or arrays thereof. */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

/** Create an SVG element. Same contract as h(), for namespaced tags. */
export function svg(tag, props = null, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') el.textContent = String(value);
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function applyProps(el, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    // Event handlers are attached as listeners. Never as attribute strings.
    else if (key === 'on') for (const [type, fn] of Object.entries(value)) el.addEventListener(type, fn);
    else if (key === 'dataset') for (const [k, v] of Object.entries(value)) el.dataset[k] = String(v);
    else if (key === 'value' && 'value' in el) el.value = String(value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** A document fragment from a list of nodes, for callers that want to build up children. */
export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** Replace every child of `parent` with `children`. */
export function fill(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

/**
 * Render a string that may contain limited inline markup.
 *
 * The reference data contains deliberate `<b>` and `<i>` runs ("<b>Fortnite's own library</b> —
 * every standard gallery…"). Everything else about those strings is untrusted, so this parses a
 * two-tag subset and emits text nodes for the rest: an unknown tag, a stray `<`, an attribute, a
 * `<script>` or a quote all end up as visible literal characters rather than markup. There is no
 * HTML parsing anywhere in this app.
 */
export function richText(value) {
  const source = value === null || value === undefined ? '' : String(value);
  const fragment = document.createDocumentFragment();
  const pattern = /<\/?([bi])\s*>/gi;
  let cursor = 0;
  let open = null;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const before = source.slice(cursor, match.index);
    push(before);
    const closing = match[0].startsWith('</');
    const tag = match[1].toLowerCase();
    if (closing) {
      if (open && open.tagName.toLowerCase() === tag) open = open.parentNode === fragment ? null : open.parentNode;
      else push(match[0]); // a stray closing tag is shown as written
    } else if (open) {
      push(match[0]); // nested bold inside bold is not a thing; show it literally
    } else {
      open = document.createElement(tag);
      fragment.append(open);
    }
    cursor = match.index + match[0].length;
  }
  push(source.slice(cursor));

  return fragment;

  function push(str) {
    if (!str) return;
    (open || fragment).append(document.createTextNode(str));
  }
}

/** An inline SVG icon, built as nodes. Icons are decoration; labels carry the meaning. */
export function icon(name, size = 16) {
  const paths = {
    arrow: 'M5 12h14M13 6l6 6-6 6',
    arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
    check: 'M4 12.5l5 5L20 6.5',
    chevron: 'M9 6l6 6-6 6',
    close: 'M6 6l12 12M18 6L6 18',
    play: 'M8 5.5v13l11-6.5z',
    plus: 'M12 5v14M5 12h14'
  };
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false'
    },
    svg('path', { d: paths[name] || paths.chevron })
  );
}

/** Pluralise a count for a label: `plural(1, 'device')` → "1 device". */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
