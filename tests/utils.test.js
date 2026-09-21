// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard, formatDiscountPct, normalizeDiscountPct, parseLocaleNumber } from "../src/utils.js";

describe("parseLocaleNumber", () => {
  it("uses dot decimal by default", () => {
    window.history.pushState({}, "", "/");
    expect(parseLocaleNumber("1,234")).toBe(1234);
    expect(parseLocaleNumber("0.297")).toBe(0.297);
  });

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
    // Comma without locale hint defaults to thousands (e.g. EN)
    ["1,5", 15],
    ["10,75", 1075],
  ])("parses %s", (raw, expected) => {
    window.history.pushState({}, "", "/");
    expect(parseLocaleNumber(raw)).toBe(expected);
  });

  it("treats comma as decimal for comma-locales", () => {
    window.history.pushState({}, "", "/de/market/resource/1");
    expect(parseLocaleNumber("0,297")).toBe(0.297);
    expect(parseLocaleNumber("1,234")).toBe(1.234);
    expect(parseLocaleNumber("1.234")).toBe(1234);
    expect(parseLocaleNumber("8.44")).toBe(8.44);
  });
});

describe("copyToClipboard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("restores svg content after temporary copied feedback", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    const button = document.createElement("button");
    button.innerHTML = "<svg><path d='M0 0'></path></svg>";

    await copyToClipboard("hello", button);
    expect(button.textContent).toBe("✓ Copied!");

    vi.advanceTimersByTime(1500);
    expect(button.querySelector("svg")).not.toBeNull();
  });
});

describe("normalizeDiscountPct", () => {
  it.each([
    [0, 0],
    [10, 10],
    [2.5, 2.5],
    ["7.5", 7.5],
    ["7,5", 7.5],
    // Clamped to the allowed range
    [-5, 0],
    [250, 100],
    // Float noise from repeated 0.5 steps is rounded away
    [2.5000000000000004, 2.5],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeDiscountPct(raw)).toBe(expected);
  });

  it.each([[""], [null], [undefined], ["abc"], [NaN]])("rejects %s", (raw) => {
    expect(normalizeDiscountPct(raw)).toBeNull();
  });
});

describe("formatDiscountPct", () => {
  it.each([
    [0, "+0%"],
    [3, "-3%"],
    [2.5, "-2.5%"],
    [12.25, "-12.25%"],
  ])("formats %s", (pct, expected) => {
    expect(formatDiscountPct(pct)).toBe(expected);
  });
});
