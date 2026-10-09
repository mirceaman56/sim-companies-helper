// Recurring refresh scheduling and runtime event listeners.
import { STATE } from "./state.js";
import { loadFinanceData } from "./cashflow.js";
import { loadBuildings } from "./buildings.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateXpWidget } from "./xp_ui.js";
import { updatePanel as updateRetailPanel, RetailHelper } from "./retail_ui.js";
import { scheduleUpdate } from "./utils.js";
import { startVisiblePoller } from "./scheduler.js";
import { CASHFLOW_REFRESH_INTERVAL_MS, BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";

/**
 * Set up retail helper focus/click listeners.
 * @param {Window} [windowRef]
 */
export function setupRetailInteractionListeners(windowRef = window) {
  // Row edits fire many mutations per keystroke; render at most once per frame.
  const renderRetailSoon = () => scheduleUpdate(updateRetailPanel);
  const onInteraction = (e) => RetailHelper.onFocusOrClick(e, renderRetailSoon);
  windowRef.addEventListener("focusin", onInteraction, true);
  windowRef.addEventListener("click", onInteraction, true);
}

async function refreshCashflow() {
  const pending = loadFinanceData({ force: true });
  updateCashflowPanel(); // show the loading state

  try {
    await pending;
    if (STATE.cashflow.error) {
      console.warn("[SimHelper] Cashflow refresh failed:", STATE.cashflow.error);
    }
  } catch (e) {
    console.error("[SimHelper] Cashflow refresh error:", e);
  }

  updateCashflowPanel();
}

async function refreshBuildings() {
  try {
    await loadBuildings({ force: true });
    if (STATE.buildings.error) {
      console.warn("[SimHelper] Buildings refresh failed:", STATE.buildings.error);
    }
  } catch (e) {
    console.error("[SimHelper] Buildings refresh error:", e);
  }
  updateXpWidget();
}

/**
 * Start recurring refresh services. Hidden tabs skip refreshes (see scheduler.js).
 * @returns {() => void} stop function
 */
export function startRecurringRefreshServices() {
  const stops = [
    startVisiblePoller({ intervalMs: CASHFLOW_REFRESH_INTERVAL_MS, run: refreshCashflow }),
    startVisiblePoller({ intervalMs: BUILDINGS_REFRESH_INTERVAL_MS, run: refreshBuildings }),
  ];
  return () => stops.forEach((stop) => stop());
}
