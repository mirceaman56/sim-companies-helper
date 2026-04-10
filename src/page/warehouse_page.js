const INVENTORY_CARD_SELECTOR = '[role="link"][aria-label*="quantity"][aria-label*="cost"]';
const INVENTORY_CONTAINER_SELECTOR = '[role="list"]';

export function isWarehousePage(pathname = window.location.pathname) {
  return String(pathname || "").includes("/warehouse/");
}

export function findWarehouseInventoryContainer(root = document) {
  return root?.querySelector?.(INVENTORY_CONTAINER_SELECTOR) || root?.body || null;
}

export function extractWarehousePageItems(root = document) {
  const items = [];
  const cards = root?.querySelectorAll?.(INVENTORY_CARD_SELECTOR) || [];

  for (const card of cards) {
    const label = card.getAttribute("aria-label") || "";
    const nameMatch = label.match(/^([^,]+),/);
    const costMatch = label.match(/\$([0-9,.]+)(?:\s|$)/);
    const qualityMatch = label.match(/quality\s+([0-9]+)/i);

    if (!nameMatch || !costMatch) continue;

    const name = nameMatch[1].trim();
    const sourcingCost = Number.parseFloat(costMatch[1].replace(/,/g, ""));
    const quality = qualityMatch ? Number.parseInt(qualityMatch[1], 10) : 0;

    items.push({
      element: card,
      name,
      sourcingCost: Number.isFinite(sourcingCost) ? sourcingCost : 0,
      quality: Number.isFinite(quality) ? quality : 0,
    });
  }

  return items;
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
