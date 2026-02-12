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
import { STATE } from "./state.js";
import { t } from "./i18n.js";

async function init() {
  // Initialize the sidebar container
  ensureSidebarContainer();

  // Register sections - Order: Production, Retail, Financials, Chat
  registerSection("production-section", t("productionHelper"), "⚙️");
  registerSection("retail-section", t("retailHelper"), "🏪");
  registerSection("cashflow-section", t("financialsHelper"), "💲");
  registerSection("chat-section", t("chatFilter"), "💬");

  // Add footer
  ensureFooter();

  // Set up update functions
  setSectionUpdateFn("cashflow-section", updateCashflowPanel);
  setSectionUpdateFn("production-section", updateProductionPanel);
  setSectionUpdateFn("retail-section", updateRetailPanel);
  
  // Chat filter is static, init once
  initChatFilter();

  // Load initial data
  await loadAuthDataOnce();
  await loadInventoryOnce();
  await loadCashflowToday();

  // Backward compatibility for any code still reading cf.items/cf.summary
  STATE.cashflow.items = STATE.cashflow.todayItems || [];
  STATE.cashflow.summary =
    STATE.cashflow.todaySummary || STATE.cashflow.summary || { salesCount: 0, salesMoney: 0 };

  // Update cashflow panel after data is loaded
  updateCashflowPanel();

  // Setup row listeners
  setupProductionRowListeners();

  scheduleUpdate(() => updateRetailPanel());
  RetailHelper.autoSelectFirstRow(() => runSafe(updateRetailPanel));
}

init();

// Event listeners for retail helper
window.addEventListener("focusin", (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)), true);
window.addEventListener("click", (e) => RetailHelper.onFocusOrClick(e, () => runSafe(updateRetailPanel)), true);

// Optional: Auto-refresh cashflow periodically (every 5 minutes)
setInterval(async () => {
  await loadCashflowToday({ force: true });

  // Backward compatibility for any code still reading cf.items/cf.summary
  STATE.cashflow.items = STATE.cashflow.todayItems || [];
  STATE.cashflow.summary =
    STATE.cashflow.todaySummary || STATE.cashflow.summary || { salesCount: 0, salesMoney: 0 };

  updateCashflowPanel();
}, 5 * 60 * 1000);
