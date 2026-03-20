// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { _testUtils } from "../src/xp_calc.js";

const {
  isRecreationBuilding,
  isProspectingSlot,
  isBuildingBusy,
  isBuildingUpgrading,
  buildingXpPerHour,
  calculateTotalXpPerHour,
  hoursToNextLevel,
  formatHours,
} = _testUtils;

// ── Helper factories ──

function makeBuilding(overrides = {}) {
  return {
    id: 1,
    kind: "G",
    position: "0",
    image: "images/buildings/sales/grocery_store_idle_tier05.png",
    category: "sales",
    name: "Grocery store",
    cost: 10350,
    size: 10,
    ...overrides,
  };
}

function busyBuilding(overrides = {}) {
  return makeBuilding({
    busy: { id: 1, started: "2026-03-20T06:00:00Z", duration: 3600, category: "s" },
    ...overrides,
  });
}

// ── isRecreationBuilding ──

describe("isRecreationBuilding", () => {
  it.each([
    { image: "images/landscape/park-lvl3.png", category: "other", expected: true },
    { image: "images/landscape/castle-lvl5.png", category: "other", expected: true },
    { image: "images/landscape/lake-lvl3.png", category: "other", expected: true },
    { image: "images/landscape/PARK-LVL3.png", category: "other", expected: true },
    { image: "images/landscape/academy-lvl1.png", category: "other", expected: false },
    { image: "images/landscape/park-lvl3.png", category: "sales", expected: false },
    { image: "images/buildings/production/quarry_tier04.png", category: "production", expected: false },
  ])("image=$image category=$category → $expected", ({ image, category, expected }) => {
    expect(isRecreationBuilding(makeBuilding({ image, category }))).toBe(expected);
  });
});

// ── isProspectingSlot ──

describe("isProspectingSlot", () => {
  it.each([
    { kind: "Q", size: 1, expected: true },
    { kind: "M", size: 1, expected: true },
    { kind: "Q", size: 7, expected: false },
    { kind: "M", size: 5, expected: false },
    { kind: "G", size: 1, expected: false },
    { kind: "S", size: 1, expected: false },
  ])("kind=$kind size=$size → $expected", ({ kind, size, expected }) => {
    expect(isProspectingSlot(makeBuilding({ kind, size }))).toBe(expected);
  });
});

// ── isBuildingBusy ──

describe("isBuildingBusy", () => {
  it("returns true when busy is set", () => {
    expect(isBuildingBusy(busyBuilding())).toBe(true);
  });
  it("returns false when no busy", () => {
    expect(isBuildingBusy(makeBuilding())).toBe(false);
  });
});

// ── isBuildingUpgrading ──

describe("isBuildingUpgrading", () => {
  it("returns true when busy.expanding is true", () => {
    expect(
      isBuildingUpgrading(
        makeBuilding({
          busy: { id: 1, expanding: true, category: "b", duration: 28800 },
        }),
      ),
    ).toBe(true);
  });
  it("returns false when busy but not expanding", () => {
    expect(isBuildingUpgrading(busyBuilding())).toBe(false);
  });
  it("returns false when not busy", () => {
    expect(isBuildingUpgrading(makeBuilding())).toBe(false);
  });
});

// ── buildingXpPerHour ──

describe("buildingXpPerHour", () => {
  it("normal building (no busy field) → 12", () => {
    expect(buildingXpPerHour(makeBuilding())).toBe(12);
  });

  it("normal building with busy field → 12", () => {
    expect(buildingXpPerHour(busyBuilding())).toBe(12);
  });

  it("recreation building level 3 → 40 * 3 = 120", () => {
    expect(
      buildingXpPerHour(
        makeBuilding({
          category: "other",
          image: "images/landscape/park-lvl3.png",
          size: 3,
        }),
      ),
    ).toBe(120);
  });

  it("recreation building level 5 → 40 * 5 = 200", () => {
    expect(
      buildingXpPerHour(
        makeBuilding({
          category: "other",
          image: "images/landscape/castle-lvl5.png",
          size: 5,
        }),
      ),
    ).toBe(200);
  });

  it("recreation building level 2 → 12 (below threshold)", () => {
    expect(
      buildingXpPerHour(
        makeBuilding({
          category: "other",
          image: "images/landscape/park-lvl2.png",
          size: 2,
        }),
      ),
    ).toBe(12);
  });

  it("prospecting slot (quarry level 1) → 36.5", () => {
    expect(
      buildingXpPerHour(
        makeBuilding({
          kind: "Q",
          size: 1,
          category: "production",
        }),
      ),
    ).toBe(36.5);
  });

  it("quarry level 7 → 12 (not a prospecting slot)", () => {
    expect(
      buildingXpPerHour(
        makeBuilding({
          kind: "Q",
          size: 7,
          category: "production",
        }),
      ),
    ).toBe(12);
  });
});

// ── calculateTotalXpPerHour ──

describe("calculateTotalXpPerHour", () => {
  it("empty buildings → 0", () => {
    const result = calculateTotalXpPerHour([]);
    expect(result.totalXpPerHour).toBe(0);
    expect(result.breakdown.operatingCount).toBe(0);
    expect(result.breakdown.prospectingCount).toBe(0);
  });

  it("mix of building types", () => {
    const buildings = [
      // 2 grocery stores → 2 × 12 = 24
      makeBuilding({ id: 1 }),
      makeBuilding({ id: 2 }),
      // 1 prospecting quarry → 36.5
      makeBuilding({
        id: 3,
        kind: "Q",
        size: 1,
        category: "production",
      }),
      // 1 recreation park level 3 → 120
      makeBuilding({
        id: 4,
        category: "other",
        image: "images/landscape/park-lvl3.png",
        size: 3,
      }),
    ];

    const result = calculateTotalXpPerHour(buildings);
    expect(result.totalXpPerHour).toBe(24 + 36.5 + 120);
    expect(result.breakdown.operatingCount).toBe(2);
    expect(result.breakdown.prospectingCount).toBe(1);
    expect(result.breakdown.recreationXp).toBe(120);
  });
});

// ── hoursToNextLevel ──

describe("hoursToNextLevel", () => {
  it.each([
    { currentXp: 83599, xpForNextLevel: 110000, xpPerHour: 217, expected: (110000 - 83599) / 217 },
    { currentXp: 110000, xpForNextLevel: 110000, xpPerHour: 100, expected: 0 },
    { currentXp: 50000, xpForNextLevel: 110000, xpPerHour: 0, expected: null },
    { currentXp: 120000, xpForNextLevel: 110000, xpPerHour: 100, expected: 0 },
  ])(
    "currentXp=$currentXp xpForNextLevel=$xpForNextLevel xpPerHour=$xpPerHour",
    ({ currentXp, xpForNextLevel, xpPerHour, expected }) => {
      const result = hoursToNextLevel(currentXp, xpForNextLevel, xpPerHour);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBeCloseTo(expected, 2);
      }
    },
  );
});

// ── formatHours ──

describe("formatHours", () => {
  it.each([
    { hours: null, expected: "—" },
    { hours: undefined, expected: "—" },
    { hours: 0, expected: "< 1h" },
    { hours: 0.5, expected: "< 1h" },
    { hours: 5, expected: "5h" },
    { hours: 25, expected: "1d 1h" },
    { hours: 49.7, expected: "2d 2h" },
    { hours: 168, expected: "7d 0h" },
    { hours: -1, expected: "< 1h" },
  ])("$hours → $expected", ({ hours, expected }) => {
    expect(formatHours(hours)).toBe(expected);
  });
});
