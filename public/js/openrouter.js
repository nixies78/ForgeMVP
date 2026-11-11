/**
 * The OpenRouter client. Pure fetch + logic - no DOM - so it can be unit tested
 * in Node with a stubbed `fetch`.
 *
 * Browser note: OpenRouter sends permissive CORS headers, so the API can be
 * called directly from the page. The key lives only in this browser's
 * localStorage and is never committed to the repository.
 */

import {
  APP_NAME,
  DEFAULT_MODEL,
  OPENROUTER_BASE,
  SEED_MODELS,
} from './config.js';

export const REQUEST_TIMEOUT_MS = 60_000;

export class OpenRouterError extends Error {
  constructor(message, { status = 0, body = null, cause = null } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.body = body;
    if (cause) this.cause = cause;
  }
}

function authHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Title': APP_NAME,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
      headers['HTTP-Referer'] = location.origin;
    }
  } catch {
    /* ignore */
  }
  return headers;
}

/** Turn an HTTP failure into something a human can act on. */
export function describeHttpError(status, body) {
  const apiMessage =
    (body && (body.error?.message || body.error || body.message)) || '';
  const suffix = apiMessage ? ` OpenRouter said: ${apiMessage}` : '';
  switch (status) {
    case 401:
      return `401 Unauthorized - the API key was rejected. Check it was copied in full and is an OpenRouter key.${suffix}`;
    case 402:
      return `402 Payment required - this key is out of credits. Top up at openrouter.ai/credits.${suffix}`;
    case 403:
      return `403 Forbidden - the key is valid but not allowed to use this model.${suffix}`;
    case 404:
      return `404 Not found - the model id may be wrong or retired.${suffix}`;
    case 408:
      return `408 Timeout - OpenRouter did not respond in time.${suffix}`;
    case 429:
      return `429 Rate limited - too many requests, or free-tier limits reached. Wait and retry.${suffix}`;
    case 502:
    case 503:
      return `${status} - the upstream model provider is unavailable right now.${suffix}`;
    default:
      return `Request failed with HTTP ${status}.${suffix}`;
  }
}

async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 400) };
  }
}

