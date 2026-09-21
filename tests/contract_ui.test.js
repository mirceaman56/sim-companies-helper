// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { storage } from "../src/data/storage.js";

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

describe("contract_ui discount input", () => {
  function setupContractPage() {
    document.body.innerHTML = `
      <div id="scx-sidebar"></div>
      <form>
        <input name="price" value="" />
        <input name="amount" value="" />
        <a href="/market/resource/9/">
          <table><tr><td>Company</td><td>1000</td><td>$1.000</td></tr></table>
        </a>
      </form>`;
  }

  function getInput() {
    return document.getElementById("scx-contract-discount-input");
  }

  function setDiscount(value, eventType = "change") {
    const input = getInput();
    input.value = value;
    input.dispatchEvent(new Event(eventType, { bubbles: true }));
  }

  afterEach(() => {
    _testUtils.stopObserving();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders a stepped number input defaulting to 3%", async () => {
    storage.migrate.mockResolvedValueOnce({ data: null });
    setupContractPage();
    initContractHelper();
    await Promise.resolve();

    const input = getInput();
    expect(input).not.toBeNull();
    expect(input.type).toBe("number");
    expect(input.step).toBe("0.5");
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");
    expect(input.value).toBe("3");
    // The label must point at the field, not float free of it.
    expect(document.querySelector('label[for="scx-contract-discount-input"]')).not.toBeNull();
  });

  it("persists a discount beyond the old 5% ceiling", () => {
    setupContractPage();
    initContractHelper();

    setDiscount("12.5");

    expect(storage.set).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "contract-discount", data: 12.5 }),
    );
    expect(document.getElementById("scx-contract-apply-btn").textContent).toContain("12.5%");
  });

  it("clamps an out-of-range discount and keeps the field in sync", () => {
    setupContractPage();
    initContractHelper();

    setDiscount("250");

    expect(getInput().value).toBe("100");
    expect(storage.set).toHaveBeenCalledWith(expect.objectContaining({ data: 100 }));
  });

  it("keeps the last good value when the field is cleared", () => {
    setupContractPage();
    initContractHelper();

    setDiscount("7.5");
    storage.set.mockClear();
    setDiscount("");

    expect(getInput().value).toBe("7.5");
    expect(storage.set).toHaveBeenCalledWith(expect.objectContaining({ data: 7.5 }));
  });

  it("applies a fractional discount to the price input", () => {
    setupContractPage();
    initContractHelper();

    setDiscount("2.5");
    document.getElementById("scx-contract-apply-btn").click();

    // $1.000 lowest seller price − 2.5%
    expect(document.querySelector('input[name="price"]').value).toBe("0.975");
  });

  it("pushes a stored discount into an already-injected widget", async () => {
    storage.migrate.mockResolvedValueOnce({ data: 8.5 });
    setupContractPage();
    initContractHelper();
    await Promise.resolve();
    await Promise.resolve();

    expect(getInput().value).toBe("8.5");
    expect(document.getElementById("scx-contract-apply-btn").textContent).toContain("8.5%");
  });
});
