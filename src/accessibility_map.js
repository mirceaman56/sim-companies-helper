import { observeDocumentBody } from "./page/page_utils.js";
import { readLandscapeBuildings } from "./page/landscape_page.js";
import {
  buildTagModel,
  emptyPrefs,
  rememberBuildings,
  tagModelKey,
  updateBuildingPref,
} from "./accessibility_calc.js";
import { loadBuildingPrefs, saveBuildingPrefs } from "./accessibility_storage.js";
import { escapeHtml, scheduleUpdate } from "./utils.js";
import { t } from "./i18n.js";

const TAG_CLASS = "scx-a11y-tag";
const TAG_KEY_ATTR = "data-scx-a11y-tag";
const STATUS_ATTR = "data-scx-a11y-status";
const SAVE_DELAY_MS = 2000;

let prefs = emptyPrefs();
let prefsReady = /** @type {Promise<void> | null} */ (null);
let prefsLoaded = false;
let stopObserver = /** @type {(() => void) | null} */ (null);
let saveTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveBuildingPrefs(prefs);
  }, SAVE_DELAY_MS);
}

function ensurePrefs() {
  prefsReady ??= loadBuildingPrefs().then((loaded) => {
    prefs = loaded;
    prefsLoaded = true;
  });
  return prefsReady;
}

/** @param {import("./accessibility_calc.js").TagModel} model */
function renderTagMarkup(model) {
  const shape = model.shape
    ? `<span class="scx-a11y-tag-shape" aria-hidden="true">${model.shape}</span>`
    : "";
  const label = model.label ? `<span class="scx-a11y-tag-label">${escapeHtml(model.label)}</span>` : "";
  const idle = model.idle
    ? `<span class="scx-a11y-tag-idle"><span aria-hidden="true">⏸</span> ${escapeHtml(t("a11yIdle"))}</span>`
    : "";
  return `${shape}${label}${idle}`;
}

/**
 * Writes only when the tag is missing or its content changed, so the observer callback our
 * own writes trigger ends without touching the DOM again.
 * @param {import("./page/landscape_page.js").LandscapeBuilding} building
 */
function syncBuilding(building) {
  const model = buildTagModel(prefs, building);
  const status = model?.idle ? "idle" : "";
  if (building.statusEl && building.statusEl.getAttribute(STATUS_ATTR) !== status) {
    building.statusEl.setAttribute(STATUS_ATTR, status);
  }

  const host = building.labelHost;
  if (!host) return;
  const existing = host.querySelector(`:scope > .${TAG_CLASS}`);
  const key = tagModelKey(model);
  if (!model) {
    existing?.remove();
    return;
  }
  if (existing?.getAttribute(TAG_KEY_ATTR) === key) return;

  const tag = existing || document.createElement("span");
  tag.className =
    model.colorIndex === null
      ? "scx-a11y-tag scx-a11y-tag-plain"
      : `scx-a11y-tag scx-a11y-color-${model.colorIndex}`;
  tag.setAttribute(TAG_KEY_ATTR, key);
  tag.innerHTML = renderTagMarkup(model);
  if (!existing) host.appendChild(tag);
}

export function syncMapTags() {
  if (!stopObserver || !prefsLoaded) return;
  const buildings = readLandscapeBuildings(document);
  if (buildings.length === 0) return;

  const remembered = rememberBuildings(prefs, buildings);
  if (remembered.changed) {
    prefs = remembered.prefs;
    scheduleSave();
  }
  for (const building of buildings) syncBuilding(building);
}

export async function startMapTags() {
  if (stopObserver) return;
  stopObserver = observeDocumentBody(() => scheduleUpdate(syncMapTags));
  await ensurePrefs();
  scheduleUpdate(syncMapTags);
}

export function stopMapTags() {
  stopObserver?.();
  stopObserver = null;
  for (const tag of document.querySelectorAll(`.${TAG_CLASS}`)) tag.remove();
  for (const el of document.querySelectorAll(`[${STATUS_ATTR}]`)) el.removeAttribute(STATUS_ATTR);
}

/** @param {string} buildingId */
export async function getBuildingPref(buildingId) {
  await ensurePrefs();
  return { ...prefs.buildings[buildingId] };
}

/**
 * @param {string} buildingId
 * @param {{ color?: number | null, nickname?: string }} change
 */
export async function changeBuildingPref(buildingId, change) {
  await ensurePrefs();
  prefs = updateBuildingPref(prefs, buildingId, change);
  scheduleSave();
  scheduleUpdate(syncMapTags);
}

export const _testUtils = {
  get prefs() {
    return prefs;
  },
  async flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    await saveBuildingPrefs(prefs);
  },
  reset() {
    stopMapTags();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    prefs = emptyPrefs();
    prefsReady = null;
    prefsLoaded = false;
  },
};
