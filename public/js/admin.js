/**
 * Admin page: store the OpenRouter key, choose the model, and verify the
 * connection end to end.
 */

import { DEFAULT_MODEL, checkKeyFormat, maskKey } from './config.js';
import { getSettings, saveSettings, clearSettings } from './settings.js';
import {
  buildModelOptions,
  listModels,
  pingModel,
  testConnection,
} from './openrouter.js';

const el = (id) => document.getElementById(id);

const ui = {
  apiKey: el('apiKey'),
  toggleKey: el('toggleKey'),
  saveSettings: el('saveSettings'),
  keyState: el('keyState'),
  modelSelect: el('modelSelect'),
  modelBadge: el('modelBadge'),
  modelState: el('modelState'),
  refreshModels: el('refreshModels'),
  customModel: el('customModel'),
  testConnection: el('testConnection'),
  pingModel: el('pingModel'),
  status: el('status'),
  steps: el('steps'),
};

let liveModels = [];
let keyVisible = false;

/* ---------------- model helpers ---------------- */

function currentModel() {
  const custom = ui.customModel.value.trim();
  if (custom) return custom;
  const selected = ui.modelSelect.value;
  if (!selected || selected === '__custom__') return DEFAULT_MODEL;
  return selected;
}

function renderModelSelect(selected) {
  const options = buildModelOptions({ live: liveModels, selected });
  ui.modelSelect.innerHTML = '';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.id;
    node.textContent = option.id === option.name ? option.id : `${option.name}  —  ${option.id}`;
    ui.modelSelect.appendChild(node);
  }
  ui.modelSelect.value = options.some((o) => o.id === selected) ? selected : options[0]?.id || DEFAULT_MODEL;
  updateModelBadge();
}

function updateModelBadge() {
  const model = currentModel();
  const vendor = model.includes('/') ? model.split('/')[0] : model;
  ui.modelBadge.textContent = vendor;
  ui.modelBadge.className = `badge${vendor === 'deepseek' ? ' ok' : ''}`;
}

function refreshKeyState() {
  const { apiKey } = getSettings();
  if (!apiKey) {
    ui.keyState.textContent = 'No key saved yet. Paste your OpenRouter key above and press Save.';
    return;
  }
  ui.keyState.innerHTML = `Saved in this browser: <span class="mono">${escapeHtml(maskKey(apiKey))}</span> &middot; <a href="#" id="clearKey">remove</a>`;
  const link = ui.keyState.querySelector('#clearKey');
  if (link) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      clearSettings();
      ui.apiKey.value = '';
      renderModelSelect(DEFAULT_MODEL);
      refreshKeyState();
      setStatus('warn', 'Key removed', 'The stored OpenRouter key was cleared from this browser.');
      ui.steps.innerHTML = '';
    });
  }
}

/* ---------------- status rendering ---------------- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function setStatus(kind, title, body = '') {
  ui.status.className = `status ${kind}`;
  ui.status.innerHTML = `<div class="status-title">${escapeHtml(title)}</div>${
    body ? `<div class="small">${escapeHtml(body)}</div>` : ''
  }`;
  ui.status.classList.remove('hidden');
}

function renderSteps(steps) {
  ui.steps.innerHTML = '';
  for (const step of steps) {
    const li = document.createElement('li');
    const mark = step.ok ? '✓' : step.thinking ? '…' : '✕';
    const markClass = step.ok ? 'ok' : step.thinking ? 'pending' : 'err';
    li.innerHTML =
      `<span class="mark ${markClass}">${mark}</span>` +
      `<span><span class="step-name">${escapeHtml(step.name)}</span>` +
      (step.detail ? `<div class="step-detail">${escapeHtml(step.detail)}</div>` : '') +
      `</span>`;
    ui.steps.appendChild(li);
  }
}

function busy(isBusy, button) {
  for (const b of [ui.testConnection, ui.pingModel, ui.refreshModels, ui.saveSettings]) {
    b.disabled = isBusy;
  }
  if (button) button.textContent = isBusy ? 'Working...' : button.dataset.label;
}

/* ---------------- actions ---------------- */

function persist() {
  const saved = saveSettings({
    apiKey: ui.apiKey.value,
    model: currentModel(),
  });
  ui.modelState.textContent = `Saved. Active model: ${saved.model}`;
  refreshKeyState();
  updateModelBadge();
  return saved;
}

async function onSave() {
  const { apiKey } = persist();
  const format = checkKeyFormat(apiKey);
  if (!apiKey) {
    setStatus('warn', 'No key entered', 'Paste your OpenRouter key, then press Save.');
  } else if (format.level === 'error') {
    setStatus('err', 'Key not saved', format.message);
  } else if (format.level === 'warn') {
    setStatus('warn', 'Saved with a warning', format.message);
  } else {
    setStatus('ok', 'Saved', `Stored in this browser only (${maskKey(apiKey)}). Now press "Test connection".`);
  }
}

