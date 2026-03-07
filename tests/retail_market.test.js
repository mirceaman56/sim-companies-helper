// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));

import {
  computeRetailTrends,
  computeOpportunityScore,
  getRetailBadge,
} from "../src/retail_calc.js";
import {
  fetchRetailInfo,
  fetchRetailInfoForProduct,
  getCachedRetailInfo,
  invalidateRetailInfoCache,
} from "../src/retail_market.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Build a stub retailData array of `n` days. */
function makeRetailData(n, { price = 10, demand = 0.15, saturation = 1.65 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    averagePrice: price,
    demand,
    saturation,
    amountSoldRestaurant: 0,
    date: `2026-02-${String(i + 1).padStart(2, "0")}`,
  }));
}

/** Build a stub retail-info item with the last day overridden. */
function makeItem(dbLetter, { basePrice = 10, baseSat = 1.65, baseDemand = 0.15, lastPrice, lastSat, lastDemand, count = 10 } = {}) {
  const data = makeRetailData(count, { price: basePrice, saturation: baseSat, demand: baseDemand });
  // override last day
  data[data.length - 1] = {
    averagePrice: lastPrice ?? basePrice,
    saturation: lastSat ?? baseSat,
    demand: lastDemand ?? baseDemand,
    amountSoldRestaurant: 0,
    date: "2026-03-06",
  };
  return { dbLetter, quality: null, averagePrice: lastPrice ?? basePrice, saturation: lastSat ?? baseSat, retailData: data };
}

// ─── computeRetailTrends ─────────────────────────────────────────────────────

describe("computeRetailTrends", () => {
  it("returns null when item is null", () => {
    expect(computeRetailTrends(null)).toBeNull();
  });

  it("returns null when retailData is missing", () => {
    expect(computeRetailTrends({ dbLetter: 1 })).toBeNull();
  });

  it("returns null when retailData has only 1 entry", () => {
    const item = { retailData: makeRetailData(1) };
    expect(computeRetailTrends(item)).toBeNull();
  });

  it("returns zero deltas when price/sat/demand are all flat", () => {
    const item = makeItem(3, { count: 10 });
    const trends = computeRetailTrends(item);
    expect(trends).not.toBeNull();
    expect(trends.priceDelta7d).toBeCloseTo(0, 6);
    expect(trends.satDelta7d).toBeCloseTo(0, 6);
    expect(trends.demandDelta7d).toBeCloseTo(0, 6);
  });

  it("computes positive priceDelta7d when last price is higher", () => {
    const item = makeItem(3, { basePrice: 10, lastPrice: 11, count: 10 });
    const trends = computeRetailTrends(item);
    expect(trends.priceDelta7d).toBeGreaterThan(0);
  });

  it("computes negative satDelta7d when last saturation falls", () => {
    const item = makeItem(3, { baseSat: 1.7, lastSat: 1.5, count: 10 });
    const trends = computeRetailTrends(item);
    expect(trends.satDelta7d).toBeLessThan(0);
  });

  it("exposes currentPrice from most recent day", () => {
    const item = makeItem(5, { lastPrice: 12.5, count: 10 });
    const trends = computeRetailTrends(item);
    expect(trends.currentPrice).toBeCloseTo(12.5);
  });
});

// ─── computeOpportunityScore ─────────────────────────────────────────────────

describe("computeOpportunityScore", () => {
  it("returns NaN for null trends", () => {
    expect(computeOpportunityScore(null)).toBeNaN();
  });

  it("returns positive score for hot conditions (price up, sat down, demand up)", () => {
    const score = computeOpportunityScore({
      priceDelta7d: 0.05,
      satDelta7d: -0.05,
      demandDelta7d: 0.05,
    });
    expect(score).toBeGreaterThan(0);
  });

  it("returns negative score for crowded conditions (price down, sat up)", () => {
    const score = computeOpportunityScore({
      priceDelta7d: -0.05,
      satDelta7d: 0.05,
      demandDelta7d: -0.02,
    });
    expect(score).toBeLessThan(0);
  });

  it("clamps to +1 on extreme positive input", () => {
    const score = computeOpportunityScore({
      priceDelta7d: 5,
      satDelta7d: -5,
      demandDelta7d: 5,
    });
    expect(score).toBe(1);
  });

  it("clamps to -1 on extreme negative input", () => {
    const score = computeOpportunityScore({
      priceDelta7d: -5,
      satDelta7d: 5,
      demandDelta7d: -5,
    });
    expect(score).toBe(-1);
  });

  it("returns near-zero score for stable conditions", () => {
    const score = computeOpportunityScore({
      priceDelta7d: 0.001,
      satDelta7d: 0.001,
      demandDelta7d: 0.001,
    });
    expect(Math.abs(score)).toBeLessThan(0.01);
  });
});

