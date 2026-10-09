// In-memory chrome.storage / localStorage for tests. Prefer these over hand-rolled mocks.

/**
 * In-memory chrome.storage area with the MV3 promise API.
 * @param {{ name: string, emit: (changes: object, area: string) => void, rejectWrites?: boolean }} options
 */
export function createChromeStorageArea({ name, emit, rejectWrites = false }) {
  const items = {};
  return {
    items,
    async get(keys) {
      if (keys == null) return structuredClone(items);
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of list) if (key in items) out[key] = structuredClone(items[key]);
      return out;
    },
    async set(entries) {
      if (rejectWrites) throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
      const changes = {};
      for (const [key, value] of Object.entries(entries)) {
        changes[key] = { oldValue: items[key], newValue: structuredClone(value) };
        items[key] = structuredClone(value);
      }
      emit(changes, name);
    },
    async remove(keys) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!(key in items)) continue;
        changes[key] = { oldValue: items[key] };
        delete items[key];
      }
      emit(changes, name);
    },
    async clear() {
      for (const key of Object.keys(items)) delete items[key];
    },
  };
}

/**
 * Install global.chrome with in-memory storage.local / storage.sync / storage.onChanged
 * and runtime.getManifest(). Returns the areas for seeding and assertions.
 * @param {{ syncRejectsWrites?: boolean, version?: string }} [options]
 */
export function installChromeStorage({ syncRejectsWrites = false, version = "1.0.0" } = {}) {
  const listeners = new Set();
  const emit = (changes, area) => {
    if (Object.keys(changes).length === 0) return;
    for (const listener of listeners) listener(changes, area);
  };
  const local = createChromeStorageArea({ name: "local", emit });
  const sync = createChromeStorageArea({ name: "sync", emit, rejectWrites: syncRejectsWrites });
  const onChanged = {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
  };
  Object.defineProperty(globalThis, "chrome", {
    value: { storage: { local, sync, onChanged }, runtime: { getManifest: () => ({ version }) } },
    configurable: true,
    writable: true,
  });
  return { local, sync, onChanged, listeners };
}

export function installLocalStorage() {
  const store = new Map();
  const mock = {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: mock, configurable: true, writable: true });
  return mock;
}
