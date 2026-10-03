import { describe, expect, it, vi } from "vitest";

import {
  LEGACY_STORAGE_VERSION,
  loadRulesSnapshot,
  saveRulesSnapshot,
  STORAGE_DOMAIN,
  STORAGE_VERSION,
} from "../src/contract_rules_storage.js";

const auth = { state: { auth: { companyId: 42, realmId: 5 } }, ensureAuthFn: async () => {} };
const key = (backend, version = STORAGE_VERSION) => ({
  domain: STORAGE_DOMAIN,
  version,
  scope: "scoped",
  backend,
  refreshAuth: true,
});

const percentRule = {
  id: 1,
  productId: 9,
  companyName: "Grupo Negreiros",
  amount: 5000,
  priceMode: "percent",
  discountPct: 3,
  fixedPrice: null,
  note: "",
};
const fixedRule = {
  id: 2,
  productId: 9,
  companyName: "Grupo Negreiros",
  amount: 25000,
  priceMode: "fixed",
  discountPct: null,
  fixedPrice: 0.315,
  note: "100k daily",
};
const compact = [
  { i: 1, p: 9, c: "Grupo Negreiros", a: 5000, m: "p", v: 3 },
  { i: 2, p: 9, c: "Grupo Negreiros", a: 25000, m: "f", v: 0.315, n: "100k daily" },
];

/**
 * In-memory stand-in for the storage API, keyed by backend + version.
 * @param {{seed?: object, syncWritable?: boolean}} [options]
 */
function fakeStorage({ seed = {}, syncWritable = true } = {}) {
  const store = { ...seed };
  const id = ({ backend, version }) => `${backend}:v${version}`;
  return {
    store,
    get: vi.fn(async (opts) => store[id(opts)] ?? null),
    set: vi.fn(async ({ data, ...opts }) => {
      if (opts.backend === "sync" && !syncWritable) return false;
      store[id(opts)] = data;
      return true;
    }),
    remove: vi.fn(async (opts) => {
      delete store[id(opts)];
      return true;
    }),
  };
}

