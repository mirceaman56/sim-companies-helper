import { describe, expect, it } from "vitest";
import {
  PALETTE_NAME_KEYS,
  PALETTE_SHAPES,
  PALETTE_SIZE,
  buildTagModel,
  emptyPrefs,
  formatProductName,
  normalizeColorIndex,
  normalizePrefs,
  rememberBuildings,
  tagModelKey,
  updateBuildingPref,
} from "../src/accessibility_calc.js";

const busy = (id, kind, productSlug) => ({ id, kind, busy: true, productSlug });
const idle = (id, kind) => ({ id, kind, busy: false, productSlug: null });

describe("palette", () => {
  it("has a distinct shape and a color name for every slot", () => {
    expect(PALETTE_SHAPES).toHaveLength(PALETTE_SIZE);
    expect(new Set(PALETTE_SHAPES).size).toBe(PALETTE_SIZE);
    expect(PALETTE_NAME_KEYS).toHaveLength(PALETTE_SIZE);
  });

  it("normalizes color indexes", () => {
    expect(normalizeColorIndex(0)).toBe(0);
    expect(normalizeColorIndex("7")).toBe(7);
    expect(normalizeColorIndex(8)).toBeNull();
    expect(normalizeColorIndex(-1)).toBeNull();
    expect(normalizeColorIndex("")).toBeNull();
    expect(normalizeColorIndex(null)).toBeNull();
    expect(normalizeColorIndex(1.5)).toBeNull();
  });
});

describe("formatProductName", () => {
  it("turns artwork slugs into names", () => {
    expect(formatProductName("ginger-beer")).toBe("Ginger beer");
    expect(formatProductName("chemicals")).toBe("Chemicals");
    expect(formatProductName("")).toBe("");
    expect(formatProductName(null)).toBe("");
  });
});

describe("normalizePrefs", () => {
  it("repairs missing or malformed stored data", () => {
    expect(normalizePrefs(null)).toEqual(emptyPrefs());
    expect(normalizePrefs({ products: [], buildings: "x", producingKinds: "Y" })).toEqual(emptyPrefs());
    expect(normalizePrefs({ producingKinds: ["Y", 3] }).producingKinds).toEqual(["Y", "3"]);
  });
});

describe("rememberBuildings", () => {
  it("assigns palette slots to products in first-seen order and remembers each building", () => {
    const { prefs, changed } = rememberBuildings(emptyPrefs(), [
      busy("1", "Y", "chemicals"),
      busy("2", "Y", "silicon"),
      busy("3", "Y", "chemicals"),
      idle("4", "G"),
    ]);
    expect(changed).toBe(true);
    expect(prefs.products).toEqual({ chemicals: 0, silicon: 1 });
    expect(prefs.buildings).toEqual({
      1: { product: "chemicals" },
      2: { product: "silicon" },
      3: { product: "chemicals" },
    });
    expect(prefs.producingKinds).toEqual(["Y"]);
  });

  it("returns the same object when nothing changed, so no write is scheduled", () => {
    const first = rememberBuildings(emptyPrefs(), [busy("1", "Y", "chemicals")]).prefs;
    const second = rememberBuildings(first, [busy("1", "Y", "chemicals"), idle("2", "Y")]);
    expect(second.changed).toBe(false);
    expect(second.prefs).toBe(first);
  });

  it("never mutates the input", () => {
    const prefs = emptyPrefs();
    rememberBuildings(prefs, [busy("1", "Y", "chemicals")]);
    expect(prefs).toEqual(emptyPrefs());
  });

  it("keeps a custom color and nickname when the product changes", () => {
    const prefs = { ...emptyPrefs(), buildings: { 1: { product: "silicon", color: 5, nickname: "North" } } };
    const next = rememberBuildings(prefs, [busy("1", "Y", "chemicals")]).prefs;
    expect(next.buildings[1]).toEqual({ product: "chemicals", color: 5, nickname: "North" });
  });

  it("wraps palette slots after eight products", () => {
    const buildings = Array.from({ length: 9 }, (_, i) => busy(String(i), "Y", `p${i}`));
    expect(rememberBuildings(emptyPrefs(), buildings).prefs.products.p8).toBe(0);
  });
});

describe("buildTagModel", () => {
  const prefs = rememberBuildings(emptyPrefs(), [
    busy("1", "Y", "chemicals"),
    busy("2", "G", "apples"),
  ]).prefs;

  it("labels a producing building with its product color, shape and name", () => {
    expect(buildTagModel(prefs, busy("1", "Y", "chemicals"))).toEqual({
      colorIndex: 0,
      shape: PALETTE_SHAPES[0],
      label: "Chemicals",
      idle: false,
    });
  });

  it("keeps the last product color on an idle building and flags it idle", () => {
    expect(buildTagModel(prefs, idle("1", "Y"))).toMatchObject({
      colorIndex: 0,
      label: "Chemicals",
      idle: true,
    });
  });

  it("flags a never-seen building idle when its kind is known to produce", () => {
    expect(buildTagModel(prefs, idle("9", "G"))).toEqual({
      colorIndex: null,
      shape: "",
      label: "",
      idle: true,
    });
  });

  it("does not tag academies, temples or other kinds never seen producing", () => {
    expect(buildTagModel(prefs, idle("5", "y"))).toBeNull();
    expect(buildTagModel(prefs, busy("6", "3", null))).toBeNull();
  });

  it("prefers the custom color and nickname", () => {
    const custom = updateBuildingPref(prefs, "1", { color: 4, nickname: "  North plant  " });
    expect(buildTagModel(custom, busy("1", "Y", "chemicals"))).toMatchObject({
      colorIndex: 4,
      shape: PALETTE_SHAPES[4],
      label: "North plant",
    });
  });

  it("an upgrading building keeps its remembered product", () => {
    expect(buildTagModel(prefs, busy("2", "G", null))).toMatchObject({ label: "Apples", idle: false });
  });
});

describe("updateBuildingPref", () => {
  it("sets, clears and trims values without touching other buildings", () => {
    const base = { ...emptyPrefs(), buildings: { 1: { product: "x" }, 2: { color: 1 } } };
    const set = updateBuildingPref(base, "1", { color: 3, nickname: "a".repeat(40) });
    expect(set.buildings[1]).toEqual({ product: "x", color: 3, nickname: "a".repeat(24) });
    expect(set.buildings[2]).toBe(base.buildings[2]);

    const cleared = updateBuildingPref(set, "1", { color: null, nickname: "   " });
    expect(cleared.buildings[1]).toEqual({ product: "x" });
  });
});

describe("tagModelKey", () => {
  it("changes when anything visible changes", () => {
    const model = { colorIndex: 1, shape: "▲", label: "A", idle: false };
    expect(tagModelKey(model)).not.toBe(tagModelKey({ ...model, idle: true }));
    expect(tagModelKey(model)).not.toBe(tagModelKey({ ...model, label: "B" }));
    expect(tagModelKey(null)).toBe("");
  });
});
