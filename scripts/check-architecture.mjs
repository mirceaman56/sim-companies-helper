// Module layering, data-platform and page-adapter boundaries (rules table in AGENTS.md).
// Run: npm run check:architecture
import path from "node:path";
import { SRC, createReporter, lineOf, listFiles, read, rel, stripComments } from "./lib/source-files.mjs";

const reporter = createReporter("architecture");

const FORBIDDEN_APIS = [
  {
    pattern: /\blocalStorage\b/g,
    message: "Use storage.* from src/data/storage.js instead of localStorage.",
  },
  {
    pattern: /\bchrome\.storage\.(local|sync|session)\b/g,
    message: "Use storage.* from src/data/storage.js instead of chrome.storage.",
  },
  { pattern: /(?<![.\w])fetch\(/g, message: "Use request() from src/data/apiClient.js instead of fetch()." },
  {
    pattern: /backend:\s*["']local["']/g,
    message:
      'Page localStorage is legacy. Persist with backend "chrome" (or "sync"); read old keys via getRaw("local", ...).',
  },
];

const LAYERS = [
  {
    name: "data",
    match: (f) => f.startsWith("src/data/"),
    allow: (t) => t.startsWith("src/data/"),
    hint: "src/data must not depend on feature code. Inject what it needs (see setScopeProvider in src/data/scope.js).",
  },
  {
    name: "page",
    match: (f) => f.startsWith("src/page/"),
    allow: (t) => t.startsWith("src/page/") || t === "src/utils.js" || t === "src/constants.js",
    hint: "Page adapters only read the game DOM. Move UI/state logic to the calling module.",
  },
  {
    name: "calc",
    match: (f) => /^src\/[^/]+_calc\.js$/.test(f),
    allow: (t) =>
      /^src\/[^/]+_calc\.js$/.test(t) ||
      ["src/i18n.js", "src/utils.js", "src/constants.js"].includes(t) ||
      t.startsWith("src/resources/"),
    hint: "*_calc.js modules are pure: pass state/DOM values in as arguments.",
  },
  {
    name: "translations",
    match: (f) => f.startsWith("src/translations/"),
    allow: () => false,
    hint: "Translation files are plain data.",
  },
  {
    name: "background",
    match: (f) => f === "src/background.js",
    allow: (t) => t.startsWith("src/data/"),
    hint: "The service worker must not bundle content-script modules.",
  },
];

const IMPORT_RE = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const SELECTOR_RE = /\.(querySelector|querySelectorAll|closest|matches)\(\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
const OWN_MARKUP_RE = /scx|\$\{|\[data-/;

for (const abs of listFiles(SRC, [".js"])) {
  const file = rel(abs);
  const code = stripComments(read(abs));

  if (!file.startsWith("src/data/")) {
    for (const rule of FORBIDDEN_APIS) {
      for (const m of code.matchAll(rule.pattern)) reporter.report(file, lineOf(code, m.index), rule.message);
    }
  }

  const layer = LAYERS.find((l) => l.match(file));
  if (layer) {
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith(".")) continue; // npm packages are fine
      const target = rel(path.resolve(path.dirname(abs), spec));
      if (!layer.allow(target)) {
        reporter.report(
          file,
          lineOf(code, m.index),
          `${layer.name} layer may not import ${target}. ${layer.hint}`,
        );
      }
    }
  }

  if (!file.startsWith("src/page/")) {
    for (const m of code.matchAll(SELECTOR_RE)) {
      if (OWN_MARKUP_RE.test(m[3])) continue;
      reporter.report(
        file,
        lineOf(code, m.index),
        `Game DOM selector "${m[3]}" outside src/page/. Move DOM reading into a src/page/*_page.js adapter.`,
      );
    }
  }
}

reporter.finish("module layering, data-platform boundary and page-adapter boundary hold");
