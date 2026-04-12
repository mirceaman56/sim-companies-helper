import { CHAT_SEARCH_CUTOFF_HOURS, CHAT_SEARCH_TARGET_COUNT } from "./constants.js";

export const CHAT_API_BASE_URL = "https://www.simcompanies.com/api/v2/chatroom/S/";
const BUY_REGEX = /\b(buy\w*)\b/i;
const SELL_REGEX = /\b(sell\w*)\b/i;
const DEFAULT_MAX_PAGES = 50;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQualities(selectedQualities = []) {
  if (!Array.isArray(selectedQualities)) return [];
  return selectedQualities.filter((value) => typeof value === "string" && value.trim());
}

export function buildChatPageUrl(fromId = null, baseUrl = CHAT_API_BASE_URL) {
  if (fromId === null || fromId === undefined || fromId === "") return baseUrl;
  if (!Number.isFinite(Number(fromId))) return baseUrl;
  return `${baseUrl}from-id/${Number(fromId)}/`;
}

export function buildChatSearchFilters({ filterType = "buy", productId, selectedQualities = [] } = {}) {
  const normalizedQualities = normalizeQualities(selectedQualities);
  const numericProductId = Number(productId);

  return {
    filterType: filterType === "sell" ? "sell" : "buy",
    productId: Number.isFinite(numericProductId) ? numericProductId : null,
    selectedQualities: normalizedQualities,
    typeRegex: filterType === "sell" ? SELL_REGEX : BUY_REGEX,
    productRegex: Number.isFinite(numericProductId) ? new RegExp(`:(re)-${numericProductId}:`, "i") : null,
    qualityRegex:
      normalizedQualities.length > 0 ? new RegExp(`\\b(${normalizedQualities.join("|")})\\b`, "i") : null,
  };
}

export function messageMatchesChatFilters(message, filters) {
  if (!filters?.productRegex || !filters?.typeRegex) return false;

  const body = String(message?.body || "");
  if (!body) return false;

  const matchesType = filters.typeRegex.test(body);
  const matchesProduct = filters.productRegex.test(body);
  const matchesQuality = filters.qualityRegex === null || filters.qualityRegex.test(body);

  return matchesType && matchesProduct && matchesQuality;
}

export function collectChatSearchPage(
  messages,
  { filters, cutoffTime, remainingCount = CHAT_SEARCH_TARGET_COUNT } = {},
) {
  const matches = [];
  let smallestId = null;

  for (const message of Array.isArray(messages) ? messages : []) {
    const messageTime = new Date(message?.datetime || 0).getTime();
    if (Number.isFinite(messageTime) && messageTime < cutoffTime) {
      return { matches, smallestId, reachedCutoff: true };
    }

    if (matches.length < remainingCount && messageMatchesChatFilters(message, filters)) {
      matches.push(message);
    }

    const messageId = Number(message?.id);
    if (Number.isFinite(messageId) && (smallestId === null || messageId < smallestId)) {
      smallestId = messageId;
    }
  }

  return { matches, smallestId, reachedCutoff: false };
}

export async function searchChatMessages({
  requestMessages,
  filters,
  signal,
  onProgress,
  onMatch,
  targetCount = CHAT_SEARCH_TARGET_COUNT,
  cutoffHours = CHAT_SEARCH_CUTOFF_HOURS,
  maxPages = DEFAULT_MAX_PAGES,
  delayMs = 500,
  now = () => Date.now(),
  waitFn = wait,
  baseUrl = CHAT_API_BASE_URL,
} = {}) {
  if (typeof requestMessages !== "function") {
    throw new Error("requestMessages must be a function");
  }

  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const reportMatch = typeof onMatch === "function" ? onMatch : () => {};
  const cutoffTime = now() - cutoffHours * 60 * 60 * 1000;

  let foundCount = 0;
  let pagesFetched = 0;
  let currentUrl = buildChatPageUrl(null, baseUrl);

  while (foundCount < targetCount && pagesFetched < maxPages) {
    if (signal?.aborted) {
      return { foundCount, pagesFetched, reachedCutoff: false, aborted: true };
    }

    const nextPageNumber = pagesFetched + 1;
    progress({ kind: "page", pageNumber: nextPageNumber, foundCount });

    const messages = await requestMessages(currentUrl, signal);
    pagesFetched = nextPageNumber;

    if (!Array.isArray(messages) || messages.length === 0) break;

    const page = collectChatSearchPage(messages, {
      filters,
      cutoffTime,
      remainingCount: targetCount - foundCount,
    });

    for (const match of page.matches) {
      reportMatch(match);
      foundCount += 1;
      if (foundCount >= targetCount) break;
    }

    if (page.reachedCutoff) {
      progress({ kind: "cutoff", foundCount });
      return { foundCount, pagesFetched, reachedCutoff: true, aborted: false };
    }

    if (!Number.isFinite(Number(page.smallestId))) break;

    currentUrl = buildChatPageUrl(page.smallestId, baseUrl);

    if (foundCount < targetCount && pagesFetched < maxPages && delayMs > 0) {
      await waitFn(delayMs);
    }
  }

  progress({ kind: "done", foundCount });
  return { foundCount, pagesFetched, reachedCutoff: false, aborted: false };
}

export const _testUtils = {
  BUY_REGEX,
  SELL_REGEX,
  DEFAULT_MAX_PAGES,
};
