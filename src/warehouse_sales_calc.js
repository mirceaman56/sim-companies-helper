// Pure helpers for the warehouse sales-message builder: pricing (margin or manual override),
// quantity formatting and the chat sell-message lines. Settings are always passed in.
import { formatMoney } from "./utils.js";

/** Stable key of a stock row (product kind + quality). */
export function normalizeRowKey(row) {
  return row?.key || `${row?.kind}:${row?.quality}`;
}

export function compactQuantity(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";

  const abs = Math.abs(amount);
  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];

  for (const unit of units) {
    if (abs >= unit.value) {
      const scaled = amount / unit.value;
      const rounded = Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "");
      return `${rounded}${unit.suffix}`;
    }
  }

  return Math.round(amount).toLocaleString("en-US");
}

export function calculateMarginPrice(unitCost, marginPct) {
  const cost = Number(unitCost || 0);
  const margin = Number(marginPct || 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return cost * (1 + margin / 100);
}

function normalizePriceInput(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!raw) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function getRowPrice(row, settings) {
  const key = normalizeRowKey(row);
  const manualPrice = normalizePriceInput(settings.manualPrices?.[key]);
  if (manualPrice !== null) return manualPrice;
  return calculateMarginPrice(row.unitCost, settings.marginPct);
}

export function hasManualPriceOverride(row, settings) {
  const key = normalizeRowKey(row);
  return normalizePriceInput(settings.manualPrices?.[key]) !== null;
}

export function buildSellMessageLine(row, settings) {
  const price = getRowPrice(row, settings);
  if (!Number.isFinite(price) || price <= 0) return "";

  const quality = Math.round(Number(row.quality || 0));
  return `sell ${compactQuantity(row.amount)} :re-${row.kind}: Q${quality} @ ${formatMoney(price, { decimals: 2 })}`;
}

export function buildSalesMessage(rows, settings) {
  const selectedKeys = new Set(settings.selectedKeys || []);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => selectedKeys.has(normalizeRowKey(row)))
    .map((row) => buildSellMessageLine(row, settings))
    .filter(Boolean)
    .join("\n");
}

export function getSelectedProductRows(rows, settings) {
  const productIds = new Set((settings.productIds || []).map(Number));
  return (Array.isArray(rows) ? rows : []).filter((row) => productIds.has(Number(row.kind)));
}
