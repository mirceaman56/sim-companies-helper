import { runDataMigrations } from "./migrations.js";

let initialized = false;

export async function initializeDataPlatform({ force = false } = {}) {
  if (initialized && !force) return;
  await runDataMigrations({ force });
  initialized = true;
}

export { apiClient, request, getRateLimitStatus } from "./apiClient.js";
export { storage, get, set, remove, listByPrefix, migrate } from "./storage.js";
export { resolveScope, resolveScopeSync } from "./scope.js";
export { runDataMigrations } from "./migrations.js";
