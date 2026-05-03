function normalizeCompanyFilter(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
 * @typedef {object} ChatFilterAlert
 * @property {number} id
 * @property {string} roomDbLetter
 * @property {string} roomName
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

export function createChatFilterAlert(input) {
  return {
    id: Number(input.id),
    roomDbLetter: String(input?.roomDbLetter || "").trim(),
    roomName: String(input?.roomName || "").trim(),
    keywords: Array.isArray(input?.keywords) ? [...input.keywords] : [],
    companyFilter: normalizeCompanyFilter(input?.companyFilter),
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

export function isValidChatFilterAlertInput(input) {
  return Boolean(
    String(input?.roomDbLetter || "").trim() &&
    String(input?.roomName || "").trim() &&
    Array.isArray(input?.keywords) &&
    input.keywords.length > 0,
  );
}

export function canAddChatFilterAlert(alerts, maxCount) {
  return alerts.length < maxCount;
}

export function appendChatFilterAlert(alerts, alert) {
  return [...alerts, alert];
}

export function findChatFilterAlertById(alerts, alertId) {
  return alerts.find((alert) => alert.id === alertId) || null;
}

export function startChatFilterAlertState(alert) {
  if (!alert || alert.active) return false;
  alert.active = true;
  alert.triggered = false;
  return true;
}

export function stopChatFilterAlertState(alert) {
  if (!alert || !alert.active) return false;
  alert.active = false;
  return true;
}

export function resetChatFilterAlertState(alert) {
  if (!alert) return;
  alert.triggered = false;
}

export function removeChatFilterAlertState(alerts, alertId) {
  return alerts.filter((alert) => alert.id !== alertId);
}

export function applyChatFilterMatchState(alert, match, checkedAt) {
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

export function serializeChatFilterAlerts(alerts) {
  return alerts.map(({ intervalId: _intervalId, ...rest }) => rest);
}

export function hydrateChatFilterAlerts(rawAlerts) {
  return (rawAlerts || []).map((alert) => ({
    ...alert,
    roomDbLetter: String(alert?.roomDbLetter || "").trim(),
    roomName: String(alert?.roomName || "").trim(),
    keywords: Array.isArray(alert?.keywords) ? alert.keywords : [],
    companyFilter: normalizeCompanyFilter(alert?.companyFilter),
    intervalId: null,
  }));
}

export function resolveNextChatFilterAlertId(alerts, providedNextId) {
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
