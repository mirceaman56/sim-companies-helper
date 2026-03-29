import { describe, expect, it } from "vitest";

import { _testUtils } from "../src/cashflow.js";

const {
  classifyTransaction,
  aggregatePeriodMetrics,
  computeSummary,
  getPeriodBounds,
  getPreviousPeriodBounds,
  safePctChange,
  normalizeFinancePeriod,
  applyStorageRetention,
} = _testUtils;

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
});
