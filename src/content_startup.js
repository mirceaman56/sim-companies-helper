// why: auth first (every /me/ call and storage scope needs it), then independent loads in
// parallel so a slow finance pagination never delays the navbar chips.
import { loadAuthDataOnce } from "./auth.js";
import { loadInventoryOnce } from "./warehouse.js";
import { loadFinanceData } from "./cashflow.js";
import { loadBuildings, cleanupLegacyBuildingsCache } from "./buildings.js";
import { initMarketAlerts } from "./market_ui.js";
import { updateXpWidget } from "./xp_ui.js";
import { updateAccountingWidget } from "./accounting_ui.js";
import { loadExecutivesOnce } from "./executives.js";
import { loadBondsOnce } from "./bonds.js";
import { updateCashflowPanel } from "./cashflow_ui.js";
import { updatePanel as updateRetailPanel, RetailHelper } from "./retail_ui.js";
import { scheduleUpdate } from "./utils.js";
import { STATE } from "./state.js";

/**
 * Run startup loading and post-load wiring. Never throws: every phase logs its own failure.
 * @param {{state?: typeof STATE, warn?: typeof console.warn, error?: typeof console.error}} [options]
 */
export async function runStartupServices(options = {}) {
  const { state = STATE, warn = console.warn, error = console.error } = options;

  /** Run one phase; report its STATE error (soft failure) or exception (hard failure). */
  const phase = async (label, fn, stateKey) => {
    try {
      await fn();
      if (stateKey && state[stateKey]?.error) warn(`[SimHelper] ${label} failed:`, state[stateKey].error);
    } catch (e) {
      error(`[SimHelper] ${label} crashed:`, e);
    }
  };

  await phase("Auth", loadAuthDataOnce, "auth");
  await phase("Buildings cache cleanup", cleanupLegacyBuildingsCache);

  const buildings = phase("Buildings", loadBuildings, "buildings").then(updateXpWidget);
  const accountingInputs = Promise.all([
    buildings,
    phase("Executives", loadExecutivesOnce, "executives"),
    phase("Bonds", loadBondsOnce, "bonds"),
  ]).then(updateAccountingWidget);

  await Promise.all([
    phase("Inventory", loadInventoryOnce, "inventory"),
    phase("Cashflow", () => loadFinanceData(), "cashflow").then(updateCashflowPanel),
    buildings,
    accountingInputs,
    phase("Market alerts", initMarketAlerts),
  ]);

  // Retail needs inventory + executives, both settled above.
  const renderRetailSoon = () => scheduleUpdate(updateRetailPanel);
  renderRetailSoon();
  RetailHelper.autoSelectFirstRow(renderRetailSoon);
}
