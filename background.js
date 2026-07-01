'use strict';

/* ══════════════════════════════════════════════════════════════
   Background Service Worker / Event Page (Firefox)
   ══════════════════════════════════════════════════════════════
   - Omnibox: alice <текст> (#7)
   - Контекстное меню
   - Reuse tab: не дублировать вкладки при явном открытии (#1)
   ══════════════════════════════════════════════════════════════ */

const ALICE_BASE = 'https://yandex.ru/alice';

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

// Firefox: Event Page перезапускается — меню нужно создавать при каждом старте
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

console.log('[Ask Alice] Background service worker started v2.0');
