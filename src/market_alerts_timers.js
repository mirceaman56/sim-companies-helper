// market_alerts_timers.js
// Timer orchestration for market alerts.

/**
 * @param {{
 *  checkIntervalMs: number,
 *  refreshIntervalMs: number,
 *  setIntervalFn?: typeof setInterval,
 *  clearIntervalFn?: typeof clearInterval,
 *  setTimeoutFn?: typeof setTimeout,
 * }} input
 */
export function createAlertTimers(input) {
  const {
    checkIntervalMs,
    refreshIntervalMs,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
  } = input;

  let renderRefreshIntervalId = null;

  /**
   * @param {{intervalId:number|null}} alert
   * @param {() => void} onCheck
   * @returns {boolean} true when timer started
   */
  function startAlertInterval(alert, onCheck) {
    if (!alert || alert.intervalId) return false;

    onCheck();
    alert.intervalId = setIntervalFn(onCheck, checkIntervalMs);
    return true;
  }

  /**
   * @param {{intervalId:number|null}} alert
   */
  function stopAlertInterval(alert) {
    if (!alert?.intervalId) return;
    clearIntervalFn(alert.intervalId);
    alert.intervalId = null;
  }

  /**
   * @param {() => void} onRefresh
   */
  function startRenderRefresh(onRefresh) {
    stopRenderRefresh();
    renderRefreshIntervalId = setIntervalFn(onRefresh, refreshIntervalMs);
  }

  function stopRenderRefresh() {
    if (renderRefreshIntervalId) {
      clearIntervalFn(renderRefreshIntervalId);
      renderRefreshIntervalId = null;
    }
  }

  /**
   * Stagger callback execution across alert list.
   * @param {object[]} items
   * @param {(item: object) => void} callback
   * @param {number} [stepMs]
   */
  function stagger(items, callback, stepMs = 1500) {
    let delay = 0;
    for (const item of items) {
      setTimeoutFn(() => callback(item), delay);
      delay += stepMs;
    }
  }

  return {
    startAlertInterval,
    stopAlertInterval,
    startRenderRefresh,
    stopRenderRefresh,
    stagger,
  };
}
