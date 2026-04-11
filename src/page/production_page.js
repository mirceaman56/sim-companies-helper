import { parseLocaleNumber, extractProductIdFromRow, getInfoColumn } from "../utils.js";
import { extractDollarValue } from "../production_calc.js";
import { findAncestorWithin, waitForStructuralValue } from "./page_utils.js";

const AMOUNT_INPUT_SELECTOR = 'input[name="amount"]';
const RESOURCE_LINK_SELECTOR = 'a[href*="/encyclopedia/"][href*="/resource/"]';
const MAX_ROW_SEARCH_DEPTH = 25;

function isElement(value) {
  return value instanceof Element;
}

function hasProductLink(el) {
  return Boolean(el?.querySelector?.(RESOURCE_LINK_SELECTOR));
}

function hasQuantityInput(el) {
  return Boolean(el?.querySelector?.(AMOUNT_INPUT_SELECTOR));
}

function hasDollarValue(infoCol) {
  return /\$/.test(infoCol?.textContent || "");
}

export function getProductionDataWrapper(infoCol) {
  if (!isElement(infoCol)) return null;

  for (const child of infoCol.children) {
    if (child.tagName === "DIV" && child.querySelectorAll(":scope > div").length >= 3) {
      return child;
    }
  }

  return null;
}

export function findProductionRowFromTarget(target) {
  if (!isElement(target)) return null;

  const body = target.ownerDocument?.body || document.body;
  return findAncestorWithin(
    target,
    (el) => {
      const infoCol = getInfoColumn(el);
      return hasProductLink(el) && (hasQuantityInput(el) || hasDollarValue(infoCol));
    },
    { maxDepth: MAX_ROW_SEARCH_DEPTH, boundary: body },
  );
}

export function findFirstProductionRow(root = document) {
  const firstInput = root?.querySelector?.(AMOUNT_INPUT_SELECTOR);
  if (firstInput) {
    const row = findProductionRowFromTarget(firstInput);
    if (row) return row;
  }

  const links = root?.querySelectorAll?.(RESOURCE_LINK_SELECTOR) || [];
  for (const link of links) {
    const row = findProductionRowFromTarget(link);
    if (row) return row;
  }

  return null;
}

export function getProductionQuantity(row) {
  if (!isElement(row)) return 1;

  const input = row.querySelector(AMOUNT_INPUT_SELECTOR);
  if (input) {
    const value = Number(input.value || 0);
    return value > 0 ? value : 1;
  }

  const infoCol = getInfoColumn(row);
  const wrapper = getProductionDataWrapper(infoCol);
  if (!wrapper) return 1;

  const firstDiv = wrapper.querySelector(":scope > div");
  if (!firstDiv) return 1;

  const nums = (firstDiv.textContent || "").match(/[\d.,]+/g);
  if (!nums) return 1;

  let best = 0;
  for (const raw of nums) {
    const value = parseLocaleNumber(raw);
    if (value > best) best = value;
  }

  return best > 0 ? best : 1;
}

export function getProductionUnitCost(row) {
  if (!isElement(row)) return null;

  const infoCol = getInfoColumn(row);
  if (!infoCol) return null;

  const wrapper = getProductionDataWrapper(infoCol);
  if (wrapper) {
    const dataDivs = wrapper.querySelectorAll(":scope > div");
    const costDiv = dataDivs[dataDivs.length - 1];
    return costDiv ? extractDollarValue(costDiv.textContent) : null;
  }

  for (const node of infoCol.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const value = extractDollarValue(node.textContent);
    if (value !== null) return value;
  }

  return null;
}

export function getProductionLaborCost(row) {
  if (!isElement(row)) return 0;

  const infoCol = getInfoColumn(row);
  if (!infoCol) return 0;

  const spans = infoCol.querySelectorAll(":scope > span");
  if (spans.length < 2) return 0;

  const value = extractDollarValue(spans[1].textContent);
  return value !== null ? value : 0;
}

export function readProductionRow(row) {
  if (!isElement(row)) return null;

  const infoColumnEl = getInfoColumn(row);
  const dataWrapperEl = getProductionDataWrapper(infoColumnEl);
  const productName = (infoColumnEl?.querySelector("h3")?.textContent || "").trim() || "Unknown";

  return {
    rowEl: row,
    infoColumnEl,
    dataWrapperEl,
    productId: extractProductIdFromRow(row),
    productName,
    quantityInput: row.querySelector(AMOUNT_INPUT_SELECTOR),
    quantity: getProductionQuantity(row),
    unitCost: getProductionUnitCost(row),
    laborCost: getProductionLaborCost(row),
    isActive: Boolean(dataWrapperEl),
  };
}

export function waitForProductionLaborCost(row, maxWaitMs = 3000) {
  return waitForStructuralValue({
    target: row,
    readValue: () => getProductionLaborCost(row),
    isReady: (value) => value > 0,
    timeoutMs: maxWaitMs,
  });
}

export function extractProductionBuildingLevel(root = document) {
  const allDivs = root?.querySelectorAll?.("div") || [];

  for (const div of allDivs) {
    const rect = div.getBoundingClientRect();
    if (rect.top < 100) continue;

    const text = div.textContent?.trim() || "";
    const levelMatch = text.match(/level\s+(\d+)/i);
    if (!levelMatch) continue;

    const level = parseInt(levelMatch[1], 10);
    if (level >= 1 && level <= 100 && text.length <= 50) {
      return level;
    }
  }

  for (const div of allDivs) {
    const rect = div.getBoundingClientRect();
    if (rect.top < 100) continue;

    const text = div.textContent?.trim() || "";
    if (text.length > 100) continue;
    if (rect.width > 300 || rect.height > 200) continue;

    const match = text.match(/^\d+$|^(?:level\s+)?\d+$/i);
    if (!match) continue;

    const level = parseInt(text.match(/\d+/)[0], 10);
    if (level < 1 || level > 100 || text.length > 30) continue;

    const parent = div.parentElement;
    if (parent?.textContent && parent.textContent.length < 500) {
      return level;
    }
  }

  return null;
}
