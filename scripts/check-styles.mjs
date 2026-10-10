// Tokens-only colors, import-only content.css, no inline style="", no dead .scx-* classes.
// Runtime-built classes count as used via their prefix (`scx-navchip--${tone}`); classes
// documented in the extension-design skill are design-system API.
import path from "node:path";
import { contrastRatio } from "./lib/color.mjs";
import {
  ROOT,
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

// Text tokens must reach WCAG AA (4.5:1) on the surfaces they are drawn on, in both themes.
const tokensCss = stripCssComments(read(path.join(ROOT, TOKENS)));
const darkStart = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
const parseTokens = (css) =>
  Object.fromEntries([...css.matchAll(/(--scx-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const lightTokens = parseTokens(darkStart === -1 ? tokensCss : tokensCss.slice(0, darkStart));
const themes = {
  light: lightTokens,
  dark: { ...lightTokens, ...(darkStart === -1 ? {} : parseTokens(tokensCss.slice(darkStart))) },
};
const resolveToken = (tokens, name, depth = 0) => {
  const value = tokens[name];
  const ref = String(value || "").match(/^var\((--scx-[\w-]+)\)$/);
  return ref && depth < 10 ? resolveToken(tokens, ref[1], depth + 1) : value;
};

const TEXT_ON_SURFACE = [
  "--scx-text-primary",
  "--scx-text-secondary",
  "--scx-text-muted",
  "--scx-text-success",
  "--scx-text-success-dark",
  "--scx-text-error",
  "--scx-text-warning",
  "--scx-text-warning-alt",
  "--scx-text-info",
  "--scx-text-info-dark",
];
const CONTRAST_PAIRS = [
  ...TEXT_ON_SURFACE.flatMap((fg) => ["--scx-bg-primary", "--scx-bg-secondary"].map((bg) => [fg, bg])),
  ...["info", "neutral", "success", "warning", "error"].flatMap((tone) =>
    ["fg", "text"].map((part) => [`--scx-tone-${tone}-${part}`, `--scx-tone-${tone}-bg`]),
  ),
  ["--scx-shell-section-title", "--scx-shell-section-header-bg"],
  ["--scx-input-text", "--scx-input-bg"],
  ...Array.from({ length: 8 }, (_, i) => [`--scx-a11y-cat-${i}-text`, `--scx-a11y-cat-${i}`]),
  ["--scx-a11y-hc-text", "--scx-a11y-hc-bg"],
  ["--scx-a11y-hc-text", "--scx-a11y-hc-stock-bg"],
  ["--scx-a11y-idle-text", "--scx-a11y-idle-bg"],
];
const MIN_TEXT_CONTRAST = 4.5;
for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(resolveToken(tokens, fg), resolveToken(tokens, bg));
    if (ratio === null) {
      reporter.report(TOKENS, 1, `${theme}: cannot measure ${fg} on ${bg} (missing or translucent token).`);
    } else if (ratio < MIN_TEXT_CONTRAST) {
      reporter.report(
        TOKENS,
        lineOf(tokensCss, tokensCss.indexOf(`${fg}:`)),
        `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below ${MIN_TEXT_CONTRAST}:1 (WCAG AA). Adjust the token lightness.`,
      );
    }
  }
}

reporter.finish(
  `${cssFiles.length} partials, ${definedClasses.size} classes, tokens-only colors, ${CONTRAST_PAIRS.length * 2} AA contrast pairs`,
);
