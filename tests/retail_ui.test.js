// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// Mock i18n — t() just returns the key
vi.mock("../src/i18n.js", () => ({ t: (key) => key }));
// Mock modules that reference browser globals
vi.mock("../src/state.js", () => ({ STATE: {} }));
vi.mock("../src/market.js", () => ({}));
vi.mock("../src/auth.js", () => ({}));
vi.mock("../src/production.js", () => ({}));
vi.mock("../src/sidebar.js", () => ({ registerSection: vi.fn(), getSectionContent: vi.fn(), setSectionUpdateFn: vi.fn() }));

import { classifyProfitPerMin, RetailHelper } from "../src/retail_ui.js";

const { parseNumber, parseDurationToSeconds, computeMetrics, getInfoColumn, extractProductId, extractFinishSeconds, isSellInput, getRowFromTarget } = RetailHelper._testUtils;

/** Helper: build a minimal retail row DOM fragment */
function makeRow({ productName = "Apples", productId = 42, price = "10.00", qty = "100", profit = "$5.00", duration = "(1h 5m)" } = {}) {
  const row = document.createElement("div");

  // Info column (div.right-border with h3)
  const infoCol = document.createElement("div");
  infoCol.classList.add("right-border");
  const h3 = document.createElement("h3");
  h3.textContent = productName;
  infoCol.appendChild(h3);

  // Profit div with SVG icon
  const profitDiv = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  profitDiv.appendChild(svg);
  profitDiv.appendChild(document.createTextNode(profit));
  infoCol.appendChild(profitDiv);

  // Duration in parens
  infoCol.appendChild(document.createTextNode(` ${duration}`));

  row.appendChild(infoCol);

  // Encyclopedia link
  const link = document.createElement("a");
  link.href = `/encyclopedia/1/resource/${productId}/`;
  row.appendChild(link);

  // Price + quantity inputs
  const priceInput = document.createElement("input");
  priceInput.name = "price";
  priceInput.value = price;
  row.appendChild(priceInput);

  const qtyInput = document.createElement("input");
  qtyInput.name = "quantity";
  qtyInput.value = qty;
  row.appendChild(qtyInput);

  return row;
}

// ─── parseNumber ────────────────────────────────────────
describe("parseNumber", () => {
  it("parses plain integers", () => {
    expect(parseNumber("100")).toBe(100);
  });

  it("parses EN format (comma thousands, dot decimal)", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
  });

  it("parses DE format (dot thousands, comma decimal)", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
  });

  it("returns NaN for empty string", () => {
    expect(parseNumber("")).toBeNaN();
  });
});

// ─── parseDurationToSeconds ─────────────────────────────
describe("parseDurationToSeconds", () => {
  it("parses hours and minutes (EN)", () => {
    expect(parseDurationToSeconds("1h 5m")).toBe(3900);
  });

  it("parses days and hours (EN)", () => {
    expect(parseDurationToSeconds("1d 5h")).toBe(104400);
  });

  it("parses German duration (st = Stunden, t = Tage)", () => {
    expect(parseDurationToSeconds("1t 5st")).toBe(104400);
  });

  it("parses seconds only", () => {
    expect(parseDurationToSeconds("45s")).toBe(45);
  });

  it("returns NaN for garbage", () => {
    expect(parseDurationToSeconds("abc")).toBeNaN();
  });
});

// ─── computeMetrics ─────────────────────────────────────
describe("computeMetrics", () => {
  it("computes profit per minute", () => {
    const m = computeMetrics({ profitPerUnit: 10, qty: 6, seconds: 600 });
    expect(m.totalProfit).toBe(60);
    expect(m.profitPerMin).toBe(6); // 60 / 10min
  });

  it("returns NaN when seconds is 0", () => {
    const m = computeMetrics({ profitPerUnit: 10, qty: 1, seconds: 0 });
    expect(m.profitPerMin).toBeNaN();
  });
});

