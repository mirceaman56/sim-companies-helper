// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { storage, get, set, migrate } from "../src/data/storage.js";

function createLocalStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      const k = String(key);
      return store.has(k) ? store.get(k) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

describe("data/storage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it("stores and reads versioned global envelope data", async () => {
    const ok = await set({
      domain: "unit-cache",
      version: 1,
      scope: "global",
      backend: "local",
      refreshAuth: false,
      data: { value: 42 },
    });

    expect(ok).toBe(true);

    const value = await get({
      domain: "unit-cache",
      version: 1,
      scope: "global",
      backend: "local",
      refreshAuth: false,
    });

    expect(value).toEqual({ value: 42 });
  });

  it("migrates from legacy key and removes legacy entry", async () => {
    localStorage.setItem("scx-legacy-key", JSON.stringify({ foo: "bar" }));

    const result = await migrate({
      domain: "unit-migrate",
      version: 1,
      scope: "global",
      backend: "local",
      refreshAuth: false,
      readLegacy: async ({ getRaw, removeRaw, parseJson }) => {
        const raw = await getRaw("local", "scx-legacy-key");
        if (raw == null) return { data: null };
        return {
          data: parseJson(raw),
          async cleanup() {
            await removeRaw("local", "scx-legacy-key");
          },
        };
      },
    });

    expect(result.migrated).toBe(true);
    expect(result.data).toEqual({ foo: "bar" });
    expect(localStorage.getItem("scx-legacy-key")).toBeNull();
  });

  it("lists storage entries by prefix", async () => {
    const keyA = storage.buildStorageKey({ domain: "a", version: 1, scopeKey: "global", prefix: "scx" });
    const keyB = storage.buildStorageKey({ domain: "b", version: 1, scopeKey: "global", prefix: "scx" });
    localStorage.setItem(keyA, JSON.stringify({ v: 1, ts: Date.now(), data: 1 }));
    localStorage.setItem(keyB, JSON.stringify({ v: 1, ts: Date.now(), data: 2 }));

    const all = await storage.listByPrefix({ backend: "local", prefix: "scx:" });
    expect(all.length).toBe(2);
  });

  describe("sync backend", () => {
    function createArea({ rejectWrites = false } = {}) {
      const items = {};
      return {
        items,
        get: async (key) => (key == null ? { ...items } : { [key]: items[key] }),
        set: async (entries) => {
          if (rejectWrites) throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
          Object.assign(items, entries);
        },
        remove: async (key) => {
          delete items[key];
        },
      };
    }

    function installChrome(areas) {
      Object.defineProperty(globalThis, "chrome", { value: { storage: areas }, configurable: true, writable: true });
    }

    it("reads and writes chrome.storage.sync without touching the local area", async () => {
      const local = createArea();
      const sync = createArea();
      installChrome({ local, sync });

      const ok = await set({ domain: "sync-test", version: 1, scope: "global", backend: "sync", data: { a: 1 } });

      expect(ok).toBe(true);
      expect(Object.keys(sync.items)).toEqual(["scx:sync-test:v1:global"]);
      expect(local.items).toEqual({});
      expect(await get({ domain: "sync-test", version: 1, scope: "global", backend: "sync" })).toEqual({ a: 1 });
      expect(await get({ domain: "sync-test", version: 1, scope: "global", backend: "chrome" })).toBeNull();
    });

    it("reports a rejected sync write as false", async () => {
      installChrome({ local: createArea(), sync: createArea({ rejectWrites: true }) });

      const ok = await set({ domain: "sync-test", version: 1, scope: "global", backend: "sync", data: { a: 1 } });

      expect(ok).toBe(false);
    });

    it("reports false when chrome.storage.sync is unavailable", async () => {
      installChrome({ local: createArea() });

      const ok = await set({ domain: "sync-test", version: 1, scope: "global", backend: "sync", data: { a: 1 } });

      expect(ok).toBe(false);
    });
  });
});
