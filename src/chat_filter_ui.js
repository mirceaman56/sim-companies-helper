import { getSectionContent } from "./sidebar.js";
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import {
  CHAT_ALERT_CHECK_INTERVAL_MS,
  CHAT_ALERT_CUTOFF_HOURS,
  CHAT_ALERT_MAX_COUNT,
  CHAT_ALERT_MAX_PAGES,
  CHAT_ALERT_TIMER_REFRESH_MS,
  CHAT_ROOMS_REFRESH_INTERVAL_MS,
  CHAT_SEARCH_CUTOFF_HOURS,
  CHAT_SEARCH_TARGET_COUNT,
  TOAST_DISMISS_MS,
} from "./constants.js";
import { request } from "./data/apiClient.js";
import { buildChatSearchFilters, findLatestRecentChatMatch, searchChatMessages } from "./chat_filter.js";
import {
  appendChatResult,
  clearChatResults,
  createChatFilterContent,
  getActiveChatTab,
  getAlertsMount,
  populateChatRoomSelect,
  readChatSearchInput,
  setActiveChatTab,
  setChatSearchState,
  syncChatTypeState,
  updateChatStatus,
} from "./chat_filter_presenter.js";
import {
  CHAT_ROOMS_ENDPOINT,
  createDefaultChatRoom,
  buildChatApiBaseUrl,
  normalizeSalesChatRooms,
  resolveChatRoomSelection,
} from "./chat_rooms.js";
import {
  applyChatFilterMatchState,
  appendChatFilterAlert,
  canAddChatFilterAlert,
  createChatFilterAlert,
  findChatFilterAlertById,
  isValidChatFilterAlertInput,
  parseKeywords,
  removeChatFilterAlertState,
  resetChatFilterAlertState,
  startChatFilterAlertState,
  stopChatFilterAlertState,
} from "./chat_filter_alerts_state.js";
import {
  clearChatFilterAlertForm,
  createChatFilterAlertsContent,
  formatChatFilterAlertsAsText,
  readChatFilterAlertFormInput,
  renderChatFilterAlertList,
  showChatFilterAlertNotification,
  updateChatFilterAlertRoomDisplay,
} from "./chat_filter_alerts_render.js";
import { loadChatFilterSnapshot, saveChatFilterSnapshot } from "./chat_filter_storage.js";
import { createAlertTimers } from "./market_alerts_timers.js";
import { createRenderScheduler, flashInputError } from "./market_alerts_render.js";
import { renderStateBlock } from "./ui_state.js";
import { wireCopyButton } from "./utils.js";

const SECTION_ID = "chat-section";
const SEARCH_TAB = "search";
const ALERTS_TAB = "alerts";

let alerts = [];
let nextAlertId = 1;
let chatRooms = [createDefaultChatRoom()];
let selectedRoomDbLetter = createDefaultChatRoom().dbLetter;
let chatContainer = null;
let alertsContainer = null;
let activeTab = SEARCH_TAB;
let isSearching = false;
let searchController = null;
let panelState = null;
let lastSearchSummary = null;
let roomRefreshIntervalId = null;

const timers = createAlertTimers({
  checkIntervalMs: CHAT_ALERT_CHECK_INTERVAL_MS,
  refreshIntervalMs: CHAT_ALERT_TIMER_REFRESH_MS,
});

const scheduleRender = createRenderScheduler(() => {
  renderChatAlertsList(chatContainer);
});

function requestChatJson(url, signal) {
  return request("chat", {
    url,
    signal,
    credentials: "include",
    responseType: "json",
    retries: 1,
    retryDelayMs: 200,
  });
}

function storageSnapshot() {
  return {
    selectedRoomDbLetter,
    alerts,
    nextAlertId,
  };
}

async function saveSnapshot() {
  await saveChatFilterSnapshot(storageSnapshot());
}

async function fetchSalesChatRooms() {
  const payload = await requestChatJson(CHAT_ROOMS_ENDPOINT);
  return normalizeSalesChatRooms(payload);
}

async function refreshChatRooms(container) {
  try {
    const nextRooms = await fetchSalesChatRooms();
    chatRooms = nextRooms;

    const previousSelection = selectedRoomDbLetter;
    selectedRoomDbLetter = resolveChatRoomSelection(selectedRoomDbLetter, chatRooms);
    syncRoomSelection(container);

    if (previousSelection !== selectedRoomDbLetter) {
      await saveSnapshot();
    }

    panelState = null;
  } catch (error) {
    console.warn("[SimHelper] Chat room refresh failed:", error);
  }
}

