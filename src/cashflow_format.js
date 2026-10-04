// Labels, tooltips and number formatting shared by the Financials panel renderers and text export.
import { formatMoney } from "./utils.js";
import { t } from "./i18n.js";

export const PERIOD_OPTIONS = [
  { id: "current", labelKey: "financePeriodCurrent" },
  { id: "day", labelKey: "financePeriodDay" },
  { id: "week", labelKey: "financePeriodWeek" },
];

export const TX_FILTER_LABEL_KEYS = {
  all: "financeTxAll",
  income: "financeTxIncome",
  expense: "financeTxExpense",
};

// Alert ids come from buildAlerts() in cashflow.js.
const ALERT_MESSAGE_KEYS = {
  netNegative: "financeAlertNetNegative",
  operatingNegative: "financeAlertOperatingNegative",
  cashDrain: "financeAlertCashDrain",
  liquidityTight: "financeAlertLiquidityTight",
  inventoryHigh: "financeAlertInventoryHigh",
  workforceHigh: "financeAlertWorkforceHigh",
};

export function periodLabel(period) {
  const option = PERIOD_OPTIONS.find((o) => o.id === period) || PERIOD_OPTIONS[0];
  return t(option.labelKey);
}

export function alertMessage(alertId) {
  const key = ALERT_MESSAGE_KEYS[alertId];
  return key ? t(key) : String(alertId || "");
}

export function formatRefreshTime(ms) {
  if (!ms) return t("never");
  const ago = Math.floor((Date.now() - ms) / 1000);
  if (ago < 60) return `${ago}${t("sAgo")}`;
  if (ago < 3600) return `${Math.floor(ago / 60)}${t("mAgo")}`;
  return `${Math.floor(ago / 3600)}${t("hAgo")}`;
}

export function formatPct(value, decimals = 1) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function metricLabel(metricId) {
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

export function metricTooltip(metricId) {
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

export function ratioLabel(ratioId) {
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

export function ratioTooltip(ratioId) {
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

export function periodInfoTooltip(period) {
  const map = {
    current: ["financePeriodInfoTitleCurrent", "financePeriodInfoBodyCurrent"],
    day: ["financePeriodInfoTitleDay", "financePeriodInfoBodyDay"],
    week: ["financePeriodInfoTitleWeek", "financePeriodInfoBodyWeek"],
  };
  const [titleKey, bodyKey] = map[period] || map.current;
  return `${t(titleKey)}: ${t(bodyKey)}`;
}

export function severityLabel(severity) {
  if (severity === "danger") return t("financeSeverityDanger");
  if (severity === "warn") return t("financeSeverityWarn");
  return t("financeSeverityInfo");
}

export function severityClass(severity) {
  if (severity === "danger") return "scx-tone-surface scx-tone-error";
  if (severity === "warn") return "scx-tone-surface scx-tone-warning";
  return "scx-tone-surface scx-tone-info";
}

export function statusToneClass(type) {
  if (type === "ok") return "scx-tone-surface scx-tone-success";
  if (type === "warn") return "scx-tone-surface scx-tone-warning";
  if (type === "error") return "scx-tone-surface scx-tone-error";
  return "scx-tone-surface scx-tone-info";
}

export function deltaClass(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "";
  return delta > 0 ? "scx-fin-pos" : "scx-fin-neg";
}

export function formatMetricValue(metric) {
  if (metric.id === "cashBalance" || metric.id === "accountsReceivable" || metric.id === "inventory") {
    return Number.isFinite(metric.current) ? formatMoney(metric.current) : "—";
  }

  return Number.isFinite(metric.current) ? formatMoney(metric.current) : "—";
}

export function formatMetricDelta(metric) {
  if (!Number.isFinite(metric.delta)) return t("financeNoComparison");
  const sign = metric.delta > 0 ? "+" : "";
  const pct = Number.isFinite(metric.pct) ? ` (${formatPct(metric.pct)})` : "";
  return `${sign}${formatMoney(metric.delta)}${pct}`;
}

export function formatNumberValue(value) {
  if (!Number.isFinite(value)) return "—";

  const fractional = Math.abs(value % 1) > 0.000001;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractional ? 2 : 0,
  }).format(value);
}
