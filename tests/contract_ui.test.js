// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/state.js", () => ({ SIDEBAR_ID: "scx-sidebar" }));
vi.mock("../src/market.js", () => ({ fetchMarketPrice: vi.fn() }));
vi.mock("../src/auth.js", () => ({ getRealmId: vi.fn(() => 1) }));

import { _testUtils } from "../src/contract_ui.js";

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
