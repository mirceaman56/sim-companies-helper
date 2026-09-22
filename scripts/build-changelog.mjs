// Builds src/resources/changelog.json, the data the "What's new" panel renders.
//
// Two modes:
//   default   one version, from merged PR labels + titles (what CI runs)
//   --seed    backfill history from the release notes GitHub already published
//
// Entry text is never written by hand: it is the PR title, normalized. The
// changelog is English only by design — UI chrome around it is localized
// through t(), but the release entries themselves are not translated.

import fs from "node:fs";
import path from "node:path";

import {
  categoryFromLabels,
  compareSemver,
  extractClosedIssueNumbers,
  isCreditableHandle,
  makeCredit,
  mergeCredits,
  mergeVersions,
  normalizeEntryText,
  parseReleaseBody,
  parseReleaseCredits,
} from "./lib/changelog-format.mjs";

const REPO_OWNER = "mirceaman56";
const REPO_NAME = "sim-companies-helper";
const API_ROOT = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "public", "manifest.json");
const outputPath = path.join(repoRoot, "src", "resources", "changelog.json");

function printHelp() {
  console.log(`Usage: node scripts/build-changelog.mjs [options]

Writes src/resources/changelog.json from merged pull requests.

Options:
  --version=<x.y.z>    Version to build (default: public/manifest.json version)
  --from=<x.y.z>       Previous version to diff against (default: previous release tag)
  --seed               Backfill history from published GitHub release notes
  --seed-count=<n>     Versions to backfill in --seed mode (default: 10)
  --limit-versions=<n> Versions kept in the file (default: 30)
  --credit-owner       Also credit the repo owner (excluded by default)
  --dry-run            Print the result instead of writing it
  --help               Show this help

Auth:
  GITHUB_TOKEN is used when present (5000 req/h). Without it the public
  limit of 60 req/h applies, which is enough for one version but not for a
  large --seed run.`);
}

function parseArgs(argv) {
  const options = {
    version: null,
    from: null,
    seed: false,
    seedCount: 10,
    limitVersions: 30,
    creditOwner: false,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--seed") options.seed = true;
    else if (arg === "--credit-owner") options.creditOwner = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--version=")) options.version = arg.slice(10).replace(/^v/i, "");
    else if (arg.startsWith("--from=")) options.from = arg.slice(7).replace(/^v/i, "");
    else if (arg.startsWith("--seed-count=")) options.seedCount = Number(arg.slice(13)) || 10;
    else if (arg.startsWith("--limit-versions=")) options.limitVersions = Number(arg.slice(17)) || 30;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function githubJson(url) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}): ${url}`);
  }
  return response.json();
}

function readManifestVersion() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return String(manifest.version);
}

function readExisting() {
  if (!fs.existsSync(outputPath)) return { versions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    return { versions: Array.isArray(parsed?.versions) ? parsed.versions : [] };
  } catch {
    return { versions: [] };
  }
}

/** All published, non-prerelease releases, newest first. */
async function fetchReleases() {
  const releases = await githubJson(`${API_ROOT}/releases?per_page=100`);
  return (Array.isArray(releases) ? releases : [])
    .filter((r) => !r?.prerelease && /^v?\d+\.\d+\.\d+$/.test(String(r?.tag_name || "")))
    .sort((a, b) => compareSemver(b.tag_name, a.tag_name));
}

/**
 * The version released just before `version`, so the default diff range needs
 * no bookkeeping of its own.
 */
function previousVersionOf(releases, version) {
  const older = releases.filter((r) => compareSemver(r.tag_name, version) < 0);
  return older.length > 0 ? String(older[0].tag_name).replace(/^v/i, "") : null;
}

/**
 * Everyone to thank for one PR: whoever opened it, plus whoever reported the
 * issues it closes. Both come straight from the API, so the credits list needs
 * no hand maintenance.
 */
async function fetchCreditsForPullRequest(pr, options) {
  const credits = [];

  const author = pr?.user?.login;
  if (isCreditableHandle(author, { includeOwner: options.creditOwner })) {
    credits.push(makeCredit(author, "contributor"));
  }

  const issueNumbers = extractClosedIssueNumbers(pr?.title, pr?.body);
  for (const number of issueNumbers) {
    try {
      const issue = await githubJson(`${API_ROOT}/issues/${number}`);
      // A "Fixes #N" pointing at another PR is bookkeeping, not a report.
      if (issue?.pull_request) continue;
      const reporter = issue?.user?.login;
      if (isCreditableHandle(reporter, { includeOwner: options.creditOwner })) {
        credits.push(makeCredit(reporter, "reporter"));
      }
    } catch (error) {
      console.warn(`[changelog] issue #${number}: ${error?.message || error}`);
    }
  }

  return credits;
}

