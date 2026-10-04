// Stateless HTML renderers for the Financials panel sections (KPIs, P&L, cash, balance sheet,
// ratios, drivers, sales mix, inventory, workforce, transaction table).
import { formatMoney, escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import {
  alertMessage,
  formatPct,
  formatRatio,
  metricLabel,
  metricTooltip,
  ratioLabel,
  ratioTooltip,
  severityLabel,
  severityClass,
  deltaClass,
  formatMetricValue,
  formatMetricDelta,
  formatNumberValue,
} from "./cashflow_format.js";

export function renderKpiStrip(kpis) {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return `<div class="scx-muted">${t("noCashflowData")}</div>`;
  }

  return `
    <div class="scx-fin-kpi-strip">
      ${kpis
        .map((metric) => {
          const exactness =
            metric.exactness === "exact"
              ? t("financeExact")
              : metric.exactness === "estimated"
                ? t("financeEstimated")
                : t("financeDerived");

          return `
            <button type="button"
              class="scx-fin-kpi-card"
              data-fin-drill="kpi:${metric.id}"
              title="${escapeHtml(metricTooltip(metric.id))}">
              <div class="scx-fin-kpi-title">${escapeHtml(metricLabel(metric.id))}</div>
              <div class="scx-fin-kpi-value">${escapeHtml(formatMetricValue(metric))}</div>
              <div class="scx-fin-kpi-delta ${deltaClass(metric.delta)}">${escapeHtml(formatMetricDelta(metric))}</div>
              <div class="scx-fin-kpi-tag">${escapeHtml(exactness)}</div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

export function renderAlerts(alerts, compact = false) {
  const rows = Array.isArray(alerts) ? alerts : [];
  if (rows.length === 0) {
    return `<div class="scx-fin-empty">${t("financeNoAlerts")}</div>`;
  }

  const subset = compact ? rows.slice(0, 2) : rows;

  return `
    <div class="scx-fin-alert-list">
      ${subset
        .map(
          (a) => `
            <div class="scx-alert-card ${severityClass(a.severity)}">
              <span class="scx-fin-alert-severity">${escapeHtml(severityLabel(a.severity))}</span>
              <span class="scx-fin-alert-message">${escapeHtml(alertMessage(a.id))}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

export function renderPnl(derived) {
  const pnl = derived?.pnl;
  if (!pnl) return "";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionPnl")}</div>
      </div>
      <div class="scx-fin-waterfall">
        ${renderWaterfallRow(t("financeKpiRevenue"), pnl.revenue)}
        ${renderWaterfallRow(t("financePnlDirectCosts"), pnl.directCosts, true)}
        ${renderWaterfallRow(t("financeKpiGrossProfit"), pnl.grossProfit)}
        ${renderWaterfallRow(t("financePnlOverhead"), pnl.overhead, true)}
        ${renderWaterfallRow(t("financeKpiOperatingProfit"), pnl.operatingProfit)}
        ${renderWaterfallRow(t("financePnlNonOperating"), pnl.nonOperating)}
        ${renderWaterfallRow(t("financeKpiNetProfit"), pnl.netProfit)}
      </div>
      <div class="scx-fin-pnl-breakdown">
        <div>
          <div class="scx-fin-subhead">${t("financeSalesChannels")}</div>
          ${renderSmallPair(t("retail"), pnl.revenueByChannel?.retail)}
          ${renderSmallPair(t("contracts"), pnl.revenueByChannel?.contracts)}
          ${renderSmallPair(t("marketLabel"), pnl.revenueByChannel?.market)}
          ${renderSmallPair(t("other"), pnl.revenueByChannel?.other)}
        </div>
        <div>
          <div class="scx-fin-subhead">${t("financeCostBuckets")}</div>
          ${renderSmallPair(t("production"), pnl.expensesByBucket?.production)}
          ${renderSmallPair(t("marketBuy"), pnl.expensesByBucket?.marketBuy)}
          ${renderSmallPair(t("financeInboundContracts"), pnl.expensesByBucket?.inboundContracts)}
          ${renderSmallPair(t("wages"), pnl.expensesByBucket?.wages)}
          ${renderSmallPair(t("fees"), pnl.expensesByBucket?.fees)}
        </div>
      </div>
    </div>
  `;
}

function renderWaterfallRow(label, metric, forceNegative = false) {
  const curr = Number(metric?.current || 0);
  const shown = forceNegative ? -Math.abs(curr) : curr;
  const delta = Number(metric?.delta || 0);

  return `
    <div class="scx-fin-waterfall-row">
      <span class="scx-fin-waterfall-label">${escapeHtml(label)}</span>
      <div class="scx-fin-waterfall-metrics">
        <span class="scx-fin-waterfall-value">${formatMoney(shown)}</span>
        <span class="scx-fin-waterfall-delta ${deltaClass(delta)}">${escapeHtml(formatMetricDelta(metric || {}))}</span>
      </div>
    </div>
  `;
}

function renderSmallPair(label, value, format = "money") {
  const shown =
    format === "number" ? formatNumberValue(value) : Number.isFinite(value) ? formatMoney(value) : "—";

  return `
    <div class="scx-fin-mini-row">
      <span class="scx-text-muted">${escapeHtml(label)}</span>
      <span class="scx-fin-mini-value">${shown}</span>
    </div>
  `;
}

export function renderCashMovement(derived) {
  const cm = derived?.cashMovement;
  if (!cm) return "";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionCashMovement")}</div>
      </div>
      <div class="scx-fin-cash-layout">
        <div class="scx-fin-waterfall">
          ${renderWaterfallRow(t("financeInflows"), cm.inflows)}
          ${renderWaterfallRow(t("financeOutflows"), cm.outflows, true)}
          ${renderWaterfallRow(t("financeKpiCashChange"), cm.netChange)}
        </div>
        <div class="scx-fin-cash-balances">
          <div class="scx-fin-mini-row">
            <span class="scx-text-muted">${t("financeOpeningCash")}</span>
            <span class="scx-fin-mini-value">${Number.isFinite(cm.openingCash) ? formatMoney(cm.openingCash) : "—"}</span>
          </div>
          <div class="scx-fin-mini-row">
            <span class="scx-text-muted">${t("financeClosingCash")}</span>
            <span class="scx-fin-mini-value">${Number.isFinite(cm.closingCash) ? formatMoney(cm.closingCash) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderBalanceSheet(derived) {
  const bs = derived?.balanceSheet;
  if (!bs?.latest) {
    return `
      <div class="scx-panel scx-fin-section-card">
        <div class="scx-panel-head">
          <div class="scx-panel-title">${t("financeSectionBalanceSheet")}</div>
        </div>
        <div class="scx-fin-empty">${t("financeNoBalanceData")}</div>
      </div>
    `;
  }

  const latest = bs.latest;

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionBalanceSheet")}</div>
        <span class="scx-chip">${escapeHtml(String(latest?.date || "").slice(0, 10))}</span>
      </div>
      <div class="scx-fin-grid-2">
        ${renderSmallPair(t("financeTotalAssets"), Number(latest.currentAssets || 0) + Number(latest.nonCurrentAssets || 0))}
        ${renderSmallPair(t("financeTotalEquity"), Number(latest.total || 0))}
        ${renderSmallPair(t("financeCurrentAssets"), Number(latest.currentAssets || 0))}
        ${renderSmallPair(t("financeNonCurrentAssets"), Number(latest.nonCurrentAssets || 0))}
        ${renderSmallPair(t("financeCashReceivables"), Number(latest.cashAndReceivables || 0))}
        ${renderSmallPair(t("financeKpiInventory"), Number(latest.inventory || 0))}
        ${renderSmallPair(t("financeLiabilities"), Math.abs(Number(latest.liabilities || 0)))}
        ${renderSmallPair(t("financeBuildings"), Number(latest.buildings || 0))}
        ${renderSmallPair(t("financePatents"), Number(latest.patents || 0))}
        ${renderSmallPair(t("financeRank"), Number(latest.rank || 0), "number")}
      </div>
    </div>
  `;
}

export function renderRatios(derived) {
  const ratios = Array.isArray(derived?.ratios) ? derived.ratios : [];

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionRatios")}</div>
      </div>
      <div class="scx-fin-grid-2">
        ${ratios
          .map(
            (r) => `
              <div class="scx-fin-ratio" title="${escapeHtml(ratioTooltip(r.id))}">
                <div class="scx-fin-ratio-label">${escapeHtml(ratioLabel(r.id))}</div>
                <div class="scx-fin-ratio-value">${r.id.includes("Margin") ? formatPct(r.value) : formatRatio(r.value)}</div>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderDrivers(derived) {
  const d = derived?.drivers;
  if (!d) return "";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionDrivers")}</div>
      </div>
      <div class="scx-fin-drivers-stack">
        <div class="scx-fin-driver-group">
          <div class="scx-fin-subhead">${t("financeTopIncomeDrivers")}</div>
          ${(d.income || []).map((x) => renderDriverButton(x, "income")).join("") || `<div class="scx-fin-empty">${t("financeNoData")}</div>`}
        </div>
        <div class="scx-fin-driver-group">
          <div class="scx-fin-subhead">${t("financeTopExpenseDrivers")}</div>
          ${(d.expenses || []).map((x) => renderDriverButton(x, "expense")).join("") || `<div class="scx-fin-empty">${t("financeNoData")}</div>`}
        </div>
      </div>
      <div class="scx-fin-subhead scx-margin-top-4">${t("financeLargestChanges")}</div>
      <div class="scx-fin-change-list">
        ${(d.changes || [])
          .map(
            (c) => `
              <div class="scx-fin-change-row">
                <span class="scx-fin-change-label">${escapeHtml(c.label)}</span>
                <span class="scx-fin-change-value ${deltaClass(c.delta)}">${formatMoney(c.delta)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderDriverButton(driver, type) {
  const amount = type === "income" ? driver.income : driver.expense;
  return `
    <button type="button" class="scx-fin-driver-row" data-fin-drill="driver:${escapeHtml(driver.key)}">
      <span class="scx-fin-driver-label">${escapeHtml(driver.label)}</span>
      <span class="scx-fin-driver-value">${formatMoney(amount)}</span>
    </button>
  `;
}

export function renderSalesMix(derived) {
  const rows = Array.isArray(derived?.salesMix) ? derived.salesMix : [];
  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionSalesMix")}</div>
      </div>
      <div class="scx-fin-mix-list">
        ${
          rows
            .map(
              (row) => `
              <div class="scx-fin-mix-row">
                <span class="scx-fin-mix-name">${escapeHtml(row.name)}</span>
                <span class="scx-fin-mix-share">${formatPct(row.share, 1)}</span>
                <span class="scx-fin-mix-value">${formatMoney(row.revenue)}</span>
              </div>
            `,
            )
            .join("") || `<div class="scx-fin-empty">${t("financeNoData")}</div>`
        }
      </div>
    </div>
  `;
}

export function renderInventoryProduction(derived) {
  const ip = derived?.inventoryProduction;
  if (!ip) return "";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionInventoryProduction")}</div>
      </div>
      <div class="scx-fin-grid-2">
        ${renderSmallPair(t("financeKpiInventory"), ip.inventoryValue)}
        ${renderSmallPair(t("financeProductionSpend"), ip.productionSpend)}
        ${renderSmallPair(t("financeProductionVolume"), ip.productionVolume, "number")}
        ${renderSmallPair(t("financeProductionRuns"), ip.productionTxCount, "number")}
        ${renderSmallPair(t("financeOutgoingContracts"), ip.outgoingContractsCount, "number")}
        ${renderSmallPair(t("financeOutgoingContractsValue"), ip.outgoingContractsValue)}
      </div>
    </div>
  `;
}

export function renderWorkforce(derived) {
  const wf = derived?.workforce;
  if (!wf) return "";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionWorkforce")}</div>
      </div>
      <div class="scx-fin-grid-2">
        ${renderSmallPair(t("wages"), wf.wages)}
        ${renderSmallPair(t("financeTraining"), wf.training)}
        ${renderSmallPair(t("accounting"), wf.accounting)}
        ${renderSmallPair(t("financeLeadershipCost"), wf.leadership)}
        ${renderSmallPair(t("financeTotalWorkforce"), wf.total)}
        ${renderSmallPair(t("delta"), wf.totalDelta)}
      </div>
    </div>
  `;
}

export function renderTransactionTable(rows, compact) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return `<div class="scx-fin-empty">${t("financeNoTransactions")}</div>`;
  }

  return `
    <div class="scx-fin-tx-table-wrap ${compact ? "scx-fin-tx-table-wrap-compact" : ""}">
      <table class="scx-fin-tx-table">
        <thead>
          <tr>
            <th>${t("financeTxTime")}</th>
            <th>${t("financeTxType")}</th>
            <th>${t("financeTxDescription")}</th>
            <th class="scx-text-right">${t("financeTxAmount")}</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((tx) => {
              const money = Number(tx?.money || 0);
              const cls = money >= 0 ? "scx-fin-pos" : "scx-fin-neg";
              const dt = Number.isFinite(tx?._dtMs) ? new Date(tx._dtMs) : null;
              const timeStr = dt ? dt.toLocaleString() : "—";
              return `
                <tr>
                  <td>${escapeHtml(timeStr)}</td>
                  <td>${escapeHtml(String(tx?.category || ""))}</td>
                  <td>${escapeHtml(String(tx?.description || tx?.descriptionKey || ""))}</td>
                  <td class="scx-text-right scx-mono ${cls}">${formatMoney(money)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
