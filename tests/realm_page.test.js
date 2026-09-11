// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { findRealmLogo, readActiveRealmId } from "../src/page/realm_page.js";

function loadFixture(relPath) {
  const html = readFileSync(join(process.cwd(), "tests", "fixtures", relPath), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("realm page adapter", () => {
  it("reads Magnates from the navbar realm logo", () => {
    const doc = loadFixture("realm/magnates-navbar.html");
    expect(findRealmLogo(doc)).not.toBeNull();
    expect(readActiveRealmId(doc)).toBe(0);
  });

  it("reads Entrepreneurs from the logo path even when the alt text is translated", () => {
    const doc = loadFixture("realm/entrepreneurs-navbar-localized.html");
    expect(readActiveRealmId(doc)).toBe(1);
  });

  it("returns null when the page has no realm logo", () => {
    const doc = loadFixture("realm/no-realm-logo.html");
    expect(findRealmLogo(doc)).toBeNull();
    expect(readActiveRealmId(doc)).toBeNull();
  });

  it("reads the realm from full real game pages", () => {
    expect(readActiveRealmId(loadFixture("production/real-page.html"))).toBe(1);
    expect(readActiveRealmId(loadFixture("retail/real-page.html"))).toBe(0);
  });

  it("ignores unknown realm assets", () => {
    const doc = new DOMParser().parseFromString(
      '<img src="/static/images/realms/Unknown_140.png">',
      "text/html",
    );
    expect(readActiveRealmId(doc)).toBeNull();
  });
});
