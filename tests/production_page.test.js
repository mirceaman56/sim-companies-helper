// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  extractProductionBuildingLevel,
  findBusyProductionBlock,
  findFirstProductionRow,
  findProductionRowFromTarget,
  getProductionQuality,
  readBusyProductionBlock,
  readProductionRow,
  readProductionStats,
  readSelectedStarQuality,
} from "../src/page/production_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "production", name), "utf8");
}

describe("production_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("running order block", () => {
    it("finds the block and reads it without matching any UI copy", () => {
      document.body.innerHTML = loadFixture("busy-block.html");

      const block = findBusyProductionBlock(document);

      expect(block).not.toBeNull();
      expect(findFirstProductionRow(document)).toBe(block);
      expect(readBusyProductionBlock(block)).toMatchObject({
        productSlug: "minerals",
        productName: "Minerals",
        quantity: 6100,
        quality: 4,
        unitCost: 8.79,
        sourcingValue: 53614,
      });
    });

    it("walks up to the block from a nested target", () => {
      document.body.innerHTML = loadFixture("busy-block.html");
      const target = document.querySelector('td[headers="busy-info-label-3"]');

      expect(findProductionRowFromTarget(target)).toBe(findBusyProductionBlock(document));
    });

    it("reads the block in a non-English locale", () => {
      window.history.replaceState({}, "", "/de/company/1/building/2/");
      document.body.innerHTML = loadFixture("busy-block-localized.html");

      try {
        expect(readBusyProductionBlock(findBusyProductionBlock(document))).toMatchObject({
          productSlug: "golden-bars",
          productName: "Goldbarren",
          quantity: 1250,
          quality: 3,
          unitCost: 10,
          sourcingValue: 12500,
        });
      } finally {
        window.history.replaceState({}, "", "/");
      }
    });

    it("exposes the block through readProductionRow", () => {
      document.body.innerHTML = loadFixture("busy-block.html");

      expect(readProductionRow(findBusyProductionBlock(document))).toMatchObject({
        productId: null,
        productSlug: "minerals",
        quantity: 6100,
        quality: 4,
        unitCost: 8.79,
        isActive: true,
      });
    });

    it("keeps quantity and quality apart when the rows are reordered", () => {
      document.body.innerHTML = loadFixture("busy-block.html");
      const block = findBusyProductionBlock(document);
      const table = block.querySelector("tbody");
      // Move the quality row in front of the quantity row.
      table.prepend(table.querySelector('td[id="busy-info-label-2"]').parentElement);

      expect(readBusyProductionBlock(block)).toMatchObject({ quantity: 6100, quality: 4 });
    });

    it("ignores percentage rows such as abundance", () => {
      document.body.innerHTML = loadFixture("busy-block.html");
      const block = findBusyProductionBlock(document);
      document.querySelector('td[headers="busy-info-label-4"]').textContent = "5%";

      expect(readBusyProductionBlock(block)).toMatchObject({ quantity: 6100, quality: 4 });
    });
  });

  describe("setup form", () => {
    it("finds the form and reads the cost the game prints", () => {
      document.body.innerHTML = loadFixture("idle-block.html");

      const row = findFirstProductionRow(document);

      expect(row).not.toBeNull();
      expect(readProductionRow(row)).toMatchObject({
        productId: 14,
        productName: "Minerals",
        quantity: 48476,
        quality: 4,
        unitCost: 8.85,
        isActive: false,
      });
    });

    it("separates the order cost from the total labor cost and the stocked average", () => {
      document.body.innerHTML = loadFixture("idle-block.html");

      expect(readProductionStats(findFirstProductionRow(document))).toMatchObject({
        unitCost: 8.85,
        stockUnitCost: 8.7,
        abundancePct: 97.41,
      });
    });

    it("reads the same values in a non-English locale", () => {
      window.history.replaceState({}, "", "/de/company/1/building/2/");
      document.body.innerHTML = loadFixture("idle-block-localized.html");

      try {
        expect(readProductionStats(findFirstProductionRow(document))).toMatchObject({
          unitCost: 8.85,
          stockUnitCost: 8.7,
          abundancePct: 97.41,
        });
      } finally {
        window.history.replaceState({}, "", "/");
      }
    });

    it("falls back to the labor/unit cost order when no stocked average is shown", () => {
      document.body.innerHTML = loadFixture("idle-block.html");
      const row = findFirstProductionRow(document);
      for (const cell of row.querySelectorAll("dl dd")) {
        if (cell.textContent.includes("8.70")) cell.textContent = "$8.85";
      }

      expect(readProductionStats(row)).toMatchObject({
        unitCost: 8.85,
        laborCostTotal: 150501,
        stockUnitCost: null,
      });
    });

    it("reports no unit cost while the form only shows building rates", () => {
      document.body.innerHTML = loadFixture("idle-block-rates.html");
      const row = findFirstProductionRow(document);

      expect(readProductionStats(row)).toMatchObject({
        unitCost: null,
        laborCostTotal: null,
        currentStock: 162566,
        abundancePct: 97.41,
      });
      expect(readProductionStats(row).laborCostPerUnit).toBeCloseTo(6271 / 2019.87, 6);
      expect(readProductionRow(row).unitCost).toBeNull();
    });

    it("ignores the finish-at clock value", () => {
      document.body.innerHTML = loadFixture("idle-block.html");

      expect(readProductionStats(findFirstProductionRow(document)).currentStock).toBeNull();
    });

    it("takes quality from the stepper stars, not from the artwork stars", () => {
      document.body.innerHTML = loadFixture("idle-block.html");
      const row = findFirstProductionRow(document);

      expect(row.querySelectorAll('svg[data-icon="star"]').length).toBe(8);
      expect(readSelectedStarQuality(row)).toBe(4);
      expect(getProductionQuality(row)).toBe(4);
    });

    it("follows the stepper when the selected quality is lowered", () => {
      document.body.innerHTML = loadFixture("idle-block.html");
      const row = findFirstProductionRow(document);
      const stepperStars = row.querySelector('[role="img"]');
      stepperStars.removeChild(stepperStars.lastElementChild);
      stepperStars.removeChild(stepperStars.lastElementChild);

      expect(getProductionQuality(row)).toBe(2);
    });

    it("defaults to a quantity of 1 while the input is empty", () => {
      document.body.innerHTML = loadFixture("idle-block-rates.html");

      expect(readProductionRow(findFirstProductionRow(document)).quantity).toBe(1);
    });
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
});
