import { describe, expect, it } from "vitest";
import {
  RESOURCE_NEEDS_COOLDOWN_MS,
  aggregateNeeds,
  allocateStock,
  cheapestAtQuality,
  compareCash,
  compareWithStock,
  cooldownRemainingMs,
  indexingGap,
  inputQualityFor,
  isCheckedByDefault,
  mergeCapturedRates,
  normalizeBuilding,
  parsePeriodHours,
  productsForBuilding,
  resolveProduct,
  resolveRates,
  selectProductionBuildings,
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
  it("keeps production buildings the product list knows and reads their state", () => {
    const unknownKind = { id: 3, kind: "?", category: "production", name: "Mystery", size: 1, busy: null };
    const list = selectProductionBuildings([quarry, upgrading, seasonal, unknownKind]);
    expect(list.map((b) => b.id)).toEqual([54429942, 57799836]);
    expect(list[0]).toMatchObject({ kind: "Q", status: "producing", productId: 44 });
    expect(list[0].freeAt).toBe(Date.parse(quarry.busy.started) + 86400 * 1000);
    expect(list[1]).toMatchObject({ status: "upgrading", productId: null });
  });

  it("checks every building except upgrading ones", () => {
    expect(isCheckedByDefault(normalizeBuilding(quarry))).toBe(true);
    expect(isCheckedByDefault(normalizeBuilding(upgrading))).toBe(false);
    expect(isCheckedByDefault(normalizeBuilding({ id: 2, category: "production", busy: null }))).toBe(true);
  });
});

describe("products per building", () => {
  it("lists what each building letter can make", () => {
    expect(productsForBuilding("Q")).toEqual([44, 104, 105]);
    expect(productsForBuilding("E")).toEqual([1]);
    expect(productsForBuilding("?")).toEqual([]);
  });

  it("keeps a saved product only when the building can make it", () => {
    const building = normalizeBuilding(quarry);
    expect(resolveProduct(building, 104)).toBe(104);
    expect(resolveProduct(building, 1)).toBe(44);
    expect(resolveProduct(building, null)).toBe(44);
    expect(resolveProduct(normalizeBuilding({ id: 9, kind: "E", category: "production" }), null)).toBe(1);
    expect(resolveProduct(normalizeBuilding(upgrading), null)).toBeNull();
  });
});

describe("resolveRates", () => {
  const captured = mergeCapturedRates(
    null,
    {
      level: 16,
      wagesPerHour: null,
      rates: [
        { productId: 44, unitsPerHour: 24000, wagesPerHour: 6000 },
        { productId: 45, unitsPerHour: 5000, wagesPerHour: 6000 },
      ],
    },
    NOW,
  );

  it("uses building page rates as read and building wages for any product", () => {
    expect(resolveRates(captured, 44)).toEqual({ unitsPerHour: 24000, wagesPerHour: 6000 });
    expect(resolveRates(captured, 3)).toEqual({ unitsPerHour: null, wagesPerHour: 6000 });
    expect(resolveRates(null, 44)).toEqual({ unitsPerHour: null, wagesPerHour: null });
  });
});

describe("mergeCapturedRates", () => {
  const reading = (level, wagesPerHour, rates) => ({ level, wagesPerHour, rates });

  it("keeps products seen earlier and takes header level and wages from any visit", () => {
    const first = mergeCapturedRates(
      null,
      reading(12, null, [{ productId: 16, unitsPerHour: 900, wagesPerHour: 8000 }]),
      NOW,
    );
    const second = mergeCapturedRates(first, reading(12, 8290, []), NOW);
    expect(second).toEqual({
      size: 12,
      at: NOW,
      wagesPerHour: 8290,
      products: { 16: { unitsPerHour: 900, wagesPerHour: 8000 } },
    });
  });

  it("scales what it remembered when the page shows a new level", () => {
    const before = mergeCapturedRates(
      null,
      reading(10, 1000, [{ productId: 16, unitsPerHour: 100, wagesPerHour: 1000 }]),
      NOW,
    );
    const after = mergeCapturedRates(before, reading(12, null, []), NOW);
    expect(after.size).toBe(12);
    expect(after.wagesPerHour).toBe(1200);
    expect(after.products[16]).toEqual({ unitsPerHour: 120, wagesPerHour: 1200 });
    expect(mergeCapturedRates(before, reading(null, null, []), NOW).wagesPerHour).toBe(1000);
  });
});

