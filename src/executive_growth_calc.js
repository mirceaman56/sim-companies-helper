export const ORGANIC_GROWTH_UTC_HOUR = 14;
export const EXECUTIVE_TRAINING_DURATION_MS = 27 * 60 * 60 * 1000;

export function getNextOrganicGrowthAt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const targetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), ORGANIC_GROWTH_UTC_HOUR, 0, 0, 0),
  );

  if (nowMs > targetAt.getTime()) {
    targetAt.setUTCDate(targetAt.getUTCDate() + 1);
  }

  return targetAt;
}

export function getOrganicGrowthCountdownMs(nowMs = Date.now(), targetAt = getNextOrganicGrowthAt(nowMs)) {
  return Math.max(0, targetAt.getTime() - nowMs);
}

export function getExecutiveTrainingEndsAt(currentTraining) {
  const startedAtMs = Date.parse(currentTraining?.datetime || "");
  if (!Number.isFinite(startedAtMs)) return null;

  return new Date(startedAtMs + EXECUTIVE_TRAINING_DURATION_MS);
}

export function isExecutiveEligibleForOrganicGrowth(executive, targetAt = getNextOrganicGrowthAt()) {
  if (!executive?.currentTraining) return true;

  const trainingEndsAt = getExecutiveTrainingEndsAt(executive.currentTraining);
  if (!trainingEndsAt) return false;

  return trainingEndsAt.getTime() <= targetAt.getTime();
}

export function buildExecutiveOrganicGrowthSummary(
  executives,
  { nowMs = Date.now(), targetAt = getNextOrganicGrowthAt(nowMs) } = {},
) {
  const eligibleExecutives = [];
  const excludedExecutives = [];

  for (const executive of Array.isArray(executives) ? executives : []) {
    if (isExecutiveEligibleForOrganicGrowth(executive, targetAt)) {
      eligibleExecutives.push(executive);
    } else {
      excludedExecutives.push(executive);
    }
  }

  return {
    targetAt,
    countdownMs: getOrganicGrowthCountdownMs(nowMs, targetAt),
    eligibleExecutives,
    excludedExecutives,
  };
}

export function formatOrganicGrowthCountdown(countdownMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(countdownMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export const _testUtils = {
  ORGANIC_GROWTH_UTC_HOUR,
  EXECUTIVE_TRAINING_DURATION_MS,
};
