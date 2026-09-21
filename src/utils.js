import { STATE } from "./state.js";

/** Market fee charged on market sales (4%) */
export const MARKET_FEE = 0.04;

/** Transport container product ID in SimCompanies */
export const TRANSPORT_RESOURCE_ID = 13;

const COMMA_DECIMAL_PATH_PREFIXES = ["/de", "/fr", "/pt", "/tr", "/it", "/es", "/cs", "/pl"];

function getPreferredDecimalSeparator() {
  try {
    const path = window.location?.pathname || "";
    for (const prefix of COMMA_DECIMAL_PATH_PREFIXES) {
      if (path.startsWith(prefix)) return ",";
    }
    return ".";
  } catch {
    return ".";
  }
}

/**
 * Parse a locale-agnostic number from text.
 *   EN: 1,234.56  (comma = thousands, dot = decimal)
 *   DE: 1.234,56  (dot = thousands, comma = decimal)
 * Heuristic: if both separators exist, the last one is decimal.
 * If only one separator exists, prefer the decimal separator based on URL locale.
 * @param {string} raw
 * @returns {number}
 */
export function parseLocaleNumber(raw) {
  let s = String(raw).trim().replace(/\s+/g, "");
  const numeric = s.match(/-?[\d.,]+/);
  if (!numeric) return NaN;
  s = numeric[0];
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const preferredDecimal = getPreferredDecimalSeparator();

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    s = s.replace(new RegExp(`\\${thousandsSep}`, "g"), "");
    if (decimalSep === ",") s = s.replace(",", ".");
    return Number(s);
  }

  if (lastComma !== -1) {
    if (preferredDecimal === ",") {
      return Number(s.replace(",", "."));
    }
    return Number(s.replace(/,/g, ""));
  }

  if (lastDot !== -1) {
    if (preferredDecimal === ".") {
      return Number(s);
    }
    const afterDot = s.slice(lastDot + 1);
    if (/^\d{1,2}$/.test(afterDot) && s.slice(0, lastDot).length <= 3) {
      return Number(s);
    }
    return Number(s.replace(/\./g, ""));
  }

  return Number(s);
}

/**
 * Extract product ID from a row containing an encyclopedia resource link.
 * @param {Element} row - DOM element containing the product link
 * @returns {number|null} Product ID or null
 */
export function extractProductIdFromRow(row) {
  if (!row) return null;
  const a = row.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
  const href = a?.getAttribute("href") || "";
  const m = href.match(/\/resource\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

/**
 * Find the info column (div.right-border containing an h3) within a row.
 * This is the column that holds product name, profit, finishes, etc.
 * @param {Element} row - DOM element of the row
 * @returns {Element|null}
 */
export function getInfoColumn(row) {
  if (!row) return null;
  const cols = row.querySelectorAll("div.right-border");
  return [...cols].find((c) => c.querySelector("h3")) || null;
}

/** SVG markup for the standard copy-to-clipboard button icon */
export const COPY_BUTTON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>`;

/**
 * Wire up a copy-to-clipboard button inside a container element.
 * Finds the .scx-copy-btn, attaches a click handler that calls getTextFn()
 * and copies the result. Uses capture phase to intercept before other handlers.
 *
 * @param {Element} containerEl - Parent element containing a .scx-copy-btn
 * @param {Function} getTextFn - Returns the text string to copy (may be async)
 */
export function wireCopyButton(containerEl, getTextFn) {
  if (!containerEl) return;

  const handleCopyClick = async (e) => {
    const btn = e.target.closest(".scx-copy-btn");
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    try {
      const text = await getTextFn();
      await copyToClipboard(text, btn);
    } catch (err) {
      console.debug("[SimHelper] Copy error:", err);
    }
  };

  // Remove old listener if it exists
  if (containerEl._copyClickHandler) {
    containerEl.removeEventListener("click", containerEl._copyClickHandler, true);
  }

  containerEl._copyClickHandler = handleCopyClick;
  containerEl.addEventListener("click", handleCopyClick, true);
}

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
  const parts = abs.split(".");
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = parts[1];

  const formatted = decimal ? `${integer}.${decimal}` : integer;
  return prefix ? `${sign}$${formatted}` : `${sign}${formatted}`;
}

/** Contract discount bounds, shared by the widget input and rule templates. */
export const DISCOUNT_PCT_MIN = 0;
export const DISCOUNT_PCT_MAX = 100;
export const DISCOUNT_PCT_STEP = 0.5;

/**
 * Clamps a free-form discount percentage into the allowed range.
 * Users can type any value, so the fraction is rounded to 2 decimals to keep
 * float noise ("2.5000000000000004") out of storage and out of the UI.
 * @param {unknown} raw
 * @returns {number|null} null when the value is not a usable number
 */
export function normalizeDiscountPct(raw) {
  const value = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(DISCOUNT_PCT_MAX, Math.max(DISCOUNT_PCT_MIN, value));
  return Math.round(clamped * 100) / 100;
}

/**
 * Signed label for a discount percentage: "+0%" when there is no discount,
 * "-2.5%" otherwise. Trailing zeros are dropped ("3" not "3.00").
 * @param {number} discountPct
 * @returns {string}
 */
export function formatDiscountPct(discountPct) {
  const pct = normalizeDiscountPct(discountPct) ?? 0;
  return pct === 0 ? "+0%" : `-${pct}%`;
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
          res.catch((err) => console.debug("[SimHelper] Render (async) error:", err));
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
      const hadChildElements = feedbackEl.childElementCount > 0;
      const originalHtml = feedbackEl.innerHTML;
      const originalText = feedbackEl.textContent;

      feedbackEl.textContent = "✓ Copied!";
      setTimeout(() => {
        if (hadChildElements) {
          feedbackEl.innerHTML = originalHtml;
          return;
        }
        feedbackEl.textContent = originalText;
      }, 1500);
    }
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}
