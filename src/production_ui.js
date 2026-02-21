// production_ui.js
// Renders production helper section in the sidebar
import { STATE } from "./state.js";
import { formatMoney, escapeHtml, copyToClipboard, parseLocaleNumber, extractProductIdFromRow, getInfoColumn, COPY_BUTTON_SVG, wireCopyButton, TRANSPORT_RESOURCE_ID } from "./utils.js";
import { getSectionContent, registerSection } from "./sidebar.js";
import { getRecipes, analyzeProduction, fetchMarketPrices } from "./production.js";
import { getRealmId } from "./auth.js";
import { t } from "./i18n.js";

const SECTION_ID = "production-section";

// Store current state
let currentProductId = null;
let currentQuantity = 1;
let currentLaborCost = 0;
let currentUnitCost = null; // Stored from UI if available
let pricesCache = null;
let currentRow = null;

/**
 * Find the data-wrapper div inside an active production info column.
 * Active rows have: h3 + div{div, div, div, div} (producing qty, sourcing, quality, cost).
 */
function getDataWrapper(infoCol) {
  for (const child of infoCol.children) {
    if (child.tagName === 'DIV' && child.querySelectorAll(':scope > div').length >= 3) {
      return child;
    }
  }
  return null;
}

/**
 * Parse a locale-agnostic number from text.
 * Delegates to the shared parseLocaleNumber from utils.
 */
const parseLocalNum = parseLocaleNumber;
function extractDollarValue(text) {
  if (!text) return null;
  const match = text.match(/\$\s*([\d.,]+)/);
  if (match) {
    const val = parseLocalNum(match[1]);
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

/**
 * Detect production row from target element.
 * Uses structural checks (amount input or data-wrapper div) instead of text labels.
 */
function getProductionRowFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  // Look for the production row container
  let el = target;
  for (let i = 0; i < 25 && el; i++) {
    // Check if this element contains a product link
    const hasProductLink = !!el.querySelector?.('a[href*="/encyclopedia/"][href*="/resource/"]');

    if (hasProductLink) {
        const hasQtyInput = !!el.querySelector?.('input[name="amount"]');
        // Active/completed production: info column shows dollar values ($)
        const infoCol = getInfoColumn(el);
        const hasDollarValue = /\$/.test(infoCol?.textContent || '');

        if (hasQtyInput || hasDollarValue) {
            return el;
        }
    }

    if (el === document.body) {
      break;
    }
    el = el.parentElement;
  }

  return null;
}

/**
 * Extract quantity from a production row.
 * Setup rows: reads from input[name="amount"].
 * Active rows: reads the number from the 1st child div in the data wrapper.
 */
function getQuantityFromRow(row) {
  if (!row) {
    return 1;
  }
  const input = row.querySelector('input[name="amount"]');
  if (input) {
    const val = Number(input.value || 0);
    return val > 0 ? val : 1;
  }

  // Active production: first data div contains the quantity
  const infoCol = getInfoColumn(row);
  if (infoCol) {
    const wrapper = getDataWrapper(infoCol);
    if (wrapper) {
      const firstDiv = wrapper.querySelector(':scope > div');
      if (firstDiv) {
        const text = firstDiv.textContent || '';
        // Extract the number (digits with commas or dots as thousands separators)
        const nums = text.match(/[\d.,]+/g);
        if (nums) {
          // Take the largest number found (the quantity value, not any small digit in the label)
          let best = 0;
          for (const n of nums) {
            const v = parseLocalNum(n);
            if (v > best) best = v;
          }
          if (best > 0) return best;
        }
      }
    }
  }

  return 1;
}

/**
 * Extract Cost/Unit cost from production row.
 * Active rows: last child div in the data wrapper contains the dollar value.
 * Setup rows: dollar value in a bare text node (not inside span/div).
 */
function getUnitCostFromRow(row) {
  if (!row) return null;
  const infoCol = getInfoColumn(row);
  if (!infoCol) return null;

  // Active production: last data div in wrapper (Cost per unit)
  const wrapper = getDataWrapper(infoCol);
  if (wrapper) {
    const dataDivs = wrapper.querySelectorAll(':scope > div');
    const costDiv = dataDivs[dataDivs.length - 1];
    if (costDiv) {
      return extractDollarValue(costDiv.textContent);
    }
    return null;
  }

  // Setup production: unit cost is a bare text node with a dollar value
  for (const node of infoCol.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = extractDollarValue(node.textContent);
      if (val !== null) return val;
    }
  }
  return null;
}

/**
 * Extract labor cost from a production row.
 * Setup rows: labor cost is in the 2nd span inside the info column.
 */
