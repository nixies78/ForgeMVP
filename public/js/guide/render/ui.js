/**
 * Shared screen furniture: headings, choice cards, buttons, notices and image slots.
 *
 * Everything here exists because v1 did not have it: it copy-pasted nav and breadcrumb markup into
 * seven render functions, so a change to either meant seven edits (UEFN_GUIDE_V2_HANDOFF.md,
 * Part 7 item 14). One definition per component, used by every screen.
 */

import { h, icon, richText } from '../dom.js';

/* ----------------------------------- headings ----------------------------------- */

/* The document outline is: <h1> the page's own title in the hero (index.html), then one <h2> per screen
 * (the heading focus lands on after every screen change), <h3> for sections inside a screen, <h4> for a
 * card's title. The hero owns the only h1 on the page, which is why the screen title is not one. */

/** The small uppercase label above a title. Poster style: Metadata, 10/14, bold, tracked out. */
export function eyebrow(value) {
  return h('p', { class: 'g-eyebrow' }, value);
}

/** A screen's main title. Poster style: Display, uppercase, heavy italic. */
export function pageTitle(value, options = {}) {
  return h(
    'h2',
    { class: `g-title${options.small ? ' is-compact' : ''}`, tabindex: '-1', id: options.id || 'screen-title' },
    value
  );
}

/** A section heading inside a screen. Poster style: Section, uppercase, heavy italic. */
export function sectionHeading(value, options = {}) {
  return h('h3', { class: `g-section${options.small ? ' is-small' : ''}` }, value);
}

export function cardTitle(value) {
  return h('h4', { class: 'g-cardtitle' }, value);
}

export function lead(value) {
  return h('p', { class: 'g-lead' }, value);
}

export function paragraph(value) {
  return h('p', { class: 'g-body' }, value);
}

/** A breadcrumb line: "Combat › Elimination / Deathmatch · Question 2 of 4". */
export function crumbs(items) {
  const children = [];
  items.forEach((item, i) => {
    if (i) children.push(h('span', { class: 'g-crumb-sep', 'aria-hidden': 'true' }, '›'));
    if (item.route) {
      children.push(h('a', { class: 'g-crumb', href: item.href || '#' }, item.label));
    } else {
      children.push(h('span', { class: 'g-crumb is-current' }, item.label));
    }
  });
  return h('nav', { class: 'g-crumbs', 'aria-label': 'Breadcrumb' }, ...children);
}

/* ----------------------------------- buttons ----------------------------------- */

const VARIANTS = {
  primary: 'g-btn g-btn-primary',
  secondary: 'g-btn g-btn-secondary',
  quiet: 'g-btn g-btn-quiet',
  danger: 'g-btn g-btn-danger'
};

/**
 * A button. Renders as an <a> when given `href`, so links stay links: right-clickable, shareable,
 * and correct for keyboard and screen-reader users.
 */
export function button({ label, onClick, variant = 'secondary', iconName = null, href = null, disabled = false, title = null, type = 'button' }) {
  const content = [];
  if (iconName && iconName === 'arrowLeft') content.push(icon(iconName, 16));
  content.push(h('span', {}, label));
  if (iconName && iconName !== 'arrowLeft') content.push(icon(iconName, 16));

  const props = {
    class: `${VARIANTS[variant] || VARIANTS.secondary}${disabled ? ' is-disabled' : ''}`,
    title
  };
  if (href && !disabled) {
    const a = h('a', { ...props, href }, ...content);
    if (onClick) a.addEventListener('click', onClick);
    return a;
  }
  const el = h('button', { ...props, type, disabled }, ...content);
  if (onClick && !disabled) el.addEventListener('click', onClick);
  return el;
}

export function buttonRow(children, options = {}) {
  return h('div', { class: `g-btnrow${options.between ? ' is-between' : ''}` }, ...children);
}

/* ----------------------------------- choice card ----------------------------------- */

/**
 * A large selectable card, used for design modes, categories and game types.
 *
 * Selection is conveyed by `aria-pressed` plus a text marker, never by colour alone — the palette
 * has a single accent and status colour-coding is exactly what the accessibility pass is removing.
 */
