import { beforeEach, describe, expect, it } from "vitest";

import { _testUtils } from "../src/cashflow.js";
import { STATE } from "../src/state.js";

const {
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
} = _testUtils;

function createLocalStorageMock() {
  const store = new Map();

  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      const k = String(key);
      return store.has(k) ? store.get(k) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: createLocalStorageMock(),
    configurable: true,
    writable: true,
  });

  STATE.auth.companyId = null;
  STATE.auth.realmId = null;
  resetFinanceRuntime(STATE.cashflow.finance);
  localStorage.clear();
});

describe("cashflow core metrics", () => {
  it("classifies contract sale and inbound contract correctly", () => {
    const sale = classifyTransaction({ money: 1000, category: "t", descriptionKey: "cs-44-Buyer" });
    const inbound = classifyTransaction({ money: -900, category: "t", descriptionKey: "cr-44-Seller" });

    expect(sale.isRevenue).toBe(true);
    expect(sale.isContractSale).toBe(true);
    expect(inbound.isDirectCost).toBe(true);
    expect(inbound.isContractInbound).toBe(true);
  });

  it("classifies executive salary cashflow as wages overhead", () => {
    const executiveSalary = classifyTransaction({
      money: -6477,
      category: "e",
      descriptionKey: "1-salaries",
      description: "Executive salaries",
    });

    expect(executiveSalary.isExecutiveSalary).toBe(true);
    expect(executiveSalary.isWages).toBe(true);
    expect(executiveSalary.isOverhead).toBe(true);
    expect(executiveSalary.expenseBucket).toBe("wages");
  });

  it("aggregates revenue, direct costs, overhead, and net profit", () => {
    const metrics = aggregatePeriodMetrics([
      { money: 2000, category: "t", descriptionKey: "cs-44-A" },
      { money: -600, category: "p", descriptionKey: "production-44", details: { amount: 1000 } },
      { money: -200, category: "w", descriptionKey: "wages" },
      { money: -100, category: "h", descriptionKey: "training-f" },
      { money: 300, category: "m", descriptionKey: "marketsell-40" },
    ]);

    expect(metrics.revenue).toBe(2300);
    expect(metrics.directCosts).toBe(600);
    expect(metrics.overhead).toBe(300);
    expect(metrics.grossProfit).toBe(1700);
    expect(metrics.operatingProfit).toBe(1400);
    expect(metrics.netProfit).toBe(1400);
    expect(metrics.production.volume).toBe(1000);
  });

  it("counts executive salaries into workforce wages and leadership", () => {
    const metrics = aggregatePeriodMetrics([
      { money: -6477, category: "e", description: "Executive salaries", descriptionKey: "1-salaries" },
      { money: -1000, category: "h", descriptionKey: "training-f" },
    ]);

    expect(metrics.workforce.wages).toBe(6477);
    expect(metrics.workforce.training).toBe(1000);
    expect(metrics.workforce.leadership).toBe(7477);
    expect(metrics.workforce.total).toBe(7477);
    expect(metrics.overhead).toBe(7477);
  });

  it("keeps research expenses in research bucket for legacy summary", () => {
    const summary = computeSummary([
      { money: -1250, category: "r" },
      { money: -200, category: "e" },
      { money: -50, category: "other" },
    ]);

    expect(summary.expenseByType.r).toBe(1250);
    expect(summary.expenseByType.e).toBe(200);
    expect(summary.expenseByType.other).toBe(50);
  });

  it("computes period and previous comparable windows", () => {
    const fixed = new Date("2026-03-29T12:00:00.000Z").getTime();
    const day = getPeriodBounds("day", fixed);
    const prev = getPreviousPeriodBounds(day);

    expect(day.endMs - day.startMs).toBe(24 * 60 * 60 * 1000);
    expect(prev.endMs).toBe(day.startMs);
    expect(prev.endMs - prev.startMs).toBe(day.endMs - day.startMs);
  });

  it("downgrades legacy month period to week", () => {
    expect(normalizeFinancePeriod("month")).toBe("week");
    expect(normalizeFinancePeriod("week")).toBe("week");
    expect(normalizeFinancePeriod("unknown")).toBe("current");
  });

  it("prunes finance cache datasets older than 60 days", () => {
    const now = Date.parse("2026-03-29T12:00:00.000Z");
    const oldTxMs = Date.parse("2025-12-01T00:00:00.000Z");
    const newTxMs = Date.parse("2026-03-20T00:00:00.000Z");

    const finance = {
      datasets: {
        transactions: [
          { id: 1, _dtMs: oldTxMs, money: 10 },
          { id: 2, _dtMs: newTxMs, money: 20 },
        ],
        pastFinances: [
          { date: "2025-12-01 01:00:00.000000+00:00" },
          { date: "2026-03-28 01:00:00.000000+00:00" },
        ],
      },
      cache: {
        oldestPulled: true,
        transactionsFetchedUntilMs: 0,
      },
    };

    applyStorageRetention(finance, { now });

    expect(finance.datasets.transactions).toHaveLength(1);
    expect(finance.datasets.transactions[0].id).toBe(2);
    expect(finance.datasets.pastFinances).toHaveLength(1);
    expect(finance.cache.oldestPulled).toBe(false);
    expect(finance.cache.transactionsFetchedUntilMs).toBe(newTxMs);
  });

  it("returns null pct when previous value is zero and current is non-zero", () => {
    expect(safePctChange(10, 0)).toBeNull();
    expect(safePctChange(0, 0)).toBe(0);
    expect(safePctChange(20, 10)).toBe(100);
  });

  it("scopes finance cache key by company and realm", () => {
    STATE.auth.companyId = 123;
    STATE.auth.realmId = 1;

    const scope = getCurrentFinanceScope();
    expect(scope.key).toBe("123-1");
    expect(getFinanceStorageKey(scope.key)).toBe("scx-finance-cache-123-1");
  });

  it("rehydrates from the new realm cache and drops old realm transactions", () => {
    const now = new Date().toISOString();

    STATE.auth.companyId = 900;
    STATE.auth.realmId = 0;
    localStorage.setItem(
      "scx-finance-cache-900-0",
      JSON.stringify({
        v: 2,
        ts: Date.parse(now),
        scope: { companyId: 900, realmId: 0 },
        datasets: {
          transactions: [{ id: 1, datetime: now, money: 1000 }],
          pastFinances: [],
          outgoingContracts: [],
        },
        cache: {},
        meta: {},
        ui: {},
      }),
    );

    STATE.auth.realmId = 1;
    localStorage.setItem(
      "scx-finance-cache-900-1",
      JSON.stringify({
        v: 2,
        ts: Date.parse(now),
        scope: { companyId: 900, realmId: 1 },
        datasets: {
          transactions: [],
          pastFinances: [],
          outgoingContracts: [],
        },
        cache: {},
        meta: {},
        ui: {},
      }),
    );

    STATE.auth.realmId = 0;
    hydrateFinanceCache();
    expect(STATE.cashflow.finance.datasets.transactions).toHaveLength(1);

    STATE.auth.realmId = 1;
    hydrateFinanceCache();
    expect(STATE.cashflow.finance.datasets.transactions).toHaveLength(0);
  });

  it("removes older finance cache payload versions during hydration", () => {
    const now = "2026-03-29T12:00:00.000Z";
    localStorage.setItem(
      "scx-finance-cache-legacy-company-only",
      JSON.stringify({
        v: 1,
        ts: Date.parse(now),
        datasets: {
          transactions: [{ id: 99, datetime: now, money: 2500 }],
          pastFinances: [],
          outgoingContracts: [],
        },
        cache: {},
        meta: {},
        ui: {},
      }),
    );

    STATE.auth.companyId = 777;
    STATE.auth.realmId = 1;
    localStorage.setItem(
      "scx-finance-cache-777-1",
      JSON.stringify({
        v: 2,
        ts: Date.parse(now),
        scope: { companyId: 777, realmId: 1 },
        datasets: {
          transactions: [],
          pastFinances: [],
          outgoingContracts: [],
        },
        cache: {},
        meta: {},
        ui: {},
      }),
    );

    hydrateFinanceCache();

    expect(localStorage.getItem("scx-finance-cache-legacy-company-only")).toBeNull();
  });
});
