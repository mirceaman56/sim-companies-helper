// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (k) => k }));
vi.mock("../src/sidebar.js", () => ({ getSectionContent: () => null }));

import { _testUtils } from "../src/executive_ui.js";

describe("executive route matching", () => {
  it.each([
    "/headquarters/executives/coo/",
    "/headquarters/executives/cfo/",
    "/headquarters/executives/cto/",
    "/headquarters/executives/cmo/",
    "/headquarters/executives/coo-apprentice/",
    "/headquarters/executives/cfo-apprentice/",
    "/headquarters/executives/cto-apprentice/",
    "/headquarters/executives/cmo-apprentice/",
    "/headquarters/executives/g1/",
    "/headquarters/executives/g12/",
    "/headquarters/executives/coo",
    "/headquarters/executives/cto-apprentice",
  ])("matches executive path: %s", (path) => {
    expect(_testUtils.isExecutivePath(path)).toBe(true);
  });

  it.each([
    "/headquarters/executives/ceo/",
    "/headquarters/executives/coo-apprenticex/",
    "/headquarters/executives/g/",
    "/headquarters/executives/",
    "/headquarters/overview/",
    "/",
  ])("rejects non-executive path: %s", (path) => {
    expect(_testUtils.isExecutivePath(path)).toBe(false);
  });
});
