/**
 * warehouse_ui.js
 * Adds on-demand market price comparison buttons to inventory items.
 */

import { fetchMarketPrice } from "./market.js";
import { getRealmId } from "./auth.js";
import { COPY_BUTTON_SVG, escapeHtml, formatMoney, wireCopyButton } from "./utils.js";
import { t } from "./i18n.js";
import { storage } from "./data/storage.js";
import { observeMutations } from "./page/page_utils.js";
import {
  extractWarehousePageItems,
  findWarehouseSalesBuilderTarget,
  findWarehouseInventoryContainer,
  getOrCreateWarehouseMarketButton,
  isWarehouseOverviewPage,
  isWarehousePage,
} from "./page/warehouse_page.js";
import {
  fetchWarehouseInventoryItems,
  resolveWarehouseProductId,
  resetWarehouseInventoryCache,
  fetchWarehouseStockRows,
  WAREHOUSE_INVENTORY_CACHE_TTL_MS,
} from "./warehouse_inventory_service.js";

const SALES_BUILDER_ID = "scx-warehouse-sales-builder";
const SALES_BUILDER_COPY_ID = "scx-warehouse-sales-copy";
const SALES_BUILDER_STORAGE_DOMAIN = "warehouse-sales-builder";
const SALES_BUILDER_STORAGE_VERSION = 1;
const DEFAULT_MARGIN_PCT = 5;

const BUTTON_STATE_IDLE = "idle";
const BUTTON_STATE_LOADING = "loading";
const BUTTON_STATE_ERROR = "error";
const BUTTON_STATE_RESULT = "result";

const salesBuilderSettings = {
  marginPct: DEFAULT_MARGIN_PCT,
  productIds: [],
  selectedKeys: [],
  manualPrices: {},
};

let salesBuilderSettingsLoaded = false;
let salesBuilderRowsCache = [];
let suppressWarehouseObserverUntil = 0;
let injectInFlight = false;
let injectQueued = false;

function normalizeRowKey(row) {
  return row?.key || `${row?.kind}:${row?.quality}`;
}

