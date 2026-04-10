import { parseLocaleNumber } from "../utils.js";

const UPGRADE_MODAL_SELECTOR = ".modal-dialog";
const RESOURCE_ROW_TO_RECIPE = [
  [101, 0],
  [102, 1],
  [108, 1],
  [111, 0],
];

export function findUpgradeModal(root = document) {
  const modals = root?.querySelectorAll?.(UPGRADE_MODAL_SELECTOR) || [];

  for (const modal of modals) {
    if (hasExchangeRows(modal)) {
      return modal;
    }
  }

  return null;
}

function hasExchangeRows(modal) {
  const rows = modal?.querySelectorAll?.("tbody tr") || [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 4) continue;

    const lastCellText = cells[cells.length - 1]?.textContent || "";
    if (lastCellText.includes("@") && lastCellText.includes("$")) {
      return true;
    }
  }

  return false;
}

export function areUpgradePricesPopulated(modal) {
  if (!modal) return false;

  const rows = modal.querySelectorAll("tbody tr");
  let hasSummaryRow = false;

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    const hasColspan2 = Array.from(cells).some((cell) => cell.getAttribute("colspan") === "2");
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

    resourceRowCount += 1;
    const exchangeText = cells[cells.length - 1].textContent.trim();
    if (!exchangeText) return false;

    const isNumericOnly = /^[\d,]+$/.test(exchangeText);
    const isPriced = exchangeText.includes("@") && exchangeText.includes("$");
    if (!isNumericOnly && !isPriced) return false;
  }

  return resourceRowCount === RESOURCE_ROW_TO_RECIPE.length;
}

export function parseUpgradeResourceRows(modal) {
  const resources = [];
  const rows = modal?.querySelectorAll?.("tbody tr") || [];
  let resourceIndex = 0;

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 4) continue;
    if (!cells[0].querySelector("img")) continue;

    const [recipeId, decimals] = RESOURCE_ROW_TO_RECIPE[resourceIndex] || [null, 0];
    resourceIndex += 1;
    if (recipeId === null) continue;

    const requiredText = cells[1]?.querySelector("b")?.textContent?.trim() || "";
    const requiredMatch = requiredText.match(/x([\d.,]+)/);
    if (!requiredMatch) continue;

    const requiredQty = parseLocaleNumber(requiredMatch[1]);
    if (!Number.isFinite(requiredQty) || requiredQty <= 0) continue;

    const warehouseText = cells[2]?.textContent?.trim() || "0";
    const warehouseQty = parseLocaleNumber(warehouseText);
    if (!Number.isFinite(warehouseQty)) continue;

    const exchangeText = cells[cells.length - 1]?.textContent?.trim() || "";
    const exchangeMatch = exchangeText.match(/([\d.,]+)\s*@\s*\$([\d.,]+)/);
    if (!exchangeMatch) continue;

    const price = parseLocaleNumber(exchangeMatch[2]);
    if (!Number.isFinite(price) || price <= 0) continue;

    resources.push({
      recipeId,
      requiredQty: Math.round(requiredQty),
      warehouse: Math.round(warehouseQty),
      price,
      decimals,
    });
  }

  return resources;
}

export function getUpgradeInjectionTarget(modal) {
  const modalBody = modal?.querySelector?.(".modal-body");
  if (!modalBody) return null;

  const textLeftDiv = modalBody.querySelector(".text-left");
  const anchorTarget = textLeftDiv || modalBody;
  const table = anchorTarget.querySelector("table");

  return {
    parentEl: anchorTarget,
    afterNode: table || null,
  };
}
