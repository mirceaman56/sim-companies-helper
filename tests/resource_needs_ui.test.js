// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key, getHtmlLang: () => "en" }));
vi.mock("../src/auth.js", () => ({ onAuthDataApplied: () => () => {} }));
vi.mock("../src/page/money_page.js", () => ({ readMoneyBalance: () => 1000 }));

const store = { settings: null, snapshot: null, lastRunAt: 0, gameLimitMs: 0, rates: {} };
const quarry = {
  id: 7,
  kind: "Q",
  name: "Quarry",
  size: 16,
  status: "producing",
  freeAt: null,
  productId: 44,
};
const loadPlannerBuildings = vi.fn(async () => [quarry]);
const fetchStock = vi.fn(async () => []);
const fetchPrices = vi.fn(async () => ({ prices: {}, rateLimited: false }));
vi.mock("../src/resource_needs.js", () => ({
  loadPlannerSettings: async () => store.settings ?? { expanded: true, defaultPeriod: "", buildings: {} },
  savePlannerSettings: async (s) => {
    store.settings = s;
  },
  loadSnapshot: async () => store.snapshot,
  saveSnapshot: async (s) => {
    store.snapshot = s;
  },
  loadLastRunAt: async () => store.lastRunAt,
  saveLastRunAt: async (at) => {
    store.lastRunAt = at;
  },
  loadCapturedRates: async () => store.rates,
  saveCapturedRates: async (r) => {
    store.rates = r;
  },
  gameRateLimitRemainingMs: () => store.gameLimitMs,
  loadPlannerBuildings,
  fetchStock,
  fetchPrices,
}));

const { _testUtils } = await import("../src/resource_needs_ui.js");

const runButton = () => /** @type {HTMLButtonElement} */ (document.getElementById("scx-needs-run"));
const indexedQuarry = {
  level: 16,
  wagesPerHour: 200,
  rates: [{ productId: 44, unitsPerHour: 100, wagesPerHour: 200 }],
};

beforeEach(() => {
  store.settings = null;
  store.snapshot = null;
  store.lastRunAt = 0;
  store.gameLimitMs = 0;
  store.rates = {};
  loadPlannerBuildings.mockClear();
  fetchStock.mockClear();
  fetchPrices.mockClear();
  document.querySelectorAll("#scx-left-sidebar").forEach((el) => el.remove());
});

