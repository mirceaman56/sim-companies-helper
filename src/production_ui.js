// production_ui.js
// Renders production helper section in the sidebar
import { formatMoney, escapeHtml, COPY_BUTTON_SVG, wireCopyButton, TRANSPORT_RESOURCE_ID } from "./utils.js";
import { getSectionContent } from "./sidebar.js";
import { getRecipes, analyzeProduction, fetchMarketPrices } from "./production.js";
import { getRealmId } from "./auth.js";
import { t } from "./i18n.js";
import { calculateUpgradeMultiplier, formatProductionAsText } from "./production_calc.js";
import {
  findProductionRowFromTarget,
  readProductionRow,
  waitForProductionLaborCost,
  extractProductionBuildingLevel,
} from "./page/production_page.js";

const SECTION_ID = "production-section";

// Store current state
let currentProductId = null;
let currentQuantity = 1;
// eslint-disable-next-line no-unused-vars
let currentLaborCost = 0;
let currentUnitCost = null; // Stored from UI if available
let pricesCache = null;
let currentRow = null;

/**
 * Update production helper for a specific row
 */
async function updateForRow(row) {
  if (!row) {
    return;
  }

  currentRow = row;
  const productionRow = readProductionRow(row);
  const productId = productionRow?.productId;
  const quantity = productionRow?.quantity ?? 1;
  const unitCost = productionRow?.unitCost ?? null;

  if (!productId) {
    currentProductId = null;
    updateProductionPanel();
    return;
  }

  currentProductId = productId;
  currentQuantity = quantity;
  currentUnitCost = unitCost;
  pricesCache = null; // Reset cache to fetch fresh prices

  // Wait for labor cost
  let laborCost = 0;
  if (currentUnitCost === null) {
    laborCost = await waitForProductionLaborCost(row);
  }
  currentLaborCost = laborCost;

  // Trigger update
  await updateProductionPanel();
}

/**
 * Handle production row interaction (click or focus)
 */
function handleProductionInteraction(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;

  // Don't handle copy button clicks
  if (target.closest?.(".scx-copy-btn")) {
    return;
  }

  const row = findProductionRowFromTarget(target);
  if (row) {
    // If clicking input, handle normally.
    // If clicking elsewhere in the row, only update if it's an active row (has unit cost) or has input
    updateForRow(row);
  }
}

/**
 * Setup event listeners for production rows
 */
export function setupProductionRowListeners() {
  // Listen for clicks/focus anywhere
  document.addEventListener("focusin", handleProductionInteraction, true);
  document.addEventListener("click", handleProductionInteraction, true);

  // Listen for input changes on quantity fields
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (target instanceof Element && target.matches('input[name="amount"]')) {
      const row = findProductionRowFromTarget(target);
      if (row && currentRow === row) {
        const productionRow = readProductionRow(row);
        currentQuantity = productionRow?.quantity ?? 1;
        currentUnitCost = null;
        currentLaborCost = productionRow?.laborCost ?? 0;

        if (stateTimeout) clearTimeout(stateTimeout);
        stateTimeout = setTimeout(() => updateProductionPanel(), 300);
      }
    }
  });
}

