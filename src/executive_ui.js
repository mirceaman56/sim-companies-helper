/**
 * Executive Helper UI Component
 * Displays executive skills breakdown (organic vs training)
 * and HR feedback assessment matching against hr_blurp.json data
 */

import { stringSimilarity } from "string-similarity-js";
import hrBlurpData from "./resources/hr_blurp.json";
import { t, getLang } from "./i18n.js";
import { getSectionContent } from "./sidebar.js";
import { escapeHtml } from "./utils.js";
import { translateToEnglish } from "./translate.js";

const SECTION_ID = "executive-section";
const SIMILARITY_THRESHOLD = 0.7;
const TRANSLATED_SIMILARITY_THRESHOLD = 0.55;
const SKILL_KEYS = ["mgmt", "acct", "comm", "tech"];
const SKILL_LABELS = {
  mgmt: "Management",
  acct: "Accounting",
  comm: "Communication",
  tech: "Technology",
};

/**
 * Get translated skill label
 */
function getSkillLabel(skillKey) {
  const labelMap = {
    mgmt: "management",
    acct: "accounting",
    comm: "communication",
    tech: "technology",
  };
  return t(labelMap[skillKey]) || SKILL_LABELS[skillKey];
}

// Mapping for page skill names to standard keys
const PAGE_SKILL_MAPPING = {
  management: "mgmt",
  accounting: "acct",
  communication: "comm",
  science: "tech",
  technology: "tech",
};

/**
 * Extract executive skills from the page
 * Uses DOM structure only: finds tbody with 4 skill rows and extracts numeric values
 * Works in any language - relies on row order, not text content
 * @returns {Object} Skills object with keys like {mgmt: 1, acct: 0, comm: 2, tech: 2}
 */
function extractExecutiveSkills() {
  const skills = {};

  // Find tbody elements (skill tables use tbody)
  const tbodies = document.querySelectorAll("tbody");

  for (const tbody of tbodies) {
    const rows = tbody.querySelectorAll("tr");

    // Check if this tbody has 4 rows (the skills table has exactly 4 skill rows)
    if (rows.length !== 4) continue;

    let skillCount = 0;
    const skillOrder = ["mgmt", "acct", "comm", "tech"];

    // Try to extract skill values from each row
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) break; // Not a valid skill row

      // Look for a span with a number in the second cell
      const secondCell = cells[1];
      const spans = secondCell.querySelectorAll("span");

      let skillValue = null;

      // Find the first span containing a number
      for (const span of spans) {
        const text = span.textContent.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num >= 0 && num <= 10) {
          skillValue = num;
          break;
        }
      }

      // If no span found, try to parse the cell text directly
      if (skillValue === null) {
        const cellText = secondCell.textContent.trim();
        const match = cellText.match(/^\d+/);
        if (match) {
          skillValue = parseInt(match[0], 10);
        }
      }

      if (skillValue !== null) {
        const skillKey = skillOrder[skillCount];
        skills[skillKey] = skillValue;
        skillCount++;
      }
    }

    // If we found all 4 skills, return them
    if (skillCount === 4) {
      return skills;
    }
  }

  return null;
}

/**
 * Extract training skills from the page
 * Looks for training entries and extracts skill gains
 * @returns {Object} Training skills object with skill bonuses {comm: 2, tech: 1, etc}
 */
