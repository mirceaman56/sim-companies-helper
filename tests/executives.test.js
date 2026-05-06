// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("../src/data/apiClient.js", () => ({
  request: requestMock,
}));

vi.mock("../src/state.js", () => {
  const STATE = {
    auth: { companyId: 12345, realmId: 0, loaded: true, loading: false, error: null },
    executives: {
      loaded: false,
      loading: false,
      error: null,
      items: [],
      lastRefreshAt: 0,
      details: {},
    },
  };
  return { STATE };
});

import { STATE } from "../src/state.js";
import {
  apiSkillsToInternal,
  computeTrainingBreakdown,
  findExecutiveByPosition,
  findExecutiveByName,
  getExecutiveDetail,
  getExecutivePrimaryRoleKeys,
  getExecutivesTrainingForCMO,
  getExecutivesTrainingForCOO,
  getTrainingSkillKey,
  isCOOInTraining,
  loadExecutiveDetail,
  loadExecutivesOnce,
  normalizeExecutiveName,
  resolveCurrentExecutivePageContext,
} from "../src/executives.js";

const SAMPLE_EXECUTIVES = [
  {
    id: 1,
    name: "Zhi Maruyama",
    skills: { coo: 27, cfo: 2, cmo: 4, cto: 7 },
    currentWorkHistory: { position: "o" },
    currentTraining: null,
  },
  {
    id: 2,
    name: "Donna James",
    skills: { coo: 3, cfo: 54, cmo: 2, cto: 8 },
    currentWorkHistory: { position: "f" },
    currentTraining: null,
  },
  {
    id: 3,
    name: "Brianna Myers",
    skills: { coo: 2, cfo: 2, cmo: 3, cto: 6 },
    currentWorkHistory: { position: "t" },
    currentTraining: { training: "t" },
  },
];

describe("apiSkillsToInternal", () => {
  it("maps API skill keys to internal keys", () => {
    expect(apiSkillsToInternal({ coo: 27, cfo: 2, cmo: 4, cto: 7 })).toEqual({
      mgmt: 27,
      acct: 2,
      comm: 4,
      tech: 7,
    });
  });

  it("defaults missing skills to 0", () => {
    expect(apiSkillsToInternal({})).toEqual({ mgmt: 0, acct: 0, comm: 0, tech: 0 });
  });

  it("handles null input", () => {
    expect(apiSkillsToInternal(null)).toEqual({ mgmt: 0, acct: 0, comm: 0, tech: 0 });
  });
});

describe("getExecutivePrimaryRoleKeys", () => {
  it("returns the role with the highest skill", () => {
    expect(getExecutivePrimaryRoleKeys({ coo: 3, cfo: 7, cmo: 1, cto: 2 })).toEqual(["cfo"]);
  });

  it("returns every tied top role in stable order", () => {
    expect(getExecutivePrimaryRoleKeys({ coo: 3, cfo: 7, cmo: 7, cto: 2 })).toEqual(["cfo", "cmo"]);
  });

  it("returns empty when all skills are zero or missing", () => {
    expect(getExecutivePrimaryRoleKeys({ coo: 0, cfo: 0, cmo: 0, cto: 0 })).toEqual([]);
    expect(getExecutivePrimaryRoleKeys(null)).toEqual([]);
  });
});

describe("computeTrainingBreakdown", () => {
  it("returns zeros when trainings is empty", () => {
    expect(computeTrainingBreakdown([])).toEqual({ coo: 0, cfo: 0, cmo: 0, cto: 0 });
  });

  it("returns zeros for null input", () => {
    expect(computeTrainingBreakdown(null)).toEqual({ coo: 0, cfo: 0, cmo: 0, cto: 0 });
  });

  it("sums skills across all training entries", () => {
    const trainings = [
      { skills: { coo: 1, cfo: 0, cmo: 2, cto: 0 } },
      { skills: { coo: 0, cfo: 1, cmo: 1, cto: 0 } },
      { skills: { coo: 0, cfo: 0, cmo: 0, cto: 1 } },
    ];
    expect(computeTrainingBreakdown(trainings)).toEqual({ coo: 1, cfo: 1, cmo: 3, cto: 1 });
  });

  it("handles entries with missing skills object", () => {
    const trainings = [{ skills: { cmo: 2 } }, {}];
    expect(computeTrainingBreakdown(trainings)).toEqual({ coo: 0, cfo: 0, cmo: 2, cto: 0 });
  });
});

