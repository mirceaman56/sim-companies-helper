// Storage scope resolution. The data layer does not know where auth lives: the
// auth module registers a provider at import time (see src/auth.js).

/**
 * @typedef {Object} ScopeProvider
 * @property {() => { companyId: unknown, realmId: unknown }} getContext Current company/realm, sync.
 * @property {() => Promise<void>} refresh Make sure the context is loaded (joins in-flight loads).
 */

/** @type {ScopeProvider} */
let provider = {
  getContext: () => ({ companyId: null, realmId: null }),
  refresh: async () => {},
};

/**
 * Register where scope values come from. Called once by src/auth.js.
 * @param {ScopeProvider} next
 */
export function setScopeProvider(next) {
  if (typeof next?.getContext !== "function" || typeof next?.refresh !== "function") {
    throw new TypeError("setScopeProvider: expected { getContext(), refresh() }");
  }
  provider = next;
}

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
  const context = provider.getContext() || {};
  const companyId = numericOrNull(context.companyId);
  const realmId = numericOrNull(context.realmId);

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
    await provider.refresh();
  }
  return resolveScopeSync(mode);
}
