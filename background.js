'use strict';

/* ══════════════════════════════════════════════════════════════
   Background Service Worker / Event Page (Firefox)
   ══════════════════════════════════════════════════════════════
   - Popup port: получает запрос, открывает скрытую вкладку
   - Content script router: пересылает ответ из content → popup
   - Omnibox: alice <текст>
   - Контекстное меню
   - Reuse tab: не дублировать вкладки при явном открытии
   ══════════════════════════════════════════════════════════════ */

const ALICE_BASE = 'https://yandex.ru/alice';
const REQUEST_TIMEOUT_MS = 25_000;

// При старте: очищаем pending-данные (для Firefox Event Page)
chrome.storage.local.remove(['_pendingQuery', '_pendingResponse']).catch(() => {});

/* ── Request tracking ──────────────────────────────────────── */
const activeRequests = new Map();
let requestCounter = 0;

/* ══════════════════════════════════════════════════════════════
   Popup Port
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
    handleCancel(requestId);
  });
});

/* ══════════════════════════════════════════════════════════════
   Обработка запроса
   ══════════════════════════════════════════════════════════════ */

function handleAskAlice(requestId, port, query) {
  const trimmed = query.trim().slice(0, 1000);
  if (!trimmed) {
    port.postMessage({ type: 'error', text: 'Пустой запрос' });
    return;
  }

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

  // Открываем скрытую вкладку (невидимую для пользователя)
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
   Отмена запроса
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
   ══════════════════════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'aliceResponse') {
    handleAliceResponse(msg.requestId, msg.text, sender.tab?.id);
    return false;
  }

  if (msg.type === 'aliceError') {
    handleAliceError(msg.requestId, msg.text, msg.sub, sender.tab?.id);
    return false;
  }

  return false;
});

function handleAliceResponse(requestId, text, senderTabId) {
  const req = activeRequests.get(requestId);
  if (!req || req.cancelled) {
    // Event Page мог перезапуститься — сохраняем в storage
    if (text) {
      chrome.storage.local.set({ lastResponse: text, _pendingResponse: text });
    }
    if (senderTabId) {
      chrome.tabs.remove(senderTabId).catch(() => {});
    }
    return;
  }

  clearTimeout(req.timer);

  try {
    req.port.postMessage({ type: 'response', text });
  } catch (_) {
    chrome.storage.local.set({ lastResponse: text, _pendingResponse: text });
  }

  setTimeout(() => {
    if (req.tabId) {
      chrome.tabs.remove(req.tabId).catch(() => {});
    }
    activeRequests.delete(requestId);
  }, 500);
}

function handleAliceError(requestId, text, sub, senderTabId) {
  const req = activeRequests.get(requestId);
  if (!req || req.cancelled) {
    if (senderTabId) {
      chrome.tabs.remove(senderTabId).catch(() => {});
    }
    return;
  }

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
   Omnibox
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
  const suggestions = [
    { content: text, description: `↗ Спросить у Алисы: <match>${text}</match>` },
  ];
  suggest(suggestions);
});

chrome.omnibox.setDefaultSuggestion({
  description: `🔍 Спросить у Алисы: <url>alice</url> <match>текст запроса</match>`,
});

/* ══════════════════════════════════════════════════════════════
   Reuse Tab
   ══════════════════════════════════════════════════════════════ */

function openOrReuseTab(url) {
  chrome.tabs.query(
    { url: ['https://yandex.ru/alice*', 'https://alice.yandex.ru/*'] },
    (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        chrome.tabs.create({ url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('[Ask Alice] Не удалось создать вкладку:', chrome.runtime.lastError);
          }
        });
        return;
      }

      const visibleTab = tabs.find(t => !t.active && t.id);
      const targetTab = visibleTab || tabs[0];

      if (targetTab) {
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

function createContextMenu() {
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
}

createContextMenu();
chrome.runtime.onInstalled.addListener(createContextMenu);

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

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(['_pendingQuery', '_pendingResponse']);
});

console.log('[Ask Alice] Background service worker started v3.0');
