// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

vi.mock("../src/buildings.js", () => ({
  loadBuildings: vi.fn(() => Promise.resolve()),
}));

global.MutationObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

import { STATE } from "../src/state.js";
import { loadBuildings } from "../src/buildings.js";
import { _testUtils } from "../src/xp_ui.js";

const { updateWidget, refreshBuildingsCache, CONTAINER_ID } = _testUtils;

function setupNavbar() {
  document.body.innerHTML = `
    <div data-testid="levels-host">
      <a href="/encyclopedia/0/levels/">
        <div><span>Lv. </span><span>20 (82%)</span></div>
      </a>
    </div>
  `;
}

function injectContainer() {
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-navchip-widget";
  const host = document.querySelector('[data-testid="levels-host"]');
  host.appendChild(container);
}

function setStateLoaded(buildings = [], level = 20, experience = 83599, experienceToNextLevel = 110000) {
  STATE.buildings.loaded = true;
  STATE.buildings.items = buildings;
  STATE.levelInfo.level = level;
  STATE.levelInfo.experience = experience;
  STATE.levelInfo.experienceToNextLevel = experienceToNextLevel;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  _testUtils.popover.setOpen(false);
  STATE.buildings.loaded = false;
  STATE.buildings.loading = false;
  STATE.buildings.error = null;
  STATE.buildings.items = [];
  STATE.buildings.lastRefreshAt = 0;
  STATE.levelInfo.level = null;
  STATE.levelInfo.experience = null;
  STATE.levelInfo.experienceToNextLevel = null;
});

describe("XP UI Widget", () => {
  it("shows placeholder when data not loaded", () => {
    setupNavbar();
    injectContainer();
    STATE.buildings.loaded = false;
    STATE.levelInfo.level = null;
    updateWidget();
    const chip = document.querySelector(".scx-navchip--loading");
    expect(chip).not.toBeNull();
    expect(chip.disabled).toBe(true);
  });

  it("renders XP/hour and time estimate when data is loaded", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded(
      [
        // 2 grocery stores → 2 × 12 = 24 XP/hr (no busy field needed with v3 API)
        {
          id: 1,
          kind: "G",
          category: "sales",
          image: "images/buildings/sales/grocery_store.png",
          size: 10,
        },
        {
          id: 2,
          kind: "G",
          category: "sales",
          image: "images/buildings/sales/grocery_store.png",
          size: 11,
        },
      ],
      20,
      83599,
      110000,
    );
    updateWidget();
    const container = document.getElementById(CONTAINER_ID);
    // Check that XP/hour value 24 appears
    expect(container.textContent).toContain("24");
    // Check remaining XP
    expect(container.textContent).toContain("26401");
  });

  it("shows XP/hour even when buildings have no busy field (v3 API)", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded(
      [
        {
          id: 1,
          kind: "G",
          category: "sales",
          image: "images/buildings/sales/grocery_store.png",
          size: 10,
        },
      ],
      20,
      83599,
      110000,
    );
    updateWidget();
    const container = document.getElementById(CONTAINER_ID);
    // Building earns 12 XP/hr with v3 static data
    expect(container.querySelector(".scx-navchip-amount").textContent).not.toContain("—");
  });

  it("renders an info chip that toggles the details popover", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded([], 20, 83599, 110000);
    updateWidget();
    const chip = document.querySelector(".scx-navchip--info");
    expect(chip).not.toBeNull();

    const popoverEl = document.querySelector(".scx-navpop");
    expect(popoverEl.classList.contains("scx-hidden")).toBe(true);
    _testUtils.popover.setOpen(true);
    expect(popoverEl.classList.contains("scx-hidden")).toBe(false);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the level gauge from the game's level percentage", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded([], 20, 83599, 110000);
    updateWidget();
    expect(document.querySelector(".scx-navpop-meter").getAttribute("value")).toBe("82");
  });

  it("shows an error chip with the refresh action available", () => {
    setupNavbar();
    injectContainer();
    STATE.buildings.error = "HTTP 500";
    updateWidget();
    expect(document.querySelector(".scx-navchip--warn")).not.toBeNull();
    expect(document.querySelector(".scx-xp-refresh")).not.toBeNull();
  });

  it("renders refresh button and cache tooltip", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded([], 20, 83599, 110000);
    updateWidget();
    const refreshBtn = document.querySelector(".scx-xp-refresh");
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn.getAttribute("title")).toBe("xpCacheRefreshHint");
  });

  it("forces buildings refresh when requested", async () => {
    await refreshBuildingsCache();
    expect(loadBuildings).toHaveBeenCalledWith({ force: true });
  });

  it("does nothing when container is missing", () => {
    // No container injected, updateWidget should not throw
    expect(() => updateWidget()).not.toThrow();
  });
});
