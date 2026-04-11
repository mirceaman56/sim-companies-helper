// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findAncestorWithin,
  findClosestWithin,
  hasAllSelectors,
  hasAnySelector,
  observeDocumentBody,
  observeMutations,
  waitForStructuralValue,
} from "../src/page/page_utils.js";

function flushMutations() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("page_utils", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("hasAllSelectors and hasAnySelector use structural checks", () => {
    document.body.innerHTML = `
      <input name="price" />
      <a href="/market/resource/1">Market</a>
    `;

    expect(hasAllSelectors(document, ['input[name="price"]', 'a[href*="market/resource"]'])).toBe(true);
    expect(hasAllSelectors(document, ['input[name="missing"]', 'a[href*="market/resource"]'])).toBe(false);
    expect(hasAnySelector(document, ['input[name="missing"]', 'a[href*="market/resource"]'])).toBe(true);
  });

  it("findAncestorWithin and findClosestWithin respect depth bounds", () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="level-1">
          <div class="level-2 target">
            <button id="btn">X</button>
          </div>
        </div>
      </div>
    `;

    const btn = document.getElementById("btn");

    expect(findClosestWithin(btn, ".target", { maxDepth: 4 })?.classList.contains("target")).toBe(true);
    expect(findClosestWithin(btn, "#root", { maxDepth: 1 })).toBeNull();

    const found = findAncestorWithin(btn, (el) => el.id === "root", { maxDepth: 6 });
    expect(found?.id).toBe("root");
  });

  it("observeMutations returns cleanup and stops after disconnect", async () => {
    let count = 0;
    const stop = observeMutations(document.body, () => {
      count += 1;
    });

    const el = document.createElement("div");
    document.body.appendChild(el);
    await flushMutations();
    expect(count).toBeGreaterThan(0);

    stop();
    document.body.appendChild(document.createElement("span"));
    await flushMutations();
    expect(count).toBe(1);
  });

  it("observeDocumentBody observes root body by default", async () => {
    let triggered = false;
    const stop = observeDocumentBody(() => {
      triggered = true;
    });

    document.body.appendChild(document.createElement("div"));
    await flushMutations();

    expect(triggered).toBe(true);
    stop();
  });

  it("waitForStructuralValue resolves when readiness appears", async () => {
    vi.useFakeTimers();

    const row = document.createElement("div");
    document.body.appendChild(row);

    let value = 0;

    const waitPromise = waitForStructuralValue({
      target: row,
      readValue: () => value,
      isReady: (next) => next > 0,
      timeoutMs: 1000,
    });

    setTimeout(() => {
      value = 8;
      row.textContent = "updated";
    }, 50);

    vi.advanceTimersByTime(60);
    await expect(waitPromise).resolves.toBe(8);

    vi.useRealTimers();
  });

  it("waitForStructuralValue falls back on timeout", async () => {
    vi.useFakeTimers();

    const row = document.createElement("div");
    document.body.appendChild(row);

    const waitPromise = waitForStructuralValue({
      target: row,
      readValue: () => 0,
      isReady: (next) => next > 0,
      timeoutMs: 100,
    });

    vi.advanceTimersByTime(100);
    await expect(waitPromise).resolves.toBe(0);

    vi.useRealTimers();
  });
});
