# Manual Test Plan — v1.0.0 cleanup

Covers every surface touched by the 1.0 cleanup. Automated coverage (`npm run verify`: lint, format, repo checks, 752 tests, build) is green; this plan is for behavior only a real browser + real game account can confirm.

Legend: **[U]** = upgrade-path specific, **[R]** = regression check of moved/refactored code, **[N]** = new behavior.

## 0. Setup

- [ ] `npm ci && npm run verify` passes locally.
- [ ] `npm run pack` → `unzip -l sim-companies-extension-chrome.zip` lists only `background.js`, `content.js`, `contentStyle.css`, `manifest.json`, `icons/*` (no `.map`, no `resources/recipes.json`).
- [ ] Prepare an **old build** (latest 0.29.x release zip) loaded unpacked from folder A, and the **new build** (`dist/`) ready to copy into folder A (same path keeps the same extension id and storage).
- [ ] Two DevTools views ready: game page (Console + Application → Local Storage → `https://www.simcompanies.com`) and service worker console (`chrome://extensions` → Inspect views: service worker) for `await chrome.storage.local.get(null)`.

## 1. Upgrade + storage migration [U]

With the **old** build, create data in every persisted feature:

- [ ] Sidebar hidden (Alt+H), contract discount set, upgrade discount + multiplier set, warehouse sales builder margin + one manual price + selected products, finance panel opened (cache filled) and period set to "week", 1 market alert, 1 chat alert, 1 contract rule.
- [ ] Note: page Local Storage contains `scx:sidebar-prefs…`, `scx:contract-discount…`, `scx:upgrade-…`, `scx:warehouse-sales-builder…`, `scx:cashflow-finance:v3:…` keys.

Replace folder A with the **new** `dist/`, reload the extension, reload the game:

- [ ] Every setting above is still applied (sidebar still hidden, discounts, multiplier, warehouse settings, finance period "week", alerts, rules).
- [ ] Page Local Storage no longer has `scx:` envelope keys (legacy flat keys such as `scx-contract-discount` may remain until their feature reads them once).
- [ ] `chrome.storage.local` now has those `scx:…` keys plus `scx-data-migrations: { version: "1.0.0" }`.
- [ ] Finance panel shows cached numbers immediately after reload (no full history re-pull: Network shows only `cashflow/recent` + light calls, not dozens of `cashflow/<id>` pages).
- [ ] Console: no `[SimHelper]` errors.
- [ ] What's New toast appears once for the update; the What's New section lists the release.

Fresh install (new Chrome profile):

- [ ] Install shows a welcome card in What's New, no errors.
- [ ] Install dialog / extension details list only storage access for simcompanies.com; **no** GitHub site access.

## 2. Startup and sidebar [R][N]

- [ ] All sections in order: Production, Retail, Financials, Market Alerts, Chat Filter, Executive, What's New; footer support buttons + bug link.
- [ ] XP chip and accounting chip appear in the navbar without waiting for Financials to finish loading (throttle network to "Slow 4G" to see it).
- [ ] Alt+H toggles the sidebar; state survives reload.
- [ ] Alt+H while typing in any input/textarea (game chat, contract price) does **not** toggle the sidebar; on macOS the "˙" character is typed normally. [N]
- [ ] Keyboard: Tab reaches each section header, a focus ring is visible, Enter and Space expand/collapse. Screen reader (VoiceOver) announces "button, collapsed/expanded". [N]
- [ ] PayPal / Ko-fi / bug-report open in new tabs.

## 3. Financials panel [R]

- [ ] Expand → loads; period buttons current/day/week switch and the header label matches the period (translated on `/de/`).
- [ ] Compact ↔ expanded toggle; Refresh button shows loading, then fresh time.
- [ ] Alerts card shows translated alert sentences (never raw keys like `financeAlertCashDrain`). [R]
- [ ] Transactions filter All/Income/Expense; drilldown from a KPI and from a driver, clear drilldown.
- [ ] Copy button: pasted text contains KPIs, P&L, transactions section with the current filter name. Repeat with the page unfocused (click address bar, then the copy button) → still copies (fallback path). [R]
- [ ] Switch realm (navbar realm logo) → panel shows the other realm's data; switch back → first realm's data from cache.
- [ ] Two game tabs, realm switch in tab 1 → tab 2's next refresh shows the new company (auth context sync).

## 4. Background-tab polling [N]

- [ ] Open game tab, DevTools Network filtered on `cashflow`. Switch to another browser tab for > 5 min. Back on the game tab: exactly one catch-up `cashflow/recent` request fires on return; none were sent while hidden (timestamps).
- [ ] Same for chat room list (`chatroom` calls) with the Chat Filter initialized.
- [ ] Market alert and chat alert checks **still** fire while the tab is hidden (toast/sound when a match exists).

