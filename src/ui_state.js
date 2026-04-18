import { escapeHtml } from "./utils.js";

/**
 * Render consistent loading/error/success state block for sidebar widgets.
 * @param {{type: "loading"|"error"|"success", message: string, showSpinner?: boolean}} input
 * @returns {string}
 */
export function renderStateBlock(input) {
  const { type, message, showSpinner = false } = input;
  const safeType = type === "error" || type === "success" ? type : "loading";
  const live = safeType === "error" ? "assertive" : "polite";

  return `
    <div class="scx-state scx-state-${safeType}" role="status" aria-live="${live}">
      ${showSpinner ? '<span class="scx-loading-spinner" aria-hidden="true"></span>' : ""}
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}
