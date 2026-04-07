// xp_ui.js
// XP calculator widget injected near the level indicator in the navbar.
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { calculateTotalXpPerHour, hoursToNextLevel, formatHours } from "./xp_calc.js";
import { storage } from "./data/storage.js";

const CONTAINER_ID = "scx-xp-widget";
const TOGGLE_KEY = "scx-xp-widget-visible";
const TOGGLE_DOMAIN = "xp-widget-visible";
const TOGGLE_VERSION = 1;
let _isVisible = true;

/**
 * Initialize the XP widget. The observer ONLY handles injection and removal —
 * it never loads data or updates innerHTML, avoiding MutationObserver loops.
 * Data loading and rendering is driven externally via updateXpWidget().
 */
export function initXpWidget() {
  void hydrateVisibilityPreference();
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

async function hydrateVisibilityPreference() {
  const { data } = await storage.migrate({
    domain: TOGGLE_DOMAIN,
    version: TOGGLE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    readLegacy: async ({ getRaw, removeRaw }) => {
      const legacy = await getRaw("local", TOGGLE_KEY);
      if (legacy == null) return { data: null };
      return {
        data: legacy !== "false",
        async cleanup() {
          await removeRaw("local", TOGGLE_KEY);
        },
      };
    },
  });

  if (typeof data === "boolean") {
    _isVisible = data;
    updateWidget();
  }
}

/**
 * Render the current XP state into the widget.
 * Called from content.js after buildings + level data are loaded.
 */
export function updateXpWidget() {
  updateWidget();
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
  return _isVisible;
}

function setVisible(val) {
  _isVisible = Boolean(val);
  void storage.set({
    domain: TOGGLE_DOMAIN,
    version: TOGGLE_VERSION,
    scope: "global",
    backend: "local",
    refreshAuth: false,
    data: _isVisible,
  });
}

function injectIfNeeded(levelAnchor) {
  // Already injected — observer must not touch the DOM here to avoid loops.
  if (document.getElementById(CONTAINER_ID)) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-xp-widget";

  // Inject inside the level container div so the dropdown sits below it.
  const levelDiv = levelAnchor.closest("div.css-82a6rk") || levelAnchor.parentElement;
  if (!levelDiv) return;

  // Make the level container relative so our absolute dropdown is anchored to it.
  levelDiv.style.position = "relative";
  levelDiv.appendChild(container);

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

  // Render initial placeholder so the widget takes up no space until data loads.
  renderPlaceholder(container);
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
}

function renderPlaceholder(container) {
  // Compact placeholder — no layout impact while data is loading.
  container.innerHTML = `<button class="scx-xp-toggle scx-xp-toggle--loading" disabled>⏱ …</button>`;
}

function updateWidget() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const buildings = STATE.buildings.items || [];
  const { level, experience, experienceToNextLevel } = STATE.levelInfo;

  // Error state — API call failed
  if (STATE.buildings.error) {
    container.innerHTML = `<button class="scx-xp-toggle scx-xp-toggle--loading" disabled title="${escapeHtml(STATE.buildings.error)}">⏱ !</button>`;
    return;
  }

  // Data not ready yet — keep the placeholder
  if (!STATE.buildings.loaded || level === null) {
    renderPlaceholder(container);
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