describe("getTrainingSkillKey", () => {
  it.each([
    ["o", "mgmt"],
    ["f", "acct"],
    ["m", "comm"],
    ["t", "tech"],
  ])("maps training code %s to skill key %s", (code, key) => {
    expect(getTrainingSkillKey(code)).toBe(key);
  });

  it("returns null for unknown codes", () => {
    expect(getTrainingSkillKey("v")).toBeNull();
    expect(getTrainingSkillKey(null)).toBeNull();
  });
});

describe("findExecutiveByPosition", () => {
  beforeEach(() => {
    STATE.executives.items = SAMPLE_EXECUTIVES;
  });

  it("finds the executive assigned to the given position", () => {
    const coo = findExecutiveByPosition("o");
    expect(coo?.name).toBe("Zhi Maruyama");

    const cfo = findExecutiveByPosition("f");
    expect(cfo?.name).toBe("Donna James");
  });

  it("returns null when no executive matches", () => {
    expect(findExecutiveByPosition("m")).toBeNull();
  });
});

describe("findExecutiveByName", () => {
  beforeEach(() => {
    STATE.executives.items = SAMPLE_EXECUTIVES;
  });

  it("matches executives by normalized name", () => {
    expect(findExecutiveByName("  zhi   maruyama ")).toEqual(SAMPLE_EXECUTIVES[0]);
  });

  it("returns null when no name matches", () => {
    expect(findExecutiveByName("No Match")).toBeNull();
  });
});

describe("normalizeExecutiveName", () => {
  it("normalizes case and spacing", () => {
    expect(normalizeExecutiveName("  Daniel   Phillips ")).toBe("daniel phillips");
  });
});

describe("getExecutivesTrainingForCOO", () => {
  beforeEach(() => {
    STATE.executives.items = [];
  });

  it("returns empty when no executives have active training", () => {
    STATE.executives.items = SAMPLE_EXECUTIVES;
    expect(getExecutivesTrainingForCOO()).toEqual([]);
  });

  it("includes COO (position 'o') in any active training", () => {
    STATE.executives.items = [{ ...SAMPLE_EXECUTIVES[0], currentTraining: { training: "f" } }];
    const result = getExecutivesTrainingForCOO();
    expect(result).toHaveLength(1);
    expect(result[0].roleKey).toBe("coo");
    expect(result[0].executive.name).toBe("Zhi Maruyama");
  });

  it("includes non-COO exec training COO skill as apprenticeCoo", () => {
    STATE.executives.items = [
      {
        id: 99,
        name: "Daniel Phillips",
        currentWorkHistory: { position: "v" },
        currentTraining: { training: "o" },
      },
    ];
    const result = getExecutivesTrainingForCOO();
    expect(result).toHaveLength(1);
    expect(result[0].roleKey).toBe("coo");
    expect(result[0].executive.name).toBe("Daniel Phillips");
  });

  it("does not include non-COO exec training a different skill", () => {
    STATE.executives.items = [
      {
        id: 3,
        name: "Brianna Myers",
        currentWorkHistory: { position: "t" },
        currentTraining: { training: "t" },
      },
    ];
    expect(getExecutivesTrainingForCOO()).toEqual([]);
  });
});

describe("getExecutivesTrainingForCMO", () => {
  beforeEach(() => {
    STATE.executives.items = [];
  });

  it("includes CMO (position 'm') in any active training", () => {
    STATE.executives.items = [
      {
        id: 4,
        name: "Zuri Jones",
        currentWorkHistory: { position: "m" },
        currentTraining: { training: "m" },
      },
    ];
    const result = getExecutivesTrainingForCMO();
    expect(result).toHaveLength(1);
    expect(result[0].roleKey).toBe("cmo");
  });

  it("includes non-CMO exec training CMO skill as apprenticeCmo", () => {
    STATE.executives.items = [
      { id: 5, name: "Amy White", currentWorkHistory: { position: "v" }, currentTraining: { training: "m" } },
    ];
    const result = getExecutivesTrainingForCMO();
    expect(result).toHaveLength(1);
    expect(result[0].roleKey).toBe("cmo");
  });

  it("returns empty when no training affects CMO", () => {
    STATE.executives.items = SAMPLE_EXECUTIVES;
    expect(getExecutivesTrainingForCMO()).toEqual([]);
  });
});

describe("isCOOInTraining", () => {
  beforeEach(() => {
    STATE.executives.items = [];
  });

  it("returns false when no COO is assigned", () => {
    expect(isCOOInTraining()).toBe(false);
  });

  it("returns false when COO has no active training", () => {
    STATE.executives.items = [SAMPLE_EXECUTIVES[0]];
    expect(isCOOInTraining()).toBe(false);
  });

  it("returns true when COO has active training", () => {
    STATE.executives.items = [{ ...SAMPLE_EXECUTIVES[0], currentTraining: { training: "o" } }];
    expect(isCOOInTraining()).toBe(true);
  });

  it("returns true when an apprentice COO is in training", () => {
    STATE.executives.items = [
      {
        id: 99,
        name: "Apprentice",
        currentWorkHistory: { position: "v" },
        currentTraining: { training: "o" },
      },
    ];
    expect(isCOOInTraining()).toBe(true);
  });
});