function startRoomRefresh(container) {
  if (roomRefreshIntervalId !== null) return;

  roomRefreshIntervalId = setInterval(() => {
    void refreshChatRooms(container);
  }, CHAT_ROOMS_REFRESH_INTERVAL_MS);
}

function getCurrentFilters(container) {
  return readChatSearchInput(container);
}

function getCurrentRoomSelection(container) {
  const filters = getCurrentFilters(container);
  return {
    roomDbLetter: filters.roomDbLetter,
    roomName: filters.roomName,
  };
}

function renderPanelState() {
  const stateEl = alertsContainer?.querySelector?.(".scx-chat-alerts-state");
  if (!stateEl) return;
  stateEl.innerHTML = panelState ? renderStateBlock(panelState) : "";
}

function renderChatAlertsList(container) {
  if (!container || !alertsContainer) return;

  renderPanelState();
  renderChatFilterAlertList({
    container: alertsContainer,
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

function syncRoomSelection(container) {
  populateChatRoomSelect(container, chatRooms, selectedRoomDbLetter);
  syncChatTypeState(container);

  if (alertsContainer) {
    updateChatFilterAlertRoomDisplay(alertsContainer, getCurrentRoomSelection(container).roomName);
  }
}

function buildSearchSummary(filters, overrides = {}) {
  return {
    roomName: filters.roomName,
    filterType: filters.filterType,
    productName: filters.productName,
    selectedQualities: [...filters.selectedQualities],
    foundCount: Number(overrides.foundCount || 0),
    pagesFetched: Number(overrides.pagesFetched || 0),
  };
}

function updateLastSearchSummary(partial) {
  if (!lastSearchSummary) return;
  lastSearchSummary = {
    ...lastSearchSummary,
    ...partial,
  };
}

function formatSearchTabAsText(container) {
  const filters = getCurrentFilters(container);
  const lines = [t("chatFilter"), ""];

  lines.push(`${t("chatRoom")}: ${filters.roomName || "-"}`);
  lines.push(`${t("product")}: ${filters.productName || "-"}`);
  lines.push(
    `${t("buying")} / ${t("selling")}: ${
      filters.filterType === "any" ? t("maAll") : filters.filterType === "sell" ? t("selling") : t("buying")
    }`,
  );
  lines.push(
    `${t("quality")}: ${filters.selectedQualities.length > 0 ? filters.selectedQualities.join(", ") : t("maAll")}`,
  );

  if (lastSearchSummary) {
    lines.push("");
    lines.push(`${t("chatFoundCount")}: ${Number(lastSearchSummary.foundCount || 0)}`);
  }

  return lines.join("\n").trim();
}

function updateActiveTab(container, tabId) {
  activeTab = tabId === ALERTS_TAB ? ALERTS_TAB : SEARCH_TAB;
  setActiveChatTab(container, activeTab);
}

async function checkAlert(container, alert) {
  try {
    const match = await findLatestRecentChatMatch({
      requestMessages: requestChatJson,
      keywords: alert.keywords,
      companyFilter: alert.companyFilter,
      cutoffHours: CHAT_ALERT_CUTOFF_HOURS,
      maxPages: CHAT_ALERT_MAX_PAGES,
      baseUrl: buildChatApiBaseUrl(alert.roomDbLetter),
    });

    const result = applyChatFilterMatchState(alert, match, Date.now());

    if (result === "triggered") {
      await saveSnapshot();
      showChatFilterAlertNotification({
        alert,
        t,
        toastDismissMs: TOAST_DISMISS_MS,
      });
    } else if (result === "cleared") {
      await saveSnapshot();
    }

    panelState = null;
  } catch (error) {
    alert.lastCheck = Date.now();
    panelState = {
      type: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : `${t("genericError")}: ${String(error || "")}`,
    };
    console.warn("[SimHelper] Chat filter alert check failed:", error);
  }

  scheduleRender();
  void container;
}

function startAlert(container, alertId) {
  const alert = findChatFilterAlertById(alerts, alertId);
  if (!startChatFilterAlertState(alert)) return;

  void saveSnapshot();
  timers.startAlertInterval(alert, () => {
    void checkAlert(container, alert);
  });
  renderChatAlertsList(container);
}

function stopAlert(container, alertId) {
  const alert = findChatFilterAlertById(alerts, alertId);
  if (!alert) return;

  timers.stopAlertInterval(alert);
  stopChatFilterAlertState(alert);
  void saveSnapshot();
  renderChatAlertsList(container);
}

function resetAlert(container, alertId) {
  const alert = findChatFilterAlertById(alerts, alertId);
  if (!alert) return;

  resetChatFilterAlertState(alert);
  void saveSnapshot();

  if (!alert.active) {
    startAlert(container, alertId);
    return;
  }

  void checkAlert(container, alert);
  renderChatAlertsList(container);
}

function removeAlert(container, alertId) {
  const alert = findChatFilterAlertById(alerts, alertId);
  if (alert) {
    timers.stopAlertInterval(alert);
  }

  alerts = removeChatFilterAlertState(alerts, alertId);
  void saveSnapshot();
  renderChatAlertsList(container);
}

function addAlert(container) {
  if (!container || !alertsContainer) return;

  if (!canAddChatFilterAlert(alerts, CHAT_ALERT_MAX_COUNT)) {
    const keywordsInput = alertsContainer.querySelector("#scx-ca-keywords");
    if (keywordsInput) flashInputError(keywordsInput);
    return;
  }

  const input = readChatFilterAlertFormInput(alertsContainer);
  const keywords = parseKeywords(input.keywords);
  const room = getCurrentRoomSelection(container);

  if (!isValidChatFilterAlertInput({ roomDbLetter: room.roomDbLetter, roomName: room.roomName, keywords })) {
    const keywordsInput = alertsContainer.querySelector("#scx-ca-keywords");
    if (keywordsInput) flashInputError(keywordsInput);
    return;
  }

  const alert = createChatFilterAlert({
    id: nextAlertId,
    roomDbLetter: room.roomDbLetter,
    roomName: room.roomName,
    keywords,
    companyFilter: input.companyFilter,
  });

  alerts = appendChatFilterAlert(alerts, alert);
  nextAlertId += 1;

  void saveSnapshot();
  clearChatFilterAlertForm(alertsContainer);
  renderChatAlertsList(container);
}

async function startSearch(container) {
  const filtersInput = getCurrentFilters(container);
  if (!filtersInput.productId) return;

  isSearching = true;
  searchController = new AbortController();
  lastSearchSummary = buildSearchSummary(filtersInput);
  clearChatResults(container);
  setChatSearchState(container, true);
  updateChatStatus(container, `${t("searchingFor")} ${filtersInput.productName}...`);

  const filters = buildChatSearchFilters({
    filterType: filtersInput.filterType,
    productId: filtersInput.productId,
    selectedQualities: filtersInput.selectedQualities,
  });

  try {
    const result = await searchChatMessages({
      filters,
      baseUrl: buildChatApiBaseUrl(filtersInput.roomDbLetter),
      signal: searchController.signal,
      targetCount: CHAT_SEARCH_TARGET_COUNT,
      cutoffHours: CHAT_SEARCH_CUTOFF_HOURS,
      requestMessages: requestChatJson,
      onProgress: (event) => {
        if (event.kind === "page") {
          updateLastSearchSummary({ foundCount: event.foundCount });
          updateChatStatus(
            container,
            `${t("chatScanningPage")} ${event.pageNumber}... ${t("chatFoundCount")}: ${event.foundCount}`,
          );
          return;
        }

        if (event.kind === "cutoff") {
          updateLastSearchSummary({ foundCount: event.foundCount });
          updateChatStatus(container, `${t("chatDoneReachedLimit")} ${event.foundCount}.`);
          return;
        }

        updateLastSearchSummary({ foundCount: event.foundCount });
        updateChatStatus(container, `${t("chatFoundCount")}: ${event.foundCount}`);
      },
      onMatch: (message) => {
        appendChatResult(container, message, { realmId: STATE?.auth?.realmId || 0 });
      },
    });

    updateLastSearchSummary({
      foundCount: result.foundCount,
      pagesFetched: result.pagesFetched,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      updateChatStatus(container, t("searchStopped"));
    } else {
      console.error(error);
      updateChatStatus(container, `${t("genericError")}: ${error?.message || error}`);
    }
  } finally {
    isSearching = false;
    searchController = null;
    setChatSearchState(container, false);
  }
}

function stopSearch() {
  if (searchController) {
    searchController.abort();
  }
}

function handleRoomChange(container) {
  const room = getCurrentRoomSelection(container);
  selectedRoomDbLetter = room.roomDbLetter;
  if (alertsContainer) {
    updateChatFilterAlertRoomDisplay(alertsContainer, room.roomName);
  }
  void saveSnapshot();
}

export async function initChatFilter() {
  const content = getSectionContent(SECTION_ID);
  if (!content || content.querySelector(".scx-chat-filter")) return;

  content.innerHTML = renderStateBlock({
    type: "loading",
    message: t("loading"),
    showSpinner: true,
  });

  alerts = [];
  nextAlertId = 1;
  chatRooms = [createDefaultChatRoom()];
  selectedRoomDbLetter = createDefaultChatRoom().dbLetter;
  activeTab = SEARCH_TAB;
  panelState = null;
  lastSearchSummary = null;

  try {
    const [snapshot, rooms] = await Promise.allSettled([loadChatFilterSnapshot(), fetchSalesChatRooms()]);

    if (snapshot.status === "fulfilled" && snapshot.value) {
      alerts = snapshot.value.alerts;
      nextAlertId = snapshot.value.nextAlertId;
      selectedRoomDbLetter = snapshot.value.selectedRoomDbLetter;
    }

    if (rooms.status === "fulfilled") {
      chatRooms = rooms.value;
    } else {
      panelState = {
        type: "error",
        message: `${t("genericError")}: ${rooms.reason?.message || rooms.reason || ""}`,
      };
    }
  } catch (error) {
    panelState = {
      type: "error",
      message: `${t("genericError")}: ${error instanceof Error ? error.message : String(error || "")}`,
    };
  }

  selectedRoomDbLetter = resolveChatRoomSelection(selectedRoomDbLetter, chatRooms);

  content.innerHTML = "";
  chatContainer = createChatFilterContent({
    onAction: () => {
      if (isSearching) {
        stopSearch();
        return;
      }
      void startSearch(chatContainer);
    },
    onRoomChange: () => handleRoomChange(chatContainer),
    onTabChange: (tabId) => {
      activeTab = tabId;
    },
  });

  syncRoomSelection(chatContainer);

  alertsContainer = createChatFilterAlertsContent({
    alertsCount: alerts.length,
    maxCount: CHAT_ALERT_MAX_COUNT,
    currentRoomName: getCurrentRoomSelection(chatContainer).roomName,
    t,
    onAdd: () => addAlert(chatContainer),
  });

  getAlertsMount(chatContainer)?.appendChild(alertsContainer);
  updateActiveTab(chatContainer, SEARCH_TAB);

  wireCopyButton(chatContainer, () =>
    getActiveChatTab(chatContainer) === ALERTS_TAB
      ? formatChatFilterAlertsAsText(alerts, t)
      : formatSearchTabAsText(chatContainer),
  );

  content.appendChild(chatContainer);
  renderChatAlertsList(chatContainer);
  startRoomRefresh(chatContainer);

  timers.startRenderRefresh(() => {
    renderChatAlertsList(chatContainer);
  });

  const restartCandidates = alerts.filter((alert) => alert.active && !alert.triggered);
  restartCandidates.forEach((alert) => {
    alert.active = false;
  });

  timers.stagger(restartCandidates, (alert) => {
    startAlert(chatContainer, alert.id);
  });
}

export function updateChatFilterPanel() {
  if (chatContainer) {
    renderChatAlertsList(chatContainer);
  }
}

export const _testUtils = {
  getAlerts: () => alerts,
  setAlerts: (value) => {
    alerts = value;
  },
  setChatRooms: (value) => {
    chatRooms = value;
  },
  setSelectedRoomDbLetter: (value) => {
    selectedRoomDbLetter = value;
  },
  getSelectedRoomDbLetter: () => selectedRoomDbLetter,
  addAlert,
  startAlert,
  stopAlert,
  resetAlert,
  removeAlert,
  startSearch,
  handleRoomChange,
  buildSearchSummary,
  storageSnapshot,
  formatSearchTabAsText,
  refreshChatRooms,
  startRoomRefresh,
};