function buildSalesFieldId(prefix, key) {
  return `${prefix}-${String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function suppressWarehouseObserver(ms = 250) {
  suppressWarehouseObserverUntil = Math.max(suppressWarehouseObserverUntil, Date.now() + ms);
}

function isWarehouseObserverSuppressed() {
  return Date.now() < suppressWarehouseObserverUntil;
}

function compactQuantity(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";

  const abs = Math.abs(amount);
  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];

  for (const unit of units) {
    if (abs >= unit.value) {
      const scaled = amount / unit.value;
      const rounded = Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "");
      return `${rounded}${unit.suffix}`;
    }
  }

  return Math.round(amount).toLocaleString("en-US");
}

function calculateMarginPrice(unitCost, marginPct) {
  const cost = Number(unitCost || 0);
  const margin = Number(marginPct || 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return cost * (1 + margin / 100);
}

function normalizePriceInput(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!raw) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function getRowPrice(row, settings = salesBuilderSettings) {
  const key = normalizeRowKey(row);
  const manualPrice = normalizePriceInput(settings.manualPrices?.[key]);
  if (manualPrice !== null) return manualPrice;
  return calculateMarginPrice(row.unitCost, settings.marginPct);
}

function hasManualPriceOverride(row, settings = salesBuilderSettings) {
  const key = normalizeRowKey(row);
  return normalizePriceInput(settings.manualPrices?.[key]) !== null;
}

function buildSellMessageLine(row, settings = salesBuilderSettings) {
  const price = getRowPrice(row, settings);
  if (!Number.isFinite(price) || price <= 0) return "";

  const quality = Math.round(Number(row.quality || 0));
  return `sell ${compactQuantity(row.amount)} :re-${row.kind}: Q${quality} @ ${formatMoney(price, { decimals: 2 })}`;
}

function buildSalesMessage(rows, settings = salesBuilderSettings) {
  const selectedKeys = new Set(settings.selectedKeys || []);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => selectedKeys.has(normalizeRowKey(row)))
    .map((row) => buildSellMessageLine(row, settings))
    .filter(Boolean)
    .join("\n");
}

async function hydrateSalesBuilderSettings() {
  const data = await storage.get({
    domain: SALES_BUILDER_STORAGE_DOMAIN,
    version: SALES_BUILDER_STORAGE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
  });

  if (data && typeof data === "object") {
    if (Number.isFinite(Number(data.marginPct))) {
      salesBuilderSettings.marginPct = Number(data.marginPct);
    }
    if (Array.isArray(data.productIds)) {
      salesBuilderSettings.productIds = data.productIds.map(Number).filter(Number.isFinite);
    }
    if (Array.isArray(data.selectedKeys)) {
      salesBuilderSettings.selectedKeys = data.selectedKeys.map(String);
    }
    if (data.manualPrices && typeof data.manualPrices === "object") {
      salesBuilderSettings.manualPrices = { ...data.manualPrices };
    }
  }

  salesBuilderSettingsLoaded = true;
}

function persistSalesBuilderSettings() {
  void storage.set({
    domain: SALES_BUILDER_STORAGE_DOMAIN,
    version: SALES_BUILDER_STORAGE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    data: {
      marginPct: salesBuilderSettings.marginPct,
      productIds: salesBuilderSettings.productIds,
      selectedKeys: salesBuilderSettings.selectedKeys,
      manualPrices: salesBuilderSettings.manualPrices,
    },
  });
}

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
  const { sourcingCost, weightedQuality } = item;
  const productId = resolveWarehouseProductId(item);

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
    console.debug(`[WarehouseUI] Failed to fetch price for ${item.name}:`, error);
    setButtonDisplayState(button, {
      state: BUTTON_STATE_ERROR,
      text: t("genericError"),
      disabled: true,
    });
    scheduleReset(button, originalText, 3000);
  }
}

function getSelectedProductRows(rows, settings = salesBuilderSettings) {
  const productIds = new Set((settings.productIds || []).map(Number));
  return (Array.isArray(rows) ? rows : []).filter((row) => productIds.has(Number(row.kind)));
}

function renderSalesBuilderRows(rows, allRows) {
  const selectedKeys = new Set(salesBuilderSettings.selectedKeys || []);

  if (allRows.length > 0 && rows.length === 0) {
    return `<div class="scx-warehouse-sales-empty">${t("warehouseSalesChooseProducts")}</div>`;
  }

  if (allRows.length === 0) {
    return `<div class="scx-warehouse-sales-empty">${t("warehouseSalesNoStock")}</div>`;
  }

  return `
    <div class="scx-warehouse-sales-table-scroll">
      <div class="scx-warehouse-sales-table">
        <div class="scx-warehouse-sales-table-head">
          <span></span>
          <span>${t("product")}</span>
          <span>${t("qty")}</span>
          <span>${t("maQuality")}</span>
          <span>${t("unitCostLabel")}</span>
          <span>${t("margin")}</span>
          <span>${t("warehouseSalesPrice")}</span>
        </div>
        ${rows
          .map((row) => {
            const key = normalizeRowKey(row);
            const priceInputId = buildSalesFieldId("scx-warehouse-sales-price", key);
            const selectInputId = buildSalesFieldId("scx-warehouse-sales-select", key);
            const selected = selectedKeys.has(key) ? " checked" : "";
            const manualValue = salesBuilderSettings.manualPrices[key] ?? "";
            const price = getRowPrice(row);
            const messagePreview = buildSellMessageLine(row);
            const showReset = hasManualPriceOverride(row);

            return `
              <label class="scx-warehouse-sales-row" data-row-key="${escapeHtml(key)}">
                <input
                  id="${escapeHtml(selectInputId)}"
                  name="${escapeHtml(selectInputId)}"
                  class="scx-warehouse-sales-check"
                  data-sales-action="select"
                  data-row-key="${escapeHtml(key)}"
                  type="checkbox"${selected}
                >
                <span class="scx-warehouse-sales-product">${escapeHtml(row.name)}</span>
                <span>${compactQuantity(row.amount)}</span>
                <span>Q${Math.round(Number(row.quality || 0))}</span>
                <span>${formatMoney(row.unitCost || 0, { decimals: 2 })}</span>
                <span>${Number(salesBuilderSettings.marginPct || 0)
                  .toFixed(1)
                  .replace(/\.0$/, "")}%</span>
                <span class="scx-warehouse-sales-price-cell">
                  <input
                    id="${escapeHtml(priceInputId)}"
                    name="${escapeHtml(priceInputId)}"
                    class="scx-warehouse-sales-price"
                    data-sales-action="manual-price"
                    data-row-key="${escapeHtml(key)}"
                    type="text"
                    inputmode="decimal"
                    value="${escapeHtml(manualValue)}"
                    placeholder="${escapeHtml(formatMoney(price, { decimals: 2, prefix: false }))}"
                    aria-label="${escapeHtml(t("warehouseSalesPrice"))}"
                  >
                  ${
                    showReset
                      ? `<button
                    class="scx-chip scx-warehouse-sales-reset"
                    data-sales-action="reset-price"
                    data-row-key="${escapeHtml(key)}"
                    type="button"
                  >${escapeHtml(t("maReset"))}</button>`
                      : ""
                  }
                </span>
                <span class="scx-warehouse-sales-preview">${escapeHtml(messagePreview)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function updateSalesBuilderCopyState(container, rows) {
  const message = buildSalesMessage(rows);
  const copyButton = container.querySelector(`#${SALES_BUILDER_COPY_ID}`);
  const output = container.querySelector("[data-sales-output]");

  if (copyButton) {
    copyButton.disabled = message.length === 0;
  }
  if (output) {
    output.textContent = message || t("warehouseSalesSelectItems");
  }
}

function attachSalesBuilderHandlers(container, rows) {
  wireCopyButton(container, () => buildSalesMessage(rows));

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const action = target.getAttribute("data-sales-action");
    if (action !== "reset-price") return;

    const key = target.getAttribute("data-row-key");
    if (!key) return;

    delete salesBuilderSettings.manualPrices[key];
    persistSalesBuilderSettings();
    void renderSalesBuilder(salesBuilderRowsCache);
  });

  container.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const action = target.getAttribute("data-sales-action");
    if (action === "select") {
      const key = target.getAttribute("data-row-key");
      if (!key) return;
      const selectedKeys = new Set(salesBuilderSettings.selectedKeys || []);
      if (target.checked) {
        selectedKeys.add(key);
      } else {
        selectedKeys.delete(key);
      }
      salesBuilderSettings.selectedKeys = Array.from(selectedKeys);
      persistSalesBuilderSettings();
      updateSalesBuilderCopyState(container, rows);
      return;
    }

    if (action === "margin") {
      const nextMargin = Number(target.value);
      if (!Number.isFinite(nextMargin)) return;

      salesBuilderSettings.marginPct = nextMargin;
      persistSalesBuilderSettings();
      void renderSalesBuilder(salesBuilderRowsCache);
    }
  });

  container.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const action = target.getAttribute("data-sales-action");
    if (action === "manual-price") {
      const key = target.getAttribute("data-row-key");
      if (!key) return;

      const value = target.value.trim();
      if (value) {
        salesBuilderSettings.manualPrices[key] = value;
      } else {
        delete salesBuilderSettings.manualPrices[key];
      }
      persistSalesBuilderSettings();
      updateSalesBuilderCopyState(container, rows);
    }
  });
}

