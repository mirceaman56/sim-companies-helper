import { beforeEach, describe, expect, it } from "vitest";

import { resolveScopeSync } from "../src/data/scope.js";
import { STATE } from "../src/state.js";

describe("data/scope", () => {
  beforeEach(() => {
    STATE.auth.companyId = null;
    STATE.auth.realmId = null;
  });

  it("resolves scoped key when auth has company and realm", () => {
    STATE.auth.companyId = 101;
    STATE.auth.realmId = 1;

    const scope = resolveScopeSync("scoped");
    expect(scope.hasScope).toBe(true);
    expect(scope.scopeKey).toBe("101-1");
  });

  it("resolves company scope when only company is available", () => {
    STATE.auth.companyId = 202;

    const scope = resolveScopeSync("company");
    expect(scope.hasScope).toBe(true);
    expect(scope.scopeKey).toBe("202");
  });

  it("returns global scope without auth", () => {
    const scope = resolveScopeSync("global");
    expect(scope.hasScope).toBe(true);
    expect(scope.scopeKey).toBe("global");
  });

  it("fails closed for scoped mode when realm is missing", () => {
    STATE.auth.companyId = 999;

    const scope = resolveScopeSync("scoped");
    expect(scope.hasScope).toBe(false);
    expect(scope.scopeKey).toBeNull();
  });
});
