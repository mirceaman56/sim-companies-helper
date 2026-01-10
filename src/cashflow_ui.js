// cashflow_ui.js
import { STATE } from "./state.js";
import { formatMoney } from "./utils.js";
import { getSectionContent } from "./sidebar.js";

const SECTION_ID = "cashflow-section";

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

  if (!cf.loaded || (!cf.todayItems?.length && !cf.yesterdayItems?.length)) {
    contentEl.innerHTML = `<div class="scx-muted">No cashflow data available</div>`;
    return;
  }

  const today = cf.todaySummary || { salesCount: 0, salesMoney: 0 };
  const yesterday = cf.yesterdaySummary || { salesCount: 0, salesMoney: 0 };

  const diff = today.salesMoney - yesterday.salesMoney;
  const diffColor = diff >= 0 ? "#2e7d32" : "#c62828";
  const diffSign = diff >= 0 ? "+" : "";

  const avgPerTransaction =
    today.salesCount > 0 ? today.salesMoney / today.salesCount : 0;

  contentEl.innerHTML = `
    <div class="scx-panel">
      <div class="scx-panel-head">
        <div class="scx-panel-title">Today's Sales Summary</div>
      </div>

      <div style="font-size: 18px; font-weight: 700; color: #2e7d32;">
        ${formatMoney(today.salesMoney)}
      </div>

      <div style="font-size: 11px; margin-top: 2px; color: ${diffColor}; font-weight: 600;">
        ${diffSign}${formatMoney(diff)} vs yesterday
      </div>

      <div class="scx-grid" style="margin-top: 6px;">
        <div>
          <div class="scx-k">Transactions</div>
          <div class="scx-v">${today.salesCount}</div>
        </div>
        <div>
          <div class="scx-k">Avg per TX</div>
          <div class="scx-v">${formatMoney(avgPerTransaction)}</div>
        </div>
      </div>

      <hr style="margin: 8px 0;">

      <div class="scx-panel-title" style="margin-bottom: 8px;">Recent Transactions</div>
      <div style="max-height: 200px; overflow-y: auto; font-size: 10px;">
        ${renderCashflowItems(cf.todayItems)}
      </div>

      <div class="scx-muted" style="margin-top: 8px;">
        Last updated: ${formatRefreshTime(cf.lastRefreshAt)}
      </div>
    </div>
  `;
}

function renderCashflowItems(items) {
  if (!items || items.length === 0) {
    return `<div class="scx-muted">No transactions</div>`;
  }

  return items
    .slice(0, 10)
    .map((item) => {
      const money = Number(item.money || 0);
      const category = item.category || "?";
      const desc = item.description || "Transaction";
      const time = formatTimeOnly(item.datetime);

      const categoryLabel =
        category === "s" ? "Sale" :
        category === "b" ? "Buy" :
        category === "w" ? "Wages" :
        "Other";

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

function formatRefreshTime(ms) {
  if (!ms) return "never";
  const ago = Math.floor((Date.now() - ms) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
}
