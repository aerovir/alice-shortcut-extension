'use strict';

/* ══════════════════════════════════════════════════════════════
   Popup Script — управление состояниями, порт, история
   ══════════════════════════════════════════════════════════════ */

// ── Elements ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const stateInput = $('state-input');
const stateLoading = $('state-loading');
const stateResult = $('state-result');
const stateError = $('state-error');
const queryInput = $('queryInput');
const sendBtn = $('sendBtn');
const loadingQuery = $('loadingQuery');
const cancelBtn = $('cancelBtn');
const resultContent = $('resultContent');
const copyBtn = $('copyBtn');
const newQueryBtn = $('newQueryBtn');
const openInTabBtn = $('openInTabBtn');
const historyToggle = $('historyToggle');
const historyList = $('historyList');
const errorText = $('errorText');
const errorSubtext = $('errorSubtext');
const retryBtn = $('retryBtn');
const footerHistoryCount = $('footerHistoryCount');

const MAX_LENGTH = 1000;
const HISTORY_KEY = 'alice_query_history';
const MAX_HISTORY = 20;

// ── State ───────────────────────────────────────────────────
let currentState = 'input';
let pendingQuery = '';
let pendingTabId = null;    // скрытая вкладка, которую нужно закрыть
let port = null;            // порт для связи с background

// ── Helpers ─────────────────────────────────────────────────

function showState(name) {
  [stateInput, stateLoading, stateResult, stateError].forEach(el =>
    el.classList.toggle('active', el.id === `state-${name}`)
  );
  currentState = name;
}

function showError(msg, sub = '') {
  errorText.textContent = msg;
  errorSubtext.textContent = sub;
  showState('error');
}

// ── Storage (crash recovery) ────────────────────────────────
function savePendingQuery(query) {
  chrome.storage.local.set({ _pendingQuery: query });
}
function clearPendingQuery() {
  chrome.storage.local.remove('_pendingQuery');
}
function getPendingQuery() {
  return new Promise(resolve => {
    chrome.storage.local.get('_pendingQuery', r => resolve(r._pendingQuery || ''));
  });
}

// ── History (#2) ────────────────────────────────────────────

async function getHistory() {
  return new Promise(resolve =>
    chrome.storage.local.get(HISTORY_KEY, r => resolve(r[HISTORY_KEY] || []))
  );
}

async function addToHistory(query) {
  const q = query.trim();
  if (!q) return;
  let history = await getHistory();
  // Remove duplicate
  history = history.filter(h => h !== q);
  // Prepend
  history.unshift(q);
  // Trim
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  await new Promise(resolve =>
    chrome.storage.local.set({ [HISTORY_KEY]: history }, resolve)
  );
  renderHistory();
}

async function removeFromHistory(index) {
  let history = await getHistory();
  history.splice(index, 1);
  await new Promise(resolve =>
    chrome.storage.local.set({ [HISTORY_KEY]: history }, resolve)
  );
  renderHistory();
}

async function clearHistory() {
  await new Promise(resolve =>
    chrome.storage.local.set({ [HISTORY_KEY]: [] }, resolve)
  );
  renderHistory();
}

