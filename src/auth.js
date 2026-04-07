// auth.js
import { STATE } from "./state.js";

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
}

export async function loadAuthDataOnce({ force = false } = {}) {
  if ((!force && STATE.auth.loaded) || STATE.auth.loading) {
    return;
  }

  STATE.auth.loading = true;
  STATE.auth.error = null;

  try {
    const res = await fetch("https://www.simcompanies.com/api/v3/companies/auth-data/", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyAuthData(data);
  } catch (e) {
    STATE.auth.error = String(e?.message || e);
  } finally {
    STATE.auth.loading = false;
  }
}

export function getRealmId() {
  return STATE.auth.realmId ?? 0;
}
