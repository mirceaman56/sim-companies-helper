// chat_alerts_ui.js
// Chat alerts orchestration (state + timers + persistence + rendering).
import { getSectionContent } from "./sidebar.js";
import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";
import { t } from "./i18n.js";
import { wireCopyButton } from "./utils.js";
import {
  CHAT_ALERT_CHECK_INTERVAL_MS,
  CHAT_ALERT_TIMER_REFRESH_MS,
  CHAT_ALERT_MAX_COUNT,
  CHAT_ALERT_CUTOFF_HOURS,
  CHAT_ALERT_MAX_PAGES,
  TOAST_DISMISS_MS,
} from "./constants.js";
import {
  appendChatAlert,
  applyChatMatchState,
  canAddChatAlert,
  createChatAlert,
  findChatAlertById,
  isValidChatAlertInput,
  parseKeywords,
  removeChatAlertState,
  resetChatAlertState,
  startChatAlertState,
  stopChatAlertState,
} from "./chat_alerts_state.js";
import {
  createChatAlertsContent,
  readChatAlertFormInput,
  clearChatAlertForm,
  renderChatAlertList,
  formatChatAlertsAsText,
  showChatAlertNotification,
} from "./chat_alerts_render.js";
import { loadChatAlertsSnapshot, saveChatAlertsSnapshot, storageKeyForRealm } from "./chat_alerts_storage.js";
import { createAlertTimers } from "./market_alerts_timers.js";
import { createRenderScheduler, flashInputError } from "./market_alerts_render.js";
import { findLatestRecentChatMatch } from "./chat_filter.js";

const SECTION_ID = "chat-alerts-section";

let alerts = [];
let nextAlertId = 1;
let alertsContainer = null;

const timers = createAlertTimers({
  checkIntervalMs: CHAT_ALERT_CHECK_INTERVAL_MS,
  refreshIntervalMs: CHAT_ALERT_TIMER_REFRESH_MS,
});

const scheduleRender = createRenderScheduler(() => {
  renderChatAlertsList(alertsContainer);
});

function storageKey() {
  return storageKeyForRealm(STATE.auth.realmId);
}

async function saveAlerts() {
  await saveChatAlertsSnapshot({ alerts, nextAlertId });
}

async function loadAlerts() {
  const snapshot = await loadChatAlertsSnapshot();
  if (!snapshot) return;
  alerts = snapshot.alerts;
  nextAlertId = snapshot.nextAlertId;
}

/**
 * Initialize the chat alerts panel.
 */
export async function initChatAlerts() {
  const content = getSectionContent(SECTION_ID);
  if (content && !content.querySelector(".scx-chat-alerts")) {
    content.innerHTML = `<p class="scx-note">${t("loading")}…</p>`;
  }

  await loadAlerts();

  if (content) {
    content.innerHTML = "";
    alertsContainer = createChatAlertsContent({
      alertsCount: alerts.length,
      maxCount: CHAT_ALERT_MAX_COUNT,
      t,
      onAdd: () => addAlert(alertsContainer),
    });
    content.appendChild(alertsContainer);

    wireCopyButton(alertsContainer, () => formatChatAlertsAsText(alerts, t));
    renderChatAlertsList(alertsContainer);

    timers.startRenderRefresh(() => {
      renderChatAlertsList(alertsContainer);
    });
  }

  const restartCandidates = alerts.filter((alert) => alert.active && !alert.triggered);
  restartCandidates.forEach((alert) => {
    alert.active = false;
  });

  timers.stagger(restartCandidates, (alert) => {
    startAlert(alertsContainer, alert.id);
  });
}

/**
 * Update panel on section expansion.
 */
export function updateChatAlertsPanel() {
  // Event-driven panel.
}

/**
 * Add alert from form.
 * @param {HTMLElement|null} container
 */
function addAlert(container) {
  if (!container) return;

  if (!canAddChatAlert(alerts, CHAT_ALERT_MAX_COUNT)) {
    const keywordsInput = container.querySelector("#scx-ca-keywords");
    if (keywordsInput) flashInputError(keywordsInput);
    return;
  }

  const input = readChatAlertFormInput(container);
  const keywords = parseKeywords(input.keywords);

  if (!isValidChatAlertInput({ keywords })) {
    const keywordsInput = container.querySelector("#scx-ca-keywords");
    if (keywordsInput) flashInputError(keywordsInput);
    return;
  }

  const alert = createChatAlert({
    id: nextAlertId,
    keywords,
    companyFilter: input.companyFilter,
  });

  alerts = appendChatAlert(alerts, alert);
  nextAlertId += 1;

  void saveAlerts();
  clearChatAlertForm(container);
  renderChatAlertsList(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function startAlert(container, alertId) {
  const alert = findChatAlertById(alerts, alertId);
  if (!startChatAlertState(alert)) return;

  void saveAlerts();

  timers.startAlertInterval(alert, () => {
    void checkAlert(container, alert);
  });

  renderChatAlertsList(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function stopAlert(container, alertId) {
  const alert = findChatAlertById(alerts, alertId);
  if (!alert) return;

  timers.stopAlertInterval(alert);
  stopChatAlertState(alert);

  void saveAlerts();
  renderChatAlertsList(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function resetAlert(container, alertId) {
  const alert = findChatAlertById(alerts, alertId);
  if (!alert) return;

  resetChatAlertState(alert);
  void saveAlerts();

  if (!alert.active) {
    startAlert(container, alertId);
  } else {
    void checkAlert(container, alert);
    renderChatAlertsList(container);
  }
}

/**
 * @param {HTMLElement|null} container
 * @param {number} alertId
 */
function removeAlert(container, alertId) {
  const alert = findChatAlertById(alerts, alertId);
  if (alert) {
    timers.stopAlertInterval(alert);
  }

  alerts = removeChatAlertState(alerts, alertId);
  void saveAlerts();
  renderChatAlertsList(container);
}

/**
 * @param {HTMLElement|null} container
 * @param {import("./chat_alerts_state.js").ChatAlert} alert
 */
async function checkAlert(container, alert) {
  try {
    const match = await findLatestRecentChatMatch({
      requestMessages: (url, signal) =>
        request("chat", {
          url,
          signal,
          credentials: "include",
          responseType: "json",
          retries: 1,
          retryDelayMs: 200,
        }),
      keywords: alert.keywords,
      companyFilter: alert.companyFilter,
      cutoffHours: CHAT_ALERT_CUTOFF_HOURS,
      maxPages: CHAT_ALERT_MAX_PAGES,
    });

    const result = applyChatMatchState(alert, match, Date.now());

    if (result === "triggered") {
      void saveAlerts();
      showChatAlertNotification({
        alert,
        t,
        toastDismissMs: TOAST_DISMISS_MS,
      });
    } else if (result === "cleared") {
      void saveAlerts();
    }
  } catch (error) {
    alert.lastCheck = Date.now();
    console.warn("[SimHelper] Chat alert check failed:", error);
  }

  scheduleRender();
  void container;
}

/**
 * @param {HTMLElement|null} container
 */
function renderChatAlertsList(container) {
  if (!container) return;

  renderChatAlertList({
    container,
    alerts,
    maxCount: CHAT_ALERT_MAX_COUNT,
    t,
    realmId: STATE.auth.realmId || 0,
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
  setAlerts: (value) => {
    alerts = value;
  },
  getNextAlertId: () => nextAlertId,
  setNextAlertId: (value) => {
    nextAlertId = value;
  },
  addAlert,
  startAlert,
  stopAlert,
  resetAlert,
  removeAlert,
  loadAlerts,
  saveAlerts,
  storageKey,
};
