// retail_market.js
// Fetches and caches SimCompanies retail-info API
// https://www.simcompanies.com/api/v4/{realm}/resources-retail-info/
// Data is daily-granularity, so a 4-hour TTL is appropriate.

const RETAIL_INFO_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** @type {{ data: Array, ts: number } | null} */
let _cache = null;

/** @type {Promise<Array> | null} */
let _inflight = null;

/**
 * Fetch the full retail-info array from SimCompanies, with caching.
 * Only fetches quality=null (base-quality) rows—multi-quality products
 * also appear with quality=1/2/3, but the base row is most useful for
 * the opportunity score.
 *
 * @param {number} realmId
 * @returns {Promise<Array>}
 */
export async function fetchRetailInfo(realmId) {
  if (_cache && Date.now() - _cache.ts < RETAIL_INFO_TTL_MS) {
    return _cache.data;
  }

  if (_inflight) return _inflight;

  _inflight = (async () => {
    const res = await fetch(
      `https://www.simcompanies.com/api/v4/${realmId}/resources-retail-info/`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    // Keep base-quality items only (quality === null)
    const data = Array.isArray(raw) ? raw.filter((x) => x.quality === null) : [];
    _cache = { data, ts: Date.now() };
    return data;
  })()
    .catch((err) => {
      throw err;
    })
    .finally(() => {
      _inflight = null;
    });

  return _inflight;
}

/**
 * Return the retail-info entry for a single product ID (= dbLetter in the API).
 * Returns null when not found or data not yet loaded.
 *
 * @param {number} realmId
 * @param {number} productId
 * @returns {Promise<object|null>}
 */
export async function fetchRetailInfoForProduct(realmId, productId) {
  const all = await fetchRetailInfo(realmId);
  return all.find((x) => x.dbLetter === productId) ?? null;
}

/**
 * Return cached data synchronously (may be null or stale).
 * Useful for a non-blocking read inside a render loop.
 *
 * @param {number} productId
 * @returns {object|null}
 */
export function getCachedRetailInfo(productId) {
  if (!_cache) return null;
  return _cache.data.find((x) => x.dbLetter === productId) ?? null;
}

/**
 * Invalidate the cache (e.g. for testing).
 */
export function invalidateRetailInfoCache() {
  _cache = null;
  _inflight = null;
}
