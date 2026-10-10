export const PALETTE_SIZE = 8;
// A shape per palette slot, so a tag never depends on telling colors apart.
export const PALETTE_SHAPES = ["●", "▲", "■", "◆", "★", "✚", "▼", "✖"];
export const PALETTE_NAME_KEYS = [
  "a11yColorOrange",
  "a11yColorSkyBlue",
  "a11yColorGreen",
  "a11yColorYellow",
  "a11yColorBlue",
  "a11yColorRed",
  "a11yColorPurple",
  "a11yColorBlack",
];
export const NICKNAME_MAX_LENGTH = 24;

/**
 * @typedef {{ product?: string, color?: number, nickname?: string }} BuildingPref
 * @typedef {{
 *   products: Record<string, number>,
 *   buildings: Record<string, BuildingPref>,
 *   producingKinds: string[],
 * }} AccessibilityPrefs
 * @typedef {{ id: string, kind: string, busy: boolean, productSlug: string | null }} BuildingSnapshot
 * @typedef {{ colorIndex: number | null, shape: string, label: string, idle: boolean }} TagModel
 */

/** @returns {AccessibilityPrefs} */
export function emptyPrefs() {
  return { products: {}, buildings: {}, producingKinds: [] };
}

/**
 * @param {unknown} raw
 * @returns {AccessibilityPrefs}
 */
export function normalizePrefs(raw) {
  const value = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  return {
    products: isObject(value.products) ? { ...value.products } : {},
    buildings: isObject(value.buildings) ? { ...value.buildings } : {},
    producingKinds: Array.isArray(value.producingKinds) ? value.producingKinds.map(String) : [],
  };
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeColorIndex(value) {
  const n = Number(value);
  return value !== null && value !== "" && Number.isInteger(n) && n >= 0 && n < PALETTE_SIZE ? n : null;
}

/**
 * Artwork slug to a readable name ("ginger-beer" -> "Ginger beer"); the game ships no
 * translated name on the map, so this is the same English name the encyclopedia uses.
 * @param {string | null | undefined} slug
 */
export function formatProductName(slug) {
  const words = String(slug || "")
    .split("-")
    .filter(Boolean)
    .join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/**
 * Remember what each building last made and give every new product the next palette slot,
 * so a building keeps its color while idle. Returns the same object when nothing changed.
 * @param {AccessibilityPrefs} prefs
 * @param {BuildingSnapshot[]} buildings
 * @returns {{ prefs: AccessibilityPrefs, changed: boolean }}
 */
export function rememberBuildings(prefs, buildings) {
  let next = prefs;
  const ensureCopy = () => {
    if (next === prefs) {
      next = {
        products: { ...prefs.products },
        buildings: { ...prefs.buildings },
        producingKinds: [...prefs.producingKinds],
      };
    }
    return next;
  };

  for (const building of buildings) {
    const slug = building.productSlug;
    if (!building.busy || !slug) continue;
    if (!(slug in next.products)) {
      const copy = ensureCopy();
      copy.products[slug] = Object.keys(copy.products).length % PALETTE_SIZE;
    }
    if (next.buildings[building.id]?.product !== slug) {
      const copy = ensureCopy();
      copy.buildings[building.id] = { ...copy.buildings[building.id], product: slug };
    }
    if (!next.producingKinds.includes(building.kind)) ensureCopy().producingKinds.push(building.kind);
  }
  return { prefs: next, changed: next !== prefs };
}

/**
 * @param {AccessibilityPrefs} prefs
 * @param {BuildingSnapshot} building
 * @returns {TagModel | null} null when there is nothing worth tagging (academy, temple, ...)
 */
export function buildTagModel(prefs, building) {
  const pref = prefs.buildings[building.id] || {};
  const product = building.productSlug || pref.product || null;
  const customColor = normalizeColorIndex(pref.color);
  const productColor = product ? normalizeColorIndex(prefs.products[product]) : null;
  const colorIndex = customColor ?? productColor;
  // Idle is only claimed for kinds seen producing or selling: academies and temples share
  // the idle markup but never run orders.
  const idle = !building.busy && (Boolean(pref.product) || prefs.producingKinds.includes(building.kind));
  const label = String(pref.nickname || "").trim() || formatProductName(product);

  if (!label && !idle && colorIndex === null) return null;
  return {
    colorIndex,
    shape: colorIndex === null ? "" : PALETTE_SHAPES[colorIndex],
    label,
    idle,
  };
}

/**
 * @param {AccessibilityPrefs} prefs
 * @param {string} buildingId
 * @param {{ color?: number | null, nickname?: string }} change `color: null` = back to auto
 * @returns {AccessibilityPrefs}
 */
export function updateBuildingPref(prefs, buildingId, change) {
  const current = { ...prefs.buildings[buildingId] };
  if ("color" in change) {
    const color = normalizeColorIndex(change.color);
    if (color === null) delete current.color;
    else current.color = color;
  }
  if ("nickname" in change) {
    const nickname = String(change.nickname || "")
      .trim()
      .slice(0, NICKNAME_MAX_LENGTH);
    if (nickname) current.nickname = nickname;
    else delete current.nickname;
  }
  return { ...prefs, buildings: { ...prefs.buildings, [buildingId]: current } };
}

/** @param {TagModel | null} model */
export function tagModelKey(model) {
  return model ? `${model.colorIndex ?? ""}|${model.idle ? 1 : 0}|${model.label}` : "";
}
