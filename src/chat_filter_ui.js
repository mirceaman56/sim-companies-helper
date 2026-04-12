import { getSectionContent } from "./sidebar.js";
import { STATE } from "./state.js";
import { t } from "./i18n.js";
import { CHAT_SEARCH_TARGET_COUNT, CHAT_SEARCH_CUTOFF_HOURS } from "./constants.js";
import { request } from "./data/apiClient.js";
import { buildChatSearchFilters, searchChatMessages } from "./chat_filter.js";
import {
  appendChatResult,
  clearChatResults,
  createChatFilterContent,
  readChatSearchInput,
  setChatSearchState,
  updateChatStatus,
} from "./chat_filter_presenter.js";

const SECTION_ID = "chat-section";

// State
let isSearching = false;
let searchController = null; // AbortController

/**
 * Initializes the chat filter sidebar content
 */
export function initChatFilter() {
  const content = getSectionContent(SECTION_ID);

  if (content && !content.querySelector(".scx-chat-filter")) {
    let container = null;
    container = createChatFilterContent({
      onAction: () => {
        if (isSearching) {
          stopSearch();
          return;
        }

        void startSearch(container);
      },
    });
    content.appendChild(container);
  }
}

async function startSearch(container) {
  const { filterType, productId, productName, filterTypeLabel, selectedQualities } =
    readChatSearchInput(container);

  if (!productId) return;

  isSearching = true;
  searchController = new AbortController();
  clearChatResults(container);
  setChatSearchState(container, true);
  updateChatStatus(container, `${t("searchingFor")} ${filterTypeLabel} ${productName}...`);

  const filters = buildChatSearchFilters({ filterType, productId, selectedQualities });

  try {
    await searchChatMessages({
      filters,
      signal: searchController.signal,
      targetCount: CHAT_SEARCH_TARGET_COUNT,
      cutoffHours: CHAT_SEARCH_CUTOFF_HOURS,
      requestMessages: (url, signal) =>
        request("chat", {
          url,
          signal,
          credentials: "include",
          responseType: "json",
          retries: 1,
          retryDelayMs: 200,
        }),
      onProgress: (event) => {
        if (event.kind === "page") {
          updateChatStatus(
            container,
            `${t("chatScanningPage")} ${event.pageNumber}... ${t("chatFoundCount")}: ${event.foundCount}`,
          );
          return;
        }

        if (event.kind === "cutoff") {
          updateChatStatus(container, `${t("chatDoneReachedLimit")} ${event.foundCount}.`);
          return;
        }

        updateChatStatus(container, `Done. Found ${event.foundCount} messages.`);
      },
      onMatch: (message) => {
        appendChatResult(container, message, { realmId: STATE?.auth?.realmId || 0 });
      },
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      updateChatStatus(container, t("searchStopped"));
    } else {
      console.error(err);
      updateChatStatus(container, `${t("genericError")}: ${err?.message || err}`);
    }
  } finally {
    isSearching = false;
    searchController = null;
    setChatSearchState(container, false);
  }
}

function stopSearch() {
  if (searchController) {
    searchController.abort();
  }
}
