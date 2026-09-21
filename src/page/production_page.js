import { parseLocaleNumber, extractProductIdFromRow } from "../utils.js";
import { findAncestorWithin } from "./page_utils.js";

const AMOUNT_INPUT_SELECTOR = 'input[name="amount"]';
const RESOURCE_LINK_SELECTOR = 'a[href*="/encyclopedia/"][href*="/resource/"]';
const RESOURCE_IMAGE_SELECTOR = 'img[src*="/resources/"]';
const MAX_ROW_SEARCH_DEPTH = 25;
export const MAX_PRODUCTION_QUALITY = 12;

// Busy layout: the running order pairs each label cell with its value cell
// through `id` / `headers`, which is language independent.
const BUSY_LABEL_SELECTOR = 'td[id^="busy-info-label-"]';
const BUSY_VALUE_SELECTOR = 'td[headers^="busy-info-label-"]';

// Setup layout: stats live in a description list and quality is a star stepper.
const QUALITY_STAR_SELECTOR = 'svg[data-icon="star"], .fa-star';
const QUALITY_STEPPER_SELECTOR = 'svg[data-icon="minus"], svg[data-icon="plus"], .fa-minus, .fa-plus';
const STAT_VALUE_SELECTOR = "dl dd";
const MAX_STAR_GROUP_DEPTH = 6;

// Money is matched on the game's single currency symbol, before or after the
// number, so locale formatting (`$8.85`, `8,85 $`) both parse.
const MONEY_PATTERN = /\$\s*-?[\d.,]+|-?[\d.,]+\s*\$/g;
// A per-hour rate is a number followed by a slash and a unit letter ("/h",
// "/Std"), which no translation drops.
const RATE_PATTERN = /\d\s*\/\s*\p{L}/u;
const TIME_PATTERN = /\d:\d/;

function isElement(value) {
  return value instanceof Element;
}

function hasProductLink(el) {
  return Boolean(el?.querySelector?.(RESOURCE_LINK_SELECTOR));
}

function hasQuantityInput(el) {
  return Boolean(el?.querySelector?.(AMOUNT_INPUT_SELECTOR));
}

function hasResourceImage(el) {
  return Boolean(el?.querySelector?.(RESOURCE_IMAGE_SELECTOR));
}

function clampQuality(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_PRODUCTION_QUALITY);
}

function readMoneyValues(text) {
  const matches = String(text || "").match(MONEY_PATTERN) || [];
  return matches.map((raw) => parseLocaleNumber(raw)).filter((value) => Number.isFinite(value));
}

/**
 * The running order block. Detected structurally so no UI copy is matched.
 */
function isBusyProductionBlock(el) {
  return Boolean(el?.querySelector?.(BUSY_VALUE_SELECTOR) && el.querySelector("h3") && hasResourceImage(el));
}

export function findProductionRowFromTarget(target) {
  if (!isElement(target)) return null;

  const body = target.ownerDocument?.body || document.body;
  const options = { maxDepth: MAX_ROW_SEARCH_DEPTH, boundary: body };

  // The setup form nests the quantity input several levels below the product
  // it belongs to, and the input requirements are resource images too, so the
  // encyclopedia link is matched first and artwork only as a fallback.
  return (
    findAncestorWithin(target, isBusyProductionBlock, options) ||
    findAncestorWithin(target, (el) => hasQuantityInput(el) && hasProductLink(el), options) ||
    findAncestorWithin(target, (el) => hasQuantityInput(el) && hasResourceImage(el), options)
  );
}

export function findBusyProductionBlockFromTarget(target) {
  if (!isElement(target)) return null;

  const body = target.ownerDocument?.body || document.body;
  return findAncestorWithin(target, isBusyProductionBlock, {
    maxDepth: MAX_ROW_SEARCH_DEPTH,
    boundary: body,
  });
}

export function findBusyProductionBlock(root = document) {
  const cell = root?.querySelector?.(BUSY_LABEL_SELECTOR) || root?.querySelector?.(BUSY_VALUE_SELECTOR);
  return cell ? findBusyProductionBlockFromTarget(cell) : null;
}

export function findFirstProductionRow(root = document) {
  const firstInput = root?.querySelector?.(AMOUNT_INPUT_SELECTOR);
  if (firstInput) {
    const row = findProductionRowFromTarget(firstInput);
    if (row) return row;
  }

  return findBusyProductionBlock(root);
}

/**
 * Resource artwork file names are not translated, so the icon slug identifies
 * the product on blocks that carry no encyclopedia link.
 * @param {Element | null | undefined} root
 * @returns {string | null}
 */
export function extractResourceSlug(root) {
  const src = root?.querySelector?.(RESOURCE_IMAGE_SELECTOR)?.getAttribute("src") || "";
  const fileName = src.split("/").pop() || "";
  return fileName.split(".")[0] || null;
}

function groupStarsByParent(row) {
  const groups = new Map();

  for (const star of row.querySelectorAll(QUALITY_STAR_SELECTOR)) {
    const parent = star.parentElement;
    if (!parent) continue;
    groups.set(parent, (groups.get(parent) || 0) + 1);
  }

  return groups;
}

