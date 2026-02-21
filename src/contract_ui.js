// contract_ui.js
// Adds a discount widget in the sidebar on contract pages.
// Reads the lowest seller price from the exchange orders section
// and fills the price input with (lowestPrice - X%).

import { t } from "./i18n.js";
import { SIDEBAR_ID } from "./state.js";
import { fetchMarketPrice } from "./market.js";
import { getRealmId } from "./auth.js";
import { formatMoney, parseLocaleNumber, TRANSPORT_RESOURCE_ID } from "./utils.js";

const CONTAINER_ID = "scx-contract-helper";
const STORAGE_KEY = "scx-contract-discount";

let discountPct = 3; // default

/**
 * Initialise the contract helper.
 * Should be called once from content.js.
 * Sets up a MutationObserver so the widget is injected whenever
 * the contract page is rendered (React SPA – DOM can change).
 */
export function initContractHelper() {
  // Load saved discount preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 0 && n <= 100) discountPct = n;
    }
  } catch { /* ignore */ }

  // Observe DOM changes to inject when contract elements are present
  const observer = new MutationObserver(() => {
    if (hasContractElements()) {
      injectIfNeeded();
    } else {
      removeIfPresent();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  if (hasContractElements()) injectIfNeeded();
}

/**
 * Detect contract page by the presence of structural elements:
 * a price input (name="price") and a market exchange table (a[href*="market/resource"]).
 * This is language-agnostic — no URL matching needed.
 */
function hasContractElements() {
  return !!(
    document.querySelector('input[name="price"]') &&
    document.querySelector('a[href*="market/resource"]')
  );
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
}

/**
 * Find the price input by its name attribute: <input name="price" ...>
 */
function findPriceInput() {
  return document.querySelector('input[name="price"]');
}

/**
 * Find the lowest seller price from the exchange orders table.
 * The table lives inside an <a> with href containing "market/resource".
 * Structure: a[href*="market/resource"] > table > tbody > tr (first row)
 *   → last <td> contains the price like "$1.800".
 * Uses structural selectors only — no text matching — so it's language-safe.
 */
function getLowestSellerPrice() {
  // Find all links whose href contains "market/resource" (handles /de/market/resource/ etc.)
  const marketLinks = document.querySelectorAll('a[href*="market/resource"]');
  for (const link of marketLinks) {
    const table = link.querySelector("table");
    if (!table) continue;

    // First row = cheapest listing
    const firstRow = table.querySelector("tr");
    if (!firstRow) continue;

    // Price is in the last <td>
    const cells = firstRow.querySelectorAll("td");
    if (cells.length === 0) continue;

    const priceCell = cells[cells.length - 1];
    const priceText = priceCell?.textContent?.trim() || "";
    // Extract the number after "$" or stand-alone number
    const match = priceText.match(/\$?\s*([\d.,]+)/);
    if (match) {
      const price = parsePrice(match[1]);
      if (Number.isFinite(price) && price > 0) return price;
    }
  }

  return null;
}

/**
 * Parse a price string. Delegates to shared parseLocaleNumber.
 * SimCompanies uses "." as decimal with 3 decimal places.
 */
const parsePrice = parseLocaleNumber;

/**
 * Set a React-controlled input's value properly.
 * React overrides the native value setter, so we need to use the
 * native HTMLInputElement setter and dispatch an input event.
 */
function setInputValue(input, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Dispatch events to notify React
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Apply the discount: read lowest price, calculate discounted price, fill input.
 */
function applyDiscount() {
  const lowestPrice = getLowestSellerPrice();
  if (lowestPrice === null) {
    console.debug("[SimHelper] Could not find lowest seller price on the page.");
    return;
  }

  const priceInput = findPriceInput();
  if (!priceInput) {
    console.debug("[SimHelper] Could not find price input on the page.");
    return;
  }

  const discountedPrice = lowestPrice * (1 - discountPct / 100);
  // Round to 3 decimal places (SimCompanies precision)
  const rounded = Math.floor(discountedPrice * 1000) / 1000;

  setInputValue(priceInput, rounded.toFixed(3));

  // Visual feedback on the button
  const btn = document.getElementById("scx-contract-apply-btn");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = `✓ ${formatMoney(rounded, { decimals: 3 })}`;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1500);
  }
}

function updateButtonLabel() {
  const btn = document.getElementById("scx-contract-apply-btn");
  if (btn) {
    btn.textContent = `${t("contractApplyBtn")}${discountPct}%`;
  }
}

// ── Profit calculation helpers ──────────────────────────────────

/**
 * Read the amount from the contract form input.
 */
function getAmountValue() {
  const input = document.querySelector('input[name="amount"]');
  if (!input) return null;
  const val = parsePrice(input.value);
  return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Read the price-per-unit from the contract form input.
 */
function getPriceValue() {
  const input = findPriceInput();
  if (!input) return null;
  const val = parsePrice(input.value);
  return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Extract sourcing cost per unit from the product info section.
 * Finds the encyclopedia link → parent div → first span starting with "$".
 * Language-safe: uses structural selectors only.
 */
function getSourcingCostPerUnit() {
  const encLinks = document.querySelectorAll('a[href*="encyclopedia"]');
  for (const link of encLinks) {
    const container = link.closest("div");
    if (!container) continue;
    const spans = container.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text.startsWith("$")) {
        const val = parsePrice(text.slice(1));
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
  }
  return null;
}

/**
 * Extract total transport count from the contract page.
 * Finds img[src*="transport"] → parent div → sibling span with "Nx" pattern.
 * Language-safe: uses structural + image selectors only.
 */
function getTransportCount() {
  // There are multiple transport images on the page:
  //   1. Sourcing section (css-1erjzjw) — contains encyclopedia links, shows per-unit transport
  //   2. Transport total section (css-ix8ka2) — NO encyclopedia links, shows total count like "6,301x"
  // We want #2. Distinguish by skipping containers that have encyclopedia links.
  const transportImgs = document.querySelectorAll('img[src*="transport"]');
  for (const img of transportImgs) {
    const container = img.parentElement;
    if (!container) continue;

    // Skip the sourcing/ingredient section — it contains encyclopedia links
    if (container.querySelector('a[href*="encyclopedia"]')) continue;

    const spans = container.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent.trim();
      // Match patterns like "6,301x" or "6.301x" or "6301x"
      const match = text.match(/([\d.,]+)\s*x$/i);
      if (match) {
        // Strip thousands separators (commas or dots) — count is always an integer
        const raw = match[1].replace(/[.,]/g, "");
        const val = parseInt(raw, 10);
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
  }
  return null;
}

/**
 * Calculate and display profit breakdown in the sidebar widget.
 * Profit = Revenue − Sourcing − Transport
 *   Revenue  = amount × price
 *   Sourcing = amount × sourcing_cost_per_unit
 *   Transport = transport_count × transport_market_price
 */
async function calculateAndDisplayProfit() {
  const resultDiv = document.getElementById("scx-contract-profit-result");
  const calcBtn = document.getElementById("scx-contract-calc-btn");
  if (!resultDiv) return;

  const amount = getAmountValue();
  const price = getPriceValue();

  if (!amount || !price) {
    resultDiv.innerHTML = `<div style="color:#999; text-align:center; font-size:10px;">${t("contractSetValues")}</div>`;
    resultDiv.style.display = "block";
    return;
  }

  // Loading indicator
  if (calcBtn) calcBtn.textContent = "...";

  const sourcingCost = getSourcingCostPerUnit();
  const transportCount = getTransportCount();

  const revenue = amount * price;
  const totalSourcing = sourcingCost ? amount * sourcingCost : 0;

  // Fetch transport market price
  let totalTransport = 0;
  if (transportCount) {
    try {
      const realmId = getRealmId();
      const transportPrice = await fetchMarketPrice(realmId, TRANSPORT_RESOURCE_ID);
      if (transportPrice) {
        totalTransport = transportCount * transportPrice;
      }
    } catch (e) {
      console.debug("[SimHelper] Failed to fetch transport price:", e);
    }
  }

  const profit = revenue - totalSourcing - totalTransport;
  const profitColor = profit >= 0 ? "#27ae60" : "#e74c3c";

  resultDiv.innerHTML = `
    <div style="display:flex; justify-content:space-between;">
      <span>${t("contractRevenue")}</span>
      <span>${formatMoney(revenue)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; color:#e67e22;">
      <span>${t("contractSourcing")}</span>
      <span>-${formatMoney(totalSourcing)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; color:#e67e22;">
      <span>${t("contractTransportCost")}</span>
      <span>-${formatMoney(totalTransport)}</span>
    </div>
    <hr style="border:none; border-top:1px solid #ddd; margin:4px 0;">
    <div style="display:flex; justify-content:space-between; font-weight:700; color:${profitColor};">
      <span>${t("profit")}</span>
      <span>${formatMoney(profit)}</span>
    </div>
  `;
  resultDiv.style.display = "block";

  // Reset button text
  if (calcBtn) calcBtn.textContent = `💰 ${t("contractCalcProfit")}`;
}

function injectIfNeeded() {
  if (document.getElementById(CONTAINER_ID)) return;

  const priceInput = findPriceInput();
  if (!priceInput) return;

  // Find the sidebar container to append into
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-sidebar-footer-contract";
  container.style.cssText = `
    width: 180px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-top: 4px;
    box-sizing: border-box;
    overflow: hidden;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: default;
  `;

  container.innerHTML = `
    <div style="font-size: 11px; font-weight: 600; display:flex; align-items:center; gap:5px; color:#555;">
      <span style="font-size: 12px;">📝</span> ${t("contractApplyTooltip")}
    </div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <select id="scx-contract-discount-select" title="${t("contractDiscountLabel")}" style="
        background: #f5f5f5;
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 5px 6px;
        font-size: 12px;
        cursor: pointer;
        font-weight: 500;
        color: #333;
      ">
        <option value="0"${discountPct === 0 ? " selected" : ""}>+0%</option>
        <option value="1"${discountPct === 1 ? " selected" : ""}>-1%</option>
        <option value="2"${discountPct === 2 ? " selected" : ""}>-2%</option>
        <option value="3"${discountPct === 3 ? " selected" : ""}>-3%</option>
        <option value="4"${discountPct === 4 ? " selected" : ""}>-4%</option>
        <option value="5"${discountPct === 5 ? " selected" : ""}>-5%</option>
      </select>
      <button id="scx-contract-apply-btn" title="${t("contractApplyTooltip")}" style="
        background: #3498db;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        white-space: nowrap;
        transition: background 0.2s;
      ">
        ${t("contractApplyBtn")}${discountPct}%
      </button>
    </div>
    <div style="border-top: 1px solid #eee; padding-top: 8px; width: 100%;">
      <button id="scx-contract-calc-btn" style="
        background: #2ecc71;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 5px 10px;
        cursor: pointer;
        font-weight: 600;
        font-size: 11px;
        width: 100%;
        transition: background 0.2s;
      ">
        💰 ${t("contractCalcProfit")}
      </button>
      <div id="scx-contract-profit-result" style="
        display: none;
        font-size: 11px;
        width: 100%;
        margin-top: 6px;
        line-height: 1.6;
      "></div>
    </div>
  `;

  // Append to sidebar — appears after the existing footer buttons
  sidebar.appendChild(container);

  // Hover effect matching other footer buttons
  container.onmouseenter = () => {
    container.style.transform = "translateY(-2px)";
    container.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  };
  container.onmouseleave = () => {
    container.style.transform = "translateY(0)";
    container.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
  };

  // Event: dropdown change
  document.getElementById("scx-contract-discount-select").addEventListener("change", (e) => {
    discountPct = Number(e.target.value);
    try { localStorage.setItem(STORAGE_KEY, String(discountPct)); } catch { /* ignore */ }
    updateButtonLabel();
  });

  // Event: apply button click
  document.getElementById("scx-contract-apply-btn").addEventListener("click", (e) => {
    e.preventDefault();
    applyDiscount();
  });

  // Event: calculate profit button click
  document.getElementById("scx-contract-calc-btn").addEventListener("click", (e) => {
    e.preventDefault();
    calculateAndDisplayProfit();
  });
}
