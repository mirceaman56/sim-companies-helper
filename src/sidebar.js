// Main sidebar container system with collapsible sections that snap together
import { SIDEBAR_ID } from "./state.js";
import { escapeHtml } from "./utils.js";
import { t, getHtmlLang } from "./i18n.js";
import * as storage from "./data/storage.js";

const SECTIONS = new Map(); // sectionId -> { title, element, isCollapsed, updateFn, toggleFn }

const SIDEBAR_PREFS_DOMAIN = "sidebar-prefs";
const SIDEBAR_PREFS_VERSION = 1;
let sidebarHidden = false;
// On <html> so the left sidebar hides together with this one.
const SIDEBARS_HIDDEN_CLASS = "scx-sidebars-hidden";

export function toggleSidebarVisibility() {
  const el = document.getElementById(SIDEBAR_ID);
  if (!el) return;

  sidebarHidden = !sidebarHidden;
  el.classList.toggle("scx-sidebar-hidden", sidebarHidden);
  document.documentElement.classList.toggle(SIDEBARS_HIDDEN_CLASS, sidebarHidden);

  const tab = el.querySelector(".scx-sidebar-toggle-tab");
  if (tab) {
    tab.title = sidebarHidden ? `${t("showSidebar")} (Alt+H)` : `${t("hideSidebar")} (Alt+H)`; // i18n-ignore
    tab.querySelector(".scx-sidebar-toggle-tab-icon").textContent = sidebarHidden ? "◀" : "▶";
  }

  storage.set({
    domain: SIDEBAR_PREFS_DOMAIN,
    version: SIDEBAR_PREFS_VERSION,
    scope: "global",
    backend: "chrome",
    refreshAuth: false,
    data: { hidden: sidebarHidden },
  });
}

/**
 * Creates the main sidebar container (if not exists)
 */
