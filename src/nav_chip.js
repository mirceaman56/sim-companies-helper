// Shared markup + behavior for navbar status chips (cash, level) and their
// detail popovers. Styling lives in src/styles/components/nav-chip.css.
import { escapeHtml } from "./utils.js";

// Minimum gap (px) kept between the bar's centered text and the chip.
const CHIP_TEXT_GAP_PX = 4;

/**
 * Chip button rendered inside a navbar bar.
 * @param {{ icon: string, amount?: string, title: string, tone: "ok"|"warn"|"info"|"loading",
 *   popoverId: string, expanded: boolean, disabled?: boolean, extraClass?: string }} input
 */
export function renderNavChip({
  icon,
  amount = "",
  title,
  tone,
  popoverId,
  expanded,
  disabled = false,
  extraClass = "",
}) {
  const classes = ["scx-navchip", `scx-navchip--${tone}`, extraClass].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button"
      title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"
      aria-controls="${escapeHtml(popoverId)}" aria-expanded="${expanded}" ${disabled ? "disabled" : ""}>
      <span class="scx-navchip-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      ${amount ? `<span class="scx-navchip-amount scx-mono">${escapeHtml(amount)}</span>` : ""}
    </button>
  `;
}

/**
 * Popover header: title, status badge, optional action buttons (pre-rendered HTML).
 */
export function renderNavPopHead({ title, badge = "", badgeTone = "info", actionsHtml = "" }) {
  return `
    <div class="scx-navpop-head">
      <span class="scx-navpop-title">${escapeHtml(title)}</span>
      <span class="scx-navpop-head-end">
        ${badge ? `<span class="scx-navpop-badge scx-navpop-badge--${badgeTone}">${escapeHtml(badge)}</span>` : ""}
        ${actionsHtml}
      </span>
    </div>
  `;
}

/**
 * Progress gauge with a caption row.
 */
export function renderNavPopGauge({ label, valueText, value, max, tone = "info" }) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), safeMax);
  return `
    <div class="scx-navpop-gauge">
      <div class="scx-navpop-gauge-caption">
        <span>${escapeHtml(label)}</span>
        <span class="scx-mono">${escapeHtml(valueText)}</span>
      </div>
      <progress class="scx-navpop-meter scx-navpop-meter--${tone}" max="${safeMax}" value="${safeValue}"></progress>
    </div>
  `;
}

/**
 * One breakdown line: optional sign column, label (+ muted sub-line), right-aligned value.
 */
export function renderNavPopLine({ sign = "", label, value, tone = "", sub = "" }) {
  const lineClass = tone ? `scx-navpop-line scx-navpop-line--${tone}` : "scx-navpop-line";
  return `
    <div class="${lineClass}">
      <span class="scx-navpop-sign scx-mono">${escapeHtml(sign)}</span>
      <span class="scx-navpop-label">
        ${escapeHtml(label)}
        ${sub ? `<span class="scx-navpop-sub">${escapeHtml(sub)}</span>` : ""}
      </span>
      <span class="scx-navpop-value scx-mono">${escapeHtml(value)}</span>
    </div>
  `;
}

/** Short plain-language explanation shown under the popover header. */
export function renderNavPopDesc(text) {
  return `<p class="scx-navpop-desc">${escapeHtml(text)}</p>`;
}

export function renderNavPopNote(text) {
  return `<div class="scx-navpop-note">${escapeHtml(text)}</div>`;
}

// The game's text element can span the whole bar with the text centered
// inside it, so measure the rendered glyphs (Range) rather than the element box.
function measureTextRight(el) {
  const range = el.ownerDocument?.createRange?.();
  if (range && typeof range.getBoundingClientRect === "function") {
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) return rect.right;
  }
  return el.getBoundingClientRect().right;
}

/**
 * Collapse the chip to its icon when its label would touch the bar's text.
 * @param {Element | null} chip
 * @param {Element | null} textEl
 */
export function fitNavChip(chip, textEl) {
  if (!chip || !textEl) return;
  chip.classList.remove("scx-navchip--icon-only");
  if (!chip.querySelector(".scx-navchip-amount")) return;

  const textRight = measureTextRight(textEl);
  const chipLeft = chip.getBoundingClientRect().left;
  if (textRight > 0 && chipLeft > 0 && textRight + CHIP_TEXT_GAP_PX > chipLeft) {
    chip.classList.add("scx-navchip--icon-only");
  }
}

/**
 * Popovers are right-aligned under their bar; flip to left-aligned when that
 * would push them past the left edge of the viewport.
 * @param {Element | null} popover
 */
export function keepNavPopOnScreen(popover) {
  if (!popover) return;
  popover.classList.remove("scx-navpop--align-left");
  if (popover.getBoundingClientRect().left < 0) {
    popover.classList.add("scx-navpop--align-left");
  }
}

/**
 * Open/close state for one chip + popover pair. Closes on outside click and Escape.
 * @param {{ containerId: string }} input
 */
export function createNavPopController({ containerId }) {
  let open = false;

  function getContainer() {
    return document.getElementById(containerId);
  }

  function apply() {
    const container = getContainer();
    if (!container) return;
    const popover = container.querySelector(".scx-navpop");
    popover?.classList.toggle("scx-hidden", !open);
    container.querySelector(".scx-navchip")?.setAttribute("aria-expanded", String(open));
    if (open) keepNavPopOnScreen(popover);
  }

  function setOpen(value) {
    open = Boolean(value);
    apply();
  }

  function onDocumentClick(e) {
    if (!open) return;
    const container = getContainer();
    if (container && !container.contains(e.target)) setOpen(false);
  }

  function onDocumentKeydown(e) {
    if (open && e.key === "Escape") setOpen(false);
  }

  return {
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    /** Re-apply open state after the container's innerHTML was replaced. */
    sync: apply,
    listen() {
      document.addEventListener("click", onDocumentClick, true);
      document.addEventListener("keydown", onDocumentKeydown);
    },
    onDocumentClick,
    onDocumentKeydown,
  };
}

export const _testUtils = { measureTextRight };
