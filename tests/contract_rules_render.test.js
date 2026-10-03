// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  NOTE_INPUT_ID,
  renderNoCompanySelectedState,
  renderRulesPanel,
} from "../src/contract_rules_render.js";
import { formatMoney } from "../src/utils.js";

const t = (key) => key;

function render(overrides = {}) {
  const container = document.createElement("div");
  renderRulesPanel({
    container,
    rules: [],
    t,
    formatMoney,
    onAction: vi.fn(),
    onSaveCurrent: vi.fn(),
    maxPerCustomer: 5,
    noteMaxLength: 40,
    ...overrides,
  });
  return container;
}

const percentRule = {
  id: 1,
  productId: 9,
  companyName: "Grupo Negreiros",
  amount: 5000,
  priceMode: "percent",
  discountPct: 3,
  fixedPrice: null,
  note: "",
};
const fixedRule = {
  ...percentRule,
  id: 2,
  priceMode: "fixed",
  discountPct: null,
  fixedPrice: 0.315,
  note: "100k daily",
};

describe("contract_rules_render", () => {
  it("renders rule cards and dispatches apply/remove actions via delegation", () => {
    const onAction = vi.fn();
    const container = render({ rules: [percentRule], onAction });

    const card = container.querySelector('[data-rule-id="1"]');
    expect(card).not.toBeNull();

    card.querySelector('[data-action="apply"]').click();
    expect(onAction).toHaveBeenCalledWith("apply", 1);

    card.querySelector('[data-action="remove"]').click();
    expect(onAction).toHaveBeenCalledWith("remove", 1);
  });

  it("shows a discount for percent rules and a price plus note for fixed rules", () => {
    const container = render({ rules: [percentRule, fixedRule] });

    const percentCard = container.querySelector('[data-rule-id="1"]');
    expect(percentCard.textContent).toContain("contractRuleDiscount");
    expect(percentCard.textContent).toContain("-3%");
    expect(percentCard.querySelector(".scx-contract-rule-note")).toBeNull();

    const fixedCard = container.querySelector('[data-rule-id="2"]');
    expect(fixedCard.textContent).toContain("contractRulePrice");
    expect(fixedCard.textContent).toContain("0.315");
    expect(fixedCard.querySelector(".scx-contract-rule-note").textContent).toBe("100k daily");
  });

  it("escapes the note text", () => {
    const container = render({ rules: [{ ...fixedRule, note: "<img src=x onerror=1>" }] });

    expect(container.querySelector(".scx-contract-rule-note img")).toBeNull();
    expect(container.querySelector(".scx-contract-rule-note").textContent).toBe("<img src=x onerror=1>");
  });

  it("keeps the save form available below existing rules, with a counter", () => {
    const container = render({ rules: [percentRule, fixedRule] });

    expect(container.querySelector(".scx-contract-rules-count").textContent).toBe("2/5");
    expect(container.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();
  });

  it("replaces the save form with a limit notice at the per-customer cap", () => {
    const rules = [1, 2, 3, 4, 5].map((id) => ({ ...percentRule, id }));
    const container = render({ rules });

    expect(container.querySelector(".scx-contract-rules-save-btn")).toBeNull();
    expect(container.textContent).toContain("contractRuleLimitReached");
  });

  it("renders the no-match state with a save-current button, disabled when requested", () => {
    const container = render({ disabled: true });

    expect(container.textContent).toContain("contractRuleNoMatch");
    expect(container.querySelector(".scx-contract-rules-save-btn").disabled).toBe(true);
  });

  it("wires the save-current button click when enabled", () => {
    const onSaveCurrent = vi.fn();
    const container = render({ onSaveCurrent });

    container.querySelector(".scx-contract-rules-save-btn").click();

    expect(onSaveCurrent).toHaveBeenCalledTimes(1);
  });

  it("renders a labelled note input that keeps the draft and reports typing", () => {
    const onNoteInput = vi.fn();
    const container = render({ noteDraft: "50k daily", onNoteInput });

    const input = container.querySelector(`#${NOTE_INPUT_ID}`);
    expect(input.value).toBe("50k daily");
    expect(input.maxLength).toBe(40);
    expect(container.querySelector(`label[for="${NOTE_INPUT_ID}"]`)).not.toBeNull();

    input.value = "75k daily";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onNoteInput).toHaveBeenCalledWith("75k daily");
  });

  it("warns when rules are stored on this device only, and errors when they were not saved", () => {
    expect(render().querySelector(".scx-contract-rules-local-only")).toBeNull();
    expect(render({ status: "local" }).querySelector(".scx-contract-rules-local-only")).not.toBeNull();
    expect(render({ status: "failed" }).querySelector(".scx-contract-rules-save-failed")).not.toBeNull();
  });

  it("labels the delete action", () => {
    const btn = render({ rules: [percentRule] }).querySelector('[data-action="remove"]');
    expect(btn.textContent).toBe("contractRuleDelete");
  });

  it("lists every rule for the product with its company before a company is picked", () => {
    const container = document.createElement("div");
    const onAction = vi.fn();
    renderNoCompanySelectedState({
      container,
      t,
      formatMoney,
      onAction,
      rules: [percentRule, { ...fixedRule, companyName: "LR <b>reis</b>" }],
    });

    const companies = [...container.querySelectorAll(".scx-contract-rule-company")].map(
      (el) => el.textContent,
    );
    expect(companies).toEqual(["Grupo Negreiros", "LR <b>reis</b>"]);
    expect(container.querySelector('[data-action="apply"]')).toBeNull();

    container.querySelector('[data-rule-id="2"] [data-action="remove"]').click();
    expect(onAction).toHaveBeenCalledWith("remove", 2);
  });

  it("renders a passive hint when no company is selected", () => {
    const container = document.createElement("div");
    renderNoCompanySelectedState({ container, t });

    expect(container.querySelector(".scx-contract-rules-empty")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
