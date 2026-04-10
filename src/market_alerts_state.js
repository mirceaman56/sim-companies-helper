// market_alerts_state.js
// State transitions and normalization for market alerts.

/**
 * @typedef {object} MarketAlert
 * @property {number} id
 * @property {number} productId
 * @property {string} productName
 * @property {number|"all"} quality
 * @property {number} targetPrice
 * @property {boolean} active
 * @property {number|null} intervalId
 * @property {number|null} lastPrice
 * @property {number|null} lastCheck
 * @property {boolean} triggered
 */

/**
 * Build a new alert object.
 * @param {{id:number, productId:number, productName:string, quality:number|"all", targetPrice:number}} input
 * @returns {MarketAlert}
 */
export function createAlert(input) {
  return {
    id: input.id,
    productId: input.productId,
    productName: input.productName,
    quality: input.quality,
    targetPrice: input.targetPrice,
    active: false,
    intervalId: null,
    lastPrice: null,
    lastCheck: null,
    triggered: false,
  };
}

/**
 * @param {number} targetPrice
 * @returns {boolean}
 */
export function isValidTargetPrice(targetPrice) {
  return Number.isFinite(targetPrice) && targetPrice > 0;
}

/**
 * @param {MarketAlert[]} alerts
 * @param {number} maxCount
 * @returns {boolean}
 */
export function canAddAlert(alerts, maxCount) {
  return alerts.length < maxCount;
}

/**
 * @param {MarketAlert[]} alerts
 * @param {MarketAlert} alert
 * @returns {MarketAlert[]}
 */
export function appendAlert(alerts, alert) {
  return [...alerts, alert];
}

/**
 * @param {MarketAlert[]} alerts
 * @param {number} alertId
 * @returns {MarketAlert|null}
 */
export function findAlertById(alerts, alertId) {
  return alerts.find((a) => a.id === alertId) || null;
}

/**
 * @param {MarketAlert} alert
 * @returns {boolean} true when state changed
 */
export function startAlertState(alert) {
  if (!alert || alert.active) return false;
  alert.active = true;
  alert.triggered = false;
  return true;
}

/**
 * @param {MarketAlert} alert
 * @returns {boolean} true when state changed
 */
export function stopAlertState(alert) {
  if (!alert || !alert.active) return false;
  alert.active = false;
  return true;
}

/**
 * @param {MarketAlert} alert
 */
export function resetAlertState(alert) {
  if (!alert) return;
  alert.triggered = false;
  alert.lastPrice = null;
  alert.lastCheck = null;
}

/**
 * @param {MarketAlert[]} alerts
 * @param {number} alertId
 * @returns {MarketAlert[]}
 */
export function removeAlertState(alerts, alertId) {
  return alerts.filter((a) => a.id !== alertId);
}

/**
 * Apply pricing check outcome to alert state.
 * @param {MarketAlert} alert
 * @param {number|null} price
 * @param {number} checkedAt
 * @returns {"triggered"|"cleared"|"unchanged"}
 */
export function applyPriceCheckState(alert, price, checkedAt) {
  alert.lastPrice = price;
  alert.lastCheck = checkedAt;

  if (price !== null && price <= alert.targetPrice && !alert.triggered) {
    alert.triggered = true;
    return "triggered";
  }

  if (price !== null && price > alert.targetPrice && alert.triggered) {
    alert.triggered = false;
    return "cleared";
  }

  return "unchanged";
}

/**
 * @param {MarketAlert[]} alerts
 * @returns {Array<Omit<MarketAlert, "intervalId">>}
 */
export function serializeAlerts(alerts) {
  return alerts.map(({ intervalId: _intervalId, ...rest }) => rest);
}

/**
 * @param {Array<Omit<MarketAlert, "intervalId">>} rawAlerts
 * @returns {MarketAlert[]}
 */
export function hydrateAlerts(rawAlerts) {
  return (rawAlerts || []).map((a) => ({ ...a, intervalId: null }));
}

/**
 * @param {MarketAlert[]} alerts
 * @param {number|null|undefined} providedNextAlertId
 * @returns {number}
 */
export function resolveNextAlertId(alerts, providedNextAlertId) {
  if (
    providedNextAlertId !== null &&
    providedNextAlertId !== undefined &&
    Number.isFinite(Number(providedNextAlertId)) &&
    Number(providedNextAlertId) >= 1
  ) {
    return Number(providedNextAlertId);
  }
  return alerts.length ? Math.max(...alerts.map((a) => a.id)) + 1 : 1;
}
