import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { request, _testUtils as apiClientTestUtils } from "../src/data/apiClient.js";
import {
  getApiHealth,
  onApiHealthChange,
  initApiHealthSync,
  _testUtils as apiHealthTestUtils,
} from "../src/data/apiHealth.js";

const { STORAGE_KEY } = apiHealthTestUtils;

function createFakeChrome() {
  const store = {};
  const listeners = [];

  return {
    store,
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          if (keys == null) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        }),
        set: vi.fn(async (items) => {
          Object.assign(store, items);
          const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]));
          listeners.forEach((fn) => fn(changes, "local"));
        }),
        remove: vi.fn(async (keys) => {
          for (const k of [].concat(keys)) delete store[k];
        }),
      },
      onChanged: {
        addListener: vi.fn((fn) => listeners.push(fn)),
      },
    },
  };
}

function mockResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve([]),
  };
}

beforeEach(() => {
  apiClientTestUtils.reset();
  apiHealthTestUtils.reset();
  globalThis.chrome = createFakeChrome();
  global.fetch = vi.fn();
});

afterEach(() => {
  delete globalThis.chrome;
  apiClientTestUtils.reset();
  apiHealthTestUtils.reset();
});

describe("apiHealth", () => {
  it("persists a local 429 so reloads and other tabs see the cooldown", async () => {
    await initApiHealthSync();
    global.fetch.mockResolvedValueOnce(mockResponse(429));

    await expect(request("market", { url: "https://www.simcompanies.com/api/v3/market/0/13/" })).rejects.toBeTruthy();

    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    const stored = chrome.store[STORAGE_KEY];
    expect(stored.data).toMatchObject({ blockedUntil: getApiHealth().blockedUntil, reason: "429", hits: 1 });
    expect(stored.ttlMs).toBeGreaterThan(0);
  });

  it("restores a cooldown persisted before the page load", async () => {
    const now = Date.now();
    chrome.store[STORAGE_KEY] = {
      v: 1,
      ts: now,
      ttlMs: 60_000,
      scope: { mode: "global", scopeKey: "global" },
      data: { blockedUntil: now + 60_000, reason: "429", hits: 1 },
    };

    await initApiHealthSync();

    const health = getApiHealth();
    expect(health.blocked).toBe(true);
    expect(health.blockedUntil).toBe(now + 60_000);
  });

  it("follows a cooldown recorded by another tab", async () => {
    await initApiHealthSync();
    const listener = vi.fn();
    onApiHealthChange(listener);

    apiHealthTestUtils.onStorageChanged(
      { [STORAGE_KEY]: { newValue: { data: { blockedUntil: Date.now() + 120_000, reason: "challenge", hits: 2 } } } },
      "local",
    );

    expect(getApiHealth()).toMatchObject({ blocked: true, reason: "challenge" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores other storage areas and keys", async () => {
    await initApiHealthSync();
    const payload = { newValue: { data: { blockedUntil: Date.now() + 120_000 } } };

    apiHealthTestUtils.onStorageChanged({ [STORAGE_KEY]: payload }, "sync");
    apiHealthTestUtils.onStorageChanged({ "scx:other:v1:global": payload }, "local");

    expect(getApiHealth().blocked).toBe(false);
  });
});
