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
- `sendQuery(text)` — validates, saves to history, connects port, shows loading state, sends request to background
- `openAliceTab(query)` — builds yandex.ru/alice URL with `alice_deeplink` (без `_src`), opens new tab, closes popup
- History management: `getHistory`, `addToHistory`, `removeFromHistory`, `renderHistory`
- `showState(name)` / `showError(msg, sub)` — state transitions
- `connectPort()` — establishes port to background, listens for response/error, handles disconnect with storage fallback

**History:** persisted in `chrome.storage.local` under `alice_query_history` (max 20 items).  
**No longer includes:** port connection, response listening, loading state, crash recovery.

---

### `content.js` (334 lines)

**Role:** Content script injected into `yandex.ru/alice*` and `alice.yandex.ru/*`.

**Trigger:** Only activates when URL contains `_src=alice-extension` + `alice_deeplink`.  
Если `_src` есть, но нет `_rid` — контент-скрипт игнорируется (такое бывает при ручной навигации через omnibox/контекстное меню, где `_rid` не передаётся; в этих сценариях авто-отправка не нужна).

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

## Workflow

### Отправка запроса из popup (основной сценарий)

```
User writes query in popup ──→ нажимает Enter / кнопку отправки
                  │
                  ▼
         popup.js: sendQuery()
                  │
                  ├── Сохраняет в историю (chrome.storage.local)
                  ├── Показывает спиннер «Алиса думает...» (state-loading)
                  └── chrome.runtime.connect({ name: 'alice-query' })
                  └── port.postMessage({ action: 'askAlice', query })
                  │
                  ▼
         background.js: handleAskAlice()
                  │
                  ├── Регистрирует requestId (таймаут 25с)
                  └── chrome.tabs.create({ url, active: false })
                  │       (скрытая вкладка — не переключает фокус)
                  ▼
         yandex.ru/alice загружается
                  │
                  ▼
         content.js активируется (_src + alice_deeplink + _rid)
                  │
                  ├── Проверка авторизации (если login-форма → ошибка)
                  ├── Поиск поля ввода → вставка текста
                  ├── Клик по кнопке отправки
                  └── DOM-polling ответа (250ms, стабильность 1.5с)
                       │
                       ▼
                  chrome.runtime.sendMessage('aliceResponse')
                  │
                  ▼
         background.js: handleAliceResponse()
                  │
                  ├── clearTimeout(req.timer) — отмена таймаута 25с
                  ├── req.responded = true — пометка, что ответ получен
                  └── port.postMessage({ type: 'response', text })
                       │
                       ▼
         popup.js получает 'response'
                  │
                  ├── Показывает ответ Алисы (state-result)
                  └── Кнопка «↗ Перейти к Алисе» активна
                  │
                  ├─── [Пользователь закрыл popup]
                  │    └── port.onDisconnect → background.js:
                  │         ├── chrome.tabs.get(tabId) — проверка активности
                  │         ├── Если вкладка активна → не закрываем
                  │         └── Если не активна → chrome.tabs.remove()
                  │
                  └─── [Пользователь нажал «↗ Перейти к Алисе»]
                       └── popup.js: openAliceTab()
                            ├── chrome.tabs.create({ url без _src, active: true })
                            ├── window.close()
                            └── port.onDisconnect → background.js:
                                 ├── chrome.tabs.get(tabId) — проверка активности
                                 ├── Скрытая вкладка не активна → chrome.tabs.remove()
                                 └── Новая вкладка пользователя остаётся открыта
```

### Отправка запроса из omnibox (alice <текст>)

```
Ввод в адресной строке:  alice погода москва
                  │
                  ▼
         background.js: omnibox.onInputEntered
                  │
                  └── openOrReuseTab() → открывает/обновляет вкладку
```

### Отправка запроса через контекстное меню

```
Выделение текста → правый клик → «Спросить у Алисы: "..."`
                  │
                  ▼
         background.js: contextMenus.onClicked
                  │
                  └── openOrReuseTab() → открывает/обновляет вкладку
```

---

## Key Design Decisions

1. **Фоновая вкладка для ответа.** При отправке запроса открывается невидимая вкладка с `active: false`. Она мелькает в панели вкладок ~1-2с, но не переключает фокус. Это единственный способ взаимодействовать с сайтом Яндекса из расширения.
2. **Deeplink mechanism.** Uses Yandex's official `alice_deeplink` URL parameter to pre-fill the query on Alice's page.
3. **DOM-based response extraction.** No API keys, no reverse engineering of private APIs — works as a user would.
4. **Crash recovery (Firefox Event Page).** Если Event Page перезапускается между отправкой запроса и получением ответа, ответ сохраняется в `chrome.storage.local` и popup подхватывает его при переоткрытии.
5. **Cross-browser via branches.** One codebase, three branches, shared popup/content, isolated manifest/background.
6. **Firefox Event Page.** Background script must handle restart at any time (context menu recreation, crash recovery).
7. **Tab lifecycle — закрытие при закрытии popup.** Вкладка не закрывается автоматически после получения ответа. Вместо этого закрытие происходит при `port.onDisconnect` (popup закрыт), и только если вкладка **не активна** (пользователь сам на неё не переключился). Это позволяет:
   - Пользователю спокойно прочитать ответ в popup, вкладка остаётся для фона
   - Если пользователь случайно переключился на скрытую вкладку — она не закроется
   - При нажатии «↗ Перейти к Алисе» открывается новая вкладка, скрытая закрывается вместе с popup
8. **Без `_src` при ручной навигации.** При нажатии «↗ Перейти к Алисе» URL **не содержит** `_src=alice-extension`, чтобы контент-скрипт не активировался и не пытался авто-отправить запрос. `_src` используется только в скрытой вкладке для автоматических запросов.
9. **Защита от неизвестного requestId.** Background игнорирует `aliceResponse`/`aliceError` без `requestId`. Это предотвращает случайное закрытие вкладок, если контент-скрипт сработал на вкладке, созданной не через port-запрос (например, при прямом открытии `yandex.ru/alice?_src=alice-extension`).
