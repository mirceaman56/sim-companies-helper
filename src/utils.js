import { STATE } from "./state.js";

export function formatMoney(x) {
  if (!Number.isFinite(x)) return "—";
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

/**
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  const str = String(unsafe);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function scheduleUpdate(callback) {
  if (STATE.rafPending) return;
  STATE.rafPending = true;
  requestAnimationFrame(() => {
    STATE.rafPending = false;
    if (callback) {
      try {
        const res = callback();
        if (res instanceof Promise) {
          res.catch(err => console.debug("[SimHelper] Render (async) error:", err));
        }
      } catch (err) {
        console.debug("[SimHelper] Render error:", err);
      }
    }
  });
}

/**
 * Safely executes an async function and suppresses errors from the console
 * unless in verbose mode.
 */
export async function runSafe(fn) {
  try {
    await fn();
  } catch (err) {
    console.debug("[SimHelper] Suppressed error:", err);
  }
}



