// Game finance endpoints used by cashflow.js. Requests are paced client-side (pagination can
// fire dozens in a row); the shared 429 cooldown is handled by src/data/apiClient.js.
import { request } from "./data/apiClient.js";
import { wait } from "./utils.js";

const RECENT_URL = "https://www.simcompanies.com/api/v2/companies/me/cashflow/recent/";
const PAGE_URL = (lastId) => `https://www.simcompanies.com/api/v2/companies/me/cashflow/${lastId}/`;
const PAST_FINANCES_URL = "https://www.simcompanies.com/api/v3/companies/me/past-finances/";
const OUTGOING_CONTRACTS_URL = "https://www.simcompanies.com/api/v3/contracts-outgoing/me/";

const REQUESTS_PER_SECOND = 4;
const MIN_REQUEST_GAP_MS = 250;

const inflightByUrl = new Map();
let schedulerTail = Promise.resolve();

const schedulerState = {
  tokens: REQUESTS_PER_SECOND,
  lastRefillAt: Date.now(),
  lastRequestAt: 0,
};

function refillTokens(ts) {
  const elapsed = ts - schedulerState.lastRefillAt;
  if (elapsed <= 0) return;

  const refill = (elapsed / 1000) * REQUESTS_PER_SECOND;
  schedulerState.tokens = Math.min(REQUESTS_PER_SECOND, schedulerState.tokens + refill);
  schedulerState.lastRefillAt = ts;
}

async function acquireRequestSlot() {
  while (true) {
    const ts = Date.now();
    refillTokens(ts);

    const hasToken = schedulerState.tokens >= 1;
    const gapOk = ts - schedulerState.lastRequestAt >= MIN_REQUEST_GAP_MS;

    if (hasToken && gapOk) {
      schedulerState.tokens -= 1;
      schedulerState.lastRequestAt = ts;
      return;
    }

    const needTokenMs = hasToken ? 0 : Math.ceil(((1 - schedulerState.tokens) / REQUESTS_PER_SECOND) * 1000);
    const needGapMs = gapOk ? 0 : MIN_REQUEST_GAP_MS - (ts - schedulerState.lastRequestAt);

    await wait(Math.max(needTokenMs, needGapMs, 25));
  }
}

/** Requests run one after another through a single queue. */
function enqueueScheduled(taskFn) {
  const p = schedulerTail.then(taskFn);
  schedulerTail = p.catch(() => {});
  return p;
}

/** Paced JSON GET; concurrent calls for the same URL share one request. */
function fetchJson(url) {
  if (inflightByUrl.has(url)) return inflightByUrl.get(url);

  const requestPromise = enqueueScheduled(async () => {
    await acquireRequestSlot();
    return request("cashflow", {
      url,
      credentials: "include",
      responseType: "json",
      retries: 1,
      retryDelayMs: 250,
    });
  }).finally(() => {
    inflightByUrl.delete(url);
  });

  inflightByUrl.set(url, requestPromise);
  return requestPromise;
}

/** Newest transactions page: `{ data: Transaction[], money?: number, oldestPulled?: boolean }`. */
export const fetchRecentCashflow = () => fetchJson(RECENT_URL);

/** Page of transactions older than `lastId`, same shape as fetchRecentCashflow(). */
export const fetchCashflowPage = (lastId) => fetchJson(PAGE_URL(lastId));

/** Daily balance-sheet snapshots. */
export const fetchPastFinances = () => fetchJson(PAST_FINANCES_URL);

export const fetchOutgoingContracts = () => fetchJson(OUTGOING_CONTRACTS_URL);
