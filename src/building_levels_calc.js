// why: the company profile API reports building levels rounded down to the level where the
// building art changes (bank 15 -> 10, grocery 29 -> 15). The game's exact list needs signed
// requests, so exact levels are read from the map and building pages and laid over the API list.

/**
 * @typedef {{ level: number, at: number }} KnownLevel
 * @typedef {Record<string, KnownLevel>} KnownLevels
 * @typedef {{ id: string | number, level: number | null | undefined }} LevelReading
 */

function positiveLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Fold page readings into the remembered levels.
 * @param {KnownLevels | null | undefined} known
 * @param {LevelReading[]} readings
 * @param {number} [now]
 * @returns {{ known: KnownLevels, changed: boolean }}
 */
export function mergeKnownLevels(known, readings, now = Date.now()) {
  const next = { ...(known || {}) };
  let changed = false;
  for (const reading of readings || []) {
    const id = String(reading?.id ?? "");
    const level = positiveLevel(reading?.level);
    if (!id || level === null) continue;
    if (next[id]?.level === level) continue;
    next[id] = { level, at: now };
    changed = true;
  }
  return { known: next, changed };
}

/**
 * API buildings with exact levels where a page showed them. The API level is a lower bound, so
 * a remembered level below it is stale (upgraded past the next art step) and is ignored.
 * @template {{ id?: unknown, size?: unknown }} B
 * @param {B[]} buildings
 * @param {KnownLevels | null | undefined} known
 * @returns {B[]}
 */
export function applyKnownLevels(buildings, known) {
  if (!Array.isArray(buildings)) return [];
  if (!known) return buildings;
  return buildings.map((building) => {
    const exact = positiveLevel(known[String(building?.id ?? "")]?.level);
    const apiLevel = Number(building?.size) || 0;
    if (exact === null || exact <= apiLevel) return building;
    return { ...building, size: exact };
  });
}

/**
 * Keep remembered levels only for buildings still in the company list.
 * @param {KnownLevels | null | undefined} known
 * @param {{ id?: unknown }[]} buildings
 * @returns {KnownLevels}
 */
export function pruneKnownLevels(known, buildings) {
  const ids = new Set((Array.isArray(buildings) ? buildings : []).map((b) => String(b?.id ?? "")));
  return Object.fromEntries(Object.entries(known || {}).filter(([id]) => ids.has(id)));
}
