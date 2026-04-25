// retail_ui.js
import { STATE } from "./state.js";
import {
  formatMoney,
  escapeHtml,
  parseLocaleNumber,
  COPY_BUTTON_SVG,
  wireCopyButton,
  MARKET_FEE,
  TRANSPORT_RESOURCE_ID,
} from "./utils.js";
import { ensureMarketFetchForProduct, getCheapestListing, fetchMarket } from "./market.js";
import { getRealmId } from "./auth.js";
import { getRecipeByProductId } from "./production.js";
import { getSectionContent } from "./sidebar.js";
import { t } from "./i18n.js";
import {
  classifyProfitPerMin,
  parseDurationToSeconds,
  computeMetrics,
  formatRetailAsText,
  computeRetailTrends,
  computeOpportunityScore,
  getRetailBadge,
} from "./retail_calc.js";
import { fetchRetailInfoForProduct, getCachedRetailInfo } from "./retail_market.js";
import { MARKET_CACHE_TTL_MS } from "./constants.js";
import {
  findFirstRetailRow,
  findRetailRowFromTarget,
  isRetailSellInput,
  readRetailRow,
} from "./page/retail_page.js";
import {
  loadExecutivesOnce,
  getExecutivesTrainingForCOO,
  getExecutivesTrainingForCMO,
} from "./executives.js";

const SECTION_ID = "retail-section";

export { classifyProfitPerMin };

/**
 * ---------------------------
 * Retail UI parsing/adapters
 * ---------------------------
 */
