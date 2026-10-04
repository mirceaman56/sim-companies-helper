// Plain-text exports of the Financials panel (copy button).
import { formatMoney } from "./utils.js";
import { t } from "./i18n.js";
import {
  TX_FILTER_LABEL_KEYS,
  periodLabel,
  alertMessage,
  formatRefreshTime,
  formatPct,
  formatRatio,
  metricLabel,
  ratioLabel,
  severityLabel,
  formatMetricValue,
  formatMetricDelta,
} from "./cashflow_format.js";

export function formatFinanceAsText(finance) {
  const derived = finance?.derived;
  if (!derived || !Array.isArray(derived.kpis)) return "";

  const lines = [];
  lines.push(`${t("financialsHelper")} (${t("financePeriodLabel")} ${periodLabel(finance.selectedPeriod)})`);
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

function formatKpiLine(metric) {
  return `${metricLabel(metric.id)}: ${formatMetricValue(metric)} | ${formatMetricDelta(metric)}`;
}

/**
 * Plain-text copy of what the panel currently shows.
 * @param {object} finance STATE.cashflow.finance
 * @param {{ txRows: object[], txFilter: string }} view transaction rows/filter visible in the table
 */
export function buildVisibleFinanceAsText(finance, { txRows, txFilter }) {
  const derived = finance?.derived;
  if (!derived || !Array.isArray(derived.kpis)) return "";

  const mode = finance?.uiMode || "compact";
  const lines = [];

  lines.push(
    `${t("financialsHelper")} | ${t("financePeriodLabel")}: ${periodLabel(finance.selectedPeriod)} | ${mode === "expanded" ? t("financeExpand") : t("financeCompact")}`,
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
      lines.push(`- ${severityLabel(alert.severity)}: ${alertMessage(alert.id)}`);
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

  lines.push("");
  lines.push(
    `${t("financeSectionTransactions")} (${t("financeTxFilterLabel")}: ${t(TX_FILTER_LABEL_KEYS[txFilter] || TX_FILTER_LABEL_KEYS.all)})`,
  );
  for (const tx of txRows) {
    const timeStr = Number.isFinite(tx?._dtMs) ? new Date(tx._dtMs).toLocaleString() : "—";
    lines.push(
      `- [${timeStr}] ${tx?.category || ""} | ${tx?.description || tx?.descriptionKey || ""} | ${formatMoney(Number(tx?.money || 0))}`,
    );
  }

  return lines.join("\n");
}
