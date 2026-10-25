// Loads and persists what the resources-needed planner works from. Buildings come from the
// shared buildings cache; stock and prices are fetched only when the player presses Calculate.
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import { getRateLimitStatus } from "./data/apiClient.js";
import { loadBuildings } from "./buildings.js";
import { fetchWarehouseStockRows } from "./warehouse_inventory_service.js";
import { fetchMarketAll, fetchMarketTicker, hasFreshMarketAll } from "./market.js";
import { wait } from "./utils.js";
import { cheapestAtQuality, needKey, selectProductionBuildings } from "./resource_needs_calc.js";

const SETTINGS = { domain: "resource-needs-settings", version: 1, scope: "scoped", backend: "chrome" };
const COOLDOWN = { domain: "resource-needs-cooldown", version: 1, scope: "scoped", backend: "chrome" };
const RATES = { domain: "resource-needs-rates", version: 1, scope: "scoped", backend: "chrome" };
const SNAPSHOT = { domain: "resource-needs-snapshot", version: 2, scope: "scoped", backend: "chrome" };

const PRICE_GAP_MIN_MS = 100;
const PRICE_GAP_MAX_MS = 200;
const BUILDINGS_WAIT_STEP_MS = 100;
const BUILDINGS_WAIT_MAX_MS = 15_000;

/**
 * @typedef {{ expanded: boolean, defaultPeriod: string,
 *   buildings: Record<string, import("./resource_needs_calc.js").BuildingPref> }} PlannerSettings
 * @typedef {{ fetchedAt: number, stock: import("./resource_needs_calc.js").StockRow[],
 *   prices: Record<string, number|null> }} PlannerSnapshot
 * @typedef {{ done: number, total: number }} PriceProgress
 */

/** @returns {Promise<PlannerSettings>} */
export async function loadPlannerSettings() {
  const data = /** @type {any} */ (await storage.get(SETTINGS));
  return {
    expanded: Boolean(data?.expanded),
    defaultPeriod: typeof data?.defaultPeriod === "string" ? data.defaultPeriod : "",
    buildings: data?.buildings && typeof data.buildings === "object" ? data.buildings : {},
  };
}

/** @param {PlannerSettings} settings */
export function savePlannerSettings(settings) {
  return storage.set({ ...SETTINGS, data: settings });
}

/** @returns {Promise<number>} */
export async function loadLastRunAt() {
  const data = /** @type {any} */ (await storage.get(COOLDOWN));
  return Number(data?.lastRunAt) || 0;
}

/** @param {number} lastRunAt */
export function saveLastRunAt(lastRunAt) {
  return storage.set({ ...COOLDOWN, data: { lastRunAt } });
}

/** @returns {Promise<Record<string, import("./resource_needs_calc.js").CapturedRates>>} */
export async function loadCapturedRates() {
  const data = await storage.get(RATES);
  return data && typeof data === "object" ? /** @type {any} */ (data) : {};
}

/** @param {Record<string, import("./resource_needs_calc.js").CapturedRates>} rates */
export function saveCapturedRates(rates) {
  return storage.set({ ...RATES, data: rates });
}

/** @returns {Promise<PlannerSnapshot|null>} */
export async function loadSnapshot() {
  const data = /** @type {any} */ (await storage.get(SNAPSHOT));
  return data && Array.isArray(data.stock) && data.prices && typeof data.prices === "object" ? data : null;
}

/** @param {PlannerSnapshot} snapshot */
export function saveSnapshot(snapshot) {
  return storage.set({ ...SNAPSHOT, data: snapshot });
}

/** @returns {number} ms until the game accepts requests again */
export function gameRateLimitRemainingMs() {
  return getRateLimitStatus().remainingMs;
}

/** @param {any} error */
function isRateLimited(error) {
  return error?.code === "RATE_LIMIT_COOLDOWN" || getRateLimitStatus().blocked;
}

/**
 * Production buildings from the shared 6h buildings cache (one request when it is stale).
 * @returns {Promise<import("./resource_needs_calc.js").PlannerBuilding[]>}
 */
export async function loadPlannerBuildings() {
  await loadBuildings();
  // Another feature may be loading the same list; loadBuildings returns at once in that case.
  for (
    let waited = 0;
    STATE.buildings.loading && waited < BUILDINGS_WAIT_MAX_MS;
    waited += BUILDINGS_WAIT_STEP_MS
  ) {
    await wait(BUILDINGS_WAIT_STEP_MS);
  }
  if (STATE.buildings.error) {
    throw Object.assign(new Error(String(STATE.buildings.error)), {
      code: getRateLimitStatus().blocked ? "RATE_LIMIT_COOLDOWN" : "BUILDINGS_FAILED",
    });
  }
  return selectProductionBuildings(STATE.buildings.items);
}

/** @returns {Promise<import("./resource_needs_calc.js").StockRow[]>} */
export async function fetchStock() {
  const rows = await fetchWarehouseStockRows();
  return rows.map((row) => ({
    kind: Number(row.kind),
    quality: Number(row.quality) || 0,
    amount: Number(row.amount),
  }));
}

/**
 * Unit price per missing input. Q0 comes from the market ticker (one request for every
 * product); higher qualities need that product's full listing, fetched one at a time with a
 * random 100–200ms gap. Stops at the first rate limit and returns what it has.
 * @param {{ productId: number, quality: number }[]} needs
 * @param {(progress: PriceProgress) => void} [onProgress]
 * @returns {Promise<{ prices: Record<string, number|null>, rateLimited: boolean }>}
 */
export async function fetchPrices(needs, onProgress = () => {}) {
  /** @type {Record<string, number|null>} */
  const prices = {};
  const realmId = STATE.auth.realmId;
  if (realmId == null || needs.length === 0) return { prices, rateLimited: false };

  /** @type {Map<number, number[]>} product → qualities still to price */
  const queue = new Map();
  const enqueue = (/** @type {{ productId: number, quality: number }} */ need) =>
    queue.set(need.productId, [...(queue.get(need.productId) ?? []), need.quality]);

  const q0 = needs.filter((need) => need.quality === 0);
  needs.filter((need) => need.quality > 0).forEach(enqueue);
  let done = 0;
  let total = (q0.length > 0 ? 1 : 0) + queue.size;
  onProgress({ done, total });

  if (q0.length > 0) {
    try {
      const ticker = await fetchMarketTicker(realmId);
      for (const need of q0) {
        const price = ticker.get(need.productId);
        if (price === undefined) enqueue(need);
        else prices[needKey(need.productId, 0)] = price;
      }
    } catch (error) {
      if (isRateLimited(error)) return { prices, rateLimited: true };
      q0.forEach(enqueue);
    }
    done += 1;
    total = 1 + queue.size;
    onProgress({ done, total });
  }

  let requested = false;
  for (const [productId, qualities] of queue) {
    if (getRateLimitStatus().blocked) return { prices, rateLimited: true };
    const cached = hasFreshMarketAll(realmId, productId);
    if (requested && !cached)
      await wait(PRICE_GAP_MIN_MS + Math.random() * (PRICE_GAP_MAX_MS - PRICE_GAP_MIN_MS));
    requested ||= !cached;
    try {
      const listings = await fetchMarketAll(realmId, productId);
      for (const quality of qualities)
        prices[needKey(productId, quality)] = cheapestAtQuality(listings, quality);
    } catch (error) {
      if (isRateLimited(error)) return { prices, rateLimited: true };
      for (const quality of qualities) prices[needKey(productId, quality)] = null;
    }
    done += 1;
    onProgress({ done, total });
  }
  return { prices, rateLimited: false };
}
