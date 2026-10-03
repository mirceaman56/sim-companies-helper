// contract_rules_render.js
// Rendering helpers for the saved contract rule templates panel.

import { escapeHtml, formatDiscountPct } from "./utils.js";
import { PRICE_MODE_FIXED } from "./contract_rules_state.js";

export const NOTE_INPUT_ID = "scx-contract-rule-note-input";

/**
 * Section header: title plus a hover/focus hint explaining what applying a
 * rule does. Mirrors the info-icon pattern in executive_ui.js.
 * @param {(key: string) => string} t
 * @param {string} bodyHtml
 * @param {string} [count] "used/max" counter for the selected company.
 * @returns {string}
 */
function panelShell(t, bodyHtml, count = "") {
  const hint = t("contractRuleInfoTooltip");

  return `<div class="scx-contract-rules-head">
      <span class="scx-contract-rules-title">${t("contractRulesTitle")}${
        count ? ` <span class="scx-contract-rules-count scx-mono">${count}</span>` : ""
      }</span>
      <span
        class="scx-contract-rules-info"
        role="img"
        tabindex="0"
        aria-label="${hint}"
        data-tooltip="${hint}"
      >i</span>
    </div>${bodyHtml}`;
}

/**
 * A labelled value column inside a rule card. The label is what makes the two
 * bare numbers readable at the sidebar's fixed 180px width.
 * @param {string} label
 * @param {string} valueClass
 * @param {string} value
 * @returns {string}
 */
function labelledField(label, valueClass, value) {
  return `<span class="scx-contract-rule-field">
      <span class="scx-contract-rule-field-label">${label}</span>
      <span class="${valueClass}">${value}</span>
    </span>`;
}

/**
 * @param {object} rule
 * @param {(key: string) => string} t
 * @param {(v: number, opts?: object) => string} formatMoney
 * @param {{showCompany?: boolean, allowApply?: boolean}} [options]
 * @returns {string}
 */
function ruleCard(rule, t, formatMoney, { showCompany = false, allowApply = true } = {}) {
  const isFixed = rule.priceMode === PRICE_MODE_FIXED;
  const priceField = isFixed
    ? labelledField(
        t("contractRulePrice"),
        "scx-contract-rule-discount scx-mono",
        formatMoney(rule.fixedPrice, { decimals: 3 }),
      )
    : labelledField(
        t("contractRuleDiscount"),
        "scx-contract-rule-discount scx-mono",
        formatDiscountPct(rule.discountPct),
      );
  const note = rule.note ? `<div class="scx-contract-rule-note">${escapeHtml(rule.note)}</div>` : "";
  const company = showCompany
    ? `<div class="scx-contract-rule-company">${escapeHtml(rule.companyName)}</div>`
    : "";
  const applyBtn = allowApply
    ? `<button type="button" class="scx-btn scx-btn-secondary scx-contract-rule-apply-btn" data-action="apply">${t("contractRuleApply")}</button>`
    : "";

  return `
    <div class="scx-contract-rule-card" data-rule-id="${rule.id}">
      ${company}
      <div class="scx-contract-rule-info">
        ${labelledField(
          t("contractRuleQuantity"),
          "scx-contract-rule-amount scx-mono",
          formatMoney(rule.amount, { prefix: false, decimals: 0 }),
        )}
        ${priceField}
      </div>
      ${note}
      <div class="scx-contract-rule-actions">
        ${applyBtn}
        <button type="button" class="scx-btn scx-contract-rule-remove-btn" data-action="remove" title="${t("contractRuleRemove")}">${t("contractRuleDelete")}</button>
      </div>
    </div>`;
}

/**
 * Banner for rules that are not safely in cloud storage.
 * @param {(key: string) => string} t
 * @param {"synced"|"local"|"failed"} status
 * @returns {string}
 */
function statusBanner(t, status) {
  if (status === "local") {
    return `<div class="scx-contract-rules-local-only" role="status">${t("contractRuleLocalOnly")}</div>`;
  }
  if (status === "failed") {
    return `<div class="scx-contract-rules-save-failed" role="alert">${t("contractRuleSaveFailed")}</div>`;
  }
  return "";
}

/**
 * Wire apply/remove buttons. Uses the button itself, not the click target, so
 * a click on an inner node still resolves its action.
 * @param {HTMLElement} container
 * @param {(action: string, ruleId: number) => void} onAction
 */
