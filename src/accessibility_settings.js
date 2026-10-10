import {
  loadAccessibilityEnabled,
  saveAccessibilityEnabled,
  watchAccessibilityEnabled,
} from "./accessibility_storage.js";

// Map tags, colors and the editor follow the switch only. High contrast also turns on when
// the OS asks for it, since the player already chose that for every app.
export const ENABLED_CLASS = "scx-a11y-on";
export const CONTRAST_CLASS = "scx-a11y-contrast";
const PREFERS_CONTRAST_QUERY = "(prefers-contrast: more)";

/** @typedef {{ enabled: boolean, contrast: boolean }} AccessibilityMode */

let enabled = false;
let contrastMedia = /** @type {MediaQueryList | null} */ (null);
const listeners = new Set();

function osPrefersContrast() {
  return Boolean(contrastMedia?.matches);
}

/** @returns {AccessibilityMode} */
export function getAccessibilityMode() {
  return { enabled, contrast: enabled || osPrefersContrast() };
}

function apply() {
  const mode = getAccessibilityMode();
  const root = document.documentElement;
  root.classList.toggle(ENABLED_CLASS, mode.enabled);
  root.classList.toggle(CONTRAST_CLASS, mode.contrast);
  for (const listener of [...listeners]) {
    try {
      listener(mode);
    } catch (error) {
      console.debug("[SimHelper] Accessibility listener error:", error);
    }
  }
}

/**
 * @param {(mode: AccessibilityMode) => void} listener
 * @returns {() => void}
 */
export function onAccessibilityModeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {boolean} value */
export async function setAccessibilityEnabled(value) {
  enabled = Boolean(value);
  apply();
  await saveAccessibilityEnabled(enabled);
}

/** @param {{ matchMediaFn?: typeof window.matchMedia }} [options] */
export async function initAccessibilitySettings(options = {}) {
  const { matchMediaFn = window.matchMedia?.bind(window) } = options;
  contrastMedia = matchMediaFn?.(PREFERS_CONTRAST_QUERY) || null;
  contrastMedia?.addEventListener?.("change", apply);
  watchAccessibilityEnabled((value) => {
    if (value === enabled) return;
    enabled = value;
    apply();
  });
  enabled = await loadAccessibilityEnabled();
  apply();
}

export const _testUtils = {
  reset() {
    enabled = false;
    contrastMedia = null;
    listeners.clear();
  },
};
