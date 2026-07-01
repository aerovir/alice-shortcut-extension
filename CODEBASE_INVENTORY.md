# CODEBASE INVENTORY

## Overview

**Спросить у Алисы** — browser extension for quick text queries to Yandex Alice.  
Send a query from the popup (or omnibox, or context menu) and open Alice with your question pre-filled.

- **Author:** aerovir
- **Homepage:** <https://github.com/aerovir/alice-shortcut-extension>
- **License:** not specified (private project)
- **Current branch:** `feature/firefox`

---

## Project Structure

```
.
├── background.js          # Service Worker / Event Page (omnibox, context menu)
├── content.js             # Content script: auto-send + response extraction on alice.yandex.ru
├── generate-icons.py      # Script to regenerate PNG icons from SVG
├── manifest.json          # Extension manifest (varies per branch)
├── popup.html             # Popup UI (HTML + CSS)
├── popup.js               # Popup logic (send query, history, state mgmt)
├── PRIVACY.md             # Privacy policy for Chrome Web Store / AMO
├── README.md              # Project documentation (Russian)
├── README.en.md           # Project documentation (English)
├── .gitignore             # Ignores /dist/
├── icons/                 # Extension icons (16/32/48/128 PNG)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── dist/                  # Build ZIPs (gitignored)
    ├── chrome.zip         # main branch
    ├── firefox.zip        # feature/firefox branch
    └── yandex.zip         # feature/yandex branch
```

---

## Files — Detailed Description

### `manifest.json` (76 lines)

Declares the extension manifest version 3.

**Shared fields (all branches):**
- `name`, `short_name`, `version` (2.0.0), `description`, `author`, `homepage_url`
- Icons, action (popup), content_scripts, host_permissions, permissions, omnibox, commands

**Branch differences:**

| Field | `main` | `feature/firefox` | `feature/yandex` |
|-------|--------|-------------------|-------------------|
| `background` | `{ service_worker }` | `{ service_worker, scripts }` | `{ service_worker }` |
| `browser_specific_settings` | absent | `gecko.id + strict_min_version` | absent |
| `commands.mac` | `Command+Shift+A` | `Command+Shift+A` | removed |

---

### `background.js` (120 lines)

**Role:** Background script — runs as Service Worker (Chrome/Yandex) or Event Page (Firefox).

**Capabilities:**
- **Omnibox** (keyword `alice`): `alice погода москва` opens Alice with the query pre-filled
- **Context menu** (selection): right-click selected text → "Спросить у Алисы: ..."
- **Tab reuse** (`openOrReuseTab`): reuses an existing Alice tab instead of creating a new one

