// cashflow.js
import { STATE } from "./state.js";

const RECENT_URL = "https://www.simcompanies.com/api/v2/companies/me/cashflow/recent/";
const PAGE_URL = (lastId) => `https://www.simcompanies.com/api/v2/companies/me/cashflow/${lastId}/`;

function startOfTodayLocalMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfYesterdayLocalMs() {
  return startOfTodayLocalMs() - 24 * 60 * 60 * 1000;
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

function isYesterdayLocal(dtStr) {
  const ms = parseDtMs(dtStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= startOfYesterdayLocalMs() && ms < startOfTodayLocalMs();
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
 * Loads today's and yesterday's cashflow entries.
 */
export async function loadCashflowToday({ force = false } = {}) {
  if (STATE.cashflow.loading) return;
  if (STATE.cashflow.loaded && !force) return;

  STATE.cashflow.loading = true;
  STATE.cashflow.error = null;

  try {
    const todayItems = [];
    const yesterdayItems = [];

    let url = RECENT_URL;
    let pages = 0;

    while (url && pages < 30) {
      pages += 1;

      const json = await fetchPage(url);
      const data = Array.isArray(json?.data) ? json.data : [];

      let hitOlderThanYesterday = false;

      for (const tx of data) {
        if (isTodayLocal(tx?.datetime)) {
          todayItems.push(tx);
        } else if (isYesterdayLocal(tx?.datetime)) {
          yesterdayItems.push(tx);
        } else {
          hitOlderThanYesterday = true;
          break;
        }
      }

      if (hitOlderThanYesterday) break;
      if (json?.oldestPulled) break;

      const last = data[data.length - 1];
      const lastId = last?.id;
      if (!Number.isFinite(lastId)) break;

      url = PAGE_URL(lastId);
    }

    STATE.cashflow.todayItems = todayItems;
    STATE.cashflow.yesterdayItems = yesterdayItems;
    STATE.cashflow.todaySummary = computeSummary(todayItems);
    STATE.cashflow.yesterdaySummary = computeSummary(yesterdayItems);
    STATE.cashflow.loaded = true;
    STATE.cashflow.lastRefreshAt = Date.now();
  } catch (e) {
    STATE.cashflow.error = String(e?.message || e);
  } finally {
    STATE.cashflow.loading = false;
  }
}