function extractTrainingSkills() {
  const trainingSkills = {};

  // Look for training entries - they typically show "Skill +X" format
  const pageText = document.body.innerText;
  const lines = pageText.split("\n");

  // Also search in DOM for specific patterns
  const allElements = document.querySelectorAll("*");

  for (const element of allElements) {
    // Only check text nodes
    if (element.childNodes.length === 0 && element.textContent) {
      const text = element.textContent;

      // Match patterns like "Communication +1", "Science +2", etc
      const matches = text.match(/(\w+)\s*\+(\d+)/g);
      if (matches) {
        for (const match of matches) {
          const parts = match.match(/(\w+)\s*\+(\d+)/);
          if (parts && parts.length === 3) {
            const skillName = parts[1].toLowerCase();
            const value = parseInt(parts[2], 10);

            const skillKey = PAGE_SKILL_MAPPING[skillName];
            if (skillKey) {
              trainingSkills[skillKey] = (trainingSkills[skillKey] || 0) + value;
            }
          }
        }
      }
    }
  }

  // Also search the page text for training skill indicators
  for (const line of lines) {
    const skillMatch = line.match(/(\w+)\s*\+(\d+)/);
    if (skillMatch && skillMatch.length === 3) {
      const skillName = skillMatch[1].toLowerCase();
      const value = parseInt(skillMatch[2], 10);

      const skillKey = PAGE_SKILL_MAPPING[skillName];
      if (skillKey) {
        trainingSkills[skillKey] = (trainingSkills[skillKey] || 0) + value;
      }
    }
  }

  return Object.keys(trainingSkills).length > 0 ? trainingSkills : null;
}

/**
 * Calculate similarity between two strings using string-similarity-js
 */
function calculateSimilarity(a, b) {
  const aStr = String(a).toLowerCase().trim();
  const bStr = String(b).toLowerCase().trim();

  if (!aStr || !bStr) return 0;
  if (aStr === bStr) return 1.0;

  // Use string-similarity library
  return stringSimilarity(aStr, bStr);
}

/**
 * Find best matching HR blurp entry from JSON based on feedback text
 * Returns the entry with highest similarity score above threshold
 */
