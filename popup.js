'use strict';

const textarea = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const errorMsg = document.getElementById('errorMsg');
const historyToggle = document.getElementById('historyToggle');
const historyList = document.getElementById('historyList');
const MAX_LENGTH = 1000;
const HISTORY_KEY = 'alice_query_history';
const MAX_HISTORY = 20;

/* ── Helpers ──────────────────────────────────────────── */

function buildAliceUrl(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL('https://yandex.ru/alice');
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  return url.toString();
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 3000);
}

function updateSendButton() {
  sendBtn.disabled = textarea.value.trim().length === 0;
}

/* ── History ──────────────────────────────────────────── */

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
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">История пуста</div>';
    return;
  }
  history.forEach((h, i) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="icon">↳</span>
      <span class="text">${h.replace(/</g, '&lt;')}</span>
      <button class="del" data-index="${i}">×</button>
    `;
    item.querySelector('.text').addEventListener('click', () => {
      textarea.value = h;
      updateSendButton();
      textarea.focus();
    });
    item.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromHistory(i);
    });
    historyList.appendChild(item);
  });
}

let historyOpen = true;
historyToggle.addEventListener('click', () => {
  historyOpen = !historyOpen;
  historyList.classList.toggle('collapsed', !historyOpen);
  historyToggle.querySelector('.arrow').classList.toggle('open', historyOpen);
});

/* ── Core ─────────────────────────────────────────────── */

function sendQuery(text) {
  const trimmed = text.trim();
  if (!trimmed) { showError('Введите текст запроса'); return; }
  if (trimmed.length > MAX_LENGTH) {
    showError('Запрос слишком длинный (макс. 1000 символов)');
    return;
  }

  addToHistory(trimmed);

  const url = buildAliceUrl(trimmed);
  chrome.tabs.create({ url, active: true }, (tab) => {
    if (chrome.runtime.lastError) {
      showError('Ошибка: ' + chrome.runtime.lastError.message);
      return;
    }
    window.close();
  });
}

/* ── Events ───────────────────────────────────────────── */

sendBtn.addEventListener('click', () => {
  if (!sendBtn.disabled) sendQuery(textarea.value);
});

textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendQuery(textarea.value);
  }
  if (e.key === 'Escape') window.close();
});

textarea.addEventListener('input', () => {
  updateSendButton();
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
});

/* ── Init ─────────────────────────────────────────────── */

textarea.focus();
renderHistory();
