// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  areUpgradePricesPopulated,
  findUpgradeModal,
  getUpgradeInjectionTarget,
  parseUpgradeResourceRows,
} from "../src/page/upgrade_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "upgrade", name), "utf8");
}

describe("upgrade_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the upgrade modal using exchange-row structure", () => {
    document.body.innerHTML = loadFixture("ready-modal.html");

    const modal = findUpgradeModal(document);

    expect(modal).not.toBeNull();
    expect(modal.dataset.testid).toBe("upgrade-modal");
  });

  it("reports populated prices only when exchange values are ready", () => {
    document.body.innerHTML = loadFixture("ready-modal.html");
    const readyModal = findUpgradeModal(document);
    expect(areUpgradePricesPopulated(readyModal)).toBe(true);

    document.body.innerHTML = loadFixture("loading-modal.html");
    const loadingModal = document.querySelector('[data-testid="upgrade-modal-loading"]');
    expect(areUpgradePricesPopulated(loadingModal)).toBe(false);
  });

  it("parses resource rows with recipe mapping and decimals", () => {
    document.body.innerHTML = loadFixture("ready-modal.html");
    const modal = findUpgradeModal(document);

    const resources = parseUpgradeResourceRows(modal);

    expect(resources).toEqual([
      { recipeId: 101, requiredQty: 140, warehouse: 20, price: 222, decimals: 0 },
      { recipeId: 102, requiredQty: 1925, warehouse: 100, price: 11.4, decimals: 1 },
      { recipeId: 108, requiredQty: 560, warehouse: 0, price: 11.4, decimals: 1 },
      { recipeId: 111, requiredQty: 35, warehouse: 2, price: 2870, decimals: 0 },
    ]);
  });

  it("returns insertion target and table anchor inside modal body", () => {
    document.body.innerHTML = loadFixture("ready-modal.html");
    const modal = findUpgradeModal(document);

    const target = getUpgradeInjectionTarget(modal);

    expect(target).not.toBeNull();
    expect(target.parentEl.classList.contains("text-left")).toBe(true);
    expect(target.afterNode.tagName).toBe("TABLE");
  });
});
