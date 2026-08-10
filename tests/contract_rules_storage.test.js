import { describe, expect, it, vi } from "vitest";

import {
  loadRulesSnapshot,
  saveRulesSnapshot,
  STORAGE_DOMAIN,
  STORAGE_VERSION,
} from "../src/contract_rules_storage.js";

describe("contract_rules_storage", () => {
  it("saves the rules snapshot under the scoped chrome-backed domain", async () => {
    const storageApi = { set: vi.fn(async () => true) };

    await saveRulesSnapshot({
      rules: [{ id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      nextRuleId: 2,
      state: { auth: { realmId: 5 } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(storageApi.set).toHaveBeenCalledWith({
      domain: STORAGE_DOMAIN,
      version: STORAGE_VERSION,
      scope: "scoped",
      backend: "chrome",
      refreshAuth: true,
      data: {
        rules: [{ id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
        nextRuleId: 2,
      },
    });
  });

  it("returns null when nothing is stored", async () => {
    const storageApi = { get: vi.fn(async () => null) };

    const result = await loadRulesSnapshot({
      state: { auth: { realmId: 5 } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(result).toBeNull();
  });

  it("loads and hydrates a persisted snapshot, dropping malformed entries", async () => {
    const storageApi = {
      get: vi.fn(async () => ({
        rules: [
          { id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 },
          { id: 2, productId: 9, companyName: "LR reis Ltd" /* missing amount, invalid */ },
        ],
        nextRuleId: 3,
      })),
    };

    const result = await loadRulesSnapshot({
      state: { auth: { realmId: 5 } },
      ensureAuthFn: async () => {},
      storageApi,
    });

    expect(storageApi.get).toHaveBeenCalledWith({
      domain: STORAGE_DOMAIN,
      version: STORAGE_VERSION,
      scope: "scoped",
      backend: "chrome",
      refreshAuth: true,
    });
    expect(result).toEqual({
      rules: [{ id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      nextRuleId: 3,
    });
  });

  it("calls ensureAuthFn when realmId is not yet loaded", async () => {
    const ensureAuthFn = vi.fn(async () => {});
    const storageApi = { get: vi.fn(async () => null) };

    await loadRulesSnapshot({
      state: { auth: { realmId: null } },
      ensureAuthFn,
      storageApi,
    });

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
    const storageApi = {
      get: vi.fn(async () => {
        expect(state.auth.realmId).toBe(0);
        expect(state.auth.companyId).toBe(5281350);
        return {
          rules: [
            {
              id: 1,
              productId: 17,
              productName: "Chemicals",
              companyName: "Tokyo Ink Quarrycorp",
              amount: 5000,
              discountPct: 3,
            },
          ],
          nextRuleId: 2,
        };
      }),
    };

    const result = await loadRulesSnapshot({ state, ensureAuthFn, storageApi });

    expect(result?.rules).toHaveLength(1);
    expect(result?.rules[0].companyName).toBe("Tokyo Ink Quarrycorp");
  });
});
