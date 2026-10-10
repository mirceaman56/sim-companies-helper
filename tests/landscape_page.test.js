// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  findLandscapeBuildings,
  readBuildingIdFromPath,
  readLandscapeBuilding,
  readLandscapeBuildings,
} from "../src/page/landscape_page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", "landscape", file), "utf8");

const byId = (buildings) => Object.fromEntries(buildings.map((b) => [b.id, b]));

describe("landscape page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds only company buildings, not HQ or the exchange", () => {
    document.body.innerHTML = fixture("producing.html");
    const ids = findLandscapeBuildings(document).map((a) => a.getAttribute("href"));
    expect(ids).toEqual(["/b/1001/", "/b/1002/", "/b/1003/", "/b/1004/", "/b/1005/", "/b/1006/"]);
  });

  it("reads kind, busy state and product from producing buildings", () => {
    document.body.innerHTML = fixture("producing.html");
    const buildings = byId(readLandscapeBuildings(document));

    expect(buildings["1001"]).toMatchObject({ kind: "M", busy: true, productSlug: "minerals" });
    expect(buildings["1004"]).toMatchObject({ kind: "Y", busy: true, productSlug: "chemicals" });
    expect(buildings["1005"]).toMatchObject({ kind: "Y", busy: true, productSlug: "silicon" });
    expect(buildings["1004"].statusEl.getAttribute("aria-label")).toContain("Factory");
    expect(buildings["1004"].labelHost.contains(buildings["1004"].statusEl)).toBe(true);
  });

  it("an upgrading building is busy without a product (the boost chip image is not a resource)", () => {
    document.body.innerHTML = fixture("producing.html");
    const upgrading = byId(readLandscapeBuildings(document))["1003"];
    expect(upgrading).toMatchObject({ kind: "Y", busy: true, productSlug: null });
    expect(upgrading.statusEl).not.toBeNull();
  });

  it("idle and non-production buildings share one shape; kind tells them apart", () => {
    document.body.innerHTML = fixture("idle.html");
    const buildings = byId(readLandscapeBuildings(document));

    expect(buildings["2006"]).toMatchObject({ kind: "G", busy: false, productSlug: null });
    expect(buildings["2005"]).toMatchObject({ kind: "y", busy: false, productSlug: null });
    expect(buildings["2006"].statusEl.children).toHaveLength(2);
    expect(buildings["2006"].labelHost.contains(buildings["2006"].statusEl)).toBe(true);
  });

  it("upkeep (temple) is busy with an icon but no product", () => {
    document.body.innerHTML = fixture("idle.html");
    expect(byId(readLandscapeBuildings(document))["2004"]).toMatchObject({
      kind: "3",
      busy: true,
      productSlug: null,
    });
  });

  it("retail stores report the product being sold", () => {
    document.body.innerHTML = fixture("idle.html");
    const buildings = byId(readLandscapeBuildings(document));
    expect(buildings["2003"].productSlug).toBe("ginger-beer");
    expect(buildings["2002"]).toMatchObject({ kind: "C", productSlug: "quadcopter" });
  });

  it("extension nodes appended inside a building do not change the idle lookup", () => {
    document.body.innerHTML = fixture("idle.html");
    const idle = byId(readLandscapeBuildings(document))["2006"];
    const tag = document.createElement("span");
    tag.className = "scx-a11y-tag";
    idle.labelHost.appendChild(tag);

    const again = readLandscapeBuilding(idle.element);
    expect(again.statusEl).toBe(idle.statusEl);
  });

  it("rejects elements that are not building links", () => {
    const div = document.createElement("div");
    expect(readLandscapeBuilding(div)).toBeNull();
    expect(readLandscapeBuilding(null)).toBeNull();
    const hq = document.createElement("a");
    hq.className = "test-building-Y";
    hq.setAttribute("href", "/headquarters/");
    expect(readLandscapeBuilding(hq)).toBeNull();
  });

  it("returns nothing on pages without a landscape", () => {
    document.body.innerHTML = "<main><a href='/b/1/'>Building</a></main>";
    expect(readLandscapeBuildings(document)).toEqual([]);
  });

  it("reads the building id from building routes", () => {
    expect(readBuildingIdFromPath("/b/51683583/")).toBe("51683583");
    expect(readBuildingIdFromPath("/b/51683583/production/16/")).toBe("51683583");
    expect(readBuildingIdFromPath("/landscape/")).toBeNull();
    expect(readBuildingIdFromPath("")).toBeNull();
  });
});
