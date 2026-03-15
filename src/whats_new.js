const REPO_OWNER = "mirceaman56";
const REPO_NAME = "sim-companies-helper";

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

export function minorKey(version) {
  const parts = String(version || "").split(".");
  const major = parts[0] || "0";
  const minor = parts[1] || "0";
  return `${major}.${minor}`;
}

export function releaseApiUrl(version) {
  const v = String(version || "").trim();
  return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/v${encodeURIComponent(v)}`;
}

export function releasePageUrl(version) {
  const v = String(version || "").trim();
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${encodeURIComponent(v)}`;
}

function stripMarkdown(s) {
  let out = String(s || "");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [text](url) -> text
  out = out.replace(/https?:\/\/\S+/gi, ""); // drop raw URLs
  out = out.replace(/[`*_>#]/g, ""); // minimal markdown noise
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function humanizeHighlight(s) {
  let out = stripMarkdown(s);

  // Common GitHub auto-generated release-note bullets:
  // "fix: something by @user in https://..."
  out = out.replace(/\s+by\s+@?[a-z0-9_-]+/gi, "");
  out = out.replace(/\s+in\s*$/i, "");
  out = out.replace(/\s*\(#?\d+\)\s*$/i, ""); // trailing PR reference

  const m = out.match(/^([a-z]+)(\([^)]+\))?:\s*(.+)$/i);
  if (m) {
    const type = m[1].toLowerCase();
    const rest = m[3];
    const prefix =
      type === "feat"
        ? "New"
        : type === "fix"
          ? "Fixed"
          : type === "perf"
            ? "Improved"
            : type === "docs"
              ? "Updated"
              : null;
    if (prefix) out = `${prefix}: ${rest}`;
  }

  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export function extractHighlights(markdownBody, { limit = 5 } = {}) {
  const body = String(markdownBody || "");
  const lines = body.split(/\r?\n/);

  const highlights = [];
  let inCode = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (!line) continue;
    if (/^#+\s+/.test(line)) continue; // headings

    // Bullet-like lines
    const bulletMatch = line.match(/^(\*|-|•|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      const cleaned = humanizeHighlight(bulletMatch[2]);
      if (cleaned) highlights.push(cleaned);
    }

    if (highlights.length >= limit) break;
  }

  return highlights.slice(0, limit);
}

export function collectHighlightsFromReleases(releases, fromVersion, toVersion, { limit = 10 } = {}) {
  const filtered = (Array.isArray(releases) ? releases : [])
    .filter((r) => !r?.prerelease)
    .map((r) => ({ ...r, tag_name: String(r?.tag_name || "") }))
    .filter((r) => /^v?\d+\.\d+\.\d+$/.test(r.tag_name))
    .filter((r) => compareVersions(r.tag_name, fromVersion) > 0)
    .filter((r) => compareVersions(r.tag_name, toVersion) <= 0)
    .sort((a, b) => compareVersions(a.tag_name, b.tag_name));

  const highlights = [];
  for (const rel of filtered) {
    const items = extractHighlights(rel.body, { limit });
    for (const item of items) {
      highlights.push(item);
      if (highlights.length >= limit) return highlights;
    }
  }

  return highlights.slice(0, limit);
}

export const _testUtils = {
  compareVersions,
  minorKey,
  releaseApiUrl,
  releasePageUrl,
  extractHighlights,
  collectHighlightsFromReleases,
};
