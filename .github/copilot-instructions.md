# Agent Instructions

- Always answer with caveman style output, keep only relevant words in the answer, no ellaborate wording, no unnecessary information.
- If a task must be handed over, say clearly what is done, what is not done, and the exact next step.

## Project

Chrome MV3 extension for the SimCompanies browser game. Vanilla JS ES modules, bundled by Vite into one content script (`src/content.js`), one stylesheet (`src/content.css`) and one service worker (`src/background.js`). No runtime framework.

## Done means `npm run verify` passes

```bash
npm run verify
```

Runs, in order: `lint` (ESLint over src/tests/scripts), `format:check` (Prettier), `check` (repo guardrails below), `test` (Vitest + jsdom), `build`. CI and release run the same command. Fix what it reports; its messages say how.

| Command                          | Use                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run new:feature -- <name>`  | Scaffold a sidebar feature (UI, page adapter, CSS, tests, fixtures, i18n key, registry entry) that already passes verify |
| `npm run format` / `lint:fix`    | Auto-fix formatting / lint                                                                                               |
| `npm test -- tests/x.test.js`    | Run one test file                                                                                                        |
| `npm run docs:sync-instructions` | After editing AGENTS.md or `.claude/skills/**`                                                                           |

## Rules and the check that enforces each

Rules without a check are marked "review". Do not weaken a check to make a change pass.

| Rule                                                                                                                                                                                                                                                                                    | Enforced by                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Styling lives in `src/styles/**`; no inline styles. A measured value may reach CSS only as a `--scx-*` custom property via `el.style.setProperty`.                                                                                                                                      | ESLint `no-restricted-syntax`, `check:styles` (`style="…"` in markup) |
| Colors only as `var(--scx-*)` tokens from `src/styles/foundations/tokens.css`.                                                                                                                                                                                                          | `check:styles`                                                        |
| `src/content.css` holds only `@import` lines; every partial is imported.                                                                                                                                                                                                                | `check:styles`                                                        |
| No dead CSS: every `.scx-*` class is referenced from JS (or documented in the `extension-design` skill as design-system API).                                                                                                                                                           | `check:styles`                                                        |
| Every user-visible string goes through `t("key")` with a literal key; keys exist in all 12 `src/translations/*.js` files with matching `{placeholders}`; no unused keys. Unknown translation → English value as placeholder.                                                            | `check:i18n`                                                          |
| Extension form fields have `id`/`name`; labels are associated; buttons have `type`; `target="_blank"` links have `rel`.                                                                                                                                                                 | `check:markup`                                                        |
| Module layering (see Architecture).                                                                                                                                                                                                                                                     | `check:architecture`                                                  |
| `fetch` / `localStorage` / `chrome.storage` only inside `src/data/`.                                                                                                                                                                                                                    | `check:architecture`                                                  |
| Game DOM selectors only inside `src/page/*_page.js`.                                                                                                                                                                                                                                    | `check:architecture`                                                  |
| Manifest permissions stay minimal (`storage` only; no host permissions, no web-accessible resources). Changing them means editing the allowlist in `scripts/check-manifest.mjs` and calling it out in the PR.                                                                           | `check:manifest`                                                      |
| Changelog entries: under a version ≤ the manifest version, newest first, ≤ 100 chars, player wording (no PR/issue refs, code, dev jargon).                                                                                                                                              | `check:changelog`                                                     |
| Every page adapter has `tests/<name>_page.test.js` and ≥2 HTML fixtures in `tests/fixtures/<name>/`.                                                                                                                                                                                    | `tests/page_adapter_contract_coverage.test.js`                        |
| Comments explain _why_ (a decision, game quirk, workaround), never _what_. Max 3 prose lines; a block starting with `why:` may use 8. No comments restating the name below, no file-name headers, no commented-out code, no change history (git has it), no TODO/FIXME (open an issue). | `check:comments`, ESLint `no-warning-comments`                        |
| No `eval` / `new Function`.                                                                                                                                                                                                                                                             | ESLint                                                                |
| Files stay under ~500 lines; split by responsibility.                                                                                                                                                                                                                                   | ESLint `max-lines` (warning)                                          |
| Sidebar width: 350px expanded / 180px collapsed; use `box-sizing: border-box` and fluid inner layouts.                                                                                                                                                                                  | review                                                                |
| Readiness checks use structure (child elements, `colspan`, `<b>` with `$`), never UI text.                                                                                                                                                                                              | review                                                                |

## Architecture

```
src/
  content.js            composition root: data platform → auth sync → registry → startup loads → pollers
  content_registry.js   FEATURES list: sidebar sections + one-time initializers (isolated try/catch)
  content_startup.js    startup loads (auth first, rest in parallel; each widget renders when its data lands)
  content_refresh.js    recurring refreshes via startVisiblePoller (src/scheduler.js)
  data/                 network + persistence only (apiClient, storage, scope, migrations, apiHealth)
  page/                 game-DOM adapters (*_page.js) + page_utils.js
  *_calc.js             pure logic, no state/DOM/IO
  *_ui.js, *_render.js  rendering and event wiring
  state.js              shared runtime state (STATE)
  translations/         12 locale files, plain data
  styles/               foundations/ components/ layout/ features/ — imported by content.css
```

Allowed imports (`check:architecture`):

- `src/data/**` → only `src/data/**`. Auth registers itself as the storage scope provider (`setScopeProvider` in `src/data/scope.js`).
- `src/page/**` → `src/page/**`, `src/utils.js`, `src/constants.js`.
- `src/*_calc.js` → other `*_calc.js`, `i18n.js`, `utils.js`, `constants.js`, `src/resources/**`.
- `src/translations/**` → nothing. `src/background.js` → only `src/data/**`.

## Patterns

**New sidebar feature**: `npm run new:feature -- <kebab-name>`, then fill in the adapter, panel and translations. By hand: add one entry to `FEATURES` in `src/content_registry.js` (`section: { id, titleKey, icon, update }` and/or `init`).

**Widget inside game popups / navbar**: register an `init` in `FEATURES`. Inside it:

```javascript
import { observeDocumentBody } from "./page/page_utils.js";
import { getTargetContext, isModalReady } from "./page/my_page.js";

const CONTAINER_ID = "scx-my-widget";

export function initMyWidget() {
  observeDocumentBody(() => {
    const ctx = getTargetContext(document);
    if (ctx && isModalReady(ctx)) injectIfNeeded(ctx);
    else document.getElementById(CONTAINER_ID)?.remove();
  });
}

function injectIfNeeded(ctx) {
  if (document.getElementById(CONTAINER_ID)) return; // never touch the DOM again here: observer loop
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-panel";
  // ...
}
```

`observeDocumentBody` shares one MutationObserver for all callers. For SPA route changes use `onRouteChange` (page_utils). Adapter conventions: `src/page/CLAUDE.md`.

**Network**: `request(domain, spec)` from `src/data/apiClient.js`. All simcompanies.com calls share one rate-limit group; on 429 the client enters a cooldown, persisted and shared across tabs. Branch on `error.code` (`RATE_LIMIT_COOLDOWN`, `HTTP_ERROR`, `TIMEOUT`, `ABORTED`, `NETWORK_ERROR`), never on message text. Read cooldown state with `getRateLimitStatus()`.

**Persistence**: `storage.get/set/remove/migrate` from `src/data/storage.js`. Default backend `"chrome"` (chrome.storage.local); `"sync"` for small settings that should follow the user. Page `localStorage` is legacy: read old keys only via `getRaw("local", key)` inside a `migrate({ readLegacy })`. Keys are `scx:{domain}:v{n}:{scopeKey}`; scope `"scoped"` (company+realm), `"company"`, or `"global"`. When a persisted shape changes, bump the version and the domain's entry in `MIN_DOMAIN_VERSION` (`src/data/migrations.js`).

**Recurring work**: `startVisiblePoller({ intervalMs, run })` (`src/scheduler.js`) — skips hidden tabs (all tabs share one API rate limit) and catches up once when shown. Alert checks that must notify in background tabs use their own timers.

**Rendering**: build markup with template strings; wrap any API/user value in `escapeHtml()`. Coalesce frequent re-renders with `scheduleUpdate(fn)` (one run per frame per function). Shared helpers in `src/utils.js`: `formatMoney`, `parseLocaleNumber`, `escapeHtml`, `wireCopyButton`, `COPY_BUTTON_SVG`, `copyToClipboard`, `writeClipboardText`, `wait`.

## Testing

- Tests in `tests/*.test.js` (Vitest, jsdom). Page-adapter fixtures in `tests/fixtures/<domain>/` — capture real game HTML, anonymized.
- Storage: use `installChromeStorage()` / `installLocalStorage()` from `tests/helpers/storage_mocks.js`.
- `tests/setup.js` makes real `fetch` throw: mock `global.fetch` or the calling module.
- Modules that need auth-scoped storage must import `src/auth.js` (registers the scope provider) or, when mocking auth, call `setScopeProvider` in the mock.
- Export `_testUtils` seams when needed; prefer testing pure `*_calc.js` functions directly.

## Build and release

- `npm run build`: content build (clears `dist/`), then background build (appends). Minified, target `chrome116` (must equal `minimum_chrome_version`; `check:manifest` verifies).
- `npm run pack`: `sim-companies-extension-chrome.zip` from `dist/` without source maps.
- Release workflow (push to `main`): verify → audit → build → pack → GitHub release `v<manifest version>`. Store publish (manual workflow) uploads that release zip.

## Changelog / "What's New"

`src/resources/changelog.json` is written by agents with the `changelog` skill, never by CI. English only, written for non-technical players.

- After any user-visible change, **always ask the user** whether to add it to the changelog, proposing the entry text. Write only on yes.
- Entries go under the version in `public/manifest.json`. If that version is already tagged, ask the user to bump it first (`version-update` skill).
- Retrospective backfill from git history: `changelog` skill, "Retrospective mode".
- `check:changelog` enforces shape, order, length and plain wording.

## Instruction files

`AGENTS.md` is the source of truth (`CLAUDE.md` symlinks to it). `.claude/skills/**` is the source for `.agents/skills/**`. After editing either, run `npm run docs:sync-instructions`; `check` fails when they drift.
