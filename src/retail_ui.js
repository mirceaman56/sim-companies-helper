// retail_ui.js
import { STATE } from "./state.js";
import { formatMoney, escapeHtml, copyToClipboard } from "./utils.js";
import { ensureMarketFetchForProduct, getCheapestListing, fetchMarketPrice, fetchMarket } from "./market.js";
import { getRealmId } from "./auth.js";
import { getRecipeByProductId } from "./production.js";
import { registerSection, getSectionContent, setSectionUpdateFn } from "./sidebar.js";
import { t } from "./i18n.js";

const SECTION_ID = "retail-section";

export function classifyProfitPerMin(ppm) {
  if (!Number.isFinite(ppm)) return { label: t("na"), cls: "scx-chip-na" };
  if (ppm < 0) return { label: t("bad"), cls: "scx-chip-bad" };
  if (ppm >= 50) return { label: t("excellent"), cls: "scx-chip-excellent" };
  if (ppm >= 20) return { label: t("good"), cls: "scx-chip-good" };
  if (ppm >= 5) return { label: t("meh"), cls: "scx-chip-meh" };
  return { label: t("low"), cls: "scx-chip-meh" };
}


/**
 * ---------------------------
 * Retail UI parsing/adapters
 * ---------------------------
 */
export const RetailHelper = (() => {
  // ---------- parsing ----------
  /**
   * Parse a number from text, handling both locale formats:
   *   EN: 1,234.56  (comma = thousands, dot = decimal)
   *   DE: 1.234,56  (dot = thousands, comma = decimal)
   * Heuristic: the last separator followed by exactly 1-2 digits is the decimal.
   */
  function parseNumber(text) {
    let s = String(text).trim();
    // Find the last comma or dot
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Comma is last — check if it's a decimal separator (1-2 digits after)
      const afterComma = s.slice(lastComma + 1);
      if (/^\d{1,2}$/.test(afterComma)) {
        // German decimal: remove dots (thousands), replace comma with dot
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Comma is thousands separator (3 digits after)
        s = s.replace(/,/g, '');
      }
    } else {
      // Dot is last or no comma — standard: remove commas (thousands)
      s = s.replace(/,/g, '');
    }
    const m = s.match(/-?\s*([0-9]+(\.[0-9]+)?)/);
    return m ? Number(m[1]) : NaN;
  }
  function parseMoney(text) {
    return parseNumber(text);
  }

  /**
   * Find the info column (div.right-border containing an h3) within a row.
   * This is the column that holds product name, profit, finishes, etc.
   */
  function getInfoColumn(row) {
    const cols = row.querySelectorAll('div.right-border');
    return [...cols].find(c => c.querySelector('h3')) || null;
  }

  // Supports EN: "12s", "8m", "1h 5m", "1d 5h", "1d, 8m"
  // Supports DE: "12s", "8m", "1st 5m", "1t 5st", "13st, 31m" (st = Stunden, t = Tage)
  function parseDurationToSeconds(text) {
    const s = String(text);
    let total = 0;
    const d = s.match(/(\d+)\s*(?:d|t)\b/i);       // days: "d" (EN) or "t" (DE: Tage)
    const h = s.match(/(\d+)\s*(?:h|st)\b/i);       // hours: "h" (EN) or "st" (DE: Stunden)
    const m = s.match(/(\d+)\s*m\b/i);               // minutes
    const sec = s.match(/(\d+)\s*s\b/i);             // seconds: "s" — \b prevents matching "st"
    if (d) total += Number(d[1]) * 86400;
    if (h) total += Number(h[1]) * 3600;
    if (m) total += Number(m[1]) * 60;
    if (sec) total += Number(sec[1]);
    return total > 0 ? total : NaN;
  }

  function extractFinishSeconds(row) {
    const infoCol = getInfoColumn(row);
    if (!infoCol) return NaN;

    // Duration is always in parentheses like (11h, 7m) or (13st, 31m) — language-agnostic
    const text = infoCol.textContent || '';
    const paren = text.match(/\(([^)]*\d+\s*(?:st|[hmst])[^)]*)\)/);
    if (paren) return parseDurationToSeconds(paren[1]);

    return NaN;
  }

  function extractProfitPerUnit(row) {
    const infoCol = getInfoColumn(row);
    if (!infoCol) return NaN;

    // The profit div is the one containing an SVG (question-mark icon) — language-agnostic
    const profitDiv = [...infoCol.querySelectorAll(':scope > div')].find(d => d.querySelector('svg'));
    if (!profitDiv) return NaN;

    const text = profitDiv.textContent || '';
    // Extract dollar value — supports both EN ($1,234.56) and DE ($1.234,56)
    const match = text.match(/([-−]?)\s*\$\s*([\d.,]+)/);
    if (!match) return NaN;

    const val = parseMoney(match[2]);
    if (!isFinite(val)) return NaN;

    // explicit minus formats
    const hasExplicitMinus =
      match[1].length > 0 ||
      /-\s*\$/.test(text) ||
      /−\s*\$/.test(text) ||
      /\(\s*\$?\s*\d/.test(text);

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

  function extractProductId(row) {
    const a = row?.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
    const href = a?.getAttribute("href") || "";
    const m = href.match(/\/resource\/(\d+)\//);
    return m ? Number(m[1]) : null;
  }

  function computeMetrics({ profitPerUnit, qty, seconds }) {
    const totalProfit = profitPerUnit * qty;
    const minutes = seconds / 60;
    const hours = seconds / 3600;

    const profitPerMin = isFinite(totalProfit) && minutes > 0 ? totalProfit / minutes : NaN;
    const profitPerHr = profitPerMin * 60;
    const profitPerDay = profitPerHr * 24;

    return { totalProfit, profitPerMin, profitPerHr, profitPerDay, seconds, minutes, hours };
  }

  // ---------- row detection ----------
  function isSellInput(target) {
    return target instanceof Element && target.matches('input[name="price"], input[name="quantity"]');
  }

  /**
   * Robust row finder for both themes:
   * - walks up and returns the nearest ancestor that contains both inputs + an encyclopedia link
   * - falls back to old wrapper classes
   */
  function getRowFromTarget(target) {
    if (!(target instanceof Element)) return null;

    // old wrapper fallback
    const old = target.closest("div.css-mv4qyq");
    if (old && old.querySelector('input[name="price"]') && old.querySelector('input[name="quantity"]')) {
      return old;
    }

    // direct heuristic: nearest ancestor with both inputs and a resource link
    let el = target;
    for (let i = 0; i < 25 && el; i++) {
      const hasInputs =
        !!el.querySelector?.('input[name="price"]') &&
        !!el.querySelector?.('input[name="quantity"]');
      const hasLink =
        !!el.querySelector?.('a[href*="/encyclopedia/"][href*="/resource/"]');

      if (hasInputs && hasLink) return el;

      // some containers are too big; stop if we reached body
      if (el === document.body) break;
      el = el.parentElement;
    }

    // final: nearest ancestor with both inputs (even if link missing)
    el = target;
    for (let i = 0; i < 25 && el; i++) {
      if (
        el.querySelector?.('input[name="price"]') &&
        el.querySelector?.('input[name="quantity"]')
      ) {
        return el;
      }
      if (el === document.body) break;
      el = el.parentElement;
    }

    return null;
  }

  function getProductName(row) {
    if (!row) return "Unknown";
    // Use the h3 specifically from the info column — avoids matching "Quantity" / "Price" headers
    const infoCol = getInfoColumn(row);
    if (infoCol) {
      const h3 = infoCol.querySelector('h3');
      if (h3) return (h3.textContent || '').trim() || "Unknown";
    }
    // Fallback: first h3 with content in the row
    const h3s = row.querySelectorAll('h3');
    for (const h of h3s) {
      const t = (h.textContent || '').trim();
      if (t) return t;
    }
    return "Unknown";
  }

  // ---------- UI data adapters ----------
  const renderers = {
    getProductName,

    getMetrics(row) {
      const qty = parseNumber(row.querySelector('input[name="quantity"]')?.value ?? "");
      const yourPrice = parseMoney(row.querySelector('input[name="price"]')?.value ?? "");
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

      const cpu = inv.amount > 0 ? `$${(inv.totalCost / inv.amount).toFixed(2)}` : "—";
      const src =
        inv.marketCost > 0 && (inv.workers + inv.admin + inv.materials) > 0
          ? "Mixed"
          : inv.marketCost > 0
          ? "Market"
          : (inv.workers + inv.admin + inv.materials) > 0
          ? "Produced"
          : "Unknown";

      // Calculate per-unit breakdowns for display
      const amount = inv.amount || 1;
      const uMarket = (inv.marketCost || 0) / amount;
      const uProd = ((inv.workers || 0) + (inv.admin || 0) + (inv.materials || 0)) / amount;

      const note = `Mix: market $${uMarket.toFixed(2)} | produced $${uProd.toFixed(2)}`;

      return {
        status: "OK",
        stock: String(Math.floor(inv.amount)),
        cpu,
        src,
        basis: `$${(inv.totalCost || 0).toFixed(2)}`,
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
      if (!cheapest)
        return { status: "Empty", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      const yourPrice = parseMoney(row.querySelector('input[name="price"]')?.value ?? "");
      const youVs = isFinite(yourPrice) ? yourPrice - cheapest.price : NaN;

      return {
        status: "OK",
        cheapestPrice: `$${cheapest.price.toFixed(2)}`,
        cheapestQty: cheapest.quantity == null ? "—" : String(cheapest.quantity),
        youVs: isFinite(youVs) ? `${youVs > 0 ? "+" : ""}${youVs.toFixed(2)}` : "—",
        note: "",
      };
    },
  };

  // ---------- selection wiring ----------
  function setSelectedRow(row, scheduleUpdate) {
    if (!row) return;

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

    const priceInput = row.querySelector('input[name="price"]');
    const qtyInput = row.querySelector('input[name="quantity"]');
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
    if (!isSellInput(t)) return;
    const row = getRowFromTarget(t);
    if (row) setSelectedRow(row, scheduleUpdate);
  }

  function autoSelectFirstRow(scheduleUpdate) {
    if (STATE.selectedRow) return;
    const input = document.querySelector(
      'input[name="price"], input[name="quantity"]'
    );
    const row = input ? getRowFromTarget(input) : null;
    if (row) setSelectedRow(row, scheduleUpdate);
  }

  return { onFocusOrClick, autoSelectFirstRow, renderers, _testUtils: { parseNumber, parseMoney, parseDurationToSeconds, computeMetrics, getInfoColumn, extractProductId, extractFinishSeconds, extractProfitPerUnit, isSellInput, getRowFromTarget } };
})();

/**
 * Format retail panel data as plain text table
 */
function formatRetailAsText(productName, metrics, productId, realmId) {
  const lines = [
    `Product: ${productName}`,
    `Profit/Min: ${formatMoney(metrics.profitPerMin)}`,
    `Total Profit: ${formatMoney(metrics.totalProfit)}`,
    `Profit/Hour: ${formatMoney(metrics.profitPerHr)}`,
    `Profit/Day: ${formatMoney(metrics.profitPerDay)}`,
    ``,
    `Quantity: ${metrics.qty}`,
    `Your Price: ${formatMoney(metrics.yourPrice)}`,
    `Finish in: ${metrics.seconds}s (${metrics.hours.toFixed(2)}hrs)`,
  ];
  return lines.join('\n');
}

/**
 * Render the retail helper panel content
 */
export async function updatePanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  const row = STATE.selectedRow;

  if (!row) {
    contentEl.innerHTML = `
      <div style="text-align: center; padding: 12px;">
        <div class="scx-muted">${t("noItemSelected")}</div>
        <div class="scx-muted" style="font-size: 9px; margin-top: 4px;">${t("clickToShowStats")}</div>
      </div>
    `;
    return;
  }

  const renderers = RetailHelper.renderers;
  const productName = escapeHtml(renderers.getProductName(row));
  const productId = extractProductId(row);

  // Profit area
  const metrics = renderers.getMetrics(row);
  const chip = classifyProfitPerMin(metrics.profitPerMin);
  
  // Ensure we have container price for market comparison
  const realmId = getRealmId();
  // realmId can be 0, so checks must be explicit
  if (realmId !== null && realmId !== undefined) {
     // Check if we have fresh container price in catch
     const cacheKey = `${realmId}:13`;
     const cachedContainer = STATE.marketCache.get(cacheKey);
     if (!cachedContainer || (Date.now() - cachedContainer.ts > 60000)) {
         // Trigger fetch (async, update callback is just updatePanel)
         fetchMarket(realmId, 13).then(() => updatePanel()).catch(() => {});
     }
  }
  
  // Market Check
  const ms = STATE.marketState;
  // Trigger market fetch for this product
  if (productId) {
      ensureMarketFetchForProduct(productId, () => updatePanel());
  }

  // --- Market Comparison Calculations ---
  let marketAnalysisHTML = "";
 
  if (productId != null && realmId != null) {
      const inv = STATE.inventory?.byKind?.get(productId);
      
      // Only show if we have stock
      if (inv && inv.amount > 0) {
          // Check if we have market data
          if (ms && ms.status === 'ok' && ms.productId === productId && ms.data) {
              const cheapest = getCheapestListing(ms.data);
              
              // Helper to get cached container price (ID 13)
              // We use STATE.marketCache directly or a helper if available
              // We'll peek into the cache directly as we triggered fetch above
              const containerCache = STATE.marketCache.get(`${realmId}:13`);
              const containerListing = containerCache ? getCheapestListing(containerCache.data) : null;
              
              // Relaxed cache check: allow up to 5 minutes old, or just exists
              const containerPrice = containerListing ? containerListing.price : null;

              if (cheapest && Number.isFinite(containerPrice)) {
                  const qty = metrics.qty || 1;
                  const recipe = getRecipeByProductId(productId);
                  const transportUnits = recipe?.transport || 0;
                  
                  // Avg Cost (from inventory)
                  const avgCost = (inv.totalCost / inv.amount) || 0;
                  
                  // Market Sells
                  // Revenue = Price * 0.96 * Qty
                  const marketRevenue = cheapest.price * 0.96 * qty;
                  
                  // Costs = (AvgCost * Qty) + (TransportUnits * Qty * ContainerPrice)
                  const cogs = avgCost * qty;
                  const transportCost = transportUnits * qty * containerPrice;
                  const marketCost = cogs + transportCost;
                  
                  const marketProfit = marketRevenue - marketCost;
                  const retailProfit = metrics.totalProfit; // This is Total Retail Profit for the batch
                  
                  const diff = retailProfit - marketProfit;
                  const isRetailBetter = diff >= 0;
                  
                  marketAnalysisHTML = `
                    <hr style="margin: 8px 0;">
                    
                    <div class="scx-panel-head" style="margin-bottom: 6px;">
                        <div class="scx-panel-title">${t("retailVsMarket")}</div>
                    </div>

                    <div style="margin-bottom: 6px; font-size: 11px;">
                        <div style="display:flex; justify-content:space-between;">
                            <span class="scx-k">${t("costOfGoods")}</span>
                            <span class="scx-v">${formatMoney(cogs)}</span>
                        </div>
                         <div style="display:flex; justify-content:space-between; font-size: 9px; color: #666;">
                            <span>${t("unitCostLabel")}: ${formatMoney(avgCost)}</span>
                        </div>
                    </div>
                    
                    <div style="background: ${isRetailBetter ? '#e8f5e9' : '#fff3e0'}; padding: 8px; border-radius: 4px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span class="scx-k">${t("marketNetProfit")}</span>
                            <span class="scx-v">${formatMoney(marketProfit)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-weight:600; color: ${isRetailBetter ? '#2e7d32' : '#e65100'};">
                            <span>${isRetailBetter ? t("retailWinsBy") : t("marketWinsBy")}</span>
                            <span>${formatMoney(Math.abs(diff))}</span>
                        </div>
                        <div style="margin-top:4px; font-size:9px; color:#666;">
                            ${t("basedOnCheapPrice")}: ${formatMoney(cheapest.price)}
                        </div>
                    </div>
                  `;
              } else {
                  // data loading (container or cheapest price missing)
                  marketAnalysisHTML = `
                    <hr style="margin: 8px 0;">
                    <div class="scx-muted">${t("loadingMarketPrices")}</div>
                  `;
              }
          } else if (ms && ms.status === 'error') {
               marketAnalysisHTML = `
                <hr style="margin: 8px 0;">
                <div class="scx-note" style="border-left-color: #c62828;">${t("marketError")}: ${escapeHtml(ms.error)}</div>
              `;
          } else {
              // Loading or Idle
              marketAnalysisHTML = `
                <hr style="margin: 8px 0;">
                <div class="scx-muted">${t("loadingMarketData")}</div>
              `;
          }
      }
  }

  // --- HTML Render ---

  let finePrint = "";
  if (metrics.hours > 1) {
      finePrint += `<div style="font-size:9px; color:#666; margin-top:2px;">${formatMoney(metrics.profitPerHr)} ${t("perHour")}</div>`;
  }
  if (metrics.hours > 24) {
      finePrint += `<div style="font-size:9px; color:#666;">${formatMoney(metrics.profitPerDay)} ${t("perDay")}</div>`;
  }

  contentEl.innerHTML = `
    <div class="scx-panel">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 600; color: #333; font-size: 12px;">
          ${productName}
        </div>
        <button class="scx-copy-btn" data-copy-action="retail" data-tooltip="Copy text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>
        </button>
      </div>

      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("profitPerMinute")}</div>
        <div class="scx-chip ${chip.cls}">${chip.label}</div>
      </div>

      <div class="scx-big" style="line-height:1.1;">
          ${isFinite(metrics.profitPerMin) ? `${formatMoney(metrics.profitPerMin)}${t("perMin")}` : "—"}
      </div>
      
      ${finePrint}

      ${marketAnalysisHTML}
    </div>
  `;

  // Wire up copy button
  const copyBtn = contentEl.querySelector('.scx-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = formatRetailAsText(renderers.getProductName(row), metrics, productId, realmId);
      copyToClipboard(text, copyBtn);
    });
  }
}

// Helpers needed in scope but not exported or previously defined in closure
function extractProductId(row) {
    const a = row?.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
    const href = a?.getAttribute("href") || "";
    const m = href.match(/\/resource\/(\d+)\//);
    return m ? Number(m[1]) : null;
}

