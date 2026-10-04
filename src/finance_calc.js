// Pure finance math for the Financials dashboard: transaction parsing/classification, period
// windows, aggregation and derived KPIs/ratios/alerts. No state, no I/O — cashflow.js feeds it.

export function parseDtMs(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

export function normalizeTransaction(tx) {
  const dtMs = parseDtMs(tx?.datetime);
  return {
    ...tx,
    id: Number(tx?.id),
    money: Number(tx?.money || 0),
    _dtMs: dtMs,
  };
}

export function mergeTransactions(existing, incoming) {
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

export function getOldestTransactionMs(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return NaN;
  const last = transactions[transactions.length - 1];
  return Number.isFinite(last?._dtMs) ? last._dtMs : NaN;
}

export function getNewestTransactionMs(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return NaN;
  const first = transactions[0];
  return Number.isFinite(first?._dtMs) ? first._dtMs : NaN;
}

/** Oldest/newest normalized entries in a raw API batch (unsorted). */
export function getBatchExtent(rawItems) {
  let oldest = null;
  let newest = null;

  for (const raw of rawItems || []) {
    const tx = normalizeTransaction(raw);
    if (!Number.isFinite(tx._dtMs)) continue;
    if (!oldest || tx._dtMs < oldest._dtMs) oldest = tx;
    if (!newest || tx._dtMs > newest._dtMs) newest = tx;
  }

  return { oldest, newest };
}

export function startOfTodayLocalMs(baseMs = Date.now()) {
  const d = new Date(baseMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function parseProductKind(tx) {
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

export function classifyTransaction(tx) {
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

export function safePctChange(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function makeDelta(curr, prev) {
  const delta = curr - prev;
  return {
    current: curr,
    previous: prev,
    delta,
    pct: safePctChange(curr, prev),
  };
}

export function getPeriodBounds(period, baseMs = Date.now()) {
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

export function getPreviousPeriodBounds(bounds) {
  const duration = Math.max(0, bounds.endMs - bounds.startMs);
  const endMs = bounds.startMs;
  const startMs = endMs - duration;

  return {
    period: `${bounds.period}:prev`,
    startMs,
    endMs,
  };
}

export function filterTransactionsForPeriod(transactions, bounds) {
  return (transactions || []).filter((tx) => tx._dtMs >= bounds.startMs && tx._dtMs < bounds.endMs);
}

export function aggregatePeriodMetrics(items) {
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
