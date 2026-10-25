// Pure math for the resources-needed planner: period parsing, hourly rates, input totals by
// quality, shortfalls against warehouse stock and cash.
import buildingProducts from "./resources/building_products.json";

export const RESOURCE_NEEDS_COOLDOWN_MS = 60 * 1000;
export const DEFAULT_PERIOD = "24h";
export const MAX_QUALITY = 12;

const HOUR_MS = 60 * 60 * 1000;
const MAX_PERIOD_HOURS = 24 * 30;

/**
 * @typedef {{ id: number, kind: string, name: string, size: number,
 *   status: "idle"|"producing"|"upgrading"|"other", freeAt: number|null,
 *   productId: number|null }} PlannerBuilding
 * @typedef {{ size: number|null, at: number, wagesPerHour: number|null,
 *   products: Record<string, { unitsPerHour: number|null, wagesPerHour: number|null }> }} CapturedRates
 * @typedef {{ level: number|null, wagesPerHour: number|null,
 *   rates: { productId: number, unitsPerHour: number|null, wagesPerHour: number|null }[] }} PageReading
 * @typedef {{ checked?: boolean, productId?: number|null, quality?: number, period?: string }} BuildingPref
 * @typedef {{ id: number, materials?: { id: number, quantity: number }[] }} Recipe
 * @typedef {{ productId: number, quality: number, amount: number }} Need
 * @typedef {{ kind: number, quality: number, amount: number }} StockRow
 */

/**
 * "48", "48h", "1.5h", "2d" → that many hours; "20:15" → hours until the next 20:15.
 * @param {string} input
 * @param {number} [now]
 * @returns {number|null} null when the text is not a valid period
 */
export function parsePeriodHours(input, now = Date.now()) {
  const text = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(",", ".");
  if (!text) return null;

  const clock = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (clock[3]) {
      if (hours < 1 || hours > 12) return null;
      hours = (hours % 12) + (clock[3] === "pm" ? 12 : 0);
    }
    if (hours > 23 || minutes > 59) return null;
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return (target.getTime() - now) / HOUR_MS;
  }

  const duration = text.match(/^(\d+(?:\.\d+)?)\s*(h|d)?$/);
  if (!duration) return null;
  const value = Number(duration[1]) * (duration[2] === "d" ? 24 : 1);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PERIOD_HOURS) return null;
  return value;
}

/** @param {unknown} value */
function positiveOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {unknown} value */
export function clampQuality(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_QUALITY) : 0;
}

/**
 * The game lets inputs be one quality below the output.
 * @param {number} outputQuality
 */
export function inputQualityFor(outputQuality) {
  return Math.max(0, clampQuality(outputQuality) - 1);
}

/**
 * @param {string} kind building letter from the company profile
 * @returns {number[]}
 */
export function productsForBuilding(kind) {
  return /** @type {Record<string, number[]>} */ (buildingProducts)[kind] ?? [];
}

/**
 * Busy-state from the company profile: "r" = production run, "b" = construction/upgrade.
 * @param {any} raw entry from the v3 company profile's infrastructure.buildings
 * @returns {PlannerBuilding}
 */
export function normalizeBuilding(raw) {
  const busy = raw?.busy && typeof raw.busy === "object" ? raw.busy : null;
  let status = /** @type {PlannerBuilding["status"]} */ ("idle");
  if (busy?.category === "r") status = "producing";
  else if (busy?.category === "b") status = "upgrading";
  else if (busy) status = "other";

  const startedMs = Date.parse(busy?.started || "");
  const durationS = Number(busy?.duration);
  const freeAt =
    Number.isFinite(startedMs) && Number.isFinite(durationS) && durationS > 0
      ? startedMs + durationS * 1000
      : null;

  return {
    id: Number(raw?.id),
    kind: String(raw?.kind ?? ""),
    name: String(raw?.name ?? ""),
    size: Number(raw?.size) || 0,
    status,
    freeAt,
    productId: status === "producing" ? positiveOrNull(busy?.resource?.kind) : null,
  };
}

/**
 * Production buildings that make something the static product list knows about.
 * @param {any[]} rawList
 */
