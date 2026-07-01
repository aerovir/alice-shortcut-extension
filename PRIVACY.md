# Privacy Policy — Ask Alice (Спросить у Алисы)

**Last updated:** July 2026

### What data is transmitted

The extension sends your **text query** to `yandex.ru/alice` (or `alice.yandex.ru`) to obtain a response from Yandex Alice. This is the core function of the extension — without sending the query, Alice cannot answer.

No other data is transmitted to any server.

### What data is stored locally (and only on your device)

- **Query history** — the last 20 queries you send, stored in `chrome.storage.local` (your browser's local storage, never sent anywhere)
- **Last response** — the most recent reply from Alice, stored locally so it reappears if you reopen the popup

### Permissions used

| Permission | Why it's needed |
|---|---|
| `storage` | To save your query history and last response locally |
| `contextMenus` | To add the "Ask Alice" option when you right-click selected text |

### External connections

The extension connects **only** to `yandex.ru/alice` and `alice.yandex.ru` — the official Yandex Alice web page — to send your query and retrieve the response. No other external requests are made.

### Third parties

No third-party services, analytics, or tracking are used.

### Contact

If you have questions, open an issue at:
https://github.com/aerovir/alice-shortcut-extension
