// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n.js", () => ({ t: (key) => key, getHtmlLang: () => "en" }));

const store = { enabled: false, prefs: null };
const watchers = new Set();
vi.mock("../src/accessibility_storage.js", () => ({
  loadAccessibilityEnabled: async () => store.enabled,
  saveAccessibilityEnabled: vi.fn(async (value) => {
    store.enabled = value;
    return true;
  }),
  watchAccessibilityEnabled: (listener) => {
    watchers.add(listener);
    return () => watchers.delete(listener);
  },
  loadBuildingPrefs: async () => store.prefs || { products: {}, buildings: {}, producingKinds: [] },
  saveBuildingPrefs: vi.fn(async () => true),
}));
vi.mock("../src/data/storage.js", () => ({ get: async () => null, set: async () => true }));

const settings = await import("../src/accessibility_settings.js");
const map = await import("../src/accessibility_map.js");
const { initAccessibility } = await import("../src/accessibility_ui.js");
const { _testUtils } = await import("../src/accessibility_panel.js");
const { ensureSidebarContainer } = await import("../src/sidebar.js");

/** matchMedia stub whose (prefers-contrast: more) result can change at runtime. */
function contrastMedia(matches) {
  const listeners = new Set();
  const media = {
    matches,
    addEventListener: (_type, fn) => listeners.add(fn),
    set(value) {
      media.matches = value;
      for (const fn of listeners) fn();
    },
  };
  return media;
}

const html = () => document.documentElement;
const switchButton = () => document.getElementById("scx-a11y-switch");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
  store.enabled = false;
  store.prefs = null;
  watchers.clear();
  settings._testUtils.reset();
  map._testUtils.reset();
  html().className = "";
  document.querySelectorAll("#scx-sidebar, #scx-left-sidebar").forEach((el) => el.remove());
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/landscape/");
  ensureSidebarContainer();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("accessibility settings", () => {
  it("is off by default: no classes on <html>", async () => {
    await settings.initAccessibilitySettings({ matchMediaFn: () => contrastMedia(false) });
    expect(settings.getAccessibilityMode()).toEqual({ enabled: false, contrast: false });
    expect(html().classList.contains("scx-a11y-on")).toBe(false);
    expect(html().classList.contains("scx-a11y-contrast")).toBe(false);
  });

  it("OS high-contrast preference turns on contrast only, even with the switch off", async () => {
    const media = contrastMedia(true);
    await settings.initAccessibilitySettings({ matchMediaFn: () => media });
    expect(settings.getAccessibilityMode()).toEqual({ enabled: false, contrast: true });
    expect(html().classList.contains("scx-a11y-contrast")).toBe(true);
    expect(html().classList.contains("scx-a11y-on")).toBe(false);

    media.set(false);
    expect(html().classList.contains("scx-a11y-contrast")).toBe(false);
  });

  it("the switch turns on everything and persists", async () => {
    await settings.initAccessibilitySettings({ matchMediaFn: () => contrastMedia(false) });
    await settings.setAccessibilityEnabled(true);
    expect(settings.getAccessibilityMode()).toEqual({ enabled: true, contrast: true });
    expect(store.enabled).toBe(true);
  });

  it("follows the switch flipped in another tab", async () => {
    await settings.initAccessibilitySettings({ matchMediaFn: () => contrastMedia(false) });
    for (const listener of watchers) listener(true);
    expect(html().classList.contains("scx-a11y-on")).toBe(true);
  });
});

const leftSidebar = () => document.getElementById("scx-left-sidebar");

describe("accessibility switch and left panel", () => {
  it("mounts a labelled switch in the sidebar top bar, left of the hide tab", async () => {
    await initAccessibility();
    const button = switchButton();
    expect(button.parentElement.classList.contains("scx-sidebar-topbar")).toBe(true);
    expect(button.nextElementSibling.classList.contains("scx-sidebar-toggle-tab")).toBe(true);
    expect(button.getAttribute("role")).toBe("switch");
    expect(button.getAttribute("aria-label")).toBe("a11yToggleFull");
    expect(button.getAttribute("aria-checked")).toBe("false");
  });

  it("clicking the switch flips aria-checked and the <html> classes", async () => {
    await initAccessibility();
    switchButton().click();
    expect(switchButton().getAttribute("aria-checked")).toBe("true");
    expect(html().classList.contains("scx-a11y-on")).toBe(true);
    switchButton().click();
    expect(switchButton().getAttribute("aria-checked")).toBe("false");
    expect(html().classList.contains("scx-a11y-on")).toBe(false);
  });

  it("the left sidebar exists only while enabled and holds the help icon", async () => {
    await initAccessibility();
    expect(leftSidebar()).toBeNull();

    switchButton().click();
    await flush();
    const icon = leftSidebar().querySelector(".scx-info-icon");
    expect(icon.getAttribute("data-scx-tooltip")).toBe("a11yTagsHelp");
    expect(icon.getAttribute("aria-label")).toBe("a11yTagsHelp");
    expect(icon.getAttribute("tabindex")).toBe("0");

    switchButton().click();
    await flush();
    expect(leftSidebar()).toBeNull();
  });

  it("nothing is added to the right sidebar besides the switch", async () => {
    window.history.replaceState({}, "", "/b/1004/");
    store.enabled = true;
    await initAccessibility();
    await flush();
    const right = document.getElementById("scx-sidebar");
    expect(right.querySelector("[id^='scx-a11y']:not(#scx-a11y-switch)")).toBeNull();
  });

  it("shows the label editor in the left sidebar on building pages only while enabled", async () => {
    window.history.replaceState({}, "", "/b/1004/");
    store.enabled = true;
    await initAccessibility();
    await flush();

    const editor = document.getElementById("scx-a11y-editor");
    expect(editor).not.toBeNull();
    expect(leftSidebar().contains(editor)).toBe(true);
    expect(editor.querySelector("label").getAttribute("for")).toBe("scx-a11y-nickname");
    expect(editor.querySelectorAll(".scx-a11y-swatch")).toHaveLength(9);
    expect(editor.querySelector(".scx-a11y-swatch-auto").getAttribute("aria-pressed")).toBe("true");

    switchButton().click();
    await flush();
    expect(document.getElementById("scx-a11y-editor")).toBeNull();
  });

  it("shows a hint instead of the editor on non-building pages", async () => {
    store.enabled = true;
    await initAccessibility();
    await flush();
    expect(document.getElementById("scx-a11y-editor")).toBeNull();
    expect(leftSidebar().querySelector(".scx-a11y-panel-hint").textContent).toBe("a11yEditorHint");
  });

  it("picking a swatch stores the color and marks it pressed", async () => {
    window.history.replaceState({}, "", "/b/1004/");
    store.enabled = true;
    await initAccessibility();
    await flush();

    const swatch = document.querySelector('.scx-a11y-swatch[data-color="3"]');
    swatch.click();
    await flush();
    expect(swatch.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".scx-a11y-swatch-auto").getAttribute("aria-pressed")).toBe("false");
    expect(map._testUtils.prefs.buildings["1004"]).toEqual({ color: 3 });
  });

  it("editor markup escapes stored nicknames", () => {
    const markup = _testUtils.renderEditorMarkup("1", { nickname: '"><img src=x>' });
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("input").value).toBe('"><img src=x>');
  });
});
