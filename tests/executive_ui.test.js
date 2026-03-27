import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("string-similarity-js", () => ({
  stringSimilarity: vi.fn((a, b) => {
    // Simple mock: return 1.0 if strings match, 0.0 otherwise
    return a.toLowerCase().trim() === b.toLowerCase().trim() ? 1.0 : 0.0;
  }),
}));

vi.mock("../src/resources/hr_blurp.json", () => ({
  default: [
    {
      id: 1,
      en: { originalFeedback: "English feedback text about combs" },
      tr: { originalFeedback: "Türkçe geri bildirim metni taraklar hakkında" },
      skills: { mgmt: 0.43, acct: 0.57, comm: 0.43, tech: 0.64, avgSkill: 0.52 },
    },
    {
      id: 2,
      en: { originalFeedback: "English feedback about coffee and sugar" },
      skills: { mgmt: 0.54, acct: 0.46, comm: 0.54, tech: 0.62, avgSkill: 0.54 },
    },
  ],
}));

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
  getLang: () => "en",
}));

vi.mock("../src/sidebar.js", () => ({
  getSectionContent: () => null,
}));

vi.mock("../src/utils.js", () => ({
  escapeHtml: (s) => s,
}));

vi.mock("../src/translate.js", () => ({
  translateToEnglish: vi.fn(),
}));

// Import after mocks
import { findBestMatchingEntry } from "../src/executive_ui.js";

describe("findBestMatchingEntry", () => {
  it("matches English feedback against en entries", () => {
    const result = findBestMatchingEntry("English feedback text about combs");
    expect(result).not.toBeNull();
    expect(result.id).toBe(1);
  });

  it("matches Turkish feedback against tr entries when langCode is tr", () => {
    const result = findBestMatchingEntry(
      "Türkçe geri bildirim metni taraklar hakkında",
      "tr",
    );
    expect(result).not.toBeNull();
    expect(result.id).toBe(1);
  });

  it("falls back to English when langCode entries not found", () => {
    const result = findBestMatchingEntry("English feedback about coffee and sugar", "de");
    expect(result).not.toBeNull();
    expect(result.id).toBe(2);
  });

  it("returns null when no match found", () => {
    const result = findBestMatchingEntry("completely unrelated text");
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    const result = findBestMatchingEntry("");
    expect(result).toBeNull();
  });
});
