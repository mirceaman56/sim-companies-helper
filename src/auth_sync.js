// auth_sync.js
// Keeps auth-data (company + realm) current without polling the API. The /me/
// endpoints always answer for the company the game has active, so cached data
// must be scoped to it — but auth only needs re-fetching when that company
// actually changes:
// - in this tab: the navbar realm logo changes (one company per realm), or
// - in another tab: it loaded auth for a different company.
import { STATE } from "./state.js";
import { loadAuthDataOnce, onAuthDataApplied } from "./auth.js";
import { storage } from "./data/storage.js";
import { readActiveRealmId } from "./page/realm_page.js";

const CONTEXT_STORAGE = {
  domain: "auth-context",
  version: 1,
  scope: "global",
  backend: "chrome",
  refreshAuth: false,
};

let lastSeenPageRealmId = null;
let broadcastRefresh = null;
let stopSync = null;

function isSameContext(a, b) {
  return Number(a?.companyId) === Number(b?.companyId) && Number(a?.realmId) === Number(b?.realmId);
}

/**
 * Make sure auth is loaded and matches the realm the page shows. Costs no API
 * call unless auth is missing or the page switched realm since the last check.
 * @param {ParentNode} [root]
 */
export async function ensureAuthContextCurrent(root = document) {
  if (!STATE.auth.loaded) {
    await loadAuthDataOnce();
  }

  const pageRealmId = readActiveRealmId(root);
  if (pageRealmId === null) return;

  // Act on a change of the page realm, not on a mismatch: if the server still
  // reports another realm after one refresh, refetching again would not help.
  const pageRealmChanged = pageRealmId !== lastSeenPageRealmId;
  lastSeenPageRealmId = pageRealmId;

  if (pageRealmChanged && STATE.auth.loaded && pageRealmId !== STATE.auth.realmId) {
    await loadAuthDataOnce({ force: true });
  }
}

function publishContext(context) {
  // Loads triggered by another tab's report are not re-published, so two tabs
  // can never trigger each other back and forth.
  if (broadcastRefresh) return;
  void storage.set({ ...CONTEXT_STORAGE, data: context });
}

function onContextReported(context) {
  if (!context || !STATE.auth.loaded || broadcastRefresh) return;
  if (isSameContext(context, STATE.auth)) return;

  broadcastRefresh = loadAuthDataOnce({ force: true }).finally(() => {
    broadcastRefresh = null;
  });
}

/**
 * Share loaded auth with other tabs and follow company changes they report.
 * Call once at startup, before the first auth load.
 */
export function initAuthContextSync() {
  if (stopSync) return;

  const stopPublishing = onAuthDataApplied(publishContext);
  const stopWatching = storage.watchGlobal(CONTEXT_STORAGE, onContextReported);
  stopSync = () => {
    stopPublishing();
    stopWatching();
  };
}

export const _testUtils = {
  STORAGE_KEY: storage.buildStorageKey({
    domain: CONTEXT_STORAGE.domain,
    version: CONTEXT_STORAGE.version,
    scopeKey: "global",
  }),
  reset() {
    stopSync?.();
    stopSync = null;
    lastSeenPageRealmId = null;
    broadcastRefresh = null;
  },
};
