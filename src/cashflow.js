// cashflow.js
import recipesData from "./resources/recipes.json";
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";

const RECENT_URL = "https://www.simcompanies.com/api/v2/companies/me/cashflow/recent/";
const PAGE_URL = (lastId) => `https://www.simcompanies.com/api/v2/companies/me/cashflow/${lastId}/`;
const PAST_FINANCES_URL = "https://www.simcompanies.com/api/v3/companies/me/past-finances/";
const OUTGOING_CONTRACTS_URL = "https://www.simcompanies.com/api/v3/contracts-outgoing/me/";

const REQUESTS_PER_SECOND = 4;
const MIN_REQUEST_GAP_MS = 250;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

const CASHFLOW_ACTIVE_TTL_MS = 60 * 1000;
const CASHFLOW_IDLE_TTL_MS = 5 * 60 * 1000;
const PAST_FINANCES_TTL_MS = 30 * 60 * 1000;
const OUTGOING_CONTRACTS_TTL_MS = 10 * 60 * 1000;
const AUTH_REFRESH_TTL_MS = 30 * 1000;
const STORAGE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

const MAX_PAGINATION_PAGES_PER_RUN = 120;
const STORAGE_VERSION = 2;
const FINANCE_PERIODS = ["current", "day", "week"];

const inflightByUrl = new Map();
let schedulerTail = Promise.resolve();

const schedulerState = {
  tokens: REQUESTS_PER_SECOND,
  lastRefillAt: Date.now(),
  lastRequestAt: 0,
  rateLimitedUntil: 0,
};

let hydratedFinanceScopeKey = "";
let lastFinanceAuthRefreshAt = 0;

const recipes = Array.isArray(recipesData) ? recipesData : [];
const RESOURCE_NAME_BY_KIND = new Map(recipes.map((r) => [Number(r.id), String(r.name || r.id)]));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
}

function refillTokens(ts) {
  const elapsed = ts - schedulerState.lastRefillAt;
  if (elapsed <= 0) return;

  const refill = (elapsed / 1000) * REQUESTS_PER_SECOND;
  schedulerState.tokens = Math.min(REQUESTS_PER_SECOND, schedulerState.tokens + refill);
  schedulerState.lastRefillAt = ts;
}

