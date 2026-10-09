// Pure dashboard insights built on finance_calc.js aggregates: sales mix, drivers, balance
// sheet, ratios, alerts, KPIs, and deriveFinanceModel() which assembles them for one period.
import {
  getOldestTransactionMs,
  getNewestTransactionMs,
  makeDelta,
  getPeriodBounds,
  getPreviousPeriodBounds,
  filterTransactionsForPeriod,
  aggregatePeriodMetrics,
} from "./finance_calc.js";

import recipesData from "./resources/recipes.json";

const recipes = Array.isArray(recipesData) ? recipesData : [];
const RESOURCE_NAME_BY_KIND = new Map(recipes.map((r) => [Number(r.id), String(r.name || r.id)]));

export function buildSalesMix(agg) {
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

export function buildDrivers(currentAgg, previousAgg) {
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

export function buildBalanceSheetSnapshot(pastFinances) {
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

export function buildRatios(currentAgg, snapshot) {
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

export function buildAlerts(currentAgg, snapshot, ratios) {
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

export function makeKpis(currentAgg, previousAgg, cashBalance, snapshot) {
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

/**
 * Build the whole dashboard model for one period.
 * @param {{
 *   transactions: object[], pastFinances: object[], outgoingContracts: object[],
 *   cashBalance: number|null, coverageFloorMs: number, period: string, nowMs?: number,
 * }} input
 * @returns {{ derived: object, coverage: { startMs: number, endMs: number, partial: boolean } }}
 */
export function deriveFinanceModel(input) {
  const { period, cashBalance, coverageFloorMs, nowMs = Date.now() } = input;
  const transactions = input.transactions || [];
  const pastFinances = input.pastFinances || [];
  const outgoingContracts = input.outgoingContracts || [];

  const bounds = getPeriodBounds(period, nowMs);
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

  const derived = {
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
  const floorMs = Number(coverageFloorMs || 0);
  const requiredStart = Math.min(bounds.startMs, prevBounds.startMs);

  const coverage = {
    startMs: Number.isFinite(oldestMs) ? oldestMs : 0,
    endMs: Number.isFinite(newestMs) ? newestMs : nowMs,
    partial: floorMs > 0 ? floorMs > requiredStart : true,
  };

  return { derived, coverage };
}
