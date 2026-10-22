import { describe, expect, it } from "vitest";
import {
  RESOURCE_NEEDS_COOLDOWN_MS,
  aggregateNeeds,
  indexingGap,
  mergeCapturedRates,
  compareCash,
  compareWithStock,
  cooldownRemainingMs,
  isCheckedByDefault,
  normalizeBuilding,
  parsePeriodHours,
  resolveRates,
  selectProductionBuildings,
  sumStockByKind,
} from "../src/resource_needs_calc.js";

const NOW = new Date(2026, 9, 13, 18, 0, 0).getTime();

const quarry = {
  id: 54429942,
  kind: "Q",
  category: "production",
  name: "Quarry",
  size: 16,
  busy: {
    started: "2026-10-13T05:07:34.291166+00:00",
    duration: 86400,
    category: "r",
    resource: { amount: 240000, kind: 44, name: "Sand" },
  },
};
const upgrading = {
  id: 57799836,
  kind: "Y",
  category: "production",
  name: "Factory",
  size: 12,
  busy: { started: "2026-10-12T18:31:13.814032+00:00", duration: 118800, category: "b", expanding: true },
};
const seasonal = { id: 1, kind: "t", category: "seasonal", name: "Halloween market", size: 4, busy: null };

describe("parsePeriodHours", () => {
  it("reads durations in hours and days", () => {
    expect(parsePeriodHours("48", NOW)).toBe(48);
    expect(parsePeriodHours("48h", NOW)).toBe(48);
    expect(parsePeriodHours("1,5h", NOW)).toBe(1.5);
    expect(parsePeriodHours("2d", NOW)).toBe(48);
  });

  it("reads an end time as hours until its next occurrence", () => {
    expect(parsePeriodHours("20:15", NOW)).toBeCloseTo(2.25);
    expect(parsePeriodHours("8:15 pm", NOW)).toBeCloseTo(2.25);
    expect(parsePeriodHours("06:00", NOW)).toBe(12);
  });

  it("rejects text it does not understand", () => {
    for (const bad of ["", "abc", "25:00", "0", "-4h", "13:00 pm", "9999h"]) {
      expect(parsePeriodHours(bad, NOW)).toBeNull();
    }
  });
});

describe("buildings", () => {
  it("keeps production buildings only and reads their state", () => {
    const list = selectProductionBuildings([quarry, upgrading, seasonal]);
    expect(list.map((b) => b.id)).toEqual([54429942, 57799836]);
    expect(list[0]).toMatchObject({ status: "producing", productId: 44, runUnitsPerHour: 10000 });
    expect(list[0].freeAt).toBe(Date.parse(quarry.busy.started) + 86400 * 1000);
    expect(list[1]).toMatchObject({ status: "upgrading", productId: null });
  });

  it("checks every building except upgrading ones", () => {
    expect(isCheckedByDefault(normalizeBuilding(quarry))).toBe(true);
    expect(isCheckedByDefault(normalizeBuilding(upgrading))).toBe(false);
    expect(isCheckedByDefault(normalizeBuilding({ id: 2, category: "production", busy: null }))).toBe(true);
  });
});

describe("resolveRates", () => {
  const building = normalizeBuilding(quarry);
  const captured = mergeCapturedRates(
    null,
    {
      level: 16,
      wagesPerHour: null,
      offers: [],
      rates: [
        { productId: 44, unitsPerHour: 24000, wagesPerHour: 6000 },
        { productId: 45, unitsPerHour: 5000, wagesPerHour: 6000 },
      ],
    },
    NOW,
  );

  it("uses building page rates as read", () => {
    expect(resolveRates(building, captured, {}, 44)).toEqual({
      unitsPerHour: 24000,
      unitsSource: "page",
      wagesPerHour: 6000,
      wagesSource: "page",
    });
  });

  it("lets overrides win", () => {
    expect(resolveRates(building, captured, { unitsPerHour: 500, wagesPerHour: 100 }, 44)).toMatchObject({
      unitsPerHour: 500,
      unitsSource: "override",
      wagesPerHour: 100,
      wagesSource: "override",
    });
  });

  it("falls back to the running order for units and keeps building wages for any product", () => {
    expect(resolveRates(building, null, {}, 44)).toMatchObject({ unitsPerHour: 10000, unitsSource: "run" });
    expect(resolveRates(building, captured, {}, 3)).toMatchObject({
      unitsPerHour: null,
      wagesPerHour: 6000,
      wagesSource: "page",
    });
    expect(resolveRates(building, null, {}, 3)).toMatchObject({ unitsPerHour: null, wagesPerHour: null });
  });
});

