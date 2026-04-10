// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  appendAlert,
  applyPriceCheckState,
  canAddAlert,
  createAlert,
  findAlertById,
  hydrateAlerts,
  isValidTargetPrice,
  removeAlertState,
  resetAlertState,
  resolveNextAlertId,
  serializeAlerts,
  startAlertState,
  stopAlertState,
} from "../src/market_alerts_state.js";

describe("market_alerts_state", () => {
  it("createAlert creates an inactive alert with default runtime fields", () => {
    const alert = createAlert({
      id: 1,
      productId: 10,
      productName: "Water",
      quality: "all",
      targetPrice: 5,
    });

    expect(alert).toMatchObject({
      id: 1,
      productId: 10,
      productName: "Water",
      quality: "all",
      targetPrice: 5,
      active: false,
      intervalId: null,
      lastPrice: null,
      lastCheck: null,
      triggered: false,
    });
  });

  it("validates target price", () => {
    expect(isValidTargetPrice(1)).toBe(true);
    expect(isValidTargetPrice(0)).toBe(false);
    expect(isValidTargetPrice(-1)).toBe(false);
    expect(isValidTargetPrice(Number.NaN)).toBe(false);
  });

  it("enforces max count through canAddAlert", () => {
    expect(canAddAlert([], 2)).toBe(true);
    expect(canAddAlert([{ id: 1 }, { id: 2 }], 2)).toBe(false);
  });

  it("finds and removes alerts by id", () => {
    const alerts = [{ id: 1 }, { id: 2 }];
    expect(findAlertById(alerts, 2)).toEqual({ id: 2 });
    expect(removeAlertState(alerts, 1)).toEqual([{ id: 2 }]);
  });

  it("starts and stops alert state", () => {
    const alert = createAlert({ id: 1, productId: 1, productName: "A", quality: 1, targetPrice: 5 });

    expect(startAlertState(alert)).toBe(true);
    expect(alert.active).toBe(true);
    expect(startAlertState(alert)).toBe(false);

    expect(stopAlertState(alert)).toBe(true);
    expect(alert.active).toBe(false);
    expect(stopAlertState(alert)).toBe(false);
  });

  it("resets triggered fields", () => {
    const alert = createAlert({ id: 1, productId: 1, productName: "A", quality: 1, targetPrice: 5 });
    alert.triggered = true;
    alert.lastPrice = 2;
    alert.lastCheck = 123;

    resetAlertState(alert);
    expect(alert.triggered).toBe(false);
    expect(alert.lastPrice).toBeNull();
    expect(alert.lastCheck).toBeNull();
  });

  it("applies price check transitions", () => {
    const alert = createAlert({ id: 1, productId: 1, productName: "A", quality: 1, targetPrice: 5 });

    const r1 = applyPriceCheckState(alert, 4, 1000);
    expect(r1).toBe("triggered");
    expect(alert.triggered).toBe(true);

    const r2 = applyPriceCheckState(alert, 6, 2000);
    expect(r2).toBe("cleared");
    expect(alert.triggered).toBe(false);

    const r3 = applyPriceCheckState(alert, null, 3000);
    expect(r3).toBe("unchanged");
    expect(alert.lastPrice).toBeNull();
    expect(alert.lastCheck).toBe(3000);
  });

  it("serializes and hydrates alerts while dropping interval ids", () => {
    const alerts = [
      {
        id: 1,
        productId: 1,
        productName: "Water",
        quality: "all",
        targetPrice: 5,
        active: true,
        intervalId: 999,
        lastPrice: 4,
        lastCheck: 123,
        triggered: true,
      },
    ];

    const serialized = serializeAlerts(alerts);
    expect(serialized[0]).not.toHaveProperty("intervalId");

    const hydrated = hydrateAlerts(serialized);
    expect(hydrated[0].intervalId).toBeNull();
  });

  it("resolves next id from provided value or max id fallback", () => {
    expect(resolveNextAlertId([], 5)).toBe(5);
    expect(resolveNextAlertId([{ id: 3 }, { id: 9 }], undefined)).toBe(10);
    expect(resolveNextAlertId([], null)).toBe(1);
  });

  it("appends alert immutably", () => {
    const before = [];
    const alert = createAlert({ id: 1, productId: 1, productName: "A", quality: 1, targetPrice: 5 });
    const after = appendAlert(before, alert);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });
});
