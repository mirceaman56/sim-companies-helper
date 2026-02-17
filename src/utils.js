import { STATE } from "./state.js";

/**
 * Format a number as money with thousands separators
 * @param {number} x - The amount to format
 * @param {object} options - Optional formatting options
 * @param {number} options.decimals - Number of decimal places (default: 2)
 * @param {boolean} options.prefix - Whether to include $ prefix (default: true)
 * @returns {string} Formatted amount, e.g. "$1,234,567.89" or "1,234.50"
 */
export function formatMoney(x, options = {}) {
  if (!Number.isFinite(x)) return "—";
  
  const decimals = options.decimals ?? 2;
  const prefix = options.prefix !== false; // default true
  
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x).toFixed(decimals);
  const parts = abs.split('.');
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = parts[1];
  
  const formatted = `${integer}.${decimal}`;
  return prefix ? `${sign}$${formatted}` : `${sign}${formatted}`;
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

/**
 * Copy text to clipboard and show brief feedback
 */
export async function copyToClipboard(text, feedbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (feedbackEl) {
      const orig = feedbackEl.textContent;
      feedbackEl.textContent = "✓ Copied!";
      setTimeout(() => {
        feedbackEl.textContent = orig;
      }, 1500);
    }
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}



