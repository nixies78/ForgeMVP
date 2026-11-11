/**
 * Chat test page: proves the configured model answers, with streaming.
 */

import { chat, chatStream } from './openrouter.js';
import { getSettings, saveSettings } from './settings.js';

const el = (id) => document.getElementById(id);

const ui = {
  log: el('chatLog'),
  form: el('chatForm'),
  input: el('chatInput'),
  send: el('sendButton'),
  stop: el('stopButton'),
  clear: el('clearButton'),
  streamToggle: el('streamToggle'),
  modelBadge: el('modelBadge'),
  keyWarning: el('keyWarning'),
  meta: el('chatMeta'),
};

/** Conversation history sent to the API. */
const history = [];
let controller = null;
let busy = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function refreshHeader() {
  const { apiKey, model, stream } = getSettings();
  ui.modelBadge.textContent = model;
  ui.streamToggle.checked = stream;
  ui.keyWarning.classList.toggle('hidden', Boolean(apiKey));
}

function addMessage(role, text, { model = null, meta = null, error = false, reasoning = '' } = {}) {
  // Drop the "no messages yet" placeholder if it is still on screen.
  ui.log.querySelector('.empty-state')?.remove();

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${error ? ' error' : ''}`;

  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = role === 'user' ? 'You' : model || 'Assistant';

  wrap.appendChild(who);

  if (reasoning) {
    const think = document.createElement('div');
    think.className = 'thinking';
    think.textContent = reasoning;
    wrap.appendChild(think);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);

  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'meta';
    metaEl.textContent = meta;
    wrap.appendChild(metaEl);
  }

  ui.log.appendChild(wrap);
  ui.log.scrollTop = ui.log.scrollHeight;
  return { wrap, bubble, metaEl: wrap.querySelector('.meta') };
}

function addMeta(wrap, text) {
  let metaEl = wrap.querySelector('.meta');
  if (!metaEl) {
    metaEl = document.createElement('div');
    metaEl.className = 'meta';
    wrap.appendChild(metaEl);
  }
  metaEl.textContent = text;
}

function setBusy(next) {
  busy = next;
  ui.send.disabled = next;
  ui.stop.disabled = !next;
  ui.input.disabled = false;
}

function usageLine(usage, ms) {
  if (!usage) return `${ms} ms`;
  const parts = [`${ms} ms`, `${usage.total_tokens ?? '?'} tokens`];
  if (usage.prompt_tokens != null) parts.push(`${usage.prompt_tokens} in / ${usage.completion_tokens ?? '?'} out`);
  return parts.join(' · ');
}

function friendlyError(err) {
  if (err?.name === 'AbortError') return 'Stopped by you.';
  return err?.message || String(err);
}

async function send() {
  if (busy) return;

  const { apiKey } = getSettings();
  if (!apiKey) {
    ui.keyWarning.classList.remove('hidden');
    return;
  }

  const text = ui.input.value.trim();
  if (!text) return;

  const { model, stream } = getSettings();
  history.push({ role: 'user', content: text });
  addMessage('user', text);
  ui.input.value = '';
  ui.input.focus();
  setBusy(true);

  const started = Date.now();
  const placeholder = addMessage('assistant', stream ? '' : 'Waiting for a reply...', { model });
  controller = new AbortController();

  try {
    if (stream) {
      let answer = '';
      let reasoning = '';
      let usedModel = model;
      let usage = null;

      for await (const event of chatStream({
        apiKey,
        model,
        messages: history,
        signal: controller.signal,
      })) {
        if (event.type === 'content') {
          answer += event.text;
          placeholder.bubble.textContent = answer;
          ui.log.scrollTop = ui.log.scrollHeight;
        } else if (event.type === 'reasoning') {
          reasoning += event.text;
          let think = placeholder.wrap.querySelector('.thinking');
          if (!think) {
            think = document.createElement('div');
            think.className = 'thinking';
            placeholder.wrap.insertBefore(think, placeholder.bubble);
          }
          think.textContent = reasoning;
        } else if (event.type === 'done') {
          usage = event.usage;
          usedModel = event.model || usedModel;
          addMeta(placeholder.wrap, usageLine(usage, Date.now() - started));
        }
      }

      if (!answer && !reasoning) {
        placeholder.bubble.textContent = '(the model returned an empty reply - try a different model or a longer prompt)';
      }
      history.push({ role: 'assistant', content: answer });
      ui.meta.textContent = `Replied by ${usedModel} in ${Date.now() - started} ms${usage ? ` · ${usage.total_tokens ?? '?'} tokens` : ''}.`;
    } else {
      const result = await chat({ apiKey, model, messages: history, signal: controller.signal });
      placeholder.bubble.textContent = result.text || '(empty reply)';
      if (result.reasoning) {
        const think = document.createElement('div');
        think.className = 'thinking';
        think.textContent = result.reasoning;
        placeholder.wrap.insertBefore(think, placeholder.bubble);
      }
      addMeta(placeholder.wrap, usageLine(result.usage, Date.now() - started));
      history.push({ role: 'assistant', content: result.text });
      ui.meta.textContent = `Replied by ${result.model} · finish reason: ${result.finishReason ?? 'n/a'}.`;
    }
  } catch (err) {
    const message = friendlyError(err);
    placeholder.wrap.classList.add('error');
    placeholder.bubble.textContent = message;
    addMeta(placeholder.wrap, err?.status ? `HTTP ${err.status}` : 'request failed');
    ui.meta.textContent = message;
    history.pop(); // drop the user turn we could not get an answer for
  } finally {
    controller = null;
    setBusy(false);
  }
}

function init() {
  refreshHeader();

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    send();
  });

  ui.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  });

  ui.stop.addEventListener('click', () => {
    controller?.abort(new DOMException('Stopped by user', 'AbortError'));
    ui.meta.textContent = 'Cancelled.';
  });

  ui.clear.addEventListener('click', () => {
    history.length = 0;
    ui.log.innerHTML = '<div class="empty-state" id="emptyState">No messages yet.</div>';
    ui.meta.textContent = 'Cleared.';
  });

  ui.streamToggle.addEventListener('change', () => {
    saveSettings({ stream: ui.streamToggle.checked });
  });

  // Pick up key/model changes made on the admin page in another tab.
  window.addEventListener('focus', refreshHeader);

  ui.input.focus();
}

init();
