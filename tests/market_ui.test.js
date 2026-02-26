// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/state.js", () => ({
  STATE: {
    auth: { realmId: 0 },
    marketCache: new Map(),
    marketState: {},
  },
}));

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

vi.mock("../src/sidebar.js", () => ({
  getSectionContent: () => null,
}));

vi.mock("../src/market.js", () => ({
  fetchMarketPrice: vi.fn(() => Promise.resolve(10.0)),
  fetchMarket: vi.fn(() => Promise.resolve([{ quality: 0, price: 10.0 }])),
  getRateLimitStatus: () => ({ blocked: false, remainingMs: 0 }),
}));

vi.mock("../src/auth.js", () => ({
  getRealmId: () => 0,
  loadAuthDataOnce: vi.fn(() => Promise.resolve()),
}));

// Stub chrome.storage.local for persistence tests
const storageStore = {};
global.chrome = {
  storage: {
    local: {
      get: vi.fn((key) => Promise.resolve({ [key]: storageStore[key] })),
      set: vi.fn((obj) => {
        Object.assign(storageStore, obj);
        return Promise.resolve();
      }),
    },
  },
};

import { _testUtils } from "../src/market_ui.js";

function makeContainer() {
  const el = document.createElement("div");
  el.innerHTML = `
    <select id="scx-ma-product"><option value="1">Water</option></select>
    <select id="scx-ma-quality"><option value="all">All</option></select>
    <input id="scx-ma-price" value="5.00" />
    <button id="scx-ma-add"></button>
    <span class="scx-market-alerts-limit-text"></span>
    <div id="scx-ma-list"></div>
  `;
  return el;
}

describe("market alert state machine", () => {
  beforeEach(() => {
    _testUtils.setAlerts([]);
    _testUtils.setNextAlertId(1);
    vi.useFakeTimers();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("addAlert creates an alert from form inputs", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);

    const alerts = _testUtils.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 1,
      productId: 1,
      productName: "Water",
      quality: "all",
      targetPrice: 5.0,
      active: false,
      triggered: false,
    });
  });

  it("addAlert enforces the 2-alert limit", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    container.querySelector("#scx-ma-price").value = "6.00";
    _testUtils.addAlert(container);
    container.querySelector("#scx-ma-price").value = "7.00";
    _testUtils.addAlert(container); // should be rejected

    expect(_testUtils.getAlerts()).toHaveLength(2);
  });

  it("addAlert rejects invalid price (0 or negative)", () => {
    const container = makeContainer();
    container.querySelector("#scx-ma-price").value = "0";
    _testUtils.addAlert(container);
    expect(_testUtils.getAlerts()).toHaveLength(0);

    container.querySelector("#scx-ma-price").value = "-5";
    _testUtils.addAlert(container);
    expect(_testUtils.getAlerts()).toHaveLength(0);
  });

  it("startAlert sets active=true and triggered=false", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    _testUtils.startAlert(container, alert.id);
    expect(alert.active).toBe(true);
    expect(alert.triggered).toBe(false);
  });

  it("startAlert is a no-op if alert is already active", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    _testUtils.startAlert(container, alert.id);
    const intervalId = alert.intervalId;
    _testUtils.startAlert(container, alert.id);
    expect(alert.intervalId).toBe(intervalId);
  });

  it("stopAlert sets active=false and clears interval", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    _testUtils.startAlert(container, alert.id);
    expect(alert.intervalId).not.toBeNull();

    _testUtils.stopAlert(container, alert.id);
    expect(alert.active).toBe(false);
    expect(alert.intervalId).toBeNull();
  });

  it("resetAlert clears triggered state and lastPrice/lastCheck", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    alert.triggered = true;
    alert.active = true;
    alert.lastPrice = 3.5;
    alert.lastCheck = Date.now();

    _testUtils.resetAlert(container, alert.id);
    expect(alert.triggered).toBe(false);
    expect(alert.lastPrice).toBeNull();
    expect(alert.lastCheck).toBeNull();
  });

  it("resetAlert starts monitoring if alert was inactive", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    alert.triggered = true;
    alert.active = false;

    _testUtils.resetAlert(container, alert.id);
    expect(alert.active).toBe(true);
    expect(alert.triggered).toBe(false);
  });

  it("removeAlert removes alert and clears its interval", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    const alert = _testUtils.getAlerts()[0];

    _testUtils.startAlert(container, alert.id);
    _testUtils.removeAlert(container, alert.id);

    expect(_testUtils.getAlerts()).toHaveLength(0);
  });

  it("nextAlertId increments on each add", () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    container.querySelector("#scx-ma-price").value = "6.00";
    _testUtils.addAlert(container);

    const alerts = _testUtils.getAlerts();
    expect(alerts[0].id).toBe(1);
    expect(alerts[1].id).toBe(2);
    expect(_testUtils.getNextAlertId()).toBe(3);
  });
});

describe("alert persistence", () => {
  beforeEach(() => {
    _testUtils.setAlerts([]);
    _testUtils.setNextAlertId(1);
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    vi.clearAllMocks();
  });

  it("saveAlerts writes to chrome.storage.local with realm-scoped key", async () => {
    const container = makeContainer();
    _testUtils.addAlert(container);
    await _testUtils.saveAlerts();

    expect(chrome.storage.local.set).toHaveBeenCalled();
    const callArg = chrome.storage.local.set.mock.calls.at(-1)[0];
    const key = _testUtils.storageKey();
    expect(callArg).toHaveProperty(key);

    const saved = callArg[key];
    expect(saved.alerts).toHaveLength(1);
    expect(saved.alerts[0]).not.toHaveProperty("intervalId");
    expect(saved.nextAlertId).toBe(2);
  });

  it("loadAlerts restores alerts from storage", async () => {
    const key = _testUtils.storageKey();
    storageStore[key] = {
      alerts: [
        {
          id: 5,
          productId: 1,
          productName: "Water",
          quality: "all",
          targetPrice: 3.0,
          active: false,
          triggered: false,
          lastPrice: null,
          lastCheck: null,
        },
      ],
      nextAlertId: 6,
    };

    await _testUtils.loadAlerts();
    const alerts = _testUtils.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe(5);
    expect(alerts[0].intervalId).toBeNull();
    expect(_testUtils.getNextAlertId()).toBe(6);
  });

  it("loadAlerts recovers nextAlertId from max alert id if missing", async () => {
    const key = _testUtils.storageKey();
    storageStore[key] = {
      alerts: [
        { id: 10, productId: 1, productName: "W", quality: "all", targetPrice: 1, active: false, triggered: false, lastPrice: null, lastCheck: null },
      ],
    };

    await _testUtils.loadAlerts();
    expect(_testUtils.getNextAlertId()).toBe(11);
  });
});
