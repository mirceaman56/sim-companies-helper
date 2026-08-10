// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  appendRule,
  canAddRule,
  createRule,
  findRuleById,
  findRulesForProductAndCompany,
  hydrateRules,
  isValidRuleInput,
  removeRuleState,
  resolveNextRuleId,
  serializeRules,
} from "../src/contract_rules_state.js";

describe("contract_rules_state", () => {
  it("createRule builds the expected shape", () => {
    const rule = createRule({
      id: 1,
      productId: 9,
      productName: "Steel",
      companyName: "Grupo Negreiros",
      amount: 5000,
      discountPct: 3,
    });

    expect(rule).toEqual({
      id: 1,
      productId: 9,
      productName: "Steel",
      companyName: "Grupo Negreiros",
      amount: 5000,
      discountPct: 3,
    });
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
    const rule = createRule({ id: 1, productId: 9, productName: "Steel", companyName: "A", amount: 1, discountPct: 0 });
    const after = appendRule(before, rule);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });

  it("filters rules by exact product id + company name match", () => {
    const rules = [
      createRule({ id: 1, productId: 9, productName: "Steel", companyName: "Grupo Negreiros", amount: 5000, discountPct: 3 }),
      createRule({ id: 2, productId: 9, productName: "Steel", companyName: "LR reis Ltd", amount: 2000, discountPct: 5 }),
      createRule({ id: 3, productId: 4, productName: "Iron", companyName: "Grupo Negreiros", amount: 1000, discountPct: 2 }),
    ];

    expect(findRulesForProductAndCompany(rules, 9, "Grupo Negreiros")).toEqual([rules[0]]);
    // Case-sensitive exact match only — a near-miss on casing intentionally does not match.
    expect(findRulesForProductAndCompany(rules, 9, "grupo negreiros")).toEqual([]);
    expect(findRulesForProductAndCompany(rules, 9, null)).toEqual([]);
    expect(findRulesForProductAndCompany(rules, null, "Grupo Negreiros")).toEqual([]);
  });

  it("serializes and hydrates rules, dropping malformed entries", () => {
    const rules = [createRule({ id: 1, productId: 9, productName: "Steel", companyName: "A", amount: 5000, discountPct: 3 })];
    const serialized = serializeRules(rules);
    expect(serialized).toEqual(rules);

    const hydrated = hydrateRules([...serialized, { id: 2, productId: 9, companyName: "B" /* missing amount */ }]);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toEqual(rules[0]);
  });

  it("resolves next id from provided value or max id fallback", () => {
    expect(resolveNextRuleId([], 5)).toBe(5);
    expect(resolveNextRuleId([{ id: 3 }, { id: 9 }], undefined)).toBe(10);
    expect(resolveNextRuleId([], null)).toBe(1);
  });
});
