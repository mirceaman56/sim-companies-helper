import { loadAuthDataOnce } from "./auth.js";
import { storage } from "./data/storage.js";
import { STATE } from "./state.js";
import {
  hydrateChatFilterAlerts,
  resolveNextChatFilterAlertId,
  serializeChatFilterAlerts,
} from "./chat_filter_alerts_state.js";
import { DEFAULT_CHAT_ROOM_DB_LETTER } from "./chat_rooms.js";

export const CHAT_FILTER_STORAGE_DOMAIN = "chat-filter";
export const CHAT_FILTER_STORAGE_VERSION = 1;
export const LEGACY_CHAT_ALERTS_STORAGE_KEY_PREFIX = "scx-chat-alerts";
export const LEGACY_CHAT_ALERTS_STORAGE_DOMAIN = "chat-alerts";
export const LEGACY_CHAT_ALERTS_STORAGE_VERSION = 1;

function shouldResetAlerts(alerts) {
  return Array.isArray(alerts) && alerts.some((alert) => !Array.isArray(alert?.keywords));
}

async function ensureAuth(state, ensureAuthFn) {
  if (state.auth.realmId === null || state.auth.realmId === undefined) {
    await ensureAuthFn();
  }
}

async function cleanupLegacyChatAlertsStorage({
  state = STATE,
  storageApi = storage,
  ensureAuthFn = loadAuthDataOnce,
} = {}) {
  await ensureAuth(state, ensureAuthFn);

  const realmId = state.auth.realmId;
  if (realmId === null || realmId === undefined) return;

  await storageApi.remove({
    domain: LEGACY_CHAT_ALERTS_STORAGE_DOMAIN,
    version: LEGACY_CHAT_ALERTS_STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
  });

  await storageApi.removeRaw("chrome", `${LEGACY_CHAT_ALERTS_STORAGE_KEY_PREFIX}-${realmId}`);
}

export async function saveChatFilterSnapshot(input) {
  const {
    selectedRoomDbLetter,
    alerts,
    nextAlertId,
    state = STATE,
    storageApi = storage,
    ensureAuthFn = loadAuthDataOnce,
  } = input;

  await ensureAuth(state, ensureAuthFn);

  await storageApi.set({
    domain: CHAT_FILTER_STORAGE_DOMAIN,
    version: CHAT_FILTER_STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    data: {
      selectedRoomDbLetter:
        String(selectedRoomDbLetter || DEFAULT_CHAT_ROOM_DB_LETTER).trim() || DEFAULT_CHAT_ROOM_DB_LETTER,
      alerts: serializeChatFilterAlerts(alerts),
      nextAlertId,
    },
  });
}

export async function loadChatFilterSnapshot(input = {}) {
  const { state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await cleanupLegacyChatAlertsStorage({ state, storageApi, ensureAuthFn });

  await ensureAuth(state, ensureAuthFn);

  const data = await storageApi.get({
    domain: CHAT_FILTER_STORAGE_DOMAIN,
    version: CHAT_FILTER_STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
  });

  if (!data) return null;

  const alerts = shouldResetAlerts(data.alerts) ? [] : hydrateChatFilterAlerts(data.alerts || []);
  return {
    selectedRoomDbLetter:
      String(data.selectedRoomDbLetter || DEFAULT_CHAT_ROOM_DB_LETTER).trim() || DEFAULT_CHAT_ROOM_DB_LETTER,
    alerts,
    nextAlertId: shouldResetAlerts(data.alerts) ? 1 : resolveNextChatFilterAlertId(alerts, data.nextAlertId),
  };
}

export const _testUtils = {
  cleanupLegacyChatAlertsStorage,
  shouldResetAlerts,
};