async function renderSalesBuilder(existingRows = null) {
  if (!isWarehouseOverviewPage(window.location.pathname)) {
    document.getElementById(SALES_BUILDER_ID)?.remove();
    return;
  }

  if (!salesBuilderSettingsLoaded) return;

  const target = findWarehouseSalesBuilderTarget(document);
  if (!target?.parentEl) return;

  const rows = existingRows || salesBuilderRowsCache;
  if (!rows.length && existingRows === null) return;

  salesBuilderRowsCache = rows;
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)) || Number(a.quality) - Number(b.quality));
  const visibleRows = getSelectedProductRows(rows);

  suppressWarehouseObserver();
  document.getElementById(SALES_BUILDER_ID)?.remove();

  const container = document.createElement("div");
  container.id = SALES_BUILDER_ID;
  container.className = "scx-warehouse-sales-builder";
  container.innerHTML = `
    <div class="scx-panel-head">
      <div class="scx-panel-title">${t("warehouseSalesBuilder")}</div>
    </div>
    <div class="scx-warehouse-sales-controls">
      <label class="scx-label" for="scx-warehouse-sales-margin">${t("warehouseSalesMargin")}</label>
      <input
        id="scx-warehouse-sales-margin"
        name="scx-warehouse-sales-margin"
        class="scx-select scx-warehouse-sales-margin"
        data-sales-action="margin"
        type="number"
        step="0.5"
        value="${escapeHtml(salesBuilderSettings.marginPct)}"
      >
    </div>
    ${renderSalesBuilderRows(visibleRows, rows)}
    <div class="scx-warehouse-sales-footer">
      <pre class="scx-warehouse-sales-output" data-sales-output></pre>
      <button
        id="${SALES_BUILDER_COPY_ID}"
        class="scx-copy-btn scx-warehouse-sales-copy-btn"
        data-tooltip="${t("warehouseSalesCopyTooltip")}"
        type="button"
      >${COPY_BUTTON_SVG}</button>
    </div>
  `;

  if (target.afterNode?.nextSibling) {
    target.parentEl.insertBefore(container, target.afterNode.nextSibling);
  } else {
    target.parentEl.appendChild(container);
  }
  attachSalesBuilderHandlers(container, visibleRows);
  updateSalesBuilderCopyState(container, visibleRows);
}

function getSelectedProductIds() {
  return new Set((salesBuilderSettings.productIds || []).map(Number));
}

function removeSelectedKeysForProduct(kind) {
  const prefix = `${kind}:`;
  salesBuilderSettings.selectedKeys = (salesBuilderSettings.selectedKeys || []).filter(
    (key) => !key.startsWith(prefix),
  );
}

