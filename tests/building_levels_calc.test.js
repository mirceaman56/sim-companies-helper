import { describe, expect, it } from "vitest";
import { applyKnownLevels, mergeKnownLevels, pruneKnownLevels } from "../src/building_levels_calc.js";

describe("mergeKnownLevels", () => {
  it("records new and changed levels, skips unchanged and invalid ones", () => {
    const known = { 1: { level: 10, at: 1 } };
    const { known: next, changed } = mergeKnownLevels(
      known,
      [
        { id: "1", level: 10 },
        { id: 2, level: 15 },
        { id: "3", level: null },
        { id: "", level: 4 },
        { id: "4", level: 0 },
      ],
      99,
    );
    expect(changed).toBe(true);
    expect(next).toEqual({ 1: { level: 10, at: 1 }, 2: { level: 15, at: 99 } });
  });

  it("reports no change when every level is already known", () => {
    const { changed } = mergeKnownLevels({ 1: { level: 10, at: 1 } }, [{ id: "1", level: 10 }]);
    expect(changed).toBe(false);
  });
});

describe("applyKnownLevels", () => {
  // The profile API floors the bank to its art step: level 15 is reported as 10.
  const api = [
    { id: 7, kind: "n", size: 10 },
    { id: 8, kind: "y", size: 15 },
    { id: 9, kind: "G", size: 15 },
  ];

  it("replaces the rounded API level with the exact one from the game page", () => {
    const result = applyKnownLevels(api, { 7: { level: 15, at: 1 }, 9: { level: 29, at: 1 } });
    expect(result.map((b) => b.size)).toEqual([15, 15, 29]);
    expect(result[1]).toBe(api[1]);
    expect(api[0].size).toBe(10);
  });

  it("ignores a remembered level below the API level (upgraded since)", () => {
    const result = applyKnownLevels(api, { 8: { level: 12, at: 1 } });
    expect(result[1].size).toBe(15);
  });

  it("returns the list unchanged without known levels", () => {
    expect(applyKnownLevels(api, null)).toBe(api);
    expect(applyKnownLevels(null, {})).toEqual([]);
  });
});

describe("pruneKnownLevels", () => {
  it("keeps only buildings still in the company list", () => {
    const known = { 7: { level: 15, at: 1 }, 99: { level: 3, at: 1 } };
    expect(pruneKnownLevels(known, [{ id: 7 }])).toEqual({ 7: { level: 15, at: 1 } });
  });
});
