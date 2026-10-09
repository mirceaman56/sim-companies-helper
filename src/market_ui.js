// Market alerts orchestration (state + timers + persistence + rendering).
import { getSectionContent } from "./sidebar.js";
import { onAuthDataApplied } from "./auth.js";
import { STATE } from "./state.js";
import { fetchMarketPrice, fetchMarket, getRateLimitStatus } from "./market.js";
import { formatMoney, escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import recipes from "./resources/recipes.json";
import {
  ALERT_CHECK_INTERVAL_MS,
  ALERT_TIMER_REFRESH_MS,
  ALERT_MAX_COUNT,
  TOAST_DISMISS_MS,
} from "./constants.js";
import {
  appendAlert,
  applyPriceCheckState,
  canAddAlert,
  createAlert,
  findAlertById,
  isValidTargetPrice,
  removeAlertState,
  resetAlertState,
  startAlertState,
  stopAlertState,
} from "./market_alerts_state.js";
import { loadAlertsSnapshot, saveAlertsSnapshot, storageKeyForRealm } from "./market_alerts_storage.js";
import { createAlertTimers } from "./market_alerts_timers.js";
import {
  createAlertsContent,
  createRenderScheduler,
  flashInputError,
  renderAlertList,
  showNotification,
} from "./market_alerts_render.js";
import { renderStateBlock } from "./ui_state.js";

const SECTION_ID = "market-alerts-section";

let alerts = [];
let nextAlertId = 1;
let alertsContainer = null;
let panelState = null;
// Company/realm the in-memory alerts belong to. The game switches realm without a page
// reload, so alerts, their timers and their saves must follow auth, not outlive it.
let loadedContext = null;
let authListenerAttached = false;

const timers = createAlertTimers({
  checkIntervalMs: ALERT_CHECK_INTERVAL_MS,
  refreshIntervalMs: ALERT_TIMER_REFRESH_MS,
});

const scheduleRenderAlertList = createRenderScheduler(() => {
  renderAlertListUI(alertsContainer);
});

function readAuthContext() {
  return { companyId: STATE.auth.companyId ?? null, realmId: STATE.auth.realmId ?? null };
}

function isLoadedContext(context) {
  return (
    loadedContext !== null &&
    context.companyId === loadedContext.companyId &&
    context.realmId === loadedContext.realmId
  );
}

async function saveAlerts() {
  // why: after a realm switch the scoped key points at the new realm; saving the old
  // realm's alerts there is what copied them across realms.
  if (!isLoadedContext(readAuthContext())) return;
  await saveAlertsSnapshot({ alerts, nextAlertId });
}

async function loadAlerts() {
  alerts = [];
  nextAlertId = 1;
  const snapshot = await loadAlertsSnapshot();
  loadedContext = readAuthContext();
  if (!snapshot) return;
  alerts = snapshot.alerts;
  nextAlertId = snapshot.nextAlertId;
}

function stopAllAlertIntervals() {
  alerts.forEach((alert) => timers.stopAlertInterval(alert));
}

function restartActiveAlerts() {
  const restartCandidates = alerts.filter((alert) => alert.active && !alert.triggered);
  restartCandidates.forEach((alert) => {
    alert.active = false;
  });

  timers.stagger(restartCandidates, (alert) => {
    if (alerts.includes(alert)) startAlert(alertsContainer, alert.id);
  });
}

async function loadAlertsOrShowError() {
  try {
    await loadAlerts();
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : t("genericError");
    panelState = {
      type: "error",
      message: `${t("genericError")}: ${message}`,
    };
    alerts = [];
    nextAlertId = 1;
  }
}

async function handleAuthContext(context) {
  if (loadedContext === null || isLoadedContext(context)) return;

  stopAllAlertIntervals();
  panelState = null;
  await loadAlertsOrShowError();
  renderAlertListUI(alertsContainer);
  restartActiveAlerts();
}

export async function initMarketAlerts() {
  panelState = null;
  const content = getSectionContent(SECTION_ID);
  if (content && !content.querySelector(".scx-market-alerts")) {
    content.innerHTML = renderStateBlock({
      type: "loading",
      message: t("loading"),
      showSpinner: true,
    });
  }

  if (!authListenerAttached) {
    authListenerAttached = true;
    onAuthDataApplied((context) => void handleAuthContext(context));
  }

  stopAllAlertIntervals();
  await loadAlertsOrShowError();

  if (content) {
    content.innerHTML = "";
    alertsContainer = createAlertsContent({
      recipes,
      alertsCount: alerts.length,
      maxCount: ALERT_MAX_COUNT,
      t,
      escapeHtml,
      onAdd: () => addAlert(alertsContainer),
    });
    content.appendChild(alertsContainer);
    renderAlertListUI(alertsContainer);

    timers.startRenderRefresh(() => {
      renderAlertListUI(alertsContainer);
    });
  }

  restartActiveAlerts();
}

/**
 * Update the market alerts panel (called when section is expanded).
 */
export function updateMarketAlertsPanel() {
  // Panel is event-driven, no periodic refresh needed.
}

/**
 * @param {HTMLElement|null} container
 */
function addAlert(container) {
  if (!container) return;

  if (!canAddAlert(alerts, ALERT_MAX_COUNT)) {
    const priceInput = container.querySelector("#scx-ma-price");
    if (priceInput) flashInputError(priceInput);
    return;
  }

  const productSelect = container.querySelector("#scx-ma-product");
  const qualitySelect = container.querySelector("#scx-ma-quality");
  const priceInput = container.querySelector("#scx-ma-price");

  const productId = Number(productSelect.value);
  const productName = productSelect.options[productSelect.selectedIndex].text;
  const qualityValue = qualitySelect.value;
  const quality = qualityValue === "all" ? "all" : Number(qualityValue);
  const targetPrice = parseFloat(priceInput.value);

  if (!isValidTargetPrice(targetPrice)) {
    flashInputError(priceInput);
    return;
  }

  const alert = createAlert({
    id: nextAlertId,
    productId,
    productName,
    quality,
    targetPrice,
  });

  alerts = appendAlert(alerts, alert);
  nextAlertId += 1;

  void saveAlerts();

  priceInput.value = "";
  renderAlertListUI(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function startAlert(container, alertId) {
  const alert = findAlertById(alerts, alertId);
  if (!startAlertState(alert)) return;

  void saveAlerts();

  timers.startAlertInterval(alert, () => {
    void checkPrice(container, alert);
  });

  renderAlertListUI(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function stopAlert(container, alertId) {
  const alert = findAlertById(alerts, alertId);
  if (!alert) return;

  timers.stopAlertInterval(alert);
  stopAlertState(alert);

  void saveAlerts();
  renderAlertListUI(container);
}

/**
 * Reset a triggered alert so it resumes monitoring and can fire again.
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function resetAlert(container, alertId) {
  const alert = findAlertById(alerts, alertId);
  if (!alert) return;

  resetAlertState(alert);
  void saveAlerts();

  if (!alert.active) {
    startAlert(container, alertId);
  } else {
    void checkPrice(container, alert);
    renderAlertListUI(container);
  }
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function removeAlert(container, alertId) {
  const alert = findAlertById(alerts, alertId);
  if (alert) {
    timers.stopAlertInterval(alert);
  }

  alerts = removeAlertState(alerts, alertId);
  void saveAlerts();
  renderAlertListUI(container);
}

/**
 * Check current market price against alert target.
 * @param {HTMLElement|null} container
 * @param {object} alert
 */
async function checkPrice(container, alert) {
  const { blocked } = getRateLimitStatus();
  if (blocked) {
    alert.lastCheck = Date.now();
    scheduleRenderAlertList();
    return;
  }

  // why: check the market of the realm the alert belongs to, and drop results that land
  // after a realm switch replaced the alert list.
  const context = loadedContext;
  if (!alerts.includes(alert)) return;
  const realmId = context ? context.realmId : STATE.auth.realmId;

  try {
    let price = null;

    if (alert.quality === "all") {
      const data = await fetchMarket(realmId, alert.productId);
      if (Array.isArray(data) && data.length > 0) {
        const cheapest = data.reduce((min, item) => {
          if (!Number.isFinite(item.price)) return min;
          return !min || item.price < min.price ? item : min;
        }, null);
        price = cheapest ? cheapest.price : null;
      }
    } else {
      price = await fetchMarketPrice(realmId, alert.productId, alert.quality);
    }

    if (context !== loadedContext || !alerts.includes(alert)) return;

    const result = applyPriceCheckState(alert, price, Date.now());

    if (result === "triggered") {
      void saveAlerts();
      showNotification({
        alert,
        price,
        t,
        formatMoney,
        escapeHtml,
        toastDismissMs: TOAST_DISMISS_MS,
      });
    } else if (result === "cleared") {
      void saveAlerts();
    }

    panelState = null;
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : String(e || t("marketError"));
    panelState = {
      type: "error",
      message: `${t("marketError")}: ${message}`,
    };
    console.warn(`[SimHelper] Market alert check failed for ${alert.productName}:`, e);
  }

  scheduleRenderAlertList();
  void container;
}

/**
 * @param {HTMLElement|null} container
 */
function renderAlertListUI(container) {
  if (!container) return;

  const stateEl = container.querySelector(".scx-market-alerts-state");
  if (stateEl) {
    stateEl.innerHTML = panelState ? renderStateBlock(panelState) : "";
  }

  renderAlertList({
    container,
    alerts,
    maxCount: ALERT_MAX_COUNT,
    t,
    formatMoney,
    escapeHtml,
    getRateLimitStatus,
    onAction: (action, alertId) => {
      if (action === "start") startAlert(container, alertId);
      else if (action === "stop") stopAlert(container, alertId);
      else if (action === "reset") resetAlert(container, alertId);
      else if (action === "remove") removeAlert(container, alertId);
    },
  });
}

export const _testUtils = {
  getAlerts: () => alerts,
  setAlerts: (a) => {
    alerts = a;
  },
  getNextAlertId: () => nextAlertId,
  setNextAlertId: (n) => {
    nextAlertId = n;
  },
  addAlert,
  startAlert,
  stopAlert,
  resetAlert,
  removeAlert,
  saveAlerts,
  loadAlerts,
  handleAuthContext,
  checkPrice,
  storageKey: () => storageKeyForRealm(STATE.auth.realmId),
};
