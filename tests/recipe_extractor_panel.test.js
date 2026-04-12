// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRecipeExtractorPanelController } from "../src/recipe_extractor_panel.js";

describe("recipe extractor panel controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("adds unique recipes and renders panel", () => {
    const controller = createRecipeExtractorPanelController({ root: document });

    controller.showRecipe({ id: 101, name: "Water", materials: [{ id: 1, quantity: 1 }] });
    controller.showRecipe({ id: 101, name: "Water", materials: [{ id: 1, quantity: 1 }] });
    controller.showRecipe({ id: 102, name: "Fuel", materials: [{ id: 8, quantity: 0.5 }] });

    expect(controller.getRecipes()).toHaveLength(2);
    expect(document.getElementById("scx-recipe-extractor")).not.toBeNull();
    expect(document.getElementById("scx-recipe-output")?.value).toContain('"id": 102');
  });

  it("copies JSON to clipboard and shows feedback", async () => {
    vi.useFakeTimers();
    const writeClipboard = vi.fn(async () => {});
    const controller = createRecipeExtractorPanelController({
      root: document,
      writeClipboard,
      timeoutFn: setTimeout,
    });
    controller.showRecipe({ id: 101, name: "Water", materials: [{ id: 1, quantity: 1 }] });

    document.getElementById("scx-copy-recipe")?.click();
    await Promise.resolve();

    expect(writeClipboard).toHaveBeenCalledTimes(1);
    const feedback = document.getElementById("scx-copy-feedback");
    expect(feedback?.style.display).toBe("block");

    vi.advanceTimersByTime(2000);
    expect(feedback?.style.display).toBe("none");
    vi.useRealTimers();
  });

  it("uses execCommand fallback when clipboard write fails", async () => {
    const writeClipboard = vi.fn(async () => {
      throw new Error("denied");
    });
    const execCopy = vi.fn(() => true);
    const controller = createRecipeExtractorPanelController({
      root: document,
      writeClipboard,
      execCopy,
    });
    controller.showRecipe({ id: 101, name: "Water", materials: [{ id: 1, quantity: 1 }] });

    document.getElementById("scx-copy-recipe")?.click();
    await Promise.resolve();

    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(execCopy).toHaveBeenCalledTimes(1);
  });

  it("clears stored recipes when clear is clicked", () => {
    const controller = createRecipeExtractorPanelController({ root: document });
    controller.showRecipe({ id: 101, name: "Water", materials: [{ id: 1, quantity: 1 }] });

    document.getElementById("scx-clear-recipe")?.click();

    expect(controller.getRecipes()).toEqual([]);
    expect(controller.getCurrentResourceId()).toBeNull();
    expect(document.getElementById("scx-recipe-extractor")).toBeNull();
  });
});
