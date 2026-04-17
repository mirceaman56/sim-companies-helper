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

  it("renders HR feedback on staff candidate pages", () => {
    document.body.innerHTML = `
      <div class="css-1r0yqr6">
        <table class="css-1vnhof9"><tbody><tr><td>Expected salary</td><td>$1,247</td></tr></tbody></table>
        <table class="css-1fs1e4u"><tbody></tbody></table>
        <div><b>HR assessment of the candidate:</b></div>
        <div class="css-sffzb7"></div>
        Sandra told me she can smell my aura.
      </div>
    `;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/g1/");

    updateExecutivePanel();

    expect(content.textContent).toContain("Sandra told me she can smell my aura.");
    expect(content.textContent).not.toContain("navigateToExecutives");
  });

  it("renders HR feedback on grouped executive pages when feedback exists", () => {
    document.body.innerHTML = `
      <div class="css-1r0yqr6">
        <table class="css-1vnhof9"><tbody><tr><td>Expected salary</td><td>$1,247</td></tr></tbody></table>
        <table class="css-1fs1e4u"><tbody></tbody></table>
        <div><b>HR assessment of the candidate:</b></div>
        <div class="css-sffzb7"></div>
        Sandra told me she can smell my aura.
      </div>
    `;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/g12/");

    updateExecutivePanel();

    expect(content.textContent).toContain("Sandra told me she can smell my aura.");
    expect(content.textContent).not.toContain("navigateToExecutives");
  });

  it("refreshes training breakdown after delayed training rows load", async () => {
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/cfo/");

    updateExecutivePanel();
    let trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(trainingValues).toEqual(["0", "0", "0", "0"]);

    const delayedTraining = document.createElement("div");
    delayedTraining.textContent = "Accounting +1 Science +1";
    document.body.appendChild(delayedTraining);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(trainingValues).toEqual(["0", "1", "0", "1"]);
  });

  it.each(["/headquarters/executives/g1/", "/headquarters/executives/g12/"])(
    "renders training breakdown on executive group paths: %s",
    (path) => {
      document.body.innerHTML = `
        <table><tbody>
          <tr><td>Management</td><td><span>0</span></td></tr>
          <tr><td>Accounting</td><td><span>1</span></td></tr>
          <tr><td>Communication</td><td><span>1</span></td></tr>
          <tr><td>Science</td><td><span>4</span></td></tr>
        </tbody></table>
        <div class="pull-right text-right">
          <div>Science +1</div>
        </div>
      `;

      const content = document.createElement("div");
      getSectionContentMock.mockReturnValue(content);
      window.history.pushState({}, "", path);

      updateExecutivePanel();

      const trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
        el.textContent.trim(),
      );
      expect(trainingValues).toEqual(["0", "0", "0", "1"]);
    },
  );

  it("refreshes training breakdown after delayed training rows load on candidate paths", async () => {
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/g1/");

    updateExecutivePanel();
    let trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(trainingValues).toEqual(["0", "0", "0", "0"]);

    const delayedTraining = document.createElement("div");
    delayedTraining.className = "pull-right text-right";
    delayedTraining.innerHTML = "<div>Science +1</div>";
    document.body.appendChild(delayedTraining);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(trainingValues).toEqual(["0", "0", "0", "1"]);
  });
});

describe("HR blurp matching", () => {
  it("matches 'Sandra told me she can smell my aura.' to blurp 84", () => {
    const feedbackText = "Sandra told me she can smell my aura.";
    const match = _testUtils.findBestMatchingEntry(feedbackText);
    expect(match).not.toBeNull();
    expect(match.id).toBe(84);
  });

  it("returns null when similarity is below threshold", () => {
    const feedbackText = "completely unrelated feedback about something else entirely";
    const match = _testUtils.findBestMatchingEntry(feedbackText);
    expect(match).toBeNull();
  });

  it("matches with exact original feedback string", () => {
    const feedbackText = "<Name> told me he/she can smell my aura.";
    const match = _testUtils.findBestMatchingEntry(feedbackText);
    expect(match).not.toBeNull();
    expect(match.id).toBe(84);
  });
});
