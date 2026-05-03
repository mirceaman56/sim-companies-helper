import { t } from "./i18n.js";
import recipes from "./resources/recipes.json";
import { COPY_BUTTON_SVG, escapeHtml } from "./utils.js";
import { DEFAULT_CHAT_ROOM_DB_LETTER, shouldForceAnyFilterForRoom } from "./chat_rooms.js";

const SEARCH_TAB = "search";
const ALERTS_TAB = "alerts";
const FILTER_ROOM_ID = "scx-filter-room";
const FILTER_TYPE_ID = "scx-filter-type";
const FILTER_PRODUCT_ID = "scx-filter-product";
const FILTER_QUALITY_ID = "scx-filter-quality";
const FILTER_QUALITY_LABEL_ID = "scx-filter-quality-label";
const FILTER_QUALITY_SUMMARY_ID = "scx-filter-quality-summary";
const FILTER_ACTION_ID = "scx-filter-action";
const FILTER_STATUS_ID = "scx-filter-status";
const FILTER_RESULTS_ID = "scx-filter-results";
const ALERTS_MOUNT_ID = "scx-chat-alerts-mount";

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

function getQualitySummaryLabel(container) {
  return container?.querySelector?.(`#${FILTER_QUALITY_SUMMARY_ID}`) || null;
}

function shouldForceAnyFromContainer(container) {
  const roomSelect = container?.querySelector?.(`#${FILTER_ROOM_ID}`);
  const selectedOption = roomSelect?.options?.[roomSelect.selectedIndex] || null;
  return selectedOption?.dataset?.forceAny === "true";
}

export function createChatFilterContent({ onAction, onRoomChange, onTabChange, recipesList = recipes } = {}) {
  const container = document.createElement("div");
  container.className = "scx-chat-filter scx-panel";
  container.innerHTML = `
    <div class="scx-panel-head scx-chat-panel-head">
      <div class="scx-chat-tabs" role="tablist" aria-label="${t("chatFilter")}">
        <button class="scx-btn scx-btn-secondary scx-btn-sm scx-chat-tab is-active" type="button" data-tab="${SEARCH_TAB}">${t("searchTab")}</button>
        <button class="scx-btn scx-btn-secondary scx-btn-sm scx-chat-tab" type="button" data-tab="${ALERTS_TAB}">${t("alertsTab")}</button>
      </div>
      <button class="scx-copy-btn" data-copy-action="chat-filter" data-tooltip="${t("copyText")}" type="button">
        ${COPY_BUTTON_SVG}
      </button>
    </div>

    <div class="scx-chat-tab-panel" data-tab-panel="${SEARCH_TAB}">
      <div class="scx-chat-controls">
        <div class="scx-chat-row scx-chat-row-stacked">
          <label class="scx-label" for="${FILTER_ROOM_ID}">${t("chatRoom")}</label>
          <select id="${FILTER_ROOM_ID}" name="${FILTER_ROOM_ID}" class="scx-select scx-flex-1"></select>
        </div>

        <div class="scx-chat-row scx-chat-row-stacked">
          <label class="scx-label" for="${FILTER_TYPE_ID}">${t("buying")} / ${t("selling")}</label>
          <select id="${FILTER_TYPE_ID}" name="${FILTER_TYPE_ID}" class="scx-select scx-flex-1">
            <option value="buy">${t("buying")}</option>
            <option value="sell">${t("selling")}</option>
          </select>
        </div>

        <div class="scx-chat-row scx-chat-row-stacked">
          <label class="scx-label" for="${FILTER_PRODUCT_ID}">${t("product")}</label>
          <select id="${FILTER_PRODUCT_ID}" name="${FILTER_PRODUCT_ID}" class="scx-select scx-flex-1"></select>
        </div>

        <details class="scx-chat-quality-picker">
          <summary class="scx-chat-quality-summary">
            <span id="${FILTER_QUALITY_LABEL_ID}" class="scx-label">${t("qualityOptional")}</span>
            <span id="${FILTER_QUALITY_SUMMARY_ID}" class="scx-chip">All</span>
          </summary>
          <div class="scx-quality-container" id="${FILTER_QUALITY_ID}" aria-labelledby="${FILTER_QUALITY_LABEL_ID}"></div>
        </details>

        <button id="${FILTER_ACTION_ID}" class="scx-btn scx-btn-primary scx-width-full">${t("startSearch")}</button>
      </div>

      <div id="${FILTER_STATUS_ID}" class="scx-status"></div>
      <div id="${FILTER_RESULTS_ID}" class="scx-chat-results"></div>
    </div>

    <div class="scx-chat-tab-panel" data-tab-panel="${ALERTS_TAB}" hidden>
      <div id="${ALERTS_MOUNT_ID}"></div>
    </div>
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

  container.querySelector(`#${FILTER_ROOM_ID}`)?.addEventListener("change", () => {
    syncChatTypeState(container);
    if (typeof onRoomChange === "function") onRoomChange();
  });

  container.querySelectorAll(".scx-chat-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveChatTab(container, button.dataset.tab || SEARCH_TAB);
      if (typeof onTabChange === "function") onTabChange(button.dataset.tab || SEARCH_TAB);
    });
  });

  container.querySelectorAll(`#${FILTER_QUALITY_ID} input[type="checkbox"]`).forEach((input) => {
    input.addEventListener("change", () => {
      updateQualitySummary(container);
    });
  });

  updateQualitySummary(container);
  return container;
}

