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
 * Build the cache key used by the prices map.
 * Quality 0 keeps the plain product id so existing callers stay compatible.
 */
export function buildPriceKey(productId, quality = 0) {
  const level = Number.isFinite(quality) ? quality : 0;
  return level > 0 ? `${productId}:q${level}` : productId;
}

function normalizePriceRequest(entry) {
  if (entry && typeof entry === "object") {
    return {
      productId: entry.productId,
      quality: Number.isFinite(entry.quality) ? entry.quality : 0,
    };
  }
  return { productId: entry, quality: 0 };
}

/**
 * Fetch market prices for specific products using market.js
 * Accepts plain product ids or { productId, quality } entries.
 * Returns map of priceKey -> price
 */
export async function fetchMarketPrices(realmId, productRequests) {
  const prices = new Map();
  const STAGGER_MS = 200;
  const requests = (productRequests || []).map(normalizePriceRequest);

  for (let i = 0; i < requests.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, STAGGER_MS));
    const { productId, quality } = requests[i];
    const price = await fetchMarketPrice(realmId, productId, quality);
    if (Number.isFinite(price)) {
      prices.set(buildPriceKey(productId, quality), price);
    }
  }

  return prices;
}

/**
 * Full production analysis: cost + profit (including transport costs)
 * Returns { recipe, productionCost, transportCost, breakEvenAnalysis, profitAnalysis }
 */
export async function analyzeProduction(
  productId,
  quantity,
  pricesMap,
  realmId = null,
  uiUnitCost = null,
  quality = 0,
) {
  const recipe = getRecipeByProductId(productId);
  if (!recipe) return null;

  const productQuality = Number.isFinite(quality) && quality > 0 ? quality : 0;

  // 1. Determine Transport Container Price and Product Price
  let containerPrice = 0;
  let productMarketPrice = 0;

  try {
    if (realmId != null) {
      // Container Price (containers are always quality 0)
      containerPrice = pricesMap?.get(buildPriceKey(TRANSPORT_RESOURCE_ID));
      if (!Number.isFinite(containerPrice)) {
        containerPrice = await fetchMarketPrice(realmId, TRANSPORT_RESOURCE_ID);
      }

      // Product Market Price at the produced quality (for profit analysis)
      productMarketPrice = pricesMap?.get(buildPriceKey(productId, productQuality));
      if (!Number.isFinite(productMarketPrice)) {
        productMarketPrice = await fetchMarketPrice(realmId, productId, productQuality);
      }
    }
  } catch {
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
      quality: productQuality,
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
    quality: productQuality,
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
