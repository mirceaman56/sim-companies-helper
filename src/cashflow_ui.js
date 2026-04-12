// cashflow_ui.js
import { loadFinanceData, setFinancePeriod, setFinanceUiMode } from "./cashflow.js";
import { STATE } from "./state.js";
import { formatMoney, escapeHtml, COPY_BUTTON_SVG } from "./utils.js";
import { getSectionContent } from "./sidebar.js";
import { t } from "./i18n.js";

const SECTION_ID = "cashflow-section";

const PERIOD_OPTIONS = [
  { id: "current", labelKey: "financePeriodCurrent" },
  { id: "day", labelKey: "financePeriodDay" },
  { id: "week", labelKey: "financePeriodWeek" },
];

const TRANSACTION_ROW_LIMIT = 20;

const uiState = {
  drilldown: null,
  txFilter: "all",
  copyStatus: null,
  copyStatusTimer: null,
};

function formatRefreshTime(ms) {
  if (!ms) return t("never");
  const ago = Math.floor((Date.now() - ms) / 1000);
  if (ago < 60) return `${ago}${t("sAgo")}`;
  if (ago < 3600) return `${Math.floor(ago / 60)}${t("mAgo")}`;
  return `${Math.floor(ago / 3600)}${t("hAgo")}`;
}

function formatPct(value, decimals = 1) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function metricLabel(metricId) {
  const map = {
    revenue: "financeKpiRevenue",
    grossProfit: "financeKpiGrossProfit",
    operatingProfit: "financeKpiOperatingProfit",
    netProfit: "financeKpiNetProfit",
    cashChange: "financeKpiCashChange",
    cashBalance: "financeKpiCashBalance",
    accountsReceivable: "financeKpiAr",
    inventory: "financeKpiInventory",
  };

  return t(map[metricId] || metricId);
}

function metricTooltip(metricId) {
  const map = {
    revenue: "financeTooltipRevenue",
    grossProfit: "financeTooltipGrossProfit",
    operatingProfit: "financeTooltipOperatingProfit",
    netProfit: "financeTooltipNetProfit",
    cashChange: "financeTooltipCashChange",
    cashBalance: "financeTooltipCashBalance",
    accountsReceivable: "financeTooltipAr",
    inventory: "financeTooltipInventory",
  };

  return t(map[metricId] || "");
}

function ratioLabel(ratioId) {
  const map = {
    grossMargin: "financeRatioGrossMargin",
    operatingMargin: "financeRatioOperatingMargin",
    netMargin: "financeRatioNetMargin",
    currentRatio: "financeRatioCurrent",
    cashToInventory: "financeRatioCashInventory",
    debtToAssets: "financeRatioDebtAssets",
  };

  return t(map[ratioId] || ratioId);
}

function ratioTooltip(ratioId) {
  const map = {
    grossMargin: "financeTooltipGrossMargin",
    operatingMargin: "financeTooltipOperatingMargin",
    netMargin: "financeTooltipNetMargin",
    currentRatio: "financeTooltipCurrentRatio",
    cashToInventory: "financeTooltipCashInventory",
    debtToAssets: "financeTooltipDebtAssets",
  };

  return t(map[ratioId] || "");
}

function severityLabel(severity) {
  if (severity === "danger") return t("financeSeverityDanger");
  if (severity === "warn") return t("financeSeverityWarn");
  return t("financeSeverityInfo");
}

function severityClass(severity) {
  if (severity === "danger") return "scx-tone-surface scx-tone-error";
  if (severity === "warn") return "scx-tone-surface scx-tone-warning";
  return "scx-tone-surface scx-tone-info";
}

function statusToneClass(type) {
  if (type === "ok") return "scx-tone-surface scx-tone-success";
  if (type === "warn") return "scx-tone-surface scx-tone-warning";
  if (type === "error") return "scx-tone-surface scx-tone-error";
  return "scx-tone-surface scx-tone-info";
}

function deltaClass(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "";
  return delta > 0 ? "scx-fin-pos" : "scx-fin-neg";
}

