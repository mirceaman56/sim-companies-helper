// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRateCapture } from "../src/resource_needs_capture.js";

const fixture = (name) => readFileSync(join(process.cwd(), "tests", "fixtures", "production", name), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let stop = () => {};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  document.body.innerHTML = "";
});

afterEach(() => {
  stop();
  window.history.replaceState({}, "", "/");
});

describe("startRateCapture", () => {
  it("reads a building page that is already open when it starts", () => {
    window.history.replaceState({}, "", "/b/52352297/");
    document.body.innerHTML = fixture("busy-page-header.html");
    const onReading = vi.fn();
    stop = startRateCapture(onReading);

    expect(onReading).toHaveBeenCalledTimes(1);
    expect(onReading).toHaveBeenCalledWith("52352297", {
      level: 12,
      wagesPerHour: 8290,
      offers: [16, 17, 18, 43, 45],
      rates: [],
    });
  });

  it("reads the page once the game renders it, and only again when it changes", async () => {
    window.history.replaceState({}, "", "/b/55502907/production/14/");
    const onReading = vi.fn();
    stop = startRateCapture(onReading);
    expect(onReading).not.toHaveBeenCalled();

    document.body.innerHTML = fixture("idle-block-rates.html");
    await flush();
    expect(onReading).toHaveBeenCalledTimes(1);
    expect(onReading.mock.calls[0][1].rates).toEqual([
      { productId: 14, unitsPerHour: 2019.87, wagesPerHour: 6271 },
    ]);

    document.body.appendChild(document.createElement("span"));
    await flush();
    expect(onReading).toHaveBeenCalledTimes(1);
  });

  it("ignores pages that are not a building", () => {
    window.history.replaceState({}, "", "/landscape/");
    document.body.innerHTML = fixture("busy-page-header.html");
    const onReading = vi.fn();
    stop = startRateCapture(onReading);
    expect(onReading).not.toHaveBeenCalled();
  });
});
