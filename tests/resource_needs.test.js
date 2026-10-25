import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMarketTicker = vi.fn();
const fetchMarketAll = vi.fn();
const hasFreshMarketAll = vi.fn(() => false);
const wait = vi.fn(async () => {});
const rateLimit = { blocked: false, remainingMs: 0 };
const state = { auth: { realmId: 0 }, buildings: { items: [], error: null, loading: false } };
const loadBuildings = vi.fn(async () => {});

vi.mock("../src/state.js", () => ({ STATE: state }));
vi.mock("../src/market.js", () => ({ fetchMarketTicker, fetchMarketAll, hasFreshMarketAll }));
vi.mock("../src/utils.js", () => ({ wait }));
vi.mock("../src/buildings.js", () => ({ loadBuildings }));
vi.mock("../src/warehouse_inventory_service.js", () => ({
  fetchWarehouseStockRows: async () => [{ kind: 3, quality: 2, amount: 10, name: "x" }],
}));
vi.mock("../src/data/storage.js", () => ({ storage: { get: vi.fn(), set: vi.fn(async () => true) } }));
vi.mock("../src/data/apiClient.js", () => ({ getRateLimitStatus: () => rateLimit }));

const { fetchPrices, fetchStock, loadPlannerBuildings } = await import("../src/resource_needs.js");

beforeEach(() => {
  fetchMarketTicker.mockReset();
  fetchMarketAll.mockReset();
  hasFreshMarketAll.mockReset().mockReturnValue(false);
  wait.mockClear();
  rateLimit.blocked = false;
  state.buildings = { items: [], error: null, loading: false };
});

describe("fetchPrices", () => {
  it("prices Q0 from one ticker request and higher qualities from each product's listing", async () => {
    fetchMarketTicker.mockResolvedValue(new Map([[1, 0.25]]));
    fetchMarketAll.mockImplementation(async (realm, id) =>
      id === 2
        ? [
            { quality: 0, price: 0.3 },
            { quality: 4, price: 0.45 },
          ]
        : [{ quality: 0, price: 9 }],
    );
    const progress = vi.fn();

    const result = await fetchPrices(
      [
        { productId: 1, quality: 0 },
        { productId: 91, quality: 0 },
        { productId: 2, quality: 4 },
        { productId: 2, quality: 0 },
      ],
      progress,
    );

    expect(fetchMarketTicker).toHaveBeenCalledTimes(1);
    expect(fetchMarketAll.mock.calls.map((c) => c[1])).toEqual([2, 91]);
    expect(result).toEqual({
      prices: { "1:0": 0.25, "2:4": 0.45, "2:0": 0.3, "91:0": 9 },
      rateLimited: false,
    });
    expect(progress.mock.calls.at(-1)[0]).toEqual({ done: 3, total: 3 });
  });

  it("waits 100–200ms between listing requests, but not before the first or for cached ones", async () => {
    fetchMarketAll.mockResolvedValue([{ quality: 5, price: 1 }]);
    hasFreshMarketAll.mockImplementation((realm, id) => id === 6);

    await fetchPrices([5, 6, 7, 8].map((productId) => ({ productId, quality: 5 })));

    expect(wait).toHaveBeenCalledTimes(2);
    for (const [ms] of wait.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(200);
    }
  });

  it("stops at the first rate limit and keeps what it already priced", async () => {
    fetchMarketAll
      .mockResolvedValueOnce([{ quality: 3, price: 2 }])
      .mockRejectedValueOnce(Object.assign(new Error("429"), { code: "RATE_LIMIT_COOLDOWN" }));

    const result = await fetchPrices([5, 6, 7].map((productId) => ({ productId, quality: 3 })));

    expect(result).toEqual({ prices: { "5:3": 2 }, rateLimited: true });
    expect(fetchMarketAll).toHaveBeenCalledTimes(2);
  });

  it("falls back to listings when the ticker fails for another reason", async () => {
    fetchMarketTicker.mockRejectedValue(Object.assign(new Error("x"), { code: "HTTP_ERROR" }));
    fetchMarketAll.mockResolvedValue([{ quality: 0, price: 3 }]);

    const result = await fetchPrices([{ productId: 1, quality: 0 }]);

    expect(result.prices).toEqual({ "1:0": 3 });
  });

  it("makes no request when nothing is missing", async () => {
    expect(await fetchPrices([])).toEqual({ prices: {}, rateLimited: false });
    expect(fetchMarketTicker).not.toHaveBeenCalled();
  });
});

describe("game data", () => {
  it("keeps stock quality", async () => {
    expect(await fetchStock()).toEqual([{ kind: 3, quality: 2, amount: 10 }]);
  });

  it("reads buildings from the shared cache and keeps production buildings", async () => {
    state.buildings.items = [
      { id: 1, kind: "E", category: "production", name: "Power plant", size: 3, busy: null },
      { id: 2, kind: "t", category: "seasonal", name: "Market", size: 1, busy: null },
    ];

    const list = await loadPlannerBuildings();

    expect(loadBuildings).toHaveBeenCalledWith();
    expect(list.map((b) => b.id)).toEqual([1]);
  });

  it("reports a rate limit when the buildings request was refused for it", async () => {
    state.buildings.error = "HTTP 429";
    rateLimit.blocked = true;

    await expect(loadPlannerBuildings()).rejects.toMatchObject({ code: "RATE_LIMIT_COOLDOWN" });
  });
});
