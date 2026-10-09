// Mirrors the game's client logic: base = net bonds + cash - executives' lift; the daily fee
// applies marginal brackets to the base above the $3M free threshold.

export const ACCOUNTING_FREE_THRESHOLD = 3_000_000;
export const BOND_UNIT_VALUE = 5_000;

// Lift per effective CFO skill point, plus the bank bonus per bank level.
export const LIFT_PER_SKILL_POINT = 500_000;
export const BANK_LIFT_PER_LEVEL = 50_000;

// Effective-skill diminishing returns (game constants E0 / gQ).
const SKILL_SOFT_CAP = 60;
const SKILL_HARD_CAP = 80;

// Executives settle into a new position for 3h; training lasts 27h.
const SETTLE_IN_MS = 3 * 60 * 60 * 1000;
const TRAINING_MS = 27 * 60 * 60 * 1000;

// Academy levels required per apprentice slot (COO 5, CFO 10, ...).
const ACADEMY_LEVELS_PER_APPRENTICE = 5;

const BUILDING_KIND_BANK = "n";
const BUILDING_KIND_ACADEMY = "y";

const MAIN_POSITIONS = new Set(["o", "f", "m", "t"]);
const APPRENTICE_POSITIONS = { v: "coo", x: "cfo", y: "cmo", z: "cto" };
const ROLE_MAIN_POSITION = { coo: "o", cfo: "f", cmo: "m", cto: "t" };
const APPRENTICE_ACADEMY_MULTIPLIER = { v: 1, x: 2, y: 3, z: 4 };

/**
 * Marginal brackets. `upTo` is the upper bound of the accounting base for the slice.
 */
export const ACCOUNTING_BRACKETS = [
  { upTo: 3_000_000, rate: 0 },
  { upTo: 6_000_000, rate: 0.005 },
  { upTo: 9_000_000, rate: 0.01 },
  { upTo: 12_000_000, rate: 0.015 },
  { upTo: 15_000_000, rate: 0.02 },
  { upTo: Infinity, rate: 0.03 },
];

function toMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function isBuildingInactive(building) {
  if (building?.busy || building?.purchasedRecently) return true;
  const position = building?.position;
  return typeof position === "string" && position.startsWith("l");
}

/**
 * Sum of active academy levels (all academies combined).
 * @param {object[]} buildings
 */
export function getActiveAcademyLevels(buildings) {
  return (Array.isArray(buildings) ? buildings : [])
    .filter((b) => b?.kind === BUILDING_KIND_ACADEMY && !isBuildingInactive(b))
    .reduce((sum, b) => sum + (Number(b.size) || 0), 0);
}

/**
 * Level of the first active bank, or 0 when there is none.
 * @param {object[]} buildings
 */
export function getActiveBankLevel(buildings) {
  const bank = (Array.isArray(buildings) ? buildings : []).find(
    (b) => b?.kind === BUILDING_KIND_BANK && !isBuildingInactive(b),
  );
  return bank ? Number(bank.size) || 0 : 0;
}

/**
 * Executives currently contributing to the company: main or apprentice
 * positions, not settling in, not training, not on strike, and apprentices
 * only when their slot is unlocked by academy levels.
 * @param {object[]} executives
 * @param {{ nowMs?: number, academyLevels?: number }} [options]
 */
export function getContributingExecutives(executives, { nowMs = Date.now(), academyLevels = 0 } = {}) {
  return (Array.isArray(executives) ? executives : []).filter((ex) => {
    const position = ex?.currentWorkHistory?.position;
    const isMain = MAIN_POSITIONS.has(position);
    const isApprentice = position in APPRENTICE_POSITIONS;
    if (!isMain && !isApprentice) return false;
    if (ex.isCandidate) return false;

    const startMs = toMs(ex.currentWorkHistory?.start);
    if (startMs !== null && !ex.currentWorkHistory?.accelerated && nowMs - startMs < SETTLE_IN_MS)
      return false;

    const trainingMs =
      ex.currentTraining && !ex.currentTraining.accelerated ? toMs(ex.currentTraining.datetime) : null;
    if (trainingMs !== null && trainingMs > nowMs - TRAINING_MS) return false;

    const strikeUntilMs = toMs(ex.strikeUntil);
    if (strikeUntilMs !== null && strikeUntilMs > nowMs) return false;

    if (isApprentice) {
      return academyLevels >= ACADEMY_LEVELS_PER_APPRENTICE * APPRENTICE_ACADEMY_MULTIPLIER[position];
    }
    return true;
  });
}