export function ensureSidebarContainer() {
  let el = document.getElementById(SIDEBAR_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = SIDEBAR_ID;
  el.className = "scx-sidebar-container";
  el.innerHTML = `
    <!-- Sidebar sections will be added here dynamically -->
  `;

  // Toggle tab — always visible, allows hiding/showing the sidebar
  const tab = document.createElement("button");
  tab.className = "scx-sidebar-toggle-tab";
  tab.type = "button";
  tab.title = `${t("hideSidebar")} (Alt+H)`; // i18n-ignore
  tab.innerHTML = `<span class="scx-sidebar-toggle-tab-icon">▶</span>`;
  tab.addEventListener("click", toggleSidebarVisibility);

  // The top bar stays visible when the sidebar is hidden; features add controls to it.
  const topbar = document.createElement("div");
  topbar.className = "scx-sidebar-topbar";
  topbar.appendChild(tab);
  el.prepend(topbar);

  document.documentElement.appendChild(el);

  _restoreSidebarState(el);

  // Keyboard shortcut: Alt+H
  document.addEventListener("keydown", _onSidebarShortcut);

  return el;
}

/** @param {KeyboardEvent} e */
function _onSidebarShortcut(e) {
  // Alt+H types a character on some layouts (macOS "˙"): leave text fields alone.
  const target = e.target;
  const editing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
  if (editing) return;
  if (e.altKey && (e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    toggleSidebarVisibility();
  }
}

async function _restoreSidebarState(el) {
  try {
    const prefs = await storage.get({
      domain: SIDEBAR_PREFS_DOMAIN,
      version: SIDEBAR_PREFS_VERSION,
      scope: "global",
      backend: "chrome",
      refreshAuth: false,
    });
    if (prefs?.hidden) {
      sidebarHidden = true;
      el.classList.add("scx-sidebar-hidden");
      document.documentElement.classList.add(SIDEBARS_HIDDEN_CLASS);
      const tab = el.querySelector(".scx-sidebar-toggle-tab");
      if (tab) {
        tab.title = `${t("showSidebar")} (Alt+H)`; // i18n-ignore
        tab.querySelector(".scx-sidebar-toggle-tab-icon").textContent = "◀";
      }
    }
  } catch {
    // Silently ignore — default to visible
  }
}

/**
 * Put a control in the top bar, left of the hide/show tab.
 * @param {HTMLElement} control
 * @returns {HTMLElement | null} the top bar
 */
export function addSidebarTopbarControl(control) {
  const topbar = ensureSidebarContainer().querySelector(".scx-sidebar-topbar");
  topbar?.prepend(control);
  return topbar;
}

const TITLE_WORD_LENGTH_SM = 14;
const TITLE_WORD_LENGTH_XS = 18;

/**
 * why: titles wrap on spaces, so only one long word overflows the collapsed width (German /
 * Czech compounds such as "Einzelhandelshelfer").
 * @param {string} title
 * @returns {string} size class, empty when the base size fits
 */
export function getSectionTitleSizeClass(title) {
  const longestWord = String(title || "")
    .split(/\s+/)
    .reduce((longest, word) => Math.max(longest, word.length), 0);

  if (longestWord >= TITLE_WORD_LENGTH_XS) return "scx-section-title-xs";
  if (longestWord >= TITLE_WORD_LENGTH_SM) return "scx-section-title-sm";
  return "";
}

/**
 * Register a new collapsible section in the sidebar
 */
export function registerSection(sectionId, title, icon = "◆") {
  const container = ensureSidebarContainer();

  const section = document.createElement("div");
  section.className = "scx-section collapsed";
  section.dataset.sectionId = sectionId;
  section.innerHTML = `
    <div class="scx-section-header" role="button" tabindex="0" aria-expanded="false" aria-controls="scx-section-content-${escapeHtml(sectionId)}">
      <div class="scx-section-title ${getSectionTitleSizeClass(title)}">
        <span class="scx-section-icon">${escapeHtml(icon)}</span>
        <span class="scx-section-title-text" lang="${escapeHtml(getHtmlLang())}">${escapeHtml(title)}</span>
      </div>
      <div class="scx-section-toggle" aria-hidden="true">▼</div>
    </div>
    <div class="scx-section-content" id="scx-section-content-${escapeHtml(sectionId)}"></div>
  `;

  const header = section.querySelector(".scx-section-header");
  const toggle = section.querySelector(".scx-section-toggle");
  const content = section.querySelector(".scx-section-content");

  const toggleCollapse = () => {
    const isCollapsed = section.classList.toggle("collapsed");
    header.setAttribute("aria-expanded", String(!isCollapsed));
    const sectionData = SECTIONS.get(sectionId);
    if (sectionData) {
      sectionData.isCollapsed = isCollapsed;
      if (sectionData.updateFn && !isCollapsed) {
        sectionData.updateFn();
      }
      if (sectionData.toggleFn) {
        try {
          sectionData.toggleFn(isCollapsed);
        } catch {}
      }
    }
  };

  header.addEventListener("click", toggleCollapse);
  header.addEventListener("keydown", (e) => {
    if (e.target !== header || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggleCollapse();
  });

  container.appendChild(section);

  SECTIONS.set(sectionId, {
    title,
    element: section,
    content,
    header,
    toggle,
    isCollapsed: true,
    updateFn: null,
    toggleFn: null,
  });

  return section;
}

/**
 * Add a footer to the sidebar
 */
export function ensureFooter() {
  const container = ensureSidebarContainer();

  // 1. Combined support card (PayPal + Ko-fi)
  ensureSupportCard(container);

  // 2. Combined feedback card (bug report + feature request)
  ensureFeedbackCard(container);
}

const BUG_REPORT_URL =
  "https://github.com/mirceaman56/sim-companies-helper/issues/new?title=%5BBUG%5D%20Short%20summary&body=%23%23%20Describe%20the%20bug%0AClear%20description%20of%20the%20problem.%0A%0A%23%23%20Steps%20to%20reproduce%0A1.%20Go%20to%20...%0A2.%20Click%20...%0A3.%20Observe%20error%0A%0A%23%23%20Expected%20behavior%0AWhat%20you%20expected%20to%20happen.%0A%0A%23%23%20Actual%20behavior%0AWhat%20actually%20happened.%0A%0A%23%23%20Code%20location%20(if%20known)%0AFile%3A%20...%0ALine%3A%20...%0A%0A%23%23%20Environment%0A-%20Browser%3A%20...%0A-%20Extension%20version%3A%20...";

// why: most players filing ideas are not developers, so the template asks
// plain questions instead of user-story / acceptance-criteria jargon.
const FEATURE_REQUEST_BODY = `## What would you like the extension to do?
Describe your idea in your own words.

## How would it help you?
What would it make easier, faster or clearer in the game?

## Where in the game?
Which page or screen (e.g. warehouse, market, contracts, production, retail).

## Anything else? (optional)
Screenshots, examples or a rough sketch are welcome.`;

function buildFeatureRequestUrl() {
  const title = encodeURIComponent("[FEATURE] Short summary of your idea");
  const body = encodeURIComponent(FEATURE_REQUEST_BODY);
  return `https://github.com/mirceaman56/sim-companies-helper/issues/new?title=${title}&body=${body}`;
}

function ensureSupportCard(container) {
  if (container.querySelector(".scx-sidebar-footer-support")) return;

  const card = document.createElement("div");
  card.className = "scx-sidebar-footer-support";
  card.innerHTML = `
    <button type="button" class="scx-sidebar-footer-support-btn scx-sidebar-footer-support-paypal">
      <span>❤</span> ${t("supportTheDev")}
    </button>
    <button type="button" class="scx-sidebar-footer-support-btn scx-sidebar-footer-support-kofi">
      <span>☕</span> ${t("supportOnKofi")}
    </button>
  `;

  card.querySelector(".scx-sidebar-footer-support-paypal").addEventListener("click", () => {
    window.open("https://www.paypal.com/ncp/payment/4JT8U4WKDXMD6", "_blank");
  });
  card.querySelector(".scx-sidebar-footer-support-kofi").addEventListener("click", () => {
    window.open("https://ko-fi.com/miman", "_blank");
  });

  container.appendChild(card);
}

function ensureFeedbackCard(container) {
  if (container.querySelector(".scx-sidebar-footer-feedback")) return;

  const card = document.createElement("div");
  card.className = "scx-sidebar-footer-feedback";
  card.innerHTML = `
    <a href="${BUG_REPORT_URL}" target="_blank" rel="noreferrer" class="scx-sidebar-footer-support-btn scx-sidebar-footer-feedback-link">
      <span class="scx-sidebar-footer-bug-icon">🐛</span> ${t("reportBug")}
    </a>
    <a href="${buildFeatureRequestUrl()}" target="_blank" rel="noreferrer" class="scx-sidebar-footer-support-btn scx-sidebar-footer-feedback-link">
      <span class="scx-sidebar-footer-feature-icon">💡</span> ${t("suggestFeature")}
    </a>
  `;
  container.appendChild(card);
}

export function getSectionContent(sectionId) {
  const section = SECTIONS.get(sectionId);
  return section ? section.content : null;
}

/**
 * Set the update function for a section (called when expanded)
 */
export function setSectionUpdateFn(sectionId, updateFn) {
  const section = SECTIONS.get(sectionId);
  if (section) {
    section.updateFn = updateFn;

    // If section is currently expanded, update immediately
    if (!section.isCollapsed) {
      try {
        updateFn();
      } catch {}
    }
  }
}

export function setSectionToggleFn(sectionId, toggleFn) {
  const section = SECTIONS.get(sectionId);
  if (section) {
    section.toggleFn = toggleFn;
  }
}

/** @internal — exposed for unit tests only */
export const _testUtils = {
  get sidebarHidden() {
    return sidebarHidden;
  },
  set sidebarHidden(v) {
    sidebarHidden = v;
  },
  _onSidebarShortcut,
  _restoreSidebarState,
  SECTIONS,
};
