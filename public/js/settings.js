/**
 * Settings persistence. The API key is stored ONLY in this browser's
 * localStorage - it is never sent to this site's server and never committed.
 */

import { DEFAULT_MODEL, STORAGE_KEYS, storage } from './config.js';

export function getSettings() {
  return {
    apiKey: storage.get(STORAGE_KEYS.apiKey) || '',
    model: storage.get(STORAGE_KEYS.model) || DEFAULT_MODEL,
    stream: storage.get(STORAGE_KEYS.stream) !== 'false',
  };
}

export function saveSettings({ apiKey, model, stream } = {}) {
  if (typeof apiKey === 'string') storage.set(STORAGE_KEYS.apiKey, apiKey.trim());
  if (typeof model === 'string' && model) storage.set(STORAGE_KEYS.model, model);
  if (typeof stream === 'boolean') storage.set(STORAGE_KEYS.stream, String(stream));
  return getSettings();
}

export function clearSettings() {
  storage.remove(STORAGE_KEYS.apiKey);
  storage.remove(STORAGE_KEYS.model);
  storage.remove(STORAGE_KEYS.stream);
}
