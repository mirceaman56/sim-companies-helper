// ui.js
import { SIDEBAR_ID, STATE } from "./state.js";
import { getCheapestListing } from "./market.js";

/** Put your existing formatting/parsing utils here or import from a utils.js later */
function formatMoney(x) {
  if (!isFinite(x)) return "—";
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function classifyProfitPerMin(ppm) {
  if (!Number.isFinite(ppm)) return { label: "N/A", cls: "scx-chip-na" };
  if (ppm < 0) return { label: "Bad", cls: "scx-chip-bad" };
  if (ppm >= 50) return { label: "Excellent", cls: "scx-chip-excellent" };
  if (ppm >= 20) return { label: "Good", cls: "scx-chip-good" };
  if (ppm >= 5) return { label: "Meh", cls: "scx-chip-meh" };
  return { label: "Low", cls: "scx-chip-meh" };
}


export function toggleSidebar() {
  const el = document.getElementById(SIDEBAR_ID);
  if (!el) return;

  const minimized = el.classList.toggle("scx-minimized");

  const btn = el.querySelector('[data-k="toggle"]');
  if (btn) btn.textContent = minimized ? "◂" : "▸";
}

export function ensureSidebar() {
  let el = document.getElementById(SIDEBAR_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = SIDEBAR_ID;
  el.className = "scx-sidebar";
  el.innerHTML = `
    <div class="scx-sidebar-header">
      <div class="scx-sidebar-title" data-k="title">Retail Helper</div>
      <button class="scx-toggle" data-k="toggle" title="Minimize">▸</button>
    </div>

    <div class="scx-selected">
      <div class="scx-selected-name"><span data-k="name">No item selected</span></div>
      <div class="scx-muted" data-k="hint">Click Quantity or Price to show stats.</div>
    </div>

    <div class="scx-panel">
      <div class="scx-panel-head">
        <div class="scx-panel-title">Profit per minute</div>
        <div class="scx-chip scx-chip-na" data-k="chip">N/A</div>
      </div>

      <div class="scx-big" data-k="big">—</div>

      <div class="scx-grid">
        <div class="scx-k">Profit/hr</div><div class="scx-v" data-k="phr">—</div>
        <div class="scx-k">Net profit</div><div class="scx-v" data-k="profit">—</div>
        <div class="scx-k">Time</div><div class="scx-v" data-k="time">—</div>
        <div class="scx-k">Per unit</div><div class="scx-v" data-k="ppu">—</div>
      </div>

      <div class="scx-note" data-k="note"></div>

      <hr style="margin:10px 0; opacity:.25">

      <div class="scx-panel-head" style="margin-bottom:6px;">
        <div class="scx-panel-title">Your cost</div>
        <div class="scx-chip scx-chip-na" data-k="inv_status">Idle</div>
      </div>

      <div class="scx-grid">
        <div class="scx-k">Stock</div><div class="scx-v" data-k="inv_stock">—</div>
        <div class="scx-k">Avg cost/unit</div><div class="scx-v" data-k="inv_cpu">—</div>
        <div class="scx-k">Source</div><div class="scx-v" data-k="inv_src">—</div>
        <div class="scx-k">Cost basis</div><div class="scx-v" data-k="inv_basis">—</div>
      </div>

      <div class="scx-note" data-k="inv_note"></div>

      <hr style="margin:10px 0; opacity:.25">

      <div class="scx-panel-head" style="margin-bottom:6px;">
        <div class="scx-panel-title">Market</div>
        <div class="scx-chip scx-chip-na" data-k="m_status">Idle</div>
      </div>

      <div class="scx-grid">
        <div class="scx-k">Cheapest</div><div class="scx-v" data-k="m_best">—</div>
        <div class="scx-k">Qty</div><div class="scx-v" data-k="m_qty">—</div>
        <div class="scx-k">You vs cheap</div><div class="scx-v" data-k="m_vs">—</div>
      </div>

      <div class="scx-note" data-k="m_note"></div>
    </div>
  `;

  document.documentElement.appendChild(el);
  el.querySelector('[data-k="toggle"]')?.addEventListener("click", toggleSidebar);

  return el;
}

export function updatePanel(renderers) {
  // renderers is injected from content.js (retail helper knows how to extract values from row)
  // renderers should provide:
  // - getProductName(row)
  // - getMetrics(row) -> { profitPerMin, profitPerHr, totalProfit, seconds, profitPerUnit, qty, yourPrice }
  // - getInventoryView(row) -> { status, stock, cpu, src, basis, note }
  // - getMarketView(row) -> { status, cheapestPrice, cheapestQty, youVs, note }

  const sidebar = ensureSidebar();
  const row = STATE.selectedRow;

  const $ = (sel) => sidebar.querySelector(sel);

  const nameEl = $('[data-k="name"]');
  const hintEl = $('[data-k="hint"]');

  if (!row) {
    nameEl.textContent = "No item selected";
    hintEl.textContent = "Click Quantity or Price to show stats.";
    return;
  }

  nameEl.textContent = renderers.getProductName(row);
  hintEl.textContent = "Retail Helper";

  // Profit area
  const metrics = renderers.getMetrics(row);
  // Chip
  const chip = classifyProfitPerMin(metrics.profitPerMin);
  const chipEl = $('[data-k="chip"]');
  chipEl.textContent = chip.label;
  chipEl.className = `scx-chip ${chip.cls}`;

  $('[data-k="big"]').textContent = isFinite(metrics.profitPerMin) ? `${formatMoney(metrics.profitPerMin)}/min` : "—";
  $('[data-k="phr"]').textContent = isFinite(metrics.profitPerHr) ? `${formatMoney(metrics.profitPerHr)}/hr` : "—";
  $('[data-k="profit"]').textContent = isFinite(metrics.totalProfit) ? formatMoney(metrics.totalProfit) : "—";
  $('[data-k="time"]').textContent = isFinite(metrics.seconds) ? `${Math.round(metrics.seconds)}s` : "—";
  $('[data-k="ppu"]').textContent = isFinite(metrics.profitPerUnit) ? formatMoney(metrics.profitPerUnit) : "—";

  // Inventory area
  const inv = renderers.getInventoryView(row);
  $('[data-k="inv_status"]').textContent = inv.status;
  $('[data-k="inv_stock"]').textContent = inv.stock;
  $('[data-k="inv_cpu"]').textContent = inv.cpu;
  $('[data-k="inv_src"]').textContent = inv.src;
  $('[data-k="inv_basis"]').textContent = inv.basis;
  $('[data-k="inv_note"]').textContent = inv.note || "";

  // Market area
  const mv = renderers.getMarketView(row);
  $('[data-k="m_status"]').textContent = mv.status;
  $('[data-k="m_best"]').textContent = mv.cheapestPrice;
  $('[data-k="m_qty"]').textContent = mv.cheapestQty;
  $('[data-k="m_vs"]').textContent = mv.youVs;
  $('[data-k="m_note"]').textContent = mv.note || "";
}
