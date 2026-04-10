// market_alerts_storage.js
// Persistence bridge for market alerts.
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import { hydrateAlerts, resolveNextAlertId, serializeAlerts } from "./market_alerts_state.js";

export const STORAGE_KEY_PREFIX = "scx-market-alerts";
export const STORAGE_DOMAIN = "market-alerts";
export const STORAGE_VERSION = 1;

/**
 * @param {number|null|undefined} realmId
 * @returns {string|null}
 */
export function storageKeyForRealm(realmId) {
  if (realmId === null || realmId === undefined) return null;
  return `${STORAGE_KEY_PREFIX}-${realmId}`;
}

/**
 * @param {{ auth: { realmId: number|null|undefined } }} state
 * @param {() => Promise<void>} ensureAuthFn
 */
async function ensureAuth(state, ensureAuthFn) {
  if (state.auth.realmId === null || state.auth.realmId === undefined) {
    await ensureAuthFn();
  }
}

/**
 * Save current alert snapshot.
 * @param {{alerts: object[], nextAlertId: number, state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} input
 */
export async function saveAlertsSnapshot(input) {
  const { alerts, nextAlertId, state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  await storageApi.set({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    data: {
      alerts: serializeAlerts(alerts),
      nextAlertId,
    },
  });
}

/**
 * Load alert snapshot.
 * @param {{state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} [input]
 * @returns {Promise<{alerts: object[], nextAlertId: number} | null>}
 */
export async function loadAlertsSnapshot(input = {}) {
  const { state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  const realmId = state.auth.realmId;
  const { data } = await storageApi.migrate({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacyKey = storageKeyForRealm(realmId) || `${STORAGE_KEY_PREFIX}-${realmId}`;
      const legacyData = await getRaw("chrome", legacyKey);
      if (!legacyData) return { data: null };
      return {
        data: legacyData,
        async cleanup() {
          await removeRaw("chrome", legacyKey);
        },
      };
    },
  });

  if (!data) return null;

  const alerts = hydrateAlerts(data.alerts || []);
  const nextAlertId = resolveNextAlertId(alerts, data.nextAlertId);
  return { alerts, nextAlertId };
}
