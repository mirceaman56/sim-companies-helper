import { escapeHtml, formatMoney } from "./utils.js";
import { t } from "./i18n.js";
import { MAX_QUALITY, productsForBuilding } from "./resource_needs_calc.js";

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

/** @param {number} quality */
export function qualityLabel(quality) {
  return fill(t("needsQualityOption"), { quality });
}

/** @param {{ done: number, total: number }|null} progress */
export function runButtonLabel(progress) {
  return progress ? fill(t("needsPricesProgress"), progress) : t("needsCalculate");
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
          ${escapeHtml(runButtonLabel(null))}</button>
      </div>
      <div class="scx-needs-hint">${escapeHtml(t("needsPeriodHint"))}</div>
      <div class="scx-status" id="${COOLDOWN_ID}" role="status"></div>
      <div class="scx-needs-results" id="${RESULTS_ID}" aria-live="polite"></div>
      <div class="scx-needs-list" id="${LIST_ID}"></div>
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
 * @param {string} kind building letter
 * @param {number|null} selected
 * @param {(productId: number) => string} productName
 */
function renderProductOptions(kind, selected, productName) {
  const products = productsForBuilding(kind)
    .map((id) => ({ id, name: productName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const empty = selected ? "" : `<option value="">${escapeHtml(t("needsPickProduct"))}</option>`;
  return (
    empty +
    products
      .map(
        (p) =>
          `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${escapeHtml(p.name)}</option>`,
      )
      .join("")
  );
}

/** @param {number} selected */
function renderQualityOptions(selected) {
  let out = "";
  for (let q = 0; q <= MAX_QUALITY; q += 1) {
    out += `<option value="${q}"${q === selected ? " selected" : ""}>${escapeHtml(qualityLabel(q))}</option>`;
  }
  return out;
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
  const text = fill(t("needsRowRates"), {
    wages: perHour(rates.wagesPerHour, true),
    units: perHour(rates.unitsPerHour, false),
  });
  const read = captured?.at
    ? fill(t("needsRowReadAt"), { time: formatClock(captured.at) })
    : t("needsRowNotRead");
  return `<div class="scx-needs-sub scx-mono">${escapeHtml(text)} · ${escapeHtml(read)}</div>`;
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

/**
 * @param {{ building: import("./resource_needs_calc.js").PlannerBuilding, checked: boolean,
 *   productId: number|null, quality: number, period: string,
 *   rates: ReturnType<typeof import("./resource_needs_calc.js").resolveRates>,
 *   gap: "building"|"product"|"units"|"wages"|null,
 *   captured: import("./resource_needs_calc.js").CapturedRates|null }[]} rows
 * @param {string} defaultPeriod
 * @param {(productId: number) => string} productName
 */
export function renderBuildingList(rows, defaultPeriod, productName) {
  if (rows.length === 0) return `<p class="scx-needs-hint">${escapeHtml(t("needsNoBuildings"))}</p>`;
  return rows
    .map((row) => {
      const { building, checked, productId, quality, period } = row;
      const id = building.id;
      const label = buildingLabel(building, row.captured);
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
              data-field="productId">${renderProductOptions(building.kind, productId, productName)}</select>
            <label class="scx-visually-hidden" for="scx-needs-quality-${id}">${escapeHtml(t("needsQuality"))}</label>
            <select class="scx-select scx-needs-quality" id="scx-needs-quality-${id}" name="scx-needs-quality-${id}"
              data-field="quality">${renderQualityOptions(quality)}</select>
            <label class="scx-visually-hidden" for="scx-needs-period-${id}">${escapeHtml(t("needsBuildingPeriod"))}</label>
            <input class="scx-needs-input scx-needs-period" id="scx-needs-period-${id}" name="scx-needs-period-${id}"
              type="text" autocomplete="off" data-field="period" placeholder="${escapeHtml(defaultPeriod)}"
              value="${escapeHtml(period)}">
          </div>
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
                <td>${escapeHtml(productName(row.productId))}${
                  row.quality > 0
                    ? ` <span class="scx-badge">${escapeHtml(fill(t("needsQualityMin"), { quality: row.quality }))}</span>`
                    : ""
                }
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
    ${model.fetchedAt ? `<div class="scx-status">${escapeHtml(fill(t("needsFetchedAt"), { time: formatClock(model.fetchedAt) }))}</div>` : ""}
  `;
}

/**
 * Buildings without a product have nothing to open in the game: the fix is the planner's own
 * dropdown, so they get a button that jumps there instead of a game link.
 * @param {{ building: { id: number, name: string, size: number }, productId: number|null,
 *   gap: string|null, captured: { size: number|null }|null }[]} rows
 */
function renderNotIndexed(rows) {
  const needGame = rows.filter((row) => row.gap !== "product");
  const noProduct = rows.filter((row) => row.gap === "product");
  const gameItems = needGame
    .map((row) => {
      const label = escapeHtml(buildingLabel(row.building, row.captured));
      const href = indexLinkHref(row);
      return `<li>${href ? `<a href="${escapeHtml(href)}">${label}</a>` : label}</li>`;
    })
    .join("");
  const productItems = noProduct
    .map((row) => {
      const label = escapeHtml(buildingLabel(row.building, row.captured));
      return `<li><button type="button" class="scx-needs-pick" data-pick-product="${row.building.id}">${label}</button></li>`;
    })
    .join("");
  const group = (/** @type {string} */ text, /** @type {string} */ items) => `
    <div class="scx-needs-not-indexed">
      <p class="scx-needs-warning">⚠ ${escapeHtml(text)}</p>
      <ul class="scx-needs-not-indexed-list">${items}</ul>
    </div>`;
  return (
    (needGame.length ? group(fill(t("needsIncomplete"), { count: needGame.length }), gameItems) : "") +
    (noProduct.length ? group(fill(t("needsNoProduct"), { count: noProduct.length }), productItems) : "")
  );
}
