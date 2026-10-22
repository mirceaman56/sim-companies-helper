import { observeDocumentBody, onRouteChange } from "./page/page_utils.js";
import { readBuildingIdFromPath } from "./page/landscape_page.js";
import {
  readBuildingLevel,
  readBuildingProductRates,
  readBuildingWagesPerHour,
} from "./page/production_page.js";
import { findProductTiles, readProductTile } from "./page/production_tiles_page.js";
import { logStep } from "./resource_needs_log.js";

/**
 * Report what a building page shows (level, header wages, products on offer, per-product
 * output), once per change.
 * @param {(buildingId: string, reading: import("./resource_needs_calc.js").PageReading) => void} onReading
 * @returns {() => void}
 */
export function startRateCapture(onReading) {
  let lastKey = "";
  let lastEmptyPath = "";
  const read = () => {
    const path = location.pathname;
    const buildingId = readBuildingIdFromPath(path);
    if (!buildingId) return;
    const reading = {
      level: readBuildingLevel(document),
      wagesPerHour: readBuildingWagesPerHour(document),
      offers: findProductTiles(document)
        .map((tile) => readProductTile(tile)?.resourceId)
        .filter((id) => typeof id === "number" && id > 0),
      rates: readBuildingProductRates(document),
    };
    if (reading.wagesPerHour === null && reading.offers.length === 0 && reading.rates.length === 0) {
      if (lastEmptyPath !== path) logStep(`building page ${buildingId}: nothing readable yet`, { path });
      lastEmptyPath = path;
      return;
    }
    const key = `${buildingId}:${JSON.stringify(reading)}`;
    if (key === lastKey) return;
    lastKey = key;
    logStep(`building page ${buildingId} collected`, { path, ...reading });
    onReading(buildingId, reading);
  };

  logStep("building page reader started", { path: location.pathname });
  const stopObserver = observeDocumentBody(read);
  const stopRoutes = onRouteChange(read);
  read();
  return () => {
    stopObserver();
    stopRoutes();
  };
}
