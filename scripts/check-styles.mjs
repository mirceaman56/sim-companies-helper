// Tokens-only colors, import-only content.css, no inline style="", no dead .scx-* classes.
// Runtime-built classes count as used via their prefix (`scx-navchip--${tone}`); classes
// documented in the extension-design skill are design-system API.
import path from "node:path";
import {
  SRC,
  createReporter,
  extractLiterals,
  lineOf,
  listFiles,
  read,
  rel,
  stripComments,
} from "./lib/source-files.mjs";

const reporter = createReporter("styles");
const STYLES = path.join(SRC, "styles");
const TOKENS = "src/styles/foundations/tokens.css";
const ENTRY = path.join(SRC, "content.css");
const DESIGN_SKILL = ".claude/skills/extension-design/SKILL.md";

const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

const cssFiles = listFiles(STYLES, [".css"]);
const definedClasses = new Map(); // class -> first "file:line"

for (const abs of cssFiles) {
  const file = rel(abs);
  const css = stripCssComments(read(abs));
  if (file !== TOKENS) {
    for (const m of css.matchAll(RAW_COLOR_RE)) {
      reporter.report(
        file,
        lineOf(css, m.index),
        `raw color "${m[0]}". Use a var(--scx-*) token from ${TOKENS}.`,
      );
    }
  }
  // Class names in selectors only (skip declaration blocks).
  const selectorsOnly = css.replace(/\{[^{}]*\}/g, (block) => block.replace(/[^\n]/g, " "));
  for (const m of selectorsOnly.matchAll(/\.(scx-[\w-]+)/g)) {
    if (!definedClasses.has(m[1])) definedClasses.set(m[1], `${file}:${lineOf(css, m.index)}`);
  }
}

// Entry file: imports only, and every partial imported.
const entry = stripCssComments(read(ENTRY));
const imported = new Set();
entry.split("\n").forEach((line, i) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const m = trimmed.match(/^@import\s+["']([^"']+)["'];$/);
  if (!m) {
    reporter.report(
      "src/content.css",
      i + 1,
      "only @import lines belong here. Put rules in a src/styles/ partial.",
    );
    return;
  }
  imported.add(rel(path.resolve(SRC, m[1])));
});
for (const abs of cssFiles) {
  if (!imported.has(rel(abs))) reporter.report(rel(abs), 1, "partial is not imported by src/content.css.");
}

// JS side: inline style attributes + class usage.
const jsLiterals = [];
for (const abs of listFiles(SRC, [".js"])) {
  const file = rel(abs);
  if (file.startsWith("src/translations/")) continue;
  const code = stripComments(read(abs));
  for (const lit of extractLiterals(code)) {
    jsLiterals.push(lit.text);
    const m = lit.text.match(/\bstyle\s*=\s*["']/);
    if (m)
      reporter.report(file, lineOf(code, lit.index), 'inline style="..." in markup. Use a .scx-* class.');
  }
}

const designDoc = read(path.join(SRC, "..", DESIGN_SKILL));
const documented = new Set(
  [...designDoc.matchAll(/\.(scx-[\w-]+)/g)]
    .map((m) => m[1])
    .flatMap((cls) => {
      // ".scx-alert-{success|error}" style shorthands
      const brace = designDoc.slice(designDoc.indexOf(cls)).match(/^[\w-]+\{([\w|]+)\}/);
      return brace ? brace[1].split("|").map((v) => cls + v) : [cls];
    }),
);
for (const cls of documented) {
  if (!cls.endsWith("-") && !definedClasses.has(cls)) {
    reporter.report(
      DESIGN_SKILL,
      lineOf(designDoc, designDoc.indexOf(cls)),
      `documents .${cls}, which no CSS defines.`,
    );
  }
}

const jsText = jsLiterals.join("\n");
const dynamicPrefixes = [...jsText.matchAll(/(scx-[\w-]*?-)\u0000/g)].map((m) => m[1]);
for (const [cls, where] of definedClasses) {
  const used =
    documented.has(cls) ||
    new RegExp(`(^|[^\\w-])${cls}($|[^\\w-])`, "m").test(jsText) ||
    dynamicPrefixes.some((p) => cls.startsWith(p));
  if (!used) {
    const [file, line] = where.split(":");
    reporter.report(
      file,
      Number(line),
      `.${cls} is not referenced from src/ JS. Delete the rule (dead CSS).`,
    );
  }
}

reporter.finish(`${cssFiles.length} partials, ${definedClasses.size} classes, tokens-only colors`);
