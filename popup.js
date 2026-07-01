'use strict';

const textarea = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const errorMsg = document.getElementById('errorMsg');
const MAX_LENGTH = 1000;

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

  chrome.runtime.sendMessage(
    { action: 'openAlice', query: trimmed },
    (response) => {
      if (chrome.runtime.lastError) {
        showError('Ошибка: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        window.close();
      } else {
        showError('Не удалось открыть Алису');
      }
    }
  );
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
