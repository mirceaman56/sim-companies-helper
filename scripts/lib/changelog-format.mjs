// Pure helpers for building src/resources/changelog.json.
// Kept free of I/O so tests/changelog_build.test.js can cover them directly.

/**
 * Label -> category id. Mirrors the category blocks in .github/release.yml,
 * which are themselves driven by .github/labeler.yml (branch prefix -> label).
 * Categories are rendered client-side through t(), so the ids stay stable and
 * language-free here.
 */
export const CATEGORY_BY_LABEL = {
  bug: "fix",
  fix: "fix",
  feature: "feature",
  enhancement: "feature",
};

export const CATEGORY_ORDER = ["feature", "fix", "other"];

/** Headings GitHub writes for each category block, matched loosely. */
const CATEGORY_BY_HEADING = [
  [/bug\s*fixes/i, "fix"],
  [/new\s*features/i, "feature"],
  [/other\s*changes/i, "other"],
];

/**
 * Labels that mean "not worth telling a player about".
 * Docs/CI/dependency churn is real work but it is not a user-visible change.
 */
const IGNORED_LABELS = new Set(["documentation", "docs", "ci", "chore", "dependencies", "internal"]);

/**
 * Entry texts that carry no user-facing meaning. These come from GitHub's own
 * boilerplate ("New Contributors") or from PRs whose title is just the branch
 * name, which the old runtime scraper happily showed to players.
 */
const JUNK_PATTERNS = [
  /made their first contribution/i,
  /^bump\s+\S+\s+from\s+\S+\s+to\s+\S+/i,
  /^full changelog/i,
  /^merge (branch|pull request)/i,
  // Bare branch names: "Feature/i18n", "fix/contract-discounts"
  /^(feat|feature|fix|bugfix|hotfix|patch|bug|improve|refactor|perf|enhancement|chore|docs)\/\S*$/i,
];

export function categoryFromLabels(labels) {
  const names = (Array.isArray(labels) ? labels : [])
    .map((l) => String(typeof l === "string" ? l : l?.name || "").toLowerCase())
    .filter(Boolean);

  if (names.some((n) => IGNORED_LABELS.has(n))) return null;

  for (const name of names) {
    const category = CATEGORY_BY_LABEL[name];
    if (category) return category;
  }

  return "other";
}

export function categoryFromHeading(heading) {
  const text = String(heading || "");
  for (const [pattern, category] of CATEGORY_BY_HEADING) {
    if (pattern.test(text)) return category;
  }
  return null;
}

/**
 * Turns a raw PR title (or a GitHub-generated release bullet) into the string
 * players read. Returns null when the line carries no user-facing meaning.
 *
 * Strips, in order: markdown links, raw URLs, "by @user in ...", the trailing
 * PR reference (captured as `pr`), and issue references like "(Fixes #155)" —
 * the old scraper left those in as a naked "(Fixes 155)".
 *
 * @param {string} raw
 * @returns {{text: string, pr: number|null}|null}
 */
