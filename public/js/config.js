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
 * Default model. DeepSeek V3.2 is the current DeepSeek flagship on OpenRouter.
 * Use "Refresh models from OpenRouter" on the admin page to pull the live list
 * and confirm the slug, or paste any model id into the custom-model box.
 */
export const DEFAULT_MODEL = 'deepseek/deepseek-v3.2';

/** Seed list shown before the live catalogue is fetched. DeepSeek first. */
export const SEED_MODELS = [
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2 (latest · recommended)' },
  { id: 'deepseek/deepseek-chat-v3.2', name: 'DeepSeek Chat V3.2' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat V3.1' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (V3 alias)' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (reasoning)' },
];

export const STORAGE_KEYS = {
  apiKey: 'forgemvp.openrouter.apiKey',
  model: 'forgemvp.openrouter.model',
  stream: 'forgemvp.chat.stream',
};

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
