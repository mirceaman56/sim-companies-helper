// contract_rules_state.js
// State transitions and normalization for saved contract rule templates.

/**
 * @typedef {object} ContractRule
 * @property {number} id
 * @property {number} productId
 * @property {string} productName
 * @property {string} companyName
 * @property {number} amount
 * @property {number} discountPct
 */

/**
 * Build a new rule object.
 * @param {{id:number, productId:number, productName:string, companyName:string, amount:number, discountPct:number}} input
 * @returns {ContractRule}
 */
export function createRule(input) {
  return {
    id: input.id,
    productId: input.productId,
    productName: input.productName,
    companyName: input.companyName,
    amount: input.amount,
    discountPct: input.discountPct,
  };
}

/**
 * @param {{amount:number, discountPct:number}} input
 * @returns {boolean}
 */
export function isValidRuleInput({ amount, discountPct }) {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isFinite(discountPct) &&
    discountPct >= 0 &&
    discountPct <= 100
  );
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
 * @param {ContractRule[]} rules
 * @returns {ContractRule[]}
 */
export function serializeRules(rules) {
  return rules.map((r) => ({ ...r }));
}

/**
 * @param {object[]} rawRules
 * @returns {ContractRule[]}
 */
export function hydrateRules(rawRules) {
  return (rawRules || [])
    .map((r) => ({
      id: Number(r?.id),
      productId: Number(r?.productId),
      productName: String(r?.productName || ""),
      companyName: String(r?.companyName || ""),
      amount: Number(r?.amount),
      discountPct: Number(r?.discountPct),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.id) &&
        Number.isFinite(r.productId) &&
        r.companyName &&
        isValidRuleInput({ amount: r.amount, discountPct: r.discountPct }),
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
