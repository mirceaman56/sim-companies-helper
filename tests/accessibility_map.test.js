// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPrefs } from "../src/accessibility_calc.js";

vi.mock("../src/i18n.js", () => ({ t: (key) => key }));

const loadBuildingPrefs = vi.fn(async () => emptyPrefs());
const saveBuildingPrefs = vi.fn(async () => true);
vi.mock("../src/accessibility_storage.js", () => ({
  loadBuildingPrefs: (...args) => loadBuildingPrefs(...args),
  saveBuildingPrefs: (...args) => saveBuildingPrefs(...args),
}));

const { changeBuildingPref, startMapTags, stopMapTags, syncMapTags, _testUtils } =
  await import("../src/accessibility_map.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", "landscape", file), "utf8");
const building = (id) => document.querySelector(`a[href="/b/${id}/"]`);
const tagOf = (id) => building(id).querySelector(".scx-a11y-tag");

/** Counts DOM mutations caused by `fn` (attributes, children, text). */
async function countMutations(fn) {
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  fn();
  await Promise.resolve();
  records.push(...observer.takeRecords());
  observer.disconnect();
  return records;
}

beforeEach(async () => {
  vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
  loadBuildingPrefs.mockClear().mockResolvedValue(emptyPrefs());
  saveBuildingPrefs.mockClear();
  _testUtils.reset();
  document.body.innerHTML = fixture("producing.html");
  await startMapTags();
});

afterEach(() => {
  _testUtils.reset();
  vi.unstubAllGlobals();
});

describe("map tags", () => {
  it("tags producing buildings with product name, color class and shape", () => {
    syncMapTags();
    const tag = tagOf("1004");
    expect(tag.textContent).toContain("Chemicals");
    expect(tag.className).toMatch(/scx-a11y-color-\d/);
    expect(tag.querySelector(".scx-a11y-tag-shape").getAttribute("aria-hidden")).toBe("true");
    expect(building("1004").querySelector("[data-scx-a11y-status]")).not.toBeNull();
  });

  it("same product, same color; different product, different color", () => {
    syncMapTags();
    expect(tagOf("1001").className).toBe(tagOf("1006").className);
    expect(tagOf("1004").className).not.toBe(tagOf("1005").className);
  });

  it("a second pass over unchanged buildings writes nothing (no observer loop)", async () => {
    syncMapTags();
    const records = await countMutations(() => syncMapTags());
    expect(records).toHaveLength(0);
  });

  it("a timer tick causes no writes from the extension", async () => {
    syncMapTags();
    const timer = building("1004").querySelector("[aria-live]");
    timer.textContent = "46h 49m";
    const records = await countMutations(() => syncMapTags());
    expect(records).toHaveLength(0);
  });

  it("re-adds a tag the game re-render removed", () => {
    syncMapTags();
    tagOf("1004").remove();
    syncMapTags();
    expect(tagOf("1004")).not.toBeNull();
  });

  it("marks an idle building of a producing kind and keeps its remembered color", async () => {
    loadBuildingPrefs.mockResolvedValue({
      products: { apples: 2 },
      buildings: { 2006: { product: "apples" } },
      producingKinds: ["G"],
    });
    _testUtils.reset();
    document.body.innerHTML = fixture("idle.html");
    await startMapTags();
    syncMapTags();

    const tag = tagOf("2006");
    expect(tag.className).toContain("scx-a11y-color-2");
    expect(tag.querySelector(".scx-a11y-tag-idle").textContent).toContain("a11yIdle");
    expect(building("2006").querySelector('[data-scx-a11y-status="idle"]')).not.toBeNull();
    expect(tagOf("2005")).toBeNull(); // academy
  });

  it("escapes nicknames", async () => {
    syncMapTags();
    await changeBuildingPref("1004", { nickname: "<b>x</b>" });
    syncMapTags();
    expect(tagOf("1004").querySelector("b")).toBeNull();
    expect(tagOf("1004").textContent).toContain("<b>x</b>");
  });

  it("saves learned products once, debounced", async () => {
    syncMapTags();
    syncMapTags();
    await _testUtils.flushSave();
    expect(saveBuildingPrefs).toHaveBeenCalledTimes(1);
    expect(saveBuildingPrefs.mock.calls[0][0].products).toMatchObject({ minerals: 0 });
  });

  it("stopping removes every tag and status mark", () => {
    syncMapTags();
    stopMapTags();
    expect(document.querySelector(".scx-a11y-tag")).toBeNull();
    expect(document.querySelector("[data-scx-a11y-status]")).toBeNull();
    syncMapTags();
    expect(document.querySelector(".scx-a11y-tag")).toBeNull();
  });
});