export function selectProductionBuildings(rawList) {
  return (Array.isArray(rawList) ? rawList : [])
    .filter((b) => b?.category === "production" && Number.isFinite(Number(b?.id)))
    .map(normalizeBuilding)
    .filter((b) => productsForBuilding(b.kind).length > 0);
}

/** @param {PlannerBuilding} building */
export function isCheckedByDefault(building) {
  return building.status !== "upgrading";
}

/**
 * The saved product when the building can make it, else the running one, else the only one.
 * @param {PlannerBuilding} building
 * @param {number|null|undefined} saved
 */
export function resolveProduct(building, saved) {
  const allowed = productsForBuilding(building.kind);
  if (saved && allowed.includes(saved)) return saved;
  if (building.productId && allowed.includes(building.productId)) return building.productId;
  return allowed.length === 1 ? allowed[0] : null;
}

/**
 * Fold what a building page shows into what was remembered for that building. The header
 * (level, wages) shows on every visit; per-product output only on that product's setup form,
 * so products seen earlier are kept, scaled when the page shows a new level.
 * @param {CapturedRates|null|undefined} previous
 * @param {PageReading} reading
 * @param {number} [now]
 * @returns {CapturedRates}
 */
export function mergeCapturedRates(previous, reading, now = Date.now()) {
  const level = positiveOrNull(reading.level);
  const scale = previous?.size && level ? level / previous.size : 1;
  const scaled = (value) => (positiveOrNull(value) ? Number(value) * scale : null);

  /** @type {CapturedRates["products"]} */
  const products = {};
  for (const [productId, rate] of Object.entries(previous?.products ?? {})) {
    products[productId] = {
      unitsPerHour: scaled(rate?.unitsPerHour),
      wagesPerHour: scaled(rate?.wagesPerHour),
    };
  }
  for (const rate of reading.rates) {
    products[rate.productId] = {
      unitsPerHour: positiveOrNull(rate.unitsPerHour),
      wagesPerHour: positiveOrNull(rate.wagesPerHour),
    };
  }

  return {
    size: level ?? previous?.size ?? null,
    at: now,
    wagesPerHour: positiveOrNull(reading.wagesPerHour) ?? scaled(previous?.wagesPerHour),
    products,
  };
}

/**
 * Rates as the building page showed them. Wages are building-wide: the page header first,
 * any product's wages otherwise.
 * @param {CapturedRates|null|undefined} captured
 * @param {number|null} productId
 */
export function resolveRates(captured, productId) {
  const product = productId !== null ? captured?.products?.[productId] : undefined;
  const anyWages = Object.values(captured?.products ?? {}).find((p) => p?.wagesPerHour)?.wagesPerHour ?? null;
  return {
    unitsPerHour: product?.unitsPerHour ?? null,
    wagesPerHour: captured?.wagesPerHour ?? product?.wagesPerHour ?? anyWages ?? null,
  };
}

/**
 * What still has to be read from the game before a planned building's numbers are real.
 * @param {ReturnType<typeof resolveRates>} rates
 * @param {number|null} productId
 * @param {CapturedRates|null|undefined} captured
 * @returns {"building"|"product"|"units"|"wages"|null}
 */
export function indexingGap(rates, productId, captured) {
  if (!captured) return "building";
  if (!productId) return "product";
  if (!rates.unitsPerHour) return "units";
  if (!rates.wagesPerHour) return "wages";
  return null;
}

/** @param {number} productId @param {number} quality */
export function needKey(productId, quality) {
  return `${productId}:${quality}`;
}

/**
 * Inputs per product and minimum quality over each plan's period, plus wages.
 * @param {{ buildingId: number, productId: number|null, quality: number, hours: number,
 *   unitsPerHour: number|null, wagesPerHour: number|null }[]} plans
 * @param {(productId: number) => Recipe|null|undefined} getRecipe
 */
export function aggregateNeeds(plans, getRecipe) {
  /** @type {Map<string, Need>} */
  const inputs = new Map();
  let wages = 0;

  for (const plan of plans) {
    if (!(plan.hours > 0) || !plan.productId || !plan.unitsPerHour || !plan.wagesPerHour) continue;
    wages += plan.wagesPerHour * plan.hours;
    const units = plan.unitsPerHour * plan.hours;
    const quality = inputQualityFor(plan.quality);
    for (const material of getRecipe(plan.productId)?.materials ?? []) {
      const amount = Number(material.quantity) * units;
      if (!(amount > 0)) continue;
      const key = needKey(material.id, quality);
      const need = inputs.get(key) ?? { productId: material.id, quality, amount: 0 };
      need.amount += amount;
      inputs.set(key, need);
    }
  }
  return { inputs: [...inputs.values()], wages };
}

