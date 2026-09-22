import { describe, expect, it } from "vitest";

import {
  categoryFromLabels,
  extractClosedIssueNumbers,
  isCreditableHandle,
  makeCredit,
  makeNameCredit,
  mergeCredits,
  mergeVersions,
  normalizeEntryText,
  parseReleaseBody,
  parseReleaseCredits,
} from "../scripts/lib/changelog-format.mjs";

describe("categoryFromLabels", () => {
  it.each([
    [["bug"], "fix"],
    [["fix"], "fix"],
    [["feature"], "feature"],
    [["enhancement"], "feature"],
    [["something-else"], "other"],
    [[], "other"],
  ])("maps %s", (labels, expected) => {
    expect(categoryFromLabels(labels)).toBe(expected);
  });

  it("accepts the GitHub label object shape", () => {
    expect(categoryFromLabels([{ name: "Bug" }])).toBe("fix");
  });

  it("drops changes players cannot see", () => {
    // Docs/CI/dependency work is real but belongs in the git log, not in a
    // player-facing changelog.
    expect(categoryFromLabels(["documentation"])).toBeNull();
    expect(categoryFromLabels(["dependencies"])).toBeNull();
    expect(categoryFromLabels(["feature", "ci"])).toBeNull();
  });
});

describe("normalizeEntryText", () => {
  it("strips author, URL and issue references from a generated bullet", () => {
    const raw =
      "Contracts UI - number input instead of dropdown (Fixes #155) by @mirceaman56 in https://github.com/o/r/pull/158";
    expect(normalizeEntryText(raw)).toEqual({
      text: "Contracts UI - number input instead of dropdown",
      pr: 158,
    });
  });

  it("keeps the PR number from a squash-style title", () => {
    expect(normalizeEntryText("Fix the thing (#42)")).toEqual({ text: "Fix the thing", pr: 42 });
  });

  it("strips a hand-written trailing attribution", () => {
    expect(normalizeEntryText("Users can now create contract rule templates - by Cauadsm")?.text).toBe(
      "Users can now create contract rule templates",
    );
  });

  it("strips an issue reference GitHub truncated mid-title", () => {
    // Real v0.27.1 bullet: the PR title itself was cut off by GitHub, so the
    // reference never closes and a closed-paren rule alone leaves "(Fixes…".
    expect(
      normalizeEntryText(
        "Fixed contract ui not taking sourcing costs into consideration (Fixes… by @dev in https://github.com/o/r/pull/147",
      ),
    ).toEqual({ text: "Fixed contract ui not taking sourcing costs into consideration", pr: 147 });
  });

  it("moves a hand-written thank-you out of the entry text", () => {
    // The person is credited in the structured credits list instead, so
    // leaving the parenthetical here would name them twice.
    expect(
      normalizeEntryText("fix price Profit Analysis at the produced quality (ty [someone](https://gh/someone)!)")
        ?.text,
    ).toBe("Fix price Profit Analysis at the produced quality");
  });

  it("capitalizes the first letter", () => {
    expect(normalizeEntryText("removed hardcoded text from calculators")?.text).toBe(
      "Removed hardcoded text from calculators",
    );
  });

  it.each([
    ["@mirceaman56 made their first contribution"],
    ["Feature/i18n"],
    ["fix/contract-discounts"],
    ["Bump vite from 5.0.1 to 5.4.21"],
    ["**Full Changelog**: https://github.com/o/r/compare/v1...v2"],
    [""],
    ["   "],
  ])("rejects junk line %s", (raw) => {
    expect(normalizeEntryText(raw)).toBeNull();
  });
});

describe("parseReleaseBody", () => {
  it("keeps the categories GitHub already assigned", () => {
    const body = `## What's Changed
### 🐛 Bug Fixes
* Fixed the production UI after the game update by @dev in https://github.com/o/r/pull/157
### ✨ New Features
* Added a margin column by @dev in https://github.com/o/r/pull/150

**Full Changelog**: https://github.com/o/r/compare/v0.29.0...v0.29.1`;

    expect(parseReleaseBody(body)).toEqual([
      { cat: "fix", pr: 157, text: "Fixed the production UI after the game update" },
      { cat: "feature", pr: 150, text: "Added a margin column" },
    ]);
  });

  it("skips the New Contributors section", () => {
    const body = `## What's Changed
### ✨ New Features
* Real feature by @dev in https://github.com/o/r/pull/3

## New Contributors
* @someone made their first contribution in https://github.com/o/r/pull/1`;

    expect(parseReleaseBody(body).map((e) => e.text)).toEqual(["Real feature"]);
  });

  it("defaults to other when the body has no category headings", () => {
    const body = `## What's Changed
* Tweaked the sidebar by @dev in https://github.com/o/r/pull/9`;
    expect(parseReleaseBody(body)).toEqual([{ cat: "other", pr: 9, text: "Tweaked the sidebar" }]);
  });

  it("deduplicates repeated bullets", () => {
    const body = `### 🐛 Bug Fixes
* Same thing by @dev in https://github.com/o/r/pull/1
* Same thing by @dev in https://github.com/o/r/pull/2`;
    expect(parseReleaseBody(body)).toHaveLength(1);
  });

  it("returns nothing for a body that is only a changelog link", () => {
    expect(parseReleaseBody("**Full Changelog**: https://github.com/o/r/compare/v0.1.2...v0.1.3")).toEqual([]);
  });
});

