import { stringSimilarity } from "string-similarity-js";
import hrBlurpData from "./resources/hr_blurp.json";
import { t } from "./i18n.js";
import { getSectionContent } from "./sidebar.js";
import { COPY_BUTTON_SVG, escapeHtml, wireCopyButton } from "./utils.js";
import { getExecutivePageKind, isExecutivePath, readExecutiveHRFeedback } from "./page/executive_page.js";
import {
  loadExecutivesOnce,
  loadExecutiveDetail,
  getExecutiveDetail,
  computeTrainingBreakdown,
  findExecutiveByPosition,
  apiSkillsToInternal,
  getTrainingSkillKey,
  ROLE_POSITION_MAP,
} from "./executives.js";
import { loadAuthDataOnce } from "./auth.js";

const SECTION_ID = "executive-section";
const REFRESH_BUTTON_ID = "scx-executive-refresh-btn";
const SIMILARITY_THRESHOLD = 0.7;
const SKILL_KEYS = ["mgmt", "acct", "comm", "tech"];
const SKILL_LABELS = {
  mgmt: "Management",
  acct: "Accounting",
  comm: "Communication",
  tech: "Technology",
};

function getSkillLabel(skillKey) {
  const labelMap = {
    mgmt: "management",
    acct: "accounting",
    comm: "communication",
    tech: "technology",
  };
  return t(labelMap[skillKey]) || SKILL_LABELS[skillKey];
}

function calculateSimilarity(a, b) {
  const left = String(a).toLowerCase().trim();
  const right = String(b).toLowerCase().trim();

  if (!left || !right) return 0;
  if (left === right) return 1;

  return stringSimilarity(left, right);
}

