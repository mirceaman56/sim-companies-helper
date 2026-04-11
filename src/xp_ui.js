// xp_ui.js
// XP calculator widget injected near the level indicator in the navbar.
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { calculateTotalXpPerHour, hoursToNextLevel, formatHours } from "./xp_calc.js";
import { storage } from "./data/storage.js";
import { loadBuildings } from "./buildings.js";
import { readXpNavbarContext } from "./page/xp_page.js";
import { observeDocumentBody } from "./page/page_utils.js";

const CONTAINER_ID = "scx-xp-widget";
const TOGGLE_KEY = "scx-xp-widget-visible";
const TOGGLE_DOMAIN = "xp-widget-visible";
const TOGGLE_VERSION = 1;
let _isVisible = true;
let _isRefreshing = false;

/**
 * Initialize the XP widget. The observer ONLY handles injection and removal —
 * it never loads data or updates innerHTML, avoiding MutationObserver loops.
 * Data loading and rendering is driven externally via updateXpWidget().
 */
export function initXpWidget() {
  void hydrateVisibilityPreference();
  observeDocumentBody(() => {
    const navContext = readXpNavbarContext(document);
    if (navContext) {
      injectIfNeeded(navContext);
    } else {
      removeIfPresent();
    }
  });

  // Also try immediately
  const navContext = readXpNavbarContext(document);
  if (navContext) {
    injectIfNeeded(navContext);
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
  const navContext = readXpNavbarContext(document);
  return navContext?.levelAnchor || null;
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

function injectIfNeeded(navContext) {
  // Already injected — observer must not touch the DOM here to avoid loops.
  if (document.getElementById(CONTAINER_ID)) return;

  const levelAnchor = navContext?.levelAnchor;
  const hostEl = navContext?.hostEl;
  if (!levelAnchor || !hostEl) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-xp-widget";

  // Inject inside the level host so the dropdown is anchored beneath it.
  hostEl.classList.add("scx-xp-host");
  hostEl.appendChild(container);

  container.addEventListener("click", (e) => {
    if (e.target.closest(".scx-xp-refresh")) {
      e.preventDefault();
      void refreshBuildingsCache();
      return;
    }

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

function renderControls({ toggleLabel, toggleTitle, loading = false }) {
  const refreshDisabled = _isRefreshing || STATE.buildings.loading;
  const refreshClass = _isRefreshing ? " scx-xp-refresh--loading" : "";
  const tooltip = t("xpCacheRefreshHint");
  return `
    <div class="scx-xp-controls" title="${escapeHtml(tooltip)}">
      <button class="scx-xp-toggle ${loading ? "scx-xp-toggle--loading" : ""}" ${loading ? "disabled" : ""} title="${escapeHtml(toggleTitle)}">${escapeHtml(toggleLabel)}</button>
      <button class="scx-xp-refresh${refreshClass}" ${refreshDisabled ? "disabled" : ""} title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(t("executiveRefresh"))}">↻</button>
    </div>
  `;
}

function renderPlaceholder(container) {
  // Compact placeholder — no layout impact while data is loading.
  container.innerHTML = renderControls({
    toggleLabel: "⏱ ...",
    toggleTitle: t("xpCacheRefreshHint"),
    loading: true,
  });
}

async function refreshBuildingsCache() {
  if (_isRefreshing) return;

  _isRefreshing = true;
  updateWidget();

  try {
    await loadBuildings({ force: true });
  } finally {
    _isRefreshing = false;
    updateWidget();
  }
}

function updateWidget() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const buildings = STATE.buildings.items || [];
  const { level, experience, experienceToNextLevel } = STATE.levelInfo;

  // Error state — API call failed
  if (STATE.buildings.error) {
    container.innerHTML = renderControls({
      toggleLabel: "⏱ !",
      toggleTitle: `${STATE.buildings.error} - ${t("xpCacheRefreshHint")}`,
      loading: true,
    });
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
  const toggleTitle = `${t("xpEstimate")} - ${t("xpCacheRefreshHint")}`;

  container.innerHTML = `
    ${renderControls({ toggleLabel: `⏱ ${timeStr}`, toggleTitle })}
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
  refreshBuildingsCache,
  CONTAINER_ID,
  TOGGLE_KEY,
};
