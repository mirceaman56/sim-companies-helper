import { t } from "./i18n.js";
import { formatMoney, COPY_BUTTON_SVG, wireCopyButton } from "./utils.js";
import { storage } from "./data/storage.js";
import { loadAuthDataOnce, getRealmId } from "./auth.js";
import { fetchMarketPrice } from "./market.js";
import { observeDocumentBody } from "./page/page_utils.js";
import {
  areUpgradePricesPopulated,
  findUpgradeModal,
  getUpgradeInjectionTarget,
  parseUpgradeResourceRows,
} from "./page/upgrade_page.js";

const CONTAINER_ID = "scx-upgrade-buy-msg";
const MESSAGE_ID = "scx-upgrade-msg-text";
const DISCOUNT_SELECT_ID = "scx-upgrade-discount-select";
const MULTIPLIER_SELECT_ID = "scx-upgrade-multiplier-select";
const STORAGE_KEY = "scx-upgrade-discount";
const STORAGE_KEY_MULTIPLIER = "scx-upgrade-multiplier";
const STORAGE_DOMAIN_DISCOUNT = "upgrade-discount";
const STORAGE_DOMAIN_MULTIPLIER = "upgrade-multiplier";
const STORAGE_VERSION = 1;
const MAX_MULTIPLIER = 15;

let discountPct = 0;
let multiplier = 1;
let upgradeResourceState = createEmptyUpgradeResourceState();

function createEmptyUpgradeResourceState() {
  return {
    signature: null,
    resources: [],
    priceCache: new Map(),
    hydratePromise: null,
  };
}

export function initUpgradeBuyMessage() {
  void hydrateSettings();

  observeDocumentBody(() => {
    const modal = findUpgradeModal(document);
    if (!modal) {
      removeIfPresent();
      return;
    }

    if (areUpgradePricesPopulated(modal)) {
      injectIfNeeded();
    }
  });

  const modal = findUpgradeModal(document);
  if (modal && areUpgradePricesPopulated(modal)) {
    injectIfNeeded();
  }
}

async function hydrateSettings() {
  const { data: savedDiscount } = await storage.migrate({
    domain: STORAGE_DOMAIN_DISCOUNT,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacy = await getRaw("local", STORAGE_KEY);
      if (legacy == null) return { data: null };
      return {
        data: Number(legacy),
        async cleanup() {
          await removeRaw("local", STORAGE_KEY);
        },
      };
    },
  });

  if (Number.isFinite(savedDiscount) && savedDiscount >= 0 && savedDiscount <= 5) {
    discountPct = savedDiscount;
  }

  const { data: savedMultiplier } = await storage.migrate({
    domain: STORAGE_DOMAIN_MULTIPLIER,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacy = await getRaw("local", STORAGE_KEY_MULTIPLIER);
      if (legacy == null) return { data: null };
      return {
        data: Number(legacy),
        async cleanup() {
          await removeRaw("local", STORAGE_KEY_MULTIPLIER);
        },
      };
    },
  });

  if (Number.isFinite(savedMultiplier) && savedMultiplier >= 1 && savedMultiplier <= MAX_MULTIPLIER) {
    multiplier = savedMultiplier;
  }
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
  upgradeResourceState = createEmptyUpgradeResourceState();
}

function allItemsNeeded(resources, mult) {
  return resources.every(({ requiredQty, warehouse }) => {
    const totalNeeded = requiredQty * mult;
    const neededToBuy = Math.max(0, totalNeeded - warehouse);
    return neededToBuy > 0;
  });
}

function buildBuyMessage(resources, mult, discount) {
  const parts = resources
    .map(({ recipeId, requiredQty, warehouse, price, decimals }) => {
      const totalNeeded = requiredQty * mult;
      const neededToBuy = Math.max(0, totalNeeded - warehouse);

      if (neededToBuy === 0) return null;

      const recipeTag = `:re-${recipeId}:`;

      if (!Number.isFinite(price) || price <= 0) {
        return `${neededToBuy} ${recipeTag}`;
      }

      const discountedPrice = price * (1 - discount / 100);
      const rounded = Math.round(discountedPrice * 10 ** decimals) / 10 ** decimals;
      const formatted = formatMoney(rounded, { decimals, prefix: true });
      return `${neededToBuy} ${recipeTag} @ ${formatted}`;
    })
    .filter((part) => part !== null);

  return `Buying
${parts.join("\n")}`;
}

