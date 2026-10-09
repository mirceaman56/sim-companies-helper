// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  computeDiscountedPrice,
  getContractAmountValue,
  getContractPriceValue,
  getContractProductId,
  getLowestSellerPrice,
  getSelectedCompanyName,
  getSourcingCostPerUnit,
  getTransportCount,
  hasContractPageElements,
  hasSelectedBeneficiary,
  parseContractPrice,
} from "../src/page/contract_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "contract", name), "utf8");
}

describe("contract_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/"); // English number format unless a test switches locale
  });

  it("detects contract pages from structural selectors", () => {
    document.body.innerHTML = loadFixture("page.html");
    expect(hasContractPageElements(document)).toBe(true);

    document.body.innerHTML = loadFixture("no-page.html");
    expect(hasContractPageElements(document)).toBe(false);
  });

  it("parses dot-decimal and locale strings", () => {
    window.history.pushState({}, "", "/de/contract/1");
    expect(parseContractPrice("0.296")).toBe(0.296);
    expect(parseContractPrice("0,296")).toBe(0.296);
  });

  it("reads contract form values from inputs", () => {
    window.history.pushState({}, "", "/de/contract/1");
    document.body.innerHTML = loadFixture("page.html");

    expect(getContractAmountValue(document)).toBe(1042076);
    expect(getContractPriceValue(document)).toBe(0.296);
  });

  it("extracts lowest seller price from market rows", () => {
    document.body.innerHTML = loadFixture("page.html");

    expect(getLowestSellerPrice(document)).toBe(1.8);
  });

  it("extracts sourcing unit cost from the encyclopedia section", () => {
    document.body.innerHTML = loadFixture("page.html");

    expect(getSourcingCostPerUnit(document)).toBe(0.145);
  });

  it("extracts sourcing unit cost from the current resource card markup", () => {
    document.body.innerHTML = loadFixture("page-current.html");

    expect(getSourcingCostPerUnit(document)).toBe(11.38);
  });

  it("ignores encyclopedia links and cash outside the contract card (navbar, extension popovers)", () => {
    // Regression: the navbar cash (and the accounting chip popover listing it) sat next to an
    // earlier encyclopedia link, so sourcing came out as the cash balance (1,957 x $1,296,040).
    const navbar = `
      <nav><div>
        <a href="/encyclopedia/1/">Encyclopedia</a>
        <div><span>$1,296,040</span></div>
        <div id="scx-acct-widget"><div class="scx-navpop"><span>$1,296,040</span></div></div>
      </div></nav>`;
    document.body.innerHTML = navbar + loadFixture("page-current.html");

    expect(getSourcingCostPerUnit(document)).toBe(11.38);
  });

  it("extracts total transport and ignores sourcing transport blocks", () => {
    document.body.innerHTML = loadFixture("page.html");

    expect(getTransportCount(document)).toBe(6301);
  });

  it("extracts the product id from the market link", () => {
    document.body.innerHTML = loadFixture("page.html");
    expect(getContractProductId(document)).toBe(9);

    document.body.innerHTML = loadFixture("page-current.html");
    expect(getContractProductId(document)).toBe(17);
  });

  it("detects no beneficiary selected while the recipient search input is present", () => {
    document.body.innerHTML = loadFixture("beneficiary-not-selected.html");

    expect(hasSelectedBeneficiary(document)).toBe(false);
    expect(getSelectedCompanyName(document)).toBeNull();
  });

  it("detects the selected beneficiary company by name once chosen", () => {
    document.body.innerHTML = loadFixture("beneficiary-selected.html");

    expect(hasSelectedBeneficiary(document)).toBe(true);
    expect(getSelectedCompanyName(document)).toBe("Grupo Negreiros");
  });

  it("computes the discounted price with 3-decimal rounding", () => {
    expect(computeDiscountedPrice(1.8, 3)).toBeCloseTo(1.746, 5);
    expect(computeDiscountedPrice(1.8, 0)).toBeCloseTo(1.8, 5);
    expect(computeDiscountedPrice(null, 3)).toBeNull();
    expect(computeDiscountedPrice(0, 3)).toBeNull();
  });
});
