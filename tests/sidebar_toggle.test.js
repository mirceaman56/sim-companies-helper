// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock i18n
vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
  getHtmlLang: () => "de",
}));

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
  registerSection,
  getSectionTitleSizeClass,
  setSectionToggleFn,
  toggleSidebarVisibility,
  addSidebarTopbarControl,
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

  it("toggle tab sits in the top bar, the first child of the sidebar", () => {
    const container = ensureSidebarContainer();
    const topbar = container.firstElementChild;
    expect(topbar.classList.contains("scx-sidebar-topbar")).toBe(true);
    expect(topbar.lastElementChild.classList.contains("scx-sidebar-toggle-tab")).toBe(true);
  });

  it("hiding mirrors a class on <html> so the left sidebar hides too", () => {
    ensureSidebarContainer();
    toggleSidebarVisibility();
    expect(document.documentElement.classList.contains("scx-sidebars-hidden")).toBe(true);
    toggleSidebarVisibility();
    expect(document.documentElement.classList.contains("scx-sidebars-hidden")).toBe(false);
  });

  it("top bar controls go left of the toggle tab", () => {
    const control = document.createElement("button");
    control.className = "scx-test-control";
    const topbar = addSidebarTopbarControl(control);
    expect(topbar.firstElementChild).toBe(control);
    expect(topbar.lastElementChild.classList.contains("scx-sidebar-toggle-tab")).toBe(true);
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
        backend: "chrome",
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

describe("section toggle hooks", () => {
  beforeEach(() => {
    resetDOM();
    mockStorageGet.mockReset().mockResolvedValue(null);
    mockStorageSet.mockReset().mockResolvedValue(true);
  });

  it("calls the registered section toggle hook on expand and collapse", () => {
    const toggleFn = vi.fn();
    const section = registerSection("executive-section", "executiveHelper", "👔");
    setSectionToggleFn("executive-section", toggleFn);

    const header = section.querySelector(".scx-section-header");
    header.click();
    header.click();

    expect(toggleFn).toHaveBeenNthCalledWith(1, false);
    expect(toggleFn).toHaveBeenNthCalledWith(2, true);
  });
});

// ---------------------------------------------------------------------------
// Section title sizing
// ---------------------------------------------------------------------------
describe("section title sizing", () => {
  beforeEach(() => {
    resetDOM();
  });

  it("keeps the base size for titles that wrap on spaces", () => {
    expect(getSectionTitleSizeClass("Production Helper")).toBe("");
    expect(getSectionTitleSizeClass("Assistant de Vente au Détail")).toBe("");
    expect(getSectionTitleSizeClass("生産アシスタント")).toBe("");
  });

  it("steps down for long compound words that cannot wrap", () => {
    expect(getSectionTitleSizeClass("Markt-Warnungen")).toBe("scx-section-title-sm");
    expect(getSectionTitleSizeClass("Produktionshelfer")).toBe("scx-section-title-sm");
    expect(getSectionTitleSizeClass("Einzelhandelshelfer")).toBe("scx-section-title-xs");
    expect(getSectionTitleSizeClass("Führungskräftehelfer")).toBe("scx-section-title-xs");
  });

  it("handles empty titles", () => {
    expect(getSectionTitleSizeClass("")).toBe("");
    expect(getSectionTitleSizeClass(undefined)).toBe("");
  });

  it("applies the size class and the language tag to the rendered title", () => {
    registerSection("sizing-section", "Führungskräftehelfer", "◆");

    const section = document.querySelector('[data-section-id="sizing-section"]');
    const titleEl = section.querySelector(".scx-section-title");
    const textEl = section.querySelector(".scx-section-title-text");

    expect(titleEl.classList.contains("scx-section-title-xs")).toBe(true);
    expect(textEl.getAttribute("lang")).toBe("de");
    expect(textEl.textContent).toBe("Führungskräftehelfer");
  });
});

describe("section header accessibility", () => {
  it("toggles with Enter/Space and reflects state in aria-expanded", async () => {
    const { registerSection } = await import("../src/sidebar.js");
    const section = registerSection("a11y-section", "A11y", "◆");
    const header = section.querySelector(".scx-section-header");

    expect(header.getAttribute("role")).toBe("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");

    header.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(header.getAttribute("aria-expanded")).toBe("true");

    header.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores Alt+H while typing in a field", async () => {
    const { _testUtils } = await import("../src/sidebar.js");
    const input = document.createElement("input");
    const before = _testUtils.sidebarHidden;
    _testUtils._onSidebarShortcut({ altKey: true, key: "h", target: input, preventDefault() {} });
    expect(_testUtils.sidebarHidden).toBe(before);
  });
});