// ─── classifyProfitPerMin ───────────────────────────────
describe("classifyProfitPerMin", () => {
  it("returns 'excellent' for ppm >= 50", () => {
    expect(classifyProfitPerMin(50)).toEqual({ label: "excellent", cls: "scx-chip-excellent" });
  });

  it("returns 'good' for ppm >= 20", () => {
    expect(classifyProfitPerMin(25)).toEqual({ label: "good", cls: "scx-chip-good" });
  });

  it("returns 'bad' for negative ppm", () => {
    expect(classifyProfitPerMin(-5)).toEqual({ label: "bad", cls: "scx-chip-bad" });
  });

  it("returns 'na' for NaN/Infinity", () => {
    expect(classifyProfitPerMin(NaN)).toEqual({ label: "na", cls: "scx-chip-na" });
    expect(classifyProfitPerMin(Infinity)).toEqual({ label: "na", cls: "scx-chip-na" });
  });
});

// ─── DOM: getInfoColumn ─────────────────────────────────
describe("getInfoColumn", () => {
  it("returns the div.right-border containing an h3", () => {
    const row = makeRow();
    const col = getInfoColumn(row);
    expect(col).not.toBeNull();
    expect(col.querySelector("h3").textContent).toBe("Apples");
  });

  it("returns null when no right-border with h3 exists", () => {
    const row = document.createElement("div");
    expect(getInfoColumn(row)).toBeNull();
  });
});

// ─── DOM: extractProductId ──────────────────────────────
describe("extractProductId", () => {
  it("extracts product id from encyclopedia link", () => {
    const row = makeRow({ productId: 99 });
    expect(extractProductId(row)).toBe(99);
  });

  it("returns null when no link present", () => {
    const row = document.createElement("div");
    expect(extractProductId(row)).toBeNull();
  });
});

// ─── DOM: extractFinishSeconds ──────────────────────────
describe("extractFinishSeconds", () => {
  it("extracts duration from parenthesized text in info column", () => {
    const row = makeRow({ duration: "(2h 30m)" });
    expect(extractFinishSeconds(row)).toBe(9000);
  });

  it("returns NaN when no duration present", () => {
    const row = makeRow({ duration: "" });
    expect(extractFinishSeconds(row)).toBeNaN();
  });
});

// ─── DOM: getProductName (via renderers) ────────────────
describe("getProductName", () => {
  it("returns the h3 text from the info column", () => {
    const row = makeRow({ productName: "Steel" });
    expect(RetailHelper.renderers.getProductName(row)).toBe("Steel");
  });

  it("returns 'Unknown' for null row", () => {
    expect(RetailHelper.renderers.getProductName(null)).toBe("Unknown");
  });
});

// ─── DOM: isSellInput ───────────────────────────────────
describe("isSellInput", () => {
  it("returns true for price input", () => {
    const input = document.createElement("input");
    input.name = "price";
    document.body.appendChild(input); // must be in DOM for .matches()
    expect(isSellInput(input)).toBe(true);
    input.remove();
  });

  it("returns true for quantity input", () => {
    const input = document.createElement("input");
    input.name = "quantity";
    document.body.appendChild(input);
    expect(isSellInput(input)).toBe(true);
    input.remove();
  });

  it("returns false for other elements", () => {
    const div = document.createElement("div");
    expect(isSellInput(div)).toBe(false);
  });
});

// ─── DOM: getRowFromTarget ──────────────────────────────
describe("getRowFromTarget", () => {
  it("finds the ancestor row containing both inputs", () => {
    const row = makeRow();
    document.body.appendChild(row);
    const priceInput = row.querySelector('input[name="price"]');
    expect(getRowFromTarget(priceInput)).toBe(row);
    row.remove();
  });

  it("returns null for non-Element input", () => {
    expect(getRowFromTarget(null)).toBeNull();
    expect(getRowFromTarget("string")).toBeNull();
  });
});
