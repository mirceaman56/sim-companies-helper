// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { storage, get, set, migrate } from "../src/data/storage.js";
import { installChromeStorage, installLocalStorage } from "./helpers/storage_mocks.js";

describe("data/storage", () => {
  let chromeStorage;
  let pageStorage;

  beforeEach(() => {
    chromeStorage = installChromeStorage();
    pageStorage = installLocalStorage();
  });

  it("stores and reads versioned global envelope data in chrome.storage.local", async () => {
    const ok = await set({
      domain: "unit-cache",
      version: 1,
      scope: "global",
      refreshAuth: false,
      data: { value: 42 },
    });

    expect(ok).toBe(true);
    expect(chromeStorage.local.items["scx:unit-cache:v1:global"]).toMatchObject({
      v: 1,
      data: { value: 42 },
    });

    const value = await get({ domain: "unit-cache", version: 1, scope: "global", refreshAuth: false });
    expect(value).toEqual({ value: 42 });
  });

  it("rejects the legacy page-localStorage backend for envelopes", async () => {
    await expect(
      set({
        domain: "unit-cache",
        version: 1,
        scope: "global",
        backend: "local",
        refreshAuth: false,
        data: 1,
      }),
    ).rejects.toThrow(/legacy/);
  });

  it("migrates from a legacy page-localStorage key and removes it", async () => {
    pageStorage.setItem("scx-legacy-key", JSON.stringify({ foo: "bar" }));

    const result = await migrate({
      domain: "unit-migrate",
      version: 1,
      scope: "global",
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
    expect(pageStorage.getItem("scx-legacy-key")).toBeNull();
    expect(chromeStorage.local.items["scx:unit-migrate:v1:global"]?.data).toEqual({ foo: "bar" });
  });

  it("lists storage entries by prefix", async () => {
    const keyA = storage.buildStorageKey({ domain: "a", version: 1, scopeKey: "global", prefix: "scx" });
    const keyB = storage.buildStorageKey({ domain: "b", version: 1, scopeKey: "global", prefix: "scx" });
    pageStorage.setItem(keyA, JSON.stringify({ v: 1, ts: Date.now(), data: 1 }));
    chromeStorage.local.items[keyB] = { v: 1, ts: Date.now(), data: 2 };

    expect((await storage.listByPrefix({ backend: "local", prefix: "scx:" })).map((e) => e.key)).toEqual([
      keyA,
    ]);
    expect((await storage.listByPrefix({ prefix: "scx:" })).map((e) => e.key)).toEqual([keyB]);
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
      Object.defineProperty(globalThis, "chrome", {
        value: { storage: areas },
        configurable: true,
        writable: true,
      });
    }

    it("reads and writes chrome.storage.sync without touching the local area", async () => {
      const local = createArea();
      const sync = createArea();
      installChrome({ local, sync });

      const ok = await set({
        domain: "sync-test",
        version: 1,
        scope: "global",
        backend: "sync",
        data: { a: 1 },
      });

      expect(ok).toBe(true);
      expect(Object.keys(sync.items)).toEqual(["scx:sync-test:v1:global"]);
      expect(local.items).toEqual({});
      expect(await get({ domain: "sync-test", version: 1, scope: "global", backend: "sync" })).toEqual({
        a: 1,
      });
      expect(await get({ domain: "sync-test", version: 1, scope: "global", backend: "chrome" })).toBeNull();
    });

    it("reports a rejected sync write as false", async () => {
      installChrome({ local: createArea(), sync: createArea({ rejectWrites: true }) });

      const ok = await set({
        domain: "sync-test",
        version: 1,
        scope: "global",
        backend: "sync",
        data: { a: 1 },
      });

      expect(ok).toBe(false);
    });

    it("reports false when chrome.storage.sync is unavailable", async () => {
      installChrome({ local: createArea() });

      const ok = await set({
        domain: "sync-test",
        version: 1,
        scope: "global",
        backend: "sync",
        data: { a: 1 },
      });

      expect(ok).toBe(false);
    });
  });
  it("watchGlobal reports writes to the sync area only when asked for it", async () => {
    const seen = { chrome: [], sync: [] };
    const options = { domain: "a11y-test", version: 1 };
    storage.watchGlobal(options, (data) => seen.chrome.push(data));
    storage.watchGlobal({ ...options, backend: "sync" }, (data) => seen.sync.push(data));

    await set({ ...options, scope: "global", backend: "sync", refreshAuth: false, data: { enabled: true } });
    await set({
      ...options,
      scope: "global",
      backend: "chrome",
      refreshAuth: false,
      data: { enabled: false },
    });

    expect(seen.sync).toEqual([{ enabled: true }]);
    expect(seen.chrome).toEqual([{ enabled: false }]);
  });
});
