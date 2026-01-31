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
let currentLaborCost = 0;
let currentUnitCost = null; // Stored from UI if available
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
    // Check if this element contains a product link
    const hasProductLink = !!el.querySelector?.('a[href*="/encyclopedia/"][href*="/resource/"]');

    if (hasProductLink) {
        // It's a valid row if it has an amount input OR if it displays "Cost per unit" (active row)
        const hasQtyInput = !!el.querySelector?.('input[name="amount"]');
        const hasUnitCost = /Cost per unit:/i.test(el.textContent || "");
        
        if (hasQtyInput || hasUnitCost) {
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
  if (input) {
    const val = Number(input.value || 0);
    return val > 0 ? val : 1;
  }
  
  // Try to find "Producing right now: X,XXX" or just "Producing: X"
  const text = row.textContent || "";
  // Look for quantity patterns
  const match = text.match(/Producing right now:\s*([\d,]+)/i);
  if (match) {
    return Number(match[1].replace(/,/g, ''));
  }
  
  return 1;
}

/**
 * Extract Cost per unit from active production row
 */
function getUnitCostFromRow(row) {
  if (!row) return null;
  const text = row.textContent || "";
  // Supports "Cost per unit: $0.96" (Active) and "Unit cost: $0.96" (Setup)
  const match = text.match(/(?:Cost per unit|Unit cost):\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (match) {
    return Number(match[1].replace(/,/g, ''));
  }
  return null;
}

/**
 * Extract labor cost from a production row
 */
function getLaborCostFromRow(row) {
  if (!row) {
    return 0;
  }
  // Look for text like "Labor cost: $X,XXX"
  const text = row.textContent || "";
  const match = text.match(/Labor cost:\s*\$?([\d,]+(?:\.\d{2})?)/i);
  if (match) {
    const costStr = match[1].replace(/,/g, '');
    const cost = Number(costStr);
    return Number.isFinite(cost) ? cost : 0;
  }
  return 0;
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
      // Just fetch product and container
      const productIds = [currentProductId, 13]; 
      pricesCache = await fetchMarketPrices(realmId, productIds);
    } catch (e) {
      contentEl.innerHTML = `<div class="scx-note" style="border-left-color: #c62828; color: #c62828;">
        Error loading prices: ${e.message}
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
        ${analysis?.error ? `<div style="font-size:9px; color:#c62828; margin-top:4px;">${analysis.error}</div>` : ''}
        <div style="font-size:9x; color:#999; margin-top:8px;">Ensure "Cost per unit" is visible in the game UI.</div>
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

  contentEl.innerHTML = `
    <div class="scx-panel" style="font-size: 11px;">
      <div style="margin-bottom: 12px;">
        <div style="font-weight: 600; color: #333; font-size: 12px;">${recipe.name}</div>
        <div style="color: #999; font-size: 9px;">
          Qty: <span style="font-weight: 600; color: #333;">${currentQuantity}</span>
          <span style="background:#e3f2fd; color:#1565c0; padding:1px 4px; border-radius:3px; margin-left:4px;">Active</span>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-head" style="margin-bottom: 8px;">
        <div class="scx-panel-title">Production Costs</div>
      </div>
      <div style="background: #e3f2fd; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span class="scx-k">Cost per Unit (UI)</span>
            <span class="scx-v">${formatMoney(currentUnitCost)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top:4px;">
            <span class="scx-k">Total Production Cost</span>
            <span class="scx-v" style="font-weight:700; color:#1565c0;">${formatMoney(productionCost)}</span>
          </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
         <div class="scx-panel-title">Profit Analysis</div>
         <div style="font-size:9px; color:#999;">@ ${formatMoney(marketPrice)} (Market)</div>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        
        <!-- Market Profit -->
        <div style="background: #fff8e1; padding: 8px; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-weight:600; color:#ff6f00;">Market Sell</span>
             <div class="scx-muted">Full transport + Fee</div>
          </div>
          
          <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.05);">
             <span class="scx-k">Profit</span>
             <span style="font-weight:700; color:${profitAnalysis.market.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.market.profit)}
             </span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:2px;">
             <span class="scx-k">Margin</span>
             <span style="color:${profitAnalysis.market.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.market.margin.toFixed(2)}%
             </span>
          </div>
          <div style="font-size:9px; color:#999; margin-top:4px; text-align:right;">
             Break Even > ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}
          </div>
        </div>

        <!-- Contract Profit -->
        <div style="background: #f3e5f5; padding: 8px; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-weight:600; color:#7b1fa2;">Contract Sell</span>
             <div class="scx-muted">50% transport</div>
          </div>
          
           <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.05);">
             <span class="scx-k">Profit</span>
             <span style="font-weight:700; color:${profitAnalysis.contract.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.contract.profit)}
             </span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:2px;">
             <span class="scx-k">Margin</span>
             <span style="color:${profitAnalysis.contract.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.contract.margin.toFixed(2)}%
             </span>
          </div>
           <div style="font-size:9px; color:#999; margin-top:4px; text-align:right;">
             Break Even > ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}
          </div>
        </div>
      </div>
    </div>
  `;
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
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0;">
      <div>
        <div style="color: #333; font-weight: 500;">${materialName}</div>
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

