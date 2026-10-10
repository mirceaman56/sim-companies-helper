// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markProductionScreen, startHighContrast, stopHighContrast } from "../src/accessibility_contrast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", "production_tiles", file), "utf8");

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
  document.body.innerHTML = fixture("busy-picker.html");
  startHighContrast();
});

afterEach(() => {
  stopHighContrast();
  vi.unstubAllGlobals();
});

describe("production screen high contrast", () => {
  it("marks cards and tiles, with stock as its own state", () => {
    markProductionScreen();
    expect(document.querySelectorAll("[data-scx-a11y-card]")).toHaveLength(2);
    const tiles = [...document.querySelectorAll("[data-scx-a11y-tile]")];
    expect(tiles.map((tile) => tile.getAttribute("data-scx-a11y-tile"))).toEqual(["stock", "", "", ""]);
  });

  it("a second pass writes nothing", async () => {
    markProductionScreen();
    const records = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    markProductionScreen();
    await Promise.resolve();
    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it("stopping removes every mark and stops marking", () => {
    markProductionScreen();
    stopHighContrast();
    expect(document.querySelector("[data-scx-a11y-card], [data-scx-a11y-tile]")).toBeNull();
    markProductionScreen();
    expect(document.querySelector("[data-scx-a11y-card]")).toBeNull();
  });
});