export function choice({ label, description, meta, badges = [], onSelect, selected = false, disabled = false, as = 'button', href = null }) {
  /* Badges may arrive as descriptors or as ready-made chips, depending on whether the caller needed
   * to compute anything. Normalising here is what stops a chip being wrapped in a second, empty chip —
   * which renders as a blank pill and looks like a CSS bug. */
  const badgeNodes = badges.map((badge) => (badge instanceof Node ? badge : badgeChip(badge)));

  const children = [
    h('span', { class: 'g-choice-head' },
      cardTitle(label),
      selected ? h('span', { class: 'g-choice-marker' }, '✓ Selected') : null
    ),
    description ? h('p', { class: 'g-choice-desc' }, richText(description)) : null,
    badgeNodes.length || meta ? h('span', { class: 'g-choice-foot' }, ...badgeNodes, meta ? h('span', { class: 'g-choice-meta' }, meta) : null) : null
  ];

  const props = {
    class: `g-choice${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`,
    type: 'button'
  };
  if (as === 'a' && href) {
    const a = h('a', { ...props, href, role: 'button' }, ...children);
    if (onSelect && !disabled) a.addEventListener('click', onSelect);
    return a;
  }
  const el = h('button', { ...props, disabled, 'aria-pressed': selected ? 'true' : 'false' }, ...children);
  if (onSelect && !disabled) el.addEventListener('click', onSelect);
  return el;
}

/** A small status chip: "Draft", "Basics only", "Researched". */
export function badgeChip({ text, tone = 'neutral', title = null }) {
  return h('span', { class: `g-badge g-badge-${tone}`, title }, text);
}

/* ----------------------------------- notices ----------------------------------- */

/** The session's one message slot, rendered the same way on every screen. */
export function noticeBox(notice, onDismiss) {
  if (!notice) return null;
  return h(
    'div',
    { class: `g-notice g-notice-${notice.tone || 'info'}`, role: notice.tone === 'warn' ? 'alert' : 'status' },
    h('p', { class: 'g-notice-text' }, richText(notice.text)),
    onDismiss ? button({ label: 'Dismiss', variant: 'quiet', onClick: onDismiss }) : null
  );
}

/* ----------------------------------- images ----------------------------------- */

/**
 * An image slot that degrades to a self-explaining placeholder.
 *
 * Images are convention-based, not configured: drop a correctly named file in the right folder and
 * it appears, with no code change. When it is missing the placeholder names the exact path and the
 * size the asset should be, so a non-technical contributor knows what to supply. The brief calls this
 * one of the genuinely good ideas in v1, so it is kept.
 */
export function imageSlot({ src, alt, spec, className = '', ratio = null, label = null, compact = false }) {
  const wrap = h('div', { class: `g-imgslot ${className}`.trim() });
  if (ratio) wrap.style.aspectRatio = ratio;

  const img = h('img', { src, alt, class: 'g-img', loading: 'lazy', decoding: 'async' });
  img.addEventListener('load', () => wrap.classList.add('is-loaded'));
  img.addEventListener(
    'error',
    () => {
      wrap.classList.remove('is-loaded');
      wrap.classList.add('is-missing');
      img.remove();
      if (!wrap.querySelector('.g-imgfallback')) wrap.append(fallback());
    },
    { once: true }
  );

  function fallback() {
    /* A 64 px tile cannot hold a file path and a size spec, and trying to made a wall of single
     * letters. Small slots get a monogram plus the same information as a tooltip; large slots get the
     * full, readable instruction. */
    if (compact) {
      return h(
        'div',
        { class: 'g-imgfallback is-compact', title: `${src} — needs ${spec || 'an image'}` },
        h('span', { class: 'g-imgfallback-mark' }, monogram(label || src)),
        h('span', { class: 'g-imgfallback-spec' }, 'no art')
      );
    }
    return h(
      'div',
      { class: 'g-imgfallback' },
      label ? h('span', { class: 'g-imgfallback-label' }, label) : null,
      h('code', { class: 'g-imgfallback-path' }, src),
      spec ? h('span', { class: 'g-imgfallback-spec' }, `Needs ${spec}`) : null
    );
  }

  wrap.append(img);
  return wrap;
}

/** "Star Wars" → "SW", "Original (No Brand Template)" → "ON". Used only for a missing tile logo. */
function monogram(value) {
  const words = String(value || '?')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

/* ----------------------------------- misc ----------------------------------- */

/**
 * A titled block: card surface, optional right-hand slot for a badge or action.
 *
 * `heading` takes a node when the title is the screen's own <h1> (the question screen and the
 * walkthrough do this), because focus lands on the h1 after every screen change and a screen with no
 * h1 leaves a keyboard user at the top of the document.
 */
export function panel({ title, eyebrowText, heading = null, children, actions = null, className = '' }) {
  return h(
    'section',
    { class: `g-panel ${className}`.trim() },
    title || eyebrowText || actions || heading
      ? h(
          'header',
          { class: 'g-panel-head' },
          h('div', {}, eyebrowText ? eyebrow(eyebrowText) : null, heading || (title ? cardTitle(title) : null)),
          actions ? h('div', { class: 'g-panel-actions' }, ...actions) : null
        )
      : null,
    ...children
  );
}
