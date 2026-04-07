// market.js
import { STATE } from "./state.js";
import { getRealmId } from "./auth.js";
import { RATE_LIMIT_COOLDOWN_MS, MARKET_CACHE_TTL_MS } from "./constants.js";
import { request, getRateLimitStatus as getApiRateLimitStatus } from "./data/apiClient.js";

/**
 * Check if market calls are currently blocked due to rate limiting.
 * @returns {{ blocked: boolean, remainingMs: number }}
 */
export function getRateLimitStatus() {
  const status = getApiRateLimitStatus("market");
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
  const rateLimit = getApiRateLimitStatus("market");
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
      rateLimitCooldownMs: RATE_LIMIT_COOLDOWN_MS,
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

    // Find exact quality match
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

function ensureMarketFetch(realmId, productId, scheduleUpdate) {
  if (!productId) return;

  const ms = STATE.marketState;
  if (
    ms.productId === productId &&
    ms.realmId === realmId &&
    (ms.status === "ok" || ms.status === "loading")
  ) {
    return;
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
      };
      scheduleUpdate();
    });
}

export function ensureMarketFetchForProduct(productId, scheduleUpdate) {
  const realmId = getRealmId();
  ensureMarketFetch(realmId, productId, scheduleUpdate);
}