describe("contract_rules_storage", () => {
  it("saves the compact snapshot to chrome.storage.sync and clears the local fallback", async () => {
    const storageApi = fakeStorage({ seed: { "chrome:v2": { rules: [], nextRuleId: 1 } } });

    const result = await saveRulesSnapshot({
      rules: [percentRule, fixedRule],
      nextRuleId: 3,
      ...auth,
      storageApi,
    });

    expect(result).toEqual({ saved: true, synced: true });
    expect(storageApi.set).toHaveBeenCalledWith({ ...key("sync"), data: { rules: compact, nextRuleId: 3 } });
    expect(storageApi.store).toEqual({ "sync:v2": { rules: compact, nextRuleId: 3 } });
  });

  it("falls back to local storage when sync rejects the write", async () => {
    const storageApi = fakeStorage({ syncWritable: false });

    const result = await saveRulesSnapshot({ rules: [fixedRule], nextRuleId: 3, ...auth, storageApi });

    expect(result).toEqual({ saved: true, synced: false });
    expect(storageApi.store["chrome:v2"]).toEqual({ rules: [compact[1]], nextRuleId: 3 });
  });

  it("returns null when nothing is stored", async () => {
    const result = await loadRulesSnapshot({ ...auth, storageApi: fakeStorage() });

    expect(result).toBeNull();
  });

  it("loads and hydrates the synced snapshot, dropping malformed entries", async () => {
    const storageApi = fakeStorage({
      seed: {
        "sync:v2": { rules: [...compact, { i: 3, p: 9, c: "LR reis Ltd" /* no amount */ }], nextRuleId: 4 },
      },
    });

    const result = await loadRulesSnapshot({ ...auth, storageApi });

    expect(result).toEqual({ rules: [percentRule, fixedRule], nextRuleId: 4, synced: true });
  });

  it("prefers a local fallback copy over sync and retries the upload", async () => {
    const storageApi = fakeStorage({
      seed: {
        "chrome:v2": { rules: compact, nextRuleId: 3 },
        "sync:v2": { rules: [compact[0]], nextRuleId: 2 },
      },
    });

    const result = await loadRulesSnapshot({ ...auth, storageApi });

    expect(result).toEqual({ rules: [percentRule, fixedRule], nextRuleId: 3, synced: true });
    expect(storageApi.store).toEqual({ "sync:v2": { rules: compact, nextRuleId: 3 } });
  });

  it("migrates v1 local rules into sync and removes the legacy key", async () => {
    const storageApi = fakeStorage({
      seed: {
        "chrome:v1": {
          rules: [
            {
              id: 1,
              productId: 9,
              productName: "Steel",
              companyName: "Grupo Negreiros",
              amount: 5000,
              discountPct: 3,
            },
          ],
          nextRuleId: 2,
        },
      },
    });

    const result = await loadRulesSnapshot({ ...auth, storageApi });

    expect(result).toEqual({ rules: [percentRule], nextRuleId: 2, synced: true });
    expect(storageApi.remove).toHaveBeenCalledWith(key("chrome", LEGACY_STORAGE_VERSION));
    expect(storageApi.store).toEqual({ "sync:v2": { rules: [compact[0]], nextRuleId: 2 } });
  });

  it("keeps the v1 rules when neither backend accepts the migrated copy", async () => {
    const legacy = {
      rules: [{ id: 1, productId: 9, companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      nextRuleId: 2,
    };
    const storageApi = fakeStorage({ seed: { "chrome:v1": legacy } });
    storageApi.set.mockImplementation(async () => false);

    const result = await loadRulesSnapshot({ ...auth, storageApi });

    expect(result?.rules).toEqual([percentRule]);
    expect(result?.synced).toBe(false);
    expect(storageApi.remove).not.toHaveBeenCalled();
    expect(storageApi.store["chrome:v1"]).toBe(legacy);
  });

  it("calls ensureAuthFn when realmId is not yet loaded", async () => {
    const ensureAuthFn = vi.fn(async () => {});

    const state = { auth: { companyId: null, realmId: null } };
    ensureAuthFn.mockImplementation(async () => {
      state.auth.companyId = 42;
      state.auth.realmId = 5;
    });

    await loadRulesSnapshot({ state, ensureAuthFn, storageApi: fakeStorage() });

    expect(ensureAuthFn).toHaveBeenCalledTimes(1);
  });

  it("reads storage only after ensureAuthFn has fully resolved the auth scope", async () => {
    // Guards the F5 regression: ensureAuthFn must actually complete before the
    // storage read, otherwise resolveScope() fails closed and the rules silently
    // come back empty even though they are persisted.
    const state = { auth: { realmId: null, companyId: null } };
    const ensureAuthFn = vi.fn(async () => {
      await Promise.resolve();
      state.auth.realmId = 0;
      state.auth.companyId = 5281350;
    });
    const storageApi = fakeStorage({ seed: { "sync:v2": { rules: compact, nextRuleId: 3 } } });
    storageApi.get.mockImplementation(async (opts) => {
      expect(state.auth.realmId).toBe(0);
      expect(state.auth.companyId).toBe(5281350);
      return storageApi.store[`${opts.backend}:v${opts.version}`] ?? null;
    });

    const result = await loadRulesSnapshot({ state, ensureAuthFn, storageApi });

    expect(result?.rules).toHaveLength(2);
    expect(result?.rules[0].companyName).toBe("Grupo Negreiros");
  });

  it("rejects a load when the account is still unknown instead of reporting no rules", async () => {
    const storageApi = fakeStorage({ seed: { "sync:v2": { rules: compact, nextRuleId: 3 } } });

    await expect(
      loadRulesSnapshot({
        state: { auth: { companyId: null, realmId: 0 } },
        ensureAuthFn: async () => {},
        storageApi,
      }),
    ).rejects.toThrow();
    expect(storageApi.get).not.toHaveBeenCalled();
  });

  it("reports a failed save when the account is still unknown", async () => {
    const storageApi = fakeStorage();

    const result = await saveRulesSnapshot({
      rules: [percentRule],
      nextRuleId: 2,
      state: { auth: { companyId: null, realmId: null } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(result).toEqual({ saved: false, synced: false });
    expect(storageApi.set).not.toHaveBeenCalled();
  });
});
