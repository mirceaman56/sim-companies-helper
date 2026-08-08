// production_calc.js
// Pure calculation and formatting helpers extracted from production_ui.js
import { formatMoney, parseLocaleNumber } from "./utils.js";
import { t } from "./i18n.js";

export function extractDollarValue(text) {
  if (!text) return null;
  const match = text.match(/\$\s*([\d.,]+)/);
  if (match) {
    const val = parseLocaleNumber(match[1]);
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

export function calculateUpgradeMultiplier(currentLevel) {
  if (!currentLevel || currentLevel <= 0) {
    return null;
  }
  return 1 + 1 / currentLevel;
}

export function formatProductionAsText(
  recipe,
  analysis,
  quantity,
  buildingLevel,
  upgradeMultiplier,
  upgradedProduction,
  productionIncrease,
  projectedMarketProfit,
  projectedContractProfit,
  marketProfitDelta,
  contractProfitDelta,
) {
  const { productionCost, breakEvenAnalysis, profitAnalysis, marketPrice, unitCost, quality } = analysis;
  const qualitySuffix = quality > 0 ? ` Q${quality}` : "";
  const lines = [
    `${t("product")}: ${recipe.name}${qualitySuffix}`,
    `${t("quantity")}: ${quantity}`,
    ``,
    `${t("costLabel")}:`,
    `  ${t("baseUnitCost")}: ${formatMoney(unitCost)}`,
    `  Total Production Cost: ${formatMoney(productionCost)}`,
    ``,
  ];

  if (breakEvenAnalysis) {
    lines.push(
      `${t("breakEvenMarket")}:`,
      `  Total Cost: ${formatMoney(breakEvenAnalysis.market.totalCost)}`,
      `  ${t("transportCost")}: ${formatMoney(breakEvenAnalysis.market.transportCost)}`,
      `  ${t("breakEvenPrice")}: ${formatMoney(breakEvenAnalysis.market.breakEvenPrice)}`,
      ``,
      `${t("breakEvenContract")}:`,
      `  Total Cost: ${formatMoney(breakEvenAnalysis.contract.totalCost)}`,
      `  ${t("transportCost")}: ${formatMoney(breakEvenAnalysis.contract.transportCost)}`,
      `  ${t("breakEvenPrice")}: ${formatMoney(breakEvenAnalysis.contract.breakEvenPrice)}`,
      ``,
    );
  }

  if (profitAnalysis) {
    lines.push(
      `${t("profitAnalysisText")} (at $${formatMoney(marketPrice)}${qualitySuffix}):`,
      `  ${t("marketProfit")}: ${formatMoney(profitAnalysis.market.profit)}`,
      `  ${t("marketMargin")}: ${profitAnalysis.market.margin.toFixed(2)}%`,
      `  ${t("contractProfit")}: ${formatMoney(profitAnalysis.contract.profit)}`,
      `  ${t("contractMargin")}: ${profitAnalysis.contract.margin.toFixed(2)}%`,
      ``,
    );
  }

  if (buildingLevel && upgradeMultiplier) {
    lines.push(
      `${t("buildingUpgradeProjection")}:`,
      `  ${t("currentLevel")}: ${buildingLevel}`,
      `  ${t("productionAfterUpgrade")} (${t("lvl")} ${buildingLevel + 1}): ${upgradedProduction.toFixed(2)}`,
      `  ${t("productionIncreasePercent")}: +${productionIncrease.toFixed(2)} (${((upgradeMultiplier - 1) * 100).toFixed(1)}%)`,
      ``,
    );
  }

  if (projectedMarketProfit !== null && projectedContractProfit !== null) {
    lines.push(
      `${t("projectedProfitsAtLevel")} ${buildingLevel + 1}:`,
      `  Market Sell: ${formatMoney(projectedMarketProfit)}`,
    );
    if (marketProfitDelta !== null) {
      lines.push(`    ${t("delta")}: ${formatMoney(marketProfitDelta)}`);
    }
    lines.push(`  Contract Sell: ${formatMoney(projectedContractProfit)}`);
    if (contractProfitDelta !== null) {
      lines.push(`    ${t("delta")}: ${formatMoney(contractProfitDelta)}`);
    }
  }

  return lines.join("\n");
}
