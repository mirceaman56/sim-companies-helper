const EXEC_ROLE_PATTERN = /\/headquarters\/executives\/(coo|cfo|cto|cmo)(-apprentice)?\/?$/;
const EXEC_CANDIDATE_PATTERN = /\/headquarters\/executives\/g[1-4]\/?$/;
const EXEC_GROUP_PATTERN = /\/headquarters\/executives\/g\d+\/?$/;
const SKILL_ORDER = ["mgmt", "acct", "comm", "tech"];
const PAGE_SKILL_MAPPING = {
  management: "mgmt",
  accounting: "acct",
  communication: "comm",
  science: "tech",
  technology: "tech",
};
const TRAINING_REGEX = /\b(Management|Accounting|Communication|Science|Technology)\s*\+(\d+)\b/gi;

export function isExecutivePath(pathname) {
  if (typeof pathname !== "string") return false;
  return EXEC_ROLE_PATTERN.test(pathname) || EXEC_GROUP_PATTERN.test(pathname);
}

export function getExecutivePageKind(pathname) {
  if (typeof pathname !== "string") return "none";

  const roleMatch = pathname.match(EXEC_ROLE_PATTERN);
  if (roleMatch) {
    return roleMatch[2] ? "apprentice" : "role";
  }

  if (EXEC_CANDIDATE_PATTERN.test(pathname)) {
    return "candidate";
  }

  if (EXEC_GROUP_PATTERN.test(pathname)) {
    return "group";
  }

  return "none";
}

export function readExecutiveSkills(root = document) {
  const skills = {};
  const tbodies = root?.querySelectorAll?.("tbody") || [];

  for (const tbody of tbodies) {
    const rows = tbody.querySelectorAll("tr");
    if (rows.length !== SKILL_ORDER.length) continue;

    let skillIndex = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) break;

      const value = extractSkillValue(cells[1]);
      if (!Number.isFinite(value)) break;

      skills[SKILL_ORDER[skillIndex]] = value;
      skillIndex += 1;
    }

    if (skillIndex === SKILL_ORDER.length) {
      return skills;
    }
  }

  return null;
}

function extractSkillValue(cell) {
  const spans = cell.querySelectorAll("span");

  for (const span of spans) {
    const text = span.textContent.trim();
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && value >= 0 && value <= 10) {
      return value;
    }
  }

  const text = cell.textContent.trim();
  const match = text.match(/^\d+/);
  if (!match) return null;

  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
}

export function readExecutiveTrainingSkills(root = document) {
  const training = {};
  const text = root?.body?.textContent || root?.textContent || "";

  let match = TRAINING_REGEX.exec(text);
  while (match) {
    const skillName = match[1].toLowerCase();
    const increment = Number.parseInt(match[2], 10);
    const skillKey = PAGE_SKILL_MAPPING[skillName];

    if (skillKey && Number.isFinite(increment)) {
      training[skillKey] = (training[skillKey] || 0) + increment;
    }

    match = TRAINING_REGEX.exec(text);
  }

  TRAINING_REGEX.lastIndex = 0;
  return Object.keys(training).length > 0 ? training : null;
}

export function readExecutiveHRFeedback(root = document) {
  const allDivs = root?.querySelectorAll?.("div") || [];

  for (const div of allDivs) {
    const directTables = Array.from(div.children).filter((child) => child.tagName === "TABLE");
    if (directTables.length === 0) continue;

    const boldTags = div.querySelectorAll("b");
    if (boldTags.length === 0) continue;

    const directDivChildren = Array.from(div.children).filter((child) => child.tagName === "DIV");
    for (const child of directDivChildren) {
      if (child.children.length !== 0 || child.textContent.trim() !== "") continue;

      let nextNode = child.nextSibling;
      while (nextNode) {
        if (nextNode.nodeType === Node.TEXT_NODE || nextNode.nodeType === Node.ELEMENT_NODE) {
          const text = (nextNode.textContent || "").trim();
          if (text.length > 20) {
            return text;
          }
          if (nextNode.nodeType === Node.ELEMENT_NODE) break;
        }
        nextNode = nextNode.nextSibling;
      }
    }
  }

  return null;
}
