'use strict';

/* ══════════════════════════════════════════════════════════════
   Content Script — авто-отправка и извлечение ответа (#6)
   ══════════════════════════════════════════════════════════════
   Запускается на страницах yandex.ru/alice* и alice.yandex.ru/*

   1. Если есть _src=alice-extension → авто-отправка запроса
   2. Если есть _rid → после ответа отправляет текст в background
   3. Иначе → обычная страница, ничего не делаем
   ══════════════════════════════════════════════════════════════ */

(function () {
  /* ───────────────────────────────────────────────────────────
     1. Парсим URL-параметры
     ─────────────────────────────────────────────────────────── */
  const urlParams = new URLSearchParams(window.location.search);
  const isFromExtension = urlParams.get('_src') === 'alice-extension';
  const requestId = urlParams.get('_rid') || '';
  const deeplinkRaw = urlParams.get('alice_deeplink');

  if (!isFromExtension || !deeplinkRaw) {
    return; // Обычная загрузка страницы
  }

  // Парсим текст запроса из deeplink
  let deeplinkText = '';
  try {
    const parsed = JSON.parse(deeplinkRaw);
    deeplinkText = (parsed.text || '').trim();
  } catch (_) {
    return;
  }
  if (!deeplinkText) return;

  console.log('[Ask Alice] Content script active, query:', deeplinkText.slice(0, 60));

  /* ── Проверка авторизации ──────────────────────────────────── */
  function detectAuthPage() {
    return document.querySelectorAll(
      '#passp-field-login, input[name="login"], ' +
      'form[action*="passport" i], .passp-auth-content, ' +
      '[class*="login-form"], [data-t*="passp:auth"]'
    ).length > 0;
  }

  /* ───────────────────────────────────────────────────────────
     2. Утилиты
     ─────────────────────────────────────────────────────────── */

  /** Отправить сообщение background-скрипту */
  function bgSend(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (e) {
      // Background может быть недоступен
    }
  }

  /** Найти элемент по одному из селекторов */
  function findOne(selectors, parent = document) {
    for (const sel of selectors) {
      const el = parent.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /** Получить текст из элемента */
  function getElementText(el) {
    if (!el) return '';
    // Пытаемся взять textContent
    const text = el.textContent || el.innerText || '';
    return text.trim();
  }

  /** Получить все текстовые блоки из области чата */
  function extractAllChatText() {
    const chatArea = findOne([
      '[class*="chat"]',
      '[class*="dialog"]',
      '[class*="messages"]',
      '[class*="conversation"]',
      'main',
      'article',
      '[role="main"]',
      '#app',
    ]);
    if (!chatArea) return [];

    // Все элементы, похожие на сообщения
    const messageEls = chatArea.querySelectorAll(
      '[class*="message"], [class*="msg"], [class*="bubble"], ' +
      '[class*="response"], [class*="answer"], [class*="reply"], ' +
      'p, li, [class*="text"], [class*="content"]'
    );

    return Array.from(messageEls)
      .map(el => getElementText(el))
      .filter(t => t.length > 5); // отфильтровываем короткие UI-тексты
  }

  /** Получить последнюю реплику Алисы (ассистента) */
  function extractAssistantResponse() {
    // 1. Пытаемся найти явные элементы ответа Алисы
    const responseEl = findOne([
      '[class*="alice-response"]',
      '[class*="assistant-message"]',
      '[class*="ai-message"]',
      '[class*="bot-message"]',
      '[class*="answer"]',
      '[class*="reply"]',
      '[data-role="assistant"]',
      '[data-role="bot"]',
      'div[class*="response"]',
    ]);
    if (responseEl) {
      const text = getElementText(responseEl);
      if (text.length > 10) return text;
    }

    // 2. Ищем последнее сообщение в чате (не от пользователя)
    const messages = document.querySelectorAll(
      '[class*="message"], [class*="msg-item"], [class*="chat-item"], ' +
      '[class*="conversation-item"], [class*="bubble"]'
    );

    if (messages.length > 0) {
      // Берём последнее
      const last = messages[messages.length - 1];
      const text = getElementText(last);
      if (text.length > 10 && text !== deeplinkText) {
        return text;
      }
      // Если последнее совпадает с запросом — берём предпоследнее
      if (messages.length > 1) {
        const prev = messages[messages.length - 2];
        const text2 = getElementText(prev);
        if (text2.length > 10) return text2;
      }
    }

    // 3. Широкий захват — все текстовые узлы основного контента
    const allTexts = extractAllChatText();
    // Ищем текст, который не похож на наш запрос
    const responseTexts = allTexts.filter(t => !t.includes(deeplinkText) && t.length > 20);
    if (responseTexts.length > 0) {
      return responseTexts[responseTexts.length - 1];
    }

    return '';
  }

  /** Извлечь ответ, удалив лишние UI-элементы */
  function cleanResponse(raw) {
    if (!raw) return '';

    // Удаляем многочисленные пробелы
    let cleaned = raw.replace(/\s+/g, ' ').trim();

    // Удаляем текст кнопок и UI-элементов, если они попали
    const uiPhrases = [
      'Отправить', 'Send', 'Ввести запрос', 'Показать ещё',
      'Нравится', 'Не нравится', 'Скопировать', 'Поделиться',
      'Ответить', 'Написать', 'Продолжить',
    ];
    for (const phrase of uiPhrases) {
      // Удаляем только если фраза стоит в конце и короткая
      const idx = cleaned.lastIndexOf(phrase);
      if (idx > cleaned.length - 30) {
        cleaned = cleaned.substring(0, idx).trim();
      }
    }

    return cleaned;
  }

  /* ───────────────────────────────────────────────────────────
     3. Авто-отправка запроса
     ─────────────────────────────────────────────────────────── */

  const TIMEOUT_SEND = 12_000;   // макс. ждём появления поля ввода
  const TIMEOUT_RESPONSE = 20_000; // макс. ждём ответа
  const POLL_INTERVAL = 250;
  const STABILIZE_MS = 1_500;    // сколько текст не должен меняться

  // Селекторы поля ввода и кнопки отправки
  const INPUT_SELECTORS = [
    'textarea[class*="input"]',
    'textarea[class*="chat"]',
    'textarea[class*="message"]',
    '[contenteditable="true"]',
    '[data-testid*="input"]',
    '[data-testid*="chat-input"]',
    '[class*="chat-input"] textarea',
    'textarea',
  ];
  const BUTTON_SELECTORS = [
    'button[class*="send"]',
    'button[class*="submit"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="отправить" i]',
    '[data-testid*="send"]',
    '[data-testid*="submit"]',
    'button:has(svg)',
  ];

  let elapsed = 0;
  let sendAttempted = false;
  let responseTracked = false;

  let authChecked = false;

  const pollTimer = setInterval(() => {
    elapsed += POLL_INTERVAL;

    // Проверка авторизации (однократно)
    if (!authChecked && elapsed >= 1500) {
      authChecked = true;
      if (detectAuthPage()) {
        clearInterval(pollTimer);
        console.log('[Ask Alice] ❌ Страница авторизации');
        bgSend({ type: 'aliceError', requestId, text: 'Требуется авторизация в Яндексе', sub: 'Откройте yandex.ru/alice вручную и войдите в аккаунт' });
        return;
      }
    }

    // Таймаут
    if (elapsed >= TIMEOUT_SEND && !sendAttempted) {
      clearInterval(pollTimer);
      console.log('[Ask Alice] Таймаут ожидания поля ввода');
      bgSend({ type: 'aliceError', requestId, text: 'Алиса не загрузилась', sub: 'Не найдено поле ввода' });
      return;
    }

    if (elapsed >= TIMEOUT_RESPONSE && sendAttempted && !responseTracked) {
      clearInterval(pollTimer);
      console.log('[Ask Alice] Таймаут ожидания ответа');
      bgSend({ type: 'aliceError', requestId, text: 'Алиса не ответила', sub: 'Превышено время ожидания' });
      return;
    }

    // ── Шаг 1: Отправить запрос ──
    if (!sendAttempted) {
      const inputField = findOne(INPUT_SELECTORS);
      const sendButton = findOne(BUTTON_SELECTORS);

      if (inputField && sendButton) {
        const inputText = inputField.value || inputField.textContent || '';
        if (inputText.trim()) {
          sendAttempted = true;
          bgSend({ type: 'aliceSent', requestId });

          setTimeout(() => {
            try {
              sendButton.click();
              console.log('[Ask Alice] ✅ Запрос отправлен');

              // Очищаем URL от служебных параметров (чтобы при перезагрузке не отправилось снова)
              try {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('_src');
                window.history.replaceState({}, '', newUrl.toString());
              } catch (_) {}

              // ── Шаг 2: Начинаем отслеживать ответ ──
              trackResponse();
            } catch (err) {
              console.log('[Ask Alice] ❌ Ошибка при отправке:', err);
              bgSend({ type: 'aliceError', requestId, text: 'Не удалось отправить запрос' });
            }
          }, 400);
        }
      }
      return;
    }

    // После отправки — таймаут отслеживается выше
  }, POLL_INTERVAL);

  /* ───────────────────────────────────────────────────────────
     4. Отслеживание ответа Алисы (после отправки)
     ─────────────────────────────────────────────────────────── */

  function trackResponse() {
    if (responseTracked) return;
    responseTracked = true;

    let lastText = '';
    let stableSince = 0;
    let responseElapsed = 0;

    const responseTimer = setInterval(() => {
      responseElapsed += POLL_INTERVAL;

      if (responseElapsed >= TIMEOUT_RESPONSE) {
        clearInterval(responseTimer);
        // Последняя попытка — что есть
        const finalText = cleanResponse(extractAssistantResponse());
        if (finalText && finalText.length > 10) {
          console.log('[Ask Alice] ✅ Ответ получен (timeout fallback)');
          bgSend({ type: 'aliceResponse', requestId, text: finalText });
        } else {
          bgSend({ type: 'aliceError', requestId, text: 'Алиса не ответила вовремя' });
        }
        clearInterval(pollTimer);
        return;
      }

      const currentText = cleanResponse(extractAssistantResponse());
      if (!currentText || currentText.length < 10) {
        stableSince = 0;
        return; // ответ ещё не появился
      }

      if (currentText === lastText) {
        // Текст не меняется — считаем стабильность
        if (stableSince === 0) {
          stableSince = responseElapsed;
        } else if (responseElapsed - stableSince >= STABILIZE_MS) {
          // Стабилен более STABILIZE_MS — ответ готов!
          clearInterval(responseTimer);
          clearInterval(pollTimer);
          console.log('[Ask Alice] ✅ Ответ стабилен, отправляем в background');
          bgSend({ type: 'aliceResponse', requestId, text: currentText });
        }
      } else {
        // Текст изменился (стриминг)
        lastText = currentText;
        stableSince = 0;
      }
    }, POLL_INTERVAL);
  }
})();