async function acquireRequestSlot() {
  while (true) {
    const ts = nowMs();

    if (ts < schedulerState.rateLimitedUntil) {
      const remainSec = Math.ceil((schedulerState.rateLimitedUntil - ts) / 1000);
      throw new Error(`RATE_LIMIT_COOLDOWN:${remainSec}`);
    }

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

function enqueueScheduled(taskFn) {
  const p = schedulerTail.then(taskFn);
  schedulerTail = p.catch(() => {});
  return p;
}

async function fetchJson(url) {
  if (inflightByUrl.has(url)) {
    return inflightByUrl.get(url);
  }

  const requestPromise = enqueueScheduled(async () => {
    await acquireRequestSlot();

    const res = await fetch(url, { credentials: "include" });

    if (res.status === 429) {
      schedulerState.rateLimitedUntil = nowMs() + RATE_LIMIT_COOLDOWN_MS;
      throw new Error("RATE_LIMIT_429");
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  }).finally(() => {
    inflightByUrl.delete(url);
  });

  inflightByUrl.set(url, requestPromise);
  return requestPromise;
}

function getFinanceState() {
  return STATE.cashflow.finance;
}

function getCurrentFinanceScope() {
  const companyId = Number(STATE.auth?.companyId);
  const realmId = Number(STATE.auth?.realmId);

  const hasCompany = Number.isFinite(companyId);
  const hasRealm = Number.isFinite(realmId);

  if (hasCompany && hasRealm) {
    return {
      key: `${companyId}-${realmId}`,
      companyId,
      realmId,
    };
  }

  if (hasCompany) {
    return {
      key: `${companyId}-realm-unknown`,
      companyId,
      realmId: null,
    };
  }

  if (hasRealm) {
    return {
      key: `anon-${realmId}`,
      companyId: null,
      realmId,
    };
  }

  return {
    key: "anon",
    companyId: null,
    realmId: null,
  };
}

function getFinanceStorageKey(scopeKey = getCurrentFinanceScope().key) {
  return `scx-finance-cache-${scopeKey}`;
}

function resetFinanceRuntime(finance) {
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
    lastTxFetchAt: 0,
    lastPastFinancesAt: 0,
    lastOutgoingContractsAt: 0,
  };
}

function isScopeCompatible(parsedScope, currentScope) {
  if (!parsedScope || typeof parsedScope !== "object") return true;

  const parsedCompanyId = Number(parsedScope.companyId);
  const parsedRealmId = Number(parsedScope.realmId);

  if (Number.isFinite(parsedCompanyId) && Number.isFinite(currentScope.companyId)) {
    if (parsedCompanyId !== currentScope.companyId) return false;
  }

  if (Number.isFinite(parsedRealmId) && Number.isFinite(currentScope.realmId)) {
    if (parsedRealmId !== currentScope.realmId) return false;
  }

  return true;
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
}

function cleanupStaleFinanceCaches() {
  try {
    const cutoff = nowMs() - STORAGE_RETENTION_MS;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("scx-finance-cache-")) continue;

      const raw = localStorage.getItem(key);
      if (!raw) {
        localStorage.removeItem(key);
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        localStorage.removeItem(key);
        continue;
      }

      const payloadVersion = Number(parsed?.v);
      if (!Number.isFinite(payloadVersion) || payloadVersion < STORAGE_VERSION) {
        localStorage.removeItem(key);
        continue;
      }

      const ts = Number(parsed?.ts || 0);
      if (!Number.isFinite(ts) || ts < cutoff) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

function saveFinanceCache() {
  const finance = getFinanceState();
  const scope = getCurrentFinanceScope();
  applyStorageRetention(finance);
  const payload = {
    v: STORAGE_VERSION,
    ts: nowMs(),
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
      rateLimitedUntil: finance.meta.rateLimitedUntil,
      lastRefreshAt: finance.meta.lastRefreshAt,
    },
    ui: {
      selectedPeriod: finance.selectedPeriod,
      uiMode: finance.uiMode,
    },
  };

  try {
    localStorage.setItem(getFinanceStorageKey(scope.key), JSON.stringify(payload));
  } catch {}
}

function hydrateFinanceCache() {
  const scope = getCurrentFinanceScope();
  if (hydratedFinanceScopeKey === scope.key) return;
  hydratedFinanceScopeKey = scope.key;
  const finance = getFinanceState();
  resetFinanceRuntime(finance);

  try {
    cleanupStaleFinanceCaches();

    const raw = localStorage.getItem(getFinanceStorageKey(scope.key));
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== STORAGE_VERSION) return;
    if (!isScopeCompatible(parsed.scope, scope)) return;

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
    finance.meta.rateLimitedUntil = Number.isFinite(parsed?.meta?.rateLimitedUntil)
      ? parsed.meta.rateLimitedUntil
      : 0;

    finance.selectedPeriod = normalizeFinancePeriod(parsed?.ui?.selectedPeriod);

    if (["compact", "expanded"].includes(parsed?.ui?.uiMode)) {
      finance.uiMode = parsed.ui.uiMode;
    }

    applyStorageRetention(finance);

    const oldest = getOldestTransactionMs(finance.datasets.transactions);
    finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldest) ? oldest : 0;
  } catch {}
}

