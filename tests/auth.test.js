import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/data/apiClient.js", () => ({ request: vi.fn() }));

import { loadAuthDataOnce } from "../src/auth.js";
import { request } from "../src/data/apiClient.js";
import { STATE } from "../src/state.js";

const AUTH_PAYLOAD = {
  authCompany: { companyId: 5281350, realmId: 0, productionModifier: 1, salesModifier: 1 },
  levelInfo: { level: 20, experience: 100, experienceToNextLevel: 200 },
};

function resetAuthState() {
  STATE.auth.companyId = null;
  STATE.auth.realmId = null;
  STATE.auth.productionModifier = null;
  STATE.auth.salesModifier = null;
  STATE.auth.loaded = false;
  STATE.auth.loading = false;
  STATE.auth.error = null;
}

/** Lets a test resolve/reject the pending auth request by hand. */
function deferRequest() {
  let settle;
  request.mockReturnValueOnce(
    new Promise((resolve, reject) => {
      settle = { resolve, reject };
    }),
  );
  return settle;
}

describe("loadAuthDataOnce", () => {
  beforeEach(() => {
    resetAuthState();
    vi.clearAllMocks();
  });

  it("makes concurrent callers wait for the same in-flight request", async () => {
    const pending = deferRequest();

    // Mirrors the real boot order: one feature starts the load, a second one
    // calls while it is still in flight (chat filter, then contract rules).
    const first = loadAuthDataOnce();
    const second = loadAuthDataOnce();

    expect(request).toHaveBeenCalledTimes(1);

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });

    // The second caller must not resolve early with auth still unloaded.
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    expect(STATE.auth.companyId).toBeNull();

    pending.resolve(AUTH_PAYLOAD);
    await Promise.all([first, second]);

    // Both callers observe resolved auth — this is what resolveScope() needs
    // to build a scoped storage key instead of failing closed.
    expect(STATE.auth.companyId).toBe(5281350);
    expect(STATE.auth.realmId).toBe(0);
    expect(STATE.auth.loaded).toBe(true);
    expect(STATE.auth.loading).toBe(false);
  });

  it("short-circuits once loaded and refetches only when forced", async () => {
    request.mockResolvedValueOnce(AUTH_PAYLOAD);
    await loadAuthDataOnce();
    expect(request).toHaveBeenCalledTimes(1);

    await loadAuthDataOnce();
    expect(request).toHaveBeenCalledTimes(1);

    request.mockResolvedValueOnce(AUTH_PAYLOAD);
    await loadAuthDataOnce({ force: true });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("joins an in-flight load instead of issuing a duplicate forced request", async () => {
    const pending = deferRequest();

    const first = loadAuthDataOnce();
    const forced = loadAuthDataOnce({ force: true });

    expect(request).toHaveBeenCalledTimes(1);

    pending.resolve(AUTH_PAYLOAD);
    await Promise.all([first, forced]);

    expect(STATE.auth.loaded).toBe(true);
  });

  it("records the error and allows a retry after a failed load", async () => {
    request.mockRejectedValueOnce(new Error("network down"));
    await loadAuthDataOnce();

    expect(STATE.auth.error).toBe("network down");
    expect(STATE.auth.loaded).toBe(false);
    expect(STATE.auth.loading).toBe(false);

    // The in-flight slot must be cleared so a later attempt actually retries.
    request.mockResolvedValueOnce(AUTH_PAYLOAD);
    await loadAuthDataOnce();

    expect(request).toHaveBeenCalledTimes(2);
    expect(STATE.auth.companyId).toBe(5281350);
    expect(STATE.auth.error).toBeNull();
  });
});
