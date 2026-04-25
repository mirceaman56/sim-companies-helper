// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  extractWarehousePageItems,
  findWarehouseSalesBuilderTarget,
  isWarehouseOverviewPage,
  getOrCreateWarehouseMarketButton,
  isWarehousePage,
} from "../src/page/warehouse_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "warehouse", name), "utf8");
}

describe("warehouse_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detects warehouse paths", () => {
    expect(isWarehousePage("/en/warehouse/123")).toBe(true);
    expect(isWarehousePage("/en/market/1")).toBe(false);
  });

  it("detects only the warehouse overview path for the sales builder", () => {
    expect(isWarehouseOverviewPage("/headquarters/warehouse/")).toBe(true);
    expect(isWarehouseOverviewPage("/headquarters/warehouse")).toBe(true);
    expect(isWarehouseOverviewPage("/en/headquarters/warehouse/")).toBe(true);
    expect(isWarehouseOverviewPage("/headquarters/warehouse/oranges")).toBe(false);
  });

  it("extracts warehouse items from aria-label cards", () => {
    document.body.innerHTML = loadFixture("cards.html");

    const items = extractWarehousePageItems(document);

    expect(items).toMatchObject([
      { name: "Apples", quantity: 291829, sourcingCost: 0.2, quality: 0 },
      { name: "Bread", quantity: 1000, sourcingCost: 1.5, quality: 2 },
    ]);
    expect(items.length).toBe(2);
  });

  it("returns an empty array when no parsable inventory cards exist", () => {
    document.body.innerHTML = loadFixture("empty.html");

    const items = extractWarehousePageItems(document);

    expect(items).toEqual([]);
  });

  it("wraps cards and creates market button once", () => {
    document.body.innerHTML = loadFixture("cards.html");
    const card = document.querySelector('[data-testid="card-apples"]');

    const first = getOrCreateWarehouseMarketButton(card, {
      buttonText: "Market",
      buttonTitle: "Check market price",
    });
    const second = getOrCreateWarehouseMarketButton(card, {
      buttonText: "Market",
      buttonTitle: "Check market price",
    });

    expect(first).toBe(second);
    expect(first.textContent).toBe("Market");
    expect(card.closest("[data-scx-market-wrapper]")).not.toBeNull();
  });

  it("finds the sales builder target after the last warehouse inventory list", () => {
    document.body.innerHTML = `
      <div>
        <button>Show all</button>
        <div role="list" data-testid="first-list"></div>
        <div role="list" data-testid="last-list"></div>
      </div>
    `;

    const target = findWarehouseSalesBuilderTarget(document);

    expect(target.parentEl).toBe(document.querySelector('[data-testid="last-list"]').parentElement);
    expect(target.afterNode).toBe(document.querySelector('[data-testid="last-list"]'));
  });
});
