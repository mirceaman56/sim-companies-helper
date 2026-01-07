// retail_ui.js
import { STATE } from "./state.js";
import { formatMoney } from "./utils.js";
import { ensureMarketFetchForProduct, getCheapestListing } from "./market.js";
import { registerSection, getSectionContent, setSectionUpdateFn, expandSection } from "./sidebar.js";

const SECTION_ID = "retail-section";

function classifyProfitPerMin(ppm) {
  if (!Number.isFinite(ppm)) return { label: "N/A", cls: "scx-chip-na" };
  if (ppm < 0) return { label: "Bad", cls: "scx-chip-bad" };
  if (ppm >= 50) return { label: "Excellent", cls: "scx-chip-excellent" };
  if (ppm >= 20) return { label: "Good", cls: "scx-chip-good" };
  if (ppm >= 5) return { label: "Meh", cls: "scx-chip-meh" };
  return { label: "Low", cls: "scx-chip-meh" };
}

/**
 * Initialize retail helper section in the sidebar
 */
export function ensureSidebar() {
  if (!registerSection(SECTION_ID, "Retail Helper", "📦")) return;
  setSectionUpdateFn(SECTION_ID, updatePanel);
}

/**
 * ---------------------------
 * Retail UI parsing/adapters
 * ---------------------------
 */
