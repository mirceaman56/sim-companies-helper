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
 * @param {(key: string) => string} t
 * @param {string} bodyHtml
 * @returns {string}
 */
function panelShell(t, bodyHtml) {
  return `<div class="scx-contract-rules-title">${t("contractRulesTitle")}</div>${bodyHtml}`;
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
            <span class="scx-contract-rule-amount">${formatMoney(rule.amount, { prefix: false, decimals: 0 })}</span>
            <span class="scx-contract-rule-discount">${formatDiscountLabel(rule.discountPct)}</span>
          </div>
          <div class="scx-contract-rule-actions">
            <button class="scx-btn scx-btn-info scx-contract-rule-apply-btn" data-action="apply">${t("contractRuleApply")}</button>
            <button class="scx-btn scx-contract-rule-remove-btn" data-action="remove">✕</button>
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
    <button class="scx-btn scx-btn-success scx-contract-rules-save-btn" ${disabled ? "disabled" : ""}>
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
