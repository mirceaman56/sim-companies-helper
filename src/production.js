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
 * Returns { recipe, productionCost, sellAnalysis, materialCosts, transportCost }
 */
export async function analyzeProduction(productId, quantity, pricesMap, laborCost = 0, realmId = null) {
  const recipe = getRecipeByProductId(productId);
  if (!recipe) return null;

  console.log("[analyzeProduction]", { productId, quantity, realmId, hasRealmId: !!realmId });
  console.log("[analyzeProduction] Condition check: realmId != null:", realmId != null, "| typeof realmId:", typeof realmId);

  // Calculate transport cost
  let transportCost = 0;
  try {
    if (realmId != null) {
      console.log("[analyzeProduction] INSIDE if block - realmId is valid");
      // Get transport container requirement (default to 1 if not specified)
      const transportContainersNeeded = recipe.transport;
      console.log("[analyzeProduction] Transport containers needed:", transportContainersNeeded);
      
      // Try to get from pricesMap first (passed in from UI), fallback to fetching
      let containerPrice = pricesMap?.get(13);
      console.log("[analyzeProduction] Container price from pricesMap:", containerPrice);
      
      if (!Number.isFinite(containerPrice)) {
        console.log("[analyzeProduction] Fetching container price from market...");
        containerPrice = await fetchMarketPrice(realmId, 13); // Product ID 13 is transport container
        console.log("[analyzeProduction] Fetched container price:", containerPrice);
      }
      if (Number.isFinite(containerPrice)) {
        transportCost = containerPrice * transportContainersNeeded * quantity;
        console.log("[analyzeProduction] Calculated transport cost:", transportCost);
      } else {
        console.log("[analyzeProduction] Container price is not finite:", containerPrice);
      }
    } else {
      console.log("[analyzeProduction] No realmId provided");
    }
  } catch (e) {
    console.warn("Failed to fetch transport container price:", e);
  }

  // Get production cost (including transport)
  const costAnalysis = calculateProductionCost(productId, quantity, pricesMap, transportCost);
  if (!Number.isFinite(costAnalysis.totalCost)) {
    return {
      recipe,
      quantity,
      productionCost: costAnalysis.totalCost,
      materialCosts: costAnalysis.materialCosts,
      transportCost,
      missingPrices: costAnalysis.missingPrices,
      sellAnalysis: null,
      profitAnalysis: null,
    };
  }

  // Get market price for the product
  const productPrice = pricesMap?.get(productId);
  if (!Number.isFinite(productPrice)) {
    return {
      recipe,
      quantity,
      productionCost: costAnalysis.totalCost,
      materialCosts: costAnalysis.materialCosts,
      transportCost,
      missingPrices: costAnalysis.missingPrices,
      sellAnalysis: null,
      profitAnalysis: null,
      missingProductPrice: true,
    };
  }

  // Get sell analysis with labor cost and transport cost included
  const sellAnalysis = calculateSellProfit(
    productId,
    quantity,
    productPrice,
    costAnalysis.totalCost,
    laborCost
  );

  return {
    recipe,
    quantity,
    productionCost: costAnalysis.totalCost,
    materialCosts: costAnalysis.materialCosts,
    transportCost,
    sellPrice: productPrice,
    sellAnalysis,
  };
}
