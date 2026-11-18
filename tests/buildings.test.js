// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeStorage } from "./helpers/storage_mocks.js";

const request = vi.fn();
vi.mock("../src/data/apiClient.js", () => ({ request: (...args) => request(...args) }));

describe("building list with exact levels from game pages", () => {
  let STATE;
  let loadBuildings;
  let recordBuildingLevels;

  beforeEach(async () => {
    vi.resetModules();
    installChromeStorage();
    ({ STATE } = await import("../src/state.js"));
    const { setScopeProvider } = await import("../src/data/scope.js");
    STATE.auth.companyId = 42;
    STATE.auth.realmId = 0;
    setScopeProvider({ getContext: () => STATE.auth, refresh: async () => {} });
    ({ loadBuildings, recordBuildingLevels } = await import("../src/buildings.js"));
    request.mockResolvedValue({
      infrastructure: {
        buildings: [
          { id: 7, kind: "n", size: 10 },
          { id: 8, kind: "y", size: 15 },
        ],
      },
    });
  });

  it("lays a level seen on the map over the rounded API level", async () => {
    await loadBuildings({ force: true });
    expect(STATE.buildings.items.find((b) => b.id === 7).size).toBe(10);

    await expect(recordBuildingLevels([{ id: "7", level: 15 }])).resolves.toBe(true);
    expect(STATE.buildings.items.find((b) => b.id === 7).size).toBe(15);
    expect(STATE.buildings.apiItems.find((b) => b.id === 7).size).toBe(10);

    await expect(recordBuildingLevels([{ id: "7", level: 15 }])).resolves.toBe(false);
  });

  it("keeps exact levels across a fresh API load", async () => {
    await loadBuildings({ force: true });
    await recordBuildingLevels([{ id: "7", level: 15 }]);
    await loadBuildings({ force: true });
    expect(STATE.buildings.items.find((b) => b.id === 7).size).toBe(15);
  });

  it("a level equal to the API level changes nothing shown", async () => {
    await loadBuildings({ force: true });
    await expect(recordBuildingLevels([{ id: "8", level: 15 }])).resolves.toBe(false);
  });
});
