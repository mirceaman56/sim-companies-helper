import { collectHighlightsFromReleases, minorKey, releasePageUrl } from "./whats_new.js";

const KEY_WHATS_NEW = "scx-whats-new";
const KEY_LAST_MINOR = "scx-whats-new-last-notified-minor";
const KEY_LAST_VERSION = "scx-whats-new-last-version";

async function setWhatsNew(payload) {
  try {
    await chrome.storage.local.set({
      [KEY_WHATS_NEW]: payload,
      [KEY_LAST_MINOR]: payload.minorKey,
      [KEY_LAST_VERSION]: payload.lastVersion,
    });
  } catch {
    // ignore
  }
}

async function fetchAllReleases() {
  const url = "https://api.github.com/repos/mirceaman56/sim-companies-helper/releases?per_page=100";
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getLastVersion() {
  try {
    const result = await chrome.storage.local.get(KEY_LAST_VERSION);
    return result?.[KEY_LAST_VERSION] ?? null;
  } catch {
    return null;
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  const currentMinor = minorKey(version);

  if (details.reason === "update") {
    const prev = details.previousVersion;
    if (!prev) return;
    const prevMinor = minorKey(prev);
    if (prevMinor === currentMinor) return;
  } else if (details.reason !== "install") {
    return;
  }

  const pageUrl = releasePageUrl(version);
  const storedLastVersion = await getLastVersion();
  const lastVersion = details.previousVersion || storedLastVersion || "0.0.0";

  try {
    const releases = await fetchAllReleases();
    const highlights = collectHighlightsFromReleases(releases, lastVersion, version, { limit: 10 });
    const title = `v${version}`;

    await setWhatsNew({
      version,
      minorKey: currentMinor,
      url: pageUrl,
      fetchedAt: Date.now(),
      title,
      highlights,
      show: true,
      lastVersion: version,
    });
  } catch (e) {
    await setWhatsNew({
      version,
      minorKey: currentMinor,
      url: pageUrl,
      fetchedAt: Date.now(),
      title: `v${version}`,
      highlights: [],
      show: true,
      error: String(e?.message || e),
      lastVersion: version,
    });
  }
});
