// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock i18n — t() just returns the key
vi.mock("../src/i18n.js", () => ({ t: (key) => key }));

// Mock sidebar module with proper vi.fn() inside callback
vi.mock("../src/sidebar.js", () => ({
  getSectionContent: vi.fn(),
}));

// Mock clipboard
vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    copyToClipboard: vi.fn(),
  };
});

// Mock STATE — must be defined before the mock
vi.mock("../src/state.js", () => {
  const mockState = {
    cashflow: {
      loading: false,
      error: null,
      loaded: true,
      lastRefreshAt: null,
      todayItems: [],
      yesterdayItems: [],
      todaySummary: {
        totalIncome: 0,
        totalExpense: 0,
        incomeByType: { s: 0, t: 0, m: 0, other: 0 },
        expenseByType: { p: 0, w: 0, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
      },
      yesterdaySummary: {
        totalIncome: 0,
        totalExpense: 0,
        incomeByType: { s: 0, t: 0, m: 0, other: 0 },
        expenseByType: { p: 0, w: 0, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
      },
    },
  };
  return { STATE: mockState };
});

import { updateCashflowPanel } from "../src/cashflow_ui.js";
import { _testUtils } from "../src/cashflow_ui.js";
import { STATE } from "../src/state.js";
import { getSectionContent } from "../src/sidebar.js";

const { formatCashflowAsText, renderBreakdownRow, formatRefreshTime } = _testUtils;

// ─── Formatting Tests ───────────────────────────────────────
describe("formatMoney formatting in cashflow text export", () => {
  it("formats large amounts with thousands separators in text export", () => {
    const today = {
      totalIncome: 1234567.89,
      totalExpense: 234567.89,
      incomeByType: { s: 1000000, t: 234567.89, m: 0, other: 0 },
      expenseByType: { p: 100000, w: 50000, m: 25000, t: 10000, f: 5000, c: 2000, A: 1000, other: 1567.89 },
    };
    const yesterday = {
      totalIncome: 1000000,
      totalExpense: 200000,
      incomeByType: { s: 900000, t: 100000, m: 0, other: 0 },
      expenseByType: { p: 100000, w: 40000, m: 20000, t: 15000, f: 4000, c: 2000, A: 1000, other: 18000 },
    };

    const text = formatCashflowAsText(today, yesterday);

    // Check that amounts have thousands separators
    expect(text).toContain("$1,234,567.89"); // today's total income
    expect(text).toContain("$234,567.89"); // today's total expense
    expect(text).toContain("$1,000,000.00"); // retail income
    expect(text).toContain("$100,000.00"); // production expense
  });

  it("formats net profit correctly with commas", () => {
    const today = {
      totalIncome: 1500000,
      totalExpense: 1200000,
      incomeByType: { s: 1000000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 1000000, w: 200000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    const yesterday = {
      totalIncome: 1400000,
      totalExpense: 1150000,
      incomeByType: { s: 900000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 950000, w: 200000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    const text = formatCashflowAsText(today, yesterday);

    // Net profit is 300,000 today vs 250,000 yesterday
    expect(text).toContain("$300,000.00");
    expect(text).toContain("$50,000.00");
  });

  it("handles zero and negative amounts in formatting", () => {
    const today = {
      totalIncome: 10000,
      totalExpense: 15000,
      incomeByType: { s: 5000, t: 5000, m: 0, other: 0 },
      expenseByType: { p: 8000, w: 7000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    const yesterday = {
      totalIncome: 20000,
      totalExpense: 10000,
      incomeByType: { s: 10000, t: 10000, m: 0, other: 0 },
      expenseByType: { p: 5000, w: 5000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    const text = formatCashflowAsText(today, yesterday);

    // Net profit today is -5,000, yesterday is 10,000, difference is -15,000
    expect(text).toContain("-$5,000.00");
    expect(text).toContain("-$15,000.00");
  });
});

// ─── renderBreakdownRow Tests ────────────────────────────────
describe("renderBreakdownRow", () => {
  it("renders a breakdown row with formatted amount and commas", () => {
    const html = renderBreakdownRow("Production", 1234567.89, "#c62828");

    expect(html).toContain("Production");
    expect(html).toContain("$1,234,567.89");
    expect(html).toContain("#c62828");
    expect(html).toContain("scx-cf-row");
  });

  it("returns empty string for zero amount", () => {
    expect(renderBreakdownRow("Production", 0, "#c62828")).toBe("");
  });

  it("returns empty string for negative amount", () => {
    expect(renderBreakdownRow("Production", -100, "#c62828")).toBe("");
  });

  it("returns empty string for falsy amount", () => {
    expect(renderBreakdownRow("Production", null, "#c62828")).toBe("");
    expect(renderBreakdownRow("Production", undefined, "#c62828")).toBe("");
  });

  it("formats different large amounts with thousands separators", () => {
    expect(renderBreakdownRow("Test", 100000, "#000")).toContain("$100,000.00");
    expect(renderBreakdownRow("Test", 5234567, "#000")).toContain("$5,234,567.00");
  });
});

// ─── formatRefreshTime Tests ────────────────────────────────
describe("formatRefreshTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'never' for null or undefined timestamp", () => {
    expect(formatRefreshTime(null)).toBe("never");
    expect(formatRefreshTime(undefined)).toBe("never");
  });

  it("formats seconds ago correctly", () => {
    const tenSecondsAgo = Date.now() - 10 * 1000;
    expect(formatRefreshTime(tenSecondsAgo)).toBe("10sAgo");

    const oneSecondAgo = Date.now() - 1000;
    expect(formatRefreshTime(oneSecondAgo)).toBe("1sAgo");
  });

  it("formats minutes ago correctly", () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    expect(formatRefreshTime(fiveMinutesAgo)).toBe("5mAgo");

    const oneMinuteAgo = Date.now() - 60 * 1000;
    expect(formatRefreshTime(oneMinuteAgo)).toBe("1mAgo");
  });

  it("formats hours ago correctly", () => {
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    expect(formatRefreshTime(twoHoursAgo)).toBe("2hAgo");

    const oneHourAgo = Date.now() - 3600 * 1000;
    expect(formatRefreshTime(oneHourAgo)).toBe("1hAgo");
  });

  it("uses seconds for times less than 60 seconds", () => {
    const fiftyNineSecondsAgo = Date.now() - 59 * 1000;
    expect(formatRefreshTime(fiftyNineSecondsAgo)).toBe("59sAgo");
  });

  it("rounds down minutes", () => {
    // 1 minute and 30 seconds ago = 90 seconds = 1 minute
    const oneMinuteThirtySecondsAgo = Date.now() - 90 * 1000;
    expect(formatRefreshTime(oneMinuteThirtySecondsAgo)).toBe("1mAgo");
  });

  it("rounds down hours", () => {
    // 2 hours and 30 minutes ago = 9000 seconds = 2 hours and 30 minutes
    const twoHoursThirtyMinutesAgo = Date.now() - 9000 * 1000;
    expect(formatRefreshTime(twoHoursThirtyMinutesAgo)).toBe("2hAgo");
  });
});

// ─── updateCashflowPanel Tests ──────────────────────────────
describe("updateCashflowPanel", () => {
  let mockContentEl;

  beforeEach(() => {
    mockContentEl = document.createElement("div");
    getSectionContent.mockReturnValue(mockContentEl);
    // Reset STATE to initial values
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.error = null;
    STATE.cashflow.todayItems = [];
    STATE.cashflow.yesterdayItems = [];
  });

  it("returns early if no content element found", () => {
    getSectionContent.mockReturnValue(null);
    updateCashflowPanel();
    expect(mockContentEl.innerHTML).toBe("");
  });

  it("displays loading message when cashflow is loading", () => {
    STATE.cashflow.loading = true;
    STATE.cashflow.loaded = false;

    updateCashflowPanel();

    expect(mockContentEl.innerHTML).toContain("loadingCashflow");
  });

  it("displays error message when cashflow has error", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = false;
    STATE.cashflow.error = "Failed to fetch data";

    updateCashflowPanel();

    expect(mockContentEl.innerHTML).toContain("Error");
    expect(mockContentEl.innerHTML).toContain("Failed to fetch data");
    expect(mockContentEl.innerHTML).toContain("var(--scx-color-error)");
  });

  it("displays no data message when no cashflow data available", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = false;
    STATE.cashflow.error = null;
    STATE.cashflow.todayItems = [];
    STATE.cashflow.yesterdayItems = [];

    updateCashflowPanel();

    expect(mockContentEl.innerHTML).toContain("noCashflowData");
  });

  it("displays dashboard with formatted amounts when data is available", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.error = null;
    STATE.cashflow.todayItems = [{ id: 1 }];
    STATE.cashflow.todaySummary = {
      totalIncome: 1500000,
      totalExpense: 1200000,
      incomeByType: { s: 1000000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 1000000, w: 200000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.yesterdaySummary = {
      totalIncome: 1400000,
      totalExpense: 1150000,
      incomeByType: { s: 900000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 950000, w: 200000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.lastRefreshAt = null;

    updateCashflowPanel();

    const html = mockContentEl.innerHTML;
    expect(html).toContain("todaysNetProfit");
    expect(html).toContain("$300,000.00"); // net profit: 1500000 - 1200000
    expect(html).toContain("$50,000.00"); // diff: (300000) - (250000)
    expect(html).toContain("$1,500,000.00"); // today's total income
    expect(html).toContain("$1,200,000.00"); // today's total expense
  });

  it("calculates percentage changes correctly", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.todayItems = [{ id: 1 }];
    STATE.cashflow.yesterdayItems = [{ id: 1 }];
    STATE.cashflow.todaySummary = {
      totalIncome: 2000000,
      totalExpense: 1000000,
      incomeByType: { s: 1000000, t: 1000000, m: 0, other: 0 },
      expenseByType: { p: 500000, w: 500000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.yesterdaySummary = {
      totalIncome: 1000000, // 100% increase
      totalExpense: 500000, // 100% increase
      incomeByType: { s: 500000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 250000, w: 250000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    updateCashflowPanel();

    const html = mockContentEl.innerHTML;
    // Income increased 100%
    expect(html).toContain("+100%");
    // Expense increased 100%
    expect(html).toContain("+100%");
  });

  it("shows positive color for profit increase", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.todayItems = [{ id: 1 }];
    STATE.cashflow.yesterdayItems = [{ id: 1 }];
    STATE.cashflow.todaySummary = {
      totalIncome: 2000000,
      totalExpense: 1000000, // profit: 1000000
      incomeByType: { s: 1000000, t: 1000000, m: 0, other: 0 },
      expenseByType: { p: 500000, w: 500000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.yesterdaySummary = {
      totalIncome: 1500000,
      totalExpense: 1200000, // profit: 300000
      incomeByType: { s: 750000, t: 750000, m: 0, other: 0 },
      expenseByType: { p: 600000, w: 600000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    updateCashflowPanel();

    const html = mockContentEl.innerHTML;
    // Profit increased from 300000 to 1000000 (+700000)
    expect(html).toContain("var(--scx-color-success)"); // green color for positive
  });

  it("shows negative color for profit decrease", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.todayItems = [{ id: 1 }];
    STATE.cashflow.yesterdayItems = [{ id: 1 }];
    STATE.cashflow.todaySummary = {
      totalIncome: 500000,
      totalExpense: 1000000, // profit: -500000
      incomeByType: { s: 500000, t: 0, m: 0, other: 0 },
      expenseByType: { p: 800000, w: 200000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.yesterdaySummary = {
      totalIncome: 1500000,
      totalExpense: 1200000, // profit: 300000
      incomeByType: { s: 1000000, t: 500000, m: 0, other: 0 },
      expenseByType: { p: 600000, w: 600000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    updateCashflowPanel();

    const html = mockContentEl.innerHTML;
    // Profit decreased from 300000 to -500000 (-800000)
    expect(html).toContain("var(--scx-color-error)"); // red color for negative
  });

  it("includes breakdown rows with formatted thousands separators", () => {
    STATE.cashflow.loading = false;
    STATE.cashflow.loaded = true;
    STATE.cashflow.todayItems = [{ id: 1 }];
    STATE.cashflow.yesterdayItems = [{ id: 1 }];
    STATE.cashflow.todaySummary = {
      totalIncome: 3000000,
      totalExpense: 2000000,
      incomeByType: { s: 2000000, t: 1000000, m: 0, other: 0 },
      expenseByType: { p: 1500000, w: 500000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };
    STATE.cashflow.yesterdaySummary = {
      totalIncome: 2500000,
      totalExpense: 1800000,
      incomeByType: { s: 1500000, t: 1000000, m: 0, other: 0 },
      expenseByType: { p: 1500000, w: 300000, m: 0, t: 0, f: 0, c: 0, A: 0, other: 0 },
    };

    updateCashflowPanel();

    const html = mockContentEl.innerHTML;
    expect(html).toContain("$2,000,000.00"); // retail income
    expect(html).toContain("$1,000,000.00"); // contract income / wage expense
    expect(html).toContain("$1,500,000.00"); // production expense
  });
});
