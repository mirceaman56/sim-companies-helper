// @vitest-environment jsdom
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function listPageAdapterFiles() {
  const dir = join(process.cwd(), "src", "page");
  return readdirSync(dir)
    .filter((name) => name.endsWith("_page.js"))
    .sort();
}

describe("page adapter contract coverage", () => {
  it("ensures every *_page adapter has a contract test suite and fixture directory", () => {
    const adapters = listPageAdapterFiles();
    expect(adapters.length).toBeGreaterThan(0);

    for (const adapterFile of adapters) {
      const feature = adapterFile.replace("_page.js", "");
      const testFile = join(process.cwd(), "tests", adapterFile.replace(".js", ".test.js"));
      const fixtureDir = join(process.cwd(), "tests", "fixtures", feature);

      expect(existsSync(testFile), `${adapterFile} is missing ${feature}_page.test.js`).toBe(true);
      expect(existsSync(fixtureDir), `${adapterFile} is missing fixtures directory`).toBe(true);

      const htmlFixtures = readdirSync(fixtureDir).filter((name) => name.endsWith(".html"));
      expect(
        htmlFixtures.length,
        `${adapterFile} should have at least two fixture HTML files (primary + fallback shape)`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
