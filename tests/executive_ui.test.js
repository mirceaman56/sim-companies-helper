// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSectionContentMock } = vi.hoisted(() => ({
  getSectionContentMock: vi.fn(() => null),
}));

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/sidebar.js", () => ({
  getSectionContent: (...args) => getSectionContentMock(...args),
}));

import { _testUtils, updateExecutivePanel } from "../src/executive_ui.js";

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

describe("executive panel refresh", () => {
  beforeEach(() => {
    getSectionContentMock.mockReset();
    document.body.innerHTML = `
      <table><tbody>
        <tr><td>Management</td><td><span>4</span></td></tr>
        <tr><td>Accounting</td><td><span>2</span></td></tr>
        <tr><td>Communication</td><td><span>6</span></td></tr>
        <tr><td>Science</td><td><span>1</span></td></tr>
      </tbody></table>
    `;
  });

  it("renders refresh button and re-runs panel update on click", () => {
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    updateExecutivePanel();
    const button = content.querySelector("#scx-executive-refresh-btn");
    const copyButton = content.querySelector('.scx-copy-btn[data-copy-action="executive"]');
    expect(button).not.toBeNull();
    expect(copyButton).not.toBeNull();

    const callCountBefore = getSectionContentMock.mock.calls.length;
    button.click();
    expect(getSectionContentMock.mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});
