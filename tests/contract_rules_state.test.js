// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  appendRule,
  canAddRule,
  canAddRuleForCustomer,
  createRule,
  findRuleById,
  findRulesForProductAndCompany,
  hydrateRules,
  isValidRuleInput,
  normalizeFixedPrice,
  normalizeNote,
  removeRuleState,
  resolveNextRuleId,
  serializeRules,
} from "../src/contract_rules_state.js";

describe("contract_rules_state", () => {
  it("createRule builds the expected shape", () => {
    const rule = createRule({
      id: 1,
      productId: 9,
      companyName: "Grupo Negreiros",
      amount: 5000,
      discountPct: 3,
    });

    expect(rule).toEqual({
      id: 1,
      productId: 9,
      companyName: "Grupo Negreiros",
      amount: 5000,
      priceMode: "percent",
      discountPct: 3,
      fixedPrice: null,
      note: "",
    });
  });

  it("createRule keeps only the price field that matches the mode", () => {
    const rule = createRule({
      id: 2,
      productId: 9,
      companyName: "Grupo Negreiros",
      amount: 25000,
      priceMode: "fixed",
      discountPct: 3,
      fixedPrice: 0.315,
      note: "100k daily",
    });

    expect(rule).toMatchObject({
      priceMode: "fixed",
      discountPct: null,
      fixedPrice: 0.315,
      note: "100k daily",
    });
  });

  it("validates fixed-price rules on the price instead of the discount", () => {
    expect(isValidRuleInput({ amount: 100, priceMode: "fixed", fixedPrice: 0.315 })).toBe(true);
    expect(isValidRuleInput({ amount: 100, priceMode: "fixed", fixedPrice: 0 })).toBe(false);
    expect(isValidRuleInput({ amount: 100, priceMode: "fixed", fixedPrice: null, discountPct: 3 })).toBe(
      false,
    );
    expect(isValidRuleInput({ amount: 0, priceMode: "fixed", fixedPrice: 0.315 })).toBe(false);
  });

  it("normalizes fixed prices and notes", () => {
    expect(normalizeFixedPrice("0,3154")).toBe(0.315);
    expect(normalizeFixedPrice("12.5")).toBe(12.5);
    expect(normalizeFixedPrice("")).toBeNull();
    expect(normalizeFixedPrice("-1")).toBeNull();
    expect(normalizeFixedPrice("0.0001")).toBeNull();

    expect(normalizeNote("  100k   daily ", 40)).toBe("100k daily");
    expect(normalizeNote("abcdef", 3)).toBe("abc");
    expect(normalizeNote(undefined, 40)).toBe("");
  });

  it("caps rules per product + company", () => {
    const rules = [1, 2, 3, 4, 5].map((id) =>
      createRule({ id, productId: 9, companyName: "Grupo Negreiros", amount: 100, discountPct: 0 }),
    );

    expect(canAddRuleForCustomer(rules, 9, "Grupo Negreiros", 5)).toBe(false);
    expect(canAddRuleForCustomer(rules, 9, "LR reis Ltd", 5)).toBe(true);
    expect(canAddRuleForCustomer(rules, 4, "Grupo Negreiros", 5)).toBe(true);
  });

  it("validates rule input boundaries", () => {
    expect(isValidRuleInput({ amount: 5000, discountPct: 3 })).toBe(true);
    expect(isValidRuleInput({ amount: 0, discountPct: 3 })).toBe(false);
    expect(isValidRuleInput({ amount: -1, discountPct: 3 })).toBe(false);
    expect(isValidRuleInput({ amount: Number.NaN, discountPct: 3 })).toBe(false);
    expect(isValidRuleInput({ amount: 5000, discountPct: -1 })).toBe(false);
    expect(isValidRuleInput({ amount: 5000, discountPct: 101 })).toBe(false);
    expect(isValidRuleInput({ amount: 5000, discountPct: 0 })).toBe(true);
    expect(isValidRuleInput({ amount: 5000, discountPct: 100 })).toBe(true);
  });

  it("enforces max count through canAddRule", () => {
    expect(canAddRule([], 2)).toBe(true);
    expect(canAddRule([{ id: 1 }, { id: 2 }], 2)).toBe(false);
  });

  it("finds and removes rules by id", () => {
    const rules = [{ id: 1 }, { id: 2 }];
    expect(findRuleById(rules, 2)).toEqual({ id: 2 });
    expect(removeRuleState(rules, 1)).toEqual([{ id: 2 }]);
  });

  it("appends a rule immutably", () => {
    const before = [];
    const rule = createRule({ id: 1, productId: 9, companyName: "A", amount: 1, discountPct: 0 });
    const after = appendRule(before, rule);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });

  it("filters rules by exact product id + company name match", () => {
    const rules = [
      createRule({ id: 1, productId: 9, companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }),
      createRule({ id: 2, productId: 9, companyName: "LR reis Ltd", amount: 2000, discountPct: 5 }),
      createRule({ id: 3, productId: 4, companyName: "Grupo Negreiros", amount: 1000, discountPct: 2 }),
    ];

    expect(findRulesForProductAndCompany(rules, 9, "Grupo Negreiros")).toEqual([rules[0]]);
    // Case-sensitive exact match only — a near-miss on casing intentionally does not match.
    expect(findRulesForProductAndCompany(rules, 9, "grupo negreiros")).toEqual([]);
    expect(findRulesForProductAndCompany(rules, 9, null)).toEqual([]);
    expect(findRulesForProductAndCompany(rules, null, "Grupo Negreiros")).toEqual([]);
  });

  it("serializes to the compact shape and hydrates it back, dropping malformed entries", () => {
    const rules = [
      createRule({ id: 1, productId: 9, companyName: "A", amount: 5000, discountPct: 3 }),
      createRule({
        id: 2,
        productId: 9,
        companyName: "A",
        amount: 100,
        priceMode: "fixed",
        fixedPrice: 0.315,
        note: "x",
      }),
    ];
    const serialized = serializeRules(rules);
    expect(serialized).toEqual([
      { i: 1, p: 9, c: "A", a: 5000, m: "p", v: 3 },
      { i: 2, p: 9, c: "A", a: 100, m: "f", v: 0.315, n: "x" },
    ]);

    const hydrated = hydrateRules([...serialized, { i: 3, p: 9, c: "B" /* missing amount */ }]);
    expect(hydrated).toEqual(rules);
  });

  it("hydrates legacy v1 rules as percent rules", () => {
    const hydrated = hydrateRules([
      { id: 1, productId: 9, companyName: "A", amount: 5000, discountPct: 3 },
      { id: 2, productId: 9, companyName: "B" /* missing amount */ },
    ]);

    expect(hydrated).toEqual([
      createRule({ id: 1, productId: 9, companyName: "A", amount: 5000, discountPct: 3 }),
    ]);
  });

  it("resolves next id from provided value or max id fallback", () => {
    expect(resolveNextRuleId([], 5)).toBe(5);
    expect(resolveNextRuleId([{ id: 3 }, { id: 9 }], undefined)).toBe(10);
    expect(resolveNextRuleId([], null)).toBe(1);
  });
});
