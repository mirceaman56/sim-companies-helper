// why: changelog.json is agent-written and shown to non-technical players. This keeps entries
// readable and keeps the newest version in step with the manifest, so a release never ships
// notes for a version players do not have.
import fs from "node:fs";
import path from "node:path";
import { ROOT, createReporter } from "./lib/source-files.mjs";

const FILE = "src/resources/changelog.json";
const MAX_TEXT = 100;
const CATEGORIES = ["feature", "fix", "other"];
const ROLES = ["contributor", "reporter"];
const DEV_WORDING = [
  [/#\d+/, "issue/PR numbers"],
  [/`/, "code formatting"],
  [/\b[\w-]+\.(js|mjs|css|json|html)\b/i, "file names"],
  [/\b(feature|fix|chore|bugfix|hotfix)\//i, "branch names"],
  [/\bv?\d+\.\d+\.\d+\b/, "version numbers"],
  [
    /\b(refactor\w*|chore|lint\w*|eslint|vitest|ci|pr|merge[ds]?|bump\w*|dependenc\w*|race condition|api)\b/i,
    "developer jargon",
  ],
];

const reporter = createReporter("changelog");
const report = (msg) => reporter.report(FILE, 1, msg);
const SEMVER = /^\d+\.\d+\.\d+$/;

function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const manifestVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "public/manifest.json"), "utf8")).version;
let data = null;
try {
  data = JSON.parse(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
} catch (error) {
  report(`not valid JSON: ${error.message}`);
}

const versions = Array.isArray(data?.versions) ? data.versions : [];
if (data && !Array.isArray(data.versions)) report(`"versions" must be an array.`);

let previous = null;
for (const v of versions) {
  const where = `version ${v?.version}`;
  if (!SEMVER.test(String(v?.version || ""))) {
    report(`${where}: "version" must be MAJOR.MINOR.PATCH.`);
    continue;
  }
  if (compare(v.version, manifestVersion) > 0) {
    report(`${where} is newer than manifest ${manifestVersion}. Use the manifest version (changelog skill).`);
  }
  if (previous && compare(v.version, previous) >= 0) {
    report(`${where} must come after ${previous}: versions are unique and newest first.`);
  }
  previous = v.version;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.date || ""))) report(`${where}: "date" must be YYYY-MM-DD.`);

  const entries = Array.isArray(v.entries) ? v.entries : [];
  if (entries.length === 0) report(`${where}: needs at least one entry, or remove the version.`);
  for (const e of entries) {
    const text = String(e?.text || "").trim();
    if (!CATEGORIES.includes(e?.cat)) report(`${where}: "cat" must be one of ${CATEGORIES.join(", ")}.`);
    if (!text) report(`${where}: entry text is empty.`);
    if (text.length > MAX_TEXT) {
      report(`${where}: "${text}" is ${text.length} chars; keep entries ≤ ${MAX_TEXT} for players.`);
    }
    for (const [pattern, label] of DEV_WORDING) {
      if (pattern.test(text)) report(`${where}: "${text}" contains ${label}; write it for players.`);
    }
  }

  for (const c of Array.isArray(v.credits) ? v.credits : []) {
    if (!c?.handle || !ROLES.includes(c.role)) {
      report(`${where}: credits need "handle" and "role" (${ROLES.join(", ")}).`);
    }
  }
}

reporter.finish(
  `${versions.length} versions, newest ${versions[0]?.version ?? "none"} ≤ manifest ${manifestVersion}`,
);
