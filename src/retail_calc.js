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

/**
 * Compute 7-day averages and trend deltas from a retail-info API item.
 * Returns null when retailData is missing or too short.
 *
 * @param {object} item  — one entry from the retail-info API (quality === null)
 * @returns {{
 *   currentPrice: number,
 *   currentSat: number,
 *   currentDemand: number,
 *   avgPrice7d: number,
 *   avgSat7d: number,
 *   avgDemand7d: number,
 *   priceDelta7d: number,   // %  e.g. +0.041 means +4.1%
 *   satDelta7d: number,
 *   demandDelta7d: number,
 * } | null}
 */
export function computeRetailTrends(item) {
  if (!item || !Array.isArray(item.retailData) || item.retailData.length < 2) return null;

  const data = item.retailData;
  const last = data[data.length - 1]; // most recent day

  const currentPrice = last.averagePrice;
  const currentSat = last.saturation;
  const currentDemand = last.demand;

  // Use up to the last 7 days (excluding today) for the baseline
  const window = data.slice(Math.max(0, data.length - 8), data.length - 1);
  if (window.length === 0) return null;

  const avg = (arr, key) => arr.reduce((s, x) => s + x[key], 0) / arr.length;

  const avgPrice7d = avg(window, "averagePrice");
  const avgSat7d = avg(window, "saturation");
  const avgDemand7d = avg(window, "demand");

  const priceDelta7d = avgPrice7d > 0 ? (currentPrice - avgPrice7d) / avgPrice7d : 0;
  const satDelta7d = avgSat7d > 0 ? (currentSat - avgSat7d) / avgSat7d : 0;
  const demandDelta7d = avgDemand7d > 0 ? (currentDemand - avgDemand7d) / avgDemand7d : 0;

  return {
    currentPrice,
    currentSat,
    currentDemand,
    avgPrice7d,
    avgSat7d,
    avgDemand7d,
    priceDelta7d,
    satDelta7d,
    demandDelta7d,
  };
}

/**
 * Compute an opportunity score in the range [-1, 1].
 * Positive = good time to retail; negative = poor conditions.
 *
 * Formula:
 *   score = clamp( priceDelta - satDelta + demandDelta , -1, 1 )
 *
 *   - Rising price (+) increases score
 *   - Rising saturation (+) decreases score (more competition)
 *   - Rising demand (+) increases score
 *
 * @param {{ priceDelta7d: number, satDelta7d: number, demandDelta7d: number }} trends
 * @returns {number}
 */
export function computeOpportunityScore(trends) {
  if (!trends) return NaN;
  const { priceDelta7d, satDelta7d, demandDelta7d } = trends;
  const raw = priceDelta7d - satDelta7d + demandDelta7d;
  return Math.max(-1, Math.min(1, raw));
}

/**
 * Map an opportunity score + trends to a human-readable badge.
 *
 * @param {number} score
 * @param {{ satDelta7d: number, priceDelta7d: number, currentSat: number }} trends
 * @returns {{ label: string, cls: string, verdict: string }}
 */
export function getRetailBadge(score, trends) {
  if (!Number.isFinite(score) || !trends) {
    return { label: "retailBadgeNoData", cls: "scx-chip-na", verdict: "retailVerdictNoData" };
  }

  const { satDelta7d, priceDelta7d } = trends;

  // Hot: price rising and saturation falling
  if (priceDelta7d > 0.01 && satDelta7d < -0.01) {
    return { label: "retailBadgeHot", cls: "scx-chip-excellent", verdict: "retailVerdictHot" };
  }

  // Recovery: saturation falling but price still weak/flat
  if (satDelta7d < -0.02 && priceDelta7d <= 0.01) {
    return { label: "retailBadgeRecovery", cls: "scx-chip-good", verdict: "retailVerdictRecovery" };
  }

  // Crowded: saturation rising and price flat or falling
  if (satDelta7d > 0.02 && priceDelta7d <= 0) {
    return { label: "retailBadgeCrowded", cls: "scx-chip-bad", verdict: "retailVerdictCrowded" };
  }

  // Weakening: price falling regardless of saturation
  if (priceDelta7d < -0.02) {
    return { label: "retailBadgeFalling", cls: "scx-chip-bad", verdict: "retailVerdictFalling" };
  }

  return { label: "retailBadgeStable", cls: "scx-chip-meh", verdict: "retailVerdictStable" };
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
