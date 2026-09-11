const inflightByKey = new Map();
const rateLimitByGroup = new Map();
const rateLimitHitCount = new Map();
const rateLimitListeners = new Set();

/**
 * Every simcompanies.com endpoint shares one rate-limit group: the server limits
 * the player's session, not individual endpoints, so a 429 on one call means all
 * other calls to the game are about to fail too.
 */
export const SIMCOMPANIES_RATE_LIMIT_GROUP = "simcompanies";
const SIMCOMPANIES_HOST_SUFFIX = "simcompanies.com";
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * @typedef {Object} ApiRequestSpec
 * @property {string} url Absolute or relative URL to request.
 * @property {string} [method="GET"] HTTP method.
 * @property {HeadersInit} [headers] Request headers.
 * @property {BodyInit|null} [body] Optional request body.
 * @property {RequestCredentials} [credentials="include"] Fetch credentials mode.
 * @property {AbortSignal} [signal] Optional external abort signal.
 * @property {"json"|"text"|"blob"|"arrayBuffer"|"response"} [responseType="json"] Response parsing mode.
 * @property {number} [retries=0] Number of retry attempts after the first request fails.
 * @property {number} [retryDelayMs=0] Delay between retries.
 * @property {number[]} [retryStatuses=[408,425,500,502,503,504]] HTTP statuses that are eligible for retry. `429` is never retried.
 * @property {number} [rateLimitCooldownMs=600000] Cooldown window to apply to the rate-limit group after a `429` or Cloudflare challenge. The first hit uses half of it.
 * @property {number} [timeoutMs=0] Request timeout in milliseconds. `0` disables the timeout.
 * @property {boolean} [coalesce=false] Reuse an in-flight request with the same URL and method.
 * @property {string} [coalesceKey] Override the default coalescing key when several requests share the same logical resource.
 */

/**
 * @typedef {Error & {
 *   code: "RATE_LIMIT_COOLDOWN"|"TIMEOUT"|"ABORTED"|"NETWORK_ERROR"|"HTTP_ERROR",
 *   domain: string,
 *   status: number|null,
 *   remainingMs?: number,
 *   cause?: unknown
 * }} ApiClientError
 */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDomain(domain) {
  return String(domain || "default")
    .trim()
    .toLowerCase();
}

function makeError(message, extra = {}) {
  const err = new Error(message);
  Object.assign(err, extra);
  return err;
}

function buildInflightKey(domain, coalesceKey, url, method) {
  if (coalesceKey) return `${domain}:${coalesceKey}`;
  return `${domain}:${method}:${url}`;
}

/**
 * Map a request to its rate-limit group: all simcompanies.com hosts share one
 * group, anything else is tracked under its own logical domain.
 * @param {string} url
 * @param {string} domain
 * @returns {string}
 */
