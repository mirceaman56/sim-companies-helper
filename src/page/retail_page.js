import { parseLocaleNumber } from "../utils.js";
import {
  extractProductIdFromRow,
  getInfoColumn,
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

/**
 * Raw duration text of a retail row ("2h 30m", "13st, 31m"), unparsed. Duration
 * is shown in parentheses in most layouts; newer layouts put it in its own
 * element next to a time-of-day ("08:13") that must not be merged in.
 * @param {Element} row
 * @returns {string}
 */
export function readRetailDurationText(row) {
  const infoCol = readRetailRow(row)?.infoColumnEl;
  if (!infoCol) return "";

  const text = infoCol.textContent || "";
  const paren = text.match(/\(([^)]*\d+\s*(?:st|[dhmst])[^)]*)\)/);
  if (paren) return paren[1];

  let durationText = "";
  const durationPattern = /\d+\s*(?:d|t|h|st|m|s)\b/i;
  for (const el of infoCol.querySelectorAll(":scope *")) {
    const elText = el.textContent || "";
    if (durationPattern.test(elText) && !/\d{1,2}:\d{2}/.test(elText)) {
      durationText = elText;
    }
  }
  if (durationText) return durationText;

  // Fallback: duration inline without parentheses.
  return text;
}

/**
 * Signed profit per unit: the child div with the tooltip SVG, else a bare "$" amount div.
 * Negative is shown by minus/parentheses or only by red text.
 * @param {Element} row
 * @returns {number} NaN when not found
 */
export function readRetailProfitPerUnit(row) {
  const infoCol = readRetailRow(row)?.infoColumnEl;
  if (!infoCol) return NaN;

  const childDivs = [...infoCol.querySelectorAll(":scope > div")];
  const profitDiv =
    childDivs.find((d) => d.querySelector("svg")) ||
    childDivs.find((d) => /^\s*[-−]?\s*\$\s*[\d.,]+\s*$/.test(d.textContent));
  if (!profitDiv) return NaN;

  const text = profitDiv.textContent || "";
  const match = text.match(/([-−]?)\s*\$\s*([\d.,]+)/);
  if (!match) return NaN;

  const val = parseLocaleNumber(match[2]);
  if (!Number.isFinite(val)) return NaN;

  const hasExplicitMinus =
    match[1].length > 0 || /-\s*\$/.test(text) || /−\s*\$/.test(text) || /\(\s*\$?\s*\d/.test(text);
  if (hasExplicitMinus) return -Math.abs(val);

  const color = profitDiv.ownerDocument.defaultView?.getComputedStyle(profitDiv).color || "";
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb && Number(rgb[1]) > 150 && Number(rgb[2]) < 100 && Number(rgb[3]) < 100) return -Math.abs(val);

  return Math.abs(val);
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
