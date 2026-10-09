import { parseLocaleNumber } from "../utils.js";
import { hasAllSelectors } from "./page_utils.js";

const PRICE_INPUT_SELECTOR = 'input[name="price"]';
const AMOUNT_INPUT_SELECTOR = 'input[name="amount"]';
const MARKET_LINK_SELECTOR = 'a[href*="market/resource"]';
const ENCYCLOPEDIA_LINK_SELECTOR = 'a[href*="encyclopedia"]';
const TRANSPORT_IMAGE_SELECTOR = 'img[src*="transport"]';
const RECIPIENT_LOOKUP_SELECTOR = 'input[name="recipientLookup"]';

/** Markup injected by this extension (navbar chips, popovers, sidebar) must never be parsed as game data. */
const EXTENSION_MARKUP_SELECTOR = '[id^="scx-"], [class*="scx-"]';

function isExtensionMarkup(element) {
  return Boolean(element?.closest?.(EXTENSION_MARKUP_SELECTOR));
}

/** Game "$..." spans inside `container`, excluding extension markup. */
function currencySpans(container) {
  return Array.from(container.querySelectorAll("span")).filter(
    (span) => span.textContent.trim().startsWith("$") && !isExtensionMarkup(span),
  );
}

/**
 * Smallest ancestor of the contract price input that also holds the resource card (encyclopedia
 * link). Searches are limited to it so links/prices elsewhere on the page (navbar cash, menus)
 * are never picked up.
 */
function findContractScope(root = document) {
  const boundary = root?.body || root;
  for (let el = findContractPriceInput(root)?.parentElement || null; el; el = el.parentElement) {
    if (el.querySelector(ENCYCLOPEDIA_LINK_SELECTOR)) return el;
    if (el === boundary) break;
  }
  return boundary;
}

function findNearestCurrencyContainer(element, root = document) {
  const boundary = root?.body || root;

  for (let ancestor = element?.parentElement || null; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === "DIV") {
      const hasCurrencySpan = currencySpans(ancestor).length > 0;

      if (hasCurrencySpan) return ancestor;
    }

    if (ancestor === boundary) break;
  }

  return null;
}

export function findContractPriceInput(root = document) {
  return root?.querySelector?.(PRICE_INPUT_SELECTOR) || null;
}

export function findContractAmountInput(root = document) {
  return root?.querySelector?.(AMOUNT_INPUT_SELECTOR) || null;
}

export function isContractAmountInput(element) {
  return Boolean(element?.matches?.(AMOUNT_INPUT_SELECTOR));
}

export function hasContractPageElements(root = document) {
  return hasAllSelectors(root, [PRICE_INPUT_SELECTOR, MARKET_LINK_SELECTOR]);
}

export function getContractProductId(root = document) {
  const link = root?.querySelector?.(MARKET_LINK_SELECTOR);
  const href = link?.getAttribute("href") || "";
  const match = href.match(/\/resource\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

// why: structural, not text (the game UI is localized): the beneficiary section is the first
// <h3>'s next sibling in the form. Breaks if the game reorders the form.
function findBeneficiarySection(root = document) {
  const form = findContractPriceInput(root)?.closest("form");
  return form?.querySelector("h3")?.nextElementSibling || null;
}

export function hasSelectedBeneficiary(root = document) {
  const section = findBeneficiarySection(root);
  if (!section) return false;
  if (section.querySelector(RECIPIENT_LOOKUP_SELECTOR)) return false;
  return Boolean(section.querySelector("b"));
}

export function getSelectedCompanyName(root = document) {
  if (!hasSelectedBeneficiary(root)) return null;
  const name = findBeneficiarySection(root)?.querySelector("b")?.textContent?.trim();
  return name || null;
}

/**
 * Same rounding SimCompanies uses for contract prices (3 decimal places).
 */
export function computeDiscountedPrice(lowestPrice, discountPct) {
  if (!Number.isFinite(lowestPrice) || lowestPrice <= 0) return null;
  const pct = Number.isFinite(discountPct) ? discountPct : 0;
  return Math.floor(lowestPrice * (1 - pct / 100) * 1000) / 1000;
}

export function parseContractPrice(raw) {
  const value = String(raw || "").trim();
  if (!value) return NaN;

  if (value.includes(".") && !value.includes(",")) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : NaN;
  }

  return parseLocaleNumber(value);
}

export function getContractAmountValue(root = document) {
  const input = findContractAmountInput(root);
  if (!input) return null;

  const value = parseLocaleNumber(input.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getContractPriceValue(root = document) {
  const input = findContractPriceInput(root);
  if (!input) return null;

  const value = parseContractPrice(input.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getLowestSellerPrice(root = document) {
  const marketLinks = root?.querySelectorAll?.(MARKET_LINK_SELECTOR) || [];

  for (const link of marketLinks) {
    const table = link.querySelector("table");
    if (!table) continue;

    const firstRow = table.querySelector("tr");
    if (!firstRow) continue;

    const cells = firstRow.querySelectorAll("td");
    if (cells.length === 0) continue;

    // The last cell may contain both quality (e.g. "7 ★") and price ("$1.370")
    // in the same <td>. Use the last cell text but require the "$" prefix so
    // the quality number is not mistakenly picked up.
    const priceText = cells[cells.length - 1]?.textContent?.trim() || "";
    const match = priceText.match(/\$\s*([\d.,]+)/);
    if (!match) continue;

    const price = parseContractPrice(match[1]);
    if (Number.isFinite(price) && price > 0) return price;
  }

  return null;
}

export function getSourcingCostPerUnit(root = document) {
  const scope = findContractScope(root);
  const encyclopediaLinks = scope?.querySelectorAll?.(ENCYCLOPEDIA_LINK_SELECTOR) || [];

  for (const link of encyclopediaLinks) {
    if (isExtensionMarkup(link)) continue;
    const container = findNearestCurrencyContainer(link, scope);
    if (!container) continue;

    for (const span of currencySpans(container)) {
      const text = span.textContent.trim();
      const value = parseContractPrice(text.slice(1));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}

export function getTransportCount(root = document) {
  const transportImages = findContractScope(root)?.querySelectorAll?.(TRANSPORT_IMAGE_SELECTOR) || [];

  for (const image of transportImages) {
    const container = image.parentElement;
    if (!container) continue;

    // Sourcing transport blocks include encyclopedia links; total transport section does not.
    if (container.querySelector(ENCYCLOPEDIA_LINK_SELECTOR)) continue;

    const spans = container.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent.trim();
      const match = text.match(/([\d.,]+)\s*x$/i);
      if (!match) continue;

      const rawInteger = match[1].replace(/[.,]/g, "");
      const value = parseInt(rawInteger, 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}
