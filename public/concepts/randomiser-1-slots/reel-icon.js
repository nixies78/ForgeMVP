// Recolourable randomiser reel icons (pairs with reel-icon.css).
//
// imagePath is the path the page already uses for an entry's image, e.g.
//   '../_media/randomiser/flavours/vampires.webp'
// The three masks sit next to it: vampires.mask-dark.webp, .mask-main.webp, .mask-light.webp.

const ROLES = ['dark', 'main', 'light'];
const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML for one recolourable icon. Colours come from --icon-dark / --icon-main / --icon-light. */
export function reelIconHTML(imagePath, label = '') {
  const layers = maskPaths(imagePath).map((path, i) => {
    const url = escAttr(path);
    return `<span class="${ROLES[i]}" style="-webkit-mask-image:url('${url}');mask-image:url('${url}')"></span>`;
  }).join('');
  return `<span class="reel-icon" role="img" aria-label="${escAttr(label)}">${layers}</span>`;
}

/** Resolves true if the icon exists (checks the full-colour file), so the page can keep its placeholder otherwise. */
export function iconExists(imagePath) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imagePath;
  });
}

/* ---------- Check once, then answer from the cache ---------- */

/** imagePath -> true (icon exists) / false (keep the placeholder). Shared by every reel on the page. */
const known = new Map();

/** The three mask paths that sit next to an icon's full-colour file. */
export const maskPaths = imagePath => ROLES.map(role => imagePath.replace(/\.webp$/, `.mask-${role}.webp`));

/**
 * Checks every entry's icon once, when the reels are built, and caches the answers so a spin never
 * asks again. The masks of the icons that exist are warmed into the cache too, so the first spin
 * doesn't show empty frames while they arrive.
 */
export async function checkIcons(entries) {
  const paths = [...new Set(entries.map(e => e?.image).filter(Boolean))].filter(p => !known.has(p));
  await Promise.all(paths.map(async path => {
    const ok = await iconExists(path);
    known.set(path, ok);
    if (ok) for (const mask of maskPaths(path)) new Image().src = mask;
  }));
}

/** True only for an icon checkIcons() found. Anything unchecked or missing keeps its placeholder. */
export const hasIcon = imagePath => known.get(imagePath) === true;
