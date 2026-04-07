import { storage } from "./storage.js";

const MIN_DOMAIN_VERSION = {
  "cashflow-finance": 2,
  "buildings-cache": 1,
  "market-alerts": 1,
  "whats-new": 1,
  "xp-widget-visible": 1,
  "contract-discount": 1,
  "upgrade-discount": 1,
  "upgrade-multiplier": 1,
};

const LEGACY_GLOBAL_KEYS = ["scx-buildings", "scx-buildings-ts"];

let migrationsRan = false;

function parseDomainAndVersion(key) {
  const parts = String(key || "").split(":");
  if (parts.length < 4) return null;
  if (parts[0] !== "scx") return null;

  const domain = parts[1];
  const versionPart = parts[2] || "";
  if (!versionPart.startsWith("v")) return null;

  const v = Number(versionPart.slice(1));
  if (!Number.isFinite(v)) return null;

  return { domain, version: v };
}

async function cleanupVersionedEnvelopes(backend) {
  const items = await storage.listByPrefix({ backend, prefix: "scx:" });

  for (const item of items) {
    const parsedKey = parseDomainAndVersion(item.key);
    if (!parsedKey) continue;

    const minV = Number(MIN_DOMAIN_VERSION[parsedKey.domain] || 1);
    if (parsedKey.version < minV) {
      await storage.removeRaw(backend, item.key);
      continue;
    }

    if (item.value == null) {
      await storage.removeRaw(backend, item.key);
      continue;
    }

    const envelope =
      typeof item.value === "string"
        ? (() => {
            try {
              return JSON.parse(item.value || "null");
            } catch {
              return null;
            }
          })()
        : item.value;
    if (!envelope || typeof envelope !== "object" || !Number.isFinite(Number(envelope.v))) {
      await storage.removeRaw(backend, item.key);
      continue;
    }

    if (Number(envelope.v) < minV) {
      await storage.removeRaw(backend, item.key);
    }
  }
}

async function cleanupLegacyGlobalKeys() {
  for (const key of LEGACY_GLOBAL_KEYS) {
    await storage.removeRaw("local", key);
    await storage.removeRaw("chrome", key);
  }
}

export async function runDataMigrations({ force = false } = {}) {
  if (migrationsRan && !force) return;

  await cleanupVersionedEnvelopes("local");
  await cleanupVersionedEnvelopes("chrome");
  await cleanupLegacyGlobalKeys();

  migrationsRan = true;
}