function getLaborCostFromRow(row) {
  if (!row) {
    return 0;
  }
  const infoCol = getInfoColumn(row);
  if (!infoCol) return 0;

  // Setup production: 2nd span in info column contains the labor cost
  const spans = infoCol.querySelectorAll(':scope > span');
  if (spans.length >= 2) {
    const val = extractDollarValue(spans[1].textContent);
    if (val !== null) return val;
  }
  return 0;
}

/**
 * Extract building level from the page.
 * Searches for level indicators in building info cards, excluding header/navigation.
 * Prioritizes patterns like "LEVEL 10" and avoids player level indicators.
 */
function extractBuildingLevelFromPage() {
  // First, try to find explicit "LEVEL X" patterns (case-insensitive)
  // Exclude elements in the header/navigation area (top ~100px)
  const allDivs = document.querySelectorAll('div');
  
  for (const div of allDivs) {
    const rect = div.getBoundingClientRect();
    
    // Skip elements in the top navigation bar (typically in top 100px of viewport)
    if (rect.top < 100) continue;
    
    const text = div.textContent?.trim() || '';
    
    // Look for explicit patterns like "LEVEL 10", "LEVEL 19", etc.
    // Case insensitive
    const levelMatch = text.match(/level\s+(\d+)/i);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      if (level >= 1 && level <= 100) {
        // Verify this is in a reasonable context (short text, suggests building info)
        if (text.length <= 50) {
          return level;
        }
      }
    }
  }

  // Fallback: If no explicit "LEVEL X" pattern found, look for isolated numbers
  // in small containers (building cards are typically compact)
  for (const div of allDivs) {
    const rect = div.getBoundingClientRect();
    
    // Skip header area
    if (rect.top < 100) continue;
    
    const text = div.textContent?.trim() || '';
    
    // Skip if text is too long - likely not a building card
    if (text.length > 100) continue;
    
    // Skip divs that seem to be part of large sections
    if (rect.width > 300 || rect.height > 200) continue;
    
    // Look for a number that stands alone or with minimal text
    const match = text.match(/^\d+$|^(?:level\s+)?\d+$/i);
    if (match) {
      const level = parseInt(text.match(/\d+/)[0], 10);
      if (level >= 1 && level <= 100 && text.length <= 30) {
        // Check parent context - should be in a card-like structure
        const parent = div.parentElement;
        if (parent && parent.textContent && parent.textContent.length < 500) {
          return level;
        }
      }
    }
  }

  return null;
}

/**
 * Calculate production multiplier for upgraded building.
 * Formula: multiplier = 1 + 1/currentLevel
 * This represents the new production level after upgrading.
 */
function calculateUpgradeMultiplier(currentLevel) {
  if (!currentLevel || currentLevel <= 0) {
    return null;
  }
  return 1 + (1 / currentLevel);
}

/**
 * Wait for labor cost to appear in the row, then resolve with the cost value
 */
function waitForLaborCost(row, maxWaitMs = 3000) {
  return new Promise((resolve) => {
    // Check if labor cost is already visible
    const currentCost = getLaborCostFromRow(row);
    if (currentCost > 0) {
      resolve(currentCost);
      return;
    }

    // Set up observer to watch for changes
    let timeoutId;
    const observer = new MutationObserver(() => {
      const cost = getLaborCostFromRow(row);
      if (cost > 0) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(cost);
      }
    });

    // Start observing the row for text content changes
    observer.observe(row, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Timeout after maxWaitMs
    timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(0); // Resolve with 0 if labor cost doesn't appear
    }, maxWaitMs);
  });
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
  const unitCost = getUnitCostFromRow(row);

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
      laborCost = await waitForLaborCost(row);
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
  
  // Don't handle copy button clicks
  if (target.closest?.('.scx-copy-btn')) {
    return;
  }
  
  const row = getProductionRowFromTarget(target);
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
      const row = getProductionRowFromTarget(target);
      if (row && currentRow === row) {
        currentQuantity = getQuantityFromRow(row);
        currentUnitCost = null; 
        currentLaborCost = getLaborCostFromRow(row);
        
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
      <div class="scx-panel" style="text-align: center; padding: 20px 12px;">
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
      contentEl.innerHTML = `<div class="scx-note" style="border-left-color: #c62828; color: #c62828;">
        ${t("errorLoadingPrices")}: ${escapeHtml(e.message)}
      </div>`;
      return;
    }
  }

  // Analyze production (pass realmId for transport cost calculation)
  const realmId = getRealmId();
  const analysis = await analyzeProduction(currentProductId, currentQuantity, pricesCache, realmId, currentUnitCost);
  
  if (!analysis || analysis.error) {
    contentEl.innerHTML = `
      <div class="scx-panel" style="padding: 12px;">
        <div class="scx-muted">Unable to analyze</div>
        ${analysis?.error ? `<div style="font-size:9px; color:#c62828; margin-top:4px;">${escapeHtml(analysis.error)}</div>` : ''}
        <div style="font-size:9x; color:#999; margin-top:8px;">${t("ensureProductionQuantity")}</div>
      </div>
    `;
    return;
  }

  // Render analysis UI
  renderAnalysisUI(contentEl, recipe, analysis);
}