/**
 * Pull requests merged between two tags, read from the squash commits in the
 * compare range. Labels come from the PR itself, so the category matches what
 * .github/release.yml would have put in the release notes.
 */
async function fetchEntriesFromPullRequests(fromVersion, toRef, options) {
  const compare = await githubJson(`${API_ROOT}/compare/v${fromVersion}...${toRef}`);
  const commits = Array.isArray(compare?.commits) ? compare.commits : [];

  const prNumbers = [];
  for (const commit of commits) {
    const subject = String(commit?.commit?.message || "").split("\n")[0];
    const match = subject.match(/\(#(\d+)\)\s*$/) || subject.match(/^Merge pull request #(\d+)\b/);
    if (match) {
      const number = Number(match[1]);
      if (!prNumbers.includes(number)) prNumbers.push(number);
    }
  }

  const entries = [];
  const credits = [];
  const seen = new Set();

  for (const number of prNumbers) {
    const pr = await githubJson(`${API_ROOT}/pulls/${number}`);
    const category = categoryFromLabels(pr?.labels);
    if (!category) continue; // docs/CI/dependency work: not a player-visible change

    const normalized = normalizeEntryText(pr?.title);
    if (!normalized) continue;

    const dedupeKey = normalized.text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    entries.push({ cat: category, pr: number, text: normalized.text });
    credits.push(...(await fetchCreditsForPullRequest(pr, options)));
  }

  return { entries, credits: mergeCredits(credits) };
}

async function buildSeedVersions(releases, options) {
  const selected = releases.slice(0, Math.max(1, options.seedCount));
  const versions = [];

  for (const release of selected) {
    const version = String(release.tag_name).replace(/^v/i, "");
    const entries = parseReleaseBody(release.body);
    if (entries.length === 0) continue;

    versions.push({
      version,
      date: String(release.published_at || "").slice(0, 10),
      entries,
      credits: parseReleaseCredits(release.body, { includeOwner: options.creditOwner }),
    });
  }

  return versions;
}

async function buildSingleVersion(releases, options) {
  const version = options.version || readManifestVersion();
  const fromVersion = options.from || previousVersionOf(releases, version);

  if (!fromVersion) {
    throw new Error(`No previous release found for v${version}; pass --from=<x.y.z>`);
  }

  // On a release run this executes before the tag exists, so the range ends at
  // the commit being released rather than at v<version>.
  const release = releases.find((r) => compareSemver(r.tag_name, version) === 0);
  const toRef = release ? `v${version}` : process.env.GITHUB_SHA || "main";
  console.log(`[changelog] Range: v${fromVersion} -> ${toRef}`);

  const { entries, credits } = await fetchEntriesFromPullRequests(fromVersion, toRef, options);
  if (entries.length === 0) {
    console.log(`[changelog] v${fromVersion} -> ${toRef}: no player-visible changes`);
    return [];
  }

  return [
    {
      version,
      date: String(release?.published_at || new Date().toISOString()).slice(0, 10),
      entries,
      credits,
    },
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(`[changelog] Mode: ${options.seed ? "seed" : "single version"}`);

  const releases = await fetchReleases();
  const built = options.seed
    ? await buildSeedVersions(releases, options)
    : await buildSingleVersion(releases, options);

  const existing = readExisting();
  const merged = mergeVersions(existing.versions, built, { limit: options.limitVersions });

  const payload = {
    generatedAt: new Date().toISOString(),
    versions: merged,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (options.dryRun) {
    console.log(json);
  } else {
    fs.writeFileSync(outputPath, json, "utf8");
  }

  const entryCount = merged.reduce((sum, v) => sum + v.entries.length, 0);
  const creditCount = merged.reduce((sum, v) => sum + (v.credits?.length || 0), 0);
  console.log(
    `[changelog] versions=${merged.length}, entries=${entryCount}, credits=${creditCount}, ` +
      `built=${built.length}` +
      `${options.dryRun ? " (dry run)" : ` -> ${path.relative(repoRoot, outputPath)}`}`,
  );
}

main().catch((error) => {
  console.error(`[changelog] ${error?.message || error}`);
  process.exit(1);
});
