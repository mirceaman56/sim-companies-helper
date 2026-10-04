import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/data/apiClient.js", () => ({
  request: vi.fn(),
}));

import { STATE } from "../src/state.js";
import { request } from "../src/data/apiClient.js";
import { loadBondsOnce } from "../src/bonds.js";

beforeEach(() => {
  vi.clearAllMocks();
  STATE.bonds.loaded = false;
  STATE.bonds.loading = false;
  STATE.bonds.error = null;
  STATE.bonds.owned = [];
  STATE.bonds.sold = [];
});

describe("loadBondsOnce", () => {
  it("loads owned and sold bonds", async () => {
    request.mockImplementation(async (key) => (key === "bonds-owned" ? [{ amount: 10 }] : [{ amount: 2 }]));

    await loadBondsOnce();

    expect(STATE.bonds.loaded).toBe(true);
    expect(STATE.bonds.owned).toEqual([{ amount: 10 }]);
    expect(STATE.bonds.sold).toEqual([{ amount: 2 }]);
  });

  it("fetches only once per page load", async () => {
    request.mockResolvedValue([]);

    await loadBondsOnce();
    await loadBondsOnce();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retry after a failure", async () => {
    request.mockRejectedValue(new Error("HTTP 403"));

    await loadBondsOnce();
    await loadBondsOnce();

    expect(STATE.bonds.error).toBe("HTTP 403");
    expect(STATE.bonds.loaded).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