function distanceToStepper(el) {
  let node = el;
  for (let depth = 0; depth < MAX_STAR_GROUP_DEPTH && node; depth += 1) {
    if (node.querySelector?.(QUALITY_STEPPER_SELECTOR)) return depth;
    node = node.parentElement;
  }
  return Infinity;
}

/**
 * Read the selected output quality from the star stepper. The product artwork
 * renders its own star row, so stars are grouped by their container and the
 * group closest to the +/- controls wins.
 * @param {Element} row
 * @returns {number}
 */
export function readSelectedStarQuality(row) {
  if (!isElement(row)) return 0;

  const groups = groupStarsByParent(row);
  if (groups.size === 0) return 0;

  let selected = 0;
  let selectedDistance = Infinity;
  let fallback = 0;

  for (const [parent, count] of groups) {
    const distance = distanceToStepper(parent);
    if (distance < selectedDistance) {
      selected = count;
      selectedDistance = distance;
    }
    if (count > fallback) fallback = count;
  }

  return selectedDistance === Infinity ? fallback : selected;
}

export function getProductionQuality(row) {
  if (!isElement(row)) return 0;
  return clampQuality(readSelectedStarQuality(row));
}

export function getProductionQuantity(row) {
  if (!isElement(row)) return 1;

  const value = Number(row.querySelector(AMOUNT_INPUT_SELECTOR)?.value || 0);
  return value > 0 ? value : 1;
}

/**
 * Classify one stat value by shape instead of by its label:
 *  - a clock value ("7:44 PM")      -> ignored
 *  - "%"                            -> abundance
 *  - money + a per-hour rate        -> wages per hour
 *  - money                          -> a cost cell, with every amount it holds
 *  - a per-hour rate                -> output per hour
 *  - plain digits                   -> current stock
 */
function classifyStatValue(text) {
  const raw = String(text || "").trim();
  if (!/\d/.test(raw)) return null;
  if (TIME_PATTERN.test(raw)) return null;

  if (raw.includes("%")) {
    const value = parseLocaleNumber(raw);
    return Number.isFinite(value) ? { kind: "abundance", value } : null;
  }

  const money = readMoneyValues(raw);
  const isRate = RATE_PATTERN.test(raw);

  if (money.length > 0) {
    if (isRate) return { kind: "wagesPerHour", value: money[0] };
    return { kind: "cost", value: money[0], values: money };
  }

  const value = parseLocaleNumber(raw);
  if (!Number.isFinite(value)) return null;

  return isRate ? { kind: "productionPerHour", value } : { kind: "stock", value };
}

/**
 * Pick the cost of one produced unit out of the cost cells.
 *
 * The cell that also carries the warehouse comparison holds two amounts (the
 * order's unit cost first, the stocked average second). Otherwise the list is
 * ordered total labor cost, then unit cost. A single cost cell is ambiguous, so
 * nothing is reported rather than guessing.
 */
function resolveUnitCost(costCells) {
  const paired = costCells.find((cell) => cell.values.length >= 2);
  if (paired) {
    return { unitCost: paired.values[0], stockUnitCost: paired.values[1], laborCostTotal: null };
  }

  if (costCells.length >= 2) {
    return {
      unitCost: costCells.at(-1).value,
      stockUnitCost: null,
      laborCostTotal: costCells[0].value,
    };
  }

  return { unitCost: null, stockUnitCost: null, laborCostTotal: null };
}

/**
 * Read the stats the setup form prints for the selected product.
 * The list is rendered twice (narrow + wide layout), so repeated cells are
 * skipped.
 * @param {Element} row
 */
export function readProductionStats(row) {
  if (!isElement(row)) return null;

  const seen = new Set();
  const costCells = [];
  const single = {};

  for (const cell of row.querySelectorAll(STAT_VALUE_SELECTOR)) {
    const text = (cell.textContent || "").replace(/\s+/g, " ").trim();
    if (seen.has(text)) continue;
    seen.add(text);

    const entry = classifyStatValue(text);
    if (!entry) continue;

    if (entry.kind === "cost") {
      costCells.push(entry);
    } else if (single[entry.kind] === undefined) {
      single[entry.kind] = entry.value;
    }
  }

  if (costCells.length === 0 && Object.keys(single).length === 0) return null;

  const { unitCost, stockUnitCost, laborCostTotal } = resolveUnitCost(costCells);
  const wagesPerHour = single.wagesPerHour ?? null;
  const productionPerHour = single.productionPerHour ?? null;

  let laborCostPerUnit = null;
  if (wagesPerHour !== null && productionPerHour > 0) {
    laborCostPerUnit = wagesPerHour / productionPerHour;
  }

  return {
    unitCost,
    stockUnitCost,
    laborCostTotal,
    laborCostPerUnit,
    abundancePct: single.abundance ?? null,
    currentStock: single.stock ?? null,
  };
}