function syncSalesToggles() {
  const selectedProductIds = getSelectedProductIds();
  for (const input of document.querySelectorAll("[data-scx-sales-product-toggle]")) {
    const kind = Number(input.getAttribute("data-product-id"));
    input.checked = selectedProductIds.has(kind);
  }
}

function getOrCreateSalesProductToggle(cardElement, item) {
  if (!isWarehouseOverviewPage(window.location.pathname)) return null;

  const wrapper = cardElement.closest("[data-scx-market-wrapper]");
  if (!wrapper) return null;

  const productId = resolveWarehouseProductId(item);
  if (!productId) return null;

  let toggle = wrapper.querySelector("[data-scx-sales-product-toggle]");
  if (!toggle) {
    const label = document.createElement("label");
    label.className = "scx-warehouse-sales-toggle";
    label.title = t("warehouseSalesToggleProduct");

    toggle = document.createElement("input");
    const toggleId = buildSalesFieldId("scx-warehouse-sales-toggle", productId);
    toggle.type = "checkbox";
    toggle.id = toggleId;
    toggle.name = toggleId;
    toggle.setAttribute("data-scx-sales-product-toggle", "true");
    toggle.setAttribute("data-product-id", String(productId));
    toggle.setAttribute("aria-label", t("warehouseSalesToggleProduct"));

    const text = document.createElement("span");
    text.textContent = t("warehouseSalesToggleShort");

    label.appendChild(toggle);
    label.appendChild(text);
    wrapper.appendChild(label);
  }

  toggle.checked = getSelectedProductIds().has(productId);

  if (!toggle.dataset.listenerAttached) {
    toggle.addEventListener("change", () => {
      const selectedProductIds = getSelectedProductIds();
      if (toggle.checked) {
        selectedProductIds.add(productId);
      } else {
        selectedProductIds.delete(productId);
        removeSelectedKeysForProduct(productId);
      }

      salesBuilderSettings.productIds = Array.from(selectedProductIds);
      persistSalesBuilderSettings();
      void renderSalesBuilder(salesBuilderRowsCache);
    });
    toggle.dataset.listenerAttached = "true";
  }

  return toggle;
}

async function injectMarketButtons() {
  const domItems = extractWarehousePageItems(document);
  const apiItems = await fetchWarehouseInventoryItems();
  suppressWarehouseObserver(500);

  const apiItemsByKind = new Map();
  for (const apiItem of apiItems) {
    apiItemsByKind.set(apiItem.kind, apiItem);
  }

  for (const domItem of domItems) {
    const apiItem = apiItemsByKind.get(resolveWarehouseProductId(domItem));
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

    getOrCreateSalesProductToggle(domItem.element, domItem);
  }

  syncSalesToggles();
  salesBuilderRowsCache = await fetchWarehouseStockRows(domItems);
  void renderSalesBuilder(salesBuilderRowsCache);
}

async function queueInjectMarketButtons() {
  if (injectInFlight) {
    injectQueued = true;
    return;
  }

  injectInFlight = true;
  try {
    suppressWarehouseObserver();
    await injectMarketButtons();
  } finally {
    injectInFlight = false;
    if (injectQueued) {
      injectQueued = false;
      void queueInjectMarketButtons();
    }
  }
}

export function initWarehouseHelper() {
  void hydrateSalesBuilderSettings().then(() => {
    if (isWarehouseOverviewPage(window.location.pathname) && salesBuilderRowsCache.length > 0) {
      void renderSalesBuilder(salesBuilderRowsCache);
    }
  });

  let observerActive = false;
  let stopInventoryObserver = null;
  let urlCheckInterval = null;
  let debounceTimer = null;

  function debouncedInject() {
    if (isWarehouseObserverSuppressed()) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isWarehouseObserverSuppressed()) return;
      void queueInjectMarketButtons();
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

    void queueInjectMarketButtons();
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
  buildSalesMessage,
  buildSellMessageLine,
  calculateMarginPrice,
  compactQuantity,
  hasManualPriceOverride,
  getSelectedProductRows,
  fetchInventoryItems: fetchWarehouseInventoryItems,
  fetchStockRows: fetchWarehouseStockRows,
  INVENTORY_CACHE_TTL_MS: WAREHOUSE_INVENTORY_CACHE_TTL_MS,
  renderSalesBuilder,
  injectMarketButtons,
  resetInventoryCache() {
    resetWarehouseInventoryCache();
    salesBuilderRowsCache = [];
  },
  setSalesBuilderSettingsForTest(nextSettings) {
    Object.assign(salesBuilderSettings, {
      marginPct: DEFAULT_MARGIN_PCT,
      productIds: [],
      selectedKeys: [],
      manualPrices: {},
      ...(nextSettings || {}),
    });
    salesBuilderSettingsLoaded = true;
  },
};
