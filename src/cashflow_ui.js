// cashflow_ui.js
// Renders cashflow section in the sidebar
import { STATE } from "./state.js";
import { formatMoney } from "./utils.js";
import { getSectionContent } from "./sidebar.js";

const SECTION_ID = "cashflow-section";

/**
 * Render cashflow section content
 */
export function updateCashflowPanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  const cf = STATE.cashflow;

  if (cf.loading) {
    contentEl.innerHTML = `<div class="scx-muted">Loading cashflow data...</div>`;
    return;
  }

  if (cf.error) {
    contentEl.innerHTML = `
      <div class="scx-note" style="border-left-color: #c62828; color: #c62828;">
        Error: ${cf.error}
      </div>
    `;
    return;
  }

  if (!cf.loaded || cf.items.length === 0) {
    contentEl.innerHTML = `<div class="scx-muted">No cashflow data available</div>`;
    return;
  }

  const summary = cf.summary || { salesCount: 0, salesMoney: 0 };

  // Calculate average per transaction
  const avgPerTransaction = summary.salesCount > 0 ? summary.salesMoney / summary.salesCount : 0;

  contentEl.innerHTML = `
    <div class="scx-panel">
      <div class="scx-panel-head">
        <div class="scx-panel-title">Today's Sales Summary</div>
      </div>

      <div style="font-size: 18px; font-weight: 700; color: #2e7d32;">
        ${formatMoney(summary.salesMoney)}
      </div>

      <div class="scx-grid">
        <div>
          <div class="scx-k">Transactions</div>
          <div class="scx-v">${summary.salesCount}</div>
        </div>
        <div>
          <div class="scx-k">Avg per TX</div>
          <div class="scx-v">${formatMoney(avgPerTransaction)}</div>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-title" style="margin-bottom: 8px;">Recent Transactions</div>
      <div style="max-height: 200px; overflow-y: auto; font-size: 10px;">
        ${renderCashflowItems(cf.items)}
      </div>

      <div class="scx-muted" style="margin-top: 8px;">
        Last updated: ${formatRefreshTime(cf.lastRefreshAt)}
      </div>
    </div>
  `;
}

/**
 * Render individual cashflow items
 */
function renderCashflowItems(items) {
  if (!items || items.length === 0) {
    return `<div class="scx-muted">No transactions</div>`;
  }

  return items
    .slice(0, 10) // Show last 10
    .map((item) => {
      const money = Number(item.money || 0);
      const category = item.category || "?";
      const desc = item.description || "Transaction";
      const time = formatTimeOnly(item.datetime);

      const categoryLabel =
        category === "s" ? "Sale" : category === "b" ? "Buy" : category === "w" ? "Wages" : "Other";

      return `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid #f0f0f0;
          gap: 8px;
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="color: #666; font-weight: 500;">${categoryLabel}</div>
            <div style="color: #999; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${desc}
            </div>
          </div>
          <div style="
            text-align: right;
            white-space: nowrap;
            color: ${money >= 0 ? "#2e7d32" : "#c62828"};
            font-weight: 600;
          ">
            ${money >= 0 ? "+" : ""}${formatMoney(money)}
          </div>
          <div style="color: #999; font-size: 9px; min-width: 40px; text-align: right;">
            ${time}
          </div>
        </div>
      `;
    })
    .join("");
}

/**
 * Format time portion of datetime string
 */
function formatTimeOnly(dtStr) {
  try {
    const date = new Date(dtStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

/**
 * Format the last refresh time
 */
function formatRefreshTime(ms) {
  if (!ms) return "never";
  const ago = Math.floor((Date.now() - ms) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
}
