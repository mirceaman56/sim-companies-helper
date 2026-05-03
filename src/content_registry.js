// content_registry.js
// Sidebar bootstrap + feature registration wiring.
import { ensureSidebarContainer, ensureFooter, registerSection, setSectionUpdateFn } from "./sidebar.js";
import { t } from "./i18n.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateProductionPanel, setupProductionRowListeners } from "./production_ui.js";
import { updatePanel as updateRetailPanel } from "./retail_ui.js";
import { updateExecutivePanel } from "./executive_ui.js";
import { updateMarketAlertsPanel } from "./market_ui.js";
import { initChatFilter, updateChatFilterPanel } from "./chat_filter_ui.js";
import { initContractHelper } from "./contract_ui.js";
import { initWarehouseHelper } from "./warehouse_ui.js";
import { initUpgradeBuyMessage } from "./upgrade_ui.js";
import { initXpWidget } from "./xp_ui.js";
import { initWhatsNewToast } from "./whats_new_ui.js";

/**
 * @typedef {{id: string, titleKey: string, icon: string}} SidebarSection
 */

/** @type {SidebarSection[]} */
const SIDEBAR_SECTIONS = [
  { id: "production-section", titleKey: "productionHelper", icon: "⚙️" },
  { id: "retail-section", titleKey: "retailHelper", icon: "🏪" },
  { id: "cashflow-section", titleKey: "financialsHelper", icon: "💲" },
  { id: "market-alerts-section", titleKey: "marketAlerts", icon: "🔔" },
  { id: "chat-section", titleKey: "chatFilter", icon: "💬" },
  { id: "executive-section", titleKey: "executiveHelper", icon: "👔" },
];

/**
 * Bootstrap sidebar shell + feature registrations.
 */
export function bootstrapFeatureRegistry() {
  ensureSidebarContainer();
  initWhatsNewToast();

  for (const section of SIDEBAR_SECTIONS) {
    registerSection(section.id, t(section.titleKey), section.icon);
  }

  ensureFooter();

  setSectionUpdateFn("cashflow-section", updateCashflowPanel);
  setSectionUpdateFn("production-section", updateProductionPanel);
  setSectionUpdateFn("retail-section", updateRetailPanel);
  setSectionUpdateFn("executive-section", updateExecutivePanel);
  setSectionUpdateFn("market-alerts-section", updateMarketAlertsPanel);
  setSectionUpdateFn("chat-section", updateChatFilterPanel);

  // Static one-time feature initializers.
  initChatFilter();
  initContractHelper();
  initWarehouseHelper();
  initUpgradeBuyMessage();
  initXpWidget();

  // Attach listeners before users can interact with production rows.
  setupProductionRowListeners();
}

export const _testUtils = {
  SIDEBAR_SECTIONS,
};