export function findBestMatchingEntry(feedbackText, langCode, { threshold = SIMILARITY_THRESHOLD } = {}) {
  if (!feedbackText) return null;

  let bestMatch = null;
  let bestScore = threshold;

  for (const entry of hrBlurpData) {
    // If a specific language is requested and the entry has that language, try it first
    if (langCode && langCode !== "en" && entry[langCode]?.originalFeedback) {
      const localScore = calculateSimilarity(feedbackText, entry[langCode].originalFeedback);
      if (localScore > bestScore) {
        bestScore = localScore;
        bestMatch = entry;
      }
    }

    // Always also try English
    const enFeedback = entry.en?.originalFeedback || "";
    const enScore = calculateSimilarity(feedbackText, enFeedback);
    if (enScore > bestScore) {
      bestScore = enScore;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

/**
 * Get skill assessment color and label based on skill value
 */
function getSkillAssessment(skillValue) {
  if (skillValue >= 1.4) {
    return {
      class: "scx-hr-blurp-skill-keeper",
      label: t("keeper"),
    };
  } else if (skillValue >= 1.3) {
    return {
      class: "scx-hr-blurp-skill-works",
      label: t("works"),
    };
  } else {
    return {
      class: "scx-hr-blurp-skill-garbage",
      label: t("garbage"),
    };
  }
}

/**
 * Extract HR feedback from the page element
 * Uses DOM structure only: finds containers with tables, a bold label, and extracts text after empty divs
 * Language-agnostic and class-name agnostic
 */
function extractHRFeedback() {
  // Strategy: Find a div container that has:
  // 1. At least one table (direct child)
  // 2. A bold tag (the label)
  // 3. An empty div followed by text content

  const allDivs = document.querySelectorAll("div");

  for (const div of allDivs) {
    // Check if this div has direct table children
    const directTables = Array.from(div.children).filter((child) => child.tagName === "TABLE");
    if (directTables.length === 0) continue;

    // Check if this div contains a bold tag (likely the label)
    const boldTags = div.querySelectorAll("b");
    if (boldTags.length === 0) continue;

    // Look for an empty div (no children, no text) within this container
    const directDivChildren = Array.from(div.children).filter((child) => child.tagName === "DIV");
    for (let i = 0; i < directDivChildren.length; i++) {
      const currentDiv = directDivChildren[i];

      // Check if this is an empty div (no children and no text content)
      if (currentDiv.children.length === 0 && currentDiv.textContent.trim() === "") {
        // Look for text node immediately after this empty div
        let nextNode = currentDiv.nextSibling;

        // Keep looking for text nodes (skip comment nodes, etc.)
        while (nextNode) {
          if (nextNode.nodeType === Node.TEXT_NODE) {
            const text = nextNode.textContent.trim();
            if (text.length > 20) {
              // Found substantial text content
              return text;
            }
          } else if (nextNode.nodeType === Node.ELEMENT_NODE) {
            // If we hit another element, try to extract its text
            const text = nextNode.textContent.trim();
            if (text.length > 20) {
              return text;
            }
            break; // Stop if we hit a complex element
          }
          nextNode = nextNode.nextSibling;
        }
      }
    }
  }

  return null;
}

/**
 * Create HTML for a skill element (for HR assessment section)
 */
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

/**
 * Create HTML for a skills breakdown row showing organic vs training
 */
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

/**
 * Create HTML for the skills breakdown section
 */
function createSkillsBreakdownSectionHTML(executiveSkills, trainingSkills) {
  let html = `
    <div class="scx-skill-breakdown-section">
      <div class="scx-skill-breakdown-section-label">${t("skillsBreakdown")}</div>
      <div class="scx-skill-breakdown-description">${t("skillsBreakdownDescription")}</div>
  `;

  // Add rows for each skill
  for (const skillKey of SKILL_KEYS) {
    const totalValue = executiveSkills[skillKey] || 0;
    const trainingValue = trainingSkills ? trainingSkills[skillKey] || 0 : 0;
    html += createSkillBreakdownRowHTML(skillKey, totalValue, trainingValue);
  }

  html += "</div>";
  return html;
}

/**
 * Create HTML for the HR feedback section
 */
function createFeedbackSectionHTML(feedbackText) {
  return `
    <div class="scx-hr-blurp-feedback-section">
      <div class="scx-hr-blurp-feedback-label">${t("extractedFeedback")}</div>
      <div class="scx-hr-blurp-feedback-text">${escapeHtml(feedbackText)}</div>
    </div>
  `;
}

/**
 * Create HTML showing the matched English blurb for verification
 */
function createMatchedBlurbHTML(matchedEntry) {
  const enFeedback = matchedEntry?.en?.originalFeedback;
  if (!enFeedback) return "";

  return `
    <div class="scx-hr-blurp-feedback-section">
      <div class="scx-hr-blurp-feedback-label">${escapeHtml(t("matchedEnglishBlurb"))}</div>
      <div class="scx-hr-blurp-feedback-text" style="font-style: italic; opacity: 0.8;">${escapeHtml(enFeedback)}</div>
    </div>
  `;
}

/**
 * Create HTML for translation unavailable hint
 */
function createTranslationUnavailableHTML() {
  return `
    <div class="scx-hr-blurp-feedback-section">
      <div class="scx-hr-blurp-translation-unavailable">${escapeHtml(t("translationUnavailable"))}</div>
    </div>
  `;
}

/**
 * Create HTML for translation loading state
 */
function createTranslatingHTML() {
  return `
    <div class="scx-hr-blurp-feedback-section">
      <div class="scx-hr-blurp-translating">${escapeHtml(t("translatingFeedback"))}</div>
    </div>
  `;
}

/**
 * Create HTML for the HR skills section
 */
function createSkillsSectionHTML(matchedEntry) {
  if (!matchedEntry || !matchedEntry.skills) {
    return "";
  }

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

/**
 * Create HTML for the footer (average skill)
 */
function createFooterHTML(matchedEntry) {
  if (!matchedEntry || !matchedEntry.skills || !matchedEntry.skills.avgSkill) {
    return "";
  }

  const avgAssessment = getSkillAssessment(matchedEntry.skills.avgSkill);
  const footerClass = `scx-hr-blurp-footer scx-hr-blurp-footer-${avgAssessment.class.replace("scx-hr-blurp-skill-", "")}`;

  return `
    <div class="${footerClass}">
      <div class="scx-hr-blurp-footer-label">${t("averageSkill")}</div>
      <div class="scx-hr-blurp-footer-value">${matchedEntry.skills.avgSkill.toFixed(2)}</div>
    </div>
  `;
}

/**
 * Create HTML for navigation message when not on executive page
 */
function createNavigationMessageHTML() {
  return `
    <div class="scx-executive-empty-state">
      <div class="scx-executive-empty-message">
        ${t("navigateToExecutives")}
      </div>
    </div>
  `;
}

/**
 * Update the executive helper panel in the sidebar
 */
export async function updateExecutivePanel() {
  // Get the section content container
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  // Check if we're on an executive page
  if (!isExecutivePage()) {
    content.innerHTML = createNavigationMessageHTML();
    return;
  }

  const executiveSkills = extractExecutiveSkills();
  const trainingSkills = extractTrainingSkills();
  const feedbackText = extractHRFeedback();

  // If we don't have any data, show empty state
  if (!executiveSkills && !feedbackText) {
    return;
  }

  const lang = getLang();

  // Try to find HR blurp match if we have feedback
  let matchedEntry = null;

  if (feedbackText) {
    // First try matching against available language variants in hr_blurp.json
    matchedEntry = findBestMatchingEntry(feedbackText, lang);

    // If no match and language is not English, translate and retry
    if (!matchedEntry && lang !== "en") {
      // Show loading state with skills breakdown
      let loadingHtml = "";
      if (executiveSkills) {
        loadingHtml += createSkillsBreakdownSectionHTML(executiveSkills, trainingSkills);
      }
      loadingHtml += createFeedbackSectionHTML(feedbackText);
      loadingHtml += createTranslatingHTML();
      content.innerHTML = loadingHtml;

      const translatedText = await translateToEnglish(feedbackText, lang);

      if (translatedText) {
        matchedEntry = findBestMatchingEntry(translatedText, "en", { threshold: TRANSLATED_SIMILARITY_THRESHOLD });
      }

      // Re-check content is still valid (user may have navigated away)
      const currentContent = getSectionContent(SECTION_ID);
      if (!currentContent || currentContent !== content) return;
    }
  }

  // Build HTML for the panel
  let html = "";

  // Always show skills breakdown if we have skills data
  if (executiveSkills) {
    html += createSkillsBreakdownSectionHTML(executiveSkills, trainingSkills);
  }

  // Show HR assessment if we have feedback
  if (matchedEntry && feedbackText) {
    html += createFeedbackSectionHTML(feedbackText);
    if (lang !== "en") {
      html += createMatchedBlurbHTML(matchedEntry);
    }
    html += createSkillsSectionHTML(matchedEntry);
    html += createFooterHTML(matchedEntry);
  } else if (feedbackText && lang !== "en") {
    // Non-English, no match found — translation failed or no match after translation
    html += createFeedbackSectionHTML(feedbackText);
    html += createTranslationUnavailableHTML();
  } else if (feedbackText) {
    // English, no match found
    html += createFeedbackSectionHTML(feedbackText);
  }

  // Update content
  content.innerHTML = html;
}

/**
 * Check if current page is an executive page
 */
function isExecutivePage() {
  const path = window.location.pathname;
  // Match both specific roles (coo, cfo, cto, cmo) and group executives (g1, g2, g3, etc.)
  return /\/headquarters\/executives\/(coo|cfo|cto|cmo|g\d+)\/$/.test(path);
}

/**
 * Initialize executive helper
 */
export function initExecutiveHelper() {
  // Initialization is handled by the sidebar system via setSectionUpdateFn
}
