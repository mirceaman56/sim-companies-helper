// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  _testUtils,
  isRecipeResourcePath,
  readRecipeMaterials,
  readRecipeName,
  readRecipePage,
  readRecipeResourceId,
} from "../src/page/recipe_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "recipe", name), "utf8");
}

describe("recipe_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/");
  });

  it("detects supported encyclopedia resource paths", () => {
    expect(isRecipeResourcePath("/encyclopedia/0/resource/144/")).toBe(true);
    expect(isRecipeResourcePath("/encyclopedia/0/resource/144")).toBe(true);
    expect(isRecipeResourcePath("/headquarters/")).toBe(false);
  });

  it("reads recipe resource id from pathname", () => {
    expect(readRecipeResourceId("/encyclopedia/0/resource/144/")).toBe(144);
    expect(readRecipeResourceId("/encyclopedia/0/resource/777")).toBe(777);
    expect(readRecipeResourceId("/encyclopedia/0/levels/")).toBeNull();
  });

  it("reads recipe name from primary card shape", () => {
    document.body.innerHTML = loadFixture("resource-page.html");
    expect(readRecipeName(document)).toBe("Seeds");
  });

  it("falls back to secondary div for recipe name", () => {
    document.body.innerHTML = loadFixture("fallback-page.html");
    expect(readRecipeName(document)).toBe("Rocket Fuel");
  });

  it("reads and deduplicates materials", () => {
    document.body.innerHTML = loadFixture("resource-page.html");

    expect(readRecipeMaterials(document)).toEqual([
      { id: 5, quantity: 3 },
      { id: 7, quantity: 0.5 },
    ]);
  });

  it("builds a full recipe object from page + path", () => {
    document.body.innerHTML = loadFixture("fallback-page.html");
    window.history.pushState({}, "", "/encyclopedia/0/resource/301/");

    expect(readRecipePage(document, window.location.pathname)).toEqual({
      id: 301,
      name: "Rocket Fuel",
      materials: [{ id: 8, quantity: 0.1 }],
    });
  });

  it("parses numeric and fractional quantities", () => {
    expect(_testUtils.parseQty("3x")).toBe(3);
    expect(_testUtils.parseQty("1/2x")).toBe(0.5);
    expect(_testUtils.parseQty("0.1x")).toBe(0.1);
    expect(_testUtils.parseQty("bad")).toBeNull();
  });
});
