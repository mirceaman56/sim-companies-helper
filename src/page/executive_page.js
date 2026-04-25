const EXEC_ROLE_PATTERN = /\/headquarters\/executives\/(coo|cfo|cto|cmo)(-apprentice)?\/?$/;
const EXEC_GROUP_PATTERN = /\/headquarters\/executives\/g\d+\/?$/;
const EXEC_NAME_SELECTOR =
  "h1, h2, h3, h4, [class*='title'], [class*='name'], [class*='header'], [class*='heading'], strong, b, div, span";
const EXEC_NAME_STOP_WORDS = new Set([
  "overview",
  "accounting",
  "executives",
  "finance",
  "simboosts",
  "wares",
  "incoming",
  "outgoing",
  "stats",
  "research",
  "notes",
  "management",
  "communication",
  "technology",
  "science",
  "salary",
  "age",
  "move",
  "train",
  "dismiss",
  "add",
  "refresh",
  "executive helper",
  "skills breakdown",
]);

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

  if (EXEC_GROUP_PATTERN.test(pathname)) {
    return "staff";
  }

  return "none";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyExecutiveName(text) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 5 || normalized.length > 60) return false;
  if (/[0-9$:/]/.test(normalized)) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;

  const words = normalized.split(" ");
  if (words.length < 2 || words.length > 4) return false;

  const lower = normalized.toLowerCase();
  if (EXEC_NAME_STOP_WORDS.has(lower)) return false;

  return words.every((word) => /^[A-Za-z][A-Za-z'-.]*$/.test(word));
}

function buildRoleTokens(pathname, pageKind) {
  const roleMatch = String(pathname || "").match(EXEC_ROLE_PATTERN);
  const roleKey = roleMatch?.[1] ?? null;
  const tokens = [];

  if (roleKey) tokens.push(roleKey.toUpperCase());
  if (pageKind === "apprentice") tokens.push("APPRENTICE");
  if (pageKind === "staff") tokens.push("STAFF");

  return { roleKey, tokens };
}

function scoreNameCandidate(element, text, roleTokens) {
  let score = 0;
  const tagName = element.tagName || "";
  const className = String(element.className || "");
  const parentText = normalizeText(element.parentElement?.textContent || "");
  const ownText = normalizeText(text);

  if (/^H[1-4]$/.test(tagName)) score += 40;
  if (/title|name|header|heading/i.test(className)) score += 20;
  if (/^[A-Z][a-z]/.test(ownText)) score += 10;

  for (const token of roleTokens) {
    if (parentText.includes(token)) score += 15;
    if (normalizeText(element.nextElementSibling?.textContent || "").includes(token)) score += 10;
    if (normalizeText(element.previousElementSibling?.textContent || "").includes(token)) score += 10;
  }

  return score;
}

function readExecutiveName(root, pathname, pageKind) {
  const searchRoot = root?.querySelector?.("#page") || root;
  const { tokens } = buildRoleTokens(pathname, pageKind);
  const candidates = [];
  const elements = searchRoot?.querySelectorAll?.(EXEC_NAME_SELECTOR) || [];

  for (const [index, element] of Array.from(elements).entries()) {
    if (element.children.length > 1) continue;

    const text = normalizeText(element.textContent);
    if (!isLikelyExecutiveName(text)) continue;

    candidates.push({
      text,
      score: scoreNameCandidate(element, text, tokens) - index / 1000,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.text ?? null;
}

function readExecutiveRoleLabel(root, pathname, pageKind) {
  const searchRoot = root?.querySelector?.("#page") || root;
  const { tokens } = buildRoleTokens(pathname, pageKind);
  if (tokens.length === 0) return null;

  const elements = searchRoot?.querySelectorAll?.("h1, h2, h3, h4, div, span, p, b, strong") || [];
  for (const element of elements) {
    const text = normalizeText(element.textContent);
    if (!text || text.length > 40) continue;
    if (tokens.every((token) => text.toUpperCase().includes(token))) {
      return text;
    }
  }

  return null;
}

export function readExecutivePageIdentity(root = document, pathname = window.location.pathname) {
  const pageKind = getExecutivePageKind(pathname);
  const { roleKey } = buildRoleTokens(pathname, pageKind);

  return {
    pageKind,
    roleKey,
    name: pageKind === "none" ? null : readExecutiveName(root, pathname, pageKind),
    roleLabel: pageKind === "none" ? null : readExecutiveRoleLabel(root, pathname, pageKind),
  };
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
