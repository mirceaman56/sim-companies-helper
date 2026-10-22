// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key, getHtmlLang: () => "en" }));
vi.mock("../src/auth.js", () => ({ onAuthDataApplied: () => () => {} }));
vi.mock("../src/page/money_page.js", () => ({ readMoneyBalance: () => 1000 }));

const store = { settings: null, snapshot: null, lastRunAt: 0, gameLimitMs: 0, rates: {} };
const snapshotFromGame = {
  fetchedAt: Date.now(),
  buildings: [
    {
      id: 7,
      kind: "Q",
      name: "Quarry",
      size: 16,
      category: "production",
      status: "producing",
      freeAt: null,
      productId: 44,
      runUnitsPerHour: 100,
    },
  ],
  stock: [],
  prices: {},
};
const fetchPlannerData = vi.fn(async () => {
  store.lastRunAt = Date.now();
  return snapshotFromGame;
});
const fetchShortfallPrices = vi.fn(async () => ({}));
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
  loadCapturedRates: async () => store.rates,
  saveCapturedRates: async (r) => {
    store.rates = r;
  },
  gameRateLimitRemainingMs: () => store.gameLimitMs,
  fetchPlannerData,
  fetchShortfallPrices,
}));

const { _testUtils } = await import("../src/resource_needs_ui.js");

const runButton = () => /** @type {HTMLButtonElement} */ (document.getElementById("scx-needs-run"));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
  vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  store.settings = null;
  store.snapshot = null;
  store.lastRunAt = 0;
  store.gameLimitMs = 0;
  store.rates = {};
  fetchPlannerData.mockClear();
  fetchShortfallPrices.mockClear();
  document.querySelectorAll("#scx-left-sidebar").forEach((el) => el.remove());
});

describe("resource needs panel", () => {
  it("mounts in the left sidebar without touching the game API", async () => {
    await _testUtils.loadAndRender();
    expect(document.querySelector("#scx-left-sidebar #scx-needs-panel")).not.toBeNull();
    expect(runButton().disabled).toBe(false);
    expect(fetchPlannerData).not.toHaveBeenCalled();
    expect(document.getElementById("scx-needs-results").textContent).toContain("needsEmpty");
  });

  it("loads once on Calculate, then locks the button for the cooldown", async () => {
    await _testUtils.loadAndRender();
    await _testUtils.runCalculation();
    expect(fetchPlannerData).toHaveBeenCalledTimes(1);
    expect(runButton().disabled).toBe(true);
    expect(document.getElementById("scx-needs-cooldown").textContent).toBe("needsCooldown");
    expect(document.querySelector('[data-building-id="7"]')).not.toBeNull();

    await _testUtils.runCalculation();
    expect(fetchPlannerData).toHaveBeenCalledTimes(1);
  });

  it("stays locked after a reload when another tab ran it recently", async () => {
    store.lastRunAt = Date.now() - 30_000;
    await _testUtils.loadAndRender();
    expect(runButton().disabled).toBe(true);
    await _testUtils.runCalculation();
    expect(fetchPlannerData).not.toHaveBeenCalled();
  });

  it("waits out a game rate limit without starting its own lock", async () => {
    store.gameLimitMs = 90_000;
    await _testUtils.loadAndRender();
    expect(runButton().disabled).toBe(true);
    expect(document.getElementById("scx-needs-cooldown").textContent).toBe("needsRateLimited");
    await _testUtils.runCalculation();
    expect(fetchPlannerData).not.toHaveBeenCalled();
    expect(store.lastRunAt).toBe(0);

    store.gameLimitMs = 0;
    await _testUtils.runCalculation();
    expect(fetchPlannerData).toHaveBeenCalledTimes(1);
  });

  it("lists buildings that still need game numbers, with a link to the right page", async () => {
    store.snapshot = snapshotFromGame;
    await _testUtils.loadAndRender();
    expect(_testUtils.computeModel().notIndexed).toHaveLength(1);
    expect(document.querySelector('[data-building-id="7"] a.scx-needs-gap')?.getAttribute("href")).toBe(
      "/b/7/",
    );
    expect(document.querySelector('[data-building-id="7"] a.scx-needs-gap')?.textContent).toContain(
      "needsNotIndexed",
    );
    const name = document.querySelector('[data-building-id="7"] a.scx-needs-row-name');
    expect(name?.getAttribute("href")).toBe("/b/7/");
    expect(name?.textContent).toBe("Quarry");

    await _testUtils.onBuildingRates("7", {
      level: 16,
      wagesPerHour: 200,
      offers: [44, 45],
      rates: [{ productId: 44, unitsPerHour: 100, wagesPerHour: 200 }],
    });
    expect(store.rates["7"]).toMatchObject({ size: 16, wagesPerHour: 200, offers: [44, 45] });
    const model = _testUtils.computeModel();
    expect(model.notIndexed).toHaveLength(0);
    expect(document.querySelector('[data-building-id="7"] .scx-needs-row-name')?.textContent).toBe(
      "needsBuildingLabel",
    );
    expect(document.querySelector('[data-building-id="7"] .scx-needs-sub')?.textContent).toContain(
      "needsRowReadAt",
    );
    expect(document.querySelector('[data-building-id="7"] .scx-needs-gap')).toBeNull();
    expect(document.querySelectorAll("#scx-needs-product-7 option")).toHaveLength(3);
    expect(model.needs.wages).toBe(200 * 24);
    expect(model.cash).toEqual({ needed: 4800, cash: 1000, gap: 3800 });
  });
});
