// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

vi.mock("../src/sidebar.js", () => ({
  getSectionContent: vi.fn(),
}));

vi.mock("../src/cashflow.js", () => ({
  loadFinanceData: vi.fn(async () => {}),
  ensureFinanceCoverage: vi.fn(async () => ({ partial: false })),
  setFinancePeriod: vi.fn(),
  setFinanceUiMode: vi.fn(),
}));

vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    copyToClipboard: vi.fn(async () => {}),
  };
});

vi.mock("../src/state.js", () => {
  const state = {
    cashflow: {
      loading: false,
      loaded: true,
      error: null,
      finance: {
        selectedPeriod: "current",
        uiMode: "compact",
        coverage: { partial: false },
        datasets: {
          transactions: [
            {
              id: 1,
              _dtMs: Date.parse("2026-03-29T11:00:00.000Z"),
              datetime: "2026-03-29T11:00:00.000Z",
              category: "t",
              description: "Sand contract signed by Test Corp",
              descriptionKey: "cs-44-Test Corp",
              money: 120000,
            },
          ],
        },
        meta: {
          loading: false,
          error: null,
          lastRefreshAt: Date.parse("2026-03-29T12:00:00.000Z"),
          rateLimitedUntil: 0,
        },
        derived: {
          period: {
            startMs: Date.parse("2026-03-29T00:00:00.000Z"),
            endMs: Date.parse("2026-03-29T12:00:00.000Z"),
          },
          kpis: [
            { id: "revenue", current: 120000, delta: 20000, pct: 20, exactness: "derived" },
            { id: "netProfit", current: 50000, delta: -5000, pct: -9.1, exactness: "exact" },
          ],
          pnl: {
            revenue: { current: 120000, delta: 20000, pct: 20 },
            directCosts: { current: 50000, delta: 3000, pct: 6 },
            grossProfit: { current: 70000, delta: 17000, pct: 32 },
            overhead: { current: 20000, delta: 1000, pct: 5 },
            operatingProfit: { current: 50000, delta: 16000, pct: 47 },
            nonOperating: { current: 0, delta: -1000, pct: null },
            netProfit: { current: 50000, delta: -5000, pct: -9 },
            revenueByChannel: { retail: 0, contracts: 120000, market: 0, other: 0 },
            expensesByBucket: {
              production: 50000,
              marketBuy: 0,
              inboundContracts: 0,
              wages: 12000,
              fees: 2000,
            },
          },
          cashMovement: {
            inflows: { current: 120000, delta: 20000, pct: 20 },
            outflows: { current: 70000, delta: 5000, pct: 7.7 },
            netChange: { current: 50000, delta: -5000, pct: -9.1 },
            openingCash: 800000,
            closingCash: 850000,
          },
          balanceSheet: {
            latest: {
              date: "2026-03-29 01:10:09.861290+00:00",
              currentAssets: 3000000,
              nonCurrentAssets: 2000000,
              total: 5000000,
              cashAndReceivables: 1000000,
              inventory: 2000000,
              liabilities: -500000,
              buildings: 1200000,
              patents: 900000,
              rank: 4000,
            },
          },
          ratios: [
            { id: "grossMargin", value: 58.3 },
            { id: "operatingMargin", value: 41.7 },
            { id: "currentRatio", value: 6 },
          ],
          drivers: {
            income: [
              { key: "cs-44-Test Corp", label: "Sand contract", income: 120000, expense: 0, net: 120000 },
            ],
            expenses: [
              { key: "production-44", label: "Production of Sand", income: 0, expense: 50000, net: -50000 },
            ],
            changes: [{ key: "production-44", label: "Production of Sand", delta: -10000 }],
          },
          salesMix: [{ kind: 44, name: "Sand", revenue: 120000, share: 100 }],
          inventoryProduction: {
            inventoryValue: 2000000,
            productionSpend: 50000,
            productionVolume: 400000,
            productionTxCount: 2,
            outgoingContractsCount: 3,
            outgoingContractsValue: 200000,
          },
          workforce: {
            wages: 12000,
            training: 3000,
            accounting: 1000,
            leadership: 4000,
            total: 16000,
            totalDelta: 2000,
          },
          alerts: [{ id: "inventoryHigh", severity: "warn" }],
          recentTransactions: [],
        },
      },
    },
  };

  return { STATE: state };
});