function createDiscountOptions() {
  let options = "";
  for (let value = 0; value <= 5; value += 0.5) {
    const label = value === 0 ? "0%" : `-${value}%`;
    const selected = value === discountPct ? " selected" : "";
    options += `<option value="${value}"${selected}>${label}</option>`;
  }
  return options;
}

function createMultiplierOptions() {
  return Array.from({ length: MAX_MULTIPLIER }, (_, i) => {
    const value = i + 1;
    const selected = value === multiplier ? " selected" : "";
    return `<option value="${value}"${selected}>${value}x</option>`;
  }).join("");
}

function createResourceSignature(resources) {
  return resources
    .map(
      ({ recipeId, requiredQty, warehouse, price }) =>
        `${recipeId}:${requiredQty}:${warehouse}:${price ?? "null"}`,
    )
    .join("|");
}

function applyCachedPrices(resources, priceCache) {
  return resources.map((resource) => {
    if (Number.isFinite(resource.price) && resource.price > 0) {
      return resource;
    }

    const cachedPrice = priceCache.get(resource.recipeId);
    if (!Number.isFinite(cachedPrice) || cachedPrice <= 0) {
      return resource;
    }

    return {
      ...resource,
      price: cachedPrice,
    };
  });
}

async function resolveUpgradeResourcePrices(resources, realmId, priceCache, fetchPrice = fetchMarketPrice) {
  const missingPriceResources = resources.filter(
    ({ recipeId, price }) => (!Number.isFinite(price) || price <= 0) && !priceCache.has(recipeId),
  );

  await Promise.all(
    missingPriceResources.map(async ({ recipeId }) => {
      const fetchedPrice = await fetchPrice(realmId, recipeId, 0);
      if (Number.isFinite(fetchedPrice) && fetchedPrice > 0) {
        priceCache.set(recipeId, fetchedPrice);
        return;
      }

      priceCache.set(recipeId, null);
    }),
  );

  return applyCachedPrices(resources, priceCache);
}

function syncUpgradeResourceState(modal) {
  const parsedResources = parseUpgradeResourceRows(modal);
  const signature = createResourceSignature(parsedResources);

  if (upgradeResourceState.signature !== signature) {
    upgradeResourceState = {
      signature,
      resources: parsedResources,
      priceCache: new Map(),
      hydratePromise: null,
    };
  } else {
    upgradeResourceState.resources = parsedResources;
  }

  return applyCachedPrices(upgradeResourceState.resources, upgradeResourceState.priceCache);
}

async function ensureUpgradeResourcePrices(modal) {
  const resources = syncUpgradeResourceState(modal);
  const hasMissingPrices = resources.some(({ price }) => !Number.isFinite(price) || price <= 0);
  if (!hasMissingPrices) return resources;

  if (upgradeResourceState.hydratePromise) {
    return upgradeResourceState.hydratePromise;
  }

  const stateSignature = upgradeResourceState.signature;
  upgradeResourceState.hydratePromise = (async () => {
    await loadAuthDataOnce();
    const realmId = getRealmId();
    const enrichedResources = await resolveUpgradeResourcePrices(
      upgradeResourceState.resources,
      realmId,
      upgradeResourceState.priceCache,
    );

    if (upgradeResourceState.signature === stateSignature) {
      upgradeResourceState.resources = enrichedResources;
    }

    return enrichedResources;
  })().finally(() => {
    if (upgradeResourceState.signature === stateSignature) {
      upgradeResourceState.hydratePromise = null;
    }
  });

  return upgradeResourceState.hydratePromise;
}

