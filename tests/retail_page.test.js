// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  detectRetailPage,
  findFirstRetailRow,
  findRetailRowFromTarget,
  isRetailSellInput,
  readRetailRow,
} from "../src/page/retail_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "retail", name), "utf8");
}

describe("retail_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detects the retail page from the first sell row", () => {
    document.body.innerHTML = loadFixture("modern-row.html");
    expect(detectRetailPage(document)).toBe(true);
  });

  it("returns false when no retail sell row exists", () => {
    document.body.innerHTML = `<div><h1>No retail controls</h1></div>`;
    expect(detectRetailPage(document)).toBe(false);
  });

  it("finds the first retail row from the document", () => {
    document.body.innerHTML = loadFixture("modern-row.html");

    const row = findFirstRetailRow(document);

    expect(row).not.toBeNull();
    expect(row.dataset.testid).toBe("modern-row");
  });

  it("finds the modern retail row from a nested input target", () => {
    document.body.innerHTML = loadFixture("modern-row.html");
    const input = document.querySelector('input[name="price"]');

    const row = findRetailRowFromTarget(input);

    expect(row).not.toBeNull();
    expect(row.dataset.testid).toBe("modern-row");
  });

  it("falls back to the legacy retail row wrapper", () => {
    document.body.innerHTML = loadFixture("legacy-row.html");
    const input = document.querySelector('input[name="quantity"]');

    const row = findRetailRowFromTarget(input);

    expect(row).not.toBeNull();
    expect(row.dataset.testid).toBe("legacy-row");
  });

  it("reads the retail row into a stable selection shape", () => {
    document.body.innerHTML = loadFixture("modern-row.html");
    const row = document.querySelector('[data-testid="modern-row"]');

    const retailRow = readRetailRow(row);

    expect(retailRow).toMatchObject({
      productId: 42,
      productName: "Apples",
    });
    expect(retailRow.priceInput?.value).toBe("10.00");
    expect(retailRow.quantityInput?.value).toBe("100");
    expect(retailRow.infoColumnEl?.querySelector("h3")?.textContent).toBe("Apples");
  });

  it("identifies retail sell inputs without depending on the rest of the row", () => {
    document.body.innerHTML = loadFixture("modern-row.html");
    const input = document.querySelector('input[name="quantity"]');

    expect(isRetailSellInput(input)).toBe(true);
    expect(isRetailSellInput(document.querySelector("h3"))).toBe(false);
  });

  it("parses the first real retail page row from DOM export", () => {
    document.documentElement.innerHTML = loadFixture("real-page.html");

    const row = findFirstRetailRow(document);
    const retailRow = readRetailRow(row);

    expect(detectRetailPage(document)).toBe(true);
    expect(row).not.toBeNull();
    expect(retailRow).toMatchObject({
      productId: 3,
      productName: "Apples",
    });
    expect(retailRow?.priceInput).toBeTruthy();
    expect(retailRow?.quantityInput).toBeTruthy();
  });
});
