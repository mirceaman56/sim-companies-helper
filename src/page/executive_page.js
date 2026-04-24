const EXEC_ROLE_PATTERN = /\/headquarters\/executives\/(coo|cfo|cto|cmo)(-apprentice)?\/?$/;
const EXEC_CANDIDATE_PATTERN = /\/headquarters\/executives\/g[1-4]\/?$/;
const EXEC_GROUP_PATTERN = /\/headquarters\/executives\/g\d+\/?$/;

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
