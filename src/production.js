// production.js
// Handles recipe data and production cost calculations
import { fetchMarketPrice, fetchMarket } from "./market.js";
import recipesData from "./recipes.json";

const MARKET_FEE = 0.04; // 4% fee on market sales

/**
 * Get all recipes
 */
export function getRecipes() {
  // recipes.json is now a direct array, not wrapped in an object
  return Array.isArray(recipesData) ? recipesData : (recipesData.recipes || []);
}

/**
 * Get a specific recipe by product ID
 */
export function getRecipeByProductId(productId) {
  const recipes = getRecipes();
  return recipes.find((r) => r.id === productId);
}

/**
 * Get all product IDs from recipes
 */
export function getAllProductIds() {
  return getRecipes().map((r) => r.id);
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
 * Calculate production cost for a given product and quantity
 * Returns { totalCost, materialCosts, transportCost, missingPrices }
 */
export function calculateProductionCost(productId, quantity, pricesMap, transportCost = 0) {
  const recipe = getRecipeByProductId(productId);
  if (!recipe) {
    return {
      totalCost: NaN,
      materialCosts: [],
      transportCost: 0,
      missingPrices: [],
    };
  }

  const materialCosts = [];
  const missingPrices = [];
  let totalCost = 0;

  for (const material of recipe.materials || []) {
    const price = pricesMap?.get(material.id);
    const materialQty = material.quantity * quantity;

    if (Number.isFinite(price)) {
      const cost = price * materialQty;
      totalCost += cost;
      materialCosts.push({
        materialId: material.id,
        quantity: materialQty,
        unitPrice: price,
        totalCost: cost,
      });
    } else {
      missingPrices.push(material.id);
      materialCosts.push({
        materialId: material.id,
        quantity: materialQty,
        unitPrice: NaN,
        totalCost: NaN,
      });
    }
  }

  // Add transport cost
  totalCost += transportCost;

  return {
    totalCost: missingPrices.length === 0 ? totalCost : NaN,
    materialCosts,
    transportCost,
    missingPrices,
  };
}

/**
 * Calculate selling profit for produced goods
 * Returns { sellPrice, feeAmount, netProceeds, profit, profitMargin }
 */
export function calculateSellProfit(productId, quantity, marketPrice, productionCost, laborCost = 0) {
  if (!Number.isFinite(marketPrice) || !Number.isFinite(productionCost)) {
    return {
      sellPrice: NaN,
      feeAmount: NaN,
      netProceeds: NaN,
      profit: NaN,
      profitMargin: NaN,
    };
  }

  const sellPrice = marketPrice * quantity;
  const feeAmount = sellPrice * MARKET_FEE;
  const netProceeds = sellPrice - feeAmount;
  // Include labor cost in profit calculation
  const totalCost = productionCost + laborCost;
  const profit = netProceeds - totalCost;

  return {
    sellPrice,
    feeAmount,
    netProceeds,
    profit,
    laborCost,
    profitMargin: totalCost > 0 ? (profit / totalCost) * 100 : NaN,
  };
}

/**
 * Full production analysis: cost + profit (including transport costs)
 * Returns { recipe, productionCost, transportCost, breakEvenAnalysis, profitAnalysis }
 */
export async function analyzeProduction(productId, quantity, pricesMap, realmId = null, uiUnitCost = null) {
  const recipe = getRecipeByProductId(productId);
  if (!recipe) return null;

  // 1. Determine Transport Container Price (ID 13) and Product Price
  let containerPrice = 0;
  let productMarketPrice = 0;

  try {
    if (realmId != null) {
      // Container Price
      containerPrice = pricesMap?.get(13);
      if (!Number.isFinite(containerPrice)) {
        containerPrice = await fetchMarketPrice(realmId, 13);
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
  // If uiUnitCost is not provided, we cannot calculate cost without material lookups (which were removed).
  
  if (uiUnitCost === null || !Number.isFinite(uiUnitCost)) {
    return {
      recipe,
      quantity,
      productionCost: NaN,
      unitCost: NaN,
      transportCost: 0,
      breakEvenAnalysis: null,
      profitAnalysis: null,
      error: "Unit cost not found"
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
  const marketBreakEvenPrice = (marketTotalCost / (1 - MARKET_FEE)) / quantity;

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
        breakEvenPrice: marketBreakEvenPrice
      },
      contract: {
        totalCost: contractTotalCost,
        transportCost: contractTransportCost,
        breakEvenPrice: contractBreakEvenPrice
      }
    },
    profitAnalysis: {
      market: {
        profit: marketProfit,
        margin: marketMargin
      },
      contract: {
        profit: contractProfit,
        margin: contractMargin
      }
    }
  };
}
