// xp_ui.js
// XP calculator widget injected near the level indicator in the navbar.
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { calculateTotalXpPerHour, hoursToNextLevel, formatHours } from "./xp_calc.js";
import { loadBuildings } from "./buildings.js";
import { BUILDINGS_REFRESH_INTERVAL_MS } from "./constants.js";

const CONTAINER_ID = "scx-xp-widget";
const TOGGLE_KEY = "scx-xp-widget-visible";

let refreshInterval = null;

/**
 * Initialize the XP widget. Uses MutationObserver to detect the
 * level element in the navbar and inject the widget.
 */
export function initXpWidget() {
  const observer = new MutationObserver(() => {
    const levelAnchor = findLevelAnchor();
    if (levelAnchor) {
      injectIfNeeded(levelAnchor);
    } else {
      removeIfPresent();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also try immediately
  const levelAnchor = findLevelAnchor();
  if (levelAnchor) {
    injectIfNeeded(levelAnchor);
  }
}

/**
 * Find the level anchor in the navbar.
 * Looks for an <a> linking to the levels encyclopedia page.
 * @returns {Element|null}
 */
function findLevelAnchor() {
  return document.querySelector('a[href*="/encyclopedia/"][href*="/levels/"]');
}

function isVisible() {
  try {
    const saved = localStorage.getItem(TOGGLE_KEY);
    return saved !== "false";
  } catch {
    return true;
  }
}

function setVisible(val) {
  try {
    localStorage.setItem(TOGGLE_KEY, String(val));
  } catch {
    // ignore
  }
}

function injectIfNeeded(levelAnchor) {
  if (document.getElementById(CONTAINER_ID)) {
    updateWidget();
    return;
  }

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-xp-widget";

  // Insert after the level anchor's parent container
  const parentDiv = levelAnchor.closest("div.css-82a6rk") || levelAnchor.parentElement;
  if (parentDiv && parentDiv.parentElement) {
    parentDiv.parentElement.insertBefore(container, parentDiv.nextSibling);
  } else {
    return;
  }

  container.addEventListener("click", (e) => {
    if (e.target.closest(".scx-xp-toggle")) {
      const panel = container.querySelector(".scx-xp-details");
      if (panel) {
        const nowVisible = !panel.classList.contains("scx-hidden");
        panel.classList.toggle("scx-hidden");
        setVisible(!nowVisible);
      }
    }
  });

  // Load buildings data and render
  loadAndRender();

  // Periodic refresh
  if (!refreshInterval) {
    refreshInterval = setInterval(() => {
      loadAndRender();
    }, BUILDINGS_REFRESH_INTERVAL_MS);
  }
}

async function loadAndRender() {
  await loadBuildings();
  updateWidget();
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function updateWidget() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const buildings = STATE.buildings.items || [];
  const { level, experience, experienceToNextLevel } = STATE.levelInfo;

  // Not enough data yet
  if (!STATE.buildings.loaded || level === null) {
    container.innerHTML = `<span class="scx-xp-loading">${escapeHtml(t("loading"))}…</span>`;
    return;
  }

  const { totalXpPerHour, breakdown } = calculateTotalXpPerHour(buildings);
  const hours = hoursToNextLevel(experience, experienceToNextLevel, totalXpPerHour);
  const timeStr = formatHours(hours);
  const visible = isVisible();

  const xpRemaining = experienceToNextLevel - experience;

  container.innerHTML = `
    <button class="scx-xp-toggle" title="${escapeHtml(t("xpEstimate"))}">⏱ ${escapeHtml(timeStr)}</button>
    <div class="scx-xp-details ${visible ? "" : "scx-hidden"}">
      <div class="scx-xp-row">
        <span class="scx-xp-label">${escapeHtml(t("xpPerHour"))}</span>
        <span class="scx-xp-value">${escapeHtml(String(Math.round(totalXpPerHour)))}</span>
      </div>
      <div class="scx-xp-row">
        <span class="scx-xp-label">${escapeHtml(t("xpRemaining"))}</span>
        <span class="scx-xp-value">${escapeHtml(String(Math.max(0, xpRemaining)))}</span>
      </div>
      <div class="scx-xp-row">
        <span class="scx-xp-label">${escapeHtml(t("xpTimeToLevel"))}</span>
        <span class="scx-xp-value">${escapeHtml(timeStr)}</span>
      </div>
      <div class="scx-xp-row scx-xp-breakdown">
        <span class="scx-xp-label">${escapeHtml(t("xpOperating"))}</span>
        <span class="scx-xp-value">${breakdown.operatingCount}</span>
      </div>
      <div class="scx-xp-row scx-xp-breakdown">
        <span class="scx-xp-label">${escapeHtml(t("xpProspecting"))}</span>
        <span class="scx-xp-value">${breakdown.prospectingCount}</span>
      </div>
      <div class="scx-xp-row scx-xp-breakdown">
        <span class="scx-xp-label">${escapeHtml(t("xpIdle"))}</span>
        <span class="scx-xp-value">${breakdown.idleCount}</span>
      </div>
    </div>
  `;
}

export const _testUtils = {
  findLevelAnchor,
  isVisible,
  updateWidget,
  CONTAINER_ID,
  TOGGLE_KEY,
};
