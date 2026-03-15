// sidebar.js
// Main sidebar container system with collapsible sections that snap together
import { SIDEBAR_ID } from "./state.js";
import { escapeHtml } from "./utils.js";
import { t } from "./i18n.js";

const SECTIONS = new Map(); // sectionId -> { title, element, isCollapsed, updateFn }

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

  document.documentElement.appendChild(el);
  return el;
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
        <span style="font-size: 14px;">${escapeHtml(icon)}</span>
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
      <div style="font-size: 11px; font-weight: 600; display:flex; align-items:center; gap:5px;">
         <span style="color: #ef6c00; font-size: 12px;">🐛</span> ${t("reportBug")}
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
  btn.style.cssText = `
    width: 180px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-top: 4px;
    box-sizing: border-box;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
    overflow: hidden;
  `;

  btn.onmouseenter = () => {
    btn.style.transform = "translateY(-2px)";
    btn.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
  };
  btn.onmouseleave = () => {
    btn.style.transform = "translateY(0)";
    btn.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
  };

  btn.innerHTML = `
    <a href="${href}" target="_blank" style="text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; color: #555; gap: 2px;">
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
