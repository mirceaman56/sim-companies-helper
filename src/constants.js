// constants.js
// Centralized timing and limit constants

// Market API
export const MARKET_CACHE_TTL_MS = 60_000; // 1 minute
export const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Market alerts
export const ALERT_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const ALERT_TIMER_REFRESH_MS = 10_000; // 10 seconds
export const ALERT_MAX_COUNT = 2;
export const TOAST_DISMISS_MS = 15_000; // 15 seconds

// Cashflow
export const CASHFLOW_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Chat filter
export const CHAT_SEARCH_TARGET_COUNT = 500;
export const CHAT_SEARCH_CUTOFF_HOURS = 8;
