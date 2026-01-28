/**
 * Retail Profit Engine
 * Implements all formulas from "Part 7: The Profit Curve"
 * for calculating profit per unit, profit per hour, and optimal pricing
 */

// Labor costs by store type (hourly in dollars)
export const LABOR_COSTS = {
  grocery: 138.00,
  hardware: 172.50,
  electronics: 172.50,
  fashion: 310.50,
  gas: 345.00,
  car_dealership: 379.50,
  sales_office: 586.50,
};

/**
 * Calculate net admin rate based on employee count and executive management skills
 * Formula: Net Admin Rate = ((Employees - 100) / (170 * 100)) * (1 - (Executive Management Skill / 100))
 * 
 * @param {number} employeeCount - Total number of employees
 * @param {number} cooManagement - COO management skill (counted in full)
 * @param {number} cfoCMOCTOManagement - Combined CFO, CMO, CTO management (will be divided by 4 and rounded down)
 * @returns {number} Net admin rate as a decimal (e.g., 0.442588 for 44.2588%)
 */
export function calculateNetAdminRate(employeeCount, cooManagement, cfoCMOCTOManagement) {
  if (!Number.isFinite(employeeCount) || employeeCount < 100) return 0;
  
  const adjustedEmployees = employeeCount - 100;
  const executiveSkill = cooManagement + Math.floor(cfoCMOCTOManagement / 4);
  const skillReduction = executiveSkill / 100;
  
  return (adjustedEmployees / (170 * 100)) * (1 - skillReduction);
}

/**
 * Calculate total hourly admin cost
 * Formula: Admin Cost = Labor Cost * (1 + Net Admin Rate)
 * 
 * @param {number} baseLaborCost - Hourly labor cost for store type
 * @param {number} netAdminRate - Net admin rate as decimal
 * @returns {number} Total hourly cost (labor + admin)
 */
export function calculateTotalHourlyCost(baseLaborCost, netAdminRate) {
  return baseLaborCost * (1 + netAdminRate);
}

/**
 * Calculate quantity sold based on price and saturation
 * Formula: Qs = 3,600 / ([0.226677P + (max(S - 0.24|-0.38) - 0.5) / 0.05198 - 514.989366] * 0.322448 + 1,147.677184) * (1 / (1 - Sales Bonus))
 * 
 * @param {number} price - Sale price per unit
 * @param {number} saturation - Current saturation level (0 to 1)
 * @param {number} salesBonus - Sales bonus as decimal (e.g., 0.10 for 10%)
 * @returns {number} Quantity sold per hour
 */
export function calculateQuantitySold(price, saturation, salesBonus = 0) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  
  const s = Math.max(saturation - 0.24, -0.38);
  const saturationFactor = (s - 0.5) / 0.05198;
  const denominator = (0.226677 * price + saturationFactor - 514.989366) * 0.322448 + 1147.677184;
  
  if (denominator <= 0) return 0;
  
  const baseQs = 3600 / denominator;
  const bonusMultiplier = 1 / (1 - salesBonus);
  
  return baseQs * bonusMultiplier;
}

/**
 * Calculate profit per unit
 * Formula: PPU = Price - Direct Materials - Direct Labor - Administrative Overhead
 * 
 * @param {number} price - Sale price per unit
 * @param {number} directMaterialsCost - Cost of product (COGS)
 * @param {number} directLaborCost - Direct labor per unit (total hourly labor / avg units per hour)
 * @param {number} adminOverheadPerUnit - Administrative overhead per unit
 * @returns {number} Profit per unit
 */
export function calculateProfitPerUnit(price, directMaterialsCost, directLaborCost, adminOverheadPerUnit) {
  return price - directMaterialsCost - directLaborCost - adminOverheadPerUnit;
}

/**
 * Calculate profit per hour per level
 * Formula: P/H/L = PPU * Qs
 * 
 * @param {number} profitPerUnit - Profit per unit
 * @param {number} quantitySold - Quantity sold per hour
 * @returns {number} Profit per hour per level
 */
export function calculateProfitPerHour(profitPerUnit, quantitySold) {
  return profitPerUnit * quantitySold;
}

/**
 * Find approximate breakeven prices and optimal price
 * Uses simple numerical approach to find price points where profit = 0 and where profit is maximized
 * 
 * @param {Object} params
 * @param {number} params.productCost - Cost of product (COGS)
 * @param {number} params.baseLaborCost - Hourly labor cost for store type
 * @param {number} params.netAdminRate - Net admin rate as decimal
 * @param {number} params.saturation - Current saturation level
 * @param {number} params.salesBonus - Sales bonus as decimal
 * @param {number} params.storeLevel - Store level (affects units per hour baseline)
 * @returns {Object} { breakEvenLow, optimalPrice, breakEvenHigh, maxProfit }
 */
