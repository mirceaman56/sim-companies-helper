/**
 * warehouse_ui.js
 * Adds on-demand market price comparison buttons to inventory items
 */

import recipes from "./resources/recipes.json";
import { fetchMarketPrice } from "./market.js";
import { getRealmId, loadAuthDataOnce } from "./auth.js";
import { STATE } from "./state.js";
import { formatMoney } from "./utils.js";

// Map product kinds (IDs) to recipe info, and names to IDs
function buildRecipeMaps() {
  const kindMap = new Map();
  const nameMap = new Map();
  for (const recipe of recipes) {
    kindMap.set(recipe.id, recipe);
    nameMap.set(recipe.name, recipe.id);
  }
  return { kindMap, nameMap };
}

const { kindMap: recipeMap, nameMap: recipeNameMap } = buildRecipeMaps();

/**
 * Get product name by kind ID (from recipes.json)
 */
function getProductNameByKind(kind) {
  const recipe = recipeMap.get(kind);
  return recipe ? recipe.name : null;
}

/**
 * Get product ID (kind) by product name
 */
function getProductIdByName(name) {
  return recipeNameMap.get(name) || null;
}

/**
 * Fetch inventory data from API and group by kind (product type)
 * Calculate weighted average quality for each product
 * Returns array of {kind, name, totalAmount, weightedQuality, sourcingCost}
 */
async function fetchInventoryItems() {
  try {
    // Ensure auth data is loaded
    await loadAuthDataOnce();

    const companyId = STATE.auth.companyId;
    if (!companyId) {
      console.warn("[WarehouseUI] Cannot fetch inventory: no company ID");
      return [];
    }

    const url = `https://www.simcompanies.com/api/v3/resources/${companyId}/`;
    const response = await fetch(url, { credentials: "include" });

    if (!response.ok) {
      console.warn(`[WarehouseUI] Failed to fetch inventory: ${response.status}`);
      return [];
    }

    const rawItems = await response.json();

    // Group items by kind and calculate weighted average quality
    const kindMap = new Map();

    for (const item of rawItems) {
      const { kind, amount, quality } = item;

      if (!kindMap.has(kind)) {
        kindMap.set(kind, {
          kind,
          totalAmount: 0,
          qualityWeightSum: 0, // sum of (quality * amount)
        });
      }

      const entry = kindMap.get(kind);
      entry.totalAmount += amount;
      entry.qualityWeightSum += quality * amount;
    }

    // Convert to inventory items with weighted average quality
    // Get DOM items for sourcing cost (already calculated by UI)
    const domItems = extractPageInventoryItems();
    const domItemsByName = new Map();
    for (const domItem of domItems) {
      domItemsByName.set(domItem.name, domItem);
    }

    const items = [];
    for (const [kind, entry] of kindMap) {
      const productName = getProductNameByKind(kind);
      if (!productName) continue; // Skip unknown products

      const domItem = domItemsByName.get(productName);
      if (!domItem) continue; // Skip if not found in DOM

      const weightedQuality = entry.qualityWeightSum / entry.totalAmount;

      items.push({
        kind,
        name: productName,
        totalAmount: entry.totalAmount,
        weightedQuality,
        sourcingCost: domItem.sourcingCost,
      });
    }

    return items;
  } catch (error) {
    console.error("[WarehouseUI] Error fetching inventory:", error);
    return [];
  }
}

/**
 * Extract all inventory items from the page DOM (fallback)
 * Returns array of {element, name, sourcingCost, quality}
 */
function extractPageInventoryItems() {
  const items = [];

  // Find all item cards: role="link" with aria-label containing quantity and cost
  const itemCards = document.querySelectorAll('[role="link"][aria-label*="quantity"][aria-label*="cost"]');

  for (const card of itemCards) {
    const label = card.getAttribute("aria-label") || "";
    // Parse: "Seeds, quantity 291829, average sourcing cost $0.20" or with quality
    const nameMatch = label.match(/^([^,]+),/);
    const costMatch = label.match(/\$([0-9,.]+)(?:\s|$)/);

    // Try to extract quality from aria-label (if format includes it)
    // Could be "Seeds, quality 2, quantity 291829, average sourcing cost $0.20"
    const qualityMatch = label.match(/quality\s+([0-9]+)/);
    const quality = qualityMatch ? parseInt(qualityMatch[1], 10) : 0;

    if (nameMatch && costMatch) {
      const name = nameMatch[1].trim();
      const sourcingCost = parseFloat(costMatch[1].replace(/,/g, ""));

      items.push({
        element: card,
        name,
        sourcingCost: Number.isFinite(sourcingCost) ? sourcingCost : 0,
        quality: Number.isFinite(quality) ? quality : 0,
      });
    }
  }

  return items;
}

/**
 * Find or create the market button below the item card (outside the link element)
 */
