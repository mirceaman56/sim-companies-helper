// Financials dashboard data: loads game finance endpoints (finance_api.js), keeps a persisted
// per-company/realm cache, tracks gap-free history coverage, and derives the dashboard model
// (finance_calc.js) into STATE.cashflow.finance.
import { ensureAuthContextCurrent } from "./auth_sync.js";
import { STATE } from "./state.js";
import { getRateLimitStatus } from "./data/apiClient.js";
import { storage } from "./data/storage.js";
import { resolveScopeSync } from "./data/scope.js";
import {
  fetchCashflowPage,
  fetchOutgoingContracts,
  fetchPastFinances,
  fetchRecentCashflow,
} from "./finance_api.js";
import {
  normalizeTransaction,
  mergeTransactions,
  getOldestTransactionMs,
  getBatchExtent,
  getPeriodBounds,
  getPreviousPeriodBounds,
} from "./finance_calc.js";
import { deriveFinanceModel } from "./finance_insights_calc.js";

const CASHFLOW_ACTIVE_TTL_MS = 60 * 1000;
const CASHFLOW_IDLE_TTL_MS = 5 * 60 * 1000;
const PAST_FINANCES_TTL_MS = 30 * 60 * 1000;
const OUTGOING_CONTRACTS_TTL_MS = 10 * 60 * 1000;
const STORAGE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const CASHFLOW_STORAGE_DOMAIN = "cashflow-finance";

const MAX_PAGINATION_PAGES_PER_RUN = 120;
// Persisted payload shape version. On a bump, also raise "cashflow-finance" in
// MIN_DOMAIN_VERSION (src/data/migrations.js) so old payloads are purged.
const STORAGE_VERSION = 3;
const FINANCE_PERIODS = ["current", "day", "week"];

// Scope whose cache is loaded (or loading) into STATE.cashflow.finance, and its read promise.
let hydration = { scopeKey: "", promise: null };

function nowMs() {
  return Date.now();
}

function getFinanceState() {
  return STATE.cashflow.finance;
}

function getCurrentFinanceScope() {
  const scoped = resolveScopeSync("scoped");
  return {
    key: scoped.scopeKey || "no-scope",
    companyId: scoped.companyId,
    realmId: scoped.realmId,
    hasScope: scoped.hasScope,
  };
}

const FINANCE_STORAGE = {
  domain: CASHFLOW_STORAGE_DOMAIN,
  version: STORAGE_VERSION,
  scope: "scoped",
  backend: "chrome",
  // Auth is resolved by refreshFinanceAuthContext() before any read or write.
  refreshAuth: false,
};

function buildFinancePayload(finance, scope) {
  return {
    scope: {
      companyId: scope.companyId,
      realmId: scope.realmId,
    },
    datasets: {
      transactions: finance.datasets.transactions || [],
      pastFinances: finance.datasets.pastFinances || [],
      outgoingContracts: finance.datasets.outgoingContracts || [],
    },
    cache: finance.cache,
    meta: {
      cashBalance: finance.meta.cashBalance,
      lastRefreshAt: finance.meta.lastRefreshAt,
    },
    ui: {
      selectedPeriod: finance.selectedPeriod,
      uiMode: finance.uiMode,
    },
  };
}

function resetFinanceRuntime(finance) {
  hydration = { scopeKey: "", promise: null };
  finance.datasets.transactions = [];
  finance.datasets.pastFinances = [];
  finance.datasets.outgoingContracts = [];

  finance.coverage = {
    startMs: 0,
    endMs: 0,
    partial: false,
  };

  finance.derived = {
    period: null,
    previousPeriod: null,
    kpis: null,
    pnl: null,
    cashMovement: null,
    balanceSheet: null,
    ratios: [],
    drivers: null,
    salesMix: [],
    inventoryProduction: null,
    workforce: null,
    alerts: [],
    recentTransactions: [],
  };

  finance.meta.error = null;
  finance.meta.lastRefreshAt = 0;
  finance.meta.rateLimitedUntil = 0;
  finance.meta.partialReason = "";
  finance.meta.cashBalance = null;
  finance.meta.loading = false;

  finance.cache = {
    oldestPulled: false,
    pagesLoaded: 0,
    transactionsFetchedUntilMs: 0,
    coverageFloorMs: 0,
    coverageFloorId: null,
    coverageTopMs: 0,
    lastTxFetchAt: 0,
    lastPastFinancesAt: 0,
    lastOutgoingContractsAt: 0,
  };
}

