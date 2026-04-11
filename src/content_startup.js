// content_startup.js
// Startup loading phases for content bootstrap.
import { loadAuthDataOnce } from "./auth.js";
import { loadInventoryOnce } from "./warehouse.js";
import { loadCashflowToday } from "./cashflow.js";
import { loadBuildings, cleanupLegacyBuildingsCache } from "./buildings.js";
import { initMarketAlerts } from "./market_ui.js";
import { updateXpWidget } from "./xp_ui.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updatePanel as updateRetailPanel, RetailHelper } from "./retail_ui.js";
import { scheduleUpdate, runSafe } from "./utils.js";
import { STATE } from "./state.js";

/**
 * Run startup loading and post-load wiring.
 * @param {{state?: typeof STATE, warn?: typeof console.warn, error?: typeof console.error}} [options]
 */
export async function runStartupServices(options = {}) {
  const { state = STATE, warn = console.warn, error = console.error } = options;

  try {
    await loadAuthDataOnce();
    if (state.auth.error) {
      warn("[SimHelper] Auth failed:", state.auth.error);
    }

    await cleanupLegacyBuildingsCache();

    await loadInventoryOnce();
    if (state.inventory.error) {
      warn("[SimHelper] Inventory failed:", state.inventory.error);
    }

    await loadCashflowToday();
    if (state.cashflow.error) {
      warn("[SimHelper] Cashflow failed:", state.cashflow.error);
    }

    await loadBuildings();
    if (state.buildings.error) {
      warn("[SimHelper] Buildings failed:", state.buildings.error);
    }

    updateXpWidget();
  } catch (e) {
    error("[SimHelper] Critical initialization failure:", e);
  }

  await initMarketAlerts();

  updateCashflowPanel();

  scheduleUpdate(() => updateRetailPanel());
  RetailHelper.autoSelectFirstRow(() => runSafe(updateRetailPanel));
}
