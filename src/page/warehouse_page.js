const INVENTORY_CARD_SELECTOR = '[role="link"][aria-label*="quantity"][aria-label*="cost"]';
const INVENTORY_CONTAINER_SELECTOR = '[role="list"]';

export function isWarehousePage(pathname = window.location.pathname) {
  return String(pathname || "").includes("/warehouse/");
}

export function isWarehouseOverviewPage(pathname = window.location.pathname) {
  return /^(?:\/[a-z]{2}(?:_[a-z]{2})?)?\/headquarters\/warehouse\/?$/i.test(String(pathname || ""));
}

export function findWarehouseInventoryContainer(root = document) {
  return root?.querySelector?.(INVENTORY_CONTAINER_SELECTOR) || root?.body || null;
}

export function findWarehouseInventoryContainers(root = document) {
  return Array.from(root?.querySelectorAll?.(INVENTORY_CONTAINER_SELECTOR) || []);
}

export function extractWarehousePageItems(root = document) {
  const items = [];
  const cards = root?.querySelectorAll?.(INVENTORY_CARD_SELECTOR) || [];

  for (const card of cards) {
    const label = card.getAttribute("aria-label") || "";
    const nameMatch = label.match(/^([^,]+),/);
    const quantityMatch = label.match(/quantity\s+([0-9,.]+)/i);
    const costMatch = label.match(/\$([0-9,.]+)(?:\s|$)/);
    const qualityMatch = label.match(/quality\s+([0-9]+)/i);

    if (!nameMatch || !costMatch) continue;

    const name = nameMatch[1].trim();
    const quantity = quantityMatch ? Number.parseFloat(quantityMatch[1].replace(/,/g, "")) : 0;
    const sourcingCost = Number.parseFloat(costMatch[1].replace(/,/g, ""));
    const quality = qualityMatch ? Number.parseInt(qualityMatch[1], 10) : 0;

    items.push({
      element: card,
      name,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      sourcingCost: Number.isFinite(sourcingCost) ? sourcingCost : 0,
      quality: Number.isFinite(quality) ? quality : 0,
    });
  }

  return items;
}

export function findWarehouseSalesBuilderTarget(root = document) {
  const inventoryContainers = findWarehouseInventoryContainers(root);
  const inventoryContainer = inventoryContainers.at(-1) || findWarehouseInventoryContainer(root);
  const parentEl = inventoryContainer?.parentElement || root?.body || null;

  if (!parentEl || !inventoryContainer) return null;

  return {
    parentEl,
    afterNode: inventoryContainer,
  };
}

export function getOrCreateWarehouseMarketButton(cardElement, { buttonText, buttonTitle }) {
  const existingWrapper = cardElement.closest("[data-scx-market-wrapper]");
  if (existingWrapper) {
    return existingWrapper.querySelector("[data-scx-market-btn]");
  }

  const wrapper = document.createElement("div");
  wrapper.dataset.scxMarketWrapper = "true";
  wrapper.className = "scx-warehouse-market-wrapper";

  const cardStyles = window.getComputedStyle(cardElement);
  const width = cardStyles.width;
  const marginRight = cardStyles.marginRight;
  const marginBottom = cardStyles.marginBottom;

  if (width && width !== "auto") {
    wrapper.style.setProperty("--scx-warehouse-card-width", width);
  }
  if (marginRight && marginRight !== "auto") {
    wrapper.style.setProperty("--scx-warehouse-card-margin-right", marginRight);
  }
  if (marginBottom && marginBottom !== "auto") {
    wrapper.style.setProperty("--scx-warehouse-card-margin-bottom", marginBottom);
  }

  cardElement.parentElement?.insertBefore(wrapper, cardElement);
  wrapper.appendChild(cardElement);

  cardElement.classList.add("scx-warehouse-market-card");

  const button = document.createElement("button");
  button.setAttribute("data-scx-market-btn", "true");
  button.className = "scx-warehouse-market-btn";
  button.textContent = buttonText;
  button.title = buttonTitle;
  wrapper.appendChild(button);

  return button;
}
