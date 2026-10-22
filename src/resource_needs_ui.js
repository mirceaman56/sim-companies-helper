import { mountLeftSidebarPanel } from "./left_sidebar.js";
import { installFloatingTooltips } from "./floating_tooltip.js";
import { onAuthDataApplied } from "./auth.js";
import { readMoneyBalance } from "./page/money_page.js";
import { getRecipeByProductId, getRecipes } from "./production.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { onRateLimitChange } from "./data/apiClient.js";
import {
  DEFAULT_PERIOD,
  aggregateNeeds,
  mergeCapturedRates,
  compareCash,
  compareWithStock,
  cooldownRemainingMs,
  indexingGap,
  isCheckedByDefault,
  parsePeriodHours,
  resolveRates,
  sumStockByKind,
} from "./resource_needs_calc.js";
import {
  fetchPlannerData,
  fetchShortfallPrices,
  loadLastRunAt,
  loadPlannerSettings,
  loadSnapshot,
  loadCapturedRates,
  saveCapturedRates,
  gameRateLimitRemainingMs,
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
} from "./resource_needs_render.js";
import { startRateCapture } from "./resource_needs_capture.js";
import { logGroupEnd, logGroupStart, logStep, logWarn } from "./resource_needs_log.js";

const SAVE_DELAY_MS = 400;

/** @type {import("./resource_needs.js").PlannerSettings} */
let settings = { expanded: false, defaultPeriod: "", buildings: {} };
/** @type {import("./resource_needs.js").PlannerSnapshot|null} */
let snapshot = null;
let lastRunAt = 0;
/** @type {Record<string, import("./resource_needs_calc.js").CapturedRates>} */
let capturedRates = {};
let running = false;
let cooldownTimer = /** @type {ReturnType<typeof setInterval>|null} */ (null);
let saveTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
let runError = "";

const sortedRecipes = getRecipes()
  .map((r) => ({ id: Number(r.id), name: String(r.name) }))
  .sort((a, b) => a.name.localeCompare(b.name));

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

function buildRows() {
  return (snapshot?.buildings ?? []).map((building) => {
    const pref = prefFor(building.id);
    const checked = pref.checked ?? isCheckedByDefault(building);
    const productId = pref.productId !== undefined ? pref.productId : building.productId;
    const captured = capturedRates[building.id];
    const rates = resolveRates(building, captured, pref, productId ?? null);
    return {
      building,
      checked,
      productId: productId ?? null,
      period: pref.period ?? "",
      pref,
      rates,
      gap: indexingGap(rates, productId ?? null, captured),
      offers: captured?.offers ?? null,
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
        hours: hours ?? 0,
        unitsPerHour: row.rates.unitsPerHour,
        wagesPerHour: row.rates.wagesPerHour,
      };
    });

  const needs = aggregateNeeds(plans, getRecipeByProductId);
  const prices = new Map(Object.entries(snapshot?.prices ?? {}).map(([k, v]) => [Number(k), v]));
  const stockCompare = compareWithStock(needs.inputs, sumStockByKind(snapshot?.stock ?? []), prices);
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
    results.innerHTML = `<p class="scx-needs-hint">${escapeHtml(t("needsEmpty"))}</p>`;
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
  list.innerHTML = snapshot
    ? renderBuildingList(buildRows(), sortedRecipes, defaultPeriodText(), productName)
    : "";
  renderResultsOnly();
}