function formatMetricValue(metric) {
  if (metric.id === "cashBalance" || metric.id === "accountsReceivable" || metric.id === "inventory") {
    return Number.isFinite(metric.current) ? formatMoney(metric.current) : "—";
  }

  return Number.isFinite(metric.current) ? formatMoney(metric.current) : "—";
}

function formatMetricDelta(metric) {
  if (!Number.isFinite(metric.delta)) return t("financeNoComparison");
  const sign = metric.delta > 0 ? "+" : "";
  const pct = Number.isFinite(metric.pct) ? ` (${formatPct(metric.pct)})` : "";
  return `${sign}${formatMoney(metric.delta)}${pct}`;
}

function formatFinanceAsText(finance) {
  const derived = finance?.derived;
  if (!derived || !Array.isArray(derived.kpis)) return "";

  const lines = [];
  lines.push(
    `${t("financialsHelper")} (${t("financePeriodLabel")} ${t(`financePeriod${capitalize(finance.selectedPeriod)}`)})`,
  );
  lines.push("");

  for (const metric of derived.kpis) {
    lines.push(`${metricLabel(metric.id)}: ${formatMetricValue(metric)} | ${formatMetricDelta(metric)}`);
  }

  lines.push("");
  lines.push(`${t("financeSectionPnl")}:`);
  lines.push(`  ${t("financeKpiRevenue")}: ${formatMoney(derived.pnl?.revenue?.current || 0)}`);
  lines.push(`  ${t("financePnlDirectCosts")}: ${formatMoney(derived.pnl?.directCosts?.current || 0)}`);
  lines.push(`  ${t("financeKpiGrossProfit")}: ${formatMoney(derived.pnl?.grossProfit?.current || 0)}`);
  lines.push(`  ${t("financePnlOverhead")}: ${formatMoney(derived.pnl?.overhead?.current || 0)}`);
  lines.push(
    `  ${t("financeKpiOperatingProfit")}: ${formatMoney(derived.pnl?.operatingProfit?.current || 0)}`,
  );
  lines.push(`  ${t("financeKpiNetProfit")}: ${formatMoney(derived.pnl?.netProfit?.current || 0)}`);

  return lines.join("\n");
}

function setCopyStatus(type, message) {
  uiState.copyStatus = { type, message };

  if (uiState.copyStatusTimer) {
    clearTimeout(uiState.copyStatusTimer);
  }

  uiState.copyStatusTimer = setTimeout(() => {
    uiState.copyStatus = null;
    updateCashflowPanel();
  }, 2200);
}

function formatKpiLine(metric) {
  return `${metricLabel(metric.id)}: ${formatMetricValue(metric)} | ${formatMetricDelta(metric)}`;
}

