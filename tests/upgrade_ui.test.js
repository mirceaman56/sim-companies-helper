// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

// Stub localStorage so the module loads without errors
global.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
};

// Stub MutationObserver so initUpgradeBuyMessage doesn't throw
global.MutationObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

import { _testUtils } from "../src/upgrade_ui.js";
const { buildBuyMessage } = _testUtils;

// ---------------------------------------------------------------------------
// Base resources mirroring the upgrade building modal (no warehouse stock)
// RC=101(0dec), Bricks=102(1dec), Planks=108(1dec), CU=111(0dec)
// ---------------------------------------------------------------------------
const BASE_RESOURCES = [
  { recipeId: 101, requiredQty: 140,  warehouse: 0, price: 222,  decimals: 0 },
  { recipeId: 102, requiredQty: 1925, warehouse: 0, price: 11.4, decimals: 1 },
  { recipeId: 108, requiredQty: 560,  warehouse: 0, price: 11.4, decimals: 1 },
  { recipeId: 111, requiredQty: 35,   warehouse: 0, price: 2870, decimals: 0 },
];

// Partial warehouse: some stock for every item but none fully covered
const PARTIAL_WAREHOUSE = [
  { recipeId: 101, requiredQty: 140,  warehouse: 10,  price: 222,  decimals: 0 },
  { recipeId: 102, requiredQty: 1925, warehouse: 100, price: 11.4, decimals: 1 },
  { recipeId: 108, requiredQty: 560,  warehouse: 10,  price: 11.4, decimals: 1 },
  { recipeId: 111, requiredQty: 35,   warehouse: 5,   price: 2870, decimals: 0 },
];

// Bricks fully covered by warehouse (1x: 1925 covered; 2x: 3850 covered)
function bricksFullyCovered(warehouseBricks) {
  return [
    { recipeId: 101, requiredQty: 140,  warehouse: 0,               price: 222,  decimals: 0 },
    { recipeId: 102, requiredQty: 1925, warehouse: warehouseBricks,  price: 11.4, decimals: 1 },
    { recipeId: 108, requiredQty: 560,  warehouse: 0,                price: 11.4, decimals: 1 },
    { recipeId: 111, requiredQty: 35,   warehouse: 0,               price: 2870, decimals: 0 },
  ];
}

describe("buildBuyMessage", () => {
  it.each([
    // ── multiplier 1 ────────────────────────────────────────────────────────
    {
      name: "all 4 items needed, no warehouse, multiplier 1",
      resources: BASE_RESOURCES,
      multiplier: 1,
      expected:
        "Buying\n" +
        "140 :re-101: @ $222\n" +
        "1925 :re-102: @ $11.4\n" +
        "560 :re-108: @ $11.4\n" +
        "35 :re-111: @ $2,870",
    },
    {
      name: "all 4 items needed, partial warehouse, multiplier 1",
      resources: PARTIAL_WAREHOUSE,
      multiplier: 1,
      expected:
        "Buying\n" +
        "130 :re-101: @ $222\n" +
        "1825 :re-102: @ $11.4\n" +
        "550 :re-108: @ $11.4\n" +
        "30 :re-111: @ $2,870",
    },
    {
      name: "3 of 4 items needed, bricks fully covered by warehouse, multiplier 1",
      resources: bricksFullyCovered(1925),
      multiplier: 1,
      expected:
        "Buying\n" +
        "140 :re-101: @ $222\n" +
        "560 :re-108: @ $11.4\n" +
        "35 :re-111: @ $2,870",
    },

    // ── multiplier 2 ────────────────────────────────────────────────────────
    {
      name: "all 4 items needed, no warehouse, multiplier 2",
      resources: BASE_RESOURCES,
      multiplier: 2,
      expected:
        "Buying\n" +
        "280 :re-101: @ $222\n" +
        "3850 :re-102: @ $11.4\n" +
        "1120 :re-108: @ $11.4\n" +
        "70 :re-111: @ $2,870",
    },
    {
      name: "all 4 items needed, partial warehouse, multiplier 2",
      resources: PARTIAL_WAREHOUSE,
      multiplier: 2,
      expected:
        "Buying\n" +
        "270 :re-101: @ $222\n" +
        "3750 :re-102: @ $11.4\n" +
        "1110 :re-108: @ $11.4\n" +
        "65 :re-111: @ $2,870",
    },
    {
      name: "3 of 4 items needed, bricks fully covered by warehouse for 2x, multiplier 2",
      resources: bricksFullyCovered(3850),
      multiplier: 2,
      expected:
        "Buying\n" +
        "280 :re-101: @ $222\n" +
        "1120 :re-108: @ $11.4\n" +
        "70 :re-111: @ $2,870",
    },
  ])("$name", ({ resources, multiplier, expected }) => {
    expect(buildBuyMessage(resources, multiplier, 0)).toBe(expected);
  });
});
