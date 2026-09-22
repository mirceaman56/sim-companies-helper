// whats_new_ui.js
// Two surfaces for the same bundled changelog:
//   - a summary toast, shown once after an update
//   - a sidebar section, available at any time so a dismissed or missed toast
//     is no longer the only chance to read what changed

import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import { storage } from "./data/storage.js";
import { getSectionContent, setSectionUpdateFn } from "./sidebar.js";
import {
  getCategoryMeta,
  getCredits,
  getLatestVersions,
  getVersionsBetween,
  groupEntriesByCategory,
  pickEntryText,
  releasePageUrl,
  summarizeCounts,
} from "./whats_new.js";

const KEY_WHATS_NEW = "scx-whats-new";
const TOAST_CONTAINER_ID = "scx-toast-container";
const STORAGE_DOMAIN = "whats-new";
const STORAGE_VERSION = 2;
const SECTION_ID = "whats-new-section";
const PANEL_VERSION_COUNT = 5;

/** Versions new to this player, so the panel can badge them. */
let unseenVersionIds = new Set();

async function getWhatsNewPayload() {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      // v1 envelope first, then the pre-envelope flat key.
      const v1Key = storage.buildStorageKey({
        domain: STORAGE_DOMAIN,
        version: 1,
        scopeKey: "global",
      });
      const legacy = (await getRaw("chrome", v1Key)) ?? (await getRaw("chrome", KEY_WHATS_NEW));
      if (legacy == null) return { data: null };

      const envelope = legacy?.data ?? legacy;
      return {
        // v1 carried pre-rendered English highlights scraped from GitHub. They
        // are dropped: the version range is all the new panel needs, and the
        // bundled changelog has properly categorized, localized text for it.
        data: {
          kind: "changelog",
          version: envelope?.version ?? null,
          lastVersion: envelope?.lastVersion ?? null,
          show: envelope?.show === true,
        },
        async cleanup() {
          await removeRaw("chrome", v1Key);
          await removeRaw("chrome", KEY_WHATS_NEW);
        },
      };
    },
  });

  return data ?? null;
}

async function setWhatsNewShown(payload) {
  await storage.set({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    data: { ...payload, show: false },
  });
}

function ensureToastContainer() {
  let el = document.getElementById(TOAST_CONTAINER_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = TOAST_CONTAINER_ID;
  document.documentElement.appendChild(el);
  return el;
}

function dismissToast(toast) {
  toast.classList.remove("scx-toast-visible");
  toast.classList.add("scx-toast-exit");
  toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 500);
}

/**
 * "2 new features · 1 fix" — built from counts so no release-specific copy is
 * ever written by hand.
 */
function buildSummaryLine(counts) {
  const parts = [];
  if (counts.feature > 0) {
    parts.push(
      `${counts.feature} ${counts.feature === 1 ? t("whatsNewOneFeature") : t("whatsNewManyFeatures")}`,
    );
  }
  if (counts.fix > 0) {
    parts.push(`${counts.fix} ${counts.fix === 1 ? t("whatsNewOneFix") : t("whatsNewManyFixes")}`);
  }
  if (counts.other > 0) {
    parts.push(`${counts.other} ${counts.other === 1 ? t("whatsNewOneOther") : t("whatsNewManyOther")}`);
  }
  return parts.join(" · ");
}

function renderEntryList(entries) {
  return entries
    .map((entry) => `<li class="scx-whats-new-entry">${escapeHtml(pickEntryText(entry))}</li>`)
    .join("");
}

/**
 * One credited person: a link to their GitHub profile when the build resolved
 * a handle, plain text when only a name was available.
 */
function renderCredit(credit) {
  const name = escapeHtml(`@${credit.handle}`);
  if (!credit.url) return `<span class="scx-whats-new-credit">${escapeHtml(credit.handle)}</span>`;
  return `<a href="${escapeHtml(credit.url)}" target="_blank" rel="noreferrer" class="scx-whats-new-credit">${name}</a>`;
}

function renderCreditLine(labelKey, credits) {
  if (credits.length === 0) return "";
  return `
    <div class="scx-whats-new-credits">
      <span class="scx-whats-new-credits-label">${escapeHtml(t(labelKey))}</span>
      ${credits.map(renderCredit).join(", ")}
    </div>`;
}

