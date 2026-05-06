import { describe, expect, it } from "vitest";

import {
  buildExecutiveOrganicGrowthSummary,
  formatOrganicGrowthCountdown,
  getExecutiveTrainingEndsAt,
  getNextOrganicGrowthAt,
  isExecutiveEligibleForOrganicGrowth,
} from "../src/executive_growth_calc.js";

describe("getNextOrganicGrowthAt", () => {
  it("returns same-day 14:00 UTC before the daily roll", () => {
    const targetAt = getNextOrganicGrowthAt(Date.parse("2026-05-06T13:15:00.000Z"));
    expect(targetAt.toISOString()).toBe("2026-05-06T14:00:00.000Z");
  });

  it("returns the current 14:00 UTC exactly at the daily roll", () => {
    const targetAt = getNextOrganicGrowthAt(Date.parse("2026-05-06T14:00:00.000Z"));
    expect(targetAt.toISOString()).toBe("2026-05-06T14:00:00.000Z");
  });

  it("rolls forward to next day after 14:00 UTC passes", () => {
    const targetAt = getNextOrganicGrowthAt(Date.parse("2026-05-06T14:00:00.001Z"));
    expect(targetAt.toISOString()).toBe("2026-05-07T14:00:00.000Z");
  });
});

describe("organic growth eligibility", () => {
  const targetAt = new Date("2026-05-06T14:00:00.000Z");

  it("treats executives without training as eligible", () => {
    expect(isExecutiveEligibleForOrganicGrowth({ id: 1, name: "Amy", currentTraining: null }, targetAt)).toBe(
      true,
    );
  });

  it("treats training that ends before target as eligible", () => {
    expect(
      isExecutiveEligibleForOrganicGrowth(
        {
          id: 2,
          name: "Ben",
          currentTraining: { datetime: "2026-05-05T10:59:59.000Z" },
        },
        targetAt,
      ),
    ).toBe(true);
  });

  it("treats training that ends exactly at target as eligible", () => {
    expect(
      isExecutiveEligibleForOrganicGrowth(
        {
          id: 3,
          name: "Cara",
          currentTraining: { datetime: "2026-05-05T11:00:00.000Z" },
        },
        targetAt,
      ),
    ).toBe(true);
  });

  it("treats training that ends after target as ineligible", () => {
    expect(
      isExecutiveEligibleForOrganicGrowth(
        {
          id: 4,
          name: "Drew",
          currentTraining: { datetime: "2026-05-05T11:00:01.000Z" },
        },
        targetAt,
      ),
    ).toBe(false);
  });

  it("treats invalid training timestamps as ineligible", () => {
    expect(
      isExecutiveEligibleForOrganicGrowth(
        {
          id: 5,
          name: "Elle",
          currentTraining: { datetime: "not-a-date" },
        },
        targetAt,
      ),
    ).toBe(false);
  });
});

describe("buildExecutiveOrganicGrowthSummary", () => {
  it("keeps API order and splits eligible from excluded executives", () => {
    const summary = buildExecutiveOrganicGrowthSummary(
      [
        { id: 1, name: "Amy", currentTraining: null },
        { id: 2, name: "Ben", currentTraining: { datetime: "2026-05-05T11:00:01.000Z" } },
        { id: 3, name: "Cara", currentTraining: { datetime: "2026-05-05T07:00:00.000Z" } },
      ],
      {
        nowMs: Date.parse("2026-05-06T13:00:00.000Z"),
      },
    );

    expect(summary.targetAt.toISOString()).toBe("2026-05-06T14:00:00.000Z");
    expect(summary.eligibleExecutives.map((executive) => executive.name)).toEqual(["Amy", "Cara"]);
    expect(summary.excludedExecutives.map((executive) => executive.name)).toEqual(["Ben"]);
  });
});

describe("format helpers", () => {
  it("formats countdown as HH:MM:SS", () => {
    expect(formatOrganicGrowthCountdown(3_661_000)).toBe("01:01:01");
  });

  it("calculates training end time from the API datetime", () => {
    const trainingEndsAt = getExecutiveTrainingEndsAt({ datetime: "2026-05-06T07:56:14.635Z" });
    expect(trainingEndsAt?.toISOString()).toBe("2026-05-07T10:56:14.635Z");
  });
});
