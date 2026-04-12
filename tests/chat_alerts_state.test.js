// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  applyChatMatchState,
  appendChatAlert,
  canAddChatAlert,
  createChatAlert,
  findChatAlertById,
  hydrateChatAlerts,
  isValidChatAlertInput,
  parseKeywords,
  removeChatAlertState,
  resetChatAlertState,
  resolveNextChatAlertId,
  serializeChatAlerts,
  startChatAlertState,
  stopChatAlertState,
} from "../src/chat_alerts_state.js";

describe("chat_alerts_state", () => {
  it("parses comma-separated keywords and de-duplicates case-insensitively", () => {
    expect(parseKeywords("sell, buying, SELL, ,  ")).toEqual(["sell", "buying"]);
  });

  it("validates chat alert input", () => {
    expect(isValidChatAlertInput({ keywords: ["sell"] })).toBe(true);
    expect(isValidChatAlertInput({ keywords: [] })).toBe(false);
  });

  it("creates alert with normalized defaults", () => {
    const alert = createChatAlert({ id: 1, keywords: ["sell"], companyFilter: "  Acme " });
    expect(alert).toMatchObject({
      id: 1,
      keywords: ["sell"],
      companyFilter: "Acme",
      active: false,
      triggered: false,
      intervalId: null,
      lastCheck: null,
      lastMatchMessageId: null,
    });
  });

  it("enforces max count and supports immutable append", () => {
    const alert = createChatAlert({ id: 1, keywords: ["sell"] });
    const before = [];
    const after = appendChatAlert(before, alert);

    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(canAddChatAlert(after, 2)).toBe(true);
    expect(canAddChatAlert(after, 1)).toBe(false);
  });

  it("finds and removes by id", () => {
    const alerts = [createChatAlert({ id: 1, keywords: ["sell"] }), createChatAlert({ id: 2, keywords: ["buy"] })];
    expect(findChatAlertById(alerts, 2)?.id).toBe(2);
    expect(removeChatAlertState(alerts, 1).map((a) => a.id)).toEqual([2]);
  });

  it("starts/stops/resets state", () => {
    const alert = createChatAlert({ id: 1, keywords: ["sell"] });

    expect(startChatAlertState(alert)).toBe(true);
    expect(alert.active).toBe(true);
    expect(startChatAlertState(alert)).toBe(false);

    alert.triggered = true;
    resetChatAlertState(alert);
    expect(alert.triggered).toBe(false);

    expect(stopChatAlertState(alert)).toBe(true);
    expect(alert.active).toBe(false);
  });

  it("applies match state and dedupes by message id", () => {
    const alert = createChatAlert({ id: 1, keywords: ["sell"] });

    const first = applyChatMatchState(
      alert,
      { id: 100, datetime: "2026-04-12T10:00:00Z", companyName: "Acme", body: "Selling stuff" },
      1000,
    );
    expect(first).toBe("triggered");
    expect(alert.triggered).toBe(true);

    const same = applyChatMatchState(
      alert,
      { id: 100, datetime: "2026-04-12T10:00:00Z", companyName: "Acme", body: "Selling stuff" },
      2000,
    );
    expect(same).toBe("unchanged");

    const none = applyChatMatchState(alert, null, 3000);
    expect(none).toBe("cleared");
    expect(alert.triggered).toBe(false);
  });

  it("serializes and hydrates runtime fields", () => {
    const alerts = [
      {
        id: 1,
        keywords: ["sell"],
        companyFilter: null,
        active: true,
        triggered: false,
        intervalId: 999,
        lastCheck: 123,
        lastMatchMessageId: 500,
        lastMatchAt: "2026-04-12T10:15:00Z",
        lastMatchCompany: "Acme",
        lastMatchBody: "Selling",
      },
    ];

    const serialized = serializeChatAlerts(alerts);
    expect(serialized[0]).not.toHaveProperty("intervalId");

    const hydrated = hydrateChatAlerts(serialized);
    expect(hydrated[0].intervalId).toBeNull();
  });

  it("resolves next id", () => {
    expect(resolveNextChatAlertId([], 3)).toBe(3);
    expect(resolveNextChatAlertId([{ id: 4 }, { id: 8 }], undefined)).toBe(9);
    expect(resolveNextChatAlertId([], null)).toBe(1);
  });
});
