import { mountLeftSidebarPanel } from "./left_sidebar.js";
import { installFloatingTooltips } from "./floating_tooltip.js";
import { onAuthDataApplied } from "./auth.js";
import { readMoneyBalance } from "./page/money_page.js";
import { getRecipeByProductId } from "./production.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { onRateLimitChange } from "./data/apiClient.js";
import {
  DEFAULT_PERIOD,
  aggregateNeeds,
  clampQuality,
  compareCash,
  compareWithStock,
  cooldownRemainingMs,
  indexingGap,
  isCheckedByDefault,
  mergeCapturedRates,
  parsePeriodHours,
  resolveProduct,
  resolveRates,
} from "./resource_needs_calc.js";
import {
  fetchPrices,
  fetchStock,
  gameRateLimitRemainingMs,
  loadCapturedRates,
  loadLastRunAt,
  loadPlannerBuildings,
  loadPlannerSettings,
  loadSnapshot,
  saveCapturedRates,
  saveLastRunAt,
  savePlannerSettings,
  saveSnapshot,
} from "./resource_needs.js";
import {
  BODY_ID,
  COOLDOWN_ID,
  LIST_ID,
  PANEL_ID,
  PERIOD_ID,
  RESULTS_ID,
  RUN_ID,
  TOGGLE_ID,
  fill,
  formatCountdown,
  renderBuildingList,
  renderResults,
  renderShell,
  runButtonLabel,
} from "./resource_needs_render.js";
import { startRateCapture } from "./resource_needs_capture.js";

const SAVE_DELAY_MS = 400;

/** @type {import("./resource_needs.js").PlannerSettings} */
let settings = { expanded: false, defaultPeriod: "", buildings: {} };
/** @type {import("./resource_needs_calc.js").PlannerBuilding[]|null} */
let buildings = null;
let buildingsLoading = false;
let buildingsError = "";
/** @type {import("./resource_needs.js").PlannerSnapshot|null} */
let snapshot = null;
let lastRunAt = 0;
/** @type {Record<string, import("./resource_needs_calc.js").CapturedRates>} */
let capturedRates = {};
let running = false;
/** @type {import("./resource_needs.js").PriceProgress|null} */
let progress = null;
let cooldownTimer = /** @type {ReturnType<typeof setInterval>|null} */ (null);
let saveTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
let runError = "";

/** @param {number} productId */
function productName(productId) {
  return getRecipeByProductId(productId)?.name ?? `#${productId}`;
}

function defaultPeriodText() {
  return settings.defaultPeriod.trim() || DEFAULT_PERIOD;
}

/** @param {number|string} id */
function prefFor(id) {
  return settings.buildings[id] ?? {};
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    savePlannerSettings(settings);
  }, SAVE_DELAY_MS);
}

/** @param {any} error */
function errorText(error) {
  return error?.code === "RATE_LIMIT_COOLDOWN"
    ? fill(t("needsRateLimited"), { time: formatCountdown(gameRateLimitRemainingMs()) })
    : t("needsFailed");
}

function buildRows() {
  return (buildings ?? []).map((building) => {
    const pref = prefFor(building.id);
    const productId = resolveProduct(building, pref.productId);
    const captured = capturedRates[building.id];
    const rates = resolveRates(captured, productId);
    return {
      building,
      checked: pref.checked ?? isCheckedByDefault(building),
      productId,
      quality: clampQuality(pref.quality),
      period: pref.period ?? "",
      rates,
      gap: indexingGap(rates, productId, captured),
      captured: captured ?? null,
    };
  });
}

function computeModel() {
  const now = Date.now();
  const rows = buildRows();
  let invalidPeriodCount = 0;
  const plans = rows
    .filter((row) => row.checked)
    .map((row) => {
      const hours = parsePeriodHours(row.period || defaultPeriodText(), now);
      if (hours === null) invalidPeriodCount += 1;
      return {
        buildingId: row.building.id,
        productId: row.productId,
        quality: row.quality,
        hours: hours ?? 0,
        unitsPerHour: row.rates.unitsPerHour,
        wagesPerHour: row.rates.wagesPerHour,
      };
    });

  const needs = aggregateNeeds(plans, getRecipeByProductId);
  const stockCompare = compareWithStock(needs.inputs, snapshot?.stock ?? [], snapshot?.prices ?? {});
  const cash = compareCash(needs.wages, stockCompare.buyTotal, readMoneyBalance(document));
  const notIndexed = rows.filter((row) => row.checked && row.gap);
  return { plans, needs, stockCompare, cash, notIndexed, invalidPeriodCount };
}

