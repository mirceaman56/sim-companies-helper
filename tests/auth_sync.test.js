// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/data/apiClient.js", () => ({ request: vi.fn() }));

import { request } from "../src/data/apiClient.js";
import { STATE } from "../src/state.js";
import { loadAuthDataOnce } from "../src/auth.js";
import { ensureAuthContextCurrent, initAuthContextSync, _testUtils } from "../src/auth_sync.js";

const { STORAGE_KEY } = _testUtils;

const authPayload = (companyId, realmId) => ({ authCompany: { companyId, realmId } });

function pageForRealm(realmId) {
  const asset = {
    0: "Magnates_140.png",
    1: "Entrepeneurs_140.png",
    2: "Challenge_140.png",
    unknown: "Future_140.png",
  }[realmId];
  const html = asset ? `<img src="/static/images/realms/${asset}">` : "<div></div>";
  return new DOMParser().parseFromString(html, "text/html");
}

function createFakeChrome() {
  const store = {};
  const listeners = new Set();
  const emit = (changes) => listeners.forEach((fn) => fn(changes, "local"));

  return {
    store,
    emit,
    storage: {
      local: {
        get: vi.fn(async (key) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items) => {
          Object.assign(store, items);
          emit(Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }])));
        }),
        remove: vi.fn(async () => {}),
      },
      onChanged: {
        addListener: vi.fn((fn) => listeners.add(fn)),
        removeListener: vi.fn((fn) => listeners.delete(fn)),
      },
    },
  };
}

function resetAuthState() {
  Object.assign(STATE.auth, {
    companyId: null,
    realmId: null,
    productionModifier: null,
    salesModifier: null,
    loaded: false,
    loading: false,
    error: null,
  });
}

async function loadAuthAs(companyId, realmId) {
  request.mockResolvedValueOnce(authPayload(companyId, realmId));
  await loadAuthDataOnce({ force: true });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
  _testUtils.reset();
  globalThis.chrome = createFakeChrome();
});

afterEach(() => {
  _testUtils.reset();
  delete globalThis.chrome;
});

describe("ensureAuthContextCurrent", () => {
  it("loads auth when it is missing, without a second forced call", async () => {
    request.mockResolvedValueOnce(authPayload(5, 0));

    await ensureAuthContextCurrent(pageForRealm(0));
    await ensureAuthContextCurrent(pageForRealm(0));

    expect(request).toHaveBeenCalledTimes(1);
    expect(STATE.auth.realmId).toBe(0);
  });

  it("makes no API call while the page realm stays the same", async () => {
    await loadAuthAs(5, 0);
    request.mockClear();

    for (let i = 0; i < 5; i += 1) {
      await ensureAuthContextCurrent(pageForRealm(0));
    }

    expect(request).not.toHaveBeenCalled();
  });

  it("refetches once when the page switches realm in the same tab", async () => {
    await loadAuthAs(5, 0);
    await ensureAuthContextCurrent(pageForRealm(0));
    request.mockClear();

    request.mockResolvedValueOnce(authPayload(6, 1));
    await ensureAuthContextCurrent(pageForRealm(1));
    await ensureAuthContextCurrent(pageForRealm(1));

    expect(request).toHaveBeenCalledTimes(1);
    expect(STATE.auth).toMatchObject({ companyId: 6, realmId: 1 });
  });

  it("does not keep refetching when the server still reports the old realm", async () => {
    await loadAuthAs(5, 0);
    await ensureAuthContextCurrent(pageForRealm(0));
    request.mockClear();

    request.mockResolvedValue(authPayload(5, 0));
    for (let i = 0; i < 4; i += 1) {
      await ensureAuthContextCurrent(pageForRealm(1));
    }

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("follows a switch to the Challenge realm and back in the same tab", async () => {
    await loadAuthAs(5, 0);
    await ensureAuthContextCurrent(pageForRealm(0));
    request.mockClear();

    request.mockResolvedValueOnce(authPayload(7, 2));
    await ensureAuthContextCurrent(pageForRealm(2));
    expect(STATE.auth).toMatchObject({ companyId: 7, realmId: 2 });

    request.mockResolvedValueOnce(authPayload(5, 0));
    await ensureAuthContextCurrent(pageForRealm(0));

    expect(request).toHaveBeenCalledTimes(2);
    expect(STATE.auth).toMatchObject({ companyId: 5, realmId: 0 });
  });

  it("refetches once when the page switches to a realm the adapter does not know", async () => {
    await loadAuthAs(5, 0);
    await ensureAuthContextCurrent(pageForRealm(0));
    request.mockClear();

    request.mockResolvedValueOnce(authPayload(8, 3));
    await ensureAuthContextCurrent(pageForRealm("unknown"));
    await ensureAuthContextCurrent(pageForRealm("unknown"));

    expect(request).toHaveBeenCalledTimes(1);
    expect(STATE.auth).toMatchObject({ companyId: 8, realmId: 3 });
  });

  it("trusts fresh auth when the first page seen shows an unknown realm", async () => {
    await loadAuthAs(8, 3);
    request.mockClear();

    await ensureAuthContextCurrent(pageForRealm("unknown"));

    expect(request).not.toHaveBeenCalled();
  });

  it("makes no call on pages without a realm logo", async () => {
    await loadAuthAs(5, 0);
    request.mockClear();

    await ensureAuthContextCurrent(pageForRealm(null));

    expect(request).not.toHaveBeenCalled();
  });
});

describe("initAuthContextSync", () => {
  it("publishes auth loaded in this tab for other tabs", async () => {
    initAuthContextSync();
    await loadAuthAs(5, 0);

    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    expect(chrome.store[STORAGE_KEY].data).toEqual({ companyId: 5, realmId: 0 });
  });

  it("refreshes once when another tab reports a different company, without re-publishing", async () => {
    initAuthContextSync();
    await loadAuthAs(5, 0);
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    chrome.storage.local.set.mockClear();
    request.mockClear();

    request.mockResolvedValueOnce(authPayload(6, 1));
    chrome.emit({ [STORAGE_KEY]: { newValue: { v: 1, data: { companyId: 6, realmId: 1 } } } });

    await vi.waitFor(() => expect(STATE.auth.realmId).toBe(1));
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("refetches when the navbar realm logo changes without a page reload", async () => {
    document.body.innerHTML = '<img src="/static/images/realms/Magnates_140.png">';
    initAuthContextSync();
    await loadAuthAs(5, 0);
    await ensureAuthContextCurrent();
    request.mockClear();

    request.mockResolvedValueOnce(authPayload(7, 2));
    document.body.innerHTML = '<img src="/static/images/realms/Challenge_140.png">';

    await vi.waitFor(() => expect(STATE.auth.realmId).toBe(2));
    expect(request).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
  });

  it("ignores reports that match the current company", async () => {
    initAuthContextSync();
    await loadAuthAs(5, 0);
    request.mockClear();

    chrome.emit({ [STORAGE_KEY]: { newValue: { v: 1, data: { companyId: 5, realmId: 0 } } } });
    await flush();

    expect(request).not.toHaveBeenCalled();
  });
});
