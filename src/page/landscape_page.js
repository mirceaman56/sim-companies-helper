import { extractResourceSlug } from "./production_page.js";

// why: `test-building-<kind>` and `/b/<id>/` are test and route hooks, so they survive the
// generated css-* class churn. The kind letter is case sensitive (`Y` factory, `y` academy).
const BUILDING_SELECTOR = 'a[class*="test-building-"][href^="/b/"]';
const KIND_CLASS_RE = /(?:^|\s)test-building-(\S+)/;
const BUILDING_HREF_RE = /^\/b\/(\d+)\/?/;
// A running order or upkeep renders a countdown with a live region; idle and non-production
// buildings show name + level instead.
const TIMER_SELECTOR = "[aria-live]";
const STATUS_ICON_SELECTOR = 'img[src*="/resources/"], svg';

/**
 * @typedef {{
 *   element: HTMLAnchorElement,
 *   id: string,
 *   kind: string,
 *   busy: boolean,
 *   level: number | null,
 *   productSlug: string | null,
 *   statusEl: Element | null,
 *   labelHost: Element | null,
 * }} LandscapeBuilding
 */

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLAnchorElement[]}
 */
export function findLandscapeBuildings(root = document) {
  return [...(root?.querySelectorAll?.(BUILDING_SELECTOR) || [])];
}

/**
 * Label column under the building artwork: holds the countdown chip, or name + level when idle.
 * @param {Element} building
 * @returns {Element | null}
 */
function findStatusEl(building) {
  const timer = building.querySelector(TIMER_SELECTOR);
  if (timer) {
    let el = timer;
    while (el.parentElement && el.parentElement !== building && !el.matches("[aria-label]")) {
      el = el.parentElement;
    }
    return el.matches("[aria-label]") ? el : null;
  }
  const gameChildren = (el) => [...(el?.children || [])].filter((child) => !isOwnNode(child));
  const column = gameChildren(gameChildren(building).pop()).shift();
  const label = gameChildren(column).pop();
  return label && label.children.length > 0 ? label : null;
}

/**
 * Exact level from an idle building's label: the last span holds a short "<label> <number>"
 * ("lvl 15", "Stufe 15"). Busy buildings show a countdown there instead.
 * @param {Element | null} statusEl
 * @returns {number | null}
 */
function readIdleLevel(statusEl) {
  const last = statusEl?.lastElementChild;
  if (!last || last.children.length > 0) return null;
  const match = (last.textContent || "").trim().match(/^\D{0,20}?(\d{1,3})$/u);
  const level = match ? Number(match[1]) : NaN;
  return level >= 1 ? level : null;
}

/** Extension nodes mounted inside the building must not shift the structural lookups. */
function isOwnNode(el) {
  return [...el.classList].some((cls) => cls.startsWith("scx-"));
}

/**
 * @param {Element | null | undefined} element
 * @returns {LandscapeBuilding | null}
 */
export function readLandscapeBuilding(element) {
  if (!(element instanceof Element)) return null;
  const kind = element.className.match?.(KIND_CLASS_RE)?.[1];
  const id = element.getAttribute("href")?.match(BUILDING_HREF_RE)?.[1];
  if (!kind || !id) return null;

  const busy = Boolean(element.querySelector(TIMER_SELECTOR));
  const statusEl = findStatusEl(element);
  const hasIcon = Boolean(statusEl?.querySelector(STATUS_ICON_SELECTOR));
  return {
    element: /** @type {HTMLAnchorElement} */ (element),
    id,
    kind,
    busy,
    level: busy ? null : readIdleLevel(statusEl),
    productSlug: busy && hasIcon ? extractResourceSlug(statusEl) : null,
    statusEl,
    labelHost: statusEl?.parentElement || null,
  };
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {LandscapeBuilding[]}
 */
export function readLandscapeBuildings(root = document) {
  return findLandscapeBuildings(root)
    .map(readLandscapeBuilding)
    .filter((building) => building !== null);
}

/**
 * Building id from a building route (`/b/123/`, `/b/123/production/16/`).
 * @param {string} pathname
 * @returns {string | null}
 */
export function readBuildingIdFromPath(pathname) {
  // Non-English sessions prefix routes with the language ("/de/b/<id>/").
  const path = String(pathname || "").replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/b\/)/, "");
  return path.match(BUILDING_HREF_RE)?.[1] || null;
}
