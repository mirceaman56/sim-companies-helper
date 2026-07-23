// contract_ui.js
// Adds a discount widget in the sidebar on contract pages.
// Reads the lowest seller price from the exchange orders section
// and fills the price input with (lowestPrice - X%).

import { t } from "./i18n.js";
import { SIDEBAR_ID } from "./state.js";
import { fetchMarketPrice } from "./market.js";
import { getRealmId } from "./auth.js";
import { formatMoney, TRANSPORT_RESOURCE_ID } from "./utils.js";
import { renderStateBlock } from "./ui_state.js";
import { storage } from "./data/storage.js";
import { observeDocumentBody, setReactControlledValue } from "./page/page_utils.js";
import {
  computeDiscountedPrice,
  findContractPriceInput,
  getContractAmountValue,
  getContractPriceValue,
  getLowestSellerPrice,
  getSourcingCostPerUnit,
  getTransportCount,
  hasContractPageElements,
  parseContractPrice,
} from "./page/contract_page.js";
import { initContractRulesState, mountContractRulesPanel, refreshContractRulesPanel } from "./contract_rules_ui.js";

const CONTAINER_ID = "scx-contract-helper";
const DISCOUNT_SELECT_ID = "scx-contract-discount-select";
const APPLY_BUTTON_ID = "scx-contract-apply-btn";
const CALC_BUTTON_ID = "scx-contract-calc-btn";
const PROFIT_RESULT_ID = "scx-contract-profit-result";
const STORAGE_KEY = "scx-contract-discount";
const STORAGE_DOMAIN = "contract-discount";
const STORAGE_VERSION = 1;

let discountPct = 3; // default

/**
 * Initialise the contract helper.
 * Should be called once from content.js.
 * Sets up a MutationObserver so the widget is injected whenever
 * the contract page is rendered (React SPA – DOM can change).
 */
export function initContractHelper() {
  void hydrateDiscountPreference();
  // The rules snapshot loads asynchronously (auth + chrome.storage.local).
  // Once it resolves, try to (re)inject and refresh right away instead of
  // waiting on some unrelated future DOM mutation to trigger the observer.
  void initContractRulesState().then(() => {
    if (hasContractPageElements()) {
      injectIfNeeded();
      refreshContractRulesPanel(document);
    }
  });

  // Observe DOM changes to inject when contract elements are present
  observeDocumentBody(() => {
    if (hasContractPageElements()) {
      injectIfNeeded();
      refreshContractRulesPanel(document);
    } else {
      removeIfPresent();
    }
  });

  // Initial check
  if (hasContractPageElements()) {
    injectIfNeeded();
    refreshContractRulesPanel(document);
  }
}

async function hydrateDiscountPreference() {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacy = await getRaw("local", STORAGE_KEY);
      if (legacy == null) return { data: null };
      return {
        data: Number(legacy),
        async cleanup() {
          await removeRaw("local", STORAGE_KEY);
        },
      };
    },
  });

  if (Number.isFinite(data) && data >= 0 && data <= 100) {
    discountPct = data;
  }
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
}

/**
 * Apply the discount: read lowest price, calculate discounted price, fill input.
 */
function applyDiscount() {
  const resultDiv = document.getElementById(PROFIT_RESULT_ID);
  const lowestPrice = getLowestSellerPrice(document);
  if (lowestPrice === null) {
    console.debug("[SimHelper] Could not find lowest seller price on the page.");
    if (resultDiv) {
      renderResult(resultDiv, renderStateBlock({ type: "error", message: t("contractSetValues") }));
    }
    return;
  }

  const priceInput = findContractPriceInput(document);
  if (!priceInput) {
    console.debug("[SimHelper] Could not find price input on the page.");
    if (resultDiv) {
      renderResult(resultDiv, renderStateBlock({ type: "error", message: t("genericError") }));
    }
    return;
  }

  const rounded = computeDiscountedPrice(lowestPrice, discountPct);

  setReactControlledValue(priceInput, rounded.toFixed(3));

  // Visual feedback on the button
  const btn = document.getElementById("scx-contract-apply-btn");
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = `✓ ${formatMoney(rounded, { decimals: 3 })}`;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1500);
  }

  if (resultDiv) {
    renderResult(
      resultDiv,
      renderStateBlock({
        type: "success",
        message: `${t("contractApplyBtn")}${discountPct}%`,
      }),
    );
  }
}

function updateButtonLabel() {
  const btn = document.getElementById(APPLY_BUTTON_ID);
  if (btn) {
    btn.textContent = `${t("contractApplyBtn")}${discountPct}%`;
  }
}

// ── Profit calculation helpers ──────────────────────────────────

export const _testUtils = {
  parsePrice: parseContractPrice,
  getAmountValue: () => getContractAmountValue(document),
  getPriceValue: () => getContractPriceValue(document),
};

function renderResult(resultDiv, html) {
  resultDiv.innerHTML = html;
  resultDiv.classList.remove("scx-contract-profit-hidden");
}

/**
 * Calculate and display profit breakdown in the sidebar widget.
 * Profit = Revenue − Sourcing − Transport
 *   Revenue  = amount × price
 *   Sourcing = amount × sourcing_cost_per_unit
 *   Transport = transport_count × transport_market_price
 */
