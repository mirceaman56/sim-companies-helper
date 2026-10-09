// Price / Saved-rules tabs inside the contract widget. Panels are hidden, never unmounted:
// the rules code reads the price-mode and discount inputs from the Price panel.

export const TAB_PRICE = "price";
export const TAB_RULES = "rules";

const TABS = [TAB_PRICE, TAB_RULES];

/**
 * Pure default-tab choice. A tab the user picked sticks until the widget is
 * re-mounted (popup closed); otherwise open on the rules when one can be applied.
 * @param {{ current: string, userPicked: boolean, applicableRuleCount: number }} input
 * @returns {string}
 */
export function resolveContractTab({ current, userPicked, applicableRuleCount }) {
  if (userPicked) return current;
  return applicableRuleCount > 0 ? TAB_RULES : TAB_PRICE;
}

/**
 * Tab buttons + panels markup. Panel bodies are filled by the caller.
 * @param {(key: string) => string} t
 * @param {{ priceHtml: string, rulesHtml: string }} panels
 * @returns {string}
 */
export function renderContractTabs(t, { priceHtml, rulesHtml }) {
  return `
    <div class="scx-contract-tabs" role="tablist" aria-label="${t("contractApplyTooltip")}">
      <button type="button" class="scx-contract-tab" role="tab" id="scx-contract-tab-price" data-scx-tab="${TAB_PRICE}" aria-controls="scx-contract-tabpanel-price">
        ${t("contractApplyTooltip")}
      </button>
      <button type="button" class="scx-contract-tab" role="tab" id="scx-contract-tab-rules" data-scx-tab="${TAB_RULES}" aria-controls="scx-contract-tabpanel-rules">
        ${t("contractRulesTitle")}
        <span class="scx-contract-tab-badge scx-mono scx-hidden"></span>
      </button>
    </div>
    <div class="scx-contract-tabpanel" role="tabpanel" id="scx-contract-tabpanel-price" data-scx-tabpanel="${TAB_PRICE}" aria-labelledby="scx-contract-tab-price">
      ${priceHtml}
    </div>
    <div class="scx-contract-tabpanel" role="tabpanel" id="scx-contract-tabpanel-rules" data-scx-tabpanel="${TAB_RULES}" aria-labelledby="scx-contract-tab-rules">
      ${rulesHtml}
    </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {string} tab
 */
function selectTab(container, tab) {
  container.dataset.scxTab = tab;
  container.querySelectorAll("[data-scx-tab]").forEach((btn) => {
    const active = btn.dataset.scxTab === tab;
    btn.classList.toggle("scx-contract-tab-active", active);
    btn.setAttribute("aria-selected", String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  container.querySelectorAll("[data-scx-tabpanel]").forEach((panel) => {
    panel.hidden = panel.dataset.scxTabpanel !== tab;
  });
}

/**
 * Click and arrow-key handling. A user choice is kept on the container, so it
 * resets by itself when the widget is torn down with the popup.
 * @param {HTMLElement} container
 */
export function wireContractTabs(container) {
  const pick = (tab) => {
    container.dataset.scxTabPicked = "1";
    selectTab(container, tab);
  };

  container.querySelectorAll("[data-scx-tab]").forEach((btn) => {
    btn.addEventListener("click", () => pick(btn.dataset.scxTab));
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = TABS[(TABS.indexOf(btn.dataset.scxTab) + step + TABS.length) % TABS.length];
      pick(next);
      container.querySelector(`[data-scx-tab="${next}"]`)?.focus();
    });
  });

  selectTab(container, TAB_PRICE);
}

/**
 * Update the rules badge and, when the product/company context changed, the
 * default tab. Only a context change re-picks the tab: saving or deleting a
 * rule must not yank the user to the other tab.
 * @param {ParentNode} root
 * @param {{ contextKey: string, ruleCount: number, applicableRuleCount: number }} input
 */
export function syncContractTabs(root, { contextKey, ruleCount, applicableRuleCount }) {
  const container = root.querySelector?.(".scx-contract-tabs")?.parentElement;
  if (!container) return;

  const badge = container.querySelector(".scx-contract-tab-badge");
  if (badge) {
    badge.textContent = String(ruleCount);
    badge.classList.toggle("scx-hidden", ruleCount === 0);
  }

  if (container.dataset.scxTabContext === contextKey) return;
  container.dataset.scxTabContext = contextKey;
  selectTab(
    container,
    resolveContractTab({
      current: container.dataset.scxTab ?? TAB_PRICE,
      userPicked: container.dataset.scxTabPicked === "1",
      applicableRuleCount,
    }),
  );
}
