// production.js
// Handles recipe data and production cost calculations
import { fetchMarketPrice } from "./market.js";
import recipesData from "./resources/recipes.json";
import { t } from "./i18n.js";
import { MARKET_FEE, TRANSPORT_RESOURCE_ID } from "./utils.js";

/**
 * Get all recipes
 */
export function getRecipes() {
  // recipes.json is now a direct array, not wrapped in an object
  return Array.isArray(recipesData) ? recipesData : recipesData.recipes || [];
}

/**
 * Get a specific recipe by product ID
 */
export function getRecipeByProductId(productId) {
  const recipes = getRecipes();
  return recipes.find((r) => r.id === productId);
}

/**
 * Fetch market prices for specific product IDs using market.js
 * Returns map of productId -> price
 */
export async function fetchMarketPrices(realmId, productIds) {
  const prices = new Map();

  for (const productId of productIds) {
    const price = await fetchMarketPrice(realmId, productId);
    if (Number.isFinite(price)) {
      prices.set(productId, price);
    }
  }

  return prices;
}

/**
 * Full production analysis: cost + profit (including transport costs)
 * Returns { recipe, productionCost, transportCost, breakEvenAnalysis, profitAnalysis }
 */
export async function analyzeProduction(productId, quantity, pricesMap, realmId = null, uiUnitCost = null) {
  const recipe = getRecipeByProductId(productId);
  if (!recipe) return null;

  // 1. Determine Transport Container Price and Product Price
  let containerPrice = 0;
  let productMarketPrice = 0;

  try {
    if (realmId != null) {
      // Container Price
      containerPrice = pricesMap?.get(TRANSPORT_RESOURCE_ID);
      if (!Number.isFinite(containerPrice)) {
        containerPrice = await fetchMarketPrice(realmId, TRANSPORT_RESOURCE_ID);
      }

      // Product Market Price (for profit analysis)
      productMarketPrice = pricesMap?.get(productId);
      if (!Number.isFinite(productMarketPrice)) {
        productMarketPrice = await fetchMarketPrice(realmId, productId);
      }
    }
  } catch (e) {
    // Silent catch
  }

  if (!Number.isFinite(containerPrice)) containerPrice = 0;
  if (!Number.isFinite(productMarketPrice)) productMarketPrice = 0;

  // 2. Calculate Base Production Cost
  // Strictly use UI Unit Cost as requested.

  if (uiUnitCost === null || !Number.isFinite(uiUnitCost)) {
    return {
      recipe,
      quantity,
      productionCost: NaN,
      unitCost: NaN,
      transportCost: 0,
      breakEvenAnalysis: null,
      profitAnalysis: null,
      error: t("unitCostNotFound"),
    };
  }

  const totalBaseCost = uiUnitCost * quantity;

  // 3. Calculate Transport Costs
  const transportNeeded = recipe.transport || 0; // units per item

  // Market needs full transport
  const marketTransportCost = transportNeeded * quantity * containerPrice;

  // Contract needs half transport
  const contractTransportCost = (transportNeeded / 2) * quantity * containerPrice;

  // 4. Calculate Break-even Prices
  // Market: (Base + Transport) / (1 - fee) / Qty
  const marketTotalCost = totalBaseCost + marketTransportCost;
  const marketBreakEvenPrice = marketTotalCost / (1 - MARKET_FEE) / quantity;

  // Contract: (Base + Transport) / Qty (No fee)
  const contractTotalCost = totalBaseCost + contractTransportCost;
  const contractBreakEvenPrice = contractTotalCost / quantity;

  // 5. Profit Analysis (Assuming selling at Market Price)
  const sellRevenue = productMarketPrice * quantity;

  // Market Profit
  const marketRevenueNet = sellRevenue * (1 - MARKET_FEE); // Deduct fee
  const marketProfit = marketRevenueNet - marketTotalCost;
  const marketMargin = marketTotalCost > 0 ? (marketProfit / marketTotalCost) * 100 : 0;

  // Contract Profit (No fee, Half Transport)
  // Revenue is full Market Price (as per user request "assuming selling at lowest market price")
  const contractProfit = sellRevenue - contractTotalCost;
  const contractMargin = contractTotalCost > 0 ? (contractProfit / contractTotalCost) * 100 : 0;

  return {
    recipe,
    quantity,
    productionCost: totalBaseCost, // Base Cost
    unitCost: uiUnitCost,
    transportCost: marketTransportCost,
    marketPrice: productMarketPrice,
    breakEvenAnalysis: {
      market: {
        totalCost: marketTotalCost,
        transportCost: marketTransportCost,
        breakEvenPrice: marketBreakEvenPrice,
      },
      contract: {
        totalCost: contractTotalCost,
        transportCost: contractTransportCost,
        breakEvenPrice: contractBreakEvenPrice,
      },
    },
    profitAnalysis: {
      market: {
        profit: marketProfit,
        margin: marketMargin,
      },
      contract: {
        profit: contractProfit,
        margin: contractMargin,
      },
    },
  };
}
