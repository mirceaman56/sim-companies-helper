// why: pre-1.0 builds kept envelopes in page localStorage; moving them is one cheap scan, so it
// runs every start. Purging outdated envelopes reads all of chrome.storage.local, so it runs
// once per extension version (MIGRATION_STATE_KEY).
import { storage } from "./storage.js";

/** Bump a domain here when an old envelope version must be purged everywhere. */
const MIN_DOMAIN_VERSION = {
  "cashflow-finance": 3,
  "buildings-cache": 1,
  "market-alerts": 1,
  "whats-new": 1,
  "xp-widget-visible": 2,
  "contract-discount": 1,
  "upgrade-discount": 1,
  "upgrade-multiplier": 1,
};

const LEGACY_GLOBAL_KEYS = ["scx-buildings", "scx-buildings-ts", "scx-xp-widget-visible"];
const LEGACY_LOCAL_PREFIXES = ["scx-finance-cache-"];
const MIGRATION_STATE_KEY = "scx-data-migrations";

let migrationsRan = false;

function parseDomainAndVersion(key) {
  const parts = String(key || "").split(":");
  if (parts.length < 4 || parts[0] !== "scx") return null;
  const versionPart = parts[2] || "";
  if (!versionPart.startsWith("v")) return null;
  const version = Number(versionPart.slice(1));
  return Number.isFinite(version) ? { domain: parts[1], version } : null;
}

function parseEnvelope(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value ?? "null"));
  } catch {
    return null;
  }
}

function isCurrentEnvelope(key, envelope) {
  const parsedKey = parseDomainAndVersion(key);
  if (!parsedKey) return false;
  const minVersion = Number(MIN_DOMAIN_VERSION[parsedKey.domain] || 1);
  return (
    parsedKey.version >= minVersion &&
    Boolean(envelope) &&
    typeof envelope === "object" &&
    Number.isFinite(Number(envelope.v)) &&
    Number(envelope.v) >= minVersion
  );
}

async function moveLocalEnvelopesToChrome() {
  const entries = await storage.listByPrefix({ backend: "local", prefix: "scx" });
  for (const { key, value } of entries) {
    if (key.startsWith("scx:")) {
      const envelope = parseEnvelope(value);
      // Never overwrite a newer chrome.storage copy written by another tab.
      if (isCurrentEnvelope(key, envelope) && (await storage.getRaw("chrome", key)) == null) {
        if (!(await storage.setRaw("chrome", key, envelope))) continue; // keep it; retry next start
      }
      await storage.removeRaw("local", key);
    } else if (LEGACY_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      await storage.removeRaw("local", key);
    }
  }
}

async function cleanupVersionedEnvelopes() {
  const items = await storage.listByPrefix({ backend: "chrome", prefix: "scx:" });
  for (const { key, value } of items) {
    if (!parseDomainAndVersion(key)) continue;
    if (!isCurrentEnvelope(key, parseEnvelope(value))) await storage.removeRaw("chrome", key);
  }
}

async function cleanupLegacyGlobalKeys() {
  for (const key of LEGACY_GLOBAL_KEYS) {
    await storage.removeRaw("local", key);
    await storage.removeRaw("chrome", key);
  }
}

function extensionVersion() {
  try {
    return chrome.runtime.getManifest().version || null;
  } catch {
    return null;
  }
}

export async function runDataMigrations({ force = false } = {}) {
  if (migrationsRan && !force) return;

  await moveLocalEnvelopesToChrome();

  const version = extensionVersion();
  const state = await storage.getRaw("chrome", MIGRATION_STATE_KEY);
  if (force || !version || state?.version !== version) {
    await cleanupVersionedEnvelopes();
    await cleanupLegacyGlobalKeys();
    if (version) await storage.setRaw("chrome", MIGRATION_STATE_KEY, { version, at: Date.now() });
  }

  migrationsRan = true;
}

export const _testUtils = {
  MIGRATION_STATE_KEY,
  reset() {
    migrationsRan = false;
  },
};
