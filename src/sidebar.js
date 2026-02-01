// sidebar.js
// Main sidebar container system with collapsible sections that snap together
import { SIDEBAR_ID, STATE } from "./state.js";
import { escapeHtml } from "./utils.js";

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
    <style>
      #${SIDEBAR_ID} {
        position: fixed;
        right: 10px;
        top: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
      }

      .scx-section {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        min-width: 280px;
        max-width: 350px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .scx-section.collapsed {
        min-width: 180px;
        max-width: 180px;
      }

      .scx-section:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .scx-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        border-bottom: 1px solid #f0f0f0;
        background: linear-gradient(135deg, #f5f5f5 0%, #fff 100%);
        border-top-left-radius: 7px;
        border-top-right-radius: 7px;
        cursor: pointer;
        user-select: none;
      }

      .scx-section.collapsed .scx-section-header {
        border-bottom: none;
        border-radius: 7px;
      }

      .scx-section-title {
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .scx-section-toggle {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        transition: transform 0.3s ease;
        color: #666;
      }

      .scx-section.collapsed .scx-section-toggle {
        transform: rotate(-90deg);
      }

      .scx-section-content {
        padding: 12px;
        max-height: 1000px;
        overflow: hidden;
        transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.3s ease;
        opacity: 1;
      }

      .scx-section.collapsed .scx-section-content {
        max-height: 0;
        padding: 0;
        opacity: 0;
      }

      /* Snapping effect: sections merge borders when adjacent and expanded */
      #${SIDEBAR_ID} > .scx-section {
        position: relative;
      }

      #${SIDEBAR_ID} > .scx-section + .scx-section {
        margin-top: 0;
      }

      /* When adjacent expanded sections, remove the border between them */
      #${SIDEBAR_ID} > .scx-section:not(.collapsed) + .scx-section:not(.collapsed) {
        margin-top: -1px;
        border-top: none;
      }

      #${SIDEBAR_ID} > .scx-section:not(.collapsed) + .scx-section:not(.collapsed) .scx-section-header {
        border-top: 1px solid #ddd;
      }

      /* Adjust border-radius for snapped sections */
      #${SIDEBAR_ID} > .scx-section:not(.collapsed) + .scx-section:not(.collapsed) {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
      }

      #${SIDEBAR_ID} > .scx-section:not(.collapsed) + .scx-section:not(.collapsed):last-child {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
      }

      #${SIDEBAR_ID} > .scx-section:not(.collapsed):last-child {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
      }

      /* Section-specific styles */
      .scx-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .scx-panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .scx-panel-title {
        font-weight: 600;
        color: #333;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .scx-chip {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
      }

      .scx-chip-na { background: #f0f0f0; color: #999; }
      .scx-chip-bad { background: #ffebee; color: #c62828; }
      .scx-chip-excellent { background: #e8f5e9; color: #1b5e20; }
      .scx-chip-good { background: #e3f2fd; color: #1565c0; }
      .scx-chip-meh { background: #fff3e0; color: #e65100; }

      .scx-big {
        font-size: 20px;
        font-weight: 700;
        color: #1976d2;
      }

      .scx-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        font-size: 11px;
      }

      .scx-k {
        color: #999;
        font-weight: 500;
        text-transform: uppercase;
        font-size: 9px;
        letter-spacing: 0.3px;
      }

      .scx-v {
        color: #333;
        font-weight: 600;
      }

      .scx-note {
        font-size: 10px;
        color: #666;
        background: #fafafa;
        padding: 8px;
        border-radius: 4px;
        border-left: 2px solid #ddd;
      }

      .scx-muted {
        color: #999;
        font-size: 10px;
      }

      hr {
        border: none;
        border-top: 1px solid #f0f0f0;
        margin: 8px 0;
      }
    </style>
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

  // 1. Donation Button
  ensureFooterButton(
    container,
    "scx-sidebar-footer-donate",
    "https://buy.stripe.com/5kQ8wR6QM8SidOJ8cF8IU00",
    `
      <div style="font-size: 11px; font-weight: 600; display:flex; align-items:center; gap:5px;">
         <span style="color: #e91e63; font-size: 12px;">❤</span> Support The Dev
      </div>
      <div style="font-size: 9px; color: #999; text-align: center;">Keep the updates coming ⊂(◉‿◉)つ</div>
    `
  );

  // 2. Bug Report Button
  const bugUrl = "https://github.com/mirceaman56/sim-companies-helper/issues/new?title=Bug%3A%20Short%20summary&body=%23%23%20Describe%20the%20bug%0AClear%20description%20of%20the%20problem.%0A%0A%23%23%20Steps%20to%20reproduce%0A1.%20Go%20to%20...%0A2.%20Click%20...%0A3.%20Observe%20error%0A%0A%23%23%20Expected%20behavior%0AWhat%20you%20expected%20to%20happen.%0A%0A%23%23%20Actual%20behavior%0AWhat%20actually%20happened.%0A%0A%23%23%20Code%20location%20(if%20known)%0AFile%3A%20...%0ALine%3A%20...%0A%0A%23%23%20Environment%0A-%20Browser%3A%20...%0A-%20Extension%20version%3A%20...";
  
  ensureFooterButton(
    container,
    "scx-sidebar-footer-bug",
    bugUrl,
    `
      <div style="font-size: 11px; font-weight: 600; display:flex; align-items:center; gap:5px;">
         <span style="color: #ef6c00; font-size: 12px;">🐛</span> Report a Bug
      </div>
    `
  );
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

