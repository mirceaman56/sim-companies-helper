import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";

const KEY_WHATS_NEW = "scx-whats-new";
const TOAST_CONTAINER_ID = "scx-toast-container";

async function getWhatsNewPayload() {
  try {
    const result = await chrome.storage.local.get(KEY_WHATS_NEW);
    return result?.[KEY_WHATS_NEW] ?? null;
  } catch {
    return null;
  }
}

async function setWhatsNewShown(payload) {
  try {
    await chrome.storage.local.set({
      [KEY_WHATS_NEW]: { ...payload, show: false },
    });
  } catch {
    // ignore
  }
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
