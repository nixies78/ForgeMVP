/**
 * Unit tests for the OpenRouter client, config helpers and settings.
 * Run:  node tests/openrouter.test.mjs     (or: npm test)
 *
 * Every network call is mocked, so these pass with no internet and no API key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_MODEL, checkKeyFormat, maskKey, SEED_MODELS } from '../public/js/config.js';
import { clearSettings, getSettings, saveSettings } from '../public/js/settings.js';
import {
  buildModelOptions,
  chat,
  chatStream,
  describeHttpError,
  getKeyInfo,
  listModels,
  pingModel,
  testConnection,
} from '../public/js/openrouter.js';

/* ----------------------------- helpers ----------------------------- */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const FILE_MODELS = [
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', context_length: 163840 },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', context_length: 65536 },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', context_length: 128000 },
];

/** Route-aware fake fetch. Records every call. */
function makeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function sseStream(frames) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/* ----------------------------- config ----------------------------- */

test('default model is the current DeepSeek release', () => {
  assert.equal(DEFAULT_MODEL, 'deepseek/deepseek-v3.2');
  assert.equal(SEED_MODELS[0].id, DEFAULT_MODEL);
});

test('checkKeyFormat flags empty, whitespace and non-OpenRouter keys', () => {
  assert.equal(checkKeyFormat('').ok, false);
  assert.equal(checkKeyFormat('   ').ok, false);
  assert.equal(checkKeyFormat('sk-or-v1-abc def').ok, false);
  assert.equal(checkKeyFormat('sk-or-v1-abcdef').level, 'ok');
  assert.equal(checkKeyFormat('sk-proj-abcdef').level, 'warn');
  assert.equal(checkKeyFormat('nonsense').level, 'warn');
});

test('maskKey never reveals the whole key', () => {
  const key = 'sk-or-v1-0123456789abcdef0123456789abcdef';
  const masked = maskKey(key);
  assert.ok(!masked.includes('abcdef0123456789'));
  assert.ok(masked.startsWith('sk-or-v1-0'));
  assert.equal(maskKey(''), '');
});

/* ----------------------------- model list ----------------------------- */

test('buildModelOptions puts DeepSeek first, dedupes and keeps a saved selection', () => {
  const options = buildModelOptions({ live: FILE_MODELS, selected: 'openai/gpt-4o-mini' });
  const ids = options.map((o) => o.id);

  assert.equal(ids[0], 'deepseek/deepseek-v3.2');
  assert.ok(ids.indexOf('deepseek/deepseek-r1') < ids.indexOf('openai/gpt-4o-mini'));
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
  assert.ok(ids.includes('openai/gpt-4o-mini'), 'saved non-DeepSeek selection is preserved');
  // The seed entry for v3.2 must not be duplicated by the live entry.
  assert.equal(ids.filter((id) => id === 'deepseek/deepseek-v3.2').length, 1);
});

test('buildModelOptions never returns an empty dropdown', () => {
  assert.ok(buildModelOptions({ live: [] }).length >= SEED_MODELS.length);
});

/* ----------------------------- error text ----------------------------- */

test('describeHttpError explains the common failures', () => {
  assert.match(describeHttpError(401), /rejected/i);
  assert.match(describeHttpError(402), /credits/i);
  assert.match(describeHttpError(429), /Rate limited/i);
  assert.match(describeHttpError(500), /HTTP 500/);
  assert.match(describeHttpError(401, { error: { message: 'No auth credentials found' } }), /No auth credentials found/);
});

/* ----------------------------- auth + catalogue ----------------------------- */

test('getKeyInfo sends the bearer token and unwraps the data envelope', async () => {
  const fetchImpl = makeFetch(() => json({ data: { label: 'my key', usage: 1.5, limit: 10 } }));
  const info = await getKeyInfo({ apiKey: 'sk-or-v1-test', fetchImpl });

  assert.equal(info.label, 'my key');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer sk-or-v1-test');
  assert.ok(!fetchImpl.calls[0].url.includes('sk-or-v1-test'), 'key is never put in the URL');
});

test('listModels sorts the catalogue and tolerates junk entries', async () => {
  const fetchImpl = makeFetch(() => json({ data: [...FILE_MODELS, null, { name: 'no id' }] }));
  const models = await listModels({ fetchImpl });

  assert.equal(models.length, 3);
  assert.deepEqual(
    models.map((m) => m.id),
    ['deepseek/deepseek-r1', 'deepseek/deepseek-v3.2', 'openai/gpt-4o-mini']
  );
});

/* ----------------------------- testConnection ----------------------------- */

