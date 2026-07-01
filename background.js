'use strict';

/* ══════════════════════════════════════════════════════════════
   Background Service Worker
   ══════════════════════════════════════════════════════════════
   - Popup port: получает запрос, открывает скрытую вкладку (#6)
   - Content script router: пересылает ответ из content → popup
   - Omnibox: alice <текст> (#7)
   - Reuse tab: не дублировать вкладки при явном открытии (#1)
   - Контекстное меню
   ══════════════════════════════════════════════════════════════ */

const ALICE_BASE = 'https://yandex.ru/alice';
const REQUEST_TIMEOUT_MS = 25_000; // 25 секунд
const RESPONSE_POLL_INTERVAL = 300;

/* ── Request tracking ────────────────────────────────────────
   Каждому запросу от popup присваивается уникальный ID.
   Мы отслеживаем: port (кому вернуть ответ), tabId (скрытая вкладка),
   таймеры, состояние отмены.
   При ответе от content.js сопоставляем по requestId.           */
const activeRequests = new Map();  // requestId → { port, tabId, timer, cancelled }

let requestCounter = 0;

/* ══════════════════════════════════════════════════════════════
   Popup Port (#6)
   ══════════════════════════════════════════════════════════════ */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'alice-query') return;

  const requestId = `req_${++requestCounter}`;

  port.onMessage.addListener((msg) => {
    if (msg.action === 'askAlice') {
      handleAskAlice(requestId, port, msg.query);
    }
    if (msg.action === 'cancel') {
      handleCancel(requestId);
    }
  });

  port.onDisconnect.addListener(() => {
    // Popup закрылся — отменяем запрос
    handleCancel(requestId);
  });
});

/* ══════════════════════════════════════════════════════════════
   Обработка запроса (#6 core)
   ══════════════════════════════════════════════════════════════ */

