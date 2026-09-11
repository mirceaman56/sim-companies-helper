// content.js
// Thin composition root for content startup.
import { initializeDataPlatform, initApiHealthSync } from "./data/index.js";
import { initAuthContextSync } from "./auth_sync.js";
import { bootstrapFeatureRegistry } from "./content_registry.js";
import { runStartupServices } from "./content_startup.js";
import { setupRetailInteractionListeners, startRecurringRefreshServices } from "./content_refresh.js";

async function init() {
  await initializeDataPlatform();
  // Restore a cooldown from before this page load (or another tab) before any
  // feature starts calling the game API.
  await initApiHealthSync();
  initAuthContextSync();
  bootstrapFeatureRegistry();
  await runStartupServices();
}

init();
setupRetailInteractionListeners();
startRecurringRefreshServices();