test('testConnection reports success when the key and model are both fine', async () => {
  const fetchImpl = makeFetch((url, init) => {
    if (url.endsWith('/key')) {
      assert.equal(init.headers.Authorization, 'Bearer sk-or-v1-good');
      return json({ data: { label: 'forge', usage: 0.25, limit: 5, is_free_tier: true } });
    }
    if (url.endsWith('/models')) return json({ data: FILE_MODELS });
    throw new Error(`unexpected url ${url}`);
  });

  const result = await testConnection({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.modelAvailable, true);
  assert.equal(result.models.length, 3);
  assert.equal(result.steps.length, 4);
  assert.ok(result.steps.every((s) => s.ok));
  assert.match(result.steps[1].detail, /forge/);
  assert.match(result.steps[1].detail, /free tier/);
});

test('testConnection stops early on a rejected key', async () => {
  const fetchImpl = makeFetch(() => json({ error: { message: 'No auth credentials found', code: 401 } }, 401));
  const result = await testConnection({ apiKey: 'sk-or-v1-bad', model: DEFAULT_MODEL, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1].ok, false);
  assert.equal(result.steps[1].status, 401);
  assert.match(result.steps[1].detail, /401 Unauthorized/);
});

test('testConnection flags a model that is not in the live catalogue', async () => {
  const fetchImpl = makeFetch((url) =>
    url.endsWith('/key') ? json({ data: { label: 'forge' } }) : json({ data: FILE_MODELS })
  );
  const result = await testConnection({ apiKey: 'sk-or-v1-good', model: 'deepseek/does-not-exist', fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.modelAvailable, false);
  assert.match(result.steps.at(-1).name, /does-not-exist/);
  assert.match(result.steps.at(-1).detail, /Not found in the live catalogue/);
});

test('testConnection without a key does not touch the network', async () => {
  const fetchImpl = makeFetch(() => {
    throw new Error('network should not be called');
  });
  const result = await testConnection({ apiKey: '  ', fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(result.steps.length, 1);
});

/* ----------------------------- generation ----------------------------- */

test('pingModel sends a tiny deterministic request and reads the reply', async () => {
  const fetchImpl = makeFetch((url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(body.messages.at(-1).content, 'ping');
    assert.equal(body.max_tokens, 16);
    assert.equal(body.stream, undefined, 'the ping is not streamed');
    return json({
      model: 'deepseek/deepseek-v3.2',
      choices: [{ message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
      usage: { total_tokens: 12 },
    });
  });

  const result = await pingModel({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, fetchImpl });

  assert.equal(result.text, 'pong');
  assert.equal(result.model, 'deepseek/deepseek-v3.2');
  assert.equal(result.usage.total_tokens, 12);
  assert.equal(typeof result.ms, 'number');
});

test('chat returns content and usage for a non-streamed call', async () => {
  const fetchImpl = makeFetch(() =>
    json({
      model: DEFAULT_MODEL,
      choices: [{ message: { content: 'Island concept: volcano arena.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 7, total_tokens: 16 },
    })
  );

  const result = await chat({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, messages: [{ role: 'user', content: 'hi' }], fetchImpl });

  assert.match(result.text, /volcano arena/);
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.usage.total_tokens, 16);
});

test('chat raises an actionable error when the key is out of credits', async () => {
  const fetchImpl = makeFetch(() => json({ error: { message: 'Insufficient credits', code: 402 } }, 402));

  await assert.rejects(
    () => chat({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, messages: [], fetchImpl }),
    (err) => {
      assert.equal(err.name, 'OpenRouterError');
      assert.equal(err.status, 402);
      assert.match(err.message, /credits/i);
      return true;
    }
  );
});

test('chatStream yields reasoning, content and a final done event', async () => {
  const fetchImpl = makeFetch(() =>
    sseStream([
      ': keep-alive\n\n',
      'data: {"model":"deepseek/deepseek-v3.2","choices":[{"delta":{"reasoning":"let me think"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"total_tokens":7}}\n\n',
      'data: [DONE]\n\n',
    ])
  );

  const events = [];
  for await (const event of chatStream({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, messages: [{ role: 'user', content: 'hi' }], fetchImpl })) {
    events.push(event);
  }

  const reasoning = events.filter((e) => e.type === 'reasoning').map((e) => e.text).join('');
  const content = events.filter((e) => e.type === 'content').map((e) => e.text).join('');
  const done = events.at(-1);

  assert.equal(reasoning, 'let me think');
  assert.equal(content, 'Hello world');
  assert.equal(done.type, 'done');
  assert.equal(done.usage.total_tokens, 7);
  assert.equal(done.finishReason, 'stop');
  assert.equal(done.model, 'deepseek/deepseek-v3.2');

  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(body.stream, true);
  assert.equal(fetchImpl.calls[0].init.headers.Accept, 'text/event-stream');
});

test('chatStream surfaces an error frame from the stream', async () => {
  const fetchImpl = makeFetch(() => sseStream(['data: {"error":{"code":429,"message":"Rate limit exceeded"}}\n\n']));

  await assert.rejects(
    async () => {
      for await (const _event of chatStream({ apiKey: 'sk-or-v1-good', model: DEFAULT_MODEL, messages: [], fetchImpl })) {
        // draining the stream triggers the throw
      }
    },
    (err) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /Rate limit exceeded/);
      return true;
    }
  );
});

/* ----------------------------- settings ----------------------------- */

test('settings round-trip and default to DeepSeek with streaming on', () => {
  clearSettings();
  const defaults = getSettings();
  assert.equal(defaults.apiKey, '');
  assert.equal(defaults.model, DEFAULT_MODEL);
  assert.equal(defaults.stream, true);

  saveSettings({ apiKey: '  sk-or-v1-padded  ', model: 'deepseek/deepseek-r1', stream: false });
  const saved = getSettings();
  assert.equal(saved.apiKey, 'sk-or-v1-padded', 'keys are trimmed');
  assert.equal(saved.model, 'deepseek/deepseek-r1');
  assert.equal(saved.stream, false);

  clearSettings();
  assert.equal(getSettings().apiKey, '');
});
