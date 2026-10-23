// Reads the active realm from the navbar realm logo. The logo's file path is
// language-independent; its alt text is translated, so it is not used.
import { observeDocumentBody } from "./page_utils.js";

const REALM_LOGO_SELECTOR = 'img[src*="/images/realms/"]';
const REALM_ASSET_PATTERN = /\/realms\/([^/_.]+)[_.]/i;

const REALM_LOGO_PATTERNS = [
  { pattern: /\/realms\/magnates[_.]/i, realmId: 0 },
  // The game's asset is spelled "Entrepeneurs"; accept the correct spelling too.
  { pattern: /\/realms\/entrepr?eneurs[_.]/i, realmId: 1 },
  { pattern: /\/realms\/challenge[_.]/i, realmId: 2 },
];

/**
 * @param {ParentNode} [root]
 * @returns {HTMLImageElement | null}
 */
export function findRealmLogo(root = document) {
  return root?.querySelector?.(REALM_LOGO_SELECTOR) || null;
}

/**
 * Realm currently shown by the game: 0 = Magnates, 1 = Entrepreneurs, 2 = Challenge.
 * @param {ParentNode} [root]
 * @returns {number | null} null when no known realm logo is on the page.
 */
export function readActiveRealmId(root = document) {
  const src = findRealmLogo(root)?.getAttribute("src") || "";
  for (const { pattern, realmId } of REALM_LOGO_PATTERNS) {
    if (pattern.test(src)) return realmId;
  }
  return null;
}

/**
 * Lower-cased asset name of the realm logo (e.g. "challenge"), also for realms not mapped above,
 * so a switch to a realm added by the game later is still noticed.
 * @param {ParentNode} [root]
 * @returns {string | null} null when the page has no realm logo.
 */
export function readRealmLogoAsset(root = document) {
  const src = findRealmLogo(root)?.getAttribute("src") || "";
  const match = REALM_ASSET_PATTERN.exec(src);
  return match ? match[1].toLowerCase() : null;
}

/**
 * @param {Document} root
 * @param {() => void} onChange
 * @returns {() => void}
 */
export function observeRealmLogo(root, onChange) {
  return observeDocumentBody(onChange, { root });
}
