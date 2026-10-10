// A second column on the left edge for panels that would crowd the right sidebar. It exists
// only while some feature has a panel in it.
export const LEFT_SIDEBAR_ID = "scx-left-sidebar";

/** @returns {HTMLElement} */
export function ensureLeftSidebar() {
  let el = document.getElementById(LEFT_SIDEBAR_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = LEFT_SIDEBAR_ID;
  el.className = "scx-left-sidebar";
  document.documentElement.appendChild(el);
  return el;
}

/**
 * @param {HTMLElement} panel needs a unique id
 * @returns {HTMLElement}
 */
export function mountLeftSidebarPanel(panel) {
  const sidebar = ensureLeftSidebar();
  if (panel.parentElement !== sidebar) sidebar.appendChild(panel);
  return panel;
}

/** @param {string} panelId */
export function removeLeftSidebarPanel(panelId) {
  const sidebar = document.getElementById(LEFT_SIDEBAR_ID);
  sidebar?.querySelector(`#${panelId}`)?.remove();
  if (sidebar && sidebar.children.length === 0) sidebar.remove();
}
