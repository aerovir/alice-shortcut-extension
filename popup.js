'use strict';

const textarea = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const errorMsg = document.getElementById('errorMsg');
const MAX_LENGTH = 1000;

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

function sendQuery(text) {
  const trimmed = text.trim();
  if (!trimmed) { showError('Введите текст запроса'); return; }
  if (trimmed.length > MAX_LENGTH) {
    showError('Запрос слишком длинный (макс. 1000 символов)');
    return;
  }

  const url = buildAliceUrl(trimmed);
  chrome.tabs.create({ url, active: true }, (tab) => {
    if (chrome.runtime.lastError) {
      showError('Ошибка: ' + chrome.runtime.lastError.message);
      return;
    }
    window.close();
  });
}

sendBtn.addEventListener('click', () => sendQuery(textarea.value));

textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendQuery(textarea.value);
  }
  if (e.key === 'Escape') window.close();
});

textarea.addEventListener('input', () => {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
});

textarea.focus();
