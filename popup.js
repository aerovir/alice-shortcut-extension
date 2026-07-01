'use strict';

/* ══════════════════════════════════════════════════════════════
   Popup Script — отправка через фон.вкладку, ответ в popup
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
let port = null;

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

// ── Storage ─────────────────────────────────────────────────
function savePendingQuery(query) {
  chrome.storage.local.set({ _pendingQuery: query });
}
function clearPendingQuery() {
  chrome.storage.local.remove('_pendingQuery');
}

// ── History ─────────────────────────────────────────────────

async function getHistory() {
  return new Promise(resolve =>
    chrome.storage.local.get(HISTORY_KEY, r => resolve(r[HISTORY_KEY] || []))
  );
}

async function addToHistory(query) {
  const q = query.trim();
  if (!q) return;
  let history = await getHistory();
  history = history.filter(h => h !== q);
  history.unshift(q);
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
    item.querySelector('.text').addEventListener('click', () => {
      queryInput.value = h;
      updateSendButton();
      queryInput.focus();
    });
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

// ── Port & Communication ────────────────────────────────────

function connectPort() {
  if (port) {
    try { port.disconnect(); } catch (_) {}
  }
  port = chrome.runtime.connect({ name: 'alice-query' });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'response':
        showResponse(msg.text);
        break;
      case 'error':
        if (currentState === 'loading') {
          showError(msg.text || 'Не удалось получить ответ от Алисы',
                    msg.sub || 'Попробуйте открыть Алису явно');
        }
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    if (currentState === 'loading') {
      chrome.storage.local.get(['lastResponse', 'lastQuery', '_pendingResponse'], (result) => {
        if (result._pendingResponse) {
          showResponse(result._pendingResponse);
          chrome.storage.local.remove('_pendingResponse');
        } else if (result.lastResponse && pendingQuery && result.lastQuery === pendingQuery) {
          showResponse(result.lastResponse);
        } else {
          showError('Соединение прервано', 'Попробуйте снова');
        }
      });
    }
    port = null;
  });
}

// ── Send Query ──────────────────────────────────────────────

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
  addToHistory(trimmed);

  connectPort();
  port.postMessage({ action: 'askAlice', query: trimmed });
}

// ── Show Response ───────────────────────────────────────────

function showResponse(text) {
  if (!text || !text.trim()) {
    showError('Алиса вернула пустой ответ', 'Попробуйте задать вопрос иначе');
    return;
  }

  resultContent.textContent = text;
  showState('result');

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
  // Без _src=alice-extension — это ручная навигация пользователя,
  // контент-скрипт не должен активироваться и авто-отправлять запрос
  chrome.tabs.create({ url: url.toString(), active: true });
  window.close();
}

openInTabBtn.addEventListener('click', () => {
  if (pendingQuery) openAliceTab(pendingQuery);
});

// ── Cancel ──────────────────────────────────────────────────

cancelBtn.addEventListener('click', () => {
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
  if (pendingQuery) sendQuery(pendingQuery);
  else showState('input');
});

// ── New query ───────────────────────────────────────────────

newQueryBtn.addEventListener('click', () => {
  pendingQuery = '';
  queryInput.value = '';
  queryInput.style.height = 'auto';
  updateSendButton();
  showState('input');
  queryInput.focus();
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
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 100) + 'px';
});

queryInput.addEventListener('focus', () => queryInput.select());

// ── Init ────────────────────────────────────────────────────

async function init() {
  await renderHistory();
  queryInput.focus();

  const { _pendingQuery } = await new Promise(resolve =>
    chrome.storage.local.get('_pendingQuery', resolve)
  );
  if (_pendingQuery) {
    queryInput.value = _pendingQuery;
    updateSendButton();
  }

  const { lastResponse, lastQuery, _pendingResponse } = await new Promise(resolve =>
    chrome.storage.local.get(['lastResponse', 'lastQuery', '_pendingResponse'], resolve)
  );
  if (_pendingResponse) {
    showResponse(_pendingResponse);
    chrome.storage.local.remove('_pendingResponse');
  } else if (lastResponse && lastQuery) {
    pendingQuery = lastQuery;
    showResponse(lastResponse);
  }
}

init().catch(console.error);
