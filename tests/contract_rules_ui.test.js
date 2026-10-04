// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/contract_rules_storage.js", () => ({
  loadRulesSnapshot: vi.fn(async () => null),
  saveRulesSnapshot: vi.fn(async () => ({ saved: true, synced: true })),
}));
let authListener = null;
vi.mock("../src/auth.js", () => ({
  onAuthDataApplied: vi.fn((listener) => {
    authListener = listener;
    return () => {};
  }),
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

// Saves and deletes wait for the stored rules before writing.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it("shows a passive hint when no beneficiary is selected", async () => {
    document.body.innerHTML = loadFixture("beneficiary-not-selected.html");
    mountPanel();

    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-empty")?.textContent).toBe(
      "contractRuleSelectCompanyHint",
    );
  });

  it("switches to the matching-rules list once a company is selected", async () => {
    _testUtils.setRules(
      [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
      2,
    );

    document.body.innerHTML = loadFixture("beneficiary-not-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);
    // Before a company is picked the rule is listed with its company, deletable but not applicable.
    expect(document.querySelector('[data-rule-id="1"] .scx-contract-rule-company')?.textContent).toBe(
      "Grupo Negreiros",
    );
    expect(document.querySelector('[data-rule-id="1"] [data-action="apply"]')).toBeNull();
    expect(document.querySelector('[data-rule-id="1"] [data-action="remove"]')).not.toBeNull();

    // Simulate the game's own UI replacing the beneficiary block after selection.
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("shows the save-current prompt when no rule matches the product+company", async () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();

    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();
    expect(document.querySelector("[data-rule-id]")).toBeNull();
  });

  it("applies a matching rule by filling amount and a freshly recalculated price", async () => {
    _testUtils.setRules(
      [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
      2,
    );
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector('[data-rule-id="1"] [data-action="apply"]').click();

    expect(document.querySelector('input[name="amount"]').value).toBe("5000");
    expect(document.querySelector('input[name="price"]').value).toBe("1.746");
  });

  it("removes a rule and persists the updated snapshot", async () => {
    _testUtils.setRules(
      [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
      2,
    );
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector('[data-rule-id="1"] [data-action="remove"]').click();
    await flush();

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
      rules: [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
      nextRuleId: 2,
    });
    await initPromise;

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("recovers even if the panel is mid-remount exactly when the async load resolves", async () => {
    // why: real bug — beneficiary picked before the read finishes while the widget is being
    // re-injected, so that refresh finds no panel. The rule must appear on the next refresh.
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
      rules: [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
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

  it("enables the save button once the amount is filled in after the company was picked", async () => {
    // The natural order of use: the beneficiary gets selected while the amount
    // field is still empty. The disabled state must not be memoized past the
    // moment the amount becomes valid, or the button stays dead forever.
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    const amountInput = document.querySelector('input[name="amount"]');
    amountInput.value = "";
    mountPanel();
    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn").disabled).toBe(true);

    amountInput.value = "5000";
    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn").disabled).toBe(false);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(_testUtils.getRules()).toEqual([
      {
        id: 1,
        productId: 9,
        companyName: "Grupo Negreiros",
        amount: 5000,
        priceMode: "percent",
        discountPct: 0,
        fixedPrice: null,
        note: "",
      },
    ]);
  });

  it("re-renders a freshly remounted panel even when nothing else changed", async () => {
    // contract_ui.js's removeIfPresent()/injectIfNeeded() cycle destroys the
    // panel and recreates it empty. The memo key is unchanged, so without
    // tracking the panel node itself the panel would stay blank.
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    const containerA = mountPanel();
    refreshContractRulesPanel(document);
    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();

    containerA.remove();
    mountPanel();
    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn")).not.toBeNull();
  });

  it("refuses to save a rule when the product id cannot be resolved", async () => {
    // hydrateRules() drops rules with a non-finite productId, so a rule saved
    // without one looks fine until the next reload and then silently vanishes.
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    const marketLink = document.querySelector('a[href*="market/resource"]');
    marketLink.setAttribute("href", "/market/resource/");
    mountPanel();
    refreshContractRulesPanel(document);

    const saveBtn = document.querySelector(".scx-contract-rules-save-btn");
    expect(saveBtn.disabled).toBe(true);

    saveBtn.click();
    await flush();

    expect(_testUtils.getRules()).toEqual([]);
    expect(saveRulesSnapshot).not.toHaveBeenCalled();
  });

  it("saves the current amount as a new rule for the selected product+company", async () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(_testUtils.getRules()).toEqual([
      {
        id: 1,
        productId: 9,
        companyName: "Grupo Negreiros",
        amount: 40425,
        priceMode: "percent",
        discountPct: 0,
        fixedPrice: null,
        note: "",
      },
    ]);
    expect(saveRulesSnapshot).toHaveBeenCalledWith({
      rules: [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 40425,
          priceMode: "percent",
          discountPct: 0,
          fixedPrice: null,
          note: "",
        },
      ],
      nextRuleId: 2,
    });
  });

  function mountWidgetControls(mode, fixedPrice = "") {
    const widget = document.createElement("div");
    widget.dataset.scxPriceMode = mode;
    widget.innerHTML = `<input id="scx-contract-fixed-price-input" value="${fixedPrice}" />`;
    document.body.appendChild(widget);
    mountContractRulesPanel(widget);
  }

  it("keeps the save button disabled in fixed mode until a price is typed", async () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountWidgetControls("fixed");
    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn").disabled).toBe(true);

    document.getElementById("scx-contract-fixed-price-input").value = "0.315";
    refreshContractRulesPanel(document);

    expect(document.querySelector(".scx-contract-rules-save-btn").disabled).toBe(false);
  });

  it("saves a fixed-price rule with the typed note", async () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountWidgetControls("fixed", "0.315");
    refreshContractRulesPanel(document);

    const noteInput = document.getElementById("scx-contract-rule-note-input");
    noteInput.value = "  100k daily ";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(_testUtils.getRules()).toEqual([
      {
        id: 1,
        productId: 9,
        companyName: "Grupo Negreiros",
        amount: 40425,
        priceMode: "fixed",
        discountPct: null,
        fixedPrice: 0.315,
        note: "100k daily",
      },
    ]);
    // The draft is cleared so it does not leak into the next rule.
    expect(document.getElementById("scx-contract-rule-note-input").value).toBe("");
  });

  it("applies a fixed-price rule without needing a market price", async () => {
    _testUtils.setRules(
      [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "fixed",
          discountPct: null,
          fixedPrice: 0.315,
          note: "",
        },
      ],
      2,
    );
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector('[data-action="apply"]').click();

    expect(document.querySelector('input[name="price"]').value).toBe("0.315");
    expect(document.querySelector('input[name="amount"]').value).toBe("5000");
  });

  it("offers another save below existing rules and stops at five per customer", async () => {
    const rule = (id) => ({
      id,
      productId: 9,
      companyName: "Grupo Negreiros",
      amount: 1000 * id,
      priceMode: "percent",
      discountPct: 0,
      fixedPrice: null,
      note: "",
    });
    _testUtils.setRules([1, 2, 3, 4].map(rule), 5);
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(_testUtils.getRules()).toHaveLength(5);
    expect(document.querySelector(".scx-contract-rules-save-btn")).toBeNull();
    expect(document.body.textContent).toContain("contractRuleLimitReached");
  });

  it("warns once a save could not reach cloud sync", async () => {
    saveRulesSnapshot.mockResolvedValueOnce({ saved: true, synced: false });
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();
    expect(document.querySelector(".scx-contract-rules-local-only")).not.toBeNull();
  });

  it("does not overwrite stored rules when the first load failed: it reloads before saving", async () => {
    const stored = {
      id: 1,
      productId: 9,
      companyName: "Grupo Negreiros",
      amount: 5000,
      priceMode: "percent",
      discountPct: 3,
      fixedPrice: null,
      note: "",
    };
    // First load: auth not ready yet.
    loadRulesSnapshot.mockRejectedValueOnce(new Error("no scope"));
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    await initContractRulesState();

    // Auth now available: the save loads the stored rules first and appends.
    loadRulesSnapshot.mockResolvedValueOnce({ rules: [stored], nextRuleId: 2, synced: true });
    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    const saved = saveRulesSnapshot.mock.calls.at(-1)[0];
    expect(saved.rules.map((r) => r.id)).toEqual([1, 2]);
    expect(saved.nextRuleId).toBe(3);
  });

  it("reloads the rules once auth data arrives after a failed first load", async () => {
    loadRulesSnapshot.mockRejectedValueOnce(new Error("no scope"));
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    await initContractRulesState();
    expect(document.querySelector("[data-rule-id]")).toBeNull();

    loadRulesSnapshot.mockResolvedValueOnce({
      rules: [
        {
          id: 1,
          productId: 9,
          companyName: "Grupo Negreiros",
          amount: 5000,
          priceMode: "percent",
          discountPct: 3,
          fixedPrice: null,
          note: "",
        },
      ],
      nextRuleId: 2,
      synced: true,
    });
    authListener();
    await flush();

    expect(document.querySelector('[data-rule-id="1"]')).not.toBeNull();
  });

  it("shows an error and keeps nothing in memory when the rules cannot be loaded at save time", async () => {
    loadRulesSnapshot.mockRejectedValue(new Error("no scope"));
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(_testUtils.getRules()).toEqual([]);
    expect(saveRulesSnapshot).not.toHaveBeenCalled();
    expect(document.querySelector(".scx-contract-rules-save-failed")).not.toBeNull();
    loadRulesSnapshot.mockReset();
    loadRulesSnapshot.mockImplementation(async () => null);
  });

  it("shows an error when the write itself fails", async () => {
    saveRulesSnapshot.mockResolvedValueOnce({ saved: false, synced: false });
    document.body.innerHTML = loadFixture("beneficiary-selected.html");
    mountPanel();
    refreshContractRulesPanel(document);

    document.querySelector(".scx-contract-rules-save-btn").click();
    await flush();

    expect(document.querySelector(".scx-contract-rules-save-failed")).not.toBeNull();
  });
});
