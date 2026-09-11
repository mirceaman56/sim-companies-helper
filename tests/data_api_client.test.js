import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  request,
  getRateLimitStatus,
  onRateLimitChange,
  applyExternalRateLimit,
  resolveRateLimitGroup,
  SIMCOMPANIES_RATE_LIMIT_GROUP,
  _testUtils,
} from "../src/data/apiClient.js";

const sc = (path) => `https://www.simcompanies.com${path}`;

function mockResponse(status, { body = [], headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  _testUtils.reset();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  _testUtils.reset();
});

describe("resolveRateLimitGroup", () => {
  it("puts every simcompanies.com endpoint in one shared group", () => {
    expect(resolveRateLimitGroup(sc("/api/v3/market/0/13/"), "market")).toBe(SIMCOMPANIES_RATE_LIMIT_GROUP);
    expect(resolveRateLimitGroup(sc("/api/v2/companies/me/cashflow/recent/"), "cashflow")).toBe(
      SIMCOMPANIES_RATE_LIMIT_GROUP,
    );
  });

  it("keeps other hosts under their own logical domain", () => {
    expect(resolveRateLimitGroup("https://api.github.com/repos/a/b/releases", "github-releases")).toBe(
      "github-releases",
    );
  });
});

describe("rate limiting", () => {
  it("does not retry a 429 and blocks every other game endpoint", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse(429));

    await expect(
      request("inventory", { url: sc("/api/v3/resources/1/"), retries: 1, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 429, rateLimited: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await expect(request("market", { url: sc("/api/v3/market/0/13/") })).rejects.toMatchObject({
      code: "RATE_LIMIT_COOLDOWN",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const status = getRateLimitStatus();
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe("429");
  });

  it("uses half the cooldown on the first hit and the full cooldown on the next", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const spec = { url: sc("/api/v3/market/0/13/"), rateLimitCooldownMs: 60_000 };

    global.fetch.mockResolvedValueOnce(mockResponse(429));
    await expect(request("market", spec)).rejects.toMatchObject({ status: 429 });
    expect(getRateLimitStatus().remainingMs).toBe(30_000);

    now.mockReturnValue(1_030_001);
    expect(getRateLimitStatus().blocked).toBe(false);

    global.fetch.mockResolvedValueOnce(mockResponse(429));
    await expect(request("market", spec)).rejects.toMatchObject({ status: 429 });
    expect(getRateLimitStatus().remainingMs).toBe(60_000);
  });

  it("does not let another host's 429 block the game API", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse(429));

    await expect(
      request("github-releases", { url: "https://api.github.com/repos/a/b/releases" }),
    ).rejects.toMatchObject({ status: 429 });

    expect(getRateLimitStatus("github-releases").blocked).toBe(true);
    expect(getRateLimitStatus().blocked).toBe(false);
  });

  it("treats a Cloudflare challenge as a rate limit", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse(403, { headers: { "cf-mitigated": "challenge" } }));

    await expect(
      request("market", { url: sc("/api/v3/market/0/13/"), retries: 1, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 403, rateLimited: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getRateLimitStatus()).toMatchObject({ blocked: true, reason: "challenge" });
  });
});

describe("retries", () => {
  it("still retries retryable server errors", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse(503)).mockResolvedValueOnce(mockResponse(200, { body: [1] }));

    await expect(
      request("market", { url: sc("/api/v3/market/0/13/"), retries: 1, retryDelayMs: 0 }),
    ).resolves.toEqual([1]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    global.fetch.mockResolvedValue(mockResponse(404));

    await expect(
      request("market", { url: sc("/api/v3/market/0/13/"), retries: 1, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 404 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("still retries network failures", async () => {
    global.fetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(mockResponse(200, { body: { ok: true } }));

    await expect(
      request("auth", { url: sc("/api/v3/companies/auth-data/"), retries: 1, retryDelayMs: 0 }),
    ).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("rate-limit listeners", () => {
  it("reports local hits and windows applied from elsewhere", async () => {
    const events = [];
    onRateLimitChange((event) => events.push(event));

    global.fetch.mockResolvedValueOnce(mockResponse(429));
    await expect(request("market", { url: sc("/api/v3/market/0/13/") })).rejects.toBeTruthy();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ group: SIMCOMPANIES_RATE_LIMIT_GROUP, source: "local" });

    const later = getRateLimitStatus().blockedUntil + 60_000;
    expect(applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: later, reason: "429" })).toBe(
      true,
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ source: "external" });
    expect(getRateLimitStatus().blockedUntil).toBe(later);
  });

  it("ignores external windows that are older or already expired", () => {
    const now = Date.now();
    applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: now + 120_000 });

    const listener = vi.fn();
    onRateLimitChange(listener);

    expect(applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: now + 60_000 })).toBe(false);
    expect(applyExternalRateLimit(SIMCOMPANIES_RATE_LIMIT_GROUP, { blockedUntil: now - 1 })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(getRateLimitStatus().blockedUntil).toBe(now + 120_000);
  });
});
