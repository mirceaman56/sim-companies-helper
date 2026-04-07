// buildings.js
// Fetches and caches the player's building list for the XP calculator.
import { STATE } from "./state.js";
import { BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";
import { request } from "./data/apiClient.js";
import { storage } from "./data/storage.js";

const STORAGE_DOMAIN = "buildings-cache";
const STORAGE_VERSION = 1;

/**
 * Load buildings from chrome.storage.local cache or fetch from API.
 * Uses /api/v3/companies/<id>/ and extracts infrastructure.buildings.
 * Cache is keyed per company ID. Refreshes if older than BUILDINGS_REFRESH_INTERVAL_MS.
 * @param {{ force?: boolean }} options
 */
export async function loadBuildings({ force = false } = {}) {
  if (STATE.buildings.loading) return;

  const companyId = STATE.auth.companyId;
  if (!companyId) {
    STATE.buildings.error = "Company ID not available";
    return;
  }

  STATE.buildings.loading = true;
  STATE.buildings.error = null;

  try {
    // Try cached data first (unless forced)
    if (!force) {
      const cached = await readCachedBuildings(companyId);
      if (cached) {
        STATE.buildings.items = cached.items;
        STATE.buildings.lastRefreshAt = cached.ts;
        STATE.buildings.loaded = true;

        // If still fresh enough, skip API call
        if (Date.now() - cached.ts < BUILDINGS_REFRESH_INTERVAL_MS) {
          return;
        }
      }
    }

    // Fetch from the v3 company profile endpoint
    const data = await request("buildings", {
      url: `https://www.simcompanies.com/api/v3/companies/${companyId}/`,
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      responseType: "json",
      retries: 1,
      retryDelayMs: 250,
    });
    const buildings = data?.infrastructure?.buildings ?? [];

    STATE.buildings.items = buildings;
    STATE.buildings.lastRefreshAt = Date.now();
    STATE.buildings.loaded = true;

    // Persist to chrome.storage.local
    await writeCachedBuildings(companyId, buildings);
  } catch (e) {
    STATE.buildings.error = String(e?.message || e);
  } finally {
    STATE.buildings.loading = false;
  }
}

/** @returns {{ items: object[], ts: number } | null} */
async function readCachedBuildings(companyId) {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "company",
    backend: "chrome",
    refreshAuth: true,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const itemsKey = `scx-buildings-${companyId}`;
      const tsKey = `scx-buildings-ts-${companyId}`;
      const items = await getRaw("chrome", itemsKey);
      const ts = await getRaw("chrome", tsKey);
      if (!Array.isArray(items) || !Number.isFinite(Number(ts))) return { data: null };

      return {
        data: { items, ts: Number(ts) },
        async cleanup() {
          await removeRaw("chrome", itemsKey);
          await removeRaw("chrome", tsKey);
        },
      };
    },
  });

  if (data && Array.isArray(data.items) && Number.isFinite(Number(data.ts))) {
    return {
      items: data.items,
      ts: Number(data.ts),
    };
  }

  return null;
}

async function writeCachedBuildings(companyId, items) {
  const ts = Date.now();
  await storage.set({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "company",
    backend: "chrome",
    refreshAuth: true,
    data: { items, ts },
  });
}

/**
 * Clean up orphaned storage keys from before the per-company-id migration.
 * Old keys: "scx-buildings", "scx-buildings-ts"
 * Safe to call multiple times; only removes if they exist.
 */
export async function cleanupLegacyBuildingsCache() {
  await storage.removeRaw("chrome", "scx-buildings");
  await storage.removeRaw("chrome", "scx-buildings-ts");
}
