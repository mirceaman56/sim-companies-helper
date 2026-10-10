import { mountLeftSidebarPanel, removeLeftSidebarPanel } from "./left_sidebar.js";
import { readBuildingIdFromPath } from "./page/landscape_page.js";
import { changeBuildingPref, getBuildingPref } from "./accessibility_map.js";
import {
  NICKNAME_MAX_LENGTH,
  PALETTE_NAME_KEYS,
  PALETTE_SHAPES,
  normalizeColorIndex,
} from "./accessibility_calc.js";
import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";

const PANEL_ID = "scx-a11y-panel";
const BODY_ID = "scx-a11y-panel-body";
const EDITOR_ID = "scx-a11y-editor";
const NICKNAME_INPUT_ID = "scx-a11y-nickname";
const NICKNAME_SAVE_DELAY_MS = 500;

function createPanel() {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "scx-panel scx-a11y-panel";
  panel.setAttribute("aria-labelledby", "scx-a11y-panel-title");
  const help = escapeHtml(t("a11yTagsHelp"));
  panel.innerHTML = `
    <div class="scx-panel-head">
      <div class="scx-panel-title" id="scx-a11y-panel-title">${escapeHtml(t("a11yPanelTitle"))}</div>
      <span class="scx-info-icon" role="img" tabindex="0" aria-label="${help}" data-scx-tooltip="${help}">i</span>
    </div>
    <div class="scx-a11y-panel-body" id="${BODY_ID}"></div>
  `;
  return panel;
}

/**
 * @param {string} buildingId
 * @param {{ color?: number, nickname?: string }} pref
 */
function renderEditorMarkup(buildingId, pref) {
  const color = normalizeColorIndex(pref.color);
  const swatches = PALETTE_SHAPES.map(
    (shape, index) => `
      <button type="button" class="scx-a11y-swatch scx-a11y-color-${index}" data-color="${index}"
        aria-pressed="${color === index}" aria-label="${escapeHtml(t(PALETTE_NAME_KEYS[index]))}"
        title="${escapeHtml(t(PALETTE_NAME_KEYS[index]))}"><span aria-hidden="true">${shape}</span></button>`,
  ).join("");

  return `
    <div class="scx-a11y-editor-heading">${escapeHtml(t("a11yEditorTitle"))}</div>
    <label class="scx-a11y-editor-label" for="${NICKNAME_INPUT_ID}">${escapeHtml(t("a11yNickname"))}</label>
    <input class="scx-a11y-editor-input" id="${NICKNAME_INPUT_ID}" name="${NICKNAME_INPUT_ID}" type="text"
      maxlength="${NICKNAME_MAX_LENGTH}" autocomplete="off" data-building-id="${escapeHtml(buildingId)}"
      placeholder="${escapeHtml(t("a11yNicknamePlaceholder"))}" value="${escapeHtml(pref.nickname || "")}">
    <div class="scx-a11y-editor-label" id="scx-a11y-color-label">${escapeHtml(t("a11yColor"))}</div>
    <div class="scx-a11y-swatches" role="group" aria-labelledby="scx-a11y-color-label">
      <button type="button" class="scx-a11y-swatch scx-a11y-swatch-auto" data-color=""
        aria-pressed="${color === null}">${escapeHtml(t("a11yColorAuto"))}</button>
      ${swatches}
    </div>
  `;
}

/** @param {HTMLElement} editor @param {string} buildingId */
function wireEditor(editor, buildingId) {
  let nicknameTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const input = /** @type {HTMLInputElement} */ (editor.querySelector(`#${NICKNAME_INPUT_ID}`));
  const saveNickname = () => {
    if (nicknameTimer) clearTimeout(nicknameTimer);
    nicknameTimer = null;
    changeBuildingPref(buildingId, { nickname: input.value });
  };
  input.addEventListener("input", () => {
    if (nicknameTimer) clearTimeout(nicknameTimer);
    nicknameTimer = setTimeout(saveNickname, NICKNAME_SAVE_DELAY_MS);
  });
  input.addEventListener("change", saveNickname);

  editor.addEventListener("click", (event) => {
    const swatch = /** @type {Element} */ (event.target).closest?.(".scx-a11y-swatch");
    if (!swatch) return;
    const color = normalizeColorIndex(swatch.getAttribute("data-color"));
    for (const button of editor.querySelectorAll(".scx-a11y-swatch")) {
      button.setAttribute("aria-pressed", String(button === swatch));
    }
    changeBuildingPref(buildingId, { color });
  });
}

/** @param {HTMLElement} body */
function showHint(body) {
  if (body.querySelector(".scx-a11y-panel-hint")) return;
  body.innerHTML = `<p class="scx-a11y-panel-hint">${escapeHtml(t("a11yEditorHint"))}</p>`;
}

/**
 * Left-sidebar panel: help tooltip always, the label editor on building pages.
 * @param {{ enabled: boolean }} mode
 */
export async function updateAccessibilityPanel(mode) {
  if (!mode.enabled) {
    removeLeftSidebarPanel(PANEL_ID);
    return;
  }
  const panel = document.getElementById(PANEL_ID) || mountLeftSidebarPanel(createPanel());
  const body = /** @type {HTMLElement} */ (panel.querySelector(`#${BODY_ID}`));

  const buildingId = readBuildingIdFromPath(location.pathname);
  if (!buildingId) {
    showHint(body);
    return;
  }
  if (body.querySelector(`#${EDITOR_ID}`)?.getAttribute("data-building-id") === buildingId) return;

  const pref = await getBuildingPref(buildingId);
  // The route or the switch may have changed while prefs loaded.
  if (readBuildingIdFromPath(location.pathname) !== buildingId || !panel.isConnected) return;

  const editor = document.createElement("div");
  editor.id = EDITOR_ID;
  editor.className = "scx-a11y-editor";
  editor.setAttribute("data-building-id", buildingId);
  editor.innerHTML = renderEditorMarkup(buildingId, pref);
  wireEditor(editor, buildingId);
  body.replaceChildren(editor);
}

export const _testUtils = { renderEditorMarkup, PANEL_ID };
