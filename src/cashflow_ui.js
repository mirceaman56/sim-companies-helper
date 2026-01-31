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

  const today = cf.todaySummary;
  const yesterday = cf.yesterdaySummary;

  // Calculate percentage changes
  const getPctChange = (curr, prev) => {
    if (!prev) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  const incomePct = getPctChange(today.totalIncome, yesterday.totalIncome);
  const expensePct = getPctChange(today.totalExpense, yesterday.totalExpense);
  const netProfit = today.totalIncome - today.totalExpense;
  const netProfitYesterday = yesterday.totalIncome - yesterday.totalExpense;
  const netProfitDiff = netProfit - netProfitYesterday;

  contentEl.innerHTML = `
    <div class="scx-panel">
      <!-- Net Profit Summary -->
      <div style="text-align:center; padding-bottom:12px; border-bottom:1px solid #eee; margin-bottom:12px;">
        <div class="scx-k">Today's Net Profit</div>
        <div style="font-size: 20px; font-weight: 700; color: ${netProfit >= 0 ? '#2e7d32' : '#c62828'};">
          ${formatMoney(netProfit)}
        </div>
        <div style="font-size: 10px; color:${netProfitDiff >= 0 ? '#2e7d32' : '#c62828'};">
          ${netProfitDiff >= 0 ? '+' : ''}${formatMoney(netProfitDiff)} vs yesterday
        </div>
      </div>

      <!-- Income Section -->
      <div style="margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div class="scx-panel-title">Incomes</div>
          <div style="font-size:10px; font-weight:600; color:${incomePct >= 0 ? '#2e7d32' : '#c62828'};">
             ${incomePct > 0 ? '+' : ''}${Math.round(incomePct)}%
          </div>
        </div>
        
        <div style="background:#f1f8e9; padding:8px; border-radius:4px;">
           <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:4px; border-bottom:1px solid #dcedc8; padding-bottom:4px;">
             <span>Total</span>
             <span>${formatMoney(today.totalIncome)}</span>
           </div>
           ${renderBreakdownRow("Retail", today.incomeByType.s, "#2e7d32")}
           ${renderBreakdownRow("Contracts", today.incomeByType.t, "#1565c0")}
           ${renderBreakdownRow("Market", today.incomeByType.m, "#ef6c00")}
           ${today.incomeByType.other > 0 ? renderBreakdownRow("Other", today.incomeByType.other, "#666") : ''}
        </div>
      </div>

      <!-- Expense Section -->
      <div style="margin-bottom: 12px;">
         <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div class="scx-panel-title">Expenses</div>
          <div style="font-size:10px; font-weight:600; color:${expensePct <= 0 ? '#2e7d32' : '#c62828'};">
             ${expensePct > 0 ? '+' : ''}${Math.round(expensePct)}%
          </div>
        </div>

        <div style="background:#ffebee; padding:8px; border-radius:4px;">
           <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:4px; border-bottom:1px solid #ffcdd2; padding-bottom:4px;">
             <span>Total</span>
             <span>${formatMoney(today.totalExpense)}</span>
           </div>
           ${renderBreakdownRow("Production", today.expenseByType.p, "#c62828")}
           ${renderBreakdownRow("Wages", today.expenseByType.w, "#d32f2f")}
           ${renderBreakdownRow("Market Buy", today.expenseByType.m, "#c2185b")}
           ${renderBreakdownRow("Contracts", today.expenseByType.t, "#7b1fa2")}
           ${renderBreakdownRow("Fees", today.expenseByType.f, "#5d4037")}
           ${renderBreakdownRow("Construction", today.expenseByType.c, "#e64a19")}
           ${renderBreakdownRow("Accounting", today.expenseByType.A, "#455a64")}
           ${today.expenseByType.other > 0 ? renderBreakdownRow("Other", today.expenseByType.other, "#666") : ''}
        </div>
      </div>

      <!-- Transactions Link -->
      <div style="text-align:center; margin-top:12px;">
         <div class="scx-muted" style="font-size: 9px;">Latest: ${formatRefreshTime(cf.lastRefreshAt)}</div>
      </div>
    </div>
  `;
}

function renderBreakdownRow(label, amount, color) {
  if (!amount || amount <= 0) return '';
  return `
    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:2px;">
      <span style="color:#555;">${label}</span>
      <span style="font-weight:500; color:${color};">${formatMoney(amount)}</span>
    </div>
  `;
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
