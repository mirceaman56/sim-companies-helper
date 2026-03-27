import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const LINGVA_PRIMARY = "lingva.ml";
const LINGVA_FALLBACK = "lingva.thedaviddelta.com";

import { translateToEnglish } from "../src/translate.js";

describe("translateToEnglish", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for English language code", async () => {
    const result = await translateToEnglish("some text", "en");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("translates text via primary Lingva instance", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated text" }),
    });

    const result = await translateToEnglish("deutscher text", "de");
    expect(result).toBe("translated text");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain(LINGVA_PRIMARY);
    expect(fetch.mock.calls[0][0]).toContain("/de/en/");
  });

  it("falls back to secondary instance on primary failure", async () => {
    fetch.mockRejectedValueOnce(new Error("network error"));
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated text" }),
    });

    const result = await translateToEnglish("deutscher text", "de");
    expect(result).toBe("translated text");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain(LINGVA_FALLBACK);
  });

  it("falls back on non-OK HTTP status from primary", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated text" }),
    });

    const result = await translateToEnglish("deutscher text", "de");
    expect(result).toBe("translated text");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns null when both instances fail", async () => {
    fetch.mockRejectedValueOnce(new Error("network error"));
    fetch.mockRejectedValueOnce(new Error("network error"));

    const result = await translateToEnglish("deutscher text", "de");
    expect(result).toBeNull();
  });

  it("maps zh_cn to zh for Lingva API", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated" }),
    });

    await translateToEnglish("中文文本", "zh_cn");
    expect(fetch.mock.calls[0][0]).toContain("/zh/en/");
  });

  it("maps zh_tw to zh for Lingva API", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated" }),
    });

    await translateToEnglish("中文文本", "zh_tw");
    expect(fetch.mock.calls[0][0]).toContain("/zh/en/");
  });

  it("encodes text in URL", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ translation: "translated" }),
    });

    await translateToEnglish("text with spaces & symbols", "de");
    expect(fetch.mock.calls[0][0]).toContain(encodeURIComponent("text with spaces & symbols"));
  });
});