function updateCooldownUi() {
  const button = /** @type {HTMLButtonElement|null} */ (document.getElementById(RUN_ID));
  const status = document.getElementById(COOLDOWN_ID);
  if (!button || !status) return;
  const own = cooldownRemainingMs(lastRunAt);
  const game = gameRateLimitRemainingMs();
  const remaining = Math.max(own, game);
  button.disabled = running || remaining > 0;
  if (running) status.textContent = t("needsLoading");
  else if (game > own) status.textContent = fill(t("needsRateLimited"), { time: formatCountdown(game) });
  else if (own > 0) status.textContent = fill(t("needsCooldown"), { time: formatCountdown(own) });
  else status.textContent = "";

  if (remaining > 0 && !cooldownTimer) cooldownTimer = setInterval(updateCooldownUi, 1000);
  if (remaining <= 0 && cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

async function runCalculation() {
  // why: another tab may have used the shared cooldown since this panel last looked.
  lastRunAt = await loadLastRunAt();
  if (running || cooldownRemainingMs(lastRunAt) > 0 || gameRateLimitRemainingMs() > 0) {
    updateCooldownUi();
    return;
  }
  running = true;
  runError = "";
  updateCooldownUi();
  logGroupStart(`Calculate @ ${new Date().toISOString()}`);
  try {
    logStep("settings", structuredClone(settings));
    const next = await fetchPlannerData();
    snapshot = next;
    const model = computeModel();
    logStep("plans", model.plans);
    logStep("input needs", Object.fromEntries(model.needs.inputs));
    logStep("incomplete", model.needs.incomplete);
    const missingIds = model.stockCompare.rows.filter((row) => row.missing > 0).map((row) => row.productId);
    snapshot = { ...next, prices: await fetchShortfallPrices(missingIds) };
    const finalModel = computeModel();
    logStep("stock compare", finalModel.stockCompare);
    logStep("cash", finalModel.cash);
    await saveSnapshot(snapshot);
  } catch (error) {
    const err = /** @type {any} */ (error);
    logWarn("calculation failed", { code: err?.code, message: err?.message });
    const limited = err?.code === "RATE_LIMIT_COOLDOWN" || err?.rateLimited;
    runError = limited
      ? fill(t("needsRateLimited"), { time: formatCountdown(gameRateLimitRemainingMs()) })
      : t("needsFailed");
  } finally {
    logGroupEnd();
    running = false;
    lastRunAt = await loadLastRunAt();
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
  else if (field === "period") pref.period = target.value;
  else if (field === "unitsPerHour" || field === "wagesPerHour") {
    const n = Number(target.value);
    pref[field] = target.value && Number.isFinite(n) && n > 0 ? n : null;
  }
  settings.buildings = { ...settings.buildings, [id]: pref };
  scheduleSave();

  row.classList.toggle("scx-needs-row-off", pref.checked === false);
  // A new product changes which game rates apply, so the row's hints must be rebuilt.
  if (field === "productId" && event.type === "change") renderAll();
  else renderResultsOnly();
}

function toggleExpanded() {
  settings.expanded = !settings.expanded;
  document.getElementById(TOGGLE_ID)?.setAttribute("aria-expanded", String(settings.expanded));
  document.getElementById(BODY_ID)?.classList.toggle("scx-hidden", !settings.expanded);
  document.getElementById(PANEL_ID)?.classList.toggle("scx-needs-expanded", settings.expanded);
  scheduleSave();
  if (settings.expanded) renderResultsOnly();
}

function createPanel() {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = `scx-panel scx-needs-panel${settings.expanded ? " scx-needs-expanded" : ""}`;
  panel.setAttribute("aria-label", t("needsTitle"));
  panel.innerHTML = renderShell(settings);
  panel.querySelector(`#${TOGGLE_ID}`)?.addEventListener("click", toggleExpanded);
  panel.querySelector(`#${RUN_ID}`)?.addEventListener("click", runCalculation);
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
  document.getElementById(PANEL_ID)?.remove();
  mountLeftSidebarPanel(createPanel());
  renderAll();
  updateCooldownUi();
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
  const saved = await saveCapturedRates(capturedRates);
  logStep(`building ${buildingId} remembered (saved: ${saved})`, capturedRates[buildingId]);
  const known = snapshot?.buildings.some((b) => String(b.id) === buildingId);
  if (!known) logWarn(`building ${buildingId} is not in the last Calculate list; press Calculate to show it`);
  renderAll();
}

export async function initResourceNeeds() {
  installFloatingTooltips();
  // Reading building pages must not wait on storage: a failed load would silently disable it.
  startRateCapture((buildingId, reading) => {
    onBuildingRates(buildingId, reading).catch((error) => logWarn("saving building page failed", error));
  });
  try {
    await loadAndRender();
    logStep("panel ready", {
      buildings: snapshot?.buildings.length ?? 0,
      remembered: Object.keys(capturedRates),
    });
  } catch (error) {
    logWarn("panel load failed", error);
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
