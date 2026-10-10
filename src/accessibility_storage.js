import * as storage from "./data/storage.js";
import { emptyPrefs, normalizePrefs } from "./accessibility_calc.js";

// The switch follows the player across devices; building colors belong to one company/realm.
const SETTINGS = {
  domain: "a11y-settings",
  version: 1,
  scope: "global",
  backend: "sync",
  refreshAuth: false,
};
const BUILDINGS = { domain: "a11y-buildings", version: 1, scope: "scoped", backend: "chrome" };

/** @returns {Promise<boolean>} */
export async function loadAccessibilityEnabled() {
  try {
    const data = await storage.get(SETTINGS);
    return Boolean(/** @type {any} */ (data)?.enabled);
  } catch {
    return false;
  }
}

/** @param {boolean} enabled */
export async function saveAccessibilityEnabled(enabled) {
  try {
    return await storage.set({ ...SETTINGS, data: { enabled: Boolean(enabled) } });
  } catch {
    return false;
  }
}

/**
 * Other tabs flipping the switch.
 * @param {(enabled: boolean) => void} listener
 */
export function watchAccessibilityEnabled(listener) {
  return storage.watchGlobal(SETTINGS, (data) => listener(Boolean(/** @type {any} */ (data)?.enabled)));
}

/** @returns {Promise<import("./accessibility_calc.js").AccessibilityPrefs>} */
export async function loadBuildingPrefs() {
  try {
    return normalizePrefs(await storage.get(BUILDINGS));
  } catch {
    return emptyPrefs();
  }
}

/** @param {import("./accessibility_calc.js").AccessibilityPrefs} prefs */
export async function saveBuildingPrefs(prefs) {
  try {
    return await storage.set({ ...BUILDINGS, data: prefs });
  } catch {
    return false;
  }
}
