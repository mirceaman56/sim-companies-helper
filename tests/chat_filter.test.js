import { describe, expect, it, vi } from "vitest";

import {
  CHAT_API_BASE_URL,
  buildChatPageUrl,
  buildChatSearchFilters,
  collectChatSearchPage,
  messageMatchesChatFilters,
  searchChatMessages,
} from "../src/chat_filter.js";

describe("chat_filter logic", () => {
  it("builds page URLs for the chat API", () => {
    expect(buildChatPageUrl()).toBe(CHAT_API_BASE_URL);
    expect(buildChatPageUrl(123)).toBe(`${CHAT_API_BASE_URL}from-id/123/`);
  });

  it("matches message type, product, and quality independently of DOM", () => {
    const filters = buildChatSearchFilters({
      filterType: "buy",
      productId: 7,
      selectedQualities: ["Q1", "Q2"],
    });

    expect(
      messageMatchesChatFilters({ body: "Buying now :re-7: Q2 fast" }, filters),
    ).toBe(true);
    expect(messageMatchesChatFilters({ body: "Selling :re-7: Q2" }, filters)).toBe(false);
    expect(messageMatchesChatFilters({ body: "Buying :re-8: Q2" }, filters)).toBe(false);
    expect(messageMatchesChatFilters({ body: "Buying :re-7: Q5" }, filters)).toBe(false);
  });

  it("stops page collection when history cutoff is reached", () => {
    const now = Date.parse("2026-04-12T12:00:00Z");
    const filters = buildChatSearchFilters({ filterType: "buy", productId: 7, selectedQualities: ["Q1"] });

    const page = collectChatSearchPage(
      [
        {
          id: 501,
          datetime: new Date(now - 60_000).toISOString(),
          body: "Buying :re-7: Q1",
        },
        {
          id: 498,
          datetime: new Date(now - 9 * 60 * 60 * 1000).toISOString(),
          body: "Buying :re-7: Q1",
        },
      ],
      {
        filters,
        cutoffTime: now - 8 * 60 * 60 * 1000,
        remainingCount: 10,
      },
    );

    expect(page.matches).toHaveLength(1);
    expect(page.smallestId).toBe(501);
    expect(page.reachedCutoff).toBe(true);
  });

  it("paginates chat API results and reports matches", async () => {
    const now = Date.parse("2026-04-12T12:00:00Z");
    const filters = buildChatSearchFilters({ filterType: "buy", productId: 7, selectedQualities: [] });
    const requestMessages = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 500,
          datetime: new Date(now - 60_000).toISOString(),
          body: "Buying :re-7: Q1",
          sender: { company: "Acme" },
        },
        {
          id: 480,
          datetime: new Date(now - 120_000).toISOString(),
          body: "Selling :re-7:",
          sender: { company: "Beta" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 470,
          datetime: new Date(now - 180_000).toISOString(),
          body: "Buy :re-7: now",
          sender: { company: "Gamma" },
        },
      ]);

    const matches = [];
    const progress = [];

    const result = await searchChatMessages({
      requestMessages,
      filters,
      targetCount: 2,
      cutoffHours: 8,
      delayMs: 0,
      waitFn: async () => {},
      now: () => now,
      onMatch: (message) => matches.push(message),
      onProgress: (event) => progress.push(event),
    });

    expect(requestMessages.mock.calls.map(([url]) => url)).toEqual([
      CHAT_API_BASE_URL,
      `${CHAT_API_BASE_URL}from-id/480/`,
    ]);
    expect(matches).toHaveLength(2);
    expect(progress).toEqual([
      { kind: "page", pageNumber: 1, foundCount: 0 },
      { kind: "page", pageNumber: 2, foundCount: 1 },
      { kind: "done", foundCount: 2 },
    ]);
    expect(result).toEqual({
      foundCount: 2,
      pagesFetched: 2,
      reachedCutoff: false,
      aborted: false,
    });
  });
});