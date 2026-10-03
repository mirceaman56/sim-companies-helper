// contract_rules_state.js
// State transitions and normalization for saved contract rule templates.

export const PRICE_MODE_PERCENT = "percent";
export const PRICE_MODE_FIXED = "fixed";

// Persisted mode codes. Rules sync through chrome.storage.sync, which caps a
// single item at 8KB, so the stored shape uses one-letter keys and codes.
const MODE_CODE_PERCENT = "p";
const MODE_CODE_FIXED = "f";

/**
 * @typedef {object} ContractRule
 * @property {number} id
 * @property {number} productId
 * @property {string} companyName
 * @property {number} amount
 * @property {"percent"|"fixed"} priceMode
 * @property {number|null} discountPct Percent under the lowest market offer; null for fixed rules.
 * @property {number|null} fixedPrice Agreed unit price; null for percent rules.
 * @property {string} note Short free-text reminder, may be empty.
 */

/**
 * @param {unknown} mode
 * @returns {"percent"|"fixed"}
 */
export function normalizePriceMode(mode) {
  return mode === PRICE_MODE_FIXED ? PRICE_MODE_FIXED : PRICE_MODE_PERCENT;
}

/**
 * Parse a user-typed or stored unit price. Contract prices carry 3 decimals.
 * @param {unknown} raw
 * @returns {number|null} Positive price rounded to 3 decimals, or null when unusable.
 */
export function normalizeFixedPrice(raw) {
  const value = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 ? rounded : null;
}

/**
 * @param {unknown} raw
 * @param {number} maxLength
 * @returns {string}
 */
export function normalizeNote(raw, maxLength) {
  const note = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return Number.isFinite(maxLength) ? note.slice(0, maxLength) : note;
}

/**
 * Build a new rule object.
 * @param {{id:number, productId:number, companyName:string, amount:number, priceMode?:string, discountPct?:number|null, fixedPrice?:number|null, note?:string}} input
 * @returns {ContractRule}
 */
export function createRule(input) {
  const priceMode = normalizePriceMode(input.priceMode);
  const isFixed = priceMode === PRICE_MODE_FIXED;

  return {
    id: input.id,
    productId: input.productId,
    companyName: input.companyName,
    amount: input.amount,
    priceMode,
    discountPct: isFixed ? null : input.discountPct,
    fixedPrice: isFixed ? input.fixedPrice : null,
    note: input.note || "",
  };
}

/**
 * @param {{amount:number, priceMode?:string, discountPct?:number|null, fixedPrice?:number|null}} input
 * @returns {boolean}
 */
export function isValidRuleInput({ amount, priceMode, discountPct, fixedPrice }) {
  if (!Number.isFinite(amount) || amount <= 0) return false;

  if (normalizePriceMode(priceMode) === PRICE_MODE_FIXED) {
    return Number.isFinite(fixedPrice) && fixedPrice > 0;
  }

  return Number.isFinite(discountPct) && discountPct >= 0 && discountPct <= 100;
}

/**
 * @param {ContractRule[]} rules
 * @param {number} maxCount
 * @returns {boolean}
 */
export function canAddRule(rules, maxCount) {
  return rules.length < maxCount;
}

/**
 * Per-customer cap: counts only rules for the same product + company.
 * @param {ContractRule[]} rules
 * @param {number|null} productId
 * @param {string|null} companyName
 * @param {number} maxPerCustomer
 * @returns {boolean}
 */
export function canAddRuleForCustomer(rules, productId, companyName, maxPerCustomer) {
  return findRulesForProductAndCompany(rules, productId, companyName).length < maxPerCustomer;
}

/**
 * @param {ContractRule[]} rules
 * @param {ContractRule} rule
 * @returns {ContractRule[]}
 */
export function appendRule(rules, rule) {
  return [...rules, rule];
}

/**
 * @param {ContractRule[]} rules
 * @param {number} ruleId
 * @returns {ContractRule|null}
 */
export function findRuleById(rules, ruleId) {
  return rules.find((r) => r.id === ruleId) || null;
}

/**
 * @param {ContractRule[]} rules
 * @param {number} ruleId
 * @returns {ContractRule[]}
 */
export function removeRuleState(rules, ruleId) {
  return rules.filter((r) => r.id !== ruleId);
}

/**
 * Exact match on productId + companyName (no company ID is available on the page).
 * @param {ContractRule[]} rules
 * @param {number|null} productId
 * @param {string|null} companyName
 * @returns {ContractRule[]}
 */
export function findRulesForProductAndCompany(rules, productId, companyName) {
  if (!Number.isFinite(productId) || !companyName) return [];
  return rules.filter((r) => r.productId === productId && r.companyName === companyName);
}

/**
 * Every rule for one product, across companies.
 * @param {ContractRule[]} rules
 * @param {number|null} productId
 * @returns {ContractRule[]}
 */
export function findRulesForProduct(rules, productId) {
  if (!Number.isFinite(productId)) return [];
  return rules.filter((r) => r.productId === productId);
}

/**
 * Compact persisted shape: `{i, p, c, a, m, v, n?}` where `v` is the discount
 * percent or the fixed price depending on mode `m`.
 * @param {ContractRule[]} rules
 * @returns {object[]}
 */
export function serializeRules(rules) {
  return rules.map((r) => {
    const isFixed = r.priceMode === PRICE_MODE_FIXED;
    const out = {
      i: r.id,
      p: r.productId,
      c: r.companyName,
      a: r.amount,
      m: isFixed ? MODE_CODE_FIXED : MODE_CODE_PERCENT,
      v: isFixed ? r.fixedPrice : r.discountPct,
    };
    if (r.note) out.n = r.note;
    return out;
  });
}

/**
 * Accepts both the compact shape and the v1 long-key shape
 * (`{id, productId, companyName, amount, discountPct}`, always percent).
 * @param {object[]} rawRules
 * @param {{noteMaxLength?: number}} [options]
 * @returns {ContractRule[]}
 */
export function hydrateRules(rawRules, { noteMaxLength } = {}) {
  return (rawRules || [])
    .map((r) => {
      const isCompact = r?.i !== undefined;
      const isFixed = isCompact && r.m === MODE_CODE_FIXED;
      const value = Number(isCompact ? r.v : r?.discountPct);

      return createRule({
        id: Number(isCompact ? r.i : r?.id),
        productId: Number(isCompact ? r.p : r?.productId),
        companyName: String((isCompact ? r.c : r?.companyName) || ""),
        amount: Number(isCompact ? r.a : r?.amount),
        priceMode: isFixed ? PRICE_MODE_FIXED : PRICE_MODE_PERCENT,
        discountPct: value,
        fixedPrice: value,
        note: normalizeNote(isCompact ? r.n : "", noteMaxLength),
      });
    })
    .filter(
      (r) => Number.isFinite(r.id) && Number.isFinite(r.productId) && r.companyName && isValidRuleInput(r),
    );
}

/**
 * @param {ContractRule[]} rules
 * @param {number|null|undefined} providedNextRuleId
 * @returns {number}
 */
export function resolveNextRuleId(rules, providedNextRuleId) {
  if (
    providedNextRuleId !== null &&
    providedNextRuleId !== undefined &&
    Number.isFinite(Number(providedNextRuleId)) &&
    Number(providedNextRuleId) >= 1
  ) {
    return Number(providedNextRuleId);
  }
  return rules.length ? Math.max(...rules.map((r) => r.id)) + 1 : 1;
}
