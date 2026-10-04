import { findClosestWithin, findLastDigitLeaf } from "./page_utils.js";

const PRIMARY_LEVEL_LINK_SELECTOR = 'a[href*="/encyclopedia/"][href*="/levels/"]';
const FALLBACK_LEVEL_LINK_SELECTOR = 'a[href*="/levels/"]';

export function findXpLevelAnchor(root = document) {
  return (
    root?.querySelector?.(PRIMARY_LEVEL_LINK_SELECTOR) ||
    root?.querySelector?.(FALLBACK_LEVEL_LINK_SELECTOR) ||
    null
  );
}

export function findXpHostElement(levelAnchor) {
  if (!levelAnchor) return null;

  const directParent = levelAnchor.parentElement;
  if (directParent && directParent !== document.body) {
    return directParent;
  }

  return findClosestWithin(levelAnchor, "div") || null;
}

export function readXpNavbarContext(root = document) {
  const levelAnchor = findXpLevelAnchor(root);
  if (!levelAnchor) return null;

  const hostEl = findXpHostElement(levelAnchor);
  if (!hostEl) return null;

  return {
    levelAnchor,
    hostEl,
  };
}

/**
 * Element rendering the trailing part of the level label ("24 (1%)").
 * @returns {Element | null}
 */
export function findXpLevelTextElement(root = document) {
  return findLastDigitLeaf(findXpLevelAnchor(root));
}

/**
 * Progress through the current level as shown by the game ("Lv. 24 (1%)" -> 1).
 * @returns {number | null}
 */
export function readXpLevelPercent(root = document) {
  const text = findXpLevelAnchor(root)?.textContent || "";
  const match = text.match(/\((\d+(?:[.,]\d+)?)\s*%\)/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
