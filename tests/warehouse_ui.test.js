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

import { _testUtils } from "../src/warehouse_ui.js";

describe("fetchInventoryItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