function normalizeFinancePeriod(period) {
  if (FINANCE_PERIODS.includes(period)) return period;
  if (period === "month") return "week"; // legacy downgrade: month removed to protect API/storage
  return "current";
}

function parsePastFinanceDateMs(dateStr) {
  const direct = Date.parse(dateStr);
  if (Number.isFinite(direct)) return direct;

  if (typeof dateStr !== "string") return NaN;

  const normalized = dateStr.replace(" ", "T").replace(/\.(\d{3})\d+([+-]\d{2}:\d{2})$/, ".$1$2");

  const fallback = Date.parse(normalized);
  return Number.isFinite(fallback) ? fallback : NaN;
}

function applyStorageRetention(finance, { now = nowMs() } = {}) {
  if (!finance?.datasets) return;

  const cutoff = now - STORAGE_RETENTION_MS;

  const transactions = Array.isArray(finance.datasets.transactions) ? finance.datasets.transactions : [];
  const txBefore = transactions.length;
  finance.datasets.transactions = transactions.filter((tx) => Number(tx?._dtMs) >= cutoff);
  const txAfter = finance.datasets.transactions.length;

  const past = Array.isArray(finance.datasets.pastFinances) ? finance.datasets.pastFinances : [];
  finance.datasets.pastFinances = past.filter((row) => parsePastFinanceDateMs(row?.date) >= cutoff);

  if (txAfter < txBefore) {
    finance.cache.oldestPulled = false;
  }

  const oldest = getOldestTransactionMs(finance.datasets.transactions);
  finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldest) ? oldest : 0;

  if (Number(finance.cache.coverageFloorMs || 0) > 0 && finance.cache.coverageFloorMs < cutoff) {
    finance.cache.coverageFloorMs = cutoff;
    finance.cache.coverageFloorId = null;
  }
}

/** Drop cached payloads of companies/realms not opened within the retention window. Runs per hydration. */
async function cleanupStaleFinanceCaches() {
  const cutoff = nowMs() - STORAGE_RETENTION_MS;
  const prefix = storage.buildStorageKey({ ...FINANCE_STORAGE, scopeKey: "" });
  for (const { key, value } of await storage.listByPrefix({ backend: "chrome", prefix })) {
    const ts = Number(value?.ts || 0);
    if (!Number.isFinite(ts) || ts < cutoff) await storage.removeRaw("chrome", key);
  }
}

async function saveFinanceCache() {
  const finance = getFinanceState();
  const scope = getCurrentFinanceScope();
  if (!scope.hasScope || hydration.scopeKey !== scope.key) return;
  applyStorageRetention(finance);
  await storage.set({ ...FINANCE_STORAGE, data: buildFinancePayload(finance, scope) });
}

/**
 * Load the persisted cache of the active company/realm into STATE once per scope.
 * Concurrent callers share the same read.
 */
function hydrateFinanceCache() {
  const scope = getCurrentFinanceScope();
  if (!scope.hasScope) return Promise.resolve();
  if (hydration.scopeKey === scope.key) return hydration.promise;

  const finance = getFinanceState();
  resetFinanceRuntime(finance);
  const promise = readFinanceCache(finance).catch((error) => {
    console.warn("[SimHelper] Finance cache read failed:", error);
  });
  hydration = { scopeKey: scope.key, promise };
  return promise;
}