/**
 * Stock that covers each need: any quality at or above the need counts. Highest requirements
 * take stock first, each from the lowest quality that still qualifies, so better stock is
 * left for needs only it can cover.
 * @param {Need[]} needs
 * @param {StockRow[]} stockRows
 * @returns {Map<string, number>} need key → amount covered
 */
export function allocateStock(needs, stockRows) {
  /** @type {Map<number, { quality: number, left: number }[]>} */
  const pools = new Map();
  for (const row of Array.isArray(stockRows) ? stockRows : []) {
    const kind = Number(row?.kind);
    const amount = Number(row?.amount);
    if (!kind || !(amount > 0)) continue;
    const pool = pools.get(kind) ?? [];
    pool.push({ quality: clampQuality(row.quality), left: amount });
    pools.set(kind, pool);
  }
  for (const pool of pools.values()) pool.sort((a, b) => a.quality - b.quality);

  /** @type {Map<string, number>} */
  const covered = new Map();
  for (const need of [...needs].sort((a, b) => b.quality - a.quality)) {
    let remaining = need.amount;
    for (const lot of pools.get(need.productId) ?? []) {
      if (remaining <= 0) break;
      if (lot.quality < need.quality || lot.left <= 0) continue;
      const take = Math.min(lot.left, remaining);
      lot.left -= take;
      remaining -= take;
    }
    covered.set(needKey(need.productId, need.quality), need.amount - remaining);
  }
  return covered;
}

/**
 * Any listing at or above the quality will do: better inputs are always allowed.
 * @param {{ quality: number, price: number }[]} listings
 * @param {number} quality
 * @returns {number|null}
 */
export function cheapestAtQuality(listings, quality) {
  let best = null;
  for (const listing of Array.isArray(listings) ? listings : []) {
    if (listing.quality < quality || !(listing.price > 0)) continue;
    if (best === null || listing.price < best) best = listing.price;
  }
  return best;
}

/**
 * @param {Need[]} needs
 * @param {StockRow[]} stockRows
 * @param {Record<string, number|null>} [prices] need key → unit price
 */
export function compareWithStock(needs, stockRows, prices = {}) {
  const covered = allocateStock(needs, stockRows);
  const rows = needs.map((need) => {
    const key = needKey(need.productId, need.quality);
    const have = covered.get(key) ?? 0;
    const missing = Math.max(0, Math.ceil(need.amount - have));
    const price = prices[key] ?? null;
    const buyCost = missing > 0 && Number.isFinite(price) ? missing * Number(price) : null;
    return {
      key,
      productId: need.productId,
      quality: need.quality,
      need: Math.ceil(need.amount),
      have,
      missing,
      price,
      buyCost,
    };
  });
  rows.sort((a, b) => b.missing - a.missing || a.productId - b.productId || a.quality - b.quality);
  const buyTotal = rows.reduce((sum, row) => sum + (row.buyCost ?? 0), 0);
  const unpriced = rows.filter((row) => row.missing > 0 && row.buyCost === null).length;
  return { rows, buyTotal, unpriced };
}

/**
 * @param {number} wages
 * @param {number} buyTotal
 * @param {number} cash NaN when unknown
 */
export function compareCash(wages, buyTotal, cash) {
  const needed = wages + buyTotal;
  if (!Number.isFinite(cash)) return { needed, cash: null, gap: null };
  return { needed, cash, gap: Math.max(0, needed - cash) };
}

/** @param {number|null|undefined} lastRunAt @param {number} [now] */
export function cooldownRemainingMs(lastRunAt, now = Date.now()) {
  const last = Number(lastRunAt);
  if (!Number.isFinite(last) || last <= 0) return 0;
  return Math.max(0, last + RESOURCE_NEEDS_COOLDOWN_MS - now);
}
