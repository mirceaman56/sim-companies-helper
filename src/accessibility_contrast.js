import { observeDocumentBody } from "./page/page_utils.js";
import { findProductionCards, findProductTiles, readProductTile } from "./page/production_tiles_page.js";
import { scheduleUpdate } from "./utils.js";

// The adapter finds the game's production cards; CSS restyles them through these attributes
// only, so no game selector lives in the stylesheet.
const CARD_ATTR = "data-scx-a11y-card";
const TILE_ATTR = "data-scx-a11y-tile";

let stopObserver = /** @type {(() => void) | null} */ (null);

function setAttrIfChanged(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function markProductionScreen() {
  if (!stopObserver) return;
  for (const card of findProductionCards(document)) setAttrIfChanged(card, CARD_ATTR, "");
  for (const tile of findProductTiles(document)) {
    setAttrIfChanged(tile, TILE_ATTR, readProductTile(tile)?.hasStock ? "stock" : "");
  }
}

export function startHighContrast() {
  if (stopObserver) return;
  stopObserver = observeDocumentBody(() => scheduleUpdate(markProductionScreen));
  scheduleUpdate(markProductionScreen);
}

export function stopHighContrast() {
  stopObserver?.();
  stopObserver = null;
  for (const name of [CARD_ATTR, TILE_ATTR]) {
    for (const el of document.querySelectorAll(`[${name}]`)) el.removeAttribute(name);
  }
}
