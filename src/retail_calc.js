// retail_calc.js
// Pure calculation and formatting helpers extracted from retail_ui.js
import { formatMoney } from "./utils.js";
import { t } from "./i18n.js";

export function classifyProfitPerMin(ppm) {
  if (!Number.isFinite(ppm)) return { label: t("na"), cls: "scx-chip-na" };
  if (ppm < 0) return { label: t("bad"), cls: "scx-chip-bad" };
  if (ppm >= 50) return { label: t("excellent"), cls: "scx-chip-excellent" };
  if (ppm >= 20) return { label: t("good"), cls: "scx-chip-good" };
  if (ppm >= 5) return { label: t("meh"), cls: "scx-chip-meh" };
  return { label: t("low"), cls: "scx-chip-meh" };
}

/**
 * Parse a duration string like "1h 5m" or "1t 5st" (DE) into total seconds.
 */
export function parseDurationToSeconds(text) {
  const s = String(text);
  let total = 0;
  const d = s.match(/(\d+)\s*(?:d|t)\b/i);
  const h = s.match(/(\d+)\s*(?:h|st)\b/i);
  const m = s.match(/(\d+)\s*m\b/i);
  const sec = s.match(/(\d+)\s*s\b/i);
  if (d) total += Number(d[1]) * 86400;
  if (h) total += Number(h[1]) * 3600;
  if (m) total += Number(m[1]) * 60;
  if (sec) total += Number(sec[1]);
  return total > 0 ? total : NaN;
}

export function computeMetrics({ profitPerUnit, qty, seconds }) {
  const totalProfit = profitPerUnit * qty;
  const minutes = seconds / 60;
  const hours = seconds / 3600;

  const profitPerMin = isFinite(totalProfit) && minutes > 0 ? totalProfit / minutes : NaN;
  const profitPerHr = profitPerMin * 60;
  const profitPerDay = profitPerHr * 24;

  return { totalProfit, profitPerMin, profitPerHr, profitPerDay, seconds, minutes, hours };
}

export function formatRetailAsText(productName, metrics, _productId, _realmId, marketAnalysisData) {
  const lines = [
    `Product: ${productName}`,
    `Profit/Min: ${formatMoney(metrics.profitPerMin)}`,
    `Total Profit: ${formatMoney(metrics.totalProfit)}`,
    `Profit/Hour: ${formatMoney(metrics.profitPerHr)}`,
    `Profit/Day: ${formatMoney(metrics.profitPerDay)}`,
    ``,
    `Quantity: ${metrics.qty}`,
    `Your Price: ${formatMoney(metrics.yourPrice)}`,
    `Finish in: ${metrics.seconds}s (${metrics.hours.toFixed(2)}hrs)`,
  ];

  if (marketAnalysisData) {
    lines.push("");
    lines.push("--- Retail vs Market ---");
    lines.push(`Cost of Goods: ${formatMoney(marketAnalysisData.cogs)}`);
    lines.push(`Unit Cost: ${formatMoney(marketAnalysisData.avgCost)}`);
    lines.push(`Retail Net Profit: ${formatMoney(marketAnalysisData.retailNetProfit)}`);
    lines.push(`Market Net Profit: ${formatMoney(marketAnalysisData.marketProfit)}`);
    const diff = marketAnalysisData.retailProfit - marketAnalysisData.marketProfit;
    const winner = diff >= 0 ? "Retail wins by" : "Market wins by";
    lines.push(`${winner}: ${formatMoney(Math.abs(diff))}`);
    lines.push(`Cheapest Market Price: ${formatMoney(marketAnalysisData.cheapestPrice)}`);
  }

  return lines.join("\n");
}
