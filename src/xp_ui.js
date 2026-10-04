// xp_ui.js
// XP calculator chip inside the navbar level bar, with a details popover.
// Shares the nav-chip component with the accounting widget.
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { calculateTotalXpPerHour, hoursToNextLevel, formatHours } from "./xp_calc.js";
import { loadBuildings } from "./buildings.js";
import { findXpLevelTextElement, readXpLevelPercent, readXpNavbarContext } from "./page/xp_page.js";
import { observeDocumentBody } from "./page/page_utils.js";
import {
  createNavPopController,
  fitNavChip,
  renderNavChip,
  renderNavPopGauge,
  renderNavPopHead,
  renderNavPopLine,
  renderNavPopNote,
} from "./nav_chip.js";

const CONTAINER_ID = "scx-xp-widget";
const POPOVER_ID = "scx-xp-popover";

const popover = createNavPopController({ containerId: CONTAINER_ID });
let _isRefreshing = false;

/**
 * Initialize the XP widget. The observer ONLY handles injection and removal —
 * it never loads data or updates innerHTML, avoiding MutationObserver loops.
 * Data loading and rendering is driven externally via updateXpWidget().
 */
export function initXpWidget() {
  popover.listen();
  window.addEventListener("resize", fitChip);
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

/**
 * Render the current XP state into the widget.
 * Called from content.js after buildings + level data are loaded.
 */
export function updateXpWidget() {
  updateWidget();
}

function injectIfNeeded(navContext) {
  // Already injected — observer must not touch the DOM here to avoid loops.
  if (document.getElementById(CONTAINER_ID)) return;

  const levelAnchor = navContext?.levelAnchor;
  const hostEl = navContext?.hostEl;
  if (!levelAnchor || !hostEl) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "scx-navchip-widget";

  // Inject inside the level host so the chip overlays the level bar.
  hostEl.classList.add("scx-navchip-host");
  hostEl.appendChild(container);

  container.addEventListener("click", (e) => {
    if (e.target.closest(".scx-xp-refresh")) {
      e.preventDefault();
      void refreshBuildingsCache();
      return;
    }

    const chip = e.target.closest(".scx-navchip");
    if (chip && !chip.disabled) {
      e.preventDefault();
      popover.toggle();
    }
  });

  updateWidget();
}

function removeIfPresent() {
  document.getElementById(CONTAINER_ID)?.remove();
  popover.setOpen(false);
}

function fitChip() {
  const chip = document.querySelector(`#${CONTAINER_ID} .scx-navchip`);
  fitNavChip(chip, findXpLevelTextElement(document));
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

function renderRefreshButton() {
  const disabled = _isRefreshing || STATE.buildings.loading;
  return `
    <button class="scx-navpop-action scx-xp-refresh" type="button" ${disabled ? "disabled" : ""}
      title="${escapeHtml(t("xpCacheRefreshHint"))}" aria-label="${escapeHtml(t("executiveRefresh"))}">↻</button>
  `;
}

function renderPopover({ level, timeStr, totalXpPerHour, xpRemaining, breakdown, error = "" }) {
  const percent = readXpLevelPercent(document);
  const head = renderNavPopHead({
    title: t("xpTitle"),
    badge: timeStr,
    badgeTone: error ? "warn" : "info",
    actionsHtml: renderRefreshButton(),
  });

  const body = error
    ? renderNavPopNote(error)
    : `
      ${
        percent === null
          ? ""
          : renderNavPopGauge({
              label: t("xpLevelTransition")
                .replace("{from}", String(level))
                .replace("{to}", String(level + 1)),
              valueText: `${percent}%`,
              value: percent,
              max: 100,
              tone: "info",
            })
      }
      <div class="scx-navpop-lines">
        ${renderNavPopLine({ label: t("xpPerHour"), value: String(Math.round(totalXpPerHour)) })}
        ${renderNavPopLine({ label: t("xpRemaining"), value: String(Math.max(0, xpRemaining)) })}
        ${renderNavPopLine({ label: t("xpTimeToLevel"), value: timeStr, tone: "total" })}
      </div>
      <div class="scx-navpop-lines">
        ${renderNavPopLine({ label: t("xpOperating"), value: String(breakdown.operatingCount), tone: "muted" })}
        ${renderNavPopLine({ label: t("xpProspecting"), value: String(breakdown.prospectingCount), tone: "muted" })}
      </div>
    `;

  return `
    <div id="${POPOVER_ID}" class="scx-navpop ${popover.isOpen() ? "" : "scx-hidden"}" role="dialog" aria-label="${escapeHtml(t("xpTitle"))}">
      ${head}
      ${body}
      ${renderNavPopNote(t("xpCacheRefreshHint"))}
    </div>
  `;
}

function render(container, html) {
  container.innerHTML = html;
  fitChip();
  popover.sync();
}

function updateWidget() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const buildings = STATE.buildings.items || [];
  const { level, experience, experienceToNextLevel } = STATE.levelInfo;

  // Error state — API call failed. Chip stays clickable so the user can retry.
  if (STATE.buildings.error) {
    render(
      container,
      `${renderNavChip({
        icon: "⏱",
        amount: "!",
        title: `${STATE.buildings.error} - ${t("xpCacheRefreshHint")}`,
        tone: "warn",
        popoverId: POPOVER_ID,
        expanded: popover.isOpen(),
      })}${renderPopover({ level, timeStr: "!", error: STATE.buildings.error })}`,
    );
    return;
  }

  // Data not ready yet — loading chip, no popover.
  if (!STATE.buildings.loaded || level === null) {
    render(
      container,
      renderNavChip({
        icon: "⏱",
        amount: "…",
        title: t("xpCacheRefreshHint"),
        tone: "loading",
        popoverId: POPOVER_ID,
        expanded: false,
        disabled: true,
      }),
    );
    return;
  }

  const { totalXpPerHour, breakdown } = calculateTotalXpPerHour(buildings);
  const hours = hoursToNextLevel(experience, experienceToNextLevel, totalXpPerHour);
  const timeStr = formatHours(hours);
  const xpRemaining = experienceToNextLevel - experience;

  render(
    container,
    `${renderNavChip({
      icon: "⏱",
      amount: timeStr,
      title: `${t("xpEstimate")}: ${timeStr}`,
      tone: "info",
      popoverId: POPOVER_ID,
      expanded: popover.isOpen(),
    })}${renderPopover({ level, timeStr, totalXpPerHour, xpRemaining, breakdown })}`,
  );
}

export const _testUtils = {
  updateWidget,
  refreshBuildingsCache,
  popover,
  CONTAINER_ID,
};
