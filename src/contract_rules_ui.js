// contract_rules_ui.js
// Orchestrates the saved contract-rule-templates panel: detects the current
// product and selected beneficiary company on a contract page, shows saved
// rules matching both (or a "save current values" prompt), and applies a
// rule with one click by filling the amount and a freshly recalculated price.
import { t } from "./i18n.js";
import { formatMoney } from "./utils.js";
import { CONTRACT_RULE_MAX_COUNT } from "./constants.js";
import { setReactControlledValue } from "./page/page_utils.js";
import {
  computeDiscountedPrice,
  findContractAmountInput,
  findContractPriceInput,
  getContractAmountValue,
  getContractProductId,
  getLowestSellerPrice,
  getSelectedCompanyName,
  hasSelectedBeneficiary,
} from "./page/contract_page.js";
import {
  appendRule,
  canAddRule,
  createRule,
  findRuleById,
  findRulesForProductAndCompany,
  isValidRuleInput,
  removeRuleState,
  resolveNextRuleId,
} from "./contract_rules_state.js";
import { loadRulesSnapshot, saveRulesSnapshot } from "./contract_rules_storage.js";
import {
  renderNoCompanySelectedState,
  renderNoMatchState,
  renderRulesList,
} from "./contract_rules_render.js";
import recipes from "./resources/recipes.json";

// Must match the select's id in contract_ui.js's widget markup.
const DISCOUNT_SELECT_ID = "scx-contract-discount-select";
const PANEL_ID = "scx-contract-rules-panel";

let rules = [];
let nextRuleId = 1;
// Bumped whenever `rules` changes, and folded into the render memo key so a
// data change is never invisible to the next render check — even when the
// refresh fired right after the change finds the panel mid-remount.
let rulesVersion = 0;
let lastRenderedKey = null;
// The panel node the memoized key describes. contract_ui.js tears the widget
// down and re-injects it, and the replacement panel starts empty — so a key
// match only means "already rendered" while it is the same node.
let lastRenderedPanel = null;

/**
 * Load the saved rules once. Call from contract_ui.js's init.
 */
export async function initContractRulesState() {
  const snapshot = await loadRulesSnapshot();
  if (snapshot) {
    rules = snapshot.rules;
    nextRuleId = snapshot.nextRuleId;
  }
  rulesVersion += 1;
  refreshContractRulesPanel(document);
}

/**
 * Create (or find) the rules sub-panel inside the given widget container.
 * @param {HTMLElement} parentContainer
 * @returns {HTMLElement}
 */
export function mountContractRulesPanel(parentContainer) {
  let panel = parentContainer.querySelector(`#${PANEL_ID}`);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "scx-contract-rules-panel";
    parentContainer.appendChild(panel);
  }
  return panel;
}

function getProductName(productId) {
  const recipe = recipes.find((r) => Number(r.id) === productId);
  return recipe?.name || String(productId);
}

function getCurrentDiscountPct() {
  const select = document.getElementById(DISCOUNT_SELECT_ID);
  const value = Number(select?.value);
  return Number.isFinite(value) ? value : 0;
}

function applyRule(ruleId) {
  const rule = findRuleById(rules, ruleId);
  if (!rule) return;

  const price = computeDiscountedPrice(getLowestSellerPrice(document), rule.discountPct);
  if (price === null) return;

  const priceInput = findContractPriceInput(document);
  const amountInput = findContractAmountInput(document);
  if (priceInput) setReactControlledValue(priceInput, price.toFixed(3));
  if (amountInput) setReactControlledValue(amountInput, String(rule.amount));
}

function removeRule(ruleId) {
  rules = removeRuleState(rules, ruleId);
  rulesVersion += 1;
  void saveRulesSnapshot({ rules, nextRuleId });
  refreshContractRulesPanel(document);
}

function saveCurrentAsRule(productId, companyName) {
  const amount = getContractAmountValue(document);
  const discountPct = getCurrentDiscountPct();

  // A rule without a resolvable productId is dropped by hydrateRules() on the
  // next load, so refuse it here instead of persisting a template that
  // silently disappears after a reload.
  if (!Number.isFinite(productId)) return;
  if (!isValidRuleInput({ amount, discountPct }) || !canAddRule(rules, CONTRACT_RULE_MAX_COUNT)) return;

  const id = resolveNextRuleId(rules, nextRuleId);
  const rule = createRule({
    id,
    productId,
    productName: getProductName(productId),
    companyName,
    amount,
    discountPct,
  });

  rules = appendRule(rules, rule);
  nextRuleId = id + 1;
  rulesVersion += 1;
  void saveRulesSnapshot({ rules, nextRuleId });
  refreshContractRulesPanel(document);
}

/**
 * Whether the current page state allows saving a new rule. Read live on every
 * refresh — the amount input is filled in at any point, often after the
 * beneficiary is picked.
 * @returns {boolean}
 */
function canSaveCurrentValues(root = document) {
  const amount = getContractAmountValue(root);
  return Number.isFinite(amount) && amount > 0 && canAddRule(rules, CONTRACT_RULE_MAX_COUNT);
}

function renderState(panel, productId, companyName, canSave) {
  if (!companyName) {
    renderNoCompanySelectedState({ container: panel, t });
    return;
  }

  const matches = findRulesForProductAndCompany(rules, productId, companyName);

  if (matches.length > 0) {
    renderRulesList({
      container: panel,
      rules: matches,
      t,
      formatMoney,
      onAction: (action, ruleId) => {
        if (action === "apply") applyRule(ruleId);
        if (action === "remove") removeRule(ruleId);
      },
    });
    return;
  }

  renderNoMatchState({
    container: panel,
    t,
    disabled: !canSave,
    onSaveCurrent: () => saveCurrentAsRule(productId, companyName),
  });
}

/**
 * Re-evaluate product/company context and re-render the panel if it changed.
 * Safe to call on every DOM mutation tick — short-circuits via a memoized key.
 * @param {Document} [root]
 */
export function refreshContractRulesPanel(root = document) {
  const panel = root?.querySelector?.(`#${PANEL_ID}`);
  if (!panel) return;

  const productId = getContractProductId(root);
  const companyName = hasSelectedBeneficiary(root) ? getSelectedCompanyName(root) : null;
  // canSave is part of the key because it drives the save button's disabled
  // state. It is the boolean, not the raw amount, so typing only re-renders
  // when it crosses the empty/valid boundary.
  const canSave = Number.isFinite(productId) && canSaveCurrentValues(root);
  const key = `${productId}:${companyName}:${rulesVersion}:${canSave}`;

  if (key === lastRenderedKey && panel === lastRenderedPanel) return;
  lastRenderedKey = key;
  lastRenderedPanel = panel;

  renderState(panel, productId, companyName, canSave);
}

export const _testUtils = {
  reset() {
    rules = [];
    nextRuleId = 1;
    rulesVersion = 0;
    lastRenderedKey = null;
    lastRenderedPanel = null;
  },
  setRules(newRules, newNextRuleId) {
    rules = newRules;
    if (Number.isFinite(newNextRuleId)) nextRuleId = newNextRuleId;
    rulesVersion += 1;
  },
  getRules: () => rules,
};