describe("loadExecutivesOnce", () => {
  beforeEach(() => {
    STATE.executives.loaded = false;
    STATE.executives.loading = false;
    STATE.executives.error = null;
    STATE.executives.items = [];
    STATE.executives.lastRefreshAt = 0;
    requestMock.mockReset();
  });

  it("fetches executives and updates STATE on success", async () => {
    requestMock.mockResolvedValue({ executives: SAMPLE_EXECUTIVES });

    await loadExecutivesOnce();

    expect(requestMock).toHaveBeenCalledOnce();
    expect(requestMock.mock.calls[0][0]).toBe("executives");
    expect(requestMock.mock.calls[0][1].url).toContain("12345");
    expect(STATE.executives.items).toHaveLength(3);
    expect(STATE.executives.loaded).toBe(true);
    expect(STATE.executives.error).toBeNull();
    expect(STATE.executives.loading).toBe(false);
  });

  it("skips fetch if data is fresh and not forced", async () => {
    STATE.executives.loaded = true;
    STATE.executives.lastRefreshAt = Date.now();

    await loadExecutivesOnce();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("re-fetches when force=true even if data is fresh", async () => {
    STATE.executives.loaded = true;
    STATE.executives.lastRefreshAt = Date.now();
    requestMock.mockResolvedValue({ executives: [] });

    await loadExecutivesOnce({ force: true });

    expect(requestMock).toHaveBeenCalledOnce();
  });

  it("sets error state on API failure", async () => {
    requestMock.mockRejectedValue(new Error("network error"));

    await loadExecutivesOnce();

    expect(STATE.executives.error).toContain("network error");
    expect(STATE.executives.loaded).toBe(false);
    expect(STATE.executives.loading).toBe(false);
  });

  it("skips fetch if no companyId is available", async () => {
    STATE.auth.companyId = null;

    await loadExecutivesOnce();

    expect(requestMock).not.toHaveBeenCalled();

    STATE.auth.companyId = 12345;
  });
});

describe("loadExecutiveDetail", () => {
  const EXEC_ID = 7534868;
  const SAMPLE_DETAIL = {
    id: EXEC_ID,
    name: "Amy White",
    skills: { coo: 2, cfo: 3, cmo: 28, cto: 4 },
    trainings: [
      { skills: { coo: 0, cfo: 0, cmo: 1, cto: 0 } },
      { skills: { coo: 1, cfo: 0, cmo: 1, cto: 0 } },
    ],
  };

  beforeEach(() => {
    STATE.executives.details = {};
    requestMock.mockReset();
  });

  it("fetches detail and stores in STATE.executives.details", async () => {
    requestMock.mockResolvedValue(SAMPLE_DETAIL);

    await loadExecutiveDetail(EXEC_ID);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(requestMock.mock.calls[0][1].url).toContain(String(EXEC_ID));
    const slot = STATE.executives.details[EXEC_ID];
    expect(slot.loaded).toBe(true);
    expect(slot.data).toEqual(SAMPLE_DETAIL);
    expect(slot.error).toBeNull();
    expect(slot.loading).toBe(false);
  });

  it("skips fetch if detail is fresh and not forced", async () => {
    STATE.executives.details[EXEC_ID] = {
      loaded: true,
      loading: false,
      error: null,
      data: SAMPLE_DETAIL,
      lastRefreshAt: Date.now(),
    };

    await loadExecutiveDetail(EXEC_ID);

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("re-fetches when force=true even if detail is fresh", async () => {
    STATE.executives.details[EXEC_ID] = {
      loaded: true,
      loading: false,
      error: null,
      data: SAMPLE_DETAIL,
      lastRefreshAt: Date.now(),
    };
    requestMock.mockResolvedValue(SAMPLE_DETAIL);

    await loadExecutiveDetail(EXEC_ID, { force: true });

    expect(requestMock).toHaveBeenCalledOnce();
  });

  it("sets error state on API failure", async () => {
    requestMock.mockRejectedValue(new Error("detail fetch failed"));

    await loadExecutiveDetail(EXEC_ID);

    const slot = STATE.executives.details[EXEC_ID];
    expect(slot.error).toContain("detail fetch failed");
    expect(slot.loaded).toBe(false);
    expect(slot.loading).toBe(false);
  });
});

describe("getExecutiveDetail", () => {
  it("returns null when no detail slot exists", () => {
    STATE.executives.details = {};
    expect(getExecutiveDetail(999)).toBeNull();
  });

  it("returns null when slot has no data", () => {
    STATE.executives.details[999] = {
      loaded: false,
      loading: false,
      error: null,
      data: null,
      lastRefreshAt: 0,
    };
    expect(getExecutiveDetail(999)).toBeNull();
  });

  it("returns data when slot is populated", () => {
    const data = { id: 1, name: "Test" };
    STATE.executives.details[1] = {
      loaded: true,
      loading: false,
      error: null,
      data,
      lastRefreshAt: Date.now(),
    };
    expect(getExecutiveDetail(1)).toEqual(data);
  });
});

describe("resolveCurrentExecutivePageContext", () => {
  beforeEach(() => {
    STATE.executives.items = [
      {
        id: 1,
        name: "Main COO",
        skills: { coo: 28, cfo: 2, cmo: 4, cto: 7 },
        currentWorkHistory: { position: "o" },
        currentTraining: null,
      },
      {
        id: 2,
        name: "Daniel Phillips",
        skills: { coo: 18, cfo: 0, cmo: 3, cto: 1 },
        currentWorkHistory: { position: "v" },
        currentTraining: { training: "o" },
      },
      {
        id: 12,
        name: "Staff Exec",
        skills: { coo: 4, cfo: 3, cmo: 2, cto: 11 },
        currentWorkHistory: { position: "t" },
        currentTraining: null,
      },
    ];
    STATE.executives.loaded = true;
    STATE.executives.lastRefreshAt = Date.now();
    STATE.executives.details = {
      1: { loaded: true, loading: false, error: null, data: { trainings: [] }, lastRefreshAt: Date.now() },
      2: {
        loaded: true,
        loading: false,
        error: null,
        data: { trainings: [{ skills: { coo: 5, cfo: 0, cmo: 0, cto: 0 } }] },
        lastRefreshAt: Date.now(),
      },
      12: {
        loaded: true,
        loading: false,
        error: null,
        data: { trainings: [{ skills: { coo: 0, cfo: 0, cmo: 0, cto: 2 } }] },
        lastRefreshAt: Date.now(),
      },
    };
    requestMock.mockReset();
  });

  it("matches apprentice pages by DOM name instead of role fallback", async () => {
    document.body.innerHTML = `
      <div id="page">
        <h1>Daniel Phillips</h1>
        <div>COO APPRENTICE</div>
      </div>
    `;

    const context = await resolveCurrentExecutivePageContext({
      pathname: "/headquarters/executives/coo-apprentice/",
      root: document,
    });

    expect(context.pageKind).toBe("apprentice");
    expect(context.executive?.id).toBe(2);
    expect(context.executiveSkills).toEqual({ mgmt: 18, acct: 0, comm: 3, tech: 1 });
    expect(context.trainingSkills).toEqual({ mgmt: 5, acct: 0, comm: 0, tech: 0 });
    expect(context.organicSkills).toEqual({ mgmt: 13, acct: 0, comm: 3, tech: 1 });
  });

  it("uses role fallback only on main executive pages when DOM name is missing", async () => {
    document.body.innerHTML = `<div id="page"><div>COO</div></div>`;

    const context = await resolveCurrentExecutivePageContext({
      pathname: "/headquarters/executives/coo/",
      root: document,
    });

    expect(context.pageKind).toBe("role");
    expect(context.executive?.id).toBe(1);
  });

  it("does not use numeric route fallback on staff pages", async () => {
    document.body.innerHTML = `<div id="page"><div>STAFF</div></div>`;

    const context = await resolveCurrentExecutivePageContext({
      pathname: "/headquarters/executives/g12/",
      root: document,
    });

    expect(context.pageKind).toBe("staff");
    expect(context.executive).toBeNull();
    expect(context.executiveSkills).toBeNull();
  });

  it("matches staff pages by DOM name and loads the correct detail slot", async () => {
    document.body.innerHTML = `
      <div id="page">
        <h1>Staff Exec</h1>
        <div>STAFF EXECUTIVE</div>
      </div>
    `;

    const context = await resolveCurrentExecutivePageContext({
      pathname: "/headquarters/executives/g12/",
      root: document,
    });

    expect(context.executive?.id).toBe(12);
    expect(context.trainingSkills).toEqual({ mgmt: 0, acct: 0, comm: 0, tech: 2 });
    expect(context.currentTrainingSkillKey).toBeNull();
  });
});