describe("mergeVersions", () => {
  const existing = [
    { version: "0.29.1", entries: [{ cat: "fix", text: "old" }] },
    { version: "0.29.0", entries: [{ cat: "feature", text: "older" }] },
  ];

  it("prepends new versions, newest first", () => {
    const merged = mergeVersions(existing, [{ version: "0.29.2", entries: [{ cat: "fix", text: "new" }] }]);
    expect(merged.map((v) => v.version)).toEqual(["0.29.2", "0.29.1", "0.29.0"]);
  });

  it("replaces a rebuilt version so re-runs are idempotent", () => {
    const merged = mergeVersions(existing, [
      { version: "0.29.1", entries: [{ cat: "fix", text: "rebuilt" }] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].entries[0].text).toBe("rebuilt");
  });

  it("caps the stored history", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      version: `0.${i}.0`,
      entries: [{ cat: "fix", text: `e${i}` }],
    }));
    const merged = mergeVersions(many, [], { limit: 30 });
    expect(merged).toHaveLength(30);
    expect(merged[0].version).toBe("0.39.0");
  });

  it("drops versions whose entries were all filtered out", () => {
    const merged = mergeVersions([{ version: "0.1.2", entries: [] }], []);
    expect(merged).toEqual([]);
  });
});

describe("credits", () => {
  it("excludes the maintainer and bots by default", () => {
    expect(isCreditableHandle("mirceaman56")).toBe(false);
    expect(isCreditableHandle("mirceaman56", { includeOwner: true })).toBe(true);
    expect(isCreditableHandle("dependabot[bot]")).toBe(false);
    expect(isCreditableHandle("github-actions")).toBe(false);
    expect(isCreditableHandle("irenes-cv")).toBe(true);
  });

  it("links a handle to its GitHub profile", () => {
    expect(makeCredit("@irenes-cv", "reporter")).toEqual({
      handle: "irenes-cv",
      role: "reporter",
      url: "https://github.com/irenes-cv",
    });
  });

  it("keeps a name with no handle unlinked", () => {
    // "- by Cauadsm" gives a name that cannot be verified as a GitHub login.
    expect(makeNameCredit("Cauadsm", "contributor")).toEqual({
      handle: "Cauadsm",
      role: "contributor",
      url: null,
    });
  });

  it("deduplicates people and ranks contributing over reporting", () => {
    const merged = mergeCredits(
      [makeCredit("alice", "reporter")],
      [makeCredit("alice", "contributor"), makeCredit("bob", "reporter")],
    );
    expect(merged).toEqual([
      { handle: "alice", role: "contributor", url: "https://github.com/alice" },
      { handle: "bob", role: "reporter", url: "https://github.com/bob" },
    ]);
  });

  it("reads the PR author off a generated release body", () => {
    const body = `### 🔧 Other Changes
* Fix warehouse toggle by @Cauadsm in https://github.com/o/r/pull/148`;
    expect(parseReleaseCredits(body)).toEqual([
      { handle: "Cauadsm", role: "contributor", url: "https://github.com/Cauadsm" },
    ]);
  });

  it("reads a hand-written thank-you as a reporter credit", () => {
    const body = "* fix price analysis (ty [astermaster9-gif](https://github.com/astermaster9-gif)!)";
    expect(parseReleaseCredits(body)).toEqual([
      { handle: "astermaster9-gif", role: "reporter", url: "https://github.com/astermaster9-gif" },
    ]);
  });

  it("reads a bare name credit with no handle", () => {
    expect(parseReleaseCredits("* Contract rule templates - by Cauadsm")).toEqual([
      { handle: "Cauadsm", role: "contributor", url: null },
    ]);
  });

  it("does not mistake ordinary prose for a name", () => {
    expect(parseReleaseCredits("* Sorted by default and grouped by the new key")).toEqual([]);
  });

  it("omits the maintainer's own releases from credits", () => {
    const body = "* Something by @mirceaman56 in https://github.com/o/r/pull/1";
    expect(parseReleaseCredits(body)).toEqual([]);
    expect(parseReleaseCredits(body, { includeOwner: true })).toHaveLength(1);
  });
});

describe("extractClosedIssueNumbers", () => {
  it("reads references from a title and a body", () => {
    expect(extractClosedIssueNumbers("Contracts UI (Fixes #155)", "also closes #12, resolves #13")).toEqual([
      155, 12, 13,
    ]);
  });

  it("deduplicates and ignores bare numbers", () => {
    expect(extractClosedIssueNumbers("fixes #7 and fixes #7", "version 2.0 of #x")).toEqual([7]);
  });

  it("returns nothing when no issue is referenced", () => {
    expect(extractClosedIssueNumbers("Plain title", null)).toEqual([]);
  });
});