import { updateCashflowPanel, _testUtils } from "../src/cashflow_ui.js";
import { STATE } from "../src/state.js";
import { getSectionContent } from "../src/sidebar.js";

const { formatRefreshTime, formatFinanceAsText, formatPct } = _testUtils;

describe("cashflow_ui formatting utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats refresh times in seconds/minutes/hours", () => {
    expect(formatRefreshTime(Date.now() - 10 * 1000)).toBe("10sAgo");
    expect(formatRefreshTime(Date.now() - 5 * 60 * 1000)).toBe("5mAgo");
    expect(formatRefreshTime(Date.now() - 2 * 3600 * 1000)).toBe("2hAgo");
  });

  it("formats percentage with sign", () => {
    expect(formatPct(15.3)).toBe("+15.3%");
    expect(formatPct(-2.11, 2)).toBe("-2.11%");
    expect(formatPct(null)).toBe("—");
  });

  it("exports finance summary as text", () => {
    const text = formatFinanceAsText(STATE.cashflow.finance);

    expect(text).toContain("financeKpiRevenue");
    expect(text).toContain("$120,000.00");
    expect(text).toContain("financeSectionPnl");
  });
});

describe("updateCashflowPanel", () => {
  let content;

  beforeEach(() => {
    content = document.createElement("div");
    getSectionContent.mockReturnValue(content);

    STATE.cashflow.loading = false;
    STATE.cashflow.finance.meta.loading = false;
    STATE.cashflow.finance.meta.error = null;
    STATE.cashflow.finance.uiMode = "compact";
    STATE.cashflow.finance.coverage.partial = false;
    STATE.cashflow.finance.derived = {
      period: {
        startMs: Date.parse("2026-03-29T00:00:00.000Z"),
        endMs: Date.parse("2026-03-29T12:00:00.000Z"),
      },
      kpis: [
        { id: "revenue", current: 120000, delta: 20000, pct: 20, exactness: "derived" },
        { id: "netProfit", current: 50000, delta: -5000, pct: -9.1, exactness: "exact" },
      ],
      pnl: {
        revenue: { current: 120000, delta: 20000, pct: 20 },
        directCosts: { current: 50000, delta: 3000, pct: 6 },
        grossProfit: { current: 70000, delta: 17000, pct: 32 },
        overhead: { current: 20000, delta: 1000, pct: 5 },
        operatingProfit: { current: 50000, delta: 16000, pct: 47 },
        nonOperating: { current: 0, delta: -1000, pct: null },
        netProfit: { current: 50000, delta: -5000, pct: -9 },
        revenueByChannel: { retail: 0, contracts: 120000, market: 0, other: 0 },
        expensesByBucket: {
          production: 50000,
          marketBuy: 0,
          inboundContracts: 0,
          wages: 12000,
          fees: 2000,
        },
      },
      cashMovement: {
        inflows: { current: 120000, delta: 20000, pct: 20 },
        outflows: { current: 70000, delta: 5000, pct: 7.7 },
        netChange: { current: 50000, delta: -5000, pct: -9.1 },
        openingCash: 800000,
        closingCash: 850000,
      },
      balanceSheet: {
        latest: {
          date: "2026-03-29 01:10:09.861290+00:00",
          currentAssets: 3000000,
          nonCurrentAssets: 2000000,
          total: 5000000,
          cashAndReceivables: 1000000,
          inventory: 2000000,
          liabilities: -500000,
          buildings: 1200000,
          patents: 900000,
          rank: 4000,
        },
      },
      ratios: [
        { id: "grossMargin", value: 58.3 },
        { id: "operatingMargin", value: 41.7 },
        { id: "currentRatio", value: 6 },
      ],
      drivers: {
        income: [{ key: "cs-44-Test Corp", label: "Sand contract", income: 120000, expense: 0, net: 120000 }],
        expenses: [
          { key: "production-44", label: "Production of Sand", income: 0, expense: 50000, net: -50000 },
        ],
        changes: [{ key: "production-44", label: "Production of Sand", delta: -10000 }],
      },
      salesMix: [{ kind: 44, name: "Sand", revenue: 120000, share: 100 }],
      inventoryProduction: {
        inventoryValue: 2000000,
        productionSpend: 50000,
        productionVolume: 400000,
        productionTxCount: 2,
        outgoingContractsCount: 3,
        outgoingContractsValue: 200000,
      },
      workforce: {
        wages: 12000,
        training: 3000,
        accounting: 1000,
        leadership: 4000,
        total: 16000,
        totalDelta: 2000,
      },
      alerts: [{ id: "inventoryHigh", severity: "warn" }],
      recentTransactions: [],
    };
  });

  it("shows loading state", () => {
    STATE.cashflow.loading = true;
    STATE.cashflow.finance.derived = null;

    updateCashflowPanel();

    expect(content.innerHTML).toContain("loadingCashflow");
  });

  it("shows no-data message when derived data missing", () => {
    STATE.cashflow.finance.derived = null;
    STATE.cashflow.loading = false;

    updateCashflowPanel();

    expect(content.innerHTML).toContain("noCashflowData");
  });

  it("renders compact dashboard with KPI strip", () => {
    STATE.cashflow.finance.uiMode = "compact";

    updateCashflowPanel();

    expect(content.innerHTML).toContain("financePeriodLabel");
    expect(content.innerHTML).toContain("financeKpiRevenue");
    expect(content.innerHTML).toContain("financeSectionAlerts");
    expect(content.innerHTML).not.toContain("financePeriodMonth");
  });

  it("renders expanded sections when ui mode is expanded", () => {
    STATE.cashflow.finance.uiMode = "expanded";

    updateCashflowPanel();

    expect(content.innerHTML).toContain("financeSectionPnl");
    expect(content.innerHTML).toContain("financeSectionCashMovement");
    expect(content.innerHTML).toContain("financeSectionBalanceSheet");
    expect(content.innerHTML).toContain("financeSectionRatios");
    expect(content.innerHTML).toContain("financeSectionTransactions");
    expect(content.innerHTML).toContain("financeSectionSalesMix");
    expect(content.innerHTML).toMatch(
      /financeOutgoingContracts<\/span>\s*<span class="scx-fin-mini-value">3<\/span>/,
    );
    expect(content.innerHTML).toMatch(
      /financeProductionRuns<\/span>\s*<span class="scx-fin-mini-value">2<\/span>/,
    );
    expect(content.innerHTML).toMatch(/financeRank<\/span>\s*<span class="scx-fin-mini-value">4,000<\/span>/);
    expect(content.innerHTML).not.toMatch(
      /financeOutgoingContracts<\/span>\s*<span class="scx-fin-mini-value">\$3\.00<\/span>/,
    );
    expect(content.innerHTML).not.toMatch(
      /financeProductionRuns<\/span>\s*<span class="scx-fin-mini-value">\$2\.00<\/span>/,
    );
  });

  it("renders partial coverage badge", () => {
    STATE.cashflow.finance.coverage.partial = true;

    updateCashflowPanel();

    expect(content.innerHTML).toContain("financePartialCoverage");
  });

  it("renders error note when there is an error and no derived data", () => {
    STATE.cashflow.finance.meta.error = "HTTP 500";
    STATE.cashflow.finance.derived = null;

    updateCashflowPanel();

    expect(content.innerHTML).toContain("HTTP 500");
  });
});
