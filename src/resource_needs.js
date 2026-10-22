// Loads and persists what the resources-needed planner works from. Game data is fetched only
// when the player presses Calculate; edits afterwards recompute from the saved snapshot.
import { STATE } from "./state.js";
import { storage } from "./data/storage.js";
import { getRateLimitStatus } from "./data/apiClient.js";
import { loadBuildings } from "./buildings.js";
import { fetchWarehouseStockRows, resetWarehouseInventoryCache } from "./warehouse_inventory_service.js";
import { fetchMarketPrice } from "./market.js";
import { selectProductionBuildings } from "./resource_needs_calc.js";
import { logStep, logWarn } from "./resource_needs_log.js";

const SETTINGS = { domain: "resource-needs-settings", version: 1, scope: "scoped", backend: "chrome" };
const COOLDOWN = { domain: "resource-needs-cooldown", version: 1, scope: "scoped", backend: "chrome" };
const RATES = { domain: "resource-needs-rates", version: 1, scope: "scoped", backend: "chrome" };
const SNAPSHOT = { domain: "resource-needs-snapshot", version: 1, scope: "scoped", backend: "chrome" };

/**
 * @typedef {{ expanded: boolean, defaultPeriod: string,
 *   buildings: Record<string, import("./resource_needs_calc.js").BuildingPref> }} PlannerSettings
 * @typedef {{ fetchedAt: number,
 *   buildings: import("./resource_needs_calc.js").PlannerBuilding[],
 *   stock: { kind: number, amount: number }[],
 *   prices: Record<string, number|null> }} PlannerSnapshot
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
function saveLastRunAt(lastRunAt) {
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
  return data && Array.isArray(data.buildings) ? data : null;
}

/** @param {PlannerSnapshot} snapshot */
export function saveSnapshot(snapshot) {
  return storage.set({ ...SNAPSHOT, data: snapshot });
}

/** @param {number} remainingMs */
function rateLimitError(remainingMs) {
  return Object.assign(new Error("RATE_LIMIT_COOLDOWN"), { code: "RATE_LIMIT_COOLDOWN", remainingMs });
}

/** @returns {number} ms until the game accepts requests again */
export function gameRateLimitRemainingMs() {
  return getRateLimitStatus().remainingMs;
}

/**
 * Buildings, then warehouse stock.
 * @returns {Promise<PlannerSnapshot>}
 */
export async function fetchPlannerData() {
  const gameLimit = getRateLimitStatus();
  logStep("game rate limit before run", gameLimit);
  // A cooldown the game already imposed must not also start the planner's own lock.
  if (gameLimit.blocked) throw rateLimitError(gameLimit.remainingMs);

  // why: the cooldown starts on the click, not on success, so failed runs cannot be spammed.
  await saveLastRunAt(Date.now());

  // why: /api/v2/companies/me/buildings/ answers the extension with a Cloudflare 403, which the
  // client counts as a rate limit; the v3 company profile has the same building objects.
  await loadBuildings({ force: true });
  if (STATE.buildings.error) {
    logWarn("buildings load failed", STATE.buildings.error);
    if (getRateLimitStatus().blocked) throw rateLimitError(getRateLimitStatus().remainingMs);
    throw new Error(String(STATE.buildings.error));
  }
  const rawList = STATE.buildings.items;
  logStep("raw buildings (v3 company profile)", rawList);
  const buildings = selectProductionBuildings(rawList);
  logStep("production buildings", buildings);

  resetWarehouseInventoryCache();
  const stockRows = await fetchWarehouseStockRows();
  const stock = stockRows.map((row) => ({ kind: Number(row.kind), amount: Number(row.amount) }));
  logStep("warehouse stock", stock);

  return { fetchedAt: Date.now(), buildings, stock, prices: {} };
}

/**
 * Cheapest market price per missing input, quality 0.
 * @param {number[]} productIds
 * @returns {Promise<Record<string, number|null>>}
 */
export async function fetchShortfallPrices(productIds) {
  /** @type {Record<string, number|null>} */
  const prices = {};
  const realmId = STATE.auth.realmId;
  if (realmId == null) {
    logWarn("no realm id, skipping market prices");
    return prices;
  }
  for (const productId of productIds) {
    prices[productId] = await fetchMarketPrice(realmId, productId, 0);
  }
  logStep("shortfall prices", prices);
  return prices;
}
