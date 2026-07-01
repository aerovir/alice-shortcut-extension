'use strict';

const ALICE_URL = 'https://yandex.ru/alice';

function buildAliceUrl(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL(ALICE_URL);
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  return url.toString();
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
    chrome.tabs.create({ url, active: true });
  }
});

/* ── Omnibox: alice <текст> ───────────────────────────── */

chrome.omnibox.onInputEntered.addListener((text) => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const url = buildAliceUrl(trimmed);
  chrome.tabs.create({ url, active: true });
});

chrome.omnibox.setDefaultSuggestion({
  description: `Спросить у Алисы: alice <match>текст запроса</match>`,
});
