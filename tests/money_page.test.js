// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  findMoneyBalanceAnchor,
  findMoneyTextElement,
  parseMoneyText,
  readMoneyBalance,
  readMoneyNavbarContext,
} from "../src/page/money_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "money", name), "utf8");
}

describe("money_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the #money-balance anchor", () => {
    document.body.innerHTML = loadFixture("navbar.html");

    const anchor = findMoneyBalanceAnchor(document);
    expect(anchor?.id).toBe("money-balance");
  });

  it("falls back to the headquarters overview link", () => {
    document.body.innerHTML = loadFixture("fallback-navbar.html");

    const anchor = findMoneyBalanceAnchor(document);
    expect(anchor?.getAttribute("href")).toBe("/headquarters/overview/");
    expect(readMoneyBalance(document)).toBe(4_250_000);
  });

  it("reads the cash balance from the navbar", () => {
    document.body.innerHTML = loadFixture("navbar.html");

    expect(readMoneyBalance(document)).toBe(1_329_520);
  });

  it("returns a navbar context whose host is the cash link parent", () => {
    document.body.innerHTML = loadFixture("navbar.html");

    const context = readMoneyNavbarContext(document);
    expect(context.moneyAnchor.id).toBe("money-balance");
    expect(context.hostEl.dataset.testid).toBe("money-host");
  });

  it("finds the innermost element holding the cash amount", () => {
    document.body.innerHTML = loadFixture("navbar.html");
    expect(findMoneyTextElement(document)?.textContent).toBe("$1,329,520");

    document.body.innerHTML = loadFixture("fallback-navbar.html");
    expect(findMoneyTextElement(document)?.tagName).toBe("SPAN");
  });

  it("returns null / NaN when the cash link is missing", () => {
    document.body.innerHTML = "<div><a href='/levels/'>Lv. 2</a></div>";

    expect(readMoneyNavbarContext(document)).toBeNull();
    expect(findMoneyTextElement(document)).toBeNull();
    expect(readMoneyBalance(document)).toBeNaN();
  });

  it.each([
    ["$1,329,520", 1_329_520],
    ["$1.329.520", 1_329_520],
    ["$1 329 520", 1_329_520],
    ["$12,345.67", 12_345.67],
    ["$12.345,6", 12_345.6],
    ["-$5,000", -5_000],
    ["$950", 950],
    ["", NaN],
  ])("parses %s", (raw, expected) => {
    expect(parseMoneyText(raw)).toBe(expected);
  });
});
