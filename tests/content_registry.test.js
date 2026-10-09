// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

describe("content_registry", () => {
  it("keeps one merged chat section", async () => {
    const { _testUtils } = await import("../src/content_registry.js");
    const sectionIds = _testUtils.SIDEBAR_SECTIONS.map((section) => section.id);

    expect(sectionIds).toContain("chat-section");
    expect(sectionIds).not.toContain("chat-alerts-section");
  });

  it("gives every feature a unique id and every section a unique id", async () => {
    const { _testUtils } = await import("../src/content_registry.js");
    const ids = _testUtils.FEATURES.map((f) => f.id);
    const sectionIds = _testUtils.SIDEBAR_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
  });

  it("keeps running initializers after one throws", async () => {
    const { bootstrapFeatureRegistry } = await import("../src/content_registry.js");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const later = vi.fn();

    bootstrapFeatureRegistry([
      {
        id: "broken",
        init: () => {
          throw new Error("boom");
        },
      },
      { id: "later", init: later },
    ]);

    expect(later).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('[SimHelper] Feature "broken" init failed:', expect.any(Error));
    error.mockRestore();
  });
});
