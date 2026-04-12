import { observeDocumentBody } from "./page/page_utils.js";

/**
 * Observe route/content changes for recipe extractor refreshes.
 * Keeps route watching separate from recipe DOM extraction.
 *
 * @param {() => void} onChange
 * @param {{root?: Document | Element, win?: Window}} [input]
 * @returns {() => void}
 */
export function observeRecipeExtractorRoute(onChange, input = {}) {
  if (typeof onChange !== "function") return () => {};

  const { root = document, win = window } = input;

  const stopMutationObserver = observeDocumentBody(onChange, { root });
  const onPopState = () => onChange();
  win.addEventListener("popstate", onPopState);

  return () => {
    stopMutationObserver();
    win.removeEventListener("popstate", onPopState);
  };
}
