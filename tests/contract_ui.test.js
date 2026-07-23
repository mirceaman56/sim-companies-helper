// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/state.js", () => ({ SIDEBAR_ID: "scx-sidebar" }));
vi.mock("../src/market.js", () => ({ fetchMarketPrice: vi.fn() }));
vi.mock("../src/auth.js", () => ({ getRealmId: vi.fn(() => 1) }));
vi.mock("../src/contract_rules_ui.js", () => ({
  initContractRulesState: vi.fn(async () => {}),
  mountContractRulesPanel: vi.fn(),
  refreshContractRulesPanel: vi.fn(),
}));
vi.mock("../src/data/storage.js", () => ({
  storage: {
    migrate: vi.fn(async () => ({ data: null })),
    set: vi.fn(async () => true),
  },
}));

import { _testUtils, initContractHelper } from "../src/contract_ui.js";
import { refreshContractRulesPanel } from "../src/contract_rules_ui.js";

const { parsePrice, getAmountValue, getPriceValue } = _testUtils;

describe("contract_ui parsing", () => {
  it("parses dot-decimal price in /de locale", () => {
    window.history.pushState({}, "", "/de/contract/1");
    expect(parsePrice("0.296")).toBe(0.296);
  });

  it("parses comma-decimal price in /de locale", () => {
    window.history.pushState({}, "", "/de/contract/1");
    expect(parsePrice("0,296")).toBe(0.296);
  });

  it("parses amount with thousands separators in /de locale", () => {
    window.history.pushState({}, "", "/de/contract/1");
    const input = document.createElement("input");
    input.name = "amount";
    input.value = "1.042.076";
    document.body.appendChild(input);
    expect(getAmountValue()).toBe(1042076);
    input.remove();
  });

  it("reads price from input element", () => {
    window.history.pushState({}, "", "/de/contract/1");
    const input = document.createElement("input");
    input.name = "price";
    input.value = "0.296";
    document.body.appendChild(input);
    expect(getPriceValue()).toBe(0.296);
    input.remove();
  });
});

describe("contract_ui rules panel refresh", () => {
  it("refreshes the rules panel when the amount input is typed into", () => {
    // Typing changes the input's value property, which produces no DOM
    // mutation — the MutationObserver never fires, so the panel needs its own
    // input listener to notice the amount became valid.
    document.body.innerHTML = `
      <form>
        <input name="price" value="" />
        <input name="amount" value="" />
        <a href="/market/resource/9/"></a>
      </form>`;

    initContractHelper();
    refreshContractRulesPanel.mockClear();

    const amountInput = document.querySelector('input[name="amount"]');
    amountInput.value = "5000";
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(refreshContractRulesPanel).toHaveBeenCalled();

    // Stop the observer so it does not fire against a torn-down jsdom document.
    _testUtils.stopObserving();
  });
});
