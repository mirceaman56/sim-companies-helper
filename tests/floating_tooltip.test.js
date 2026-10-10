// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installFloatingTooltips, _testUtils } from "../src/floating_tooltip.js";
import { TOOLTIP_GAP, VIEWPORT_MARGIN, placeTooltip } from "../src/tooltip_calc.js";

const rect = (left, top, width, height) => ({ left, top, width, right: left + width, bottom: top + height });
const viewport = { width: 1200, height: 800 };
const tip = { width: 280, height: 120 };

describe("placeTooltip", () => {
  it("centers below the anchor when there is room", () => {
    const pos = placeTooltip(rect(500, 100, 16, 16), tip, viewport);
    expect(pos).toEqual({ x: 368, y: 116 + TOOLTIP_GAP, placement: "below", arrowX: 140 });
  });

  it("is pushed inside the viewport next to the left edge, arrow still on the anchor", () => {
    const pos = placeTooltip(rect(10, 100, 16, 16), tip, viewport);
    expect(pos.x).toBe(VIEWPORT_MARGIN);
    expect(pos.arrowX).toBe(12);
  });

  it("overlaps past a right-edge sidebar instead of overflowing the window", () => {
    const pos = placeTooltip(rect(1180, 100, 16, 16), tip, viewport);
    expect(pos.x).toBe(viewport.width - tip.width - VIEWPORT_MARGIN);
    expect(pos.arrowX).toBe(tip.width - 12);
  });

  it("flips above when it would leave the bottom", () => {
    const pos = placeTooltip(rect(500, 740, 16, 16), tip, viewport);
    expect(pos.placement).toBe("above");
    expect(pos.y).toBe(740 - TOOLTIP_GAP - tip.height);
  });
});

describe("floating tooltip", () => {
  beforeAll(() => installFloatingTooltips());
  afterEach(() => {
    _testUtils.reset();
    document.body.innerHTML = "";
  });

  const mountTrigger = () => {
    document.body.innerHTML =
      '<span class="scx-info-icon" tabindex="0" aria-label="Help" data-scx-tooltip="Help text">i</span>';
    return document.querySelector(".scx-info-icon");
  };
  const tooltip = () => document.getElementById("scx-floating-tooltip");

  it("lives on <html>, outside every sidebar, hidden from screen readers", () => {
    mountTrigger().dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(tooltip().parentElement).toBe(document.documentElement);
    expect(tooltip().getAttribute("aria-hidden")).toBe("true");
    expect(tooltip().textContent).toBe("Help text");
    expect(tooltip().classList.contains("scx-floating-tooltip-visible")).toBe(true);
    expect(tooltip().style.getPropertyValue("--scx-tooltip-x")).toMatch(/px$/);
  });

  it("shows on keyboard focus and hides on blur and Escape", () => {
    const trigger = mountTrigger();
    trigger.focus();
    expect(tooltip().classList.contains("scx-floating-tooltip-visible")).toBe(true);
    trigger.blur();
    expect(tooltip().classList.contains("scx-floating-tooltip-visible")).toBe(false);

    trigger.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tooltip().classList.contains("scx-floating-tooltip-visible")).toBe(false);
  });

  it("hides when the pointer leaves", () => {
    const trigger = mountTrigger();
    trigger.dispatchEvent(new Event("pointerover", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    expect(tooltip().classList.contains("scx-floating-tooltip-visible")).toBe(false);
  });
});
