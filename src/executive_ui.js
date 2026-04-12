/**
 * Executive Helper UI Component
 * Displays executive skills breakdown (organic vs training)
 * and HR feedback assessment matching against hr_blurp.json data.
 */

import { stringSimilarity } from "string-similarity-js";
import hrBlurpData from "./resources/hr_blurp.json";
import { t } from "./i18n.js";
import { getSectionContent } from "./sidebar.js";
import { COPY_BUTTON_SVG, escapeHtml, wireCopyButton } from "./utils.js";
import {
  getExecutivePageKind,
  isExecutivePath,
  readExecutiveHRFeedback,
  readExecutiveSkills,
  readExecutiveTrainingSkills,
} from "./page/executive_page.js";

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
  if (skillValue >= 1.4) return { class: "scx-hr-blurp-skill-keeper", label: t("keeper") };
  if (skillValue >= 1.3) return { class: "scx-hr-blurp-skill-works", label: t("works") };
  return { class: "scx-hr-blurp-skill-garbage", label: t("garbage") };
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
      <button id="${REFRESH_BUTTON_ID}" class="scx-btn scx-btn-primary scx-font-8" type="button">
        ${t("executiveRefresh")}
      </button>
    </div>
  `;
}

function createSkillElementHTML(skillKey, skillValue) {
  const assessment = getSkillAssessment(skillValue);

  return `
    <div class="scx-hr-blurp-skill-item ${assessment.class}">
      <div class="scx-hr-blurp-skill-label">${escapeHtml(getSkillLabel(skillKey))}</div>
      <div class="scx-hr-blurp-skill-value">${skillValue.toFixed(2)}</div>
      <div class="scx-hr-blurp-skill-assessment">${escapeHtml(assessment.label)}</div>
    </div>
  `;
}

function createSkillBreakdownRowHTML(skillKey, totalValue, trainingValue) {
  const organicValue = Math.max(0, totalValue - (trainingValue || 0));

  return `
    <div class="scx-skill-breakdown-row">
      <div class="scx-skill-breakdown-label">${escapeHtml(getSkillLabel(skillKey))}</div>
      <div class="scx-skill-breakdown-values">
        <div class="scx-skill-breakdown-value scx-skill-breakdown-total">
          <div class="scx-skill-breakdown-total-label">${t("total")}</div>
          <div class="scx-skill-breakdown-total-value">${totalValue}</div>
        </div>
        <div class="scx-skill-breakdown-value scx-skill-breakdown-organic">
          <div class="scx-skill-breakdown-organic-label">${t("organic")}</div>
          <div class="scx-skill-breakdown-organic-value">${organicValue}</div>
        </div>
        <div class="scx-skill-breakdown-value scx-skill-breakdown-training">
          <div class="scx-skill-breakdown-training-label">${t("training")}</div>
          <div class="scx-skill-breakdown-training-value">${trainingValue || 0}</div>
        </div>
      </div>
    </div>
  `;
}

function createSkillsBreakdownSectionHTML(executiveSkills, trainingSkills) {
  let html = `
    <div class="scx-skill-breakdown-section">
      <div class="scx-skill-breakdown-section-label">${t("skillsBreakdown")}</div>
      <div class="scx-skill-breakdown-description">${t("skillsBreakdownDescription")}</div>
  `;

  for (const skillKey of SKILL_KEYS) {
    const totalValue = executiveSkills[skillKey] || 0;
    const trainingValue = trainingSkills ? trainingSkills[skillKey] || 0 : 0;
    html += createSkillBreakdownRowHTML(skillKey, totalValue, trainingValue);
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
  const footerClass = `scx-hr-blurp-footer scx-hr-blurp-footer-${avgAssessment.class.replace("scx-hr-blurp-skill-", "")}`;

  return `
    <div class="${footerClass}">
      <div class="scx-hr-blurp-footer-label">${t("averageSkill")}</div>
      <div class="scx-hr-blurp-footer-value">${matchedEntry.skills.avgSkill.toFixed(2)}</div>
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
    updateExecutivePanel();
  });
}

function buildExecutiveCopyText(executiveSkills, trainingSkills, feedbackText, matchedEntry) {
  const lines = [t("executiveHelper")];

  if (executiveSkills) {
    lines.push(`${t("skillsBreakdown")}:`);
    for (const skillKey of SKILL_KEYS) {
      const total = executiveSkills[skillKey] || 0;
      const training = trainingSkills ? trainingSkills[skillKey] || 0 : 0;
      const organic = Math.max(0, total - training);
      lines.push(
        `${getSkillLabel(skillKey)} ${t("total")}: ${total} | ${t("organic")}: ${organic} | ${t("training")}: ${training}`,
      );
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

export function updateExecutivePanel() {
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  const pathname = window.location.pathname;
  if (!isExecutivePath(pathname)) {
    content.innerHTML = createPanelHeaderHTML() + createNavigationMessageHTML() + createRefreshRowHTML();
    wireRefreshButton(content);
    wireCopyButton(content, () => buildExecutiveCopyText(null, null, null, null));
    return;
  }

  const pageKind = getExecutivePageKind(pathname);
  const executiveSkills = readExecutiveSkills(document);
  const trainingSkills =
    pageKind === "role" || pageKind === "apprentice" ? readExecutiveTrainingSkills(document) : null;
  const feedbackText = readExecutiveHRFeedback(document);
  const matchedEntry = feedbackText ? findBestMatchingEntry(feedbackText) : null;

  if (!executiveSkills && !feedbackText) {
    content.innerHTML = createPanelHeaderHTML() + createNavigationMessageHTML() + createRefreshRowHTML();
    wireRefreshButton(content);
    wireCopyButton(content, () => buildExecutiveCopyText(null, null, null, null));
    return;
  }

  let html = createPanelHeaderHTML();
  if (executiveSkills) {
    html += createSkillsBreakdownSectionHTML(executiveSkills, trainingSkills);
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
    buildExecutiveCopyText(executiveSkills, trainingSkills, feedbackText, matchedEntry),
  );
}

export function initExecutiveHelper() {
  // Initialization is handled by the sidebar system via setSectionUpdateFn.
}

export const _testUtils = {
  isExecutivePath,
  getExecutivePageKind,
  readExecutiveSkills,
  readExecutiveTrainingSkills,
  readExecutiveHRFeedback,
  findBestMatchingEntry,
  calculateSimilarity,
};