async function request(url, { apiKey, method = 'GET', body, fetchImpl, signal } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new OpenRouterError('No fetch implementation available in this environment.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await doFetch(url, {
      method,
      headers: authHeaders(apiKey),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = await readBody(res);
    if (!res.ok) throw new OpenRouterError(describeHttpError(res.status, parsed), { status: res.status, body: parsed });
    return parsed;
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    const aborted = controller.signal.aborted;
    const reason = aborted ? 'Timed out or cancelled' : 'Network/CORS error';
    throw new OpenRouterError(
      `${reason}: ${err?.message || err}. If this says "Failed to fetch", check your internet connection or that a browser extension is not blocking openrouter.ai.`,
      { cause: err }
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** GET /key - the cheapest way to prove the key itself is valid. */
export async function getKeyInfo({ apiKey, fetchImpl, signal } = {}) {
  const data = await request(`${OPENROUTER_BASE}/key`, { apiKey, fetchImpl, signal });
  return data?.data ?? data;
}

/** GET /models - public, no key needed. */
export async function listModels({ fetchImpl, signal } = {}) {
  const data = await request(`${OPENROUTER_BASE}/models`, { fetchImpl, signal });
  const models = Array.isArray(data?.data) ? data.data : [];
  return models
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({ id: m.id, name: m.name || m.id, context: m.context_length || null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Live catalogue first, seed list as a fallback so the dropdown is never empty. */
export function buildModelOptions({ live = [], selected = '', allowCustom = false } = {}) {
  const seen = new Set();
  const options = [];
  const add = (id, name) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, name: name || id });
  };

  const deepseekLive = live.filter((m) => m.id.startsWith('deepseek/'));
  const otherLive = live.filter((m) => !m.id.startsWith('deepseek/'));

  for (const m of deepseekLive) add(m.id, m.name);
  for (const m of SEED_MODELS) add(m.id, m.name);
  for (const m of otherLive) add(m.id, m.name);
  if (selected) add(selected, `${selected} (saved)`);
  if (allowCustom) add('__custom__', 'Custom model id...');

  return options;
}

/** Run the three checks the admin page shows: key auth, catalogue, model presence. */
export async function testConnection({ apiKey, model = DEFAULT_MODEL, fetchImpl, signal } = {}) {
  const steps = [];
  const result = { ok: false, keyInfo: null, models: null, modelAvailable: null, steps };

  // Step 1: key present
  if (!apiKey || !apiKey.trim()) {
    steps.push({ name: 'API key present', ok: false, detail: 'Enter your OpenRouter API key first.' });
    return result;
  }
  steps.push({ name: 'API key present', ok: true, detail: 'A key was supplied.' });

  // Step 2: authenticate against /key
  try {
    const keyInfo = await getKeyInfo({ apiKey, fetchImpl, signal });
    result.keyInfo = keyInfo;
    const label = keyInfo?.label ? `"${keyInfo.label}"` : 'unnamed key';
    const usage = typeof keyInfo?.usage === 'number' ? ` usage $${keyInfo.usage.toFixed(4)}` : '';
    const limit =
      typeof keyInfo?.limit === 'number' && keyInfo.limit !== null
        ? ` of $${keyInfo.limit} limit`
        : ' (no spend limit set)';
    const free = keyInfo?.is_free_tier ? ' · free tier' : '';
    steps.push({
      name: 'Authenticated with OpenRouter',
      ok: true,
      detail: `Key ${label} accepted${usage}${limit}${free}.`,
      status: 200,
    });
  } catch (err) {
    steps.push({
      name: 'Authenticated with OpenRouter',
      ok: false,
      detail: err.message,
      status: err.status || 0,
    });
    return result;
  }

  // Step 3: catalogue reachable + selected model exists
  try {
    const models = await listModels({ fetchImpl, signal });
    result.models = models;
    const match = models.find((m) => m.id === model);
    result.modelAvailable = Boolean(match);
    steps.push({
      name: 'Loaded model catalogue',
      ok: true,
      detail: `${models.length} models available from OpenRouter.`,
      status: 200,
    });
    steps.push({
      name: `Selected model "${model}" is available`,
      ok: result.modelAvailable,
      detail: match
        ? `${match.name}${match.context ? ` · ${match.context.toLocaleString()} token context` : ''}`
        : 'Not found in the live catalogue. Pick another model, or press "Refresh models" then reselect.',
    });
  } catch (err) {
    steps.push({ name: 'Loaded model catalogue', ok: false, detail: err.message, status: err.status || 0 });
    return result;
  }

  result.ok = steps.every((s) => s.ok);
  return result;
}

/**
 * A real (tiny, near-free) generation - the only way to prove the chosen model
 * actually answers. Used by the "Send test prompt" button.
 */
export async function pingModel({ apiKey, model = DEFAULT_MODEL, fetchImpl, signal } = {}) {
  const started = Date.now();
  const data = await request(`${OPENROUTER_BASE}/chat/completions`, {
    apiKey,
    method: 'POST',
    fetchImpl,
    signal,
    body: {
      model,
      messages: [
        { role: 'system', content: 'Reply with exactly the word: pong' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 16,
      temperature: 0,
    },
  });
  const choice = data?.choices?.[0];
  return {
    ms: Date.now() - started,
    text: (choice?.message?.content || '').trim(),
    finishReason: choice?.finish_reason || null,
    usage: data?.usage || null,
    model: data?.model || model,
  };
}

/**
 * Streaming chat. Async generator yielding:
 *   { type: 'content', text } | { type: 'reasoning', text } | { type: 'done', usage, model, finishReason }
 */
export async function* chatStream({ apiKey, model = DEFAULT_MODEL, messages = [], fetchImpl, signal, temperature } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const body = { model, messages, stream: true };
  if (typeof temperature === 'number') body.temperature = temperature;

  const res = await doFetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const parsed = await readBody(res);
    throw new OpenRouterError(describeHttpError(res.status, parsed), { status: res.status, body: parsed });
  }
  if (!res.body) {
    throw new OpenRouterError('Streaming is not supported by this browser response object.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let usedModel = model;
  let finishReason = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line || line.startsWith(':')) continue; // comment / keep-alive
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue; // partial frame - ignore
        }
        if (json.error) {
          throw new OpenRouterError(describeHttpError(json.error.code || 500, json), {
            status: json.error.code || 500,
            body: json,
          });
        }
        if (json.model) usedModel = json.model;
        if (json.usage) usage = json.usage;

        const choice = json.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta || choice.message || {};
        if (typeof delta.reasoning === 'string' && delta.reasoning) {
          yield { type: 'reasoning', text: delta.reasoning };
        }
        if (typeof delta.content === 'string' && delta.content) {
          yield { type: 'content', text: delta.content };
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  yield { type: 'done', usage, model: usedModel, finishReason };
}

/** Non-streaming single-shot completion (used by the "no streaming" toggle). */
export async function chat({ apiKey, model = DEFAULT_MODEL, messages = [], fetchImpl, signal, temperature } = {}) {
  const body = { model, messages };
  if (typeof temperature === 'number') body.temperature = temperature;
  const data = await request(`${OPENROUTER_BASE}/chat/completions`, {
    apiKey,
    method: 'POST',
    fetchImpl,
    signal,
    body,
  });
  const choice = data?.choices?.[0];
  return {
    text: choice?.message?.content || '',
    reasoning: choice?.message?.reasoning || '',
    finishReason: choice?.finish_reason || null,
    usage: data?.usage || null,
    model: data?.model || model,
  };
}
