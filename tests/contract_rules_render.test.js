// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { renderNoCompanySelectedState, renderNoMatchState, renderRulesList } from "../src/contract_rules_render.js";
import { formatMoney } from "../src/utils.js";

const t = (key) => key;

describe("contract_rules_render", () => {
  it("renders rule cards and dispatches apply/remove actions via delegation", () => {
    const container = document.createElement("div");
    const onAction = vi.fn();

    renderRulesList({
      container,
      rules: [
        { id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 },
      ],
      t,
      formatMoney,
      onAction,
    });

    const card = container.querySelector('[data-rule-id="1"]');
    expect(card).not.toBeNull();

    card.querySelector('[data-action="apply"]').click();
    expect(onAction).toHaveBeenCalledWith("apply", 1);

    card.querySelector('[data-action="remove"]').click();
    expect(onAction).toHaveBeenCalledWith("remove", 1);
  });

  it("renders the no-match state with a save-current button, disabled when requested", () => {
    const container = document.createElement("div");

    renderNoMatchState({ container, t, onSaveCurrent: vi.fn(), disabled: true });
    expect(container.querySelector(".scx-contract-rules-save-btn").disabled).toBe(true);
  });

  it("wires the save-current button click when enabled", () => {
    const container = document.createElement("div");
    const onSaveCurrent = vi.fn();

    renderNoMatchState({ container, t, onSaveCurrent, disabled: false });
    container.querySelector(".scx-contract-rules-save-btn").click();

    expect(onSaveCurrent).toHaveBeenCalledTimes(1);
  });

  it("renders a passive hint when no company is selected", () => {
    const container = document.createElement("div");
    renderNoCompanySelectedState({ container, t });

    expect(container.querySelector(".scx-contract-rules-empty")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
