// market.js
import { STATE } from "./state.js";
import { getRealmId } from "./auth.js";

export function getCheapestListing(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return null;

  const first = listings[0];
  if (!first || !Number.isFinite(first.price)) return null;

  return {
    price: first.price,
    quantity: Number.isFinite(first.quantity) ? first.quantity : null,
  };
}

async function fetchMarket(realmId, productId) {
  const now = Date.now();
  const cacheKey = `${realmId}:${productId}`;
  const cached = STATE.marketCache.get(cacheKey);
  if (cached && now - cached.ts < 30000) return cached.data;

  const url = `https://www.simcompanies.com/api/v3/market/${realmId}/${productId}/`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  STATE.marketCache.set(cacheKey, { ts: now, data });
  return data;
}

export function ensureMarketFetch(realmId, productId, scheduleUpdate) {
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