function getOrCreateMarketButton(cardElement) {
  // Check if already wrapped
  const existingWrapper = cardElement.closest("[data-scx-market-wrapper]");
  if (existingWrapper) {
    return existingWrapper.querySelector("[data-scx-market-btn]");
  }

  // Copy the card's float layout properties so the wrapper takes its place
  const cardStyles = window.getComputedStyle(cardElement);
  const cardWidth = cardStyles.width; // e.g. "120px"
  const cardMarginRight = cardStyles.marginRight;
  const cardMarginBottom = cardStyles.marginBottom;

  // Wrap the card so the button lives outside the role="link" element
  const wrapper = document.createElement("div");
  wrapper.dataset.scxMarketWrapper = "true";
  wrapper.style.cssText = `
    float: left;
    width: ${cardWidth};
    margin-right: ${cardMarginRight};
    margin-bottom: ${cardMarginBottom};
  `;
  cardElement.parentElement.insertBefore(wrapper, cardElement);
  wrapper.appendChild(cardElement);

  // Remove float/margin from the card itself since the wrapper handles it
  cardElement.style.float = "none";
  cardElement.style.marginRight = "0";
  cardElement.style.marginBottom = "0";
  cardElement.style.width = "100%";

  // Create the button as a sibling of the card (not inside it)
  const button = document.createElement("button");
  button.setAttribute("data-scx-market-btn", "true");
  button.textContent = "market price";
  button.title = "Check Market Price";
  button.style.cssText = `
    display: block;
    width: 100%;
    background: black;
    color: white;
    border: none;
    border-radius: 0 0 4px 4px;
    padding: 3px 0;
    margin-top: 0;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  `;

  button.onmouseover = () => {
    button.style.background = "var(--scx-text-primary)";
  };
  button.onmouseout = () => {
    button.style.background = "var(--scx-text-primary-dark,black)";
  };

  wrapper.appendChild(button);

  return button;
}

/**
 * Handle market button click
 */
async function handleMarketButtonClick(button, item) {
  const { element, name, sourcingCost, weightedQuality } = item;
  const productId = getProductIdByName(name);

  if (!productId) {
    button.textContent = "Not found";
    button.style.color = "red";
    setTimeout(() => {
      button.textContent = "market price";
      button.style.color = "white";
    }, 2000);
    return;
  }

  // Show loading state
  const originalText = button.textContent;
  button.textContent = "⏳ Loading...";
  button.disabled = true;
  button.style.opacity = "0.6";

  try {
    const realmId = getRealmId();
    const marketPrice = await fetchMarketPrice(realmId, productId, weightedQuality);

    if (marketPrice === null) {
      button.textContent = "No price";
      button.style.color = "red";
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = "black";
        button.style.color = "white";
        button.disabled = false;
        button.style.opacity = "1";
      }, 3000);
      return;
    }

    // Calculate delta (positive diff = market more expensive than sourcing)
    const diff = marketPrice - sourcingCost;
    const pct = sourcingCost > 0 ? (diff / sourcingCost) * 100 : 0;
    // Green if market is cheaper (good to buy), red if market is pricier
    const color = diff < 0 ? "green" : diff > 0 ? "red" : "white";
    const sign = diff >= 0 ? "+" : "";

    // Display result
    button.innerHTML = `
      <span style="font-size: 10px;">
        ${sign}${formatMoney(diff)} (${sign}${pct.toFixed(1)}%)
      </span>
    `;
    button.style.background = "black";
    button.style.color = color;
    button.disabled = true;

    // Reset after 10 seconds
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = "black";
      button.style.color = "white";
      button.disabled = false;
      button.style.opacity = "1";
    }, 10000);
  } catch (e) {
    console.debug(`[WarehouseUI] Failed to fetch price for ${name}:`, e);
    button.textContent = "Error";
    button.style.color = "red";
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = "black";
      button.style.color = "white";
      button.disabled = false;
      button.style.opacity = "1";
    }, 3000);
  }
}

/**
 * Add market buttons to all inventory items
 */
async function injectMarketButtons() {
  // Get DOM items for button attachment and API items for accurate data
  const domItems = extractPageInventoryItems();
  const apiItems = await fetchInventoryItems();

  // Create a map of product names from API for quick lookup
  const apiItemsByName = new Map();
  for (const apiItem of apiItems) {
    apiItemsByName.set(apiItem.name, apiItem);
  }

  // Merge DOM and API data, preferring API data when available
  for (const domItem of domItems) {
    const apiItem = apiItemsByName.get(domItem.name);

    // Use API data (weighted quality, accurate sourcing cost) if available
    if (apiItem) {
      domItem.weightedQuality = apiItem.weightedQuality;
      domItem.totalAmount = apiItem.totalAmount;
      domItem.sourcingCost = apiItem.sourcingCost;
    } else {
      // Fallback to DOM-extracted data
      domItem.weightedQuality = domItem.quality;
    }

    const button = getOrCreateMarketButton(domItem.element);

    // Only attach listener if not already attached
    if (!button.dataset.listenerAttached) {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleMarketButtonClick(button, domItem);
      });
      button.dataset.listenerAttached = "true";
    }
  }
}

/**
 * Main function to initialize warehouse helper
 */
export function initWarehouseHelper() {
  let observerActive = false;
  let observer = null;
  let urlCheckInterval = null;
  let debounceTimer = null;

  /**
   * Check if we're on the warehouse page
   */
  function isWarehousePage() {
    return window.location.pathname.includes("/warehouse/");
  }

  /**
   * Debounced injection to avoid excessive processing
   */
  function debouncedInject() {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      injectMarketButtons();
    }, 500);
  }

  /**
   * Start monitoring for inventory items on the page
   */
  function startObserver() {
    if (observerActive) return;
    observerActive = true;

    // Find the inventory container
    const inventoryContainer = document.querySelector('[role="list"]') || document.body;

    observer = new MutationObserver(() => {
      debouncedInject();
    });

    observer.observe(inventoryContainer, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    // Initial injection
    injectMarketButtons();
  }

  /**
   * Stop monitoring
   */
  function stopObserver() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observerActive = false;
  }

  /**
   * Listen for URL changes (React SPA navigation)
   */
  function monitorNavigation() {
    let lastUrl = window.location.href;

    urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;

      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;

        if (isWarehousePage()) {
          startObserver();
        } else if (observerActive) {
          stopObserver();
        }
      }
    }, 1000);
  }

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (urlCheckInterval) clearInterval(urlCheckInterval);
    stopObserver();
  });

  // Start monitoring navigation
  monitorNavigation();

  // If already on warehouse page, start immediately
  if (isWarehousePage()) {
    startObserver();
  }
}
