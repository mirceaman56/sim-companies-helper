import { resolveScope } from "./scope.js";

const DEFAULT_PREFIX = "scx";

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

function toStorageRaw(backend, value) {
  if (backend === "chrome") return value;
  return JSON.stringify(value);
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
  return backend === "chrome" ? "chrome" : "local";
}

function normalizePrefix(prefix) {
  const p = String(prefix || DEFAULT_PREFIX).trim();
  return p.length > 0 ? p : DEFAULT_PREFIX;
}

function normalizeDomain(domain) {
  return String(domain || "unknown").trim().replace(/\s+/g, "-").toLowerCase();
}

export function buildStorageKey({ domain, version, scopeKey, prefix = DEFAULT_PREFIX }) {
  return `${normalizePrefix(prefix)}:${normalizeDomain(domain)}:v${Number(version)}:${scopeKey}`;
}

async function chromeGet(keys) {
  if (!hasChromeStorage()) return {};
  const api = chrome.storage.local;

  try {
    const result = api.get(keys);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch {}

  return new Promise((resolve) => {
    try {
      api.get(keys, (items) => resolve(items || {}));
    } catch {
      resolve({});
    }
  });
}

async function chromeSet(items) {
  if (!hasChromeStorage()) return false;
  const api = chrome.storage.local;

  try {
    const result = api.set(items);
    if (result && typeof result.then === "function") {
      await result;
      return true;
    }
    return true;
  } catch {}

  return new Promise((resolve) => {
    try {
      api.set(items, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

async function chromeRemove(keys) {
  if (!hasChromeStorage()) return false;
  const api = chrome.storage.local;

  try {
    const result = api.remove(keys);
    if (result && typeof result.then === "function") {
      await result;
      return true;
    }
    return true;
  } catch {}

  return new Promise((resolve) => {
    try {
      api.remove(keys, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
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

  const data = await chromeGet(key);
  return data?.[key] ?? null;
}

function localGetItemSync(key) {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSetItemSync(key, value) {
  if (!hasLocalStorage()) return false;
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function localRemoveItemSync(key) {
  if (!hasLocalStorage()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function localListByPrefixSync(prefix = "") {
  if (!hasLocalStorage()) return [];
  const out = [];
  const p = String(prefix || "");
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

  return chromeSet({ [key]: value });
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

  return chromeRemove(key);
}

export async function listByPrefix({ backend = "local", prefix = "" } = {}) {
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

  const all = await chromeGet(null);
  return Object.entries(all || {})
    .filter(([key]) => (p ? key.startsWith(p) : true))
    .map(([key, value]) => ({ key, value }));
}

export async function get({
  domain,
  version,
  scope = "scoped",
  backend = "local",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
} = {}) {
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

export async function set({
  domain,
  version,
  scope = "scoped",
  backend = "local",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
  data,
} = {}) {
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

  return setRaw(backend, key, toStorageRaw(normalizeBackend(backend), envelope));
}

export async function remove({
  domain,
  version,
  scope = "scoped",
  backend = "local",
  prefix = DEFAULT_PREFIX,
  refreshAuth = true,
} = {}) {
  const scopeInfo = await resolveScope(scope, { refreshAuth });
  if (!scopeInfo.hasScope || !scopeInfo.scopeKey) return false;

  const key = buildStorageKey({ domain, version, scopeKey: scopeInfo.scopeKey, prefix });
  return removeRaw(backend, key);
}

export async function migrate({
  domain,
  version,
  scope = "scoped",
  backend = "local",
  prefix = DEFAULT_PREFIX,
  ttlMs = null,
  refreshAuth = true,
  readLegacy,
  cleanupLegacy = true,
} = {}) {
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

export const storage = {
  get,
  set,
  remove,
  listByPrefix,
  migrate,
  buildStorageKey,
  getRaw,
  setRaw,
  removeRaw,
  localSync: {
    getItem: localGetItemSync,
    setItem: localSetItemSync,
    removeItem: localRemoveItemSync,
    listByPrefix: localListByPrefixSync,
  },
};
