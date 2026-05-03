// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock i18n
vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

// Mock storage
const mockStorageGet = vi.fn(async () => null);
const mockStorageSet = vi.fn(async () => true);
vi.mock("../src/data/storage.js", () => ({
  get: (...args) => mockStorageGet(...args),
  set: (...args) => mockStorageSet(...args),
}));

// Mock state
vi.mock("../src/state.js", () => ({
  SIDEBAR_ID: "scx-sidebar",
}));

// Mock utils
vi.mock("../src/utils.js", () => ({
  escapeHtml: (s) => s,
}));

import {
  ensureSidebarContainer,
  toggleSidebarVisibility,
  _testUtils,
} from "../src/sidebar.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetDOM() {
  document.body.innerHTML = "";
  document.documentElement.querySelectorAll("#scx-sidebar").forEach((el) => el.remove());
  _testUtils.sidebarHidden = false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("sidebar toggle tab", () => {
  beforeEach(() => {
    resetDOM();
    mockStorageGet.mockReset().mockResolvedValue(null);
    mockStorageSet.mockReset().mockResolvedValue(true);
  });

  it("creates a toggle tab inside the sidebar container", () => {
    const container = ensureSidebarContainer();
    const tab = container.querySelector(".scx-sidebar-toggle-tab");
    expect(tab).not.toBeNull();
    expect(tab.tagName).toBe("BUTTON");
  });

  it("toggle tab is the first child of the sidebar", () => {
    const container = ensureSidebarContainer();
    expect(container.firstElementChild.classList.contains("scx-sidebar-toggle-tab")).toBe(true);
  });

  it("toggle tab shows hide tooltip by default", () => {
    const container = ensureSidebarContainer();
    const tab = container.querySelector(".scx-sidebar-toggle-tab");
    expect(tab.title).toContain("hideSidebar");
    expect(tab.title).toContain("Alt+H");
  });
});

describe("toggleSidebarVisibility", () => {
  beforeEach(() => {
    resetDOM();
    mockStorageGet.mockReset().mockResolvedValue(null);
    mockStorageSet.mockReset().mockResolvedValue(true);
  });

  it("adds scx-sidebar-hidden class on first toggle", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(true);
  });

  it("removes scx-sidebar-hidden class on second toggle", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    toggleSidebarVisibility();
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(false);
  });

  it("updates toggle tab tooltip text when hiding", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    const tab = container.querySelector(".scx-sidebar-toggle-tab");
    expect(tab.title).toContain("showSidebar");
  });

  it("updates toggle tab tooltip text when showing", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    toggleSidebarVisibility();
    const tab = container.querySelector(".scx-sidebar-toggle-tab");
    expect(tab.title).toContain("hideSidebar");
  });

  it("updates toggle tab icon when hiding", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    const icon = container.querySelector(".scx-sidebar-toggle-tab-icon");
    expect(icon.textContent).toBe("◀");
  });

  it("updates toggle tab icon when showing", () => {
    const container = ensureSidebarContainer();
    toggleSidebarVisibility();
    toggleSidebarVisibility();
    const icon = container.querySelector(".scx-sidebar-toggle-tab-icon");
    expect(icon.textContent).toBe("▶");
  });

  it("persists hidden state via storage.set", () => {
    ensureSidebarContainer();
    toggleSidebarVisibility();
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "sidebar-prefs",
        version: 1,
        scope: "global",
        backend: "local",
        data: { hidden: true },
      }),
    );
  });

  it("persists visible state via storage.set", () => {
    ensureSidebarContainer();
    toggleSidebarVisibility();
    toggleSidebarVisibility();
    expect(mockStorageSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { hidden: false },
      }),
    );
  });
});

describe("keyboard shortcut (Alt+H)", () => {
  beforeEach(() => {
    resetDOM();
    mockStorageGet.mockReset().mockResolvedValue(null);
    mockStorageSet.mockReset().mockResolvedValue(true);
  });

  it("toggles sidebar on Alt+H keydown", () => {
    const container = ensureSidebarContainer();
    const event = new KeyboardEvent("keydown", {
      key: "h",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(true);
  });

  it("toggles back on second Alt+H", () => {
    const container = ensureSidebarContainer();
    const makeEvent = () =>
      new KeyboardEvent("keydown", {
        key: "h",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
    document.dispatchEvent(makeEvent());
    document.dispatchEvent(makeEvent());
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(false);
  });

  it("ignores Ctrl+Alt+H", () => {
    const container = ensureSidebarContainer();
    const event = new KeyboardEvent("keydown", {
      key: "h",
      altKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(false);
  });

  it("ignores Alt+G (wrong key)", () => {
    const container = ensureSidebarContainer();
    const event = new KeyboardEvent("keydown", {
      key: "g",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(false);
  });
});

describe("restore persisted state", () => {
  beforeEach(() => {
    resetDOM();
    mockStorageSet.mockReset().mockResolvedValue(true);
  });

  it("applies scx-sidebar-hidden when storage returns hidden: true", async () => {
    mockStorageGet.mockResolvedValue({ hidden: true });
    const container = ensureSidebarContainer();
    // _restoreSidebarState is async; wait for it
    await vi.waitFor(() => {
      expect(container.classList.contains("scx-sidebar-hidden")).toBe(true);
    });
  });

  it("does not apply hidden class when storage returns null", async () => {
    mockStorageGet.mockResolvedValue(null);
    const container = ensureSidebarContainer();
    // Give the async restore a tick to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(container.classList.contains("scx-sidebar-hidden")).toBe(false);
  });

  it("updates tab tooltip when restoring hidden state", async () => {
    mockStorageGet.mockResolvedValue({ hidden: true });
    const container = ensureSidebarContainer();
    await vi.waitFor(() => {
      const tab = container.querySelector(".scx-sidebar-toggle-tab");
      expect(tab.title).toContain("showSidebar");
    });
  });
});
