import { describe, expect, it } from "vitest";

import { parseLocaleNumber } from "../src/utils.js";

describe("parseLocaleNumber", () => {
  it.each([
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1.234,567", 1234.567],
    ["12.345", 12.345],
    ["$1.234,567", 1234.567],
  ])("parses %s", (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });
});