function handleAskAlice(requestId, port, query) {
  const trimmed = query.trim().slice(0, 1000);
  if (!trimmed) {
    port.postMessage({ type: 'error', text: 'Пустой запрос' });
    return;
  }

  // Формируем уникальный URL с requestId
  const deeplink = JSON.stringify({ text: trimmed });
  const url = new URL(ALICE_BASE);
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  url.searchParams.set('_rid', requestId);

  // Таймаут
  const timer = setTimeout(() => {
    const req = activeRequests.get(requestId);
    if (!req || req.cancelled) return;

    req.cancelled = true;
    try {
      req.port.postMessage({
        type: 'error',
        text: 'Алиса не ответила за 25 секунд',
        sub: 'Возможно, страница загружается долго или вы не авторизованы',
      });
    } catch (_) {}

    // Закрыть скрытую вкладку
    if (req.tabId) {
      chrome.tabs.remove(req.tabId).catch(() => {});
    }
    activeRequests.delete(requestId);
  }, REQUEST_TIMEOUT_MS);

  // Регистрируем запрос
  activeRequests.set(requestId, {
    port,
    tabId: null,
    timer,
    cancelled: false,
  });

  // Открываем НОВУЮ скрытую вкладку (невидимую для пользователя)
  chrome.tabs.create({ url: url.toString(), active: false }, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      clearTimeout(timer);
      activeRequests.delete(requestId);
      try {
        port.postMessage({
          type: 'error',
          text: 'Не удалось открыть Алису',
          sub: chrome.runtime.lastError?.message || '',
        });
      } catch (_) {}
      return;
    }

    const req = activeRequests.get(requestId);
    if (req) {
      req.tabId = tab.id;
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   Отмена запроса (пользователь нажал «Отменить» или закрыл popup)
   ══════════════════════════════════════════════════════════════ */

function handleCancel(requestId) {
  const req = activeRequests.get(requestId);
  if (!req) return;

  req.cancelled = true;
  clearTimeout(req.timer);

  if (req.tabId) {
    chrome.tabs.remove(req.tabId).catch(() => {});
  }

  activeRequests.delete(requestId);
}

/* ══════════════════════════════════════════════════════════════
   Content Script → Background Router
   ══════════════════════════════════════════════════════════════
   Content.js отправляет сообщение, когда ответ Алисы готов.
   ══════════════════════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((msg, sender) => {
  // ── Ответ от Алисы готов ──
  if (msg.type === 'aliceResponse') {
    handleAliceResponse(msg.requestId, msg.text);
    return false;
  }

  // ── Ошибка на странице Алисы ──
  if (msg.type === 'aliceError') {
    handleAliceError(msg.requestId, msg.text, msg.sub);
    return false;
  }

  // ── Авто-отправка выполнена (лог) ──
  if (msg.type === 'aliceSent') {
    // Просто лог, ничего не делаем
    return false;
  }
});

function handleAliceResponse(requestId, text) {
  const req = activeRequests.get(requestId);
  if (!req || req.cancelled) {
    // Popup уже закрыт — сохраняем в storage для следующего открытия
    if (text) {
      chrome.storage.local.set({
        lastResponse: text,
        _pendingResponse: text,
        _pendingResponseFor: requestId,
      });
    }
    return;
  }

  clearTimeout(req.timer);

  try {
    req.port.postMessage({ type: 'response', text });
  } catch (_) {
    // Popup закрыт — сохраняем
    chrome.storage.local.set({
      lastResponse: text,
      _pendingResponse: text,
    });
  }

  // Закрываем скрытую вкладку через 500ms (чтобы страница успела обработать)
  setTimeout(() => {
    if (req.tabId) {
      chrome.tabs.remove(req.tabId).catch(() => {});
    }
    activeRequests.delete(requestId);
  }, 500);
}

function handleAliceError(requestId, text, sub) {
  const req = activeRequests.get(requestId);
  if (!req || req.cancelled) return;

  clearTimeout(req.timer);

  try {
    req.port.postMessage({ type: 'error', text, sub: sub || '' });
  } catch (_) {}

  if (req.tabId) {
    chrome.tabs.remove(req.tabId).catch(() => {});
  }
  activeRequests.delete(requestId);
}

/* ══════════════════════════════════════════════════════════════
   Omnibox (#7)
   ══════════════════════════════════════════════════════════════
   Ввод в адресной строке: alice погода москва
   ══════════════════════════════════════════════════════════════ */

chrome.omnibox.onInputEntered.addListener((text) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  const deeplink = JSON.stringify({ text: trimmed });
  const url = new URL(ALICE_BASE);
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');

  openOrReuseTab(url.toString());
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (!text.trim()) {
    suggest([]);
    return;
  }

  // Подсказки в omnibox
  const suggestions = [
    { content: text, description: `↗ Спросить у Алисы: <match>${text}</match>` },
  ];
  suggest(suggestions);
});

chrome.omnibox.setDefaultSuggestion({
  description: `🔍 Спросить у Алисы: <url>alice</url> <match>текст запроса</match>`,
});

/* ══════════════════════════════════════════════════════════════
   Reuse Tab (#1)
   ══════════════════════════════════════════════════════════════
   Для omnibox и контекстного меню: переиспользуем существующую
   вкладку с Алисой вместо создания новой.
   ══════════════════════════════════════════════════════════════ */

function openOrReuseTab(url) {
  // Ищем существующую вкладку с Алисой (не скрытую, видимую пользователю)
  chrome.tabs.query(
    { url: ['https://yandex.ru/alice*', 'https://alice.yandex.ru/*'] },
    (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        // Нет открытых вкладок — создаём новую
        chrome.tabs.create({ url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('[Ask Alice] Не удалось создать вкладку:', chrome.runtime.lastError);
          }
        });
        return;
      }

      // Берём первую вкладку (не hidden)
      const visibleTab = tabs.find(t => !t.active && t.id);
      const targetTab = visibleTab || tabs[0];

      if (targetTab) {
        // Обновляем существующую вкладку
        chrome.tabs.update(targetTab.id, { url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('[Ask Alice] Не удалось обновить вкладку:', chrome.runtime.lastError);
          }
        });
      } else {
        chrome.tabs.create({ url, active: true });
      }
    }
  );
}

/* ══════════════════════════════════════════════════════════════
   Контекстное меню
   ══════════════════════════════════════════════════════════════ */

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'ask-alice-selection',
        title: 'Спросить у Алисы: "%s"',
        contexts: ['selection'],
      });
    });
  } catch (e) {
    console.debug('[Ask Alice] Context menus not available:', e.message);
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'ask-alice-selection' && info.selectionText) {
    const trimmed = info.selectionText.trim();
    if (!trimmed) return;

    const deeplink = JSON.stringify({ text: trimmed });
    const url = new URL(ALICE_BASE);
    url.searchParams.set('alice_deeplink', deeplink);
    url.searchParams.set('_src', 'alice-extension');

    openOrReuseTab(url.toString());
  }
});

/* ══════════════════════════════════════════════════════════════
   Cleanup: при старте проверяем, нет ли "зависших" скрытых вкладок
   ══════════════════════════════════════════════════════════════ */

chrome.runtime.onStartup.addListener(() => {
  // Очищаем pending-данные при старте браузера
  chrome.storage.local.remove(['_pendingQuery', '_pendingResponse']);
});

console.log('[Ask Alice] Background service worker started v2.0');