// ─── getRetailBadge ───────────────────────────────────────────────────────────

describe("getRetailBadge", () => {
  it("returns noData when score is NaN", () => {
    const b = getRetailBadge(NaN, null);
    expect(b.label).toBe("retailBadgeNoData");
    expect(b.cls).toBe("scx-chip-na");
  });

  it("returns noData when trends is null", () => {
    const b = getRetailBadge(0.5, null);
    expect(b.label).toBe("retailBadgeNoData");
  });

  it("returns Hot when price rising and saturation falling", () => {
    const b = getRetailBadge(0.1, { priceDelta7d: 0.05, satDelta7d: -0.03, currentSat: 1.5 });
    expect(b.label).toBe("retailBadgeHot");
    expect(b.cls).toBe("scx-chip-excellent");
  });

  it("returns Recovery when saturation falling but price flat", () => {
    const b = getRetailBadge(0.02, { priceDelta7d: 0.005, satDelta7d: -0.04, currentSat: 1.6 });
    expect(b.label).toBe("retailBadgeRecovery");
    expect(b.cls).toBe("scx-chip-good");
  });

  it("returns Crowded when saturation rising and price flat/falling", () => {
    const b = getRetailBadge(-0.05, { priceDelta7d: -0.01, satDelta7d: 0.05, currentSat: 1.8 });
    expect(b.label).toBe("retailBadgeCrowded");
    expect(b.cls).toBe("scx-chip-bad");
  });

  it("returns Falling when price drops significantly", () => {
    const b = getRetailBadge(-0.05, { priceDelta7d: -0.04, satDelta7d: 0.01, currentSat: 1.6 });
    expect(b.label).toBe("retailBadgeFalling");
    expect(b.cls).toBe("scx-chip-bad");
  });

  it("returns Stable for small changes", () => {
    const b = getRetailBadge(0.001, { priceDelta7d: 0.005, satDelta7d: 0.005, currentSat: 1.65 });
    expect(b.label).toBe("retailBadgeStable");
    expect(b.cls).toBe("scx-chip-meh");
  });
});

// ─── retail_market module ─────────────────────────────────────────────────────

describe("fetchRetailInfo", () => {
  beforeEach(() => {
    invalidateRetailInfoCache();
    vi.restoreAllMocks();
  });

  it("fetches and caches retail info", async () => {
    const mockData = [
      makeItem(3),
      makeItem(4),
      { dbLetter: 5, quality: 1, retailData: [] }, // quality !== null, should be filtered out
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const result = await fetchRetailInfo(0);
    expect(result).toHaveLength(2); // quality=1 item filtered
    expect(result[0].dbLetter).toBe(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should use cache, not fetch again
    await fetchRetailInfo(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchRetailInfo(0)).rejects.toThrow("HTTP 503");
  });
});

describe("fetchRetailInfoForProduct", () => {
  beforeEach(() => {
    invalidateRetailInfoCache();
  });

  it("returns the matching item by dbLetter", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [makeItem(3), makeItem(7)],
    });
    const item = await fetchRetailInfoForProduct(0, 7);
    expect(item).not.toBeNull();
    expect(item.dbLetter).toBe(7);
  });

  it("returns null when dbLetter not found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [makeItem(3)],
    });
    const item = await fetchRetailInfoForProduct(0, 99);
    expect(item).toBeNull();
  });
});

describe("getCachedRetailInfo", () => {
  beforeEach(() => {
    invalidateRetailInfoCache();
  });

  it("returns null when cache is empty", () => {
    expect(getCachedRetailInfo(3)).toBeNull();
  });

  it("returns cached item after fetch", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [makeItem(3)],
    });
    await fetchRetailInfo(0);
    expect(getCachedRetailInfo(3)).not.toBeNull();
    expect(getCachedRetailInfo(3).dbLetter).toBe(3);
  });
});