describe("mergeCapturedRates", () => {
  const reading = (level, wagesPerHour, offers, rates) => ({ level, wagesPerHour, offers, rates });

  it("keeps products seen earlier and takes header level and wages from any visit", () => {
    const first = mergeCapturedRates(
      null,
      reading(12, null, [16, 17], [{ productId: 16, unitsPerHour: 900, wagesPerHour: 8000 }]),
      NOW,
    );
    const second = mergeCapturedRates(first, reading(12, 8290, [], []), NOW);
    expect(second).toEqual({
      size: 12,
      at: NOW,
      wagesPerHour: 8290,
      offers: [16, 17],
      products: { 16: { unitsPerHour: 900, wagesPerHour: 8000 } },
    });
  });

  it("scales what it remembered when the page shows a new level", () => {
    const before = mergeCapturedRates(
      null,
      reading(10, 1000, [], [{ productId: 16, unitsPerHour: 100, wagesPerHour: 1000 }]),
      NOW,
    );
    const after = mergeCapturedRates(before, reading(12, null, [], []), NOW);
    expect(after.size).toBe(12);
    expect(after.wagesPerHour).toBe(1200);
    expect(after.products[16]).toEqual({ unitsPerHour: 120, wagesPerHour: 1200 });
    expect(mergeCapturedRates(before, reading(null, null, [], []), NOW).wagesPerHour).toBe(1000);
  });
});

describe("indexingGap", () => {
  const rates = (unitsSource, wagesSource) => ({
    unitsPerHour: 1,
    unitsSource,
    wagesPerHour: 1,
    wagesSource,
  });
  const seen = { size: 12, at: NOW, wagesPerHour: 1, offers: null, products: {} };

  it("names what is still missing, treating run estimates as missing", () => {
    expect(indexingGap(rates("page", "page"), 16, null)).toBe("building");
    expect(indexingGap(rates("page", "page"), 16, seen)).toBeNull();
    expect(indexingGap(rates("override", "page"), 16, seen)).toBeNull();
    expect(indexingGap(rates("run", "page"), 16, seen)).toBe("units");
    expect(indexingGap(rates("page", null), 16, seen)).toBe("wages");
    expect(indexingGap(rates("page", "page"), null, seen)).toBe("product");
  });
});

describe("needs and shortfall", () => {
  const recipes = {
    16: {
      id: 16,
      materials: [
        { id: 44, quantity: 2 },
        { id: 2, quantity: 0.5 },
      ],
    },
  };

  it("adds inputs and wages over the period and lists incomplete buildings", () => {
    const result = aggregateNeeds(
      [
        { buildingId: 1, productId: 16, hours: 10, unitsPerHour: 100, wagesPerHour: 50 },
        { buildingId: 2, productId: 16, hours: 0, unitsPerHour: 100, wagesPerHour: 50 },
        { buildingId: 3, productId: null, hours: 5, unitsPerHour: null, wagesPerHour: null },
      ],
      (id) => recipes[id],
    );
    expect(Object.fromEntries(result.inputs)).toEqual({ 44: 2000, 2: 500 });
    expect(result.wages).toBe(500);
    expect(result.incomplete).toEqual([
      { buildingId: 3, missing: "wages" },
      { buildingId: 3, missing: "units" },
    ]);
  });

  it("compares with stock summed over qualities and prices the shortfall", () => {
    const stock = sumStockByKind([
      { kind: 44, amount: 1200 },
      { kind: 44, amount: 300 },
      { kind: 2, amount: 900 },
    ]);
    const result = compareWithStock(
      new Map([
        [44, 2000],
        [2, 500],
        [7, 10],
      ]),
      stock,
      new Map([[44, 0.8]]),
    );
    expect(result.rows.map((r) => [r.productId, r.missing, r.buyCost])).toEqual([
      [44, 500, 400],
      [7, 10, null],
      [2, 0, null],
    ]);
    expect(result.buyTotal).toBe(400);
    expect(result.unpriced).toBe(1);
  });

  it("compares wages plus purchases with cash", () => {
    expect(compareCash(500, 400, 1000)).toEqual({ needed: 900, cash: 1000, gap: 0 });
    expect(compareCash(500, 400, 600)).toEqual({ needed: 900, cash: 600, gap: 300 });
    expect(compareCash(500, 0, NaN)).toEqual({ needed: 500, cash: null, gap: null });
  });
});

describe("cooldownRemainingMs", () => {
  it("counts down five minutes from the last run", () => {
    expect(cooldownRemainingMs(0, NOW)).toBe(0);
    expect(cooldownRemainingMs(NOW - 60_000, NOW)).toBe(RESOURCE_NEEDS_COOLDOWN_MS - 60_000);
    expect(cooldownRemainingMs(NOW - RESOURCE_NEEDS_COOLDOWN_MS, NOW)).toBe(0);
  });
});
