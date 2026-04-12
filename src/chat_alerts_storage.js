// chat_alerts_storage.js
// Persistence bridge for chat alerts.
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import {
  hydrateChatAlerts,
  resolveNextChatAlertId,
  serializeChatAlerts,
} from "./chat_alerts_state.js";

export const CHAT_ALERTS_STORAGE_KEY_PREFIX = "scx-chat-alerts";
export const CHAT_ALERTS_STORAGE_DOMAIN = "chat-alerts";
export const CHAT_ALERTS_STORAGE_VERSION = 1;

/**
 * @param {number|null|undefined} realmId
 * @returns {string|null}
 */
export function storageKeyForRealm(realmId) {
  if (realmId === null || realmId === undefined) return null;
  return `${CHAT_ALERTS_STORAGE_KEY_PREFIX}-${realmId}`;
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
 * @param {{alerts: object[], nextAlertId: number, state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} input
 */
export async function saveChatAlertsSnapshot(input) {
  const {
    alerts,
    nextAlertId,
    state = STATE,
    storageApi = storage,
    ensureAuthFn = loadAuthDataOnce,
  } = input;

  await ensureAuth(state, ensureAuthFn);

  await storageApi.set({
    domain: CHAT_ALERTS_STORAGE_DOMAIN,
    version: CHAT_ALERTS_STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    data: {
      alerts: serializeChatAlerts(alerts),
      nextAlertId,
    },
  });
}

/**
 * @param {{state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} [input]
 * @returns {Promise<{alerts: object[], nextAlertId: number} | null>}
 */
export async function loadChatAlertsSnapshot(input = {}) {
  const { state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  const realmId = state.auth.realmId;
  const { data } = await storageApi.migrate({
    domain: CHAT_ALERTS_STORAGE_DOMAIN,
    version: CHAT_ALERTS_STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacyKey = storageKeyForRealm(realmId) || `${CHAT_ALERTS_STORAGE_KEY_PREFIX}-${realmId}`;
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

  const alerts = hydrateChatAlerts(data.alerts || []);
  const nextAlertId = resolveNextChatAlertId(alerts, data.nextAlertId);
  return { alerts, nextAlertId };
}
