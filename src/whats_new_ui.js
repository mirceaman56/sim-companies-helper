import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import { storage } from "./data/storage.js";

const KEY_WHATS_NEW = "scx-whats-new";
const TOAST_CONTAINER_ID = "scx-toast-container";
const STORAGE_DOMAIN = "whats-new";
const STORAGE_VERSION = 1;

async function getWhatsNewPayload() {
  const { data } = await storage.migrate({
    domain: STORAGE_DOMAIN,
    version: STORAGE_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacy = await getRaw("chrome", KEY_WHATS_NEW);
      if (legacy == null) return { data: null };
      return {
        data: legacy,
        async cleanup() {
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

function renderHighlightsList(highlights) {
  const items = Array.isArray(highlights) ? highlights : [];
  if (items.length === 0) {
    return `<div class="scx-toast-message">${escapeHtml(t("whatsNewFallback"))}</div>`;
  }

  const listItems = items
    .slice(0, 5)
    .map((h) => `<li>${escapeHtml(String(h))}</li>`)
    .join("");

  return `
    <div class="scx-toast-message">
      <ul class="scx-whats-new-list">
        ${listItems}
      </ul>
    </div>
  `;
}

function showWhatsNewToast(payload) {
  const toastContainer = ensureToastContainer();

  const version = payload?.version ? String(payload.version) : "";
  const url = payload?.url ? String(payload.url) : "";

  const titleText = `${t("whatsNewTitle")} v${version}`.trim();

  const toast = document.createElement("div");
  toast.className = "scx-toast";
  toast.innerHTML = `
    <div class="scx-toast-icon">🔔</div>
    <div class="scx-toast-body">
      <div class="scx-toast-title">${escapeHtml(titleText)}</div>
      ${payload?.error ? `<div class="scx-whats-new-error">${escapeHtml(t("whatsNewFetchingError"))}</div>` : ""}
      ${renderHighlightsList(payload?.highlights)}
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" class="scx-toast-link scx-whats-new-link">${escapeHtml(t("whatsNewReadMore"))}</a>` : ""}
    </div>
    <button class="scx-toast-close" aria-label="${escapeHtml(t("whatsNewDismiss"))}">✕</button>
  `;

  const closeBtn = toast.querySelector(".scx-toast-close");
  closeBtn.addEventListener("click", () => dismissToast(toast));

  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("scx-toast-visible"));

  return toast;
}

export async function initWhatsNewToast() {
  const payload = await getWhatsNewPayload();
  if (!payload || payload.show !== true) return;

  // Mark as shown before rendering so failures don't re-show forever.
  await setWhatsNewShown(payload);
  showWhatsNewToast(payload);
}

export const _testUtils = {
  renderHighlightsList,
};
