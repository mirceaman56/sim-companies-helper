// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  applyChatFilterMatchState,
  appendChatFilterAlert,
  canAddChatFilterAlert,
  createChatFilterAlert,
  findChatFilterAlertById,
  hydrateChatFilterAlerts,
  isValidChatFilterAlertInput,
  parseKeywords,
  removeChatFilterAlertState,
  resetChatFilterAlertState,
  resolveNextChatFilterAlertId,
  serializeChatFilterAlerts,
  startChatFilterAlertState,
  stopChatFilterAlertState,
} from "../src/chat_filter_alerts_state.js";

describe("chat_filter_alerts_state", () => {
  it("parses keyword input and creates room-aware free-text alerts", () => {
    expect(parseKeywords("sell, buying, SELL")).toEqual(["sell", "buying"]);

    const alert = createChatFilterAlert({
      id: 1,
      roomDbLetter: "DE",
      roomName: "German Trade",
      keywords: ["sell"],
      companyFilter: "  Acme ",
    });

    expect(alert).toMatchObject({
      roomDbLetter: "DE",
      roomName: "German Trade",
      keywords: ["sell"],
      companyFilter: "Acme",
      active: false,
      triggered: false,
    });
  });

  it("validates required fields", () => {
    expect(
      isValidChatFilterAlertInput({
        roomDbLetter: "S",
        roomName: "Sales",
        keywords: ["sell"],
      }),
    ).toBe(true);
    expect(isValidChatFilterAlertInput({ roomDbLetter: "", roomName: "", keywords: [] })).toBe(false);
  });

  it("supports alert list mutations", () => {
    const alert = createChatFilterAlert({
      id: 1,
      roomDbLetter: "S",
      roomName: "Sales",
      keywords: ["sell"],
    });

    const before = [];
    const after = appendChatFilterAlert(before, alert);

    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(canAddChatFilterAlert(after, 2)).toBe(true);
    expect(canAddChatFilterAlert(after, 1)).toBe(false);
    expect(findChatFilterAlertById(after, 1)?.roomName).toBe("Sales");
    expect(removeChatFilterAlertState(after, 1)).toHaveLength(0);
  });

  it("starts, stops, resets, and dedupes matches", () => {
    const alert = createChatFilterAlert({
      id: 1,
      roomDbLetter: "DE",
      roomName: "German Trade",
      keywords: ["sell"],
    });

    expect(startChatFilterAlertState(alert)).toBe(true);
    expect(startChatFilterAlertState(alert)).toBe(false);
    expect(alert.active).toBe(true);

    expect(
      applyChatFilterMatchState(
        alert,
        { id: 500, datetime: "2026-04-12T10:00:00Z", companyName: "Acme", body: "Verkaufe :re-7:" },
        1000,
      ),
    ).toBe("triggered");
    expect(alert.triggered).toBe(true);

    expect(
      applyChatFilterMatchState(
        alert,
        { id: 500, datetime: "2026-04-12T10:00:00Z", companyName: "Acme", body: "Verkaufe :re-7:" },
        2000,
      ),
    ).toBe("unchanged");

    resetChatFilterAlertState(alert);
    expect(alert.triggered).toBe(false);
    expect(stopChatFilterAlertState(alert)).toBe(true);
    expect(alert.active).toBe(false);
  });

  it("serializes and hydrates runtime fields", () => {
    const serialized = serializeChatFilterAlerts([
      {
        id: 1,
        roomDbLetter: "S",
        roomName: "Sales",
        keywords: ["sell"],
        companyFilter: null,
        active: true,
        triggered: false,
        intervalId: 44,
        lastCheck: 100,
        lastMatchMessageId: 500,
        lastMatchAt: "2026-04-12T10:00:00Z",
        lastMatchCompany: "Acme",
        lastMatchBody: "Selling",
      },
    ]);

    expect(serialized[0]).not.toHaveProperty("intervalId");

    const hydrated = hydrateChatFilterAlerts(serialized);
    expect(hydrated[0].intervalId).toBeNull();
    expect(hydrated[0].keywords).toEqual(["sell"]);
    expect(resolveNextChatFilterAlertId(hydrated, undefined)).toBe(2);
  });
});
