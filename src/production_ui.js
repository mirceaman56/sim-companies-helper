// production_ui.js
// Renders production helper section in the sidebar
import { STATE } from "./state.js";
import { formatMoney } from "./utils.js";
import { getSectionContent, registerSection } from "./sidebar.js";
import { getRecipes, analyzeProduction, fetchMarketPrices } from "./production.js";
import { getRealmId } from "./auth.js";

const SECTION_ID = "production-section";

// Store current state
let currentProductId = null;
let currentQuantity = 1;
let pricesCache = null;
let currentRow = null;

/**
 * Detect production row from target element
 */
function getProductionRowFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  // Look for the production row container
  let el = target;
  for (let i = 0; i < 25 && el; i++) {
    // Check if this element contains both quantity input and product link
    const hasQtyInput = !!el.querySelector?.('input[name="amount"]');
    const hasProductLink = !!el.querySelector?.('a[href*="/encyclopedia/"][href*="/resource/"]');

    if (hasQtyInput && hasProductLink) {
      return el;
    }

    if (el === document.body) {
      break;
    }
    el = el.parentElement;
  }

  return null;
}

/**
 * Extract product ID from a production row
 */
function extractProductIdFromRow(row) {
  if (!row) {
    return null;
  }
  const a = row?.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
  const href = a?.getAttribute("href") || "";
  const m = href.match(/\/resource\/(\d+)\//);
  const productId = m ? Number(m[1]) : null;
  return productId;
}

/**
 * Extract quantity from a production row
 */
function getQuantityFromRow(row) {
  if (!row) {
    return 1;
  }
  const input = row.querySelector('input[name="amount"]');
  const val = Number(input?.value || 0);
  const result = val > 0 ? val : 1;
  return result;
}

/**
 * Update production helper for a specific row
 */
async function updateForRow(row) {
  if (!row) {
    return;
  }

  currentRow = row;
  const productId = extractProductIdFromRow(row);
  const quantity = getQuantityFromRow(row);

  if (!productId) {
    currentProductId = null;
    updateProductionPanel();
    return;
  }

  currentProductId = productId;
  currentQuantity = quantity;
  pricesCache = null; // Reset cache to fetch fresh prices

  // Trigger update
  await updateProductionPanel();
}

/**
 * Handle focus/click on quantity input in production rows
 */
function handleProductionInputFocus(e) {
  const target = e.target;
  if (!(target instanceof Element) || !target.matches('input[name="amount"]')) {
    return;
  }

  const row = getProductionRowFromTarget(target);
  if (row) {
    updateForRow(row);
  }
}

/**
 * Setup event listeners for production rows
 */
export function setupProductionRowListeners() {
  // Listen for focus on quantity inputs
  document.addEventListener("focusin", handleProductionInputFocus, true);
  document.addEventListener("click", handleProductionInputFocus, true);

  // Listen for input changes on quantity fields
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (target instanceof Element && target.matches('input[name="amount"]')) {
      const row = getProductionRowFromTarget(target);
      if (row && currentRow === row) {
        currentQuantity = getQuantityFromRow(row);
        updateProductionPanel();
      }
    }
  });
}

/**
 * Update the production helper panel
 */
export async function updateProductionPanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) {
    return;
  }

  // If no product selected, show empty state
  if (currentProductId === null) {
    contentEl.innerHTML = `
      <div class="scx-panel" style="text-align: center; padding: 20px 12px;">
        <div class="scx-muted">Click on a production</div>
        <div class="scx-muted" style="font-size: 9px; margin-top: 4px;">quantity field to analyze.</div>
      </div>
    `;
    return;
  }

  const recipes = getRecipes();
  const recipe = recipes.find((r) => r.id === currentProductId);

  if (!recipe) {
    contentEl.innerHTML = `<div class="scx-muted">Recipe not found</div>`;
    return;
  }

  // Render analysis for selected product
  await renderProductAnalysis(contentEl, recipe);
}

/**
 * Render the product analysis UI
 */
async function renderProductAnalysis(contentEl, recipe) {
  // Fetch prices if not cached
  if (!pricesCache) {
    const realmId = getRealmId();
    if (realmId === null || realmId === undefined) {
      contentEl.innerHTML = `<div class="scx-muted">Authentication required - realmId not available</div>`;
      return;
    }

    contentEl.innerHTML = `<div class="scx-muted">Loading prices...</div>`;

    try {
      // Fetch prices for materials and the product itself
      const materialIds = recipe.materials.map((m) => m.id);
      const productIds = [currentProductId, ...materialIds];

      pricesCache = await fetchMarketPrices(realmId, productIds);
    } catch (e) {
      contentEl.innerHTML = `<div class="scx-note" style="border-left-color: #c62828; color: #c62828;">
        Error loading prices: ${e.message}
      </div>`;
      return;
    }
  }

  // Analyze production
  const analysis = await analyzeProduction(currentProductId, currentQuantity, pricesCache);

  if (!analysis) {
    contentEl.innerHTML = `<div class="scx-muted">Unable to analyze production</div>`;
    return;
  }

  // Render analysis UI
  renderAnalysisUI(contentEl, recipe, analysis);
}