async function readFinanceCache(finance) {
  await cleanupStaleFinanceCaches();
  const parsed = await storage.get(FINANCE_STORAGE);
  if (!parsed) return;

  finance.datasets.transactions = Array.isArray(parsed?.datasets?.transactions)
    ? parsed.datasets.transactions.map(normalizeTransaction).filter((x) => Number.isFinite(x._dtMs))
    : [];
  finance.datasets.pastFinances = Array.isArray(parsed?.datasets?.pastFinances)
    ? parsed.datasets.pastFinances
    : [];
  finance.datasets.outgoingContracts = Array.isArray(parsed?.datasets?.outgoingContracts)
    ? parsed.datasets.outgoingContracts
    : [];

  finance.cache = {
    ...finance.cache,
    ...(parsed?.cache || {}),
  };

  finance.meta.cashBalance = Number.isFinite(parsed?.meta?.cashBalance) ? parsed.meta.cashBalance : null;
  finance.meta.lastRefreshAt = Number.isFinite(parsed?.meta?.lastRefreshAt) ? parsed.meta.lastRefreshAt : 0;

  finance.selectedPeriod = normalizeFinancePeriod(parsed?.ui?.selectedPeriod);

  if (["compact", "expanded"].includes(parsed?.ui?.uiMode)) {
    finance.uiMode = parsed.ui.uiMode;
  }

  applyStorageRetention(finance);

  const oldest = getOldestTransactionMs(finance.datasets.transactions);
  finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldest) ? oldest : 0;
}

// why: a /recent/ batch is contiguous back to its oldest entry. If it does not reach the last
// verified coverage top there is a gap, so the deeper floor is untrusted: reset to this batch.
function extendCoverageFromRecentBatch(finance, rawItems, atMs = nowMs()) {
  const { oldest, newest } = getBatchExtent(rawItems);
  if (!oldest || !newest) return;

  const topMs = Number(finance.cache.coverageTopMs || 0);
  const floorMs = Number(finance.cache.coverageFloorMs || 0);
  const reachesOldTop = topMs > 0 && oldest._dtMs <= topMs;

  if (reachesOldTop && floorMs > 0) {
    finance.cache.coverageFloorMs = Math.min(floorMs, oldest._dtMs);
    finance.cache.coverageFloorId = oldest._dtMs <= floorMs ? oldest.id : finance.cache.coverageFloorId;
  } else {
    finance.cache.coverageFloorMs = oldest._dtMs;
    finance.cache.coverageFloorId = oldest.id;
  }

  finance.cache.coverageTopMs = Math.max(topMs, newest._dtMs, atMs);
}

function recomputeDerived(period) {
  const finance = getFinanceState();
  const { derived, coverage } = deriveFinanceModel({
    transactions: finance.datasets.transactions,
    pastFinances: finance.datasets.pastFinances,
    outgoingContracts: finance.datasets.outgoingContracts,
    cashBalance: finance.meta.cashBalance,
    coverageFloorMs: finance.cache.coverageFloorMs,
    period,
  });
  finance.derived = derived;
  finance.coverage = coverage;
  finance.meta.partialReason = coverage.partial ? "coverage" : "";
}

function markRateLimitFromError(error) {
  const rateLimited = error?.code === "RATE_LIMIT_COOLDOWN" || error?.rateLimited === true;
  if (rateLimited) syncRateLimitMeta();
  return rateLimited;
}

/** Mirror the shared game-API cooldown (src/data/apiClient.js) into finance meta for rendering. */
function syncRateLimitMeta() {
  getFinanceState().meta.rateLimitedUntil = getRateLimitStatus().blockedUntil;
}

async function refreshFinanceAuthContext() {
  // The /me/ endpoints answer for the company the game has active, so the cache
  // scope must match it. Auth is re-fetched only when missing or when the
  // company changed (see auth_sync.js) — not on a timer.
  await ensureAuthContextCurrent();
}

