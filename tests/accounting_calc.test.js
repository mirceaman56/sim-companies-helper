import { describe, expect, it } from "vitest";

import {
  applySkillDiminishingReturns,
  buildAccountingSummary,
  computeAccountingFee,
  computeExecutiveLift,
  computeNetBonds,
  getActiveAcademyLevels,
  getActiveBankLevel,
  getContributingExecutives,
  getMarginalRate,
  getRawRoleSkill,
} from "../src/accounting_calc.js";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const LONG_AGO = "2026-01-01T00:00:00Z";

function exec(position, skills, extra = {}) {
  return {
    id: Math.random(),
    skills: { coo: 0, cfo: 0, cmo: 0, cto: 0, ...skills },
    currentWorkHistory: { position, start: LONG_AGO },
    currentTraining: null,
    ...extra,
  };
}

describe("computeAccountingFee", () => {
  it("is zero up to $3M", () => {
    expect(computeAccountingFee(0)).toBe(0);
    expect(computeAccountingFee(3_000_000)).toBe(0);
    expect(computeAccountingFee(-1_000_000)).toBe(0);
  });

  it("matches the game FAQ example ($137,918 over at 0.5% = $690)", () => {
    expect(computeAccountingFee(3_000_000 + 137_918)).toBe(690);
  });

  it("applies brackets marginally", () => {
    // 3M @0.5% + 3M @1% + 1M @1.5%
    expect(computeAccountingFee(10_000_000)).toBe(15_000 + 30_000 + 15_000);
    // all brackets up to 15M, plus 5M @3%
    expect(computeAccountingFee(20_000_000)).toBe(15_000 + 30_000 + 45_000 + 60_000 + 150_000);
  });

  it("reports the marginal rate reached", () => {
    expect(getMarginalRate(2_000_000)).toBe(0);
    expect(getMarginalRate(3_500_000)).toBe(0.005);
    expect(getMarginalRate(13_000_000)).toBe(0.02);
    expect(getMarginalRate(50_000_000)).toBe(0.03);
  });
});

describe("executive lift", () => {
  it("counts chief fully, role apprentice half, other chiefs a quarter", () => {
    const executives = [
      exec("f", { cfo: 8 }),
      exec("x", { cfo: 4 }),
      exec("o", { cfo: 4 }),
      exec("v", { cfo: 20 }), // COO apprentice: cfo skill ignored
      exec("1", { cfo: 20 }), // staff: ignored
    ];
    expect(getRawRoleSkill(executives, "cfo")).toBe(8 + 2 + 1);
  });

  it("applies diminishing returns above 60 and 80", () => {
    expect(applySkillDiminishingReturns(50)).toBe(50);
    expect(applySkillDiminishingReturns(70)).toBe(65);
    expect(applySkillDiminishingReturns(100)).toBe(75);
  });

  it("excludes settling-in, training, striking executives and locked apprentices", () => {
    const recent = new Date(NOW - 60 * 60 * 1000).toISOString();
    const executives = [
      exec("f", { cfo: 10 }),
      exec("o", { cfo: 4 }, { currentWorkHistory: { position: "o", start: recent } }),
      exec("m", { cfo: 4 }, { currentTraining: { training: "f", datetime: recent } }),
      exec("t", { cfo: 4 }, { strikeUntil: new Date(NOW + 1000).toISOString() }),
      exec("x", { cfo: 10 }),
    ];

    const lockedApprentice = getContributingExecutives(executives, { nowMs: NOW, academyLevels: 9 });
    expect(lockedApprentice).toHaveLength(1);

    const unlockedApprentice = getContributingExecutives(executives, { nowMs: NOW, academyLevels: 10 });
    expect(unlockedApprentice).toHaveLength(2);
  });

  it("keeps accelerated settle-in and finished training", () => {
    const recent = new Date(NOW - 60 * 60 * 1000).toISOString();
    const executives = [
      exec("f", { cfo: 10 }, { currentWorkHistory: { position: "f", start: recent, accelerated: true } }),
      exec("o", { cfo: 4 }, { currentTraining: { training: "o", datetime: LONG_AGO } }),
    ];
    expect(getContributingExecutives(executives, { nowMs: NOW })).toHaveLength(2);
  });

  it("multiplies effective CFO skill by $500k plus $50k per bank level", () => {
    const executives = [exec("f", { cfo: 8 })];
    const buildings = [{ kind: "n", size: 4 }];

    expect(computeExecutiveLift(executives, [], { nowMs: NOW })).toEqual({
      lift: 4_000_000,
      effectiveSkill: 8,
      bankLevel: 0,
    });
    expect(computeExecutiveLift(executives, buildings, { nowMs: NOW }).lift).toBe(8 * (500_000 + 4 * 50_000));
  });

  it("sums academy levels and ignores busy buildings", () => {
    const buildings = [
      { kind: "y", size: 6 },
      { kind: "y", size: 5 },
      { kind: "y", size: 3, busy: { expanding: true } },
      { kind: "n", size: 2, busy: { category: "b" } },
      { kind: "N", size: 9 },
    ];
    expect(getActiveAcademyLevels(buildings)).toBe(11);
    expect(getActiveBankLevel(buildings)).toBe(0);
  });
});

describe("bonds and summary", () => {
  it("values bonds at $5,000 per unit, owned minus sold", () => {
    expect(computeNetBonds([{ amount: 100 }, { amount: 20 }], [{ amount: 40 }])).toBe(400_000);
    expect(computeNetBonds(null, undefined)).toBe(0);
  });

  it("builds the FAQ example summary", () => {
    const summary = buildAccountingSummary({ cash: 7_137_918, netBonds: 0, lift: 4_000_000 });
    expect(summary).toMatchObject({
      base: 3_137_918,
      freeThreshold: 7_000_000,
      headroom: -137_918,
      fee: 690,
      marginalRate: 0.005,
      isOverThreshold: true,
    });
  });

  it("reports headroom when under the threshold", () => {
    const summary = buildAccountingSummary({ cash: 1_329_520, netBonds: 500_000, lift: 0 });
    expect(summary.headroom).toBe(1_170_480);
    expect(summary.fee).toBe(0);
    expect(summary.isOverThreshold).toBe(false);
  });
});