function getBusyValueIndex(cell) {
  const headers = cell.getAttribute("headers") || "";
  const index = Number.parseInt(headers.split("-").pop(), 10);
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

/**
 * Classify a running-order value cell without reading its label:
 *  - "%" suffix -> percent (abundance)
 *  - a currency mark -> money
 *  - digits only -> plain number (quantity / quality)
 */
function classifyBusyValue(text) {
  const raw = String(text || "").trim();
  if (!/\d/.test(raw)) return null;

  const value = parseLocaleNumber(raw);
  if (!Number.isFinite(value)) return null;

  if (raw.includes("%")) return { kind: "percent", value };

  const hasCurrencyMark = /[^\d\s.,+-]/.test(raw);
  return { kind: hasCurrencyMark ? "money" : "number", value };
}

export function readBusyProductionValues(block) {
  if (!isElement(block)) return [];

  const cells = [...block.querySelectorAll(BUSY_VALUE_SELECTOR)];
  return cells
    .map((cell) => ({ index: getBusyValueIndex(cell), ...(classifyBusyValue(cell.textContent) || {}) }))
    .filter((entry) => entry.kind)
    .sort((a, b) => a.index - b.index);
}

function pickBusyQuantityEntry(numbers, unitCost, sourcingValue) {
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0];

  // Sourcing value / cost per unit gives the produced amount, so the number
  // closest to that ratio is the quantity no matter how rows are ordered.
  if (unitCost > 0 && Number.isFinite(sourcingValue)) {
    const expected = sourcingValue / unitCost;
    let best = null;
    let bestError = Infinity;

    for (const entry of numbers) {
      const error = Math.abs(entry.value - expected) / Math.max(expected, 1);
      if (error < bestError) {
        best = entry;
        bestError = error;
      }
    }

    if (best && bestError <= 0.05) return best;
  }

  return numbers[0];
}

/**
 * Product name from the block heading.
 * The setup heading reads "<product><nested quality markers>", the running
 * order heading reads "<static word><nested product>", so the two take the
 * opposite part of the same element.
 * @param {Element | null | undefined} block
 * @param {{ fromNested?: boolean }} [input]
 */
function extractProductName(block, input = {}) {
  const heading = block?.querySelector?.("h3");
  if (!heading) return null;

  if (input.fromNested) {
    const nested = [...heading.children].at(-1);
    return (nested?.textContent || heading.textContent || "").trim() || null;
  }

  const ownText = [...heading.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(" ");

  return ownText || (heading.textContent || "").trim() || null;
}

/**
 * Parse the running-order block.
 * @param {Element} block
 */
export function readBusyProductionBlock(block) {
  if (!isElement(block)) return null;

  const entries = readBusyProductionValues(block);
  if (entries.length === 0) return null;

  const moneyValues = entries.filter((entry) => entry.kind === "money").map((entry) => entry.value);
  const numbers = entries.filter((entry) => entry.kind === "number");

  const unitCost = moneyValues.length ? Math.min(...moneyValues) : null;
  const sourcingValue = moneyValues.length ? Math.max(...moneyValues) : null;

  const quantityEntry = pickBusyQuantityEntry(numbers, unitCost, sourcingValue);
  const qualityEntry = numbers.find(
    (entry) => entry !== quantityEntry && entry.value > 0 && entry.value <= MAX_PRODUCTION_QUALITY,
  );

  const quantity = quantityEntry && quantityEntry.value > 0 ? quantityEntry.value : 1;

  return {
    blockEl: block,
    productSlug: extractResourceSlug(block),
    productName: extractProductName(block, { fromNested: true }) || "Unknown",
    quantity,
    quality: clampQuality(qualityEntry?.value ?? 0),
    unitCost: Number.isFinite(unitCost) ? unitCost : null,
    sourcingValue: Number.isFinite(sourcingValue) ? sourcingValue : null,
  };
}

/**
 * Parse either production block into one stable shape.
 * @param {Element} row
 */
export function readProductionRow(row) {
  if (!isElement(row)) return null;

  if (isBusyProductionBlock(row)) {
    const busy = readBusyProductionBlock(row);
    if (busy) {
      return {
        rowEl: row,
        stats: null,
        productId: extractProductIdFromRow(row),
        productSlug: busy.productSlug,
        productName: busy.productName,
        quantityInput: null,
        quantity: busy.quantity,
        quality: busy.quality,
        unitCost: busy.unitCost,
        sourcingValue: busy.sourcingValue,
        isActive: true,
      };
    }
  }

  const stats = readProductionStats(row);

  return {
    rowEl: row,
    stats,
    productId: extractProductIdFromRow(row),
    productSlug: extractResourceSlug(row),
    productName: extractProductName(row) || "Unknown",
    quantityInput: row.querySelector(AMOUNT_INPUT_SELECTOR),
    quantity: getProductionQuantity(row),
    quality: getProductionQuality(row),
    unitCost: stats?.unitCost ?? null,
    sourcingValue: null,
    isActive: false,
  };
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

    // Language independent: a short "<label> <number>" chip such as "Level 16",
    // "Niveau 16" or "レベル 16".
    const match = text.match(/^\D{0,20}?(\d{1,3})$/u);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    if (level < 1 || level > 100 || text.length > 30) continue;

    const parent = div.parentElement;
    if (parent?.textContent && parent.textContent.length < 500) {
      return level;
    }
  }

  return null;
}
