// api_health_banner.js
// Sidebar-wide warning shown while the game API is rate limiting the extension:
// tints the sidebar amber and shows a banner with a countdown to the retry.
import { SIDEBAR_ID } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { getApiHealth, onApiHealthChange } from "./data/apiHealth.js";

const BANNER_ID = "scx-api-health-banner";
const RATE_LIMITED_CLASS = "scx-sidebar--rate-limited";
const COUNTDOWN_SELECTOR = "[data-scx-api-countdown]";
const COUNTDOWN_INTERVAL_MS = 1000;

let countdownIntervalId = null;
let unsubscribe = null;

/**
 * Format a remaining cooldown as m:ss.
 * @param {number} remainingMs
 * @returns {string}
 */
export function formatCooldown(remainingMs) {
  const totalSec = Math.max(0, Math.ceil(Number(remainingMs || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function initApiHealthBanner() {
  if (!unsubscribe) {
    unsubscribe = onApiHealthChange(() => renderApiHealthBanner());
  }
  renderApiHealthBanner();
}

function startCountdown() {
  if (countdownIntervalId) return;
  countdownIntervalId = setInterval(() => renderApiHealthBanner(), COUNTDOWN_INTERVAL_MS);
}

function stopCountdown() {
  if (!countdownIntervalId) return;
  clearInterval(countdownIntervalId);
  countdownIntervalId = null;
}

function clearBanner(sidebar) {
  stopCountdown();
  sidebar?.classList.remove(RATE_LIMITED_CLASS);
  document.getElementById(BANNER_ID)?.remove();
}

function createBanner(sidebar) {
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.className = "scx-api-health-banner";
  // Only the message is a live region; the ticking countdown must not be
  // re-announced every second.
  banner.innerHTML = `
    <div class="scx-api-health-banner-title" role="status">
      <span aria-hidden="true">⚠</span>
      <span>${escapeHtml(t("apiLimitBannerTitle"))}</span>
    </div>
    <div class="scx-api-health-banner-body">${escapeHtml(t("apiLimitBannerBody"))}</div>
    <div class="scx-api-health-banner-retry">
      ${escapeHtml(t("apiLimitBannerRetry"))} <span class="scx-mono" data-scx-api-countdown></span>
    </div>
  `;

  const tab = sidebar.querySelector(".scx-sidebar-toggle-tab");
  if (tab) {
    tab.after(banner);
  } else {
    sidebar.prepend(banner);
  }
  return banner;
}

/**
 * Sync the banner and the sidebar tint with the current rate-limit state.
 * @param {number} [now]
 */
export function renderApiHealthBanner(now = Date.now()) {
  const sidebar = document.getElementById(SIDEBAR_ID);
  const health = getApiHealth(now);

  if (!sidebar || !health.blocked) {
    clearBanner(sidebar);
    return;
  }

  sidebar.classList.add(RATE_LIMITED_CLASS);
  const banner = document.getElementById(BANNER_ID) || createBanner(sidebar);
  const countdownEl = banner.querySelector(COUNTDOWN_SELECTOR);
  if (countdownEl) countdownEl.textContent = formatCooldown(health.remainingMs);

  startCountdown();
}

export const _testUtils = {
  BANNER_ID,
  RATE_LIMITED_CLASS,
  reset() {
    stopCountdown();
    unsubscribe?.();
    unsubscribe = null;
  },
};
