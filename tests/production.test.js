import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/state.js", () => ({
  STATE: { marketCache: new Map(), marketState: {} },
}));

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

import {
  getRecipes,
  getRecipeByProductId,
  analyzeProduction,
  fetchMarketPrices,
  buildPriceKey,
} from "../src/production.js";
import { MARKET_FEE, TRANSPORT_RESOURCE_ID } from "../src/utils.js";

const MOCK_PRICES = new Map([
  [TRANSPORT_RESOURCE_ID, 4.5],
  [42, 120.0],
]);

describe("getRecipes", () => {
  it("returns an array of recipes", () => {
    const recipes = getRecipes();
    expect(Array.isArray(recipes)).toBe(true);
    expect(recipes.length).toBeGreaterThan(0);
  });

  it("each recipe has id, name, and materials", () => {
    const recipe = getRecipes()[0];
    expect(recipe).toHaveProperty("id");
    expect(recipe).toHaveProperty("name");
    expect(recipe).toHaveProperty("materials");
  });
});

describe("getRecipeByProductId", () => {
  it("finds a recipe by its product id", () => {
    const recipes = getRecipes();
    const first = recipes[0];
    const found = getRecipeByProductId(first.id);
    expect(found).toEqual(first);
  });

  it("returns undefined for unknown id", () => {
    expect(getRecipeByProductId(999999)).toBeUndefined();
  });
});

describe("fetchMarketPrices", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { quality: 0, price: 5.0, quantity: 100 },
            { quality: 1, price: 5.5, quantity: 200 },
          ]),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a Map of productId to price", async () => {
    const prices = await fetchMarketPrices(0, [1, 2]);
    expect(prices).toBeInstanceOf(Map);
    expect(prices.size).toBe(2);
    expect(prices.get(1)).toBe(5.0);
  });

  it("returns empty map when no ids given", async () => {
    const prices = await fetchMarketPrices(0, []);
    expect(prices.size).toBe(0);
  });

  it("keys quality requests separately and uses the quality price", async () => {
    const prices = await fetchMarketPrices(0, [{ productId: 1, quality: 1 }, { productId: 2 }]);

    expect(prices.get(buildPriceKey(1, 1))).toBe(5.5);
    expect(prices.get(buildPriceKey(2))).toBe(5.0);
    expect(prices.has(1)).toBe(false);
  });
});

describe("analyzeProduction", () => {
  it("returns null for unknown product", async () => {
    const result = await analyzeProduction(999999, 10, MOCK_PRICES, 0, 50);
    expect(result).toBeNull();
  });

  it("returns error when uiUnitCost is null", async () => {
    const recipes = getRecipes();
    const recipe = recipes[0];
    const result = await analyzeProduction(recipe.id, 10, MOCK_PRICES, 0, null);

    expect(result).not.toBeNull();
    expect(result.error).toBe("unitCostNotFound");
    expect(result.productionCost).toBeNaN();
  });

  it("calculates correct production cost from uiUnitCost * quantity", async () => {
    const recipes = getRecipes();
    const recipe = recipes[0];
    const qty = 10;
    const unitCost = 25.0;

    const result = await analyzeProduction(recipe.id, qty, new Map(), null, unitCost);
    expect(result.productionCost).toBe(unitCost * qty);
    expect(result.unitCost).toBe(unitCost);
    expect(result.quantity).toBe(qty);
  });

  it("calculates break-even prices with market fee", async () => {
    const recipes = getRecipes();
    const recipe = recipes.find((r) => r.transport > 0) || recipes[0];
    const qty = 10;
    const unitCost = 20.0;
    const containerPrice = 4.5;
    const prices = new Map([
      [TRANSPORT_RESOURCE_ID, containerPrice],
      [recipe.id, 100.0],
    ]);

    const result = await analyzeProduction(recipe.id, qty, prices, 0, unitCost);
    expect(result.breakEvenAnalysis).not.toBeNull();

    const transportPerUnit = recipe.transport || 0;
    const baseCost = unitCost * qty;
    const marketTransport = transportPerUnit * qty * containerPrice;
    const expectedMarketBE = (baseCost + marketTransport) / (1 - MARKET_FEE) / qty;

    expect(result.breakEvenAnalysis.market.breakEvenPrice).toBeCloseTo(expectedMarketBE, 2);

    const contractTransport = (transportPerUnit / 2) * qty * containerPrice;
    const expectedContractBE = (baseCost + contractTransport) / qty;
    expect(result.breakEvenAnalysis.contract.breakEvenPrice).toBeCloseTo(expectedContractBE, 2);
  });

  it("calculates profit analysis with market fee deducted from revenue", async () => {
    const recipes = getRecipes();
    const recipe = recipes[0];
    const qty = 5;
    const unitCost = 10.0;
    const marketPrice = 50.0;
    const prices = new Map([
      [TRANSPORT_RESOURCE_ID, 0],
      [recipe.id, marketPrice],
    ]);

    const result = await analyzeProduction(recipe.id, qty, prices, 0, unitCost);
    const baseCost = unitCost * qty;
    const revenue = marketPrice * qty;

    const expectedMarketProfit = revenue * (1 - MARKET_FEE) - baseCost;
    expect(result.profitAnalysis.market.profit).toBeCloseTo(expectedMarketProfit, 2);

    const expectedContractProfit = revenue - baseCost;
    expect(result.profitAnalysis.contract.profit).toBeCloseTo(expectedContractProfit, 2);
  });

  it("uses the quality market price instead of the Q0 price", async () => {
    const recipes = getRecipes();
    const recipe = recipes[0];
    const qty = 10;
    const unitCost = 100;
    const q0Price = 153.0;
    const q4Price = 230.0;

    const prices = new Map([
      [buildPriceKey(TRANSPORT_RESOURCE_ID), 0],
      [buildPriceKey(recipe.id), q0Price],
      [buildPriceKey(recipe.id, 4), q4Price],
    ]);

    const result = await analyzeProduction(recipe.id, qty, prices, 0, unitCost, 4);

    expect(result.quality).toBe(4);
    expect(result.marketPrice).toBe(q4Price);

    const expectedMarketProfit = q4Price * qty * (1 - MARKET_FEE) - unitCost * qty;
    expect(result.profitAnalysis.market.profit).toBeCloseTo(expectedMarketProfit, 2);
  });

  it("falls back to the Q0 price when no quality is given", async () => {
    const recipes = getRecipes();
    const recipe = recipes[0];
    const prices = new Map([
      [buildPriceKey(TRANSPORT_RESOURCE_ID), 0],
      [buildPriceKey(recipe.id), 153.0],
      [buildPriceKey(recipe.id, 4), 230.0],
    ]);

    const result = await analyzeProduction(recipe.id, 10, prices, 0, 100);

    expect(result.quality).toBe(0);
    expect(result.marketPrice).toBe(153.0);
  });

  it("contract uses half the transport cost of market", async () => {
    const recipes = getRecipes();
    const recipe = recipes.find((r) => r.transport > 0);
    if (!recipe) return; // skip if no recipe with transport

    const qty = 10;
    const unitCost = 20;
    const containerPrice = 5;
    const prices = new Map([
      [TRANSPORT_RESOURCE_ID, containerPrice],
      [recipe.id, 100],
    ]);

    const result = await analyzeProduction(recipe.id, qty, prices, 0, unitCost);
    expect(result.breakEvenAnalysis.contract.transportCost).toBe(
      result.breakEvenAnalysis.market.transportCost / 2,
    );
  });
});
