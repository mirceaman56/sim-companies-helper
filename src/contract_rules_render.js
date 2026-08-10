// contract_rules_render.js
// Rendering helpers for the saved contract rule templates panel.

/**
 * Matches the discount dropdown labels in contract_ui.js ("+0%", "-3%").
 * @param {number} discountPct
 * @returns {string}
 */
function formatDiscountLabel(discountPct) {
  return discountPct === 0 ? "+0%" : `-${discountPct}%`;
}

/**
 * Section header: title plus a hover/focus hint explaining what applying a
 * rule does. Mirrors the info-icon pattern in executive_ui.js.
 * @param {(key: string) => string} t
 * @param {string} bodyHtml
 * @returns {string}
 */
function panelShell(t, bodyHtml) {
  const hint = t("contractRuleInfoTooltip");

  return `<div class="scx-contract-rules-head">
      <span class="scx-contract-rules-title">${t("contractRulesTitle")}</span>
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
 * Render the rules matching the current product + company.
 * Rules arrive pre-filtered; this module never filters.
 * @param {{
 *  container: HTMLElement,
 *  rules: object[],
 *  t: (key: string) => string,
 *  formatMoney: (v: number, opts?: object) => string,
 *  onAction: (action: string, ruleId: number) => void,
 * }} input
 */
export function renderRulesList(input) {
  const { container, rules, t, formatMoney, onAction } = input;

  container.innerHTML = panelShell(
    t,
    `<div class="scx-contract-rules-list">
      ${rules
        .map(
          (rule) => `
        <div class="scx-contract-rule-card" data-rule-id="${rule.id}">
          <div class="scx-contract-rule-info">
            ${labelledField(
              t("contractRuleQuantity"),
              "scx-contract-rule-amount",
              formatMoney(rule.amount, { prefix: false, decimals: 0 }),
            )}
            ${labelledField(
              t("contractRuleDiscount"),
              "scx-contract-rule-discount",
              formatDiscountLabel(rule.discountPct),
            )}
          </div>
          <div class="scx-contract-rule-actions">
            <button type="button" class="scx-btn scx-btn-secondary scx-contract-rule-apply-btn" data-action="apply">${t("contractRuleApply")}</button>
            <button type="button" class="scx-btn scx-contract-rule-remove-btn" data-action="remove" aria-label="${t("contractRuleRemove")}" title="${t("contractRuleRemove")}">✕</button>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>`,
  );

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.target.closest(".scx-contract-rule-card");
      const ruleId = Number(card.dataset.ruleId);
      const action = e.target.dataset.action;
      onAction(action, ruleId);
    });
  });
}

/**
 * Render the "nothing saved for this product + company yet" prompt.
 * @param {{
 *  container: HTMLElement,
 *  t: (key: string) => string,
 *  onSaveCurrent: () => void,
 *  disabled?: boolean,
 * }} input
 */
export function renderNoMatchState(input) {
  const { container, t, onSaveCurrent, disabled = false } = input;

  container.innerHTML = panelShell(
    t,
    `<div class="scx-contract-rules-empty">${t("contractRuleNoMatch")}</div>
    <button type="button" class="scx-btn scx-btn-success scx-contract-rules-save-btn" ${disabled ? "disabled" : ""}>
      ${t("contractRuleSaveCurrent")}
    </button>`,
  );

  container.querySelector(".scx-contract-rules-save-btn")?.addEventListener("click", onSaveCurrent);
}

/**
 * Render the passive hint shown before a beneficiary is picked.
 * @param {{ container: HTMLElement, t: (key: string) => string }} input
 */
export function renderNoCompanySelectedState(input) {
  const { container, t } = input;

  container.innerHTML = panelShell(
    t,
    `<div class="scx-contract-rules-empty">${t("contractRuleSelectCompanyHint")}</div>`,
  );
}