function buildVisibleFinanceAsText(finance) {
  const derived = finance?.derived;
  if (!derived || !Array.isArray(derived.kpis)) return "";

  const mode = finance?.uiMode || "compact";
  const lines = [];

  lines.push(
    `${t("financialsHelper")} | ${t("financePeriodLabel")}: ${t(`financePeriod${capitalize(finance.selectedPeriod)}`)} | ${mode === "expanded" ? t("financeExpand") : t("financeCompact")}`,
  );
  lines.push(`${t("latest")}: ${formatRefreshTime(finance?.meta?.lastRefreshAt)}`);
  lines.push("");
  for (const metric of derived.kpis) {
    lines.push(`- ${formatKpiLine(metric)}`);
  }

  lines.push("");
  lines.push(t("financeSectionAlerts"));
  const alerts = Array.isArray(derived.alerts) ? derived.alerts : [];
  if (alerts.length === 0) {
    lines.push(`- ${t("financeNoAlerts")}`);
  } else {
    for (const alert of alerts) {
      lines.push(`- ${severityLabel(alert.severity)}: ${t(`financeAlert${capitalize(alert.id)}`)}`);
    }
  }

  if (mode !== "expanded") {
    return lines.join("\n");
  }

  const pnl = derived.pnl || {};
  lines.push("");
  lines.push(t("financeSectionPnl"));
  lines.push(`- ${t("financeKpiRevenue")}: ${formatMoney(pnl?.revenue?.current || 0)}`);
  lines.push(`- ${t("financePnlDirectCosts")}: ${formatMoney(pnl?.directCosts?.current || 0)}`);
  lines.push(`- ${t("financeKpiGrossProfit")}: ${formatMoney(pnl?.grossProfit?.current || 0)}`);
  lines.push(`- ${t("financePnlOverhead")}: ${formatMoney(pnl?.overhead?.current || 0)}`);
  lines.push(`- ${t("financeKpiOperatingProfit")}: ${formatMoney(pnl?.operatingProfit?.current || 0)}`);
  lines.push(`- ${t("financeKpiNetProfit")}: ${formatMoney(pnl?.netProfit?.current || 0)}`);

  const cm = derived.cashMovement || {};
  lines.push("");
  lines.push(t("financeSectionCashMovement"));
  lines.push(`- ${t("financeInflows")}: ${formatMoney(cm?.inflows?.current || 0)}`);
  lines.push(`- ${t("financeOutflows")}: ${formatMoney(cm?.outflows?.current || 0)}`);
  lines.push(`- ${t("financeKpiCashChange")}: ${formatMoney(cm?.netChange?.current || 0)}`);
  lines.push(
    `- ${t("financeOpeningCash")}: ${Number.isFinite(cm?.openingCash) ? formatMoney(cm.openingCash) : "—"}`,
  );
  lines.push(
    `- ${t("financeClosingCash")}: ${Number.isFinite(cm?.closingCash) ? formatMoney(cm.closingCash) : "—"}`,
  );

  const bs = derived.balanceSheet?.latest;
  if (bs) {
    lines.push("");
    lines.push(t("financeSectionBalanceSheet"));
    lines.push(
      `- ${t("financeTotalAssets")}: ${formatMoney(Number(bs.currentAssets || 0) + Number(bs.nonCurrentAssets || 0))}`,
    );
    lines.push(`- ${t("financeCurrentAssets")}: ${formatMoney(Number(bs.currentAssets || 0))}`);
    lines.push(`- ${t("financeNonCurrentAssets")}: ${formatMoney(Number(bs.nonCurrentAssets || 0))}`);
    lines.push(`- ${t("financeCashReceivables")}: ${formatMoney(Number(bs.cashAndReceivables || 0))}`);
    lines.push(`- ${t("financeKpiInventory")}: ${formatMoney(Number(bs.inventory || 0))}`);
    lines.push(`- ${t("financeLiabilities")}: ${formatMoney(Math.abs(Number(bs.liabilities || 0)))}`);
  }

  const ratios = Array.isArray(derived.ratios) ? derived.ratios : [];
  if (ratios.length > 0) {
    lines.push("");
    lines.push(t("financeSectionRatios"));
    for (const ratio of ratios) {
      const value = ratio.id.includes("Margin") ? formatPct(ratio.value) : formatRatio(ratio.value);
      lines.push(`- ${ratioLabel(ratio.id)}: ${value}`);
    }
  }

  const drivers = derived.drivers || {};
  lines.push("");
  lines.push(t("financeSectionDrivers"));
  lines.push(t("financeTopIncomeDrivers"));
  for (const x of drivers.income || []) {
    lines.push(`- ${x.label}: ${formatMoney(x.income)}`);
  }
  lines.push(t("financeTopExpenseDrivers"));
  for (const x of drivers.expenses || []) {
    lines.push(`- ${x.label}: ${formatMoney(x.expense)}`);
  }
  lines.push(t("financeLargestChanges"));
  for (const x of drivers.changes || []) {
    lines.push(`- ${x.label}: ${formatMoney(x.delta)}`);
  }

  const mix = Array.isArray(derived.salesMix) ? derived.salesMix : [];
  lines.push("");
  lines.push(t("financeSectionSalesMix"));
  for (const x of mix) {
    lines.push(`- ${x.name}: ${formatMoney(x.revenue)} (${formatPct(x.share, 1)})`);
  }

  const ip = derived.inventoryProduction || {};
  lines.push("");
  lines.push(t("financeSectionInventoryProduction"));
  lines.push(
    `- ${t("financeKpiInventory")}: ${Number.isFinite(ip.inventoryValue) ? formatMoney(ip.inventoryValue) : "—"}`,
  );
  lines.push(`- ${t("financeProductionSpend")}: ${formatMoney(ip.productionSpend || 0)}`);
  lines.push(
    `- ${t("financeProductionVolume")}: ${Number.isFinite(ip.productionVolume) ? ip.productionVolume : "—"}`,
  );
  lines.push(
    `- ${t("financeOutgoingContracts")}: ${Number.isFinite(ip.outgoingContractsCount) ? ip.outgoingContractsCount : 0}`,
  );
  lines.push(`- ${t("financeOutgoingContractsValue")}: ${formatMoney(ip.outgoingContractsValue || 0)}`);

  const wf = derived.workforce || {};
  lines.push("");
  lines.push(t("financeSectionWorkforce"));
  lines.push(`- ${t("wages")}: ${formatMoney(wf.wages || 0)}`);
  lines.push(`- ${t("financeTraining")}: ${formatMoney(wf.training || 0)}`);
  lines.push(`- ${t("accounting")}: ${formatMoney(wf.accounting || 0)}`);
  lines.push(`- ${t("financeLeadershipCost")}: ${formatMoney(wf.leadership || 0)}`);
  lines.push(`- ${t("financeTotalWorkforce")}: ${formatMoney(wf.total || 0)}`);

  const txRows = filteredTransactionsForTable(finance);
  lines.push("");
  lines.push(
    `${t("financeSectionTransactions")} (${t("financeTxFilterLabel")}: ${t(`financeTx${capitalize(uiState.txFilter)}`)})`,
  );
  for (const tx of txRows) {
    const timeStr = Number.isFinite(tx?._dtMs) ? new Date(tx._dtMs).toLocaleString() : "—";
    lines.push(
      `- [${timeStr}] ${tx?.category || ""} | ${tx?.description || tx?.descriptionKey || ""} | ${formatMoney(Number(tx?.money || 0))}`,
    );
  }

  return lines.join("\n");
}

