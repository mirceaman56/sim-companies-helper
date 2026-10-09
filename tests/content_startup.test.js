// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { callOrder, mockState } = vi.hoisted(() => ({
  callOrder: [],
  mockState: {
    auth: { error: null },
    inventory: { error: null },
    cashflow: { error: null },
    buildings: { error: null },
    bonds: { error: null },
  },
}));

vi.mock("../src/state.js", () => ({ STATE: mockState }));
vi.mock("../src/auth.js", () => ({
  loadAuthDataOnce: vi.fn(async () => {
    callOrder.push("auth");
  }),
}));
vi.mock("../src/warehouse.js", () => ({
  loadInventoryOnce: vi.fn(async () => {
    callOrder.push("inventory");
  }),
}));
vi.mock("../src/cashflow.js", () => ({
  loadFinanceData: vi.fn(async () => {
    callOrder.push("cashflow");
  }),
}));
vi.mock("../src/buildings.js", () => ({
  cleanupLegacyBuildingsCache: vi.fn(async () => {
    callOrder.push("cleanup-buildings-cache");
  }),
  loadBuildings: vi.fn(async () => {
    callOrder.push("buildings");
  }),
}));
vi.mock("../src/xp_ui.js", () => ({
  updateXpWidget: vi.fn(() => {
    callOrder.push("xp-widget");
  }),
}));
vi.mock("../src/accounting_ui.js", () => ({
  updateAccountingWidget: vi.fn(() => {
    callOrder.push("accounting-widget");
  }),
}));
vi.mock("../src/executives.js", () => ({
  loadExecutivesOnce: vi.fn(async () => {
    callOrder.push("executives");
  }),
}));
vi.mock("../src/bonds.js", () => ({
  loadBondsOnce: vi.fn(async () => {
    callOrder.push("bonds");
  }),
}));
vi.mock("../src/market_ui.js", () => ({
  initMarketAlerts: vi.fn(async () => {
    callOrder.push("market-alerts");
  }),
}));
vi.mock("../src/cashflow_ui.js", () => ({
  updateCashflowPanel: vi.fn(() => {
    callOrder.push("cashflow-panel");
  }),
}));
vi.mock("../src/retail_ui.js", () => ({
  updatePanel: vi.fn(() => {
    callOrder.push("retail-panel");
  }),
  RetailHelper: {
    autoSelectFirstRow: vi.fn((cb) => {
      callOrder.push("retail-autoselect");
      cb();
    }),
  },
}));
vi.mock("../src/utils.js", () => ({
  scheduleUpdate: vi.fn((cb) => {
    callOrder.push("schedule-update");
    cb();
  }),
  runSafe: vi.fn((fn) => {
    callOrder.push("run-safe");
    fn();
  }),
}));

import { runStartupServices } from "../src/content_startup.js";

describe("runStartupServices", () => {
  beforeEach(() => {
    callOrder.length = 0;
    mockState.auth.error = null;
    mockState.inventory.error = null;
    mockState.cashflow.error = null;
    mockState.buildings.error = null;
    mockState.bonds.error = null;
  });

  it("loads auth first, renders each widget after its own data, and wires retail last", async () => {
    await runStartupServices({ state: mockState, warn: vi.fn(), error: vi.fn() });

    const at = (step) => callOrder.indexOf(step);
    expect(callOrder.slice(0, 2)).toEqual(["auth", "cleanup-buildings-cache"]);
    expect(at("xp-widget")).toBeGreaterThan(at("buildings"));
    expect(at("cashflow-panel")).toBeGreaterThan(at("cashflow"));
    for (const input of ["buildings", "executives", "bonds"]) {
      expect(at("accounting-widget")).toBeGreaterThan(at(input));
    }
    for (const step of ["inventory", "market-alerts", "accounting-widget", "cashflow-panel"]) {
      expect(at("schedule-update")).toBeGreaterThan(at(step));
    }
    expect(callOrder.slice(-5)).toEqual([
      "schedule-update",
      "retail-panel",
      "retail-autoselect",
      "schedule-update",
      "retail-panel",
    ]);
  });

  it("keeps going when one load throws", async () => {
    const error = vi.fn();
    const { loadInventoryOnce } = await import("../src/warehouse.js");
    loadInventoryOnce.mockRejectedValueOnce(new Error("boom"));

    await runStartupServices({ state: mockState, warn: vi.fn(), error });

    expect(error).toHaveBeenCalledWith("[SimHelper] Inventory crashed:", expect.any(Error));
    expect(callOrder).toContain("accounting-widget");
    expect(callOrder).toContain("retail-autoselect");
  });

  it("continues with market alerts + post-load actions after initialization error", async () => {
    const warn = vi.fn();
    const error = vi.fn();

    mockState.auth.error = "auth-failed";

    await runStartupServices({ state: mockState, warn, error });

    expect(warn).toHaveBeenCalledWith("[SimHelper] Auth failed:", "auth-failed");
    expect(callOrder).toContain("market-alerts");
    expect(callOrder).toContain("cashflow-panel");
    expect(error).not.toHaveBeenCalled();
  });
});
