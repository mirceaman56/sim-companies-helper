import { STATE } from "./state.js";
import { getRealmId } from "./auth.js";
import { MARKET_CACHE_TTL_MS, MARKET_ERROR_RETRY_MS } from "./constants.js";
import { request, getRateLimitStatus as getApiRateLimitStatus } from "./data/apiClient.js";

/**
 * Check if market calls are currently blocked because the game API is rate limiting.
 * @returns {{ blocked: boolean, remainingMs: number }}
 */
export function getRateLimitStatus() {
  const status = getApiRateLimitStatus();
  return { blocked: status.blocked, remainingMs: status.remainingMs };
}

export function getCheapestListing(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return null;

  const first = listings[0];
  if (!first || !Number.isFinite(first.price)) return null;

  return {
    price: first.price,
    quantity: Number.isFinite(first.quantity) ? first.quantity : null,
  };
}

export async function fetchMarket(realmId, productId) {
  const now = Date.now();
  const cacheKey = `${realmId}:${productId}`;

  // If rate-limited, return cached data if available, otherwise throw immediately
  const rateLimit = getApiRateLimitStatus();
  if (rateLimit.blocked) {
    const cached = STATE.marketCache.get(cacheKey);
    if (cached) return cached.data;
    const remainMin = Math.ceil(rateLimit.remainingMs / 60000);
    throw new Error(`Rate limited — retrying in ${remainMin}m`);
  }

  const cached = STATE.marketCache.get(cacheKey);
  if (cached && now - cached.ts < MARKET_CACHE_TTL_MS) return cached.data;

  try {
    const url = `https://www.simcompanies.com/api/v3/market/${realmId}/${productId}/`;
    const data = await request("market", {
      url,
      credentials: "include",
      responseType: "json",
      coalesce: true,
      coalesceKey: cacheKey,
      retries: 1,
      retryDelayMs: 300,
    });

    STATE.marketCache.set(cacheKey, { ts: now, data });
    return data;
  } catch (error) {
    // Return stale cache if we have it after failures.
    if (cached) return cached.data;
    throw error;
  }
}

export async function fetchMarketPrice(realmId, productId, quality = 0) {
  try {
    const data = await fetchMarket(realmId, productId);
    if (!Array.isArray(data) || data.length === 0) return null;

    const exactMatch = data.find((item) => Number.isFinite(item.quality) && item.quality === quality);
    if (exactMatch && Number.isFinite(exactMatch.price)) {
      return exactMatch.price;
    }

    // If no exact match, find the closest quality
    let closestListing = data[0];
    let closestDifference = Math.abs((data[0].quality ?? 0) - quality);

    for (const listing of data) {
      if (!Number.isFinite(listing.quality)) continue;
      const difference = Math.abs(listing.quality - quality);
      if (difference < closestDifference) {
        closestDifference = difference;
        closestListing = listing;
      }
    }

    return closestListing && Number.isFinite(closestListing.price) ? closestListing.price : null;
  } catch (e) {
    console.warn(`Failed to fetch price for product ${productId}:`, e);
    return null;
  }
}

/**
 * @param {number} realmId
 * @param {number} productId
 */
function marketAllCacheKey(realmId, productId) {
  return `all:${realmId}:${productId}`;
}

/**
 * @param {number} realmId
 * @param {number} productId
 */
export function hasFreshMarketAll(realmId, productId) {
  const cached = STATE.marketCache.get(marketAllCacheKey(realmId, productId));
  return Boolean(cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS);
}

// why: /market/ stops at the 200 cheapest listings, which for busy products are all low
// quality; /market/all/ is what the game's own quality filter reads.
/**
 * Every exchange listing of a product, cheapest first.
 * @param {number} realmId
 * @param {number} productId
 * @returns {Promise<{ quality: number, price: number }[]>}
 */
export async function fetchMarketAll(realmId, productId) {
  const cacheKey = marketAllCacheKey(realmId, productId);
  if (hasFreshMarketAll(realmId, productId)) return STATE.marketCache.get(cacheKey).data;

  const data = await request("market", {
    url: `https://www.simcompanies.com/api/v3/market/all/${realmId}/${productId}/`,
    credentials: "include",
    responseType: "json",
    coalesce: true,
    coalesceKey: cacheKey,
    retries: 0,
  });
  const listings = (Array.isArray(data) ? data : [])
    .map((item) => ({ quality: Number(item?.quality), price: Number(item?.price) }))
    .filter((item) => Number.isFinite(item.quality) && item.price > 0);
  STATE.marketCache.set(cacheKey, { ts: Date.now(), data: listings });
  return listings;
}

const MARKET_TICKER_CACHE_TTL_MS = 5 * 60 * 1000;
const tickerCache = new Map();

// why: the planner needs prices for many products at once; one /market/ call per product
// burned the shared rate limit. The ticker lists every exchange-traded product (aerospace
// final goods are absent).
/**
 * Cheapest price per product for a whole realm in one request.
 * @param {number} realmId
 * @returns {Promise<Map<number, number>>} product id → price
 */
export async function fetchMarketTicker(realmId) {
  const cached = tickerCache.get(realmId);
  if (cached && Date.now() - cached.ts < MARKET_TICKER_CACHE_TTL_MS) return cached.prices;

  const data = await request("market", {
    url: `https://www.simcompanies.com/api/v3/market-ticker/${realmId}/`,
    credentials: "include",
    responseType: "json",
    coalesce: true,
    coalesceKey: `ticker:${realmId}`,
    retries: 1,
    retryDelayMs: 300,
  });
  const prices = new Map();
  for (const entry of Array.isArray(data) ? data : []) {
    const kind = Number(entry?.kind);
    if (Number.isFinite(kind) && Number.isFinite(entry?.price)) prices.set(kind, entry.price);
  }
  tickerCache.set(realmId, { ts: Date.now(), prices });
  return prices;
}

function ensureMarketFetch(realmId, productId, scheduleUpdate) {
  if (!productId) return;

  const ms = STATE.marketState;
  if (ms.productId === productId && ms.realmId === realmId) {
    if (ms.status === "ok" || ms.status === "loading") return;
    // Back off after a failure. Retrying straight away, with an update callback
    // that re-renders synchronously, made an endless fetch/fail/re-render loop
    // that froze the page while the API was in cooldown.
    if (ms.status === "error" && Date.now() - Number(ms.errorAt || 0) < MARKET_ERROR_RETRY_MS) return;
  }

  STATE.marketState = { status: "loading", realmId, productId, data: null, error: null };
  scheduleUpdate();

  fetchMarket(realmId, productId)
    .then((data) => {
      STATE.marketState = { status: "ok", realmId, productId, data, error: null };
      scheduleUpdate();
    })
    .catch((err) => {
      STATE.marketState = {
        status: "error",
        realmId,
        productId,
        data: null,
        error: String(err?.message || err),
        errorAt: Date.now(),
      };
      scheduleUpdate();
    });
}

export function ensureMarketFetchForProduct(productId, scheduleUpdate) {
  const realmId = getRealmId();
  ensureMarketFetch(realmId, productId, scheduleUpdate);
}
