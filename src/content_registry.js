// Adding a feature = one FEATURES entry. `section.update` renders the panel on expand; `init`
// runs once. Initializers are isolated: one throwing never stops the others.
import { ensureSidebarContainer, ensureFooter, registerSection, setSectionUpdateFn } from "./sidebar.js";
import { t } from "./i18n.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updateProductionPanel, setupProductionRowListeners } from "./production_ui.js";
import { updatePanel as updateRetailPanel } from "./retail_ui.js";
import { initExecutiveHelper, updateExecutivePanel } from "./executive_ui.js";
import { updateMarketAlertsPanel } from "./market_ui.js";
import { initChatFilter, updateChatFilterPanel } from "./chat_filter_ui.js";
import { initContractHelper } from "./contract_ui.js";
import { initWarehouseHelper } from "./warehouse_ui.js";
import { initUpgradeBuyMessage } from "./upgrade_ui.js";
import { initXpWidget } from "./xp_ui.js";
import { initAccountingWidget } from "./accounting_ui.js";
import { initWhatsNew } from "./whats_new_ui.js";
import { initApiHealthBanner } from "./api_health_banner.js";
import { initAccessibility } from "./accessibility_ui.js";

/**
 * @typedef {{ id: string, titleKey: string, icon: string, update?: () => unknown }} SidebarSection
 * @typedef {{ id: string, section?: SidebarSection, init?: () => unknown }} Feature
 */

/** Sidebar order = array order. @type {Feature[]} */
const FEATURES = [
  {
    id: "production",
    section: {
      id: "production-section",
      titleKey: "productionHelper",
      icon: "⚙️",
      update: updateProductionPanel,
    },
    // Attach listeners before users can interact with production rows.
    init: setupProductionRowListeners,
  },
  {
    id: "retail",
    section: { id: "retail-section", titleKey: "retailHelper", icon: "🏪", update: updateRetailPanel },
  },
  {
    id: "cashflow",
    section: {
      id: "cashflow-section",
      titleKey: "financialsHelper",
      icon: "💲",
      update: updateCashflowPanel,
    },
  },
  {
    id: "market-alerts",
    section: {
      id: "market-alerts-section",
      titleKey: "marketAlerts",
      icon: "🔔",
      update: updateMarketAlertsPanel,
    },
  },
  {
    id: "chat",
    section: { id: "chat-section", titleKey: "chatFilter", icon: "💬", update: updateChatFilterPanel },
    init: initChatFilter,
  },
  {
    id: "executive",
    section: {
      id: "executive-section",
      titleKey: "executiveHelper",
      icon: "👔",
      update: updateExecutivePanel,
    },
    init: initExecutiveHelper,
  },
  {
    id: "whats-new",
    // initWhatsNew registers its own update fn and shows the post-update toast once.
    section: { id: "whats-new-section", titleKey: "whatsNewSectionTitle", icon: "✨" },
    init: initWhatsNew,
  },
  // Top-bar switch; map tags and game high contrast only while it is on (or the OS asks).
  { id: "accessibility", init: initAccessibility },
  { id: "contract", init: initContractHelper },
  { id: "warehouse", init: initWarehouseHelper },
  { id: "upgrade", init: initUpgradeBuyMessage },
  { id: "xp-widget", init: initXpWidget },
  { id: "accounting-widget", init: initAccountingWidget },
];

function runIsolated(id, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.error(`[SimHelper] Feature "${id}" init failed:`, error));
    }
  } catch (error) {
    console.error(`[SimHelper] Feature "${id}" init failed:`, error);
  }
}

/**
 * Bootstrap sidebar shell + feature registrations.
 * @param {Feature[]} [features]
 */
export function bootstrapFeatureRegistry(features = FEATURES) {
  ensureSidebarContainer();
  runIsolated("api-health-banner", initApiHealthBanner);

  for (const { section } of features) {
    if (section) registerSection(section.id, t(section.titleKey), section.icon);
  }
  ensureFooter();

  for (const { section } of features) {
    if (section?.update) setSectionUpdateFn(section.id, section.update);
  }
  for (const { id, init } of features) {
    if (init) runIsolated(id, init);
  }
}

export const _testUtils = {
  FEATURES,
  SIDEBAR_SECTIONS: FEATURES.filter((f) => f.section).map((f) => f.section),
};
