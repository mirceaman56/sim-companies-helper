// sidebar.js
// Main sidebar container system with collapsible sections that snap together
import { SIDEBAR_ID } from "./state.js";
import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";
import * as storage from "./data/storage.js";

const SECTIONS = new Map(); // sectionId -> { title, element, isCollapsed, updateFn, toggleFn }

const SIDEBAR_PREFS_DOMAIN = "sidebar-prefs";
const SIDEBAR_PREFS_VERSION = 1;
let sidebarHidden = false;

/**
 * Toggle sidebar visibility and persist the preference.
 */
export function toggleSidebarVisibility() {
  const el = document.getElementById(SIDEBAR_ID);
  if (!el) return;

  sidebarHidden = !sidebarHidden;
  el.classList.toggle("scx-sidebar-hidden", sidebarHidden);

  const tab = el.querySelector(".scx-sidebar-toggle-tab");
  if (tab) {
    tab.title = sidebarHidden ? `${t("showSidebar")} (Alt+H)` : `${t("hideSidebar")} (Alt+H)`;
    tab.querySelector(".scx-sidebar-toggle-tab-icon").textContent = sidebarHidden ? "◀" : "▶";
  }

  storage.set({
    domain: SIDEBAR_PREFS_DOMAIN,
    version: SIDEBAR_PREFS_VERSION,
    scope: "global",
    backend: "local",
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
  tab.title = `${t("hideSidebar")} (Alt+H)`;
  tab.innerHTML = `<span class="scx-sidebar-toggle-tab-icon">▶</span>`;
  tab.addEventListener("click", toggleSidebarVisibility);
  el.prepend(tab);

  document.documentElement.appendChild(el);

  // Restore persisted hidden state
  _restoreSidebarState(el);

  // Keyboard shortcut: Alt+H
  document.addEventListener("keydown", _onSidebarShortcut);

  return el;
}

/** @param {KeyboardEvent} e */
function _onSidebarShortcut(e) {
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
      backend: "local",
      refreshAuth: false,
    });
    if (prefs?.hidden) {
      sidebarHidden = true;
      el.classList.add("scx-sidebar-hidden");
      const tab = el.querySelector(".scx-sidebar-toggle-tab");
      if (tab) {
        tab.title = `${t("showSidebar")} (Alt+H)`;
        tab.querySelector(".scx-sidebar-toggle-tab-icon").textContent = "◀";
      }
    }
  } catch {
    // Silently ignore — default to visible
  }
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
    <div class="scx-section-header">
      <div class="scx-section-title">
        <span class="scx-section-icon">${escapeHtml(icon)}</span>
        <span>${escapeHtml(title)}</span>
      </div>
      <div class="scx-section-toggle">▼</div>
    </div>
    <div class="scx-section-content"></div>
  `;

  const header = section.querySelector(".scx-section-header");
  const toggle = section.querySelector(".scx-section-toggle");
  const content = section.querySelector(".scx-section-content");

  const toggleCollapse = () => {
    const isCollapsed = section.classList.toggle("collapsed");
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

  // 2. Bug Report Button
  const bugUrl =
    "https://github.com/mirceaman56/sim-companies-helper/issues/new?title=%5BBug%5D%20Short%20summary&body=%23%23%20Describe%20the%20bug%0AClear%20description%20of%20the%20problem.%0A%0A%23%23%20Steps%20to%20reproduce%0A1.%20Go%20to%20...%0A2.%20Click%20...%0A3.%20Observe%20error%0A%0A%23%23%20Expected%20behavior%0AWhat%20you%20expected%20to%20happen.%0A%0A%23%23%20Actual%20behavior%0AWhat%20actually%20happened.%0A%0A%23%23%20Code%20location%20(if%20known)%0AFile%3A%20...%0ALine%3A%20...%0A%0A%23%23%20Environment%0A-%20Browser%3A%20...%0A-%20Extension%20version%3A%20...";

  ensureFooterButton(
    container,
    "scx-sidebar-footer-bug",
    bugUrl,
    `
      <div class="scx-sidebar-footer-title">
         <span class="scx-sidebar-footer-bug-icon">🐛</span> ${t("reportBug")}
      </div>
    `,
  );
}

function ensureSupportCard(container) {
  if (container.querySelector(".scx-sidebar-footer-support")) return;

  const card = document.createElement("div");
  card.className = "scx-sidebar-footer-support";
  card.innerHTML = `
    <button class="scx-sidebar-footer-support-btn scx-sidebar-footer-support-paypal">
      <span>❤</span> ${t("supportTheDev")}
    </button>
    <button class="scx-sidebar-footer-support-btn scx-sidebar-footer-support-kofi">
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

function ensureFooterButton(container, className, href, innerHtml) {
  if (container.querySelector(`.${className}`)) return;

  const btn = document.createElement("div");
  btn.className = className;

  btn.innerHTML = `
    <a href="${href}" target="_blank" rel="noreferrer" class="scx-sidebar-footer-link">
      ${innerHtml}
    </a>
  `;
  container.appendChild(btn);
}

/**
 * Get the content container for a section
 */
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