describe("indexingGap", () => {
  const seen = { size: 12, at: NOW, wagesPerHour: 1, products: {} };

  it("names what is still missing", () => {
    expect(indexingGap({ unitsPerHour: 1, wagesPerHour: 1 }, 16, null)).toBe("building");
    expect(indexingGap({ unitsPerHour: 1, wagesPerHour: 1 }, 16, seen)).toBeNull();
    expect(indexingGap({ unitsPerHour: null, wagesPerHour: 1 }, 16, seen)).toBe("units");
    expect(indexingGap({ unitsPerHour: 1, wagesPerHour: null }, 16, seen)).toBe("wages");
    expect(indexingGap({ unitsPerHour: 1, wagesPerHour: 1 }, null, seen)).toBe("product");
  });
});

describe("quality", () => {
  it("lets inputs be one quality below the output", () => {
    expect(inputQualityFor(0)).toBe(0);
    expect(inputQualityFor(1)).toBe(0);
    expect(inputQualityFor(5)).toBe(4);
    expect(inputQualityFor(99)).toBe(11);
  });

  it("finds the cheapest listing at or above a quality", () => {
    const listings = [
      { quality: 0, price: 1 },
      { quality: 3, price: 1.5 },
      { quality: 5, price: 1.4 },
      { quality: 6, price: 2 },
    ];
    expect(cheapestAtQuality(listings, 0)).toBe(1);
    expect(cheapestAtQuality(listings, 3)).toBe(1.4);
    expect(cheapestAtQuality(listings, 6)).toBe(2);
    expect(cheapestAtQuality(listings, 7)).toBeNull();
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

  it("adds inputs per required quality and wages, skipping buildings without game numbers", () => {
    const result = aggregateNeeds(
      [
        { buildingId: 1, productId: 16, quality: 0, hours: 10, unitsPerHour: 100, wagesPerHour: 50 },
        { buildingId: 2, productId: 16, quality: 5, hours: 1, unitsPerHour: 100, wagesPerHour: 50 },
        { buildingId: 3, productId: 16, quality: 0, hours: 0, unitsPerHour: 100, wagesPerHour: 50 },
        { buildingId: 4, productId: 16, quality: 0, hours: 5, unitsPerHour: null, wagesPerHour: 50 },
      ],
      (id) => recipes[id],
    );
    expect(result.inputs).toEqual([
      { productId: 44, quality: 0, amount: 2000 },
      { productId: 2, quality: 0, amount: 500 },
      { productId: 44, quality: 4, amount: 200 },
      { productId: 2, quality: 4, amount: 50 },
    ]);
    expect(result.wages).toBe(550);
  });

  it("covers higher-quality needs first and uses only stock that is good enough", () => {
    const needs = [
      { productId: 44, quality: 0, amount: 100 },
      { productId: 44, quality: 4, amount: 100 },
    ];
    const covered = allocateStock(needs, [
      { kind: 44, quality: 0, amount: 30 },
      { kind: 44, quality: 3, amount: 500 },
      { kind: 44, quality: 5, amount: 120 },
    ]);
    expect(covered.get("44:4")).toBe(100);
    expect(covered.get("44:0")).toBe(100);

    const lowOnly = allocateStock(
      [{ productId: 44, quality: 4, amount: 100 }],
      [{ kind: 44, quality: 3, amount: 500 }],
    );
    expect(lowOnly.get("44:4")).toBe(0);
  });

  it("prices the shortfall per product and quality", () => {
    const result = compareWithStock(
      [
        { productId: 44, quality: 0, amount: 2000 },
        { productId: 44, quality: 4, amount: 100 },
        { productId: 2, quality: 0, amount: 500 },
        { productId: 7, quality: 0, amount: 10 },
      ],
      [
        { kind: 44, quality: 0, amount: 1500 },
        { kind: 2, quality: 1, amount: 900 },
      ],
      { "44:0": 0.8, "44:4": 1.2 },
    );
    expect(result.rows.map((r) => [r.key, r.missing, r.buyCost])).toEqual([
      ["44:0", 500, 400],
      ["44:4", 100, 120],
      ["7:0", 10, null],
      ["2:0", 0, null],
    ]);
    expect(result.buyTotal).toBe(520);
    expect(result.unpriced).toBe(1);
  });

  it("compares wages plus purchases with cash", () => {
    expect(compareCash(500, 400, 1000)).toEqual({ needed: 900, cash: 1000, gap: 0 });
    expect(compareCash(500, 400, 600)).toEqual({ needed: 900, cash: 600, gap: 300 });
    expect(compareCash(500, 0, NaN)).toEqual({ needed: 500, cash: null, gap: null });
  });
});

describe("cooldownRemainingMs", () => {
  it("counts down from the last run", () => {
    expect(cooldownRemainingMs(0, NOW)).toBe(0);
    expect(cooldownRemainingMs(NOW - 30_000, NOW)).toBe(RESOURCE_NEEDS_COOLDOWN_MS - 30_000);
    expect(cooldownRemainingMs(NOW - RESOURCE_NEEDS_COOLDOWN_MS, NOW)).toBe(0);
  });
});
