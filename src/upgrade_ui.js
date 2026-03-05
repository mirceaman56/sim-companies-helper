import { t } from "./i18n.js";
import { formatMoney, parseLocaleNumber, COPY_BUTTON_SVG, wireCopyButton } from "./utils.js";

const CONTAINER_ID = "scx-upgrade-buy-msg";
const STORAGE_KEY = "scx-upgrade-discount";
const STORAGE_KEY_MULTIPLIER = "scx-upgrade-multiplier";

let discountPct = 0;
let multiplier = 1;

const RESOURCES_BY_ROW = [
  [101, 0],
  [102, 1],
  [108, 1],
  [111, 0],
];


export function initUpgradeBuyMessage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 0 && n <= 5) discountPct = n;
    }
  } catch {
    /* ignore */
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_MULTIPLIER);
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 1 && n <= 15) multiplier = n;
    }
  } catch {
    /* ignore */
  }

  const observer = new MutationObserver(() => {
    const modal = getUpgradeModal();
    if (modal) {
      if (allPricesPopulated(modal)) {
        injectIfNeeded();
      }
    } else {
      removeIfPresent();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const modal = getUpgradeModal();
  if (modal && allPricesPopulated(modal)) injectIfNeeded();
}

function getUpgradeModal() {
  const modals = document.querySelectorAll(".modal-dialog");
  for (const modal of modals) {
    const rows = modal.querySelectorAll("tbody tr");
    let hasExchangeRows = false;
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 4) {
        const lastCell = cells[cells.length - 1];
        if (lastCell.textContent.includes("@") && lastCell.textContent.includes("$")) {
          hasExchangeRows = true;
          break;
        }
      }
    }
    if (hasExchangeRows) return modal;
  }
  return null;
}

function allPricesPopulated(modal) {
  let hasSummaryRow = false;
  const rows = modal.querySelectorAll("tbody tr");
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    const hasColspan2 = Array.from(cells).some(td => td.getAttribute("colspan") === "2");
    if (!hasColspan2) continue;
    const lastCell = cells[cells.length - 1];
    const bold = lastCell.querySelector("b");
    if (bold && bold.textContent.trim().startsWith("$")) {
      hasSummaryRow = true;
      break;
    }
  }
  if (!hasSummaryRow) return false;

  let resourceRowCount = 0;
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 4) continue;
    if (!cells[0].querySelector("img")) continue;

    resourceRowCount++;
    const exchangeText = cells[cells.length - 1].textContent.trim();
    if (exchangeText === "") return false;
    const isNumericOnly = /^[\d,]+$/.test(exchangeText);
    const isPriced = exchangeText.includes("@") && exchangeText.includes("$");
    if (!isNumericOnly && !isPriced) return false;
  }

  return resourceRowCount === RESOURCES_BY_ROW.length;
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
}

function parseResourceRows(modal) {
  const resources = [];
  const rows = modal.querySelectorAll("tbody tr");
  let resourceIndex = 0;

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 4) continue;

    const img = cells[0].querySelector("img");
    if (!img) continue;

    const [recipeId, decimals] = RESOURCES_BY_ROW[resourceIndex] || [null, 0];
    resourceIndex++;

    if (recipeId === null) continue;

    const requiredCell = cells[1];
    const boldEl = requiredCell.querySelector("b");
    if (!boldEl) continue;
    const boldText = boldEl.textContent.trim();
    const requiredMatch = boldText.match(/x([\d.,]+)/);
    if (!requiredMatch) continue;
    const requiredQty = parseLocaleNumber(requiredMatch[1]);
    if (!Number.isFinite(requiredQty) || requiredQty <= 0) continue;

    const warehouseText = cells[2]?.textContent?.trim() || "0";
    const warehouse = parseLocaleNumber(warehouseText);
    if (!Number.isFinite(warehouse)) continue;

    const exchangeCell = cells[cells.length - 1];
    const exchangeText = exchangeCell.textContent.trim();
    const match = exchangeText.match(/([\d.,]+)\s*@\s*\$([\d.,]+)/);
    if (!match) continue;

    const price = parseLocaleNumber(match[2]);
    if (!Number.isFinite(price) || price <= 0) continue;

    resources.push({ recipeId, requiredQty: Math.round(requiredQty), warehouse: Math.round(warehouse), price, decimals });
  }

  return resources;
}

function allItemsNeeded(resources, mult) {
  return resources.every(({ requiredQty, warehouse }) => {
    const totalNeeded = requiredQty * mult;
    const neededToBuy = Math.max(0, totalNeeded - warehouse);
    return neededToBuy > 0;
  });
}

