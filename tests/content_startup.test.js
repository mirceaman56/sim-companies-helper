// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { callOrder, mockState } = vi.hoisted(() => ({
  callOrder: [],
  mockState: {
    auth: { error: null },
    inventory: { error: null },
    cashflow: { error: null },
    buildings: { error: null },
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
  loadCashflowToday: vi.fn(async () => {
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
  });

  it("runs startup phases in order and wires post-start actions", async () => {
    await runStartupServices({ state: mockState, warn: vi.fn(), error: vi.fn() });

    expect(callOrder).toEqual([
      "auth",
      "cleanup-buildings-cache",
      "inventory",
      "cashflow",
      "buildings",
      "xp-widget",
      "market-alerts",
      "cashflow-panel",
      "schedule-update",
      "retail-panel",
      "retail-autoselect",
      "run-safe",
      "retail-panel",
    ]);
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