export const RetailHelper = (() => {
  // ---------- parsing ----------
  function parseNumber(text) {
    const m = String(text).replace(/,/g, "").match(/-?\s*([0-9]+(\.[0-9]+)?)/);
    return m ? Number(m[1]) : NaN;
  }
  function parseMoney(text) {
    return parseNumber(text);
  }

  function findTextElement(root, includesText) {
    const els = root.querySelectorAll("div, span, p");
    for (const el of els) {
      if ((el.textContent || "").includes(includesText)) return el;
    }
    return null;
  }

  // supports: "12s", "8m", "1h 5m", "1d 5h", "1d, 8m", etc.
  function parseDurationToSeconds(text) {
    const s = String(text);
    let total = 0;
    const d = s.match(/(\d+)\s*d/i);
    const h = s.match(/(\d+)\s*h/i);
    const m = s.match(/(\d+)\s*m/i);
    const sec = s.match(/(\d+)\s*s/i);
    if (d) total += Number(d[1]) * 86400;
    if (h) total += Number(h[1]) * 3600;
    if (m) total += Number(m[1]) * 60;
    if (sec) total += Number(sec[1]);
    return total > 0 ? total : NaN;
  }

  function extractFinishSeconds(row) {
    const finishEl = findTextElement(row, "Finishes:");
    if (!finishEl) return NaN;

    const t = finishEl.textContent || "";
    const paren = t.match(/\(([^)]+)\)/);
    if (paren) return parseDurationToSeconds(paren[1]);

    return parseDurationToSeconds(t);
  }

  function extractProfitPerUnit(row) {
    const profitEl = findTextElement(row, "Profit per unit:");
    if (!profitEl) return NaN;

    const t = profitEl.textContent || "";
    const after =
      ((t.split("Profit per unit:")[1] || "").match(/-?\$?\d+(\.\d+)?/) || [])[0] || "";

    const val = parseMoney(after);
    if (!isFinite(val)) return NaN;

    // explicit minus formats
    const hasExplicitMinus =
      /-\s*\$/.test(after) ||
      /−\s*\$/.test(after) ||
      /^\s*-/.test(after) ||
      /^\s*−/.test(after) ||
      /\(\s*\$?\s*\d/.test(after);

    if (hasExplicitMinus) return -Math.abs(val);

    // implicit negative by red-ish text
    const color = getComputedStyle(profitEl).color;
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
    const profitPerHr = isFinite(totalProfit) && hours > 0 ? totalProfit / hours : NaN;

    return { totalProfit, profitPerMin, profitPerHr, seconds };
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
    const h3s = row.querySelectorAll("h3");
    for (const h of h3s) {
      const t = (h.textContent || "").trim();
      if (!t) continue;
      const tl = t.toLowerCase();
      if (tl === "quantity" || tl === "price") continue;
      return t;
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
        return { status: "Loading", stock: "—", cpu: "—", src: "—", basis: "—", note: "" };

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
          : inv.workers + inv.admin + inv.materials > 0
          ? "Produced"
          : "Unknown";

      const note = `Mix: market $${(inv.marketCost || 0).toFixed(2)} | produced $${(
        (inv.workers || 0) +
        (inv.admin || 0) +
        (inv.materials || 0)
      ).toFixed(2)}`;

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
        return { status: "Loading", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };
      }

      if (!ms || ms.status === "idle")
        return { status: "Idle", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

      if (ms.status === "loading")
        return { status: "Loading", cheapestPrice: "—", cheapestQty: "—", youVs: "—", note: "" };

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

  return { onFocusOrClick, autoSelectFirstRow, renderers };
})();

/**
 * Render the retail helper panel content
 */
export function updatePanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  const row = STATE.selectedRow;

  if (!row) {
    contentEl.innerHTML = `
      <div style="text-align: center; padding: 12px;">
        <div class="scx-muted">No item selected</div>
        <div class="scx-muted" style="font-size: 9px; margin-top: 4px;">Click Quantity or Price to show stats.</div>
      </div>
    `;
    return;
  }

  const renderers = RetailHelper.renderers;
  const productName = renderers.getProductName(row);

  // Profit area
  const metrics = renderers.getMetrics(row);
  const chip = classifyProfitPerMin(metrics.profitPerMin);

  // Inventory area
  const inv = renderers.getInventoryView(row);

  // Market area
  const mv = renderers.getMarketView(row, () => updatePanel());

  contentEl.innerHTML = `
    <div class="scx-panel">
      <div style="font-weight: 600; color: #333; margin-bottom: 8px; font-size: 12px;">
        ${productName}
      </div>

      <div class="scx-panel-head">
        <div class="scx-panel-title">Profit per minute</div>
        <div class="scx-chip ${chip.cls}">${chip.label}</div>
      </div>

      <div class="scx-big">${isFinite(metrics.profitPerMin) ? `${formatMoney(metrics.profitPerMin)}/min` : "—"}</div>

      <div class="scx-grid">
        <div>
          <div class="scx-k">Profit/hr</div>
          <div class="scx-v">${isFinite(metrics.profitPerHr) ? formatMoney(metrics.profitPerHr) : "—"}</div>
        </div>
        <div>
          <div class="scx-k">Net profit</div>
          <div class="scx-v">${isFinite(metrics.totalProfit) ? formatMoney(metrics.totalProfit) : "—"}</div>
        </div>
        <div>
          <div class="scx-k">Time</div>
          <div class="scx-v">${isFinite(metrics.seconds) ? Math.round(metrics.seconds) + "s" : "—"}</div>
        </div>
        <div>
          <div class="scx-k">Per unit</div>
          <div class="scx-v">${isFinite(metrics.profitPerUnit) ? formatMoney(metrics.profitPerUnit) : "—"}</div>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-head" style="margin-bottom: 6px;">
        <div class="scx-panel-title">Your cost</div>
        <div class="scx-chip scx-chip-na">${inv.status}</div>
      </div>

      <div class="scx-grid">
        <div>
          <div class="scx-k">Stock</div>
          <div class="scx-v">${inv.stock}</div>
        </div>
        <div>
          <div class="scx-k">Avg cost/unit</div>
          <div class="scx-v">${inv.cpu}</div>
        </div>
        <div>
          <div class="scx-k">Source</div>
          <div class="scx-v">${inv.src}</div>
        </div>
        <div>
          <div class="scx-k">Cost basis</div>
          <div class="scx-v">${inv.basis}</div>
        </div>
      </div>

      ${inv.note ? `<div class="scx-note">${inv.note}</div>` : ""}

      <hr style="margin: 8px 0;">

      <div class="scx-panel-head" style="margin-bottom: 6px;">
        <div class="scx-panel-title">Market</div>
        <div class="scx-chip scx-chip-na">${mv.status}</div>
      </div>

      <div class="scx-grid">
        <div>
          <div class="scx-k">Cheapest</div>
          <div class="scx-v">${mv.cheapestPrice}</div>
        </div>
        <div>
          <div class="scx-k">Qty</div>
          <div class="scx-v">${mv.cheapestQty}</div>
        </div>
        <div colspan="2">
          <div class="scx-k">You vs cheap</div>
          <div class="scx-v">${mv.youVs}</div>
        </div>
      </div>

      ${mv.note ? `<div class="scx-note">${mv.note}</div>` : ""}
    </div>
  `;
}

export function toggleSidebar() {
  const el = document.getElementById(SIDEBAR_ID);
  if (!el) return;

  const minimized = el.classList.toggle("scx-minimized");

  const btn = el.querySelector('[data-k="toggle"]');
  if (btn) btn.textContent = minimized ? "◂" : "▸";
}