export function resolveRateLimitGroup(url, domain) {
  // Relative URLs are served by the game itself.
  const match = String(url || "").match(/^[a-z][a-z\d+.-]*:\/\/([^/?#:]+)/i);
  const host = match ? match[1].toLowerCase() : SIMCOMPANIES_HOST_SUFFIX;
  if (host === SIMCOMPANIES_HOST_SUFFIX || host.endsWith(`.${SIMCOMPANIES_HOST_SUFFIX}`)) {
    return SIMCOMPANIES_RATE_LIMIT_GROUP;
  }
  return normalizeDomain(domain);
}

/**
 * @param {string} [group] Rate-limit group, defaults to the shared simcompanies.com group.
 * @param {number} [now]
 * @returns {{ blocked: boolean, remainingMs: number, blockedUntil: number, reason: string|null, hits: number }}
 */
export function getRateLimitStatus(group = SIMCOMPANIES_RATE_LIMIT_GROUP, now = Date.now()) {
  const g = normalizeDomain(group);
  const entry = rateLimitByGroup.get(g);
  const blockedUntil = Number(entry?.blockedUntil || 0);
  const remainingMs = Math.max(0, blockedUntil - now);
  return {
    blocked: remainingMs > 0,
    remainingMs,
    blockedUntil,
    reason: remainingMs > 0 ? entry?.reason || null : null,
    hits: Number(rateLimitHitCount.get(g) || 0),
  };
}

/**
 * Subscribe to rate-limit changes (local hits and changes applied from other tabs).
 * @param {(event: { group: string, source: "local"|"external", status: ReturnType<typeof getRateLimitStatus> }) => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function onRateLimitChange(listener) {
  if (typeof listener !== "function") return () => {};
  rateLimitListeners.add(listener);
  return () => rateLimitListeners.delete(listener);
}

function notifyRateLimitChange(group, source) {
  const event = { group, source, status: getRateLimitStatus(group) };
  for (const listener of rateLimitListeners) {
    try {
      listener(event);
    } catch {
      // A broken listener must not break request handling.
    }
  }
}

function recordRateLimitHit(group, cooldownMs, reason) {
  const hits = (rateLimitHitCount.get(group) || 0) + 1;
  rateLimitHitCount.set(group, hits);
  const cooldown = hits <= 1 ? cooldownMs / 2 : cooldownMs;
  rateLimitByGroup.set(group, { blockedUntil: Date.now() + cooldown, reason });
  notifyRateLimitChange(group, "local");
}

/**
 * Apply a rate-limit window observed elsewhere (another tab, or persisted state
 * from before a reload). Only ever extends the current window.
 * @param {string} group
 * @param {{ blockedUntil: number, reason?: string|null, hits?: number }} entry
 * @returns {boolean} true when the local state changed.
 */
export function applyExternalRateLimit(group, entry) {
  const g = normalizeDomain(group);
  const blockedUntil = Number(entry?.blockedUntil || 0);
  if (!Number.isFinite(blockedUntil) || blockedUntil <= Date.now()) return false;

  const current = Number(rateLimitByGroup.get(g)?.blockedUntil || 0);
  if (blockedUntil <= current) return false;

  rateLimitByGroup.set(g, { blockedUntil, reason: entry?.reason || "429" });
  const hits = Number(entry?.hits || 0);
  if (Number.isFinite(hits) && hits > (rateLimitHitCount.get(g) || 0)) {
    rateLimitHitCount.set(g, hits);
  }
  notifyRateLimitChange(g, "external");
  return true;
}

function isCloudflareChallenge(res) {
  try {
    return String(res?.headers?.get?.("cf-mitigated") || "").toLowerCase() === "challenge";
  } catch {
    return false;
  }
}

async function parseResponse(res, responseType) {
  if (responseType === "response") return res;
  if (responseType === "text") return res.text();
  if (responseType === "blob") return res.blob();
  if (responseType === "arrayBuffer") return res.arrayBuffer();
  return res.json();
}

async function doRequest(domain, spec, attempt = 0) {
  const {
    url,
    method = "GET",
    headers,
    body,
    credentials = "include",
    signal,
    responseType = "json",
    retries = 0,
    retryDelayMs = 0,
    retryStatuses = [408, 425, 500, 502, 503, 504],
    rateLimitCooldownMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS,
    timeoutMs = 0,
  } = spec;

  const group = resolveRateLimitGroup(url, domain);
  const rate = getRateLimitStatus(group);
  if (rate.blocked) {
    throw makeError(`RATE_LIMIT_COOLDOWN:${Math.ceil(rate.remainingMs / 1000)}`, {
      code: "RATE_LIMIT_COOLDOWN",
      domain,
      group,
      remainingMs: rate.remainingMs,
      status: 429,
    });
  }

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(
          () => controller.abort(makeError("Request timeout", { code: "TIMEOUT", domain })),
          timeoutMs,
        )
      : null;

  const mergedSignal = controller ? controller.signal : signal;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      credentials,
      signal: mergedSignal,
    });

    const challenged = isCloudflareChallenge(res);
    const rateLimited = res.status === 429 || challenged;
    if (rateLimited) {
      const cooldownMs = rateLimitCooldownMs > 0 ? rateLimitCooldownMs : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
      recordRateLimitHit(group, cooldownMs, challenged ? "challenge" : "429");
    }

    if (!res.ok || challenged) {
      // Never retry a rate-limit response: the retry would only add to the load
      // that caused it, and the group is already in cooldown.
      const canRetry = !rateLimited && attempt < retries && retryStatuses.includes(res.status);
      if (canRetry) {
        if (retryDelayMs > 0) await wait(retryDelayMs);
        return doRequest(domain, spec, attempt + 1);
      }

      throw makeError(`HTTP ${res.status}`, {
        code: "HTTP_ERROR",
        domain,
        group,
        status: res.status,
        rateLimited,
      });
    }

    rateLimitHitCount.delete(group);
    return parseResponse(res, responseType);
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    // HTTP and cooldown errors were already classified above; only transport
    // failures (network, timeout) are retried here.
    const isClassified = error?.code === "HTTP_ERROR" || error?.code === "RATE_LIMIT_COOLDOWN";
    const canRetry = !isAbort && !isClassified && attempt < retries;
    if (canRetry) {
      if (retryDelayMs > 0) await wait(retryDelayMs);
      return doRequest(domain, spec, attempt + 1);
    }

    if (error instanceof Error && error.code) throw error;

    throw makeError(String(error?.message || error || "Request failed"), {
      code: isAbort ? "ABORTED" : "NETWORK_ERROR",
      domain,
      status: Number(error?.status || 0) || null,
      cause: error,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Execute a fetch request with retry, timeout, cooldown, and optional in-flight request coalescing.
 *
 * The returned value depends on `spec.responseType`:
 * - `json` -> parsed JSON payload
 * - `text` -> string body
 * - `blob` -> `Blob`
 * - `arrayBuffer` -> `ArrayBuffer`
 * - `response` -> raw `Response`
 *
 * Error objects thrown by this function always include a `code` field:
 * - `RATE_LIMIT_COOLDOWN`: the domain is still inside a cooldown window after a previous `429`
 * - `TIMEOUT`: the request exceeded `timeoutMs`
 * - `ABORTED`: the request was aborted by a signal
 * - `NETWORK_ERROR`: fetch failed before an HTTP response was received
 * - `HTTP_ERROR`: the response status was not OK and retries were exhausted
 *
 * @param {string} domain Logical request bucket used for rate-limit tracking and coalescing.
 * @param {ApiRequestSpec} spec Request configuration.
 * @returns {Promise<unknown|Response|string|Blob|ArrayBuffer>} Parsed response payload.
 * @throws {ApiClientError} When cooldown, timeout, network, abort, or HTTP failures occur.
 * @example
 * const payload = await request("github", {
 *   url: "https://api.github.com/repos/owner/repo/releases/latest",
 *   responseType: "json",
 *   timeoutMs: 5000,
 *   retries: 1,
 * });
 */
export async function request(domain, spec) {
  const d = normalizeDomain(domain);
  const inflightKey = buildInflightKey(d, spec?.coalesceKey, spec?.url, spec?.method || "GET");

  if (spec?.coalesce && inflightByKey.has(inflightKey)) {
    return inflightByKey.get(inflightKey);
  }

  const p = doRequest(d, spec || {}).finally(() => {
    inflightByKey.delete(inflightKey);
  });

  if (spec?.coalesce) {
    inflightByKey.set(inflightKey, p);
  }

  return p;
}

export const apiClient = {
  request,
  getRateLimitStatus,
  onRateLimitChange,
  applyExternalRateLimit,
};

export const _testUtils = {
  reset() {
    inflightByKey.clear();
    rateLimitByGroup.clear();
    rateLimitHitCount.clear();
    rateLimitListeners.clear();
  },
  DEFAULT_RATE_LIMIT_COOLDOWN_MS,
};
