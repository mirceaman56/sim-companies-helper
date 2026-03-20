// buildings.js
// Fetches and caches the player's building list for the XP calculator.
import { STATE } from "./state.js";
import { BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";

const STORAGE_KEY = "scx-buildings";
const STORAGE_TS_KEY = "scx-buildings-ts";

/**
 * Load buildings from chrome.storage.local cache or fetch from API.
 * Refreshes if older than BUILDINGS_REFRESH_INTERVAL_MS.
 * @param {{ force?: boolean }} options
 */
export async function loadBuildings({ force = false } = {}) {
  if (STATE.buildings.loading) return;

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

    // Fetch from API
    const res = await fetch("https://www.simcompanies.com/api/v2/companies/me/buildings/", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    STATE.buildings.items = data;
    STATE.buildings.lastRefreshAt = Date.now();
    STATE.buildings.loaded = true;

    // Persist to chrome.storage.local
    await writeCachedBuildings(data);
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
