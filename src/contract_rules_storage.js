// why: rules live in chrome.storage.sync to follow the user across devices. A write sync
// refuses (8KB quota, sync off) goes to chrome.storage.local, which wins on the next load
// and is dropped once a sync write succeeds.
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import { CONTRACT_RULE_NOTE_MAX_LENGTH } from "./constants.js";
import { hydrateRules, resolveNextRuleId, serializeRules } from "./contract_rules_state.js";

export const STORAGE_DOMAIN = "contract-rules";
export const STORAGE_VERSION = 2;
// v1 kept percent-only rules in chrome.storage.local.
export const LEGACY_STORAGE_VERSION = 1;

const SYNC_BACKEND = "sync";
const LOCAL_BACKEND = "chrome";

/**
 * @param {{ auth: { realmId: number|null|undefined } }} state
 * @param {() => Promise<void>} ensureAuthFn
 */
function hasAccountScope(state) {
  const isId = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  return isId(state.auth.companyId) && isId(state.auth.realmId);
}

/**
 * Rules are stored per company + realm. Without both ids every read comes back
 * empty and every write is dropped, so fail loudly instead.
 * @param {{ auth: { companyId?: number|null, realmId: number|null|undefined } }} state
 * @param {() => Promise<void>} ensureAuthFn
 */
async function ensureAuth(state, ensureAuthFn) {
  if (!hasAccountScope(state)) await ensureAuthFn();
  if (!hasAccountScope(state)) throw new Error("Contract rules: company/realm not known yet");
}

function keyOptions(backend, version = STORAGE_VERSION) {
  return { domain: STORAGE_DOMAIN, version, scope: "scoped", backend, refreshAuth: true };
}

function toSnapshot(data) {
  const rules = hydrateRules(data.rules || [], { noteMaxLength: CONTRACT_RULE_NOTE_MAX_LENGTH });
  return { rules, nextRuleId: resolveNextRuleId(rules, data.nextRuleId) };
}

/**
 * Write the payload to sync, or to local when sync refuses it.
 * @returns {Promise<{saved: boolean, synced: boolean}>}
 */
async function writeSnapshot(storageApi, data) {
  if (await storageApi.set({ ...keyOptions(SYNC_BACKEND), data })) {
    // The synced copy is now the newest one; drop any stale local fallback.
    await storageApi.remove(keyOptions(LOCAL_BACKEND));
    return { saved: true, synced: true };
  }

  const saved = Boolean(await storageApi.set({ ...keyOptions(LOCAL_BACKEND), data }));
  return { saved, synced: false };
}

/**
 * @param {{rules: object[], nextRuleId: number, state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} input
 * @returns {Promise<{saved: boolean, synced: boolean}>}
 */
export async function saveRulesSnapshot(input) {
  const { rules, nextRuleId, state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  try {
    await ensureAuth(state, ensureAuthFn);
  } catch {
    return { saved: false, synced: false };
  }

  return writeSnapshot(storageApi, { rules: serializeRules(rules), nextRuleId });
}

/**
 * @param {{state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} [input]
 * @returns {Promise<{rules: object[], nextRuleId: number, synced: boolean} | null>} Null when
 *   nothing is stored. Rejects when the account is unknown, which is not the same as empty.
 */
export async function loadRulesSnapshot(input = {}) {
  const { state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  // A local v2 copy means the last save could not reach sync, so it is newer
  // than whatever sync holds. Use it and retry the upload.
  const localData = await storageApi.get(keyOptions(LOCAL_BACKEND));
  if (localData) {
    const snapshot = toSnapshot(localData);
    const { synced } = await writeSnapshot(storageApi, {
      rules: serializeRules(snapshot.rules),
      nextRuleId: snapshot.nextRuleId,
    });
    return { ...snapshot, synced };
  }

  const syncedData = await storageApi.get(keyOptions(SYNC_BACKEND));
  if (syncedData) return { ...toSnapshot(syncedData), synced: true };

  // Dual-read: move v1 rules forward, and only delete them once the new copy
  // is safely written somewhere.
  const legacyOptions = keyOptions(LOCAL_BACKEND, LEGACY_STORAGE_VERSION);
  const legacyData = await storageApi.get(legacyOptions);
  if (!legacyData) return null;

  const snapshot = toSnapshot(legacyData);
  const { saved, synced } = await writeSnapshot(storageApi, {
    rules: serializeRules(snapshot.rules),
    nextRuleId: snapshot.nextRuleId,
  });
  if (saved) await storageApi.remove(legacyOptions);

  return { ...snapshot, synced };
}