let stateTimeout = null;

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
      <div class="scx-panel scx-production-empty-panel">
        <div class="scx-muted">${t("clickProductionBuilding")}</div>
      </div>
    `;
    return;
  }

  const recipes = getRecipes();
  const recipe = recipes.find((r) => r.id === currentProductId);

  if (!recipe) {
    contentEl.innerHTML = `<div class="scx-muted">${t("recipeNotFound")}</div>`;
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
      contentEl.innerHTML = `<div class="scx-muted">${t("authRequired")}</div>`;
      return;
    }

    contentEl.innerHTML = `<div class="scx-muted">${t("loadingPrices")}</div>`;

    try {
      // Just fetch product and container
      const productIds = [currentProductId, TRANSPORT_RESOURCE_ID];
      pricesCache = await fetchMarketPrices(realmId, productIds);
    } catch (e) {
      contentEl.innerHTML = `<div class="scx-note scx-production-error-note">
        ${t("errorLoadingPrices")}: ${escapeHtml(e.message)}
      </div>`;
      return;
    }
  }

  // Analyze production (pass realmId for transport cost calculation)
  const realmId = getRealmId();
  const analysis = await analyzeProduction(
    currentProductId,
    currentQuantity,
    pricesCache,
    realmId,
    currentUnitCost,
  );

  if (!analysis || analysis.error) {
    contentEl.innerHTML = `
      <div class="scx-panel scx-production-analysis-panel">
        <div class="scx-muted">Unable to analyze</div>
        ${analysis?.error ? `<div class="scx-production-analysis-error">${escapeHtml(analysis.error)}</div>` : ""}
        <div class="scx-production-analysis-hint">${t("ensureProductionQuantity")}</div>
      </div>
    `;
    return;
  }

  // Render analysis UI
  renderAnalysisUI(contentEl, recipe, analysis);
}

/**
 * Render the full analysis UI
 */
function renderAnalysisUI(contentEl, recipe, analysis) {
  const { productionCost, breakEvenAnalysis, profitAnalysis, marketPrice } = analysis;

  // Extract building level from the page
  const buildingLevel = extractProductionBuildingLevel(document);
  const upgradeMultiplier = buildingLevel ? calculateUpgradeMultiplier(buildingLevel) : null;
  const upgradedProduction = upgradeMultiplier ? currentQuantity * upgradeMultiplier : null;
  const productionIncrease = upgradedProduction ? currentQuantity * (upgradeMultiplier - 1) : null;

  // Calculate projected profits at upgraded production level
  let projectedMarketProfit = null;
  let projectedContractProfit = null;
  let marketProfitDelta = null;
  let contractProfitDelta = null;

  if (buildingLevel && upgradeMultiplier && upgradedProduction && profitAnalysis) {
    const profitMultiplier = upgradedProduction / currentQuantity;
    projectedMarketProfit = profitAnalysis.market.profit * profitMultiplier;
    projectedContractProfit = profitAnalysis.contract.profit * profitMultiplier;
    marketProfitDelta = projectedMarketProfit - profitAnalysis.market.profit;
    contractProfitDelta = projectedContractProfit - profitAnalysis.contract.profit;
  }

  contentEl.innerHTML = `
    <div class="scx-panel scx-production-panel">
      <div class="scx-flex-spaced scx-margin-bottom-6">
        <div class="scx-prod-title">${escapeHtml(recipe.name)}</div>
        <button class="scx-copy-btn" data-copy-action="production" data-tooltip="${t("copyText")}">
          ${COPY_BUTTON_SVG}
        </button>
      </div>
      
      <div class="scx-color-999 scx-font-10 scx-margin-bottom-4">
        ${t("qty")}: <span class="scx-prod-qty">${currentQuantity}</span>
        <span class="scx-badge-active">${t("active")}</span>
        ${buildingLevel ? `<span class="scx-badge-level">${t("lvl")} ${buildingLevel}</span>` : ""}
      </div>

      <hr class="scx-hr-sm">

      <div class="scx-panel-head scx-margin-bottom-4">
        <div class="scx-panel-title scx-font-9">${t("productionCosts")}</div>
      </div>
      <div class="scx-card scx-tone-surface scx-tone-neutral scx-margin-bottom-4">
          <div class="scx-flex-row">
            <span class="scx-k scx-color-333">${t("costPerUnitUI")}</span>
            <span class="scx-v">${formatMoney(currentUnitCost)}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2">
            <span class="scx-k scx-color-333">${t("totalProductionCost")}</span>
            <span class="scx-v scx-text-bold scx-text-info-strong">${formatMoney(productionCost)}</span>
          </div>
      </div>

      <div class="scx-flex-spaced scx-margin-bottom-4">
         <div class="scx-panel-title scx-font-9">${t("profitAnalysis")}</div>
         <div class="scx-font-8 scx-color-999">@ ${formatMoney(marketPrice)}</div>
      </div>
      
      <div class="scx-flex-column scx-production-profit-stack">
        
        <!-- Market Profit -->
        <div class="scx-card scx-tone-surface scx-tone-warning">
          <div class="scx-flex-spaced scx-font-9">
             <span class="scx-text-semibold">${t("marketSell")}</span>
             <div class="scx-muted scx-font-8">${t("fullTransportFee")}</div>
          </div>
          
          <div class="scx-flex-row scx-margin-top-4 scx-padding-top-4 scx-border-top-sm">
             <span class="scx-k scx-font-9">${t("profit")}</span>
             <span class="scx-text-bold scx-font-9 ${getValueToneClass(profitAnalysis.market.profit)}">
               ${formatMoney(profitAnalysis.market.profit)}
             </span>
          </div>
          <div class="scx-flex-row scx-margin-top-1 scx-font-9">
             <span class="scx-k">${t("margin")}</span>
             <span class="${getValueToneClass(profitAnalysis.market.margin)}">
               ${profitAnalysis.market.margin.toFixed(2)}%
             </span>
          </div>
          <div class="scx-text-muted scx-margin-top-2 scx-text-right">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}
          </div>
        </div>

        <!-- Contract Profit -->
        <div class="scx-card scx-tone-surface scx-tone-neutral">
          <div class="scx-flex-spaced scx-font-9">
             <span class="scx-text-semibold">${t("contractSell")}</span>
             <div class="scx-muted scx-font-8">${t("halfTransport")}</div>
          </div>
          
           <div class="scx-flex-row scx-margin-top-4 scx-padding-top-4 scx-border-top-sm">
             <span class="scx-k scx-font-9">${t("profit")}</span>
             <span class="scx-text-bold scx-font-9 ${getValueToneClass(profitAnalysis.contract.profit)}">
               ${formatMoney(profitAnalysis.contract.profit)}
             </span>
          </div>
          <div class="scx-flex-row scx-margin-top-1 scx-font-9">
             <span class="scx-k">${t("margin")}</span>
             <span class="${getValueToneClass(profitAnalysis.contract.margin)}">
               ${profitAnalysis.contract.margin.toFixed(2)}%
             </span>
          </div>
           <div class="scx-text-muted scx-margin-top-2 scx-text-right">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}
          </div>
        </div>
      </div>

      ${
        buildingLevel && upgradeMultiplier && upgradedProduction
          ? `
      <hr class="scx-hr-sm">

      <div class="scx-panel-head scx-margin-bottom-4">
        <div class="scx-panel-title scx-font-9">${t("buildingUpgradeProjection")}</div>
      </div>
      <div class="scx-card scx-tone-surface scx-tone-success scx-margin-bottom-4">
          <div class="scx-flex-row">
            <span class="scx-k">${t("currentLevel")}</span>
            <span class="scx-v scx-text-semibold">${buildingLevel}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2">
            <span class="scx-k">${t("afterUpgradeLevel")} ${buildingLevel + 1})</span>
            <span class="scx-v scx-text-semibold">${upgradedProduction.toFixed(2)}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2 scx-padding-top-3 scx-border-top-md">
            <span class="scx-k scx-text-semibold">${t("productionIncrease")}</span>
            <span class="scx-v scx-text-bold scx-text-positive">+${productionIncrease.toFixed(2)} (${((upgradeMultiplier - 1) * 100).toFixed(1)}%)</span>
          </div>
      </div>

      <!-- Projected Profit Section -->
      ${
        projectedMarketProfit !== null && projectedContractProfit !== null
          ? `
      <div class="scx-card scx-tone-surface scx-tone-neutral scx-production-projected-box">
        <div class="scx-text-semibold scx-font-8 scx-margin-bottom-4 scx-text-uppercase scx-production-projected-title">${t("projectedProfitsAtLevel")} ${t("lvl")} ${buildingLevel + 1}</div>
        
        <!-- Projected Market Profit -->
        <div class="scx-card scx-card-sm scx-tone-surface scx-tone-warning scx-margin-bottom-4">
          <div class="scx-flex-spaced scx-font-8">
             <span>${t("marketSell")}</span>
             <span class="scx-text-bold ${getValueToneClass(projectedMarketProfit)}">
               ${formatMoney(projectedMarketProfit)}
             </span>
          </div>
          ${
            marketProfitDelta !== null
              ? `
          <div class="scx-flex-spaced scx-font-8 scx-color-999 scx-margin-top-1">
             <span>${t("delta")}:</span>
             <span class="${getValueToneClass(marketProfitDelta)}">
               ${formatMoney(marketProfitDelta)}
             </span>
          </div>
          `
              : ""
          }
        </div>

        <!-- Projected Contract Profit -->
        <div class="scx-card scx-card-sm scx-tone-surface scx-tone-neutral">
          <div class="scx-flex-spaced scx-font-8">
             <span>${t("contractSell")}</span>
             <span class="scx-text-bold ${getValueToneClass(projectedContractProfit)}">
               ${formatMoney(projectedContractProfit)}
             </span>
          </div>
          ${
            contractProfitDelta !== null
              ? `
          <div class="scx-flex-spaced scx-font-8 scx-color-999 scx-margin-top-1">
             <span>${t("delta")}:</span>
             <span class="${getValueToneClass(contractProfitDelta)}">
               ${formatMoney(contractProfitDelta)}
             </span>
          </div>
          `
              : ""
          }
        </div>
      </div>
      `
          : ""
      }
      `
          : ""
      }
    </div>
  `;

  // Wire up copy button
  wireCopyButton(contentEl, () =>
    formatProductionAsText(
      recipe,
      analysis,
      currentQuantity,
      buildingLevel,
      upgradeMultiplier,
      upgradedProduction,
      productionIncrease,
      projectedMarketProfit,
      projectedContractProfit,
      marketProfitDelta,
      contractProfitDelta,
    ),
  );
}

/**
 * Render materials cost breakdown
 */
// eslint-disable-next-line no-unused-vars
function renderMaterialsCost(materialCosts) {
  const recipes = getRecipes();
  const materialNamesMap = new Map();
  // Build a map of material ID -> name
  recipes.forEach((r) => {
    materialNamesMap.set(r.id, r.name);
  });

  return materialCosts
    .map((mc) => {
      const materialName = materialNamesMap.get(mc.materialId) || `Resource ${mc.materialId}`;
      return `
    <div class="scx-material-row">
      <div>
        <div class="scx-material-name">${materialName}</div>
        <div class="scx-material-qty">${t("qty")}: ${mc.quantity}</div>
      </div>
      <div class="scx-material-price">
        <div class="scx-material-unit-price">
          ${Number.isFinite(mc.unitPrice) ? formatMoney(mc.unitPrice) : "—"} ${t("perUnit")}
        </div>
        <div class="scx-material-total-cost">
          ${Number.isFinite(mc.totalCost) ? formatMoney(mc.totalCost) : "—"}
        </div>
      </div>
    </div>
  `;
    })
    .join("");
}

/**
 * Render sell analysis
 */
// eslint-disable-next-line no-unused-vars
function renderSellAnalysis(sellAnalysis, _quantity) {
  if (!sellAnalysis || !Number.isFinite(sellAnalysis.profit)) {
    return `
      <div class="scx-note scx-note-warning">
        ${t("cannotCalcProfit")}
      </div>
    `;
  }

  const isProfitable = sellAnalysis.profit > 0;
  const profitToneClass = isProfitable ? "scx-tone-success" : "scx-tone-error";

  return `
    <hr class="scx-sell-hr">

    <div class="scx-panel-head scx-margin-bottom-6">
      <div class="scx-panel-title">${t("sellingAnalysis")}</div>
    </div>

    <div class="scx-sell-grid">
      <div class="scx-card scx-tone-surface scx-tone-success">
        <div class="scx-k">${t("grossProceeds")}</div>
        <div class="scx-card-value">
          ${formatMoney(sellAnalysis.sellPrice)}
        </div>
      </div>
      <div class="scx-card scx-tone-surface scx-tone-warning">
        <div class="scx-k">${t("marketFee4pct")}</div>
        <div class="scx-card-value">
          -${formatMoney(sellAnalysis.feeAmount)}
        </div>
      </div>
    </div>

    <div class="scx-sell-grid">
      <div class="scx-card scx-tone-surface scx-tone-neutral">
        <div class="scx-k">${t("netProceeds")}</div>
        <div class="scx-card-value">
          ${formatMoney(sellAnalysis.netProceeds)}
        </div>
      </div>
      <div class="scx-card scx-tone-surface ${profitToneClass}">
        <div class="scx-k">${t("profit")}</div>
        <div class="scx-card-value ${getValueToneClass(sellAnalysis.profit)}">
          ${isProfitable ? "+" : ""}${formatMoney(sellAnalysis.profit)}
        </div>
      </div>
    </div>

    <div class="scx-card scx-tone-surface scx-tone-neutral scx-card-center">
      <div class="scx-k scx-margin-bottom-4">${t("profitMargin")}</div>
      <div class="scx-card-value-lg ${getValueToneClass(sellAnalysis.profit)}">
        ${Number.isFinite(sellAnalysis.profitMargin) ? sellAnalysis.profitMargin.toFixed(1) : "—"}%
      </div>
    </div>
  `;
}

function getValueToneClass(value) {
  return value >= 0 ? "scx-text-positive" : "scx-text-negative";
}
