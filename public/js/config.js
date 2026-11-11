/**
 * Shared configuration for the ForgeMVP front end.
 * Pure data + tiny helpers only (no DOM access) so Node tests can import it.
 */

export const APP_NAME = 'ForgeMVP';
export const APP_TAGLINE = 'UEFN game design documents';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';
export const OPENROUTER_MODELS_DOCS = 'https://openrouter.ai/models';

/**
 * Fallback model, used when the live catalogue has not been fetched yet.
 * DeepSeek V4.1 (flash tier) was the newest DeepSeek on OpenRouter when this was
 * written. You normally do not need to trust this constant: on the admin page the
 * live catalogue is fetched and `pickLatestDeepSeek()` selects the newest DeepSeek
 * automatically, so the default keeps up as DeepSeek ships new versions.
 */
export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

/** Seed list shown before the live catalogue is fetched. Newest DeepSeek first. */
export const SEED_MODELS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (newest)' },
  { id: 'deepseek/deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017 build)' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro (strongest V4)' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2 (previous version)' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (V3 alias)' },
];

export const STORAGE_KEYS = {
  apiKey: 'forgemvp.openrouter.apiKey',
  model: 'forgemvp.openrouter.model',
  stream: 'forgemvp.chat.stream',
};

/**
 * Pick the newest DeepSeek model from a live OpenRouter catalogue.
 *
 * Ranking, highest first: version (v4.1 beats v4.0), then tier (pro > chat > base
 * or flash), then the undated alias over a pinned build snapshot. Batch (`:batch`)
 * and experimental (`-exp`) endpoints are skipped, and so are DeepSeek models with
 * no version in their id (deepseek-chat, deepseek-r1) because "newest" is
 * undefined for them.
 *
 * Returns null when nothing matches, so callers can fall back to DEFAULT_MODEL.
 */
export function pickLatestDeepSeek(models = []) {
  const candidates = [];

  for (const model of models) {
    const id = model?.id;
    if (typeof id !== 'string' || !id.startsWith('deepseek/')) continue;
    if (id.includes(':')) continue; // asynchronous batch endpoint, not the live model
    if (/(^|[-/])exp(erimental)?([-/]|$)/i.test(id)) continue; // preview build

    const version = /-v(\d+)(?:\.(\d+))?/i.exec(id);
    if (!version) continue;

    candidates.push({
      id,
      major: Number(version[1]),
      minor: Number(version[2] || 0),
      tier: /-pro\b/i.test(id) ? 2 : /-chat\b/i.test(id) ? 1 : 0,
      pinnedBuild: /-\d{3,4}$/.test(id) ? 1 : 0,
    });
  }

  candidates.sort(
    (a, b) =>
      b.major - a.major ||
      b.minor - a.minor ||
      b.tier - a.tier ||
      a.pinnedBuild - b.pinnedBuild ||
      a.id.localeCompare(b.id)
  );

  return candidates[0]?.id ?? null;
}

/** localStorage is unavailable in some private/embedded modes - fall back to memory. */
const memoryStore = new Map();

export const storage = {
  get(key) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch {
      /* fall through to memory */
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return true;
      }
    } catch {
      /* fall through to memory */
    }
    memoryStore.set(key, value);
    return false;
  },
  remove(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memoryStore.delete(key);
  },
};

/**
 * OpenRouter keys look like `sk-or-v1-<64 hex chars>`. We only warn, never block,
 * so future key formats still work.
 */
export function checkKeyFormat(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, level: 'error', message: 'No API key entered.' };
  if (/\s/.test(key)) return { ok: false, level: 'error', message: 'Key contains whitespace - check for a bad paste.' };
  if (key.startsWith('sk-or-')) return { ok: true, level: 'ok', message: 'Looks like an OpenRouter key.' };
  if (key.startsWith('sk-')) return { ok: true, level: 'warn', message: 'Starts with "sk-" but not "sk-or-" - make sure it is an OpenRouter key, not an OpenAI one.' };
  return { ok: true, level: 'warn', message: 'Unusual key format - continuing anyway.' };
}

/** Never render a full key back into the page. */
export function maskKey(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) return '';
  if (key.length <= 12) return key[0] + '*'.repeat(Math.max(key.length - 1, 0));
  return `${key.slice(0, 10)}...${key.slice(-4)}  (${key.length} chars)`;
}
