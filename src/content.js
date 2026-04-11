// content.js
// Thin composition root for content startup.
import { initializeDataPlatform } from "./data/index.js";
import { bootstrapFeatureRegistry } from "./content_registry.js";
import { runStartupServices } from "./content_startup.js";
import { setupRetailInteractionListeners, startRecurringRefreshServices } from "./content_refresh.js";

async function init() {
  await initializeDataPlatform();
  bootstrapFeatureRegistry();
  await runStartupServices();
}

init();
setupRetailInteractionListeners();
startRecurringRefreshServices();
