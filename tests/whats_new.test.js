import { describe, expect, it } from "vitest";

import { _testUtils } from "../src/whats_new.js";

describe("minorKey", () => {
  it.each([
    ["0.15.5", "0.15"],
    ["0.15.6", "0.15"],
    ["0.16.0", "0.16"],
    ["1.0.0", "1.0"],
  ])("%s -> %s", (version, expected) => {
    expect(_testUtils.minorKey(version)).toBe(expected);
  });
});

describe("compareVersions", () => {
  it.each([
    ["0.15.0", "0.15.1", -1],
    ["0.16.0", "0.15.9", 1],
    ["1.0.0", "1.0.0", 0],
    ["v0.15.2", "0.15.10", -1],
  ])("%s vs %s", (a, b, expected) => {
    const res = _testUtils.compareVersions(a, b);
    expect(Math.sign(res)).toBe(Math.sign(expected));
  });
});

describe("release urls", () => {
  it("builds the API and page URLs for a version", () => {
    expect(_testUtils.releaseApiUrl("0.15.5")).toContain("/releases/tags/v0.15.5");
    expect(_testUtils.releasePageUrl("0.15.5")).toContain("/releases/tag/v0.15.5");
  });
});

describe("extractHighlights", () => {
  it("extracts bullet highlights, stripping author/url noise", () => {
    const body = `
## What's Changed

* fix: clarify local persistence in privacy policy by @someone in https://github.com/x/y/pull/45
* feat: add market alerts by @dev in https://github.com/x/y/pull/12
* docs: update readme (#99)

\`\`\`
* ignore code blocks
\`\`\`
`;

    expect(_testUtils.extractHighlights(body)).toEqual([
      "Fixed: clarify local persistence in privacy policy",
      "New: add market alerts",
      "Updated: update readme",
    ]);
  });
});

describe("collectHighlightsFromReleases", () => {
  it("collects highlights from releases after a version", () => {
    const releases = [
      { tag_name: "v0.15.1", prerelease: false, body: "* fix: patch one" },
      { tag_name: "v0.15.2", prerelease: false, body: "* fix: patch two" },
      { tag_name: "v0.16.0", prerelease: false, body: "* feat: major update" },
    ];

    const items = _testUtils.collectHighlightsFromReleases(releases, "0.15.0", "0.16.0", { limit: 10 });
    expect(items).toEqual(["Fixed: patch one", "Fixed: patch two", "New: major update"]);
  });
});
