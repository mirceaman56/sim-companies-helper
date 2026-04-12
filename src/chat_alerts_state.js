// chat_alerts_state.js
// State transitions and normalization for chat alerts.

/**
 * @typedef {object} ChatAlert
 * @property {number} id
 * @property {string[]} keywords
 * @property {string|null} companyFilter
 * @property {boolean} active
 * @property {boolean} triggered
 * @property {number|null} intervalId
 * @property {number|null} lastCheck
 * @property {number|null} lastMatchMessageId
 * @property {string|null} lastMatchAt
 * @property {string|null} lastMatchCompany
 * @property {string|null} lastMatchBody
 */

/**
 * Parse comma-separated keywords from an input string.
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseKeywords(raw) {
  if (typeof raw !== "string") return [];

  const seen = new Set();
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((keyword) => keyword.length > 0)
    .filter((keyword) => {
      const normalized = keyword.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function normalizeCompanyFilter(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {{id:number, keywords:string[], companyFilter?:string|null}} input
 * @returns {ChatAlert}
 */
export function createChatAlert(input) {
  return {
    id: input.id,
    keywords: [...input.keywords],
    companyFilter: normalizeCompanyFilter(input.companyFilter),
    active: false,
    triggered: false,
    intervalId: null,
    lastCheck: null,
    lastMatchMessageId: null,
    lastMatchAt: null,
    lastMatchCompany: null,
    lastMatchBody: null,
  };
}

/**
 * @param {{keywords:string[]}} input
 * @returns {boolean}
 */
export function isValidChatAlertInput(input) {
  return Array.isArray(input?.keywords) && input.keywords.length > 0;
}

/**
 * @param {ChatAlert[]} alerts
 * @param {number} maxCount
 * @returns {boolean}
 */
export function canAddChatAlert(alerts, maxCount) {
  return alerts.length < maxCount;
}

/**
 * @param {ChatAlert[]} alerts
 * @param {ChatAlert} alert
 * @returns {ChatAlert[]}
 */
export function appendChatAlert(alerts, alert) {
  return [...alerts, alert];
}

/**
 * @param {ChatAlert[]} alerts
 * @param {number} alertId
 * @returns {ChatAlert|null}
 */
export function findChatAlertById(alerts, alertId) {
  return alerts.find((alert) => alert.id === alertId) || null;
}

/**
 * @param {ChatAlert} alert
 * @returns {boolean}
 */
export function startChatAlertState(alert) {
  if (!alert || alert.active) return false;
  alert.active = true;
  alert.triggered = false;
  return true;
}

/**
 * @param {ChatAlert} alert
 * @returns {boolean}
 */
export function stopChatAlertState(alert) {
  if (!alert || !alert.active) return false;
  alert.active = false;
  return true;
}

/**
 * @param {ChatAlert} alert
 */
export function resetChatAlertState(alert) {
  if (!alert) return;
  alert.triggered = false;
}

/**
 * @param {ChatAlert[]} alerts
 * @param {number} alertId
 * @returns {ChatAlert[]}
 */
export function removeChatAlertState(alerts, alertId) {
  return alerts.filter((alert) => alert.id !== alertId);
}

/**
 * Apply latest scan result to chat alert state.
 * @param {ChatAlert} alert
 * @param {{id:number|null, datetime:string|null, companyName:string, body:string}|null} match
 * @param {number} checkedAt
 * @returns {"triggered"|"cleared"|"unchanged"}
 */
export function applyChatMatchState(alert, match, checkedAt) {
  const previousMatchId = alert.lastMatchMessageId;
  alert.lastCheck = checkedAt;

  if (match) {
    const normalizedMatchId = Number.isFinite(Number(match.id)) ? Number(match.id) : null;

    alert.lastMatchMessageId = normalizedMatchId;
    alert.lastMatchAt = typeof match.datetime === "string" ? match.datetime : null;
    alert.lastMatchCompany = String(match.companyName || "").trim() || null;
    alert.lastMatchBody = String(match.body || "").trim() || null;

    if (normalizedMatchId !== null && normalizedMatchId !== previousMatchId) {
      alert.triggered = true;
      return "triggered";
    }

    return "unchanged";
  }

  if (alert.triggered) {
    alert.triggered = false;
    return "cleared";
  }

  return "unchanged";
}

/**
 * @param {ChatAlert[]} alerts
 * @returns {Array<Omit<ChatAlert, "intervalId">>}
 */
export function serializeChatAlerts(alerts) {
  return alerts.map(({ intervalId: _intervalId, ...rest }) => rest);
}

/**
 * @param {Array<Omit<ChatAlert, "intervalId">>} rawAlerts
 * @returns {ChatAlert[]}
 */
export function hydrateChatAlerts(rawAlerts) {
  return (rawAlerts || []).map((alert) => ({
    ...alert,
    keywords: Array.isArray(alert.keywords) ? alert.keywords : [],
    companyFilter: normalizeCompanyFilter(alert.companyFilter),
    intervalId: null,
  }));
}

/**
 * @param {ChatAlert[]} alerts
 * @param {number|null|undefined} providedNextId
 * @returns {number}
 */
export function resolveNextChatAlertId(alerts, providedNextId) {
  if (
    providedNextId !== null &&
    providedNextId !== undefined &&
    Number.isFinite(Number(providedNextId)) &&
    Number(providedNextId) >= 1
  ) {
    return Number(providedNextId);
  }

  return alerts.length > 0 ? Math.max(...alerts.map((alert) => alert.id)) + 1 : 1;
}
