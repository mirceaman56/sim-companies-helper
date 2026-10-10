import { resolveScope } from "./scope.js";

const DEFAULT_PREFIX = "scx";

/**
 * @typedef {"scoped"|"company"|"global"} StorageScopeMode
 */

/**
 * @typedef {Object} StorageBaseOptions
 * @property {string} domain Logical feature namespace, for example `market-alerts`.
 * @property {number} version Version segment used in the generated storage key.
 * @property {StorageScopeMode} [scope="scoped"] Scope mode resolved through `resolveScope()`.
 * @property {"chrome"|"sync"} [backend="chrome"] Storage backend. `chrome` is
 *   chrome.storage.local (this device only); `sync` is chrome.storage.sync (follows the
 *   user's browser profile across devices, 8KB per item). The page's own localStorage
 *   ("local") is only readable through getRaw/removeRaw, for migrating legacy keys.
 * @property {string} [prefix="scx"] Storage key prefix.
 * @property {boolean} [refreshAuth=true] Refresh auth-derived scope values before resolving the key.
 */

/**
 * @typedef {StorageBaseOptions & {
 *   ttlMs?: number | null
 * }} StorageReadOptions
 */

/**
 * @typedef {StorageBaseOptions & {
 *   ttlMs?: number | null,
 *   data: unknown
 * }} StorageWriteOptions
 */

/**
 * @typedef {Object} LegacyReadContext
 * @property {typeof getRaw} getRaw Read a legacy raw value.
 * @property {typeof setRaw} setRaw Write a raw value if the migration needs an intermediate step.
 * @property {typeof removeRaw} removeRaw Delete a legacy raw value.
 * @property {typeof listByPrefix} listByPrefix Enumerate legacy keys.
 * @property {(raw: unknown) => any} parseJson Parse legacy JSON envelopes safely.
 */

/**
 * @typedef {Object} LegacyReadResult
 * @property {unknown} data Migrated data value.
 * @property {() => Promise<void>} [cleanup] Optional callback that deletes old keys after a successful write.
 */

/**
 * @typedef {StorageReadOptions & {
 *   readLegacy?: ((context: LegacyReadContext) => Promise<LegacyReadResult | { data: null } | null>) | null,
 *   cleanupLegacy?: boolean
 * }} StorageMigrateOptions
 */

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function hasChromeStorage() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome?.storage?.local);
  } catch {
    return false;
  }
}

function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function hasSyncStorage() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome?.storage?.sync);
  } catch {
    return false;
  }
}

/**
 * Resolve the chrome.storage area behind a non-local backend.
 * @param {"chrome"|"sync"} backend
 * @returns {object|null}
 */
function chromeArea(backend) {
  if (backend === "sync") return hasSyncStorage() ? chrome.storage.sync : null;
  return hasChromeStorage() ? chrome.storage.local : null;
}

function isEnvelopeValid(envelope) {
  return Boolean(envelope && typeof envelope === "object" && Number.isFinite(Number(envelope.v)));
}

function isExpired(envelope, ttlOverrideMs = null, now = Date.now()) {
  const ts = Number(envelope?.ts || 0);
  const ttlFromEnvelope = Number(envelope?.ttlMs);
  const ttl = Number.isFinite(ttlFromEnvelope)
    ? ttlFromEnvelope
    : Number.isFinite(Number(ttlOverrideMs))
      ? Number(ttlOverrideMs)
      : null;

  if (!Number.isFinite(ts) || ts <= 0) return false;
  if (!Number.isFinite(ttl) || ttl <= 0) return false;

  return ts + ttl < now;
}

function normalizeBackend(backend) {
  return backend === "chrome" || backend === "sync" ? backend : "local";
}

/** Envelope reads/writes go to chrome.storage only; page localStorage is legacy, raw access only. */
function envelopeBackend(backend) {
  if (backend === "local") {
    throw new Error('storage: backend "local" (page localStorage) is legacy. Use "chrome" or "sync".');
  }
  return backend === "sync" ? "sync" : "chrome";
}

function normalizePrefix(prefix) {
  const p = String(prefix || DEFAULT_PREFIX).trim();
  return p.length > 0 ? p : DEFAULT_PREFIX;
}

