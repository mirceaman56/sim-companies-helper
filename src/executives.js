import { STATE } from "./state.js";
import { request } from "./data/apiClient.js";
import { readExecutivePageIdentity } from "./page/executive_page.js";

const EXECUTIVES_TTL_MS = 5 * 60 * 1000;

export const ROLE_POSITION_MAP = { coo: "o", cfo: "f", cmo: "m", cto: "t" };
const POSITION_ROLE_MAP = { o: "coo", f: "cfo", m: "cmo", t: "cto" };

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

export function normalizeExecutiveName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findExecutiveByName(name, { roleKey = null } = {}) {
  const normalizedName = normalizeExecutiveName(name);
  if (!normalizedName) return null;

  const matches = STATE.executives.items.filter(
    (executive) => normalizeExecutiveName(executive?.name) === normalizedName,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1 || !roleKey) return matches[0];

  const positionCode = ROLE_POSITION_MAP[roleKey];
  return matches.find((executive) => executive.currentWorkHistory?.position === positionCode) ?? matches[0];
}

export function apiSkillsToInternal(apiSkills) {
  return {
    mgmt: apiSkills?.coo ?? 0,
    acct: apiSkills?.cfo ?? 0,
    comm: apiSkills?.cmo ?? 0,
    tech: apiSkills?.cto ?? 0,
  };
}

function buildExecutiveContext(executive, detail, pageKind) {
  const executiveSkills = executive ? apiSkillsToInternal(executive.skills) : null;
  const trainingGained = detail ? computeTrainingBreakdown(detail.trainings) : null;
  const trainingSkills = trainingGained ? apiSkillsToInternal(trainingGained) : null;
  const organicSkills =
    executiveSkills && trainingSkills
      ? {
          mgmt: Math.max(0, executiveSkills.mgmt - trainingSkills.mgmt),
          acct: Math.max(0, executiveSkills.acct - trainingSkills.acct),
          comm: Math.max(0, executiveSkills.comm - trainingSkills.comm),
          tech: Math.max(0, executiveSkills.tech - trainingSkills.tech),
        }
      : null;

  return {
    executive,
    detail,
    pageKind,
    executiveSkills,
    trainingSkills,
    organicSkills,
    currentTrainingSkillKey: executive?.currentTraining
      ? getTrainingSkillKey(executive.currentTraining.training)
      : null,
  };
}

export async function resolveCurrentExecutivePageContext({
  pathname = window.location.pathname,
  root = document,
  force = false,
  skipExecutivesLoad = false,
} = {}) {
  const page = readExecutivePageIdentity(root, pathname);

  if (page.pageKind === "none") {
    return buildExecutiveContext(null, null, "none");
  }

  if (!skipExecutivesLoad) {
    await loadExecutivesOnce({ force });
  }

  let executive = findExecutiveByName(page.name, { roleKey: page.roleKey });
  if (!executive && page.pageKind === "role" && page.roleKey) {
    executive = findExecutiveByPosition(ROLE_POSITION_MAP[page.roleKey]);
  }

  if (!executive) {
    return buildExecutiveContext(null, null, page.pageKind);
  }

  await loadExecutiveDetail(executive.id, { force });
  const detail = getExecutiveDetail(executive.id);

  return buildExecutiveContext(executive, detail, page.pageKind);
}

function getExecutivesTrainingForRole(positionCode) {
  const result = [];
  for (const exec of STATE.executives.items) {
    if (!exec.currentTraining) continue;
    const position = exec.currentWorkHistory?.position;
    const trainingCode = exec.currentTraining.training;
    if (position === positionCode || trainingCode === positionCode) {
      result.push({ executive: exec, roleKey: POSITION_ROLE_MAP[positionCode] });
    }
  }
  return result;
}

export function getExecutivesTrainingForCOO() {
  return getExecutivesTrainingForRole("o");
}

export function getExecutivesTrainingForCMO() {
  return getExecutivesTrainingForRole("m");
}

export function isCOOInTraining() {
  return getExecutivesTrainingForCOO().length > 0;
}

export function getTrainingSkillKey(trainingCode) {
  return TRAINING_CODE_TO_SKILL_KEY[trainingCode] ?? null;
}