async function refreshRecentTransactions({ force = false } = {}) {
  const finance = getFinanceState();
  const now = nowMs();

  const ttl = finance.uiMode === "expanded" ? CASHFLOW_ACTIVE_TTL_MS : CASHFLOW_IDLE_TTL_MS;
  const stale = now - Number(finance.cache.lastTxFetchAt || 0) > ttl;

  if (
    !force &&
    !stale &&
    Array.isArray(finance.datasets.transactions) &&
    finance.datasets.transactions.length > 0
  ) {
    return;
  }

  try {
    const json = await fetchRecentCashflow();
    const data = Array.isArray(json?.data) ? json.data : [];

    finance.datasets.transactions = mergeTransactions(finance.datasets.transactions, data);
    finance.cache.lastTxFetchAt = nowMs();
    finance.cache.pagesLoaded = Math.max(1, Number(finance.cache.pagesLoaded || 0));
    extendCoverageFromRecentBatch(finance, data, finance.cache.lastTxFetchAt);

    if (json?.oldestPulled === true) {
      finance.cache.oldestPulled = true;
    }

    const oldest = getOldestTransactionMs(finance.datasets.transactions);
    finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldest) ? oldest : 0;

    if (Number.isFinite(json?.money)) {
      finance.meta.cashBalance = Number(json.money);
    }
  } catch (e) {
    const rateLimited = markRateLimitFromError(e);
    if (!rateLimited && (!finance.datasets.transactions || finance.datasets.transactions.length === 0)) {
      throw e;
    }
  }
}

export async function ensureFinanceCoverage(startMs) {
  await refreshFinanceAuthContext();
  await hydrateFinanceCache();

  const finance = getFinanceState();

  if (!Number.isFinite(startMs)) {
    return { partial: false };
  }

  // why: judge coverage by the verified gap-free floor; the oldest stored transaction may be
  // disjoint data from before a session gap (see extendCoverageFromRecentBatch).
  let floorMs = Number(finance.cache.coverageFloorMs || 0);

  if (floorMs > 0 && floorMs <= startMs) {
    return { partial: false };
  }

  if (finance.cache.oldestPulled) {
    return { partial: floorMs > 0 ? floorMs > startMs : true };
  }

  let pages = 0;

  while ((!(floorMs > 0) || floorMs > startMs) && !finance.cache.oldestPulled) {
    if (pages >= MAX_PAGINATION_PAGES_PER_RUN) {
      break;
    }

    const cursorId = Number.isFinite(finance.cache.coverageFloorId)
      ? Number(finance.cache.coverageFloorId)
      : Number(finance.datasets.transactions[finance.datasets.transactions.length - 1]?.id);

    if (!Number.isFinite(cursorId)) {
      break;
    }

    pages += 1;

    try {
      const json = await fetchCashflowPage(cursorId);
      const data = Array.isArray(json?.data) ? json.data : [];

      finance.datasets.transactions = mergeTransactions(finance.datasets.transactions, data);
      finance.cache.pagesLoaded += 1;
      finance.cache.lastTxFetchAt = nowMs();

      if (json?.oldestPulled === true || data.length === 0) {
        finance.cache.oldestPulled = true;
      } else {
        // Fetched via cursor pagination from the verified floor, so this
        // page is by definition a contiguous continuation — safe to extend
        // the floor to its oldest entry.
        const { oldest } = getBatchExtent(data);
        if (oldest) {
          finance.cache.coverageFloorMs = oldest._dtMs;
          finance.cache.coverageFloorId = oldest.id;
        }
      }

      const oldest = getOldestTransactionMs(finance.datasets.transactions);
      finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldest) ? oldest : 0;
      floorMs = Number(finance.cache.coverageFloorMs || 0);
    } catch (e) {
      markRateLimitFromError(e);
      break;
    }
  }

  floorMs = Number(finance.cache.coverageFloorMs || 0);
  const partial = !(floorMs > 0) || floorMs > startMs;

  return { partial };
}

async function refreshPastFinances({ force = false } = {}) {
  const finance = getFinanceState();
  const stale = nowMs() - Number(finance.cache.lastPastFinancesAt || 0) > PAST_FINANCES_TTL_MS;

  if (
    !force &&
    !stale &&
    Array.isArray(finance.datasets.pastFinances) &&
    finance.datasets.pastFinances.length > 0
  ) {
    return;
  }

  try {
    const json = await fetchPastFinances();
    const rows = Array.isArray(json) ? json : [];

    finance.datasets.pastFinances = rows;
    finance.cache.lastPastFinancesAt = nowMs();
  } catch (e) {
    const rateLimited = markRateLimitFromError(e);
    if (!rateLimited && (!finance.datasets.pastFinances || finance.datasets.pastFinances.length === 0)) {
      throw e;
    }
  }
}

