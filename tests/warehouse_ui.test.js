// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth.js", () => ({
  getRealmId: vi.fn(() => 0),
  loadAuthDataOnce: vi.fn(() => Promise.resolve()),
}));

vi.mock("../src/state.js", () => ({
  STATE: {
    auth: {
      companyId: 123,
    },
  },
}));

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

import { _testUtils } from "../src/warehouse_ui.js";

describe("fetchInventoryItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    _testUtils.resetInventoryCache();
    document.body.innerHTML = `
      <div role="link" aria-label="Apples, quantity 100, average sourcing cost $1.50"></div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reuses cached inventory results within the TTL", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ kind: 3, amount: 100, quality: 2 }]),
      }),
    );

    const first = await _testUtils.fetchInventoryItems();
    const second = await _testUtils.fetchInventoryItems();

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes the cache after the TTL expires", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ kind: 3, amount: 100, quality: 2 }]),
      }),
    );

    await _testUtils.fetchInventoryItems();
    vi.advanceTimersByTime(_testUtils.INVENTORY_CACHE_TTL_MS + 1);
    await _testUtils.fetchInventoryItems();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once for transient fetch failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 524 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ kind: 3, amount: 100, quality: 2 }]),
      });

    const items = await _testUtils.fetchInventoryItems();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(items.length).toBeGreaterThan(0);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalledWith("[WarehouseUI] Failed to fetch inventory: 524");
  });

  it("throttles repeated logs for expected 400 failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 400 }));

    await _testUtils.fetchInventoryItems();
    vi.advanceTimersByTime(_testUtils.INVENTORY_CACHE_TTL_MS + 1);
    await _testUtils.fetchInventoryItems();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith("[WarehouseUI] Failed to fetch inventory: 400");
  });
});

describe("warehouse sales message builder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    _testUtils.resetInventoryCache();
    _testUtils.setSalesBuilderSettingsForTest();
    window.history.pushState({}, "", "/headquarters/warehouse/");
    document.body.innerHTML = "";
    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    global.navigator.clipboard = {
      writeText: vi.fn(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds a sell line with compact quantity, recipe id, quality, and price", () => {
    const line = _testUtils.buildSellMessageLine(
      { kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 },
      { marginPct: 5, selectedKeys: ["44:2"], manualPrices: {} },
    );

    expect(line).toBe("sell 2M :re-44: Q2 @ $0.82");
  });

  it("calculates margin price from sourcing cost", () => {
    expect(_testUtils.calculateMarginPrice(0.78, 5)).toBeCloseTo(0.819);
    expect(_testUtils.compactQuantity(12_500)).toBe("12.5K");
  });

  it("uses manual price override when present", () => {
    const message = _testUtils.buildSalesMessage(
      [{ key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 }],
      { marginPct: 5, selectedKeys: ["44:2"], manualPrices: { "44:2": "0.9" } },
    );

    expect(message).toBe("sell 2M :re-44: Q2 @ $0.90");
  });

  it("accepts typed prices with thousands separators", () => {
    const message = _testUtils.buildSalesMessage(
      [{ key: "111:0", kind: 111, name: "Construction units", quality: 0, amount: 24, unitCost: 2510 }],
      { marginPct: 5, selectedKeys: ["111:0"], manualPrices: { "111:0": "2,761.00" } },
    );

    expect(message).toBe("sell 24 :re-111: Q0 @ $2,761.00");
  });

  it("returns no message for empty selection", () => {
    const message = _testUtils.buildSalesMessage(
      [{ key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 }],
      { marginPct: 5, selectedKeys: [], manualPrices: {} },
    );

    expect(message).toBe("");
  });

  it("filters builder rows to checked warehouse products", () => {
    const rows = [
      { key: "44:1", kind: 44, name: "Sand", quality: 1, amount: 100, unitCost: 1 },
      { key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 200, unitCost: 1 },
      { key: "3:0", kind: 3, name: "Apples", quality: 0, amount: 300, unitCost: 2 },
    ];

    expect(_testUtils.getSelectedProductRows(rows, { productIds: [44] }).map((row) => row.key)).toEqual([
      "44:1",
      "44:2",
    ]);
  });

  it("groups same product stock by quality", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { kind: 44, amount: 100, quality: 1, cost: { workers: 50 } },
            { kind: 44, amount: 200, quality: 2, cost: { workers: 120 } },
          ]),
      }),
    );

    const rows = await _testUtils.fetchStockRows();

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "44:1", kind: 44, name: "Sand", quality: 1, amount: 100, unitCost: 0.5 }),
        expect.objectContaining({ key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 200, unitCost: 0.6 }),
      ]),
    );
  });

  it("renders panel, selects rows, and updates copied message from manual price", async () => {
    document.body.innerHTML = `<div><div role="list"></div></div>`;
    _testUtils.setSalesBuilderSettingsForTest({
      marginPct: 5,
      productIds: [44],
      selectedKeys: [],
      manualPrices: {},
    });

    await _testUtils.renderSalesBuilder([
      { key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 },
    ]);

    const panel = document.getElementById("scx-warehouse-sales-builder");
    const checkbox = panel.querySelector('[data-sales-action="select"]');
    const priceInput = panel.querySelector('[data-sales-action="manual-price"]');
    const copyButton = panel.querySelector(".scx-copy-btn");
    const marginInput = panel.querySelector('[data-sales-action="margin"]');

    expect(panel).not.toBeNull();
    expect(copyButton.disabled).toBe(true);
    expect(marginInput.id).toBe("scx-warehouse-sales-margin");
    expect(marginInput.name).toBe("scx-warehouse-sales-margin");

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    expect(copyButton.disabled).toBe(false);
    expect(panel.querySelector("[data-sales-output]").textContent).toBe("sell 2M :re-44: Q2 @ $0.82");

    expect(priceInput.type).toBe("text");
    expect(priceInput.id).toBe("scx-warehouse-sales-price-44-2");
    expect(priceInput.name).toBe("scx-warehouse-sales-price-44-2");
    expect(checkbox.id).toBe("scx-warehouse-sales-select-44-2");
    expect(checkbox.name).toBe("scx-warehouse-sales-select-44-2");

    priceInput.value = "0.9";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.querySelector("[data-sales-output]").textContent).toBe("sell 2M :re-44: Q2 @ $0.90");
  });

  it("shows reset for manual price and clears override when clicked", async () => {
    document.body.innerHTML = `<div><div role="list"></div></div>`;
    _testUtils.setSalesBuilderSettingsForTest({
      marginPct: 5,
      productIds: [44],
      selectedKeys: ["44:2"],
      manualPrices: {},
    });

    await _testUtils.renderSalesBuilder([
      { key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 },
    ]);

    let panel = document.getElementById("scx-warehouse-sales-builder");
    const priceInput = panel.querySelector('[data-sales-action="manual-price"]');

    expect(panel.querySelector('[data-sales-action="reset-price"]')).toBeNull();

    priceInput.value = "0.9";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    await _testUtils.renderSalesBuilder();

    panel = document.getElementById("scx-warehouse-sales-builder");
    const resetButton = panel.querySelector('[data-sales-action="reset-price"]');
    expect(resetButton).not.toBeNull();
    expect(panel.querySelector("[data-sales-output]").textContent).toBe("sell 2M :re-44: Q2 @ $0.90");

    resetButton.dispatchEvent(new Event("click", { bubbles: true }));

    await _testUtils.renderSalesBuilder();

    panel = document.getElementById("scx-warehouse-sales-builder");
    expect(panel.querySelector('[data-sales-action="reset-price"]')).toBeNull();
    expect(panel.querySelector('[data-sales-action="manual-price"]').value).toBe("");
    expect(panel.querySelector("[data-sales-output]").textContent).toBe("sell 2M :re-44: Q2 @ $0.82");
  });

  it("renders compact empty state until products are checked on cards", async () => {
    document.body.innerHTML = `<div><div role="list"></div></div>`;
    _testUtils.setSalesBuilderSettingsForTest({
      marginPct: 5,
      productIds: [],
      selectedKeys: [],
      manualPrices: {},
    });

    await _testUtils.renderSalesBuilder([
      { key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 },
    ]);

    expect(document.querySelector(".scx-warehouse-sales-row")).toBeNull();
    expect(document.querySelector(".scx-warehouse-sales-empty").textContent).toBe("warehouseSalesChooseProducts");
  });

  it("does not render the sales builder on warehouse product subpages", async () => {
    window.history.pushState({}, "", "/headquarters/warehouse/oranges");
    document.body.innerHTML = `<div><div role="list"></div></div>`;
    _testUtils.setSalesBuilderSettingsForTest({
      marginPct: 5,
      productIds: [44],
      selectedKeys: ["44:2"],
      manualPrices: {},
    });

    await _testUtils.renderSalesBuilder([
      { key: "44:2", kind: 44, name: "Sand", quality: 2, amount: 2_000_000, unitCost: 0.78 },
    ]);

    expect(document.getElementById("scx-warehouse-sales-builder")).toBeNull();
  });
});