function buildBuyMessage(resources, mult, discount) {
  const parts = resources.map(({ recipeId, requiredQty, warehouse, price, decimals }) => {
    const totalNeeded = requiredQty * mult;
    const neededToBuy = Math.max(0, totalNeeded - warehouse);

    if (neededToBuy === 0) return null;
    
    const discountedPrice = price * (1 - discount / 100);
    const rounded = Math.round(discountedPrice * 10 ** decimals) / 10 ** decimals;
    const formatted = formatMoney(rounded, { decimals, prefix: true });
    const recipeTag = `:re-${recipeId}:`;
    return `${neededToBuy} ${recipeTag} @ ${formatted}`;
  }).filter(p => p !== null);
  
  return `Buying
${parts.join("\n")}`;
}

function injectIfNeeded() {
  if (document.getElementById(CONTAINER_ID)) return;

  const modal = getUpgradeModal();
  if (!modal) return;

  const resources = parseResourceRows(modal);
  if (resources.length === 0) return;

  const modalBody = modal.querySelector(".modal-body");
  if (!modalBody) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText = `
    margin: 12px 0 8px 0;
    padding: 10px 12px;
    background: var(--scx-bg-subtle, #f5f5f5);
    border: var(--scx-border-light, 1px solid #e0e0e0);
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
  `;

  let discountOptions = "";
  for (let v = 0; v <= 5; v += 0.5) {
    const label = v === 0 ? "0%" : `-${v}%`;
    const selected = v === discountPct ? " selected" : "";
    discountOptions += `<option value="${v}"${selected}>${label}</option>`;
  }

  const message = buildBuyMessage(resources, multiplier, discountPct);
  const showMultiplier = allItemsNeeded(resources, multiplier);

  const selectStyle = `
    background: var(--scx-bg-neutral, #f8f8f8);
    border: var(--scx-border-medium-light, 1px solid #bebebe);
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
    color: var(--scx-text-primary, #000);
  `;

  let leftControls = "";

  if (showMultiplier) {
    leftControls += `
      <div style="display:flex; align-items:center; gap:4px;">
        <label style="font-size:11px; color:var(--scx-text-muted, #999);">Multiplier:</label>
        <select id="scx-upgrade-multiplier-select" style="${selectStyle}">
          ${Array.from({ length: 15 }, (_, i) => {
            const v = i + 1;
            const selected = v === multiplier ? " selected" : "";
            return `<option value="${v}"${selected}>${v}x</option>`;
          }).join("")}
        </select>
      </div>`;
  }

  leftControls += `
      <div style="display:flex; align-items:center; gap:4px;">
        <label style="font-size:11px; color:var(--scx-text-muted, #999);">${t("upgradeDiscount")}</label>
        <select id="scx-upgrade-discount-select" style="${selectStyle}">${discountOptions}</select>
      </div>`;

  container.innerHTML = `
    <div style="display:flex; align-items:stretch; gap:8px;">
      <div style="display:flex; flex-direction:column; justify-content:center; gap:6px; flex-shrink:0;">
        ${leftControls}
      </div>
      <div id="scx-upgrade-msg-text" style="
        flex: 1;
        background: var(--scx-bg-primary, #fff);
        border: var(--scx-border-light, 1px solid #e0e0e0);
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--scx-text-primary, #000);
        word-break: break-word;
        white-space: pre-wrap;
        height: 106px;
        overflow-y: auto;
      ">${message}</div>
      <button class="scx-copy-btn" id="scx-upgrade-copy-btn" data-tooltip="${t("upgradeCopyTooltip")}" style="
        align-self: center;
        min-width: 28px;
        min-height: 28px;
        width: 28px;
        height: 28px;
      ">${COPY_BUTTON_SVG}</button>
    </div>
  `;

  const textLeftDiv = modalBody.querySelector(".text-left");
  const anchorTarget = textLeftDiv || modalBody;

  const table = anchorTarget.querySelector("table");
  if (table && table.nextSibling) {
    anchorTarget.insertBefore(container, table.nextSibling);
  } else {
    anchorTarget.appendChild(container);
  }

  wireCopyButton(container, () => {
    const msgEl = document.getElementById("scx-upgrade-msg-text");
    return msgEl ? msgEl.textContent : "";
  });

  document.getElementById("scx-upgrade-discount-select").addEventListener("change", (e) => {
    discountPct = Number(e.target.value);
    try {
      localStorage.setItem(STORAGE_KEY, String(discountPct));
    } catch {
      /* ignore */
    }
    updateBuyMessage();
  });

  const multiplierSelect = document.getElementById("scx-upgrade-multiplier-select");
  if (multiplierSelect) {
    multiplierSelect.addEventListener("change", (e) => {
      multiplier = Number(e.target.value);
      try {
        localStorage.setItem(STORAGE_KEY_MULTIPLIER, String(multiplier));
      } catch {
        /* ignore */
      }
      updateBuyMessage();
    });
  }
}

function updateBuyMessage() {
  const modal = getUpgradeModal();
  if (!modal) return;

  const resources = parseResourceRows(modal);
  if (resources.length === 0) return;

  const msgEl = document.getElementById("scx-upgrade-msg-text");
  if (msgEl) {
    msgEl.textContent = buildBuyMessage(resources, multiplier, discountPct);
  }
}

export const _testUtils = { buildBuyMessage };
