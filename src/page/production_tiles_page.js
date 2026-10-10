import { findBusyProductionBlock } from "./production_page.js";

const TILE_SELECTOR = 'a[data-testid^="production-tile-"]';
const TILE_ID_RE = /^production-tile-(\d+)$/;
// Stock is drawn as a boxes icon plus a green tint; the icon is the structural signal.
const STOCK_ICON_SELECTOR = 'svg[data-icon="boxes-stacked"]';
const SETUP_FORM_SELECTOR = '[data-testid="idle-block"]';
const MAX_WRAPPER_DEPTH = 3;

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLAnchorElement[]}
 */
export function findProductTiles(root = document) {
  return [...(root?.querySelectorAll?.(TILE_SELECTOR) || [])];
}

/**
 * @param {Element | null | undefined} tile
 * @returns {{ resourceId: number | null, hasStock: boolean } | null}
 */
export function readProductTile(tile) {
  if (!(tile instanceof Element)) return null;
  const id = tile.getAttribute("data-testid")?.match(TILE_ID_RE)?.[1];
  return {
    resourceId: id ? Number(id) : null,
    hasStock: Boolean(tile.querySelector(STOCK_ICON_SELECTOR)),
  };
}

/** The visible card is the outermost wrapper that holds nothing but this block. */
function outermostWrapper(el) {
  let current = el;
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth += 1) {
    const parent = current.parentElement;
    if (!parent || parent === el.ownerDocument?.body || parent.children.length !== 1) break;
    current = parent;
  }
  return current;
}

/**
 * Cards of the production screen: running order, product picker and setup form.
 * @param {ParentNode | null | undefined} root
 * @returns {Element[]}
 */
export function findProductionCards(root = document) {
  const cards = new Set();

  const busy = findBusyProductionBlock(root);
  if (busy) cards.add(outermostWrapper(busy));

  // Tile list -> picker section (heading + list) -> card.
  const picker = findProductTiles(root)[0]?.closest("ul")?.parentElement?.parentElement;
  if (picker && picker !== picker.ownerDocument?.body) cards.add(picker);

  const setup = root?.querySelector?.(SETUP_FORM_SELECTOR);
  if (setup) cards.add(setup);

  return [...cards];
}
