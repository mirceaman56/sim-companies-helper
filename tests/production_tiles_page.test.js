// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { findProductionCards, findProductTiles, readProductTile } from "../src/page/production_tiles_page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", "production_tiles", file), "utf8");

describe("production tiles page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds product tiles and reads resource id and stock", () => {
    document.body.innerHTML = fixture("busy-picker.html");
    const tiles = findProductTiles(document).map(readProductTile);
    expect(tiles).toEqual([
      { resourceId: 16, hasStock: true },
      { resourceId: 18, hasStock: false },
      { resourceId: 45, hasStock: false },
      { resourceId: 67, hasStock: false },
    ]);
  });

  it("finds the running-order card and the picker card on a busy building", () => {
    document.body.innerHTML = fixture("busy-picker.html");
    const cards = findProductionCards(document);
    expect(cards).toHaveLength(2);

    const [busy, picker] = cards;
    expect(busy.querySelector('td[headers^="busy-info-label-"]')).not.toBeNull();
    expect(busy.parentElement.children.length).toBeGreaterThan(1);
    expect(picker.querySelector('[data-testid^="production-tile-"]')).not.toBeNull();
    expect(picker.contains(busy)).toBe(false);
  });

  it("finds the setup form card on an idle building", () => {
    document.body.innerHTML = fixture("setup-form.html");
    const cards = findProductionCards(document);
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-testid")).toBe("idle-block");
    expect(findProductTiles(document)).toEqual([]);
  });

  it("returns nothing for unrelated pages and bad input", () => {
    document.body.innerHTML = "<main><ul><li><a href='/x'>x</a></li></ul></main>";
    expect(findProductionCards(document)).toEqual([]);
    expect(findProductTiles(null)).toEqual([]);
    expect(readProductTile(null)).toBeNull();
  });
});