async function renderHistory() {
  const history = await getHistory();
  historyList.innerHTML = '';

  footerHistoryCount.textContent = history.length ? `📜 ${history.length}` : '';

  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">История пуста</div>';
    return;
  }

  history.forEach((h, i) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="icon">↳</span>
      <span class="text">${escapeHtml(h)}</span>
      <button class="del" data-index="${i}" title="Удалить">×</button>
    `;
    // Click text → fill & send
    item.querySelector('.text').addEventListener('click', () => {
      queryInput.value = h;
      updateSendButton();
      queryInput.focus();
    });
    // Delete
    item.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromHistory(i);
    });
    historyList.appendChild(item);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// History toggle
let historyOpen = true;
historyToggle.addEventListener('click', () => {
  historyOpen = !historyOpen;
  historyList.classList.toggle('collapsed', !historyOpen);
  historyToggle.querySelector('.arrow').classList.toggle('open', historyOpen);
});

// ── Input helpers ───────────────────────────────────────────

function updateSendButton() {
  const trimmed = queryInput.value.trim();
  sendBtn.disabled = trimmed.length === 0;
  sendBtn.classList.toggle('active', trimmed.length > 0);
}

// ── Port & Communication (#6) ───────────────────────────────

function connectPort() {
  // Закрываем старый порт, если есть
  if (port) {
    try { port.disconnect(); } catch (_) {}
  }
  port = chrome.runtime.connect({ name: 'alice-query' });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'response':
        // Ответ получен
        showResponse(msg.text);
        break;
      case 'error':
        // Ошибка
        if (currentState === 'loading') {
          showError(msg.text || 'Не удалось получить ответ от Алисы', msg.sub || 'Попробуйте открыть Алису явно');
        }
        break;
      case 'done':
        // Вкладка закрыта, ответ уже показан
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    // Если мы в loading и popup не закрыт — ошибка
    if (currentState === 'loading') {
      showError('Соединение прервано', 'Попробуйте снова');
    }
    port = null;
  });
}

// ── Send Query (#6 core) ────────────────────────────────────

function sendQuery(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_LENGTH) {
    showError(`Запрос слишком длинный (макс. ${MAX_LENGTH} символов)`);
    return;
  }

  pendingQuery = trimmed;
  loadingQuery.textContent = `«${trimmed}»`;
  showState('loading');
  savePendingQuery(trimmed);

  // Сохраняем в историю
  addToHistory(trimmed);

  // Коннектим порт
  connectPort();

  // Отправляем запрос в background
  port.postMessage({
    action: 'askAlice',
    query: trimmed,
  });
}

// ── Show Response ───────────────────────────────────────────

function showResponse(text) {
  if (!text || !text.trim()) {
    showError('Алиса вернула пустой ответ', 'Попробуйте задать вопрос иначе');
    return;
  }

  resultContent.textContent = text;
  showState('result');

  // Сохраняем последний ответ
  chrome.storage.local.set({ lastResponse: text, lastQuery: pendingQuery });

  clearPendingQuery();
}

// ── Copy ────────────────────────────────────────────────────

copyBtn.addEventListener('click', async () => {
  const text = resultContent.textContent;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '✅ Скопировано';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '📋 Копировать';
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch {
    copyBtn.textContent = '❌ Ошибка';
  }
});

// ── Open in tab ─────────────────────────────────────────────

function openAliceTab(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL('https://yandex.ru/alice');
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  chrome.tabs.create({ url: url.toString(), active: true });
}

openInTabBtn.addEventListener('click', () => {
  openAliceTab(pendingQuery);
  window.close();
});

// ── Cancel ──────────────────────────────────────────────────

cancelBtn.addEventListener('click', () => {
  // Сообщаем background отменить
  if (port) {
    try {
      port.postMessage({ action: 'cancel' });
      port.disconnect();
    } catch (_) {}
    port = null;
  }
  showState('input');
  clearPendingQuery();
});

// ── Retry ───────────────────────────────────────────────────

retryBtn.addEventListener('click', () => {
  if (pendingQuery) {
    sendQuery(pendingQuery);
  } else {
    showState('input');
  }
});

// ── New query ───────────────────────────────────────────────

newQueryBtn.addEventListener('click', () => {
  pendingQuery = '';
  queryInput.value = '';
  queryInput.style.height = 'auto';
  updateSendButton();
  showState('input');
  queryInput.focus();
  // Очищаем сохранённый ответ
  chrome.storage.local.remove(['lastResponse', 'lastQuery']);
});

// ── Event Listeners ─────────────────────────────────────────

sendBtn.addEventListener('click', () => {
  if (!sendBtn.disabled) sendQuery(queryInput.value);
});

queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendQuery(queryInput.value);
  }
  if (e.key === 'Escape') window.close();
});

queryInput.addEventListener('input', () => {
  updateSendButton();
  // auto-resize
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 100) + 'px';
});

queryInput.addEventListener('focus', () => queryInput.select());

// ── Init ────────────────────────────────────────────────────

async function init() {
  // Render history
  await renderHistory();

  // Автофокус
  queryInput.focus();

  // Восстанавливаем незавершённый запрос (crash recovery)
  const pending = await getPendingQuery();
  if (pending) {
    queryInput.value = pending;
    queryInput.style.height = 'auto';
    updateSendButton();
  }

  // Если был предыдущий ответ — показываем его
  const { lastResponse, lastQuery } = await new Promise(resolve =>
    chrome.storage.local.get(['lastResponse', 'lastQuery'], resolve)
  );
  if (lastResponse && lastQuery) {
    pendingQuery = lastQuery;
    showResponse(lastResponse);
  }
}

init().catch(console.error);
