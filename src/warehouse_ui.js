/**
 * warehouse_ui.js
 * Adds on-demand market price comparison buttons to inventory items.
 */

import { fetchMarketPrice } from "./market.js";
import { getRealmId } from "./auth.js";
import { formatMoney } from "./utils.js";
import { t } from "./i18n.js";
import { observeMutations } from "./page/page_utils.js";
import {
  extractWarehousePageItems,
  findWarehouseInventoryContainer,
  getOrCreateWarehouseMarketButton,
  isWarehousePage,
} from "./page/warehouse_page.js";
import {
  fetchWarehouseInventoryItems,
  getWarehouseProductIdByName,
  resetWarehouseInventoryCache,
  WAREHOUSE_INVENTORY_CACHE_TTL_MS,
} from "./warehouse_inventory_service.js";

const BUTTON_STATE_IDLE = "idle";
const BUTTON_STATE_LOADING = "loading";
const BUTTON_STATE_ERROR = "error";
const BUTTON_STATE_RESULT = "result";

function setButtonDisplayState(button, { state, text, disabled = false, delta = "neutral" }) {
  button.textContent = text;
  button.dataset.state = state;
  button.dataset.delta = delta;
  button.disabled = disabled;
}

function resetButton(button, text) {
  setButtonDisplayState(button, {
    state: BUTTON_STATE_IDLE,
    text,
    disabled: false,
    delta: "neutral",
  });
}

function scheduleReset(button, originalText, delayMs) {
  setTimeout(() => {
    resetButton(button, originalText);
  }, delayMs);
}

async function handleMarketButtonClick(button, item) {
  const { name, sourcingCost, weightedQuality } = item;
  const productId = getWarehouseProductIdByName(name);

  if (!productId) {
    setButtonDisplayState(button, {
      state: BUTTON_STATE_ERROR,
      text: t("warehouseNotFound"),
      disabled: true,
    });
    scheduleReset(button, t("warehouseMarketPrice"), 2000);
    return;
  }

  const originalText = button.textContent;
  setButtonDisplayState(button, {
    state: BUTTON_STATE_LOADING,
    text: t("warehouseLoading"),
    disabled: true,
  });

  try {
    const realmId = getRealmId();
    const marketPrice = await fetchMarketPrice(realmId, productId, weightedQuality);

    if (marketPrice === null) {
      setButtonDisplayState(button, {
        state: BUTTON_STATE_ERROR,
        text: t("warehouseNoPrice"),
        disabled: true,
      });
      scheduleReset(button, originalText, 3000);
      return;
    }

    const diff = marketPrice - sourcingCost;
    const pct = sourcingCost > 0 ? (diff / sourcingCost) * 100 : 0;
    const sign = diff >= 0 ? "+" : "";
    const delta = diff < 0 ? "good" : diff > 0 ? "bad" : "neutral";

    setButtonDisplayState(button, {
      state: BUTTON_STATE_RESULT,
      text: `${sign}${formatMoney(diff)} (${sign}${pct.toFixed(1)}%)`,
      disabled: true,
      delta,
    });

    scheduleReset(button, originalText, 10000);
  } catch (error) {
    console.debug(`[WarehouseUI] Failed to fetch price for ${name}:`, error);
    setButtonDisplayState(button, {
      state: BUTTON_STATE_ERROR,
      text: t("genericError"),
      disabled: true,
    });
    scheduleReset(button, originalText, 3000);
  }
}

async function injectMarketButtons() {
  const domItems = extractWarehousePageItems(document);
  const apiItems = await fetchWarehouseInventoryItems();

  const apiItemsByName = new Map();
  for (const apiItem of apiItems) {
    apiItemsByName.set(apiItem.name, apiItem);
  }

  for (const domItem of domItems) {
    const apiItem = apiItemsByName.get(domItem.name);
    if (apiItem) {
      domItem.weightedQuality = apiItem.weightedQuality;
      domItem.totalAmount = apiItem.totalAmount;
    } else {
      domItem.weightedQuality = domItem.quality;
    }

    const button = getOrCreateWarehouseMarketButton(domItem.element, {
      buttonText: t("warehouseMarketPrice"),
      buttonTitle: t("warehouseCheckMarketPrice"),
    });

    if (!button.dataset.listenerAttached) {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleMarketButtonClick(button, domItem);
      });
      button.dataset.listenerAttached = "true";
      resetButton(button, t("warehouseMarketPrice"));
    }
  }
}

export function initWarehouseHelper() {
  let observerActive = false;
  let stopInventoryObserver = null;
  let urlCheckInterval = null;
  let debounceTimer = null;

  function debouncedInject() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void injectMarketButtons();
    }, 500);
  }

  function startObserver() {
    if (observerActive) return;
    observerActive = true;

    const inventoryContainer = findWarehouseInventoryContainer(document);
    stopInventoryObserver = observeMutations(inventoryContainer, debouncedInject, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    void injectMarketButtons();
  }

  function stopObserver() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (stopInventoryObserver) {
      stopInventoryObserver();
      stopInventoryObserver = null;
    }
    observerActive = false;
  }

  function monitorNavigation() {
    let lastUrl = window.location.href;

    urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;
      lastUrl = currentUrl;

      if (isWarehousePage(window.location.pathname)) {
        startObserver();
      } else if (observerActive) {
        stopObserver();
      }
    }, 1000);
  }

  window.addEventListener("beforeunload", () => {
    if (urlCheckInterval) clearInterval(urlCheckInterval);
    stopObserver();
  });

  monitorNavigation();
  if (isWarehousePage(window.location.pathname)) {
    startObserver();
  }
}

export const _testUtils = {
  fetchInventoryItems: fetchWarehouseInventoryItems,
  INVENTORY_CACHE_TTL_MS: WAREHOUSE_INVENTORY_CACHE_TTL_MS,
  resetInventoryCache() {
    resetWarehouseInventoryCache();
  },
};