/**
 * Raw skill points for a role: chief counts fully, the role's apprentice
 * counts half, other chiefs count a quarter, other apprentices not at all.
 * @param {object[]} executives contributing executives
 * @param {"coo"|"cfo"|"cmo"|"cto"} roleKey
 */
export function getRawRoleSkill(executives, roleKey) {
  const total = (Array.isArray(executives) ? executives : []).reduce((sum, ex) => {
    const skill = Number(ex?.skills?.[roleKey]) || 0;
    const position = ex?.currentWorkHistory?.position;
    if (position === ROLE_MAIN_POSITION[roleKey]) return sum + skill;
    if (APPRENTICE_POSITIONS[position] === roleKey) return sum + skill / 2;
    if (MAIN_POSITIONS.has(position)) return sum + skill / 4;
    return sum;
  }, 0);
  return Math.floor(total);
}

/**
 * Apply diminishing returns: points above 60 count half, above 80 a quarter.
 * @param {number} rawSkill
 */
export function applySkillDiminishingReturns(rawSkill) {
  let value = rawSkill;
  if (value > SKILL_HARD_CAP) value = SKILL_HARD_CAP + (value - SKILL_HARD_CAP) / 2;
  if (value > SKILL_SOFT_CAP) value = SKILL_SOFT_CAP + (value - SKILL_SOFT_CAP) / 2;
  return Math.floor(value);
}

/**
 * Executives' lift: how far the CFO team moves the free threshold up.
 * @param {object[]} executives
 * @param {object[]} buildings
 * @param {{ nowMs?: number }} [options]
 */
export function computeExecutiveLift(executives, buildings, { nowMs = Date.now() } = {}) {
  const academyLevels = getActiveAcademyLevels(buildings);
  const contributing = getContributingExecutives(executives, { nowMs, academyLevels });
  const effectiveSkill = applySkillDiminishingReturns(getRawRoleSkill(contributing, "cfo"));
  const bankLevel = getActiveBankLevel(buildings);
  const lift = effectiveSkill * (LIFT_PER_SKILL_POINT + bankLevel * BANK_LIFT_PER_LEVEL);
  return { lift, effectiveSkill, bankLevel };
}

function sumBondValue(bonds) {
  return (Array.isArray(bonds) ? bonds : []).reduce(
    (sum, bond) => sum + (Number(bond?.amount) || 0) * BOND_UNIT_VALUE,
    0,
  );
}

/**
 * Net bonds = value of bonds owned (purchased) - value of bonds sold (issued).
 * @param {object[]} owned
 * @param {object[]} sold
 */
export function computeNetBonds(owned, sold) {
  return sumBondValue(owned) - sumBondValue(sold);
}

/**
 * Daily accounting fee for a given accounting base (marginal brackets).
 * @param {number} base
 */
export function computeAccountingFee(base) {
  if (!Number.isFinite(base) || base <= 0) return 0;
  let fee = 0;
  let lower = 0;
  for (const { upTo, rate } of ACCOUNTING_BRACKETS) {
    if (base <= lower) break;
    fee += (Math.min(base, upTo) - lower) * rate;
    lower = upTo;
  }
  return Math.ceil(fee);
}

/**
 * Highest bracket rate reached by the accounting base.
 * @param {number} base
 */
export function getMarginalRate(base) {
  let lower = 0;
  for (const { upTo, rate } of ACCOUNTING_BRACKETS) {
    if (base <= upTo) return base > lower ? rate : 0;
    lower = upTo;
  }
  return ACCOUNTING_BRACKETS[ACCOUNTING_BRACKETS.length - 1].rate;
}

/**
 * @param {{ cash: number, netBonds?: number, lift?: number }} input
 */
export function buildAccountingSummary({ cash, netBonds = 0, lift = 0 }) {
  const base = cash + netBonds - lift;
  const freeThreshold = ACCOUNTING_FREE_THRESHOLD + lift;
  const fee = computeAccountingFee(base);
  return {
    cash,
    netBonds,
    lift,
    base,
    freeThreshold,
    headroom: ACCOUNTING_FREE_THRESHOLD - base,
    fee,
    marginalRate: getMarginalRate(base),
    isOverThreshold: fee > 0,
  };
}
