import { beforeEach, describe, expect, it } from "vitest";

import { _testUtils } from "../src/cashflow.js";
import {
  aggregatePeriodMetrics,
  classifyTransaction,
  getPeriodBounds,
  getPreviousPeriodBounds,
  safePctChange,
} from "../src/finance_calc.js";
import { STATE } from "../src/state.js";
import "../src/auth.js"; // registers the storage scope provider
import { installChromeStorage } from "./helpers/storage_mocks.js";

const {
  normalizeFinancePeriod,
  applyStorageRetention,
  getCurrentFinanceScope,
  hydrateFinanceCache,
  resetFinanceRuntime,
  extendCoverageFromRecentBatch,
} = _testUtils;

let chromeStorage;

const financeEnvelope = (companyId, realmId, transactions, ts = Date.now()) => ({
  v: 3,
  ts,
  ttlMs: null,
  scope: { mode: "scoped", scopeKey: `${companyId}-${realmId}`, companyId, realmId },
  data: {
    scope: { companyId, realmId },
    datasets: { transactions, pastFinances: [], outgoingContracts: [] },
    cache: {},
    meta: {},
    ui: {},
  },
});

beforeEach(() => {
  chromeStorage = installChromeStorage();
  STATE.auth.companyId = null;
  STATE.auth.realmId = null;
  resetFinanceRuntime(STATE.cashflow.finance);
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

  it("keeps transactions for 15 days but past finances for 60", () => {
    const now = Date.parse("2026-03-29T12:00:00.000Z");
    const txMs = Date.parse("2026-03-10T00:00:00.000Z");

    const finance = {
      datasets: {
        transactions: [{ id: 1, _dtMs: txMs, money: 10 }],
        pastFinances: [{ date: "2026-03-10 01:00:00.000000+00:00" }],
      },
      cache: { oldestPulled: true, transactionsFetchedUntilMs: 0, coverageFloorMs: txMs, coverageFloorId: 1 },
    };

    applyStorageRetention(finance, { now });

    expect(finance.datasets.transactions).toHaveLength(0);
    expect(finance.datasets.pastFinances).toHaveLength(1);
    expect(finance.cache.coverageFloorMs).toBe(now - 15 * 24 * 60 * 60 * 1000);
    expect(finance.cache.coverageFloorId).toBeNull();
  });

  it("returns null pct when previous value is zero and current is non-zero", () => {
    expect(safePctChange(10, 0)).toBeNull();
    expect(safePctChange(0, 0)).toBe(0);
    expect(safePctChange(20, 10)).toBe(100);
  });

  it("scopes finance cache key by company and realm", () => {
    STATE.auth.companyId = 123;
    STATE.auth.realmId = 1;

    expect(getCurrentFinanceScope().key).toBe("123-1");
  });

  it("rehydrates from the new realm cache and drops old realm transactions", async () => {
    const now = new Date().toISOString();
    chromeStorage.local.items["scx:cashflow-finance:v3:900-0"] = financeEnvelope(900, 0, [
      { id: 1, datetime: now, money: 1000 },
    ]);
    chromeStorage.local.items["scx:cashflow-finance:v3:900-1"] = financeEnvelope(900, 1, []);

    STATE.auth.companyId = 900;
    STATE.auth.realmId = 0;
    await hydrateFinanceCache();
    expect(STATE.cashflow.finance.datasets.transactions).toHaveLength(1);

    STATE.auth.realmId = 1;
    await hydrateFinanceCache();
    expect(STATE.cashflow.finance.datasets.transactions).toHaveLength(0);
  });

  it("shares one read between concurrent hydrations", async () => {
    const now = new Date().toISOString();
    chromeStorage.local.items["scx:cashflow-finance:v3:5-0"] = financeEnvelope(5, 0, [
      { id: 1, datetime: now, money: 10 },
    ]);
    STATE.auth.companyId = 5;
    STATE.auth.realmId = 0;

    await Promise.all([hydrateFinanceCache(), hydrateFinanceCache()]);
    expect(STATE.cashflow.finance.datasets.transactions).toHaveLength(1);
  });

  it("removes cached payloads older than the retention window", async () => {
    const old = Date.now() - 61 * 24 * 60 * 60 * 1000;
    chromeStorage.local.items["scx:cashflow-finance:v3:1-1"] = financeEnvelope(1, 1, [], old);
    STATE.auth.companyId = 777;
    STATE.auth.realmId = 1;

    await hydrateFinanceCache();

    expect(chromeStorage.local.items["scx:cashflow-finance:v3:1-1"]).toBeUndefined();
  });
});

describe("coverage floor gap detection", () => {
  it("extends the floor when a fresh recent batch reconnects with the previous top", () => {
    const finance = STATE.cashflow.finance;
    const dayMs = 24 * 60 * 60 * 1000;
    const t0 = Date.parse("2026-09-15T12:00:00.000Z");

    // First session: recent batch spans the last few hours, ending "now".
    extendCoverageFromRecentBatch(finance, [{ id: 2, datetime: new Date(t0).toISOString(), money: 100 }], t0);
    expect(finance.cache.coverageFloorMs).toBe(t0);

    // Deep pagination earns a much older floor within the same session.
    finance.cache.coverageFloorMs = t0 - 6 * dayMs;
    finance.cache.coverageFloorId = 1;

    // A later refresh still touches the old top: no gap, so the deep floor must survive.
    const t1 = t0 + 5 * 60 * 1000;
    extendCoverageFromRecentBatch(
      finance,
      [
        { id: 3, datetime: new Date(t1).toISOString(), money: -50 },
        { id: 2, datetime: new Date(t0 - 2 * 60 * 60 * 1000).toISOString(), money: 100 },
      ],
      t1,
    );

    expect(finance.cache.coverageFloorMs).toBe(t0 - 6 * dayMs);
    expect(finance.cache.coverageFloorId).toBe(1);
  });

  it("resets the floor when a fresh recent batch does not reach the previous top (real gap)", () => {
    const finance = STATE.cashflow.finance;
    const dayMs = 24 * 60 * 60 * 1000;
    const t0 = Date.parse("2026-09-11T12:00:00.000Z");

    // Old session earned deep coverage, with top at t0.
    finance.cache.coverageTopMs = t0;
    finance.cache.coverageFloorMs = t0 - 6 * dayMs;
    finance.cache.coverageFloorId = 1;

    // User reopens 11 days later. The fresh recent batch only spans the
    // last few hours — nowhere near t0 — so the old deep floor can no
    // longer be trusted; it must reset to this batch's own boundary.
    const t1 = t0 + 11 * dayMs;
    extendCoverageFromRecentBatch(
      finance,
      [{ id: 99, datetime: new Date(t1).toISOString(), money: 200 }],
      t1,
    );

    expect(finance.cache.coverageFloorMs).toBe(t1);
    expect(finance.cache.coverageFloorId).toBe(99);
  });
});
