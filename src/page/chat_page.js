import { findAncestorWithin, observeMutations } from "./page_utils.js";

const CHAT_CONTAINER_SELECTORS = [
  '[data-role="chat-room"]',
  '[data-testid="chat-room"]',
  ".chat-room",
  ".chat-container",
  ".chat-content",
];

const CHAT_MESSAGE_ROW_SELECTORS = [
  '[data-role="chat-message"]',
  '[data-testid="chat-message"]',
  ".chat-message",
  ".chat-room-message",
];

const CHAT_COMPANY_SELECTORS = [
  '[data-role="chat-company"]',
  '[data-testid="chat-company"]',
  ".chat-message__company",
  'a[href*="/company/"]',
];

const CHAT_BODY_SELECTORS = ['[data-role="chat-body"]', '[data-testid="chat-body"]', ".chat-message__body"];

const CHAT_TIME_SELECTORS = [
  "time[datetime]",
  '[data-role="chat-time"][datetime]',
  '[data-testid="chat-time"][datetime]',
  "time",
  '[data-role="chat-time"]',
  ".chat-message__time",
];

function isElement(value) {
  return value instanceof Element;
}

function joinSelectors(selectors) {
  return selectors.join(", ");
}

function queryFirst(root, selectors) {
  if (!root?.querySelector) return null;
  return root.querySelector(joinSelectors(selectors));
}

export function findChatContainer(root = document) {
  return queryFirst(root, CHAT_CONTAINER_SELECTORS);
}

export function detectChatPage(root = document) {
  return Boolean(findChatContainer(root) && findFirstChatMessageRow(root));
}

export function findChatMessageRowFromTarget(target, { maxDepth = 25 } = {}) {
  if (!isElement(target)) return null;

  const boundary = target.ownerDocument?.body || document.body;
  return findAncestorWithin(target, (el) => el.matches(joinSelectors(CHAT_MESSAGE_ROW_SELECTORS)), {
    maxDepth,
    boundary,
  });
}

export function findFirstChatMessageRow(root = document) {
  const container = findChatContainer(root) || root;
  return queryFirst(container, CHAT_MESSAGE_ROW_SELECTORS);
}

export function findChatMessageRows(root = document) {
  const container = findChatContainer(root) || root;
  return [...(container?.querySelectorAll?.(joinSelectors(CHAT_MESSAGE_ROW_SELECTORS)) || [])];
}

export function readChatMessageRow(row) {
  if (!isElement(row)) return null;

  const companyEl = queryFirst(row, CHAT_COMPANY_SELECTORS);
  const bodyEl = queryFirst(row, CHAT_BODY_SELECTORS);
  const timeEl = queryFirst(row, CHAT_TIME_SELECTORS);

  const rawId = row.getAttribute("data-message-id") || row.getAttribute("data-id") || row.id || "";
  const idMatch = String(rawId).match(/(\d+)/);

  return {
    rowEl: row,
    id: idMatch ? Number(idMatch[1]) : null,
    companyName: companyEl?.textContent?.trim() || "",
    companyHref: companyEl?.getAttribute?.("href") || null,
    datetime:
      timeEl?.getAttribute?.("datetime") ||
      timeEl?.getAttribute?.("data-datetime") ||
      timeEl?.textContent?.trim() ||
      null,
    body: bodyEl?.textContent?.trim() || "",
  };
}

export function observeChatPage(root = document, onChange) {
  const target = findChatContainer(root) || root?.body || root;
  return observeMutations(target, onChange);
}

export const _testUtils = {
  CHAT_CONTAINER_SELECTORS,
  CHAT_MESSAGE_ROW_SELECTORS,
  CHAT_COMPANY_SELECTORS,
  CHAT_BODY_SELECTORS,
  CHAT_TIME_SELECTORS,
};
