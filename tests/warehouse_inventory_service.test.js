// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  getWarehouseProductIdByName,
  getWarehouseProductIdBySlug,
  resolveWarehouseProductId,
} from "../src/warehouse_inventory_service.js";

describe("warehouse product id resolution", () => {
  it("resolves a product id from the canonical English name", () => {
    expect(getWarehouseProductIdByName("Apples")).toBe(3);
    expect(getWarehouseProductIdByName("Golden bars")).toBe(69);
    expect(getWarehouseProductIdByName("not a real product")).toBeNull();
  });

  it("resolves a product id from the icon image slug, independent of display name", () => {
    expect(getWarehouseProductIdBySlug("golden-bars")).toBe(69);
    expect(getWarehouseProductIdBySlug("apples")).toBe(3);
    expect(getWarehouseProductIdBySlug("not-a-real-slug")).toBeNull();
    expect(getWarehouseProductIdBySlug(null)).toBeNull();
  });

  it("prefers the icon slug over a localized display name that won't match recipes.json", () => {
    const productId = resolveWarehouseProductId({ name: "Barras de ouro", iconSlug: "golden-bars" });

    expect(productId).toBe(69);
  });

  it("falls back to the display name when there is no icon slug", () => {
    const productId = resolveWarehouseProductId({ name: "Apples", iconSlug: null });

    expect(productId).toBe(3);
  });

  it("returns null when neither the slug nor the name resolve to a known product", () => {
    const productId = resolveWarehouseProductId({ name: "Barras de ouro", iconSlug: "unknown-slug" });

    expect(productId).toBeNull();
  });
});
