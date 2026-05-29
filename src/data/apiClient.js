const inflightByKey = new Map();
const rateLimitByDomain = new Map();
const rateLimitHitCount = new Map();

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
 * @property {number[]} [retryStatuses=[408,425,429,500,502,503,504]] HTTP statuses that are eligible for retry.
 * @property {number} [rateLimitCooldownMs=0] Cooldown window to apply to the domain after a `429` response.
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

export function getRateLimitStatus(domain = "default") {
  const d = normalizeDomain(domain);
  const blockedUntil = Number(rateLimitByDomain.get(d) || 0);
  const remainingMs = Math.max(0, blockedUntil - Date.now());
  return {
    blocked: remainingMs > 0,
    remainingMs,
    blockedUntil,
  };
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
    retryStatuses = [408, 425, 429, 500, 502, 503, 504],
    rateLimitCooldownMs = 0,
    timeoutMs = 0,
  } = spec;

  const rate = getRateLimitStatus(domain);
  if (rate.blocked) {
    throw makeError(`RATE_LIMIT_COOLDOWN:${Math.ceil(rate.remainingMs / 1000)}`, {
      code: "RATE_LIMIT_COOLDOWN",
      domain,
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

    if (res.status === 429 && rateLimitCooldownMs > 0) {
      const hits = (rateLimitHitCount.get(domain) || 0) + 1;
      rateLimitHitCount.set(domain, hits);
      const cooldown = hits <= 1 ? rateLimitCooldownMs / 2 : rateLimitCooldownMs;
      rateLimitByDomain.set(domain, Date.now() + cooldown);
    }

    if (!res.ok) {
      const canRetry = attempt < retries && retryStatuses.includes(res.status);
      if (canRetry) {
        if (retryDelayMs > 0) await wait(retryDelayMs);
        return doRequest(domain, spec, attempt + 1);
      }

      throw makeError(`HTTP ${res.status}`, {
        code: "HTTP_ERROR",
        domain,
        status: res.status,
      });
    }

    rateLimitHitCount.delete(domain);
    return parseResponse(res, responseType);
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    const canRetry = !isAbort && attempt < retries;
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
};