async function copyTextRobust(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}

  try {
    const ta = document.createElement("textarea");
    ta.className = "scx-fin-copy-buffer";
    ta.setAttribute("readonly", "readonly");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

function statusMessages(finance) {
  const out = [];
  const isLoading = Boolean(finance?.meta?.loading || STATE.cashflow.loading);
  const isPartial = Boolean(finance?.coverage?.partial);
  const oldestPulled = Boolean(finance?.cache?.oldestPulled);
  const rateLimitedUntil = Number(finance?.meta?.rateLimitedUntil || 0);
  const now = Date.now();
  const isRateLimited = rateLimitedUntil > now;

  if (isLoading) {
    out.push({ type: "info", text: t("financeRefreshing") });
  }

  if (isPartial && isLoading) {
    out.push({ type: "warn", text: t("financeLoadingPartial") });
  } else if (isPartial) {
    out.push({ type: "warn", text: t("financePartialCoverage") });
    if (oldestPulled) {
      out.push({ type: "warn", text: t("financeHistoryOldestPulled") });
    } else if (!isRateLimited) {
      out.push({ type: "info", text: t("financeHistoryIdle") });
    }
  } else if (!isLoading && !isRateLimited) {
    out.push({ type: "ok", text: t("financeHistoryCovered") });
  }

  if (isRateLimited) {
    const remainSec = Math.max(1, Math.ceil((rateLimitedUntil - now) / 1000));
    out.push({ type: "warn", text: `${t("financeRateLimitedWait")} ${remainSec}s` });
  }

  if (uiState.copyStatus?.message) {
    out.push({
      type: uiState.copyStatus.type || "info",
      text: uiState.copyStatus.message,
    });
  }

  return out;
}

function capitalize(s) {
  if (!s) return "";
  return `${s[0].toUpperCase()}${s.slice(1)}`;
}

function getTransactionsForDrilldown(finance) {
  const all = finance?.datasets?.transactions || [];
  const period = finance?.derived?.period;

  if (!period) return [];

  const scoped = all.filter((tx) => tx?._dtMs >= period.startMs && tx?._dtMs < period.endMs);

  if (!uiState.drilldown) {
    return scoped;
  }

  if (uiState.drilldown.startsWith("driver:")) {
    const key = uiState.drilldown.slice("driver:".length);
    return scoped.filter((tx) => String(tx?.descriptionKey || "") === key);
  }

  if (!uiState.drilldown.startsWith("kpi:")) {
    return scoped;
  }

  const metricId = uiState.drilldown.slice("kpi:".length);

  if (metricId === "revenue") {
    return scoped.filter((tx) => Number(tx?.money || 0) > 0);
  }

  if (metricId === "netProfit" || metricId === "cashChange") {
    return scoped;
  }

  if (metricId === "grossProfit") {
    return scoped.filter((tx) => {
      const m = Number(tx?.money || 0);
      const key = String(tx?.descriptionKey || "").toLowerCase();
      const cat = String(tx?.category || "");
      if (m > 0) return true;
      return cat === "p" || key.startsWith("marketbuy-") || key.startsWith("cr-");
    });
  }

  if (metricId === "operatingProfit") {
    return scoped.filter((tx) => {
      const key = String(tx?.descriptionKey || "").toLowerCase();
      const cat = String(tx?.category || "");
      if (Number(tx?.money || 0) > 0) return true;
      return ["w", "h", "f", "A", "r", "c"].includes(cat) || key.startsWith("training-");
    });
  }

  return scoped;
}

function filteredTransactionsForTable(finance) {
  let rows = getTransactionsForDrilldown(finance);

  if (uiState.txFilter === "income") {
    rows = rows.filter((tx) => Number(tx?.money || 0) > 0);
  } else if (uiState.txFilter === "expense") {
    rows = rows.filter((tx) => Number(tx?.money || 0) < 0);
  }

  return rows.slice(0, TRANSACTION_ROW_LIMIT);
}

function renderKpiStrip(kpis) {
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
            <button
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

function renderAlerts(alerts, compact = false) {
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
            <div class="scx-fin-alert-item scx-alert-card ${severityClass(a.severity)}">
              <span class="scx-fin-alert-severity">${escapeHtml(severityLabel(a.severity))}</span>
              <span class="scx-fin-alert-message">${escapeHtml(t(`financeAlert${capitalize(a.id)}`))}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPnl(derived) {
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

function formatNumberValue(value) {
  if (!Number.isFinite(value)) return "—";

  const fractional = Math.abs(value % 1) > 0.000001;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractional ? 2 : 0,
  }).format(value);
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

function renderCashMovement(derived) {
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

function renderBalanceSheet(derived) {
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

function renderRatios(derived) {
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

function renderDrivers(derived) {
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
    <button class="scx-fin-driver-row" data-fin-drill="driver:${escapeHtml(driver.key)}">
      <span class="scx-fin-driver-label">${escapeHtml(driver.label)}</span>
      <span class="scx-fin-driver-value">${formatMoney(amount)}</span>
    </button>
  `;
}

function renderSalesMix(derived) {
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

function renderInventoryProduction(derived) {
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

function renderWorkforce(derived) {
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

function renderDrilldown(finance) {
  if (!uiState.drilldown) return "";

  const rows = filteredTransactionsForTable(finance);
  const title = uiState.drilldown.startsWith("driver:")
    ? t("financeDrilldownDriver")
    : t("financeDrilldownMetric");

  return `
    <div class="scx-panel scx-fin-section-card scx-fin-drilldown-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${title}</div>
        <button class="scx-btn scx-fin-clear-btn" data-fin-action="clearDrilldown">${t("financeClearDrilldown")}</button>
      </div>
      ${renderTransactionTable(rows, true)}
    </div>
  `;
}

function renderTransactions(finance) {
  const rows = filteredTransactionsForTable(finance);

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionTransactions")}</div>
        <div class="scx-fin-inline-actions">
          <select class="scx-select scx-fin-tx-filter" data-fin-action="txFilter">
            <option value="all" ${uiState.txFilter === "all" ? "selected" : ""}>${t("financeTxAll")}</option>
            <option value="income" ${uiState.txFilter === "income" ? "selected" : ""}>${t("financeTxIncome")}</option>
            <option value="expense" ${uiState.txFilter === "expense" ? "selected" : ""}>${t("financeTxExpense")}</option>
          </select>
        </div>
      </div>
      ${renderTransactionTable(rows, false)}
    </div>
  `;
}

function renderTransactionTable(rows, compact) {
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
                  <td class="scx-text-right ${cls}">${formatMoney(money)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderExpanded(finance) {
  const derived = finance?.derived;
  if (!derived) return "";

  return `
    <div class="scx-fin-expanded">
      ${renderPnl(derived)}
      ${renderCashMovement(derived)}
      ${renderBalanceSheet(derived)}
      ${renderRatios(derived)}
      ${renderDrivers(derived)}
      ${renderDrilldown(finance)}
      ${renderTransactions(finance)}
      ${renderSalesMix(derived)}
      ${renderInventoryProduction(derived)}
      ${renderWorkforce(derived)}
      <div class="scx-panel scx-fin-section-card">
        <div class="scx-panel-head">
          <div class="scx-panel-title">${t("financeSectionAlerts")}</div>
        </div>
        ${renderAlerts(derived.alerts, false)}
      </div>
    </div>
  `;
}

function renderHeader(finance) {
  const period = finance?.selectedPeriod || "current";
  const mode = finance?.uiMode || "compact";
  const isPartial = Boolean(finance?.coverage?.partial);
  const rateLimitedUntil = Number(finance?.meta?.rateLimitedUntil || 0);
  const rateLimited = rateLimitedUntil > Date.now();

  const badges = [
    `<span class="scx-chip">${t("latest")}: ${formatRefreshTime(finance?.meta?.lastRefreshAt)}</span>`,
    isPartial ? `<span class="scx-chip scx-chip-bad">${t("financePartialCoverage")}</span>` : "",
    rateLimited ? `<span class="scx-chip scx-chip-meh">${t("financeRateLimited")}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const status = statusMessages(finance);

  return `
    <div class="scx-fin-header">
      <div class="scx-fin-header-row">
        <div class="scx-panel-title">${t("financialsHelper")}</div>
        <div class="scx-fin-inline-actions">
          <button class="scx-copy-btn" data-fin-action="copy" data-tooltip="${t("financeCopyVisible")}">
            ${COPY_BUTTON_SVG}
          </button>
        </div>
      </div>

      <div class="scx-fin-header-row">
        <label class="scx-label scx-label-inline">${t("financePeriodLabel")}</label>
        <select class="scx-select scx-fin-period-select" data-fin-action="period">
          ${PERIOD_OPTIONS.map((p) => `<option value="${p.id}" ${period === p.id ? "selected" : ""}>${t(p.labelKey)}</option>`).join("")}
        </select>
        <button class="scx-btn scx-fin-refresh-btn" data-fin-action="refresh">${t("financeRefresh")}</button>
        <button class="scx-btn scx-fin-mode-btn" data-fin-action="toggleMode">
          ${mode === "compact" ? t("financeExpand") : t("financeCompact")}
        </button>
      </div>

      <div class="scx-fin-header-row scx-fin-badges">${badges}</div>
      ${
        status.length
          ? `<div class="scx-fin-status-list">${status
              .map(
                (x) =>
                  `<div class="scx-fin-status-item scx-status-chip ${statusToneClass(x.type)}">${escapeHtml(x.text)}</div>`,
              )
              .join("")}</div>`
          : ""
      }
    </div>
  `;
}

function bindEvents(contentEl) {
  if (!contentEl || contentEl._financeBound) return;

  const onClick = async (e) => {
    const actionEl = e.target.closest("[data-fin-action],[data-fin-drill]");
    if (!actionEl) return;

    const action = actionEl.dataset.finAction;
    const drill = actionEl.dataset.finDrill;

    if (drill) {
      uiState.drilldown = drill;
      updateCashflowPanel();
      return;
    }

    if (action === "refresh") {
      const pending = loadFinanceData({
        period: STATE.cashflow.finance.selectedPeriod,
        force: true,
        reason: "manual",
      });
      updateCashflowPanel();
      await pending;
      updateCashflowPanel();
      return;
    }

    if (action === "toggleMode") {
      const mode = STATE.cashflow.finance.uiMode === "compact" ? "expanded" : "compact";
      setFinanceUiMode(mode);
      const pending = loadFinanceData({
        period: STATE.cashflow.finance.selectedPeriod,
        force: false,
        reason: "mode-toggle",
      });
      updateCashflowPanel();
      await pending;
      updateCashflowPanel();
      return;
    }

    if (action === "copy") {
      const text = buildVisibleFinanceAsText(STATE.cashflow.finance);
      const ok = await copyTextRobust(text);
      setCopyStatus(ok ? "ok" : "error", ok ? t("financeCopySuccess") : t("financeCopyFailed"));
      updateCashflowPanel();
      return;
    }

    if (action === "clearDrilldown") {
      uiState.drilldown = null;
      updateCashflowPanel();
      return;
    }
  };

  const onChange = async (e) => {
    const actionEl = e.target.closest("[data-fin-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.finAction;

    if (action === "period") {
      const period = e.target.value;
      setFinancePeriod(period);
      uiState.drilldown = null;
      const pending = loadFinanceData({ period, force: false, reason: "period-change" });
      updateCashflowPanel();
      await pending;
      updateCashflowPanel();
      return;
    }

    if (action === "txFilter") {
      uiState.txFilter = e.target.value;
      updateCashflowPanel();
    }
  };

  contentEl._financeBound = true;
  contentEl.addEventListener("click", onClick);
  contentEl.addEventListener("change", onChange);
}

export function updateCashflowPanel() {
  const contentEl = getSectionContent(SECTION_ID);
  if (!contentEl) return;

  bindEvents(contentEl);

  const cf = STATE.cashflow;
  const finance = cf?.finance;

  if (!finance) {
    contentEl.innerHTML = `<div class="scx-muted">${t("loadingCashflow")}</div>`;
    return;
  }

  if ((finance.meta?.loading || cf.loading) && (!finance.derived || !finance.derived.kpis)) {
    contentEl.innerHTML = `<div class="scx-muted">${t("loadingCashflow")}</div>`;
    return;
  }

  if (finance.meta?.error && (!finance.derived || !finance.derived.kpis)) {
    contentEl.innerHTML = `
      <div class="scx-note scx-fin-error-note">
        ${escapeHtml(finance.meta.error)}
      </div>
    `;
    return;
  }

  if (!finance.derived || !Array.isArray(finance.derived.kpis) || finance.derived.kpis.length === 0) {
    contentEl.innerHTML = `<div class="scx-muted">${t("noCashflowData")}</div>`;
    return;
  }

  const mode = finance.uiMode || "compact";

  contentEl.innerHTML = `
    <div class="scx-fin-dashboard ${mode === "expanded" ? "scx-fin-dashboard-expanded" : ""}">
      ${renderHeader(finance)}
      ${renderKpiStrip(finance.derived.kpis)}
      <div class="scx-panel scx-fin-section-card">
        <div class="scx-panel-head">
          <div class="scx-panel-title">${t("financeSectionAlerts")}</div>
        </div>
        ${renderAlerts(finance.derived.alerts, true)}
      </div>
      ${mode === "expanded" ? renderExpanded(finance) : ""}
    </div>
  `;
}

export const _testUtils = {
  formatRefreshTime,
  formatFinanceAsText,
  formatPct,
};
