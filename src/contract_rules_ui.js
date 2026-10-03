// contract_rules_ui.js
// Orchestrates the saved contract-rule-templates panel: detects the current
// product and selected beneficiary company on a contract page, shows saved
// rules matching both (or a "save current values" prompt), and applies a
// rule with one click by filling the amount and a freshly recalculated price.
import { t } from "./i18n.js";
import { onAuthDataApplied } from "./auth.js";
import { formatMoney, normalizeDiscountPct } from "./utils.js";
import {
  CONTRACT_RULE_MAX_COUNT,
  CONTRACT_RULE_MAX_PER_CUSTOMER,
  CONTRACT_RULE_NOTE_MAX_LENGTH,
} from "./constants.js";
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
  canAddRuleForCustomer,
  createRule,
  findRuleById,
  findRulesForProductAndCompany,
  findRulesForProduct,
  isValidRuleInput,
  normalizeFixedPrice,
  normalizeNote,
  normalizePriceMode,
  PRICE_MODE_FIXED,
  removeRuleState,
  resolveNextRuleId,
} from "./contract_rules_state.js";
import { loadRulesSnapshot, saveRulesSnapshot } from "./contract_rules_storage.js";
import { renderNoCompanySelectedState, renderRulesPanel } from "./contract_rules_render.js";

// Must match the discount input's id in contract_ui.js's widget markup.
const DISCOUNT_INPUT_ID = "scx-contract-discount-input";
// The widget in contract_ui.js owns these controls; this module only reads them.
export const FIXED_PRICE_INPUT_ID = "scx-contract-fixed-price-input";
export const PRICE_MODE_SELECTOR = "[data-scx-price-mode]";
const PANEL_ID = "scx-contract-rules-panel";

let rules = [];
let nextRuleId = 1;
// Bumped whenever `rules` changes, and folded into the render memo key so a
// data change is never invisible to the next render check — even when the
// refresh fired right after the change finds the panel mid-remount.
let rulesVersion = 0;
// Where the last load/save left the rules: "synced" (chrome.storage.sync),
// "local" (sync refused, kept in chrome.storage.local) or "failed" (nothing
// could be written, e.g. the account is not known yet).
let persistStatus = "synced";
// Rules must be loaded before any change is written: saving an in-memory list
// that never saw the stored rules would overwrite them.
let rulesLoaded = false;
let loadPromise = null;
let authListenerAttached = false;
// Survives the panel re-rendering while the user is still filling the form.
let noteDraft = "";
let lastRenderedKey = null;
// The panel node the memoized key describes. contract_ui.js tears the widget
// down and re-injects it, and the replacement panel starts empty — so a key
// match only means "already rendered" while it is the same node.
let lastRenderedPanel = null;

/**
 * Load the stored rules, joining an in-flight load. A load that cannot resolve
 * the account (auth not ready or failed) leaves `rulesLoaded` false so the next
 * call retries instead of treating the store as empty.
 * @returns {Promise<boolean>} Whether the rules are loaded.
 */
