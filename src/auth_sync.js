// why: /me/ endpoints answer for the active company, so cached data is scoped to it. Auth is
// re-fetched only when that company changes: the navbar realm logo changes in this tab, or
// another tab reports a different company.
import { STATE } from "./state.js";
import { loadAuthDataOnce, onAuthDataApplied } from "./auth.js";
import { storage } from "./data/storage.js";
import { observeRealmLogo, readActiveRealmId, readRealmLogoAsset } from "./page/realm_page.js";

const CONTEXT_STORAGE = {
  domain: "auth-context",
  version: 1,
  scope: "global",
  backend: "chrome",
  refreshAuth: false,
};

let lastSeenRealmAsset = null;
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

  const realmAsset = readRealmLogoAsset(root);
  if (realmAsset === null) return;

  // Act on a change of the page realm, not on a mismatch: if the server still
  // reports another realm after one refresh, refetching again would not help.
  const firstSight = lastSeenRealmAsset === null;
  const pageRealmChanged = realmAsset !== lastSeenRealmAsset;
  lastSeenRealmAsset = realmAsset;
  if (!pageRealmChanged || !STATE.auth.loaded) return;

  // why: a realm the adapter does not map yet has no id to compare, so any switch to or
  // from it refetches. On first sight auth is fresh from this page load, so it is trusted.
  const pageRealmId = readActiveRealmId(root);
  const unknownSwitch = pageRealmId === null && !firstSight;
  if (unknownSwitch || (pageRealmId !== null && pageRealmId !== STATE.auth.realmId)) {
    await loadAuthDataOnce({ force: true });
  }
}

function watchPageRealm() {
  // The game switches realm without a page reload; follow the navbar logo so scoped
  // storage and realm API calls move with it instead of waiting for the cashflow poller.
  return observeRealmLogo(document, () => {
    if (!STATE.auth.loaded || STATE.auth.loading) return;
    void ensureAuthContextCurrent();
  });
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
  const stopRealmWatch = watchPageRealm();
  stopSync = () => {
    stopPublishing();
    stopWatching();
    stopRealmWatch();
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
    lastSeenRealmAsset = null;
    broadcastRefresh = null;
  },
};
