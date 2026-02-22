import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

// Mock STATE
vi.mock("../src/state.js", () => ({
  STATE: {
    marketCache: new Map(),
    marketState: {},
  },
}));

import { fetchMarketPrice } from "../src/market.js";
import { STATE } from "../src/state.js";

const mockMarketData = [
  {
    id: 114998451,
    kind: 4,
    quantity: 14115,
    quality: 1,
    price: 2.85,
  },
  {
    id: 114996793,
    kind: 4,
    quantity: 18205,
    quality: 2,
    price: 2.9,
  },
  {
    id: 114988494,
    kind: 4,
    quantity: 15000,
    quality: 1,
    price: 2.9,
  },
  {
    id: 114986817,
    kind: 4,
    quantity: 532,
    quality: 0,
    price: 2.9,
  },
  {
    id: 114999027,
    kind: 4,
    quantity: 1238415,
    quality: 3,
    price: 2.95,
  },
];

describe("fetchMarketPrice", () => {
  beforeAll(() => {
    // Mock global fetch to prevent any real API calls
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMarketData),
      })
    );
  });

  beforeEach(() => {
    // Clear cache before each test
    STATE.marketCache.clear();
  });

  afterEach(() => {
    // Clean up after each test
    vi.clearAllMocks();
    STATE.marketCache.clear();
  });

  it("should fetch correct price for default quality (0) without quality parameter", async () => {
    // Call fetchMarketPrice WITHOUT quality parameter (uses default quality=0)
    const price = await fetchMarketPrice(0, 4);

    // Should return 2.9 - the price of the first item with quality 0
    expect(price).toBe(2.9);
  });

  it("should fetch correct price for quality 3", async () => {
    // Call fetchMarketPrice WITH quality parameter (quality=3)
    const price = await fetchMarketPrice(0, 4, 3);

    // Should return 2.95 - the price of the first item with quality 3
    expect(price).toBe(2.95);
  });

  it("should fetch correct price for quality 2.4", async () => {
    // Call fetchMarketPrice WITH quality parameter (quality=2.4)
    const price = await fetchMarketPrice(0, 4, 2.4);

    // Should return 2.95 - the price of the first item with quality 3
    expect(price).toBe(2.9);
  });

  it("should fetch correct price for quality 5", async () => {
    // Call fetchMarketPrice WITH quality parameter (quality=5)
    const price = await fetchMarketPrice(0, 4, 5);

    // Should return 2.95 - the price of the first item with quality 3
    expect(price).toBe(2.95);
  });
});
