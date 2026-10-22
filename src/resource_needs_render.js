import { escapeHtml, formatMoney } from "./utils.js";
import { t } from "./i18n.js";

export const PANEL_ID = "scx-needs-panel";
export const TOGGLE_ID = "scx-needs-toggle";
export const BODY_ID = "scx-needs-body";
export const PERIOD_ID = "scx-needs-period";
export const RUN_ID = "scx-needs-run";
export const COOLDOWN_ID = "scx-needs-cooldown";
export const LIST_ID = "scx-needs-list";
export const RESULTS_ID = "scx-needs-results";

const qtyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * @param {string} text
 * @param {Record<string, string|number>} params
 */
export function fill(text, params) {
  return Object.entries(params).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
}

/** @param {number} value */
export function formatQty(value) {
  return Number.isFinite(value) ? qtyFormat.format(value) : "—";
}

/** @param {number} ms */
function formatClock(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** @param {number} ms */
export function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** @param {{ expanded: boolean, defaultPeriod: string }} settings */
export function renderShell(settings) {
  const help = escapeHtml(t("needsHelp"));
  return `
    <div class="scx-panel-head">
      <button type="button" class="scx-needs-toggle" id="${TOGGLE_ID}" aria-expanded="${settings.expanded}"
        aria-controls="${BODY_ID}">
        <span class="scx-panel-title">${escapeHtml(t("needsTitle"))}</span>
        <span class="scx-needs-chevron" aria-hidden="true">▸</span>
      </button>
      <span class="scx-info-icon" role="img" tabindex="0" aria-label="${help}" data-scx-tooltip="${help}">i</span>
    </div>
    <div class="scx-needs-body${settings.expanded ? "" : " scx-hidden"}" id="${BODY_ID}">
      <div class="scx-needs-controls">
        <label class="scx-needs-label" for="${PERIOD_ID}">${escapeHtml(t("needsDefaultPeriod"))}</label>
        <input class="scx-needs-input" id="${PERIOD_ID}" name="${PERIOD_ID}" type="text" autocomplete="off"
          placeholder="24h" value="${escapeHtml(settings.defaultPeriod)}">
        <button type="button" class="scx-btn scx-btn-primary scx-btn-sm" id="${RUN_ID}">
          ${escapeHtml(t("needsCalculate"))}</button>
      </div>
      <div class="scx-needs-hint">${escapeHtml(t("needsPeriodHint"))}</div>
      <div class="scx-status" id="${COOLDOWN_ID}" role="status"></div>
      <div class="scx-needs-list" id="${LIST_ID}"></div>
      <div class="scx-needs-results" id="${RESULTS_ID}" aria-live="polite"></div>
    </div>
  `;
}

/** @param {import("./resource_needs_calc.js").PlannerBuilding} building */
function renderStatusBadge(building) {
  if (building.status === "upgrading") {
    return `<span class="scx-badge scx-needs-badge-upgrading">${escapeHtml(t("needsUpgrading"))}</span>`;
  }
  if (building.status === "producing" && building.freeAt) {
    const text = fill(t("needsFreeAt"), { time: formatClock(building.freeAt) });
    return `<span class="scx-badge">${escapeHtml(text)}</span>`;
  }
  return "";
}

/**
 * @param {{ id: number, name: string }[]} recipes sorted for display
 * @param {number|null} selected
 */
function renderProductOptions(recipes, selected) {
  const empty = `<option value="">${escapeHtml(t("needsPickProduct"))}</option>`;
  return (
    empty +
    recipes
      .map(
        (r) =>
          `<option value="${r.id}"${r.id === selected ? " selected" : ""}>${escapeHtml(r.name)}</option>`,
      )
      .join("")
  );
}

/**
 * The company profile rounds levels, so a level is shown only once the building page has
 * shown the exact one.
 * @param {{ name: string }} building
 * @param {{ size: number|null }|null|undefined} captured
 */
function buildingLabel(building, captured) {
  if (!captured?.size) return building.name;
  return fill(t("needsBuildingLabel"), { name: building.name, level: captured.size });
}

/** @param {number|null} value @param {boolean} money */
function perHour(value, money) {
  if (!Number.isFinite(value) || !(value > 0)) return "—";
  return `${money ? formatMoney(value, { decimals: 0 }) : formatQty(value)}/h`;
}

/**
 * What the planner currently uses for the row, so a fresh building-page read is visible.
 * @param {{ rates: ReturnType<typeof import("./resource_needs_calc.js").resolveRates>,
 *   captured: { at: number }|null }} row
 */
function renderReadRates(row) {
  const { rates, captured } = row;
  const units = perHour(rates.unitsPerHour, false);
  const text = fill(t("needsRowRates"), {
    wages: perHour(rates.wagesPerHour, true),
    units: rates.unitsSource === "run" ? `~${units}` : units,
  });
  const read = captured?.at
    ? fill(t("needsRowReadAt"), { time: formatClock(captured.at) })
    : t("needsRowNotRead");
  return `<div class="scx-needs-sub scx-mono">${escapeHtml(text)} · ${escapeHtml(read)}</div>`;
}

/**
 * Once the building page was seen, only the products it offers are listed.
 * @param {{ id: number, name: string }[]} recipes
 * @param {number[]|null} offers
 * @param {number|null} selected
 */
function offeredRecipes(recipes, offers, selected) {
  if (!offers?.length) return recipes;
  const allowed = new Set([...offers, selected]);
  return recipes.filter((r) => allowed.has(r.id));
}

/**
 * The game page that fills the gap: a product's setup page shows its output and the
 * building's wages, the building page shows wages only.
 * @param {{ building: { id: number }, productId: number|null, gap: string|null }} row
 */
export function indexLinkHref(row) {
  if (row.gap === "units" && row.productId) return `/b/${row.building.id}/production/${row.productId}/`;
  if (row.gap === "wages" || row.gap === "building") return `/b/${row.building.id}/`;
  return null;
}

/**
 * @param {{ building: { id: number }, checked: boolean, productId: number|null, gap: string|null }} row
 * @param {(productId: number) => string} productName
 */
function renderIndexLink(row, productName) {
  if (!row.checked || !row.gap) return "";
  const href = indexLinkHref(row);
  let text = t("needsPickProduct");
  if (row.gap === "building") text = t("needsNotIndexed");
  else if (row.gap === "units" && row.productId) {
    text = fill(t("needsOpenProduct"), { product: productName(row.productId) });
  } else if (row.gap === "wages") text = t("needsOpenBuilding");
  const body = `<span aria-hidden="true">⚠</span> ${escapeHtml(text)}`;
  return href
    ? `<a class="scx-needs-gap" href="${escapeHtml(href)}">${body}</a>`
    : `<span class="scx-needs-gap">${body}</span>`;
}

/** @param {number|null} value */
function rateValue(value) {
  return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "";
}

/**
 * @param {{ building: import("./resource_needs_calc.js").PlannerBuilding, checked: boolean,
 *   productId: number|null, period: string, pref: import("./resource_needs_calc.js").BuildingPref,
 *   rates: ReturnType<typeof import("./resource_needs_calc.js").resolveRates>,
 *   gap: "building"|"product"|"units"|"wages"|null, offers: number[]|null,
 *   captured: import("./resource_needs_calc.js").CapturedRates|null }[]} rows
 * @param {{ id: number, name: string }[]} recipes
 * @param {string} defaultPeriod
 * @param {(productId: number) => string} productName
 */
export function renderBuildingList(rows, recipes, defaultPeriod, productName) {
  if (rows.length === 0) return `<p class="scx-needs-hint">${escapeHtml(t("needsNoBuildings"))}</p>`;
  return rows
    .map((row) => {
      const { building, checked, productId, period, pref, rates, offers } = row;
      const id = building.id;
      const label = buildingLabel(building, row.captured);
      const unitsHint =
        rates.unitsSource && rates.unitsSource !== "override" ? rateValue(rates.unitsPerHour) : "";
      const wagesHint =
        rates.wagesSource && rates.wagesSource !== "override" ? rateValue(rates.wagesPerHour) : "";
      return `
        <div class="scx-needs-row${checked ? "" : " scx-needs-row-off"}" data-building-id="${id}">
          <div class="scx-needs-row-head">
            <input type="checkbox" id="scx-needs-on-${id}" name="scx-needs-on-${id}" data-field="checked"
              ${checked ? "checked" : ""}>
            <label class="scx-visually-hidden" for="scx-needs-on-${id}">${escapeHtml(label)}</label>
            <a class="scx-needs-row-name" href="/b/${id}/">${escapeHtml(label)}</a>
            ${renderStatusBadge(building)}
          </div>
          ${checked ? renderReadRates(row) : ""}
          ${renderIndexLink(row, productName)}
          <div class="scx-needs-row-fields">
            <label class="scx-visually-hidden" for="scx-needs-product-${id}">${escapeHtml(t("needsProduct"))}</label>
            <select class="scx-select scx-needs-product" id="scx-needs-product-${id}" name="scx-needs-product-${id}"
              data-field="productId">${renderProductOptions(offeredRecipes(recipes, offers, productId), productId)}</select>
            <label class="scx-visually-hidden" for="scx-needs-period-${id}">${escapeHtml(t("needsBuildingPeriod"))}</label>
            <input class="scx-needs-input scx-needs-period" id="scx-needs-period-${id}" name="scx-needs-period-${id}"
              type="text" autocomplete="off" data-field="period" placeholder="${escapeHtml(defaultPeriod)}"
              value="${escapeHtml(period)}">
          </div>
          <details class="scx-needs-adjust">
            <summary>${escapeHtml(t("needsAdjust"))}</summary>
            <div class="scx-needs-adjust-grid">
              <label class="scx-needs-label" for="scx-needs-units-${id}">${escapeHtml(t("needsUnitsPerHour"))}</label>
              <input class="scx-needs-input" id="scx-needs-units-${id}" name="scx-needs-units-${id}" type="number"
                min="0" step="any" data-field="unitsPerHour" placeholder="${escapeHtml(unitsHint)}"
                value="${escapeHtml(rateValue(pref.unitsPerHour ?? null))}">
              <label class="scx-needs-label" for="scx-needs-wages-${id}">${escapeHtml(t("needsWagesPerHour"))}</label>
              <input class="scx-needs-input" id="scx-needs-wages-${id}" name="scx-needs-wages-${id}" type="number"
                min="0" step="any" data-field="wagesPerHour" placeholder="${escapeHtml(wagesHint)}"
                value="${escapeHtml(rateValue(pref.wagesPerHour ?? null))}">
            </div>
          </details>
        </div>`;
    })
    .join("");
}

/**
 * @param {{ wages: number, stockCompare: ReturnType<typeof import("./resource_needs_calc.js").compareWithStock>,
 *   cash: ReturnType<typeof import("./resource_needs_calc.js").compareCash>,
 *   notIndexed: { building: { id: number, name: string, size: number }, productId: number|null,
 *     gap: string|null, captured: { size: number|null }|null }[], invalidPeriodCount: number, fetchedAt: number }} model
 * @param {(productId: number) => string} productName
 */
export function renderResults(model, productName) {
  const { stockCompare, cash } = model;
  const missingRows = stockCompare.rows.filter((row) => row.missing > 0);

  const warnings = [];
  if (model.invalidPeriodCount > 0)
    warnings.push(fill(t("needsInvalidPeriod"), { count: model.invalidPeriodCount }));
  if (stockCompare.unpriced > 0) warnings.push(fill(t("needsUnpriced"), { count: stockCompare.unpriced }));

  const cashOk = cash.gap === 0;
  const cashTone = cash.gap === null ? "scx-alert-info" : cashOk ? "scx-alert-success" : "scx-alert-error";
  const cashTitle =
    cash.gap === null ? t("needsCashUnknown") : cashOk ? t("needsCashOk") : t("needsCashShort");

  const table =
    missingRows.length === 0
      ? `<p class="scx-needs-ok">✓ ${escapeHtml(t("needsStockOk"))}</p>`
      : `<table class="scx-needs-table">
          <thead><tr>
            <th scope="col">${escapeHtml(t("needsColProduct"))}</th>
            <th scope="col">${escapeHtml(t("needsColMissing"))}</th>
            <th scope="col">${escapeHtml(t("needsColBuyCost"))}</th>
          </tr></thead>
          <tbody>${missingRows
            .map(
              (row) => `<tr>
                <td>${escapeHtml(productName(row.productId))}
                  <div class="scx-needs-sub">${escapeHtml(
                    fill(t("needsNeedHave"), { need: formatQty(row.need), have: formatQty(row.have) }),
                  )}</div></td>
                <td class="scx-mono">${formatQty(row.missing)}</td>
                <td class="scx-mono">${row.buyCost === null ? "—" : formatMoney(row.buyCost, { decimals: 0 })}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`;

  return `
    <div class="scx-alert ${cashTone}">
      <span class="scx-alert-icon" aria-hidden="true">${cashOk ? "✓" : "!"}</span>
      <div>
        <div class="scx-alert-title">${escapeHtml(cashTitle)}</div>
        <div class="scx-alert-desc scx-needs-money">
          <span>${escapeHtml(t("needsWages"))}</span><span class="scx-mono">${formatMoney(model.wages, { decimals: 0 })}</span>
          <span>${escapeHtml(t("needsBuyMissing"))}</span><span class="scx-mono">${formatMoney(stockCompare.buyTotal, { decimals: 0 })}</span>
          <span>${escapeHtml(t("needsCash"))}</span><span class="scx-mono">${cash.cash === null ? "—" : formatMoney(cash.cash, { decimals: 0 })}</span>
          ${cash.gap ? `<span>${escapeHtml(t("needsCashGap"))}</span><span class="scx-mono">${formatMoney(cash.gap, { decimals: 0 })}</span>` : ""}
        </div>
      </div>
    </div>
    ${table}
    ${renderNotIndexed(model.notIndexed)}
    ${warnings.map((w) => `<p class="scx-needs-warning">⚠ ${escapeHtml(w)}</p>`).join("")}
    <div class="scx-status">${escapeHtml(fill(t("needsFetchedAt"), { time: formatClock(model.fetchedAt) }))}</div>
  `;
}

/**
 * @param {{ building: { id: number, name: string, size: number }, productId: number|null,
 *   gap: string|null, captured: { size: number|null }|null }[]} rows
 */
function renderNotIndexed(rows) {
  if (rows.length === 0) return "";
  const items = rows
    .map((row) => {
      const label = escapeHtml(buildingLabel(row.building, row.captured));
      const href = indexLinkHref(row);
      return `<li>${href ? `<a href="${escapeHtml(href)}">${label}</a>` : label}</li>`;
    })
    .join("");
  return `
    <div class="scx-needs-not-indexed">
      <p class="scx-needs-warning">⚠ ${escapeHtml(fill(t("needsIncomplete"), { count: rows.length }))}</p>
      <ul class="scx-needs-not-indexed-list">${items}</ul>
    </div>`;
}
