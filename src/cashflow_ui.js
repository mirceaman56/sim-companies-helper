import { loadFinanceData, setFinancePeriod, setFinanceUiMode } from "./cashflow.js";
import { STATE } from "./state.js";
import { escapeHtml, COPY_BUTTON_SVG, writeClipboardText } from "./utils.js";
import { getSectionContent } from "./sidebar.js";
import { t } from "./i18n.js";
import { renderStateBlock } from "./ui_state.js";
import {
  PERIOD_OPTIONS,
  formatRefreshTime,
  formatPct,
  periodInfoTooltip,
  statusToneClass,
} from "./cashflow_format.js";
import {
  renderKpiStrip,
  renderAlerts,
  renderPnl,
  renderCashMovement,
  renderBalanceSheet,
  renderRatios,
  renderDrivers,
  renderSalesMix,
  renderInventoryProduction,
  renderWorkforce,
  renderTransactionTable,
} from "./cashflow_render.js";
import { formatFinanceAsText, buildVisibleFinanceAsText } from "./cashflow_text.js";

const SECTION_ID = "cashflow-section";

const TRANSACTION_ROW_LIMIT = 20;

const uiState = {
  drilldown: null,
  txFilter: "all",
  copyStatus: null,
  copyStatusTimer: null,
};

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
        <button type="button" class="scx-btn scx-fin-clear-btn" data-fin-action="clearDrilldown">${t("financeClearDrilldown")}</button>
      </div>
      ${renderTransactionTable(rows, true)}
    </div>
  `;
}

function renderTransactions(finance) {
  const rows = filteredTransactionsForTable(finance);
  const txFilterId = "scx-fin-tx-filter";

  return `
    <div class="scx-panel scx-fin-section-card">
      <div class="scx-panel-head">
        <div class="scx-panel-title">${t("financeSectionTransactions")}</div>
        <div class="scx-fin-inline-actions">
          <label class="scx-visually-hidden" for="${txFilterId}">${t("financeSectionTransactions")}</label>
          <select id="${txFilterId}" name="${txFilterId}" class="scx-select scx-fin-tx-filter" data-fin-action="txFilter">
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
  const periodSelectId = "scx-fin-period-select";

  const badges = [
    `<span class="scx-chip">${t("latest")}: ${formatRefreshTime(finance?.meta?.lastRefreshAt)}</span>`,
    isPartial ? `<span class="scx-chip scx-chip-meh">${t("financePartialCoverage")}</span>` : "",
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
          <button type="button" class="scx-copy-btn" data-fin-action="copy" data-tooltip="${t("financeCopyVisible")}" aria-label="${t("financeCopyVisible")}">
            ${COPY_BUTTON_SVG}
          </button>
        </div>
      </div>

      <div class="scx-fin-header-row">
        <label class="scx-label scx-label-inline" for="${periodSelectId}">${t("financePeriodLabel")}</label>
        <select id="${periodSelectId}" name="${periodSelectId}" class="scx-select scx-fin-period-select" data-fin-action="period">
          ${PERIOD_OPTIONS.map((p) => `<option value="${p.id}" ${period === p.id ? "selected" : ""}>${t(p.labelKey)}</option>`).join("")}
        </select>
        <span
          class="scx-fin-period-info-icon"
          role="img"
          tabindex="0"
          aria-label="${escapeHtml(periodInfoTooltip(period))}"
          data-tooltip="${escapeHtml(periodInfoTooltip(period))}"
          >i</span
        >
        <button type="button" class="scx-btn scx-fin-refresh-btn" data-fin-action="refresh">${t("financeRefresh")}</button>
        <button type="button" class="scx-btn scx-fin-mode-btn" data-fin-action="toggleMode">
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
      });
      updateCashflowPanel();
      await pending;
      updateCashflowPanel();
      return;
    }

    if (action === "copy") {
      const finance = STATE.cashflow.finance;
      const text = buildVisibleFinanceAsText(finance, {
        txRows: filteredTransactionsForTable(finance),
        txFilter: uiState.txFilter,
      });
      const ok = await writeClipboardText(text);
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
      const pending = loadFinanceData({ period, force: false });
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
    contentEl.innerHTML = renderStateBlock({
      type: "loading",
      message: t("loadingCashflow"),
      showSpinner: true,
    });
    return;
  }

  if ((finance.meta?.loading || cf.loading) && (!finance.derived || !finance.derived.kpis)) {
    contentEl.innerHTML = renderStateBlock({
      type: "loading",
      message: t("loadingCashflow"),
      showSpinner: true,
    });
    return;
  }

  if (finance.meta?.error && (!finance.derived || !finance.derived.kpis)) {
    contentEl.innerHTML = renderStateBlock({
      type: "error",
      message: finance.meta.error,
    });
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
