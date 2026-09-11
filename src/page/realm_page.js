// realm_page.js
// Reads the active realm from the navbar realm logo. The logo's file path is
// language-independent; its alt text is translated, so it is not used.

const REALM_LOGO_SELECTOR = 'img[src*="/images/realms/"]';

const REALM_LOGO_PATTERNS = [
  { pattern: /\/realms\/magnates[_.]/i, realmId: 0 },
  // The game's asset is spelled "Entrepeneurs"; accept the correct spelling too.
  { pattern: /\/realms\/entrepr?eneurs[_.]/i, realmId: 1 },
];

/**
 * @param {ParentNode} [root]
 * @returns {HTMLImageElement | null}
 */
export function findRealmLogo(root = document) {
  return root?.querySelector?.(REALM_LOGO_SELECTOR) || null;
}

/**
 * Realm currently shown by the game: 0 = Magnates, 1 = Entrepreneurs.
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