export const RetailHelper = (() => {
  // ---------- parsing ----------
  const parseNumber = parseLocaleNumber;
  const parseMoney = parseLocaleNumber;

  function extractFinishSeconds(row) {
    const infoCol = readRetailRow(row)?.infoColumnEl;
    if (!infoCol) return NaN;

    // Duration is always in parentheses like (11h, 7m) or (13st, 31m) — language-agnostic
    const text = infoCol.textContent || "";
    const paren = text.match(/\(([^)]*\d+\s*(?:st|[dhmst])[^)]*)\)/);
    if (paren) return parseDurationToSeconds(paren[1]);

    // Try to locate a dedicated duration element (e.g., "51m, 16s") to avoid
    // concatenation with time-of-day strings like "08:13"
    let durationText = "";
    const durationPattern = /\d+\s*(?:d|t|h|st|m|s)\b/i;
    for (const el of infoCol.querySelectorAll(":scope *")) {
      const t = el.textContent || "";
      if (durationPattern.test(t) && !/\d{1,2}:\d{2}/.test(t)) {
        durationText = t;
      }
    }
    if (durationText) return parseDurationToSeconds(durationText);

    // Fallback: game may display duration inline without parentheses
    return parseDurationToSeconds(text);
  }

  function extractProfitPerUnit(row) {
    const infoCol = readRetailRow(row)?.infoColumnEl;
    if (!infoCol) return NaN;

    // The profit div is the one containing an SVG (question-mark icon) — language-agnostic
    const childDivs = [...infoCol.querySelectorAll(":scope > div")];
    let profitDiv = childDivs.find((d) => d.querySelector("svg"));

    // Fallback: if the game no longer renders an SVG tooltip, find a div whose
    // entire text content is a bare dollar amount (no label text before it),
    // e.g. "$0.30" or "−$1,234.56" but NOT "Average price: $8.67"
    if (!profitDiv) {
      profitDiv = childDivs.find((d) => /^\s*[-−]?\s*\$\s*[\d.,]+\s*$/.test(d.textContent));
    }

    if (!profitDiv) return NaN;

    const text = profitDiv.textContent || "";
    // Extract dollar value — supports both EN ($1,234.56) and DE ($1.234,56)
    const match = text.match(/([-−]?)\s*\$\s*([\d.,]+)/);
    if (!match) return NaN;

    const val = parseMoney(match[2]);
    if (!isFinite(val)) return NaN;

    // explicit minus formats
    const hasExplicitMinus =
      match[1].length > 0 || /-\s*\$/.test(text) || /−\s*\$/.test(text) || /\(\s*\$?\s*\d/.test(text);

    if (hasExplicitMinus) return -Math.abs(val);

    // implicit negative by red-ish text
    const color = getComputedStyle(profitDiv).color;
    const mm = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (mm) {
      const r = Number(mm[1]),
        g = Number(mm[2]),
        b = Number(mm[3]);
      if (r > 150 && g < 100 && b < 100) return -Math.abs(val);
    }

    return Math.abs(val);
  }

  const extractProductId = (row) => readRetailRow(row)?.productId ?? null;

  function getProductName(row) {
    return readRetailRow(row)?.productName || "Unknown";
  }

  // ---------- UI data adapters ----------
  const renderers = {
    getProductName,

    getMetrics(row) {
      const retailRow = readRetailRow(row);
      const qty = parseNumber(retailRow?.quantityInput?.value ?? "");
      const yourPrice = parseMoney(retailRow?.priceInput?.value ?? "");
      const profitPerUnit = extractProfitPerUnit(row);
      const seconds = extractFinishSeconds(row);
      const m = computeMetrics({ profitPerUnit, qty, seconds });
      return { ...m, profitPerUnit, qty, yourPrice };
    },

    getInventoryView(row) {
      const kind = extractProductId(row);

      if (!STATE.inventory) {
        return { status: "Idle", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };
      }

      if (STATE.inventory.status === "loading")
        return { status: t("loading"), stock: "—", cpu: "—", src: "—", basis: "—", note: "" };

      if (STATE.inventory.status === "error")
        return {
          status: "Error",
          stock: "—",
          cpu: "—",
          src: "—",
          basis: "—",
          note: STATE.inventory.error || "",
        };

      if (STATE.inventory.status !== "ok")
        return { status: "Idle", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };

      const inv = kind ? STATE.inventory.byKind.get(kind) : null;
      if (!inv) return { status: "OK", stock: "0", cpu: "—", src: "—", basis: "—", note: "" };

      const cpu = inv.amount > 0 ? `$${formatMoney(inv.totalCost / inv.amount, { prefix: false })}` : "—";
      const src =
        inv.marketCost > 0 && inv.workers + inv.admin + inv.materials > 0
          ? "Mixed"
          : inv.marketCost > 0
            ? "Market"
            : inv.workers + inv.admin + inv.materials > 0
              ? "Produced"
              : "Unknown";

      // Calculate per-unit breakdowns for display
      const amount = inv.amount || 1;
      const uMarket = (inv.marketCost || 0) / amount;
      const uProd = ((inv.workers || 0) + (inv.admin || 0) + (inv.materials || 0)) / amount;

      const note = `Mix: market $${formatMoney(uMarket, { prefix: false })} | produced $${formatMoney(uProd, { prefix: false })}`;

      return {
        status: "OK",
        stock: String(Math.floor(inv.amount)),
        cpu,
        src,
        basis: `$${formatMoney(inv.totalCost || 0, { prefix: false })}`,
        note,
      };
    },

    getMarketView(row, scheduleUpdate) {
      const productId = extractProductId(row);
      if (productId) ensureMarketFetchForProduct(productId, scheduleUpdate);

      const ms = STATE.marketState;

      // if your market module stores productId in marketState, this prevents stale display:
      if (ms?.productId != null && productId != null && ms.productId !== productId) {
        return { status: t("loading"), cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };
      }

      if (!ms || ms.status === "idle")
        return { status: "Idle", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      if (ms.status === "loading")
        return { status: t("loading"), cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      if (ms.status === "error")
        return {
          status: "Error",
          cheapestPrice: "—",
          cheapestQty: "—",
          youVs: "—",
          note: ms.error || "",
        };

      const cheapest = getCheapestListing(ms.data);
      if (!cheapest) return { status: "Empty", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      const yourPrice = parseMoney(readRetailRow(row)?.priceInput?.value ?? "");
      const youVs = isFinite(yourPrice) ? yourPrice - cheapest.price : NaN;

      return {
        status: "OK",
        cheapestPrice: `$${formatMoney(cheapest.price, { prefix: false })}`,
        cheapestQty: cheapest.quantity == null ? "—" : String(cheapest.quantity),
        youVs: isFinite(youVs) ? `${youVs > 0 ? "+" : ""}${formatMoney(youVs, { prefix: false })}` : "—",
        note: "",
      };
    },
  };

  // ---------- selection wiring ----------
  function setSelectedRow(row, scheduleUpdate) {
    if (!row) return;
    const retailRow = readRetailRow(row);
    if (!retailRow) return;

    STATE.selectedRow = row;

    // disconnect old observers
    STATE.selectedRowObserver?.disconnect();
    STATE.selectedRowObserver = null;

    // remove old listeners
    if (STATE.selectedInputs) {
      const { priceInput, qtyInput, onInput } = STATE.selectedInputs;
      priceInput?.removeEventListener("input", onInput);
      qtyInput?.removeEventListener("input", onInput);
    }
    STATE.selectedInputs = null;

    const priceInput = retailRow.priceInput;
    const qtyInput = retailRow.quantityInput;
    const onInput = () => scheduleUpdate();

    priceInput?.addEventListener("input", onInput);
    qtyInput?.addEventListener("input", onInput);
    STATE.selectedInputs = { priceInput, qtyInput, onInput };

    // observe row changes (React updates profit/time etc)
    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(row, { childList: true, subtree: true, characterData: true });
    STATE.selectedRowObserver = mo;

    scheduleUpdate();
  }

  function onFocusOrClick(e, scheduleUpdate) {
    const t = e.target;
    if (!isRetailSellInput(t)) return;
    const row = findRetailRowFromTarget(t);
    if (row) setSelectedRow(row, scheduleUpdate);
  }

  function autoSelectFirstRow(scheduleUpdate) {
    if (STATE.selectedRow) return;
    const row = findFirstRetailRow(document);
    if (row) setSelectedRow(row, scheduleUpdate);
  }

  return {
    onFocusOrClick,
    autoSelectFirstRow,
    renderers,
    _testUtils: {
      parseNumber,
      parseMoney,
      parseDurationToSeconds,
      computeMetrics,
      extractProductId,
      extractFinishSeconds,
      extractProfitPerUnit,
      isSellInput: isRetailSellInput,
      getRowFromTarget: findRetailRowFromTarget,
    },
  };
})();

function getTrendClass(colorVar) {
  if (colorVar === "var(--scx-color-success)") return "scx-text-positive";
  if (colorVar === "var(--scx-color-error)") return "scx-text-negative";
  return "scx-text-muted";
}

/**
 * Render the retail helper panel content
 */
export async function updatePanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  const row = STATE.selectedRow;
  const retailRow = readRetailRow(row);

  if (!row || !retailRow) {
    contentEl.innerHTML = `
      <div class="scx-retail-empty-state">
        <div class="scx-muted">${t("noItemSelected")}</div>
        <div class="scx-muted scx-retail-empty-hint">${t("clickToShowStats")}</div>
      </div>
    `;
    return;
  }

  const renderers = RetailHelper.renderers;
  const productName = escapeHtml(retailRow.productName);
  const productId = retailRow.productId;

  // Profit area
  const metrics = renderers.getMetrics(row);
  const chip = classifyProfitPerMin(metrics.profitPerMin);

  // Ensure we have container price for market comparison
  const realmId = getRealmId();
  // realmId can be 0, so checks must be explicit
  if (realmId !== null && realmId !== undefined) {
    // Check if we have fresh container price in catch
    const cacheKey = `${realmId}:${TRANSPORT_RESOURCE_ID}`;
    const cachedContainer = STATE.marketCache.get(cacheKey);
    if (!cachedContainer || Date.now() - cachedContainer.ts > MARKET_CACHE_TTL_MS) {
      // Trigger fetch (async, update callback is just updatePanel)
      fetchMarket(realmId, 13)
        .then(() => updatePanel())
        .catch(() => {});
    }
  }

  // Market Check
  const ms = STATE.marketState;
  // Trigger market fetch for this product
  if (productId) {
    ensureMarketFetchForProduct(productId, () => updatePanel());
  }

  // Retail info (saturation / opportunity) — kick off async fetch, re-render on completion
  if (productId != null && realmId != null) {
    const cached = getCachedRetailInfo(productId);
    if (!cached) {
      fetchRetailInfoForProduct(realmId, productId)
        .then(() => updatePanel())
        .catch(() => {});
    }
  }

  // Executives — kick off async fetch, re-render on completion to show COO training warning
  if (!STATE.executives.loaded && !STATE.executives.loading) {
    loadExecutivesOnce()
      .then(() => updatePanel())
      .catch(() => {});
  }

  // --- Market Comparison Calculations ---
  let marketAnalysisHTML = "";
  let marketAnalysisData = null; // Store for copy functionality

  if (productId != null && realmId != null) {
    const inv = STATE.inventory?.byKind?.get(productId);

    // Only show if we have stock
    if (inv && inv.amount > 0) {
      // Check if we have market data
      if (ms && ms.status === "ok" && ms.productId === productId && ms.data) {
        const cheapest = getCheapestListing(ms.data);

        // Helper to get cached container price (ID 13)
        // We use STATE.marketCache directly or a helper if available
        // We'll peek into the cache directly as we triggered fetch above
        const containerCache = STATE.marketCache.get(`${realmId}:${TRANSPORT_RESOURCE_ID}`);
        const containerListing = containerCache ? getCheapestListing(containerCache.data) : null;

        // Relaxed cache check: allow up to 5 minutes old, or just exists
        const containerPrice = containerListing ? containerListing.price : null;

        if (cheapest && Number.isFinite(containerPrice)) {
          const qty = metrics.qty || 1;
          const recipe = getRecipeByProductId(productId);
          const transportUnits = recipe?.transport || 0;

          // Avg Cost (from inventory)
          const avgCost = inv.totalCost / inv.amount || 0;

          // Market Sells
          // Revenue = Price * (1 - MARKET_FEE) * Qty
          const marketRevenue = cheapest.price * (1 - MARKET_FEE) * qty;

          // Costs = (AvgCost * Qty) + (TransportUnits * Qty * ContainerPrice)
          const cogs = avgCost * qty;
          const transportCost = transportUnits * qty * containerPrice;
          const marketCost = cogs + transportCost;

          const marketProfit = marketRevenue - marketCost;
          const retailProfit = metrics.totalProfit; // This is Total Retail Profit for the batch

          // Calculate retail net profit: profit per unit * quantity
          const profitPerUnit = metrics.profitPerUnit || 0;
          const retailNetProfit = profitPerUnit * qty;

          const diff = retailProfit - marketProfit;
          const isRetailBetter = diff >= 0;

          // Store market analysis data for copy functionality
          marketAnalysisData = {
            cogs,
            avgCost,
            retailNetProfit,
            marketProfit,
            retailProfit,
            cheapestPrice: cheapest.price,
          };

          marketAnalysisHTML = `
                    <hr class="scx-hr-sm">
                    
                    <div class="scx-panel-head scx-retail-panel-head">
                        <div class="scx-panel-title">${t("retailVsMarket")}</div>
                    </div>

                    <div class="scx-retail-analysis-block">
                        <div class="scx-retail-row">
                            <span class="scx-k">${t("costOfGoods")}</span>
                            <span class="scx-v">${formatMoney(cogs)}</span>
                        </div>
                         <div class="scx-retail-row scx-retail-detail-row">
                            <span>${t("unitCostLabel")}: <span class="scx-mono">${formatMoney(avgCost)}</span></span>
                        </div>
                    </div>
                    
                    <div class="scx-card scx-tone-surface ${isRetailBetter ? "scx-tone-success" : "scx-tone-warning"}">
                        <div class="scx-retail-win-row">
                            <span class="scx-k">${t("marketNetProfit")}</span>
                            <span class="scx-v">${formatMoney(marketProfit)}</span>
                        </div>
                        <div class="scx-retail-win-row">
                            <span class="scx-k">${t("retailNetProfit")}</span>
                            <span class="scx-v">${formatMoney(retailNetProfit)}</span>
                        </div>
                        <div class="scx-retail-win-row scx-retail-win-row-summary ${isRetailBetter ? "scx-text-positive" : "scx-text-warning-strong"}">
                            <span>${isRetailBetter ? t("retailWinsBy") : t("marketWinsBy")}</span>
                            <span class="scx-mono">${formatMoney(Math.abs(diff))}</span>
                        </div>
                        <div class="scx-retail-price-note">
                            ${t("basedOnCheapPrice")}: <span class="scx-mono">${formatMoney(cheapest.price)}</span>
                        </div>
                    </div>
                  `;
        } else {
          // data loading (container or cheapest price missing)
          marketAnalysisHTML = `
                    <hr class="scx-hr-sm">
                    <div class="scx-muted">${t("loadingMarketPrices")}</div>
                  `;
        }
      } else if (ms && ms.status === "error") {
        marketAnalysisHTML = `
                <hr class="scx-hr-sm">
                <div class="scx-note scx-retail-note-error">${t("marketError")}: ${escapeHtml(ms.error)}</div>
              `;
      } else {
        // Loading or Idle
        marketAnalysisHTML = `
                <hr class="scx-hr-sm">
                <div class="scx-muted">${t("loadingMarketData")}</div>
              `;
      }
    }
  }

  // --- Market Pulse (saturation + opportunity score) ---
  let marketPulseHTML = "";
  if (productId != null && realmId != null) {
    const retailInfo = getCachedRetailInfo(productId);
    if (retailInfo) {
      const trends = computeRetailTrends(retailInfo);
      const score = computeOpportunityScore(trends);
      const badge = getRetailBadge(score, trends);

      const fmtPct = (v) => {
        if (!Number.isFinite(v)) return "—";
        const sign = v >= 0 ? "+" : "";
        return `${sign}${(v * 100).toFixed(1)}%`;
      };

      const satArrow =
        trends && trends.satDelta7d < -0.005 ? "↓" : trends && trends.satDelta7d > 0.005 ? "↑" : "→";
      const priceArrow =
        trends && trends.priceDelta7d > 0.005 ? "↑" : trends && trends.priceDelta7d < -0.005 ? "↓" : "→";
      const satArrowColor =
        satArrow === "↓"
          ? "var(--scx-color-success)"
          : satArrow === "↑"
            ? "var(--scx-color-error)"
            : "var(--scx-text-muted)";
      const priceArrowColor =
        priceArrow === "↑"
          ? "var(--scx-color-success)"
          : priceArrow === "↓"
            ? "var(--scx-color-error)"
            : "var(--scx-text-muted)";

      marketPulseHTML = `
        <hr class="scx-hr-sm">
        <div class="scx-panel-head scx-retail-panel-head">
          <div class="scx-panel-title">${t("marketPulse")}</div>
          <div class="scx-chip ${badge.cls}">${t(badge.label)}</div>
        </div>
        <div class="scx-grid">
          <span class="scx-k">${t("currentSaturation")}</span>
          <span class="scx-v">
            ${trends ? trends.currentSat.toFixed(2) : "—"}
            <span class="${getTrendClass(satArrowColor)}">${satArrow} ${fmtPct(trends?.satDelta7d)}</span>
          </span>
          <span class="scx-k">${t("avgRetailPrice")}</span>
          <span class="scx-v">
            ${trends ? formatMoney(trends.currentPrice) : "—"}
            <span class="${getTrendClass(priceArrowColor)}">${priceArrow} ${fmtPct(trends?.priceDelta7d)}</span>
          </span>
        </div>
        <div class="scx-note scx-margin-top-2 scx-retail-note-plain">${t(badge.verdict)}</div>
      `;
    } else {
      marketPulseHTML = `
        <hr class="scx-hr-sm">
        <div class="scx-panel-head scx-retail-panel-head">
          <div class="scx-panel-title">${t("marketPulse")}</div>
        </div>
        <div class="scx-text-muted scx-text-xs">${t("loadingMarketData")}</div>
      `;
    }
  }

  // --- Executive Training Warnings (COO + apprentice COO, CMO + apprentice CMO) ---
  const RETAIL_ROLE_LABEL_KEYS = {
    coo: "roleCOO",
    apprenticeCoo: "roleApprenticeCOO",
    cmo: "roleCMO",
    apprenticeCmo: "roleApprenticeCMO",
  };
  let executiveWarningsHTML = "";
  if (STATE.executives.loaded) {
    const trainingExecs = [...getExecutivesTrainingForCOO(), ...getExecutivesTrainingForCMO()];
    executiveWarningsHTML = trainingExecs
      .map(({ executive, roleKey }) => {
        const roleLabel = t(RETAIL_ROLE_LABEL_KEYS[roleKey]);
        return `<div class="scx-note scx-retail-note-warning">${escapeHtml(executive.name)} (${roleLabel}) ${t("inTrainingAffectsRetail")}</div>`;
      })
      .join("");
  }

  // --- HTML Render ---

  let finePrint = "";
  if (metrics.hours > 1) {
    finePrint += `<div class="scx-retail-fine-print scx-retail-fine-print-first"><span class="scx-mono">${formatMoney(metrics.profitPerHr)}</span> ${t("perHour")}</div>`;
  }
  if (metrics.hours > 24) {
    finePrint += `<div class="scx-retail-fine-print"><span class="scx-mono">${formatMoney(metrics.profitPerDay)}</span> ${t("perDay")}</div>`;
  }

  contentEl.innerHTML = `
    <div class="scx-panel">
      <div class="scx-retail-header">
        <div class="scx-retail-product-name">
          ${productName}
        </div>
        <button class="scx-copy-btn" data-copy-action="retail" data-tooltip="${t("copyText")}">
          ${COPY_BUTTON_SVG}
        </button>
      </div>

      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("profitPerMinute")}</div>
        <div class="scx-chip ${chip.cls}">${chip.label}</div>
      </div>

      <div class="scx-big scx-retail-ppm">
          ${isFinite(metrics.profitPerMin) ? `${formatMoney(metrics.profitPerMin)}${t("perMin")}` : "—"}
      </div>
      
      ${finePrint}

      ${executiveWarningsHTML}
      ${marketPulseHTML}
      ${marketAnalysisHTML}
    </div>
  `;

  // Wire up copy button
  wireCopyButton(contentEl, () =>
    formatRetailAsText(retailRow.productName, metrics, productId, realmId, marketAnalysisData),
  );
}
