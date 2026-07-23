// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/contract_rules_storage.js", () => ({
  loadRulesSnapshot: vi.fn(async () => null),
  saveRulesSnapshot: vi.fn(async () => {}),
}));

import {
  initContractRulesState,
  mountContractRulesPanel,
  refreshContractRulesPanel,
  _testUtils,
} from "../src/contract_rules_ui.js";
import { loadRulesSnapshot, saveRulesSnapshot } from "../src/contract_rules_storage.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "contract", name), "utf8");
}

function mountPanel() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mountContractRulesPanel(container);
  return container;
}

describe("contract_rules_ui", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    _testUtils.reset();
    vi.clearAllMocks();
  });

  it("shows a passive hint when no beneficiary is selected", () => {
    document.body.innerHTML = loadFixture("beneficiary-not-selected.html");
    mountPanel();

    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-empty")?.textContent).toBe("contractRuleSelectCompanyHint");
  });

  it("switches to the matching-rules list once a company is selected", () => {
    _testUtils.setRules(
      [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      2,
    );

    document.body.innerHTML = loadFixture("beneficiary-not-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);
    expect(document.querySelector('[data-rule-id="1"]')).toBeNull();

    // Simulate the game's own UI replacing the beneficiary block after selection.
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("shows the save-current prompt when no rule matches the product+company", () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();

    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();
    expect(document.querySelector('[data-rule-id]')).toBeNull();
  });

  it("applies a matching rule by filling amount and a freshly recalculated price", () => {
    _testUtils.setRules(
      [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      2,
    );
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector('[data-rule-id="1"] [data-action="apply"]').click();

    expect(document.querySelector('input[name="amount"]').value).toBe("5000");
    expect(document.querySelector('input[name="price"]').value).toBe("1.746");
  });

  it("removes a rule and persists the updated snapshot", () => {
    _testUtils.setRules(
      [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      2,
    );
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector('[data-rule-id="1"] [data-action="remove"]').click();

    expect(_testUtils.getRules()).toEqual([]);
    expect(saveRulesSnapshot).toHaveBeenCalledWith({ rules: [], nextRuleId: 2 });
    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();
  });

  it("re-renders once the async rules load resolves, even if a render already happened with stale data", async () => {
    // Simulates picking a beneficiary right after a reload, before the
    // storage read for saved rules has finished.
    let resolveSnapshot;
    loadRulesSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();

    const initPromise = initContractRulesState();

    // Company already selected on the page before the snapshot resolves.
    refreshContractRulesPanel(document);
    expect(document.querySelector('[data-rule-id="1"]')).toBeNull();
    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();

    resolveSnapshot({
      rules: [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      nextRuleId: 2,
    });
    await initPromise;

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("recovers even if the panel is mid-remount exactly when the async load resolves", async () => {
    // Reproduces the confirmed real-world bug: the beneficiary gets selected
    // before the storage read finishes (stale empty-rules render), AND the
    // widget container happens to be torn down/recreated (contract_ui.js's
    // observer-driven removeIfPresent()/injectIfNeeded() cycle) at the exact
    // moment the load resolves, so that specific refresh attempt finds no
    // panel. The rule must still show up on the next natural refresh.
    let resolveSnapshot;
    loadRulesSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    const containerA = mountPanel();

    const initPromise = initContractRulesState();

    // Stale render while the load is still pending — memoizes an empty-rules key.
    refreshContractRulesPanel(document);
    expect(document.querySelector('[data-rule-id="1"]')).toBeNull();

    // Panel is torn down right as the snapshot resolves.
    containerA.remove();
    expect(document.querySelector("#scx-contract-rules-panel")).toBeNull();

    resolveSnapshot({
      rules: [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }],
      nextRuleId: 2,
    });
    await initPromise;

    // That specific attempt found no panel, so it silently no-op'd.
    expect(document.querySelector("#scx-contract-rules-panel")).toBeNull();

    // A later, unrelated observer tick recreates the panel and refreshes again.
    mountPanel();
    refreshContractRulesPanel(document);

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("saves the current amount as a new rule for the selected product+company", () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();

    expect(_testUtils.getRules()).toEqual([
      { id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 40425, discountPct: 0 },
    ]);
    expect(saveRulesSnapshot).toHaveBeenCalledWith({
      rules: [{ id: 1, productId: 9, productName: "Eggs", companyName: "Grupo Negreiros", amount: 40425, discountPct: 0 }],
      nextRuleId: 2,
    });
  });
});
