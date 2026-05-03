// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("content_registry", () => {
  it("keeps one merged chat section", async () => {
    const { _testUtils } = await import("../src/content_registry.js");
    const sectionIds = _testUtils.SIDEBAR_SECTIONS.map((section) => section.id);

    expect(sectionIds).toContain("chat-section");
    expect(sectionIds).not.toContain("chat-alerts-section");
  });
});