function injectIfNeeded() {
  if (document.getElementById(CONTAINER_ID)) return;

  const modal = findUpgradeModal(document);
  if (!modal) return;

  const resources = syncUpgradeResourceState(modal);
  if (resources.length === 0) return;

  const injectionTarget = getUpgradeInjectionTarget(modal);
  if (!injectionTarget?.parentEl) return;

  const message = buildBuyMessage(resources, multiplier, discountPct);
  const showMultiplier = allItemsNeeded(resources, multiplier);

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-upgrade-buy-panel";

  container.innerHTML = `
    <div class="scx-upgrade-row">
      <div class="scx-upgrade-controls">
        ${
          showMultiplier
            ? `
        <div class="scx-upgrade-control-group">
          <label class="scx-upgrade-control-label" for="${MULTIPLIER_SELECT_ID}">Multiplier:</label>
          <select id="${MULTIPLIER_SELECT_ID}" name="${MULTIPLIER_SELECT_ID}" class="scx-upgrade-select">
            ${createMultiplierOptions()}
          </select>
        </div>`
            : ""
        }
        <div class="scx-upgrade-control-group">
          <label class="scx-upgrade-control-label" for="${DISCOUNT_SELECT_ID}">${t("upgradeDiscount")}</label>
          <select id="${DISCOUNT_SELECT_ID}" name="${DISCOUNT_SELECT_ID}" class="scx-upgrade-select">
            ${createDiscountOptions()}
          </select>
        </div>
      </div>
      <div id="${MESSAGE_ID}" class="scx-upgrade-message">${message}</div>
      <button
        class="scx-copy-btn scx-upgrade-copy-btn"
        id="scx-upgrade-copy-btn"
        data-tooltip="${t("upgradeCopyTooltip")}"
      >${COPY_BUTTON_SVG}</button>
    </div>
  `;

  const { parentEl, afterNode } = injectionTarget;
  if (afterNode && afterNode.nextSibling) {
    parentEl.insertBefore(container, afterNode.nextSibling);
  } else {
    parentEl.appendChild(container);
  }

  wireCopyButton(container, () => {
    const msgEl = document.getElementById(MESSAGE_ID);
    return msgEl ? msgEl.textContent : "";
  });

  document.getElementById(DISCOUNT_SELECT_ID)?.addEventListener("change", (e) => {
    const nextValue = Number(e.target && "value" in e.target ? e.target.value : NaN);
    if (!Number.isFinite(nextValue)) return;

    discountPct = nextValue;
    void storage.set({
      domain: STORAGE_DOMAIN_DISCOUNT,
      version: STORAGE_VERSION,
      scope: "global",
      backend: "local",
      refreshAuth: false,
      data: discountPct,
    });
    updateBuyMessage();
  });

  document.getElementById(MULTIPLIER_SELECT_ID)?.addEventListener("change", (e) => {
    const nextValue = Number(e.target && "value" in e.target ? e.target.value : NaN);
    if (!Number.isFinite(nextValue)) return;

    multiplier = nextValue;
    void storage.set({
      domain: STORAGE_DOMAIN_MULTIPLIER,
      version: STORAGE_VERSION,
      scope: "global",
      backend: "local",
      refreshAuth: false,
      data: multiplier,
    });
    updateBuyMessage();
  });

  void refreshUpgradeResourcePrices();
}

function updateBuyMessage() {
  const modal = findUpgradeModal(document);
  if (!modal) return;

  const resources = syncUpgradeResourceState(modal);
  if (resources.length === 0) return;

  const msgEl = document.getElementById(MESSAGE_ID);
  if (msgEl) {
    msgEl.textContent = buildBuyMessage(resources, multiplier, discountPct);
  }

  void refreshUpgradeResourcePrices();
}

async function refreshUpgradeResourcePrices() {
  const modal = findUpgradeModal(document);
  if (!modal) return;

  const resources = await ensureUpgradeResourcePrices(modal);
  const msgEl = document.getElementById(MESSAGE_ID);
  if (msgEl) {
    msgEl.textContent = buildBuyMessage(resources, multiplier, discountPct);
  }
}

export const _testUtils = { buildBuyMessage, resolveUpgradeResourcePrices };
