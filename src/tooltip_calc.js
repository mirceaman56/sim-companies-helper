export const TOOLTIP_GAP = 8;
export const VIEWPORT_MARGIN = 8;

/**
 * Where a fixed-position tooltip goes: below its anchor, centered, flipped above when it would
 * leave the viewport, and pushed sideways to stay on screen.
 * @param {{ left: number, top: number, right: number, bottom: number, width: number }} anchor
 * @param {{ width: number, height: number }} tip
 * @param {{ width: number, height: number }} viewport
 * @returns {{ x: number, y: number, placement: "below" | "above", arrowX: number }}
 */
export function placeTooltip(anchor, tip, viewport) {
  const anchorCenter = anchor.left + anchor.width / 2;
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - tip.width - VIEWPORT_MARGIN);
  const x = Math.min(Math.max(anchorCenter - tip.width / 2, VIEWPORT_MARGIN), maxX);

  const below = anchor.bottom + TOOLTIP_GAP;
  const fitsBelow = below + tip.height <= viewport.height - VIEWPORT_MARGIN;
  const above = anchor.top - TOOLTIP_GAP - tip.height;
  const placement = fitsBelow || above < VIEWPORT_MARGIN ? "below" : "above";

  return {
    x: Math.round(x),
    y: Math.round(placement === "below" ? below : above),
    placement,
    // Arrow stays pointed at the anchor even when the box was pushed sideways.
    arrowX: Math.round(Math.min(Math.max(anchorCenter - x, 12), Math.max(12, tip.width - 12))),
  };
}