async function refreshOutgoingContracts({ force = false } = {}) {
  const finance = getFinanceState();
  const stale = nowMs() - Number(finance.cache.lastOutgoingContractsAt || 0) > OUTGOING_CONTRACTS_TTL_MS;

  if (
    !force &&
    !stale &&
    Array.isArray(finance.datasets.outgoingContracts) &&
    finance.datasets.outgoingContracts.length > 0
  ) {
    return;
  }

  try {
    const json = await fetchOutgoingContracts();
    finance.datasets.outgoingContracts = Array.isArray(json) ? json : [];
    finance.cache.lastOutgoingContractsAt = nowMs();
  } catch (e) {
    const rateLimited = markRateLimitFromError(e);
    if (
      !rateLimited &&
      (!finance.datasets.outgoingContracts || finance.datasets.outgoingContracts.length === 0)
    ) {
      throw e;
    }
  }
}

export function setFinancePeriod(period) {
  const finance = getFinanceState();
  if (period == null) return;
  finance.selectedPeriod = normalizeFinancePeriod(period);
  void saveFinanceCache();
}

export function setFinanceUiMode(mode) {
  const finance = getFinanceState();
  if (["compact", "expanded"].includes(mode)) {
    finance.uiMode = mode;
    void saveFinanceCache();
  }
}

/**
 * Load (or refresh with force) everything the finance dashboard shows for the selected period.
 * Concurrent calls while a load runs return immediately.
 * @param {{ period?: string, force?: boolean }} [options]
 */
export async function loadFinanceData({ period, force = false } = {}) {
  await refreshFinanceAuthContext();
  await hydrateFinanceCache();

  const finance = getFinanceState();
  const selectedPeriod = period || finance.selectedPeriod || "current";
  finance.selectedPeriod = normalizeFinancePeriod(selectedPeriod);

  if (finance.meta.loading) return;

  finance.meta.loading = true;
  finance.meta.error = null;
  syncRateLimitMeta();

  STATE.cashflow.loading = true;
  STATE.cashflow.error = null;

  try {
    await refreshRecentTransactions({ force });
    await refreshPastFinances({ force });
    await refreshOutgoingContracts({ force });

    const bounds = getPeriodBounds(finance.selectedPeriod);
    const previous = getPreviousPeriodBounds(bounds);
    const requiredStart = Math.min(bounds.startMs, previous.startMs);

    const coverage = await ensureFinanceCoverage(requiredStart);
    recomputeDerived(finance.selectedPeriod);

    finance.coverage.partial = Boolean(coverage?.partial || finance.coverage.partial);
    finance.meta.lastRefreshAt = nowMs();
    syncRateLimitMeta();

    STATE.cashflow.loaded = true;
    STATE.cashflow.lastRefreshAt = finance.meta.lastRefreshAt;
  } catch (e) {
    const msg = String(e?.message || e);
    finance.meta.error = msg;
    STATE.cashflow.error = msg;

    if (Array.isArray(finance.datasets.transactions) && finance.datasets.transactions.length > 0) {
      recomputeDerived(finance.selectedPeriod);
      STATE.cashflow.loaded = true;
    } else {
      STATE.cashflow.loaded = false;
      throw e;
    }
  } finally {
    finance.meta.loading = false;
    STATE.cashflow.loading = false;
    STATE.cashflow.error = finance.meta.error;
    STATE.cashflow.lastRefreshAt = finance.meta.lastRefreshAt || STATE.cashflow.lastRefreshAt;

    await saveFinanceCache();
  }
}

export const _testUtils = {
  normalizeFinancePeriod,
  applyStorageRetention,
  getCurrentFinanceScope,
  hydrateFinanceCache,
  resetFinanceRuntime,
  extendCoverageFromRecentBatch,
  getBatchExtent,
};
