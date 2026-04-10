// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { findXpLevelAnchor, readXpNavbarContext } from "../src/page/xp_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "xp", name), "utf8");
}

describe("xp_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds primary levels encyclopedia anchors", () => {
    document.body.innerHTML = loadFixture("navbar.html");

    const anchor = findXpLevelAnchor(document);
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute("href")).toContain("/encyclopedia/0/levels/");
  });

  it("falls back to generic /levels/ links when needed", () => {
    document.body.innerHTML = loadFixture("fallback-navbar.html");

    const anchor = findXpLevelAnchor(document);
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute("href")).toBe("/levels/");
  });

  it("returns a stable navbar context for widget injection", () => {
    document.body.innerHTML = loadFixture("navbar.html");

    const context = readXpNavbarContext(document);
    expect(context).not.toBeNull();
    expect(context.levelAnchor.getAttribute("href")).toContain("/levels/");
    expect(context.hostEl.dataset.testid).toBe("levels-host");
  });
});
