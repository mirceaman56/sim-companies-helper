// contract_rules_storage.js
// Persistence bridge for saved contract rule templates.
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import { hydrateRules, resolveNextRuleId, serializeRules } from "./contract_rules_state.js";

export const STORAGE_DOMAIN = "contract-rules";
export const STORAGE_VERSION = 1;

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
 * Save current rules snapshot.
 * @param {{rules: object[], nextRuleId: number, state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} input
 */
export async function saveRulesSnapshot(input) {
  const { rules, nextRuleId, state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  await storageApi.set({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
    data: {
      rules: serializeRules(rules),
      nextRuleId,
    },
  });
}

/**
 * Load rules snapshot.
 * @param {{state?: object, storageApi?: object, ensureAuthFn?: () => Promise<void>}} [input]
 * @returns {Promise<{rules: object[], nextRuleId: number} | null>}
 */
export async function loadRulesSnapshot(input = {}) {
  const { state = STATE, storageApi = storage, ensureAuthFn = loadAuthDataOnce } = input;

  await ensureAuth(state, ensureAuthFn);

  const data = await storageApi.get({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "scoped",
    backend: "chrome",
    refreshAuth: true,
  });

  if (!data) return null;

  const rules = hydrateRules(data.rules || []);
  const nextRuleId = resolveNextRuleId(rules, data.nextRuleId);
  return { rules, nextRuleId };
}
