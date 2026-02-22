// market.js
import { STATE } from "./state.js";
import { getRealmId } from "./auth.js";

// Rate-limit protection: block all market calls for 10 minutes after a 429
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
let rateLimitedUntil = 0;

/**
 * Check if market calls are currently blocked due to rate limiting.
 * @returns {{ blocked: boolean, remainingMs: number }}
 */
export function getRateLimitStatus() {
  const remaining = rateLimitedUntil - Date.now();
  return { blocked: remaining > 0, remainingMs: Math.max(0, remaining) };
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

  // If rate-limited, return cached data if available, otherwise throw
  if (now < rateLimitedUntil) {
    const cacheKey = `${realmId}:${productId}`;
    const cached = STATE.marketCache.get(cacheKey);
    if (cached) return cached.data;
    const remainMin = Math.ceil((rateLimitedUntil - now) / 60000);
    throw new Error(`Rate limited — retrying in ${remainMin}m`);
  }

  const cacheKey = `${realmId}:${productId}`;
  const cached = STATE.marketCache.get(cacheKey);
  if (cached && now - cached.ts < 60000) return cached.data;

  const url = `https://www.simcompanies.com/api/v3/market/${realmId}/${productId}/`;
  const res = await fetch(url, { credentials: "include" });

  if (res.status === 429) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    console.warn(`[SimHelper] 429 rate-limited — pausing all market calls for 10 minutes`);
    // Return stale cache if we have it, otherwise throw
    if (cached) return cached.data;
    throw new Error("Rate limited by server — pausing market calls for 10 minutes");
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  STATE.marketCache.set(cacheKey, { ts: now, data });
  return data;
}

export async function fetchMarketPrice(realmId, productId, quality = 0) {
  try {
    const data = await fetchMarket(realmId, productId);
    if (!Array.isArray(data) || data.length === 0) return null;

    // Find exact quality match
    const exactMatch = data.find(item => Number.isFinite(item.quality) && item.quality === quality);
    if (exactMatch && Number.isFinite(exactMatch.price)) {
      console.log("Found exact match {} with price {}", exactMatch.quality, exactMatch.price);
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
