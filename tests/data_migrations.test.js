// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { _testUtils, runDataMigrations } from "../src/data/migrations.js";
import { installChromeStorage, installLocalStorage } from "./helpers/storage_mocks.js";

const envelope = (v, data) => ({ v, ts: Date.now(), ttlMs: null, scope: { scopeKey: "global" }, data });

describe("data/migrations", () => {
  let chromeStorage;
  let pageStorage;

  beforeEach(() => {
    _testUtils.reset();
    chromeStorage = installChromeStorage({ version: "1.0.0" });
    pageStorage = installLocalStorage();
  });

  it("moves current envelopes from page localStorage into chrome.storage.local", async () => {
    pageStorage.setItem("scx:sidebar-prefs:v1:global", JSON.stringify(envelope(1, { hidden: true })));

    await runDataMigrations();

    expect(chromeStorage.local.items["scx:sidebar-prefs:v1:global"].data).toEqual({ hidden: true });
    expect(pageStorage.getItem("scx:sidebar-prefs:v1:global")).toBeNull();
  });

  it("keeps a chrome.storage copy that already exists", async () => {
    chromeStorage.local.items["scx:sidebar-prefs:v1:global"] = envelope(1, { hidden: false });
    pageStorage.setItem("scx:sidebar-prefs:v1:global", JSON.stringify(envelope(1, { hidden: true })));

    await runDataMigrations();

    expect(chromeStorage.local.items["scx:sidebar-prefs:v1:global"].data).toEqual({ hidden: false });
    expect(pageStorage.getItem("scx:sidebar-prefs:v1:global")).toBeNull();
  });

  it("drops outdated envelopes and the pre-1.0 finance cache instead of moving them", async () => {
    pageStorage.setItem("scx:cashflow-finance:v2:1-0", JSON.stringify(envelope(2, {})));
    pageStorage.setItem("scx-finance-cache-1-0", "{}");
    pageStorage.setItem("scx-contract-discount", "2.5"); // read by its own legacy migration

    await runDataMigrations();

    expect(chromeStorage.local.items["scx:cashflow-finance:v2:1-0"]).toBeUndefined();
    expect(pageStorage.getItem("scx:cashflow-finance:v2:1-0")).toBeNull();
    expect(pageStorage.getItem("scx-finance-cache-1-0")).toBeNull();
    expect(pageStorage.getItem("scx-contract-discount")).toBe("2.5");
  });

  it("purges outdated chrome envelopes once per extension version", async () => {
    chromeStorage.local.items["scx:cashflow-finance:v2:1-0"] = envelope(2, {});
    chromeStorage.local.items["scx:market-alerts:v1:1-0"] = envelope(1, []);

    await runDataMigrations();

    expect(chromeStorage.local.items["scx:cashflow-finance:v2:1-0"]).toBeUndefined();
    expect(chromeStorage.local.items["scx:market-alerts:v1:1-0"]).toBeDefined();
    expect(chromeStorage.local.items[_testUtils.MIGRATION_STATE_KEY].version).toBe("1.0.0");

    // Same version: the full scan is skipped.
    _testUtils.reset();
    chromeStorage.local.items["scx:cashflow-finance:v1:1-0"] = envelope(1, {});
    await runDataMigrations();
    expect(chromeStorage.local.items["scx:cashflow-finance:v1:1-0"]).toBeDefined();
  });
});
