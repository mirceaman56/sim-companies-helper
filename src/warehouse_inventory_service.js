import recipes from "./resources/recipes.json";
import { loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";

export const WAREHOUSE_INVENTORY_CACHE_TTL_MS = 5000;
const INVENTORY_MAX_FETCH_ATTEMPTS = 2;
const INVENTORY_LOG_COOLDOWN_MS = 60000;
const RETRYABLE_INVENTORY_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);

let cachedInventoryItems = [];
let inventoryFetchedAt = 0;
let inventoryFetchPromise = null;
const inventoryLogTimestamps = new Map();

function buildRecipeMaps() {
  const kindToRecipe = new Map();
  const nameToKind = new Map();

  for (const recipe of recipes) {
    kindToRecipe.set(recipe.id, recipe);
    nameToKind.set(recipe.name, recipe.id);
  }

  return { kindToRecipe, nameToKind };
}

const { kindToRecipe, nameToKind } = buildRecipeMaps();

function getProductNameByKind(kind) {
  return kindToRecipe.get(kind)?.name || null;
}

export function getWarehouseProductIdByName(name) {
  return nameToKind.get(name) || null;
}

function shouldRetryInventoryStatus(status) {
  return RETRYABLE_INVENTORY_STATUS.has(status);
}

function logInventory(level, message) {
  const now = Date.now();
  const key = `${level}:${message}`;
  const lastLoggedAt = inventoryLogTimestamps.get(key) || 0;
  if (now - lastLoggedAt < INVENTORY_LOG_COOLDOWN_MS) return;

  inventoryLogTimestamps.set(key, now);
  const fullMessage = `[WarehouseUI] ${message}`;

  if (level === "warn") {
    console.warn(fullMessage);
    return;
  }
  if (level === "error") {
    console.error(fullMessage);
    return;
  }
  console.debug(fullMessage);
}

async function fetchInventoryResponse(companyId) {
  const url = `https://www.simcompanies.com/api/v3/resources/${companyId}/`;
  let lastError = null;

  for (let attempt = 1; attempt <= INVENTORY_MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const data = await request("inventory", {
        url,
        credentials: "include",
        responseType: "json",
        retries: 0,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return data;
        },
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const shouldRetry = shouldRetryInventoryStatus(status) && attempt < INVENTORY_MAX_FETCH_ATTEMPTS;

      if (!shouldRetry) {
        return {
          ok: false,
          status: status || 500,
          async json() {
            return null;
          },
        };
      }
    }
  }

  throw lastError || new Error("Inventory fetch failed");
}

export async function fetchWarehouseInventoryItems() {
  const now = Date.now();
  if (now - inventoryFetchedAt < WAREHOUSE_INVENTORY_CACHE_TTL_MS) {
    return cachedInventoryItems;
  }

  if (inventoryFetchPromise) {
    return inventoryFetchPromise;
  }

  inventoryFetchPromise = (async () => {
    try {
      await loadAuthDataOnce();

      const companyId = STATE.auth.companyId;
      if (!companyId) {
        logInventory("debug", "Cannot fetch inventory: no company ID");
        return cachedInventoryItems.length ? cachedInventoryItems : [];
      }

      const response = await fetchInventoryResponse(companyId);
      if (!response.ok) {
        const level =
          response.status === 400 || shouldRetryInventoryStatus(response.status) ? "debug" : "warn";
        logInventory(level, `Failed to fetch inventory: ${response.status}`);
        return cachedInventoryItems.length ? cachedInventoryItems : [];
      }

      const rawItems = await response.json();
      const kindStats = new Map();

      for (const item of rawItems || []) {
        const { kind, amount, quality } = item;

        if (!kindStats.has(kind)) {
          kindStats.set(kind, { kind, totalAmount: 0, qualityWeightSum: 0 });
        }

        const entry = kindStats.get(kind);
        entry.totalAmount += amount;
        entry.qualityWeightSum += quality * amount;
      }

      const items = [];
      for (const [kind, entry] of kindStats.entries()) {
        const productName = getProductNameByKind(kind);
        if (!productName) continue;

        items.push({
          kind,
          name: productName,
          totalAmount: entry.totalAmount,
          weightedQuality: entry.qualityWeightSum / entry.totalAmount,
        });
      }

      const shouldUpdateCache = items.length > 0 || (rawItems || []).length === 0;
      if (shouldUpdateCache) {
        cachedInventoryItems = items;
        inventoryFetchedAt = Date.now();
      }

      return items;
    } catch (error) {
      logInventory("warn", `Error fetching inventory: ${error?.message || "unknown error"}`);
      return cachedInventoryItems;
    } finally {
      inventoryFetchPromise = null;
    }
  })();

  return inventoryFetchPromise;
}

export function resetWarehouseInventoryCache() {
  cachedInventoryItems = [];
  inventoryFetchedAt = 0;
  inventoryFetchPromise = null;
  inventoryLogTimestamps.clear();
}
