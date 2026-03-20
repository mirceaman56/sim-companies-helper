// buildings.js
// Fetches and caches the player's building list for the XP calculator.
import { STATE } from "./state.js";
import { BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";

const STORAGE_KEY = "scx-buildings";
const STORAGE_TS_KEY = "scx-buildings-ts";

/**
 * Load buildings from chrome.storage.local cache or fetch from API.
 * Uses /api/v3/companies/<id>/ and extracts infrastructure.buildings.
 * Refreshes if older than BUILDINGS_REFRESH_INTERVAL_MS.
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
      const cached = await readCachedBuildings();
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
    const res = await fetch(`https://www.simcompanies.com/api/v3/companies/${companyId}/`, {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) msg = body.message;
      } catch {
        // ignore parse error
      }
      throw new Error(msg);
    }
    const data = await res.json();
    const buildings = data?.infrastructure?.buildings ?? [];

    STATE.buildings.items = buildings;
    STATE.buildings.lastRefreshAt = Date.now();
    STATE.buildings.loaded = true;

    // Persist to chrome.storage.local
    await writeCachedBuildings(buildings);
  } catch (e) {
    STATE.buildings.error = String(e?.message || e);
  } finally {
    STATE.buildings.loading = false;
  }
}

/** @returns {{ items: object[], ts: number } | null} */
async function readCachedBuildings() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, STORAGE_TS_KEY]);
    const items = result[STORAGE_KEY];
    const ts = result[STORAGE_TS_KEY];
    if (Array.isArray(items) && typeof ts === "number") {
      return { items, ts };
    }
  } catch {
    // ignore
  }
  return null;
}

async function writeCachedBuildings(items) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: items,
      [STORAGE_TS_KEY]: Date.now(),
    });
  } catch {
    // ignore
  }
}
