import { t } from "./i18n.js";
import recipes from "./resources/recipes.json";
import { escapeHtml } from "./utils.js";

const FILTER_TYPE_ID = "scx-filter-type";
const FILTER_PRODUCT_ID = "scx-filter-product";
const FILTER_QUALITY_ID = "scx-filter-quality";
const FILTER_QUALITY_LABEL_ID = "scx-filter-quality-label";
const FILTER_ACTION_ID = "scx-filter-action";
const FILTER_STATUS_ID = "scx-filter-status";
const FILTER_RESULTS_ID = "scx-filter-results";

function buildRecipeIndex(recipesList = recipes) {
  return new Map(
    (Array.isArray(recipesList) ? recipesList : [])
      .filter((recipe) => Number.isFinite(Number(recipe?.id)) && recipe?.name)
      .map((recipe) => [Number(recipe.id), String(recipe.name)]),
  );
}

function getSortedRecipes(recipesList = recipes) {
  return [...(Array.isArray(recipesList) ? recipesList : [])].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || "")),
  );
}

function getActionButton(container) {
  return container?.querySelector?.(`#${FILTER_ACTION_ID}`) || null;
}

function getResultsContainer(container) {
  return container?.querySelector?.(`#${FILTER_RESULTS_ID}`) || null;
}

export function createChatFilterContent({ onAction, recipesList = recipes } = {}) {
  const container = document.createElement("div");
  container.className = "scx-chat-filter";
  container.innerHTML = `
    <div class="scx-chat-controls">
      <div class="scx-chat-row">
        <label class="scx-visually-hidden" for="${FILTER_TYPE_ID}">${t("buying")} / ${t("selling")}</label>
        <select id="${FILTER_TYPE_ID}" name="${FILTER_TYPE_ID}" class="scx-select scx-flex-1">
          <option value="buy">${t("buying")}</option>
          <option value="sell">${t("selling")}</option>
        </select>
      </div>
      <div class="scx-chat-row">
        <label class="scx-visually-hidden" for="${FILTER_PRODUCT_ID}">${t("product")}</label>
        <select id="${FILTER_PRODUCT_ID}" name="${FILTER_PRODUCT_ID}" class="scx-select scx-flex-1"></select>
      </div>
      <div class="scx-chat-row">
        <div id="${FILTER_QUALITY_LABEL_ID}" class="scx-label scx-label-inline">${t("qualityOptional")}</div>
      </div>
      <div class="scx-quality-container" id="${FILTER_QUALITY_ID}" aria-labelledby="${FILTER_QUALITY_LABEL_ID}"></div>
      <button id="${FILTER_ACTION_ID}" class="scx-btn scx-btn-primary scx-width-full">${t("startSearch")}</button>
    </div>
    <div id="${FILTER_STATUS_ID}" class="scx-status"></div>
    <div id="${FILTER_RESULTS_ID}" class="scx-chat-results"></div>
  `;

  const productSelect = container.querySelector(`#${FILTER_PRODUCT_ID}`);
  for (const recipe of getSortedRecipes(recipesList)) {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    productSelect?.appendChild(option);
  }

  const qualityContainer = container.querySelector(`#${FILTER_QUALITY_ID}`);
  for (let quality = 1; quality <= 12; quality += 1) {
    const label = document.createElement("label");
    label.className = "scx-quality-label";
    label.innerHTML = `<input type="checkbox" value="Q${quality}" id="scx-quality-${quality}" name="scx-quality-${quality}"> Q${quality}`;
    qualityContainer?.appendChild(label);
  }

  getActionButton(container)?.addEventListener("click", () => {
    if (typeof onAction === "function") onAction();
  });

  return container;
}

export function readChatSearchInput(container) {
  const typeSelect = container?.querySelector?.(`#${FILTER_TYPE_ID}`);
  const productSelect = container?.querySelector?.(`#${FILTER_PRODUCT_ID}`);
  const checkedQualities =
    container?.querySelectorAll?.(`#${FILTER_QUALITY_ID} input[type="checkbox"]:checked`) || [];

  const productId = Number.parseInt(productSelect?.value || "", 10);
  const productOption = productSelect?.options?.[productSelect.selectedIndex] || null;
  const typeOption = typeSelect?.options?.[typeSelect.selectedIndex] || null;

  return {
    filterType: typeSelect?.value || "buy",
    productId: Number.isFinite(productId) ? productId : null,
    productName: productOption?.textContent || "",
    filterTypeLabel: typeOption?.textContent || "",
    selectedQualities: [...checkedQualities].map((input) => input.value),
  };
}

export function setChatSearchState(container, isSearching) {
  const actionBtn = getActionButton(container);
  if (!actionBtn) return;

  actionBtn.textContent = isSearching ? t("stop") : t("startSearch");
  actionBtn.classList.toggle("stop", Boolean(isSearching));
}

export function updateChatStatus(container, text) {
  const statusEl = container?.querySelector?.(`#${FILTER_STATUS_ID}`);
  if (statusEl) statusEl.textContent = text;
}

export function clearChatResults(container) {
  const resultsEl = getResultsContainer(container);
  if (resultsEl) resultsEl.innerHTML = "";
}

export function buildCompanyUrl(companyName, realmId = 0) {
  const slug = encodeURIComponent(
    String(companyName || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-"),
  );
  return `https://www.simcompanies.com/company/${realmId}/${slug}/`;
}

export function formatChatMessageBody(body, recipeIndex = buildRecipeIndex()) {
  const escapedBody = escapeHtml(String(body || ""));

  return escapedBody.replace(/:(re|pr)-(\d+):/g, (match, _type, id) => {
    const recipeName = recipeIndex.get(Number(id));
    return recipeName ? `[${escapeHtml(recipeName)}]` : match;
  });
}

export function appendChatResult(container, message, { realmId = 0, recipeIndex = buildRecipeIndex() } = {}) {
  const resultsEl = getResultsContainer(container);
  if (!resultsEl) return null;

  const item = document.createElement("div");
  item.className = "scx-chat-message";

  const date = new Date(message?.datetime || 0);
  const timeStr = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const companyName = String(message?.sender?.company || "");
  const linkUrl = buildCompanyUrl(companyName, realmId);

  item.innerHTML = `
    <div class="scx-chat-message-header">
      <a href="${linkUrl}" class="scx-chat-message-company" target="_blank">${escapeHtml(companyName)}</a>
      <span>${escapeHtml(timeStr)}</span>
    </div>
    <div class="scx-chat-message-body">${formatChatMessageBody(message?.body, recipeIndex)}</div>
  `;

  resultsEl.appendChild(item);
  return item;
}

export const _testUtils = {
  FILTER_TYPE_ID,
  FILTER_PRODUCT_ID,
  FILTER_QUALITY_ID,
  FILTER_ACTION_ID,
  FILTER_STATUS_ID,
  FILTER_RESULTS_ID,
  buildRecipeIndex,
  getSortedRecipes,
};
