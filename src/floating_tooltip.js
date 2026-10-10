import { placeTooltip } from "./tooltip_calc.js";

// why: the sidebars scroll (overflow: auto), which clips ::after tooltips at their edge. One
// fixed tooltip on <html> can overlap the game instead. Any element with
// data-scx-tooltip gets it; the element also carries the same text as aria-label, so the
// tooltip itself stays hidden from screen readers.
const TOOLTIP_ID = "scx-floating-tooltip";
const TRIGGER_ATTR = "data-scx-tooltip";
const VISIBLE_CLASS = "scx-floating-tooltip-visible";

let installed = false;
let activeTrigger = /** @type {Element | null} */ (null);

function ensureTooltip() {
  let tip = document.getElementById(TOOLTIP_ID);
  if (tip) return tip;
  tip = document.createElement("div");
  tip.id = TOOLTIP_ID;
  tip.className = "scx-floating-tooltip";
  tip.setAttribute("aria-hidden", "true");
  document.documentElement.appendChild(tip);
  return tip;
}

/** @param {Element} trigger */
export function showTooltip(trigger) {
  const text = trigger.getAttribute(TRIGGER_ATTR);
  if (!text) return;
  const tip = ensureTooltip();
  activeTrigger = trigger;
  tip.textContent = text;
  tip.classList.add(VISIBLE_CLASS);

  const box = tip.getBoundingClientRect();
  const position = placeTooltip(
    trigger.getBoundingClientRect(),
    { width: box.width, height: box.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  tip.style.setProperty("--scx-tooltip-x", `${position.x}px`);
  tip.style.setProperty("--scx-tooltip-y", `${position.y}px`);
  tip.style.setProperty("--scx-tooltip-arrow-x", `${position.arrowX}px`);
  tip.setAttribute("data-placement", position.placement);
}

export function hideTooltip() {
  activeTrigger = null;
  document.getElementById(TOOLTIP_ID)?.classList.remove(VISIBLE_CLASS);
}

/** @param {Event} event */
function triggerOf(event) {
  const target = /** @type {Element | null} */ (event.target);
  return target?.closest?.(`[${TRIGGER_ATTR}]`) || null;
}

/** Event delegation on the document: one set of listeners for every tooltip trigger. */
export function installFloatingTooltips() {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerover", (event) => {
    const trigger = triggerOf(event);
    if (trigger && trigger !== activeTrigger) showTooltip(trigger);
  });
  document.addEventListener("pointerout", (event) => {
    const leaving = triggerOf(event);
    const related = /** @type {MouseEvent} */ (event).relatedTarget;
    if (leaving && leaving === activeTrigger && !leaving.contains(/** @type {Node} */ (related)))
      hideTooltip();
  });
  document.addEventListener("focusin", (event) => {
    const trigger = triggerOf(event);
    if (trigger) showTooltip(trigger);
  });
  document.addEventListener("focusout", (event) => {
    if (triggerOf(event) === activeTrigger) hideTooltip();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeTrigger) hideTooltip();
  });
  window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
}

export const _testUtils = {
  reset() {
    hideTooltip();
    document.getElementById(TOOLTIP_ID)?.remove();
  },
};