async function calculateAndDisplayProfit() {
  const resultDiv = document.getElementById(PROFIT_RESULT_ID);
  const calcBtn = document.getElementById(CALC_BUTTON_ID);
  if (!resultDiv) return;

  const amount = getContractAmountValue(document);
  const price = getContractPriceValue(document);

  if (!amount || !price) {
    renderResult(resultDiv, `<div class="scx-contract-profit-empty">${t("contractSetValues")}</div>`);
    return;
  }

  // Loading indicator
  if (calcBtn) calcBtn.textContent = "...";

  const sourcingCost = getSourcingCostPerUnit(document);
  const transportCount = getTransportCount(document);

  const revenue = amount * price;
  const totalSourcing = sourcingCost ? amount * sourcingCost : 0;

  // Fetch transport market price
  let totalTransport = 0;
  let transportError = null;
  if (transportCount) {
    try {
      const realmId = getRealmId();
      const transportPrice = await fetchMarketPrice(realmId, TRANSPORT_RESOURCE_ID);
      if (transportPrice) {
        totalTransport = transportCount * transportPrice;
      }
    } catch (e) {
      console.debug("[SimHelper] Failed to fetch transport price:", e);
      transportError = t("genericError");
    }
  }

  const profit = revenue - totalSourcing - totalTransport;
  const profitToneClass = profit >= 0 ? "scx-contract-profit-positive" : "scx-contract-profit-negative";
  const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : NaN;
  const profitMarginStr = Number.isFinite(profitMarginPct) ? `${profitMarginPct.toFixed(2)}%` : "—";

  renderResult(
    resultDiv,
    `
    <div class="scx-contract-profit-row">
      <span>${t("contractRevenue")}</span>
      <span class="scx-mono">${formatMoney(revenue)}</span>
    </div>
    <div class="scx-contract-profit-row scx-contract-profit-cost">
      <span>${t("contractSourcing")}</span>
      <span class="scx-mono">-${formatMoney(totalSourcing)}</span>
    </div>
    <div class="scx-contract-profit-row scx-contract-profit-cost">
      <span>${t("contractTransportCost")}</span>
      <span class="scx-mono">-${formatMoney(totalTransport)}</span>
    </div>
    <hr class="scx-contract-profit-divider">
    <div class="scx-contract-profit-row scx-contract-profit-total ${profitToneClass}">
      <span>${t("profit")}</span>
      <span class="scx-mono">${formatMoney(profit)}</span>
    </div>
    <div class="scx-contract-profit-row scx-contract-profit-margin ${profitToneClass}">
      <span>${t("profitMargin")}</span>
      <span class="scx-mono">${profitMarginStr}</span>
    </div>
    ${transportError ? renderStateBlock({ type: "error", message: transportError }) : ""}
  `,
  );

  // Reset button text
  if (calcBtn) calcBtn.textContent = `💰 ${t("contractCalcProfit")}`;
}

function injectIfNeeded() {
  if (document.getElementById(CONTAINER_ID)) return;

  const priceInput = findContractPriceInput(document);
  if (!priceInput) return;

  // Find the sidebar container to append into
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-sidebar-footer-contract scx-contract-helper";

  container.innerHTML = `
    <div class="scx-contract-title">
      <span class="scx-contract-title-icon">📝</span>
      <span>${t("contractApplyTooltip")}</span>
    </div>
    <div class="scx-contract-controls">
      <label class="scx-visually-hidden" for="${DISCOUNT_SELECT_ID}">${t("contractDiscountLabel")}</label>
      <select id="${DISCOUNT_SELECT_ID}" name="${DISCOUNT_SELECT_ID}" title="${t("contractDiscountLabel")}" class="scx-contract-select">
        <option value="0"${discountPct === 0 ? " selected" : ""}>+0%</option>
        <option value="1"${discountPct === 1 ? " selected" : ""}>-1%</option>
        <option value="2"${discountPct === 2 ? " selected" : ""}>-2%</option>
        <option value="3"${discountPct === 3 ? " selected" : ""}>-3%</option>
        <option value="4"${discountPct === 4 ? " selected" : ""}>-4%</option>
        <option value="5"${discountPct === 5 ? " selected" : ""}>-5%</option>
      </select>
      <button id="${APPLY_BUTTON_ID}" title="${t("contractApplyTooltip")}" class="scx-btn scx-btn-info scx-contract-apply-btn">
        ${t("contractApplyBtn")}${discountPct}%
      </button>
    </div>
    <div class="scx-contract-profit-panel">
      <button id="${CALC_BUTTON_ID}" class="scx-btn scx-btn-success scx-contract-calc-btn">
        💰 ${t("contractCalcProfit")}
      </button>
      <div id="${PROFIT_RESULT_ID}" class="scx-contract-profit-result scx-contract-profit-hidden"></div>
    </div>
  `;

  mountContractRulesPanel(container);

  // Append to sidebar — appears after the existing footer buttons
  sidebar.appendChild(container);

  // Event: dropdown change
  document.getElementById(DISCOUNT_SELECT_ID)?.addEventListener("change", (e) => {
    const nextValue = Number(e.target && "value" in e.target ? e.target.value : NaN);
    if (!Number.isFinite(nextValue)) return;
    discountPct = nextValue;
    void storage.set({
      domain: STORAGE_DOMAIN,
      version: STORAGE_VERSION,
      scope: "global",
      backend: "local",
      refreshAuth: false,
      data: discountPct,
    });
    updateButtonLabel();
  });

  // Event: apply button click
  document.getElementById(APPLY_BUTTON_ID)?.addEventListener("click", (e) => {
    e.preventDefault();
    applyDiscount();
  });

  // Event: calculate profit button click
  document.getElementById(CALC_BUTTON_ID)?.addEventListener("click", (e) => {
    e.preventDefault();
    void calculateAndDisplayProfit();
  });
}
