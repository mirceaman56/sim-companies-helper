const EXEC_ROLE_PATTERN = /\/headquarters\/executives\/(coo|cfo|cto|cmo)(-apprentice)?\/?$/;
const EXEC_CANDIDATE_PATTERN = /\/headquarters\/executives\/g[1-4]\/?$/;
const EXEC_GROUP_PATTERN = /\/headquarters\/executives\/g\d+\/?$/;
const SKILL_ORDER = ["mgmt", "acct", "comm", "tech"];
const EXEC_TRAINING_HISTORY_LINE_SELECTOR = ".pull-right.text-right > div";
const TRAINING_LINE_CAPTURE_REGEX = /^(.+?)(?:\s*[:-])?\s*\(?[+＋]\s*(\d+)\)?\s*$/;
const SKILL_KEY_ALIASES = {
  mgmt: ["management"],
  acct: ["accounting"],
  comm: ["communication"],
  tech: ["science", "technology"],
};

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
  const skillRows = readExecutiveSkillRows(root);
  if (!skillRows) return null;

  return Object.fromEntries(skillRows.map((row) => [row.key, row.value]));
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

function readExecutiveSkillRows(root = document) {
  const tbodies = root?.querySelectorAll?.("tbody") || [];

  for (const tbody of tbodies) {
    const rows = tbody.querySelectorAll("tr");
    if (rows.length !== SKILL_ORDER.length) continue;

    /** @type {{key: string, label: string, value: number}[]} */
    const parsedRows = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) break;

      const value = extractSkillValue(cells[1]);
      if (!Number.isFinite(value)) break;

      const key = SKILL_ORDER[index];
      const label = (cells[0].textContent || "").trim();
      parsedRows.push({ key, label, value });
    }

    if (parsedRows.length === SKILL_ORDER.length) {
      return parsedRows;
    }
  }

  return null;
}

function normalizeSkillLabel(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s:()\-_.]+/g, "")
    .trim();
}

function buildSkillLabelKeyMap(root = document) {
  const skillRows = readExecutiveSkillRows(root);
  const labelMap = new Map();
  const normalizedLabels = [];

  if (skillRows) {
    for (const row of skillRows) {
      const normalized = normalizeSkillLabel(row.label);
      if (!normalized) continue;
      labelMap.set(normalized, row.key);
      normalizedLabels.push(normalized);
    }
  }

  for (const [skillKey, aliases] of Object.entries(SKILL_KEY_ALIASES)) {
    for (const alias of aliases) {
      const normalized = normalizeSkillLabel(alias);
      if (!normalized) continue;
      if (!labelMap.has(normalized)) {
        labelMap.set(normalized, skillKey);
      }
    }
  }

  return {
    labelMap,
    normalizedLabels,
  };
}

function resolveSkillKey(rawLabel, labelMap, normalizedLabels) {
  const normalizedLabel = normalizeSkillLabel(rawLabel);
  if (!normalizedLabel) return null;

  if (labelMap.has(normalizedLabel)) {
    return labelMap.get(normalizedLabel);
  }

  for (const normalizedKnownLabel of normalizedLabels) {
    if (normalizedLabel.includes(normalizedKnownLabel) || normalizedKnownLabel.includes(normalizedLabel)) {
      return labelMap.get(normalizedKnownLabel) || null;
    }
  }

  return null;
}

function parseTrainingLine(line, labelMap, normalizedLabels) {
  const match = String(line || "")
    .trim()
    .match(TRAINING_LINE_CAPTURE_REGEX);
  if (!match) return null;

  const skillKey = resolveSkillKey(match[1], labelMap, normalizedLabels);
  if (!skillKey) return null;

  const increment = Number.parseInt(match[2], 10);
  if (!Number.isFinite(increment)) return null;

  return { skillKey, increment };
}

function collectTrainingFromHistoryLines(lines, labelMap, normalizedLabels) {
  const training = {};

  for (const line of lines) {
    const parsed = parseTrainingLine(line, labelMap, normalizedLabels);
    if (!parsed) continue;
    training[parsed.skillKey] = (training[parsed.skillKey] || 0) + parsed.increment;
  }

  return training;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTrainingFromPageText(text, labelMap) {
  const training = {};

  for (const [normalizedLabel, skillKey] of labelMap.entries()) {
    if (!normalizedLabel) continue;

    const rawLabelRegex = new RegExp(
      `${escapeRegex(normalizedLabel)}(?:\\s*[:-])?\\s*\\(?[+＋]\\s*(\\d+)\\)?`,
      "gi",
    );
    const normalizedText = normalizeSkillLabel(text);

    let match = rawLabelRegex.exec(normalizedText);
    while (match) {
      const increment = Number.parseInt(match[1], 10);
      if (Number.isFinite(increment)) {
        training[skillKey] = (training[skillKey] || 0) + increment;
      }
      match = rawLabelRegex.exec(normalizedText);
    }
  }

  return training;
}

export function readExecutiveTrainingSkills(root = document) {
  const text = root?.body?.textContent || root?.textContent || "";
  const { labelMap, normalizedLabels } = buildSkillLabelKeyMap(root);

  const historyLines = [...(root?.querySelectorAll?.(EXEC_TRAINING_HISTORY_LINE_SELECTOR) || [])]
    .map((el) => el.textContent?.trim())
    .filter((line) => line && /[+＋]\s*\d+/.test(line));

  const training =
    historyLines.length > 0
      ? collectTrainingFromHistoryLines(historyLines, labelMap, normalizedLabels)
      : collectTrainingFromPageText(text, labelMap);

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
