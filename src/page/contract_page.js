import { parseLocaleNumber } from "../utils.js";

const PRICE_INPUT_SELECTOR = 'input[name="price"]';
const AMOUNT_INPUT_SELECTOR = 'input[name="amount"]';
const MARKET_LINK_SELECTOR = 'a[href*="market/resource"]';
const ENCYCLOPEDIA_LINK_SELECTOR = 'a[href*="encyclopedia"]';
const TRANSPORT_IMAGE_SELECTOR = 'img[src*="transport"]';

export function findContractPriceInput(root = document) {
  return root?.querySelector?.(PRICE_INPUT_SELECTOR) || null;
}

export function findContractAmountInput(root = document) {
  return root?.querySelector?.(AMOUNT_INPUT_SELECTOR) || null;
}

export function hasContractPageElements(root = document) {
  return Boolean(findContractPriceInput(root) && root?.querySelector?.(MARKET_LINK_SELECTOR));
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

    const priceText = cells[cells.length - 1]?.textContent?.trim() || "";
    const match = priceText.match(/\$?\s*([\d.,]+)/);
    if (!match) continue;

    const price = parseContractPrice(match[1]);
    if (Number.isFinite(price) && price > 0) return price;
  }

  return null;
}

export function getSourcingCostPerUnit(root = document) {
  const encyclopediaLinks = root?.querySelectorAll?.(ENCYCLOPEDIA_LINK_SELECTOR) || [];

  for (const link of encyclopediaLinks) {
    const container = link.closest("div");
    if (!container) continue;

    const spans = container.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent.trim();
      if (!text.startsWith("$")) continue;

      const value = parseContractPrice(text.slice(1));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}

export function getTransportCount(root = document) {
  const transportImages = root?.querySelectorAll?.(TRANSPORT_IMAGE_SELECTOR) || [];

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
