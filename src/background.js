import { storage } from "./data/storage.js";
import { initializeDataPlatform } from "./data/index.js";

const KEY_WHATS_NEW = "scx-whats-new";
const KEY_LAST_MINOR = "scx-whats-new-last-notified-minor";
const KEY_LAST_VERSION = "scx-whats-new-last-version";
const STORAGE_DOMAIN_WHATS_NEW = "whats-new";
const STORAGE_DOMAIN_WHATS_NEW_META = "whats-new-meta";
const STORAGE_VERSION = 2;

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
    data: { lastVersion: payload.version },
  });

  // Cleanup legacy flat keys once new envelope keys are written.
  await storage.removeRaw("chrome", KEY_WHATS_NEW);
  await storage.removeRaw("chrome", KEY_LAST_MINOR);
  await storage.removeRaw("chrome", KEY_LAST_VERSION);
}

async function getLastVersion() {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN_WHATS_NEW_META,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      // v1 kept the notified minor alongside the version; the minor is gone
      // now that every release is announced, so only the version carries over.
      const lastVersion = await getRaw("chrome", KEY_LAST_VERSION);
      const minorKeyValue = await getRaw("chrome", KEY_LAST_MINOR);
      if (lastVersion == null && minorKeyValue == null) return { data: null };
      return {
        data: { lastVersion: lastVersion ?? null },
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

  const version = chrome.runtime.getManifest().version;

  if (details.reason === "install") {
    // No changelog for a first install: there is nothing the player has seen
    // before, so the panel shows a welcome card instead of old fixes.
    await setWhatsNew({ kind: "welcome", version, show: true });
    return;
  }

  if (details.reason !== "update") return;

  const lastVersion = details.previousVersion || (await getLastVersion());
  if (!lastVersion) return;

  // Every release is announced, patches included. The old build skipped any
  // update inside the same minor, which silently swallowed bug-fix releases.
  await setWhatsNew({ kind: "changelog", version, lastVersion, show: true });
});
