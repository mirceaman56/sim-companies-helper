// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { observeRecipeExtractorRoute } from "../src/recipe_extractor_observer.js";

describe("recipe_extractor observer", () => {
  it("invokes callback on popstate and mutations", async () => {
    const onChange = vi.fn();
    const stop = observeRecipeExtractorRoute(onChange, { root: document, win: window });

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onChange).toHaveBeenCalledTimes(1);

    const marker = document.createElement("div");
    document.body.appendChild(marker);
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(2);

    stop();
  });
});
