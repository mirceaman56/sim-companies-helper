import { observeDocumentBody, onRouteChange } from "./page/page_utils.js";
import { readBuildingIdFromPath } from "./page/landscape_page.js";
import {
  readBuildingLevel,
  readBuildingProductRates,
  readBuildingWagesPerHour,
} from "./page/production_page.js";

/**
 * Report what a building page shows (level, header wages, per-product output), once per change.
 * @param {(buildingId: string, reading: import("./resource_needs_calc.js").PageReading) => void} onReading
 * @returns {() => void}
 */
export function startRateCapture(onReading) {
  let lastKey = "";
  const read = () => {
    const path = location.pathname;
    const buildingId = readBuildingIdFromPath(path);
    if (!buildingId) return;
    const reading = {
      level: readBuildingLevel(document),
      wagesPerHour: readBuildingWagesPerHour(document),
      rates: readBuildingProductRates(document),
    };
    if (reading.wagesPerHour === null && reading.rates.length === 0) return;
    const key = `${buildingId}:${JSON.stringify(reading)}`;
    if (key === lastKey) return;
    lastKey = key;
    onReading(buildingId, reading);
  };

  const stopObserver = observeDocumentBody(read);
  const stopRoutes = onRouteChange(read);
  read();
  return () => {
    stopObserver();
    stopRoutes();
  };
}
