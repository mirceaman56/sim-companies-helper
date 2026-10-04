// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createNavPopController,
  fitNavChip,
  keepNavPopOnScreen,
  renderNavChip,
  renderNavPopGauge,
  renderNavPopLine,
} from "../src/nav_chip.js";

function mountChip({ amount = "19.9M" } = {}) {
  document.body.innerHTML = `
    <div class="host">
      <a><div><span class="txt">$1,000,000</span></div></a>
      <div id="w">${renderNavChip({ icon: "✓", amount, title: "t", tone: "ok", popoverId: "p", expanded: false })}
        <div id="p" class="scx-navpop scx-hidden"></div>
      </div>
    </div>
    <div id="outside"></div>
  `;
  return { chip: document.querySelector(".scx-navchip"), text: document.querySelector(".txt") };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("nav chip rendering", () => {
  it("escapes chip content and sets aria attributes", () => {
    document.body.innerHTML = renderNavChip({
      icon: "<b>",
      amount: "1&2",
      title: '"x"',
      tone: "warn",
      popoverId: "pop",
      expanded: true,
    });
    const chip = document.querySelector(".scx-navchip");
    expect(chip.classList.contains("scx-navchip--warn")).toBe(true);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(chip.getAttribute("aria-controls")).toBe("pop");
    expect(chip.querySelector(".scx-navchip-icon").textContent).toBe("<b>");
    expect(chip.querySelector(".scx-navchip-amount").textContent).toBe("1&2");
  });

  it("clamps gauge values into range", () => {
    document.body.innerHTML = renderNavPopGauge({ label: "l", valueText: "v", value: 150, max: 100 });
    expect(document.querySelector("progress").getAttribute("value")).toBe("100");

    document.body.innerHTML = renderNavPopGauge({ label: "l", valueText: "v", value: -5, max: 0 });
    expect(document.querySelector("progress").getAttribute("max")).toBe("1");
    expect(document.querySelector("progress").getAttribute("value")).toBe("0");
  });

  it("renders a line with sign, sub-line and tone", () => {
    document.body.innerHTML = renderNavPopLine({
      sign: "+",
      label: "Cash",
      value: "$1",
      tone: "total",
      sub: "s",
    });
    expect(document.querySelector(".scx-navpop-line--total")).not.toBeNull();
    expect(document.querySelector(".scx-navpop-sub").textContent).toBe("s");
  });
});

describe("fitNavChip", () => {
  it("collapses to icon when the text would touch the chip", () => {
    const { chip, text } = mountChip();
    text.getBoundingClientRect = () => ({ right: 120 });
    chip.getBoundingClientRect = () => ({ left: 110 });
    fitNavChip(chip, text);
    expect(chip.classList.contains("scx-navchip--icon-only")).toBe(true);

    chip.getBoundingClientRect = () => ({ left: 160 });
    fitNavChip(chip, text);
    expect(chip.classList.contains("scx-navchip--icon-only")).toBe(false);
  });

  it("measures rendered glyphs instead of a full-width text element", () => {
    const { chip, text } = mountChip();
    text.getBoundingClientRect = () => ({ right: 200 });
    chip.getBoundingClientRect = () => ({ left: 150 });
    const createRange = vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: vi.fn(),
      getBoundingClientRect: () => ({ width: 60, right: 130 }),
    });

    fitNavChip(chip, text);
    expect(chip.classList.contains("scx-navchip--icon-only")).toBe(false);
    createRange.mockRestore();
  });
});

describe("popover controller", () => {
  it("toggles, syncs aria and closes on outside click / Escape", () => {
    mountChip();
    const controller = createNavPopController({ containerId: "w" });
    const pop = document.getElementById("p");

    controller.toggle();
    expect(pop.classList.contains("scx-hidden")).toBe(false);
    expect(document.querySelector(".scx-navchip").getAttribute("aria-expanded")).toBe("true");

    controller.onDocumentClick({ target: pop });
    expect(controller.isOpen()).toBe(true);
    controller.onDocumentClick({ target: document.getElementById("outside") });
    expect(controller.isOpen()).toBe(false);

    controller.setOpen(true);
    controller.onDocumentKeydown({ key: "Escape" });
    expect(pop.classList.contains("scx-hidden")).toBe(true);
  });

  it("flips the popover left-aligned when it would leave the viewport", () => {
    mountChip();
    const pop = document.getElementById("p");
    pop.getBoundingClientRect = () => ({ left: -40 });
    keepNavPopOnScreen(pop);
    expect(pop.classList.contains("scx-navpop--align-left")).toBe(true);

    pop.getBoundingClientRect = () => ({ left: 20 });
    keepNavPopOnScreen(pop);
    expect(pop.classList.contains("scx-navpop--align-left")).toBe(false);
  });
});
