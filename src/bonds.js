// Loads the company's owned and sold bonds once per page load (accounting widget).
import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";

const BONDS_OWNED_URL = "https://www.simcompanies.com/api/v2/companies/me/bonds/owned/";
const BONDS_SOLD_URL = "https://www.simcompanies.com/api/v2/companies/me/bonds/sold/";

function fetchBonds(key, url) {
  return request(key, {
    url,
    credentials: "include",
    responseType: "json",
    retries: 1,
    retryDelayMs: 250,
    coalesce: true,
  });
}

/**
 * Load bonds into STATE.bonds. Runs at most once per page load; later calls
 * return immediately, even after a failure, so the API is not polled.
 * @returns {Promise<void>}
 */
export async function loadBondsOnce() {
  if (STATE.bonds.loaded || STATE.bonds.loading || STATE.bonds.error) return;

  STATE.bonds.loading = true;
  try {
    const [owned, sold] = await Promise.all([
      fetchBonds("bonds-owned", BONDS_OWNED_URL),
      fetchBonds("bonds-sold", BONDS_SOLD_URL),
    ]);
    STATE.bonds.owned = Array.isArray(owned) ? owned : [];
    STATE.bonds.sold = Array.isArray(sold) ? sold : [];
    STATE.bonds.loaded = true;
  } catch (e) {
    STATE.bonds.error = String(e?.message || e);
  } finally {
    STATE.bonds.loading = false;
  }
}