## 5. Rate limit [R]

(Only if a 429/challenge happens naturally, or by forcing it in a test account.)

- [ ] Banner with countdown appears; Financials shows the rate-limited status with remaining seconds; no request storm in Network during cooldown.
- [ ] Second tab shows the same cooldown; reloading keeps it.

## 6. Retail helper [R]

- [ ] Retail page: focusing a price/quantity input selects the row and fills the panel.
- [ ] Typing a price updates profit/min smoothly (no stutter, at most one re-render per frame).
- [ ] Profit per unit: positive value; a negative one (red text or with minus sign) shows negative.
- [ ] Duration parsed on English and `/de/` pages (e.g. "13st, 31m"), including the layout with a separate time-of-day ("Beendet: 08:13").
- [ ] Copy text button works.

## 7. Production helper [R]

- [ ] Production page: panel shows recipe costs, product id resolved (encyclopedia link), break-even and profit analysis; buttons work (all now `type="button"` — clicking must not submit any game form).

## 8. Executive helper [R][N]

- [ ] English site: candidate HR feedback matches → skill assessment + average skill shown.
- [ ] `/de/` (and one more language, e.g. `/fr/`): HR feedback in that language now also matches and shows the assessment. [N] — confirm whether the game actually shows localized feedback.
- [ ] Organic growth countdown ticks while expanded, stops when collapsed.

## 9. Warehouse [R][N]

- [ ] Warehouse page: market price buttons appear on cards; clicking shows price/delta.
- [ ] Direct load of `/headquarters/warehouse/`: price buttons + "Sell" checkboxes on every card; ticking a card fills the sales builder.
- [ ] In-game navigation (no reload): overview → warehouse via the WARES menu, warehouse → a resource → back, browser back/forward → buttons and checkboxes appear each time. [R — fixed: observer now waits for the rendered inventory list instead of binding to whatever list exists at route change]
- [ ] Sales builder: toggle products, margin %, manual price + reset, copy message (format `sell 12.5K :re-44: Q2 @ $1.23`), settings survive reload.

## 10. Upgrade modal [R]

- [ ] Discount and multiplier controls work and persist; label reads "Multiplier:" in English and "Multiplikator:" on `/de/`. [N]
- [ ] Copy buy message.

## 11. Contract helper [R]

- [ ] Discount / fixed-price modes, persisted discount, rules panel (add, apply, delete), buttons don't submit the contract form unexpectedly.
- [ ] Calc Profit: Sourcing = amount × the card's "Sourcing cost" (e.g. 1,957 × $119 ≈ $232,883), **not** amount × your cash balance; transport line uses the total transport units. Repeat with the accounting chip popover open. [R — regression fixed: adapter now scoped to the contract card]

## 12. Chat filter [R][N]

- [ ] Search with room, type, product, quality; quality summary chip reads "All" translated when nothing selected (was hardcoded English). [N]
- [ ] Copy text: "Quality" line is translated (was the raw key "quality"). [N]
- [ ] Company links in results open in a new tab.
- [ ] Chat alerts: add / pause / delete; toast link opens.

## 13. Market alerts [R]

- [ ] Add, edit, remove alert; triggered toast and its link; persistence across reload.

## 14. Navbar chips [R]

- [ ] XP chip: popover, refresh button, cached buildings.
- [ ] Accounting chip: OK vs warning state, popover breakdown, updates when cash changes; chips fit after window resize.

## 15. Copy feedback strings [N]

- [ ] Any copy button using the shared helper shows "✓ Copied!" translated on `/de/`, `/ja/`, `/zh-tw/`.

## 16. Languages spot check

- [ ] On `/de/`, `/ja/`, `/zh-tw/`: no raw translation keys visible in any panel; long German section titles fit the collapsed sidebar.

## 17. CI / release (on the PR)

- [ ] CI job runs `npm run verify` + production audit, green.
- [ ] Release workflow (after merge): verify → changelog → build → pack → release `v1.0.0` with the zip.
- [ ] Publish workflow (manual): downloads `sim-companies-extension-chrome.zip` from release `v1.0.0` and uploads it (needs the release to exist first).

## 18. Agent tooling sanity

- [ ] `npm run new:feature -- demo-feature --dry-run` lists the files it would create, writes nothing.
- [ ] Deliberately add `el.style.color = "red"` or a hardcoded `<span>Hello</span>` in a UI module → `npm run verify` fails with a message naming the fix; revert.
