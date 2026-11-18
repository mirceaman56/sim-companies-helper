import { observeDocumentBody, onRouteChange } from "./page/page_utils.js";
import { readBuildingIdFromPath, readLandscapeBuildings } from "./page/landscape_page.js";
import { readBuildingLevel } from "./page/production_page.js";
import { recordBuildingLevels } from "./buildings.js";

/** @returns {import("./building_levels_calc.js").LevelReading[]} */
function readVisibleLevels() {
  const readings = readLandscapeBuildings(document)
    .filter((building) => building.level !== null)
    .map(({ id, level }) => ({ id, level }));
  const pageBuildingId = readBuildingIdFromPath(location.pathname);
  if (pageBuildingId) readings.push({ id: pageBuildingId, level: readBuildingLevel(document) });
  return readings;
}

/**
 * Keep exact building levels from the map and building pages; `onChange` runs when one changes
 * what the building list shows.
 * @param {{ onChange: () => void }} options
 * @returns {() => void}
 */
export function initBuildingLevelCapture({ onChange }) {
  let lastKey = "";
  const read = () => {
    const readings = readVisibleLevels().filter((reading) => reading.level !== null);
    const key = JSON.stringify(readings);
    if (readings.length === 0 || key === lastKey) return;
    lastKey = key;
    recordBuildingLevels(readings)
      .then((changed) => {
        if (changed) onChange();
      })
      .catch((error) => console.warn("[SimHelper] Building level capture failed:", error));
  };

  const stopObserver = observeDocumentBody(read);
  const stopRoutes = onRouteChange(read);
  read();
  return () => {
    stopObserver();
    stopRoutes();
  };
}