function wireRuleActions(container, onAction) {
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".scx-contract-rule-card");
      onAction(btn.dataset.action, Number(card?.dataset.ruleId));
    });
  });
}

/**
 * The "save current values" form: an optional note plus the save button.
 * @param {(key: string) => string} t
 * @param {{noteDraft: string, noteMaxLength: number, disabled: boolean}} input
 * @returns {string}
 */
function saveForm(t, { noteDraft, noteMaxLength, disabled }) {
  return `<div class="scx-contract-rules-note-field">
      <label class="scx-contract-rule-field-label" for="${NOTE_INPUT_ID}">${t("contractRuleNoteLabel")}</label>
      <input
        type="text"
        id="${NOTE_INPUT_ID}"
        name="${NOTE_INPUT_ID}"
        class="scx-contract-rules-note-input"
        maxlength="${noteMaxLength}"
        placeholder="${escapeHtml(t("contractRuleNotePlaceholder"))}"
        value="${escapeHtml(noteDraft)}"
      />
    </div>
    <button type="button" class="scx-btn scx-btn-success scx-contract-rules-save-btn" ${disabled ? "disabled" : ""}>
      ${t("contractRuleSaveCurrent")}
    </button>`;
}

/**
 * Render the panel for a selected company: its saved rules (pre-filtered —
 * this module never filters) followed by the save form, or the limit notice
 * once the per-customer cap is reached.
 * @param {{
 *  container: HTMLElement,
 *  rules: object[],
 *  t: (key: string) => string,
 *  formatMoney: (v: number, opts?: object) => string,
 *  onAction: (action: string, ruleId: number) => void,
 *  onSaveCurrent: () => void,
 *  onNoteInput?: (value: string) => void,
 *  maxPerCustomer: number,
 *  noteMaxLength: number,
 *  noteDraft?: string,
 *  disabled?: boolean,
 *  status?: "synced"|"local"|"failed",
 * }} input
 */
export function renderRulesPanel(input) {
  const {
    container,
    rules,
    t,
    formatMoney,
    onAction,
    onSaveCurrent,
    onNoteInput,
    maxPerCustomer,
    noteMaxLength,
    noteDraft = "",
    disabled = false,
    status = "synced",
  } = input;

  const listHtml =
    rules.length > 0
      ? `<div class="scx-contract-rules-list">${rules.map((rule) => ruleCard(rule, t, formatMoney)).join("")}</div>`
      : `<div class="scx-contract-rules-empty">${t("contractRuleNoMatch")}</div>`;
  const footerHtml =
    rules.length >= maxPerCustomer
      ? `<div class="scx-contract-rules-empty">${t("contractRuleLimitReached")}</div>`
      : saveForm(t, { noteDraft, noteMaxLength, disabled });

  container.innerHTML = panelShell(
    t,
    `${statusBanner(t, status)}${listHtml}${footerHtml}`,
    `${rules.length}/${maxPerCustomer}`,
  );

  wireRuleActions(container, onAction);

  container.querySelector(".scx-contract-rules-save-btn")?.addEventListener("click", onSaveCurrent);
  container
    .querySelector(`#${NOTE_INPUT_ID}`)
    ?.addEventListener("input", (e) => onNoteInput?.(e.target.value));
}

/**
 * Render the state shown before a beneficiary is picked: a hint, plus every
 * saved rule for this product labelled with its company, so rules can be found
 * and deleted without first selecting the right company.
 * @param {{
 *  container: HTMLElement,
 *  t: (key: string) => string,
 *  rules?: object[],
 *  formatMoney?: (v: number, opts?: object) => string,
 *  status?: "synced"|"local"|"failed",
 *  onAction?: (action: string, ruleId: number) => void,
 * }} input
 */
export function renderNoCompanySelectedState(input) {
  const { container, t, rules = [], formatMoney, status = "synced", onAction = () => {} } = input;

  const listHtml =
    rules.length > 0
      ? `<div class="scx-contract-rules-list">${rules
          .map((rule) => ruleCard(rule, t, formatMoney, { showCompany: true, allowApply: false }))
          .join("")}</div>`
      : "";

  container.innerHTML = panelShell(
    t,
    `${statusBanner(t, status)}<div class="scx-contract-rules-empty">${t("contractRuleSelectCompanyHint")}</div>${listHtml}`,
  );

  wireRuleActions(container, onAction);
}
