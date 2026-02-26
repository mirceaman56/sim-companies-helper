// content.js
// Main entry point for the Chrome extension - handles initialization and event delegation
import { loadAuthDataOnce } from "./auth.js";
import { scheduleUpdate, runSafe } from "./utils.js";
import { loadInventoryOnce } from "./warehouse.js";
import { loadCashflowToday } from "./cashflow.js";
import { updatePanel as updateRetailPanel, RetailHelper } from "./retail_ui.js";
import { ensureSidebarContainer, registerSection, setSectionUpdateFn, ensureFooter } from "./sidebar.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateProductionPanel, setupProductionRowListeners } from "./production_ui.js";
import { initChatFilter } from "./chat_filter_ui.js";
import { initContractHelper } from "./contract_ui.js";
import { initExecutiveHelper, updateExecutivePanel } from "./executive_ui.js";
import { initWarehouseHelper } from "./warehouse_ui.js";
import { initMarketAlerts, updateMarketAlertsPanel } from "./market_ui.js";
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { CASHFLOW_REFRESH_INTERVAL_MS } from "./constants.js";

/**
 * Sync legacy cashflow state for backward compatibility.
 * Some code still reads cf.items/cf.summary instead of the modern cf.todayItems/cf.todaySummary.
 */
function syncLegacyCashflowState() {
  STATE.cashflow.items = STATE.cashflow.todayItems || [];
  STATE.cashflow.summary = STATE.cashflow.todaySummary ||
    STATE.cashflow.summary || { salesCount: 0, salesMoney: 0 };
}

async function init() {
  // Initialize the sidebar container
  ensureSidebarContainer();

  // Register sections - Order: Production, Retail, Financials, Chat, Executive
  registerSection("production-section", t("productionHelper"), "⚙️");
  registerSection("retail-section", t("retailHelper"), "🏪");
  registerSection("cashflow-section", t("financialsHelper"), "💲");
  registerSection("market-alerts-section", t("marketAlerts"), "🔔");
  registerSection("chat-section", t("chatFilter"), "💬");
  registerSection("executive-section", t("executiveHelper"), "👔");

  // Add footer
  ensureFooter();

  // Set up update functions
  setSectionUpdateFn("cashflow-section", updateCashflowPanel);
  setSectionUpdateFn("production-section", updateProductionPanel);
  setSectionUpdateFn("retail-section", updateRetailPanel);
  setSectionUpdateFn("executive-section", updateExecutivePanel);
  setSectionUpdateFn("market-alerts-section", updateMarketAlertsPanel);

  // Chat filter is static, init once
  initChatFilter();

  // Contract helper for discount pricing
  initContractHelper();

  // Warehouse helper for market price deltas
  initWarehouseHelper();

  // Setup production row listeners FIRST to close race condition window
  // (attach listeners before user can interact)
  setupProductionRowListeners();

  // Load initial data — auth must complete before realm-scoped features
  try {
    await loadAuthDataOnce();
    if (STATE.auth.error) {
      console.warn("[SimHelper] Auth failed:", STATE.auth.error);
    }

    await loadInventoryOnce();
    if (STATE.inventory.error) {
      console.warn("[SimHelper] Inventory failed:", STATE.inventory.error);
    }

    await loadCashflowToday();
    if (STATE.cashflow.error) {
      console.warn("[SimHelper] Cashflow failed:", STATE.cashflow.error);
    }
  } catch (e) {
    console.error("[SimHelper] Critical initialization failure:", e);
  }

  // Market alerts init — must run after auth so storageKey() uses the real realm ID
  await initMarketAlerts();

  // Sync legacy cashflow state for backward compatibility
  syncLegacyCashflowState();

  // Update cashflow panel after data is loaded
  updateCashflowPanel();

  scheduleUpdate(() => updateRetailPanel());
  RetailHelper.autoSelectFirstRow(() => runSafe(updateRetailPanel));
}

init();

// Event listeners for retail helper
window.addEventListener(
  "focusin",
  (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)),
  true,
);
window.addEventListener(
  "click",
  (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)),
  true,
);

setInterval(async () => {
  try {
    await loadCashflowToday({ force: true });
    if (STATE.cashflow.error) {
      console.warn("[SimHelper] Cashflow refresh failed:", STATE.cashflow.error);
    }
  } catch (e) {
    console.error("[SimHelper] Cashflow refresh error:", e);
  }

  syncLegacyCashflowState();
  updateCashflowPanel();
}, CASHFLOW_REFRESH_INTERVAL_MS);
