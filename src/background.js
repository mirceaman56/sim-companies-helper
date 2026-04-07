import { collectHighlightsFromReleases, minorKey, releasePageUrl } from "./whats_new.js";
import { request } from "./data/apiClient.js";
import { storage } from "./data/storage.js";
import { initializeDataPlatform } from "./data/index.js";

const KEY_WHATS_NEW = "scx-whats-new";
const KEY_LAST_MINOR = "scx-whats-new-last-notified-minor";
const KEY_LAST_VERSION = "scx-whats-new-last-version";
const STORAGE_DOMAIN_WHATS_NEW = "whats-new";
const STORAGE_DOMAIN_WHATS_NEW_META = "whats-new-meta";
const STORAGE_VERSION = 1;

async function setWhatsNew(payload) {
  await storage.set({
    domain: STORAGE_DOMAIN_WHATS_NEW,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    data: payload,
  });

  await storage.set({
    domain: STORAGE_DOMAIN_WHATS_NEW_META,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    data: {
      minorKey: payload.minorKey,
      lastVersion: payload.lastVersion,
    },
  });

  // Cleanup legacy flat keys once new envelope keys are written.
  await storage.removeRaw("chrome", KEY_WHATS_NEW);
  await storage.removeRaw("chrome", KEY_LAST_MINOR);
  await storage.removeRaw("chrome", KEY_LAST_VERSION);
}

async function fetchAllReleases() {
  return request("github-releases", {
    url: "https://api.github.com/repos/mirceaman56/sim-companies-helper/releases?per_page=100",
    credentials: "omit",
    responseType: "json",
    retries: 1,
    retryDelayMs: 300,
  });
}

async function getLastVersion() {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN_WHATS_NEW_META,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const lastVersion = await getRaw("chrome", KEY_LAST_VERSION);
      const minorKeyValue = await getRaw("chrome", KEY_LAST_MINOR);
      if (lastVersion == null && minorKeyValue == null) return { data: null };
      return {
        data: {
          lastVersion: lastVersion ?? null,
          minorKey: minorKeyValue ?? null,
        },
        async cleanup() {
          await removeRaw("chrome", KEY_LAST_VERSION);
          await removeRaw("chrome", KEY_LAST_MINOR);
        },
      };
    },
  });

  return data?.lastVersion ?? null;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeDataPlatform();

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
