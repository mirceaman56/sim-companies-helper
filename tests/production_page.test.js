// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractProductionBuildingLevel,
  findFirstProductionRow,
  findProductionRowFromTarget,
  getProductionDataWrapper,
  getProductionQuality,
  readProductionRow,
} from "../src/page/production_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "production", name), "utf8");
}

describe("production_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the first setup production row from the document", () => {
    document.body.innerHTML = loadFixture("setup-row.html");

    const row = findFirstProductionRow(document);

    expect(row).not.toBeNull();
    expect(row.dataset.testid).toBe("setup-row");
  });

  it("finds the active production row from a nested target", () => {
    document.body.innerHTML = loadFixture("active-row.html");
    const target = document.querySelector(".production-data div:last-child");

    const row = findProductionRowFromTarget(target);

    expect(row).not.toBeNull();
    expect(row.dataset.testid).toBe("active-row");
  });

  it("reads setup production rows into a stable structured shape", () => {
    document.body.innerHTML = loadFixture("setup-row.html");
    const row = document.querySelector('[data-testid="setup-row"]');

    const productionRow = readProductionRow(row);

    expect(productionRow).toMatchObject({
      productId: 7,
      productName: "Iron",
      quantity: 25,
      unitCost: 12.5,
      laborCost: 4.5,
      isActive: false,
    });
    expect(productionRow.quantityInput?.value).toBe("25");
  });

  it("reads active production rows into a stable structured shape", () => {
    document.body.innerHTML = loadFixture("active-row.html");
    const row = document.querySelector('[data-testid="active-row"]');

    const productionRow = readProductionRow(row);

    expect(productionRow).toMatchObject({
      productId: 9,
      productName: "Steel",
      quantity: 1200,
      unitCost: 7.5,
      laborCost: 0,
      isActive: true,
    });
    expect(getProductionDataWrapper(productionRow.infoColumnEl)).not.toBeNull();
  });

  it("reads the quality level from the star icons next to the product image", () => {
    document.body.innerHTML = loadFixture("quality-row.html");
    const row = document.querySelector('[data-testid="quality-row"]');

    expect(getProductionQuality(row)).toBe(4);
    expect(readProductionRow(row)).toMatchObject({
      productId: 44,
      productName: "Bread Q4",
      quality: 4,
    });
  });

  it("falls back to the Q marker in the info column when no stars are rendered", () => {
    document.body.innerHTML = loadFixture("active-row.html");
    const row = document.querySelector('[data-testid="active-row"]');

    expect(getProductionQuality(row)).toBe(1);
  });

  it("reports quality 0 when the row has no quality markers", () => {
    document.body.innerHTML = loadFixture("setup-row.html");
    const row = document.querySelector('[data-testid="setup-row"]');

    expect(getProductionQuality(row)).toBe(0);
    expect(readProductionRow(row).quality).toBe(0);
  });

  it("reads per-product quality across a real factory page", () => {
    document.body.innerHTML = loadFixture("factory-page.html");

    const byProduct = {};
    for (const link of document.querySelectorAll('a[href*="/encyclopedia/"][href*="/resource/"]')) {
      const productionRow = readProductionRow(findProductionRowFromTarget(link));
      byProduct[productionRow.productName] = productionRow.quality;
    }

    expect(byProduct).toEqual({
      "Silicon Q4": 4,
      "Chemicals Q4": 4,
      Aluminium: 0,
      "Steel Q2": 2,
      "Xmas crackers": 0,
    });
  });

  it("does not sum quality stars from other products when the row lookup widens", () => {
    document.body.innerHTML = loadFixture("factory-page.html");

    // The active order block has no encyclopedia link, so the row walk resolves
    // to the whole production container. Quality must still come from the
    // active product's own column, not every star on the page.
    const activeTitle = [...document.querySelectorAll("h3")].find((h) => h.textContent === "Chemicals Q4");
    const row = findProductionRowFromTarget(activeTitle);

    expect(getProductionQuality(row)).toBe(4);
  });

  it("reads quality from the real page export", () => {
    document.documentElement.innerHTML = loadFixture("real-page.html");

    const row = findFirstProductionRow(document);

    expect(readProductionRow(row).quality).toBe(2);
  });

  it("extracts a building level while ignoring top navigation matches", () => {
    document.body.innerHTML = loadFixture("level-page.html");
    const original = Element.prototype.getBoundingClientRect;

    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        top: Number(this.dataset.top || 0),
        width: Number(this.dataset.width || 120),
        height: Number(this.dataset.height || 40),
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      };
    };

    try {
      expect(extractProductionBuildingLevel(document)).toBe(10);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("waits for labor cost to appear after a row mutation", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = loadFixture("setup-row.html");
    const row = document.querySelector('[data-testid="setup-row"]');
    const spans = row.querySelectorAll("span");
    spans[1].textContent = "";

    const waitPromise = import("../src/page/production_page.js").then(({ waitForProductionLaborCost }) =>
      waitForProductionLaborCost(row, 1000),
    );

    setTimeout(() => {
      spans[1].textContent = "$8.25";
    }, 50);

    vi.advanceTimersByTime(60);
    await expect(waitPromise).resolves.toBe(8.25);
    vi.useRealTimers();
  });

  it("parses first production row from real page export with wages fallback", () => {
    document.documentElement.innerHTML = loadFixture("real-page.html");

    const row = findFirstProductionRow(document);
    const productionRow = readProductionRow(row);

    expect(row).not.toBeNull();
    expect(productionRow).toMatchObject({
      productId: 44,
      productName: "Sand Q2",
      laborCost: 4210,
      isActive: false,
    });
  });
});
