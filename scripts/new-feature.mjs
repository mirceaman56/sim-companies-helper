// Scaffolds a sidebar feature that passes `npm run verify`: UI module, page adapter, CSS,
// tests + fixtures, i18n key in every locale, FEATURES entry.
//   npm run new:feature -- <kebab-name> [--icon=🧩] [--dry-run]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.SCX_ROOT || process.cwd();
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const icon = (args.find((a) => a.startsWith("--icon=")) || "--icon=🧩").slice("--icon=".length);

if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error(
    "Usage: npm run new:feature -- <kebab-name> [--icon=🧩] [--dry-run]   e.g. new:feature -- bond-tracker",
  );
  process.exit(1);
}

const kebab = name;
const snake = kebab.replace(/-/g, "_");
const pascal = kebab.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const camel = pascal[0].toLowerCase() + pascal.slice(1);
const sectionId = `${kebab}-section`;
const titleKey = `${camel}Title`;
const title = kebab.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const files = {
  [`src/${snake}_ui.js`]: `// ${title} sidebar panel.
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { getSectionContent } from "./sidebar.js";
import { read${pascal}Page } from "./page/${snake}_page.js";

const SECTION_ID = "${sectionId}";

export function update${pascal}Panel() {
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  const pageData = read${pascal}Page(document);
  content.innerHTML = \`
    <div class="scx-panel scx-${kebab}">
      <div class="scx-panel-title">\${t("${titleKey}")}</div>
      <div class="scx-${kebab}-body">\${escapeHtml(pageData?.text ?? "")}</div>
    </div>
  \`;
}
`,
  [`src/page/${snake}_page.js`]: `// ${title} page adapter: structural selectors only, never UI text.

/**
 * @param {ParentNode} root
 * @returns {{ text: string } | null}
 */
export function read${pascal}Page(root = document) {
  const heading = root?.querySelector?.("h1");
  return heading ? { text: (heading.textContent || "").trim() } : null;
}
`,
  [`src/styles/features/${kebab}.css`]: `.scx-${kebab} {
  gap: var(--scx-spacing-sm);
}

.scx-${kebab}-body {
  color: var(--scx-text-secondary);
  font-size: var(--scx-font-size-sm);
}
`,
  [`tests/${snake}_ui.test.js`]: `// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const content = document.createElement("div");
vi.mock("../src/sidebar.js", () => ({ getSectionContent: () => content }));
vi.mock("../src/i18n.js", () => ({ t: (key) => key }));

import { update${pascal}Panel } from "../src/${snake}_ui.js";

describe("${snake}_ui", () => {
  it("renders the panel title", () => {
    update${pascal}Panel();
    expect(content.querySelector(".scx-panel-title")?.textContent).toBe("${titleKey}");
  });
});
`,
  [`tests/${snake}_page.test.js`]: `// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { read${pascal}Page } from "../src/page/${snake}_page.js";

const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", "${snake}", file), "utf8");

describe("${snake}_page", () => {
  it("reads the page from a captured fixture", () => {
    document.body.innerHTML = fixture("page.html");
    expect(read${pascal}Page(document)).toEqual({ text: "Example" });
  });

  it("returns null when the structure is missing", () => {
    document.body.innerHTML = fixture("fallback-page.html");
    expect(read${pascal}Page(document)).toBeNull();
  });
});
`,
  [`tests/fixtures/${snake}/page.html`]: `<!-- Replace with outerHTML captured from the real game page (anonymized). -->
<main><h1>Example</h1></main>
`,
  [`tests/fixtures/${snake}/fallback-page.html`]: `<!-- A page shape the adapter must reject (other page, partial render). -->
<main><div>Loading</div></main>
`,
};

const abs = (rel) => path.join(ROOT, rel);
for (const rel of Object.keys(files)) {
  if (fs.existsSync(abs(rel))) {
    console.error(`[new-feature] ${rel} already exists. Pick another name.`);
    process.exit(1);
  }
}

const edits = [];

// content.css import
const cssEntry = fs.readFileSync(abs("src/content.css"), "utf8");
edits.push(["src/content.css", `${cssEntry.trimEnd()}\n@import "./styles/features/${kebab}.css";\n`]);

// translations: append before the closing brace of every locale
for (const file of fs.readdirSync(abs("src/translations")).filter((f) => f.endsWith(".js"))) {
  const rel = `src/translations/${file}`;
  const text = fs.readFileSync(abs(rel), "utf8");
  const end = text.lastIndexOf("};");
  edits.push([rel, `${text.slice(0, end)}  ${titleKey}: ${JSON.stringify(title)},\n${text.slice(end)}`]);
}

// registry: import + FEATURES entry before the first init-only feature
const registryRel = "src/content_registry.js";
let registry = fs.readFileSync(abs(registryRel), "utf8");
const importLine = `import { update${pascal}Panel } from "./${snake}_ui.js";\n`;
const lastImport = registry.lastIndexOf("\nimport ");
const lastImportEnd = registry.indexOf("\n", registry.indexOf(";", lastImport)) + 1;
registry = registry.slice(0, lastImportEnd) + importLine + registry.slice(lastImportEnd);
const anchor = registry.indexOf('  { id: "contract"');
if (anchor === -1) {
  console.error(
    `[new-feature] could not find the insertion point in ${registryRel}; add the FEATURES entry by hand.`,
  );
  process.exit(1);
}
const entry = `  {
    id: "${kebab}",
    section: { id: "${sectionId}", titleKey: "${titleKey}", icon: ${JSON.stringify(icon)}, update: update${pascal}Panel },
  },
`;
registry = registry.slice(0, anchor) + entry + registry.slice(anchor);
edits.push([registryRel, registry]);

for (const [rel, text] of Object.entries(files)) {
  console.log(`${dryRun ? "[dry-run] would create" : "create"} ${rel}`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), text);
  }
}
for (const [rel, text] of edits) {
  console.log(`${dryRun ? "[dry-run] would update" : "update"} ${rel}`);
  if (!dryRun) fs.writeFileSync(abs(rel), text);
}
if (!dryRun) {
  const touched = [...Object.keys(files), ...edits.map(([rel]) => rel)].filter(
    (rel) => !rel.endsWith(".html"),
  );
  spawnSync("npx", ["prettier", "--write", ...touched], { cwd: ROOT, stdio: "ignore" });
}
console.log(
  `\nNext: translate "${titleKey}" in non-English locales, replace the fixture with a real capture,`,
);
console.log("adapt read…Page to the real page structure, then run: npm run verify");
