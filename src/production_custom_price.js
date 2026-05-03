// production_custom_price.js
// Persistence for user-customized sell prices used in the production helper.
// Custom prices are scoped to (company, realm) and keyed by productId.
// Also tracks the last observed market price per product with a 5-minute TTL
// so the reset action can avoid an extra API hit when fresh data is available.
import { storage } from "./data/storage.js";

const DOMAIN = "production-custom-prices";
const VERSION = 1;
const PRICE_TTL_MS = 5 * 60 * 1000;

const inFlightLoad = { promise: null };
let cache = null;

async function loadAll() {
  if (cache) return cache;
  if (inFlightLoad.promise) return inFlightLoad.promise;

  inFlightLoad.promise = (async () => {
    const data = await storage.get({
      domain: DOMAIN,
      version: VERSION,
      scope: "scoped",
      backend: "local",
    });
    cache = data && typeof data === "object" ? data : { custom: {}, market: {} };
    if (!cache.custom || typeof cache.custom !== "object") cache.custom = {};
    if (!cache.market || typeof cache.market !== "object") cache.market = {};
    inFlightLoad.promise = null;
    return cache;
  })();

  return inFlightLoad.promise;
}

async function persist() {
  if (!cache) return;
  await storage.set({
    domain: DOMAIN,
    version: VERSION,
    scope: "scoped",
    backend: "local",
    data: cache,
  });
}

/**
 * Get the user's saved custom sell price for a product, or null when none.
 * @param {number|string} productId
 * @returns {Promise<number|null>}
 */
export async function getCustomPrice(productId) {
  if (productId == null) return null;
  const all = await loadAll();
  const v = all.custom[String(productId)];
  return Number.isFinite(v) ? v : null;
}

/**
 * Save a user's custom sell price for a product.
 * @param {number|string} productId
 * @param {number} price
 */
export async function setCustomPrice(productId, price) {
  if (productId == null || !Number.isFinite(price) || price <= 0) return;
  const all = await loadAll();
  all.custom[String(productId)] = price;
  await persist();
}

/**
 * Clear any saved custom sell price for a product.
 * @param {number|string} productId
 */
export async function clearCustomPrice(productId) {
  if (productId == null) return;
  const all = await loadAll();
  if (String(productId) in all.custom) {
    delete all.custom[String(productId)];
    await persist();
  }
}

/**
 * Record the last observed live market price for a product.
 * Used by the reset action to avoid a refetch when fresh data is available.
 * @param {number|string} productId
 * @param {number} price
 */
export async function recordMarketPrice(productId, price) {
  if (productId == null || !Number.isFinite(price) || price <= 0) return;
  const all = await loadAll();
  all.market[String(productId)] = { price, ts: Date.now() };
  await persist();
}

/**
 * Read the cached market price for a product when it is younger than the TTL.
 * Returns null when no entry exists or the entry is stale.
 * @param {number|string} productId
 * @returns {Promise<number|null>}
 */
export async function getFreshMarketPrice(productId) {
  if (productId == null) return null;
  const all = await loadAll();
  const entry = all.market[String(productId)];
  if (!entry || !Number.isFinite(entry.price) || !Number.isFinite(entry.ts)) return null;
  if (Date.now() - entry.ts > PRICE_TTL_MS) return null;
  return entry.price;
}

export const PRICE_CACHE_TTL_MS = PRICE_TTL_MS;
