// content_refresh.js
// Recurring refresh scheduling and runtime event listeners.
import { STATE } from "./state.js";
import { loadCashflowToday } from "./cashflow.js";
import { loadBuildings } from "./buildings.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateXpWidget } from "./xp_ui.js";
import { updatePanel as updateRetailPanel, RetailHelper } from "./retail_ui.js";
import { runSafe } from "./utils.js";
import { CASHFLOW_REFRESH_INTERVAL_MS, BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";

/**
 * Set up retail helper focus/click listeners.
 * @param {Window} [windowRef]
 */
export function setupRetailInteractionListeners(windowRef = window) {
  windowRef.addEventListener(
    "focusin",
    (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)),
    true,
  );
  windowRef.addEventListener(
    "click",
    (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)),
    true,
  );
}

/**
 * Start recurring refresh services.
 */
export function startRecurringRefreshServices() {
  setInterval(async () => {
    const pending = loadCashflowToday({ force: true });
    updateCashflowPanel();

    try {
      await pending;
      if (STATE.cashflow.error) {
        console.warn("[SimHelper] Cashflow refresh failed:", STATE.cashflow.error);
      }
    } catch (e) {
      console.error("[SimHelper] Cashflow refresh error:", e);
    }

    updateCashflowPanel();
  }, CASHFLOW_REFRESH_INTERVAL_MS);

  setInterval(async () => {
    try {
      await loadBuildings({ force: true });
      if (STATE.buildings.error) {
        console.warn("[SimHelper] Buildings refresh failed:", STATE.buildings.error);
      }
    } catch (e) {
      console.error("[SimHelper] Buildings refresh error:", e);
    }
    updateXpWidget();
  }, BUILDINGS_REFRESH_INTERVAL_MS);
}
