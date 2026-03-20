// xp_calc.js
// Pure calculation logic for XP estimation

/** XP per hour for a normal operating building */
export const XP_PER_HOUR_BUILDING = 12;

/** XP per hour per level for recreation buildings */
export const XP_PER_HOUR_PER_LEVEL_RECREATION = 40;

/** XP per hour for new construction / prospecting */
export const XP_PER_HOUR_CONSTRUCTION = 36.5;

/** Hours in one week (recreation building cycle) */
export const HOURS_PER_WEEK = 168;

/** Building kinds that are prospecting slots at level 1 */
const PROSPECTING_KINDS = new Set(["Q", "M"]);

/** Category for recreation/other buildings */
const CATEGORY_OTHER = "other";

/** Patterns in image path that identify recreation buildings */
const RECREATION_PATTERNS = ["park", "castle", "lake"];

/**
 * Determine if a building is a recreation building (Park, Castle, Lake)
 * based on category and image name.
 * @param {object} building
 * @returns {boolean}
 */
export function isRecreationBuilding(building) {
  if (building.category !== CATEGORY_OTHER) return false;
  const img = (building.image || "").toLowerCase();
  return RECREATION_PATTERNS.some((p) => img.includes(p));
}

/**
 * Determine if a building is a prospecting slot
 * (Quarry/Mine at level 1).
 * @param {object} building
 * @returns {boolean}
 */
export function isProspectingSlot(building) {
  return PROSPECTING_KINDS.has(building.kind) && building.size === 1;
}

/**
 * Determine if a building is currently busy (operating/producing/selling/upgrading/constructing).
 * @param {object} building
 * @returns {boolean}
 */
export function isBuildingBusy(building) {
  return !!building.busy;
}

/**
 * Determine if a building is currently upgrading.
 * Upgrading buildings have busy.expanding === true.
 * @param {object} building
 * @returns {boolean}
 */
export function isBuildingUpgrading(building) {
  return !!building.busy?.expanding;
}

/**
 * Calculate XP per hour for a single building based on its type.
 * Buildings from the v3 API have no busy state — all are assumed to be active.
 * @param {object} building - Building object from the API
 * @returns {number} XP per hour
 */
export function buildingXpPerHour(building) {
  // Recreation buildings (Park, Castle, Lake) at level >= 3
  if (isRecreationBuilding(building)) {
    const level = building.size || 0;
    if (level >= 3) return XP_PER_HOUR_PER_LEVEL_RECREATION * level;
    // Lower level recreation buildings earn normal building XP
    return XP_PER_HOUR_BUILDING;
  }

  // Prospecting slots (Quarry/Mine at level 1)
  if (isProspectingSlot(building)) return XP_PER_HOUR_CONSTRUCTION;

  // Normal operating building
  return XP_PER_HOUR_BUILDING;
}

/**
 * Calculate total XP per hour for all buildings.
 * @param {object[]} buildings - Array of building objects
 * @returns {{ totalXpPerHour: number, breakdown: object }}
 */
export function calculateTotalXpPerHour(buildings) {
  let totalXpPerHour = 0;
  let operatingCount = 0;
  let recreationXp = 0;
  let prospectingCount = 0;

  for (const b of buildings) {
    const xph = buildingXpPerHour(b);
    totalXpPerHour += xph;

    if (isRecreationBuilding(b)) {
      recreationXp += xph;
    } else if (isProspectingSlot(b)) {
      prospectingCount++;
    } else {
      operatingCount++;
    }
  }

  return {
    totalXpPerHour,
    breakdown: {
      operatingCount,
      recreationXp,
      prospectingCount,
    },
  };
}

/**
 * Calculate hours remaining until next level.
 * @param {number} currentXp - Current experience points
 * @param {number} xpForNextLevel - XP needed for next level
 * @param {number} xpPerHour - Current XP earning rate per hour
 * @returns {number|null} Hours remaining, or null if xpPerHour is 0
 */
export function hoursToNextLevel(currentXp, xpForNextLevel, xpPerHour) {
  if (xpPerHour <= 0) return null;
  const remaining = xpForNextLevel - currentXp;
  if (remaining <= 0) return 0;
  return remaining / xpPerHour;
}

/**
 * Format hours into a human-readable string.
 * @param {number|null} hours
 * @returns {string} e.g. "3d 5h", "12h", "< 1h"
 */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours <= 0) return "< 1h";
  if (hours < 1) return "< 1h";
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (days > 0) return `${days}d ${h}h`;
  return `${h}h`;
}

// Export for testing
export const _testUtils = {
  isRecreationBuilding,
  isProspectingSlot,
  isBuildingBusy,
  isBuildingUpgrading,
  buildingXpPerHour,
  calculateTotalXpPerHour,
  hoursToNextLevel,
  formatHours,
};
