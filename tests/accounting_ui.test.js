// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/i18n.js", () => ({
  t: (key) => key,
}));

import { STATE } from "../src/state.js";
import { _testUtils } from "../src/accounting_ui.js";

const { CONTAINER_ID, updateWidget, syncWithNavbar, formatCompactMoney, popover: controller } = _testUtils;

function setupNavbar(cashText) {
  document.body.innerHTML = `
    <div data-testid="money-host">
      <a id="money-balance" href="/headquarters/overview/"><div><div></div><div>${cashText}</div></div></a>
    </div>
    <div data-testid="elsewhere"></div>
  `;
}

function chip() {
  return document.querySelector(`#${CONTAINER_ID} .scx-navchip`);
}

function chipText() {
  const icon = chip()?.querySelector(".scx-navchip-icon")?.textContent ?? "";
  const amount = chip()?.querySelector(".scx-navchip-amount")?.textContent ?? "";
  return `${icon} ${amount}`.trim();
}

function popover() {
  return document.querySelector(`#${CONTAINER_ID} .scx-navpop`);
}

beforeEach(() => {
  _testUtils.reset();
  document.body.innerHTML = "";
  STATE.executives.items = [];
  STATE.executives.loaded = true;
  STATE.executives.error = null;
  STATE.buildings.items = [];
  STATE.bonds.owned = [];
  STATE.bonds.sold = [];
  STATE.bonds.loaded = true;
  STATE.bonds.error = null;
});

describe("accounting widget", () => {
  it("injects next to the cash balance", () => {
    setupNavbar("$1,000,000");
    syncWithNavbar();

    const container = document.getElementById(CONTAINER_ID);
    expect(container).not.toBeNull();
    expect(container.parentElement.classList.contains("scx-navchip-host")).toBe(true);
  });

  it("shows a disabled loading chip until startup data is loaded", () => {
    setupNavbar("$1,000,000");
    syncWithNavbar();

    expect(chip().classList.contains("scx-navchip--loading")).toBe(true);
    expect(chip().disabled).toBe(true);
    expect(popover()).toBeNull();
  });

  it("shows a check with headroom when under the threshold", () => {
    setupNavbar("$1,329,520");
    _testUtils.setDataLoadedForTest(true);
    syncWithNavbar();

    expect(chip().classList.contains("scx-navchip--ok")).toBe(true);
    expect(chipText()).toBe("✓ 1.7M");
    expect(document.querySelector(".scx-navpop-badge--ok").textContent).toBe("acctNoFees");
    expect(document.querySelector(".scx-navpop-desc").textContent).toBe("acctExplainer");
  });

  it("shows a warning with the daily fee when over the threshold", () => {
    setupNavbar("$7,137,918");
    STATE.executives.items = [
      { skills: { cfo: 8 }, currentWorkHistory: { position: "f", start: "2020-01-01T00:00:00Z" } },
    ];
    _testUtils.setDataLoadedForTest(true);
    syncWithNavbar();

    expect(chip().classList.contains("scx-navchip--warn")).toBe(true);
    expect(chipText()).toBe("⚠ 690acctPerDaySuffix");
    expect(document.querySelector(".scx-navpop-badge--warn").textContent).toBe("acctFeesApply");
    expect(document.querySelector(".scx-navpop-meter--warn")).not.toBeNull();
  });

  it("includes net bonds and flags failed bond loads", () => {
    setupNavbar("$2,000,000");
    STATE.bonds.owned = [{ amount: 400 }];
    STATE.bonds.error = "boom";
    _testUtils.setDataLoadedForTest(true);
    syncWithNavbar();

    expect(chip().classList.contains("scx-navchip--warn")).toBe(true);
    expect(document.querySelector(".scx-navpop-note").textContent).toBe("acctBondsUnavailable");
  });

  it("opens on chip click and closes on outside click or Escape", () => {
    setupNavbar("$1,000,000");
    _testUtils.setDataLoadedForTest(true);
    syncWithNavbar();

    expect(popover().classList.contains("scx-hidden")).toBe(true);
    chip().click();
    expect(popover().classList.contains("scx-hidden")).toBe(false);
    expect(chip().getAttribute("aria-expanded")).toBe("true");

    controller.onDocumentClick({ target: popover() });
    expect(popover().classList.contains("scx-hidden")).toBe(false);

    controller.onDocumentClick({ target: document.querySelector('[data-testid="elsewhere"]') });
    expect(popover().classList.contains("scx-hidden")).toBe(true);

    chip().click();
    controller.onDocumentKeydown({ key: "Escape" });
    expect(popover().classList.contains("scx-hidden")).toBe(true);
  });

  it("keeps the popover open across re-renders", () => {
    setupNavbar("$1,000,000");
    _testUtils.setDataLoadedForTest(true);
    syncWithNavbar();
    chip().click();

    document.querySelector("#money-balance div div:last-child").textContent = "$2,500,000";
    updateWidget();

    expect(popover().classList.contains("scx-hidden")).toBe(false);
    expect(chipText()).toBe("✓ 500k");
  });

  it("formats compact money", () => {
    expect(formatCompactMoney(1_234_567)).toBe("$1.2M");
    expect(formatCompactMoney(45_600)).toBe("$46k");
    expect(formatCompactMoney(690)).toBe("$690");
  });
});
