// apiHealth.js
// Shared view of the simcompanies.com rate-limit state for UI modules, persisted
// in chrome.storage so reloads and other open game tabs see the same cooldown.
import {
  SIMCOMPANIES_RATE_LIMIT_GROUP,
  applyExternalRateLimit,
  getRateLimitStatus,
  onRateLimitChange,
} from "./apiClient.js";
import { storage } from "./storage.js";

const STORAGE_DOMAIN = "api-health";
const STORAGE_VERSION = 1;
const STORAGE_OPTIONS = {
  domain: STORAGE_DOMAIN,
  version: STORAGE_VERSION,
  scope: "global",
  backend: "chrome",
  refreshAuth: false,
};
const STORAGE_KEY = storage.buildStorageKey({
  domain: STORAGE_DOMAIN,
  version: STORAGE_VERSION,
  scopeKey: "global",
});

let syncStarted = false;

/**
 * Current rate-limit state of the game API.
 * @param {number} [now]
 * @returns {{ blocked: boolean, remainingMs: number, blockedUntil: number, reason: string|null, hits: number }}
 */
export function getApiHealth(now = Date.now()) {
  return getRateLimitStatus(SIMCOMPANIES_RATE_LIMIT_GROUP, now);
}

/**
 * Subscribe to game-API rate-limit changes (hits in this tab or in other tabs).
 * @param {(status: ReturnType<typeof getApiHealth>) => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function onApiHealthChange(listener) {
  if (typeof listener !== "function") return () => {};
  return onRateLimitChange((event) => {
    if (event.group !== SIMCOMPANIES_RATE_LIMIT_GROUP) return;
    listener(event.status);
  });
}

function applyPersisted(data) {
  if (!data || typeof data !== "object") return;
  applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, data);
}

async function persist(status) {
  if (!status?.blocked) return;
  await storage.set({
    ...STORAGE_OPTIONS,
    ttlMs: status.remainingMs,
    data: {
      blockedUntil: status.blockedUntil,
      reason: status.reason,
      hits: status.hits,
    },
  });
}

function onStorageChanged(changes, areaName) {
  if (areaName !== "local") return;
  const change = changes?.[STORAGE_KEY];
  if (!change) return;
  applyPersisted(change.newValue?.data);
}

function hasStorageEvents() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome?.storage?.onChanged?.addListener);
  } catch {
    return false;
  }
}

/**
 * Restore a cooldown persisted before this page load, persist new local hits,
 * and follow hits recorded by other tabs. Safe to call more than once.
 */
export async function initApiHealthSync() {
  if (syncStarted) return;
  syncStarted = true;

  onRateLimitChange((event) => {
    if (event.group !== SIMCOMPANIES_RATE_LIMIT_GROUP || event.source !== "local") return;
    void persist(event.status);
  });

  if (hasStorageEvents()) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  applyPersisted(await storage.get(STORAGE_OPTIONS));
}

export const _testUtils = {
  STORAGE_KEY,
  onStorageChanged,
  reset() {
    syncStarted = false;
  },
};
