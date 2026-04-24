import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";

const EXECUTIVES_TTL_MS = 5 * 60 * 1000;

export const ROLE_POSITION_MAP = { coo: "o", cfo: "f", cmo: "m", cto: "t" };

const TRAINING_CODE_TO_SKILL_KEY = { o: "mgmt", f: "acct", m: "comm", t: "tech" };

export async function loadExecutivesOnce({ force = false } = {}) {
  if (STATE.executives.loading) return;
  if (!force && STATE.executives.loaded && Date.now() - STATE.executives.lastRefreshAt < EXECUTIVES_TTL_MS)
    return;

  const companyId = STATE.auth?.companyId;
  if (!companyId) return;

  STATE.executives.loading = true;
  STATE.executives.error = null;

  try {
    const data = await request("executives", {
      url: `https://www.simcompanies.com/api/v3/companies/${companyId}/executives/`,
      credentials: "include",
      responseType: "json",
      retries: 1,
      retryDelayMs: 250,
      coalesce: true,
    });
    STATE.executives.items = Array.isArray(data?.executives) ? data.executives : [];
    STATE.executives.loaded = true;
    STATE.executives.lastRefreshAt = Date.now();
  } catch (e) {
    STATE.executives.error = String(e?.message || e);
  } finally {
    STATE.executives.loading = false;
  }
}

export async function loadExecutiveDetail(executiveId, { force = false } = {}) {
  const slot = STATE.executives.details[executiveId] ?? {
    loaded: false,
    loading: false,
    error: null,
    data: null,
    lastRefreshAt: 0,
  };
  STATE.executives.details[executiveId] = slot;

  if (slot.loading) return;
  if (!force && slot.loaded && Date.now() - slot.lastRefreshAt < EXECUTIVES_TTL_MS) return;

  slot.loading = true;
  slot.error = null;

  try {
    const data = await request(`executive-detail-${executiveId}`, {
      url: `https://www.simcompanies.com/api/v4/executives/${executiveId}/`,
      credentials: "include",
      responseType: "json",
      retries: 1,
      retryDelayMs: 250,
      coalesce: true,
    });
    slot.data = data ?? null;
    slot.loaded = true;
    slot.lastRefreshAt = Date.now();
  } catch (e) {
    slot.error = String(e?.message || e);
  } finally {
    slot.loading = false;
  }
}

export function getExecutiveDetail(executiveId) {
  return STATE.executives.details[executiveId]?.data ?? null;
}

export function computeTrainingBreakdown(trainings) {
  if (!Array.isArray(trainings) || trainings.length === 0) {
    return { coo: 0, cfo: 0, cmo: 0, cto: 0 };
  }
  return trainings.reduce(
    (acc, tr) => {
      const s = tr.skills || {};
      return {
        coo: acc.coo + (s.coo || 0),
        cfo: acc.cfo + (s.cfo || 0),
        cmo: acc.cmo + (s.cmo || 0),
        cto: acc.cto + (s.cto || 0),
      };
    },
    { coo: 0, cfo: 0, cmo: 0, cto: 0 },
  );
}

export function findExecutiveByPosition(positionCode) {
  return STATE.executives.items.find((ex) => ex.currentWorkHistory?.position === positionCode) ?? null;
}

export function apiSkillsToInternal(apiSkills) {
  return {
    mgmt: apiSkills?.coo ?? 0,
    acct: apiSkills?.cfo ?? 0,
    comm: apiSkills?.cmo ?? 0,
    tech: apiSkills?.cto ?? 0,
  };
}

// Returns [{executive, roleKey}] for any exec whose training affects COO effectiveness.
// roleKey: "coo" (position "o" in any training) | "apprenticeCoo" (non-COO training "o" skill)
export function getExecutivesTrainingForCOO() {
  const result = [];
  for (const exec of STATE.executives.items) {
    if (!exec.currentTraining) continue;
    const position = exec.currentWorkHistory?.position;
    const trainingCode = exec.currentTraining.training;
    if (position === "o") {
      result.push({ executive: exec, roleKey: "coo" });
    } else if (trainingCode === "o") {
      result.push({ executive: exec, roleKey: "apprenticeCoo" });
    }
  }
  return result;
}

// Returns [{executive, roleKey}] for any exec whose training affects CMO effectiveness.
// roleKey: "cmo" (position "m" in any training) | "apprenticeCmo" (non-CMO training "m" skill)
export function getExecutivesTrainingForCMO() {
  const result = [];
  for (const exec of STATE.executives.items) {
    if (!exec.currentTraining) continue;
    const position = exec.currentWorkHistory?.position;
    const trainingCode = exec.currentTraining.training;
    if (position === "m") {
      result.push({ executive: exec, roleKey: "cmo" });
    } else if (trainingCode === "m") {
      result.push({ executive: exec, roleKey: "apprenticeCmo" });
    }
  }
  return result;
}

export function isCOOInTraining() {
  return getExecutivesTrainingForCOO().length > 0;
}

export function getTrainingSkillKey(trainingCode) {
  return TRAINING_CODE_TO_SKILL_KEY[trainingCode] ?? null;
}