function renderResultsOnly() {
  const results = document.getElementById(RESULTS_ID);
  if (!results) return;
  if (runError) {
    results.innerHTML = `<div class="scx-state scx-state-error">${escapeHtml(runError)}</div>`;
    return;
  }
  if (!snapshot) {
    results.innerHTML = buildings?.length
      ? `<p class="scx-needs-hint">${escapeHtml(t("needsEmpty"))}</p>`
      : "";
    return;
  }
  const model = computeModel();
  results.innerHTML = renderResults(
    { ...model, wages: model.needs.wages, fetchedAt: snapshot.fetchedAt },
    productName,
  );
}

function renderAll() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  if (buildingsError)
    list.innerHTML = `<div class="scx-state scx-state-error">${escapeHtml(buildingsError)}</div>`;
  else if (buildings) list.innerHTML = renderBuildingList(buildRows(), defaultPeriodText(), productName);
  else
    list.innerHTML = buildingsLoading ? `<p class="scx-needs-hint">${escapeHtml(t("needsLoading"))}</p>` : "";
  renderResultsOnly();
}

function updateCooldownUi() {
  const button = /** @type {HTMLButtonElement|null} */ (document.getElementById(RUN_ID));
  const status = document.getElementById(COOLDOWN_ID);
  if (!button || !status) return;
  const own = cooldownRemainingMs(lastRunAt);
  const game = gameRateLimitRemainingMs();
  const remaining = Math.max(own, game);
  button.disabled = running || remaining > 0 || !buildings?.length;
  button.textContent = runButtonLabel(running ? progress : null);
  if (game > 0) status.textContent = fill(t("needsRateLimited"), { time: formatCountdown(game) });
  else if (running) status.textContent = progress ? "" : t("needsLoadingStock");
  else if (own > 0) status.textContent = fill(t("needsCooldown"), { time: formatCountdown(own) });
  else status.textContent = "";

  if (remaining > 0 && !cooldownTimer) cooldownTimer = setInterval(updateCooldownUi, 1000);
  if (remaining <= 0 && cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

async function ensureBuildings() {
  if (buildings || buildingsLoading) return;
  buildingsLoading = true;
  buildingsError = "";
  renderAll();
  try {
    buildings = await loadPlannerBuildings();
  } catch (error) {
    buildingsError = errorText(error);
  } finally {
    buildingsLoading = false;
    renderAll();
    updateCooldownUi();
  }
}

async function runCalculation() {
  // why: another tab may have used the shared cooldown since this panel last looked.
  lastRunAt = await loadLastRunAt();
  if (running || !buildings?.length || cooldownRemainingMs(lastRunAt) > 0 || gameRateLimitRemainingMs() > 0) {
    updateCooldownUi();
    return;
  }
  running = true;
  progress = null;
  runError = "";
  // why: the cooldown starts on the click, not on success, so failed runs cannot be spammed.
  lastRunAt = Date.now();
  await saveLastRunAt(lastRunAt);
  updateCooldownUi();
  try {
    const stock = await fetchStock();
    snapshot = { fetchedAt: Date.now(), stock, prices: {} };
    const missing = computeModel().stockCompare.rows.filter((row) => row.missing > 0);
    const result = await fetchPrices(missing, (next) => {
      progress = next;
      updateCooldownUi();
    });
    snapshot = { ...snapshot, prices: result.prices };
    await saveSnapshot(snapshot);
  } catch (error) {
    runError = errorText(error);
  } finally {
    running = false;
    progress = null;
    updateCooldownUi();
    renderAll();
  }
}

/** @param {Event} event */
function onFieldChange(event) {
  const target = /** @type {HTMLInputElement|HTMLSelectElement} */ (event.target);
  if (target.id === PERIOD_ID) {
    settings.defaultPeriod = target.value;
    scheduleSave();
    for (const input of document.querySelectorAll(`#${LIST_ID} .scx-needs-period`)) {
      input.setAttribute("placeholder", defaultPeriodText());
    }
    renderResultsOnly();
    return;
  }

  const row = target.closest?.("[data-building-id]");
  const field = target.getAttribute("data-field");
  if (!row || !field) return;
  const id = String(row.getAttribute("data-building-id"));
  const pref = { ...prefFor(id) };
  if (field === "checked") pref.checked = /** @type {HTMLInputElement} */ (target).checked;
  else if (field === "productId") pref.productId = target.value ? Number(target.value) : null;
  else if (field === "quality") pref.quality = clampQuality(target.value);
  else if (field === "period") pref.period = target.value;
  settings.buildings = { ...settings.buildings, [id]: pref };
  scheduleSave();

  // A new product or a re-enabled row changes the rates line and indexing hint.
  if (event.type === "change" && (field === "productId" || field === "checked")) renderAll();
  else {
    row.classList.toggle("scx-needs-row-off", pref.checked === false);
    renderResultsOnly();
  }
}

/** @param {MouseEvent} event */
function onPickProduct(event) {
  const button = /** @type {Element} */ (event.target).closest?.("[data-pick-product]");
  if (!button) return;
  const select = document.getElementById(`scx-needs-product-${button.getAttribute("data-pick-product")}`);
  select?.scrollIntoView({ block: "center", behavior: "smooth" });
  select?.focus();
}

function toggleExpanded() {
  settings.expanded = !settings.expanded;
  document.getElementById(TOGGLE_ID)?.setAttribute("aria-expanded", String(settings.expanded));
  document.getElementById(BODY_ID)?.classList.toggle("scx-hidden", !settings.expanded);
  document.getElementById(PANEL_ID)?.classList.toggle("scx-needs-expanded", settings.expanded);
  scheduleSave();
  if (settings.expanded) ensureBuildings();
}

function createPanel() {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = `scx-panel scx-needs-panel${settings.expanded ? " scx-needs-expanded" : ""}`;
  panel.setAttribute("aria-label", t("needsTitle"));
  panel.innerHTML = renderShell(settings);
  panel.querySelector(`#${TOGGLE_ID}`)?.addEventListener("click", toggleExpanded);
  panel.querySelector(`#${RUN_ID}`)?.addEventListener("click", runCalculation);
  panel.addEventListener("click", onPickProduct);
  panel.addEventListener("input", onFieldChange);
  panel.addEventListener("change", onFieldChange);
  return panel;
}

async function loadAndRender() {
  [settings, snapshot, lastRunAt, capturedRates] = await Promise.all([
    loadPlannerSettings(),
    loadSnapshot(),
    loadLastRunAt(),
    loadCapturedRates(),
  ]);
  buildings = null;
  buildingsError = "";
  document.getElementById(PANEL_ID)?.remove();
  mountLeftSidebarPanel(createPanel());
  renderAll();
  updateCooldownUi();
  if (settings.expanded) await ensureBuildings();
}

/**
 * @param {string} buildingId
 * @param {import("./resource_needs_calc.js").PageReading} reading
 */
async function onBuildingRates(buildingId, reading) {
  capturedRates = {
    ...capturedRates,
    [buildingId]: mergeCapturedRates(capturedRates[buildingId], reading),
  };
  await saveCapturedRates(capturedRates);
  renderAll();
}

export async function initResourceNeeds() {
  installFloatingTooltips();
  // Reading building pages must not wait on storage: a failed load would silently disable it.
  startRateCapture((buildingId, reading) => {
    onBuildingRates(buildingId, reading).catch((error) =>
      console.warn("[SimHelper] saving building page failed", error),
    );
  });
  try {
    await loadAndRender();
  } catch (error) {
    console.warn("[SimHelper] resources-needed panel failed to load", error);
  }
  // Settings, snapshot and cooldown are stored per company and realm.
  onAuthDataApplied(() => loadAndRender());
  onRateLimitChange(() => updateCooldownUi());
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    lastRunAt = await loadLastRunAt();
    updateCooldownUi();
  });
}

export const _testUtils = { runCalculation, computeModel, loadAndRender, onBuildingRates };