/**
 * Format production data as plain text table
 */
function formatProductionAsText(recipe, analysis, quantity, buildingLevel, upgradeMultiplier, upgradedProduction, productionIncrease, projectedMarketProfit, projectedContractProfit, marketProfitDelta, contractProfitDelta) {
  const { productionCost, breakEvenAnalysis, profitAnalysis, marketPrice, unitCost } = analysis;
  const lines = [
    `${t('product')}: ${recipe.name}`,
    `${t('quantity')}: ${quantity}`,
    ``,
    `${t('costLabel')}:`,
    `  ${t('baseUnitCost')}: ${formatMoney(unitCost)}`,
    `  Total Production Cost: ${formatMoney(productionCost)}`,
    ``,
  ];
  
  if (breakEvenAnalysis) {
    lines.push(
      `${t('breakEvenMarket')}:`,
      `  Total Cost: ${formatMoney(breakEvenAnalysis.market.totalCost)}`,
      `  ${t('transportCost')}: ${formatMoney(breakEvenAnalysis.market.transportCost)}`,
      `  ${t('breakEvenPrice')}: ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}`,
      ``,
      `${t('breakEvenContract')}:`,
      `  Total Cost: ${formatMoney(breakEvenAnalysis.contract.totalCost)}`,
      `  ${t('transportCost')}: ${formatMoney(breakEvenAnalysis.contract.transportCost)}`,
      `  ${t('breakEvenPrice')}: ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}`, 
      ``
    );
  }
  
  if (profitAnalysis) {
    lines.push(
      `${t('profitAnalysisText')} (at $${formatMoney(marketPrice)}):`,
      `  ${t('marketProfit')}: ${formatMoney(profitAnalysis.market.profit)}`,
      `  ${t('marketMargin')}: ${profitAnalysis.market.margin.toFixed(2)}%`,
      `  ${t('contractProfit')}: ${formatMoney(profitAnalysis.contract.profit)}`,
      `  ${t('contractMargin')}: ${profitAnalysis.contract.margin.toFixed(2)}%`,
      ``
    );
  }

  if (buildingLevel && upgradeMultiplier) {
    lines.push(
      `${t('buildingUpgradeProjection')}:`,
      `  ${t('currentLevel')}: ${buildingLevel}`,
      `  ${t('productionAfterUpgrade')} (${t('lvl')} ${buildingLevel + 1}): ${upgradedProduction.toFixed(2)}`,
      `  ${t('productionIncreasePercent')}: +${productionIncrease.toFixed(2)} (${((upgradeMultiplier - 1) * 100).toFixed(1)}%)` ,
      ``
    );
  }

  if (projectedMarketProfit !== null && projectedContractProfit !== null) {
    lines.push(
      `${t('projectedProfitsAtLevel')} ${buildingLevel + 1}:`,
      `  Market Sell: ${formatMoney(projectedMarketProfit)}`
    );
    if (marketProfitDelta !== null) {
      lines.push(`    ${t('delta')}: ${formatMoney(marketProfitDelta)}`);
    }
    lines.push(`  Contract Sell: ${formatMoney(projectedContractProfit)}`);
    if (contractProfitDelta !== null) {
      lines.push(`    ${t('delta')}: ${formatMoney(contractProfitDelta)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Render the full analysis UI
 */
function renderAnalysisUI(contentEl, recipe, analysis) {
  
  const { productionCost, breakEvenAnalysis, profitAnalysis, marketPrice } = analysis;

  // Extract building level from the page
  const buildingLevel = extractBuildingLevelFromPage();
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
    <div class="scx-panel" style="font-size: 11px;">
      <div class="scx-flex-spaced scx-margin-bottom-6">
        <div class="scx-prod-title">${escapeHtml(recipe.name)}</div>
        <button class="scx-copy-btn" data-copy-action="production" data-tooltip="Copy text">
          ${COPY_BUTTON_SVG}
        </button>
      </div>
      
      <div class="scx-color-999 scx-font-10 scx-margin-bottom-4">
        ${t("qty")}: <span class="scx-prod-qty">${currentQuantity}</span>
        <span class="scx-badge-active">${t("active")}</span>
        ${buildingLevel ? `<span class="scx-badge-level">${t('lvl')} ${buildingLevel}</span>` : ''}
      </div>

      <hr class="scx-hr-sm">

      <div class="scx-panel-head scx-margin-bottom-4">
        <div class="scx-panel-title scx-font-9">${t("productionCosts")}</div>
      </div>
      <div class="scx-box-blue scx-margin-bottom-4">
          <div class="scx-flex-row">
            <span class="scx-k scx-color-333">${t("costPerUnitUI")}</span>
            <span class="scx-v">${formatMoney(currentUnitCost)}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2">
            <span class="scx-k scx-color-333">${t("totalProductionCost")}</span>
            <span class="scx-v scx-text-bold scx-text-blue">${formatMoney(productionCost)}</span>
          </div>
      </div>

      <div class="scx-flex-spaced scx-margin-bottom-4">
         <div class="scx-panel-title scx-font-9">${t("profitAnalysis")}</div>
         <div class="scx-font-8 scx-color-999">@ ${formatMoney(marketPrice)}</div>
      </div>
      
      <div class="scx-flex-column" style="gap: 4px; margin-bottom: 4px;">
        
        <!-- Market Profit -->
        <div class="scx-box-yellow">
          <div class="scx-flex-spaced scx-font-9">
             <span class="scx-text-semibold scx-text-orange">${t("marketSell")}</span>
             <div class="scx-muted scx-font-8">${t("fullTransportFee")}</div>
          </div>
          
          <div class="scx-flex-row scx-margin-top-4 scx-padding-top-4 scx-border-top-sm">
             <span class="scx-k scx-text-brown scx-font-9">${t("profit")}</span>
             <span class="scx-text-bold scx-font-9" style="color:${profitAnalysis.market.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.market.profit)}
             </span>
          </div>
          <div class="scx-flex-row scx-margin-top-1 scx-font-9">
             <span class="scx-k scx-text-brown">${t("margin")}</span>
             <span style="color:${profitAnalysis.market.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.market.margin.toFixed(2)}%
             </span>
          </div>
          <div class="scx-text-muted scx-margin-top-2 scx-text-right">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}
          </div>
        </div>

        <!-- Contract Profit -->
        <div class="scx-box-purple">
          <div class="scx-flex-spaced scx-font-9">
             <span class="scx-text-semibold scx-text-purple">${t("contractSell")}</span>
             <div class="scx-muted scx-font-8">${t("halfTransport")}</div>
          </div>
          
           <div class="scx-flex-row scx-margin-top-4 scx-padding-top-4 scx-border-top-sm">
             <span class="scx-k scx-text-dark-brown scx-font-9">${t("profit")}</span>
             <span class="scx-text-bold scx-font-9" style="color:${profitAnalysis.contract.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.contract.profit)}
             </span>
          </div>
          <div class="scx-flex-row scx-margin-top-1 scx-font-9">
             <span class="scx-k scx-text-dark-brown">${t("margin")}</span>
             <span style="color:${profitAnalysis.contract.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.contract.margin.toFixed(2)}%
             </span>
          </div>
           <div class="scx-text-muted scx-margin-top-2 scx-text-right">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}
          </div>
        </div>
      </div>

      ${buildingLevel && upgradeMultiplier && upgradedProduction ? `
      <hr class="scx-hr-sm">

      <div class="scx-panel-head scx-margin-bottom-4">
        <div class="scx-panel-title scx-font-9">${t("buildingUpgradeProjection")}</div>
      </div>
      <div class="scx-box-green scx-margin-bottom-4">
          <div class="scx-flex-row">
            <span class="scx-k scx-text-forest">${t("currentLevel")}</span>
            <span class="scx-v scx-text-semibold">${buildingLevel}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2">
            <span class="scx-k scx-text-forest">${t("afterUpgradeLevel")} ${buildingLevel + 1})</span>
            <span class="scx-v scx-text-semibold">${upgradedProduction.toFixed(2)}</span>
          </div>
          <div class="scx-flex-row scx-margin-top-2 scx-padding-top-3 scx-border-top-md">
            <span class="scx-k scx-text-forest scx-text-semibold">${t("productionIncrease")}</span>
            <span class="scx-v scx-text-bold scx-text-green">+${productionIncrease.toFixed(2)} (${((upgradeMultiplier - 1) * 100).toFixed(1)}%)</span>
          </div>
      </div>

      <!-- Projected Profit Section -->
      ${projectedMarketProfit !== null && projectedContractProfit !== null ? `
      <div class="scx-box-light-gray" style="margin-top: 4px;">
        <div class="scx-text-semibold scx-font-8 scx-margin-bottom-4 scx-text-uppercase" style="color: #1a237e;">${t('projectedProfitsAtLevel')} ${t('lvl')} ${buildingLevel + 1}</div>
        
        <!-- Projected Market Profit -->
        <div class="scx-profit-box-sm scx-profit-box-yellow scx-margin-bottom-4">
          <div class="scx-flex-spaced scx-font-8">
             <span class="scx-text-orange">${t("marketSell")}</span>
             <span class="scx-text-bold" style="color:${projectedMarketProfit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(projectedMarketProfit)}
             </span>
          </div>
          ${marketProfitDelta !== null ? `
          <div class="scx-flex-spaced scx-font-8 scx-color-999 scx-margin-top-1">
             <span>${t('delta')}:</span>
             <span style="color:${marketProfitDelta >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(marketProfitDelta)}
             </span>
          </div>
          ` : ''}
        </div>

        <!-- Projected Contract Profit -->
        <div class="scx-profit-box-sm scx-profit-box-purple">
          <div class="scx-flex-spaced scx-font-8">
             <span class="scx-text-purple">${t("contractSell")}</span>
             <span class="scx-text-bold" style="color:${projectedContractProfit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(projectedContractProfit)}
             </span>
          </div>
          ${contractProfitDelta !== null ? `
          <div class="scx-flex-spaced scx-font-8 scx-color-999 scx-margin-top-1">
             <span>${t('delta')}:</span>
             <span style="color:${contractProfitDelta >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(contractProfitDelta)}
             </span>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}
      ` : ''}
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
      contractProfitDelta
    )
  );
}

/**
 * Render materials cost breakdown
 */
function renderMaterialsCost(materialCosts) {
  const recipes = getRecipes();
  const materialNamesMap = new Map();
  // Build a map of material ID -> name
  recipes.forEach(r => {
    materialNamesMap.set(r.id, r.name);
  });

  return materialCosts
    .map(
      (mc) => {
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
      }
    )
    .join("");
}

/**
 * Render sell analysis
 */
function renderSellAnalysis(sellAnalysis, quantity) {
  if (!sellAnalysis || !Number.isFinite(sellAnalysis.profit)) {
    return `
      <div class="scx-note scx-note-warning">
        ${t("cannotCalcProfit")}
      </div>
    `;
  }

  const isProfitable = sellAnalysis.profit > 0;
  const profitColor = isProfitable ? "#2e7d32" : "#c62828";
  const profitBg = isProfitable ? "#e8f5e9" : "#ffebee";

  return `
    <hr class="scx-sell-hr">

    <div class="scx-panel-head scx-margin-bottom-6">
      <div class="scx-panel-title">${t("sellingAnalysis")}</div>
    </div>

    <div class="scx-sell-grid">
      <div class="scx-sell-box scx-sell-box-green">
        <div class="scx-k">${t("grossProceeds")}</div>
        <div class="scx-sell-box-content">
          ${formatMoney(sellAnalysis.sellPrice)}
        </div>
      </div>
      <div class="scx-sell-box scx-sell-box-orange">
        <div class="scx-k">${t("marketFee4pct")}</div>
        <div class="scx-sell-box-content">
          -${formatMoney(sellAnalysis.feeAmount)}
        </div>
      </div>
    </div>

    <div class="scx-sell-grid">
      <div class="scx-sell-box scx-sell-box-blue">
        <div class="scx-k">${t("netProceeds")}</div>
        <div class="scx-sell-box-content">
          ${formatMoney(sellAnalysis.netProceeds)}
        </div>
      </div>
      <div class="scx-sell-box" style="background: ${profitBg}; padding: 8px; border-radius: 4px;">
        <div class="scx-k">${t("profit")}</div>
        <div class="scx-sell-box-content" style="color: ${profitColor};">
          ${isProfitable ? "+" : ""}${formatMoney(sellAnalysis.profit)}
        </div>
      </div>
    </div>

    <div class="scx-sell-profit-center">
      <div class="scx-k scx-margin-bottom-4">${t("profitMargin")}</div>
      <div class="scx-sell-profit-center-value" style="color: ${profitColor};">
        ${Number.isFinite(sellAnalysis.profitMargin) ? sellAnalysis.profitMargin.toFixed(1) : "—"}%
      </div>
    </div>
  `;
}

