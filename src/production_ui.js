// production_ui.js
// Renders production helper section in the sidebar
import { STATE } from "./state.js";
import { formatMoney, escapeHtml } from "./utils.js";
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
 * Find the info column (div.right-border containing an h3) within a row.
 */
function getInfoColumn(row) {
  const cols = row.querySelectorAll('div.right-border');
  return [...cols].find(c => c.querySelector('h3')) || null;
}

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
 *   EN: 1,234.56  (comma = thousands, dot = decimal)
 *   DE: 1.234,56  (dot = thousands, comma = decimal)
 * Heuristic: the last separator followed by exactly 1-2 digits is the decimal.
 */
function parseLocalNum(raw) {
  let s = String(raw).trim();
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    const afterComma = s.slice(lastComma + 1);
    if (/^\d{1,2}$/.test(afterComma)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else {
    s = s.replace(/,/g, '');
  }
  const m = s.match(/-?\s*([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : NaN;
}

/**
 * Extract the first dollar value ($X.XX or $X,XX) from a text string.
 * Handles both EN and DE locale formats.
 */
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
      const productIds = [currentProductId, 13]; 
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
        <div style="font-size:9x; color:#999; margin-top:8px;">${t("ensureCostPerUnit")}</div>
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
        <div style="font-weight: 600; color: #333; font-size: 12px;">${escapeHtml(recipe.name)}</div>
        <div style="color: #999; font-size: 9px;">
          ${t("qty")}: <span style="font-weight: 600; color: #333;">${currentQuantity}</span>
          <span style="background:#e3f2fd; color:#1565c0; padding:1px 4px; border-radius:3px; margin-left:4px;">${t("active")}</span>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-head" style="margin-bottom: 8px;">
        <div class="scx-panel-title">${t("productionCosts")}</div>
      </div>
      <div style="background: #e3f2fd; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span class="scx-k" style="color:#455a64;">${t("costPerUnitUI")}</span>
            <span class="scx-v">${formatMoney(currentUnitCost)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top:4px;">
            <span class="scx-k" style="color:#455a64;">${t("totalProductionCost")}</span>
            <span class="scx-v" style="font-weight:700; color:#1565c0;">${formatMoney(productionCost)}</span>
          </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
         <div class="scx-panel-title">${t("profitAnalysis")}</div>
         <div style="font-size:9px; color:#999;">@ ${formatMoney(marketPrice)} ${t("marketInParens")}</div>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        
        <!-- Market Profit -->
        <div style="background: #fff8e1; padding: 8px; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-weight:600; color:#ff6f00;">${t("marketSell")}</span>
             <div class="scx-muted">${t("fullTransportFee")}</div>
          </div>
          
          <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.05);">
             <span class="scx-k" style="color:#5d4037;">${t("profit")}</span>
             <span style="font-weight:700; color:${profitAnalysis.market.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.market.profit)}
             </span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:2px;">
             <span class="scx-k" style="color:#5d4037;">${t("margin")}</span>
             <span style="color:${profitAnalysis.market.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.market.margin.toFixed(2)}%
             </span>
          </div>
          <div style="font-size:9px; color:#999; margin-top:4px; text-align:right;">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}
          </div>
        </div>

        <!-- Contract Profit -->
        <div style="background: #f3e5f5; padding: 8px; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-weight:600; color:#7b1fa2;">${t("contractSell")}</span>
             <div class="scx-muted">${t("halfTransport")}</div>
          </div>
          
           <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.05);">
             <span class="scx-k" style="color:#4a148c;">${t("profit")}</span>
             <span style="font-weight:700; color:${profitAnalysis.contract.profit >= 0 ? '#2e7d32' : '#c62828'};">
               ${formatMoney(profitAnalysis.contract.profit)}
             </span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:2px;">
             <span class="scx-k" style="color:#4a148c;">${t("margin")}</span>
             <span style="color:${profitAnalysis.contract.margin >= 0 ? '#2e7d32' : '#c62828'};">
               ${profitAnalysis.contract.margin.toFixed(2)}%
             </span>
          </div>
           <div style="font-size:9px; color:#999; margin-top:4px; text-align:right;">
             ${t("breakEvenGt")} ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}
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
        <div style="color: #999; font-size: 9px;">${t("qty")}: ${mc.quantity}</div>
      </div>
      <div style="text-align: right;">
        <div style="color: #666; font-weight: 500;">
          ${Number.isFinite(mc.unitPrice) ? formatMoney(mc.unitPrice) : "—"} ${t("perUnit")}
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
        ${t("cannotCalcProfit")}
      </div>
    `;
  }

  const isProfitable = sellAnalysis.profit > 0;
  const profitColor = isProfitable ? "#2e7d32" : "#c62828";
  const profitBg = isProfitable ? "#e8f5e9" : "#ffebee";

  return `
    <hr style="margin: 8px 0;">

    <div class="scx-panel-head" style="margin-bottom: 12px;">
      <div class="scx-panel-title">${t("sellingAnalysis")}</div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
      <div style="background: #e8f5e9; padding: 8px; border-radius: 4px;">
        <div class="scx-k">${t("grossProceeds")}</div>
        <div style="font-size: 13px; font-weight: 700; color: #1b5e20;">
          ${formatMoney(sellAnalysis.sellPrice)}
        </div>
      </div>
      <div style="background: #fff3e0; padding: 8px; border-radius: 4px;">
        <div class="scx-k">${t("marketFee4pct")}</div>
        <div style="font-size: 13px; font-weight: 700; color: #e65100;">
          -${formatMoney(sellAnalysis.feeAmount)}
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
      <div style="background: #f0f8ff; padding: 8px; border-radius: 4px;">
        <div class="scx-k">${t("netProceeds")}</div>
        <div style="font-size: 13px; font-weight: 700; color: #0d47a1;">
          ${formatMoney(sellAnalysis.netProceeds)}
        </div>
      </div>
      <div style="background: ${profitBg}; padding: 8px; border-radius: 4px;">
        <div class="scx-k">${t("profit")}</div>
        <div style="font-size: 13px; font-weight: 700; color: ${profitColor};">
          ${isProfitable ? "+" : ""}${formatMoney(sellAnalysis.profit)}
        </div>
      </div>
    </div>

    <div style="background: #fafafa; padding: 8px; border-radius: 4px; text-align: center;">
      <div class="scx-k" style="margin-bottom: 4px;">${t("profitMargin")}</div>
      <div style="font-size: 16px; font-weight: 700; color: ${profitColor};">
        ${Number.isFinite(sellAnalysis.profitMargin) ? sellAnalysis.profitMargin.toFixed(1) : "—"}%
      </div>
    </div>
  `;
}

