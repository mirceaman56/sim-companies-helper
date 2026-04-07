import { loadAuthDataOnce } from "../auth.js";
import { STATE } from "../state.js";

const VALID_SCOPE_MODES = new Set(["scoped", "company", "global"]);

function normalizeScopeMode(scopeMode) {
  if (VALID_SCOPE_MODES.has(scopeMode)) return scopeMode;
  return "scoped";
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveScopeSync(scopeMode = "scoped") {
  const mode = normalizeScopeMode(scopeMode);
  const companyId = numericOrNull(STATE.auth?.companyId);
  const realmId = numericOrNull(STATE.auth?.realmId);

  if (mode === "global") {
    return {
      mode,
      companyId,
      realmId,
      hasScope: true,
      scopeKey: "global",
    };
  }

  if (mode === "company") {
    return {
      mode,
      companyId,
      realmId,
      hasScope: Number.isFinite(companyId),
      scopeKey: Number.isFinite(companyId) ? String(companyId) : null,
    };
  }

  const hasScope = Number.isFinite(companyId) && Number.isFinite(realmId);
  return {
    mode,
    companyId,
    realmId,
    hasScope,
    scopeKey: hasScope ? `${companyId}-${realmId}` : null,
  };
}

export async function resolveScope(scopeMode = "scoped", { refreshAuth = false } = {}) {
  const mode = normalizeScopeMode(scopeMode);
  if (refreshAuth && mode !== "global") {
    await loadAuthDataOnce();
  }
  return resolveScopeSync(mode);
}
