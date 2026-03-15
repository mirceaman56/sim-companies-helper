import { describe, expect, it } from "vitest";

import { _testUtils } from "../src/cashflow.js";

describe("computeSummary", () => {
  it("keeps research expenses in the research bucket", () => {
    const summary = _testUtils.computeSummary([
      { money: -1250, category: "r" },
      { money: -50, category: "other" },
    ]);

    expect(summary.expenseByType.r).toBe(1250);
    expect(summary.expenseByType.other).toBe(50);
  });
});
