// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getExecutivePageKind,
  isExecutivePath,
  readExecutiveHRFeedback,
} from "../src/page/executive_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "executive", name), "utf8");
}

describe("executive_page readers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("classifies executive page kinds from paths", () => {
    expect(isExecutivePath("/headquarters/executives/coo/")).toBe(true);
    expect(isExecutivePath("/headquarters/executives/cfo-apprentice/")).toBe(true);
    expect(isExecutivePath("/headquarters/executives/g4/")).toBe(true);
    expect(isExecutivePath("/headquarters/executives/ceo/")).toBe(false);

    expect(getExecutivePageKind("/headquarters/executives/coo/")).toBe("role");
    expect(getExecutivePageKind("/headquarters/executives/cmo-apprentice/")).toBe("apprentice");
    expect(getExecutivePageKind("/headquarters/executives/g1/")).toBe("candidate");
    expect(getExecutivePageKind("/headquarters/executives/g12/")).toBe("group");
    expect(getExecutivePageKind("/headquarters/overview/")).toBe("none");
  });

  it("extracts HR feedback from structural container pattern", () => {
    document.body.innerHTML = loadFixture("role-page.html");

    const feedback = readExecutiveHRFeedback(document);
    expect(feedback).toContain("initiative");
    expect(feedback.length).toBeGreaterThan(20);
  });

  it("extracts HR feedback from fallback fixture shape", () => {
    document.body.innerHTML = loadFixture("fallback-page.html");

    const feedback = readExecutiveHRFeedback(document);
    expect(feedback).toContain("delegation");
    expect(feedback.length).toBeGreaterThan(20);
  });
});
