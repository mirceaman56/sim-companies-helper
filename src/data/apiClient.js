const inflightByKey = new Map();
const rateLimitByDomain = new Map();

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
      rateLimitByDomain.set(domain, Date.now() + rateLimitCooldownMs);
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
