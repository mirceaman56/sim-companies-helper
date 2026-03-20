// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

vi.mock("../src/buildings.js", () => ({
  loadBuildings: vi.fn(() => Promise.resolve()),
}));

global.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
};

global.MutationObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

import { STATE } from "../src/state.js";
import { _testUtils } from "../src/xp_ui.js";

const { updateWidget, CONTAINER_ID } = _testUtils;

function setupNavbar() {
  document.body.innerHTML = `
    <div class="css-82a6rk">
      <a href="/encyclopedia/0/levels/">
        <div><span>Lv. </span><span>20 (82%)</span></div>
      </a>
    </div>
  `;
}

function injectContainer() {
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-xp-widget";
  const parent = document.querySelector(".css-82a6rk");
  parent.parentElement.insertBefore(container, parent.nextSibling);
}

function setStateLoaded(buildings = [], level = 20, experience = 83599, experienceToNextLevel = 110000) {
  STATE.buildings.loaded = true;
  STATE.buildings.items = buildings;
  STATE.levelInfo.level = level;
  STATE.levelInfo.experience = experience;
  STATE.levelInfo.experienceToNextLevel = experienceToNextLevel;
}

beforeEach(() => {
  document.body.innerHTML = "";
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
    const btn = document.querySelector(".scx-xp-toggle--loading");
    expect(btn).not.toBeNull();
  });

  it("renders XP/hour and time estimate when data is loaded", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded(
      [
        // 2 busy grocery stores → 2 × 12 = 24 XP/hr
        {
          id: 1,
          kind: "G",
          category: "sales",
          image: "images/buildings/sales/grocery_store.png",
          size: 10,
          busy: { id: 1, category: "s", duration: 3600 },
        },
        {
          id: 2,
          kind: "G",
          category: "sales",
          image: "images/buildings/sales/grocery_store.png",
          size: 11,
          busy: { id: 2, category: "s", duration: 3600 },
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

  it("shows 0 XP/hour when all buildings are idle", () => {
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
    // Time should be "—" (no XP/hr)
    expect(container.querySelector(".scx-xp-toggle").textContent).toContain("—");
  });

  it("renders toggle button", () => {
    setupNavbar();
    injectContainer();
    setStateLoaded([], 20, 83599, 110000);
    updateWidget();
    const toggle = document.querySelector(".scx-xp-toggle");
    expect(toggle).not.toBeNull();
  });

  it("does nothing when container is missing", () => {
    // No container injected, updateWidget should not throw
    expect(() => updateWidget()).not.toThrow();
  });
});