function normalizeDomain(domain) {
  return String(domain || "unknown")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function buildStorageKey({ domain, version, scopeKey, prefix = DEFAULT_PREFIX }) {
  return `${normalizePrefix(prefix)}:${normalizeDomain(domain)}:v${Number(version)}:${scopeKey}`;
}

// MV3 chrome.storage areas return promises (Chrome 88+).
async function chromeGet(keys, backend = "chrome") {
  const api = chromeArea(backend);
  if (!api) return {};
  try {
    return (await api.get(keys)) || {};
  } catch {
    return {};
  }
}

async function chromeSet(items, backend = "chrome") {
  const api = chromeArea(backend);
  if (!api) return false;
  try {
    await api.set(items);
    return true;
  } catch {
    // A rejected write (chrome.storage.sync over quota, sync disabled) must
    // surface as `false` so callers can fall back instead of losing data.
    return false;
  }
}

async function chromeRemove(keys, backend = "chrome") {
  const api = chromeArea(backend);
  if (!api) return false;
  try {
    await api.remove(keys);
    return true;
  } catch {
    return false;
  }
}

export async function getRaw(backend, key) {
  const b = normalizeBackend(backend);
  if (b === "local") {
    if (!hasLocalStorage()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  const data = await chromeGet(key, b);
  return data?.[key] ?? null;
}

export async function setRaw(backend, key, value) {
  const b = normalizeBackend(backend);

  if (b === "local") {
    if (!hasLocalStorage()) return false;
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  return chromeSet({ [key]: value }, b);
}

export async function removeRaw(backend, key) {
  const b = normalizeBackend(backend);

  if (b === "local") {
    if (!hasLocalStorage()) return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  return chromeRemove(key, b);
}

export async function listByPrefix({ backend = "chrome", prefix = "" } = {}) {
  const b = normalizeBackend(backend);
  const p = String(prefix || "");

  if (b === "local") {
    if (!hasLocalStorage()) return [];
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || (p && !key.startsWith(p))) continue;
        out.push({ key, value: localStorage.getItem(key) });
      }
    } catch {
      return [];
    }
    return out;
  }

  const all = await chromeGet(null, b);
  return Object.entries(all || {})
    .filter(([key]) => (p ? key.startsWith(p) : true))
    .map(([key, value]) => ({ key, value }));
}

/**
 * Read a versioned envelope. Scope: "global" (browser-wide), "scoped" (company + realm) or
 * "company". Expired, outdated or foreign-scope envelopes are misses and get removed.
 * @param {StorageReadOptions} [options={}]
 * @returns {Promise<unknown|null>}
 */
export async function get({
  domain,
  version,
  scope = "scoped",
  backend: requestedBackend = "chrome",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
} = {}) {
  const backend = envelopeBackend(requestedBackend);
  const scopeInfo = await resolveScope(scope, { refreshAuth });
  if (!scopeInfo.hasScope || !scopeInfo.scopeKey) return null;

  const key = buildStorageKey({ domain, version, scopeKey: scopeInfo.scopeKey, prefix });
  const raw = await getRaw(backend, key);
  if (raw == null) return null;

  const envelope = parseJson(raw);
  if (!isEnvelopeValid(envelope)) {
    await removeRaw(backend, key);
    return null;
  }

  const envVersion = Number(envelope.v);
  if (envVersion !== Number(version)) {
    if (envVersion < Number(version)) {
      await removeRaw(backend, key);
    }
    return null;
  }

  if (isExpired(envelope, ttlMs)) {
    await removeRaw(backend, key);
    return null;
  }

  const expectedScopeKey = scopeInfo.scopeKey;
  const actualScopeKey = String(envelope?.scope?.scopeKey || "");
  if (expectedScopeKey && actualScopeKey && expectedScopeKey !== actualScopeKey) {
    await removeRaw(backend, key);
    return null;
  }

  return envelope.data ?? null;
}

/**
 * Write a versioned, scope-aware storage value.
 *
 * The stored envelope records the version, timestamp, optional TTL, and resolved scope metadata so stale or cross-scope data can be rejected later.
 *
 * @param {StorageWriteOptions} [options={}]
 * @returns {Promise<boolean>} `true` when the backend write succeeds.
 * @example
 * await set({
 *   domain: "upgrade-discount",
 *   version: 1,
 *   scope: "global",
 *   backend: "chrome",
 *   data: 2.5,
 * });
 */
export async function set({
  domain,
  version,
  scope = "scoped",
  backend: requestedBackend = "chrome",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
  data,
} = {}) {
  const backend = envelopeBackend(requestedBackend);
  const scopeInfo = await resolveScope(scope, { refreshAuth });
  if (!scopeInfo.hasScope || !scopeInfo.scopeKey) return false;

  const key = buildStorageKey({ domain, version, scopeKey: scopeInfo.scopeKey, prefix });

  const envelope = {
    v: Number(version),
    ts: Date.now(),
    ttlMs: Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : null,
    scope: {
      mode: scopeInfo.mode,
      scopeKey: scopeInfo.scopeKey,
      companyId: scopeInfo.companyId,
      realmId: scopeInfo.realmId,
    },
    data,
  };

  return setRaw(backend, key, envelope);
}

/**
 * Remove a versioned, scope-aware storage value for the currently resolved scope.
 *
 * @param {StorageBaseOptions} [options={}]
 * @returns {Promise<boolean>} `true` when the backend delete succeeds.
 * @example
 * await remove({
 *   domain: "market-alerts",
 *   version: 2,
 *   scope: "scoped",
 *   backend: "chrome",
 * });
 */
export async function remove({
  domain,
  version,
  scope = "scoped",
  backend: requestedBackend = "chrome",
  prefix = DEFAULT_PREFIX,
  refreshAuth = true,
} = {}) {
  const backend = envelopeBackend(requestedBackend);
  const scopeInfo = await resolveScope(scope, { refreshAuth });
  if (!scopeInfo.hasScope || !scopeInfo.scopeKey) return false;

  const key = buildStorageKey({ domain, version, scopeKey: scopeInfo.scopeKey, prefix });
  return removeRaw(backend, key);
}

/**
 * Dual-read migration helper for moving legacy keys into the versioned storage platform.
 *
 * The function first checks the new key. If nothing valid is stored yet, it calls `readLegacy()` so the caller can inspect old keys and return `{ data, cleanup }`.
 * When legacy data is found, the new envelope is written and the optional cleanup callback is run.
 *
 * @param {StorageMigrateOptions} [options={}]
 * @returns {Promise<{ data: unknown|null, migrated: boolean }>} Migration result plus the resolved data value.
 * @example
 * const result = await migrate({
 *   domain: "whats-new",
 *   version: 1,
 *   scope: "global",
 *   backend: "chrome",
 *   readLegacy: async ({ getRaw, removeRaw }) => {
 *     const legacy = await getRaw("chrome", "scx-whats-new");
 *     if (legacy == null) return { data: null };
 *     return {
 *       data: legacy,
 *       async cleanup() {
 *         await removeRaw("chrome", "scx-whats-new");
 *       },
 *     };
 *   },
 * });
 */
export async function migrate({
  domain,
  version,
  scope = "scoped",
  backend: requestedBackend = "chrome",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
  readLegacy,
  cleanupLegacy = true,
} = {}) {
  const backend = envelopeBackend(requestedBackend);
  const existing = await get({
    domain,
    version,
    scope,
    backend,
    prefix,
    ttlMs,
    refreshAuth,
  });

  if (existing !== null && existing !== undefined) {
    return { data: existing, migrated: false };
  }

  if (typeof readLegacy !== "function") {
    return { data: null, migrated: false };
  }

  const legacy = await readLegacy({ getRaw, setRaw, removeRaw, listByPrefix, parseJson });
  const legacyData = legacy?.data;

  if (legacyData === null || legacyData === undefined) {
    return { data: null, migrated: false };
  }

  await set({
    domain,
    version,
    scope,
    backend,
    prefix,
    ttlMs,
    refreshAuth,
    data: legacyData,
  });

  if (cleanupLegacy && typeof legacy?.cleanup === "function") {
    await legacy.cleanup();
  }

  return { data: legacyData, migrated: true };
}

/**
 * Watch a global chrome.storage value (local or sync area) for writes from any tab or the
 * background worker. Page localStorage does not broadcast across tabs.
 *
 * @param {{ domain: string, version: number, prefix?: string, backend?: "chrome"|"sync" }} options
 * @param {(data: unknown) => void} listener Receives the new data value, or null when removed.
 * @returns {() => void} Unsubscribe function.
 */
export function watchGlobal({ domain, version, prefix = DEFAULT_PREFIX, backend = "chrome" } = {}, listener) {
  if (typeof listener !== "function") return () => {};

  let events = null;
  try {
    events = typeof chrome !== "undefined" ? chrome?.storage?.onChanged || null : null;
  } catch {
    events = null;
  }
  if (!events?.addListener) return () => {};

  const key = buildStorageKey({ domain, version, scopeKey: "global", prefix });
  const handler = (changes, areaName) => {
    if (areaName !== (envelopeBackend(backend) === "sync" ? "sync" : "local")) return;
    const change = changes?.[key];
    if (!change) return;
    listener(parseJson(change.newValue)?.data ?? null);
  };

  events.addListener(handler);
  return () => {
    try {
      events.removeListener?.(handler);
    } catch {}
  };
}

export const storage = {
  get,
  set,
  remove,
  listByPrefix,
  migrate,
  watchGlobal,
  buildStorageKey,
  getRaw,
  setRaw,
  removeRaw,
};
