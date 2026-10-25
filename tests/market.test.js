import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

// Mock STATE
vi.mock("../src/state.js", () => ({
  STATE: {
    auth: { realmId: 0 },
    marketCache: new Map(),
    marketState: {},
  },
}));

import {
  fetchMarketAll,
  fetchMarketPrice,
  fetchMarketTicker,
  hasFreshMarketAll,
  ensureMarketFetchForProduct,
} from "../src/market.js";
import { STATE } from "../src/state.js";
import {
  applyExternalRateLimit,
  SIMCOMPANIES_RATE_LIMIT_GROUP,
  _testUtils as apiClientTestUtils,
} from "../src/data/apiClient.js";
import { MARKET_ERROR_RETRY_MS } from "../src/constants.js";

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
      }),
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

describe("ensureMarketFetchForProduct", () => {
  const flush = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    apiClientTestUtils.reset();
    STATE.marketCache.clear();
    STATE.marketState = { status: "idle", productId: null, realmId: null, data: null, error: null };
    applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: Date.now() + 5 * 60_000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    apiClientTestUtils.reset();
  });

  it("does not loop when the update callback re-renders synchronously during a cooldown", async () => {
    // Mirrors the retail panel: the callback calls straight back into ensureMarketFetch.
    let renders = 0;
    const rerender = () => {
      renders += 1;
      if (renders < 50) ensureMarketFetchForProduct(4, rerender);
    };

    ensureMarketFetchForProduct(4, rerender);
    await flush();

    expect(STATE.marketState.status).toBe("error");
    expect(renders).toBeLessThan(5);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retries a failed product only after the back-off window", async () => {
    const update = vi.fn();
    ensureMarketFetchForProduct(4, update);
    await flush();
    expect(STATE.marketState.status).toBe("error");
    const callsAfterError = update.mock.calls.length;

    ensureMarketFetchForProduct(4, update);
    expect(update.mock.calls.length).toBe(callsAfterError);

    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + MARKET_ERROR_RETRY_MS + 1);
    ensureMarketFetchForProduct(4, update);
    expect(STATE.marketState.status).toBe("loading");
    expect(update.mock.calls.length).toBe(callsAfterError + 1);
  });
});

describe("fetchMarketTicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps every ticker entry to its price with one request and caches the result", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { kind: 1, price: 0.248, is_up: false, realmId: 7 },
            { kind: 9, price: 1.15, is_up: true, realmId: 7 },
            { kind: 13, price: null, is_up: true, realmId: 7 },
          ]),
      }),
    );

    const prices = await fetchMarketTicker(7);
    await fetchMarketTicker(7);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain("/api/v3/market-ticker/7/");
    expect([...prices]).toEqual([
      [1, 0.248],
      [9, 1.15],
    ]);
  });
});

describe("fetchMarketAll", () => {
  afterEach(() => {
    STATE.marketCache.clear();
  });

  it("reads every listing of a product and serves repeats from the cache", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { id: 1, kind: 2, quality: 0, price: 0.35 },
            { id: 2, kind: 2, quality: 12, price: 0.74 },
            { id: 3, kind: 2, quality: 4, price: null },
          ]),
      }),
    );

    expect(hasFreshMarketAll(0, 2)).toBe(false);
    const listings = await fetchMarketAll(0, 2);
    await fetchMarketAll(0, 2);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain("/api/v3/market/all/0/2/");
    expect(listings).toEqual([
      { quality: 0, price: 0.35 },
      { quality: 12, price: 0.74 },
    ]);
    expect(hasFreshMarketAll(0, 2)).toBe(true);
  });
});
