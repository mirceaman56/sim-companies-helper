import { describe, expect, it } from "vitest";

import {
  compareVersions,
  getCredits,
  getLatestVersions,
  getVersionsBetween,
  groupEntriesByCategory,
  pickEntryText,
  releasePageUrl,
  summarizeCounts,
} from "../src/whats_new.js";

const FIXTURE = [
  {
    version: "0.29.2",
    date: "2026-09-21",
    entries: [{ cat: "feature", pr: 158, text: "Contract discounts accept any value" }],
  },
  {
    version: "0.29.1",
    date: "2026-09-18",
    entries: [{ cat: "fix", pr: 157, text: "Production panel works again" }],
  },
  {
    version: "0.29.0",
    date: "2026-09-11",
    entries: [
      { cat: "feature", pr: 154, text: "API limit warning" },
      { cat: "other", pr: 153, text: "Smaller bundle" },
    ],
  },
];

describe("compareVersions", () => {
  it.each([
    ["0.29.2", "0.29.1", 1],
    ["0.29.1", "0.29.2", -1],
    ["0.29.2", "0.29.2", 0],
    ["v0.30.0", "0.29.9", 1],
    ["1.0.0", "0.99.99", 1],
  ])("compares %s to %s", (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });
});

describe("releasePageUrl", () => {
  it("points at the tag page", () => {
    expect(releasePageUrl("0.29.2")).toBe(
      "https://github.com/mirceaman56/sim-companies-helper/releases/tag/v0.29.2",
    );
  });
});

describe("getVersionsBetween", () => {
  it("returns versions after the last seen one, newest first", () => {
    const result = getVersionsBetween("0.29.0", "0.29.2", FIXTURE);
    expect(result.map((v) => v.version)).toEqual(["0.29.2", "0.29.1"]);
  });

  it("includes a patch release — the old minor gate swallowed those", () => {
    const result = getVersionsBetween("0.29.1", "0.29.2", FIXTURE);
    expect(result.map((v) => v.version)).toEqual(["0.29.2"]);
  });

  it("never walks the whole history when the last seen version is unknown", () => {
    // A fresh install must get the welcome card, not every old fix.
    expect(getVersionsBetween(null, "0.29.2", FIXTURE)).toEqual([]);
    expect(getVersionsBetween("", "0.29.2", FIXTURE)).toEqual([]);
  });

  it("excludes versions newer than the installed one", () => {
    expect(getVersionsBetween("0.28.0", "0.29.0", FIXTURE).map((v) => v.version)).toEqual(["0.29.0"]);
  });
});

describe("getLatestVersions", () => {
  it("caps the panel to the newest versions", () => {
    expect(getLatestVersions(2, FIXTURE).map((v) => v.version)).toEqual(["0.29.2", "0.29.1"]);
  });
});

describe("pickEntryText", () => {
  it("returns the entry text", () => {
    expect(pickEntryText(FIXTURE[0].entries[0])).toBe("Contract discounts accept any value");
  });

  it("survives a malformed entry", () => {
    expect(pickEntryText(null)).toBe("");
    expect(pickEntryText({})).toBe("");
    expect(pickEntryText({ text: null })).toBe("");
  });
});

describe("groupEntriesByCategory", () => {
  it("orders groups and drops empty ones", () => {
    const groups = groupEntriesByCategory(FIXTURE[2].entries);
    expect(groups.map((g) => g.cat)).toEqual(["feature", "other"]);
    expect(groups[0].entries).toHaveLength(1);
  });

  it("treats an unknown category as other", () => {
    const groups = groupEntriesByCategory([{ cat: "wat", text: "x" }]);
    expect(groups.map((g) => g.cat)).toEqual([]);
  });
});

describe("summarizeCounts", () => {
  it("counts per category across versions", () => {
    expect(summarizeCounts(FIXTURE)).toEqual({ feature: 2, fix: 1, other: 1, total: 4 });
  });

  it("returns zeroes for an empty range", () => {
    expect(summarizeCounts([])).toEqual({ feature: 0, fix: 0, other: 0, total: 0 });
  });

  it("buckets an unknown category into other", () => {
    const counts = summarizeCounts([{ version: "1.0.0", entries: [{ cat: "nope", text: "x" }] }]);
    expect(counts).toEqual({ feature: 0, fix: 0, other: 1, total: 1 });
  });
});

describe("getCredits", () => {
  it("splits contributors from reporters", () => {
    const version = {
      credits: [
        { handle: "alice", role: "contributor", url: "https://github.com/alice" },
        { handle: "bob", role: "reporter", url: "https://github.com/bob" },
      ],
    };
    expect(getCredits(version).contributors.map((c) => c.handle)).toEqual(["alice"]);
    expect(getCredits(version).reporters.map((c) => c.handle)).toEqual(["bob"]);
  });

  it("treats a credit with no role as a contributor", () => {
    expect(getCredits({ credits: [{ handle: "alice" }] }).contributors).toHaveLength(1);
  });

  it("handles a version built before credits existed", () => {
    expect(getCredits({ version: "0.1.0" })).toEqual({ contributors: [], reporters: [] });
    expect(getCredits(null)).toEqual({ contributors: [], reporters: [] });
  });

  it("drops entries without a handle", () => {
    expect(getCredits({ credits: [{ role: "reporter" }, null] })).toEqual({
      contributors: [],
      reporters: [],
    });
  });
});
