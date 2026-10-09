// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startVisiblePoller } from "../src/scheduler.js";

function setHidden(hidden) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("startVisiblePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("runs on every tick while the tab is visible", () => {
    const run = vi.fn();
    const stop = startVisiblePoller({ intervalMs: 1000, run });

    vi.advanceTimersByTime(3000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it("skips ticks while hidden and catches up once when shown", () => {
    const run = vi.fn();
    const stop = startVisiblePoller({ intervalMs: 1000, run });

    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();

    setHidden(false);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not run on becoming visible when no tick was missed", () => {
    const run = vi.fn();
    const stop = startVisiblePoller({ intervalMs: 1000, run });

    setHidden(true);
    setHidden(false);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it("stops ticking after stop()", () => {
    const run = vi.fn();
    const stop = startVisiblePoller({ intervalMs: 1000, run });
    stop();

    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it("logs and survives a failing run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    const stop = startVisiblePoller({ intervalMs: 1000, run });

    vi.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    stop();
  });
});
