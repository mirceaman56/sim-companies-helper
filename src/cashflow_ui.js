// cashflow_ui.js
import { STATE } from "./state.js";
import { formatMoney, escapeHtml, COPY_BUTTON_SVG, wireCopyButton } from "./utils.js";
import { getSectionContent } from "./sidebar.js";
import { t } from "./i18n.js";

const SECTION_ID = "cashflow-section";

/**
 * Format cashflow data as plain text table
 */
function formatCashflowAsText(today, yesterday) {
  const lines = [
    `Today's Net Profit: ${formatMoney(today.totalIncome - today.totalExpense)}`,
    `vs Yesterday: ${formatMoney(today.totalIncome - today.totalExpense - (yesterday.totalIncome - yesterday.totalExpense))}`,
    ``,
    `INCOMES:`,
    `  Retail: ${formatMoney(today.incomeByType.s)}`,
    `  Contracts: ${formatMoney(today.incomeByType.t)}`,
    `  Market: ${formatMoney(today.incomeByType.m)}`,
    `  Other: ${formatMoney(today.incomeByType.other)}`,
    `  Total: ${formatMoney(today.totalIncome)}`,
    ``,
    `EXPENSES:`,
    `  Production: ${formatMoney(today.expenseByType.p)}`,
    `  Wages: ${formatMoney(today.expenseByType.w)}`,
    `  Market Buy: ${formatMoney(today.expenseByType.m)}`,
    `  Contracts: ${formatMoney(today.expenseByType.t)}`,
    `  Fees: ${formatMoney(today.expenseByType.f)}`,
    `  Construction: ${formatMoney(today.expenseByType.c)}`,
    `  Accounting: ${formatMoney(today.expenseByType.A)}`,
    `  Other: ${formatMoney(today.expenseByType.other)}`,
    `  Total: ${formatMoney(today.totalExpense)}`,
  ];
  return lines.join("\n");
}

export function updateCashflowPanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  const cf = STATE.cashflow;

  if (cf.loading) {
    contentEl.innerHTML = `<div class="scx-muted">${t("loadingCashflow")}</div>`;
    return;
  }

  if (cf.error) {
    contentEl.innerHTML = `
      <div class="scx-note" style="border-left-color: var(--scx-color-error); color: var(--scx-color-error);">
        Error: ${escapeHtml(cf.error)}
      </div>
    `;
    return;
  }

  if (!cf.loaded || (!cf.todayItems?.length && !cf.yesterdayItems?.length)) {
    contentEl.innerHTML = `<div class="scx-muted">${t("noCashflowData")}</div>`;
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
      <div class="scx-panel-head" style="margin-bottom: 12px;">
        <div class="scx-panel-title">${t("todaysNetProfit")}</div>
        <button class="scx-copy-btn" data-copy-action="cashflow" data-tooltip="${t("copyText")}">
          ${COPY_BUTTON_SVG}
        </button>
      </div>
      
      <!-- Net Profit Summary -->
      <div style="text-align:center; padding-bottom:12px; border-bottom:var(--scx-border-light-alt); margin-bottom:12px;">
        <div class="scx-k">${t("todaysNetProfit")}</div>
        <div class="scx-cf-net" style="color: ${netProfit >= 0 ? "var(--scx-color-success)" : "var(--scx-color-error)"}">
          ${formatMoney(netProfit)}
        </div>
        <div class="scx-font-9" style="color:${netProfitDiff >= 0 ? "var(--scx-color-success)" : "var(--scx-color-error)"}">
          ${netProfitDiff >= 0 ? "+" : ""}${formatMoney(netProfitDiff)} ${t("vsYesterday")}
        </div>
      </div>

      <!-- Income Section -->
      <div style="margin-bottom: 16px;">
        <div class="scx-panel-head">
          <div class="scx-panel-title">${t("incomes")}</div>
          <div class="scx-font-9 scx-text-semibold" style="color:${incomePct >= 0 ? "var(--scx-color-success)" : "var(--scx-color-error)"}">
             ${incomePct > 0 ? "+" : ""}${Math.round(incomePct)}%
          </div>
        </div>
        
        <div class="scx-cf-block scx-cf-income">
          <div class="scx-cf-block-total">
            <span>${t("total")}</span>
            <span>${formatMoney(today.totalIncome)}</span>
          </div>
           ${renderBreakdownRow(t("retail"), today.incomeByType.s, "var(--scx-category-retail)")}
           ${renderBreakdownRow(t("contracts"), today.incomeByType.t, "var(--scx-category-contracts)")}
           ${renderBreakdownRow(t("marketLabel"), today.incomeByType.m, "var(--scx-category-market)")}
           ${today.incomeByType.other > 0 ? renderBreakdownRow(t("other"), today.incomeByType.other, "var(--scx-category-other)") : ""}
        </div>
      </div>

      <!-- Expense Section -->
      <div style="margin-bottom: 12px;">
        <div class="scx-panel-head">
          <div class="scx-panel-title">${t("expenses")}</div>
          <div class="scx-font-9 scx-text-semibold" style="color:${expensePct <= 0 ? "var(--scx-color-success)" : "var(--scx-color-error)"}">
             ${expensePct > 0 ? "+" : ""}${Math.round(expensePct)}%
          </div>
        </div>

        <div class="scx-cf-block scx-cf-expense">
          <div class="scx-cf-block-total">
            <span>${t("total")}</span>
            <span>${formatMoney(today.totalExpense)}</span>
          </div>
           ${renderBreakdownRow(t("production"), today.expenseByType.p, "var(--scx-category-production)")}
           ${renderBreakdownRow(t("wages"), today.expenseByType.w, "var(--scx-category-wages)")}
           ${renderBreakdownRow(t("marketBuy"), today.expenseByType.m, "var(--scx-category-market-buy)")}
           ${renderBreakdownRow(t("contracts"), today.expenseByType.t, "var(--scx-category-contract-exp)")}
           ${renderBreakdownRow(t("fees"), today.expenseByType.f, "var(--scx-category-fees)")}
           ${renderBreakdownRow(t("construction"), today.expenseByType.c, "var(--scx-category-construction)")}
           ${renderBreakdownRow(t("accounting"), today.expenseByType.A, "var(--scx-category-accounting)")}
           ${today.expenseByType.other > 0 ? renderBreakdownRow(t("other"), today.expenseByType.other, "var(--scx-category-other)") : ""}
        </div>
      </div>

      <!-- Transactions Link -->
      <div style="text-align:center; margin-top:12px;">
         <div class="scx-text-muted scx-font-9">${t("latest")}: ${formatRefreshTime(cf.lastRefreshAt)}</div>
      </div>
    </div>
  `;

  // Wire up copy button
  wireCopyButton(contentEl, () => formatCashflowAsText(today, yesterday));
}

function renderBreakdownRow(label, amount, color) {
  if (!amount || amount <= 0) return "";
  return `
    <div class="scx-cf-row">
      <span class="scx-text-muted">${label}</span>
      <span class="scx-cf-row-value" style="color:${color};">${formatMoney(amount)}</span>
    </div>
  `;
}

function formatRefreshTime(ms) {
  if (!ms) return t("never");
  const ago = Math.floor((Date.now() - ms) / 1000);
  if (ago < 60) return `${ago}${t("sAgo")}`;
  if (ago < 3600) return `${Math.floor(ago / 60)}${t("mAgo")}`;
  return `${Math.floor(ago / 3600)}${t("hAgo")}`;
}

// Export test utilities
export const _testUtils = { formatCashflowAsText, renderBreakdownRow, formatRefreshTime };