describe("resource needs panel", () => {
  it("shows buildings from the cache without fetching stock or prices", async () => {
    await _testUtils.loadAndRender();
    expect(document.querySelector("#scx-left-sidebar #scx-needs-panel")).not.toBeNull();
    expect(loadPlannerBuildings).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-building-id="7"]')).not.toBeNull();
    expect(fetchStock).not.toHaveBeenCalled();
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(runButton().disabled).toBe(false);
    expect(document.getElementById("scx-needs-results").textContent).toContain("needsEmpty");
  });

  it("offers only what the building can make, plus every quality", async () => {
    await _testUtils.loadAndRender();
    const products = [...document.querySelectorAll("#scx-needs-product-7 option")].map((o) => o.value);
    expect(products.sort()).toEqual(["104", "105", "44"]);
    expect(/** @type {HTMLSelectElement} */ (document.getElementById("scx-needs-product-7")).value).toBe(
      "44",
    );
    expect(document.querySelectorAll("#scx-needs-quality-7 option")).toHaveLength(13);
  });

  it("does not load buildings while the panel is collapsed", async () => {
    store.settings = { expanded: false, defaultPeriod: "", buildings: {} };
    await _testUtils.loadAndRender();
    expect(loadPlannerBuildings).not.toHaveBeenCalled();
  });

  it("asks for prices of what is missing at the quality the inputs need, then locks the button", async () => {
    store.rates = { 7: { size: 16, at: Date.now(), wagesPerHour: 200, products: {} } };
    store.settings = { expanded: true, defaultPeriod: "", buildings: { 7: { quality: 5 } } };
    await _testUtils.loadAndRender();
    await _testUtils.onBuildingRates("7", indexedQuarry);
    await _testUtils.runCalculation();

    expect(fetchStock).toHaveBeenCalledTimes(1);
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    const asked = fetchPrices.mock.calls[0][0].map((row) => [row.productId, row.quality]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(([, quality]) => quality === 4)).toBe(true);
    expect(store.snapshot).toMatchObject({ stock: [], prices: {} });
    expect(runButton().disabled).toBe(true);
    expect(document.getElementById("scx-needs-cooldown").textContent).toBe("needsCooldown");

    await _testUtils.runCalculation();
    expect(fetchStock).toHaveBeenCalledTimes(1);
  });

  it("stays locked after a reload when another tab ran it recently", async () => {
    store.lastRunAt = Date.now() - 30_000;
    await _testUtils.loadAndRender();
    expect(runButton().disabled).toBe(true);
    await _testUtils.runCalculation();
    expect(fetchStock).not.toHaveBeenCalled();
  });

  it("waits out a game rate limit without starting its own lock", async () => {
    store.gameLimitMs = 90_000;
    await _testUtils.loadAndRender();
    expect(runButton().disabled).toBe(true);
    expect(document.getElementById("scx-needs-cooldown").textContent).toBe("needsRateLimited");
    await _testUtils.runCalculation();
    expect(fetchStock).not.toHaveBeenCalled();
    expect(store.lastRunAt).toBe(0);

    store.gameLimitMs = 0;
    await _testUtils.runCalculation();
    expect(fetchStock).toHaveBeenCalledTimes(1);
  });

  it("links buildings that still need game numbers and leaves them out of the totals", async () => {
    store.snapshot = { fetchedAt: Date.now(), stock: [], prices: {} };
    await _testUtils.loadAndRender();
    expect(_testUtils.computeModel().notIndexed).toHaveLength(1);
    expect(_testUtils.computeModel().needs.wages).toBe(0);
    const gap = document.querySelector('[data-building-id="7"] a.scx-needs-gap');
    expect(gap?.getAttribute("href")).toBe("/b/7/");
    expect(gap?.textContent).toContain("needsNotIndexed");

    await _testUtils.onBuildingRates("7", indexedQuarry);
    const model = _testUtils.computeModel();
    expect(model.notIndexed).toHaveLength(0);
    expect(document.querySelector('[data-building-id="7"] .scx-needs-row-name')?.textContent).toBe(
      "needsBuildingLabel",
    );
    expect(document.querySelector('[data-building-id="7"] .scx-needs-gap')).toBeNull();
    expect(model.needs.wages).toBe(200 * 24);
    expect(model.cash).toEqual({ needed: 4800, cash: 1000, gap: 3800 });
  });
  it("lists buildings without a product separately and jumps to their dropdown", async () => {
    const factory = {
      id: 9,
      kind: "Y",
      name: "Factory",
      size: 12,
      status: "idle",
      freeAt: null,
      productId: null,
    };
    loadPlannerBuildings.mockResolvedValueOnce([quarry, factory]);
    store.snapshot = { fetchedAt: Date.now(), stock: [], prices: {} };
    store.rates = { 9: { size: 12, at: Date.now(), wagesPerHour: 100, products: {} } };
    await _testUtils.loadAndRender();

    const results = document.getElementById("scx-needs-results");
    expect(results.textContent).toContain("needsIncomplete");
    expect(results.textContent).toContain("needsNoProduct");
    expect(results.querySelector('a[href="/b/7/"]')).not.toBeNull();
    const pick = /** @type {HTMLButtonElement} */ (results.querySelector('[data-pick-product="9"]'));
    const select = document.getElementById("scx-needs-product-9");
    select.scrollIntoView = vi.fn();
    pick.click();
    expect(document.activeElement).toBe(select);
  });

  it("shows results above the building list", async () => {
    await _testUtils.loadAndRender();
    const results = document.getElementById("scx-needs-results");
    const list = document.getElementById("scx-needs-list");
    expect(results.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
