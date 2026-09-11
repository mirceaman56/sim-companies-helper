// auth.js
import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";

const authListeners = new Set();

/**
 * Subscribe to successfully applied auth-data loads.
 * @param {(context: { companyId: number|null, realmId: number|null }) => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function onAuthDataApplied(listener) {
  if (typeof listener !== "function") return () => {};
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function notifyAuthDataApplied() {
  const context = { companyId: STATE.auth.companyId, realmId: STATE.auth.realmId };
  for (const listener of authListeners) {
    try {
      listener(context);
    } catch {
      // A broken listener must not break auth loading.
    }
  }
}

function applyAuthData(data) {
  const c = data?.authCompany;

  STATE.auth.companyId = c?.companyId ?? null;
  STATE.auth.realmId = c?.realmId ?? null;
  STATE.auth.productionModifier = c?.productionModifier ?? null;
  STATE.auth.salesModifier = c?.salesModifier ?? null;
  STATE.auth.loaded = true;

  // Capture level info for XP calculator
  const li = data?.levelInfo;
  STATE.levelInfo.level = li?.level ?? null;
  STATE.levelInfo.experience = li?.experience ?? null;
  STATE.levelInfo.experienceToNextLevel = li?.experienceToNextLevel ?? null;

  notifyAuthDataApplied();
}

let inflightAuthLoad = null;

async function fetchAndApplyAuthData() {
  STATE.auth.loading = true;
  STATE.auth.error = null;

  try {
    const data = await request("auth", {
      url: "https://www.simcompanies.com/api/v3/companies/auth-data/",
      credentials: "include",
      responseType: "json",
      retries: 1,
      retryDelayMs: 250,
    });
    applyAuthData(data);
  } catch (e) {
    STATE.auth.error = String(e?.message || e);
  } finally {
    STATE.auth.loading = false;
  }
}

export async function loadAuthDataOnce({ force = false } = {}) {
  if (!force && STATE.auth.loaded) return;

  // Join an in-flight load instead of returning a no-op. Callers rely on auth
  // being resolved once this settles — notably resolveScope(), which fails
  // closed and silently drops scoped storage reads when companyId/realmId are
  // still null.
  if (inflightAuthLoad) return inflightAuthLoad;

  inflightAuthLoad = fetchAndApplyAuthData().finally(() => {
    inflightAuthLoad = null;
  });

  return inflightAuthLoad;
}

export function getRealmId() {
  return STATE.auth.realmId ?? 0;
}
