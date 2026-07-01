'use strict';

/* ══════════════════════════════════════════════════════════════
   Popup Script — отправка запроса, переход к Алисе, история
   ══════════════════════════════════════════════════════════════ */

// ── Elements ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const stateInput = $('state-input');
const stateResult = $('state-result');
const stateError = $('state-error');
const queryInput = $('queryInput');
const sendBtn = $('sendBtn');
const resultContent = $('resultContent');
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

// ── Helpers ─────────────────────────────────────────────────

function showState(name) {
  [stateInput, stateResult, stateError].forEach(el =>
    el.classList.toggle('active', el.id === `state-${name}`)
  );
  currentState = name;
}

function showError(msg, sub = '') {
  errorText.textContent = msg;
  errorSubtext.textContent = sub;
  showState('error');
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

// ── Send Query ──────────────────────────────────────────────
function sendQuery(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_LENGTH) {
    showError(`Запрос слишком длинный (макс. ${MAX_LENGTH} символов)`);
    return;
  }

  pendingQuery = trimmed;
  addToHistory(trimmed);

  // Показываем запрос и кнопку перехода
  resultContent.textContent = `Запрос: «${trimmed}»`;
  showState('result');
}

// ── Open in tab ─────────────────────────────────────────────

function openAliceTab(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL('https://yandex.ru/alice');
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  chrome.tabs.create({ url: url.toString(), active: true });
  window.close();
}

openInTabBtn.addEventListener('click', () => {
  if (pendingQuery) {
    openAliceTab(pendingQuery);
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
});

// ── Retry ───────────────────────────────────────────────────

retryBtn.addEventListener('click', () => {
  if (pendingQuery) {
    sendQuery(pendingQuery);
  } else {
    showState('input');
  }
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
}

init().catch(console.error);
