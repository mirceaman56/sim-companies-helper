// Comments explain why, briefly: <=3 prose lines ("why:" allows 8), no restating names, no
// commented-out code, no change history. Run: npm run check:comments
import path from "node:path";
import { ROOT, SRC, createReporter, listFiles, read, rel } from "./lib/source-files.mjs";

const reporter = createReporter("comments");
const MAX_BLOCK = 3;
const MAX_WHY_BLOCK = 8;
const STOPWORDS = new Set(
  "a an the of for to in on and or with from by this that its is are be it".split(" "),
);
const HISTORY_RE = /\b(previously|no longer|anymore|used to be|old build|was (?:changed|removed) in)\b/i;
const CODE_RE =
  /^(?:(?:const|let|var|import|export|return|await|if|for|while|function|class)\b.*|.*[;{}]\s*$|.*\)\s*=>.*)$/;

/** Split a file into comment blocks: { kind, startLine, lines, nextCode }. */
function commentBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//")) {
      const start = i;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith("//")) {
        body.push(lines[i].trim().replace(/^\/\/\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "line", startLine: start + 1, lines: body, nextCode: nextCode(lines, i) });
      i -= 1;
    } else if (trimmed.startsWith("/*")) {
      const start = i;
      const kind = trimmed.startsWith("/**") ? "jsdoc" : "block";
      const body = [];
      while (i < lines.length) {
        body.push(
          lines[i]
            .trim()
            .replace(/^\/\*\*?|\*\/$/g, "")
            .replace(/^\*\s?/, "")
            .trim(),
        );
        if (lines[i].includes("*/")) break;
        i += 1;
      }
      blocks.push({
        kind,
        startLine: start + 1,
        lines: body.filter(Boolean),
        nextCode: nextCode(lines, i + 1),
      });
    }
  }
  return blocks;
}

function nextCode(lines, from) {
  for (let j = from; j < lines.length; j += 1) {
    const t = lines[j].trim();
    if (t) return t;
  }
  return "";
}

const words = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));

/** Name declared by a code line, if any. */
function declaredName(code) {
  return (
    code.match(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/)?.[1] ||
    code.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/)?.[1] ||
    code.match(/^(\w+)\s*[:(]/)?.[1] ||
    null
  );
}

/** True when a short comment adds nothing beyond the identifier it sits on. */
function restatesName(prose, code) {
  const name = declaredName(code);
  if (!name || prose.length !== 1) return false;
  const proseWords = words(prose[0]);
  if (proseWords.length === 0 || proseWords.length > 6) return false;
  const nameWords = new Set(words(name).map((w) => w.replace(/s$/, "")));
  const hits = proseWords.filter((w) => nameWords.has(w.replace(/s$/, ""))).length;
  return hits / proseWords.length >= 0.5;
}

for (const abs of [
  ...listFiles(SRC, [".js"]),
  ...listFiles(path.join(ROOT, "scripts"), [".mjs", ".js"]),
  ...listFiles(path.join(ROOT, "tests"), [".js"]),
]) {
  const file = rel(abs);
  if (file.startsWith("src/translations/")) continue;

  for (const block of commentBlocks(read(abs))) {
    const at = (msg) => reporter.report(file, block.startLine, msg);
    // JSDoc: prose is everything before the first @tag (tag bodies may span lines).
    const firstTag = block.lines.findIndex((l) => l.startsWith("@"));
    const prose = block.kind === "jsdoc" && firstTag !== -1 ? block.lines.slice(0, firstTag) : block.lines;

    const historyLine = block.lines.find((l) => HISTORY_RE.test(l));
    if (historyLine) at(`change history in a comment ("${historyLine.match(HISTORY_RE)[0]}"). Git has it.`);
    const codeLine =
      block.kind !== "jsdoc" && block.lines.find((l) => CODE_RE.test(l) && !/^(why:|eslint)/.test(l));
    if (codeLine) at(`commented-out code ("${codeLine.slice(0, 40)}"). Delete it.`);

    const fileName = file.split("/").pop();
    if (block.startLine <= 2 && prose[0]?.trim() === fileName) {
      at(`"${fileName}" header restates the file name. Delete it (keep a one-line purpose if useful).`);
    }

    if (restatesName(prose, block.nextCode)) {
      at(`"${prose[0]}" only restates the name below. Delete it or say why.`);
    }

    const isWhy = /^why:/i.test(prose[0] || "");
    const max = isWhy ? MAX_WHY_BLOCK : MAX_BLOCK;
    if (prose.length > max) {
      at(
        `comment is ${prose.length} prose lines (max ${max}${isWhy ? "" : `; start with "why:" to allow ${MAX_WHY_BLOCK}`}). Keep only the why.`,
      );
    }
  }
}

reporter.finish("comments are short and explain why");
