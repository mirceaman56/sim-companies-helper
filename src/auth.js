// auth.js
import { STATE } from "./state.js";

export async function loadAuthDataOnce() {
  if (STATE.auth.loaded || STATE.auth.loading) return;

  STATE.auth.loading = true;
  STATE.auth.error = null;

  try {
    const res = await fetch("https://www.simcompanies.com/api/v3/companies/auth-data/", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data?.authCompany;

    STATE.auth.companyId = c?.companyId ?? null;
    STATE.auth.realmId = c?.realmId ?? null;
    STATE.auth.loaded = true;
  } catch (e) {
    STATE.auth.error = String(e?.message || e);
  } finally {
    STATE.auth.loading = false;
  }
}

export function getRealmId() {
  return STATE.auth.realmId ?? 0;
}
