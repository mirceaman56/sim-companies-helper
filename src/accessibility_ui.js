import { addSidebarTopbarControl } from "./sidebar.js";
import { onRouteChange } from "./page/page_utils.js";
import {
  getAccessibilityMode,
  initAccessibilitySettings,
  onAccessibilityModeChange,
  setAccessibilityEnabled,
} from "./accessibility_settings.js";
import { startMapTags, stopMapTags } from "./accessibility_map.js";
import { startHighContrast, stopHighContrast } from "./accessibility_contrast.js";
import { updateAccessibilityPanel } from "./accessibility_panel.js";
import { installFloatingTooltips } from "./floating_tooltip.js";
import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";

const SWITCH_ID = "scx-a11y-switch";

function createSwitch() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = SWITCH_ID;
  button.className = "scx-a11y-switch";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", "false");
  button.setAttribute("aria-label", t("a11yToggleFull"));
  button.title = t("a11yToggleFull");
  button.innerHTML = `
    <span class="scx-a11y-switch-text">${escapeHtml(t("a11yToggleShort"))}</span>
    <span class="scx-a11y-switch-track" aria-hidden="true"><span class="scx-a11y-switch-knob"></span></span>
  `;
  button.addEventListener("click", () => {
    setAccessibilityEnabled(!getAccessibilityMode().enabled);
  });
  return button;
}

/** @param {import("./accessibility_settings.js").AccessibilityMode} mode */
function applyMode(mode) {
  document.getElementById(SWITCH_ID)?.setAttribute("aria-checked", String(mode.enabled));

  if (mode.enabled) startMapTags();
  else stopMapTags();
  if (mode.contrast) startHighContrast();
  else stopHighContrast();
  updateAccessibilityPanel(mode);
}

export async function initAccessibility() {
  installFloatingTooltips();
  addSidebarTopbarControl(createSwitch());
  onAccessibilityModeChange(applyMode);
  onRouteChange(() => updateAccessibilityPanel(getAccessibilityMode()));
  await initAccessibilitySettings();
}
