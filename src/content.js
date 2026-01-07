// content.js
// Main entry point for the Chrome extension - handles initialization and event delegation
import { loadAuthDataOnce } from "./auth.js";
import { scheduleUpdate } from "./utils.js";
import { loadInventoryOnce } from "./warehouse.js";
import { loadCashflowToday } from "./cashflow.js";
import { ensureSidebar, updatePanel, RetailHelper } from "./retail_ui.js";
import { ensureSidebarContainer, registerSection, setSectionUpdateFn } from "./sidebar.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateProductionPanel, setupProductionRowListeners } from "./production_ui.js";
import { initRecipeExtractor } from "./recipe_extractor.js";

async function init() {
  // Initialize the sidebar container
  ensureSidebarContainer();

  // Register sections
  ensureSidebar(); // Retail Helper section
  registerSection("cashflow-section", "Financials Helper", "💰");
  registerSection("production-section", "Production Helper", "🏭");

  // Set up update functions
  setSectionUpdateFn("cashflow-section", updateCashflowPanel);
  setSectionUpdateFn("production-section", updateProductionPanel);

  // Load initial data
  await loadAuthDataOnce();
  await loadInventoryOnce();
  await loadCashflowToday();

  // Setup row listeners
  setupProductionRowListeners();

  scheduleUpdate(() => updatePanel());
  RetailHelper.autoSelectFirstRow(() => updatePanel());
}

init();

// Initialize recipe extractor on encyclopedia pages
// initRecipeExtractor();

// Event listeners for retail helper
window.addEventListener("focusin", (e) => RetailHelper.onFocusOrClick(e, () => updatePanel()), true);
window.addEventListener("click", (e) => RetailHelper.onFocusOrClick(e, () => updatePanel()), true);

// Optional: Auto-refresh cashflow periodically (every 5 minutes)
setInterval(async () => {
  await loadCashflowToday({ force: true });
  updateCashflowPanel();
}, 5 * 60 * 1000);