function renderVersionBlock(version) {
  const groups = groupEntriesByCategory(version.entries);
  if (groups.length === 0) return "";

  const isUnseen = unseenVersionIds.has(version.version);
  const date = version.date ? `<span class="scx-whats-new-date">${escapeHtml(version.date)}</span>` : "";
  const badge = isUnseen ? `<span class="scx-whats-new-badge">${escapeHtml(t("whatsNewBadge"))}</span>` : "";

  const body = groups
    .map((group) => {
      const meta = getCategoryMeta(group.cat);
      return `
        <div class="scx-whats-new-group">
          <div class="scx-whats-new-group-title">
            <span aria-hidden="true">${meta.icon}</span>
            <span>${escapeHtml(t(meta.titleKey))}</span>
          </div>
          <ul class="scx-whats-new-entries">${renderEntryList(group.entries)}</ul>
        </div>`;
    })
    .join("");

  const { contributors, reporters } = getCredits(version);

  return `
    <div class="scx-whats-new-version${isUnseen ? " scx-whats-new-version-unseen" : ""}">
      <div class="scx-whats-new-version-head">
        <span class="scx-whats-new-version-label">v${escapeHtml(version.version)}</span>
        ${date}
        ${badge}
      </div>
      ${body}
      ${renderCreditLine("whatsNewCreditContributors", contributors)}
      ${renderCreditLine("whatsNewCreditReporters", reporters)}
    </div>`;
}

/**
 * Renders the sidebar section. Always available, independent of whether a
 * toast was ever shown.
 */
export function updateWhatsNewPanel() {
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  const versions = getLatestVersions(PANEL_VERSION_COUNT);

  if (versions.length === 0) {
    content.innerHTML = `<div class="scx-whats-new-empty">${escapeHtml(t("whatsNewEmpty"))}</div>`;
    return;
  }

  const blocks = versions.map((version) => renderVersionBlock(version)).join("");
  const latest = versions[0].version;

  content.innerHTML = `
    <div class="scx-whats-new-panel">
      ${blocks}
      <a
        href="${escapeHtml(releasePageUrl(latest))}"
        target="_blank"
        rel="noreferrer"
        class="scx-whats-new-link"
      >${escapeHtml(t("whatsNewReadMore"))}</a>
    </div>`;
}

/** Opens the sidebar section and brings it into view. */
function openWhatsNewSection() {
  const content = getSectionContent(SECTION_ID);
  const section = content?.closest(".scx-section");
  if (!section) return;

  section.classList.remove("collapsed");
  updateWhatsNewPanel();
  section.scrollIntoView?.({ block: "nearest" });
}

function showWhatsNewToast({ titleText, summaryText, actionLabel }) {
  const toastContainer = ensureToastContainer();

  const toast = document.createElement("div");
  toast.className = "scx-toast";
  toast.innerHTML = `
    <div class="scx-toast-icon">✨</div>
    <div class="scx-toast-body">
      <div class="scx-toast-title">${escapeHtml(titleText)}</div>
      <div class="scx-toast-message">${escapeHtml(summaryText)}</div>
      <button type="button" class="scx-btn scx-btn-info scx-whats-new-action">${escapeHtml(actionLabel)}</button>
    </div>
    <button class="scx-toast-close" aria-label="${escapeHtml(t("whatsNewDismiss"))}">✕</button>
  `;

  toast.querySelector(".scx-toast-close").addEventListener("click", () => dismissToast(toast));
  toast.querySelector(".scx-whats-new-action").addEventListener("click", () => {
    openWhatsNewSection();
    dismissToast(toast);
  });

  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("scx-toast-visible"));

  return toast;
}

/**
 * Registers the panel's update function and shows the post-update toast once.
 * The "shown" flag is written only after the toast is in the DOM, so a page
 * navigation mid-load no longer costs the player the announcement.
 */
export async function initWhatsNew() {
  setSectionUpdateFn(SECTION_ID, updateWhatsNewPanel);

  const payload = await getWhatsNewPayload();

  if (payload?.kind === "changelog" && payload.version && payload.lastVersion) {
    const unseen = getVersionsBetween(payload.lastVersion, payload.version);
    unseenVersionIds = new Set(unseen.map((v) => v.version));
  }

  updateWhatsNewPanel();

  if (!payload || payload.show !== true) return;

  if (payload.kind === "welcome") {
    showWhatsNewToast({
      titleText: t("whatsNewWelcomeTitle"),
      summaryText: t("whatsNewWelcomeMessage"),
      actionLabel: t("whatsNewWelcomeAction"),
    });
    await setWhatsNewShown(payload);
    return;
  }

  const unseen = getVersionsBetween(payload.lastVersion, payload.version);
  const counts = summarizeCounts(unseen);

  // An update with nothing player-visible in it (tooling, docs) gets no toast.
  if (counts.total === 0) {
    await setWhatsNewShown(payload);
    return;
  }

  showWhatsNewToast({
    titleText: `${t("whatsNewTitle")} v${payload.version}`,
    summaryText: buildSummaryLine(counts),
    actionLabel: t("whatsNewAction"),
  });

  await setWhatsNewShown(payload);
}

export const _testUtils = {
  buildSummaryLine,
  renderVersionBlock,
  setUnseen(ids) {
    unseenVersionIds = new Set(ids);
  },
};
