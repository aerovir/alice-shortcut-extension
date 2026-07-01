# Спросить у Алисы — Browser Extension v2.0

A browser extension providing quick access to **Yandex Alice AI** through text input — with **the answer right in the popup**, no tab switching required.

## Features

### ✨ Key Feature: Inline Response (#6)
Type a question → Alice answers directly in the popup window. No need to open a new tab.

How it works: the extension opens a **hidden tab** (invisible to you), a content script auto-sends the query, extracts the response from the DOM, and passes it back. The hidden tab is closed immediately.

### 📜 Query History (#2)
The last 20 queries are saved. You can:
- Click a history entry to fill it into the input field
- Delete individual entries (×)
- Collapse/expand the history section

### 🔍 Quick Input from the Address Bar (#7)
In the browser address bar, type:
```
alice weather moscow
```
And press Enter — a tab with Alice opens (or reuses an existing one).

### 🔄 No Tab Duplication (#1)
When invoked from the address bar or context menu, the extension **reuses an already open Alice tab** instead of creating a new one.

### Extra
- **Ctrl+Shift+A** — open the popup from any tab
- **Select text** → right-click → **«Ask Alice»**
- **Esc** — close the popup
- **Shift+Enter** — new line in the input field
- **Dark theme** — automatically adapts to your system
- **Copy button** — copy Alice's answer to clipboard with one click

## How It Works

### Inline Response Mode (press Enter in popup)
```
popup → port → background → hidden tab → alice.yandex.ru
                                            ↓
                                     content.js:
                                     1. waits for the input field
                                     2. types the query text
                                     3. clicks Send
                                     4. waits for response stability (1.5 sec)
                                     5. extracts the answer from DOM
                                            ↓
popup ← port ← background ← {response} ←
```
The whole process takes ~3–10 seconds — you stay on your current page.

### Open in Alice Mode (from address bar / context menu)
Uses Yandex's official `alice_deeplink` URL parameter. Reuses an existing tab when available.

## Installation

### Chrome / Edge / Opera
1. Clone the repository
2. Open **chrome://extensions/**
3. Enable **Developer mode**
4. Click **Load unpacked** → select the project folder
5. After updating the version, click **🔄 Refresh** on the extension card

## Project Structure

```
alice-shortcut-extension/
├── manifest.json          # Chrome MV3 manifest
├── popup.html             # Popup interface (3 states: input/loading/result)
├── popup.js               # Logic: port, states, history, copy
├── background.js          # Service worker: ports, hidden tabs, omnibox,
│                          #   tab reuse, context menu
├── content.js             # Content script: auto-send, response extraction
├── icons/                 # Extension icons
└── README.en.md
```

## Technical Details

### Communication (for #6)

```
Popup ←→ Port (chrome.runtime.connect) ←→ Background
                                              ↕
                                      Hidden Tab (chrome.tabs.create active:false)
                                              ↕
                                      Content Script (content.js)
```

### Omnibox (#7)

```json
"omnibox": { "keyword": "alice" }
```

In the address bar: `alice <text>` → Enter → Alice tab opens or updates.

### Tab Reuse (#1)

`openOrReuseTab()` searches for open tabs matching `yandex.ru/alice*` and updates the existing tab's URL instead of creating a new one. Used for omnibox and context menu.

### Response Extraction (content.js)

After the query is sent, the script polls the DOM every 250ms for new elements that look like assistant messages. When the response text stops changing for 1.5 seconds (response complete), the extracted text is sent to the background script.

**If no response appears within 20 seconds** — an error is reported.

### Permissions

- `storage` — query history, last response
- `contextMenus` — context menu
- `host_permissions` — only `yandex.ru/alice` and `alice.yandex.ru`
- No data is collected or transmitted

## Compatibility

| Browser | Status |
|---------|--------|
| Chrome 88+ | ✅ |
| Edge 88+ | ✅ |
| Opera 75+ | ✅ |
| Firefox 109+ | ⬜ (needs adaptation) |

## Roadmap

Potential improvements:
- **Query presets (templates)** — save frequent queries as buttons
- **Sync history** across devices (`chrome.storage.sync`)
- **Multi-provider** — support for other AI assistants
- **PDF/images** — drag-and-drop files into the popup

## License

MIT
