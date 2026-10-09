// Recurring work that should not run in background tabs. Every open game tab shares one
// API rate limit, so a hidden tab skips its ticks and catches up once when shown again.

/**
 * @param {{
 *   intervalMs: number,
 *   run: () => unknown,
 *   doc?: Document,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} input
 * @returns {() => void} stop function
 */
export function startVisiblePoller(input) {
  const {
    intervalMs,
    run,
    doc = document,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = input;
  let missedWhileHidden = false;

  const safeRun = () => {
    try {
      const result = run();
      if (result && typeof result.catch === "function") {
        result.catch((error) => console.warn("[SimHelper] Poller run failed:", error));
      }
    } catch (error) {
      console.warn("[SimHelper] Poller run failed:", error);
    }
  };

  const tick = () => {
    if (doc.hidden) {
      missedWhileHidden = true;
      return;
    }
    safeRun();
  };

  const onVisibilityChange = () => {
    if (doc.hidden || !missedWhileHidden) return;
    missedWhileHidden = false;
    safeRun();
  };

  const intervalId = setIntervalFn(tick, intervalMs);
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearIntervalFn(intervalId);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
