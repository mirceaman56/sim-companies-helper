// cashflow.js
import { STATE } from "./state.js";

const RECENT_URL = "https://www.simcompanies.com/api/v2/companies/me/cashflow/recent/";
const PAGE_URL = (lastId) => `https://www.simcompanies.com/api/v2/companies/me/cashflow/${lastId}/`;

function startOfTodayLocalMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function parseDtMs(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

function isTodayLocal(dtStr) {
  const ms = parseDtMs(dtStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= startOfTodayLocalMs();
}

function computeSummary(items) {
  let salesCount = 0;
  let salesMoney = 0;

  for (const it of items) {
    if (it?.category !== "s") continue;
    const m = Number(it.money || 0);
    salesCount += 1;
    salesMoney += m;
  }

  return { salesCount, salesMoney };
}

async function fetchPage(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads only today's cashflow entries.
 * - Calls /recent first, then /<lastId>/ for older pages
 * - Stops once entries are older than today OR oldestPulled true
 * - Does NOT keep going forever (safety page cap)
 */
export async function loadCashflowToday({ force = false } = {}) {
  if (STATE.cashflow.loading) return;
  if (STATE.cashflow.loaded && !force) return;

  STATE.cashflow.loading = true;
  STATE.cashflow.error = null;

  try {
    const todayItems = [];
    let url = RECENT_URL;
    let pages = 0;

    while (url && pages < 30) {
      pages += 1;

      const json = await fetchPage(url);
      const data = Array.isArray(json?.data) ? json.data : [];

      // Keep only today's entries from this page.
      // Once we hit an older-than-today entry, we can stop.
      let hitOlder = false;
      for (const tx of data) {
        if (isTodayLocal(tx?.datetime)) {
          todayItems.push(tx);
        } else {
          hitOlder = true;
          break; // data is in descending time order
        }
      }

      if (hitOlder) break;
      if (json?.oldestPulled) break;

      // Next page uses LAST item's id from this page
      const last = data[data.length - 1];
      const lastId = last?.id;
      if (!Number.isFinite(lastId)) break;

      url = PAGE_URL(lastId);
    }

    STATE.cashflow.items = todayItems;
    STATE.cashflow.summary = computeSummary(todayItems);
    STATE.cashflow.loaded = true;
    STATE.cashflow.lastRefreshAt = Date.now();
  } catch (e) {
    STATE.cashflow.error = String(e?.message || e);
  } finally {
    STATE.cashflow.loading = false;
  }
}
