import { findLastDigitLeaf } from "./page_utils.js";

const MONEY_BALANCE_SELECTOR = "#money-balance";
const FALLBACK_MONEY_LINK_SELECTOR = 'a[href*="/headquarters/overview"]';

export function findMoneyBalanceAnchor(root = document) {
  return (
    root?.querySelector?.(MONEY_BALANCE_SELECTOR) ||
    root?.querySelector?.(FALLBACK_MONEY_LINK_SELECTOR) ||
    null
  );
}

/**
 * Parse a navbar cash label ("$1,329,520", "$1.329.520", "-$12,345.67").
 * Thousands separators may be "," "." or spaces depending on locale; a final
 * separator followed by 1-2 digits is treated as the decimal mark.
 * @param {string} raw
 * @returns {number} NaN when no number is present.
 */
export function parseMoneyText(raw) {
  const text = String(raw ?? "");
  const match = text.match(/\d[\d.,\s\u00a0\u202f']*/);
  if (!match) return NaN;

  const negative = /-\s*\$?\s*$/.test(text.slice(0, match.index));
  const digitsAndSeps = match[0].replace(/[\s\u00a0\u202f']/g, "");
  const decimalMatch = digitsAndSeps.match(/^(.*\d)[.,](\d{1,2})$/);

  let value;
  if (decimalMatch) {
    value = Number(`${decimalMatch[1].replace(/[.,]/g, "")}.${decimalMatch[2]}`);
  } else {
    value = Number(digitsAndSeps.replace(/[.,]/g, ""));
  }
  return negative ? -value : value;
}

export function readMoneyBalance(root = document) {
  const anchor = findMoneyBalanceAnchor(root);
  if (!anchor) return NaN;
  return parseMoneyText(anchor.textContent);
}

/**
 * Innermost element rendering the cash amount (used to measure where the number sits).
 * @returns {Element | null}
 */
export function findMoneyTextElement(root = document) {
  return findLastDigitLeaf(findMoneyBalanceAnchor(root));
}

/**
 * Navbar context for the accounting widget: the cash link and the element that hosts it.
 * @returns {{ moneyAnchor: Element, hostEl: Element } | null}
 */
export function readMoneyNavbarContext(root = document) {
  const moneyAnchor = findMoneyBalanceAnchor(root);
  if (!moneyAnchor) return null;

  const hostEl = moneyAnchor.parentElement;
  if (!hostEl || hostEl === document.body) return null;

  return { moneyAnchor, hostEl };
}
