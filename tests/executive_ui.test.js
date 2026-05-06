// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSectionContentMock, requestMock } = vi.hoisted(() => ({
  getSectionContentMock: vi.fn(() => null),
  requestMock: vi.fn(),
}));

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
vi.mock("../src/sidebar.js", () => ({
  getSectionContent: (...args) => getSectionContentMock(...args),
  setSectionToggleFn: vi.fn(),
}));
vi.mock("../src/auth.js", () => ({
  loadAuthDataOnce: vi.fn(() => Promise.resolve()),
}));
vi.mock("../src/data/apiClient.js", () => ({
  request: requestMock,
}));
vi.mock("../src/state.js", () => {
  const STATE = {
    auth: { companyId: 12345, realmId: 0, loaded: true, loading: false, error: null },
    executives: {
      loaded: false,
      loading: false,
      error: null,
      items: [],
      lastRefreshAt: 0,
      details: {},
    },
  };
  return { STATE };
});

import { STATE } from "../src/state.js";
import { _testUtils, updateExecutivePanel } from "../src/executive_ui.js";

function makeExecutive({ id, name, position, skills, currentTraining = null }) {
  return {
    id,
    name,
    skills,
    currentWorkHistory: { position },
    currentTraining,
  };
}

function setFreshExecutives(items, details = {}) {
  STATE.executives.items = items;
  STATE.executives.details = details;
  STATE.executives.loaded = true;
  STATE.executives.loading = false;
  STATE.executives.error = null;
  STATE.executives.lastRefreshAt = Date.now();
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
    vi.useRealTimers();
    getSectionContentMock.mockReset();
    requestMock.mockReset();
    STATE.executives.loaded = false;
    STATE.executives.loading = false;
    STATE.executives.error = null;
    STATE.executives.items = [];
    STATE.executives.lastRefreshAt = 0;
    STATE.executives.details = {};
    document.body.innerHTML = "";
  });

  it("renders refresh button and re-runs panel update on click", async () => {
    setFreshExecutives([
      makeExecutive({
        id: 1,
        name: "Main COO",
        position: "o",
        skills: { coo: 4, cfo: 2, cmo: 6, cto: 1 },
      }),
    ]);
    document.body.innerHTML = `<div id="page"><h1>Main COO</h1><div>COO</div></div>`;

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

  it("renders the organic growth block on non-executive pages and keeps the navigation note", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T13:00:00.000Z"));
    requestMock.mockResolvedValue({
      executives: [
        makeExecutive({
          id: 1,
          name: "Amy White",
          position: "o",
          skills: { coo: 4, cfo: 2, cmo: 1, cto: 3 },
        }),
        makeExecutive({
          id: 2,
          name: "Zhi Maruyama",
          position: "f",
          skills: { coo: 1, cfo: 4, cmo: 2, cto: 3 },
          currentTraining: { datetime: "2026-05-06T07:56:14.635445+00:00", training: "o" },
        }),
      ],
    });

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/overview/");

    await updateExecutivePanel();

    expect(requestMock.mock.calls.map(([key]) => key)).toEqual(["executives"]);
    expect(content.textContent).toContain("executiveOrganicGrowth");
    expect(content.textContent).toContain("Amy White");
    expect(content.textContent).not.toContain("Zhi Maruyama");
    expect(content.textContent).toContain("navigateToExecutives");
    expect(content.querySelector("[data-growth-countdown]").textContent).toBe("01:00:00");
  });

  it("renders apprentice skills from the matched DOM executive, not the main COO", async () => {
    setFreshExecutives([
      makeExecutive({
        id: 1,
        name: "Main COO",
        position: "o",
        skills: { coo: 27, cfo: 2, cmo: 4, cto: 7 },
      }),
      makeExecutive({
        id: 2,
        name: "Daniel Phillips",
        position: "v",
        skills: { coo: 14, cfo: 4, cmo: 5, cto: 4 },
      }),
    ]);
    document.body.innerHTML = `<div id="page"><h1>Daniel Phillips</h1><div>COO APPRENTICE</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo-apprentice/");

    await updateExecutivePanel();

    const totalValues = [...content.querySelectorAll(".scx-skill-breakdown-total-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(totalValues).toEqual(["14", "4", "5", "4"]);
  });

  it("renders 'currently training' indicator when executive has active training", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T13:00:00.000Z"));
    setFreshExecutives([
      makeExecutive({
        id: 1,
        name: "Main COO",
        position: "o",
        skills: { coo: 5, cfo: 2, cmo: 3, cto: 4 },
        currentTraining: { training: "t" },
      }),
    ]);
    document.body.innerHTML = `<div id="page"><h1>Main COO</h1><div>COO</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    expect(content.textContent).toContain("executiveOrganicGrowth");
    const indicator = content.querySelector(".scx-skill-breakdown-training-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain("tech");
  });

  it("does not render training indicator when no active training", async () => {
    setFreshExecutives([
      makeExecutive({
        id: 1,
        name: "Main COO",
        position: "o",
        skills: { coo: 5, cfo: 2, cmo: 3, cto: 4 },
      }),
    ]);
    document.body.innerHTML = `<div id="page"><h1>Main COO</h1><div>COO</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    const indicator = content.querySelector(".scx-skill-breakdown-training-indicator");
    expect(indicator).toBeNull();
  });

  it("renders organic and training columns when detail data is available", async () => {
    setFreshExecutives(
      [
        makeExecutive({
          id: 1,
          name: "Main COO",
          position: "o",
          skills: { coo: 10, cfo: 3, cmo: 5, cto: 2 },
        }),
      ],
      {
        1: {
          loaded: true,
          loading: false,
          error: null,
          data: {
            trainings: [
              { skills: { coo: 3, cfo: 1, cmo: 2, cto: 0 } },
              { skills: { coo: 2, cfo: 0, cmo: 1, cto: 1 } },
            ],
          },
          lastRefreshAt: Date.now(),
        },
      },
    );
    document.body.innerHTML = `<div id="page"><h1>Main COO</h1><div>COO</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/coo/");

    await updateExecutivePanel();

    const organicValues = [...content.querySelectorAll(".scx-skill-breakdown-organic-value")].map((el) =>
      el.textContent.trim(),
    );
    const trainingValues = [...content.querySelectorAll(".scx-skill-breakdown-training-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(organicValues).toEqual(["5", "2", "2", "1"]);
    expect(trainingValues).toEqual(["5", "1", "3", "1"]);
  });

  it("does not render wrong skills on staff pages when no safe match exists", async () => {
    setFreshExecutives([
      makeExecutive({
        id: 12,
        name: "Staff Exec",
        position: "t",
        skills: { coo: 4, cfo: 3, cmo: 2, cto: 11 },
      }),
    ]);
    document.body.innerHTML = `<div id="page"><div>STAFF EXECUTIVE</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/g12/");

    await updateExecutivePanel();

    expect(content.querySelector(".scx-skill-breakdown-total-value")).toBeNull();
  });

  it("loads detail for the matched staff executive id", async () => {
    requestMock.mockImplementation(async (key, options) => {
      if (key === "executives") {
        return {
          executives: [
            makeExecutive({
              id: 12,
              name: "Staff Exec",
              position: "t",
              skills: { coo: 4, cfo: 3, cmo: 2, cto: 11 },
            }),
          ],
        };
      }
      if (key === "executive-detail-12") {
        return { trainings: [{ skills: { coo: 0, cfo: 0, cmo: 0, cto: 2 } }] };
      }
      throw new Error(`unexpected request ${key} ${options?.url || ""}`);
    });
    document.body.innerHTML = `<div id="page"><h1>Staff Exec</h1><div>STAFF EXECUTIVE</div></div>`;

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/executives/g12/");

    await updateExecutivePanel();

    expect(requestMock.mock.calls.map(([key]) => key)).toEqual(["executives", "executive-detail-12"]);
    const totalValues = [...content.querySelectorAll(".scx-skill-breakdown-total-value")].map((el) =>
      el.textContent.trim(),
    );
    expect(totalValues).toEqual(["4", "3", "2", "11"]);
  });

  it("renders HR feedback on staff pages when feedback exists", async () => {
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

  it("shows the empty eligible state when no executives qualify", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T13:00:00.000Z"));
    requestMock.mockResolvedValue({
      executives: [
        makeExecutive({
          id: 2,
          name: "Zhi Maruyama",
          position: "f",
          skills: { coo: 1, cfo: 4, cmo: 2, cto: 3 },
          currentTraining: { datetime: "2026-05-05T11:00:01.000Z", training: "o" },
        }),
      ],
    });

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/overview/");

    await updateExecutivePanel();

    expect(content.textContent).toContain("executiveOrganicGrowthNoneEligible");
  });

  it("force-refreshes the growth block data when refresh is clicked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T13:00:00.000Z"));
    requestMock
      .mockResolvedValueOnce({
        executives: [
          makeExecutive({
            id: 1,
            name: "Amy White",
            position: "o",
            skills: { coo: 4, cfo: 2, cmo: 1, cto: 3 },
          }),
        ],
      })
      .mockResolvedValueOnce({
        executives: [
          makeExecutive({
            id: 2,
            name: "Zhi Maruyama",
            position: "f",
            skills: { coo: 1, cfo: 4, cmo: 2, cto: 3 },
            currentTraining: { datetime: "2026-05-05T11:00:01.000Z", training: "o" },
          }),
        ],
      });

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/overview/");

    await updateExecutivePanel();
    expect(content.textContent).toContain("Amy White");

    content.querySelector("#scx-executive-refresh-btn").click();
    await vi.advanceTimersByTimeAsync(0);

    expect(requestMock.mock.calls.map(([key]) => key)).toEqual(["executives", "executives"]);
    expect(content.textContent).toContain("executiveOrganicGrowthNoneEligible");
  });

  it("updates the countdown every second and stops on collapse", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T13:00:00.000Z"));
    requestMock.mockResolvedValue({
      executives: [
        makeExecutive({
          id: 1,
          name: "Amy White",
          position: "o",
          skills: { coo: 4, cfo: 2, cmo: 1, cto: 3 },
        }),
      ],
    });

    const content = document.createElement("div");
    getSectionContentMock.mockReturnValue(content);
    window.history.pushState({}, "", "/headquarters/overview/");

    await updateExecutivePanel();
    _testUtils.handleExecutiveSectionToggle(false);

    const countdown = content.querySelector("[data-growth-countdown]");
    expect(countdown.textContent).toBe("01:00:00");

    await vi.advanceTimersByTimeAsync(1000);
    expect(countdown.textContent).toBe("00:59:59");

    _testUtils.handleExecutiveSectionToggle(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(countdown.textContent).toBe("00:59:59");
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