export function findOptimalPrice(params) {
  const {
    productCost,
    baseLaborCost,
    netAdminRate,
    saturation,
    salesBonus = 0,
    storeLevel = 1,
  } = params;
  
  const totalHourlyCost = calculateTotalHourlyCost(baseLaborCost, netAdminRate);
  const costPerUnit = totalHourlyCost / 36; // Approximate: ~36 units per hour baseline
  
  // Search range: from product cost to ~3x product cost
  const minPrice = Math.max(productCost * 1.01, 1);
  const maxPrice = productCost * 5;
  const step = (maxPrice - minPrice) / 1000; // 1000 points for precision
  
  let optimalPrice = minPrice;
  let maxProfit = -Infinity;
  let breakEvenLow = null;
  let breakEvenHigh = null;
  let previousProfit = 0;
  
  for (let price = minPrice; price <= maxPrice; price += step) {
    const qs = calculateQuantitySold(price, saturation, salesBonus);
    const ppu = calculateProfitPerUnit(
      price,
      productCost,
      costPerUnit,
      totalHourlyCost / qs // Admin cost per unit
    );
    const profit = calculateProfitPerHour(ppu, qs);
    
    // Find breakeven points (where profit crosses zero)
    if (previousProfit < 0 && profit >= 0 && !breakEvenLow) {
      breakEvenLow = price;
    }
    if (previousProfit >= 0 && profit < 0 && breakEvenLow) {
      breakEvenHigh = price;
    }
    
    // Track maximum profit
    if (profit > maxProfit) {
      maxProfit = profit;
      optimalPrice = price;
    }
    
    previousProfit = profit;
  }
  
  return {
    breakEvenLow: breakEvenLow || minPrice,
    optimalPrice,
    breakEvenHigh: breakEvenHigh || maxPrice,
    maxProfit: Math.max(0, maxProfit),
  };
}

/**
 * Complete profit analysis for a product in a retail store
 * 
 * @param {Object} params
 * @param {number} params.currentPrice - Current sale price
 * @param {number} params.productCost - Cost of product (COGS)
 * @param {string} params.storeType - Store type (grocery, hardware, etc.)
 * @param {number} params.netAdminRate - Net admin rate as decimal
 * @param {number} params.saturation - Current saturation level
 * @param {number} params.salesBonus - Sales bonus as decimal
 * @returns {Object} Complete profit analysis
 */
export function analyzeProductProfit(params) {
  const {
    currentPrice,
    productCost,
    storeType,
    netAdminRate,
    saturation,
    salesBonus = 0,
  } = params;
  
  const baseLaborCost = LABOR_COSTS[storeType] || 138;
  const totalHourlyCost = calculateTotalHourlyCost(baseLaborCost, netAdminRate);
  
  // Calculate metrics at current price
  const qs = calculateQuantitySold(currentPrice, saturation, salesBonus);
  
  // Calculate per-unit costs
  // Direct labor per unit = base labor cost / units sold per hour
  const directLaborPerUnit = baseLaborCost / (qs || 1);
  // Admin overhead per unit = admin cost / units sold per hour
  const adminCostPerUnit = (baseLaborCost * netAdminRate) / (qs || 1);
  
  const ppu = calculateProfitPerUnit(
    currentPrice,
    productCost,
    directLaborPerUnit,
    adminCostPerUnit
  );
  const profitPerHour = calculateProfitPerHour(ppu, qs);
  
  // Find optimal pricing
  const optimal = findOptimalPrice({
    productCost,
    baseLaborCost,
    netAdminRate,
    saturation,
    salesBonus,
  });
  
  return {
    // Current situation
    currentPrice,
    quantitySoldPerHour: qs,
    profitPerUnit: ppu,
    profitPerHour,
    profitStatus: ppu > 0 ? "profitable" : ppu < 0 ? "loss" : "breakeven",
    
    // Optimal pricing
    optimalPrice: optimal.optimalPrice,
    maxProfitPerHour: optimal.maxProfit,
    breakEvenLow: optimal.breakEvenLow,
    breakEvenHigh: optimal.breakEvenHigh,
    
    // Recommendations
    priceAdjustment: optimal.optimalPrice - currentPrice,
    potentialGain: optimal.maxProfit - profitPerHour,
  };
}

/**
 * Format analysis results for display
 * 
 * @param {Object} analysis - Result from analyzeProductProfit
 * @returns {Object} Formatted display strings
 */
export function formatAnalysis(analysis) {
  const fmt = (n) => {
    if (!Number.isFinite(n)) return "N/A";
    return n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };
  
  const fmtPrice = (n) => {
    if (!Number.isFinite(n)) return "N/A";
    return `$${n.toFixed(2)}`;
  };
  
  return {
    currentProfit: fmt(analysis.profitPerHour),
    profitPerUnit: fmt(analysis.profitPerUnit),
    quantitySold: Number.isFinite(analysis.quantitySoldPerHour) ? analysis.quantitySoldPerHour.toFixed(1) : "N/A",
    optimalPrice: fmtPrice(analysis.optimalPrice),
    priceChange: fmt(analysis.priceAdjustment),
    potentialGain: fmt(analysis.potentialGain),
    profitStatus: analysis.profitStatus,
    breakEvenLow: fmtPrice(analysis.breakEvenLow),
    breakEvenHigh: fmtPrice(analysis.breakEvenHigh),
    maxProfitPerHour: fmt(analysis.maxProfitPerHour),
  };
}
