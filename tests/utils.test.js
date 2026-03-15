import { describe, expect, it } from "vitest";

import { parseLocaleNumber } from "../src/utils.js";

describe("parseLocaleNumber", () => {
  it.each([
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1.234,567", 1234.567],
    ["12.345", 12.345],
    ["$1.234,567", 1234.567],
    // Thousands-only (no decimal) — comma is thousands separator
    ["2,880", 2880],
    ["$2,880", 2880],
    ["1,000", 1000],
    // Small DE decimals — comma is decimal separator
    ["1,5", 1.5],
    ["10,75", 10.75],
  ])("parses %s", (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });
});