export function normalizeEntryText(raw) {
  let out = String(raw || "").trim();
  if (!out) return null;

  // The PR number has to be read before the URLs go: GitHub's generated
  // bullets carry it only as ".../pull/158", not as a trailing "(#158)".
  let pr = null;
  const prUrlMatch = out.match(/\/pull\/(\d+)\b/);
  if (prUrlMatch) pr = Number(prUrlMatch[1]);

  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/https?:\/\/\S+/gi, " ");
  out = out.replace(/\s+by\s+@[a-z0-9_-]+/gi, " ");
  out = out.replace(/\s+in\s*$/i, " ");

  const prMatch = out.match(/\(#(\d+)\)\s*$/);
  if (prMatch) {
    pr = pr ?? Number(prMatch[1]);
    out = out.slice(0, prMatch.index);
  }

  // Trailing attribution someone typed by hand: "... - by Cauadsm".
  out = out.replace(/\s*[-–—]?\s*by\s+[A-Za-z][\w.'-]*\s*$/i, " ");

  // A hand-written thank-you inside the title: "(ty someone!)". The person is
  // picked up as a structured credit, so keeping it here would name them twice.
  out = out.replace(/\s*\(\s*(?:ty|thanks|thx|thank you|reported by|credit)\b[^)]*\)/gi, " ");

  // "(Fixes #155)", "(fixes #155, #156)", "[closes #12]" — issue bookkeeping.
  out = out.replace(/[([]\s*(fixes|fix|closes|close|resolves|resolve)\b[^)\]]*[)\]]/gi, " ");
  // The same, left unterminated because GitHub truncated the PR title:
  // "... into consideration (Fixes…"
  out = out.replace(/\s*[([]\s*(fixes|fix|closes|close|resolves|resolve)\b[^)\]]*$/i, " ");
  // Any other parenthetical the truncation cut off mid-way.
  out = out.replace(/\s*\([^)]*[…]\s*$/, " ");
  out = out.replace(/\b(fixes|closes|resolves)\s+#\d+/gi, " ");
  out = out.replace(/#(\d+)\b/g, " ");

  out = out.replace(/[`*_>]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/^[-–—:,.\s]+/, "").replace(/[-–—:,\s]+$/, "");

  if (!out) return null;
  if (JUNK_PATTERNS.some((p) => p.test(out))) return null;
  // A single word is almost always a branch fragment rather than a sentence.
  if (!/\s/.test(out) && out.length < 12) return null;

  return { text: out.charAt(0).toUpperCase() + out.slice(1), pr };
}

/**
 * Parses one GitHub-generated release body into categorized entries. Used by
 * --seed to backfill history from releases that were already published.
 * @param {string} body
 * @returns {Array<{cat: string, pr: number|null, text: string}>}
 */
export function parseReleaseBody(body) {
  const lines = String(body || "").split(/\r?\n/);
  const entries = [];
  const seen = new Set();

  let category = "other";
  let skipSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#+\s+(.*)$/);
    if (heading) {
      const mapped = categoryFromHeading(heading[1]);
      // "New Contributors" and friends: no mapping, so stop collecting until
      // the next heading that does map.
      skipSection = mapped === null && !/what'?s changed/i.test(heading[1]);
      if (mapped) category = mapped;
      continue;
    }

    if (skipSection) continue;

    const bullet = line.match(/^(?:[*\-•]|\d+\.)\s+(.*)$/);
    if (!bullet) continue;

    const normalized = normalizeEntryText(bullet[1]);
    if (!normalized) continue;

    const dedupeKey = normalized.text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    entries.push({ cat: category, pr: normalized.pr, text: normalized.text });
  }

  return entries;
}

/**
 * The repo owner is the maintainer: crediting them in their own extension is
 * noise, so they are dropped unless --credit-owner is passed.
 */
export const REPO_OWNER_HANDLE = "mirceaman56";

const BOT_HANDLE = /\[bot\]$|^dependabot$|^github-actions$/i;

function isCreditableHandle(handle, { includeOwner = false } = {}) {
  if (!handle) return false;
  if (BOT_HANDLE.test(handle)) return false;
  if (!includeOwner && handle.toLowerCase() === REPO_OWNER_HANDLE.toLowerCase()) return false;
  return true;
}

/**
 * Credit entry for one person, deduplicated by handle downstream.
 * @param {string} handle GitHub login
 * @param {"contributor"|"reporter"} role
 */
export function makeCredit(handle, role) {
  const name = String(handle || "").replace(/^@/, "");
  return { handle: name, role, url: `https://github.com/${encodeURIComponent(name)}` };
}

/**
 * Someone credited by name only ("- by Cauadsm"), with no @handle to link to.
 * The name still gets shown; it just is not a link, since it cannot be
 * verified as a GitHub login.
 */
export function makeNameCredit(name, role) {
  return { handle: String(name || "").trim(), role, url: null };
}

/** Words that follow "by" in ordinary prose rather than naming a person. */
const NOT_A_NAME = new Set([
  "default",
  "the",
  "a",
  "an",
  "this",
  "that",
  "now",
  "adding",
  "removing",
  "using",
  "making",
  "moving",
  "clicking",
]);

/**
 * Merges credit lists, keeping one row per person. "contributor" outranks
 * "reporter" when the same person did both.
 */
export function mergeCredits(...lists) {
  const byHandle = new Map();

  for (const credit of lists.flat()) {
    if (!credit?.handle) continue;
    const key = credit.handle.toLowerCase();
    const existing = byHandle.get(key);
    if (!existing) {
      byHandle.set(key, credit);
      continue;
    }
    if (existing.role === "reporter" && credit.role === "contributor") {
      byHandle.set(key, credit);
    }
  }

  return [...byHandle.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === "contributor" ? -1 : 1;
    return a.handle.toLowerCase().localeCompare(b.handle.toLowerCase());
  });
}

/**
 * Credits recoverable from a published release body: the "by @user" author on
 * each bullet, the "New Contributors" section, and any @handle the author
 * thanked by hand ("(ty @someone!)"). Used by --seed, where the PR objects are
 * not fetched.
 * @param {string} body
 * @param {{includeOwner?: boolean}} [options]
 */
export function parseReleaseCredits(body, options = {}) {
  const text = String(body || "");
  const contributors = [];
  const reporters = [];

  for (const match of text.matchAll(/\bby\s+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi)) {
    if (isCreditableHandle(match[1], options)) contributors.push(makeCredit(match[1], "contributor"));
  }

  // "- by Cauadsm": a maintainer-typed credit with no handle to link to.
  for (const match of text.matchAll(/\bby\s+([A-Z][A-Za-z0-9.'-]{2,})\b(?!\s*\/)/g)) {
    const name = match[1];
    if (NOT_A_NAME.has(name.toLowerCase())) continue;
    if (!isCreditableHandle(name, options)) continue;
    contributors.push(makeNameCredit(name, "contributor"));
  }

  // A hand-written thank-you, as a plain @handle or a markdown link to a
  // profile: "(ty [someone](https://github.com/someone)!)".
  const thanks = text.matchAll(
    /\((?:ty|thanks|thx|thank you|reported by|credit)[^)]*?(?:@|github\.com\/)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi,
  );
  for (const match of thanks) {
    if (isCreditableHandle(match[1], options)) reporters.push(makeCredit(match[1], "reporter"));
  }

  return mergeCredits(contributors, reporters);
}

/** Issue numbers a PR says it closes, read from its title and body. */
export function extractClosedIssueNumbers(...texts) {
  const numbers = [];
  for (const text of texts) {
    for (const match of String(text || "").matchAll(
      /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\b[\s:]*#(\d+)/gi,
    )) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && !numbers.includes(value)) numbers.push(value);
    }
  }
  return numbers;
}

export { isCreditableHandle };

export function compareSemver(a, b) {
  const parse = (v) =>
    String(v || "")
      .replace(/^v/i, "")
      .split(".")
      .map((n) => Number(n) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

/**
 * Merges freshly built versions into the existing file, newest first, keeping
 * at most `limit` of them. A rebuilt version replaces its stored copy so a
 * re-run is idempotent.
 */
export function mergeVersions(existing, incoming, { limit = 30 } = {}) {
  const byVersion = new Map();
  for (const entry of Array.isArray(existing) ? existing : []) {
    if (entry?.version) byVersion.set(String(entry.version), entry);
  }
  for (const entry of Array.isArray(incoming) ? incoming : []) {
    if (entry?.version) byVersion.set(String(entry.version), entry);
  }

  return [...byVersion.values()]
    .filter((v) => Array.isArray(v.entries) && v.entries.length > 0)
    .sort((a, b) => compareSemver(b.version, a.version))
    .slice(0, limit);
}