async function ensureRulesLoaded() {
  if (rulesLoaded) return true;

  if (!loadPromise) {
    loadPromise = loadRulesSnapshot()
      .then((snapshot) => {
        if (snapshot) {
          rules = snapshot.rules;
          nextRuleId = snapshot.nextRuleId;
          persistStatus = snapshot.synced === false ? "local" : "synced";
        }
        rulesLoaded = true;
        rulesVersion += 1;
      })
      .catch((e) => {
        console.debug("[SimHelper] Could not load contract rules:", e);
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  await loadPromise;
  return rulesLoaded;
}

/**
 * Load the saved rules. Call from contract_ui.js's init. When auth arrives
 * later than the first load attempt, the load is retried then.
 */
export async function initContractRulesState() {
  if (!authListenerAttached) {
    authListenerAttached = true;
    onAuthDataApplied(() => {
      if (rulesLoaded) return;
      void ensureRulesLoaded().then(() => refreshContractRulesPanel(document));
    });
  }

  await ensureRulesLoaded();
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

/**
 * Apply a change to the stored rules and persist it. The change runs only once
 * the stored rules are loaded, so it never writes over rules it has not seen.
 * @param {(current: object[]) => object[]|null} mutate Returns the next rules, or null to skip.
 */
async function commitRules(mutate) {
  if (!(await ensureRulesLoaded())) {
    persistStatus = "failed";
    refreshContractRulesPanel(document);
    return;
  }

  const next = mutate(rules);
  if (!next) return;

  rules = next;
  rulesVersion += 1;
  refreshContractRulesPanel(document);

  const result = await saveRulesSnapshot({ rules, nextRuleId });
  persistStatus = !result?.saved ? "failed" : result.synced ? "synced" : "local";
  if (persistStatus === "failed") console.debug("[SimHelper] Could not save contract rules.");
  refreshContractRulesPanel(document);
}

function getCurrentPriceMode(root = document) {
  return normalizePriceMode(root.querySelector(PRICE_MODE_SELECTOR)?.dataset.scxPriceMode);
}

function getCurrentFixedPrice(root = document) {
  return normalizeFixedPrice(root.getElementById(FIXED_PRICE_INPUT_ID)?.value);
}

function getCurrentDiscountPct() {
  const input = document.getElementById(DISCOUNT_INPUT_ID);
  return normalizeDiscountPct(input?.value) ?? 0;
}

function applyRule(ruleId) {
  const rule = findRuleById(rules, ruleId);
  if (!rule) return;

  // A fixed rule carries its own price, so it applies even when the market
  // has no offers to discount from.
  const price =
    rule.priceMode === PRICE_MODE_FIXED
      ? rule.fixedPrice
      : computeDiscountedPrice(getLowestSellerPrice(document), rule.discountPct);
  if (price === null) return;

  const priceInput = findContractPriceInput(document);
  const amountInput = findContractAmountInput(document);
  if (priceInput) setReactControlledValue(priceInput, price.toFixed(3));
  if (amountInput) setReactControlledValue(amountInput, String(rule.amount));
}

function removeRule(ruleId) {
  return commitRules((current) => removeRuleState(current, ruleId));
}

function saveCurrentAsRule(productId, companyName) {
  // Read the form now: it can change while the stored rules are loading.
  const amount = getContractAmountValue(document);
  const priceMode = getCurrentPriceMode();
  const discountPct = getCurrentDiscountPct();
  const fixedPrice = getCurrentFixedPrice();
  const note = normalizeNote(noteDraft, CONTRACT_RULE_NOTE_MAX_LENGTH);

  // A rule without a resolvable productId is dropped by hydrateRules() on the
  // next load, so refuse it here instead of persisting a template that
  // silently disappears after a reload.
  if (!Number.isFinite(productId)) return Promise.resolve();
  if (!isValidRuleInput({ amount, priceMode, discountPct, fixedPrice })) return Promise.resolve();

  return commitRules((current) => {
    if (!canAddRule(current, CONTRACT_RULE_MAX_COUNT)) return null;
    if (!canAddRuleForCustomer(current, productId, companyName, CONTRACT_RULE_MAX_PER_CUSTOMER)) return null;

    const id = resolveNextRuleId(current, nextRuleId);
    nextRuleId = id + 1;
    noteDraft = "";
    return appendRule(
      current,
      createRule({ id, productId, companyName, amount, priceMode, discountPct, fixedPrice, note }),
    );
  });
}

/**
 * Whether the current page state allows saving a new rule. Read live on every
 * refresh — the amount input is filled in at any point, often after the
 * beneficiary is picked, and fixed mode also needs a price typed in.
 * @returns {boolean}
 */
function canSaveCurrentValues(root = document) {
  const amount = getContractAmountValue(root);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (getCurrentPriceMode(root) === PRICE_MODE_FIXED && getCurrentFixedPrice(root) === null) return false;
  return canAddRule(rules, CONTRACT_RULE_MAX_COUNT);
}

function handleRuleAction(action, ruleId) {
  if (action === "apply") applyRule(ruleId);
  if (action === "remove") void removeRule(ruleId);
}

function renderState(panel, productId, companyName, canSave) {
  if (!companyName) {
    // Every rule for this product stays visible (and deletable) before a
    // company is picked, so a saved rule is never out of sight.
    renderNoCompanySelectedState({
      container: panel,
      t,
      rules: findRulesForProduct(rules, productId),
      formatMoney,
      status: persistStatus,
      onAction: handleRuleAction,
    });
    return;
  }

  renderRulesPanel({
    container: panel,
    rules: findRulesForProductAndCompany(rules, productId, companyName),
    t,
    formatMoney,
    maxPerCustomer: CONTRACT_RULE_MAX_PER_CUSTOMER,
    noteMaxLength: CONTRACT_RULE_NOTE_MAX_LENGTH,
    noteDraft,
    disabled: !canSave,
    status: persistStatus,
    onAction: handleRuleAction,
    onSaveCurrent: () => void saveCurrentAsRule(productId, companyName),
    onNoteInput: (value) => {
      noteDraft = value;
    },
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
  const key = `${productId}:${companyName}:${rulesVersion}:${canSave}:${persistStatus}`;

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
    persistStatus = "synced";
    rulesLoaded = false;
    loadPromise = null;
    noteDraft = "";
    lastRenderedKey = null;
    lastRenderedPanel = null;
  },
  setRules(newRules, newNextRuleId) {
    rules = newRules;
    if (Number.isFinite(newNextRuleId)) nextRuleId = newNextRuleId;
    rulesLoaded = true;
    rulesVersion += 1;
  },
  saveCurrentAsRule,
  removeRule,
  getRules: () => rules,
};
