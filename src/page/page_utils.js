// page_utils.js
// Shared DOM/page adapter utilities.

const DEFAULT_OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
};

function isElement(value) {
  return value instanceof Element;
}

/**
 * Observe mutations on a target and return a cleanup function.
 * @param {Node | null | undefined} target
 * @param {() => void} onChange
 * @param {MutationObserverInit} [options]
 * @returns {() => void}
 */
export function observeMutations(target, onChange, options = DEFAULT_OBSERVER_OPTIONS) {
  if (!target || typeof onChange !== "function") return () => {};

  const observer = new MutationObserver(() => onChange());
  observer.observe(target, options);

  return () => observer.disconnect();
}

/**
 * Observe the document body (or custom root) for subtree changes.
 * @param {() => void} onChange
 * @param {{ root?: Document | Element, options?: MutationObserverInit }} [input]
 * @returns {() => void}
 */
export function observeDocumentBody(onChange, input = {}) {
  const { root = document, options = DEFAULT_OBSERVER_OPTIONS } = input;
  const target = root?.body || root;
  return observeMutations(target, onChange, options);
}

/**
 * Find the closest ancestor that matches a predicate within a bounded depth.
 * @param {EventTarget | null | undefined} target
 * @param {(el: Element) => boolean} predicate
 * @param {{ maxDepth?: number, boundary?: Element | null }} [input]
 * @returns {Element | null}
 */
export function findAncestorWithin(target, predicate, input = {}) {
  if (!isElement(target) || typeof predicate !== "function") return null;

  const maxDepth = Number.isFinite(input.maxDepth) ? Number(input.maxDepth) : 25;
  const boundary = input.boundary || target.ownerDocument?.body || document.body;

  let el = target;
  for (let i = 0; i < maxDepth && el; i += 1) {
    if (predicate(el)) return el;
    if (boundary && el === boundary) break;
    el = el.parentElement;
  }

  return null;
}

/**
 * Find a matching ancestor with bounded search depth.
 * @param {EventTarget | null | undefined} target
 * @param {string} selector
 * @param {{ maxDepth?: number, boundary?: Element | null }} [input]
 * @returns {Element | null}
 */
export function findClosestWithin(target, selector, input = {}) {
  return findAncestorWithin(target, (el) => el.matches(selector), input);
}

/**
 * Check if all selectors are present in a root.
 * @param {ParentNode | null | undefined} root
 * @param {string[]} selectors
 * @returns {boolean}
 */
export function hasAllSelectors(root, selectors) {
  if (!root?.querySelector || !Array.isArray(selectors) || selectors.length === 0) return false;
  return selectors.every((selector) => Boolean(root.querySelector(selector)));
}

/**
 * Check if any selector is present in a root.
 * @param {ParentNode | null | undefined} root
 * @param {string[]} selectors
 * @returns {boolean}
 */
export function hasAnySelector(root, selectors) {
  if (!root?.querySelector || !Array.isArray(selectors) || selectors.length === 0) return false;
  return selectors.some((selector) => Boolean(root.querySelector(selector)));
}

/**
 * Wait for a structurally ready value derived from DOM mutations.
 * @template T
 * @param {{
 *  target: Node | null | undefined,
 *  readValue: () => T,
 *  isReady: (value: T) => boolean,
 *  timeoutMs?: number,
 *  observeOptions?: MutationObserverInit,
 * }} input
 * @returns {Promise<T>}
 */
export function waitForStructuralValue(input) {
  const {
    target,
    readValue,
    isReady,
    timeoutMs = 3000,
    observeOptions = {
      childList: true,
      subtree: true,
      characterData: true,
    },
  } = input;

  return new Promise((resolve) => {
    const initialValue = readValue();
    if (isReady(initialValue)) {
      resolve(initialValue);
      return;
    }

    let timeoutId = null;
    const stopObserving = observeMutations(
      target,
      () => {
        const nextValue = readValue();
        if (!isReady(nextValue)) return;

        if (timeoutId) clearTimeout(timeoutId);
        stopObserving();
        resolve(nextValue);
      },
      observeOptions,
    );

    timeoutId = setTimeout(() => {
      stopObserving();
      resolve(readValue());
    }, timeoutMs);
  });
}

export const _testUtils = {
  DEFAULT_OBSERVER_OPTIONS,
};