export function populateChatRoomSelect(
  container,
  chatRooms = [],
  selectedRoomDbLetter = DEFAULT_CHAT_ROOM_DB_LETTER,
) {
  const roomSelect = container?.querySelector?.(`#${FILTER_ROOM_ID}`);
  if (!roomSelect) return;

  roomSelect.innerHTML = "";
  for (const room of chatRooms) {
    const option = document.createElement("option");
    option.value = room.dbLetter;
    option.textContent = room.name;
    option.dataset.forceAny = shouldForceAnyFilterForRoom(room.dbLetter) ? "true" : "false";
    if (room.dbLetter === selectedRoomDbLetter) {
      option.selected = true;
    }
    roomSelect.appendChild(option);
  }
}

export function syncChatTypeState(container) {
  const typeSelect = container?.querySelector?.(`#${FILTER_TYPE_ID}`);
  if (!typeSelect) return;

  typeSelect.disabled = shouldForceAnyFromContainer(container);
}

export function updateQualitySummary(container) {
  const summary = getQualitySummaryLabel(container);
  if (!summary) return;

  const checkedQualities =
    container?.querySelectorAll?.(`#${FILTER_QUALITY_ID} input[type="checkbox"]:checked`) || [];
  const values = [...checkedQualities].map((input) => input.value);
  summary.textContent = values.length > 0 ? values.join(", ") : t("maAll");
}

export function readChatSearchInput(container) {
  const roomSelect = container?.querySelector?.(`#${FILTER_ROOM_ID}`);
  const typeSelect = container?.querySelector?.(`#${FILTER_TYPE_ID}`);
  const productSelect = container?.querySelector?.(`#${FILTER_PRODUCT_ID}`);
  const checkedQualities =
    container?.querySelectorAll?.(`#${FILTER_QUALITY_ID} input[type="checkbox"]:checked`) || [];

  const productId = Number.parseInt(productSelect?.value || "", 10);
  const productOption = productSelect?.options?.[productSelect.selectedIndex] || null;
  const roomOption = roomSelect?.options?.[roomSelect.selectedIndex] || null;
  const forceAny = shouldForceAnyFromContainer(container);

  return {
    roomDbLetter: roomSelect?.value || DEFAULT_CHAT_ROOM_DB_LETTER,
    roomName: roomOption?.textContent || "",
    filterType: forceAny ? "any" : typeSelect?.value || "buy",
    productId: Number.isFinite(productId) ? productId : null,
    productName: productOption?.textContent || "",
    selectedQualities: [...checkedQualities].map((input) => input.value),
  };
}

export function setActiveChatTab(container, tabId) {
  const normalized = tabId === ALERTS_TAB ? ALERTS_TAB : SEARCH_TAB;
  container?.querySelectorAll?.(".scx-chat-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === normalized);
  });
  container?.querySelectorAll?.(".scx-chat-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== normalized;
  });
}

export function getActiveChatTab(container) {
  const active = container?.querySelector?.(".scx-chat-tab.is-active");
  return active?.dataset?.tab || SEARCH_TAB;
}

export function getAlertsMount(container) {
  return container?.querySelector?.(`#${ALERTS_MOUNT_ID}`) || null;
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
  SEARCH_TAB,
  ALERTS_TAB,
  FILTER_ROOM_ID,
  FILTER_TYPE_ID,
  FILTER_PRODUCT_ID,
  FILTER_QUALITY_ID,
  FILTER_ACTION_ID,
  FILTER_STATUS_ID,
  FILTER_RESULTS_ID,
  ALERTS_MOUNT_ID,
  buildRecipeIndex,
  getSortedRecipes,
};
