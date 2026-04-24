// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSectionContentMock } = vi.hoisted(() => ({
  getSectionContentMock: vi.fn(() => null),
}));

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/sidebar.js", () => ({
  getSectionContent: (...args) => getSectionContentMock(...args),
}));
vi.mock("../src/auth.js", () => ({
  loadAuthDataOnce: vi.fn(() => Promise.resolve()),
}));

const mockExecutivesState = vi.hoisted(() => ({
  items: [],
  loaded: true,
  loading: false,
  error: null,
  lastRefreshAt: Date.now(),
}));

const mockDetailData = vi.hoisted(() => ({ value: null }));

vi.mock("../src/executives.js", () => ({
  loadExecutivesOnce: vi.fn(() => Promise.resolve()),
  loadExecutiveDetail: vi.fn(() => Promise.resolve()),
  getExecutiveDetail: vi.fn(() => mockDetailData.value),
  computeTrainingBreakdown: vi.fn((trainings) => {
    if (!Array.isArray(trainings) || trainings.length === 0) return { coo: 0, cfo: 0, cmo: 0, cto: 0 };
    return trainings.reduce(
      (acc, tr) => {
        const s = tr.skills || {};
        return { coo: acc.coo + (s.coo || 0), cfo: acc.cfo + (s.cfo || 0), cmo: acc.cmo + (s.cmo || 0), cto: acc.cto + (s.cto || 0) };
      },
      { coo: 0, cfo: 0, cmo: 0, cto: 0 },
    );
  }),
  findExecutiveByPosition: vi.fn((positionCode) =>
    mockExecutivesState.items.find((ex) => ex.currentWorkHistory?.position === positionCode) ?? null,
  ),
  apiSkillsToInternal: vi.fn((apiSkills) => ({
    mgmt: apiSkills?.coo ?? 0,
    acct: apiSkills?.cfo ?? 0,
    comm: apiSkills?.cmo ?? 0,
    tech: apiSkills?.cto ?? 0,
  })),
  getTrainingSkillKey: vi.fn((code) => ({ o: "mgmt", f: "acct", m: "comm", t: "tech" }[code] ?? null)),
  ROLE_POSITION_MAP: { coo: "o", cfo: "f", cmo: "m", cto: "t" },
}));

import { _testUtils, updateExecutivePanel } from "../src/executive_ui.js";

function makeExecutive(position, skills, currentTraining = null) {
  return {
    id: 1,
    name: "Test Executive",
    skills,
    currentWorkHistory: { position },
    currentTraining,
  };
}

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
    mockExecutivesState.items = [];
    mockDetailData.value = null;
    document.body.innerHTML = "";
  });

  it("renders refresh button and re-runs panel update on click", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 4, cfo: 2, cmo: 6, cto: 1 }),
    ];
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();
    const button = content.querySelector("#scx-executive-refresh-btn");
    const copyButton = content.querySelector('.scx-copy-btn[data-copy-action="executive"]');
    expect(button).not.toBeNull();
    expect(copyButton).not.toBeNull();

    const callCountBefore = getSectionContentMock.mock.calls.length;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSectionContentMock.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it("renders skills from API data", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 27, cfo: 2, cmo: 4, cto: 7 }),
    ];
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    const totalValues = [...content.querySelectorAll(".scx-skill-breakdown-total-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(totalValues).toEqual(["27", "2", "4", "7"]);
  });

  it("renders 'currently training' indicator when executive has active training", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 5, cfo: 2, cmo: 3, cto: 4 }, { training: "t" }),
    ];
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    const indicator = content.querySelector(".scx-skill-breakdown-training-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain("tech");
  });

  it("does not render training indicator when no active training", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 5, cfo: 2, cmo: 3, cto: 4 }, null),
    ];
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    const indicator = content.querySelector(".scx-skill-breakdown-training-indicator");
    expect(indicator).toBeNull();
  });

  it("renders organic and training columns when detail data is available", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 10, cfo: 3, cmo: 5, cto: 2 }),
    ];
    mockDetailData.value = {
      trainings: [
        { skills: { coo: 3, cfo: 1, cmo: 2, cto: 0 } },
        { skills: { coo: 2, cfo: 0, cmo: 1, cto: 1 } },
      ],
    };
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    // Training sum: coo=5, cfo=1, cmo=3, cto=1
    // Organic: coo=10-5=5, cfo=3-1=2, cmo=5-3=2, cto=2-1=1
    const organicValues = [...content.querySelectorAll(".scx-skill-breakdown-organic-value")].map((el) =>
      el.textContent.trim(),
    );
    const trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(organicValues).toEqual(["5", "2", "2", "1"]);
    expect(trainingValues).toEqual(["5", "1", "3", "1"]);
  });

  it("does not render organic/training columns when no detail data", async () => {
    mockExecutivesState.items = [
      makeExecutive("o", { coo: 5, cfo: 2, cmo: 3, cto: 4 }, null),
    ];
    mockDetailData.value = null;
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    expect(content.querySelector(".scx-skill-breakdown-organic-value")).toBeNull();
    expect(content.querySelector(".scx-skill-breakdown-training-value")).toBeNull();
  });

  it("renders HR feedback on staff candidate pages", async () => {
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

    await updateExecutivePanel();

    expect(content.textContent).toContain("Sandra told me she can smell my aura.");
    expect(content.textContent).not.toContain("navigateToExecutives");
  });

  it("renders HR feedback on grouped executive pages when feedback exists", async () => {
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

    await updateExecutivePanel();

    expect(content.textContent).toContain("Sandra told me she can smell my aura.");
    expect(content.textContent).not.toContain("navigateToExecutives");
  });

  it("shows navigation message when not on an executive page and no API data matches", async () => {
    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/overview/");

    await updateExecutivePanel();

    expect(content.textContent).toContain("navigateToExecutives");
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
