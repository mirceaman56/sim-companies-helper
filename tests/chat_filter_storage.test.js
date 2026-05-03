import { describe, expect, it, vi } from "vitest";

import {
  CHAT_FILTER_STORAGE_DOMAIN,
  CHAT_FILTER_STORAGE_VERSION,
  LEGACY_CHAT_ALERTS_STORAGE_DOMAIN,
  LEGACY_CHAT_ALERTS_STORAGE_VERSION,
  LEGACY_CHAT_ALERTS_STORAGE_KEY_PREFIX,
  loadChatFilterSnapshot,
  saveChatFilterSnapshot,
} from "../src/chat_filter_storage.js";

describe("chat_filter_storage", () => {
  it("loads persisted snapshot, clears legacy storage, and drops old product-style alerts", async () => {
    const storageApi = {
      get: vi.fn(async () => ({
        selectedRoomDbLetter: "DE",
        alerts: [
          {
            id: 2,
            roomDbLetter: "DE",
            roomName: "German Trade",
            productId: 7,
            productName: "Apples",
          },
        ],
        nextAlertId: 3,
      })),
      remove: vi.fn(async () => true),
      removeRaw: vi.fn(async () => true),
    };

    const snapshot = await loadChatFilterSnapshot({
      state: { auth: { realmId: 5 } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(storageApi.remove).toHaveBeenCalledWith({
      domain: LEGACY_CHAT_ALERTS_STORAGE_DOMAIN,
      version: LEGACY_CHAT_ALERTS_STORAGE_VERSION,
      scope: "scoped",
      backend: "chrome",
      refreshAuth: true,
    });
    expect(storageApi.removeRaw).toHaveBeenCalledWith("chrome", `${LEGACY_CHAT_ALERTS_STORAGE_KEY_PREFIX}-5`);
    expect(storageApi.get).toHaveBeenCalledWith({
      domain: CHAT_FILTER_STORAGE_DOMAIN,
      version: CHAT_FILTER_STORAGE_VERSION,
      scope: "scoped",
      backend: "chrome",
      refreshAuth: true,
    });
    expect(snapshot).toEqual({
      selectedRoomDbLetter: "DE",
      alerts: [],
      nextAlertId: 1,
    });
  });

  it("saves only selected room and free-text alert definitions", async () => {
    const storageApi = {
      set: vi.fn(async () => true),
    };

    await saveChatFilterSnapshot({
      selectedRoomDbLetter: "S",
      alerts: [
        {
          id: 1,
          roomDbLetter: "S",
          roomName: "Sales",
          keywords: ["sell"],
          companyFilter: "Acme",
          active: false,
          triggered: false,
          intervalId: 999,
          lastCheck: null,
          lastMatchMessageId: null,
          lastMatchAt: null,
          lastMatchCompany: null,
          lastMatchBody: null,
        },
      ],
      nextAlertId: 2,
      state: { auth: { realmId: 5 } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(storageApi.set).toHaveBeenCalledWith({
      domain: CHAT_FILTER_STORAGE_DOMAIN,
      version: CHAT_FILTER_STORAGE_VERSION,
      scope: "scoped",
      backend: "chrome",
      refreshAuth: true,
      data: {
        selectedRoomDbLetter: "S",
        alerts: [
          {
            id: 1,
            roomDbLetter: "S",
            roomName: "Sales",
            keywords: ["sell"],
            companyFilter: "Acme",
            active: false,
            triggered: false,
            lastCheck: null,
            lastMatchMessageId: null,
            lastMatchAt: null,
            lastMatchCompany: null,
            lastMatchBody: null,
          },
        ],
        nextAlertId: 2,
      },
    });
  });
});
