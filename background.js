'use strict';

const ALICE_URL = 'https://yandex.ru/alice';

function buildAliceUrl(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL(ALICE_URL);
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  return url.toString();
}

/* ── Reuse Tab: переиспользовать существующую вкладку ──── */

function openOrReuseTab(url) {
  chrome.tabs.query(
    { url: ['https://yandex.ru/alice*', 'https://alice.yandex.ru/*'] },
    (tabs) => {
      if (!tabs || tabs.length === 0) {
        chrome.tabs.create({ url, active: true });
        return;
      }
      const target = tabs.find(t => t.id) || tabs[0];
      chrome.tabs.update(target.id, { url, active: true });
    }
  );
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ask-alice-selection',
      title: 'Спросить у Алисы: "%s"',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'ask-alice-selection' && info.selectionText) {
    const url = buildAliceUrl(info.selectionText.trim());
    openOrReuseTab(url);
  }
});

/* ── Omnibox: alice <текст> ───────────────────────────── */

chrome.omnibox.onInputEntered.addListener((text) => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const url = buildAliceUrl(trimmed);
  openOrReuseTab(url);
});

chrome.omnibox.setDefaultSuggestion({
  description: `Спросить у Алисы: alice <match>текст запроса</match>`,
});
