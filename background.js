'use strict';

const ALICE_URL = 'https://yandex.ru/alice';

function buildAliceUrl(query) {
  const deeplink = JSON.stringify({ text: query });
  const url = new URL(ALICE_URL);
  url.searchParams.set('alice_deeplink', deeplink);
  url.searchParams.set('_src', 'alice-extension');
  return url.toString();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAlice') {
    const url = buildAliceUrl(request.query);
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, tabId: tab.id });
      }
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ask-alice-selection',
    title: 'Спросить у Алисы: "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'ask-alice-selection' && info.selectionText) {
    const url = buildAliceUrl(info.selectionText.trim());
    chrome.tabs.create({ url, active: true });
  }
});
