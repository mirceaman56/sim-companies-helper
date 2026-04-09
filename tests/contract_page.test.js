// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getContractAmountValue,
  getContractPriceValue,
  getLowestSellerPrice,
  getSourcingCostPerUnit,
  getTransportCount,
  hasContractPageElements,
  parseContractPrice,
} from "../src/page/contract_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "contract", name), "utf8");
}

describe("contract_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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

  it("extracts total transport and ignores sourcing transport blocks", () => {
    document.body.innerHTML = loadFixture("page.html");

    expect(getTransportCount(document)).toBe(6301);
  });
});