function findBestMatchingEntry(feedbackText) {
  if (!feedbackText) return null;

  let bestMatch = null;
  let bestScore = SIMILARITY_THRESHOLD;

  for (const entry of hrBlurpData) {
    const originalFeedback = entry.en?.originalFeedback || "";
    const score = calculateSimilarity(feedbackText, originalFeedback);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

function getSkillAssessment(skillValue) {
  if (skillValue >= 1.4) {
    return { toneClass: "scx-tone-success", textClass: "scx-text-positive", label: t("keeper") };
  }
  if (skillValue >= 1.3) {
    return { toneClass: "scx-tone-warning", textClass: "scx-text-warning-strong", label: t("works") };
  }
  return { toneClass: "scx-tone-error", textClass: "scx-text-negative", label: t("garbage") };
}

function createPanelHeaderHTML() {
  return `
    <div class="scx-flex-spaced scx-margin-bottom-6">
      <div class="scx-panel-title">${t("executiveHelper")}</div>
      <div class="scx-executive-actions">
        <button class="scx-copy-btn" data-copy-action="executive" data-tooltip="${t("copyText")}" type="button">
          ${COPY_BUTTON_SVG}
        </button>
      </div>
    </div>
  `;
}

function createRefreshRowHTML() {
  return `
    <div class="scx-executive-refresh-row">
      <button id="${REFRESH_BUTTON_ID}" class="scx-btn scx-btn-primary scx-text-xs" type="button">
        ${t("executiveRefresh")}
      </button>
    </div>
  `;
}

function createSkillElementHTML(skillKey, skillValue) {
  const assessment = getSkillAssessment(skillValue);

  return `
    <div class="scx-hr-blurp-skill-item scx-tone-surface ${assessment.toneClass}">
      <div class="scx-hr-blurp-skill-label">${escapeHtml(getSkillLabel(skillKey))}</div>
      <div class="scx-hr-blurp-skill-value ${assessment.textClass}">${skillValue.toFixed(2)}</div>
      <div class="scx-hr-blurp-skill-assessment ${assessment.textClass}">${escapeHtml(assessment.label)}</div>
    </div>
  `;
}

function createSkillBreakdownRowHTML(skillKey, totalValue, organicValue, trainingValue) {
  const hasBreakdown = organicValue !== null && trainingValue !== null;
  return `
    <div class="scx-skill-breakdown-row">
      <div class="scx-skill-breakdown-label">${escapeHtml(getSkillLabel(skillKey))}</div>
      <div class="scx-skill-breakdown-values">
        <div class="scx-skill-breakdown-value scx-skill-breakdown-total">
          <div class="scx-skill-breakdown-total-label">${t("total")}</div>
          <div class="scx-skill-breakdown-total-value">${totalValue}</div>
        </div>
        ${
          hasBreakdown
            ? `<div class="scx-skill-breakdown-value scx-skill-breakdown-organic">
          <div class="scx-skill-breakdown-organic-label">${t("organic")}</div>
          <div class="scx-skill-breakdown-organic-value">${organicValue}</div>
        </div>
        <div class="scx-skill-breakdown-value scx-skill-breakdown-training">
          <div class="scx-skill-breakdown-training-label">${t("training")}</div>
          <div class="scx-skill-breakdown-training-value">${trainingValue}</div>
        </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function createSkillsBreakdownSectionHTML(
  executiveSkills,
  currentTrainingSkillKey,
  organicSkills,
  trainingSkills,
) {
  let html = `
    <div class="scx-skill-breakdown-section">
      <div class="scx-skill-breakdown-section-label">${t("skillsBreakdown")}</div>
  `;

  for (const skillKey of SKILL_KEYS) {
    const totalValue = executiveSkills[skillKey] || 0;
    const organicValue = organicSkills ? (organicSkills[skillKey] ?? null) : null;
    const trainingValue = trainingSkills ? (trainingSkills[skillKey] ?? null) : null;
    html += createSkillBreakdownRowHTML(skillKey, totalValue, organicValue, trainingValue);
  }

  if (currentTrainingSkillKey) {
    html += `<div class="scx-skill-breakdown-training-indicator">${t("currentlyTraining")}: ${escapeHtml(getSkillLabel(currentTrainingSkillKey))}</div>`;
  }

  html += "</div>";
  return html;
}

function createFeedbackSectionHTML(feedbackText) {
  return `
    <div class="scx-hr-blurp-feedback-section">
      <div class="scx-hr-blurp-feedback-label">${t("extractedFeedback")}</div>
      <div class="scx-hr-blurp-feedback-text">${escapeHtml(feedbackText)}</div>
    </div>
  `;
}

function createSkillsSectionHTML(matchedEntry) {
  if (!matchedEntry?.skills) return "";

  let html = `
    <div class="scx-hr-blurp-skills-section">
      <div class="scx-hr-blurp-skills-label">${t("hrSkillsAssessment")}</div>
  `;

  for (const skillKey of SKILL_KEYS) {
    const skillValue = matchedEntry.skills[skillKey];
    if (skillValue !== undefined) {
      html += createSkillElementHTML(skillKey, skillValue);
    }
  }

  html += "</div>";
  return html;
}

function createFooterHTML(matchedEntry) {
  if (!matchedEntry?.skills?.avgSkill) return "";

  const avgAssessment = getSkillAssessment(matchedEntry.skills.avgSkill);

  return `
    <div class="scx-hr-blurp-footer">
      <div class="scx-hr-blurp-footer-label">${t("averageSkill")}</div>
      <div class="scx-hr-blurp-footer-value ${avgAssessment.textClass}">${matchedEntry.skills.avgSkill.toFixed(2)}</div>
    </div>
  `;
}

function createNavigationMessageHTML() {
  return `
    <div class="scx-executive-empty-state">
      <div class="scx-executive-empty-message">${t("navigateToExecutives")}</div>
    </div>
  `;
}

function wireRefreshButton(content) {
  const button = content.querySelector(`#${REFRESH_BUTTON_ID}`);
  if (!button) return;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    void updateExecutivePanel({ force: true });
  });
}

function buildExecutiveCopyText(
  executiveSkills,
  currentTrainingSkillKey,
  feedbackText,
  matchedEntry,
  organicSkills,
  trainingSkills,
) {
  const lines = [t("executiveHelper")];

  if (executiveSkills) {
    lines.push(`${t("skillsBreakdown")}:`);
    for (const skillKey of SKILL_KEYS) {
      const total = executiveSkills[skillKey] || 0;
      let line = `${getSkillLabel(skillKey)} ${t("total")}: ${total}`;
      if (organicSkills && trainingSkills) {
        line += ` (${t("organic")}: ${organicSkills[skillKey] ?? 0}, ${t("training")}: ${trainingSkills[skillKey] ?? 0})`;
      }
      lines.push(line);
    }
    if (currentTrainingSkillKey) {
      lines.push(`${t("currentlyTraining")}: ${getSkillLabel(currentTrainingSkillKey)}`);
    }
  }

  if (feedbackText) {
    lines.push(`${t("extractedFeedback")}: ${feedbackText}`);
  }

  if (matchedEntry?.skills?.avgSkill) {
    lines.push(`${t("averageSkill")}: ${matchedEntry.skills.avgSkill.toFixed(2)}`);
  }

  if (!executiveSkills && !feedbackText) {
    lines.push(t("navigateToExecutives"));
  }

  return lines.join("\n");
}

export async function updateExecutivePanel({ force = false } = {}) {
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  const pathname = window.location.pathname;
  const pageKind = getExecutivePageKind(pathname);

  await loadAuthDataOnce();
  await loadExecutivesOnce({ force });

  let executive = null;
  if (pageKind === "role" || pageKind === "apprentice") {
    const roleMatch = pathname.match(/\/headquarters\/executives\/(coo|cfo|cto|cmo)/);
    const positionCode = roleMatch ? ROLE_POSITION_MAP[roleMatch[1]] : null;
    executive = positionCode ? findExecutiveByPosition(positionCode) : null;
  } else if (pageKind === "candidate" || pageKind === "group") {
    const groupMatch = pathname.match(/\/headquarters\/executives\/g(\d+)/);
    const positionCode = groupMatch ? groupMatch[1] : null;
    executive = positionCode ? findExecutiveByPosition(positionCode) : null;
  }

  const executiveSkills = executive ? apiSkillsToInternal(executive.skills) : null;
  const currentTrainingSkillKey = executive?.currentTraining
    ? getTrainingSkillKey(executive.currentTraining.training)
    : null;

  if (executive) {
    await loadExecutiveDetail(executive.id, { force });
  }
  const detail = executive ? getExecutiveDetail(executive.id) : null;
  const trainingGained = detail ? computeTrainingBreakdown(detail.trainings) : null;
  const trainingSkills = trainingGained ? apiSkillsToInternal(trainingGained) : null;
  const organicSkills =
    trainingSkills && executiveSkills
      ? {
          mgmt: Math.max(0, executiveSkills.mgmt - trainingSkills.mgmt),
          acct: Math.max(0, executiveSkills.acct - trainingSkills.acct),
          comm: Math.max(0, executiveSkills.comm - trainingSkills.comm),
          tech: Math.max(0, executiveSkills.tech - trainingSkills.tech),
        }
      : null;

  const feedbackText = isExecutivePath(pathname) ? readExecutiveHRFeedback(document) : null;
  const matchedEntry = feedbackText ? findBestMatchingEntry(feedbackText) : null;

  if (!executiveSkills && !feedbackText) {
    content.innerHTML = createPanelHeaderHTML() + createNavigationMessageHTML() + createRefreshRowHTML();
    wireRefreshButton(content);
    wireCopyButton(content, () => buildExecutiveCopyText(null, null, null, null, null, null));
    return;
  }

  let html = createPanelHeaderHTML();
  if (executiveSkills) {
    html += createSkillsBreakdownSectionHTML(
      executiveSkills,
      currentTrainingSkillKey,
      organicSkills,
      trainingSkills,
    );
  }

  if (feedbackText) {
    html += createFeedbackSectionHTML(feedbackText);
    if (matchedEntry) {
      html += createSkillsSectionHTML(matchedEntry);
      html += createFooterHTML(matchedEntry);
    }
  }
  html += createRefreshRowHTML();

  content.innerHTML = html;
  wireRefreshButton(content);
  wireCopyButton(content, () =>
    buildExecutiveCopyText(
      executiveSkills,
      currentTrainingSkillKey,
      feedbackText,
      matchedEntry,
      organicSkills,
      trainingSkills,
    ),
  );
}

export function initExecutiveHelper() {
  // Initialization is handled by the sidebar system via setSectionUpdateFn.
}

export const _testUtils = {
  isExecutivePath,
  getExecutivePageKind,
  readExecutiveHRFeedback,
  findBestMatchingEntry,
  calculateSimilarity,
};