/**
 * Render the full analysis UI
 */
function renderAnalysisUI(contentEl, recipe, analysis) {
  const { productionCost, sellAnalysis, materialCosts } = analysis;

  contentEl.innerHTML = `
    <div class="scx-panel" style="font-size: 11px;">
      <div style="margin-bottom: 12px;">
        <div style="font-weight: 600; color: #333; font-size: 12px;">${recipe.name}</div>
        <div style="color: #999; font-size: 9px;">
          Qty: <span style="font-weight: 600; color: #333;">${currentQuantity}</span>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-head" style="margin-bottom: 12px;">
        <div class="scx-panel-title">Materials Cost</div>
      </div>

      <div style="background: #fafafa; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
        ${renderMaterialsCost(materialCosts)}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
        <div style="background: #e3f2fd; padding: 8px; border-radius: 4px;">
          <div class="scx-k">Total Production Cost</div>
          <div style="font-size: 14px; font-weight: 700; color: #1565c0;">
            ${formatMoney(productionCost)}
          </div>
        </div>
        <div style="background: #fff3e0; padding: 8px; border-radius: 4px;">
          <div class="scx-k">Per Unit</div>
          <div style="font-size: 14px; font-weight: 700; color: #e65100;">
            ${formatMoney(productionCost / currentQuantity)}
          </div>
        </div>
      </div>

      ${renderSellAnalysis(sellAnalysis, currentQuantity)}
    </div>
  `;
}

/**
 * Render materials cost breakdown
 */
function renderMaterialsCost(materialCosts) {
  return materialCosts
    .map(
      (mc) => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0;">
      <div>
        <div style="color: #333; font-weight: 500;">Material ID: ${mc.materialId}</div>
        <div style="color: #999; font-size: 9px;">Qty: ${mc.quantity}</div>
      </div>
      <div style="text-align: right;">
        <div style="color: #666; font-weight: 500;">
          ${Number.isFinite(mc.unitPrice) ? formatMoney(mc.unitPrice) : "—"} /unit
        </div>
        <div style="color: #333; font-weight: 600;">
          ${Number.isFinite(mc.totalCost) ? formatMoney(mc.totalCost) : "—"}
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Render sell analysis
 */
function renderSellAnalysis(sellAnalysis, quantity) {
  if (!sellAnalysis || !Number.isFinite(sellAnalysis.profit)) {
    return `
      <div class="scx-note" style="border-left-color: #ff9800; background: #fff8f0;">
        Cannot calculate profit - missing market prices
      </div>
    `;
  }

  const isProfitable = sellAnalysis.profit > 0;
  const profitColor = isProfitable ? "#2e7d32" : "#c62828";
  const profitBg = isProfitable ? "#e8f5e9" : "#ffebee";

  return `
    <hr style="margin: 8px 0;">

    <div class="scx-panel-head" style="margin-bottom: 12px;">
      <div class="scx-panel-title">Selling Analysis</div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
      <div style="background: #e8f5e9; padding: 8px; border-radius: 4px;">
        <div class="scx-k">Gross Proceeds</div>
        <div style="font-size: 13px; font-weight: 700; color: #1b5e20;">
          ${formatMoney(sellAnalysis.sellPrice)}
        </div>
      </div>
      <div style="background: #fff3e0; padding: 8px; border-radius: 4px;">
        <div class="scx-k">Market Fee (4%)</div>
        <div style="font-size: 13px; font-weight: 700; color: #e65100;">
          -${formatMoney(sellAnalysis.feeAmount)}
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
      <div style="background: #f0f8ff; padding: 8px; border-radius: 4px;">
        <div class="scx-k">Net Proceeds</div>
        <div style="font-size: 13px; font-weight: 700; color: #0d47a1;">
          ${formatMoney(sellAnalysis.netProceeds)}
        </div>
      </div>
      <div style="background: ${profitBg}; padding: 8px; border-radius: 4px;">
        <div class="scx-k">Profit</div>
        <div style="font-size: 13px; font-weight: 700; color: ${profitColor};">
          ${isProfitable ? "+" : ""}${formatMoney(sellAnalysis.profit)}
        </div>
      </div>
    </div>

    <div style="background: #fafafa; padding: 8px; border-radius: 4px; text-align: center;">
      <div class="scx-k" style="margin-bottom: 4px;">Profit Margin</div>
      <div style="font-size: 16px; font-weight: 700; color: ${profitColor};">
        ${Number.isFinite(sellAnalysis.profitMargin) ? sellAnalysis.profitMargin.toFixed(1) : "—"}%
      </div>
    </div>
  `;
}

