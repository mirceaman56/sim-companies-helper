// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  renderContractTabs,
  resolveContractTab,
  syncContractTabs,
  TAB_PRICE,
  TAB_RULES,
  wireContractTabs,
} from "../src/contract_tabs.js";

const t = (key) => key;

function mountWidget() {
  const container = document.createElement("div");
  container.innerHTML = renderContractTabs(t, {
    priceHtml: '<input id="price-field" />',
    rulesHtml: '<div id="rules-list"></div>',
  });
  document.body.appendChild(container);
  wireContractTabs(container);
  return container;
}

const tab = (container, name) => container.querySelector(`[data-scx-tab="${name}"]`);
const panel = (container, name) => container.querySelector(`[data-scx-tabpanel="${name}"]`);
const badge = (container) => container.querySelector(".scx-contract-tab-badge");

describe("resolveContractTab", () => {
  it("opens on the rules when one can be applied", () => {
    expect(resolveContractTab({ current: TAB_PRICE, userPicked: false, applicableRuleCount: 2 })).toBe(
      TAB_RULES,
    );
  });

  it("opens on the price controls when no rule applies", () => {
    expect(resolveContractTab({ current: TAB_RULES, userPicked: false, applicableRuleCount: 0 })).toBe(
      TAB_PRICE,
    );
  });

  it("keeps the tab the user picked", () => {
    expect(resolveContractTab({ current: TAB_PRICE, userPicked: true, applicableRuleCount: 3 })).toBe(
      TAB_PRICE,
    );
  });
});

describe("contract tabs widget", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("starts on the price tab with the rules panel hidden but mounted", () => {
    const container = mountWidget();

    expect(tab(container, TAB_PRICE).getAttribute("aria-selected")).toBe("true");
    expect(panel(container, TAB_PRICE).hidden).toBe(false);
    expect(panel(container, TAB_RULES).hidden).toBe(true);
    expect(container.querySelector("#rules-list")).not.toBeNull();
  });

  it("switches tabs on click and with arrow keys", () => {
    const container = mountWidget();

    tab(container, TAB_RULES).click();
    expect(panel(container, TAB_RULES).hidden).toBe(false);
    expect(panel(container, TAB_PRICE).hidden).toBe(true);

    tab(container, TAB_RULES).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(tab(container, TAB_PRICE).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab(container, TAB_PRICE));
  });

  it("shows the rule count badge only when there are rules", () => {
    const container = mountWidget();

    syncContractTabs(document, { contextKey: "9:A", ruleCount: 0, applicableRuleCount: 0 });
    expect(badge(container).classList.contains("scx-hidden")).toBe(true);

    syncContractTabs(document, { contextKey: "9:A", ruleCount: 2, applicableRuleCount: 2 });
    expect(badge(container).classList.contains("scx-hidden")).toBe(false);
    expect(badge(container).textContent).toBe("2");
  });

  it("re-picks the default tab only when the product/company context changes", () => {
    const container = mountWidget();

    syncContractTabs(document, { contextKey: "9:A", ruleCount: 0, applicableRuleCount: 0 });
    expect(container.dataset.scxTab).toBe(TAB_PRICE);

    // Saving a rule in the same context must not move the user off the price tab.
    syncContractTabs(document, { contextKey: "9:A", ruleCount: 1, applicableRuleCount: 1 });
    expect(container.dataset.scxTab).toBe(TAB_PRICE);

    syncContractTabs(document, { contextKey: "9:B", ruleCount: 1, applicableRuleCount: 1 });
    expect(container.dataset.scxTab).toBe(TAB_RULES);
  });

  it("does not override a tab the user picked", () => {
    const container = mountWidget();
    tab(container, TAB_PRICE).click();

    syncContractTabs(document, { contextKey: "9:B", ruleCount: 1, applicableRuleCount: 1 });

    expect(container.dataset.scxTab).toBe(TAB_PRICE);
  });
});
