import { extractProductIdFromRow, getInfoColumn } from "../utils.js";
import {
  findAncestorWithin,
  findClosestWithin,
  hasAllSelectors,
  hasAnySelector,
  observeMutations,
} from "./page_utils.js";

const SELL_INPUT_SELECTOR = 'input[name="price"], input[name="quantity"]';
const PRICE_INPUT_SELECTOR = 'input[name="price"]';
const QUANTITY_INPUT_SELECTOR = 'input[name="quantity"]';
const RESOURCE_LINK_SELECTOR = 'a[href*="/encyclopedia/"][href*="/resource/"]';
const LEGACY_ROW_SELECTOR = "div.css-mv4qyq";
const MAX_ROW_SEARCH_DEPTH = 25;

function isElement(value) {
  return value instanceof Element;
}

function hasRetailInputs(el) {
  return hasAllSelectors(el, [PRICE_INPUT_SELECTOR, QUANTITY_INPUT_SELECTOR]);
}

function hasRetailResourceLink(el) {
  return hasAnySelector(el, [RESOURCE_LINK_SELECTOR]);
}

export function detectRetailPage(root = document) {
  return Boolean(findFirstRetailRow(root));
}

export function isRetailSellInput(target) {
  return isElement(target) && target.matches(SELL_INPUT_SELECTOR);
}

export function findRetailRowFromTarget(target, { maxDepth = MAX_ROW_SEARCH_DEPTH } = {}) {
  if (!isElement(target)) return null;

  const boundary = target.ownerDocument?.body || document.body;
  const legacyRow = findClosestWithin(target, LEGACY_ROW_SELECTOR, { maxDepth, boundary });
  if (legacyRow && hasRetailInputs(legacyRow)) {
    return legacyRow;
  }

  const strictMatch = findAncestorWithin(target, (el) => hasRetailInputs(el) && hasRetailResourceLink(el), {
    maxDepth,
    boundary,
  });
  if (strictMatch) return strictMatch;

  return findAncestorWithin(target, (el) => hasRetailInputs(el), { maxDepth, boundary });
}

export function findFirstRetailRow(root = document) {
  const input = root?.querySelector?.(SELL_INPUT_SELECTOR);
  return input ? findRetailRowFromTarget(input) : null;
}

export function readRetailRow(row) {
  if (!isElement(row)) return null;

  const infoColumnEl = getInfoColumn(row);
  const priceInput = row.querySelector(PRICE_INPUT_SELECTOR);
  const quantityInput = row.querySelector(QUANTITY_INPUT_SELECTOR);
  const productId = extractProductIdFromRow(row);

  let productName = "Unknown";
  if (infoColumnEl) {
    const h3 = infoColumnEl.querySelector("h3");
    if (h3) {
      const text = (h3.textContent || "").trim();
      if (text) productName = text;
    }
  }

  if (productName === "Unknown") {
    const h3s = row.querySelectorAll("h3");
    for (const h3 of h3s) {
      const text = (h3.textContent || "").trim();
      if (text) {
        productName = text;
        break;
      }
    }
  }

  return {
    rowEl: row,
    infoColumnEl,
    productId,
    productName,
    priceInput,
    quantityInput,
  };
}

export function observeRetailPage(root = document, onChange) {
  const target = root?.body || root;
  return observeMutations(target, onChange);
}

export const _testUtils = {
  SELL_INPUT_SELECTOR,
  PRICE_INPUT_SELECTOR,
  QUANTITY_INPUT_SELECTOR,
  RESOURCE_LINK_SELECTOR,
  LEGACY_ROW_SELECTOR,
};