async function onRefreshModels() {
  busy(true, ui.refreshModels);
  try {
    liveModels = await listModels();
    const selected = currentModel();
    renderModelSelect(selected);
    persist();
    const deepseekCount = liveModels.filter((m) => m.id.startsWith('deepseek/')).length;
    ui.modelState.textContent = `Loaded ${liveModels.length} live models (${deepseekCount} DeepSeek).`;
    setStatus('ok', 'Model list refreshed', `OpenRouter returned ${liveModels.length} models; ${deepseekCount} are DeepSeek.`);
  } catch (err) {
    setStatus('err', 'Could not load the model list', err.message);
  } finally {
    busy(false, ui.refreshModels);
  }
}

async function onTest() {
  const { apiKey } = persist();
  const model = currentModel();

  busy(true, ui.testConnection);
  setStatus('warn', 'Testing...', `Checking the key and the model "${model}".`);
  renderSteps([
    { name: 'Contacting openrouter.ai', thinking: true, detail: 'GET /api/v1/key, then GET /api/v1/models.' },
  ]);

  try {
    const result = await testConnection({ apiKey, model });
    renderSteps(result.steps);
    if (result.models) liveModels = result.models;

    if (result.ok) {
      setStatus('ok', 'Connection OK', `The key is valid and "${model}" is available. Open the chat test page to talk to it.`);
    } else {
      const failed = result.steps.find((s) => !s.ok);
      setStatus('err', 'Connection failed', failed ? `${failed.name}: ${failed.detail}` : 'See the steps below.');
    }
  } catch (err) {
    renderSteps([{ name: 'Test crashed', ok: false, detail: err.message }]);
    setStatus('err', 'Connection failed', err.message);
  } finally {
    busy(false, ui.testConnection);
  }
}

async function onPing() {
  const { apiKey } = persist();
  const model = currentModel();

  busy(true, ui.pingModel);
  setStatus('warn', 'Sending a test prompt...', `Asking "${model}" to reply "pong". This uses a few tokens.`);
  renderSteps([{ name: `Waiting for ${model}`, thinking: true, detail: 'POST /api/v1/chat/completions' }]);

  try {
    const result = await pingModel({ apiKey, model });
    const tokens = result.usage ? ` · ${result.usage.total_tokens ?? '?'} tokens` : '';
    renderSteps([
      { name: 'API key accepted', ok: true, detail: 'Authenticated with OpenRouter.' },
      { name: `Model replied in ${result.ms} ms`, ok: true, detail: `Served by ${result.model}${tokens}.` },
      { name: 'Model output', ok: true, detail: result.text || '(empty response - try the chat page for a longer prompt)' },
    ]);
    setStatus('ok', 'End-to-end success', `"${model}" answered. Everything is wired up correctly.`);
  } catch (err) {
    renderSteps([{ name: 'Test prompt failed', ok: false, detail: err.message }]);
    setStatus('err', 'Test prompt failed', err.message);
  } finally {
    busy(false, ui.pingModel);
  }
}

/* ---------------- init ---------------- */

function init() {
  for (const button of [ui.testConnection, ui.pingModel, ui.refreshModels, ui.saveSettings]) {
    button.dataset.label = button.textContent;
  }

  const settings = getSettings();
  ui.apiKey.value = settings.apiKey;
  renderModelSelect(settings.model);
  refreshKeyState();

  ui.toggleKey.addEventListener('click', () => {
    keyVisible = !keyVisible;
    ui.apiKey.type = keyVisible ? 'text' : 'password';
    ui.toggleKey.textContent = keyVisible ? 'Hide' : 'Show';
  });

  ui.saveSettings.addEventListener('click', onSave);
  ui.modelSelect.addEventListener('change', () => {
    ui.customModel.value = '';
    persist();
  });
  ui.customModel.addEventListener('change', () => persist());
  ui.refreshModels.addEventListener('click', onRefreshModels);
  ui.testConnection.addEventListener('click', onTest);
  ui.pingModel.addEventListener('click', onPing);

  // Quietly try to pull the live model list so the dropdown is accurate.
  listModels()
    .then((models) => {
      liveModels = models;
      renderModelSelect(currentModel());
      const deepseek = models.filter((m) => m.id.startsWith('deepseek/'));
      ui.modelState.textContent = `Live list loaded: ${models.length} models, ${deepseek.length} DeepSeek.${
        deepseek[0] ? ` Newest entry: ${deepseek[0].id}.` : ''
      }`;
    })
    .catch(() => {
      ui.modelState.textContent = 'Offline or blocked: showing the built-in model list. Press "Refresh models" once you are online.';
    });
}

init();
