'use strict';

(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const isFromExtension = urlParams.get('_src') === 'alice-extension';
  const deeplinkRaw = urlParams.get('alice_deeplink');

  if (!isFromExtension || !deeplinkRaw) return;

  let deeplinkText = '';
  try {
    const parsed = JSON.parse(deeplinkRaw);
    deeplinkText = (parsed.text || '').trim();
  } catch (_) { return; }
  if (!deeplinkText) return;

  const TIMEOUT_MS = 15000;
  const POLL_INTERVAL = 200;

  let elapsed = 0;
  let sendAttempted = false;

  const pollTimer = setInterval(() => {
    elapsed += POLL_INTERVAL;

    if (elapsed >= TIMEOUT_MS) {
      clearInterval(pollTimer);
      return;
    }

    if (sendAttempted) {
      clearInterval(pollTimer);
      return;
    }

    const inputField = document.querySelector(
      'textarea, [contenteditable="true"], [data-testid*="input"]'
    );
    const sendButton = document.querySelector(
      'button[class*="send"], button[aria-label*="отправити"], button:has(svg)'
    );

    if (!inputField || !sendButton) return;

    const inputText = inputField.value || inputField.textContent || '';
    if (!inputText.trim()) return;

    sendAttempted = true;
    clearInterval(pollTimer);

    setTimeout(() => {
      try {
        sendButton.click();
      } catch (err) {
        console.log('[Ask Alice] ❌ Ошибка при отправке:', err);
      }
    }, 300);

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('_src');
      window.history.replaceState({}, '', newUrl.toString());
    } catch (_) {}
  }, POLL_INTERVAL);
})();
