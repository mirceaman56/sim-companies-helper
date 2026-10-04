// Locale key/placeholder parity, unknown/unused/built keys, hardcoded UI text.
// Silence a false positive with `// i18n-ignore` (whole dev-only file: "i18n-ignore-file").
import path from "node:path";
import { pathToFileURL } from "node:url";
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

const reporter = createReporter("i18n");
const TRANSLATIONS = path.join(SRC, "translations");

const load = async (abs) => (await import(pathToFileURL(abs).href)).default;
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const en = await load(path.join(TRANSLATIONS, "en.js"));
const enKeys = Object.keys(en);

// 1. Locale parity
for (const abs of listFiles(TRANSLATIONS, [".js"])) {
  const file = rel(abs);
  if (file.endsWith("/en.js")) continue;
  const locale = await load(abs);
  for (const key of enKeys) {
    if (!(key in locale)) {
      reporter.report(
        file,
        1,
        `missing key "${key}". Add it (use the English value if no translation is known).`,
      );
    } else if (placeholders(locale[key]).join() !== placeholders(en[key]).join()) {
      reporter.report(
        file,
        1,
        `"${key}" placeholders ${placeholders(locale[key])} != en ${placeholders(en[key])}.`,
      );
    }
  }
  for (const key of Object.keys(locale)) {
    if (!(key in en)) reporter.report(file, 1, `extra key "${key}" not in en.js. Remove it.`);
  }
}

// 2-4. Usage scan
const sourceFiles = listFiles(SRC, [".js"]).filter((f) => !f.startsWith(TRANSLATIONS));
const allCode = [];
const T_CALL_RE = /\bt\(\s*["'`]([\w.-]+)["'`]/g;
// Built keys (t(`financeAlert${id}`)) hide usages from this check and from code search.
const DYNAMIC_T_RE = /\bt\(\s*`[^`]*\$\{/g;

const MARKUP_TEXT_RE = />([^<>]*)</g;
const ATTR_RE = /\b(title|aria-label|placeholder|alt|data-tooltip)\s*=\s*"([^"]*)"/g;
const DOM_TEXT_RE =
  /\.(textContent|innerText|title|placeholder|ariaLabel)\s*=\s*(["'`])((?:\\.|(?!\2).)*)\2/g;

/** Text that a reader would see, once template expressions (\u0000) and entities are removed. */
function visibleWords(text) {
  const withoutExpr = text.replace(/\u0000/g, " ").replace(/\$\{[^}]*\}/g, " ");
  const withoutEntities = withoutExpr.replace(/&[#\w]+;/g, " ");
  return /[A-Za-z]{2,}/.test(withoutEntities) ? withoutEntities.trim() : "";
}

for (const abs of sourceFiles) {
  const file = rel(abs);
  const raw = read(abs);
  const code = stripComments(raw);
  allCode.push(code);
  const lines = raw.split("\n");
  const isIgnored = (line) => /\/\/\s*i18n-ignore\b/.test(lines[line - 1] || "");

  for (const m of code.matchAll(T_CALL_RE)) {
    if (!(m[1] in en)) reporter.report(file, lineOf(code, m.index), `t("${m[1]}") has no entry in en.js.`);
  }

  for (const m of code.matchAll(DYNAMIC_T_RE)) {
    reporter.report(
      file,
      lineOf(code, m.index),
      't() with a built key. Map values to literal keys (const LABEL_KEYS = { a: "keyA" }) so usages stay searchable.',
    );
  }

  // Page adapters and the data layer render nothing.
  if (file.startsWith("src/page/") || file.startsWith("src/data/") || file === "src/background.js") continue;
  if (/i18n-ignore-file\b/.test(raw)) continue;

  for (const { index: base, text: literal } of extractLiterals(code)) {
    if (!literal.includes("<")) continue;
    const lineAt = (offset) => lineOf(code, base) + (literal.slice(0, offset).match(/\n/g) || []).length;
    for (const m of literal.matchAll(MARKUP_TEXT_RE)) {
      const words = visibleWords(m[1]);
      const line = lineAt(m.index + m[0].search(/[A-Za-z]/));
      if (words && !isIgnored(line)) {
        reporter.report(file, line, `hardcoded UI text "${words}". Use \${t("key")}.`);
      }
    }
    for (const m of literal.matchAll(ATTR_RE)) {
      const words = visibleWords(m[2]);
      const line = lineAt(m.index);
      if (words && !isIgnored(line)) {
        reporter.report(file, line, `hardcoded ${m[1]}="${words}". Use \${t("key")}.`);
      }
    }
  }
  for (const m of code.matchAll(DOM_TEXT_RE)) {
    const words = visibleWords(m[3]);
    if (words && !isIgnored(lineOf(code, m.index))) {
      reporter.report(file, lineOf(code, m.index), `hardcoded .${m[1]} "${words}". Use t("key").`);
    }
  }
}

const joined = allCode.join("\n");
for (const key of enKeys) {
  const used = new RegExp(`["'\`]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(joined);
  if (!used) {
    reporter.report("src/translations/en.js", 1, `unused key "${key}". Remove it from all locale files.`);
  }
}

reporter.finish(`${enKeys.length} keys, all locales in sync, no hardcoded UI text`);
