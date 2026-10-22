// Pure math for the resources-needed planner: period parsing, hourly rates, input totals and
// shortfalls against warehouse stock and cash.

export const RESOURCE_NEEDS_COOLDOWN_MS = 60 * 1000;
export const DEFAULT_PERIOD = "24h";

const HOUR_MS = 60 * 60 * 1000;
const MAX_PERIOD_HOURS = 24 * 30;

/**
 * @typedef {{ id: number, kind: string, name: string, size: number, category: string,
 *   status: "idle"|"producing"|"upgrading"|"other", freeAt: number|null,
 *   productId: number|null, runUnitsPerHour: number|null }} PlannerBuilding
 * @typedef {{ size: number|null, at: number, wagesPerHour: number|null, offers: number[]|null,
 *   products: Record<string, { unitsPerHour: number|null, wagesPerHour: number|null }> }} CapturedRates
 * @typedef {{ level: number|null, wagesPerHour: number|null, offers: number[],
 *   rates: { productId: number, unitsPerHour: number|null, wagesPerHour: number|null }[] }} PageReading
 * @typedef {{ checked?: boolean, productId?: number|null, period?: string,
 *   unitsPerHour?: number|null, wagesPerHour?: number|null }} BuildingPref
 * @typedef {{ id: number, materials?: { id: number, quantity: number }[] }} Recipe
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

/**
 * Busy-state from the buildings list: "r" = production run, "b" = construction/upgrade.
 * @param {any} raw entry from /api/v2/companies/me/buildings/
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

  const resource = status === "producing" ? busy?.resource : null;
  const productId = positiveOrNull(resource?.kind);
  const amount = positiveOrNull(resource?.amount);
  const runUnitsPerHour = amount && durationS > 0 ? amount / (durationS / 3600) : null;

  return {
    id: Number(raw?.id),
    kind: String(raw?.kind ?? ""),
    name: String(raw?.name ?? ""),
    size: Number(raw?.size) || 0,
    category: String(raw?.category ?? ""),
    status,
    freeAt,
    productId,
    runUnitsPerHour,
  };
}

/** @param {any[]} rawList */
export function selectProductionBuildings(rawList) {
  return (Array.isArray(rawList) ? rawList : [])
    .filter((b) => b?.category === "production" && Number.isFinite(Number(b?.id)))
    .map(normalizeBuilding);
}

/** @param {PlannerBuilding} building */
export function isCheckedByDefault(building) {
  return building.status !== "upgrading";
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
    offers: reading.offers.length > 0 ? [...reading.offers] : (previous?.offers ?? null),
    products,
  };
}

/**
 * Override wins, then what the building page showed, then the running order for units.
 * Wages are building-wide: the page header first, any product's wages otherwise. Page values
 * are used as read: the company profile's level is rounded, so it cannot rescale them.
 * @param {PlannerBuilding} building
 * @param {CapturedRates|null|undefined} captured
 * @param {BuildingPref} pref
 * @param {number|null} productId
 */
export function resolveRates(building, captured, pref, productId) {
  const product = productId !== null ? captured?.products?.[productId] : undefined;
  const anyWages = Object.values(captured?.products ?? {}).find((p) => p?.wagesPerHour)?.wagesPerHour ?? null;
  const overrideUnits = positiveOrNull(pref?.unitsPerHour);
  const overrideWages = positiveOrNull(pref?.wagesPerHour);

  let unitsPerHour = overrideUnits;
  let unitsSource = overrideUnits ? "override" : null;
  if (!unitsPerHour && product?.unitsPerHour) {
    unitsPerHour = product.unitsPerHour;
    unitsSource = "page";
  }
  if (!unitsPerHour && productId !== null && productId === building.productId && building.runUnitsPerHour) {
    unitsPerHour = building.runUnitsPerHour;
    unitsSource = "run";
  }

  let wagesPerHour = overrideWages;
  let wagesSource = overrideWages ? "override" : null;
  const pageWages = captured?.wagesPerHour ?? product?.wagesPerHour ?? anyWages;
  if (!wagesPerHour && pageWages) {
    wagesPerHour = pageWages;
    wagesSource = "page";
  }

  return { unitsPerHour, unitsSource, wagesPerHour, wagesSource };
}

/**
 * What still has to be read from the game before a planned building's numbers are real.
 * A building whose page was never opened is not indexed at all; units guessed from the
 * running order count as missing.
 * @param {ReturnType<typeof resolveRates>} rates
 * @param {number|null} productId
 * @param {CapturedRates|null|undefined} captured
 * @returns {"building"|"product"|"units"|"wages"|null}
 */
export function indexingGap(rates, productId, captured) {
  if (!captured) return "building";
  if (!productId) return "product";
  if (!rates.unitsSource || rates.unitsSource === "run") return "units";
  if (!rates.wagesSource) return "wages";
  return null;
}

/**
 * @param {{ buildingId: number, productId: number|null, hours: number,
 *   unitsPerHour: number|null, wagesPerHour: number|null }[]} plans
 * @param {(productId: number) => Recipe|null|undefined} getRecipe
 */
export function aggregateNeeds(plans, getRecipe) {
  /** @type {Map<number, number>} */
  const inputs = new Map();
  let wages = 0;
  const incomplete = [];

  for (const plan of plans) {
    if (!(plan.hours > 0)) continue;
    if (plan.wagesPerHour) wages += plan.wagesPerHour * plan.hours;
    else incomplete.push({ buildingId: plan.buildingId, missing: "wages" });

    if (!plan.productId || !plan.unitsPerHour) {
      incomplete.push({ buildingId: plan.buildingId, missing: "units" });
      continue;
    }
    const units = plan.unitsPerHour * plan.hours;
    for (const material of getRecipe(plan.productId)?.materials ?? []) {
      const qty = Number(material.quantity) * units;
      if (!(qty > 0)) continue;
      inputs.set(material.id, (inputs.get(material.id) ?? 0) + qty);
    }
  }
  return { inputs, wages, incomplete };
}

/**
 * Stock is summed over all qualities: the planner does not know which quality a run will use.
 * @param {{ kind: number, amount: number }[]} stockRows
 */
export function sumStockByKind(stockRows) {
  /** @type {Map<number, number>} */
  const totals = new Map();
  for (const row of Array.isArray(stockRows) ? stockRows : []) {
    const kind = Number(row?.kind);
    const amount = Number(row?.amount);
    if (!kind || !(amount > 0)) continue;
    totals.set(kind, (totals.get(kind) ?? 0) + amount);
  }
  return totals;
}

/**
 * @param {Map<number, number>} inputs
 * @param {Map<number, number>} stock
 * @param {Map<number, number|null>} [prices]
 */
export function compareWithStock(inputs, stock, prices = new Map()) {
  const rows = [...inputs].map(([productId, need]) => {
    const have = stock.get(productId) ?? 0;
    const missing = Math.max(0, Math.ceil(need - have));
    const price = prices.get(productId);
    const buyCost = missing > 0 && Number.isFinite(price) ? missing * Number(price) : null;
    return { productId, need: Math.ceil(need), have, missing, price: price ?? null, buyCost };
  });
  rows.sort((a, b) => b.missing - a.missing || a.productId - b.productId);
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
