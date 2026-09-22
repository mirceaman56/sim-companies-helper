// whats_new.js
// Pure logic for the "What's new" panel.
//
// The changelog itself is built at release time by scripts/build-changelog.mjs
// and bundled as src/resources/changelog.json, so nothing here touches the
// network: no GitHub rate limit, no markdown scraping, works offline.
//
// Entries are English only by design. The panel's own chrome (section title,
// category headings, credit labels) still goes through t().

import changelog from "./resources/changelog.json";

const REPO_OWNER = "mirceaman56";
const REPO_NAME = "sim-companies-helper";

/** Render order, mirroring the category blocks in .github/release.yml. */
export const CATEGORY_ORDER = ["feature", "fix", "other"];

const CATEGORY_META = {
  feature: { icon: "✨", titleKey: "whatsNewCatFeature" },
  fix: { icon: "🐛", titleKey: "whatsNewCatFix" },
  other: { icon: "🔧", titleKey: "whatsNewCatOther" },
};

function parseVersion(version) {
  const parts = String(version || "")
    .replace(/^v/i, "")
    .split(".");
  return [Number(parts[0] || 0), Number(parts[1] || 0), Number(parts[2] || 0)];
}

export function compareVersions(a, b) {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export function releasePageUrl(version) {
  const v = String(version || "").trim();
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${encodeURIComponent(v)}`;
}

export function getCategoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.other;
}

/** The bundled changelog, newest version first. */
export function getChangelog() {
  return Array.isArray(changelog?.versions) ? changelog.versions : [];
}

/**
 * Versions released after `fromVersion` and up to `toVersion`, newest first.
 * An unknown or missing `fromVersion` yields nothing rather than the whole
 * history — a first install gets a welcome card, not a wall of old fixes.
 * @param {string} fromVersion
 * @param {string} toVersion
 * @param {{versions?: Array}} [source]
 */
export function getVersionsBetween(fromVersion, toVersion, source = null) {
  const versions = Array.isArray(source) ? source : getChangelog();
  if (!fromVersion || !toVersion) return [];

  return versions
    .filter((v) => v?.version)
    .filter((v) => compareVersions(v.version, fromVersion) > 0)
    .filter((v) => compareVersions(v.version, toVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The most recent `count` versions, for the always-available panel. */
export function getLatestVersions(count = 5, source = null) {
  const versions = Array.isArray(source) ? source : getChangelog();
  return [...versions]
    .filter((v) => v?.version)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, Math.max(0, count));
}

/** An entry's text, tolerating a malformed or empty entry. */
export function pickEntryText(entry) {
  return entry?.text ? String(entry.text) : "";
}

/**
 * People to thank for a version, split by role so the panel can label them.
 * Built at release time from PR authors and the authors of the issues those
 * PRs close, so nobody has to be listed by hand.
 * @param {{credits?: Array}} version
 * @returns {{contributors: Array, reporters: Array}}
 */
export function getCredits(version) {
  const credits = Array.isArray(version?.credits) ? version.credits : [];
  const valid = credits.filter((c) => c?.handle);
  return {
    contributors: valid.filter((c) => c.role !== "reporter"),
    reporters: valid.filter((c) => c.role === "reporter"),
  };
}

/** Entries of one version grouped into render order, empty groups dropped. */
export function groupEntriesByCategory(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return CATEGORY_ORDER.map((cat) => ({
    cat,
    entries: list.filter((e) => (e?.cat || "other") === cat),
  })).filter((group) => group.entries.length > 0);
}

/** Per-category counts across versions, for the toast's one-line summary. */
export function summarizeCounts(versions) {
  const counts = { feature: 0, fix: 0, other: 0, total: 0 };

  for (const version of Array.isArray(versions) ? versions : []) {
    for (const entry of Array.isArray(version?.entries) ? version.entries : []) {
      const cat = CATEGORY_ORDER.includes(entry?.cat) ? entry.cat : "other";
      counts[cat] += 1;
      counts.total += 1;
    }
  }

  return counts;
}

export const _testUtils = {
  compareVersions,
  getCredits,
  releasePageUrl,
  getVersionsBetween,
  getLatestVersions,
  pickEntryText,
  groupEntriesByCategory,
  summarizeCounts,
};
