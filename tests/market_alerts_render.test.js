// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createAlertsContent } from "../src/market_alerts_render.js";

describe("market_alerts_render", () => {
  it("renders labeled fields with ids and names", () => {
    const container = createAlertsContent({
      recipes: [
        { id: 2, name: "Water" },
        { id: 1, name: "Power" },
      ],
      alertsCount: 0,
      maxCount: 2,
      t: (key) => key,
      escapeHtml: (value) => String(value),
      onAdd: vi.fn(),
    });

    expect(container.querySelector('label[for="scx-ma-product"]')).not.toBeNull();
    expect(container.querySelector('label[for="scx-ma-quality"]')).not.toBeNull();
    expect(container.querySelector('label[for="scx-ma-price"]')).not.toBeNull();
    expect(container.querySelector("#scx-ma-product")?.getAttribute("name")).toBe("scx-ma-product");
    expect(container.querySelector("#scx-ma-quality")?.getAttribute("name")).toBe("scx-ma-quality");
    expect(container.querySelector("#scx-ma-price")?.getAttribute("name")).toBe("scx-ma-price");
  });
});