**Branch differences:**
- `feature/firefox`: `createContextMenu()` called at top-level (Event Page doesn't persist menus) — same as other branches but essential for Firefox
- `main` / `feature/yandex`: context menu created in `onInstalled` only

**No longer includes:** popup port communication, hidden tab management, response routing (removed in v2.0 simplification)

---

### `popup.html` (361 lines)

**Role:** Popup UI — what user sees when clicking the extension icon.

**Structure:**
- **Header:** icon, title, keyboard shortcut badge
- **State: input:** textarea + send button + collapsible query history
- **State: result:** query text + buttons ("✏️ Новый запрос", "↗ Перейти к Алисе")
- **State: error:** error message + retry button
- **Footer:** keyboard hints + history count

**CSS:** Single `:root` set of custom properties, dark mode via `prefers-color-scheme`, resets, flex layouts. No external dependencies.

**States (switched via `display: none / flex`):** `input`, `result`, `error` — `loading` state removed in v2.0.

---

### `popup.js` (223 lines)

**Role:** Popup logic — state machine, input handling, history, navigation to Alice.

**Key functions:**
- `sendQuery(text)` — validates, saves to history, shows result with button to open Alice
- `openAliceTab(query)` — builds yandex.ru/alice URL with `alice_deeplink` + `_src`, opens new tab, closes popup
- History management: `getHistory`, `addToHistory`, `removeFromHistory`, `renderHistory`
- `showState(name)` / `showError(msg, sub)` — state transitions

**History:** persisted in `chrome.storage.local` under `alice_query_history` (max 20 items).  
**No longer includes:** port connection, response listening, loading state, crash recovery.

---

### `content.js` (334 lines)

**Role:** Content script injected into `yandex.ru/alice*` and `alice.yandex.ru/*`.

**Trigger:** Only activates when URL contains `_src=alice-extension` + `alice_deeplink`.

**Flow:**
1. Parse `alice_deeplink` JSON → get query text
2. Poll DOM for:
   - Auth page detection (Yandex login form) → error if detected
   - Input field + send button → auto-fill and click send (after 400ms)
3. Track response via DOM polling (250ms interval, 1.5s stability threshold)
4. Extract assistant response text using multiple selector strategies
5. Send result back via `chrome.runtime.sendMessage`

**Timeout constants:**
- `TIMEOUT_SEND`: 12s for input field to appear
- `TIMEOUT_RESPONSE`: 20s for response text to stabilize

**Cleanup:** Removes `_src` from URL after sending to prevent re-send on refresh.

---

### `generate-icons.py` (75 lines)

Python script to generate PNG icons from a hardcoded SVG string.  
Outputs: `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.  
Uses `cairosvg` library.

---

### `PRIVACY.md` (30 lines)

Privacy policy document.  
Data collected: query text (sent to Yandex Alice).  
Data stored locally: query history in `chrome.storage.local`.  
No analytics, no tracking, no third-party data sharing.

---

### `README.md` / `README.en.md`

- `README.md` — Russian (134 lines)
- `README.en.md` — English (135 lines)

Contents: features, installation instructions, branch descriptions, cross-browser differences, keyboard shortcuts, build instructions.

---

## Git Branches

| Branch | Target | Background API | Extra Fields |
|--------|--------|----------------|--------------|
| `main` | Chrome Web Store | MV3 Service Worker | — |
| `feature/firefox` | Firefox Add-ons (AMO) | MV3 Event Page (`scripts`) | `browser_specific_settings.gecko` |
| `feature/yandex` | Yandex Browser Add-ons | MV3 Service Worker | no `mac` shortcut key |
| `feature/history` | (legacy) | History feature branch | — |
| `feature/inline-response` | (legacy) | Inline response feature branch | — |
| `feature/omnibox` | (legacy) | Omnibox feature branch | — |
| `feature/reuse-tab` | (legacy) | Tab reuse feature branch | — |
| `fix/tab-not-opening` | (legacy) | Bugfix branch | — |

All feature branches share identical `popup.js`, `popup.html`, `content.js` — differences are only in `manifest.json` and `background.js`.

---

## Data Flow

```
User types in popup ──→ popup.js: openAliceTab()
                       Creates URL with:
                         ?alice_deeplink={"text":"..."}
                         &_src=alice-extension
                         &_rid=req_N
                       ──→ chrome.tabs.create({ url, active: true })

                        ──→ content.js activates on yandex.ru/alice
                             ├── Detect auth page → error
                             ├── Find input field → fill query → click send
                             └── Poll DOM until response stabilizes
                                  └── Extract response text
                                  └── chrome.runtime.sendMessage('aliceResponse')
```

---

## Key Design Decisions

1. **No hidden tabs.** Query is sent only when user clicks "↗ Перейти к Алисе" — no background tab creation.
2. **Deeplink mechanism.** Uses Yandex's official `alice_deeplink` URL parameter to pre-fill the query on Alice's page.
3. **DOM-based response extraction.** No API keys, no reverse engineering of private APIs — works as a user would.
4. **Cross-browser via branches.** One codebase, three branches, shared popup/content, isolated manifest/background.
5. **Firefox Event Page.** Background script must handle restart at any time (context menu recreation).
