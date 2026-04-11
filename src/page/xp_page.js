import { findClosestWithin } from "./page_utils.js";

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
