// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

const sectionEl = document.createElement("div");

vi.mock("../src/sidebar.js", () => ({
  getSectionContent: () => sectionEl,
}));

vi.mock("../src/auth.js", () => ({
  getRealmId: () => 0,
}));

vi.mock("../src/state.js", async () => {
  const actual = await vi.importActual("../src/state.js");
  actual.STATE.executives.loaded = true;
  actual.STATE.executives.loading = false;
  return actual;
});

vi.mock("../src/executives.js", () => ({
  loadExecutivesOnce: vi.fn(async () => {}),
  getExecutivesTrainingForCOO: () => [],
}));

const analyzeProduction = vi.fn(async () => ({
  productionCost: 53619,
  marketPrice: 12,
  quality: 4,
  breakEvenAnalysis: {
    market: { breakEvenPrice: 9.2 },
    contract: { breakEvenPrice: 9 },
  },
  profitAnalysis: {
    market: { profit: 1000, margin: 10 },
    contract: { profit: 1200, margin: 12 },
  },
}));

vi.mock("../src/production.js", async () => {
  const actual = await vi.importActual("../src/production.js");
  return {
    ...actual,
    analyzeProduction,
    fetchMarketPrices: vi.fn(async () => ({})),
  };
});

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "production", name), "utf8");
}

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe("production_ui busy production sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    analyzeProduction.mockClear();
    sectionEl.innerHTML = "";
    document.body.innerHTML = "";
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("analyzes the running order without any user interaction", async () => {
    document.body.innerHTML = loadFixture("busy-block.html");

    const { setupProductionRowListeners } = await import("../src/production_ui.js");
    setupProductionRowListeners();

    vi.advanceTimersByTime(300);
    await flush();

    expect(analyzeProduction).toHaveBeenCalled();
    const [productId, quantity, , , unitCost, quality] = analyzeProduction.mock.calls[0];
    expect({ productId, quantity, unitCost, quality }).toEqual({
      productId: 14,
      quantity: 6100,
      unitCost: 8.79,
      quality: 4,
    });
    expect(sectionEl.innerHTML).toContain("Minerals");

    // An unchanged order must not trigger another analysis.
    vi.advanceTimersByTime(300);
    await flush();
    expect(analyzeProduction).toHaveBeenCalledTimes(1);

    document.querySelector('td[headers="busy-info-label-0"]').textContent = "7,000";
    await flush();
    vi.advanceTimersByTime(300);
    await flush();

    expect(analyzeProduction).toHaveBeenCalledTimes(2);
    expect(analyzeProduction.mock.calls[1][1]).toBe(7000);
  });

  it("uses the cost per unit the setup form prints, with no click", async () => {
    document.body.innerHTML = loadFixture("idle-block.html");

    const { setupProductionRowListeners } = await import("../src/production_ui.js");
    setupProductionRowListeners();

    vi.advanceTimersByTime(300);
    await flush();

    expect(analyzeProduction).toHaveBeenCalled();
    const [productId, quantity, , , unitCost, quality] = analyzeProduction.mock.calls[0];
    expect({ productId, quantity, unitCost, quality }).toEqual({
      productId: 14,
      quantity: 48476,
      unitCost: 8.85,
      quality: 4,
    });
    expect(sectionEl.innerHTML).not.toContain(">active<");
  });

  it("does not re-render in a loop when executives cannot load (issue #163)", async () => {
    document.body.innerHTML = loadFixture("busy-block.html");

    const { STATE } = await import("../src/state.js");
    const executives = await import("../src/executives.js");
    STATE.executives.loaded = false;
    // Rate-limited: every load is skipped or fails instantly.
    executives.loadExecutivesOnce.mockResolvedValue(false);

    const { setupProductionRowListeners } = await import("../src/production_ui.js");
    setupProductionRowListeners();

    vi.advanceTimersByTime(300);
    await flush();
    // Listeners from earlier tests share these mocks, so check the counts stop
    // growing rather than their exact values.
    const analyzeCalls = analyzeProduction.mock.calls.length;
    const loadCalls = executives.loadExecutivesOnce.mock.calls.length;
    expect(analyzeCalls).toBeGreaterThan(0);

    await flush();
    await flush();

    expect(analyzeProduction).toHaveBeenCalledTimes(analyzeCalls);
    expect(executives.loadExecutivesOnce).toHaveBeenCalledTimes(loadCalls);
  });

  it("reports the missing cost instead of estimating one", async () => {
    document.body.innerHTML = loadFixture("idle-block-rates.html");

    const { setupProductionRowListeners } = await import("../src/production_ui.js");
    setupProductionRowListeners();

    vi.advanceTimersByTime(300);
    await flush();

    expect(analyzeProduction).toHaveBeenCalled();
    expect(analyzeProduction.mock.calls[0][4]).toBeNull();
  });
});