function parseDtMs(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

function normalizeTransaction(tx) {
  const dtMs = parseDtMs(tx?.datetime);
  return {
    ...tx,
    id: Number(tx?.id),
    money: Number(tx?.money || 0),
    _dtMs: dtMs,
  };
}

function mergeTransactions(existing, incoming) {
  const byId = new Map();

  for (const tx of existing || []) {
    if (!Number.isFinite(tx?.id)) continue;
    byId.set(tx.id, tx);
  }

  for (const raw of incoming || []) {
    const tx = normalizeTransaction(raw);
    if (!Number.isFinite(tx?.id) || !Number.isFinite(tx?._dtMs)) continue;

    const prev = byId.get(tx.id);
    if (!prev || tx._dtMs >= prev._dtMs) {
      byId.set(tx.id, tx);
    }
  }

  return [...byId.values()].sort((a, b) => b._dtMs - a._dtMs);
}

function getOldestTransactionMs(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return NaN;
  const last = transactions[transactions.length - 1];
  return Number.isFinite(last?._dtMs) ? last._dtMs : NaN;
}

function getNewestTransactionMs(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return NaN;
  const first = transactions[0];
  return Number.isFinite(first?._dtMs) ? first._dtMs : NaN;
}

function startOfTodayLocalMs(baseMs = nowMs()) {
  const d = new Date(baseMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfYesterdayLocalMs(baseMs = nowMs()) {
  return startOfTodayLocalMs(baseMs) - 24 * 60 * 60 * 1000;
}

function isTodayLocal(dtStr, baseMs = nowMs()) {
  const ms = parseDtMs(dtStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= startOfTodayLocalMs(baseMs);
}

function isYesterdayLocal(dtStr, baseMs = nowMs()) {
  const ms = parseDtMs(dtStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= startOfYesterdayLocalMs(baseMs) && ms < startOfTodayLocalMs(baseMs);
}

function computeSummary(items) {
  let totalIncome = 0;
  let totalExpense = 0;

  const incomeByType = { s: 0, m: 0, t: 0, other: 0 };
  const expenseByType = {
    p: 0,
    w: 0,
    m: 0,
    t: 0,
    f: 0,
    c: 0,
    A: 0,
    r: 0,
    h: 0,
    i: 0,
    e: 0,
    other: 0,
  };

  for (const it of items || []) {
    const m = Number(it?.money || 0);
    const cat = String(it?.category || "");

    if (m > 0) {
      totalIncome += m;
      if (["s", "m", "t"].includes(cat)) {
        incomeByType[cat] += m;
      } else {
        incomeByType.other += m;
      }
    } else if (m < 0) {
      const absM = Math.abs(m);
      totalExpense += absM;
      if (Object.prototype.hasOwnProperty.call(expenseByType, cat)) {
        expenseByType[cat] += absM;
      } else {
        expenseByType.other += absM;
      }
    }
  }

  return {
    totalIncome,
    totalExpense,
    incomeByType,
    expenseByType,
  };
}

function parseProductKind(tx) {
  const key = String(tx?.descriptionKey || "");
  const patterns = [/^production-(\d+)/, /^cs-(\d+)-/, /^cr-(\d+)-/, /^marketbuy-(\d+)/, /^marketsell-(\d+)/];

  for (const p of patterns) {
    const m = key.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

function classifyTransaction(tx) {
  const money = Number(tx?.money || 0);
  const category = String(tx?.category || "");
  const description = String(tx?.description || "").toLowerCase();
  const descriptionKey = String(tx?.descriptionKey || "").toLowerCase();

  const isIncome = money > 0;
  const isExpense = money < 0;

  const isContractSale =
    isIncome &&
    (descriptionKey.startsWith("cs-") ||
      (description.includes("contract signed by") && !descriptionKey.startsWith("cr-")));
  const isContractInbound =
    isExpense && (descriptionKey.startsWith("cr-") || description.includes("contract from"));

  const isMarketBuy =
    isExpense && (descriptionKey.startsWith("marketbuy-") || description.includes("bought "));
  const isMarketSell =
    isIncome && (descriptionKey.startsWith("marketsell-") || description.includes("sold "));
  const isRetailSale = isIncome && category === "s";

  const isExecutiveSalary =
    isExpense && category === "e" && (descriptionKey.includes("salar") || description.includes("salar"));
  const isExecutiveRoyalty =
    isIncome && category === "e" && (descriptionKey.includes("royalt") || description.includes("royalt"));

  const isProduction = isExpense && category === "p";
  const isWages = isExpense && (category === "w" || isExecutiveSalary);
  const isTraining = isExpense && category === "h";
  const isFees = isExpense && category === "f";
  const isAccounting = isExpense && category === "A";
  const isResearch = isExpense && category === "r";
  const isConstruction = isExpense && category === "c";

  const isRevenue = isIncome && (isRetailSale || isContractSale || isMarketSell);

  const isDirectCost = isExpense && (isProduction || isMarketBuy || isContractInbound);
  const isOverhead =
    isExpense && (isWages || isTraining || isFees || isAccounting || isResearch || isConstruction);

  let revenueChannel = "other";
  if (isRetailSale) revenueChannel = "retail";
  else if (isContractSale) revenueChannel = "contracts";
  else if (isMarketSell) revenueChannel = "market";

  let expenseBucket = "other";
  if (isProduction) expenseBucket = "production";
  else if (isMarketBuy) expenseBucket = "marketBuy";
  else if (isContractInbound) expenseBucket = "inboundContracts";
  else if (isWages) expenseBucket = "wages";
  else if (isTraining) expenseBucket = "training";
  else if (isFees) expenseBucket = "fees";
  else if (isAccounting) expenseBucket = "accounting";
  else if (isResearch) expenseBucket = "research";
  else if (isConstruction) expenseBucket = "construction";

  const productKind = parseProductKind(tx);

  const driverKey = descriptionKey || `${category}:${String(tx?.description || "").slice(0, 48)}`;
  const driverLabel = String(tx?.description || tx?.descriptionKey || category || "Unknown");

  return {
    money,
    category,
    isIncome,
    isExpense,
    isRevenue,
    isDirectCost,
    isOverhead,
    isContractSale,
    isContractInbound,
    isMarketBuy,
    isMarketSell,
    isRetailSale,
    isExecutiveSalary,
    isExecutiveRoyalty,
    isProduction,
    isWages,
    isTraining,
    isFees,
    isAccounting,
    isResearch,
    isConstruction,
    revenueChannel,
    expenseBucket,
    productKind,
    driverKey,
    driverLabel,
  };
}

function safePctChange(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function makeDelta(curr, prev) {
  const delta = curr - prev;
  return {
    current: curr,
    previous: prev,
    delta,
    pct: safePctChange(curr, prev),
  };
}

function getPeriodBounds(period, baseMs = nowMs()) {
  const endMs = baseMs;

  if (period === "current") {
    return {
      period,
      startMs: startOfTodayLocalMs(baseMs),
      endMs,
    };
  }

  if (period === "day") {
    return {
      period,
      startMs: baseMs - 24 * 60 * 60 * 1000,
      endMs,
    };
  }

  if (period === "week") {
    return {
      period,
      startMs: baseMs - 7 * 24 * 60 * 60 * 1000,
      endMs,
    };
  }

  return {
    period: "week",
    startMs: baseMs - 7 * 24 * 60 * 60 * 1000,
    endMs,
  };
}

function getPreviousPeriodBounds(bounds) {
  const duration = Math.max(0, bounds.endMs - bounds.startMs);
  const endMs = bounds.startMs;
  const startMs = endMs - duration;

  return {
    period: `${bounds.period}:prev`,
    startMs,
    endMs,
  };
}

function filterTransactionsForPeriod(transactions, bounds) {
  return (transactions || []).filter((tx) => tx._dtMs >= bounds.startMs && tx._dtMs < bounds.endMs);
}

function aggregatePeriodMetrics(items) {
  const totals = {
    inflows: 0,
    outflows: 0,
    cashChange: 0,
    revenue: 0,
    directCosts: 0,
    overhead: 0,
    transactionCount: 0,

    revenueByChannel: {
      retail: 0,
      contracts: 0,
      market: 0,
      other: 0,
    },

    expensesByBucket: {
      production: 0,
      marketBuy: 0,
      inboundContracts: 0,
      wages: 0,
      training: 0,
      fees: 0,
      accounting: 0,
      research: 0,
      construction: 0,
      other: 0,
    },

    productRevenue: {},

    production: {
      spend: 0,
      txCount: 0,
      volume: 0,
    },

    workforce: {
      wages: 0,
      training: 0,
      accounting: 0,
      leadership: 0,
      total: 0,
    },

    driverTotals: {},
  };

  for (const tx of items || []) {
    const cls = classifyTransaction(tx);
    const money = cls.money;
    const absMoney = Math.abs(money);

    totals.transactionCount += 1;
    totals.cashChange += money;

    if (money > 0) {
      totals.inflows += money;
    } else if (money < 0) {
      totals.outflows += absMoney;
    }

    if (cls.isRevenue) {
      totals.revenue += money;
      totals.revenueByChannel[cls.revenueChannel] += money;
    }

    if (cls.isDirectCost) {
      totals.directCosts += absMoney;
      totals.expensesByBucket[cls.expenseBucket] += absMoney;
    } else if (cls.isExpense) {
      totals.expensesByBucket[cls.expenseBucket] += absMoney;
    }

    if (cls.isOverhead) {
      totals.overhead += absMoney;
    }

    if (cls.isProduction) {
      totals.production.spend += absMoney;
      totals.production.txCount += 1;
      const amount = Number(tx?.details?.amount || 0);
      if (Number.isFinite(amount)) {
        totals.production.volume += amount;
      }
    }

    if (cls.isWages) {
      totals.workforce.wages += absMoney;
    }
    if (cls.isExecutiveSalary) {
      totals.workforce.leadership += absMoney;
    }
    if (cls.isTraining) {
      totals.workforce.training += absMoney;
      totals.workforce.leadership += absMoney;
    }
    if (cls.isAccounting) {
      totals.workforce.accounting += absMoney;
      totals.workforce.leadership += absMoney;
    }

    if (cls.productKind && cls.isRevenue) {
      totals.productRevenue[cls.productKind] = (totals.productRevenue[cls.productKind] || 0) + money;
    }

    const existingDriver = totals.driverTotals[cls.driverKey] || {
      key: cls.driverKey,
      label: cls.driverLabel,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    };

    if (money > 0) {
      existingDriver.income += money;
    } else if (money < 0) {
      existingDriver.expense += absMoney;
    }

    existingDriver.net += money;
    existingDriver.count += 1;

    totals.driverTotals[cls.driverKey] = existingDriver;
  }

  totals.workforce.total = totals.workforce.wages + totals.workforce.training + totals.workforce.accounting;

  totals.grossProfit = totals.revenue - totals.directCosts;
  totals.operatingProfit = totals.grossProfit - totals.overhead;
  totals.netProfit = totals.cashChange;
  totals.nonOperating = totals.netProfit - totals.operatingProfit;

  return totals;
}

function buildSalesMix(agg) {
  const entries = Object.entries(agg.productRevenue || {})
    .map(([kindStr, revenue]) => {
      const kind = Number(kindStr);
      return {
        kind,
        name: RESOURCE_NAME_BY_KIND.get(kind) || `#${kind}`,
        revenue,
      };
    })
    .filter((x) => x.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = entries.reduce((acc, x) => acc + x.revenue, 0);

  return entries.slice(0, 8).map((x) => ({
    ...x,
    share: totalRevenue > 0 ? (x.revenue / totalRevenue) * 100 : 0,
  }));
}

function buildDrivers(currentAgg, previousAgg) {
  const currentDrivers = Object.values(currentAgg.driverTotals || {});
  const previousByKey = previousAgg.driverTotals || {};

  const income = [...currentDrivers]
    .sort((a, b) => b.income - a.income)
    .filter((x) => x.income > 0)
    .slice(0, 5);
  const expenses = [...currentDrivers]
    .sort((a, b) => b.expense - a.expense)
    .filter((x) => x.expense > 0)
    .slice(0, 5);

  const allKeys = new Set([
    ...Object.keys(currentAgg.driverTotals || {}),
    ...Object.keys(previousAgg.driverTotals || {}),
  ]);

  const changes = [...allKeys]
    .map((key) => {
      const curr = currentAgg.driverTotals[key] || {
        key,
        label: key,
        net: 0,
        income: 0,
        expense: 0,
        count: 0,
      };
      const prev = previousByKey[key] || { net: 0, income: 0, expense: 0, count: 0 };
      return {
        key,
        label: curr.label || prev.label || key,
        currentNet: curr.net || 0,
        previousNet: prev.net || 0,
        delta: (curr.net || 0) - (prev.net || 0),
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  return { income, expenses, changes };
}

function buildBalanceSheetSnapshot(pastFinances) {
  const rows = Array.isArray(pastFinances) ? pastFinances : [];
  const latest = rows[rows.length - 1] || null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;

  if (!latest) return null;

  return {
    latest,
    previous: prev,
    totalDelta: prev ? latest.total - prev.total : null,
    inventoryDelta: prev ? latest.inventory - prev.inventory : null,
    cashAndReceivablesDelta: prev ? latest.cashAndReceivables - prev.cashAndReceivables : null,
    liabilitiesDelta: prev ? latest.liabilities - prev.liabilities : null,
  };
}

function buildRatios(currentAgg, snapshot) {
  const revenue = currentAgg.revenue;
  const grossProfit = currentAgg.grossProfit;
  const operatingProfit = currentAgg.operatingProfit;
  const netProfit = currentAgg.netProfit;

  const bs = snapshot?.latest || null;
  const liabilitiesAbs = bs ? Math.abs(Number(bs.liabilities || 0)) : 0;
  const totalAssets = bs ? Number(bs.currentAssets || 0) + Number(bs.nonCurrentAssets || 0) : 0;

  return [
    {
      id: "grossMargin",
      value: revenue > 0 ? (grossProfit / revenue) * 100 : null,
    },
    {
      id: "operatingMargin",
      value: revenue > 0 ? (operatingProfit / revenue) * 100 : null,
    },
    {
      id: "netMargin",
      value: revenue > 0 ? (netProfit / revenue) * 100 : null,
    },
    {
      id: "currentRatio",
      value: bs && liabilitiesAbs > 0 ? Number(bs.currentAssets || 0) / liabilitiesAbs : null,
    },
    {
      id: "cashToInventory",
      value:
        bs && Number(bs.inventory || 0) > 0
          ? Number(bs.cashAndReceivables || 0) / Number(bs.inventory || 0)
          : null,
    },
    {
      id: "debtToAssets",
      value: bs && totalAssets > 0 ? liabilitiesAbs / totalAssets : null,
    },
  ];
}

function buildAlerts(currentAgg, snapshot, ratios) {
  const alerts = [];

  if (currentAgg.netProfit < 0) {
    alerts.push({
      id: "netNegative",
      severity: "danger",
      metric: "netProfit",
      value: currentAgg.netProfit,
    });
  }

  if (currentAgg.operatingProfit < 0) {
    alerts.push({
      id: "operatingNegative",
      severity: "warn",
      metric: "operatingProfit",
      value: currentAgg.operatingProfit,
    });
  }

  if (currentAgg.outflows > currentAgg.inflows && currentAgg.cashChange < 0) {
    alerts.push({
      id: "cashDrain",
      severity: "warn",
      metric: "cashChange",
      value: currentAgg.cashChange,
    });
  }

  const currentRatio = ratios.find((r) => r.id === "currentRatio")?.value;
  if (Number.isFinite(currentRatio) && currentRatio < 1) {
    alerts.push({
      id: "liquidityTight",
      severity: "danger",
      metric: "currentRatio",
      value: currentRatio,
    });
  }

  const inventory = Number(snapshot?.latest?.inventory || 0);
  if (inventory > 0 && currentAgg.revenue > 0 && inventory / currentAgg.revenue > 3) {
    alerts.push({
      id: "inventoryHigh",
      severity: "warn",
      metric: "inventoryToRevenue",
      value: inventory / currentAgg.revenue,
    });
  }

  const workforceShare =
    currentAgg.revenue > 0 ? currentAgg.workforce.total / currentAgg.revenue : Number.POSITIVE_INFINITY;
  if (Number.isFinite(workforceShare) && workforceShare > 0.35) {
    alerts.push({
      id: "workforceHigh",
      severity: "info",
      metric: "workforceShare",
      value: workforceShare,
    });
  }

  const severityRank = { danger: 3, warn: 2, info: 1 };
  return alerts.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]).slice(0, 6);
}

function makeKpis(currentAgg, previousAgg, cashBalance, snapshot) {
  const arEstimate =
    snapshot && Number.isFinite(cashBalance)
      ? Math.max(0, Number(snapshot.latest.cashAndReceivables || 0) - cashBalance)
      : null;

  const inventoryValue = snapshot ? Number(snapshot.latest.inventory || 0) : null;

  return [
    {
      id: "revenue",
      exactness: "derived",
      ...makeDelta(currentAgg.revenue, previousAgg.revenue),
    },
    {
      id: "grossProfit",
      exactness: "derived",
      ...makeDelta(currentAgg.grossProfit, previousAgg.grossProfit),
    },
    {
      id: "operatingProfit",
      exactness: "derived",
      ...makeDelta(currentAgg.operatingProfit, previousAgg.operatingProfit),
    },
    {
      id: "netProfit",
      exactness: "exact",
      ...makeDelta(currentAgg.netProfit, previousAgg.netProfit),
    },
    {
      id: "cashChange",
      exactness: "exact",
      ...makeDelta(currentAgg.cashChange, previousAgg.cashChange),
    },
    {
      id: "cashBalance",
      exactness: "exact",
      current: Number.isFinite(cashBalance) ? cashBalance : null,
      previous: null,
      delta: null,
      pct: null,
    },
    {
      id: "accountsReceivable",
      exactness: "estimated",
      current: Number.isFinite(arEstimate) ? arEstimate : null,
      previous: null,
      delta: null,
      pct: null,
    },
    {
      id: "inventory",
      exactness: "exact",
      current: Number.isFinite(inventoryValue) ? inventoryValue : null,
      previous: snapshot?.previous ? Number(snapshot.previous.inventory || 0) : null,
      delta: snapshot?.previous
        ? Number(snapshot.latest.inventory || 0) - Number(snapshot.previous.inventory || 0)
        : null,
      pct:
        snapshot?.previous && Number(snapshot.previous.inventory || 0) !== 0
          ? ((Number(snapshot.latest.inventory || 0) - Number(snapshot.previous.inventory || 0)) /
              Math.abs(Number(snapshot.previous.inventory || 0))) *
            100
          : null,
    },
  ];
}

function recomputeDerived(period) {
  const finance = getFinanceState();
  const transactions = finance.datasets.transactions || [];
  const pastFinances = finance.datasets.pastFinances || [];
  const outgoingContracts = finance.datasets.outgoingContracts || [];

  const bounds = getPeriodBounds(period);
  const prevBounds = getPreviousPeriodBounds(bounds);

  const currentItems = filterTransactionsForPeriod(transactions, bounds);
  const previousItems = filterTransactionsForPeriod(transactions, prevBounds);

  const currentAgg = aggregatePeriodMetrics(currentItems);
  const previousAgg = aggregatePeriodMetrics(previousItems);

  const snapshot = buildBalanceSheetSnapshot(pastFinances);
  const ratios = buildRatios(currentAgg, snapshot);
  const drivers = buildDrivers(currentAgg, previousAgg);
  const alerts = buildAlerts(currentAgg, snapshot, ratios);
  const salesMix = buildSalesMix(currentAgg);

  const cashBalance = finance.meta.cashBalance;

  finance.derived = {
    period: bounds,
    previousPeriod: prevBounds,
    kpis: makeKpis(currentAgg, previousAgg, cashBalance, snapshot),
    pnl: {
      revenue: makeDelta(currentAgg.revenue, previousAgg.revenue),
      directCosts: makeDelta(currentAgg.directCosts, previousAgg.directCosts),
      grossProfit: makeDelta(currentAgg.grossProfit, previousAgg.grossProfit),
      overhead: makeDelta(currentAgg.overhead, previousAgg.overhead),
      operatingProfit: makeDelta(currentAgg.operatingProfit, previousAgg.operatingProfit),
      nonOperating: makeDelta(currentAgg.nonOperating, previousAgg.nonOperating),
      netProfit: makeDelta(currentAgg.netProfit, previousAgg.netProfit),
      revenueByChannel: currentAgg.revenueByChannel,
      expensesByBucket: currentAgg.expensesByBucket,
    },
    cashMovement: {
      inflows: makeDelta(currentAgg.inflows, previousAgg.inflows),
      outflows: makeDelta(currentAgg.outflows, previousAgg.outflows),
      netChange: makeDelta(currentAgg.cashChange, previousAgg.cashChange),
      openingCash:
        Number.isFinite(cashBalance) && Number.isFinite(currentAgg.cashChange)
          ? cashBalance - currentAgg.cashChange
          : null,
      closingCash: Number.isFinite(cashBalance) ? cashBalance : null,
    },
    balanceSheet: snapshot,
    ratios,
    drivers,
    salesMix,
    inventoryProduction: {
      inventoryValue: snapshot ? Number(snapshot.latest.inventory || 0) : null,
      productionSpend: currentAgg.production.spend,
      productionVolume: currentAgg.production.volume,
      productionTxCount: currentAgg.production.txCount,
      outgoingContractsCount: Array.isArray(outgoingContracts) ? outgoingContracts.length : 0,
      outgoingContractsValue: (outgoingContracts || []).reduce((acc, c) => {
        const q = Number(c?.quantity || 0);
        const p = Number(c?.price || 0);
        if (!Number.isFinite(q) || !Number.isFinite(p)) return acc;
        return acc + q * p;
      }, 0),
    },
    workforce: {
      ...currentAgg.workforce,
      wagesDelta: currentAgg.workforce.wages - previousAgg.workforce.wages,
      trainingDelta: currentAgg.workforce.training - previousAgg.workforce.training,
      accountingDelta: currentAgg.workforce.accounting - previousAgg.workforce.accounting,
      totalDelta: currentAgg.workforce.total - previousAgg.workforce.total,
    },
    alerts,
    recentTransactions: currentItems.slice(0, 60),
  };

  const oldestMs = getOldestTransactionMs(transactions);
  const newestMs = getNewestTransactionMs(transactions);

  finance.coverage = {
    startMs: Number.isFinite(oldestMs) ? oldestMs : 0,
    endMs: Number.isFinite(newestMs) ? newestMs : nowMs(),
    partial: Number.isFinite(oldestMs) ? oldestMs > Math.min(bounds.startMs, prevBounds.startMs) : true,
  };

  if (finance.coverage.partial) {
    finance.meta.partialReason = "coverage";
  } else {
    finance.meta.partialReason = "";
  }

  syncLegacyTodayYesterdayState();
}

function syncLegacyTodayYesterdayState() {
  const finance = getFinanceState();
  const txs = finance.datasets.transactions || [];

  const todayItems = txs.filter((tx) => isTodayLocal(tx.datetime));
  const yesterdayItems = txs.filter((tx) => isYesterdayLocal(tx.datetime));

  STATE.cashflow.todayItems = todayItems;
  STATE.cashflow.yesterdayItems = yesterdayItems;
  STATE.cashflow.todaySummary = computeSummary(todayItems);
  STATE.cashflow.yesterdaySummary = computeSummary(yesterdayItems);
  STATE.cashflow.items = todayItems;
  STATE.cashflow.summary = STATE.cashflow.todaySummary;
}

function markRateLimitFromError(error) {
  const msg = String(error?.message || error || "");

  if (msg.includes("RATE_LIMIT_429")) {
    const until = nowMs() + RATE_LIMIT_COOLDOWN_MS;
    schedulerState.rateLimitedUntil = until;
    const finance = getFinanceState();
    finance.meta.rateLimitedUntil = until;
    return true;
  }

  if (msg.startsWith("RATE_LIMIT_COOLDOWN:")) {
    const remainSec = Number(msg.split(":")[1]);
    const until = nowMs() + (Number.isFinite(remainSec) ? remainSec * 1000 : RATE_LIMIT_COOLDOWN_MS);
    schedulerState.rateLimitedUntil = Math.max(schedulerState.rateLimitedUntil, until);
    const finance = getFinanceState();
    finance.meta.rateLimitedUntil = schedulerState.rateLimitedUntil;
    return true;
  }

  return false;
}

async function refreshFinanceAuthContext() {
  const now = nowMs();
  const shouldRefresh = !STATE.auth.loaded || now - lastFinanceAuthRefreshAt > AUTH_REFRESH_TTL_MS;

  if (!shouldRefresh) return;

  await loadAuthDataOnce({ force: true });
  lastFinanceAuthRefreshAt = nowMs();
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
    const json = await fetchJson(RECENT_URL);
    const data = Array.isArray(json?.data) ? json.data : [];

    finance.datasets.transactions = mergeTransactions(finance.datasets.transactions, data);
    finance.cache.lastTxFetchAt = nowMs();
    finance.cache.pagesLoaded = Math.max(1, Number(finance.cache.pagesLoaded || 0));

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

export async function ensureFinanceCoverage(startMs, { reason: _reason = "" } = {}) {
  await refreshFinanceAuthContext();
  hydrateFinanceCache();

  const finance = getFinanceState();

  if (!Number.isFinite(startMs)) {
    return { partial: false };
  }

  let oldestMs = getOldestTransactionMs(finance.datasets.transactions);

  if (Number.isFinite(oldestMs) && oldestMs <= startMs) {
    return { partial: false };
  }

  if (finance.cache.oldestPulled) {
    return { partial: true };
  }

  let pages = 0;

  while ((!Number.isFinite(oldestMs) || oldestMs > startMs) && !finance.cache.oldestPulled) {
    if (pages >= MAX_PAGINATION_PAGES_PER_RUN) {
      break;
    }

    const last = finance.datasets.transactions[finance.datasets.transactions.length - 1];
    const lastId = Number(last?.id);

    if (!Number.isFinite(lastId)) {
      break;
    }

    pages += 1;

    try {
      const json = await fetchJson(PAGE_URL(lastId));
      const data = Array.isArray(json?.data) ? json.data : [];

      finance.datasets.transactions = mergeTransactions(finance.datasets.transactions, data);
      finance.cache.pagesLoaded += 1;
      finance.cache.lastTxFetchAt = nowMs();

      if (json?.oldestPulled === true || data.length === 0) {
        finance.cache.oldestPulled = true;
      }

      oldestMs = getOldestTransactionMs(finance.datasets.transactions);
      finance.cache.transactionsFetchedUntilMs = Number.isFinite(oldestMs) ? oldestMs : 0;
    } catch (e) {
      markRateLimitFromError(e);
      break;
    }
  }

  oldestMs = getOldestTransactionMs(finance.datasets.transactions);
  const partial = !Number.isFinite(oldestMs) || oldestMs > startMs;

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
    const json = await fetchJson(PAST_FINANCES_URL);
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
    const json = await fetchJson(OUTGOING_CONTRACTS_URL);
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
  saveFinanceCache();
}

export function setFinanceUiMode(mode) {
  const finance = getFinanceState();
  if (["compact", "expanded"].includes(mode)) {
    finance.uiMode = mode;
    saveFinanceCache();
  }
}

export async function loadFinanceData({ period, force = false, reason: _reason = "auto" } = {}) {
  await refreshFinanceAuthContext();
  hydrateFinanceCache();

  const finance = getFinanceState();
  const selectedPeriod = period || finance.selectedPeriod || "current";
  finance.selectedPeriod = normalizeFinancePeriod(selectedPeriod);

  if (finance.meta.loading) return;

  finance.meta.loading = true;
  finance.meta.error = null;
  finance.meta.rateLimitedUntil = schedulerState.rateLimitedUntil;

  STATE.cashflow.loading = true;
  STATE.cashflow.error = null;

  try {
    await refreshRecentTransactions({ force });
    await refreshPastFinances({ force });
    await refreshOutgoingContracts({ force });

    const bounds = getPeriodBounds(finance.selectedPeriod);
    const previous = getPreviousPeriodBounds(bounds);
    const requiredStart = Math.min(bounds.startMs, previous.startMs);

    const coverage = await ensureFinanceCoverage(requiredStart, {});
    recomputeDerived(finance.selectedPeriod);

    finance.coverage.partial = Boolean(coverage?.partial || finance.coverage.partial);
    finance.meta.lastRefreshAt = nowMs();
    finance.meta.rateLimitedUntil = schedulerState.rateLimitedUntil;

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

    saveFinanceCache();
  }
}

/**
 * Legacy public API used by content.js interval.
 * Keeps backward compatibility while the UI is fully finance-driven.
 */
export async function loadCashflowToday({ force = false } = {}) {
  await loadFinanceData({
    period: getFinanceState().selectedPeriod || "current",
    force,
    reason: "legacy-loadCashflowToday",
  });
}

export const _testUtils = {
  classifyTransaction,
  aggregatePeriodMetrics,
  computeSummary,
  getPeriodBounds,
  getPreviousPeriodBounds,
  safePctChange,
  normalizeFinancePeriod,
  applyStorageRetention,
  getCurrentFinanceScope,
  getFinanceStorageKey,
  hydrateFinanceCache,
  resetFinanceRuntime,
};
